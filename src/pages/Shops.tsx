import { useState, useMemo } from 'react';
import { ShoppingCart, TrendingUp, Search, Store, AlertTriangle, Globe, ChevronRight, Activity } from 'lucide-react';
import { Link } from 'react-router-dom';
import Modal from '../components/Modal';
import { useStore, CURRENCIES, formatCurrency, formatDualCurrency, toINR, type InventoryEntry, type Item, type Location } from '../store';
import { useAuthStore } from '../store/authStore';
import { format } from 'date-fns';
import clsx from 'clsx';

type ShopRow = InventoryEntry & { item: Item; loc: Location; isLow: boolean };

export default function Shops() {
  const { appUser } = useAuthStore();
  const { locations, items, inventory, sales, recordSale } = useStore();

  const shops = locations.filter(l => l.type === 'shop');
  const [filterShop, setFilterShop] = useState('');
  const [search, setSearch] = useState('');
  const [saleModal, setSaleModal] = useState(false);
  const [saving, setSaving] = useState(false);

  const [saleForm, setSaleForm] = useState({
    location_id: '',
    item_id: '',
    quantity: 1,
    selling_price: 0,
    currency: 'INR',
  });

  const shopInventoryRows = useMemo((): ShopRow[] => {
    const shopIds = (filterShop ? [filterShop] : shops.map(s => s.id));
    const rows: ShopRow[] = [];
    for (const entry of inventory) {
      if (!shopIds.includes(entry.location_id)) continue;
      const item = items.find(i => i.id === entry.item_id);
      const loc = locations.find(l => l.id === entry.location_id);
      if (!item || !loc) continue;
      const q = search.toLowerCase();
      if (q && !item.name.toLowerCase().includes(q) && !loc.name.toLowerCase().includes(q)) continue;
      rows.push({ ...entry, item, loc, isLow: entry.quantity < (item.min_stock_limit ?? 10) });
    }
    return rows;
  }, [inventory, items, locations, shops, filterShop, search]);

  // Sales stats
  const now = new Date();
  const startOfDay = new Date(new Date().setHours(0,0,0,0)).toISOString();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();

  const daySales = sales.filter(s => s.timestamp >= startOfDay);
  const monthSales = sales.filter(s => s.timestamp >= startOfMonth);

  const monthProfit = monthSales.reduce((s, x) => s + x.profit_INR, 0);
  const dayRevenue = daySales.reduce((s, x) => s + x.converted_price_INR, 0);
  const filteredSales = filterShop
    ? sales.filter(s => s.location_id === filterShop)
    : sales;

  const selectedItem = items.find(i => i.id === saleForm.item_id);
  const availableQty = saleForm.location_id && saleForm.item_id
    ? inventory.find(e => e.location_id === saleForm.location_id && e.item_id === saleForm.item_id)?.quantity ?? 0
    : 0;
  const estimatedProfit = selectedItem && saleForm.selling_price > 0
    ? toINR(saleForm.selling_price * saleForm.quantity, saleForm.currency) -
      (inventory.find(e => e.location_id === saleForm.location_id && e.item_id === saleForm.item_id)?.avg_cost_INR ?? 0) * saleForm.quantity
    : 0;

  const handleRecordSale = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedItem) return;
    setSaving(true);
    try {
      await recordSale({
        ...saleForm,
        item_name: selectedItem.name,
        sold_by: appUser?.name ?? 'Staff',
      });
      setSaleModal(false);
      setSaleForm({ location_id: '', item_id: '', quantity: 1, selling_price: 0, currency: 'INR' });
    } catch (err: any) {
      alert(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6 lg:space-y-8 animate-in fade-in duration-500">
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-gray-900 tracking-tight flex items-center gap-3">
             <div className="p-2 sm:p-2.5 bg-primary/10 rounded-xl text-primary flex-shrink-0">
               <Store className="w-5 h-5 sm:w-6 sm:h-6" />
            </div>
            Retail Front
          </h1>
          <p className="text-xs sm:text-sm text-gray-400 font-bold uppercase tracking-widest mt-2 ml-12 sm:ml-14 border-l-2 border-gray-100 pl-4 uppercase tracking-tighter">
            Manage shop-side inventory and retail conversions.
          </p>
        </div>
        <div className="flex flex-col sm:flex-row gap-2.5 sm:items-center ml-12 sm:ml-0">
          <Link to="/manage-shops" className="btn-secondary flex items-center gap-2.5 text-sm justify-center h-11 px-5 shadow-sm">
            <Globe className="w-4 h-4" /> 
            <span className="font-black uppercase tracking-widest text-[10px]">Manage Profiles</span>
          </Link>
          <button onClick={() => setSaleModal(true)} className="btn-primary flex items-center gap-2.5 text-sm justify-center shadow-xl shadow-primary/20 h-11 px-6">
            <ShoppingCart className="w-4 h-4" /> 
            <span className="font-black uppercase tracking-widest text-[10px]">Record Sale</span>
          </button>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="responsive-grid">
        <div className="card border-0 shadow-lg shadow-gray-50 bg-gradient-to-br from-white to-gray-50/50 p-6 flex flex-col justify-between">
          <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-4">Daily Velocity</p>
          <div>
            <p className="text-3xl font-black text-gray-900 tracking-tighter tabular-nums">{formatCurrency(dayRevenue)}</p>
            <div className="flex items-center gap-1.5 mt-2">
              <span className="px-1.5 py-0.5 rounded-md bg-emerald-50 text-emerald-600 font-black text-[9px] uppercase tracking-tighter">
                {daySales.length} Units
              </span>
              <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest">Target Window</p>
            </div>
          </div>
        </div>
        <div className="card border-0 shadow-lg shadow-gray-50 bg-gradient-to-br from-white to-gray-50/50 p-6 flex flex-col justify-between">
          <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-4">Gross Net (Mo)</p>
          <div>
            <p className="text-3xl font-black text-gray-900 tracking-tighter tabular-nums">{formatCurrency(monthProfit)}</p>
            <div className="flex items-center gap-1.5 mt-2">
              <div className="w-4 h-4 rounded-full bg-blue-100 flex items-center justify-center text-blue-600">
                <Activity className="w-2.5 h-2.5" />
              </div>
              <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest">Monthly Commitment</p>
            </div>
          </div>
        </div>
        <div className="card border-0 shadow-lg shadow-gray-50 bg-gradient-to-br from-white to-gray-200/20 p-6 flex flex-col justify-between sm:col-span-2 lg:col-span-1">
          <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-4">System Profit</p>
          <div>
            <p className="text-3xl font-black text-emerald-600 tracking-tighter tabular-nums">{formatCurrency(sales.reduce((s, x) => s + x.profit_INR, 0))}</p>
            <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest mt-2 uppercase tracking-tighter">Historical Accumulation</p>
          </div>
        </div>
        <div className="card border-0 shadow-lg shadow-gray-50 bg-gradient-to-br from-white to-gray-50/50 p-6 flex flex-col justify-between hidden lg:flex">
          <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-4">Network Scale</p>
          <div>
            <p className="text-3xl font-black text-gray-900 tracking-tighter tabular-nums">{shops.length} Nodes</p>
            <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest mt-2">Retail Nodes Active</p>
          </div>
        </div>
      </div>

      {/* Control Strip */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-4 bg-white p-3 rounded-2xl border border-gray-100 shadow-sm">
        <div className="relative flex-1">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Query node objects…" className="w-full pl-11 pr-4 py-2.5 bg-gray-50 border-0 rounded-xl text-sm focus:ring-2 focus:ring-primary/20 transition-all font-medium" />
        </div>
        <div className="flex h-full">
           <select title="Filter by Shop" value={filterShop} onChange={e => setFilterShop(e.target.value)} className="w-full sm:w-64 px-4 py-2.5 bg-white border border-gray-100 rounded-xl text-sm font-bold shadow-sm focus:ring-2 focus:ring-primary/20 outline-none">
            <option value="">Global Unified View</option>
            {shops.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </div>
      </div>

       <div className="grid grid-cols-1 xl:grid-cols-3 gap-6 lg:gap-8">
         {/* Shop Inventory Table */}
         <div className="xl:col-span-2 space-y-4">
            <div className="flex items-center justify-between px-2">
             <h2 className="text-base font-extrabold text-gray-900 flex items-center gap-2.5">
                <div className="w-1.5 h-1.5 rounded-full bg-primary" />
                Node Object Mapping
             </h2>
             <p className="text-[10px] font-black uppercase tracking-widest text-gray-300">{shopInventoryRows.length} Vectors Identified</p>
           </div>
           
           {/* Desktop Table View */}
           <div className="table-container hidden lg:block">
             <div className="overflow-x-auto">
               <table className="w-full text-sm text-left min-w-[600px]">
                 <thead className="bg-gray-50 text-[10px] uppercase text-gray-400 font-black tracking-widest">
                   <tr>
                     <th className="px-6 py-4">Descriptor</th>
                     <th className="px-6 py-4">Node Anchor</th>
                     <th className="px-6 py-4 text-right">Commitment</th>
                     <th className="px-6 py-4 text-right">Landed Cost</th>
                     <th className="px-6 py-4 text-center">Status Vane</th>
                   </tr>
                 </thead>
                 <tbody className="divide-y divide-gray-50 bg-white">
                   {shopInventoryRows.length === 0 ? (
                     <tr><td colSpan={5} className="px-6 py-20 text-center flex flex-col items-center">
                       <div className="w-16 h-16 bg-gray-50 rounded-full flex items-center justify-center mb-4">
                         <Store className="w-8 h-8 opacity-10" />
                       </div>
                       <p className="font-extrabold text-gray-700 tracking-tight">Node Buffer Empty</p>
                       <p className="text-[10px] text-gray-400 mt-1 uppercase tracking-tighter">Move objects from secondary nodes via Transfers.</p>
                     </td></tr>
                   ) : shopInventoryRows.map(r => (
                     <tr key={r.id} className={clsx("hover:bg-gray-50/50 transition-colors group", r.isLow && 'bg-red-50/20')}>
                       <td className="px-6 py-4">
                         <p className="text-base font-extrabold text-gray-900 group-hover:text-primary transition-colors tracking-tight">{r.item.name}</p>
                         <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest mt-1">{r.item.category} · {r.item.sku}</p>
                       </td>
                       <td className="px-6 py-4">
                         <div className="flex items-center gap-2">
                            <div className="w-2.5 h-2.5 rounded-full bg-gray-200" />
                            <span className="text-sm font-bold text-gray-600">{r.loc.name}</span>
                         </div>
                       </td>
                       <td className="px-6 py-4 text-right font-black text-gray-900 text-lg tracking-tighter tabular-nums">{r.quantity}</td>
                       <td className="px-6 py-4 text-right tabular-nums text-gray-500 font-bold">{formatCurrency(r.avg_cost_INR)}</td>
                       <td className="px-6 py-4 text-center">
                         {r.isLow
                           ? <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest bg-red-50 text-red-600 border border-red-100"><AlertTriangle className="w-3 h-3" /> Critical</span>
                           : <span className="px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest bg-emerald-50 text-emerald-600 border border-emerald-100">Synchronized</span>
                         }
                       </td>
                     </tr>
                   ))}
                 </tbody>
               </table>
             </div>
           </div>

           {/* Mobile & Tablet Card View */}
           <div className="lg:hidden p-4 sm:p-5">
             {shopInventoryRows.length === 0 ? (
               <div className="text-center py-12 flex flex-col items-center">
                 <div className="w-16 h-16 bg-gray-50 rounded-full flex items-center justify-center mb-4">
                   <Store className="w-8 h-8 opacity-10" />
                 </div>
                 <p className="font-extrabold text-gray-700 tracking-tight">Node Buffer Empty</p>
                 <p className="text-[10px] text-gray-400 mt-1 uppercase tracking-tighter">Move objects from secondary nodes via Transfers.</p>
               </div>
             ) : (
               <div className="space-y-3">
                 {shopInventoryRows.map(r => (
                   <div key={r.id} className={clsx("bg-white rounded-xl border border-gray-200 p-4 shadow-sm hover:shadow-md transition-all", r.isLow && 'border-red-200 bg-red-50/30')}>
                     <div className="flex justify-between items-start gap-2 mb-3">
                       <div className="flex-1 min-w-0">
                         <h3 className="font-bold text-gray-900 text-sm">{r.item.name}</h3>
                         <p className="text-xs text-gray-500 mt-1 font-mono">{r.item.sku}</p>
                       </div>
                     </div>

                     <div className="grid grid-cols-2 gap-2 mb-3">
                       <div className="bg-blue-50 rounded-lg p-3 border border-blue-100">
                         <p className="text-[9px] uppercase font-bold text-blue-600 tracking-wider">Qty</p>
                         <p className="text-sm font-black text-blue-900 mt-1 tabular-nums">{r.quantity}</p>
                       </div>
                       <div className="bg-emerald-50 rounded-lg p-3 border border-emerald-100">
                         <p className="text-[9px] uppercase font-bold text-emerald-600 tracking-wider">Cost</p>
                         <p className="text-sm font-black text-emerald-900 mt-1">{formatCurrency(r.avg_cost_INR)}</p>
                       </div>
                     </div>

                     <div className="bg-gray-50 rounded-lg p-3 border border-gray-100 mb-3">
                       <p className="text-[9px] uppercase font-bold text-gray-600 tracking-wider">Shop</p>
                       <p className="text-xs font-bold text-gray-900 mt-1">{r.loc.name}</p>
                     </div>

                     <div className="bg-gray-50 rounded-lg p-3 border border-gray-100 mb-3">
                       <p className="text-[9px] uppercase font-bold text-gray-600 tracking-wider">Category</p>
                       <p className="text-xs font-bold text-gray-900 mt-1">{r.item.category}</p>
                     </div>

                     <div className="flex items-center justify-center">
                       {r.isLow
                         ? <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest bg-red-50 text-red-600 border border-red-100"><AlertTriangle className="w-3 h-3" /> Critical</span>
                         : <span className="px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest bg-emerald-50 text-emerald-600 border border-emerald-100">Synchronized</span>
                       }
                     </div>
                   </div>
                 ))}
               </div>
             )}
           </div>
         </div>

        {/* Recent Sales Column */}
        <div className="space-y-4">
          <div className="flex items-center justify-between px-2">
            <h2 className="text-base font-extrabold text-gray-900 flex items-center gap-2.5">
               <div className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
               Latest Conversions
            </h2>
            <TrendingUp className="w-4 h-4 text-gray-200" />
          </div>
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden divide-y divide-gray-50">
            {filteredSales.length === 0 ? (
              <div className="p-12 text-center">
                <ShoppingCart className="w-10 h-10 mx-auto mb-3 opacity-10" />
                <p className="text-[11px] font-bold text-gray-400 uppercase tracking-widest">No terminal transactions</p>
              </div>
            ) : (
              filteredSales.slice(0, 10).map(sale => (
                <div key={sale.id} className="p-5 hover:bg-gray-50 transition-all group cursor-default">
                  <div className="flex items-start justify-between gap-4 mb-3">
                    <div className="min-w-0">
                      <p className="text-[13px] font-black text-gray-900 group-hover:text-primary transition-colors truncate tracking-tight">{sale.item_name}</p>
                      <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest mt-1 flex items-center gap-1.5 truncate">
                        {locations.find(l => l.id === sale.location_id)?.name ?? sale.location_id}
                        <ChevronRight className="w-2.5 h-2.5 opacity-30" />
                        <span className="text-primary">{sale.quantity}u</span>
                      </p>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <p className="text-sm font-black text-gray-900 tracking-tighter">{formatDualCurrency(sale.selling_price * sale.quantity, sale.currency)}</p>
                      <p className={clsx(
                        "text-[10px] font-black uppercase mt-1 tracking-tighter",
                        sale.profit_INR >= 0 ? 'text-emerald-500' : 'text-red-500'
                      )}>
                        {sale.profit_INR >= 0 ? '+' : ''}{formatCurrency(sale.profit_INR)}
                      </p>
                    </div>
                  </div>
                  <p className="text-[10px] text-gray-300 font-bold uppercase tracking-tighter tabular-nums">{format(new Date(sale.timestamp), 'MMM dd, HH:mm')}</p>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      <Modal isOpen={saleModal} onClose={() => setSaleModal(false)} title="Terminal Conversion" description="Finalize a retail sale event at a shop node." size="md">
        <form onSubmit={handleRecordSale} className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <div className="md:col-span-2">
              <label className="label">Node Anchor</label>
              <select title="Select Shop Location" required className="input-field h-12 bg-white font-bold" value={saleForm.location_id} 
                onChange={e => setSaleForm(f => ({ ...f, location_id: e.target.value, item_id: '' }))}>
                <option value="">Identify anchor node…</option>
                {shops.map(s => <option key={s.id} value={s.id}>{s.name} ({s.country})</option>)}
              </select>
            </div>
            <div className="md:col-span-2">
              <label className="label">Object Identification</label>
              <select title="Select Item" required className="input-field h-12 bg-white font-bold" 
                value={saleForm.item_id} 
                onChange={e => {
                  const item = items.find(i => i.id === e.target.value);
                  setSaleForm(f => ({ 
                    ...f, 
                    item_id: e.target.value, 
                    quantity: 1, 
                    selling_price: item?.retail_price || 0 
                  }));
                }}
                disabled={!saleForm.location_id}>
                <option value="">Scan object…</option>
                {inventory
                  .filter(e => e.location_id === saleForm.location_id && e.quantity > 0)
                  .map(e => {
                    const item = items.find(i => i.id === e.item_id);
                    return item ? <option key={e.item_id} value={e.item_id}>{item.name} ({e.quantity} Available)</option> : null;
                  })}
              </select>
            </div>
            
            <div className="grid grid-cols-1 sm:grid-cols-3 md:col-span-2 gap-5">
              <div>
                <label className="label">Units</label>
                <input title="Quantity" placeholder="0" required type="number" min={1} max={availableQty} className="input-field h-12 text-lg font-black" value={saleForm.quantity || ''} onChange={e => setSaleForm(f => ({ ...f, quantity: Number(e.target.value) }))} />
              </div>
              <div className="sm:col-span-2">
                <label className="label">Retail (Unit)</label>
                <div className="flex gap-2">
                  <input title="Selling Price" placeholder="0.00" required type="number" min={0} step="0.01" className="flex-1 input-field h-12 text-lg font-black" value={saleForm.selling_price || ''} onChange={e => setSaleForm(f => ({ ...f, selling_price: Number(e.target.value) }))} />
                  <select title="Currency" className="w-24 input-field h-12 bg-white font-bold" value={saleForm.currency} onChange={e => setSaleForm(f => ({ ...f, currency: e.target.value }))}>
                    {CURRENCIES.map(c => <option key={c}>{c}</option>)}
                  </select>
                </div>
              </div>
            </div>
          </div>

          {saleForm.selling_price > 0 && selectedItem && (
            <div className={clsx(
              "rounded-2xl p-5 border shadow-inner flex items-center justify-between",
              estimatedProfit >= 0 ? 'bg-emerald-50 border-emerald-100 text-emerald-700' : 'bg-red-50 border-red-100 text-red-700'
            )}>
              <div className="space-y-1">
                <p className="text-[10px] font-black uppercase tracking-widest opacity-60">Estimated Yield</p>
                <p className="text-2xl font-black tracking-tight">{formatCurrency(estimatedProfit)}</p>
              </div>
              <div className="text-right">
                <p className="text-[10px] font-black uppercase tracking-widest opacity-60">Revenue Flow</p>
                <p className="text-lg font-bold">{formatDualCurrency(saleForm.selling_price * saleForm.quantity, saleForm.currency)}</p>
              </div>
            </div>
          )}

          <div className="flex flex-col-reverse sm:flex-row justify-end gap-3 pt-6 border-t border-gray-100">
            <button type="button" className="btn-secondary h-12 px-6 font-bold" onClick={() => setSaleModal(false)}>Abort Event</button>
            <button type="submit" className="btn-primary h-12 px-10 font-black uppercase tracking-widest text-xs shadow-xl shadow-primary/20" disabled={saving || !selectedItem}>
              {saving ? 'Processing Vector…' : 'Finalize Sale'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
