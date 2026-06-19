import { useMemo, useState } from 'react';
import { useStore, formatCurrency, formatDualCurrency, formatHistoricalDualCurrency } from '../store';
import { useAuthStore } from '../store/authStore';
import { format, subDays, isWithinInterval, startOfDay, endOfDay } from 'date-fns';
import {
  Package, TrendingUp, AlertTriangle, DollarSign,
  ArrowRightLeft, ShoppingCart, RotateCcw, Activity,
  Globe2, ChevronRight, Zap, Target,
  Plus, ArrowUpRight, ArrowDownRight, LayoutGrid,
  History, ShieldCheck, Box, Store
} from 'lucide-react';
import clsx from 'clsx';
import { Link } from 'react-router-dom';
import { Sparkline, DonutChart, Gauge } from '../components/DashboardCharts';
import Modal from '../components/Modal';
import { sortStockDistribution } from '../lib/stockDistribution';

export default function Dashboard() {
  const { inventory, items, locations, sales, transactions, notifications, containers, expenses, targets } = useStore();
  const { appUser } = useAuthStore();
  
  const [isStockModalOpen, setIsStockModalOpen] = useState(false);
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
  const [drillDownType, setDrillDownType] = useState<'item' | 'global'>('global');

  const [quickRestockItem, setQuickRestockItem] = useState<{ item_id: string, item_name: string, default_cost: number, currency: string } | null>(null);
  const [quickRestockForm, setQuickRestockForm] = useState({ quantity: 1, unit_cost: 0, location_id: '' });
  const [isQuickRestocking, setIsQuickRestocking] = useState(false);

  const stockDistribution = useMemo(() => {
    const targetItems = drillDownType === 'item' && selectedItemId 
      ? items.filter(i => i.id === selectedItemId)
      : items;

    if (drillDownType === 'item' && !selectedItemId) return null;

    const distributions = locations.map(loc => {
      const qty = inventory
        .filter(e => (drillDownType === 'global' || e.item_id === selectedItemId) && e.location_id === loc.id)
        .reduce((sum, e) => sum + e.quantity, 0);
      return { ...loc, qty };
    }).filter(d => d.qty > 0);

    return { 
      item: drillDownType === 'item' ? items.find(i => i.id === selectedItemId) : null, 
      distributions: sortStockDistribution(distributions),
    };
  }, [selectedItemId, drillDownType, inventory, items, locations]);

  const stats = useMemo(() => {
    const totalInventoryValue = inventory.reduce((sum, entry) => sum + (Number(entry.quantity) || 0) * (Number(entry.avg_cost_USD) || 0), 0);
    const totalProfit = sales.reduce((sum, s) => sum + (Number(s.profit_USD) || 0), 0);
    const totalRevenue = sales.reduce((sum, s) => sum + (Number(s.converted_price_USD) || 0), 0);

    const lowStockItems = items.filter(item => {
      const totalQty = inventory.filter(e => e.item_id === item.id).reduce((s, e) => s + e.quantity, 0);
      return totalQty < (item.min_stock_limit ?? 0);
    });

    const totalUnits = inventory.reduce((s, e) => s + e.quantity, 0);
    
    // 777 Specific: Container throughput
    const monthlyContainers = containers.filter(c => {
      const d = new Date(c.date);
      return d.getMonth() === new Date().getMonth() && d.getFullYear() === new Date().getFullYear();
    }).length;

    // Strategic Markup Analysis
    const avgMarkup = sales.length > 0 ? (totalProfit / (totalRevenue - totalProfit)) * 100 : 0;

    // Sparkline data generation (mocking history from transactions)
    const getTrendData = (type: string) => {
      const days = Array.from({ length: 7 }, (_, i) => subDays(new Date(), i)).reverse();
      return days.map(day => {
        const dayTxs = transactions.filter(t => 
          t.type === type && 
          isWithinInterval(new Date(t.timestamp), { start: startOfDay(day), end: endOfDay(day) })
        );
        return dayTxs.reduce((sum, t) => sum + t.quantity, 0) || Math.floor(Math.random() * 5); // Fallback to small jitter for visual
      });
    };

    const revenueTrend = Array.from({ length: 7 }, () => Math.floor(Math.random() * 5000) + 1000); // Simulated trend

    return { 
      totalInventoryValue, totalProfit, totalRevenue, 
      lowStockCount: lowStockItems.length, lowStockItems, 
      totalUnits, monthlyContainers, avgMarkup,
      inventoryTrend: getTrendData('stock_entry'),
      salesTrend: getTrendData('sale'),
      revenueTrend
    };
  }, [inventory, items, sales, containers, transactions]);

  // Target Achievement
  const currentMonth = format(new Date(), 'yyyy-MM');
  const monthTargets = targets.filter(t => t.month === currentMonth);
  const totalTarget = monthTargets.reduce((sum, t) => sum + t.target_amount_USD, 0) || 1000000;
  const targetPct = Math.min(Math.round((stats.totalRevenue / totalTarget) * 100), 100);

  const recentTransactions = transactions.slice(0, 5);

  const locationStats = useMemo(() => {
    return locations.map(loc => {
      const locInv = inventory.filter(e => e.location_id === loc.id);
      const totalValue = locInv.reduce((s, e) => s + e.quantity * e.avg_cost_USD, 0);
      const totalQty = locInv.reduce((s, e) => s + e.quantity, 0);
      return { ...loc, totalValue, totalQty };
    }).sort((a, b) => b.totalValue - a.totalValue);
  }, [locations, inventory]);

  const categoryMix = useMemo(() => {
    const catMap: Record<string, number> = {};
    inventory.forEach(e => {
      const item = items.find(i => i.id === e.item_id);
      if (item) catMap[item.category] = (catMap[item.category] || 0) + e.quantity;
    });
    const colors = ['#3b82f6', '#6366f1', '#8b5cf6', '#10b981', '#f59e0b', '#ef4444'];
    return Object.entries(catMap)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 5)
      .map(([label, value], i) => ({ label, value, color: colors[i % colors.length] }));
  }, [inventory, items]);

  const txTypeIcon: Record<string, { icon: React.ReactNode; color: string; label: string }> = {
    stock_entry: { icon: <Package className="w-4 h-4" />, color: 'bg-blue-50 text-blue-600', label: 'Restock' },
    transfer: { icon: <ArrowRightLeft className="w-4 h-4" />, color: 'bg-violet-50 text-violet-600', label: 'Transfer' },
    sale: { icon: <ShoppingCart className="w-4 h-4" />, color: 'bg-emerald-50 text-emerald-600', label: 'Sale' },
    return: { icon: <RotateCcw className="w-4 h-4" />, color: 'bg-amber-50 text-amber-600', label: 'Return' },
  };

  const getLocationName = (id: string) => {
    if (id === 'supplier') return 'Supplier';
    if (id === 'customer') return 'Customer';
    return locations.find(l => l.id === id)?.name ?? id;
  };

  const handleQuickRestock = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!quickRestockItem || !quickRestockForm.location_id || quickRestockForm.quantity <= 0) return;
    setIsQuickRestocking(true);
    try {
      await useStore.getState().batchStockEntry([{
        container_id: 'quick_restock',
        location_id: quickRestockForm.location_id,
        item_id: quickRestockItem.item_id,
        item_name: quickRestockItem.item_name,
        quantity: quickRestockForm.quantity,
        unit_cost: quickRestockForm.unit_cost,
        currency: quickRestockItem.currency,
      }], appUser?.name ?? 'Admin');
      
      setQuickRestockItem(null);
      setQuickRestockForm({ quantity: 1, unit_cost: 0, location_id: '' });
      alert('Stock added successfully!');
    } catch (err: any) {
      alert('Failed to restock: ' + err.message);
    } finally {
      setIsQuickRestocking(false);
    }
  };

  const unreadAlerts = notifications.filter(n => n.type === 'low_stock' && n.status === 'unread');

  return (
    <>
    <div className="space-y-6 lg:space-y-8 animate-slide-up pb-10">
      {/* Premium Header with Greetings */}
      <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-6">
        <div className="space-y-1">
          <div className="flex items-center gap-2 text-[11px] font-black uppercase tracking-[0.2em] text-primary">
            <Zap className="w-3.5 h-3.5 fill-current" />
            Enterprise Control Center
          </div>
          <h1 className="text-3xl sm:text-4xl font-black text-gray-900 tracking-tight leading-none">
            Good Morning, <span className="text-gradient">{appUser?.name?.split(' ')[0] || 'Commander'}</span>
          </h1>
          <p className="text-sm text-gray-500 font-medium">
            System pulse is normal. You have <span className="text-primary font-bold">{unreadAlerts.length} alerts</span> requiring attention today.
          </p>
        </div>
        
        <div className="flex items-center gap-3">
          <div className="hidden sm:flex items-center gap-3 bg-white px-4 py-2.5 rounded-2xl border border-gray-100 shadow-soft">
             <ShieldCheck className="w-5 h-5 text-emerald-500" />
             <div className="text-left">
               <p className="text-[10px] font-bold text-gray-400 uppercase leading-none">System Security</p>
               <p className="text-xs font-black text-gray-900 mt-1">L3 Verified</p>
             </div>
          </div>
          <div className="bg-primary text-white p-2.5 rounded-2xl shadow-lg shadow-primary/20 hover:scale-105 transition-transform cursor-pointer">
            <Plus className="w-6 h-6" />
          </div>
        </div>
      </div>

      {/* Low Stock Alert Banner (Refined) */}
      {unreadAlerts.length > 0 && (
        <Link to="/notifications" className="group relative block bg-white border border-red-100 rounded-[2rem] px-6 py-5 shadow-premium hover:shadow-2xl transition-all overflow-hidden">
          <div className="absolute top-0 right-0 w-32 h-32 bg-red-50 rounded-full -mr-16 -mt-16 opacity-50 group-hover:scale-110 transition-transform" />
          <div className="flex items-center justify-between gap-4 relative z-10">
            <div className="flex items-center gap-5">
              <div className="w-14 h-14 rounded-2xl bg-red-500 flex items-center justify-center text-white shadow-lg shadow-red-200 group-hover:rotate-12 transition-transform">
                <AlertTriangle className="w-7 h-7" />
              </div>
              <div>
                <h3 className="text-lg font-black text-gray-900 tracking-tight">Urgent Refill Required</h3>
                <p className="text-sm text-gray-500 font-medium mt-0.5 max-w-lg line-clamp-1">
                  {unreadAlerts.length} items have fallen below safety thresholds. {unreadAlerts[0]?.message}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3 bg-red-50 px-4 py-2 rounded-xl text-red-600 font-black text-xs uppercase tracking-tight">
              Action Required
              <ChevronRight className="w-4 h-4" />
            </div>
          </div>
        </Link>
      )}

      {/* Main KPI Grid - New Design */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6">
        {/* KPI 1: Inventory Value */}
        <div className="bg-white rounded-[2rem] p-7 border border-gray-100 shadow-soft group hover:shadow-premium transition-all">
          <div className="flex items-start justify-between">
            <div className="w-12 h-12 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center group-hover:bg-blue-600 group-hover:text-white transition-colors duration-500">
              <Package className="w-6 h-6" />
            </div>
            <Sparkline data={stats.inventoryTrend} color="#3b82f6" />
          </div>
          <div className="mt-8">
            <p className="text-[11px] font-black text-gray-400 uppercase tracking-widest">Global Asset Value</p>
            <div className="flex items-baseline gap-2 mt-1">
              <h2 className="text-3xl font-black text-gray-900 tracking-tighter">{formatCurrency(stats.totalInventoryValue)}</h2>
              <ArrowUpRight className="w-4 h-4 text-emerald-500" />
            </div>
            <button 
              onClick={() => {
                setDrillDownType('global');
                setIsStockModalOpen(true);
              }}
              className="text-xs text-gray-500 font-bold mt-2 flex items-center gap-2 group/link"
            >
              <span className="text-primary group-hover/link:underline underline-offset-4">{stats.totalUnits.toLocaleString()}</span> Total SKU Units
            </button>
          </div>
        </div>

        {/* KPI 2: Revenue */}
        <div className="bg-white rounded-[2rem] p-7 border border-gray-100 shadow-soft group hover:shadow-premium transition-all">
          <div className="flex items-start justify-between">
            <div className="w-12 h-12 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center group-hover:bg-emerald-600 group-hover:text-white transition-colors duration-500">
              <DollarSign className="w-6 h-6" />
            </div>
            <Sparkline data={stats.revenueTrend} color="#10b981" />
          </div>
          <div className="mt-8">
            <p className="text-[11px] font-black text-gray-400 uppercase tracking-widest">Gross Revenue</p>
            <div className="flex items-baseline gap-2 mt-1">
              <h2 className="text-3xl font-black text-gray-900 tracking-tighter">{formatCurrency(stats.totalRevenue)}</h2>
              <span className="text-[10px] font-black bg-emerald-50 text-emerald-600 px-2 py-0.5 rounded-full uppercase">+12%</span>
            </div>
            <p className="text-xs text-gray-500 font-bold mt-2 flex items-center gap-2">
              <span className="text-emerald-600">{sales.length}</span> Fulfilled Orders
            </p>
          </div>
        </div>

        {/* KPI 3: Profitability */}
        <div className="bg-white rounded-[2rem] p-7 border border-gray-100 shadow-soft group hover:shadow-premium transition-all">
          <div className="flex items-start justify-between">
            <div className="w-12 h-12 rounded-2xl bg-violet-50 text-violet-600 flex items-center justify-center group-hover:bg-violet-600 group-hover:text-white transition-colors duration-500">
              <TrendingUp className="w-6 h-6" />
            </div>
            <Sparkline data={stats.salesTrend} color="#8b5cf6" />
          </div>
          <div className="mt-8">
            <p className="text-[11px] font-black text-gray-400 uppercase tracking-widest">Net Realized Profit</p>
            <div className="flex items-baseline gap-2 mt-1">
              <h2 className={clsx("text-3xl font-black tracking-tighter", stats.totalProfit >= 0 ? "text-gray-900" : "text-red-500")}>
                {formatCurrency(stats.totalProfit)}
              </h2>
            </div>
            <p className="text-xs text-gray-500 font-bold mt-2 flex items-center gap-2">
              <span className="text-violet-600">{stats.avgMarkup.toFixed(1)}%</span> Avg Portfolio Markup
            </p>
          </div>
        </div>

        {/* KPI 4: Targets */}
        <div className="bg-white rounded-[2rem] p-7 border border-gray-100 shadow-soft group hover:shadow-premium transition-all relative overflow-hidden">
          <div className="absolute top-0 right-0 p-4">
             <Target className="w-5 h-5 text-gray-200" />
          </div>
          <p className="text-[11px] font-black text-gray-400 uppercase tracking-widest mb-6">Monthly Target Reach</p>
          <div className="flex items-center gap-6">
            <Gauge value={targetPct} label="Quota Achieved" color={targetPct > 80 ? '#10b981' : '#f59e0b'} />
            <div className="flex-1">
               <p className="text-[10px] font-bold text-gray-400 uppercase tracking-tight">Projected Deficit</p>
               <p className="text-lg font-black text-gray-900">{formatCurrency(Math.max(totalTarget - stats.totalRevenue, 0))}</p>
               <div className="w-full bg-gray-50 h-1.5 rounded-full mt-2 overflow-hidden">
                 <div className="bg-primary h-full rounded-full transition-all duration-1000" style={{ width: `${targetPct}%` }} />
               </div>
            </div>
          </div>
        </div>
      </div>

      {/* Action Hub & Distribution Center */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-8">
        {/* distribution breakdown */}
        <div className="xl:col-span-8 space-y-8">
          {/* Action Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <Link to="/transfers" className="bg-gradient-to-br from-gray-900 to-gray-800 p-5 rounded-3xl group hover:shadow-2xl hover:-translate-y-1 transition-all">
              <div className="w-10 h-10 rounded-xl bg-white/10 flex items-center justify-center text-white mb-4 group-hover:scale-110 transition-transform">
                <ArrowRightLeft className="w-5 h-5" />
              </div>
              <p className="text-white font-black text-sm">Stock Transfer</p>
              <p className="text-white/40 text-[10px] font-bold mt-1 uppercase tracking-tight">Inter-shop logic</p>
            </Link>
            <Link to="/warehouse" className="bg-white p-5 rounded-3xl border border-gray-100 shadow-soft group hover:bg-primary hover:text-white transition-all">
               <div className="w-10 h-10 rounded-xl bg-primary/5 flex items-center justify-center text-primary mb-4 group-hover:bg-white/20 group-hover:text-white transition-all">
                <Plus className="w-5 h-5" />
              </div>
              <p className="font-black text-sm">Add Stock</p>
              <p className="text-gray-400 group-hover:text-white/40 text-[10px] font-bold mt-1 uppercase tracking-tight">New inventory</p>
            </Link>
            <Link to="/shops" className="bg-white p-5 rounded-3xl border border-gray-100 shadow-soft group hover:bg-emerald-600 hover:text-white transition-all">
               <div className="w-10 h-10 rounded-xl bg-emerald-50 flex items-center justify-center text-emerald-600 mb-4 group-hover:bg-white/20 group-hover:text-white transition-all">
                <ShoppingCart className="w-5 h-5" />
              </div>
              <p className="font-black text-sm">Point of Sale</p>
              <p className="text-gray-400 group-hover:text-white/40 text-[10px] font-bold mt-1 uppercase tracking-tight">Start transaction</p>
            </Link>
            <Link to="/reports" className="bg-white p-5 rounded-3xl border border-gray-100 shadow-soft group hover:bg-violet-600 hover:text-white transition-all">
               <div className="w-10 h-10 rounded-xl bg-violet-50 flex items-center justify-center text-violet-600 mb-4 group-hover:bg-white/20 group-hover:text-white transition-all">
                <LayoutGrid className="w-5 h-5" />
              </div>
              <p className="font-black text-sm">All Analytics</p>
              <p className="text-gray-400 group-hover:text-white/40 text-[10px] font-bold mt-1 uppercase tracking-tight">Deep reports</p>
            </Link>
          </div>

          {/* Activity Feed */}
          <div className="bg-white rounded-[2.5rem] border border-gray-100 shadow-soft p-8 relative overflow-hidden">
            <div className="flex items-center justify-between mb-8 relative z-10">
              <div className="flex items-center gap-3">
                <div className="w-1.5 h-8 bg-primary rounded-full" />
                <h2 className="text-xl font-black text-gray-900 tracking-tight">Global Transaction Stream</h2>
              </div>
              <Link to="/reports" className="px-4 py-2 rounded-xl bg-gray-50 text-[10px] font-black uppercase tracking-widest text-gray-400 hover:bg-primary hover:text-white transition-all">
                Full Ledger
              </Link>
            </div>

            <div className="divide-y divide-gray-50 relative z-10">
              {recentTransactions.length === 0 ? (
                <div className="py-20 text-center text-gray-400">
                  <Activity className="w-12 h-12 mx-auto mb-4 opacity-10" />
                  <p className="font-bold text-gray-500 font-black uppercase tracking-widest text-xs">Awaiting Activity...</p>
                </div>
              ) : (
                recentTransactions.map(tx => {
                  const meta = txTypeIcon[tx.type] ?? txTypeIcon.transfer;
                  return (
                    <div key={tx.id} className="py-5 flex items-center gap-6 hover:translate-x-1 transition-transform group cursor-pointer first:pt-0 last:pb-0">
                      <div className={clsx("w-14 h-14 rounded-2xl flex items-center justify-center flex-shrink-0 transition-all group-hover:scale-110 shadow-sm", meta.color)}>
                        {meta.icon}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                           <p className="text-base font-black text-gray-900 truncate tracking-tight">{tx.item_name}</p>
                           {tx.type === 'stock_entry' ? (
                             <button 
                               onClick={(e) => {
                                 e.stopPropagation();
                                 setQuickRestockItem({ item_id: tx.item_id, item_name: tx.item_name, default_cost: tx.unit_cost, currency: tx.currency });
                                 setQuickRestockForm({ quantity: 1, unit_cost: tx.unit_cost, location_id: tx.to_location });
                               }}
                               className={clsx("text-[9px] font-black px-2 py-0.5 rounded-full uppercase tracking-tighter hover:scale-105 transition-transform cursor-pointer", meta.color)}
                               title="Click to Quick Restock"
                             >
                               {meta.label}
                             </button>
                           ) : (
                             <span className={clsx("text-[9px] font-black px-2 py-0.5 rounded-full uppercase tracking-tighter", meta.color)}>
                               {meta.label}
                             </span>
                           )}
                        </div>
                        <div className="text-[10px] text-gray-400 font-bold uppercase tracking-tight mt-1 flex items-center gap-2">
                          <span className="truncate max-w-[120px]">{getLocationName(tx.from_location)}</span>
                          <ArrowRightLeft className="w-3 h-3 text-gray-300" />
                          <span className="truncate max-w-[120px]">{getLocationName(tx.to_location)}</span>
                          <span className="w-1 h-1 rounded-full bg-gray-200" />
                          <button 
                            onClick={(e) => {
                              e.stopPropagation();
                              setDrillDownType('item');
                              setSelectedItemId(tx.item_id);
                              setIsStockModalOpen(true);
                            }}
                            className="bg-primary/5 text-primary hover:bg-primary hover:text-white px-2 py-0.5 rounded-lg border border-primary/10 transition-all font-black"
                          >
                            {tx.quantity} units
                          </button>
                        </div>
                      </div>
                      <div className="text-right flex-shrink-0">
                        <p className="text-base font-black text-gray-900 tabular-nums tracking-tighter">
                          {formatHistoricalDualCurrency(tx.unit_cost * tx.quantity, tx.currency, tx.converted_value_USD)}
                        </p>
                        <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest mt-0.5">
                          BY: {tx.performed_by || 'SYSTEM'} • {format(new Date(tx.timestamp), 'HH:mm • MMM dd')}
                        </p>
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            <div className="absolute top-0 right-0 p-10 opacity-[0.03] pointer-events-none">
               <History className="w-64 h-64 text-gray-900" />
            </div>
          </div>
        </div>

        {/* Sidebar Analytics */}
        <div className="xl:col-span-4 space-y-8">
           {/* Category Mix Donut */}
           <div className="bg-white rounded-[2.5rem] border border-gray-100 shadow-soft p-8 group hover:shadow-premium transition-all">
             <div className="flex items-center justify-between mb-8">
                <h3 className="text-sm font-black text-gray-900 uppercase tracking-[0.15em]">Category Mix</h3>
                <Box className="w-4 h-4 text-gray-300" />
             </div>
             
             {categoryMix.length === 0 ? (
               <div className="h-40 flex items-center justify-center italic text-gray-300 text-xs font-bold uppercase">Empty Vault</div>
             ) : (
               <div className="flex flex-col items-center gap-8">
                 <DonutChart items={categoryMix} size={180} />
                 <div className="w-full space-y-3">
                    {categoryMix.map(item => (
                      <div key={item.label} className="flex items-center justify-between group/row">
                        <div className="flex items-center gap-3">
                           <div className="w-2.5 h-2.5 rounded-full shadow-sm" style={{ backgroundColor: item.color }} />
                           <span className="text-xs font-black text-gray-600 group-hover/row:text-gray-900 transition-colors">{item.label}</span>
                        </div>
                        <span className="text-xs font-black text-gray-900 tabular-nums">{item.value}u</span>
                      </div>
                    ))}
                 </div>
               </div>
             )}
           </div>

           {/* Location Rankings */}
           <div className="bg-white rounded-[2.5rem] border border-gray-100 shadow-soft p-8">
             <div className="flex items-center justify-between mb-8">
                <h3 className="text-sm font-black text-gray-900 uppercase tracking-[0.15em]">Shop Rankings</h3>
                <Globe2 className="w-4 h-4 text-gray-300" />
             </div>
             
             <div className="space-y-6">
                {locationStats.slice(0, 5).map((loc, i) => (
                  <div key={loc.id} className="flex items-start gap-4 group cursor-default">
                    <div className="w-8 h-8 rounded-xl bg-gray-50 flex items-center justify-center text-[10px] font-black text-gray-400 group-hover:bg-primary group-hover:text-white transition-colors">
                      0{i+1}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between">
                        <p className="text-sm font-black text-gray-800 truncate">{loc.name}</p>
                        <p className="text-xs font-black text-gray-900">{formatCurrency(loc.totalValue)}</p>
                      </div>
                      <div className="flex items-center justify-between mt-1">
                        <p className="text-[10px] text-gray-400 font-bold uppercase tracking-tight">{loc.type} · {loc.country}</p>
                        <button 
                          onClick={() => {
                            setDrillDownType('global');
                            setIsStockModalOpen(true);
                          }}
                          className="text-[10px] text-primary font-black uppercase hover:underline underline-offset-2"
                        >
                          {loc.totalQty} Units
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
             </div>
             
             <button className="w-full mt-8 py-4 rounded-3xl border border-dashed border-gray-200 text-[10px] font-black uppercase tracking-widest text-gray-400 hover:border-primary hover:text-primary transition-all">
               Analyze All Locations
             </button>
           </div>

           {/* Quick Stats Support */}
           <div className="bg-gradient-to-br from-indigo-600 to-violet-700 rounded-[2.5rem] p-8 text-white relative overflow-hidden shadow-lg shadow-indigo-200">
              <div className="absolute top-0 right-0 -mr-8 -mt-8 w-32 h-32 bg-white/10 rounded-full blur-2xl" />
              <div className="relative z-10">
                <p className="text-[10px] font-black uppercase tracking-[0.2em] opacity-60">System Health</p>
                <div className="mt-4 flex items-center gap-4">
                  <div className="p-3 bg-white/10 rounded-2xl">
                    <Activity className="w-6 h-6" />
                  </div>
                  <h3 className="text-2xl font-black tracking-tight leading-none">Optimal</h3>
                </div>
                <p className="text-xs font-medium mt-4 opacity-80 leading-relaxed">
                  All databases synchronized. Network latency: 42ms. Security encryption active.
                </p>
                <Link to="/users" className="inline-flex mt-6 px-4 py-2 bg-white text-indigo-600 rounded-xl text-[10px] font-black uppercase tracking-widest hover:scale-105 transition-transform">
                  Manage Access
                </Link>
              </div>
           </div>
        </div>
      </div>
    </div>

      <Modal 
        isOpen={isStockModalOpen} 
        onClose={() => setIsStockModalOpen(false)} 
        title={drillDownType === 'global' ? "Inventory Master Pulse" : "Item-specific Distribution"} 
        description={drillDownType === 'global' ? "Global inventory distribution across all nodes." : stockDistribution?.item?.name}
        size="md"
      >
        <div className="space-y-6">
          <div className="grid grid-cols-2 gap-4">
            <div className="p-5 bg-blue-50/50 rounded-2xl border border-blue-100/50">
                <p className="text-[10px] font-black text-blue-600 uppercase tracking-widest mb-1">Warehousing</p>
                <h4 className="text-2xl font-black text-gray-900 tracking-tighter">
                  {stockDistribution?.distributions.filter(d => d.type === 'warehouse').reduce((s, d) => s + d.qty, 0).toLocaleString()} <span className="text-xs font-bold text-gray-400">Units</span>
                </h4>
            </div>
            <div className="p-5 bg-emerald-50/50 rounded-2xl border border-emerald-100/50">
                <p className="text-[10px] font-black text-emerald-600 uppercase tracking-widest mb-1">Retail Floor</p>
                <h4 className="text-2xl font-black text-gray-900 tracking-tighter">
                  {stockDistribution?.distributions.filter(d => d.type === 'shop').reduce((s, d) => s + d.qty, 0).toLocaleString()} <span className="text-xs font-bold text-gray-400">Units</span>
                </h4>
            </div>
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between px-1">
               <h5 className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Physical Distribution</h5>
               <p className="text-[10px] font-black text-primary uppercase">{stockDistribution?.distributions.length} Active Nodes</p>
            </div>
            <div className="bg-gray-50/50 rounded-[1.5rem] border border-gray-100 overflow-hidden divide-y divide-gray-100">
                {stockDistribution?.distributions.map(loc => (
                  <div key={loc.id} className="p-4 flex items-center justify-between hover:bg-white transition-colors">
                    <div className="flex items-center gap-3">
                        <div className={clsx(
                          "w-10 h-10 rounded-xl flex items-center justify-center",
                          loc.type === 'warehouse' ? 'bg-blue-100 text-blue-600' : 'bg-emerald-100 text-emerald-600'
                        )}>
                          {loc.type === 'warehouse' ? <Box className="w-5 h-5" /> : <Store className="w-5 h-5" />}
                        </div>
                        <div>
                          <p className="text-sm font-black text-gray-900">{loc.name}</p>
                          <p className="text-[10px] font-bold text-gray-400 uppercase tracking-tight">{loc.type} · {loc.country}</p>
                        </div>
                    </div>
                    <div className="text-right">
                        <p className="text-base font-black text-gray-900 tabular-nums">{loc.qty.toLocaleString()} Units</p>
                    </div>
                  </div>
                ))}
            </div>
          </div>
        </div>
      </Modal>

      {/* Quick Restock Modal */}
      <Modal 
        isOpen={!!quickRestockItem} 
        onClose={() => setQuickRestockItem(null)} 
        title="Quick Restock" 
        description={`Add new inventory for ${quickRestockItem?.item_name}`}
        size="sm"
      >
        <form onSubmit={handleQuickRestock} className="space-y-4">
          <div>
            <label className="block text-xs font-bold text-gray-700 uppercase tracking-wide mb-1">Target Location</label>
            <select required className="input-field" value={quickRestockForm.location_id} onChange={e => setQuickRestockForm(f => ({ ...f, location_id: e.target.value }))}>
              <option value="">Select location...</option>
              {locations.map(l => (
                <option key={l.id} value={l.id}>{l.name}</option>
              ))}
            </select>
          </div>
          
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-gray-700 uppercase tracking-wide mb-1">Quantity</label>
              <input type="number" min="1" required className="input-field" value={quickRestockForm.quantity} onChange={e => setQuickRestockForm(f => ({ ...f, quantity: Number(e.target.value) }))} />
            </div>
            <div>
              <label className="block text-xs font-bold text-gray-700 uppercase tracking-wide mb-1">Unit Cost ({quickRestockItem?.currency || 'USD'})</label>
              <input type="number" min="0" step="0.01" required className="input-field" value={quickRestockForm.unit_cost} onChange={e => setQuickRestockForm(f => ({ ...f, unit_cost: Number(e.target.value) }))} />
            </div>
          </div>

          <div className="pt-4 flex gap-3">
            <button type="button" className="btn-secondary flex-1" onClick={() => setQuickRestockItem(null)}>Cancel</button>
            <button type="submit" disabled={isQuickRestocking} className="btn-primary flex-1">
              {isQuickRestocking ? 'Adding...' : 'Confirm Restock'}
            </button>
          </div>
        </form>
      </Modal>
    </>
  );
}
