import { useMemo, useState } from 'react';
import {
  DollarSign, TrendingUp, TrendingDown, Package,
  BarChart3, ShoppingCart, Globe2, PieChart, Activity
} from 'lucide-react';
import { useStore, formatCurrency, EXCHANGE_RATES, CURRENCIES } from '../store';
import { format } from 'date-fns';
import clsx from 'clsx';

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

  // Sales by location
  const salesByLocation = useMemo(() => {
    const map: Record<string, { revenue: number; profit: number; count: number }> = {};
    sales.forEach(s => {
      if (!map[s.location_id]) map[s.location_id] = { revenue: 0, profit: 0, count: 0 };
      map[s.location_id].revenue += s.converted_price_INR;
      map[s.location_id].profit += s.profit_INR;
      map[s.location_id].count += 1;
    });
    return Object.entries(map)
      .map(([id, data]) => ({ ...data, location: locations.find(l => l.id === id)?.name ?? id }))
      .sort((a, b) => b.revenue - a.revenue);
  }, [sales, locations]);

  // Sales by currency (original currency distribution)
  const salesByCurrency = useMemo(() => {
    const map: Record<string, number> = {};
    sales.forEach(s => {
      map[s.currency] = (map[s.currency] || 0) + s.converted_price_INR;
    });
    const total = Object.values(map).reduce((a, b) => a + b, 0) || 1;
    const colors: Record<string, string> = { 
      INR: 'bg-blue-500', USD: 'bg-emerald-500', EUR: 'bg-violet-500', 
      PKR: 'bg-amber-500', CNY: 'bg-red-500', SAR: 'bg-orange-500',
      AED: 'bg-cyan-500', GBP: 'bg-indigo-500' 
    };
    return Object.entries(map).map(([cur, val]) => ({
      currency: cur,
      value: val,
      pct: Math.round((val / total) * 100),
      color: colors[cur] ?? 'bg-gray-400',
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
      .slice(0, 6);
  }, [sales, items]);

  // Imports by country
  const importsByCountry = useMemo(() => {
    const map: Record<string, number> = {};
    containers.forEach(c => { map[c.source_country] = (map[c.source_country] || 0) + c.converted_cost_INR; });
    return Object.entries(map).sort(([, a], [, b]) => b - a);
  }, [containers]);

  // Monthly P&L (last 6 months)
  const monthlyPnL = useMemo(() => {
    const now = new Date();
    const months = Array.from({ length: 6 }, (_, i) => {
      const d = new Date(now.getFullYear(), now.getMonth() - (5 - i), 1);
      return { label: format(d, 'MMM yy'), year: d.getFullYear(), month: d.getMonth() };
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

  const maxBar = Math.max(...monthlyPnL.map(m => m.revenue), 1);

  return (
    <div className="space-y-6 lg:space-y-10 animate-in fade-in duration-500">
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-gray-900 tracking-tight flex items-center gap-3">
             <div className="p-2 sm:p-2.5 bg-primary/10 rounded-xl text-primary flex-shrink-0">
               <DollarSign className="w-5 h-5 sm:w-6 sm:h-6" />
            </div>
            Financial Engine
          </h1>
          <p className="text-xs sm:text-sm text-gray-400 font-bold uppercase tracking-widest mt-2 ml-12 sm:ml-14 border-l-2 border-gray-100 pl-4 uppercase tracking-tighter">
            Multi-node profit audit and capital rotation logic.
          </p>
        </div>
        <div className="flex items-center gap-3 ml-12 sm:ml-0 self-start sm:self-auto">
          <label className="text-[10px] font-black uppercase text-gray-400 tracking-widest hidden sm:block">Master Currency</label>
          <select
            title="Display Currency"
            value={displayCurrency}
            onChange={e => setDisplayCurrency(e.target.value)}
            className="input-field h-11 bg-white text-sm font-bold shadow-sm focus:ring-2 focus:ring-primary/20 outline-none min-w-[120px]"
          >
            {CURRENCIES.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
      </div>

      {/* KPI Stats Grid */}
      <div className="responsive-grid">
        <div className="card border-0 shadow-lg shadow-gray-50 bg-gradient-to-br from-white to-gray-50/50 p-6 flex flex-col justify-between">
          <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-4">Gross Inflow</p>
          <div>
            <p className="text-3xl font-black text-gray-900 tracking-tighter tabular-nums">{fmt(stats.totalRevenue)}</p>
            <div className="flex items-center gap-1.5 mt-2">
              <span className="px-1.5 py-0.5 rounded-md bg-emerald-50 text-emerald-600 font-black text-[9px] uppercase tracking-tighter">
                {sales.length} Events
              </span>
              <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest">Global Conversions</p>
            </div>
          </div>
        </div>

        <div className="card border-0 shadow-lg shadow-gray-50 bg-gradient-to-br from-white to-gray-50/50 p-6 flex flex-col justify-between">
          <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-4">Capital Committed (COGS)</p>
          <div>
            <p className="text-3xl font-black text-gray-900 tracking-tighter tabular-nums">{fmt(stats.totalCOGS)}</p>
            <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest mt-2 uppercase tracking-tighter">Inventory Reversal Point</p>
          </div>
        </div>

        <div className="card border-0 shadow-lg shadow-gray-50 bg-gradient-to-br from-white to-gray-200/20 p-6 flex flex-col justify-between sm:col-span-2 lg:col-span-1">
          <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-4">Landed Net Profit</p>
          <div>
            <p className={clsx("text-3xl font-black tracking-tighter tabular-nums", stats.totalProfit >= 0 ? 'text-emerald-600' : 'text-red-500')}>
              {fmt(stats.totalProfit)}
            </p>
            <div className="flex items-center gap-1.5 mt-2">
              <div className={clsx("w-4 h-4 rounded-full flex items-center justify-center", stats.totalProfit >= 0 ? "bg-emerald-100 text-emerald-600" : "bg-red-100 text-red-600")}>
                {stats.totalProfit >= 0 ? <TrendingUp className="w-2.5 h-2.5" /> : <TrendingDown className="w-2.5 h-2.5" />}
              </div>
              <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest text-primary">{stats.profitMargin.toFixed(1)}% Yield</p>
            </div>
          </div>
        </div>

        <div className="card border-0 shadow-lg shadow-gray-50 bg-gradient-to-br from-white to-gray-50/50 p-6 flex flex-col justify-between hidden lg:flex">
          <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-4">Import Magnitude</p>
          <div>
            <p className="text-3xl font-black text-gray-900 tracking-tighter tabular-nums">{fmt(stats.totalContainerCost)}</p>
            <div className="flex items-center gap-1.5 mt-2">
              <span className="px-1.5 py-0.5 rounded-md bg-blue-50 text-blue-600 font-black text-[9px] uppercase tracking-tighter">
                {containers.length} Nodes
              </span>
              <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest">Global Intake Cost</p>
            </div>
          </div>
        </div>
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6 lg:gap-8">
        {/* Monthly P&L Chart */}
        <div className="xl:col-span-2 bg-white rounded-3xl border border-gray-100 shadow-xl shadow-gray-100/50 p-6 sm:p-8">
          <div className="flex items-center justify-between mb-8">
            <h2 className="text-base font-extrabold text-gray-900 flex items-center gap-2.5">
               <div className="w-1.5 h-1.5 rounded-full bg-primary" />
               Operational Velocity (INR Normalized)
            </h2>
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-1.5"><div className="w-2 h-2 rounded-full bg-blue-100" /><span className="text-[10px] font-black uppercase tracking-widest text-gray-400">Inflow</span></div>
              <div className="flex items-center gap-1.5"><div className="w-2 h-2 rounded-full bg-emerald-400" /><span className="text-[10px] font-black uppercase tracking-widest text-gray-400">Net Profit</span></div>
            </div>
          </div>
          
          <div className="flex items-end gap-3 sm:gap-6 h-48 sm:h-64">
            {monthlyPnL.map(m => {
              const revH = (m.revenue / maxBar) * 100;
              const profH = Math.max(2, (m.profit / maxBar) * 100);
              return (
                <div key={m.label} className="flex-1 flex flex-col items-center group relative h-full">
                  <div className="w-full flex items-end gap-1 h-full pb-8">
                    <div className="flex-1 bg-blue-50/50 rounded-t-lg transition-all group-hover:bg-blue-100 relative" style={{ height: `${revH}%` }}>
                       <div className="absolute -top-7 left-1/2 -translate-x-1/2 text-[9px] font-black text-blue-600 bg-white shadow-sm border border-blue-50 px-1.5 py-0.5 rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap">
                         {formatCurrency(m.revenue)}
                       </div>
                    </div>
                    <div className={clsx("flex-1 rounded-t-lg transition-all duration-500 hover:brightness-110", m.profit >= 0 ? 'bg-emerald-400' : 'bg-red-400')} style={{ height: `${profH}%` }} />
                  </div>
                  <p className="absolute bottom-0 text-[10px] font-black text-gray-400 uppercase tracking-widest">{m.label}</p>
                </div>
              );
            })}
          </div>
        </div>

        {/* Currency Mix Pie Chart Logic Repurposed for Modern Bar List */}
        <div className="bg-white rounded-3xl border border-gray-100 shadow-xl shadow-gray-100/50 p-6 sm:p-8">
          <h2 className="text-sm font-black text-gray-900 uppercase tracking-widest flex items-center justify-between mb-8">
            Node Currency Mix
            <PieChart className="w-4 h-4 text-gray-300" />
          </h2>
          {salesByCurrency.length === 0 ? (
            <div className="py-20 text-center flex flex-col items-center">
               <Activity className="w-10 h-10 text-gray-100 mb-4" />
               <p className="text-[10px] font-black text-gray-300 uppercase tracking-widest">No terminal logs</p>
            </div>
          ) : (
            <div className="space-y-6">
              {salesByCurrency.map(({ currency, value, pct, color }) => (
                <div key={currency} className="group">
                  <div className="flex justify-between text-[11px] mb-2 font-black uppercase tracking-widest">
                    <span className="text-gray-700">{currency}</span>
                    <span className="text-gray-400 group-hover:text-primary transition-colors">{pct}% · {fmt(value)}</span>
                  </div>
                  <div className="w-full bg-gray-50 rounded-full h-2 overflow-hidden border border-gray-100/50">
                    <div className={clsx(color, "h-full rounded-full transition-all duration-1000 group-hover:opacity-80")} style={{ width: `${pct}%` }} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Detail Analysis Grid */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 lg:gap-8">
        {/* Top Movers */}
        <div className="bg-white rounded-3xl border border-gray-100 shadow-xl shadow-gray-100/50 overflow-hidden">
          <div className="px-8 py-5 border-b border-gray-50 bg-gray-50/30 flex items-center justify-between">
            <h2 className="text-[11px] font-black text-gray-900 uppercase tracking-widest flex items-center gap-2">
              <ShoppingCart className="w-4 h-4 text-primary" /> High-Velocity Objects
            </h2>
            <BarChart3 className="w-4 h-4 text-gray-300" />
          </div>
          {topItems.length === 0 ? (
             <div className="py-20 text-center">
               <p className="text-[10px] font-black text-gray-300 uppercase tracking-widest">No high velocity logs</p>
             </div>
          ) : (
            <div className="divide-y divide-gray-50">
              {topItems.map((item, i) => (
                <div key={item.item} className="px-8 py-4 flex items-center justify-between group hover:bg-gray-50 transition-all">
                  <div className="flex items-center gap-4">
                    <div className="w-8 h-8 rounded-xl bg-gray-100 flex items-center justify-center text-[10px] font-black text-gray-400 group-hover:bg-primary group-hover:text-white transition-all">
                      0{i + 1}
                    </div>
                    <div>
                      <p className="text-sm font-extrabold text-gray-900 tracking-tight">{item.item}</p>
                      <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest mt-0.5">{item.qty} Object Units Sold</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-black text-gray-900 tabular-nums">{fmt(item.revenue)}</p>
                    <p className={clsx("text-[10px] font-black tabular-nums mt-0.5", item.profit >= 0 ? "text-emerald-500" : "text-red-500")}>
                      {item.profit >= 0 ? '+' : ''}{fmt(item.profit)} Yield
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Node Distribution */}
        <div className="space-y-6 lg:grid lg:grid-cols-2 lg:gap-6 xl:flex xl:flex-col xl:space-y-6">
          <div className="bg-white rounded-3xl border border-gray-100 shadow-xl shadow-gray-100/50 p-8">
            <h2 className="text-[11px] font-black text-gray-900 uppercase tracking-widest flex items-center justify-between mb-8">
              Anchor Node Performance
              <Globe2 className="w-4 h-4 text-gray-300" />
            </h2>
            {salesByLocation.length === 0 ? (
               <p className="text-center py-10 text-[10px] font-black text-gray-300 uppercase tracking-widest">No node data identified</p>
            ) : (
              <div className="space-y-6">
                {salesByLocation.map(l => (
                  <div key={l.location} className="flex items-center justify-between group">
                    <div>
                      <p className="text-[13px] font-black text-gray-800 tracking-tight group-hover:text-primary transition-colors">{l.location}</p>
                      <p className="text-[10px] text-gray-400 font-bold uppercase tracking-tight mt-0.5">{l.count} Transmission Events</p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-black text-gray-900 tabular-nums">{fmt(l.revenue)}</p>
                      <p className={clsx("text-[10px] font-black mt-0.5 tabular-nums", l.profit >= 0 ? 'text-emerald-500' : 'text-red-500')}>
                        {l.profit >= 0 ? '+' : ''}{fmt(l.profit)} Net
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="bg-white rounded-3xl border border-gray-100 shadow-xl shadow-gray-100/50 p-8">
            <h2 className="text-[11px] font-black text-gray-900 uppercase tracking-widest flex items-center justify-between mb-8">
              Supply Vector Costing
              <Package className="w-4 h-4 text-gray-300" />
            </h2>
            {importsByCountry.length === 0 ? (
               <p className="text-center py-10 text-[10px] font-black text-gray-300 uppercase tracking-widest">No source vector data</p>
            ) : (
              <div className="space-y-5">
                {importsByCountry.map(([country, value]) => (
                  <div key={country} className="flex items-center justify-between group">
                    <div className="flex items-center gap-3">
                       <div className="w-6 h-6 rounded bg-gray-50 border border-gray-100 flex items-center justify-center text-[10px] font-black text-gray-400">#</div>
                       <p className="text-[13px] font-black text-gray-800 tracking-tight group-hover:text-primary transition-colors">{country}</p>
                    </div>
                    <p className="text-sm font-black text-gray-900 tabular-nums">{fmt(value)}</p>
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
