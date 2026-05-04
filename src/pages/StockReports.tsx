import { useState, useMemo } from 'react';
import { Download, FileText } from 'lucide-react';
import { useStore } from '../store';
import { DataExporter } from '../lib/dataExporter';
import { exportStockReport, printAllLocationsStockReport } from '../lib/bulkOperations';

export default function StockReports() {
  const { inventory, locations, items, transactions, sales, returns, brands } = useStore();
  const [selectedLocation, setSelectedLocation] = useState<string>('all');
  const [selectedBrand, setSelectedBrand] = useState<string>('all');
  const today = new Date().toISOString().split('T')[0];
  const [targetDate, setTargetDate] = useState(today);
  const [exporting, setExporting] = useState(false);

  // Dynamically pull ALL warehouses and ALL shops — so any future additions appear automatically
  const warehouses = locations.filter(l => l.type === 'warehouse');
  const shops = locations.filter(l => l.type === 'shop');

  const selectedName = selectedLocation === 'all'
    ? 'All Locations'
    : locations.find(l => l.id === selectedLocation)?.name || 'Location';

  // ── PRE-COMPUTED AGGREGATIONS FOR O(1) LOOKUP (Major performance boost) ──
  const isOnDate = (timestamp: string) => {
    return new Date(timestamp).toISOString().split('T')[0] === targetDate;
  };

  const stockData = useMemo(() => {
    const data = new Map();
    const getMap = (locId: string, itemId: string) => {
      const key = `${locId}_${itemId}`;
      if (!data.has(key)) data.set(key, { received: 0, supplied: 0, returned: 0, currentQty: 0 });
      return data.get(key);
    };

    // Current Qty
    inventory.forEach(e => {
       getMap(e.location_id, e.item_id).currentQty += (e.quantity || 0);
    });

    // Received / Supplied from Transctions
    transactions.forEach(t => {
      if (isOnDate(t.timestamp) && (t.type === 'stock_entry' || t.type === 'transfer')) {
        getMap(t.to_location, t.item_id).received += (t.quantity || 0);
      }
      if (isOnDate(t.timestamp) && t.type === 'transfer') {
        getMap(t.from_location, t.item_id).supplied += (t.quantity || 0);
      }
    });

    // Sales (supplied)
    sales.forEach(s => {
      if (isOnDate(s.timestamp)) {
        getMap(s.location_id, s.item_id).supplied += (s.quantity || 0);
      }
    });

    // Returns
    returns.forEach(r => {
      if (isOnDate(r.timestamp) && r.status === 'Restocked') {
         getMap(r.location_id, r.item_id).returned += (r.quantity || 0);
      }
    });

    return data;
  }, [inventory, transactions, sales, returns, targetDate]);

  const getItemStockRow = (item: typeof items[0], locationId: string) => {
    const invEntry = inventory.find(e => e.location_id === locationId && e.item_id === item.id);
    const isToday = targetDate === today;
    
    // Aggregated metrics from transactions/sales for the TARGET date
    const metrics = stockData.get(`${locationId}_${item.id}`) || { received: 0, supplied: 0, returned: 0, currentQty: 0 };
    const { received: txReceived, supplied: txSupplied, returned: txReturned, currentQty: snapshotQty } = metrics;
    
    let opening = 0;
    let received = 0;
    let supplied = 0;
    let returned = 0;
    let closing = 0;

    if (isToday) {
      if (invEntry) {
        // The user specifically requested state-machine logic where each new import
        // shifts the current closing balance to opening, and sets received to the new delta.
        // This is perfectly tracked in the inventory document by batchStockEntry.
        opening = invEntry.opening_balance || 0;
        received = invEntry.received_balance || 0;
        supplied = invEntry.supplied_balance || 0;
        returned = invEntry.returned_balance || 0;
      } else {
        opening = snapshotQty; // Fallback
      }
    } else {
      // Historical: Calculate backwards from current state
      opening = snapshotQty - txReceived + txSupplied - txReturned;
      if (opening < 0) opening = 0;
      received = txReceived;
      supplied = txSupplied;
      returned = txReturned;
    }

    closing = opening + received - supplied + returned;

    return { received, supplied, returned, opening, closing };
  };

  // Build the preview rows
  const sortedItems = [...items]
    .filter(item => selectedBrand === 'all' || item.brand_id === selectedBrand)
    .sort((a, b) => (a.name || '').localeCompare(b.name || ''));

  const previewRows = (() => {
    const rows: Array<{
      slNo: number;
      itemName: string;
      sku: string;
      locationName: string;
      opening: number;
      received: number;
      supplied: number;
      returned: number;
      closing: number;
    }> = [];

    let slNo = 1;
    if (selectedLocation === 'all') {
      locations.forEach(loc => {
        sortedItems.forEach(item => {
          const row = getItemStockRow(item, loc.id);
          rows.push({ slNo: slNo++, itemName: item.name || '-', sku: item.sku || '-', locationName: loc.name, ...row });
        });
      });
    } else {
      sortedItems.forEach(item => {
        const row = getItemStockRow(item, selectedLocation);
        rows.push({ slNo: slNo++, itemName: item.name || '-', sku: item.sku || '-', locationName: selectedName, ...row });
      });
    }
    return rows;
  })();

  // Summary stats
  const totalItems = selectedLocation === 'all'
    ? new Set(inventory.filter(i => selectedBrand === 'all' || items.find(it => it.id === i.item_id)?.brand_id === selectedBrand).map(i => i.item_id)).size
    : new Set(inventory.filter(i => i.location_id === selectedLocation && (selectedBrand === 'all' || items.find(it => it.id === i.item_id)?.brand_id === selectedBrand)).map(i => i.item_id)).size;
  
  const totalOpening = previewRows.reduce((s, r) => s + r.opening, 0);
  const totalReceived = previewRows.reduce((s, r) => s + r.received, 0);
  const totalSupplied = previewRows.reduce((s, r) => s + r.supplied, 0);
  const totalClosingQty = previewRows.reduce((s, r) => s + r.closing, 0);

  const itemsMap = useMemo(() => new Map(items.map(i => [i.id, i])), [items]);
  const inventoryValue = inventory
    .filter(inv => selectedLocation === 'all' || inv.location_id === selectedLocation)
    .filter(inv => selectedBrand === 'all' || itemsMap.get(inv.item_id)?.brand_id === selectedBrand)
    .reduce((sum, inv) => {
      const item = itemsMap.get(inv.item_id);
      const unitCost = inv.avg_cost_INR || item?.avg_cost_INR || 0;
      return sum + (Math.round(inv.quantity || 0) * unitCost);
    }, 0);

  const handleExcelExport = async () => {
    try {
      setExporting(true);
      const dateTo = targetDate || today;
      const filteredItems = selectedBrand === 'all' ? items : items.filter(i => i.brand_id === selectedBrand);

      await exportStockReport({
        locationId: selectedLocation, 
        dateTo,
        inventory, items: filteredItems, locations, transactions, sales, returns, brands,
        format: 'excel'
      });
    } catch (err: any) {
      alert('Excel export failed: ' + err.message);
    } finally {
      setExporting(false);
    }
  };

  const handlePdfExport = async () => {
    try {
      setExporting(true);
      const date = targetDate || today;
      const filteredItems = selectedBrand === 'all' ? items : items.filter(i => i.brand_id === selectedBrand);

      if (selectedLocation === 'all') {
        // Print all locations stock report
        await printAllLocationsStockReport({
          date, sales, locations, items: filteredItems, brands, inventory, transactions, returns
        });
      } else {
        await exportStockReport({
          locationId: selectedLocation,
          dateTo: date,
          inventory, items: filteredItems, locations, transactions, sales, returns, brands,
          format: 'pdf'
        });
      }
    } catch (err: any) {
      alert('PDF generation failed: ' + err.message);
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-black text-gray-900 tracking-tight">Stock Reports</h1>
          <p className="text-sm text-gray-500 font-medium mt-1">Export inventory snapshots for any warehouse or shop</p>
        </div>
        <div className="flex gap-2 w-full sm:w-auto">
          <button
            onClick={handleExcelExport}
            disabled={exporting}
            className="flex-1 sm:flex-initial flex items-center justify-center gap-2 px-6 py-3 bg-primary text-white rounded-xl font-bold transition-all hover:bg-primary/90 shadow-lg shadow-primary/20 disabled:opacity-50"
          >
            <Download className="w-5 h-5" />
            {exporting ? 'Generating…' : `Excel: ${selectedName}`}
          </button>
          <button
            onClick={handlePdfExport}
            disabled={exporting}
            className="flex-1 sm:flex-initial flex items-center justify-center gap-2 px-6 py-3 bg-white border-2 border-black text-black rounded-xl font-bold transition-all hover:bg-gray-50 active:scale-95 shadow-lg disabled:opacity-50"
          >
            <FileText className="w-5 h-5" />
            {exporting ? 'Generating…' : `PDF: ${selectedName}`}
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-xl border border-gray-100 p-4 shadow-sm">
        <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-end">
          <div className="flex-1">
            <label className="block text-xs font-bold text-gray-600 mb-2">Location</label>
            <select
              value={selectedLocation}
              onChange={(e) => setSelectedLocation(e.target.value)}
              className="w-full px-4 py-2.5 border border-gray-200 rounded-lg text-sm font-medium focus:outline-none focus:border-primary bg-white"
            >
              <option value="all">All Locations</option>
              {/* All warehouses — dynamically updated as new ones are added */}
              {warehouses.map(wh => (
                <option key={wh.id} value={wh.id}>{wh.name} (Warehouse)</option>
              ))}
              {/* All shops — dynamically updated as new ones are added */}
              {shops.map(shop => (
                <option key={shop.id} value={shop.id}>{shop.name} (Shop)</option>
              ))}
            </select>
          </div>

          <div className="flex-1">
            <label className="block text-xs font-bold text-gray-600 mb-2">Filter Brand</label>
            <select
              value={selectedBrand}
              onChange={(e) => setSelectedBrand(e.target.value)}
              className="w-full px-4 py-2.5 border border-gray-200 rounded-lg text-sm font-medium focus:outline-none focus:border-primary bg-white"
            >
              <option value="all">All Brands</option>
              {brands.map(b => (
                <option key={b.id} value={b.id}>{b.name}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-bold text-gray-600 mb-2">Target Date (Snapshot)</label>
            <input
              type="date"
              value={targetDate}
              max={today}
              onChange={(e) => setTargetDate(e.target.value)}
              className="px-4 py-2.5 border border-gray-200 rounded-lg text-sm font-medium focus:outline-none focus:border-primary"
            />
          </div>

          <button
            onClick={() => { setTargetDate(today); setSelectedLocation('all'); setSelectedBrand('all'); }}
            className="px-4 py-2.5 text-sm font-bold text-gray-900 border border-gray-200 rounded-lg hover:bg-gray-50 transition"
          >
            Reset Filters
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        <div className="bg-gray-50 border border-gray-100 rounded-xl p-4">
          <p className="text-[10px] font-bold text-gray-500 uppercase mb-1">Opening Balance</p>
          <p className="text-xl font-black text-gray-900">{totalOpening.toLocaleString('en-IN')}</p>
        </div>
        <div className="bg-blue-50 border border-blue-100 rounded-xl p-4">
          <p className="text-[10px] font-bold text-blue-600 uppercase mb-1">Stock Received (+)</p>
          <p className="text-xl font-black text-blue-900">{totalReceived.toLocaleString('en-IN')}</p>
        </div>
        <div className="bg-red-50 border border-red-100 rounded-xl p-4">
          <p className="text-[10px] font-bold text-red-600 uppercase mb-1">Stock Supplied (-)</p>
          <p className="text-xl font-black text-red-900">{totalSupplied.toLocaleString('en-IN')}</p>
        </div>
        <div className="bg-emerald-50 border border-emerald-100 rounded-xl p-4">
          <p className="text-[10px] font-bold text-emerald-600 uppercase mb-1">Closing Balance (=)</p>
          <p className="text-xl font-black text-emerald-900">{totalClosingQty.toLocaleString('en-IN')}</p>
        </div>
        <div className="bg-purple-50 border border-purple-100 rounded-xl p-4 col-span-2 lg:col-span-1">
          <p className="text-[10px] font-bold text-purple-600 uppercase mb-1">Total Stock Value</p>
          <p className="text-xl font-black text-purple-900">₹{inventoryValue.toLocaleString('en-IN')}</p>
        </div>
      </div>

      {/* Preview Table — mirrors Excel/PDF exactly */}
      <div className="bg-white rounded-xl border border-gray-100 overflow-hidden shadow-sm">
        <div className="px-4 py-3 border-b border-gray-100 bg-gray-50 flex justify-between items-center">
          <span className="text-xs font-bold text-gray-600 uppercase tracking-wide">
            Live Preview — {selectedName} · {new Date(targetDate + 'T00:00:00').toLocaleDateString('en-IN')}
          </span>
          <span className="text-xs text-gray-400">{previewRows.length} items</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[800px]">
            <thead className="bg-gray-50 border-b border-gray-100">
              <tr>
                <th className="px-3 py-3 text-center font-bold text-gray-600 w-12">SL NO.</th>
                <th className="px-4 py-3 text-left font-bold text-gray-600">ITEM DESCRIPTION</th>
                <th className="px-3 py-3 text-center font-bold text-gray-600">CODE #</th>
                {selectedLocation === 'all' && (
                  <th className="px-3 py-3 text-left font-bold text-gray-600">LOCATION</th>
                )}
                <th className="px-3 py-3 text-center font-bold text-gray-600">OPENING</th>
                <th className="px-3 py-3 text-center font-bold text-blue-600">RECEIVED</th>
                <th className="px-3 py-3 text-center font-bold text-red-600">SUPPLIED</th>
                <th className="px-3 py-3 text-center font-bold text-purple-600">RETURNED</th>
                <th className="px-3 py-3 text-center font-bold text-emerald-700 bg-emerald-50">CLOSING BALANCE</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {previewRows.map((row, idx) => (
                <tr key={idx} className="hover:bg-gray-50 transition-colors">
                  <td className="px-3 py-2.5 text-center text-gray-500 text-xs">{row.slNo}</td>
                  <td className="px-4 py-2.5 font-medium text-gray-900">{row.itemName.toUpperCase()}</td>
                  <td className="px-3 py-2.5 text-center text-gray-500 text-xs font-mono">{row.sku}</td>
                  {selectedLocation === 'all' && (
                    <td className="px-3 py-2.5 text-gray-500 text-xs">{row.locationName}</td>
                  )}
                  <td className="px-3 py-2.5 text-center text-gray-700 font-medium">{row.opening}</td>
                  <td className="px-3 py-2.5 text-center text-blue-700 font-medium">{row.received}</td>
                  <td className="px-3 py-2.5 text-center text-red-600 font-medium">{row.supplied}</td>
                  <td className="px-3 py-2.5 text-center text-purple-600 font-medium">{row.returned}</td>
                  <td className="px-3 py-2.5 text-center font-black text-emerald-800 bg-emerald-50">{row.closing}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {previewRows.length === 0 && (
          <div className="p-8 text-center text-gray-400">
            <p className="text-sm font-medium">No stock data found for the selected filters</p>
          </div>
        )}
      </div>
    </div>
  );
}
