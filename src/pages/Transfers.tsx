import { useState, useMemo } from 'react';
import { ArrowRightLeft, Send, AlertTriangle, ChevronRight, Activity, Plus, Trash2, Search, Filter, Calendar, Edit3, CheckCircle, Info, X } from 'lucide-react';
import { useStore, formatCurrency, toUSD, formatDualCurrency } from '../store';
import { useAuthStore } from '../store/authStore';
import { format } from 'date-fns';
import clsx from 'clsx';
import Modal from '../components/Modal';

export default function Transfers() {
  const { appUser } = useAuthStore();
  const {
    locations,
    items,
    inventory,
    transactions,
    brands,
    transferSessions,
    deleteTransferSession,
    setTransferModalOpen,
    setTransferModalMinimized,
    setTransferForm,
    setTransferItems
  } = useStore();

  const [activeTab, setActiveTab] = useState<'sessions' | 'logs'>('sessions');
  const [sessionSearch, setSessionSearch] = useState('');
  const [logSearch, setLogSearch] = useState('');

  // Reconciliation modal state
  const [selectedSession, setSelectedSession] = useState<any | null>(null);
  const [isFixModalOpen, setIsFixModalOpen] = useState(false);
  const [fixModalSearch, setFixModalSearch] = useState('');
  const [fixItems, setFixItems] = useState<any[]>([]);
  const [fixSaving, setFixSaving] = useState(false);

  const transferLogs = useMemo(() => {
    const logs = transactions.filter(t => t.type === 'transfer');
    if (!logSearch.trim()) return logs;
    const q = logSearch.toLowerCase().trim();
    return logs.filter(t => {
      const fromName = locations.find(l => l.id === t.from_location)?.name.toLowerCase() ?? '';
      const toName = locations.find(l => l.id === t.to_location)?.name.toLowerCase() ?? '';
      const itemName = t.item_name.toLowerCase();
      const unitCostStr = t.unit_cost?.toString() || '';
      return fromName.includes(q) || toName.includes(q) || itemName.includes(q) || unitCostStr.includes(q);
    });
  }, [transactions, logSearch, locations]);

  const getLocationName = (id: string) => {
    if (id === 'supplier') return 'Supplier';
    if (id === 'customer') return 'Customer';
    return locations.find(l => l.id === id)?.name ?? id;
  };

  const openFixModal = (session: any) => {
    setSelectedSession(session);
    setFixModalSearch('');
    
    const initialFixes = session.items.map((sItem: any) => {
      const item = items.find(i => i.id === sItem.item_id);
      
      const sourceInv = inventory.find(inv => inv.location_id === session.from_location && inv.item_id === sItem.item_id);
      const destInv = inventory.find(inv => inv.location_id === session.to_location && inv.item_id === sItem.item_id);
      
      return {
        item_id: sItem.item_id,
        item_name: sItem.item_name,
        sku: sItem.sku || item?.sku || 'No SKU',
        brand: sItem.brand || (item ? (brands.find(b => b.id === item.brand_id)?.name ?? 'Unknown') : 'Unknown'),
        sessionQty: sItem.quantity,
        sourceLiveQty: sourceInv?.quantity ?? 0,
        destLiveQty: destInv?.quantity ?? 0,
        newQty: sItem.quantity,
        diff: 0,
        itemDeleted: !item
      };
    });
    
    setFixItems(initialFixes);
    setIsFixModalOpen(true);
  };

  const handleFixQtyChange = (itemId: string, val: number) => {
    setFixItems(prev => prev.map(item => {
      if (item.item_id !== itemId) return item;
      const newQty = Math.max(0, val);
      return {
        ...item,
        newQty,
        diff: newQty - item.sessionQty
      };
    }));
  };

  const handleApplyFixes = async () => {
    if (!selectedSession) return;
    const changed = fixItems.filter(r => r.diff !== 0);
    if (changed.length === 0) {
      setIsFixModalOpen(false);
      return;
    }
    
    setFixSaving(true);
    try {
      await useStore.getState().fixTransferStock(
        selectedSession.id,
        changed.map(r => ({ item_id: r.item_id, newQty: r.newQty }))
      );
      alert(`✅ Transfer stocks reconciled! ${changed.length} item(s) adjusted.`);
      setIsFixModalOpen(false);
    } catch (err: any) {
      alert('Fix failed: ' + err.message);
    } finally {
      setFixSaving(false);
    }
  };

  const handleDeleteSession = async (id: string) => {
    if (!window.confirm("⚠️ Are you sure you want to delete this transfer session log? This will NOT restore stock. It only deletes the history log.")) return;
    try {
      await deleteTransferSession(id);
      alert("✅ Transfer session log deleted.");
    } catch (err: any) {
      alert("Delete failed: " + err.message);
    }
  };

  const filteredSessions = useMemo(() => {
    if (!sessionSearch.trim()) return transferSessions;
    const q = sessionSearch.toLowerCase().trim();
    return transferSessions.filter(s => {
      const fromName = getLocationName(s.from_location).toLowerCase();
      const toName = getLocationName(s.to_location).toLowerCase();
      const note = s.notes?.toLowerCase() ?? '';
      const perf = s.performed_by?.toLowerCase() ?? '';
      const dateStr = format(new Date(s.date), 'MMM dd, yyyy').toLowerCase();
      return fromName.includes(q) || toName.includes(q) || note.includes(q) || perf.includes(q) || dateStr.includes(q);
    });
  }, [transferSessions, sessionSearch, locations]);

  const filteredFixItems = useMemo(() => {
    const q = fixModalSearch.trim().toLowerCase();
    if (!q) return fixItems;
    return fixItems.filter(item => 
      item.item_name.toLowerCase().includes(q) ||
      item.sku.toLowerCase().includes(q) ||
      item.brand.toLowerCase().includes(q)
    );
  }, [fixItems, fixModalSearch]);

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
          <p className="text-xs sm:text-sm text-gray-400 font-bold uppercase tracking-widest mt-2 ml-12 sm:ml-14 border-l-2 border-gray-100 pl-4">
            Manage and reconcile item transfers between shops and warehouses.
          </p>
        </div>
        <button
          onClick={() => {
            setTransferModalOpen(true);
            setTransferModalMinimized(false);
            setTransferForm({ from_location: '', to_location: '' });
            setTransferItems([{ brand_id: '', item_id: '', quantity: 1, _id: Date.now() }]);
          }}
          className="btn-primary flex items-center gap-2.5 text-sm justify-center shadow-xl shadow-primary/20 h-12 px-6 self-start sm:self-auto ml-12 sm:ml-0"
        >
          <Send className="w-4 h-4" /> 
          <span className="whitespace-nowrap font-black uppercase tracking-widest text-[10px]">Transfer Items</span>
        </button>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-gray-200">
        <button
          onClick={() => setActiveTab('sessions')}
          className={clsx(
            "px-6 py-3 font-bold uppercase tracking-widest text-xs border-b-2 transition-all",
            activeTab === 'sessions'
              ? "border-primary text-primary"
              : "border-transparent text-gray-400 hover:text-gray-600"
          )}
        >
          🔄 Smart Transfers (Sessions)
        </button>
        <button
          onClick={() => setActiveTab('logs')}
          className={clsx(
            "px-6 py-3 font-bold uppercase tracking-widest text-xs border-b-2 transition-all",
            activeTab === 'logs'
              ? "border-primary text-primary"
              : "border-transparent text-gray-400 hover:text-gray-600"
          )}
        >
          📋 Audit Trail (All Logs)
        </button>
      </div>

      {activeTab === 'sessions' ? (
        <div className="space-y-6">
          {/* Stats Bar */}
          <div className="responsive-grid">
            <div className="card border-0 shadow-lg shadow-gray-50 bg-gradient-to-br from-white to-gray-50/50 p-6 flex flex-col justify-between">
              <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-4">Transfer Runs</p>
              <div>
                <p className="text-3xl font-black text-gray-900 tracking-tighter tabular-nums">{transferSessions.length}</p>
                <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest mt-2">Saved Sessions</p>
              </div>
            </div>
            <div className="card border-0 shadow-lg shadow-gray-50 bg-gradient-to-br from-white to-gray-50/50 p-6 flex flex-col justify-between">
              <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-4">Total Units Transferred</p>
              <div>
                <p className="text-3xl font-black text-gray-900 tracking-tighter tabular-nums">
                  {transferSessions.reduce((acc, s) => acc + (s.totalItems || 0), 0).toLocaleString()}
                </p>
                <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest mt-2">Units Circulated</p>
              </div>
            </div>
          </div>

          {/* Search bar */}
          <div className="flex items-center gap-3 bg-white p-4 rounded-xl border border-gray-100 shadow-sm">
            <Search className="w-5 h-5 text-gray-400 flex-shrink-0" />
            <input
              type="text"
              placeholder="Search transfer history by route, notes, dates, or staff member..."
              value={sessionSearch}
              onChange={(e) => setSessionSearch(e.target.value)}
              className="flex-grow bg-transparent text-sm font-semibold outline-none text-gray-700 placeholder-gray-400"
            />
            {sessionSearch && (
              <button
                title="Clear Search"
                onClick={() => setSessionSearch('')}
                className="text-xs text-gray-400 hover:text-gray-600 font-bold uppercase"
              >
                Clear
              </button>
            )}
          </div>

          {/* Sessions List */}
          <div className="table-container shadow-xl shadow-gray-100/50">
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left min-w-[800px]">
                <thead className="bg-gray-50/50 text-[10px] uppercase text-gray-400 font-black tracking-widest">
                  <tr>
                    <th className="px-6 py-4">Date & Time</th>
                    <th className="px-6 py-4">From (Source)</th>
                    <th className="px-6 py-4">To (Destination)</th>
                    <th className="px-6 py-4 text-center">Items</th>
                    <th className="px-6 py-4 text-center">Total Units</th>
                    <th className="px-6 py-4">Staff Member</th>
                    <th className="px-6 py-4">Status</th>
                    <th className="px-6 py-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50 bg-white">
                  {filteredSessions.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="px-6 py-20 text-center flex flex-col items-center justify-center">
                        <div className="w-16 h-16 bg-gray-50 rounded-full flex items-center justify-center mb-4 mx-auto">
                          <ArrowRightLeft className="w-8 h-8 opacity-10" />
                        </div>
                        <p className="font-extrabold text-gray-700 tracking-tight">No Transfer Sessions Found</p>
                        <p className="text-[10px] text-gray-400 mt-1 uppercase tracking-tighter">Perform a stock transfer to begin recording sessions.</p>
                      </td>
                    </tr>
                  ) : (
                    filteredSessions.map((session) => (
                      <tr key={session.id} className="hover:bg-gray-50/50 transition-colors group">
                        <td className="px-6 py-5 font-semibold text-gray-900">
                          <p>{format(new Date(session.date), 'MMM dd, yyyy')}</p>
                          <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest tabular-nums mt-0.5">
                            {format(new Date(session.date), 'HH:mm')}
                          </p>
                        </td>
                        <td className="px-6 py-5 font-bold text-gray-700">
                          {getLocationName(session.from_location)}
                        </td>
                        <td className="px-6 py-5 font-bold text-primary">
                          {getLocationName(session.to_location)}
                        </td>
                        <td className="px-6 py-5 text-center font-bold text-gray-900">
                          {session.itemCount || session.items?.length || 0}
                        </td>
                        <td className="px-6 py-5 text-center font-black text-gray-900">
                          {session.totalItems || 0}
                        </td>
                        <td className="px-6 py-5 font-medium text-gray-600">
                          {session.performed_by || 'Staff'}
                        </td>
                        <td className="px-6 py-5">
                          <span
                            className={clsx(
                              "px-2.5 py-1 text-[9px] font-black uppercase tracking-widest rounded-full",
                              session.status === 'Reconciled'
                                ? "bg-emerald-50 text-emerald-700 border border-emerald-100"
                                : "bg-blue-50 text-blue-700 border border-blue-100"
                            )}
                          >
                            {session.status || 'Completed'}
                          </span>
                        </td>
                        <td className="px-6 py-5 text-right space-x-2">
                          <button
                            onClick={() => openFixModal(session)}
                            className="btn-secondary py-1.5 px-3.5 text-[10px] font-black uppercase tracking-widest inline-flex items-center gap-1 bg-white hover:bg-gray-50 shadow-sm"
                          >
                            <Edit3 className="w-3.5 h-3.5" /> Reconcile
                          </button>
                          <button
                            onClick={() => handleDeleteSession(session.id)}
                            className="text-red-400 hover:text-red-600 transition-colors p-2 inline-flex items-center"
                            title="Delete History Log"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      ) : (
        <div className="space-y-6">
          {/* Stats Bar */}
          <div className="responsive-grid">
            <div className="card border-0 shadow-lg shadow-gray-50 bg-gradient-to-br from-white to-gray-50/50 p-6 flex flex-col justify-between">
              <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-4">Total Logged Items</p>
              <div>
                <p className="text-3xl font-black text-gray-900 tracking-tighter tabular-nums">{transferLogs.length}</p>
                <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest mt-2">Individual Log Entries</p>
              </div>
            </div>
            <div className="card border-0 shadow-lg shadow-gray-50 bg-gradient-to-br from-white to-gray-50/50 p-6 flex flex-col justify-between">
              <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-4">Total Circulating Value</p>
              <div>
                <p className="text-3xl font-black text-gray-900 tracking-tighter tabular-nums">
                  {formatCurrency(transferLogs.reduce((s, t) => s + t.converted_value_USD, 0))}
                </p>
                <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest mt-2">Reconverted Capital</p>
              </div>
            </div>
          </div>

          {/* Search bar */}
          <div className="flex items-center gap-3 bg-white p-4 rounded-xl border border-gray-100 shadow-sm">
            <Search className="w-5 h-5 text-gray-400 flex-shrink-0" />
            <input
              type="text"
              placeholder="Search audit trail by item name, shop names, or unit cost..."
              value={logSearch}
              onChange={(e) => setLogSearch(e.target.value)}
              className="flex-grow bg-transparent text-sm font-semibold outline-none text-gray-700 placeholder-gray-400"
            />
            {logSearch && (
              <button
                title="Clear Search"
                onClick={() => setLogSearch('')}
                className="text-xs text-gray-400 hover:text-gray-600 font-bold uppercase"
              >
                Clear
              </button>
            )}
          </div>

          {/* Desktop Table View */}
          <div className="table-container hidden lg:block shadow-xl shadow-gray-100/50">
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left min-w-[800px]">
                <thead className="bg-gray-50/50 text-[10px] uppercase text-gray-400 font-black tracking-widest">
                  <tr>
                    <th className="px-6 py-4">Transfer Path</th>
                    <th className="px-6 py-4">Object Vector</th>
                    <th className="px-6 py-4 text-right">Quantity</th>
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
                        <p className="font-extrabold text-gray-700 tracking-tight">No Transfer Logs Found</p>
                        <p className="text-[10px] text-gray-400 mt-1 uppercase tracking-tighter">Perform a stock transfer to begin recording log entries.</p>
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
          <div className="lg:hidden">
            {transferLogs.length === 0 ? (
              <div className="text-center py-12 flex flex-col items-center">
                <div className="w-16 h-16 bg-gray-50 rounded-full flex items-center justify-center mb-4">
                  <ArrowRightLeft className="w-8 h-8 opacity-10" />
                </div>
                <p className="font-extrabold text-gray-700 tracking-tight">No Transfer Logs Found</p>
                <p className="text-[10px] text-gray-400 mt-1 uppercase tracking-tighter">Perform a stock transfer to begin recording log entries.</p>
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
      )}

      {/* Reconciliation Modal */}
      {selectedSession && (
        <Modal
          isOpen={isFixModalOpen}
          onClose={() => setIsFixModalOpen(false)}
          title="Reconcile Transfer Stocks"
          description={`Adjust and reconcile transfer mismatch for session on ${format(new Date(selectedSession.date), 'MMM dd, yyyy HH:mm')}`}
          size="lg"
        >
          <div className="space-y-6">
            <div className="p-4 bg-amber-50 border border-amber-100 rounded-2xl flex gap-3 text-xs text-amber-800 font-bold">
              <Info className="w-5 h-5 text-amber-500 flex-shrink-0" />
              <div>
                <p className="font-extrabold">Delta Stock Correction Math:</p>
                <p className="mt-1 font-semibold leading-relaxed">
                  Corrections use delta math (Δ = new Qty - reported Qty). When applying fixes:
                  <br />
                  - Source live stock gets **refunded** by -Δ (e.g. if you transferred less, source stock is returned).
                  <br />
                  - Destination live stock gets **adjusted** by +Δ (e.g. if destination received less, destination stock is decreased).
                  <br />
                  This protects interim sales and transfers!
                </p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4 bg-gray-50 p-4 rounded-xl border border-gray-100">
              <div>
                <span className="text-[10px] uppercase font-bold text-gray-400">From (Source)</span>
                <p className="text-sm font-extrabold text-gray-800 mt-1">{getLocationName(selectedSession.from_location)}</p>
              </div>
              <div>
                <span className="text-[10px] uppercase font-bold text-gray-400">To (Destination)</span>
                <p className="text-sm font-extrabold text-gray-800 mt-1">{getLocationName(selectedSession.to_location)}</p>
              </div>
            </div>

            {/* Modal Search Option */}
            <div className="relative">
              <Search className="absolute left-3.5 top-3.5 w-4 h-4 text-gray-400" />
              <input
                type="text"
                placeholder="Search items in this transfer by name, brand, or SKU..."
                value={fixModalSearch}
                onChange={(e) => setFixModalSearch(e.target.value)}
                className="input-field pl-10 h-11 text-xs font-semibold"
              />
              {fixModalSearch && (
                <button
                  onClick={() => setFixModalSearch('')}
                  className="absolute right-3 top-3.5 text-xs font-bold text-gray-400 hover:text-gray-600"
                >
                  ✕
                </button>
              )}
            </div>

            {/* Items Table inside Modal */}
            <div className="border border-gray-100 rounded-xl overflow-hidden shadow-inner max-h-[350px] overflow-y-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-gray-50 text-[10px] uppercase tracking-wider font-black text-gray-400 sticky top-0 z-10">
                  <tr>
                    <th className="px-4 py-3">Brand & Item Description</th>
                    <th className="px-4 py-3 text-center">Transferred</th>
                    <th className="px-4 py-3 text-center">Source Live</th>
                    <th className="px-4 py-3 text-center">Dest Live</th>
                    <th className="px-4 py-3 text-center" style={{ width: '110px' }}>Actual Received</th>
                    <th className="px-4 py-3 text-center">Delta</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 bg-white">
                  {filteredFixItems.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-4 py-10 text-center text-gray-400 font-bold uppercase">
                        No matching items found.
                      </td>
                    </tr>
                  ) : (
                    filteredFixItems.map((row) => {
                      const hasChanged = row.diff !== 0;
                      return (
                        <tr key={row.item_id} className={clsx("hover:bg-gray-50/50 transition-colors", hasChanged && "bg-blue-50/30")}>
                          <td className="px-4 py-3.5">
                            <div className="font-extrabold text-gray-900 flex items-center gap-1.5">
                              {row.item_name}
                              {row.itemDeleted && (
                                <span className="bg-red-50 text-red-600 text-[8px] font-black uppercase tracking-widest px-1.5 py-0.5 rounded border border-red-100">
                                  Deleted Item
                                </span>
                              )}
                            </div>
                            <div className="text-[10px] text-gray-400 font-bold uppercase tracking-wider mt-0.5">
                              SKU: {row.sku} · {row.brand}
                            </div>
                          </td>
                          <td className="px-4 py-3.5 text-center font-bold text-gray-900 tabular-nums">
                            {row.sessionQty}
                          </td>
                          <td className="px-4 py-3.5 text-center font-bold text-gray-600 tabular-nums">
                            {row.sourceLiveQty}
                          </td>
                          <td className="px-4 py-3.5 text-center font-bold text-gray-600 tabular-nums">
                            {row.destLiveQty}
                          </td>
                          <td className="px-4 py-3 text-center">
                            <input
                              type="number"
                              min={0}
                              className={clsx(
                                "w-20 text-center py-1.5 border rounded-lg font-black text-sm outline-none focus:ring-1 focus:ring-primary tabular-nums",
                                hasChanged ? "border-primary bg-primary/5 text-primary" : "border-gray-200 text-gray-800 bg-white"
                              )}
                              value={row.newQty}
                              onChange={(e) => handleFixQtyChange(row.item_id, Number(e.target.value))}
                              title="Received quantity input"
                            />
                          </td>
                          <td className="px-4 py-3.5 text-center font-bold">
                            {row.diff === 0 ? (
                              <span className="text-gray-300">—</span>
                            ) : row.diff > 0 ? (
                              <span className="text-emerald-600 font-black tabular-nums">+{row.diff}</span>
                            ) : (
                              <span className="text-red-600 font-black tabular-nums">{row.diff}</span>
                            )}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>

            <div className="flex items-center justify-between pt-4 border-t border-gray-100">
              <span className="text-xs font-bold text-gray-500">
                <span className="font-extrabold text-primary">{fixItems.filter(r => r.diff !== 0).length}</span> item(s) adjusted
              </span>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setIsFixModalOpen(false)}
                  className="btn-secondary text-xs h-10 px-4 font-bold"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={fixSaving || fixItems.filter(r => r.diff !== 0).length === 0}
                  onClick={handleApplyFixes}
                  className="btn-primary text-xs h-10 px-6 font-black uppercase tracking-widest shadow-lg shadow-primary/10"
                >
                  {fixSaving ? 'Applying...' : 'Apply Fixes'}
                </button>
              </div>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
