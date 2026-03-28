import { useState, useMemo } from 'react';
import { 
  Store, Plus, Edit2, Trash2, MapPin, 
  User as UserIcon, Phone, 
  TrendingUp, BarChart3, Receipt
} from 'lucide-react';
import clsx from 'clsx';
import Modal from '../components/Modal';
import { 
  useStore, COUNTRIES, CURRENCIES, formatCurrency, toINR 
} from '../store';
import { format } from 'date-fns';

export default function ManageShops() {
  const { 
    locations, sales, expenses, targets,
    addLocation, updateLocation, deleteLocation,
    addExpense, deleteExpense, setTarget
  } = useStore();

  const shops = locations.filter(l => l.type === 'shop');
  
  const [activeTab, setActiveTab] = useState<'list' | 'expenses' | 'performance'>('list');
  const [isLocModal, setIsLocModal] = useState(false);
  const [isExpModal, setIsExpModal] = useState(false);
  const [isTargetModal, setIsTargetModal] = useState(false);
  const [editingLoc, setEditingLoc] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Forms
  const [locForm, setLocForm] = useState({
    name: '', country: 'India', currency: 'INR',
    manager: '', contact: '', address: ''
  });

  const [expForm, setExpForm] = useState({
    location_id: '', category: 'Rent', amount: 0,
    currency: 'INR', date: new Date().toISOString().split('T')[0], notes: ''
  });

  const [targetForm, setTargetForm] = useState({
    location_id: '', target_amount_INR: 0, month: format(new Date(), 'yyyy-MM')
  });

  // Shop Performance Analytics
  const shopStats = useMemo(() => {
    const now = format(new Date(), 'yyyy-MM');
    return shops.map(shop => {
      const shopSales = sales.filter(s => s.location_id === shop.id);
      const shopExpenses = expenses.filter(e => e.location_id === shop.id);
      const shopTarget = targets.find(t => t.location_id === shop.id && t.month === now);
      
      const rev = shopSales.reduce((sum, s) => sum + s.converted_price_INR, 0);
      const prof = shopSales.reduce((sum, s) => sum + s.profit_INR, 0);
      const exp = shopExpenses.reduce((sum, e) => sum + e.converted_amount_INR, 0);
      
      return {
        ...shop,
        revenue: rev,
        profit: prof - exp, // Net profit after expenses
        expenses: exp,
        target: shopTarget?.target_amount_INR ?? 0,
        progress: shopTarget ? (rev / shopTarget.target_amount_INR) * 100 : 0
      };
    });
  }, [shops, sales, expenses, targets]);

  const handleLocSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      if (editingLoc) {
        await updateLocation(editingLoc, locForm);
      } else {
        await addLocation({ ...locForm, type: 'shop' });
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
        converted_amount_INR: toINR(expForm.amount, expForm.currency)
      });
      setIsExpModal(false);
      setExpForm({ ...expForm, amount: 0, notes: '' });
    } finally {
      setSaving(false);
    }
  };

  const handleTargetSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await setTarget(targetForm);
      setIsTargetModal(false);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 tracking-tight">Shop Management</h1>
          <p className="text-xs sm:text-sm text-gray-500 mt-1">Configure shop profiles, track local expenses, and monitor targets.</p>
        </div>
        <div className="flex flex-col sm:flex-row gap-2 sm:items-center">
          <button onClick={() => { setIsTargetModal(true); }} className="btn-secondary flex items-center gap-2 text-sm justify-center">
            <TrendingUp className="w-4 h-4" /> 
            <span className="whitespace-nowrap">Set Target</span>
          </button>
          <button onClick={() => { setEditingLoc(null); setIsLocModal(true); }} className="btn-primary flex items-center gap-2 text-sm justify-center shadow-lg shadow-primary/20">
            <Plus className="w-4 h-4" /> 
            <span className="whitespace-nowrap">Add Shop</span>
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-gray-100 overflow-x-auto no-scrollbar scroll-smooth">
        {[
          { id: 'list', label: 'Shop List', icon: Store },
          { id: 'expenses', label: 'Shop Expenses', icon: Receipt },
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
          {shops.map(shop => (
            <div key={shop.id} className="bg-white rounded-2xl border border-gray-100 shadow-sm hover:shadow-xl transition-all overflow-hidden group">
              <div className="p-5 border-b border-gray-50">
                <div className="flex justify-between items-start">
                  <div className="flex items-center gap-3">
                    <div className="p-2.5 bg-blue-50 rounded-xl text-primary font-bold">
                      <Store className="w-5 h-5" />
                    </div>
                    <div>
                      <h3 className="font-bold text-gray-900 group-hover:text-primary transition-colors">{shop.name}</h3>
                      <p className="text-[10px] text-gray-400 font-bold uppercase tracking-wider mt-0.5">{shop.country} · {shop.currency}</p>
                    </div>
                  </div>
                  <div className="flex gap-1">
                    <button 
                      title="Edit Shop"
                      onClick={() => { 
                        setEditingLoc(shop.id); 
                        setLocForm({
                          name: shop.name,
                          country: shop.country,
                          currency: shop.currency,
                          manager: shop.manager || '',
                          contact: shop.contact || '',
                          address: shop.address || ''
                        }); 
                        setIsLocModal(true); 
                      }} 
                      className="p-2 text-gray-400 hover:text-blue-500 hover:bg-blue-50 rounded-lg transition-all"
                    >
                      <Edit2 className="w-4 h-4" />
                    </button>
                    <button 
                      title="Delete Shop"
                      onClick={() => deleteLocation(shop.id)} 
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
                  <span className="font-medium">{shop.manager || 'No manager assigned'}</span>
                </div>
                <div className="flex items-center gap-3 text-sm text-gray-600">
                  <div className="w-8 h-8 rounded-full bg-gray-50 flex items-center justify-center flex-shrink-0">
                    <Phone className="w-4 h-4 text-gray-400" />
                  </div>
                  <span className="font-medium">{shop.contact || 'No contact info'}</span>
                </div>
                <div className="flex items-start gap-3 text-sm text-gray-600">
                  <div className="w-8 h-8 rounded-full bg-gray-50 flex items-center justify-center flex-shrink-0 mt-0.5">
                    <MapPin className="w-4 h-4 text-gray-400" />
                  </div>
                  <span className="leading-relaxed font-medium line-clamp-2">{shop.address || 'No address provided'}</span>
                </div>
              </div>
            </div>
          ))}
          {shops.length === 0 && (
            <div className="col-span-full py-20 text-center text-gray-400 bg-white rounded-2xl border-2 border-dashed border-gray-100">
              <div className="w-16 h-16 bg-gray-50 rounded-full flex items-center justify-center mx-auto mb-4">
                <Store className="w-8 h-8 opacity-20" />
              </div>
              <p className="font-bold text-gray-500">No shops registered yet</p>
              <p className="text-sm mt-1">Add your first retail outlet to start tracking performance.</p>
            </div>
          )}
        </div>
      )}

      {activeTab === 'expenses' && (
        <div className="table-container">
          <div className="p-5 border-b border-gray-50 flex flex-col sm:flex-row justify-between sm:items-center gap-4">
            <h2 className="text-sm font-bold text-gray-900">Recent Shop Expenses</h2>
            <button onClick={() => setIsExpModal(true)} className="btn-primary text-xs flex items-center gap-2 justify-center shadow-md shadow-primary/10">
              <Plus className="w-3.5 h-3.5" /> Log Expense
            </button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left min-w-[600px]">
              <thead className="bg-gray-50 text-[10px] uppercase text-gray-400 font-bold tracking-wider">
                <tr>
                  <th className="px-6 py-4">Shop</th>
                  <th className="px-6 py-4">Category</th>
                  <th className="px-6 py-4 text-right">Amount</th>
                  <th className="px-6 py-4">Date</th>
                  <th className="px-6 py-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50 bg-white">
                {expenses.map(e => (
                  <tr key={e.id} className="hover:bg-gray-50/50 transition-colors group">
                    <td className="px-6 py-4 font-semibold text-gray-900">{shops.find(s => s.id === e.location_id)?.name}</td>
                    <td className="px-6 py-4">
                      <span className="px-2 py-0.5 rounded-full bg-gray-100 text-gray-600 text-[11px] font-medium">{e.category}</span>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <span className="font-bold text-gray-900">{formatCurrency(e.amount, e.currency)}</span>
                      <p className="text-[10px] text-gray-400 font-medium">≈ {formatCurrency(e.converted_amount_INR)}</p>
                    </td>
                    <td className="px-6 py-4 text-gray-500 text-[11px]">{format(new Date(e.date), 'MMM dd, yyyy')}</td>
                    <td className="px-6 py-4 text-right">
                      <button title="Delete Expense" onClick={() => deleteExpense(e.id)} className="p-2 text-gray-400 hover:text-red-500 transition-colors"><Trash2 className="w-4 h-4" /></button>
                    </td>
                  </tr>
                ))}
                {expenses.length === 0 && (
                  <tr><td colSpan={5} className="px-6 py-12 text-center text-gray-400">No expenses recorded.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {activeTab === 'performance' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {shopStats.map(stat => (
              <div key={stat.id} className="bg-white rounded-2xl border border-gray-100 p-6 shadow-sm hover:shadow-lg transition-all">
                <div className="flex justify-between items-start mb-6">
                  <div>
                    <h3 className="font-extrabold text-gray-900 leading-tight">{stat.name}</h3>
                    <p className="text-[10px] text-gray-400 font-bold uppercase tracking-wider mt-1">Monthly Performance</p>
                  </div>
                  <div className={clsx(
                    "px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-tighter",
                    stat.progress >= 100 ? 'bg-emerald-50 text-emerald-600' : 'bg-blue-50 text-blue-600'
                  )}>
                    {stat.progress.toFixed(0)}% Target
                  </div>
                </div>
                
                <div className="space-y-6">
                  <div className="w-full bg-gray-50 rounded-full h-2 overflow-hidden border border-gray-100">
                    <div 
                      className={clsx("h-2 rounded-full transition-all duration-1000", stat.progress >= 100 ? "bg-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.3)]" : "bg-primary")}
                      style={{ 
                        width: `${Math.min(stat.progress, 100)}%`
                      }} 
                    />
                  </div>
                  
                  <div className="grid grid-cols-2 gap-6 pt-2">
                    <div>
                      <p className="text-[9px] uppercase font-black text-gray-400 mb-1 tracking-widest">Revenue</p>
                      <p className="text-xl font-black text-gray-900">{formatCurrency(stat.revenue)}</p>
                    </div>
                    <div>
                      <p className="text-[9px] uppercase font-black text-gray-400 mb-1 tracking-widest">Net Profit</p>
                      <p className={clsx("text-xl font-black", stat.profit >= 0 ? 'text-emerald-600' : 'text-red-500')}>
                        {formatCurrency(stat.profit)}
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Modals remains unchanged but ensures responsive padding */}
      <Modal isOpen={isLocModal} onClose={() => setIsLocModal(false)} title={editingLoc ? "Edit Shop" : "Add New Shop"} description="Manage shop profile and local settings." size="md">
        <form onSubmit={handleLocSubmit} className="space-y-5">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <div className="md:col-span-2">
              <label className="label">Shop Name</label>
              <input title="Shop Name" placeholder="e.g. Dubai Mall Outlet" required className="input-field h-11" value={locForm.name} onChange={e => setLocForm(f => ({ ...f, name: e.target.value }))} />
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
              <label className="label">Manager</label>
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
            <button type="submit" className="btn-primary h-11" disabled={saving}>{saving ? 'Saving...' : editingLoc ? 'Update Shop' : 'Add Shop'}</button>
          </div>
        </form>
      </Modal>

      <Modal isOpen={isExpModal} onClose={() => setIsExpModal(false)} title="Log Shop Expense" description="Record rent, utilities, or other local costs." size="sm">
        <form onSubmit={handleExpSubmit} className="space-y-5">
          <div>
            <label className="label">Shop</label>
            <select title="Select Shop" required className="input-field h-11 bg-white" value={expForm.location_id} onChange={e => {
                 const s = shops.find(x => x.id === e.target.value);
                 setExpForm(f => ({ ...f, location_id: e.target.value, currency: s?.currency ?? 'INR' }));
            }}>
              <option value="">Select shop...</option>
              {shops.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
            <div>
              <label className="label">Category</label>
              <select title="Category" className="input-field h-11 bg-white" value={expForm.category} onChange={e => setExpForm(f => ({ ...f, category: e.target.value }))}>
                {['Rent', 'Electricity', 'Water', 'Staff Salary', 'Internet', 'Taxes', 'Other'].map(c => <option key={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Date</label>
              <input title="Expense Date" required type="date" className="input-field h-11 bg-white" value={expForm.date} onChange={e => setExpForm(f => ({ ...f, date: e.target.value }))} />
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
            <input title="Expense Notes" placeholder="Description of the expense" className="input-field h-11" value={expForm.notes} onChange={e => setExpForm(f => ({ ...f, notes: e.target.value }))} />
          </div>
          <button type="submit" className="btn-primary w-full h-11 shadow-lg shadow-primary/10 mt-2" disabled={saving}>{saving ? 'Logging...' : 'Record Expense'}</button>
        </form>
      </Modal>

      <Modal isOpen={isTargetModal} onClose={() => setIsTargetModal(false)} title="Set Monthly Target" description="Define sales goal for a shop." size="sm">
        <form onSubmit={handleTargetSubmit} className="space-y-5">
          <div>
            <label className="label">Shop</label>
            <select title="Select Shop" required className="input-field h-11 bg-white" value={targetForm.location_id} onChange={e => setTargetForm(f => ({ ...f, location_id: e.target.value }))}>
              <option value="">Select shop...</option>
              {shops.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Month</label>
            <input 
              title="Target Month"
              placeholder="e.g. 2024-05" 
              required 
              type="text" 
              onFocus={(e) => (e.target.type = 'month')}
              onBlur={(e) => (e.target.type = 'text')}
              className="input-field h-11 bg-white" 
              value={targetForm.month} 
              onChange={e => setTargetForm(f => ({ ...f, month: e.target.value }))} 
            />
          </div>
          <div>
            <label className="label">Revenue Target (INR)</label>
            <input title="Target Revenue" placeholder="₹ 0.00" required type="number" min={1} className="input-field h-11 font-bold" value={targetForm.target_amount_INR || ''} onChange={e => setTargetForm(f => ({ ...f, target_amount_INR: Number(e.target.value) }))} />
          </div>
          <button type="submit" className="btn-primary w-full h-11 shadow-lg shadow-primary/10 mt-2" disabled={saving}>Set Monthly Target</button>
        </form>
      </Modal>
    </div>
  );
}
