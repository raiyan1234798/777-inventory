import { Download, IndianRupee, PieChart, Activity, TrendingUp } from 'lucide-react';
import { useStore } from '../store';

export default function Finance() {
  const { invoices, inventory } = useStore();

  const totalRevenue = invoices.reduce((s, inv) => s + inv.subtotal, 0);
  const totalCOGS = inventory.reduce((s, item) => s + item.quantity * item.unitCost, 0);
  const grossProfit = totalRevenue - totalCOGS;

  // Revenue by shop location
  const locationRevMap: Record<string, number> = {};
  invoices.forEach(inv => {
    locationRevMap[inv.shopLocation] = (locationRevMap[inv.shopLocation] || 0) + inv.subtotal;
  });
  const locationEntries = Object.entries(locationRevMap).sort((a, b) => b[1] - a[1]);
  const totalForPct = locationEntries.reduce((s, [, v]) => s + v, 0) || 1;

  const barColors = ['bg-primary', 'bg-indigo-500', 'bg-blue-400', 'bg-gray-400'];

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center sm:flex-row flex-col gap-4">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 tracking-tight">Financial Overview</h1>
          <p className="text-gray-500 mt-2">Multi-currency financial tracking and reporting.</p>
        </div>
        <button className="btn-secondary flex items-center bg-white border border-gray-200">
          <Download className="w-4 h-4 mr-2" /> Export Report
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <div className="card bg-gray-900 text-white">
          <div className="flex justify-between">
            <p className="text-sm font-medium text-gray-400">Total Revenue</p>
            <IndianRupee className="w-5 h-5 text-success" />
          </div>
          <p className="text-3xl font-bold mt-4">₹{totalRevenue.toLocaleString()}</p>
          <div className="mt-4 text-sm text-gray-400">{invoices.length} invoices</div>
        </div>

        <div className="card">
          <div className="flex justify-between">
            <p className="text-sm font-medium text-gray-500">Inventory Cost (COGS)</p>
            <TrendingUp className="w-5 h-5 text-danger" />
          </div>
          <p className="text-3xl font-bold mt-4 text-gray-900">₹{totalCOGS.toLocaleString()}</p>
          <div className="mt-4 text-sm text-gray-400">Current stock value at cost</div>
        </div>

        <div className="card">
          <div className="flex justify-between">
            <p className="text-sm font-medium text-gray-500">Gross Profit</p>
            <IndianRupee className="w-5 h-5 text-success" />
          </div>
          <p className={`text-3xl font-bold mt-4 ${grossProfit >= 0 ? 'text-success' : 'text-danger'}`}>
            ₹{grossProfit.toLocaleString()}
          </p>
          <div className="mt-4 text-sm text-gray-400">Revenue minus inventory cost</div>
        </div>

        <div className="card flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-gray-500">Currency Engine</p>
            <p className="text-xl font-bold mt-1 text-gray-900">Base: INR</p>
            <div className="mt-2 flex flex-wrap gap-2 text-xs">
              <span className="bg-primary/10 text-primary px-2 py-1 rounded">USD • AED • EUR</span>
            </div>
          </div>
          <div className="w-12 h-12 bg-success/10 rounded-full flex items-center justify-center text-success flex-shrink-0">
            <Activity className="w-6 h-6" />
          </div>
        </div>
      </div>

      <div className="card">
        <h2 className="text-lg font-semibold text-gray-900 mb-6 flex items-center">
          <PieChart className="w-5 h-5 mr-2 text-primary" />
          Revenue by Shop Location
        </h2>

        {locationEntries.length === 0 ? (
          <p className="text-gray-400 text-sm py-8 text-center">No invoices yet — revenue breakdown will appear here once sales are recorded.</p>
        ) : (
          <div className="space-y-4">
            {locationEntries.map(([loc, amount], i) => {
              const pct = Math.round((amount / totalForPct) * 100);
              return (
                <div key={loc}>
                  <div className="flex justify-between text-sm mb-2">
                    <span className="font-medium text-gray-700">{loc}</span>
                    <span className="font-bold text-gray-900">₹{amount.toLocaleString()}</span>
                  </div>
                  <div className="w-full bg-gray-100 rounded-full h-3">
                    <div className={`${barColors[i % barColors.length]} h-3 rounded-full transition-all duration-500`} style={{ width: `${pct}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
