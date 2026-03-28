import { useState, useMemo } from 'react';
import { 
  Building2, Plus, Edit2, Trash2, MapPin, 
  User as UserIcon, Phone, 
  BarChart3, Wrench
} from 'lucide-react';
import clsx from 'clsx';
import Modal from '../components/Modal';
import { 
  useStore, COUNTRIES, CURRENCIES, formatCurrency, toINR 
} from '../store';
import { format } from 'date-fns';

export default function ManageWarehouses() {
  const { 
    locations, transactions, expenses, users,
    addLocation, updateLocation, deleteLocation,
    addExpense, deleteExpense
  } = useStore();

  const warehouses = locations.filter(l => l.type === 'warehouse');
  
  const [activeTab, setActiveTab] = useState<'list' | 'maintenance' | 'performance'>('list');
  const [isLocModal, setIsLocModal] = useState(false);
  const [isExpModal, setIsExpModal] = useState(false);
  const [editingLoc, setEditingLoc] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Forms
  const [locForm, setLocForm] = useState({
    name: '', country: 'India', currency: 'INR',
    manager: '', contact: '', address: ''
  });

  const [expForm, setExpForm] = useState({
    location_id: '', category: 'Maintenance', amount: 0,
    currency: 'INR', date: new Date().toISOString().split('T')[0], notes: ''
  });

  // Warehouse Performance Analytics
  const warehouseStats = useMemo(() => {
    return warehouses.map(warehouse => {
      const warehouseTransactions = transactions.filter(t => 
        t.from_location === warehouse.id || t.to_location === warehouse.id
      );
      
      const warehouseExpenses = expenses.filter(e => e.location_id === warehouse.id);
      
      const stockEntries = warehouseTransactions.filter(t => t.type === 'stock_entry' && t.to_location === warehouse.id);
      const transfers = warehouseTransactions.filter(t => t.type === 'transfer');
      const outgoing = transfers.filter(t => t.from_location === warehouse.id);
      const incoming = transfers.filter(t => t.to_location === warehouse.id);
      
      const totalStockValue = stockEntries.reduce((sum, t) => sum + t.converted_value_INR, 0);
      const totalTransferred = outgoing.reduce((sum, t) => sum + t.converted_value_INR, 0);
      const totalExpenses = warehouseExpenses.reduce((sum, e) => sum + e.converted_amount_INR, 0);
      
      return {
        ...warehouse,
        totalStockValue,
        totalTransferred,
        totalExpenses,
        stockEntries: stockEntries.length,
        outgoingTransfers: outgoing.length,
        incomingTransfers: incoming.length,
        staffAssigned: users.filter(u => u.location_id === warehouse.id && u.role === 'warehouse_staff').length
      };
    });
  }, [warehouses, transactions, expenses, users]);

  const handleLocSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      if (editingLoc) {
        await updateLocation(editingLoc, locForm);
      } else {
        await addLocation({ ...locForm, type: 'warehouse' });
      }
      setIsLocModal(false);
      setEditingLoc(null);
      setLocForm({ name: '', country: 'India', currency: 'INR', manager: '', contact: '', address: '' });
    } catch (err: any) {
      alert(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleExpSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await addExpense({
        ...expForm,
        location_type: 'warehouse', // FIX: Explicitly set location_type for proper categorization
        converted_amount_INR: toINR(expForm.amount, expForm.currency)
      });
      setIsExpModal(false);
      setExpForm({ location_id: '', category: 'Maintenance', amount: 0, currency: 'INR', date: new Date().toISOString().split('T')[0], notes: '' });
    } catch (err: any) {
      alert(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 tracking-tight">Warehouse Management</h1>
          <p className="text-xs sm:text-sm text-gray-500 mt-1">Configure warehouse profiles, track maintenance costs, and monitor inventory operations.</p>
        </div>
        <button onClick={() => { setEditingLoc(null); setLocForm({ name: '', country: 'India', currency: 'INR', manager: '', contact: '', address: '' }); setIsLocModal(true); }} className="btn-primary flex items-center gap-2 text-sm justify-center shadow-lg shadow-primary/20 w-full sm:w-auto">
          <Plus className="w-4 h-4" /> 
          <span className="whitespace-nowrap">Add Warehouse</span>
        </button>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-gray-100 overflow-x-auto no-scrollbar scroll-smooth">
        {[
          { id: 'list', label: 'Warehouse List', icon: Building2 },
          { id: 'maintenance', label: 'Maintenance Costs', icon: Wrench },
          { id: 'performance', label: 'Analytics', icon: BarChart3 },
        ].map(t => (
          <button
            key={t.id}
            onClick={() => setActiveTab(t.id as any)}
            className={clsx(
              "flex items-center gap-2.5 px-6 py-4 text-sm font-semibold whitespace-nowrap transition-all border-b-2",
              activeTab === t.id
                ? 'border-primary text-primary bg-primary/[0.02]'
                : 'border-transparent text-gray-500 hover:text-gray-900 hover:bg-gray-50/50'
            )}
          >
            <t.icon className={clsx("w-4 h-4", activeTab === t.id ? "text-primary" : "text-gray-400")} />
            {t.label}
          </button>
        ))}
      </div>

      {activeTab === 'list' && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
          {warehouses.map(warehouse => (
            <div key={warehouse.id} className="bg-white rounded-2xl border border-gray-100 shadow-sm hover:shadow-xl transition-all overflow-hidden group">
              <div className="p-5 border-b border-gray-50">
                <div className="flex justify-between items-start">
                  <div className="flex items-center gap-3">
                    <div className="p-2.5 bg-blue-50 rounded-xl text-primary font-bold">
                      <Building2 className="w-5 h-5" />
                    </div>
                    <div>
                      <h3 className="font-bold text-gray-900 group-hover:text-primary transition-colors">{warehouse.name}</h3>
                      <p className="text-[10px] text-gray-400 font-bold uppercase tracking-wider mt-0.5">{warehouse.country} · {warehouse.currency}</p>
                    </div>
                  </div>
                  <div className="flex gap-1">
                    <button 
                      title="Edit Warehouse"
                      onClick={() => { 
                        setEditingLoc(warehouse.id); 
                        setLocForm({
                          name: warehouse.name,
                          country: warehouse.country,
                          currency: warehouse.currency,
                          manager: warehouse.manager || '',
                          contact: warehouse.contact || '',
                          address: warehouse.address || ''
                        }); 
                        setIsLocModal(true); 
                      }} 
                      className="p-2 text-gray-400 hover:text-blue-500 hover:bg-blue-50 rounded-lg transition-all"
                    >
                      <Edit2 className="w-4 h-4" />
                    </button>
                    <button 
                      title="Delete Warehouse"
                      onClick={() => {
                        if (window.confirm(`Delete warehouse "${warehouse.name}"? This cannot be undone.`)) {
                          deleteLocation(warehouse.id);
                        }
                      }} 
                      className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>
              <div className="p-5 space-y-4">
                <div className="flex items-center gap-3 text-sm text-gray-600">
                  <div className="w-8 h-8 rounded-full bg-gray-50 flex items-center justify-center flex-shrink-0">
                    <UserIcon className="w-4 h-4 text-gray-400" />
                  </div>
                  <span className="font-medium">{warehouse.manager || 'No manager assigned'}</span>
                </div>
                <div className="flex items-center gap-3 text-sm text-gray-600">
                  <div className="w-8 h-8 rounded-full bg-gray-50 flex items-center justify-center flex-shrink-0">
                    <Phone className="w-4 h-4 text-gray-400" />
                  </div>
                  <span className="font-medium">{warehouse.contact || 'No contact info'}</span>
                </div>
                <div className="flex items-start gap-3 text-sm text-gray-600">
                  <div className="w-8 h-8 rounded-full bg-gray-50 flex items-center justify-center flex-shrink-0 mt-0.5">
                    <MapPin className="w-4 h-4 text-gray-400" />
                  </div>
                  <span className="leading-relaxed font-medium line-clamp-2">{warehouse.address || 'No address provided'}</span>
                </div>
              </div>
            </div>
          ))}
          {warehouses.length === 0 && (
            <div className="col-span-full py-20 text-center text-gray-400 bg-white rounded-2xl border-2 border-dashed border-gray-100">
              <div className="w-16 h-16 bg-gray-50 rounded-full flex items-center justify-center mx-auto mb-4">
                <Building2 className="w-8 h-8 opacity-20" />
              </div>
              <p className="font-bold text-gray-500">No warehouses registered yet</p>
              <p className="text-sm mt-1">Add your first warehouse to start managing inventory operations.</p>
            </div>
          )}
        </div>
      )}

      {activeTab === 'maintenance' && (
        <div className="table-container">
          <div className="p-5 border-b border-gray-50 flex flex-col sm:flex-row justify-between sm:items-center gap-4">
            <h2 className="text-sm font-bold text-gray-900">Warehouse Maintenance & Operational Costs</h2>
            <button onClick={() => setIsExpModal(true)} className="btn-primary text-xs flex items-center gap-2 justify-center shadow-md shadow-primary/10">
              <Plus className="w-3.5 h-3.5" /> Log Cost
            </button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left min-w-[600px]">
              <thead className="bg-gray-50 text-[10px] uppercase text-gray-400 font-bold tracking-wider">
                <tr>
                  <th className="px-6 py-4">Warehouse</th>
                  <th className="px-6 py-4">Category</th>
                  <th className="px-6 py-4 text-right">Amount</th>
                  <th className="px-6 py-4">Date</th>
                  <th className="px-6 py-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50 bg-white">
                {expenses.map(e => (
                  <tr key={e.id} className="hover:bg-gray-50/50 transition-colors group">
                    <td className="px-6 py-4 font-semibold text-gray-900">{warehouses.find(w => w.id === e.location_id)?.name || 'Unknown'}</td>
                    <td className="px-6 py-4">
                      <span className="px-2 py-0.5 rounded-full bg-gray-100 text-gray-600 text-[11px] font-medium">{e.category}</span>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <span className="font-bold text-gray-900">{formatCurrency(e.amount, e.currency)}</span>
                      <p className="text-[10px] text-gray-400 font-medium">≈ {formatCurrency(e.converted_amount_INR)}</p>
                    </td>
                    <td className="px-6 py-4 text-gray-500 text-[11px]">{format(new Date(e.date), 'MMM dd, yyyy')}</td>
                    <td className="px-6 py-4 text-right">
                      <button title="Delete Cost" onClick={() => {
                        if (window.confirm('Delete this maintenance cost?')) {
                          deleteExpense(e.id);
                        }
                      }} className="p-2 text-gray-400 hover:text-red-500 transition-colors"><Trash2 className="w-4 h-4" /></button>
                    </td>
                  </tr>
                ))}
                {expenses.length === 0 && (
                  <tr><td colSpan={5} className="px-6 py-12 text-center text-gray-400">No maintenance costs recorded.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {activeTab === 'performance' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {warehouseStats.map(stat => (
              <div key={stat.id} className="bg-white rounded-2xl border border-gray-100 p-6 shadow-sm hover:shadow-lg transition-all">
                <div className="flex justify-between items-start mb-6">
                  <div>
                    <h3 className="font-extrabold text-gray-900 leading-tight">{stat.name}</h3>
                    <p className="text-[10px] text-gray-400 font-bold uppercase tracking-wider mt-1">Operational Metrics</p>
                  </div>
                </div>
                
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="bg-blue-50 rounded-lg p-3 border border-blue-100">
                      <p className="text-[9px] uppercase font-black text-blue-600 mb-1 tracking-widest">Stock Value</p>
                      <p className="text-lg font-black text-blue-900">{formatCurrency(stat.totalStockValue, stat.currency)}</p>
                    </div>
                    <div className="bg-emerald-50 rounded-lg p-3 border border-emerald-100">
                      <p className="text-[9px] uppercase font-black text-emerald-600 mb-1 tracking-widest">Staff</p>
                      <p className="text-lg font-black text-emerald-900">{stat.staffAssigned}</p>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4 pt-2 border-t border-gray-100">
                    <div>
                      <p className="text-[9px] uppercase font-black text-gray-400 mb-2 tracking-widest">Stock Entries</p>
                      <p className="text-xl font-black text-gray-900">{stat.stockEntries}</p>
                    </div>
                    <div>
                      <p className="text-[9px] uppercase font-black text-gray-400 mb-2 tracking-widest">Transfers Out</p>
                      <p className="text-xl font-black text-gray-900">{stat.outgoingTransfers}</p>
                    </div>
                  </div>

                  <div className="bg-orange-50 rounded-lg p-3 border border-orange-100 mt-2">
                    <p className="text-[9px] uppercase font-black text-orange-600 mb-1 tracking-widest">Maintenance Costs (INR)</p>
                    <p className="text-lg font-black text-orange-900">{formatCurrency(stat.totalExpenses, 'INR')}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Warehouse Location Modal */}
      <Modal isOpen={isLocModal} onClose={() => setIsLocModal(false)} title={editingLoc ? "Edit Warehouse" : "Add New Warehouse"} description="Manage warehouse profile and operational settings." size="md">
        <form onSubmit={handleLocSubmit} className="space-y-5">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <div className="md:col-span-2">
              <label className="label">Warehouse Name</label>
              <input title="Warehouse Name" placeholder="e.g. Delhi Central Warehouse" required className="input-field h-11" value={locForm.name} onChange={e => setLocForm(f => ({ ...f, name: e.target.value }))} />
            </div>
            <div>
              <label className="label">Country</label>
              <select title="Select Country" className="input-field h-11 bg-white" value={locForm.country} onChange={e => setLocForm(f => ({ ...f, country: e.target.value, currency: COUNTRIES.find(c => c.name === e.target.value)?.currency || 'INR' }))}>
                {COUNTRIES.map(c => <option key={c.name} value={c.name}>{c.name}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Currency</label>
              <select title="Select Currency" className="input-field h-11 bg-white" value={locForm.currency} onChange={e => setLocForm(f => ({ ...f, currency: e.target.value }))}>
                {CURRENCIES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Warehouse Manager</label>
              <input title="Manager Name" className="input-field h-11" value={locForm.manager} onChange={e => setLocForm(f => ({ ...f, manager: e.target.value }))} placeholder="John Doe" />
            </div>
            <div>
              <label className="label">Contact Info</label>
              <input title="Contact Info" className="input-field h-11" value={locForm.contact} onChange={e => setLocForm(f => ({ ...f, contact: e.target.value }))} placeholder="+1 ..." />
            </div>
            <div className="md:col-span-2">
              <label className="label">Address</label>
              <textarea title="Full Address" placeholder="Street, City, State, Zip" className="input-field min-h-[100px] py-3" value={locForm.address} onChange={e => setLocForm(f => ({ ...f, address: e.target.value }))} />
            </div>
          </div>
          <div className="flex flex-col-reverse sm:flex-row justify-end gap-3 pt-6 border-t border-gray-100">
            <button type="button" onClick={() => setIsLocModal(false)} className="btn-secondary h-11">Cancel</button>
            <button type="submit" className="btn-primary h-11" disabled={saving}>{saving ? 'Saving...' : editingLoc ? 'Update Warehouse' : 'Add Warehouse'}</button>
          </div>
        </form>
      </Modal>

      {/* Maintenance Cost Modal */}
      <Modal isOpen={isExpModal} onClose={() => setIsExpModal(false)} title="Log Maintenance Cost" description="Record repairs, maintenance, or other operational expenses." size="sm">
        <form onSubmit={handleExpSubmit} className="space-y-5">
          <div>
            <label className="label">Warehouse</label>
            <select title="Select Warehouse" required className="input-field h-11 bg-white" value={expForm.location_id} onChange={e => {
                 const w = warehouses.find(x => x.id === e.target.value);
                 setExpForm(f => ({ ...f, location_id: e.target.value, currency: w?.currency ?? 'INR' }));
            }}>
              <option value="">Select warehouse...</option>
              {warehouses.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
            </select>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
            <div>
              <label className="label">Category</label>
              <select title="Category" className="input-field h-11 bg-white" value={expForm.category} onChange={e => setExpForm(f => ({ ...f, category: e.target.value }))}>
                {['Maintenance', 'Repair', 'Cleaning', 'Security', 'Electricity', 'Water', 'Insurance', 'Labor', 'Equipment', 'Other'].map(c => <option key={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Date</label>
              <input title="Cost Date" required type="date" className="input-field h-11 bg-white" value={expForm.date} onChange={e => setExpForm(f => ({ ...f, date: e.target.value }))} />
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div className="col-span-2">
              <label className="label">Amount ({expForm.currency})</label>
              <input required type="number" min={0} className="input-field h-11" value={expForm.amount || ''} onChange={e => setExpForm(f => ({ ...f, amount: Number(e.target.value) }))} />
            </div>
            <div>
              <label className="label">Curr</label>
              <select title="Select Currency" className="input-field h-11 bg-white" value={expForm.currency} onChange={e => setExpForm(f => ({ ...f, currency: e.target.value }))}>
                {CURRENCIES.map(c => <option key={c}>{c}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label className="label">Notes</label>
            <input title="Cost Notes" placeholder="Description of the maintenance/repair" className="input-field h-11" value={expForm.notes} onChange={e => setExpForm(f => ({ ...f, notes: e.target.value }))} />
          </div>
          <button type="submit" className="btn-primary w-full h-11 shadow-lg shadow-primary/10 mt-2" disabled={saving}>{saving ? 'Logging...' : 'Record Cost'}</button>
        </form>
      </Modal>
    </div>
  );
}
