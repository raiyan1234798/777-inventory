import React, { useState } from 'react';
import { FileUp, X } from 'lucide-react';
import Modal from './Modal';
import { useStore } from '../store';
import { useAuthStore } from '../store/authStore';

export default function GlobalReturnModal() {
  const { appUser } = useAuthStore();
  const { 
    locations, 
    items, 
    inventory, 
    brands, 
    processReturn,
    isReturnModalOpen,
    isReturnModalMinimized,
    returnTypeState,
    returnActionState,
    returnFormState,
    setReturnModalOpen,
    setReturnModalMinimized,
    setReturnTypeState,
    setReturnActionState,
    setReturnFormState
  } = useStore();

  const [saving, setSaving] = useState(false);

  // Compute location items dynamically based on the current location_id
  const locationItems = inventory.filter(e => e.location_id === returnFormState.location_id).map(e => ({
    ...e,
    item: items.find(i => i.id === e.item_id)
  })).filter(e => e.item);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!returnFormState.location_id || !returnFormState.item_id) return;
    setSaving(true);
    try {
      const selectedItem = items.find(i => i.id === returnFormState.item_id);
      
      await processReturn({
        type: returnTypeState as any,
        location_id: returnFormState.location_id,
        item_id: returnFormState.item_id,
        item_name: selectedItem?.name ?? 'Unknown Item',
        quantity: returnFormState.quantity,
        reason: returnFormState.notes,
        status: returnActionState as any,
        timestamp: new Date().toISOString(),
        image_proof: returnFormState.image_proof
      });

      setReturnModalOpen(false);
      setReturnFormState({ location_id: '', brand_id: '', item_id: '', quantity: 1, notes: '', image_proof: '' });
    } catch (err: any) {
      alert('Error: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const MAX_WIDTH = 800;
        const scaleSize = MAX_WIDTH / img.width;
        canvas.width = MAX_WIDTH;
        canvas.height = img.height * scaleSize;
        const ctx = canvas.getContext('2d');
        ctx?.drawImage(img, 0, 0, canvas.width, canvas.height);
        const dataUrl = canvas.toDataURL('image/webp', 0.8);
        setReturnFormState({ ...returnFormState, image_proof: dataUrl });
      };
      img.src = event.target?.result as string;
    };
    reader.readAsDataURL(file);
  };

  return (
    <Modal 
      isOpen={isReturnModalOpen || isReturnModalMinimized} 
      onClose={() => setReturnModalOpen(false)} 
      minimized={isReturnModalMinimized}
      onMinimize={() => { setReturnModalMinimized(true); setReturnModalOpen(false); }}
      onRestore={() => { setReturnModalMinimized(false); setReturnModalOpen(true); }}
      title="Log System Reversal" 
      description="Record a returned item and choose action." 
      minimizeLabel={returnFormState.item_id ? `Returning ${returnFormState.quantity}x ${items.find(i => i.id === returnFormState.item_id)?.name || 'Item'}` : "Log Return"}
      size="md"
    >
      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <div>
            <label className="label">Sequence Type</label>
            <select title="Return Type" className="input-field h-12 bg-white font-bold" value={returnTypeState} onChange={e => setReturnTypeState(e.target.value)}>
              <option value="sale_return">Sale Reversal</option>
              <option value="warehouse_return">Warehouse Flowback</option>
            </select>
          </div>
          <div>
            <label className="label">Return Action</label>
            <select title="Action" className="input-field h-12 bg-white font-bold" value={returnActionState} onChange={e => setReturnActionState(e.target.value)}>
              <option value="Restocked">Recommit to Inventory</option>
              <option value="Disposed">Log Disposal (Final)</option>
            </select>
          </div>
          
          <div className="md:col-span-2">
            <label className="label">{returnTypeState === 'sale_return' ? 'Shop Location' : 'Warehouse Location'}</label>
            <select title="Location" required className="input-field h-12 bg-white" value={returnFormState.location_id}
              onChange={e => setReturnFormState({ ...returnFormState, location_id: e.target.value, item_id: '' })}>
              <option value="">{returnTypeState === 'sale_return' ? 'Select shop…' : 'Select warehouse…'}</option>
              {locations
                .filter(l => returnTypeState === 'sale_return' ? l.type === 'shop' : l.type === 'warehouse')
                .map(l => <option key={l.id} value={l.id}>{l.name} ({l.type})</option>)}
            </select>
          </div>

          <div className="md:col-span-2 grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="sm:col-span-1">
              <label className="label">Brand</label>
              <select title="Select Brand" className="input-field h-12 bg-white" value={returnFormState.brand_id}
                onChange={e => setReturnFormState({ ...returnFormState, brand_id: e.target.value, item_id: '' })} disabled={!returnFormState.location_id}>
                <option value="">All Brands</option>
                {brands.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
              </select>
            </div>
            <div className="sm:col-span-2">
              <label className="label">Target Item</label>
              <select title="Select Item" required className="input-field h-12 bg-white" value={returnFormState.item_id}
                onChange={e => setReturnFormState({ ...returnFormState, item_id: e.target.value })} disabled={!returnFormState.location_id}>
                <option value="">Identify object…</option>
                {returnTypeState === 'sale_return'
                  ? items
                      .filter(i => !returnFormState.brand_id || i.brand_id === returnFormState.brand_id)
                      .map(i => {
                        const brand = brands.find(b => b.id === i.brand_id);
                        const sku = i.sku?.trim() || 'No SKU';
                        return (
                          <option key={i.id} value={i.id}>
                            {i.name} (SKU: {sku}) ({brand?.name ?? 'No Brand'})
                          </option>
                        );
                      })
                  : locationItems
                      .filter(e => !returnFormState.brand_id || e.item!.brand_id === returnFormState.brand_id)
                      .map(e => {
                        const brand = brands.find(b => b.id === e.item!.brand_id);
                        const sku = e.item!.sku?.trim() || 'No SKU';
                        return (
                          <option key={e.item_id} value={e.item_id}>
                            {e.item!.name} (SKU: {sku}) ({brand?.name ?? 'No Brand'}) — {e.quantity} available
                          </option>
                        );
                      })
                }
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 md:col-span-2 gap-5">
            <div className="sm:col-span-1">
              <label className="label">Quantity</label>
              <input title="Quantity" placeholder="0" required type="number" min={1} className="input-field h-12 text-lg font-black" value={returnFormState.quantity || ''}
                onChange={e => setReturnFormState({ ...returnFormState, quantity: Number(e.target.value) })} />
            </div>
            <div className="sm:col-span-2">
              <label className="label">Cause of Reversal</label>
              <input title="Reason" placeholder="e.g. Customer return, damaged item" className="input-field h-12" value={returnFormState.notes}
                onChange={e => setReturnFormState({ ...returnFormState, notes: e.target.value })} />
            </div>
          </div>

          <div className="md:col-span-2">
            <label className="label">Image Proof (Optional)</label>
            <div className="flex items-center gap-4 mt-1">
              <label className="flex items-center justify-center gap-2 px-4 py-3 bg-gray-50 border border-gray-200 border-dashed rounded-xl cursor-pointer hover:bg-gray-100 transition-colors flex-1">
                <FileUp className="w-5 h-5 text-gray-400" />
                <span className="text-sm font-bold text-gray-600">Upload Receipt / Item Image</span>
                <input type="file" accept="image/*" className="hidden" onChange={handleImageUpload} />
              </label>
              {returnFormState.image_proof && (
                <div className="relative w-16 h-16 rounded-lg overflow-hidden border border-gray-200 flex-shrink-0 bg-gray-100">
                  <img src={returnFormState.image_proof} alt="Proof Preview" className="object-cover w-full h-full" />
                  <button type="button" onClick={() => setReturnFormState({...returnFormState, image_proof: undefined})} className="absolute top-1 right-1 bg-red-500 text-white rounded-full p-0.5 hover:bg-red-600">
                    <X className="w-3 h-3" />
                  </button>
                </div>
              )}
            </div>
            <p className="text-[10px] text-gray-400 mt-1 uppercase tracking-widest">Image is automatically compressed to save space.</p>
          </div>
        </div>

        <div className="flex flex-col-reverse sm:flex-row justify-end gap-3 pt-6 border-t border-gray-100">
          <button type="button" className="btn-secondary h-12 px-6 font-bold" onClick={() => { setReturnModalOpen(false); }}>Cancel</button>
          <button type="submit" className="btn-primary h-12 px-8 font-black uppercase tracking-widest text-xs shadow-lg shadow-primary/20" disabled={saving}>
            {saving ? 'Processing Commitment…' : 'Finalize Log'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
