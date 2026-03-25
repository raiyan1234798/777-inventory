import { useState } from 'react';
import { ArrowRightLeft, Send, CheckCircle2, Clock } from 'lucide-react';
import Modal from '../components/Modal';
import { useStore } from '../store';
import { db } from '../lib/firebase';
import { collection, addDoc, onSnapshot } from 'firebase/firestore';
import { format } from 'date-fns';
import { useEffect } from 'react';

interface Transfer {
  id: string;
  from: string;
  to: string;
  items: string;
  quantity: number;
  valueINR: number;
  status: 'Completed' | 'In Transit';
  date: string;
}

const LOCATIONS = ['Main Warehouse', 'Mumbai Shop', 'Delhi Shop', 'Dubai Mall'];

export default function Transfers() {
  const { inventory } = useStore();
  const [transfers, setTransfers] = useState<Transfer[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  const [form, setForm] = useState({
    from: LOCATIONS[0],
    to: LOCATIONS[1],
    itemId: '',
    quantity: 1,
    status: 'Completed' as Transfer['status'],
  });

  // Real-time listener for transfers collection
  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'transfers'), snap => {
      const data = snap.docs
        .map(d => ({ id: d.id, ...d.data() } as Transfer))
        .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
      setTransfers(data);
    });
    return () => unsub();
  }, []);

  const selectedItem = inventory.find(i => i.id === form.itemId);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedItem) return;
    setSaving(true);
    try {
      const newTransfer = {
        from: form.from,
        to: form.to,
        items: selectedItem.name,
        quantity: form.quantity,
        valueINR: selectedItem.sellingPrice * form.quantity,
        status: form.status,
        date: new Date().toISOString(),
      };
      await addDoc(collection(db, 'transfers'), newTransfer);
      setIsModalOpen(false);
      setForm({ from: LOCATIONS[0], to: LOCATIONS[1], itemId: '', quantity: 1, status: 'Completed' });
    } catch (err) {
      console.error(err);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center sm:flex-row flex-col gap-4">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 tracking-tight">Stock Transfers</h1>
          <p className="text-gray-500 mt-2">Manage movements between warehouses and shops.</p>
        </div>
        <button
          onClick={() => setIsModalOpen(true)}
          className="btn-primary flex items-center shadow-lg shadow-primary/30"
        >
          <Send className="w-4 h-4 mr-2" /> New Transfer
        </button>
      </div>

      <div className="card overflow-hidden !px-0 !py-0">
        <div className="p-6 border-b border-gray-100 bg-white">
          <h2 className="text-lg font-semibold text-gray-900">Transfer History</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm text-gray-500">
            <thead className="bg-gray-50 text-xs uppercase text-gray-700">
              <tr>
                <th className="px-6 py-4 font-medium">Route</th>
                <th className="px-6 py-4 font-medium">Items</th>
                <th className="px-6 py-4 font-medium">Qty</th>
                <th className="px-6 py-4 font-medium">Value (INR)</th>
                <th className="px-6 py-4 font-medium">Status</th>
                <th className="px-6 py-4 font-medium">Date</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 bg-white">
              {transfers.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-12 text-center text-gray-400">
                    No transfers logged yet. Click "New Transfer" to get started.
                  </td>
                </tr>
              ) : (
                transfers.map(t => (
                  <tr key={t.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-6 py-4">
                      <div className="flex items-center text-gray-700 font-medium">
                        <span>{t.from}</span>
                        <ArrowRightLeft className="w-4 h-4 mx-2 text-gray-400" />
                        <span>{t.to}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4">{t.items}</td>
                    <td className="px-6 py-4">{t.quantity} units</td>
                    <td className="px-6 py-4 font-medium text-gray-900">₹{t.valueINR.toLocaleString()}</td>
                    <td className="px-6 py-4">
                      <span className={`flex items-center px-3 py-1 rounded-full text-xs font-medium w-fit ${t.status === 'Completed' ? 'bg-success/10 text-success' : 'bg-amber-100 text-amber-700'}`}>
                        {t.status === 'Completed'
                          ? <CheckCircle2 className="w-3 h-3 mr-1" />
                          : <Clock className="w-3 h-3 mr-1" />}
                        {t.status}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-gray-400">{format(new Date(t.date), 'MMM dd, yyyy')}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title="Log New Transfer"
        description="Record a stock movement between locations."
        size="md"
      >
        <form onSubmit={handleSave} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">From</label>
              <select className="input-field bg-white" value={form.from} onChange={e => setForm(f => ({ ...f, from: e.target.value }))}>
                {LOCATIONS.map(l => <option key={l}>{l}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">To</label>
              <select className="input-field bg-white" value={form.to} onChange={e => setForm(f => ({ ...f, to: e.target.value }))}>
                {LOCATIONS.map(l => <option key={l}>{l}</option>)}
              </select>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Item</label>
            <select required className="input-field bg-white" value={form.itemId} onChange={e => setForm(f => ({ ...f, itemId: e.target.value }))}>
              <option value="">Select an inventory item...</option>
              {inventory.map(i => (
                <option key={i.id} value={i.id}>{i.name} (SKU: {i.sku}) — {i.quantity} in stock</option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Quantity</label>
              <input required type="number" min={1} max={selectedItem?.quantity} className="input-field" value={form.quantity} onChange={e => setForm(f => ({ ...f, quantity: Number(e.target.value) }))} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
              <select className="input-field bg-white" value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value as Transfer['status'] }))}>
                <option>Completed</option>
                <option>In Transit</option>
              </select>
            </div>
          </div>

          {selectedItem && (
            <div className="bg-primary/5 border border-primary/20 rounded-xl p-3 text-sm text-gray-700">
              Transfer value: <strong>₹{(selectedItem.sellingPrice * form.quantity).toLocaleString()}</strong>
            </div>
          )}

          <div className="flex justify-end space-x-3 pt-4 border-t border-gray-100">
            <button type="button" className="btn-secondary" onClick={() => setIsModalOpen(false)}>Cancel</button>
            <button type="submit" className="btn-primary" disabled={saving || !selectedItem}>
              {saving ? 'Saving…' : 'Log Transfer'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
