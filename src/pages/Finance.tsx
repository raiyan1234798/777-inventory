import { useMemo, useState } from 'react';
import {
  DollarSign, TrendingUp, TrendingDown, Package,
  BarChart3, ShoppingCart, Globe2, Activity,
  ArrowUpRight, Target, Zap
} from 'lucide-react';
import { useStore, formatCurrency, EXCHANGE_RATES, CURRENCIES } from '../store';
import { format } from 'date-fns';
import clsx from 'clsx';
import { Sparkline, DonutChart, Gauge } from '../components/DashboardCharts';

export default function Finance() {
  const { sales, containers, locations, items, inventory } = useStore();
  const [displayCurrency, setDisplayCurrency] = useState('INR');

  const convert = (amountINR: number) => {
    const rate = EXCHANGE_RATES[displayCurrency] ?? 1;
    return amountINR / rate;
  };

  const fmt = (amountINR: number) => formatCurrency(convert(amountINR), displayCurrency);

  const stats = useMemo(() => {
    const totalRevenue = sales.reduce((s, x) => s + x.converted_price_INR, 0);
    const totalCOGS = sales.reduce((s, x) => s + x.avg_cost_INR * x.quantity, 0);
    const totalProfit = sales.reduce((s, x) => s + x.profit_INR, 0);
    const totalContainerCost = containers.reduce((s, c) => s + c.converted_cost_INR, 0);
    const totalInventoryValue = inventory.reduce((s, e) => s + e.quantity * e.avg_cost_INR, 0);
    const profitMargin = totalRevenue > 0 ? (totalProfit / totalRevenue) * 100 : 0;
    
    const totalPotentialRevenue = inventory.reduce((s, e) => {
      const item = items.find(i => i.id === e.item_id);
      return s + e.quantity * (item?.retail_price || 0);
    }, 0);
    const potentialProfit = totalPotentialRevenue - totalInventoryValue;

    return { 
      totalRevenue, totalCOGS, totalProfit, totalContainerCost, 
      totalInventoryValue, profitMargin,
      totalPotentialRevenue, potentialProfit
    };
  }, [sales, containers, inventory, items]);

  // Sales by location for Donut
  const salesByLocation = useMemo(() => {
    const map: Record<string, number> = {};
    sales.forEach(s => {
      map[s.location_id] = (map[s.location_id] || 0) + s.converted_price_INR;
    });
    const colors = ['#3b82f6', '#10b981', '#6366f1', '#f59e0b', '#ef4444', '#8b5cf6'];
    return Object.entries(map)
      .map(([id, val], i) => ({ 
        label: locations.find(l => l.id === id)?.name ?? id, 
        value: val,
        color: colors[i % colors.length]
      }))
      .sort((a, b) => b.value - a.value);
  }, [sales, locations]);

  // Sales by currency
  const salesByCurrency = useMemo(() => {
    const map: Record<string, number> = {};
    sales.forEach(s => {
      map[s.currency] = (map[s.currency] || 0) + s.converted_price_INR;
    });
    const total = Object.values(map).reduce((a, b) => a + b, 0) || 1;
    const colors: Record<string, string> = { 
      INR: '#3b82f6', USD: '#10b981', EUR: '#8b5cf6', 
      PKR: '#f59e0b', CNY: '#ef4444', SAR: '#f97316',
      AED: '#06b6d4', GBP: '#6366f1' 
    };
    return Object.entries(map).map(([cur, val]) => ({
      label: cur,
      value: val,
      pct: Math.round((val / total) * 100),
      color: colors[cur] ?? '#94a3b8',
    }));
  }, [sales]);

  // Top selling items
  const topItems = useMemo(() => {
    const map: Record<string, { revenue: number; profit: number; qty: number }> = {};
    sales.forEach(s => {
      if (!map[s.item_id]) map[s.item_id] = { revenue: 0, profit: 0, qty: 0 };
      map[s.item_id].revenue += s.converted_price_INR;
      map[s.item_id].profit += s.profit_INR;
      map[s.item_id].qty += s.quantity;
    });
    return Object.entries(map)
      .map(([id, data]) => ({ ...data, item: items.find(i => i.id === id)?.name ?? id }))
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 5);
  }, [sales, items]);

  // Monthly P&L
  const monthlyPnL = useMemo(() => {
    const now = new Date();
    const months = Array.from({ length: 6 }, (_, i) => {
      const d = new Date(now.getFullYear(), now.getMonth() - (5 - i), 1);
      return { label: format(d, 'MMM'), year: d.getFullYear(), month: d.getMonth() };
    });
    return months.map(m => {
      const mSales = sales.filter(s => {
        const d = new Date(s.timestamp);
        return d.getFullYear() === m.year && d.getMonth() === m.month;
      });
      const revenue = mSales.reduce((s, x) => s + x.converted_price_INR, 0);
      const profit = mSales.reduce((s, x) => s + x.profit_INR, 0);
      return { ...m, revenue, profit };
    });
  }, [sales]);

  const profitTrend = monthlyPnL.map(m => m.profit);
  const revenueTrend = monthlyPnL.map(m => m.revenue);
  const maxBar = Math.max(...revenueTrend, 1);

  return (
    <div className="space-y-8 animate-slide-up pb-10">
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
        <div className="space-y-1">
          <div className="flex items-center gap-2 text-[11px] font-black uppercase tracking-[0.2em] text-primary">
            <Activity className="w-3.5 h-3.5" />
            Strategic Financials
          </div>
          <h1 className="text-3xl font-black text-gray-900 tracking-tight">Financial Engine</h1>
          <p className="text-sm text-gray-500 font-medium">Global capital distribution and profit realization logic.</p>
        </div>

        <div className="flex items-center gap-4 bg-white p-2 rounded-[1.5rem] border border-gray-100 shadow-soft">
           <div className="px-4 py-2">
             <p className="text-[10px] font-bold text-gray-400 uppercase leading-none">Reporting In</p>
             <p className="text-xs font-black text-primary mt-1">{displayCurrency} Central</p>
           </div>
           <select
            title="Display Currency"
            value={displayCurrency}
            onChange={e => setDisplayCurrency(e.target.value)}
            className="h-10 px-4 bg-gray-50 rounded-xl text-sm font-black outline-none border-none focus:ring-2 focus:ring-primary/20"
          >
            {CURRENCIES.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <div className="bg-white rounded-[2rem] p-7 border border-gray-100 shadow-soft group hover:shadow-premium transition-all">
          <p className="text-[11px] font-black text-gray-400 uppercase tracking-widest mb-6">Gross Inflow</p>
          <div className="flex items-end justify-between">
            <div>
              <h2 className="text-3xl font-black text-gray-900 tracking-tighter tabular-nums">{fmt(stats.totalRevenue)}</h2>
              <div className="flex items-center gap-1.5 mt-2">
                <span className="px-1.5 py-0.5 rounded-lg bg-emerald-50 text-emerald-600 font-black text-[9px] uppercase">Globalized</span>
                <p className="text-xs text-gray-400 font-bold">{sales.length} Orders</p>
              </div>
            </div>
            <Sparkline data={revenueTrend} color="#3b82f6" />
          </div>
        </div>

        <div className="bg-white rounded-[2rem] p-7 border border-gray-100 shadow-soft group hover:shadow-premium transition-all">
          <p className="text-[11px] font-black text-gray-400 uppercase tracking-widest mb-6">Capital Flow (COGS)</p>
          <div className="flex items-end justify-between">
            <div>
              <h2 className="text-3xl font-black text-gray-900 tracking-tighter tabular-nums">{fmt(stats.totalCOGS)}</h2>
              <div className="flex items-center gap-1.5 mt-2 text-gray-400">
                <Package className="w-3.5 h-3.5" />
                <p className="text-xs font-bold uppercase tracking-tight">Stock Reversal</p>
              </div>
            </div>
            <div className="w-10 h-10 rounded-2xl bg-gray-50 flex items-center justify-center text-gray-300">
               <TrendingDown className="w-5 h-5" />
            </div>
          </div>
        </div>

        <div className="bg-white rounded-[2rem] p-7 border border-gray-100 shadow-soft group hover:shadow-premium transition-all">
          <p className="text-[11px] font-black text-gray-400 uppercase tracking-widest mb-6">Net Yield</p>
          <div className="flex items-end justify-between">
            <div>
              <h2 className={clsx("text-3xl font-black tracking-tighter tabular-nums", stats.totalProfit >= 0 ? 'text-emerald-500' : 'text-red-500')}>
                {fmt(stats.totalProfit)}
              </h2>
              <div className="flex items-center gap-1.5 mt-2">
                <div className="w-5 h-5 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center">
                   <ArrowUpRight className="w-3 h-3" />
                </div>
                <p className="text-xs font-black text-emerald-600">{stats.profitMargin.toFixed(1)}% Margin</p>
              </div>
            </div>
            <Sparkline data={profitTrend} color="#10b981" />
          </div>
        </div>

        <div className="bg-gradient-to-br from-primary to-blue-600 rounded-[2rem] p-7 text-white shadow-xl shadow-blue-100">
           <p className="text-[11px] font-black uppercase tracking-widest opacity-60 mb-6">Realizable Potential</p>
           <div className="flex items-center gap-6">
              <Gauge value={Math.round((stats.totalProfit / (stats.potentialProfit || 1)) * 100)} label="Realized" color="#fff" />
              <div>
                 <p className="text-[10px] font-black uppercase opacity-60">Pending Profit</p>
                 <p className="text-xl font-black tabular-nums">{fmt(stats.potentialProfit)}</p>
              </div>
           </div>
        </div>
      </div>

      {/* Charts & Breakdown */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-8">
        {/* Main Performance Chart */}
        <div className="xl:col-span-8 bg-white rounded-[2.5rem] border border-gray-100 shadow-soft p-8">
          <div className="flex items-center justify-between mb-10">
            <h2 className="text-xl font-black text-gray-900 tracking-tight flex items-center gap-3">
               <div className="w-1.5 h-8 bg-primary rounded-full" />
               Operational Velocity
            </h2>
            <div className="flex items-center gap-6">
               <div className="flex items-center gap-2">
                  <div className="w-2.5 h-2.5 rounded-full bg-blue-500" />
                  <span className="text-[10px] font-black uppercase text-gray-400">Revenue</span>
               </div>
               <div className="flex items-center gap-2">
                  <div className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
                  <span className="text-[10px] font-black uppercase text-gray-400">Net Profit</span>
               </div>
            </div>
          </div>

          <div className="flex items-end gap-6 h-64 sm:h-80">
             {monthlyPnL.map(m => {
               const revH = (m.revenue / maxBar) * 100;
               const profH = Math.max(5, (m.profit / maxBar) * 100);
               return (
                 <div key={m.label} className="flex-1 flex flex-col items-center group relative h-full">
                    <div className="w-full flex items-end gap-1.5 h-full pb-10">
                       <div className="flex-1 bg-gray-50 rounded-t-2xl transition-all group-hover:bg-blue-50 relative h-full flex flex-col justify-end overflow-hidden">
                          <div className="w-full bg-blue-500/20 rounded-t-2xl" style={{ height: `${revH}%` }} />
                          <div className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-8 opacity-0 group-hover:opacity-100 transition-all font-black text-[10px] text-primary whitespace-nowrap bg-white px-2 py-1 rounded-lg shadow-sm border border-gray-100">
                             {fmt(m.revenue)}
                          </div>
                       </div>
                       <div className="flex-1 bg-emerald-500 rounded-t-2xl relative transition-all group-hover:brightness-110" style={{ height: `${profH}%` }}>
                          <div className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-8 opacity-0 group-hover:opacity-100 transition-all font-black text-[10px] text-emerald-600 whitespace-nowrap bg-white px-2 py-1 rounded-lg shadow-sm border border-gray-100">
                             {fmt(m.profit)}
                          </div>
                       </div>
                    </div>
                    <span className="absolute bottom-0 text-[10px] font-black text-gray-400 uppercase tracking-widest">{m.label}</span>
                 </div>
               );
             })}
          </div>
        </div>

        {/* Distribution Analytics */}
        <div className="xl:col-span-4 space-y-8">
           <div className="bg-white rounded-[2.5rem] border border-gray-100 shadow-soft p-8">
              <h2 className="text-sm font-black text-gray-900 uppercase tracking-widest mb-8 flex items-center justify-between">
                Regional Distribution
                <Globe2 className="w-4 h-4 text-gray-300" />
              </h2>
              {salesByLocation.length === 0 ? (
                <div className="py-10 text-center italic text-gray-400 text-xs uppercase font-bold">No Data Vectorized</div>
              ) : (
                <div className="flex flex-col items-center gap-8">
                   <DonutChart items={salesByLocation} size={160} />
                   <div className="w-full space-y-3">
                      {salesByLocation.slice(0, 4).map(loc => (
                        <div key={loc.label} className="flex items-center justify-between group">
                           <div className="flex items-center gap-3">
                              <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: loc.color }} />
                              <span className="text-xs font-black text-gray-600 truncate max-w-[120px]">{loc.label}</span>
                           </div>
                           <span className="text-xs font-black text-gray-900">{fmt(loc.value)}</span>
                        </div>
                      ))}
                   </div>
                </div>
              )}
           </div>

           <div className="bg-white rounded-[2.5rem] border border-gray-100 shadow-soft p-8">
              <h2 className="text-sm font-black text-gray-900 uppercase tracking-widest mb-8 flex items-center justify-between">
                Top Value Movers
                <BarChart3 className="w-4 h-4 text-gray-300" />
              </h2>
              <div className="space-y-6">
                 {topItems.map((item, i) => (
                   <div key={item.item} className="flex items-start gap-4 group">
                      <div className="w-8 h-8 rounded-xl bg-gray-50 flex items-center justify-center text-[10px] font-black text-gray-400 group-hover:bg-primary group-hover:text-white transition-all">
                        0{i+1}
                      </div>
                      <div className="flex-1 min-w-0">
                         <p className="text-sm font-black text-gray-800 truncate">{item.item}</p>
                         <div className="flex justify-between items-center mt-1">
                            <p className="text-[10px] text-gray-400 font-bold uppercase">{item.qty} Units</p>
                            <p className="text-xs font-black text-emerald-500">+{fmt(item.profit)}</p>
                         </div>
                      </div>
                   </div>
                 ))}
              </div>
           </div>
        </div>
      </div>
    </div>
  );
}
