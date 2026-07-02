import { useState } from 'react';
import { RotateCcw, Plus, AlertTriangle, Search, MapPin, Image as ImageIcon, FileUp, X, Trash2 } from 'lucide-react';
import Modal from '../components/Modal';
import { useStore, hasPermission } from '../store';
import type { User } from '../store';
import { useAuthStore } from '../store/authStore';
import { format } from 'date-fns';
import clsx from 'clsx';

export default function Returns() {
  const { appUser } = useAuthStore();
  const { setReturnModalOpen, setReturnModalMinimized } = useStore();
  const { locations, items, brands, inventory, returns: returnRecords, processReturn } = useStore();

  const [filterType, setFilterType] = useState<'' | 'sale_return' | 'warehouse_return'>('');
  const [viewProof, setViewProof] = useState<string | null>(null);


  const filteredReturns = filterType
    ? returnRecords.filter(r => r.type === filterType)
    : returnRecords;

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
        <button onClick={() => { setReturnModalOpen(true); setReturnModalMinimized(false); }} className="btn-primary flex items-center gap-2.5 text-sm justify-center shadow-xl shadow-primary/20 h-12 px-6 self-start sm:self-auto ml-12 sm:ml-0">
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
         <div className="space-y-4">
            <div className="p-5 border-b border-gray-50 bg-gray-50/30 flex items-center justify-between">
              <h2 className="text-[11px] font-black text-gray-900 uppercase tracking-widest">Return Control Logs</h2>
              <div className="flex items-center gap-2 sm:gap-4">
                 <span className="text-[10px] font-bold text-gray-300 uppercase tracking-widest">{filteredReturns.length} Records</span>
                 <button className="text-gray-300 hover:text-primary transition-colors"><Search className="w-4 h-4" /></button>
              </div>
            </div>
            
            {/* Desktop Table View */}
            <div className="table-container hidden lg:block">
              <div className="overflow-x-auto">
                <table className="w-full text-sm text-left min-w-[900px]">
                  <thead className="bg-gray-50/50 text-[10px] uppercase text-gray-400 font-bold tracking-wider">
                    <tr>
                      <th className="px-6 py-4">Returned Item</th>
                      <th className="px-6 py-4">Sequence</th>
                      <th className="px-6 py-4">Location</th>
                      <th className="px-6 py-4 text-right">Units</th>
                      <th className="px-6 py-4">Status Flag</th>
                      <th className="px-6 py-4">Processed By</th>
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
                          <p className="text-xs text-gray-400 mt-1 uppercase tracking-tighter">Inventory levels updated.</p>
                        </td>
                      </tr>
                    ) : (
                      [...filteredReturns].sort((a,b) => new Date(b.timestamp || 0).getTime() - new Date(a.timestamp || 0).getTime()).map(r => (
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
                            {r.type === 'sale_return' ? 'Sale Reverse' : 'Warehouse Return'}
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
                           {r.image_proof && (
                             <button onClick={() => setViewProof(r.image_proof!)} className="p-1.5 bg-gray-100 hover:bg-gray-200 rounded-lg text-gray-600 transition-colors" title="View Proof">
                               <ImageIcon className="w-4 h-4" />
                             </button>
                           )}
                           {hasPermission(appUser as User, 'manage_warehouses') && (
                             <button
                               onClick={async () => {
                                 if (window.confirm(`Are you sure you want to delete this return for ${r.item_name}?`)) {
                                   try {
                                     await useStore.getState().deleteReturn(r.id);
                                   } catch (e: any) {
                                     alert('Failed to delete return: ' + e.message);
                                   }
                                 }
                               }}
                               className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                               title="Delete Return"
                             >
                               <Trash2 className="w-4 h-4" />
                             </button>
                           )}
                          </div>
                        </td>
                        <td className="px-6 py-5">
                          <span className="text-xs font-bold text-gray-500 uppercase tracking-wider">{r.performed_by || 'System/Legacy'}</span>
                        </td>
                        <td className="px-6 py-5 text-gray-400 text-[11px] font-bold tabular-nums">
                          {r.timestamp ? format(new Date(r.timestamp), 'MMM dd, yyyy HH:mm') : '—'}
                        </td>
                      </tr>
                    ))
                   )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Mobile & Tablet Card View */}
            <div className="lg:hidden p-4 sm:p-5">
              {filteredReturns.length === 0 ? (
                <div className="text-center py-12 flex flex-col items-center">
                  <div className="w-16 h-16 bg-gray-50 rounded-full flex items-center justify-center mb-4">
                    <RotateCcw className="w-8 h-8 opacity-10" />
                  </div>
                  <p className="font-extrabold text-gray-700 tracking-tight">Zero Reversal History</p>
                  <p className="text-xs text-gray-400 mt-1 uppercase tracking-tighter">Inventory levels updated.</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {[...filteredReturns].sort((a,b) => new Date(b.timestamp || 0).getTime() - new Date(a.timestamp || 0).getTime()).map(r => (
                    <div key={r.id} className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm hover:shadow-md transition-all">
                      <div className="flex justify-between items-start gap-2 mb-3">
                        <div className="flex-1 min-w-0">
                          <h3 className="font-bold text-gray-900 text-sm">{r.item_name}</h3>
                          <p className="text-xs text-gray-500 mt-1 italic">{r.reason || 'No causal log provided'}</p>
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-2 mb-3">
                        <div className="bg-blue-50 rounded-lg p-3 border border-blue-100">
                          <p className="text-[9px] uppercase font-bold text-blue-600 tracking-wider">Units</p>
                          <p className="text-sm font-black text-blue-900 mt-1 tabular-nums">{r.quantity}</p>
                        </div>
                        <div className="bg-gray-50 rounded-lg p-3 border border-gray-100">
                          <p className="text-[9px] uppercase font-bold text-gray-600 tracking-wider">Type</p>
                          <p className="text-xs font-bold text-gray-900 mt-1">{r.type === 'sale_return' ? 'Sale' : 'Flowback'}</p>
                        </div>
                      </div>

                      <div className="bg-gray-50 rounded-lg p-3 border border-gray-100 mb-3">
                        <p className="text-[9px] uppercase font-bold text-gray-600 tracking-wider">Location</p>
                        <p className="text-xs font-bold text-gray-900 mt-1">{locations.find(l => l.id === r.location_id)?.name ?? r.location_id}</p>
                      </div>

                      <div className="flex items-center justify-between">
                        <div className="flex items-center">
                          <span className={clsx(
                            "px-3 py-1 rounded-full text-[10px] font-black shadow-sm",
                            r.status === 'Restocked' ? 'bg-emerald-500 text-white' : 'bg-red-500 text-white'
                          )}>
                            {r.status}
                          </span>
                          {r.image_proof && (
                            <button onClick={() => setViewProof(r.image_proof!)} className="ml-2 p-1 bg-gray-100 hover:bg-gray-200 rounded-lg text-gray-600 transition-colors" title="View Proof">
                              <ImageIcon className="w-3.5 h-3.5" />
                            </button>
                          )}
                          {hasPermission(appUser as User, 'manage_warehouses') && (
                            <button
                              onClick={async () => {
                                if (window.confirm(`Are you sure you want to delete this return for ${r.item_name}?`)) {
                                  try {
                                    await useStore.getState().deleteReturn(r.id);
                                  } catch (e: any) {
                                    alert('Failed to delete return: ' + e.message);
                                  }
                                }
                              }}
                              className="ml-2 p-1 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                              title="Delete Return"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                        <div className="flex flex-col items-end">
                          <p className="text-gray-900 text-[10px] font-bold uppercase tracking-widest">{r.performed_by || 'System/Legacy'}</p>
                          <p className="text-gray-400 text-[9px] font-bold">{r.timestamp ? format(new Date(r.timestamp), 'MMM dd, HH:mm') : '—'}</p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
         </div>
      </div>



      <Modal isOpen={!!viewProof} onClose={() => setViewProof(null)} title="Image Proof" size="md">
        {viewProof && (
          <div className="flex justify-center p-4 bg-gray-50 rounded-xl mt-2 border border-gray-100">
            <img src={viewProof} alt="Return Proof" className="max-w-full max-h-[70vh] rounded-lg shadow-sm" />
          </div>
        )}
      </Modal>
    </div>
  );
}

