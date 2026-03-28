import { useMemo } from 'react';
import { useStore, formatCurrency, formatDualCurrency } from '../store';
import { format } from 'date-fns';
import {
  Package, TrendingUp, AlertTriangle, DollarSign,
  ArrowRightLeft, ShoppingCart, RotateCcw, Activity,
  Globe2, BarChart3, ChevronRight
} from 'lucide-react';
import clsx from 'clsx';
import { Link } from 'react-router-dom';

export default function Dashboard() {
  const { inventory, items, locations, sales, transactions, notifications, containers } = useStore();

    const stats = useMemo(() => {
    const totalInventoryValue = inventory.reduce((sum, entry) => sum + entry.quantity * entry.avg_cost_INR, 0);
    const totalProfit = sales.reduce((sum, s) => sum + s.profit_INR, 0);
    const totalRevenue = sales.reduce((sum, s) => sum + s.converted_price_INR, 0);

    const lowStockItems = items.filter(item => {
      const totalQty = inventory.filter(e => e.item_id === item.id).reduce((s, e) => s + e.quantity, 0);
      return totalQty < (item.min_stock_limit ?? 10);
    });

    const totalUnits = inventory.reduce((s, e) => s + e.quantity, 0);
    
    // 777 Specific: Container throughput
    const monthlyContainers = containers.filter(c => {
      const d = new Date(c.date);
      return d.getMonth() === new Date().getMonth() && d.getFullYear() === new Date().getFullYear();
    }).length;

    // Strategic Markup Analysis
    const avgMarkup = sales.length > 0 ? (totalProfit / (totalRevenue - totalProfit)) * 100 : 0;

    return { 
      totalInventoryValue, totalProfit, totalRevenue, 
      lowStockCount: lowStockItems.length, lowStockItems, 
      totalUnits, monthlyContainers, avgMarkup 
    };
  }, [inventory, items, sales, containers]);

  const recentTransactions = transactions.slice(0, 8);

  const locationStats = useMemo(() => {
    return locations.map(loc => {
      const locInv = inventory.filter(e => e.location_id === loc.id);
      const totalValue = locInv.reduce((s, e) => s + e.quantity * e.avg_cost_INR, 0);
      const totalQty = locInv.reduce((s, e) => s + e.quantity, 0);
      return { ...loc, totalValue, totalQty };
    }).sort((a, b) => b.totalValue - a.totalValue);
  }, [locations, inventory]);

  const categoryStats = useMemo(() => {
    const catMap: Record<string, number> = {};
    inventory.forEach(e => {
      const item = items.find(i => i.id === e.item_id);
      if (item) catMap[item.category] = (catMap[item.category] || 0) + e.quantity;
    });
    const total = Object.values(catMap).reduce((a, b) => a + b, 0) || 1;
    const colors = ['bg-blue-500', 'bg-indigo-500', 'bg-violet-500', 'bg-emerald-500', 'bg-amber-500'];
    return Object.entries(catMap)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 6)
      .map(([cat, qty], i) => ({ cat, qty, pct: Math.round((qty / total) * 100), color: colors[i % colors.length] }));
  }, [inventory, items]);

  const txTypeIcon: Record<string, { icon: React.ReactNode; color: string }> = {
    stock_entry: { icon: <Package className="w-4 h-4" />, color: 'bg-blue-50 text-blue-600' },
    transfer: { icon: <ArrowRightLeft className="w-4 h-4" />, color: 'bg-violet-50 text-violet-600' },
    sale: { icon: <ShoppingCart className="w-4 h-4" />, color: 'bg-emerald-50 text-emerald-600' },
    return: { icon: <RotateCcw className="w-4 h-4" />, color: 'bg-amber-50 text-amber-600' },
  };

  const getLocationName = (id: string) => {
    if (id === 'supplier') return 'Supplier';
    if (id === 'customer') return 'Customer';
    return locations.find(l => l.id === id)?.name ?? id;
  };

  const unreadAlerts = notifications.filter(n => n.type === 'low_stock' && n.status === 'unread');

  return (
    <div className="space-y-6 lg:space-y-8 animate-in fade-in duration-500">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-gray-900 tracking-tight">Dashboard Overview</h1>
          <p className="text-xs sm:text-sm text-gray-400 font-medium mt-1">Real-time global inventory, sales, and financial summary.</p>
        </div>
        <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-widest text-emerald-600 bg-emerald-50 px-3 py-1.5 rounded-full border border-emerald-100 self-start sm:self-auto">
          <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
          Live Metrics
        </div>
      </div>

      {/* Low Stock Alert Banner */}
      {unreadAlerts.length > 0 && (
        <Link to="/notifications" className="block bg-white border border-red-100 rounded-2xl px-5 py-4 shadow-sm hover:shadow-md transition-all group overflow-hidden relative">
          <div className="absolute inset-y-0 left-0 w-1 bg-red-500" />
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className="w-10 h-10 rounded-xl bg-red-50 flex items-center justify-center text-red-500 flex-shrink-0 group-hover:scale-110 transition-transform">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <div>
                <p className="text-sm font-bold text-gray-900">
                  {unreadAlerts.length} Critical Stock Alert{unreadAlerts.length > 1 ? 's' : ''}
                </p>
                <p className="text-xs text-red-600 font-medium mt-0.5 mt-1 line-clamp-1">
                  Latest: {unreadAlerts[0]?.message}
                </p>
              </div>
            </div>
            <ChevronRight className="w-5 h-5 text-gray-300 group-hover:text-red-500 transition-colors" />
          </div>
        </Link>
      )}

      {/* KPI Cards */}
      <div className="responsive-grid">
        <div className="bg-white rounded-2xl border border-gray-100 p-6 shadow-sm hover:shadow-xl transition-all group">
          <div className="flex items-center justify-between mb-4">
            <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Stock Worth</p>
            <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center text-blue-600 transition-transform group-hover:scale-110">
              <Package className="w-5 h-5" />
            </div>
          </div>
          <div className="flex flex-col">
            <p className="text-3xl font-black text-gray-900 tracking-tighter">{formatCurrency(stats.totalInventoryValue)}</p>
            <div className="flex items-center gap-1.5 mt-2">
              <div className="px-2 py-0.5 rounded-full bg-blue-50 text-blue-600 text-[9px] font-black uppercase tracking-tighter">
                {stats.totalUnits.toLocaleString()} units
              </div>
              <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest">across Node List</p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-gray-100 p-6 shadow-sm hover:shadow-xl transition-all group">
          <div className="flex items-center justify-between mb-4">
            <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Revenue Flow</p>
            <div className="w-10 h-10 rounded-xl bg-emerald-50 flex items-center justify-center text-emerald-600 transition-transform group-hover:scale-110">
              <DollarSign className="w-5 h-5" />
            </div>
          </div>
          <div className="flex flex-col">
            <p className="text-3xl font-black text-gray-900 tracking-tighter">{formatCurrency(stats.totalRevenue)}</p>
            <div className="flex items-center gap-1.5 mt-2">
              <div className="px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-600 text-[9px] font-black uppercase tracking-tighter">
                {sales.length} orders
              </div>
              <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest">Performance Window</p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-gray-100 p-6 shadow-sm hover:shadow-xl transition-all group sm:col-span-2 lg:col-span-1">
          <div className="flex items-center justify-between mb-4">
            <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Net Profit</p>
            <div className="w-10 h-10 rounded-xl bg-violet-50 flex items-center justify-center text-violet-600 transition-transform group-hover:scale-110">
              <TrendingUp className="w-5 h-5" />
            </div>
          </div>
          <div className="flex flex-col">
            <p className={clsx("text-3xl font-black tracking-tighter", stats.totalProfit >= 0 ? 'text-gray-900' : 'text-red-500')}>
              {formatCurrency(stats.totalProfit)}
            </p>
            <div className="flex items-center gap-1.5 mt-2">
              <div className="px-2 py-0.5 rounded-full bg-violet-50 text-violet-600 text-[9px] font-black uppercase tracking-tighter">
                {stats.avgMarkup.toFixed(1)}% Avg Markup
              </div>
              <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest">Landed realized</p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-gray-100 p-6 shadow-sm hover:shadow-xl transition-all group hidden lg:block">
          <div className="flex items-center justify-between mb-4">
            <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Global Intake</p>
            <div className="w-10 h-10 rounded-xl bg-amber-50 flex items-center justify-center text-amber-600 transition-transform group-hover:scale-110">
              <Globe2 className="w-5 h-5" />
            </div>
          </div>
          <div className="flex flex-col">
            <p className="text-3xl font-black text-gray-900 tracking-tighter">{stats.monthlyContainers} Shipments</p>
            <div className="mt-2 flex items-center gap-1.5">
               <div className="px-2 py-0.5 rounded-full bg-amber-50 text-amber-600 text-[9px] font-black uppercase tracking-tighter">
                Active Cycle
              </div>
              <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest">Current Month</p>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content Grid */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6 lg:gap-8">
        {/* Recent Transactions */}
        <div className="xl:col-span-2 space-y-4">
          <div className="flex items-center justify-between px-2">
            <h2 className="text-base font-extrabold text-gray-900 flex items-center gap-2.5">
               <div className="w-1.5 h-1.5 rounded-full bg-primary" />
               Recent Activity Flow
            </h2>
            <Link to="/transfers" className="text-[10px] font-black uppercase tracking-wider text-primary hover:underline">View All Records</Link>
          </div>
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            {recentTransactions.length === 0 ? (
              <div className="py-20 text-center text-gray-400">
                <Activity className="w-12 h-12 mx-auto mb-4 opacity-10" />
                <p className="font-bold text-gray-500">No activity logged yet.</p>
              </div>
            ) : (
              <div className="divide-y divide-gray-50">
                {recentTransactions.map(tx => {
                  const meta = txTypeIcon[tx.type] ?? txTypeIcon.transfer;
                  return (
                    <div key={tx.id} className="p-4 sm:p-5 flex items-center gap-4 hover:bg-gray-50/50 transition-all group cursor-pointer">
                      <div className={clsx("w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 transition-transform group-hover:scale-110", meta.color)}>
                        {meta.icon}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-bold text-gray-900 truncate tracking-tight">{tx.item_name}</p>
                        <p className="text-[10px] text-gray-400 font-bold uppercase tracking-tight mt-1 flex items-center gap-1.5">
                          <span className="truncate max-w-[100px]">{getLocationName(tx.from_location)}</span>
                          <ChevronRight className="w-2.5 h-2.5" />
                          <span className="truncate max-w-[100px]">{getLocationName(tx.to_location)}</span>
                          <span className="ml-1 text-gray-300">|</span>
                          <span className="text-primary">{tx.quantity} units</span>
                        </p>
                      </div>
                      <div className="text-right flex-shrink-0">
                        <p className="text-sm font-black text-gray-900">{formatDualCurrency(tx.unit_cost * tx.quantity, tx.currency)}</p>
                        <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest mt-1">{format(new Date(tx.timestamp), 'MMM dd')}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Right Panels */}
        <div className="space-y-6 lg:grid lg:grid-cols-2 lg:gap-6 xl:flex xl:flex-col xl:space-y-6">
          {/* Category Distribution */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 lg:mb-0">
            <h2 className="text-sm font-black text-gray-900 uppercase tracking-widest flex items-center justify-between mb-6">
              Category Mix
              <BarChart3 className="w-4 h-4 text-gray-300" />
            </h2>
            {categoryStats.length === 0 ? (
              <p className="text-xs text-gray-400 py-8 text-center font-medium italic">Global node inventory empty</p>
            ) : (
              <div className="space-y-5">
                {categoryStats.map(({ cat, qty, pct, color }) => (
                  <div key={cat} className="group">
                    <div className="flex justify-between text-[11px] mb-2 font-bold uppercase tracking-wide">
                      <span className="text-gray-700">{cat}</span>
                      <span className="text-gray-400 group-hover:text-primary transition-colors">{qty}u · {pct}%</span>
                    </div>
                    <div className="w-full bg-gray-50 rounded-full h-2 overflow-hidden border border-gray-100/50">
                      <div className={clsx(color, "h-full rounded-full transition-all duration-1000 group-hover:opacity-80")} style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Location Breakdown */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
            <h2 className="text-sm font-black text-gray-900 uppercase tracking-widest flex items-center justify-between mb-6">
              Node Valuation
              <Globe2 className="w-4 h-4 text-gray-300" />
            </h2>
            {locationStats.length === 0 ? (
              <p className="text-xs text-gray-400 py-8 text-center font-medium italic">Empty node map</p>
            ) : (
              <div className="space-y-5">
                {locationStats.slice(0, 5).map(loc => (
                  <div key={loc.id} className="flex items-center justify-between group cursor-default">
                    <div className="min-w-0">
                      <p className="text-[13px] font-extrabold text-gray-800 truncate group-hover:text-primary transition-colors">{loc.name}</p>
                      <p className="text-[10px] text-gray-400 font-bold uppercase mt-0.5 tracking-tight">{loc.type} · {loc.country}</p>
                    </div>
                    <div className="text-right flex-shrink-0 ml-4">
                      <p className="text-sm font-black text-gray-900">{formatCurrency(loc.totalValue)}</p>
                      <p className="text-[10px] text-primary font-black uppercase mt-0.5">{loc.totalQty}u</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
