import { useState, useMemo } from 'react';
import { Download, FileText } from 'lucide-react';
import { useStore } from '../store';
import { DataExporter } from '../lib/dataExporter';
import { exportStockReport, printAllLocationsStockReport } from '../lib/bulkOperations';
import StockLedgerModal from '../components/StockLedgerModal';

export default function StockReports() {
  const { inventory, locations, items, transactions, sales, returns, brands } = useStore();
  const [selectedLocation, setSelectedLocation] = useState<string>('all');
  const [selectedBrand, setSelectedBrand] = useState<string>('all');
  const today = new Date().toISOString().split('T')[0];
  const [dateFrom, setDateFrom] = useState(today);
  const [dateTo, setDateTo] = useState(today);
  const [searchQuery, setSearchQuery] = useState('');
  const [exporting, setExporting] = useState(false);
  const [showEmptyStock, setShowEmptyStock] = useState(false);
  const [selectedItemIds, setSelectedItemIds] = useState<Set<string>>(new Set());
  const [activeMetric, setActiveMetric] = useState<'all' | 'opening' | 'received' | 'supplied' | 'returned' | 'closing'>('all');
  const [ledgerState, setLedgerState] = useState<{ itemId: string, locationId: string, mode: 'supplied' | 'received' } | null>(null);

  // Dynamically pull ALL warehouses and ALL shops — so any future additions appear automatically
  const warehouses = locations.filter(l => l.type === 'warehouse');
  const shops = locations.filter(l => l.type === 'shop');

  const selectedName = selectedLocation === 'all'
    ? 'All Locations'
    : locations.find(l => l.id === selectedLocation)?.name || 'Location';

  // ── PRE-COMPUTED AGGREGATIONS FOR O(1) LOOKUP (Major performance boost) ──
  const isOnDate = (timestamp: string) => {
    const d = new Date(timestamp).toISOString().split('T')[0];
    return d >= dateFrom && d <= dateTo;
  };

  const isAfterDate = (timestamp: string) => {
    const d = new Date(timestamp).toISOString().split('T')[0];
    return d > dateTo;
  };

  const stockData = useMemo(() => {
    const data = new Map();
    const containers = useStore.getState().containers;

    const getMap = (locId: string, itemId: string) => {
      const key = `${locId}_${itemId}`;
      if (!data.has(key)) data.set(key, { 
        received: 0, supplied: 0, returned: 0, 
        receivedAfter: 0, suppliedAfter: 0, returnedAfter: 0,
        currentQty: 0 
      });
      return data.get(key);
    };

    // Current Qty
    inventory.forEach(e => {
       getMap(e.location_id, e.item_id).currentQty += (e.quantity || 0);
    });

    // Received / Supplied from Transctions
    transactions.forEach(t => {
      // Ignore pending transactions (e.g. from un-reconciled imports)
      if (t.container_id) {
        const container = containers.find(c => c.id === t.container_id);
        if (container?.status === 'Pending') return;
      }

      if (isOnDate(t.timestamp) && (t.type === 'stock_entry' || t.type === 'transfer')) {
        getMap(t.to_location || t.location_id, t.item_id).received += (t.quantity || 0);
      }
      if (isAfterDate(t.timestamp) && (t.type === 'stock_entry' || t.type === 'transfer')) {
        getMap(t.to_location || t.location_id, t.item_id).receivedAfter += (t.quantity || 0);
      }
      
      if (isOnDate(t.timestamp) && t.type === 'transfer') {
        getMap(t.from_location, t.item_id).supplied += (t.quantity || 0);
      }
      if (isAfterDate(t.timestamp) && t.type === 'transfer') {
        getMap(t.from_location, t.item_id).suppliedAfter += (t.quantity || 0);
      }
    });

    // Sales (supplied)
    sales.forEach(s => {
      if (isOnDate(s.timestamp)) {
        getMap(s.location_id, s.item_id).supplied += (s.quantity || 0);
      }
      if (isAfterDate(s.timestamp)) {
        getMap(s.location_id, s.item_id).suppliedAfter += (s.quantity || 0);
      }
    });

    // Returns
    returns.forEach(r => {
      if (isOnDate(r.timestamp) && r.status === 'Restocked') {
         getMap(r.location_id, r.item_id).returned += (r.quantity || 0);
      }
      if (isAfterDate(r.timestamp) && r.status === 'Restocked') {
         getMap(r.location_id, r.item_id).returnedAfter += (r.quantity || 0);
      }
    });

    return data;
  }, [inventory, transactions, sales, returns, dateFrom, dateTo]);

  const getItemStockRow = (item: typeof items[0], locationId: string) => {
    const invEntry = inventory.find(e => e.location_id === locationId && e.item_id === item.id);
    const isToday = dateTo === today && dateFrom === today;
    
    // Aggregated metrics from transactions/sales for the TARGET date
    const metrics = stockData.get(`${locationId}_${item.id}`) || { 
      received: 0, supplied: 0, returned: 0, 
      receivedAfter: 0, suppliedAfter: 0, returnedAfter: 0,
      currentQty: 0 
    };
    
    let { received, supplied, returned, receivedAfter, suppliedAfter, returnedAfter, currentQty } = metrics;
    
    // Undo transactions after the target date to get the closing balance on the target date
    // If I received stock AFTER target date, my currentQty is higher than closing, so subtract it.
    // If I supplied stock AFTER target date, my currentQty is lower than closing, so add it.
    // If I returned stock AFTER target date, my currentQty is higher than closing, so subtract it.
    let closing = currentQty - receivedAfter + suppliedAfter - returnedAfter;
    if (closing < 0) closing = 0;

    // Opening balance on target date = closing balance on target date MINUS transactions on target date
    let opening = closing - received + supplied - returned;
    
    if (opening < 0) {
      // User requested to hide negative balances (which happen if they record backdated sales).
      // To ensure the ledger math still works (Opening + Received - Supplied = Closing)
      // we add the negative debt to 'supplied' (it was "supplied" to pay off the deficit).
      supplied += Math.abs(opening);
      opening = 0;
    }

    return { received, supplied, returned, opening, closing };
  };

  // Build the preview rows
  const sortedItems = [...items]
    .filter(item => selectedBrand === 'all' || item.brand_id === selectedBrand)
    .filter(item => {
      if (!searchQuery) return true;
      const q = searchQuery.toLowerCase();
      return (item.name?.toLowerCase().includes(q) || item.sku?.toLowerCase().includes(q));
    })
    .sort((a, b) => (a.name || '').localeCompare(b.name || ''));

  const basePreviewRows = (() => {
    const rows: Array<{
      slNo: number;
      itemId: string;
      itemName: string;
      sku: string;
      locationName: string;
      brandName: string;
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
          if (!showEmptyStock && row.opening === 0 && row.closing === 0 && row.received === 0 && row.supplied === 0 && row.returned === 0) return;
          rows.push({ slNo: slNo++, itemId: item.id, itemName: item.name || '-', sku: item.sku || '-', locationName: loc.name, brandName: brands.find(b => b.id === item.brand_id)?.name || '-', ...row });
        });
      });
    } else {
      sortedItems.forEach(item => {
        const row = getItemStockRow(item, selectedLocation);
        if (!showEmptyStock && row.opening === 0 && row.closing === 0 && row.received === 0 && row.supplied === 0 && row.returned === 0) return;
        rows.push({ slNo: slNo++, itemId: item.id, itemName: item.name || '-', sku: item.sku || '-', locationName: selectedName, brandName: brands.find(b => b.id === item.brand_id)?.name || '-', ...row });
      });
    }
    return rows;
  })();

  const displayedRows = basePreviewRows.filter(row => {
    if (activeMetric === 'all') return true;
    if (activeMetric === 'opening') return row.opening > 0;
    if (activeMetric === 'received') return row.received > 0;
    if (activeMetric === 'supplied') return row.supplied > 0;
    if (activeMetric === 'returned') return row.returned > 0;
    if (activeMetric === 'closing') return row.closing > 0;
    return true;
  });

  const handleSelectAll = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.checked) {
      setSelectedItemIds(new Set(displayedRows.map(r => r.itemId)));
    } else {
      setSelectedItemIds(new Set());
    }
  };

  const toggleItemSelection = (id: string) => {
    const next = new Set(selectedItemIds);
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
    }
    setSelectedItemIds(next);
  };

  const itemsMap = useMemo(() => new Map(items.map(i => [i.id, i])), [items]);

  // Summary stats
  const totalItems = useMemo(() => {
    return selectedLocation === 'all'
      ? new Set(inventory.filter(i => selectedBrand === 'all' || itemsMap.get(i.item_id)?.brand_id === selectedBrand).map(i => i.item_id)).size
      : new Set(inventory.filter(i => i.location_id === selectedLocation && (selectedBrand === 'all' || itemsMap.get(i.item_id)?.brand_id === selectedBrand)).map(i => i.item_id)).size;
  }, [inventory, selectedLocation, selectedBrand, itemsMap]);
  
  const totalOpening = basePreviewRows.reduce((s, r) => s + r.opening, 0);
  const totalReceived = basePreviewRows.reduce((s, r) => s + r.received, 0);
  const totalSupplied = basePreviewRows.reduce((s, r) => s + r.supplied, 0);
  const totalClosingQty = basePreviewRows.reduce((s, r) => s + r.closing, 0);
  const inventoryValue = inventory
    .filter(inv => selectedLocation === 'all' || inv.location_id === selectedLocation)
    .filter(inv => selectedBrand === 'all' || itemsMap.get(inv.item_id)?.brand_id === selectedBrand)
    .reduce((sum, inv) => {
      const item = itemsMap.get(inv.item_id);
      const unitCost = inv.avg_cost_USD || item?.avg_cost_USD || 0;
      return sum + (Math.round(inv.quantity || 0) * unitCost);
    }, 0);

  const handleExcelExport = async () => {
    try {
      setExporting(true);
      const dtTo = dateTo || today;
      const dtFrom = dateFrom || today;

      // If items are manually checked → use those.
      // If a metric filter is active → use only items visible in the filtered view.
      // Otherwise → use all sorted (brand/search filtered) items.
      let filteredItems: typeof items;
      if (selectedItemIds.size > 0) {
        filteredItems = sortedItems.filter(i => selectedItemIds.has(i.id));
      } else if (activeMetric !== 'all') {
        const visibleIds = new Set(displayedRows.map(r => r.itemId));
        filteredItems = sortedItems.filter(i => visibleIds.has(i.id));
      } else {
        filteredItems = sortedItems;
      }

      await exportStockReport({
        locationId: selectedLocation, 
        dateTo: dtTo,
        dateFrom: dtFrom,
        inventory, items: filteredItems, locations, transactions, sales, returns, brands,
        format: 'excel',
        containers: useStore.getState().containers,
        // If user explicitly selected items, always print them even if zeros
        showEmptyStock: selectedItemIds.size > 0 ? true : showEmptyStock
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
      const dtTo = dateTo || today;
      const dtFrom = dateFrom || today;

      // Same filter logic as Excel
      let filteredItems: typeof items;
      if (selectedItemIds.size > 0) {
        filteredItems = sortedItems.filter(i => selectedItemIds.has(i.id));
      } else if (activeMetric !== 'all') {
        const visibleIds = new Set(displayedRows.map(r => r.itemId));
        filteredItems = sortedItems.filter(i => visibleIds.has(i.id));
      } else {
        filteredItems = sortedItems;
      }

      if (selectedLocation === 'all') {
        // Print all locations stock report
        await printAllLocationsStockReport({
          dateTo: dtTo, dateFrom: dtFrom, sales, locations, items: filteredItems, brands, inventory, transactions, returns,
          // If user explicitly selected items, always print them even if zeros
          showEmptyStock: selectedItemIds.size > 0 ? true : showEmptyStock
        });
      } else {
        await exportStockReport({
          locationId: selectedLocation,
          dateTo: dtTo,
          dateFrom: dtFrom,
          inventory, items: filteredItems, locations, transactions, sales, returns, brands,
          format: 'pdf',
          containers: useStore.getState().containers,
          // If user explicitly selected items, always print them even if zeros
          showEmptyStock: selectedItemIds.size > 0 ? true : showEmptyStock
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
            {exporting ? 'Generating…' : selectedItemIds.size > 0 ? `Excel (${selectedItemIds.size} Selected)` : `Excel: ${selectedName}`}
          </button>
          <button
            onClick={handlePdfExport}
            disabled={exporting}
            className="flex-1 sm:flex-initial flex items-center justify-center gap-2 px-6 py-3 bg-white border-2 border-black text-black rounded-xl font-bold transition-all hover:bg-gray-50 active:scale-95 shadow-lg disabled:opacity-50"
          >
            <FileText className="w-5 h-5" />
            {exporting ? 'Generating…' : selectedItemIds.size > 0 ? `PDF (${selectedItemIds.size} Selected)` : `PDF: ${selectedName}`}
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

          <div className="flex-1">
            <label className="block text-xs font-bold text-gray-600 mb-2">Search Items</label>
            <input
              type="text"
              placeholder="Search name or SKU..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full px-4 py-2.5 border border-gray-200 rounded-lg text-sm font-medium focus:outline-none focus:border-primary bg-white"
            />
          </div>

          <div className="flex gap-2">
            <div>
              <label className="block text-xs font-bold text-gray-600 mb-2">From Date</label>
              <input
                type="date"
                value={dateFrom}
                max={dateTo}
                onChange={(e) => setDateFrom(e.target.value)}
                className="w-full px-4 py-2.5 border border-gray-200 rounded-lg text-sm font-medium focus:outline-none focus:border-primary cursor-pointer"
                onClick={(e) => { try { e.currentTarget.showPicker(); } catch (err) {} }}
                onKeyDown={(e) => e.preventDefault()}
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-gray-600 mb-2">To Date</label>
              <input
                type="date"
                value={dateTo}
                min={dateFrom}
                max={today}
                onChange={(e) => setDateTo(e.target.value)}
                className="w-full px-4 py-2.5 border border-gray-200 rounded-lg text-sm font-medium focus:outline-none focus:border-primary cursor-pointer"
                onClick={(e) => { try { e.currentTarget.showPicker(); } catch (err) {} }}
                onKeyDown={(e) => e.preventDefault()}
              />
            </div>
          </div>
          
          <div className="flex items-center gap-2 pb-2.5">
            <input
              type="checkbox"
              id="showEmptyStock"
              checked={showEmptyStock}
              onChange={(e) => setShowEmptyStock(e.target.checked)}
              className="w-4 h-4 text-primary border-gray-300 rounded focus:ring-primary"
            />
            <label htmlFor="showEmptyStock" className="text-xs font-bold text-gray-700 cursor-pointer">
              Print Empty Stocks
            </label>
          </div>

          <button
            onClick={() => { setDateFrom(today); setDateTo(today); setSelectedLocation('all'); setSelectedBrand('all'); setSearchQuery(''); setShowEmptyStock(false); setSelectedItemIds(new Set()); }}
            className="px-4 py-2.5 text-sm font-bold text-gray-900 border border-gray-200 rounded-lg hover:bg-gray-50 transition"
          >
            Reset Filters
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        <button 
          onClick={() => setActiveMetric(activeMetric === 'opening' ? 'all' : 'opening')}
          className={`text-left bg-gray-50 border rounded-xl p-4 transition-all ${activeMetric === 'opening' ? 'border-gray-500 ring-2 ring-gray-200 shadow-md' : 'border-gray-100 hover:border-gray-300'}`}
        >
          <p className="text-[10px] font-bold text-gray-500 uppercase mb-1">Opening Balance</p>
          <p className="text-xl font-black text-gray-900">{totalOpening.toLocaleString('en-IN')}</p>
        </button>
        <button 
          onClick={() => setActiveMetric(activeMetric === 'received' ? 'all' : 'received')}
          className={`text-left bg-blue-50 border rounded-xl p-4 transition-all ${activeMetric === 'received' ? 'border-blue-500 ring-2 ring-blue-200 shadow-md' : 'border-blue-100 hover:border-blue-300'}`}
        >
          <p className="text-[10px] font-bold text-blue-600 uppercase mb-1">Stock Received (+)</p>
          <p className="text-xl font-black text-blue-900">{totalReceived.toLocaleString('en-IN')}</p>
        </button>
        <button 
          onClick={() => setActiveMetric(activeMetric === 'supplied' ? 'all' : 'supplied')}
          className={`text-left bg-red-50 border rounded-xl p-4 transition-all ${activeMetric === 'supplied' ? 'border-red-500 ring-2 ring-red-200 shadow-md' : 'border-red-100 hover:border-red-300'}`}
        >
          <p className="text-[10px] font-bold text-red-600 uppercase mb-1">Stock Supplied (-)</p>
          <p className="text-xl font-black text-red-900">{totalSupplied.toLocaleString('en-IN')}</p>
        </button>
        <button 
          onClick={() => setActiveMetric(activeMetric === 'closing' ? 'all' : 'closing')}
          className={`text-left bg-emerald-50 border rounded-xl p-4 transition-all ${activeMetric === 'closing' ? 'border-emerald-500 ring-2 ring-emerald-200 shadow-md' : 'border-emerald-100 hover:border-emerald-300'}`}
        >
          <p className="text-[10px] font-bold text-emerald-600 uppercase mb-1">Closing Balance (=)</p>
          <p className="text-xl font-black text-emerald-900">{totalClosingQty.toLocaleString('en-IN')}</p>
        </button>
        <button 
          onClick={() => setActiveMetric(activeMetric === 'closing' ? 'all' : 'closing')}
          className={`text-left bg-purple-50 border rounded-xl p-4 col-span-2 lg:col-span-1 transition-all ${activeMetric === 'closing' ? 'border-purple-500 ring-2 ring-purple-200 shadow-md' : 'border-purple-100 hover:border-purple-300'}`}
        >
          <p className="text-[10px] font-bold text-purple-600 uppercase mb-1">Total Stock Value</p>
          <p className="text-xl font-black text-purple-900">${inventoryValue.toLocaleString('en-IN')}</p>
        </button>
      </div>

      {/* Preview Table — mirrors Excel/PDF exactly */}
      <div className="bg-white rounded-xl border border-gray-100 overflow-hidden shadow-sm">
        <div className="px-4 py-3 border-b border-gray-100 bg-gray-50 flex justify-between items-center">
          <span className="text-xs font-bold text-gray-600 uppercase tracking-wide">
            Live Preview — {selectedName} · {dateFrom === dateTo ? new Date(dateTo + 'T00:00:00').toLocaleDateString('en-IN') : `${new Date(dateFrom + 'T00:00:00').toLocaleDateString('en-IN')} to ${new Date(dateTo + 'T00:00:00').toLocaleDateString('en-IN')}`}
          </span>
          <span className="text-xs text-gray-400">{displayedRows.length} items</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[800px]">
            <thead className="bg-gray-50 border-b border-gray-100">
              <tr>
                <th className="px-3 py-3 w-10 text-center">
                  <input 
                    type="checkbox" 
                    checked={displayedRows.length > 0 && selectedItemIds.size === displayedRows.length}
                    onChange={handleSelectAll}
                    className="w-4 h-4 text-primary rounded border-gray-300 focus:ring-primary cursor-pointer"
                  />
                </th>
                <th className="px-3 py-3 text-center font-bold text-gray-600 w-12">SL NO.</th>
                <th className="px-4 py-3 text-left font-bold text-gray-600">ITEM DESCRIPTION</th>
                <th className="px-3 py-3 text-center font-bold text-gray-600">CODE #</th>
                {selectedLocation === 'all' && (
                  <th className="px-3 py-3 text-left font-bold text-gray-600">LOCATION</th>
                )}
                {selectedBrand === 'all' && (
                  <th className="px-3 py-3 text-left font-bold text-orange-500">BRAND</th>
                )}
                <th className="px-3 py-3 text-center font-bold text-gray-600">OPENING</th>
                <th className="px-3 py-3 text-center font-bold text-blue-600">RECEIVED</th>
                <th className="px-3 py-3 text-center font-bold text-red-600">SUPPLIED</th>
                <th className="px-3 py-3 text-center font-bold text-purple-600">RETURNED</th>
                <th className="px-3 py-3 text-center font-bold text-emerald-700 bg-emerald-50">CLOSING BALANCE</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {displayedRows.map((row, idx) => (
                <tr key={idx} className={`hover:bg-gray-50 transition-colors ${selectedItemIds.has(row.itemId) ? 'bg-blue-50/50' : ''}`}>
                  <td className="px-3 py-2.5 text-center">
                    <input 
                      type="checkbox" 
                      checked={selectedItemIds.has(row.itemId)}
                      onChange={() => toggleItemSelection(row.itemId)}
                      className="w-4 h-4 text-primary rounded border-gray-300 focus:ring-primary cursor-pointer"
                    />
                  </td>
                  <td className="px-3 py-2.5 text-center text-gray-500 text-xs">{row.slNo}</td>
                  <td className="px-4 py-2.5 font-medium text-gray-900">{row.itemName.toUpperCase()}</td>
                  <td className="px-3 py-2.5 text-center text-gray-500 text-xs font-mono">{row.sku}</td>
                  {selectedLocation === 'all' && (
                    <td className="px-3 py-2.5 text-gray-500 text-xs">{row.locationName}</td>
                  )}
                  {selectedBrand === 'all' && (
                    <td className="px-3 py-2.5 text-xs font-bold text-orange-500">{row.brandName}</td>
                  )}
                  <td className="px-3 py-2.5 text-center text-gray-700 font-medium">{row.opening}</td>
                  <td className="px-3 py-2.5 text-center text-blue-700 font-medium">
                    {row.received > 0 ? (
                      <button onClick={() => setLedgerState({ itemId: row.itemId, locationId: selectedLocation === 'all' ? (locations.find(l => l.name === row.locationName)?.id || '') : selectedLocation, mode: 'received' })} className="hover:underline cursor-pointer">{row.received}</button>
                    ) : row.received}
                  </td>
                  <td className="px-3 py-2.5 text-center text-red-600 font-medium">
                    {row.supplied > 0 ? (
                      <button onClick={() => setLedgerState({ itemId: row.itemId, locationId: selectedLocation === 'all' ? (locations.find(l => l.name === row.locationName)?.id || '') : selectedLocation, mode: 'supplied' })} className="hover:underline cursor-pointer">{row.supplied}</button>
                    ) : row.supplied}
                  </td>
                  <td className="px-3 py-2.5 text-center text-purple-600 font-medium">{row.returned}</td>
                  <td className="px-3 py-2.5 text-center font-black text-emerald-800 bg-emerald-50">{row.closing}</td>
                </tr>
              ))}
              {displayedRows.length > 0 && (() => {
                const tot = displayedRows.reduce(
                  (acc, r) => ({
                    opening: acc.opening + r.opening,
                    received: acc.received + r.received,
                    supplied: acc.supplied + r.supplied,
                    returned: acc.returned + r.returned,
                    closing: acc.closing + r.closing,
                  }),
                  { opening: 0, received: 0, supplied: 0, returned: 0, closing: 0 }
                );
                return (
                  <tr className="bg-gray-100 border-t-2 border-gray-400 font-black text-sm">
                    <td className="px-3 py-2.5" />
                    <td className="px-3 py-2.5" />
                    <td className="px-4 py-2.5 text-gray-800 font-black">TOTAL QTY</td>
                    <td className="px-3 py-2.5" />
                    {selectedLocation === 'all' && <td className="px-3 py-2.5" />}
                    {selectedBrand === 'all' && <td className="px-3 py-2.5" />}
                    <td className="px-3 py-2.5 text-center text-gray-800">{tot.opening}</td>
                    <td className="px-3 py-2.5 text-center text-blue-700">{tot.received}</td>
                    <td className="px-3 py-2.5 text-center text-red-600">{tot.supplied}</td>
                    <td className="px-3 py-2.5 text-center text-purple-600">{tot.returned}</td>
                    <td className="px-3 py-2.5 text-center text-emerald-800 bg-emerald-100">{tot.closing}</td>
                  </tr>
                );
              })()}
            </tbody>
          </table>
        </div>
        {displayedRows.length === 0 && (
          <div className="p-8 text-center text-gray-400">
            <p className="text-sm font-medium">No stock data found for the selected filters</p>
          </div>
        )}
      </div>

      <StockLedgerModal
        isOpen={!!ledgerState}
        onClose={() => setLedgerState(null)}
        itemId={ledgerState?.itemId || null}
        locationId={ledgerState?.locationId || null}
        dateFrom={dateFrom}
        dateTo={dateTo}
        mode={ledgerState?.mode || null}
      />
    </div>
  );
}
