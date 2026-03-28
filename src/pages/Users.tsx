import { useState } from 'react';
import { Plus, Pencil, Trash2, ShieldCheck, AlertTriangle, User as UserIcon, Mail, MapPin, Search } from 'lucide-react';
import Modal from '../components/Modal';
import { useStore } from '../store';
import type { User } from '../store';
import { useAuthStore } from '../store/authStore';
import clsx from 'clsx';

type Role = User['role'];

const ROLE_LABELS: Record<Role, string> = {
  super_admin: 'Super Admin',
  admin: 'Admin',
  warehouse_staff: 'Warehouse Staff',
  shop_staff: 'Shop Staff',
};

const ROLE_COLORS: Record<Role, string> = {
  super_admin: 'bg-violet-50 text-violet-600 border-violet-100',
  admin: 'bg-blue-50 text-blue-600 border-blue-100',
  warehouse_staff: 'bg-amber-50 text-amber-600 border-amber-100',
  shop_staff: 'bg-emerald-50 text-emerald-600 border-emerald-100',
};

const emptyForm = (): Omit<User, 'id'> => ({
  name: '',
  email: '',
  role: 'shop_staff',
  location_id: '',
  status: 'Active',
});

export default function Users() {
  useAuthStore();
  const { users, locations, addUser, updateUser, deleteUser } = useStore();

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<Omit<User, 'id'>>(emptyForm());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [filterRole, setFilterRole] = useState<Role | ''>('');
  const [search, setSearch] = useState('');

  const filteredUsers = users.filter(u => {
    const matchesRole = !filterRole || u.role === filterRole;
    const matchesSearch = !search || 
      u.name.toLowerCase().includes(search.toLowerCase()) || 
      u.email.toLowerCase().includes(search.toLowerCase());
    return matchesRole && matchesSearch;
  });

  const openAdd = () => {
    setEditingId(null);
    setForm(emptyForm());
    setError('');
    setIsModalOpen(true);
  };

  const openEdit = (user: User) => {
    setEditingId(user.id);
    setForm({ name: user.name, email: user.email, role: user.role, location_id: user.location_id, status: user.status });
    setError('');
    setIsModalOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!form.name.trim() || !form.email.trim()) { setError('Name and email are required.'); return; }

    setSaving(true);
    try {
      if (editingId) {
        await updateUser(editingId, form);
      } else {
        await addUser(form);
      }
      setIsModalOpen(false);
    } catch (err: any) {
      setError(err.message ?? 'Failed to save user.');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (user: User) => {
    if (!window.confirm(`Remove user "${user.name}"? This cannot be undone.`)) return;
    await deleteUser(user.id);
  };

  const roleCount = (role: Role) => users.filter(u => u.role === role).length;

  return (
    <div className="space-y-6 lg:space-y-10 animate-in fade-in duration-500">
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-gray-900 tracking-tight flex items-center gap-3">
             <div className="p-2 sm:p-2.5 bg-primary/10 rounded-xl text-primary flex-shrink-0">
               <ShieldCheck className="w-5 h-5 sm:w-6 sm:h-6" />
            </div>
            Team Directory
          </h1>
          <p className="text-xs sm:text-sm text-gray-400 font-bold uppercase tracking-widest mt-2 ml-12 sm:ml-14 border-l-2 border-gray-100 pl-4 uppercase tracking-tighter">
            Manage access control and node assignments.
          </p>
        </div>
        <button onClick={openAdd} className="btn-primary flex items-center gap-2.5 text-sm justify-center shadow-xl shadow-primary/20 h-12 px-6 self-start sm:self-auto ml-12 sm:ml-0">
          <Plus className="w-5 h-5" /> 
          <span className="whitespace-nowrap font-black uppercase tracking-widest text-[10px]">Add Member</span>
        </button>
      </div>

      {/* Stats Grid */}
      <div className="responsive-grid">
        {(Object.keys(ROLE_LABELS) as Role[]).map(role => (
          <div key={role} className="card border-0 shadow-lg shadow-gray-50 bg-gradient-to-br from-white to-gray-50/50 p-6 flex flex-col justify-between">
            <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-4">{ROLE_LABELS[role]}</p>
            <div className="flex items-center justify-between">
              <p className="text-3xl font-black text-gray-900 tracking-tighter tabular-nums">{roleCount(role)}</p>
              <div className={clsx("w-10 h-10 rounded-xl flex items-center justify-center border", ROLE_COLORS[role])}>
                 <UserIcon className="w-5 h-5" />
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Control Strip */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-4 bg-white p-3 rounded-2xl border border-gray-100 shadow-sm">
        <div className="relative flex-1">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search team by name or email…" className="w-full pl-11 pr-4 py-2.5 bg-gray-50 border-0 rounded-xl text-sm focus:ring-2 focus:ring-primary/20 transition-all font-medium" />
        </div>
        <div className="flex overflow-x-auto no-scrollbar gap-2">
          <button
            onClick={() => setFilterRole('')}
            className={clsx(
              "px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest whitespace-nowrap transition-all border",
              filterRole === '' 
                ? 'bg-primary text-white border-primary shadow-lg shadow-primary/20' 
                : 'bg-white text-gray-500 border-gray-100 hover:bg-gray-50'
            )}
          >
            All Nodes
          </button>
          {(Object.keys(ROLE_LABELS) as Role[]).map(role => (
            <button
              key={role}
              onClick={() => setFilterRole(role)}
              className={clsx(
                "px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest whitespace-nowrap transition-all border",
                filterRole === role 
                  ? 'bg-primary text-white border-primary shadow-lg shadow-primary/20' 
                  : 'bg-white text-gray-500 border-gray-100 hover:bg-gray-50'
              )}
            >
              {ROLE_LABELS[role]}
            </button>
          ))}
        </div>
      </div>

      {/* Table Container */}
      <div className="table-container shadow-xl shadow-gray-100/50">
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left min-w-[800px]">
            <thead className="bg-gray-50 text-[10px] uppercase text-gray-400 font-black tracking-widest">
              <tr>
                <th className="px-6 py-4">Identity</th>
                <th className="px-6 py-4">Access Level</th>
                <th className="px-6 py-4 font-center">Commitment Node</th>
                <th className="px-6 py-4 text-center">Status Flag</th>
                <th className="px-6 py-4 text-right">Vectors</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50 bg-white">
              {filteredUsers.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-6 py-20 text-center flex flex-col items-center">
                    <div className="w-16 h-16 bg-gray-50 rounded-full flex items-center justify-center mb-4">
                      <UserIcon className="w-8 h-8 opacity-10" />
                    </div>
                    <p className="font-extrabold text-gray-700 tracking-tight">Identity Void Identified</p>
                    <p className="text-[10px] text-gray-400 mt-1 uppercase tracking-tighter">Adjust filters or add a "New Member" to the directory.</p>
                  </td>
                </tr>
              ) : filteredUsers.map(user => (
                <tr key={user.id} className="hover:bg-gray-50/50 transition-colors group">
                  <td className="px-6 py-5">
                    <div className="flex items-center gap-4">
                      <div className="w-10 h-10 rounded-2xl bg-primary/10 flex items-center justify-center text-primary font-black text-sm flex-shrink-0 transition-transform group-hover:scale-110">
                        {user.name.charAt(0).toUpperCase()}
                      </div>
                      <div className="min-w-0">
                        <p className="text-base font-extrabold text-gray-900 group-hover:text-primary transition-colors tracking-tight truncate">{user.name}</p>
                        <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest mt-0.5 truncate">{user.email}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-5">
                    <span className={clsx("px-3 py-1 rounded-md text-[9px] font-black uppercase tracking-widest border", ROLE_COLORS[user.role])}>
                      {ROLE_LABELS[user.role]}
                    </span>
                  </td>
                  <td className="px-6 py-5">
                    <div className="flex items-center gap-2 text-gray-600 font-bold tracking-tight">
                       <MapPin className="w-3.5 h-3.5 text-gray-300" />
                       {locations.find(l => l.id === user.location_id)?.name ?? (user.location_id || 'Global Node')}
                    </div>
                  </td>
                  <td className="px-6 py-5 text-center">
                    <span className={clsx(
                      "px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-tighter",
                      user.status === 'Active' ? 'bg-emerald-50 text-emerald-600' : 'bg-gray-100 text-gray-400'
                    )}>
                      {user.status}
                    </span>
                  </td>
                  <td className="px-6 py-5 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <button onClick={() => openEdit(user)} className="p-2.5 rounded-xl text-gray-400 hover:text-primary hover:bg-blue-50 transition-all">
                        <Pencil className="w-4 h-4" />
                      </button>
                      <button onClick={() => handleDelete(user)} className="p-2.5 rounded-xl text-gray-400 hover:text-red-500 hover:bg-red-50 transition-all">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add/Edit Modal */}
      <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} title={editingId ? 'Edit Identity' : 'Enroll Identity'} description={editingId ? 'Modify node privileges and access vectors.' : 'Initialize a new team member into the global directory.'} size="md">
        <form onSubmit={handleSave} className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <div className="md:col-span-2">
              <label className="label">Full Identity Name</label>
              <div className="relative">
                <UserIcon className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input required className="input-field h-12 pl-12 font-bold" placeholder="e.g. Arjun Sharma" value={form.name}
                  onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
              </div>
            </div>
            <div className="md:col-span-2">
              <label className="label">Electronic Mail Vector</label>
              <div className="relative">
                <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input required type="email" className="input-field h-12 pl-12 font-bold" placeholder="e.g. arjun@777global.com" value={form.email}
                  onChange={e => setForm(f => ({ ...f, email: e.target.value }))} />
              </div>
            </div>
            <div>
              <label className="label">Access Privilege</label>
              <select title="Role" className="input-field h-12 bg-white font-bold" value={form.role} onChange={e => setForm(f => ({ ...f, role: e.target.value as Role }))}>
                {(Object.keys(ROLE_LABELS) as Role[]).map(role => (
                  <option key={role} value={role}>{ROLE_LABELS[role]}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="label">Status Flag</label>
              <select title="Status" className="input-field h-12 bg-white font-bold" value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value as User['status'] }))}>
                <option value="Active">Authorized (Active)</option>
                <option value="Inactive">De-authorized (Inactive)</option>
              </select>
            </div>
            <div className="md:col-span-2">
              <label className="label">Primary Node Assignment</label>
              <select title="Location" className="input-field h-12 bg-white font-bold" value={form.location_id} onChange={e => setForm(f => ({ ...f, location_id: e.target.value }))}>
                <option value="">Global Authority / All Nodes</option>
                {locations.map(l => <option key={l.id} value={l.id}>{l.name} ({l.type})</option>)}
              </select>
            </div>
          </div>

          {error && (
            <div className="flex items-center gap-3 bg-red-50 border border-red-100 rounded-2xl p-4 text-xs font-bold text-red-600 animate-in slide-in-from-top-2">
              <AlertTriangle className="w-4 h-4 flex-shrink-0" /> {error}
            </div>
          )}

          <div className="flex flex-col-reverse sm:flex-row justify-end gap-3 pt-6 border-t border-gray-100">
            <button type="button" className="btn-secondary h-12 px-6 font-bold" onClick={() => setIsModalOpen(false)}>Abort Enrollment</button>
            <button type="submit" className="btn-primary h-12 px-10 font-black uppercase tracking-widest text-xs shadow-xl shadow-primary/20" disabled={saving}>
              {saving ? 'Processing Identity…' : editingId ? 'Commit Changes' : 'Enroll Member'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
