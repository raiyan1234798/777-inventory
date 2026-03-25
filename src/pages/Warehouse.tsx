import { useState } from 'react';
import { PackagePlus, Boxes, Filter, Search, Trash2, Edit2 } from 'lucide-react';
import Modal from '../components/Modal';
import { useStore } from '../store';
import type { InventoryItem } from '../store';
import { db } from '../lib/firebase';
import { doc, setDoc, deleteDoc } from 'firebase/firestore';

const LOW_STOCK = 10;

const emptyItem = (): Omit<InventoryItem, 'id'> => ({
  name: '', category: '', sku: '', quantity: 0, unitCost: 0, sellingPrice: 0,
});

export default function Warehouse() {
  const { inventory } = useStore();

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyItem());
  const [search, setSearch] = useState('');
  const [saving, setSaving] = useState(false);

  const totalItems   = inventory.reduce((s, i) => s + i.quantity, 0);
  const lowStockCount = inventory.filter(i => i.quantity <= LOW_STOCK).length;

  const filtered = inventory.filter(i =>
    i.name.toLowerCase().includes(search.toLowerCase()) ||
    i.sku.toLowerCase().includes(search.toLowerCase()) ||
    i.category.toLowerCase().includes(search.toLowerCase())
  );

  const openAdd = () => {
    setEditingId(null);
    setForm(emptyItem());
    setIsModalOpen(true);
  };

  const openEdit = (item: InventoryItem) => {
    setEditingId(item.id);
    setForm({ name: item.name, category: item.category, sku: item.sku, quantity: item.quantity, unitCost: item.unitCost, sellingPrice: item.sellingPrice });
    setIsModalOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const id = editingId ?? `INV-${Date.now()}`;
      await setDoc(doc(db, 'inventory', id), { id, ...form }, { merge: true });
      setIsModalOpen(false);
    } catch (err) {
      console.error(err);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (item: InventoryItem) => {
    if (!window.confirm(`Delete "${item.name}"?`)) return;
    await deleteDoc(doc(db, 'inventory', item.id));
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center sm:flex-row flex-col gap-4">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 tracking-tight">Warehouse</h1>
          <p className="text-gray-500 mt-2">Manage incoming containers and bulk stock entry.</p>
        </div>
        <div className="flex space-x-3 w-full sm:w-auto">
          <button className="flex-1 sm:flex-none btn-secondary flex items-center justify-center">
            <Filter className="w-4 h-4 mr-2" /> Filter
          </button>
          <button onClick={openAdd} className="flex-1 sm:flex-none btn-primary flex items-center justify-center shadow-lg shadow-primary/30">
            <PackagePlus className="w-4 h-4 mr-2" /> Add Item
          </button>
        </div>
      </div>

      {/* Stock Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-6">
        <div className="card bg-gradient-to-br from-primary to-blue-600 text-white transform hover:-translate-y-1 transition-transform">
          <p className="text-blue-100 text-sm font-medium">Total Items in Warehouse</p>
          <p className="text-4xl font-bold mt-2">{totalItems.toLocaleString()}</p>
          <div className="mt-4 flex items-center text-sm text-blue-200">
            <Boxes className="w-4 h-4 mr-2" />
            Across {inventory.length} SKUs
          </div>
        </div>
        <div className="card transform hover:-translate-y-1 transition-transform">
          <p className="text-gray-500 text-sm font-medium">Total Products</p>
          <p className="text-4xl font-bold mt-2 text-gray-900">{inventory.length}</p>
          <div className="mt-4 text-sm text-gray-500">Unique SKUs in system</div>
        </div>
        <div className="card transform hover:-translate-y-1 transition-transform">
          <p className="text-gray-500 text-sm font-medium">Needs Restock</p>
          <p className={`text-4xl font-bold mt-2 ${lowStockCount > 0 ? 'text-danger' : 'text-success'}`}>{lowStockCount}</p>
          <div className="mt-4 text-sm text-gray-500">Items below {LOW_STOCK} units</div>
        </div>
      </div>

      {/* Inventory Table */}
      <div className="card overflow-hidden !px-0 !py-0">
        <div className="p-4 sm:p-6 border-b border-gray-100 flex flex-col sm:flex-row justify-between items-start sm:items-center bg-white gap-4">
          <h2 className="text-lg font-semibold text-gray-900">Current Stock View</h2>
          <div className="relative w-full sm:w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search items, SKU, category..."
              className="w-full bg-gray-50 border border-gray-200 text-sm rounded-lg pl-9 pr-4 py-2 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all duration-200"
            />
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm text-gray-500 min-w-[800px]">
            <thead className="bg-gray-50 text-xs uppercase text-gray-700">
              <tr>
                <th className="px-6 py-4 font-medium">Item & SKU</th>
                <th className="px-6 py-4 font-medium">Category</th>
                <th className="px-6 py-4 font-medium">Quantity</th>
                <th className="px-6 py-4 font-medium">Unit Cost (INR)</th>
                <th className="px-6 py-4 font-medium">Selling Price (INR)</th>
                <th className="px-6 py-4 font-medium">Status</th>
                <th className="px-6 py-4 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 bg-white">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-6 py-12 text-center text-gray-400">
                    {inventory.length === 0
                      ? 'No inventory yet. Add your first item!'
                      : 'No results match your search.'}
                  </td>
                </tr>
              ) : (
                filtered.map(item => (
                  <tr key={item.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex flex-col">
                        <span className="font-semibold text-gray-900">{item.name}</span>
                        <span className="text-xs text-gray-500 mt-1">SKU: {item.sku}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800">
                        {item.category}
                      </span>
                    </td>
                    <td className="px-6 py-4 font-medium text-gray-900">{item.quantity}</td>
                    <td className="px-6 py-4">₹{item.unitCost.toLocaleString()}</td>
                    <td className="px-6 py-4">₹{item.sellingPrice.toLocaleString()}</td>
                    <td className="px-6 py-4">
                      <span className={`px-3 py-1 rounded-full text-xs font-medium ${item.quantity <= LOW_STOCK ? 'bg-danger/10 text-danger' : 'bg-success/10 text-success'}`}>
                        {item.quantity <= LOW_STOCK ? 'Low Stock' : 'In Stock'}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="flex justify-end gap-2">
                        <button onClick={() => openEdit(item)} className="text-primary hover:bg-primary/10 p-1 rounded transition-colors">
                          <Edit2 className="w-4 h-4" />
                        </button>
                        <button onClick={() => handleDelete(item)} className="text-danger hover:bg-danger/10 p-1 rounded transition-colors">
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        <div className="p-4 border-t border-gray-100 text-sm text-gray-500 bg-white">
          Showing {filtered.length} of {inventory.length} items
        </div>
      </div>

      {/* Add / Edit Modal */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title={editingId ? 'Edit Inventory Item' : 'Add Inventory Item'}
        description={editingId ? 'Update the product details below.' : 'Enter the details for the new stock item.'}
        size="md"
      >
        <form onSubmit={handleSave} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">Item Name</label>
              <input required className="input-field" placeholder="e.g. Premium Leather Jacket" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">SKU</label>
              <input required className="input-field" placeholder="e.g. ZRA-1021" value={form.sku} onChange={e => setForm(f => ({ ...f, sku: e.target.value }))} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Category</label>
              <input required className="input-field" placeholder="e.g. Apparel" value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Quantity</label>
              <input required type="number" min={0} className="input-field" placeholder="0" value={form.quantity || ''} onChange={e => setForm(f => ({ ...f, quantity: Number(e.target.value) }))} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Unit Cost (₹)</label>
              <input required type="number" min={0} className="input-field" placeholder="0" value={form.unitCost || ''} onChange={e => setForm(f => ({ ...f, unitCost: Number(e.target.value) }))} />
            </div>
            <div className="col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">Selling Price (₹)</label>
              <input required type="number" min={0} className="input-field" placeholder="0" value={form.sellingPrice || ''} onChange={e => setForm(f => ({ ...f, sellingPrice: Number(e.target.value) }))} />
            </div>
          </div>
          <div className="flex justify-end space-x-3 pt-4 border-t border-gray-100">
            <button type="button" className="btn-secondary" onClick={() => setIsModalOpen(false)}>Cancel</button>
            <button type="submit" className="btn-primary" disabled={saving}>{saving ? 'Saving…' : editingId ? 'Save Changes' : 'Add Item'}</button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
