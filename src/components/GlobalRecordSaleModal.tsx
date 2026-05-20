import { useState, useMemo } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import Modal from './Modal';
import { useStore, CURRENCIES, formatCurrency, toUSD } from '../store';
import { useAuthStore } from '../store/authStore';
import clsx from 'clsx';

export default function GlobalRecordSaleModal() {
  const { appUser } = useAuthStore();
  const { 
    locations, items, inventory, recordSale, brands,
    isRecordSaleModalOpen, isRecordSaleModalMinimized, recordSaleLocation, recordSaleItems,
    setRecordSaleModalOpen, setRecordSaleModalMinimized, setRecordSaleLocation, setRecordSaleItems
  } = useStore();

  const [saving, setSaving] = useState(false);
  const shops = locations.filter(l => l.type === 'shop');

  const totalEstimatedProfit = recordSaleItems.reduce((acc, si) => {
    if (!si.item_id || si.selling_price <= 0) return acc;
    const cost = inventory.find(e => e.location_id === recordSaleLocation && e.item_id === si.item_id)?.avg_cost_USD ?? 0;
    const profit = toUSD(si.selling_price * si.quantity, si.currency) - (cost * si.quantity);
    return acc + profit;
  }, 0);

  const totalAmount = recordSaleItems.reduce((acc, si) => acc + toUSD(si.selling_price * si.quantity, si.currency), 0);

  const handleRecordSale = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!recordSaleLocation) return;
    setSaving(true);
    try {
      await Promise.all(recordSaleItems.map(si => {
        const item = items.find(i => i.id === si.item_id);
        if (!item) throw new Error('Item missing');
        return recordSale({
          location_id: recordSaleLocation,
          item_id: si.item_id,
          item_name: item.name,
          quantity: si.quantity,
          selling_price: si.selling_price,
          currency: si.currency,
          sold_by: appUser?.name ?? 'Staff',
        });
      }));
      setRecordSaleModalOpen(false);
      setRecordSaleModalMinimized(false);
      setRecordSaleLocation('');
      setRecordSaleItems([{ brand_id: '', item_id: '', quantity: 1, selling_price: 0, currency: 'USD', _id: Date.now() }]);
    } catch (err: any) {
      alert(err.message);
    } finally {
      setSaving(false);
    }
  };

  const addSaleItemRow = () => {
    setRecordSaleItems([...recordSaleItems, { brand_id: '', item_id: '', quantity: 1, selling_price: 0, currency: 'USD', _id: Date.now() }]);
  };

  const removeSaleItemRow = (index: number) => {
    setRecordSaleItems(recordSaleItems.filter((_, i) => i !== index));
  };

  if (!isRecordSaleModalOpen && !isRecordSaleModalMinimized) return null;

  return (
    <Modal
      isOpen={isRecordSaleModalOpen || isRecordSaleModalMinimized}
      onClose={() => { setRecordSaleModalOpen(false); setRecordSaleModalMinimized(false); }}
      title="Record a Sale"
      description="Enter the details of the item sold."
      size="md"
      minimized={isRecordSaleModalMinimized}
      onMinimize={() => { setRecordSaleModalMinimized(true); setRecordSaleModalOpen(false); }}
      onRestore={() => { setRecordSaleModalMinimized(false); setRecordSaleModalOpen(true); }}
      minimizeLabel={recordSaleLocation ? `${shops.find(s => s.id === recordSaleLocation)?.name ?? ''} · ${recordSaleItems.filter(si => si.item_id).length} item(s)` : 'Selecting shop…'}
    >
      <form onSubmit={handleRecordSale} className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <div className="md:col-span-2">
            <label className="label">Shop Location</label>
            <select title="Select Shop Location" required className="input-field h-12 bg-white font-bold" value={recordSaleLocation} 
              onChange={e => {
                setRecordSaleLocation(e.target.value);
                setRecordSaleItems([{ brand_id: '', item_id: '', quantity: 1, selling_price: 0, currency: 'USD', _id: Date.now() }]);
              }}>
              <option value="">Select a shop…</option>
              {shops.map(s => <option key={s.id} value={s.id}>{s.name} ({s.country})</option>)}
            </select>
          </div>

          <div className="md:col-span-2 space-y-4">
            <div className="flex items-center justify-between">
              <label className="label">Items Sold</label>
            </div>

            {recordSaleItems.map((si, index) => {
              const availableQty = recordSaleLocation && si.item_id
                ? inventory.find(e => e.location_id === recordSaleLocation && e.item_id === si.item_id)?.quantity ?? 0
                : 0;

              const selectedItem = si.item_id ? items.find(i => i.id === si.item_id) : null;
              const selectedBrand = selectedItem ? brands.find(b => b.id === selectedItem.brand_id) : null;
              const selectedSku = selectedItem?.sku?.trim() || 'No SKU';

              const shopItems = recordSaleLocation
                ? inventory
                    .filter(e => e.location_id === recordSaleLocation && e.quantity > 0)
                    .map(e => ({ ...e, item: items.find(i => i.id === e.item_id) }))
                    .filter(e => e.item)
                : [];
              
              return (
                <div key={si._id} className="p-4 border border-gray-100 rounded-xl bg-gray-50/50 space-y-4">
                  <div className="flex justify-between items-center mb-1">
                    <span className="text-[10px] uppercase font-black tracking-widest text-gray-400">Item #{index + 1}</span>
                    {recordSaleItems.length > 1 && (
                      <button title="Remove Item" type="button" onClick={() => removeSaleItemRow(index)} className="text-red-400 hover:text-red-600 transition-colors">
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
                          const newRows = [...recordSaleItems];
                          newRows[index].item_id = '';
                          setRecordSaleItems(newRows);
                        }}
                        className="text-gray-300 hover:text-red-400 transition-colors flex-shrink-0"
                        title="Clear selection"
                      >
                        <span className="text-xs font-black">✕</span>
                      </button>
                    </div>
                  )}

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div className="sm:col-span-1">
                      <select title="Filter by Brand" className="input-field h-12 bg-white font-bold w-full"
                        value={si.brand_id}
                        onChange={e => {
                          const newRows = [...recordSaleItems];
                          newRows[index].brand_id = e.target.value;
                          newRows[index].item_id = '';
                          setRecordSaleItems(newRows);
                        }}
                        disabled={!recordSaleLocation}>
                        <option value="">All Brands</option>
                        {brands.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                      </select>
                    </div>
                    <div className="sm:col-span-2">
                      <select title="Select Item" required className="input-field h-12 bg-white font-bold w-full"
                        value={si.item_id}
                        onChange={e => {
                          const item = items.find(i => i.id === e.target.value);
                          const newRows = [...recordSaleItems];
                          newRows[index].item_id = e.target.value;
                          newRows[index].selling_price = item?.retail_price || 0;
                          setRecordSaleItems(newRows);
                        }}
                        disabled={!recordSaleLocation}>
                        <option value="">Choose an item…</option>
                        {shopItems
                          .filter(e => !si.brand_id || e.item!.brand_id === si.brand_id)
                          .sort((a, b) => a.item!.name.localeCompare(b.item!.name))
                          .map(e => {
                            const brand = brands.find(b => b.id === e.item!.brand_id);
                            const sku = e.item!.sku?.trim() || 'No SKU';
                            return (
                               <option key={e.item_id} value={e.item_id}>
                                 {e.item!.name} (SKU: {sku}) ({brand?.name ?? 'No Brand'}) — {e.quantity} Available
                               </option>
                            );
                          })}
                      </select>
                    </div>
                  </div>
                  
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
                    <div>
                      <input title="Quantity" placeholder="0" required type="number" min={1} max={availableQty || undefined} className="input-field h-12 text-lg font-black w-full" 
                        value={si.quantity || ''} 
                        onChange={e => {
                          const newRows = [...recordSaleItems];
                          newRows[index].quantity = Number(e.target.value);
                          setRecordSaleItems(newRows);
                        }} />
                    </div>
                    <div className="sm:col-span-2">
                      <div className="flex gap-2">
                        <input title="Selling Price" placeholder="0.00" required type="number" min={0} step="0.01" className="flex-1 input-field h-12 text-lg font-black" 
                          value={si.selling_price || ''} 
                          onChange={e => {
                            const newRows = [...recordSaleItems];
                            newRows[index].selling_price = Number(e.target.value);
                            setRecordSaleItems(newRows);
                          }} />
                        <select title="Currency" className="w-24 input-field h-12 bg-white font-bold" 
                          value={si.currency} 
                          onChange={e => {
                            const newRows = [...recordSaleItems];
                            newRows[index].currency = e.target.value;
                            setRecordSaleItems(newRows);
                          }}>
                          {CURRENCIES.map(c => <option key={c}>{c}</option>)}
                        </select>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}

            <div className="flex justify-end pt-2">
              <button type="button" onClick={addSaleItemRow} className="btn-secondary text-xs h-10 px-4 font-black uppercase tracking-widest text-primary flex items-center gap-1 hover:bg-gray-100 border-dashed border-2 border-primary/30">
                <Plus className="w-4 h-4" /> Add Item
              </button>
            </div>
          </div>
        </div>

        {totalAmount > 0 && (
          <div className={clsx(
            "rounded-2xl p-5 border shadow-inner flex items-center justify-between",
            totalEstimatedProfit >= 0 ? 'bg-emerald-50 border-emerald-100 text-emerald-700' : 'bg-red-50 border-red-100 text-red-700'
          )}>
            <div className="space-y-1">
              <p className="text-[10px] font-black uppercase tracking-widest opacity-60">Estimated Profit (Total)</p>
              <p className="text-2xl font-black tracking-tight">{formatCurrency(totalEstimatedProfit)}</p>
            </div>
            <div className="text-right">
              <p className="text-[10px] font-black uppercase tracking-widest opacity-60">Total Amount (Base USD)</p>
              <p className="text-lg font-bold">{formatCurrency(totalAmount)}</p>
            </div>
          </div>
        )}

        <div className="flex flex-col-reverse sm:flex-row justify-end gap-3 pt-6 border-t border-gray-100">
          <button type="button" className="btn-secondary h-12 px-6 font-bold" onClick={() => { setRecordSaleModalOpen(false); setRecordSaleModalMinimized(false); }}>Cancel</button>
          <button type="submit" className="btn-primary h-12 px-10 font-black uppercase tracking-widest text-xs shadow-xl shadow-primary/20" disabled={saving || recordSaleItems.some(si => !si.item_id)}>
            {saving ? 'Processing...' : 'Complete Sale'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
