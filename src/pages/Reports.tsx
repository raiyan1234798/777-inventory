import { useState } from 'react';
import { Download, FileText } from 'lucide-react';
import { useStore } from '../store';
import { DataExporter, type ExportConfig } from '../lib/dataExporter';
import clsx from 'clsx';

export default function Reports() {
  const { sales, expenses, returns, inventory, locations, items } = useStore();
  const [activeTab, setActiveTab] = useState<'sales' | 'expenses' | 'returns' | 'stock'>('sales');
  const [selectedLocation, setSelectedLocation] = useState<string>('all');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [exporting, setExporting] = useState(false);

  // Get warehouse and shop locations separately
  const warehouse = locations.find(l => l.type === 'warehouse');
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

  // Get filtered data
  const filteredSales = filterByLocation(filterByDateRange(sales, 'timestamp'), 'location_id');
  const filteredExpenses = filterByLocation(filterByDateRange(expenses, 'date'), 'location_id');
  const filteredReturns = filterByLocation(filterByDateRange(returns, 'timestamp'), 'location_id');

  // Get inventory for specific location
  const filteredInventory = selectedLocation === 'all'
    ? inventory
    : inventory.filter(inv => inv.location_id === selectedLocation);

  // Calculate totals
  const salesTotal = filteredSales.reduce((sum, s) => sum + (s.total_price || 0), 0);
  const salesRevenue = filteredSales.reduce((sum, s) => sum + (s.total_price || 0), 0);
  const expensesTotal = filteredExpenses.reduce((sum, e) => sum + (e.amount || 0), 0);
  const returnsCount = filteredReturns.length;
  const inventoryValue = filteredInventory.reduce((sum, inv) => {
    return sum + ((inv.quantity || 0) * (inv.avg_cost_INR || 0));
  }, 0);

  const exportReport = async () => {
    try {
      setExporting(true);
      const dateFrom = fromDate ? new Date(fromDate) : undefined;
      const dateTo = toDate ? new Date(toDate + 'T23:59:59') : undefined;

      const baseConfig: ExportConfig = {
        includeSheets: [activeTab as any],
        dateFrom,
        dateTo,
        locationId: selectedLocation === 'all' ? undefined : selectedLocation,
        includeAllLocations: selectedLocation === 'all',
      };

      if (activeTab === 'sales') {
        DataExporter.exportSalesData(filteredSales, locations, baseConfig);
      } else if (activeTab === 'expenses') {
        DataExporter.exportExpensesData(filteredExpenses, locations, baseConfig);
      } else if (activeTab === 'returns') {
        DataExporter.exportReturnsData(filteredReturns, locations, baseConfig);
      } else if (activeTab === 'stock') {
        DataExporter.exportInventoryData(filteredInventory, items, locations, baseConfig);
      }
    } catch (err: any) {
      console.error('Export error:', err);
      alert('Error exporting report: ' + err.message);
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <div className="flex items-center gap-3 mb-2">
          <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
            <FileText className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-black text-gray-900">Reports</h1>
            <p className="text-sm text-gray-400">Export and analyze your inventory data</p>
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
              className="w-full px-4 py-2.5 border border-gray-200 rounded-lg text-sm font-medium focus:outline-none focus:border-primary bg-white"
            >
              <option value="all">All Locations</option>
              {warehouse && <option value={warehouse.id}>{warehouse.name} (Warehouse)</option>}
              {shops.map(shop => (
                <option key={shop.id} value={shop.id}>{shop.name} (Shop)</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-bold text-gray-600 mb-2">From Date</label>
            <input
              type="date"
              value={fromDate}
              onChange={(e) => setFromDate(e.target.value)}
              className="px-4 py-2.5 border border-gray-200 rounded-lg text-sm font-medium focus:outline-none focus:border-primary"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-gray-600 mb-2">To Date</label>
            <input
              type="date"
              value={toDate}
              onChange={(e) => setToDate(e.target.value)}
              className="px-4 py-2.5 border border-gray-200 rounded-lg text-sm font-medium focus:outline-none focus:border-primary"
            />
          </div>

          <button
            onClick={() => {
              setFromDate('');
              setToDate('');
              setSelectedLocation('all');
            }}
            className="px-4 py-2.5 text-sm font-bold text-gray-900 border border-gray-200 rounded-lg hover:bg-gray-50 transition"
          >
            Reset Filters
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 border-b border-gray-200 overflow-x-auto">
        {(['sales', 'expenses', 'returns', 'stock'] as const).map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={clsx(
              "px-4 py-3 text-sm font-bold border-b-2 transition whitespace-nowrap",
              activeTab === tab
                ? 'border-primary text-primary'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            )}
          >
            {tab.charAt(0).toUpperCase() + tab.slice(1)} Report
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="space-y-4">
        {/* Stats Cards */}
        {activeTab === 'sales' && (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="bg-blue-50 border border-blue-100 rounded-xl p-4">
                <p className="text-xs font-bold text-blue-600 uppercase mb-1">Total Sales</p>
                <p className="text-2xl font-black text-blue-900">₹{salesTotal.toLocaleString('en-IN')}</p>
                <p className="text-xs text-blue-500 mt-1">{filteredSales.length} transactions</p>
              </div>
              <div className="bg-emerald-50 border border-emerald-100 rounded-xl p-4">
                <p className="text-xs font-bold text-emerald-600 uppercase mb-1">Revenue</p>
                <p className="text-2xl font-black text-emerald-900">₹{salesRevenue.toLocaleString('en-IN')}</p>
              </div>
              <div className="bg-purple-50 border border-purple-100 rounded-xl p-4">
                <p className="text-xs font-bold text-purple-600 uppercase mb-1">Avg Sale</p>
                <p className="text-2xl font-black text-purple-900">₹{(filteredSales.length > 0 ? salesTotal / filteredSales.length : 0).toLocaleString('en-IN', { maximumFractionDigits: 0 })}</p>
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
                      <th className="px-4 py-3 text-left font-bold text-gray-600">Item</th>
                      <th className="px-4 py-3 text-left font-bold text-gray-600">QTY</th>
                      <th className="px-4 py-3 text-left font-bold text-gray-600">Unit Price</th>
                      <th className="px-4 py-3 text-left font-bold text-gray-600">Total</th>
                      <th className="px-4 py-3 text-left font-bold text-gray-600">Shop</th>
                      <th className="px-4 py-3 text-left font-bold text-gray-600">Date</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {filteredSales.map((sale, idx) => {
                      const location = locations.find(l => l.id === sale.location_id);
                      return (
                        <tr key={idx} className="hover:bg-gray-50">
                          <td className="px-4 py-3 font-medium text-gray-900">{sale.item_name}</td>
                          <td className="px-4 py-3 text-gray-600">{sale.quantity}</td>
                          <td className="px-4 py-3 text-gray-600">₹{sale.unit_price?.toLocaleString('en-IN', { maximumFractionDigits: 2 })}</td>
                          <td className="px-4 py-3 font-bold text-gray-900">₹{sale.total_price?.toLocaleString('en-IN', { maximumFractionDigits: 2 })}</td>
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
          </>
        )}

        {activeTab === 'expenses' && (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              <div className="bg-red-50 border border-red-100 rounded-xl p-4">
                <p className="text-xs font-bold text-red-600 uppercase mb-1">Total Expenses</p>
                <p className="text-2xl font-black text-red-900">₹{expensesTotal.toLocaleString('en-IN')}</p>
                <p className="text-xs text-red-500 mt-1">{filteredExpenses.length} entries</p>
              </div>
              <div className="bg-orange-50 border border-orange-100 rounded-xl p-4">
                <p className="text-xs font-bold text-orange-600 uppercase mb-1">Avg Expense</p>
                <p className="text-2xl font-black text-orange-900">₹{(filteredExpenses.length > 0 ? expensesTotal / filteredExpenses.length : 0).toLocaleString('en-IN', { maximumFractionDigits: 0 })}</p>
              </div>
              <div className="bg-yellow-50 border border-yellow-100 rounded-xl p-4">
                <p className="text-xs font-bold text-yellow-600 uppercase mb-1">Categories</p>
                <p className="text-2xl font-black text-yellow-900">{new Set(filteredExpenses.map(e => e.category)).size}</p>
              </div>
            </div>

            {/* Expenses Table */}
            <div className="bg-white rounded-xl border border-gray-100 overflow-hidden shadow-sm">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 border-b border-gray-100">
                    <tr>
                      <th className="px-4 py-3 text-left font-bold text-gray-600">Category</th>
                      <th className="px-4 py-3 text-left font-bold text-gray-600">Description</th>
                      <th className="px-4 py-3 text-left font-bold text-gray-600">Amount</th>
                      <th className="px-4 py-3 text-left font-bold text-gray-600">Location</th>
                      <th className="px-4 py-3 text-left font-bold text-gray-600">Date</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {filteredExpenses.map((expense, idx) => {
                      const location = locations.find(l => l.id === expense.location_id);
                      return (
                        <tr key={idx} className="hover:bg-gray-50">
                          <td className="px-4 py-3 font-medium text-gray-900">{expense.category}</td>
                          <td className="px-4 py-3 text-gray-600">{expense.description}</td>
                          <td className="px-4 py-3 font-bold text-red-600">₹{expense.amount?.toLocaleString('en-IN', { maximumFractionDigits: 2 })}</td>
                          <td className="px-4 py-3 text-gray-600">{location?.name}</td>
                          <td className="px-4 py-3 text-gray-600">
                            {new Date(expense.date).toLocaleDateString('en-IN')}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              {filteredExpenses.length === 0 && (
                <div className="p-8 text-center text-gray-400">
                  <p className="text-sm font-medium">No expense data found for the selected filters</p>
                </div>
              )}
            </div>
          </>
        )}

        {activeTab === 'returns' && (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              <div className="bg-red-50 border border-red-100 rounded-xl p-4">
                <p className="text-xs font-bold text-red-600 uppercase mb-1">Total Returns</p>
                <p className="text-2xl font-black text-red-900">{returnsCount}</p>
              </div>
              <div className="bg-orange-50 border border-orange-100 rounded-xl p-4">
                <p className="text-xs font-bold text-orange-600 uppercase mb-1">Items Returned</p>
                <p className="text-2xl font-black text-orange-900">{filteredReturns.reduce((sum, r) => sum + (r.quantity || 0), 0)}</p>
              </div>
              <div className="bg-yellow-50 border border-yellow-100 rounded-xl p-4">
                <p className="text-xs font-bold text-yellow-600 uppercase mb-1">Return Types</p>
                <p className="text-2xl font-black text-yellow-900">{new Set(filteredReturns.map(r => r.type)).size}</p>
              </div>
            </div>

            {/* Returns Table */}
            <div className="bg-white rounded-xl border border-gray-100 overflow-hidden shadow-sm">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 border-b border-gray-100">
                    <tr>
                      <th className="px-4 py-3 text-left font-bold text-gray-600">Item</th>
                      <th className="px-4 py-3 text-left font-bold text-gray-600">QTY</th>
                      <th className="px-4 py-3 text-left font-bold text-gray-600">Type</th>
                      <th className="px-4 py-3 text-left font-bold text-gray-600">Reason</th>
                      <th className="px-4 py-3 text-left font-bold text-gray-600">Status</th>
                      <th className="px-4 py-3 text-left font-bold text-gray-600">Date</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {filteredReturns.map((ret, idx) => (
                      <tr key={idx} className="hover:bg-gray-50">
                        <td className="px-4 py-3 font-medium text-gray-900">{ret.item_name}</td>
                        <td className="px-4 py-3 text-gray-600">{ret.quantity}</td>
                        <td className="px-4 py-3 text-gray-600">{ret.type}</td>
                        <td className="px-4 py-3 text-gray-600">{ret.reason || '—'}</td>
                        <td className="px-4 py-3">
                          <span className={clsx(
                            'px-2.5 py-1 rounded-full text-xs font-bold',
                            ret.status === 'processed' ? 'bg-emerald-100 text-emerald-700' :
                            ret.status === 'pending' ? 'bg-yellow-100 text-yellow-700' :
                            'bg-gray-100 text-gray-700'
                          )}>
                            {ret.status}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-gray-600">
                          {ret.timestamp ? new Date(ret.timestamp).toLocaleDateString('en-IN') : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {filteredReturns.length === 0 && (
                <div className="p-8 text-center text-gray-400">
                  <p className="text-sm font-medium">No return data found for the selected filters</p>
                </div>
              )}
            </div>
          </>
        )}

        {activeTab === 'stock' && (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="bg-blue-50 border border-blue-100 rounded-xl p-4">
                <p className="text-xs font-bold text-blue-600 uppercase mb-1">Total Items</p>
                <p className="text-2xl font-black text-blue-900">{filteredInventory.length}</p>
              </div>
              <div className="bg-emerald-50 border border-emerald-100 rounded-xl p-4">
                <p className="text-xs font-bold text-emerald-600 uppercase mb-1">Total Quantity</p>
                <p className="text-2xl font-black text-emerald-900">{filteredInventory.reduce((sum, inv) => sum + (inv.quantity || 0), 0)}</p>
              </div>
              <div className="bg-purple-50 border border-purple-100 rounded-xl p-4">
                <p className="text-xs font-bold text-purple-600 uppercase mb-1">Stock Value</p>
                <p className="text-2xl font-black text-purple-900">₹{inventoryValue.toLocaleString('en-IN')}</p>
              </div>
              <div className="bg-orange-50 border border-orange-100 rounded-xl p-4">
                <p className="text-xs font-bold text-orange-600 uppercase mb-1">Avg Stock</p>
                <p className="text-2xl font-black text-orange-900">{(filteredInventory.length > 0 ? filteredInventory.reduce((sum, inv) => sum + (inv.quantity || 0), 0) / filteredInventory.length : 0).toLocaleString('en-IN', { maximumFractionDigits: 0 })}</p>
              </div>
            </div>

            {/* Stock Table */}
            <div className="bg-white rounded-xl border border-gray-100 overflow-hidden shadow-sm">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 border-b border-gray-100">
                    <tr>
                      <th className="px-4 py-3 text-left font-bold text-gray-600">Item Name</th>
                      <th className="px-4 py-3 text-left font-bold text-gray-600">Quantity</th>
                      <th className="px-4 py-3 text-left font-bold text-gray-600">Unit Cost</th>
                      <th className="px-4 py-3 text-left font-bold text-gray-600">Total Value</th>
                      <th className="px-4 py-3 text-left font-bold text-gray-600">Location</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {filteredInventory.map((inv, idx) => {
                      const location = locations.find(l => l.id === inv.location_id);
                      const itemData = items.find(i => i.id === inv.item_id);
                      const value = (inv.quantity || 0) * (inv.avg_cost_INR || 0);
                      return (
                        <tr key={idx} className="hover:bg-gray-50">
                          <td className="px-4 py-3 font-medium text-gray-900">{itemData?.name || 'Unknown Item'}</td>
                          <td className="px-4 py-3 text-gray-600">{inv.quantity}</td>
                          <td className="px-4 py-3 text-gray-600">₹{inv.avg_cost_INR?.toLocaleString('en-IN', { maximumFractionDigits: 2 })}</td>
                          <td className="px-4 py-3 font-bold text-gray-900">₹{value.toLocaleString('en-IN', { maximumFractionDigits: 2 })}</td>
                          <td className="px-4 py-3 text-gray-600">{location?.name}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              {filteredInventory.length === 0 && (
                <div className="p-8 text-center text-gray-400">
                  <p className="text-sm font-medium">No stock data found for the selected filters</p>
                </div>
              )}
            </div>
          </>
        )}
      </div>

      {/* Export Button */}
      <div className="flex justify-end">
        <button
          onClick={exportReport}
          disabled={exporting}
          className="px-6 py-3 font-bold text-white bg-primary rounded-lg hover:bg-primary/90 disabled:opacity-50 flex items-center gap-2 transition"
        >
          <Download className="w-4 h-4" />
          {exporting ? 'Exporting...' : 'Export Report'}
        </button>
      </div>
    </div>
  );
}
