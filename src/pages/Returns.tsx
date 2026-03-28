import { useState } from 'react';
import { RotateCcw, Plus, AlertTriangle, Search, MapPin } from 'lucide-react';
import Modal from '../components/Modal';
import { useStore } from '../store';
import { useAuthStore } from '../store/authStore';
import { format } from 'date-fns';
import clsx from 'clsx';

export default function Returns() {
  useAuthStore();
  const { locations, items, inventory, returns: returnRecords, processReturn } = useStore();

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [, setError] = useState('');
  const [filterType, setFilterType] = useState<'' | 'sale_return' | 'warehouse_return'>('');

  const [form, setForm] = useState({
    type: 'sale_return' as 'sale_return' | 'warehouse_return',
    location_id: '',
    item_id: '',
    quantity: 1,
    reason: '',
    status: 'Restocked' as 'Restocked' | 'Disposed',
  });

  const locationItems = form.location_id
    ? inventory.filter(e => e.location_id === form.location_id).map(e => ({
        ...e,
        item: items.find(i => i.id === e.item_id),
      })).filter(e => e.item)
    : [];

  const filteredReturns = filterType
    ? returnRecords.filter(r => r.type === filterType)
    : returnRecords;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    const item = items.find(i => i.id === form.item_id);
    if (!item) { setError('Please select a valid item.'); return; }

    setSaving(true);
    try {
      await processReturn({
        type: form.type,
        item_id: form.item_id,
        item_name: item.name,
        location_id: form.location_id,
        quantity: form.quantity,
        reason: form.reason,
        status: form.status,
        timestamp: new Date().toISOString(),
      });
      setIsModalOpen(false);
      setForm({ type: 'sale_return', location_id: '', item_id: '', quantity: 1, reason: '', status: 'Restocked' });
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const restockedCount = returnRecords.filter(r => r.status === 'Restocked').length;
  const disposedCount = returnRecords.filter(r => r.status === 'Disposed').length;

  return (
    <div className="space-y-6 lg:space-y-10 animate-in fade-in duration-500">
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-gray-900 tracking-tight flex items-center gap-3">
             <div className="p-2 sm:p-2.5 bg-primary/10 rounded-xl text-primary flex-shrink-0">
               <RotateCcw className="w-5 h-5 sm:w-6 sm:h-6" />
            </div>
            Returns Control
          </h1>
          <p className="text-xs sm:text-sm text-gray-400 font-bold uppercase tracking-widest mt-2 ml-12 sm:ml-14 border-l-2 border-gray-100 pl-4 uppercase tracking-tighter">
            Manage item reversals and disposal logs.
          </p>
        </div>
        <button onClick={() => { setIsModalOpen(true); setError(''); }} className="btn-primary flex items-center gap-2.5 text-sm justify-center shadow-xl shadow-primary/20 h-12 px-6 self-start sm:self-auto ml-12 sm:ml-0">
          <Plus className="w-5 h-5" /> 
          <span className="whitespace-nowrap font-black uppercase tracking-widest text-[10px]">Log Return</span>
        </button>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 lg:gap-6">
        <div className="card border-0 shadow-lg shadow-gray-50 bg-gradient-to-br from-white to-gray-50/50">
          <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest leading-none mb-4">Total Returns</p>
          <div className="flex items-center justify-between">
            <p className="text-4xl font-black text-gray-900 tracking-tighter">{returnRecords.length}</p>
            <div className="w-10 h-10 rounded-xl bg-gray-100 text-gray-400 flex items-center justify-center">
               <RotateCcw className="w-5 h-5" />
            </div>
          </div>
        </div>
        <div className="card border-0 shadow-lg shadow-gray-50 bg-gradient-to-br from-white to-gray-50/50">
          <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest leading-none mb-4">Inventory Restored</p>
          <div className="flex items-center justify-between">
            <p className="text-4xl font-black text-emerald-600 tracking-tighter">{restockedCount}</p>
            <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-500 flex items-center justify-center">
               <RotateCcw className="w-5 h-5" />
            </div>
          </div>
        </div>
        <div className="card border-0 shadow-lg shadow-gray-50 bg-gradient-to-br from-white to-gray-50/50">
          <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest leading-none mb-4">Disposed Items</p>
          <div className="flex items-center justify-between">
            <p className="text-4xl font-black text-red-500 tracking-tighter">{disposedCount}</p>
            <div className="w-10 h-10 rounded-xl bg-red-50 text-red-500 flex items-center justify-center">
               <AlertTriangle className="w-5 h-5" />
            </div>
          </div>
        </div>
      </div>

      {/* Filter and Content */}
      <div className="space-y-4">
        {/* Filter Strip */}
        <div className="flex border-b border-gray-100 overflow-x-auto no-scrollbar scroll-smooth">
          {(['', 'sale_return', 'warehouse_return'] as const).map(type => (
            <button
              key={type}
              onClick={() => setFilterType(type)}
              className={clsx(
                "flex items-center gap-3 px-6 py-4 text-[11px] font-black uppercase tracking-widest whitespace-nowrap transition-all border-b-2",
                filterType === type
                  ? 'border-primary text-primary bg-primary/[0.02]'
                  : 'border-transparent text-gray-400 hover:text-gray-900 hover:bg-gray-50/50'
              )}
            >
              {type === '' ? 'Unified Stream' : type === 'sale_return' ? 'Sale Reverse' : 'Warehouse Backflow'}
            </button>
          ))}
        </div>

        {/* Table/Card Container */}
        <div className="table-container">
           <div className="p-5 border-b border-gray-50 bg-gray-50/30 flex items-center justify-between">
             <h2 className="text-[11px] font-black text-gray-900 uppercase tracking-widest">Return Control Logs</h2>
             <div className="flex items-center gap-2 sm:gap-4">
                <span className="text-[10px] font-bold text-gray-300 uppercase tracking-widest">{filteredReturns.length} Records</span>
                <button className="text-gray-300 hover:text-primary transition-colors"><Search className="w-4 h-4" /></button>
             </div>
           </div>
           <div className="overflow-x-auto">
             <table className="w-full text-sm text-left min-w-[900px]">
               <thead className="bg-gray-50/50 text-[10px] uppercase text-gray-400 font-bold tracking-wider">
                 <tr>
                   <th className="px-6 py-4">Item Node</th>
                   <th className="px-6 py-4">Sequence</th>
                   <th className="px-6 py-4">Location Node</th>
                   <th className="px-6 py-4 text-right">Units</th>
                   <th className="px-6 py-4">Status Flag</th>
                   <th className="px-6 py-4">Timestamp</th>
                 </tr>
               </thead>
               <tbody className="divide-y divide-gray-50 bg-white">
                 {filteredReturns.length === 0 ? (
                   <tr>
                     <td colSpan={7} className="px-6 py-20 text-center flex flex-col items-center justify-center">
                       <div className="w-16 h-16 bg-gray-50 rounded-full flex items-center justify-center mb-4">
                         <RotateCcw className="w-8 h-8 opacity-10" />
                       </div>
                       <p className="font-extrabold text-gray-700 tracking-tight">Zero Reversal History</p>
                       <p className="text-xs text-gray-400 mt-1 uppercase tracking-tighter">All initial nodes remain committed.</p>
                     </td>
                   </tr>
                 ) : (
                  [...filteredReturns].sort((a,b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()).map(r => (
                   <tr key={r.id} className="hover:bg-gray-50/50 transition-colors group">
                     <td className="px-6 py-5">
                       <p className="font-extrabold text-gray-900 tracking-tight text-base group-hover:text-primary transition-colors">{r.item_name}</p>
                       <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest mt-0.5 line-clamp-1 italic">{r.reason || 'No causal log provided'}</p>
                     </td>
                     <td className="px-6 py-5">
                       <span className={clsx(
                         "px-3 py-1 rounded-md text-[9px] font-black uppercase tracking-widest whitespace-nowrap",
                         r.type === 'sale_return' ? 'bg-amber-50 text-amber-600' : 'bg-blue-50 text-blue-600'
                       )}>
                         {r.type === 'sale_return' ? 'Sale Reverse' : 'Node Flowback'}
                       </span>
                     </td>
                     <td className="px-6 py-5">
                       <div className="flex items-center gap-2">
                          <div className="w-6 h-6 bg-gray-50 rounded-md flex items-center justify-center text-gray-400">
                             <MapPin className="w-3 h-3" />
                          </div>
                          <span className="text-gray-600 font-bold tracking-tight">{locations.find(l => l.id === r.location_id)?.name ?? r.location_id}</span>
                       </div>
                     </td>
                     <td className="px-6 py-5 text-right font-black text-gray-900 text-lg tracking-tighter">{r.quantity}</td>
                     <td className="px-6 py-5">
                       <div className="flex items-center gap-2">
                        <span className={clsx(
                          "px-3 py-1 rounded-full text-[10px] font-black shadow-sm",
                          r.status === 'Restocked' ? 'bg-emerald-500 text-white' : 'bg-red-500 text-white'
                        )}>
                          {r.status}
                        </span>
                       </div>
                     </td>
                     <td className="px-6 py-5 text-gray-400 text-[11px] font-bold tabular-nums">
                       {format(new Date(r.timestamp), 'MMM dd, yyyy HH:mm')}
                     </td>
                   </tr>
                 ))
                )}
               </tbody>
             </table>
           </div>
        </div>
      </div>

      {/* Return Modal Updated for Responsive Inputs */}
      <Modal isOpen={isModalOpen} onClose={() => { setIsModalOpen(false); setError(''); }} title="Log System Reversal" description="Record a returned item and choose node action." size="md">
        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <div>
              <label className="label">Sequence Type</label>
              <select title="Return Type" className="input-field h-12 bg-white font-bold" value={form.type} onChange={e => setForm(f => ({ ...f, type: e.target.value as any }))}>
                <option value="sale_return">Sale Reversal</option>
                <option value="warehouse_return">Warehouse Flowback</option>
              </select>
            </div>
            <div>
              <label className="label">Node Commitment</label>
              <select title="Action" className="input-field h-12 bg-white font-bold" value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value as any }))}>
                <option value="Restocked">Recommit to Inventory</option>
                <option value="Disposed">Log Disposal (Final)</option>
              </select>
            </div>
            
            <div className="md:col-span-2">
              <label className="label">Node Location</label>
              <select title="Location" required className="input-field h-12 bg-white" value={form.location_id}
                onChange={e => setForm(f => ({ ...f, location_id: e.target.value, item_id: '' }))}>
                <option value="">Select node path…</option>
                {locations.map(l => <option key={l.id} value={l.id}>{l.name} ({l.type})</option>)}
              </select>
            </div>

            <div className="md:col-span-2">
              <label className="label">Target Item</label>
              <select title="Select Item" required className="input-field h-12 bg-white" value={form.item_id}
                onChange={e => setForm(f => ({ ...f, item_id: e.target.value }))} disabled={!form.location_id}>
                <option value="">Identify object…</option>
                {form.type === 'sale_return'
                  ? items.map(i => <option key={i.id} value={i.id}>{i.name}</option>)
                  : locationItems.map(e => <option key={e.item_id} value={e.item_id}>{e.item!.name} ({e.quantity} available)</option>)
                }
              </select>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 md:col-span-2 gap-5">
              <div className="sm:col-span-1">
                <label className="label">Quantity</label>
                <input title="Quantity" placeholder="0" required type="number" min={1} className="input-field h-12 text-lg font-black" value={form.quantity || ''}
                  onChange={e => setForm(f => ({ ...f, quantity: Number(e.target.value) }))} />
              </div>
              <div className="sm:col-span-2">
                <label className="label">Cause of Reversal</label>
                <input title="Reason" placeholder="e.g. Causal error, damaged node" className="input-field h-12" value={form.reason}
                  onChange={e => setForm(f => ({ ...f, reason: e.target.value }))} />
              </div>
            </div>
          </div>

          <div className="flex flex-col-reverse sm:flex-row justify-end gap-3 pt-6 border-t border-gray-100">
            <button type="button" className="btn-secondary h-12 px-6 font-bold" onClick={() => { setIsModalOpen(false); setError(''); }}>Cancel Node Change</button>
            <button type="submit" className="btn-primary h-12 px-8 font-black uppercase tracking-widest text-xs shadow-lg shadow-primary/20" disabled={saving}>
              {saving ? 'Processing Commitment…' : 'Finalize Log'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}

