import { Users as UsersIcon, UserPlus, Shield } from 'lucide-react';

export default function Users() {
  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center sm:flex-row flex-col gap-4">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 tracking-tight">User Management</h1>
          <p className="text-gray-500 mt-2">Manage roles, permissions, and location access.</p>
        </div>
        <button className="btn-primary flex items-center shadow-lg shadow-primary/30">
          <UserPlus className="w-4 h-4 mr-2" />
          Add User
        </button>
      </div>

      <div className="card overflow-hidden !px-0 !py-0 mt-8">
        <div className="p-6 border-b border-gray-100 bg-white flex justify-between items-center">
          <h2 className="text-lg font-semibold text-gray-900 flex items-center">
            <UsersIcon className="w-5 h-5 mr-2 text-primary" />
            Active Personnel
          </h2>
          <span className="text-sm text-gray-500">12 Total Users</span>
        </div>
        
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm text-gray-500">
            <thead className="bg-gray-50 text-xs uppercase text-gray-700">
              <tr>
                <th className="px-6 py-4 font-medium">Name</th>
                <th className="px-6 py-4 font-medium">Role</th>
                <th className="px-6 py-4 font-medium">Location ID</th>
                <th className="px-6 py-4 font-medium text-center">Status</th>
                <th className="px-6 py-4 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 bg-white">
              {[
                { name: 'Rayan Admin', role: 'super_admin', location: 'Global' },
                { name: 'Ayesha Khan', role: 'admin', location: 'India HQ' },
                { name: 'Rahul Sharma', role: 'warehouse_staff', location: 'Main WH' },
                { name: 'Priya Patel', role: 'shop_staff', location: 'Mumbai Shop' },
              ].map((user, i) => (
                <tr key={i} className="hover:bg-gray-50 transition-colors">
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex items-center">
                      <div className="w-8 h-8 rounded-full bg-primary/20 flex flex-shrink-0 items-center justify-center text-primary font-bold text-xs uppercase">
                        {user.name.substring(0, 2)}
                      </div>
                      <div className="ml-3">
                        <p className="text-sm font-semibold text-gray-900">{user.name}</p>
                        <p className="text-xs text-gray-500">user{i}@777global.com</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <span className={`inline-flex items-center px-2 py-1 rounded text-xs font-semibold
                      ${user.role === 'super_admin' ? 'bg-indigo-100 text-indigo-700' :
                        user.role === 'admin' ? 'bg-blue-100 text-blue-700' :
                        user.role === 'warehouse_staff' ? 'bg-orange-100 text-orange-700' :
                        'bg-green-100 text-green-700'}`}>
                      {user.role === 'super_admin' && <Shield className="w-3 h-3 mr-1" />}
                      {user.role.replace('_', ' ').toUpperCase()}
                    </span>
                  </td>
                  <td className="px-6 py-4 font-medium text-gray-900">{user.location}</td>
                  <td className="px-6 py-4 text-center">
                    <span className="w-2 h-2 rounded-full bg-success inline-block"></span>
                  </td>
                  <td className="px-6 py-4 text-right text-sm font-medium">
                    <button className="text-primary hover:text-blue-700">Edit</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
