import React, { useState } from 'react';
import { useStore } from '../store';
import type { AuditLog } from '../store';
import { useAuthStore } from '../store/authStore';
import { db } from '../lib/firebase';
import { doc, deleteDoc } from 'firebase/firestore';
import { ShieldAlert, Trash2, Search, Filter } from 'lucide-react';
import { format } from 'date-fns';

export default function AuditLogs() {
  const logs = useStore((state) => state.auditLogs);
  const user = useAuthStore((state) => state.user);
  
  const [searchTerm, setSearchTerm] = useState('');
  const [filterAction, setFilterAction] = useState<string>('all');
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const isAdmin = user?.role === 'admin' || user?.role === 'super_admin';

  const filteredLogs = logs.filter((log) => {
    const matchesSearch = 
      log.entityName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      log.details.toLowerCase().includes(searchTerm.toLowerCase()) ||
      log.userEmail.toLowerCase().includes(searchTerm.toLowerCase());
      
    const matchesAction = filterAction === 'all' || log.action === filterAction;

    return matchesSearch && matchesAction;
  });

  const handleDelete = async (id: string) => {
    if (!isAdmin) return;
    if (!window.confirm('Are you sure you want to delete this log?')) return;
    
    setDeletingId(id);
    try {
      await deleteDoc(doc(db, 'audit_logs', id));
    } catch (error) {
      console.error('Failed to delete log:', error);
      alert('Failed to delete log. Make sure you have admin permissions.');
    } finally {
      setDeletingId(null);
    }
  };

  const getActionBadgeColor = (action: AuditLog['action']) => {
    switch (action) {
      case 'create': return 'bg-green-100 text-green-700';
      case 'update': return 'bg-blue-100 text-blue-700';
      case 'delete': return 'bg-red-100 text-red-700';
      case 'clear': return 'bg-orange-100 text-orange-700';
      default: return 'bg-gray-100 text-gray-700';
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-black text-gray-900 flex items-center gap-2">
            <ShieldAlert className="w-8 h-8 text-primary" />
            Audit Logs
          </h1>
          <p className="text-gray-500 text-sm mt-1">Track user actions, deletions, and updates.</p>
        </div>
      </div>

      <div className="bg-white p-4 rounded-2xl shadow-sm border border-gray-100 flex flex-col sm:flex-row gap-4">
        <div className="relative flex-1">
          <Search className="w-5 h-5 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder="Search logs by user, entity, or details..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="input-field pl-10"
          />
        </div>
        <div className="relative min-w-[200px]">
          <Filter className="w-5 h-5 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <select
            value={filterAction}
            onChange={(e) => setFilterAction(e.target.value)}
            className="input-field pl-10"
          >
            <option value="all">All Actions</option>
            <option value="create">Created</option>
            <option value="update">Updated</option>
            <option value="delete">Deleted</option>
            <option value="clear">Cleared</option>
          </select>
        </div>
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-gray-50/50 border-b border-gray-100">
                <th className="px-6 py-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">Timestamp</th>
                <th className="px-6 py-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">User</th>
                <th className="px-6 py-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">Action</th>
                <th className="px-6 py-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">Entity</th>
                <th className="px-6 py-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">Details</th>
                {isAdmin && <th className="px-6 py-4 text-xs font-semibold text-gray-500 uppercase tracking-wider text-right">Actions</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filteredLogs.length === 0 ? (
                <tr>
                  <td colSpan={isAdmin ? 6 : 5} className="px-6 py-8 text-center text-gray-400">
                    No logs found.
                  </td>
                </tr>
              ) : (
                filteredLogs.map((log) => (
                  <tr key={log.id} className="hover:bg-gray-50/50 transition-colors">
                    <td className="px-6 py-4">
                      <div className="text-sm font-medium text-gray-900">
                        {format(new Date(log.timestamp), 'MMM d, yyyy')}
                      </div>
                      <div className="text-xs text-gray-500">
                        {format(new Date(log.timestamp), 'h:mm:ss a')}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <span className="text-sm text-gray-700 font-medium">{log.userEmail}</span>
                    </td>
                    <td className="px-6 py-4">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-bold uppercase tracking-wider ${getActionBadgeColor(log.action)}`}>
                        {log.action}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <div className="text-sm font-medium text-gray-900">{log.entityName}</div>
                      <div className="text-xs text-gray-500 uppercase tracking-wider">{log.entityType}</div>
                    </td>
                    <td className="px-6 py-4">
                      <span className="text-sm text-gray-600 line-clamp-2" title={log.details}>
                        {log.details}
                      </span>
                    </td>
                    {isAdmin && (
                      <td className="px-6 py-4 text-right">
                        <button
                          onClick={() => handleDelete(log.id)}
                          disabled={deletingId === log.id}
                          className="text-gray-400 hover:text-red-600 transition-colors disabled:opacity-50"
                          title="Delete Log"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </td>
                    )}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
