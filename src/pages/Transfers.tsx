import { useState } from 'react';
import { ArrowRightLeft, Send, AlertTriangle, ChevronRight, Activity } from 'lucide-react';
import Modal from '../components/Modal';
import { useStore, formatCurrency } from '../store';
import { useAuthStore } from '../store/authStore';
import { format } from 'date-fns';

export default function Transfers() {
  const { appUser } = useAuthStore();
  const { locations, items, inventory, transactions, transfer } = useStore();

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const [form, setForm] = useState({
    from_location: '',
    to_location: '',
    item_id: '',
    quantity: 1,
  });

  // Available inventory from source
  const sourceEntry = form.from_location && form.item_id
    ? inventory.find(e => e.location_id === form.from_location && e.item_id === form.item_id)
    : null;

  const sourceItems = form.from_location
    ? inventory
        .filter(e => e.location_id === form.from_location && e.quantity > 0)
        .map(e => ({
          ...e,
          item: items.find(i => i.id === e.item_id),
        }))
        .filter(e => e.item)
    : [];

  const transferLogs = transactions.filter(t => t.type === 'transfer');

  const getLocationName = (id: string) => {
    if (id === 'supplier') return 'Supplier';
    if (id === 'customer') return 'Customer';
    return locations.find(l => l.id === id)?.name ?? id;
  };

  const handleTransfer = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (form.from_location === form.to_location) {
      setError('Source and destination cannot be the same location.');
      return;
    }
    if (!sourceEntry) {
      setError('Selected item not in stock at source location.');
      return;
    }
    if (form.quantity > sourceEntry.quantity) {
      setError(`Only ${sourceEntry.quantity} units available at source.`);
      return;
    }

    setSaving(true);
    try {
      const item = items.find(i => i.id === form.item_id);
      await transfer({
        from_location: form.from_location,
        to_location: form.to_location,
        item_id: form.item_id,
        item_name: item?.name ?? '',
        quantity: form.quantity,
        unit_cost_INR: sourceEntry.avg_cost_INR,
        performed_by: appUser?.name ?? 'Staff',
      });
      setIsModalOpen(false);
      setForm({ from_location: '', to_location: '', item_id: '', quantity: 1 });
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6 lg:space-y-10 animate-in fade-in duration-500">
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-gray-900 tracking-tight flex items-center gap-3">
             <div className="p-2 sm:p-2.5 bg-primary/10 rounded-xl text-primary flex-shrink-0">
               <ArrowRightLeft className="w-5 h-5 sm:w-6 sm:h-6" />
            </div>
            Stock Logistics
          </h1>
          <p className="text-xs sm:text-sm text-gray-400 font-bold uppercase tracking-widest mt-2 ml-12 sm:ml-14 border-l-2 border-gray-100 pl-4 uppercase tracking-tighter">
            Execute and audit inter-node item migrations.
          </p>
        </div>
        <button onClick={() => { setIsModalOpen(true); setError(''); }} className="btn-primary flex items-center gap-2.5 text-sm justify-center shadow-xl shadow-primary/20 h-12 px-6 self-start sm:self-auto ml-12 sm:ml-0">
          <Send className="w-4 h-4" /> 
          <span className="whitespace-nowrap font-black uppercase tracking-widest text-[10px]">Execute Migration</span>
        </button>
      </div>

      {/* Stats Strip */}
      <div className="responsive-grid">
        <div className="card border-0 shadow-lg shadow-gray-50 bg-gradient-to-br from-white to-gray-50/50 p-6 flex flex-col justify-between">
          <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-4">Transfer Volume</p>
          <div>
            <p className="text-3xl font-black text-gray-900 tracking-tighter tabular-nums">{transferLogs.length}</p>
            <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest mt-2">Executed Cycles</p>
          </div>
        </div>
        <div className="card border-0 shadow-lg shadow-gray-50 bg-gradient-to-br from-white to-gray-50/50 p-6 flex flex-col justify-between">
          <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-4">Migrated Value (INR)</p>
          <div>
            <p className="text-3xl font-black text-gray-900 tracking-tighter tabular-nums">
              {formatCurrency(transferLogs.reduce((s, t) => s + t.converted_value_INR, 0))}
            </p>
            <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest mt-2">Capital Rotation</p>
          </div>
        </div>
        <div className="card border-0 shadow-lg shadow-gray-50 bg-gradient-to-br from-white to-gray-200/20 p-6 flex flex-col justify-between sm:col-span-2 lg:col-span-1">
          <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-4">Object Units</p>
          <div>
            <p className="text-3xl font-black text-primary tracking-tighter tabular-nums">
              {transferLogs.reduce((s, t) => s + t.quantity, 0).toLocaleString()}
            </p>
            <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest mt-2 italic">Total Movement</p>
          </div>
        </div>
      </div>

      {/* Logs Table */}
      <div className="table-container shadow-xl shadow-gray-100/50">
        <div className="p-5 border-b border-gray-50 bg-white flex items-center justify-between">
          <h2 className="text-[11px] font-black text-gray-900 uppercase tracking-widest flex items-center gap-2">
            <Activity className="w-4 h-4 text-primary" /> Migration Audit Trail
          </h2>
          <span className="text-[10px] font-bold text-gray-300 uppercase tracking-widest">{transferLogs.length} Entries Logged</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left min-w-[800px]">
            <thead className="bg-gray-50/50 text-[10px] uppercase text-gray-400 font-black tracking-widest">
              <tr>
                <th className="px-6 py-4">Node Path</th>
                <th className="px-6 py-4">Object Vector</th>
                <th className="px-6 py-4 text-right">Commitment</th>
                <th className="px-6 py-4 text-right">Node Valuation</th>
                <th className="px-6 py-4">Authorizing Signature</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50 bg-white">
              {transferLogs.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-6 py-20 text-center flex flex-col items-center">
                    <div className="w-16 h-16 bg-gray-50 rounded-full flex items-center justify-center mb-4">
                      <ArrowRightLeft className="w-8 h-8 opacity-10" />
                    </div>
                    <p className="font-extrabold text-gray-700 tracking-tight">Logic Void Identified</p>
                    <p className="text-[10px] text-gray-400 mt-1 uppercase tracking-tighter">Initiate "Migration" to record system movement.</p>
                  </td>
                </tr>
              ) : [...transferLogs].sort((a,b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()).map(t => (
                <tr key={t.id} className="hover:bg-gray-50/50 transition-colors group">
                  <td className="px-6 py-5">
                    <div className="flex items-center gap-2 text-gray-900 font-bold tracking-tight">
                      <span className="truncate max-w-[120px]">{getLocationName(t.from_location)}</span>
                      <ChevronRight className="w-3.5 h-3.5 text-primary flex-shrink-0" />
                      <span className="truncate max-w-[120px] text-primary">{getLocationName(t.to_location)}</span>
                    </div>
                    <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest mt-1 tabular-nums">
                      {format(new Date(t.timestamp), 'MMM dd, yyyy HH:mm')}
                    </p>
                  </td>
                  <td className="px-6 py-5">
                     <p className="text-base font-extrabold text-gray-900 group-hover:text-primary transition-colors tracking-tight">{t.item_name}</p>
                  </td>
                  <td className="px-6 py-5 text-right">
                    <span className="text-lg font-black text-gray-900 tracking-tighter tabular-nums">{t.quantity}</span>
                    <span className="text-[10px] text-gray-400 font-bold uppercase ml-1 opacity-60">u</span>
                  </td>
                  <td className="px-6 py-5 text-right font-black text-gray-900 tabular-nums">{formatCurrency(t.converted_value_INR)}</td>
                  <td className="px-6 py-5">
                     <div className="flex items-center gap-2">
                        <div className="w-6 h-6 rounded-full bg-blue-50 flex items-center justify-center text-blue-500">
                           <Activity className="w-3 h-3" />
                        </div>
                        <span className="text-xs font-bold text-gray-600 uppercase tracking-tighter">{t.performed_by}</span>
                     </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <Modal isOpen={isModalOpen} onClose={() => { setIsModalOpen(false); setError(''); }} title="Node Migration Vector" description="Rotate synchronized objects between node anchors." size="md">
        <form onSubmit={handleTransfer} className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <div>
              <label className="label">Source Node Anchor</label>
              <select title="Source Location" required className="input-field h-12 bg-white font-bold" value={form.from_location}
                onChange={e => setForm(f => ({ ...f, from_location: e.target.value, item_id: '', quantity: 1 }))}>
                <option value="">Identify source…</option>
                {locations.map(l => <option key={l.id} value={l.id}>{l.name} ({l.type})</option>)}
              </select>
            </div>
            <div>
              <label className="label">Destination Node Anchor</label>
              <select title="Destination Location" required className="input-field h-12 bg-white font-bold" value={form.to_location}
                onChange={e => setForm(f => ({ ...f, to_location: e.target.value }))}>
                <option value="">Target destination…</option>
                {locations.filter(l => l.id !== form.from_location).map(l => (
                  <option key={l.id} value={l.id}>{l.name} ({l.type})</option>
                ))}
              </select>
            </div>

            <div className="md:col-span-2">
              <label className="label">Migration Object Identity</label>
              <select title="Select Item" required className="input-field h-12 bg-white font-bold" value={form.item_id}
                onChange={e => setForm(f => ({ ...f, item_id: e.target.value, quantity: 1 }))}
                disabled={!form.from_location}>
                <option value="">Identify object buffer…</option>
                {sourceItems.map(e => (
                  <option key={e.item_id} value={e.item_id}>
                    {e.item!.name} — {e.quantity} Available Nodes (avg {formatCurrency(e.avg_cost_INR)})
                  </option>
                ))}
              </select>
              {form.from_location && sourceItems.length === 0 && (
                <p className="text-[10px] text-red-500 font-black uppercase tracking-widest mt-2 flex items-center gap-1">
                   <AlertTriangle className="w-3 h-3" /> Zero Buffered Stock
                </p>
              )}
            </div>

            <div className="md:col-span-2">
              <label className="label">Vector Magnitude (Quantity)</label>
              <input title="Quantity" placeholder="0" required type="number" min={1} max={sourceEntry?.quantity ?? undefined} className="input-field h-12 text-lg font-black"
                value={form.quantity || ''}
                onChange={e => setForm(f => ({ ...f, quantity: Number(e.target.value) }))} />
              {sourceEntry && (
                <div className="mt-3 flex items-center justify-between text-[11px] font-bold uppercase tracking-widest bg-gray-50 p-3 rounded-xl border border-gray-100">
                  <span className="text-gray-400">Node Limit: <span className="text-primary">{sourceEntry.quantity}u</span></span>
                  <span className="text-gray-400">Migration Value: <span className="text-primary">{formatCurrency(sourceEntry.avg_cost_INR * form.quantity)}</span></span>
                </div>
              )}
            </div>
          </div>

          {error && (
            <div className="flex items-center gap-3 bg-red-50 border border-red-100 rounded-2xl p-4 text-xs font-bold text-red-600 animate-in slide-in-from-top-2">
              <AlertTriangle className="w-4 h-4 flex-shrink-0" /> {error}
            </div>
          )}

          <div className="flex flex-col-reverse sm:flex-row justify-end gap-3 pt-6 border-t border-gray-100">
            <button type="button" className="btn-secondary h-12 px-6 font-bold" onClick={() => { setIsModalOpen(false); setError(''); }}>Abort Migration</button>
            <button type="submit" className="btn-primary h-12 px-10 font-black uppercase tracking-widest text-xs shadow-xl shadow-primary/20" disabled={saving || !sourceEntry}>
              {saving ? 'Transmitting Data…' : 'Execute Transmission'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
