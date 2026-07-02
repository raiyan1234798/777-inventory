import { useState, useEffect, useMemo } from 'react';
import Modal from './Modal';
import { useStore } from '../store';
import { useAuthStore } from '../store/authStore';

interface EditSaleModalProps {
  saleId: string | null;
  isOpen: boolean;
  onClose: () => void;
}

export default function EditSaleModal({ saleId, isOpen, onClose }: EditSaleModalProps) {
  const { appUser } = useAuthStore();
  const { sales, editSale, deleteSale, exchangeRates, inventory, items, brands } = useStore();
  
  const sale = sales.find(s => s.id === saleId);
  const [selectedItemId, setSelectedItemId] = useState('');

  const activeInvEntry = inventory.find(i => i.location_id === sale?.location_id && i.item_id === (selectedItemId || sale?.item_id));
  const isOriginalItem = selectedItemId === sale?.item_id;

  // Available items in the shop for dropdown
  const locationInventory = useMemo(() => inventory.filter(inv => inv.location_id === sale?.location_id && (inv.quantity > 0 || inv.item_id === sale?.item_id)), [inventory, sale]);
  const itemMap = useMemo(() => new Map(items.map(i => [i.id, i])), [items]);
  const brandMap = useMemo(() => new Map(brands.map(b => [b.id, b])), [brands]);

  const shopItems = useMemo(() => locationInventory
    .map(inv => {
      const item = itemMap.get(inv.item_id);
      const brand = item ? brandMap.get(item.brand_id) : undefined;
      return {
        ...inv,
        item,
        brand
      };
    })
    .filter(inv => inv.item), [locationInventory, itemMap, brandMap]);

  const [quantity, setQuantity] = useState(1);
  const [sellingPrice, setSellingPrice] = useState(0);
  const [saleDate, setSaleDate] = useState('');
  const [saleTime, setSaleTime] = useState('');
  
  const [customZmwRate, setCustomZmwRate] = useState(18);
  
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (sale && isOpen) {
      setQuantity(sale.quantity);
      setSellingPrice(sale.selling_price);
      setSelectedItemId(sale.item_id);
      
      const dt = new Date(sale.timestamp);
      setSaleDate(dt.toISOString().split('T')[0]);
      setSaleTime(dt.toISOString().split('T')[1].substring(0, 5));

      const saleRates = sale.exchange_rates || exchangeRates;
      setCustomZmwRate(saleRates['ZMW'] || 18);
    }
  }, [sale, isOpen, exchangeRates]);

  if (!isOpen || !sale) return null;

  const maxQty = isOriginalItem 
    ? (sale.quantity + (activeInvEntry?.quantity || 0)) 
    : (activeInvEntry?.quantity || 0);

  const handleDelete = async () => {
    if (saving) return;
    if (!window.confirm('Are you sure you want to completely delete this sale? The sold quantity will be fully refunded to the inventory.')) return;
    
    setSaving(true);
    setError('');
    try {
      await deleteSale(sale.id, appUser?.name || 'Staff');
      onClose();
    } catch (err: any) {
      setError(err.message || 'Failed to delete sale');
    } finally {
      setSaving(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    if (saving) return;
    e.preventDefault();
    setSaving(true);
    setError('');

    try {
      const newTimestamp = new Date(`${saleDate}T${saleTime}:00`).toISOString();
      const selectedItemObj = items.find(i => i.id === selectedItemId);
      await editSale({
        id: sale.id,
        item_id: selectedItemId,
        item_name: selectedItemObj?.name || sale.item_name,
        quantity,
        selling_price: sellingPrice,
        timestamp: newTimestamp,
        exchange_rates: {
          ...exchangeRates,
          ZMW: customZmwRate
        }
      }, appUser?.name || 'Staff');
      
      onClose();
    } catch (err: any) {
      setError(err.message || 'Failed to update sale');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={`Reconcile Sale: ${sale.item_name}`}>
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && (
          <div className="p-3 bg-red-50 text-red-600 rounded-lg text-sm font-medium">
            {error}
          </div>
        )}

        <div className="grid grid-cols-1 gap-4">
          <div>
            <label className="label">Item Sold</label>
            <select
              className="input-field"
              value={selectedItemId}
              onChange={(e) => {
                setSelectedItemId(e.target.value);
                // Reset quantity and price to 1/0 if item changes to prevent accidental overselling
                if (e.target.value !== sale.item_id) {
                  setQuantity(1);
                } else {
                  setQuantity(sale.quantity);
                  setSellingPrice(sale.selling_price);
                }
              }}
              required
            >
              {shopItems.map((inv) => (
                <option key={inv.item_id} value={inv.item_id}>
                  {inv.item?.name} {inv.brand ? `(${inv.brand.name})` : ''} {inv.item_id === sale.item_id ? '(Original)' : ''} — QTY: {inv.item_id === sale.item_id ? inv.quantity + sale.quantity : inv.quantity}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="label">Quantity Sold</label>
            <input 
              type="number" 
              min="1" 
              max={maxQty}
              className="input-field" 
              value={quantity} 
              onChange={e => setQuantity(Number(e.target.value))} 
              required 
            />
            <p className="text-xs text-gray-500 mt-1">Available to sell: {maxQty}</p>
          </div>
          <div>
            <label className="label">Unit Price ({sale.currency})</label>
            <input 
              type="number" 
              step="0.01" 
              className="input-field" 
              value={sellingPrice} 
              onChange={e => setSellingPrice(Number(e.target.value))} 
              required 
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="label">Sale Date</label>
            <input 
              type="date" 
              className="input-field cursor-pointer" 
              value={saleDate} 
              onChange={e => setSaleDate(e.target.value)} 
              required 
            />
          </div>
          <div>
            <label className="label">Sale Time</label>
            <input 
              type="time" 
              className="input-field cursor-pointer" 
              value={saleTime} 
              onChange={e => setSaleTime(e.target.value)} 
              required 
            />
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4">
          <div>
            <label className="label text-orange-600">ZMW Rate (1 USD = X ZMW)</label>
            <input 
              type="number" 
              step="0.01"
              className="input-field bg-orange-50 border-orange-200 text-orange-900" 
              value={customZmwRate} 
              onChange={e => setCustomZmwRate(Number(e.target.value))}
              required
            />
          </div>
        </div>

        <div className="pt-4 flex justify-between gap-3 border-t">
          <button 
            type="button" 
            onClick={handleDelete} 
            className="px-4 py-2 text-sm font-medium text-red-600 bg-red-50 hover:bg-red-100 rounded-lg transition-colors focus:ring-2 focus:ring-red-500 focus:ring-offset-2" 
            disabled={saving}
          >
            Delete Sale
          </button>
          <div className="flex gap-3">
            <button type="button" onClick={onClose} className="btn-secondary" disabled={saving}>
              Cancel
            </button>
            <button type="submit" className="btn-primary" disabled={saving}>
              {saving ? 'Saving...' : 'Update Sale & Inventory'}
            </button>
          </div>
        </div>
      </form>
    </Modal>
  );
}
