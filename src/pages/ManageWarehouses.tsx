import { useState, useMemo } from 'react';
import { 
  Building2, Plus, Edit2, Trash2, MapPin, 
  User as UserIcon, Phone, 
  BarChart3, Package
} from 'lucide-react';
import clsx from 'clsx';
import Modal from '../components/Modal';
import { 
  useStore, COUNTRIES, CURRENCIES, formatCurrency
} from '../store';

export default function ManageWarehouses() {
  const { 
    locations, transactions, users,
    addLocation, updateLocation, deleteLocation
  } = useStore();

  const warehouses = locations.filter(l => l.type === 'warehouse');
  
  const [activeTab, setActiveTab] = useState<'list' | 'inventory' | 'performance'>('list');
  const [isLocModal, setIsLocModal] = useState(false);
  const [editingLoc, setEditingLoc] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Forms
  const [locForm, setLocForm] = useState({
    name: '', country: 'India', currency: 'INR',
    manager: '', contact: '', address: ''
  });

  // Warehouse Performance Analytics
  const warehouseStats = useMemo(() => {
    return warehouses.map(warehouse => {
      const warehouseTransactions = transactions.filter(t => 
        t.from_location === warehouse.id || t.to_location === warehouse.id
      );
      
      const stockEntries = warehouseTransactions.filter(t => t.type === 'stock_entry' && t.to_location === warehouse.id);
      const transfers = warehouseTransactions.filter(t => t.type === 'transfer');
      const outgoing = transfers.filter(t => t.from_location === warehouse.id);
      const incoming = transfers.filter(t => t.to_location === warehouse.id);
      
      const totalStockValue = stockEntries.reduce((sum, t) => sum + t.converted_value_INR, 0);
      const totalTransferred = outgoing.reduce((sum, t) => sum + t.converted_value_INR, 0);
      
      return {
        ...warehouse,
        totalStockValue,
        totalTransferred,
        stockEntries: stockEntries.length,
        outgoingTransfers: outgoing.length,
        incomingTransfers: incoming.length,
        staffAssigned: users.filter(u => u.location_id === warehouse.id && u.role === 'warehouse_staff').length
      };
    });
  }, [warehouses, transactions, users]);

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

  const handleEditClick = (loc: any) => {
    setEditingLoc(loc.id);
    setLocForm({
      name: loc.name,
      country: loc.country,
      currency: loc.currency,
      manager: loc.manager || '',
      contact: loc.contact || '',
      address: loc.address || ''
    });
    setIsLocModal(true);
  };

  const handleDeleteClick = async (id: string, name: string) => {
    if (window.confirm(`Are you sure you want to delete warehouse "${name}"? This action cannot be undone.`)) {
      try {
        setSaving(true);
        await deleteLocation(id);
      } catch (err: any) {
        alert(err.message);
      } finally {
        setSaving(false);
      }
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 tracking-tight">Warehouse Management</h1>
          <p className="text-xs sm:text-sm text-gray-500 mt-1">Configure warehouse profiles, track inventory value, and monitor staff allocation.</p>
        </div>
        <button 
          onClick={() => { 
            setEditingLoc(null); 
            setLocForm({ name: '', country: 'India', currency: 'INR', manager: '', contact: '', address: '' });
            setIsLocModal(true); 
          }} 
          className="btn-primary flex items-center gap-2 text-sm justify-center shadow-lg shadow-primary/20 w-full sm:w-auto"
        >
          <Plus className="w-4 h-4" /> 
          <span className="whitespace-nowrap">Add Warehouse</span>
        </button>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-gray-100 overflow-x-auto no-scrollbar scroll-smooth">
        {[
          { id: 'list', label: 'Warehouse List', icon: Building2 },
          { id: 'inventory', label: 'Inventory Tracking', icon: Package },
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

      {/* LIST TAB */}
      {activeTab === 'list' && (
        <div className="card overflow-hidden">
          {warehouses.length === 0 ? (
            <div className="p-12 text-center">
              <Building2 className="w-12 h-12 text-gray-300 mx-auto mb-4" />
              <p className="text-gray-500">No warehouses configured yet. Add your first warehouse to get started.</p>
            </div>
          ) : (
            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3 p-6">
              {warehouses.map(wh => (
                <div key={wh.id} className="border border-gray-200 rounded-xl p-6 hover:shadow-lg transition-shadow">
                  <div className="flex items-start justify-between mb-4">
                    <div>
                      <h3 className="text-lg font-semibold text-gray-900">{wh.name}</h3>
                      <p className="text-sm text-gray-500 mt-1">
                        <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-700">
                          {wh.country}
                        </span>
                      </p>
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => handleEditClick(wh)}
                        className="p-2 text-gray-500 hover:bg-blue-50 hover:text-blue-600 rounded-lg transition-colors"
                        title="Edit"
                      >
                        <Edit2 className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleDeleteClick(wh.id, wh.name)}
                        className="p-2 text-gray-500 hover:bg-red-50 hover:text-red-600 rounded-lg transition-colors"
                        title="Delete"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  <div className="space-y-3 text-sm">
                    {wh.manager && (
                      <div className="flex items-center gap-2 text-gray-600">
                        <UserIcon className="w-4 h-4 text-gray-400" />
                        <span>{wh.manager}</span>
                      </div>
                    )}
                    {wh.contact && (
                      <div className="flex items-center gap-2 text-gray-600">
                        <Phone className="w-4 h-4 text-gray-400" />
                        <span>{wh.contact}</span>
                      </div>
                    )}
                    {wh.address && (
                      <div className="flex items-start gap-2 text-gray-600">
                        <MapPin className="w-4 h-4 text-gray-400 flex-shrink-0 mt-0.5" />
                        <span className="break-words">{wh.address}</span>
                      </div>
                    )}
                    {wh.currency && (
                      <div className="pt-3 border-t border-gray-100 text-gray-700 font-medium">
                        Currency: {wh.currency}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* INVENTORY TRACKING TAB */}
      {activeTab === 'inventory' && (
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm text-gray-600">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="px-6 py-4 font-semibold text-gray-900">Warehouse</th>
                  <th className="px-6 py-4 font-semibold text-gray-900">Location</th>
                  <th className="px-6 py-4 font-semibold text-gray-900 text-right">Stock Entries</th>
                  <th className="px-6 py-4 font-semibold text-gray-900 text-right">Total Stock Value</th>
                  <th className="px-6 py-4 font-semibold text-gray-900 text-right">Transferred Out</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {warehouseStats.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-6 py-8 text-center text-gray-500">No warehouse data available</td>
                  </tr>
                ) : (
                  warehouseStats.map(stat => (
                    <tr key={stat.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-6 py-4 font-medium text-gray-900">{stat.name}</td>
                      <td className="px-6 py-4">
                        <span className="text-xs bg-gray-100 text-gray-700 px-3 py-1 rounded-full">{stat.country}</span>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <span className="inline-flex items-center gap-1">
                          <Package className="w-4 h-4 text-primary" />
                          {stat.stockEntries}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-right font-semibold text-gray-900">
                        {formatCurrency(stat.totalStockValue, stat.currency)}
                      </td>
                      <td className="px-6 py-4 text-right">
                        {formatCurrency(stat.totalTransferred, stat.currency)}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* PERFORMANCE TAB */}
      {activeTab === 'performance' && (
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {warehouseStats.map(stat => (
            <div key={stat.id} className="card p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">{stat.name}</h3>
              
              <div className="space-y-4">
                <div className="flex justify-between items-center py-2 border-b border-gray-100">
                  <span className="text-gray-600">Stock Entries</span>
                  <span className="font-semibold text-gray-900">{stat.stockEntries}</span>
                </div>
                
                <div className="flex justify-between items-center py-2 border-b border-gray-100">
                  <span className="text-gray-600">Staff Assigned</span>
                  <span className="font-semibold text-gray-900">{stat.staffAssigned}</span>
                </div>

                <div className="flex justify-between items-center py-2 border-b border-gray-100">
                  <span className="text-gray-600">Outgoing Transfers</span>
                  <span className="font-semibold text-gray-900">{stat.outgoingTransfers}</span>
                </div>

                <div className="flex justify-between items-center py-2 border-b border-gray-100">
                  <span className="text-gray-600">Incoming Transfers</span>
                  <span className="font-semibold text-gray-900">{stat.incomingTransfers}</span>
                </div>

                <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 mt-4">
                  <p className="text-xs text-blue-600 font-medium uppercase tracking-wider mb-1">Total Stock Value</p>
                  <p className="text-2xl font-bold text-blue-900">{formatCurrency(stat.totalStockValue, stat.currency)}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* MODAL */}
      <Modal
        isOpen={isLocModal}
        onClose={() => {
          setIsLocModal(false);
          setEditingLoc(null);
        }}
        title={editingLoc ? "Edit Warehouse" : "Add New Warehouse"}
        description={editingLoc ? "Update warehouse details and location information." : "Create a new warehouse location for inventory management."}
      >
        <form onSubmit={handleLocSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Warehouse Name *</label>
            <input
              type="text"
              className="w-full px-4 py-2.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50"
              placeholder="e.g. Delhi Central Warehouse"
              value={locForm.name}
              onChange={e => setLocForm({ ...locForm, name: e.target.value })}
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Country *</label>
              <select
                className="w-full px-4 py-2.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50 bg-white"
                value={locForm.country}
                onChange={e => setLocForm({ ...locForm, country: e.target.value })}
                required
              >
                {COUNTRIES.map(c => (
                  <option key={c.name} value={c.name}>{c.name}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Currency *</label>
              <select
                className="w-full px-4 py-2.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50 bg-white"
                value={locForm.currency}
                onChange={e => setLocForm({ ...locForm, currency: e.target.value })}
                required
              >
                {CURRENCIES.map(c => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Warehouse Manager</label>
            <input
              type="text"
              className="w-full px-4 py-2.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50"
              placeholder="e.g. John Sharma"
              value={locForm.manager}
              onChange={e => setLocForm({ ...locForm, manager: e.target.value })}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Contact Number</label>
            <input
              type="tel"
              className="w-full px-4 py-2.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50"
              placeholder="e.g. +91 98765 43210"
              value={locForm.contact}
              onChange={e => setLocForm({ ...locForm, contact: e.target.value })}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Address</label>
            <textarea
              className="w-full px-4 py-2.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50"
              placeholder="Enter full warehouse address"
              rows={3}
              value={locForm.address}
              onChange={e => setLocForm({ ...locForm, address: e.target.value })}
            />
          </div>

          <div className="flex justify-end gap-3 pt-4 border-t border-gray-100">
            <button
              type="button"
              onClick={() => {
                setIsLocModal(false);
                setEditingLoc(null);
              }}
              className="px-6 py-2.5 border border-gray-200 rounded-lg text-gray-700 font-medium hover:bg-gray-50 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-6 py-2.5 bg-primary text-white rounded-lg font-medium hover:bg-primary/90 transition-colors disabled:opacity-50"
            >
              {saving ? 'Saving...' : editingLoc ? 'Save Changes' : 'Add Warehouse'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
