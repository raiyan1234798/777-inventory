import { useState } from 'react';
import { ArrowRightLeft, Send, AlertTriangle, ChevronRight, Activity, Plus, Trash2 } from 'lucide-react';
import { useStore, formatCurrency } from '../store';
import { useAuthStore } from '../store/authStore';
import { format } from 'date-fns';

export default function Transfers() {
  const { appUser } = useAuthStore();
  const { locations, items, inventory, transactions, transfer, brands, setTransferModalOpen, setTransferModalMinimized, setTransferForm, setTransferItems } = useStore();

        
  
  
  
  const transferLogs = transactions.filter(t => t.type === 'transfer');

  const getLocationName = (id: string) => {
    if (id === 'supplier') return 'Supplier';
    if (id === 'customer') return 'Customer';
    return locations.find(l => l.id === id)?.name ?? id;
  };

  // Build a label for the minimized pill — show how many items are selected
  
  
  
  const addItemRow = () => {
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
            Manage item transfers between shops.
          </p>
        </div>
        <button onClick={() => { setTransferModalOpen(true); setTransferModalMinimized(false); setTransferForm({ from_location: '', to_location: '' }); setTransferItems([{ brand_id: '', item_id: '', quantity: 1, _id: Date.now() }]); }} className="btn-primary flex items-center gap-2.5 text-sm justify-center shadow-xl shadow-primary/20 h-12 px-6 self-start sm:self-auto ml-12 sm:ml-0">
          <Send className="w-4 h-4" /> 
          <span className="whitespace-nowrap font-black uppercase tracking-widest text-[10px]">Transfer Items</span>
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
              {formatCurrency(transferLogs.reduce((s, t) => s + t.converted_value_USD, 0))}
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
       <div className="space-y-4">
         <div className="p-5 border-b border-gray-50 bg-white flex items-center justify-between">
           <h2 className="text-[11px] font-black text-gray-900 uppercase tracking-widest flex items-center gap-2">
             <Activity className="w-4 h-4 text-primary" /> Migration Audit Trail
           </h2>
           <span className="text-[10px] font-bold text-gray-300 uppercase tracking-widest">{transferLogs.length} Entries Logged</span>
         </div>
         
         {/* Desktop Table View */}
         <div className="table-container hidden lg:block shadow-xl shadow-gray-100/50">
           <div className="overflow-x-auto">
             <table className="w-full text-sm text-left min-w-[800px]">
               <thead className="bg-gray-50/50 text-[10px] uppercase text-gray-400 font-black tracking-widest">
                 <tr>
                   <th className="px-6 py-4">Transfer Path</th>
                   <th className="px-6 py-4">Object Vector</th>
                   <th className="px-6 py-4 text-right">Commitment</th>
                   <th className="px-6 py-4 text-right">Value</th>
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
                     <td className="px-6 py-5 text-right font-black text-gray-900 tabular-nums">{formatCurrency(t.converted_value_USD)}</td>
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

         {/* Mobile & Tablet Card View */}
         <div className="lg:hidden p-4 sm:p-5">
           {transferLogs.length === 0 ? (
             <div className="text-center py-12 flex flex-col items-center">
               <div className="w-16 h-16 bg-gray-50 rounded-full flex items-center justify-center mb-4">
                 <ArrowRightLeft className="w-8 h-8 opacity-10" />
               </div>
               <p className="font-extrabold text-gray-700 tracking-tight">Logic Void Identified</p>
               <p className="text-[10px] text-gray-400 mt-1 uppercase tracking-tighter">Initiate "Migration" to record system movement.</p>
             </div>
           ) : (
             <div className="space-y-3">
               {[...transferLogs].sort((a,b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()).map(t => (
                 <div key={t.id} className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm hover:shadow-md transition-all">
                   <div className="flex items-start justify-between gap-2 mb-3">
                     <div className="flex-1 min-w-0">
                       <h3 className="font-bold text-gray-900 text-sm">{t.item_name}</h3>
                       <p className="text-xs text-gray-500 mt-1">{format(new Date(t.timestamp), 'MMM dd, HH:mm')}</p>
                     </div>
                   </div>

                   <div className="grid grid-cols-2 gap-2 mb-3">
                     <div className="bg-blue-50 rounded-lg p-3 border border-blue-100">
                       <p className="text-[9px] uppercase font-bold text-blue-600 tracking-wider">Qty</p>
                       <p className="text-sm font-black text-blue-900 mt-1 tabular-nums">{t.quantity}u</p>
                     </div>
                     <div className="bg-emerald-50 rounded-lg p-3 border border-emerald-100">
                       <p className="text-[9px] uppercase font-bold text-emerald-600 tracking-wider">Value</p>
                       <p className="text-sm font-black text-emerald-900 mt-1">{formatCurrency(t.converted_value_USD)}</p>
                     </div>
                   </div>

                   <div className="bg-gray-50 rounded-lg p-3 border border-gray-100 mb-3">
                     <p className="text-[9px] uppercase font-bold text-gray-600 tracking-wider">Route</p>
                     <p className="text-xs font-bold text-gray-900 mt-1 flex items-center gap-1.5">
                       <span className="truncate">{getLocationName(t.from_location)}</span>
                       <ChevronRight className="w-3 h-3 flex-shrink-0 text-primary" />
                       <span className="truncate">{getLocationName(t.to_location)}</span>
                     </p>
                   </div>

                   <div className="flex items-center gap-2">
                     <div className="w-5 h-5 rounded-full bg-blue-50 flex items-center justify-center text-blue-500 flex-shrink-0">
                       <Activity className="w-2.5 h-2.5" />
                     </div>
                     <span className="text-xs font-bold text-gray-600 uppercase">{t.performed_by}</span>
                   </div>
                 </div>
               ))}
             </div>
           )}
         </div>
       </div>

      
    </div>
  );
}
