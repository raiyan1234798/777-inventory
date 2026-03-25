import { useState } from 'react';
import { useStore } from '../store';
import type { User } from '../store';
import { UserPlus, Edit2, ShieldAlert, KeyRound, MapPin, Trash2 } from 'lucide-react';
import Modal from '../components/Modal';

export default function Users() {
  const { users, addUser, updateUser, deleteUser } = useStore();
  const [isModalOpen, setIsModalOpen] = useState(false);
  
  // Form State
  const [editingUserId, setEditingUserId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<User['role']>('Shop Staff');
  const [location, setLocation] = useState('');
  const [status, setStatus] = useState<User['status']>('Active');

  const openAddModal = () => {
    setEditingUserId(null);
    setName('');
    setEmail('');
    setRole('Shop Staff');
    setLocation('');
    setStatus('Active');
    setIsModalOpen(true);
  };

  const openEditModal = (user: User) => {
    setEditingUserId(user.id);
    setName(user.name);
    setEmail(user.email);
    setRole(user.role);
    setLocation(user.location);
    setStatus(user.status);
    setIsModalOpen(true);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (editingUserId) {
      updateUser(editingUserId, { name, email, role, location, status });
    } else {
      const newUser: User = {
        id: `usr-${Date.now().toString().slice(-4)}`,
        name,
        email,
        role,
        location,
        status,
      };
      addUser(newUser);
    }
    setIsModalOpen(false);
  };

  const handleDelete = (id: string, userName: string) => {
    if (window.confirm(`Are you sure you want to delete ${userName}?`)) {
      deleteUser(id);
    }
  };

  const getRoleColor = (role: string) => {
    switch(role) {
      case 'Super Admin': return 'bg-primary/10 text-primary border-primary/20';
      case 'Admin': return 'bg-blue-100 text-blue-700 border-blue-200';
      case 'Warehouse Staff': return 'bg-orange-100 text-orange-700 border-orange-200';
      case 'Shop Staff': return 'bg-emerald-100 text-emerald-700 border-emerald-200';
      default: return 'bg-gray-100 text-gray-700 border-gray-200';
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center sm:flex-row flex-col gap-4">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 tracking-tight">User Management</h1>
          <p className="text-gray-500 mt-2">Manage roles, permissions, and location access seamlessly.</p>
        </div>
        <button className="w-full sm:w-auto btn-primary flex items-center justify-center shadow-lg shadow-primary/30" onClick={openAddModal}>
          <UserPlus className="w-5 h-5 mr-2" />
          Add User
        </button>
      </div>

      <div className="card overflow-hidden !px-0 !py-0">
        <div className="p-6 border-b border-gray-100 bg-white flex justify-between items-center">
          <h2 className="text-lg font-semibold text-gray-900 flex items-center">
            <ShieldAlert className="w-5 h-5 mr-2 text-primary" />
            Active Personnel
          </h2>
          <span className="text-sm font-medium text-gray-500">
            {users.length} Total Users
          </span>
        </div>
        
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm text-gray-500 min-w-[800px]">
            <thead className="bg-gray-50 text-xs uppercase text-gray-700">
              <tr>
                <th className="px-6 py-4 font-medium">Name</th>
                <th className="px-6 py-4 font-medium">Role</th>
                <th className="px-6 py-4 font-medium">Location ID</th>
                <th className="px-6 py-4 font-medium">Status</th>
                <th className="px-6 py-4 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 bg-white">
              {users.map((user) => (
                <tr key={user.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-6 py-4">
                    <div className="flex items-center">
                      <div className="flex-shrink-0 h-10 w-10">
                        <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold">
                          {user.name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase()}
                        </div>
                      </div>
                      <div className="ml-4">
                        <div className="font-semibold text-gray-900">{user.name}</div>
                        <div className="text-gray-500 text-xs">{user.email}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <span className={`inline-flex items-center px-2.5 py-1 rounded-md text-xs font-bold uppercase tracking-wider border ${getRoleColor(user.role)}`}>
                      {user.role === 'Super Admin' && <KeyRound className="w-3 h-3 mr-1" />}
                      {user.role}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center text-gray-700 font-medium">
                      <MapPin className="w-4 h-4 mr-1.5 text-gray-400" />
                      {user.location}
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center">
                      <div className={`h-2.5 w-2.5 rounded-full mr-2 ${user.status === 'Active' ? 'bg-success' : 'bg-danger'}`}></div>
                      {user.status}
                    </div>
                  </td>
                  <td className="px-6 py-4 text-right">
                    <div className="flex justify-end gap-2 text-sm font-medium">
                      <button onClick={() => openEditModal(user)} className="text-primary hover:text-blue-800 transition-colors flex items-center px-2 py-1 rounded hover:bg-primary/5">
                        <Edit2 className="w-4 h-4 mr-1" /> Edit
                      </button>
                      <button onClick={() => handleDelete(user.id, user.name)} className="text-danger hover:text-red-800 transition-colors flex items-center px-2 py-1 rounded hover:bg-danger/10">
                        <Trash2 className="w-4 h-4" /> 
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {users.length === 0 && (
                <tr>
                   <td colSpan={5} className="py-8 text-center text-gray-400">No users found.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <Modal 
        isOpen={isModalOpen} 
        onClose={() => setIsModalOpen(false)}
        title={editingUserId ? "Edit User" : "Add New User"}
        description={editingUserId ? "Modify the user's role and location access." : "Create credentials and assign specific access roles."}
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Full Name</label>
            <input 
              type="text" 
              className="input-field" 
              placeholder="e.g. John Doe" 
              value={name}
              onChange={e => setName(e.target.value)}
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Email Address</label>
            <input 
              type="email" 
              className="input-field" 
              placeholder="user@777global.com" 
              value={email}
              onChange={e => setEmail(e.target.value)}
              required
            />
          </div>
          
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Role Assignment</label>
              <select className="input-field py-2.5 bg-white" value={role} onChange={e => setRole(e.target.value as User['role'])}>
                <option>Shop Staff</option>
                <option>Warehouse Staff</option>
                <option>Admin</option>
                <option>Super Admin</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Location Access</label>
              <select className="input-field py-2.5 bg-white" value={location} onChange={e => setLocation(e.target.value)}>
                <option value="Global">Global (All Access)</option>
                <option value="Main WH">Main Warehouse</option>
                <option value="Mumbai Shop">Mumbai Shop</option>
                <option value="Delhi Hub">Delhi Hub</option>
              </select>
            </div>
          </div>
          
          {editingUserId && (
             <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Account Status</label>
                <select className="input-field py-2.5 bg-white" value={status} onChange={e => setStatus(e.target.value as User['status'])}>
                  <option>Active</option>
                  <option>Inactive</option>
                </select>
             </div>
          )}

          <div className="flex justify-end space-x-3 pt-6">
            <button type="button" className="btn-secondary" onClick={() => setIsModalOpen(false)}>Cancel</button>
            <button type="submit" className="btn-primary">
              {editingUserId ? "Save Changes" : "Create User"}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
