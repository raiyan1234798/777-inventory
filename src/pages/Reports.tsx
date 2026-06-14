import { useState } from 'react';
import { Download, FileText } from 'lucide-react';
import { useStore, formatCurrency } from '../store';
import { exportDailySalesReport777, printDailySalesReport777 } from '../lib/bulkOperations';

export default function Reports() {
  const { sales, locations, items, brands, inventory, transactions, returns } = useStore();
  const [selectedLocation, setSelectedLocation] = useState<string>('all');
  const [selectedBrand, setSelectedBrand] = useState<string>('all');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedSaleIds, setSelectedSaleIds] = useState<Set<string>>(new Set());

  const shops = locations.filter(l => l.type === 'shop');

  // Filter helper
  const filterByDateRange = (data: any[], dateField: string) => {
    return data.filter(item => {
      const itemDate = item[dateField] ? new Date(item[dateField]).getTime() : 0;
      const from = fromDate ? new Date(fromDate).getTime() : 0;
      const to = toDate ? new Date(toDate + 'T23:59:59').getTime() : Date.now();
      return itemDate >= from && itemDate <= to;
    });
  };

  const filterByLocation = (data: any[], locationField: string) => {
    if (selectedLocation === 'all') return data;
    return data.filter(item => item[locationField] === selectedLocation);
  };

  const filterByBrand = (data: any[]) => {
    if (selectedBrand === 'all') return data;
    return data.filter(item => {
      const it = items.find(i => i.id === item.item_id);
      return it?.brand_id === selectedBrand;
    });
  };

  const filterBySearch = (data: any[]) => {
    if (!searchQuery.trim()) return data;
    const query = searchQuery.toLowerCase();
    return data.filter(item => 
      item.item_name?.toLowerCase().includes(query)
    );
  };

  // Get filtered data
  const filteredSales = filterBySearch(filterByBrand(filterByLocation(filterByDateRange(sales, 'timestamp'), 'location_id')));

  const handleSelectAll = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.checked) {
      setSelectedSaleIds(new Set(filteredSales.map(s => s.id)));
    } else {
      setSelectedSaleIds(new Set());
    }
  };

  const toggleSaleSelection = (id: string) => {
    const next = new Set(selectedSaleIds);
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
    }
    setSelectedSaleIds(next);
  };

  const salesToExport = selectedSaleIds.size > 0 
    ? filteredSales.filter(s => selectedSaleIds.has(s.id))
    : filteredSales;

  // Calculate totals
  const salesTotal = filteredSales.reduce((sum, s) => sum + (s.converted_price_USD || 0), 0);
  const netProfitTotal = filteredSales.reduce((sum, s) => sum + (s.profit_USD || 0), 0);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-2">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
              <FileText className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h1 className="text-2xl font-black text-gray-900">Reports Archive (Sales)</h1>
              <p className="text-sm text-gray-400">Export and analyze your daily sales data</p>
            </div>
          </div>
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
              aria-label="Filter by Location"
              className="w-full px-4 py-2.5 border border-gray-200 rounded-lg text-sm font-medium focus:outline-none focus:border-primary bg-white"
            >
              <option value="all">All Shops</option>
              {shops.map(shop => (
                <option key={shop.id} value={shop.id}>{shop.name} (Shop)</option>
              ))}
            </select>
          </div>

          <div className="flex-1">
            <label className="block text-xs font-bold text-gray-600 mb-2">Brands</label>
            <select
              value={selectedBrand}
              onChange={(e) => setSelectedBrand(e.target.value)}
              aria-label="Filter by Brand"
              className="w-full px-4 py-2.5 border border-gray-200 rounded-lg text-sm font-medium focus:outline-none focus:border-primary bg-white"
            >
              <option value="all">All Brands</option>
              {brands.map(brand => (
                <option key={brand.id} value={brand.id}>{brand.name}</option>
              ))}
            </select>
          </div>

          <div className="flex-1">
            <label className="block text-xs font-bold text-gray-600 mb-2">Search Items</label>
            <input
              type="text"
              placeholder="Search by item name..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              aria-label="Search Items"
              className="w-full px-4 py-2.5 border border-gray-200 rounded-lg text-sm font-medium focus:outline-none focus:border-primary bg-white"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-gray-600 mb-2">From Date</label>
            <input
              type="date"
              value={fromDate}
              onChange={(e) => setFromDate(e.target.value)}
              aria-label="From Date"
              className="px-4 py-2.5 border border-gray-200 rounded-lg text-sm font-medium focus:outline-none focus:border-primary"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-gray-600 mb-2">To Date</label>
            <input
              type="date"
              value={toDate}
              onChange={(e) => setToDate(e.target.value)}
              aria-label="To Date"
              className="px-4 py-2.5 border border-gray-200 rounded-lg text-sm font-medium focus:outline-none focus:border-primary"
            />
          </div>

          <button
            onClick={() => {
              setFromDate('');
              setToDate('');
              setSelectedLocation('all');
              setSelectedBrand('all');
              setSearchQuery('');
              setSelectedSaleIds(new Set());
            }}
            className="px-4 py-2.5 text-sm font-bold text-gray-900 border border-gray-200 rounded-lg hover:bg-gray-50 transition"
          >
            Reset Filters
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="space-y-4">
        {/* Actions */}
        <div className="flex flex-wrap gap-3 mb-6">
          <button
            onClick={async () => {
              const date = fromDate || new Date().toISOString().split('T')[0];
              await printDailySalesReport777({
                locationId: selectedLocation,
                date,
                sales: salesToExport, locations, items, brands, inventory, transactions, returns
              });
            }}
            className="flex items-center gap-2 px-4 py-2 bg-black text-white rounded-lg font-bold text-sm hover:bg-gray-800 transition shadow-md"
          >
            <FileText className="w-4 h-4" />
            {selectedSaleIds.size > 0 ? `Print PDF (${selectedSaleIds.size} Selected)` : 'Print Daily Report (PDF)'}
          </button>
          <button
            onClick={async () => {
              const date = fromDate || new Date().toISOString().split('T')[0];
              await exportDailySalesReport777({
                locationId: selectedLocation,
                date,
                sales: salesToExport, locations, items, brands, inventory, transactions, returns
              });
            }}
            className="flex items-center gap-2 px-4 py-2 border-2 border-black text-black rounded-lg font-bold text-sm hover:bg-gray-50 transition"
          >
            <Download className="w-4 h-4" />
            {selectedSaleIds.size > 0 ? `Export Excel (${selectedSaleIds.size} Selected)` : 'Export Daily Report (Excel)'}
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-blue-50 border border-blue-100 rounded-xl p-4">
            <p className="text-xs font-bold text-blue-600 uppercase mb-1">Total Sales</p>
            <p className="text-2xl font-black text-blue-900">{formatCurrency(salesTotal)}</p>
            <p className="text-xs text-blue-500 mt-1">{filteredSales.length} transactions</p>
          </div>
          <div className="bg-emerald-50 border border-emerald-100 rounded-xl p-4">
            <p className="text-xs font-bold text-emerald-600 uppercase mb-1">Net Profit</p>
            <p className="text-2xl font-black text-emerald-900">{formatCurrency(netProfitTotal)}</p>
          </div>
          <div className="bg-purple-50 border border-purple-100 rounded-xl p-4">
            <p className="text-xs font-bold text-purple-600 uppercase mb-1">Avg Sale</p>
            <p className="text-2xl font-black text-purple-900">{formatCurrency(filteredSales.length > 0 ? salesTotal / filteredSales.length : 0)}</p>
          </div>
          <div className="bg-orange-50 border border-orange-100 rounded-xl p-4">
            <p className="text-xs font-bold text-orange-600 uppercase mb-1">Items Sold</p>
            <p className="text-2xl font-black text-orange-900">{filteredSales.reduce((sum, s) => sum + (s.quantity || 0), 0)}</p>
          </div>
        </div>

        {/* Sales Table */}
        <div className="bg-white rounded-xl border border-gray-100 overflow-hidden shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-100">
                <tr>
                  <th className="px-4 py-3 w-10 text-center">
                    <input 
                      type="checkbox" 
                      checked={filteredSales.length > 0 && selectedSaleIds.size === filteredSales.length}
                      onChange={handleSelectAll}
                      className="w-4 h-4 text-primary rounded border-gray-300 focus:ring-primary cursor-pointer"
                    />
                  </th>
                  <th className="px-4 py-3 text-left font-bold text-gray-600">Item</th>
                  <th className="px-4 py-3 text-left font-bold text-gray-600">QTY</th>
                  <th className="px-4 py-3 text-left font-bold text-gray-600">Unit Price</th>
                  <th className="px-4 py-3 text-left font-bold text-gray-600">Total</th>
                  <th className="px-4 py-3 text-left font-bold text-gray-600">Net Profit</th>
                  <th className="px-4 py-3 text-left font-bold text-gray-600">Shop</th>
                  <th className="px-4 py-3 text-left font-bold text-gray-600">Date</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filteredSales.map((sale, idx) => {
                  const location = locations.find(l => l.id === sale.location_id);
                  return (
                    <tr key={idx} className={`hover:bg-gray-50 transition-colors ${selectedSaleIds.has(sale.id) ? 'bg-blue-50/50' : ''}`}>
                      <td className="px-4 py-3 text-center">
                        <input 
                          type="checkbox" 
                          checked={selectedSaleIds.has(sale.id)}
                          onChange={() => toggleSaleSelection(sale.id)}
                          className="w-4 h-4 text-primary rounded border-gray-300 focus:ring-primary cursor-pointer"
                        />
                      </td>
                      <td className="px-4 py-3 font-medium text-gray-900">{sale.item_name}</td>
                      <td className="px-4 py-3 text-gray-600">{sale.quantity}</td>
                      <td className="px-4 py-3 text-gray-600">{formatCurrency((sale.converted_price_USD || 0) / (sale.quantity || 1))}</td>
                      <td className="px-4 py-3 font-bold text-gray-900">{formatCurrency(sale.converted_price_USD || 0)}</td>
                      <td className="px-4 py-3 font-semibold text-emerald-600">{formatCurrency(sale.profit_USD || 0)}</td>
                      <td className="px-4 py-3 text-gray-600">{location?.name}</td>
                      <td className="px-4 py-3 text-gray-600">
                        {sale.timestamp ? new Date(sale.timestamp).toLocaleDateString('en-IN') : '—'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {filteredSales.length === 0 && (
            <div className="p-8 text-center text-gray-400">
              <p className="text-sm font-medium">No sales data found for the selected filters</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
