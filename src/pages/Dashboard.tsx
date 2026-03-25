import { useStore } from '../store';
import { format } from 'date-fns';
import { Receipt } from 'lucide-react';

export default function Dashboard() {
  const { inventory, invoices } = useStore();

  // ── Computed Stats ──────────────────────────────────────────
  const totalInventoryValue = inventory.reduce(
    (sum, item) => sum + item.quantity * item.sellingPrice, 0
  );

  const totalRevenue = invoices.reduce((sum, inv) => sum + inv.subtotal, 0);

  const LOW_STOCK_THRESHOLD = 10;
  const lowStockCount = inventory.filter(i => i.quantity <= LOW_STOCK_THRESHOLD).length;

  const recentInvoices = invoices.slice(0, 5);

  // ── Stock by location (from inventory) ──────────────────────
  const totalQty = inventory.reduce((s, i) => s + i.quantity, 0) || 1;
  const locationMap: Record<string, number> = {};
  inventory.forEach(item => {
    // Use a fallback location label "Warehouse" if no location field exists
    const loc = 'Warehouse';
    locationMap[loc] = (locationMap[loc] || 0) + item.quantity;
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-gray-900 tracking-tight">Dashboard Overview</h1>
        <p className="text-gray-500 mt-2">Real-time valuation and activity of the global inventory.</p>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <div className="card border-l-4 border-l-primary flex flex-col justify-between hover:shadow-md transition-shadow">
          <p className="text-sm font-medium text-gray-500">Total Inventory Value</p>
          <div className="mt-4 flex items-baseline">
            <span className="text-3xl font-bold text-gray-900">
              ₹{totalInventoryValue.toLocaleString()}
            </span>
          </div>
          <div className="mt-4 text-sm text-gray-400">
            {inventory.length} SKUs tracked
          </div>
        </div>

        <div className="card border-l-4 border-l-success flex flex-col justify-between hover:shadow-md transition-shadow">
          <p className="text-sm font-medium text-gray-500">Total Revenue</p>
          <div className="mt-4 flex items-baseline">
            <span className="text-3xl font-bold text-gray-900">
              ₹{totalRevenue.toLocaleString()}
            </span>
          </div>
          <div className="mt-4 text-sm text-gray-400">
            {invoices.length} invoices generated
          </div>
        </div>

        <div className="card border-l-4 border-l-danger flex flex-col justify-between hover:shadow-md transition-shadow">
          <p className="text-sm font-medium text-gray-500">Low Stock Alerts</p>
          <div className="mt-4 flex items-baseline">
            <span className="text-3xl font-bold text-gray-900">{lowStockCount} Items</span>
          </div>
          <div className="mt-4 text-sm text-danger">
            {lowStockCount > 0 ? 'Needs immediate attention' : 'All stock levels healthy'}
          </div>
        </div>

        <div className="card flex flex-col justify-between hover:shadow-md transition-shadow">
          <p className="text-sm font-medium text-gray-500">Total Items in Stock</p>
          <div className="mt-4 flex items-baseline">
            <span className="text-3xl font-bold text-gray-900">{totalQty.toLocaleString()}</span>
            <span className="ml-2 text-sm text-gray-500">units</span>
          </div>
          <div className="mt-4 text-sm text-gray-500">
            Across {inventory.length} products
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Recent Invoices */}
        <div className="lg:col-span-2 card">
          <h2 className="text-lg font-semibold text-gray-900 mb-6">Recent Invoices</h2>
          {recentInvoices.length === 0 ? (
            <div className="py-12 text-center text-gray-400">
              <Receipt className="w-10 h-10 mx-auto mb-3 opacity-30" />
              <p>No invoices yet. Create one from the Billing page.</p>
            </div>
          ) : (
            <div className="space-y-4">
              {recentInvoices.map((inv) => (
                <div key={inv.id} className="flex items-center">
                  <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-primary flex-shrink-0">
                    <Receipt className="w-5 h-5" />
                  </div>
                  <div className="ml-4 flex-1">
                    <p className="text-sm font-medium text-gray-900">
                      Invoice #{inv.id} — {inv.customerName}
                    </p>
                    <p className="text-xs text-gray-500 mt-1">
                      {inv.shopLocation} • {format(new Date(inv.date), 'MMM dd, yyyy')}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-semibold text-gray-900">₹{inv.subtotal.toLocaleString()}</p>
                    <p className="text-xs text-gray-400 mt-1">{inv.status}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Inventory Summary */}
        <div className="card">
          <h2 className="text-lg font-semibold text-gray-900 mb-6">Inventory by Category</h2>
          {inventory.length === 0 ? (
            <p className="text-gray-400 text-sm py-8 text-center">No inventory data yet.</p>
          ) : (
            <div className="space-y-4">
              {(() => {
                const catMap: Record<string, number> = {};
                inventory.forEach(i => {
                  catMap[i.category] = (catMap[i.category] || 0) + i.quantity;
                });
                const total = Object.values(catMap).reduce((a, b) => a + b, 0) || 1;
                const colors = ['bg-primary', 'bg-blue-400', 'bg-indigo-400', 'bg-gray-400', 'bg-success'];
                return Object.entries(catMap).slice(0, 5).map(([cat, qty], idx) => {
                  const pct = Math.round((qty / total) * 100);
                  return (
                    <div key={cat}>
                      <div className="flex justify-between text-sm mb-1">
                        <span className="font-medium text-gray-700">{cat}</span>
                        <span className="text-gray-500">{pct}%</span>
                      </div>
                      <div className="w-full bg-gray-100 rounded-full h-2">
                        <div className={`${colors[idx % colors.length]} h-2 rounded-full`} style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                  );
                });
              })()}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
