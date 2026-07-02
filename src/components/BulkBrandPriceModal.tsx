import React, { useState } from 'react';
import Modal from './Modal';
import { useStore, toUSD, fromUSD, formatCurrency } from '../store';
import { RefreshCw, DollarSign, Tag, ArrowRight, ArrowLeft } from 'lucide-react';
import clsx from 'clsx';

interface BulkBrandPriceModalProps {
  isOpen: boolean;
  onClose: () => void;
  brandId: string;
  brandName: string;
}

type PreviewItem = {
  id: string;
  name: string;
  sku: string;
  oldCost: number;
  newCost: number;
  oldRetail: number;
  newRetail: number;
};

export default function BulkBrandPriceModal({
  isOpen,
  onClose,
  brandId,
  brandName,
}: BulkBrandPriceModalProps) {
  const { items, updateBrandPrices } = useStore();
  
  const [step, setStep] = useState<'config' | 'preview'>('config');
  const [saving, setSaving] = useState(false);
  
  const [updateCost, setUpdateCost] = useState(false);
  const [costOperation, setCostOperation] = useState<'add' | 'set'>('set');
  const [costValue, setCostValue] = useState<number | ''>('');
  const [costCurrency, setCostCurrency] = useState('USD');

  const [updateRetail, setUpdateRetail] = useState(false);
  const [retailOperation, setRetailOperation] = useState<'add' | 'set'>('set');
  const [retailValue, setRetailValue] = useState<number | ''>('');
  const [retailCurrency, setRetailCurrency] = useState('ZMW');

  const [previewItems, setPreviewItems] = useState<PreviewItem[]>([]);

  const handlePreview = () => {
    if (!updateCost && !updateRetail) return;

    if (updateCost && costValue === '') {
      alert('Please enter a value for Cost Price.');
      return;
    }
    if (updateRetail && retailValue === '') {
      alert('Please enter a value for Retail Price.');
      return;
    }

    const brandItems = items.filter(i => i.brand_id === brandId);
    
    const previews = brandItems.map(item => {
      let oldCost = updateCost ? fromUSD(item.avg_cost_USD || 0, costCurrency) : 0;
      let newCost = oldCost;
      if (updateCost && costValue !== '') {
        newCost = costOperation === 'set' ? Number(costValue) : Math.max(0, oldCost + Number(costValue));
      }

      let oldRetail = updateRetail ? fromUSD(item.retail_price || 0, retailCurrency) : 0;
      let newRetail = oldRetail;
      if (updateRetail && retailValue !== '') {
        newRetail = retailOperation === 'set' ? Number(retailValue) : Math.max(0, oldRetail + Number(retailValue));
      }

      return {
        id: item.id,
        name: item.name,
        sku: item.sku || '-',
        oldCost,
        newCost,
        oldRetail,
        newRetail
      };
    });

    setPreviewItems(previews);
    setStep('preview');
  };

  const handleSave = async () => {
    if (!window.confirm(`Save these new prices for ${previewItems.length} items?`)) return;

    setSaving(true);
    try {
      const itemUpdates = previewItems.map(p => {
        return {
          id: p.id,
          avg_cost_USD: updateCost ? toUSD(p.newCost, costCurrency) : undefined,
          retail_price: updateRetail ? toUSD(p.newRetail, retailCurrency) : undefined
        };
      });

      await updateBrandPrices(brandId, itemUpdates);
      alert(`Prices updated successfully for ${previewItems.length} items.`);
      onClose();
    } catch (err: any) {
      console.error(err);
      alert(`Failed to update prices: ${err.message}`);
    } finally {
      setSaving(false);
    }
  };

  const updatePreviewItem = (id: string, field: 'newCost' | 'newRetail', val: string) => {
    const num = val === '' ? 0 : Number(val);
    setPreviewItems(prev => prev.map(p => p.id === id ? { ...p, [field]: num } : p));
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={`Bulk Price Update: ${brandName}`}
      description={step === 'config' ? "Configure price changes for all items in this brand." : "Review and adjust individual item prices before saving."}
      size={step === 'config' ? 'md' : '4xl'}
    >
      {step === 'config' && (
        <div className="space-y-6">
          <div className="bg-gray-50 p-4 rounded-xl border border-gray-100">
            <label className="flex items-center gap-2 font-bold text-gray-900 cursor-pointer">
              <input 
                type="checkbox" 
                className="rounded border-gray-300 text-primary focus:ring-primary w-4 h-4 cursor-pointer"
                checked={updateCost}
                onChange={(e) => setUpdateCost(e.target.checked)}
              />
              <DollarSign className="w-4 h-4 text-emerald-600" />
              Update Cost Price
            </label>

            {updateCost && (
              <div className="mt-4 grid grid-cols-1 sm:grid-cols-3 gap-3 animate-in fade-in slide-in-from-top-2">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Operation</label>
                  <select 
                    className="input-field py-2"
                    value={costOperation}
                    onChange={(e) => setCostOperation(e.target.value as 'add' | 'set')}
                  >
                    <option value="set">Set to Value</option>
                    <option value="add">Add Value (+/-)</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Value</label>
                  <input 
                    type="number" 
                    step="0.01" 
                    className="input-field py-2"
                    placeholder="0.00"
                    value={costValue}
                    onChange={(e) => setCostValue(e.target.value === '' ? '' : Number(e.target.value))}
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Currency</label>
                  <select 
                    className="input-field py-2"
                    value={costCurrency}
                    onChange={(e) => setCostCurrency(e.target.value)}
                  >
                    <option value="USD">USD</option>
                    <option value="ZMW">ZMW</option>
                  </select>
                </div>
              </div>
            )}
          </div>

          <div className="bg-gray-50 p-4 rounded-xl border border-gray-100">
            <label className="flex items-center gap-2 font-bold text-gray-900 cursor-pointer">
              <input 
                type="checkbox" 
                className="rounded border-gray-300 text-primary focus:ring-primary w-4 h-4 cursor-pointer"
                checked={updateRetail}
                onChange={(e) => setUpdateRetail(e.target.checked)}
              />
              <Tag className="w-4 h-4 text-blue-600" />
              Update Retail Price
            </label>

            {updateRetail && (
              <div className="mt-4 grid grid-cols-1 sm:grid-cols-3 gap-3 animate-in fade-in slide-in-from-top-2">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Operation</label>
                  <select 
                    className="input-field py-2"
                    value={retailOperation}
                    onChange={(e) => setRetailOperation(e.target.value as 'add' | 'set')}
                  >
                    <option value="set">Set to Value</option>
                    <option value="add">Add Value (+/-)</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Value</label>
                  <input 
                    type="number" 
                    step="0.01" 
                    className="input-field py-2"
                    placeholder="0.00"
                    value={retailValue}
                    onChange={(e) => setRetailValue(e.target.value === '' ? '' : Number(e.target.value))}
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Currency</label>
                  <select 
                    className="input-field py-2"
                    value={retailCurrency}
                    onChange={(e) => setRetailCurrency(e.target.value)}
                  >
                    <option value="USD">USD</option>
                    <option value="ZMW">ZMW</option>
                  </select>
                </div>
              </div>
            )}
          </div>

          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose} className="btn-secondary flex-1">
              Cancel
            </button>
            <button 
              onClick={handlePreview} 
              disabled={(!updateCost && !updateRetail)} 
              className="btn-primary flex-1 flex items-center justify-center gap-2 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 disabled:opacity-50"
            >
              Preview Updates <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {step === 'preview' && (
        <div className="space-y-4 animate-in fade-in slide-in-from-bottom-2">
          <div className="bg-blue-50 text-blue-800 text-xs font-bold px-4 py-2 rounded-lg border border-blue-100 flex justify-between items-center">
            <span>Updating {previewItems.length} items.</span>
            <span className="text-[10px] uppercase tracking-wider font-black">
              {updateCost && `Cost: ${costCurrency} `} 
              {updateCost && updateRetail && '| '}
              {updateRetail && `Retail: ${retailCurrency}`}
            </span>
          </div>

          <div className="max-h-[60vh] overflow-y-auto border border-gray-100 rounded-xl">
            <table className="w-full text-left text-sm whitespace-nowrap">
              <thead className="bg-gray-50/80 backdrop-blur sticky top-0 z-10 text-xs uppercase tracking-wider text-gray-500 font-bold">
                <tr>
                  <th className="px-4 py-3">Item Name</th>
                  <th className="px-4 py-3">SKU</th>
                  {updateCost && <th className="px-4 py-3 text-right">Old Cost</th>}
                  {updateCost && <th className="px-4 py-3">New Cost</th>}
                  {updateRetail && <th className="px-4 py-3 text-right">Old Retail</th>}
                  {updateRetail && <th className="px-4 py-3">New Retail</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {previewItems.map(item => (
                  <tr key={item.id} className="hover:bg-gray-50/50 transition-colors">
                    <td className="px-4 py-3 font-bold text-gray-900 truncate max-w-[200px]" title={item.name}>{item.name}</td>
                    <td className="px-4 py-3 text-gray-500 text-xs font-mono">{item.sku}</td>
                    {updateCost && (
                      <td className="px-4 py-3 text-right text-gray-400 line-through">
                        {costCurrency === 'USD' ? '$' : 'K'}{item.oldCost.toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2})}
                      </td>
                    )}
                    {updateCost && (
                      <td className="px-4 py-2">
                        <div className="flex items-center gap-1">
                          <span className="text-gray-400 text-xs">{costCurrency === 'USD' ? '$' : 'K'}</span>
                          <input 
                            type="number" 
                            step="0.01" 
                            className="input-field w-24 h-8 text-sm font-bold px-2"
                            value={item.newCost}
                            onChange={(e) => updatePreviewItem(item.id, 'newCost', e.target.value)}
                          />
                        </div>
                      </td>
                    )}
                    {updateRetail && (
                      <td className="px-4 py-3 text-right text-gray-400 line-through">
                        {retailCurrency === 'USD' ? '$' : 'K'}{item.oldRetail.toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2})}
                      </td>
                    )}
                    {updateRetail && (
                      <td className="px-4 py-2">
                        <div className="flex items-center gap-1">
                          <span className="text-gray-400 text-xs">{retailCurrency === 'USD' ? '$' : 'K'}</span>
                          <input 
                            type="number" 
                            step="0.01" 
                            className="input-field w-24 h-8 text-sm font-bold px-2"
                            value={item.newRetail}
                            onChange={(e) => updatePreviewItem(item.id, 'newRetail', e.target.value)}
                          />
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
            {previewItems.length === 0 && (
              <div className="p-8 text-center text-gray-400 font-medium text-sm">
                No items found for this brand.
              </div>
            )}
          </div>

          <div className="flex gap-3 pt-4 border-t border-gray-100">
            <button type="button" onClick={() => setStep('config')} className="btn-secondary px-6">
              <ArrowLeft className="w-4 h-4 mr-2" /> Back
            </button>
            <div className="flex-1"></div>
            <button 
              onClick={handleSave} 
              disabled={saving || previewItems.length === 0} 
              className="btn-primary px-8 flex items-center justify-center gap-2 bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-600 hover:to-teal-600 shadow-lg shadow-emerald-200 disabled:opacity-50"
            >
              {saving ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  Saving...
                </>
              ) : (
                'Confirm & Save Updates'
              )}
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
}
