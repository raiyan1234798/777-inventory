import { useState, useMemo } from 'react';
import { Plus, Trash2, AlertTriangle } from 'lucide-react';
import Modal from './Modal';
import { useStore, formatCurrency } from '../store';
import { useAuthStore } from '../store/authStore';

export default function GlobalTransferModal() {
  const { appUser } = useAuthStore();
  const { 
    locations, items, inventory, brands,
    isTransferModalOpen, isTransferModalMinimized, transferForm, transferGroups,
    setTransferModalOpen, setTransferModalMinimized, setTransferForm, setTransferGroups,
    recordTransfer, createNotification
  } = useStore();

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [transferNote, setTransferNote] = useState('');
  const [transferDate, setTransferDate] = useState(new Date().toISOString().split('T')[0]);

  const allTransferItems = transferGroups.flatMap(g => g.items.map(i => ({ brand_id: g.brand_id, ...i })));
  const sourceItems = useMemo(() => {
    if (!transferForm.from_location) return [];
    
    const itemMap = new Map();
    for (const item of items) {
      itemMap.set(item.id, item);
    }

    return inventory
      .filter(e => e.location_id === transferForm.from_location && e.quantity > 0)
      .map(e => ({
        ...e,
        item: itemMap.get(e.item_id),
      }))
      .filter(e => e.item);
  }, [transferForm.from_location, inventory, items]);

  if (!isTransferModalOpen && !isTransferModalMinimized) return null;

  const getLocationName = (id: string) => {
    if (id === 'supplier') return 'Supplier';
    if (id === 'customer') return 'Customer';
    return locations.find(l => l.id === id)?.name ?? id;
  };

  const minimizeLabel = (() => {
    const fromName = transferForm.from_location ? getLocationName(transferForm.from_location) : null;
    const toName = transferForm.to_location ? getLocationName(transferForm.to_location) : null;
    const selectedCount = allTransferItems.filter(i => i.item_id).length;
    if (!fromName) return 'Selecting source…';
    const route = toName ? `${fromName} → ${toName}` : fromName;
    return `${route} · ${selectedCount} item${selectedCount !== 1 ? 's' : ''} selected`;
  })();

  const handleTransfer = async (e: React.FormEvent) => {
    if (saving) return;
    e.preventDefault();
    setError('');
    if (transferForm.from_location === transferForm.to_location) {
      setError('Source and destination cannot be the same location.');
      return;
    }
    
    // Validate all items
    for (let i = 0; i < allTransferItems.length; i++) {
      const itemTransfer = allTransferItems[i];
      if (!itemTransfer.item_id) {
         setError('Please select an item for all rows.');
         return;
      }
      const entry = inventory.find(en => en.location_id === transferForm.from_location && en.item_id === itemTransfer.item_id);
      if (!entry) {
        setError('Selected item not in stock at source location.');
        return;
      }
      if (itemTransfer.quantity > entry.quantity) {
        setError(`Only ${entry.quantity} units available for one of the selected items.`);
        return;
      }
    }

    setSaving(true);
    try {
      await useStore.getState().executeTransferSession({
        from_location: transferForm.from_location,
        to_location: transferForm.to_location,
        items: allTransferItems.map(it => ({
          brand_id: it.brand_id,
          item_id: it.item_id,
          quantity: it.quantity
        })),
        performed_by: appUser?.name ?? 'Staff',
        notes: transferNote.trim() || undefined,
        date: transferDate
      });

      setTransferModalOpen(false);
      setTransferModalMinimized(false);
      setTransferForm({ from_location: '', to_location: '' });
      setTransferGroups([{ brand_id: '', _id: Date.now(), items: [{ item_id: '', quantity: 1, _id: Date.now() + 1 }] }]);
      setTransferNote('');
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleClose = () => {
    setTransferModalOpen(false);
    setTransferModalMinimized(false);
    setError('');
    setTransferNote('');
  };

  const addTransferGroupRow = () => {
    const newId = Date.now();
    setTransferGroups([...transferGroups, { brand_id: '', _id: newId, items: [{ item_id: '', quantity: 1, _id: newId + 1 }] }]);
  };

  const removeTransferGroupRow = (index: number) => {
    setTransferGroups(transferGroups.filter((_, i) => i !== index));
  };
  
  const addTransferItemToGroup = (groupIndex: number) => {
    const newGroups = [...transferGroups];
    newGroups[groupIndex].items.push({ item_id: '', quantity: 1, _id: Date.now() });
    setTransferGroups(newGroups);
  };
  
  const removeTransferItemFromGroup = (groupIndex: number, itemIndex: number) => {
    const newGroups = [...transferGroups];
    newGroups[groupIndex].items = newGroups[groupIndex].items.filter((_, i) => i !== itemIndex);
    setTransferGroups(newGroups);
  };

  return (
    <Modal
      isOpen={isTransferModalOpen || isTransferModalMinimized}
      onClose={handleClose}
      onOutsideClick={() => { setTransferModalMinimized(true); setTransferModalOpen(false); }}
      title="Transfer Items"
      description="Transfer items between shops."
      size="md"
      minimized={isTransferModalMinimized}
      onMinimize={() => { setTransferModalMinimized(true); setTransferModalOpen(false); }}
      onRestore={() => { setTransferModalMinimized(false); setTransferModalOpen(true); }}
      minimizeLabel={minimizeLabel}
    >
      <form onSubmit={handleTransfer} className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <div className="md:col-span-1">
            <label className="label">From Shop</label>
            <select title="Source Location" required className="input-field h-12 bg-white font-bold" value={transferForm.from_location}
              onChange={e => {
                setTransferForm({ ...transferForm, from_location: e.target.value });
                setTransferGroups([{ brand_id: '', _id: Date.now(), items: [{ item_id: '', quantity: 1, _id: Date.now() + 1 }] }]);
              }}>
              <option value="">Identify source…</option>
              {locations.map(l => <option key={l.id} value={l.id}>{l.name} ({l.type})</option>)}
            </select>
          </div>
          <div className="md:col-span-1">
            <label className="label">To Shop</label>
            <select title="Destination Location" required className="input-field h-12 bg-white font-bold" value={transferForm.to_location}
              onChange={e => setTransferForm({ ...transferForm, to_location: e.target.value })}>
              <option value="">Target destination…</option>
              {locations.filter(l => l.id !== transferForm.from_location).map(l => (
                <option key={l.id} value={l.id}>{l.name} ({l.type})</option>
              ))}
            </select>
          </div>

          <div className="md:col-span-2">
            <label className="label">Transfer Date</label>
            <input 
              type="date" 
              className="input-field h-12 bg-white font-bold cursor-pointer" 
              value={transferDate} 
              max={new Date().toISOString().split('T')[0]}
              onChange={e => setTransferDate(e.target.value)}
              onClick={(e) => {
                try { e.currentTarget.showPicker(); } catch (err) {}
              }}
              onKeyDown={(e) => {
                e.preventDefault(); // Prevent typing to avoid confusion, force calendar use
              }}
            />
          </div>

          {/* Transfer Reference/Note */}
          <div className="md:col-span-2">
            <label className="label">Transfer Reference / Note <span className="text-gray-400 font-normal text-[10px]">(Optional — visible in transfer history)</span></label>
            <div className="relative">
              <input
                type="text"
                placeholder="e.g. TRF-001, Weekly restocking, Container shipment..."
                value={transferNote}
                onChange={e => setTransferNote(e.target.value)}
                maxLength={100}
                className="input-field h-11 bg-white w-full pr-16"
              />
              {transferNote && (
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] text-gray-400 font-bold">{transferNote.length}/100</span>
              )}
            </div>
          </div>

          <div className="md:col-span-2 space-y-4">
            <div className="flex items-center justify-between">
              <label className="label">Items to Transfer</label>
            </div>

            {transferGroups.map((group, groupIndex) => (
              <div key={group._id} className="p-5 border border-gray-100 rounded-2xl bg-white shadow-sm space-y-5">
                <div className="flex justify-between items-center pb-3 border-b border-gray-50">
                  <span className="text-[10px] uppercase font-black tracking-widest text-primary">Brand Selection #{groupIndex + 1}</span>
                  {transferGroups.length > 1 && (
                    <button title="Remove Brand Group" type="button" onClick={() => removeTransferGroupRow(groupIndex)} className="text-red-400 hover:text-red-600 transition-colors p-1 bg-red-50 rounded-lg">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>

                <div className="w-full sm:w-1/2">
                  <label className="label text-[10px] mb-1">Select Brand for these Items</label>
                  <select title="Select Brand" className="input-field h-12 bg-gray-50 font-bold w-full" value={group.brand_id}
                    onChange={e => {
                      const newGroups = [...transferGroups];
                      newGroups[groupIndex].brand_id = e.target.value;
                      newGroups[groupIndex].items = newGroups[groupIndex].items.map(i => ({ ...i, item_id: '' }));
                      setTransferGroups(newGroups);
                    }}
                    disabled={!transferForm.from_location}>
                    <option value="">All Brands</option>
                    {brands.map(b => (
                      <option key={b.id} value={b.id}>{b.name}</option>
                    ))}
                  </select>
                </div>
                
                <div className="space-y-3 pt-2">
                {group.items.map((itemRow, itemIndex) => {
                  const rowEntry = transferForm.from_location && itemRow.item_id
                    ? inventory.find(e => e.location_id === transferForm.from_location && e.item_id === itemRow.item_id)
                    : null;

                  const selectedItem = itemRow.item_id ? items.find(i => i.id === itemRow.item_id) : null;
                  const selectedBrand = selectedItem ? brands.find(b => b.id === selectedItem.brand_id) : null;
                  const selectedSku = selectedItem?.sku?.trim() || 'No SKU';

                  return (
                    <div key={itemRow._id} className="p-4 border border-gray-100 rounded-xl bg-gray-50/50 space-y-4">
                      <div className="flex justify-between items-center mb-1">
                        <span className="text-[10px] uppercase font-black tracking-widest text-gray-400">Item #{itemIndex + 1}</span>
                        {group.items.length > 1 && (
                          <button title="Remove Item" type="button" onClick={() => removeTransferItemFromGroup(groupIndex, itemIndex)} className="text-red-400 hover:text-red-600 transition-colors">
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </div>

                      {selectedItem && (
                        <div className="bg-primary/5 border border-primary/10 rounded-lg px-3 py-2 flex items-center gap-2">
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-black text-gray-900 truncate">{selectedItem.name}</p>
                            <p className="text-[10px] text-gray-500 font-bold uppercase tracking-widest">
                              SKU: {selectedSku} · {selectedBrand?.name ?? 'No Brand'}
                            </p>
                          </div>
                          <button
                            type="button"
                            onClick={() => {
                              const newGroups = [...transferGroups];
                              newGroups[groupIndex].items[itemIndex].item_id = '';
                              setTransferGroups(newGroups);
                            }}
                            className="text-gray-300 hover:text-red-400 transition-colors flex-shrink-0"
                            title="Clear selection"
                          >
                            <span className="text-xs font-black">✕</span>
                          </button>
                        </div>
                      )}
                      
                      <div className="space-y-3">
                        <div className="flex flex-col sm:flex-row gap-3">
                          <div className="w-full sm:w-2/3">
                            <select title="Select Item" required className="input-field h-12 bg-white font-bold w-full" value={itemRow.item_id}
                              onChange={e => {
                                const newGroups = [...transferGroups];
                                newGroups[groupIndex].items[itemIndex].item_id = e.target.value;
                                setTransferGroups(newGroups);
                              }}
                              disabled={!transferForm.from_location}>
                              <option value="">Choose an item…</option>
                              {sourceItems
                                .filter(e => !group.brand_id || e.item!.brand_id === group.brand_id)
                                .sort((a, b) => a.item!.name.localeCompare(b.item!.name))
                                .map(e => {
                                const brand = brands.find(b => b.id === e.item!.brand_id);
                                const sku = e.item!.sku?.trim() || 'No SKU';
                                return (
                                  <option key={e.item_id} value={e.item_id}>
                                    {e.item!.name} | {brand?.name ?? 'No Brand'} | {e.quantity} in stock
                                  </option>
                                );
                              })}
                            </select>
                          </div>
                          <div className="w-full sm:w-1/3">
                            <input title="Quantity" placeholder="Qty to Transfer" required type="number" min={1} max={rowEntry?.quantity ?? undefined} className="input-field h-12 text-lg font-black w-full"
                              value={itemRow.quantity || ''}
                              onChange={e => {
                                const newGroups = [...transferGroups];
                                newGroups[groupIndex].items[itemIndex].quantity = Number(e.target.value);
                                setTransferGroups(newGroups);
                              }} />
                          </div>
                        </div>
                      </div>

                      {rowEntry && (
                        <div className="flex items-center justify-between text-[11px] font-bold uppercase tracking-widest bg-white p-3 rounded-lg border border-gray-100">
                          <span className="text-gray-400">Available: <span className="text-primary">{rowEntry.quantity}u</span></span>
                          <span className="text-gray-400">Transfer Value: <span className="text-primary">{formatCurrency(rowEntry.avg_cost_USD * itemRow.quantity)}</span></span>
                        </div>
                      )}
                    </div>
                  );
                })}
                </div>
                
                <div className="flex justify-end pt-1">
                  <button type="button" onClick={() => addTransferItemToGroup(groupIndex)} className="text-xs h-8 px-3 font-bold uppercase tracking-widest text-primary flex items-center gap-1 hover:bg-primary/5 rounded-lg border border-transparent hover:border-primary/20 transition-all">
                    <Plus className="w-3 h-3" /> Add Item to this Brand
                  </button>
                </div>
              </div>
            ))}

            <div className="flex justify-end pt-2">
              <button type="button" onClick={addTransferGroupRow} className="btn-secondary text-xs h-10 px-4 font-black uppercase tracking-widest text-primary flex items-center gap-1 hover:bg-gray-100 border-dashed border-2 border-primary/30">
                <Plus className="w-4 h-4" /> Add Item
              </button>
            </div>

            {transferForm.from_location && sourceItems.length === 0 && (
              <p className="text-[10px] text-red-500 font-black uppercase tracking-widest mt-2 flex items-center gap-1">
                 <AlertTriangle className="w-3 h-3" /> Zero Available Stock
              </p>
            )}
          </div>
        </div>

        {error && (
          <div className="flex items-center gap-3 bg-red-50 border border-red-100 rounded-2xl p-4 text-xs font-bold text-red-600 animate-in slide-in-from-top-2">
            <AlertTriangle className="w-4 h-4 flex-shrink-0" /> {error}
          </div>
        )}

        <div className="flex flex-col-reverse sm:flex-row justify-end gap-3 pt-6 border-t border-gray-100">
          <button type="button" className="btn-secondary h-12 px-6 font-bold" onClick={handleClose}>Cancel</button>
          <button type="submit" className="btn-primary h-12 px-10 font-black uppercase tracking-widest text-xs shadow-xl shadow-primary/20" disabled={saving || allTransferItems.some(i => !i.item_id) || allTransferItems.some(i => !i.quantity)}>
            {saving ? 'Transferring…' : 'Transfer'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
