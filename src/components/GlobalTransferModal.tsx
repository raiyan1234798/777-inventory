import { useState } from 'react';
import { Plus, Trash2, AlertTriangle } from 'lucide-react';
import Modal from './Modal';
import { useStore, formatCurrency } from '../store';
import { useAuthStore } from '../store/authStore';

export default function GlobalTransferModal() {
  const { appUser } = useAuthStore();
  const { 
    locations, items, inventory, transfer, brands,
    isTransferModalOpen, isTransferModalMinimized, transferForm, transferItems,
    setTransferModalOpen, setTransferModalMinimized, setTransferForm, setTransferItems
  } = useStore();

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [transferNote, setTransferNote] = useState('');

  if (!isTransferModalOpen && !isTransferModalMinimized) return null;

  const sourceItems = transferForm.from_location
    ? inventory
        .filter(e => e.location_id === transferForm.from_location && e.quantity > 0)
        .map(e => ({
          ...e,
          item: items.find(i => i.id === e.item_id),
        }))
        .filter(e => e.item)
    : [];

  const getLocationName = (id: string) => {
    if (id === 'supplier') return 'Supplier';
    if (id === 'customer') return 'Customer';
    return locations.find(l => l.id === id)?.name ?? id;
  };

  const minimizeLabel = (() => {
    const fromName = transferForm.from_location ? getLocationName(transferForm.from_location) : null;
    const toName = transferForm.to_location ? getLocationName(transferForm.to_location) : null;
    const selectedCount = transferItems.filter(i => i.item_id).length;
    if (!fromName) return 'Selecting source…';
    const route = toName ? `${fromName} → ${toName}` : fromName;
    return `${route} · ${selectedCount} item${selectedCount !== 1 ? 's' : ''} selected`;
  })();

  const handleTransfer = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (transferForm.from_location === transferForm.to_location) {
      setError('Source and destination cannot be the same location.');
      return;
    }
    
    // Validate all items
    for (let i = 0; i < transferItems.length; i++) {
      const itemTransfer = transferItems[i];
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
        items: transferItems.map(it => ({
          brand_id: it.brand_id,
          item_id: it.item_id,
          quantity: it.quantity
        })),
        performed_by: appUser?.name ?? 'Staff',
        notes: transferNote.trim() || undefined
      });
      setTransferModalOpen(false);
      setTransferModalMinimized(false);
      setTransferForm({ from_location: '', to_location: '' });
      setTransferItems([{ brand_id: '', item_id: '', quantity: 1, _id: Date.now() }]);
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

  const addItemRow = () => {
    setTransferItems([...transferItems, { brand_id: '', item_id: '', quantity: 1, _id: Date.now() }]);
  };

  const removeItemRow = (index: number) => {
    setTransferItems(transferItems.filter((_, i) => i !== index));
  };

  return (
    <Modal
      isOpen={isTransferModalOpen || isTransferModalMinimized}
      onClose={handleClose}
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
          <div>
            <label className="label">From Shop</label>
            <select title="Source Location" required className="input-field h-12 bg-white font-bold" value={transferForm.from_location}
              onChange={e => {
                setTransferForm({ ...transferForm, from_location: e.target.value });
                setTransferItems([{ brand_id: '', item_id: '', quantity: 1, _id: Date.now() }]);
              }}>
              <option value="">Identify source…</option>
              {locations.map(l => <option key={l.id} value={l.id}>{l.name} ({l.type})</option>)}
            </select>
          </div>
          <div>
            <label className="label">To Shop</label>
            <select title="Destination Location" required className="input-field h-12 bg-white font-bold" value={transferForm.to_location}
              onChange={e => setTransferForm({ ...transferForm, to_location: e.target.value })}>
              <option value="">Target destination…</option>
              {locations.filter(l => l.id !== transferForm.from_location).map(l => (
                <option key={l.id} value={l.id}>{l.name} ({l.type})</option>
              ))}
            </select>
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

            {transferItems.map((itemRow, index) => {
              const rowEntry = transferForm.from_location && itemRow.item_id
                ? inventory.find(e => e.location_id === transferForm.from_location && e.item_id === itemRow.item_id)
                : null;

              const selectedItem = itemRow.item_id ? items.find(i => i.id === itemRow.item_id) : null;
              const selectedBrand = selectedItem ? brands.find(b => b.id === selectedItem.brand_id) : null;
              const selectedSku = selectedItem?.sku?.trim() || 'No SKU';

              return (
                <div key={itemRow._id} className="p-4 border border-gray-100 rounded-xl bg-gray-50/50 space-y-4">
                  <div className="flex justify-between items-center mb-1">
                    <span className="text-[10px] uppercase font-black tracking-widest text-gray-400">Item #{index + 1}</span>
                    {transferItems.length > 1 && (
                      <button title="Remove Item" type="button" onClick={() => removeItemRow(index)} className="text-red-400 hover:text-red-600 transition-colors">
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
                          const newItems = [...transferItems];
                          newItems[index].item_id = '';
                          setTransferItems(newItems);
                        }}
                        className="text-gray-300 hover:text-red-400 transition-colors flex-shrink-0"
                        title="Clear selection"
                      >
                        <span className="text-xs font-black">✕</span>
                      </button>
                    </div>
                  )}
                  
                  <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
                    <div className="sm:col-span-1">
                      <select title="Select Brand" className="input-field h-12 bg-white font-bold w-full" value={itemRow.brand_id}
                        onChange={e => {
                          const newItems = [...transferItems];
                          newItems[index].brand_id = e.target.value;
                          newItems[index].item_id = '';
                          setTransferItems(newItems);
                        }}
                        disabled={!transferForm.from_location}>
                        <option value="">All Brands</option>
                        {brands.map(b => (
                          <option key={b.id} value={b.id}>{b.name}</option>
                        ))}
                      </select>
                    </div>
                    <div className="sm:col-span-2">
                      <select title="Select Item" required className="input-field h-12 bg-white font-bold w-full" value={itemRow.item_id}
                        onChange={e => {
                          const newItems = [...transferItems];
                          newItems[index].item_id = e.target.value;
                          setTransferItems(newItems);
                        }}
                        disabled={!transferForm.from_location}>
                        <option value="">Choose an item…</option>
                        {sourceItems
                          .filter(e => !itemRow.brand_id || e.item!.brand_id === itemRow.brand_id)
                          .sort((a, b) => a.item!.name.localeCompare(b.item!.name))
                          .map(e => {
                          const brand = brands.find(b => b.id === e.item!.brand_id);
                          const sku = e.item!.sku?.trim() || 'No SKU';
                          return (
                            <option key={e.item_id} value={e.item_id}>
                              {e.item!.name} (SKU: {sku}) ({brand?.name ?? 'No Brand'}) — {e.quantity} Available (avg {formatCurrency(e.avg_cost_USD)})
                            </option>
                          );
                        })}
                      </select>
                    </div>

                    <div>
                      <input title="Quantity" placeholder="Qty" required type="number" min={1} max={rowEntry?.quantity ?? undefined} className="input-field h-12 text-lg font-black w-full"
                        value={itemRow.quantity || ''}
                        onChange={e => {
                          const newItems = [...transferItems];
                          newItems[index].quantity = Number(e.target.value);
                          setTransferItems(newItems);
                        }} />
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

            <div className="flex justify-end pt-2">
              <button type="button" onClick={addItemRow} className="btn-secondary text-xs h-10 px-4 font-black uppercase tracking-widest text-primary flex items-center gap-1 hover:bg-gray-100 border-dashed border-2 border-primary/30">
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
          <button type="submit" className="btn-primary h-12 px-10 font-black uppercase tracking-widest text-xs shadow-xl shadow-primary/20" disabled={saving || transferItems.some(i => !i.item_id) || transferItems.some(i => !i.quantity)}>
            {saving ? 'Transferring…' : 'Transfer'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
