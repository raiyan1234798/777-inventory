import { Store, TrendingUp } from 'lucide-react';
import { useStore } from '../store';
import { useNavigate } from 'react-router-dom';

const SHOPS = [
  { name: 'Mumbai Downtown', location: 'India' },
  { name: 'Delhi Central', location: 'India' },
  { name: 'Dubai Mall', location: 'UAE' },
];

export default function Shops() {
  const { invoices } = useStore();
  const navigate = useNavigate();

  // Compute per-shop revenue and item count from invoices
  const shopStats = SHOPS.map(shop => {
    const shopInvoices = invoices.filter(inv => inv.shopLocation === shop.name);
    const revenue = shopInvoices.reduce((sum, inv) => sum + inv.subtotal, 0);
    const itemsSold = shopInvoices.reduce((sum, inv) => inv.items.reduce((s, it) => s + it.quantity, sum), 0);
    return { ...shop, revenue, itemsSold, invoiceCount: shopInvoices.length };
  });

  const totalRevenue = shopStats.reduce((s, sh) => s + sh.revenue, 0) || 1;

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center sm:flex-row flex-col gap-4">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 tracking-tight">Shops Overview</h1>
          <p className="text-gray-500 mt-2">Manage shop inventory, sales, and profit tracking.</p>
        </div>
        <button
          onClick={() => navigate('/billing')}
          className="w-full sm:w-auto btn-primary flex items-center justify-center shadow-lg shadow-primary/30"
        >
          <TrendingUp className="w-4 h-4 mr-2" />
          Create Invoice
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {shopStats.map((shop, i) => {
          const pct = Math.round((shop.revenue / totalRevenue) * 100);
          return (
            <div key={i} className="card hover:-translate-y-1 transition-transform duration-300">
              <div className="flex justify-between items-start mb-6">
                <div className="w-12 h-12 bg-primary/10 rounded-xl flex items-center justify-center text-primary shadow-inner">
                  <Store className="w-6 h-6" />
                </div>
                <span className="flex items-center text-sm font-semibold text-success bg-success/10 px-2.5 py-1 rounded-full border border-success/20">
                  {pct}% of revenue
                </span>
              </div>
              <h3 className="text-xl font-bold text-gray-900 tracking-tight">{shop.name}</h3>
              <p className="text-sm text-gray-500 mt-1">{shop.location}</p>

              <div className="mt-6 pt-6 border-t border-gray-100 flex justify-between items-end">
                <div>
                  <p className="text-xs text-gray-500 font-medium uppercase tracking-wider mb-1">Revenue</p>
                  <p className="text-lg font-bold text-gray-900">₹{shop.revenue.toLocaleString()}</p>
                </div>
                <div className="text-right">
                  <p className="text-xs text-gray-500 font-medium uppercase tracking-wider mb-1">Invoices</p>
                  <p className="text-lg font-bold text-gray-900">{shop.invoiceCount}</p>
                </div>
              </div>

              <div className="mt-4">
                <div className="w-full bg-gray-100 rounded-full h-2">
                  <div className="bg-primary h-2 rounded-full transition-all duration-500" style={{ width: `${pct}%` }} />
                </div>
              </div>

              <div className="mt-6 flex space-x-3">
                <button className="flex-1 btn-secondary py-2 text-sm" onClick={() => navigate('/warehouse')}>
                  Inventory
                </button>
                <button
                  className="flex-1 btn-primary py-2 text-sm bg-gray-900 hover:bg-black text-white"
                  onClick={() => navigate('/billing')}
                >
                  Enter Sale
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Summary bar */}
      {invoices.length === 0 && (
        <div className="card text-center py-8 text-gray-400">
          <p>No sales data yet. Create your first invoice in the <strong>Billing</strong> page.</p>
        </div>
      )}
    </div>
  );
}
