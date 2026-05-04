import { useMemo, useState } from 'react';
import { useStore, formatCurrency } from '../store';
import {
  TrendingUp, TrendingDown, AlertTriangle,
  BarChart2, CheckCircle2, Warehouse, Store,
  Search, Package, Eye, XCircle, ShoppingCart,
  ChevronDown, ChevronUp, MapPin
} from 'lucide-react';
import { subDays } from 'date-fns';
import clsx from 'clsx';
import Modal from '../components/Modal';

type StockStatus = 'healthy' | 'low_stock' | 'out_of_stock' | 'no_sales';
type StatusFilter = 'all' | StockStatus;
type SortField = 'name' | 'stock' | 'min_limit' | 'sold' | 'revenue';
type SortDir = 'asc' | 'desc';

export default function Insights() {
  const { inventory, items, sales, transactions, locations, brands } = useStore();
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [sortField, setSortField] = useState<SortField>('stock');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [showCount, setShowCount] = useState(20);
  const [categoryFilter, setCategoryFilter] = useState('');

  // ─── Stock distribution for modal ──────────────────────────────────────
  const stockDistribution = useMemo(() => {
    if (!selectedItemId) return null;
    const item = items.find(i => i.id === selectedItemId);
    const distributions = locations.map(loc => {
      const qty = inventory
        .filter(e => e.item_id === selectedItemId && e.location_id === loc.id)
        .reduce((sum, e) => sum + e.quantity, 0);
      return { ...loc, qty };
    }).filter(d => d.qty > 0);
    return { item, distributions };
  }, [selectedItemId, inventory, items, locations]);

  // ─── Core analysis ─────────────────────────────────────────────────────
  const analysis = useMemo(() => {
    const thirtyDaysAgo = subDays(new Date(), 30);

    // Sales per item (last 30 days)
    const salesMap: Record<string, { qty: number; revenue: number; profit: number; orders: number }> = {};
    sales.forEach(s => {
      if (new Date(s.timestamp) >= thirtyDaysAgo) {
        if (!salesMap[s.item_id]) salesMap[s.item_id] = { qty: 0, revenue: 0, profit: 0, orders: 0 };
        salesMap[s.item_id].qty += s.quantity;
        salesMap[s.item_id].revenue += s.converted_price_INR;
        salesMap[s.item_id].profit += s.profit_INR;
        salesMap[s.item_id].orders += 1;
      }
    });

    const itemList = items.map(item => {
      const totalQty = inventory
        .filter(e => e.item_id === item.id)
        .reduce((sum, e) => sum + e.quantity, 0);

      const minLimit = item.min_stock_limit ?? 10;
      const sale = salesMap[item.id] || { qty: 0, revenue: 0, profit: 0, orders: 0 };
      const brand = brands.find(b => b.id === item.brand_id);

      // ─── Status based on min_stock_limit ───
      let status: StockStatus;
      if (totalQty === 0) status = 'out_of_stock';
      else if (totalQty < minLimit) status = 'low_stock';
      else if (sale.qty === 0) status = 'no_sales';
      else status = 'healthy';

      const stockDiff = totalQty - minLimit;
      const stockPct = minLimit > 0 ? Math.round((totalQty / minLimit) * 100) : (totalQty > 0 ? 999 : 0);
      const locationCount = inventory.filter(e => e.item_id === item.id && e.quantity > 0).length;

      return {
        ...item,
        brandName: brand?.name || '—',
        totalQty,
        minLimit,
        stockDiff,
        stockPct,
        locationCount,
        soldLast30: sale.qty,
        revenue: sale.revenue,
        profit: sale.profit,
        orders: sale.orders,
        status,
      };
    });

    const totalRev = sales.reduce((s, sale) => s + sale.converted_price_INR, 0);
    const totalProfit = sales.reduce((s, sale) => s + sale.profit_INR, 0);
    const margin = totalRev > 0 ? (totalProfit / totalRev) * 100 : 0;
    const totalStock = itemList.reduce((s, i) => s + i.totalQty, 0);
    const totalSold = itemList.reduce((s, i) => s + i.soldLast30, 0);

    return { itemList, totalRev, totalProfit, margin, totalStock, totalSold };
  }, [inventory, items, sales, transactions, brands, locations]);

  // ─── Counts ────────────────────────────────────────────────────────────
  const counts = useMemo(() => ({
    healthy: analysis.itemList.filter(i => i.status === 'healthy').length,
    low: analysis.itemList.filter(i => i.status === 'low_stock').length,
    out: analysis.itemList.filter(i => i.status === 'out_of_stock').length,
    noSales: analysis.itemList.filter(i => i.status === 'no_sales').length,
  }), [analysis.itemList]);

  // ─── Categories ────────────────────────────────────────────────────────
  const categories = useMemo(() => {
    const cats = new Set(items.map(i => i.category).filter(Boolean));
    return Array.from(cats).sort();
  }, [items]);

  // ─── Filtered + sorted list ────────────────────────────────────────────
  const filteredItems = useMemo(() => {
    let list = analysis.itemList;
    if (statusFilter !== 'all') list = list.filter(i => i.status === statusFilter);
    if (categoryFilter) list = list.filter(i => i.category === categoryFilter);
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter(i =>
        i.name.toLowerCase().includes(q) || i.sku.toLowerCase().includes(q) ||
        i.brandName.toLowerCase().includes(q) || i.category.toLowerCase().includes(q)
      );
    }
    return [...list].sort((a, b) => {
      let cmp = 0;
      switch (sortField) {
        case 'name': cmp = a.name.localeCompare(b.name); break;
        case 'stock': cmp = a.totalQty - b.totalQty; break;
        case 'min_limit': cmp = a.stockDiff - b.stockDiff; break;
        case 'sold': cmp = a.soldLast30 - b.soldLast30; break;
        case 'revenue': cmp = a.revenue - b.revenue; break;
      }
      return sortDir === 'desc' ? -cmp : cmp;
    });
  }, [analysis.itemList, statusFilter, categoryFilter, searchQuery, sortField, sortDir]);

  const toggleSort = (field: SortField) => {
    if (sortField === field) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortField(field); setSortDir('desc'); }
  };

  const SortBtn = ({ field, children }: { field: SortField; children: React.ReactNode }) => (
    <button type="button" onClick={() => toggleSort(field)} className="flex items-center gap-1 hover:text-gray-600 transition-colors mx-auto">
      {children}
      {sortField === field
        ? (sortDir === 'desc' ? <ChevronDown className="w-3 h-3 text-primary" /> : <ChevronUp className="w-3 h-3 text-primary" />)
        : <ChevronDown className="w-3 h-3 text-gray-300" />}
    </button>
  );

  const STATUS = {
    healthy:      { label: 'GOOD STOCK',   color: 'text-emerald-600', bg: 'bg-emerald-50', border: 'border-emerald-200', icon: CheckCircle2 },
    low_stock:    { label: 'REFILL SOON',  color: 'text-red-600',     bg: 'bg-red-50',     border: 'border-red-200',     icon: AlertTriangle },
    out_of_stock: { label: 'OUT OF STOCK', color: 'text-gray-600',    bg: 'bg-gray-100',   border: 'border-gray-200',    icon: XCircle },
    no_sales:     { label: 'NOT SELLING',  color: 'text-amber-600',   bg: 'bg-amber-50',   border: 'border-amber-200',   icon: TrendingDown },
  };

  const lowStockItems = analysis.itemList.filter(i => i.status === 'low_stock').sort((a, b) => a.stockDiff - b.stockDiff).slice(0, 5);
  const topSellers = analysis.itemList.filter(i => i.soldLast30 > 0).sort((a, b) => b.soldLast30 - a.soldLast30).slice(0, 5);
  const mostProfitable = analysis.itemList.filter(i => i.profit > 0).sort((a, b) => b.profit - a.profit).slice(0, 5);
  const outOfStockItems = analysis.itemList.filter(i => i.status === 'out_of_stock');

  return (
    <>
      <div className="space-y-6 pb-10">
        {/* ─── Header ──────────────────────────────────────────────── */}
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 tracking-tight">Stock Overview</h1>
          <p className="text-gray-500 text-sm mt-1">Complete view of your inventory health, sales performance, and stock levels.</p>
        </div>

        {/* ─── Summary Cards ───────────────────────────────────────── */}
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
          <div className="bg-white rounded-xl border border-gray-100 p-4">
            <div className="flex items-center gap-2 mb-2">
              <Package className="w-4 h-4 text-blue-500" />
              <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Total Stock</span>
            </div>
            <p className="text-2xl font-bold text-gray-900">{analysis.totalStock.toLocaleString()}</p>
            <p className="text-[10px] text-gray-400 mt-0.5">{items.length} unique items</p>
          </div>

          <div className="bg-white rounded-xl border border-gray-100 p-4">
            <div className="flex items-center gap-2 mb-2">
              <ShoppingCart className="w-4 h-4 text-violet-500" />
              <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Sold (30 Days)</span>
            </div>
            <p className="text-2xl font-bold text-gray-900">{analysis.totalSold.toLocaleString()}</p>
            <p className="text-[10px] text-gray-400 mt-0.5">units sold recently</p>
          </div>

          <div className="bg-white rounded-xl border border-gray-100 p-4">
            <div className="flex items-center gap-2 mb-2">
              <BarChart2 className="w-4 h-4 text-emerald-500" />
              <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Revenue</span>
            </div>
            <p className="text-2xl font-bold text-gray-900">{formatCurrency(analysis.totalRev)}</p>
            <p className="text-[10px] text-emerald-600 mt-0.5 font-medium">
              Profit: {formatCurrency(analysis.totalProfit)} ({analysis.margin.toFixed(1)}%)
            </p>
          </div>

          <button type="button" onClick={() => setStatusFilter(f => f === 'healthy' ? 'all' : 'healthy')} className={clsx("text-left rounded-xl border p-4 transition-all", statusFilter === 'healthy' ? 'bg-emerald-50 border-emerald-200 ring-2 ring-emerald-200' : 'bg-white border-gray-100 hover:border-emerald-200')}>
            <div className="flex items-center gap-2 mb-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-500" />
              <span className="text-[10px] font-bold text-emerald-600 uppercase tracking-wider">Healthy</span>
            </div>
            <p className="text-2xl font-bold text-emerald-600">{counts.healthy}</p>
            <p className="text-[10px] text-gray-400 mt-0.5">above minimum level</p>
          </button>

          <button type="button" onClick={() => setStatusFilter(f => f === 'low_stock' ? 'all' : 'low_stock')} className={clsx("text-left rounded-xl border p-4 transition-all", statusFilter === 'low_stock' ? 'bg-red-50 border-red-200 ring-2 ring-red-200' : 'bg-white border-gray-100 hover:border-red-200')}>
            <div className="flex items-center gap-2 mb-2">
              <AlertTriangle className="w-4 h-4 text-red-500" />
              <span className="text-[10px] font-bold text-red-600 uppercase tracking-wider">Low Stock</span>
            </div>
            <p className="text-2xl font-bold text-red-500">{counts.low}</p>
            <p className="text-[10px] text-gray-400 mt-0.5">below minimum level</p>
          </button>
        </div>

        {/* ─── Highlight Cards ─────────────────────────────────────── */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Needs Restocking */}
          <div className="bg-white rounded-2xl border border-gray-100 p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-bold text-gray-900 flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-red-500" />
                Needs Restocking
              </h3>
              <span className="text-[10px] font-bold text-red-500 bg-red-50 px-2 py-0.5 rounded-md">{lowStockItems.length + outOfStockItems.length}</span>
            </div>
            {lowStockItems.length === 0 && outOfStockItems.length === 0 ? (
              <p className="text-sm text-gray-400 text-center py-6">All items are well stocked!</p>
            ) : (
              <div className="space-y-2">
                {lowStockItems.map(item => (
                  <div key={item.id} className="flex items-center gap-3 p-2.5 rounded-xl bg-red-50/50 cursor-pointer hover:bg-red-50 transition-colors" onClick={() => { setSelectedItemId(item.id); setIsModalOpen(true); }}>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-semibold text-gray-900 truncate">{item.name}</p>
                      <p className="text-[10px] text-red-500 font-medium">
                        {item.totalQty} in stock · needs {item.minLimit - item.totalQty} more
                      </p>
                    </div>
                    <p className="text-[10px] font-bold text-red-500 flex-shrink-0">{item.totalQty}/{item.minLimit}</p>
                  </div>
                ))}
                {outOfStockItems.slice(0, 2).map(item => (
                  <div key={item.id} className="flex items-center gap-3 p-2.5 rounded-xl bg-gray-50 cursor-pointer hover:bg-gray-100 transition-colors" onClick={() => { setSelectedItemId(item.id); setIsModalOpen(true); }}>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-semibold text-gray-900 truncate">{item.name}</p>
                      <p className="text-[10px] text-gray-500 font-medium">Completely out of stock</p>
                    </div>
                    <XCircle className="w-4 h-4 text-gray-400 flex-shrink-0" />
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Best Sellers */}
          <div className="bg-white rounded-2xl border border-gray-100 p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-bold text-gray-900 flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-emerald-500" />
                Best Sellers
              </h3>
              <span className="text-[10px] font-medium text-gray-400">Last 30 days</span>
            </div>
            {topSellers.length === 0 ? (
              <p className="text-sm text-gray-400 text-center py-6">No sales recorded yet.</p>
            ) : (
              <div className="space-y-2">
                {topSellers.map((item, idx) => (
                  <div key={item.id} className="flex items-center gap-3 p-2.5 rounded-xl hover:bg-gray-50 transition-colors">
                    <div className={clsx("w-7 h-7 rounded-lg flex items-center justify-center text-[10px] font-bold flex-shrink-0",
                      idx === 0 ? 'bg-emerald-100 text-emerald-700' : idx === 1 ? 'bg-blue-50 text-blue-600' : 'bg-gray-100 text-gray-500'
                    )}>
                      {idx + 1}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-semibold text-gray-900 truncate">{item.name}</p>
                      <p className="text-[10px] text-gray-400">{item.brandName}</p>
                    </div>
                    <p className="text-xs font-bold text-gray-900 flex-shrink-0">{item.soldLast30} sold</p>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Most Profitable */}
          <div className="bg-white rounded-2xl border border-gray-100 p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-bold text-gray-900 flex items-center gap-2">
                <BarChart2 className="w-4 h-4 text-violet-500" />
                Most Profitable
              </h3>
              <span className="text-[10px] font-medium text-gray-400">Last 30 days</span>
            </div>
            {mostProfitable.length === 0 ? (
              <p className="text-sm text-gray-400 text-center py-6">No profit data yet.</p>
            ) : (
              <div className="space-y-2">
                {mostProfitable.map((item, idx) => (
                  <div key={item.id} className="flex items-center gap-3 p-2.5 rounded-xl hover:bg-gray-50 transition-colors">
                    <div className={clsx("w-7 h-7 rounded-lg flex items-center justify-center text-[10px] font-bold flex-shrink-0",
                      idx === 0 ? 'bg-violet-100 text-violet-700' : 'bg-gray-100 text-gray-500'
                    )}>
                      {idx + 1}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-semibold text-gray-900 truncate">{item.name}</p>
                      <p className="text-[10px] text-gray-400">{item.orders} orders</p>
                    </div>
                    <p className="text-xs font-bold text-emerald-600 flex-shrink-0">{formatCurrency(item.profit)}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* ─── Full Stock Table ────────────────────────────────────── */}
        <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
          <div className="p-4 sm:p-5 border-b border-gray-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <h2 className="text-sm font-bold text-gray-900">All Items</h2>
            <div className="flex items-center gap-2 flex-wrap">
              {([
                { id: 'all' as StatusFilter, label: 'All', count: items.length },
                { id: 'healthy' as StatusFilter, label: 'Healthy', count: counts.healthy },
                { id: 'low_stock' as StatusFilter, label: 'Low Stock', count: counts.low },
                { id: 'out_of_stock' as StatusFilter, label: 'Out of Stock', count: counts.out },
                { id: 'no_sales' as StatusFilter, label: 'No Sales', count: counts.noSales },
              ]).map(f => (
                <button key={f.id} type="button" onClick={() => setStatusFilter(f.id)}
                  className={clsx("text-[10px] font-semibold px-2.5 py-1.5 rounded-lg transition-all flex items-center gap-1", statusFilter === f.id ? 'bg-primary text-white shadow-sm' : 'text-gray-400 bg-gray-50 hover:bg-gray-100 hover:text-gray-600')}>
                  {f.label}
                  <span className={clsx("text-[9px] px-1 rounded", statusFilter === f.id ? 'bg-white/20' : 'bg-gray-200/50')}>{f.count}</span>
                </button>
              ))}

              <select title="Filter by category" value={categoryFilter} onChange={e => setCategoryFilter(e.target.value)}
                className="text-[10px] font-semibold px-2.5 py-1.5 rounded-lg bg-gray-50 border border-gray-200 text-gray-600 focus:ring-2 focus:ring-primary/20 outline-none">
                <option value="">All Categories</option>
                {categories.map(c => <option key={c} value={c}>{c}</option>)}
              </select>

              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
                <input type="text" value={searchQuery} onChange={e => setSearchQuery(e.target.value)} placeholder="Search items..."
                  className="pl-8 pr-3 py-1.5 text-xs bg-gray-50 border border-gray-200 rounded-lg focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none w-[140px] sm:w-[170px]" />
              </div>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-gray-50/80 border-b border-gray-100">
                  <th className="text-left px-4 sm:px-5 py-3 text-[10px] font-bold text-gray-400 uppercase tracking-wider">
                    <SortBtn field="name">Item</SortBtn>
                  </th>
                  <th className="text-center px-3 py-3 text-[10px] font-bold text-gray-400 uppercase tracking-wider">
                    <SortBtn field="stock">In Stock</SortBtn>
                  </th>
                  <th className="text-center px-3 py-3 text-[10px] font-bold text-gray-400 uppercase tracking-wider">
                    <SortBtn field="min_limit">Min Required</SortBtn>
                  </th>
                  <th className="text-center px-3 py-3 text-[10px] font-bold text-gray-400 uppercase tracking-wider hidden sm:table-cell">
                    Stock Level
                  </th>
                  <th className="text-center px-3 py-3 text-[10px] font-bold text-gray-400 uppercase tracking-wider">Status</th>
                  <th className="text-center px-3 py-3 text-[10px] font-bold text-gray-400 uppercase tracking-wider hidden lg:table-cell">
                    <SortBtn field="sold">Sold (30d)</SortBtn>
                  </th>
                  <th className="text-center px-3 py-3 text-[10px] font-bold text-gray-400 uppercase tracking-wider hidden lg:table-cell">
                    <SortBtn field="revenue">Revenue</SortBtn>
                  </th>
                  <th className="w-10 px-3 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {filteredItems.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="py-16 text-center">
                      <Package className="w-8 h-8 text-gray-200 mx-auto mb-2" />
                      <p className="text-sm text-gray-400">{searchQuery ? `No items matching "${searchQuery}"` : 'No items in this category.'}</p>
                      {(searchQuery || statusFilter !== 'all' || categoryFilter) && (
                        <button type="button" onClick={() => { setSearchQuery(''); setStatusFilter('all'); setCategoryFilter(''); }} className="mt-2 text-xs text-primary font-semibold hover:underline">Clear all filters</button>
                      )}
                    </td>
                  </tr>
                ) : filteredItems.slice(0, showCount).map(item => {
                  const cfg = STATUS[item.status];
                  const StatusIcon = cfg.icon;
                  const barPct = item.minLimit > 0 ? Math.min((item.totalQty / item.minLimit) * 100, 200) : 0;
                  const barColor = item.totalQty === 0 ? 'bg-gray-300' : item.totalQty < item.minLimit ? 'bg-red-500' : 'bg-emerald-500';

                  return (
                    <tr key={item.id} className="hover:bg-gray-50/50 transition-colors group">
                      <td className="px-4 sm:px-5 py-3.5">
                        <p className="text-sm font-semibold text-gray-900 truncate max-w-[200px]">{item.name}</p>
                        <p className="text-[10px] text-gray-400 mt-0.5">{item.brandName} · {item.sku} · {item.category}</p>
                      </td>
                      <td className="px-3 py-3.5 text-center">
                        <button type="button" onClick={() => { setSelectedItemId(item.id); setIsModalOpen(true); }}
                          className={clsx("text-sm font-bold tabular-nums hover:text-primary hover:underline underline-offset-4 transition-colors",
                            item.totalQty === 0 ? 'text-gray-300' : item.totalQty < item.minLimit ? 'text-red-600' : 'text-gray-900')}>
                          {item.totalQty.toLocaleString()}
                        </button>
                        {item.locationCount > 0 && (
                          <p className="text-[9px] text-gray-400 flex items-center justify-center gap-0.5 mt-0.5">
                            <MapPin className="w-2.5 h-2.5" />{item.locationCount} {item.locationCount === 1 ? 'location' : 'locations'}
                          </p>
                        )}
                      </td>
                      <td className="px-3 py-3.5 text-center">
                        <span className="text-sm font-medium text-gray-500 tabular-nums">{item.minLimit}</span>
                      </td>
                      <td className="px-3 py-3.5 hidden sm:table-cell">
                        <div className="w-full max-w-[120px] mx-auto">
                          <div className="w-full bg-gray-100 h-2 rounded-full overflow-hidden">
                            <div className={clsx("h-full rounded-full transition-all duration-500", barColor)} style={{ width: `${Math.min(barPct, 100)}%` }} />
                          </div>
                          <p className="text-[9px] text-gray-400 mt-1 text-center tabular-nums">
                            {item.stockPct > 200 ? '200%+' : `${item.stockPct}%`} of minimum
                          </p>
                        </div>
                      </td>
                      <td className="px-3 py-3.5 text-center">
                        <span className={clsx("inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-1 rounded-lg border", cfg.bg, cfg.color, cfg.border)}>
                          <StatusIcon className="w-3 h-3" />
                          {cfg.label}
                        </span>
                      </td>
                      <td className="px-3 py-3.5 text-center hidden lg:table-cell">
                        <span className={clsx("text-sm font-semibold tabular-nums", item.soldLast30 > 0 ? 'text-gray-900' : 'text-gray-300')}>
                          {item.soldLast30 > 0 ? item.soldLast30.toLocaleString() : '—'}
                        </span>
                      </td>
                      <td className="px-3 py-3.5 text-center hidden lg:table-cell">
                        {item.revenue > 0 ? (
                          <div>
                            <p className="text-xs font-semibold text-gray-900">{formatCurrency(item.revenue)}</p>
                            <p className={clsx("text-[10px] font-medium", item.profit >= 0 ? 'text-emerald-600' : 'text-red-500')}>
                              {item.profit >= 0 ? '+' : ''}{formatCurrency(item.profit)}
                            </p>
                          </div>
                        ) : <span className="text-xs text-gray-300">—</span>}
                      </td>
                      <td className="px-3 py-3.5 text-center">
                        <button type="button" onClick={() => { setSelectedItemId(item.id); setIsModalOpen(true); }}
                          className="p-1.5 rounded-lg text-gray-300 hover:text-primary hover:bg-primary/5 opacity-0 group-hover:opacity-100 transition-all" title="See where this item is stored">
                          <Eye className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="p-4 border-t border-gray-100 flex items-center justify-between">
            <p className="text-xs text-gray-400">Showing {Math.min(showCount, filteredItems.length)} of {filteredItems.length} items</p>
            {showCount < filteredItems.length && (
              <button type="button" onClick={() => setShowCount(c => c + 20)} className="text-xs font-semibold text-primary hover:underline">Show more</button>
            )}
          </div>
        </div>
      </div>

      {/* ─── Stock Location Modal ──────────────────────────────────── */}
      <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} title="Stock Location Details" description={stockDistribution?.item?.name} size="md">
        {stockDistribution && (
          <div className="space-y-5">
            <div className="grid grid-cols-3 gap-3">
              <div className="p-3.5 bg-blue-50/50 rounded-xl border border-blue-100/50">
                <p className="text-[10px] font-bold text-blue-600 uppercase tracking-wider mb-1">Total Stock</p>
                <p className="text-xl font-bold text-gray-900">{stockDistribution.distributions.reduce((s, d) => s + d.qty, 0).toLocaleString()}</p>
              </div>
              <div className="p-3.5 bg-emerald-50/50 rounded-xl border border-emerald-100/50">
                <p className="text-[10px] font-bold text-emerald-600 uppercase tracking-wider mb-1">Min Required</p>
                <p className="text-xl font-bold text-gray-900">{stockDistribution.item?.min_stock_limit ?? 10}</p>
              </div>
              <div className="p-3.5 bg-violet-50/50 rounded-xl border border-violet-100/50">
                <p className="text-[10px] font-bold text-violet-600 uppercase tracking-wider mb-1">Locations</p>
                <p className="text-xl font-bold text-gray-900">{stockDistribution.distributions.length}</p>
              </div>
            </div>

            {(() => {
              const totalQ = stockDistribution.distributions.reduce((s, d) => s + d.qty, 0);
              const minL = stockDistribution.item?.min_stock_limit ?? 10;
              const isLow = totalQ < minL;
              const isOut = totalQ === 0;
              return (
                <div className={clsx("p-3 rounded-xl border flex items-center gap-2", isOut ? 'bg-gray-100 border-gray-200' : isLow ? 'bg-red-50 border-red-200' : 'bg-emerald-50 border-emerald-200')}>
                  {isOut ? <XCircle className="w-4 h-4 text-gray-500" /> : isLow ? <AlertTriangle className="w-4 h-4 text-red-500" /> : <CheckCircle2 className="w-4 h-4 text-emerald-500" />}
                  <span className={clsx("text-xs font-semibold", isOut ? 'text-gray-600' : isLow ? 'text-red-600' : 'text-emerald-600')}>
                    {isOut ? 'This item is out of stock everywhere' : isLow ? `Low stock — need ${minL - totalQ} more units to reach minimum level` : `Stock is healthy — ${totalQ - minL} units above minimum level`}
                  </span>
                </div>
              );
            })()}

            <div className="space-y-2">
              <h5 className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Available At</h5>
              <div className="bg-gray-50 rounded-xl border border-gray-100 overflow-hidden divide-y divide-gray-100">
                {stockDistribution.distributions.map(loc => (
                  <div key={loc.id} className="p-3.5 flex items-center justify-between hover:bg-white transition-colors">
                    <div className="flex items-center gap-3">
                      <div className={clsx("w-9 h-9 rounded-lg flex items-center justify-center", loc.type === 'warehouse' ? 'bg-blue-100 text-blue-600' : 'bg-emerald-100 text-emerald-600')}>
                        {loc.type === 'warehouse' ? <Warehouse className="w-4 h-4" /> : <Store className="w-4 h-4" />}
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-gray-900">{loc.name}</p>
                        <p className="text-[10px] font-medium text-gray-400 capitalize">{loc.type} · {loc.country}</p>
                      </div>
                    </div>
                    <p className="text-sm font-bold text-gray-900 tabular-nums">{loc.qty.toLocaleString()} units</p>
                  </div>
                ))}
                {stockDistribution.distributions.length === 0 && (
                  <div className="p-8 text-center">
                    <XCircle className="w-6 h-6 text-gray-300 mx-auto mb-2" />
                    <p className="text-xs text-gray-400">Not available at any location.</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </Modal>
    </>
  );
}
