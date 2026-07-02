import { useState, useMemo, useRef } from 'react';
import { Plus, Trash2, Calendar, AlertTriangle } from 'lucide-react';
import Modal from './Modal';
import { useStore, CURRENCIES, formatCurrency, toUSD, fromUSD } from '../store';
import { useAuthStore } from '../store/authStore';
import clsx from 'clsx';

export default function GlobalRecordSaleModal() {
  const { appUser } = useAuthStore();
  const { 
    locations, items, inventory, recordSale, brands, createNotification,
    isRecordSaleModalOpen, isRecordSaleModalMinimized,
    setRecordSaleModalOpen, setRecordSaleModalMinimized,
    exchangeRates
  } = useStore();

  const [recordSaleLocation, setRecordSaleLocation] = useState<string>('');
  const [recordSaleGroups, setRecordSaleGroups] = useState<{ brand_id: string; _id: number; items: { item_id: string; quantity: number; selling_price: number; currency: string; _id: number }[] }[]>([{ brand_id: '', _id: Date.now(), items: [{ item_id: '', quantity: 1, selling_price: 0, currency: 'ZMW', _id: Date.now() + 1 }] }]);

  const [saving, setSaving] = useState(false);
  const isSubmitting = useRef(false);
  
  const todayDateStr = new Date().toISOString().split('T')[0];
  const [saleDate, setSaleDate] = useState<string>(todayDateStr);
  const [customZmwRate, setCustomZmwRate] = useState<number>(exchangeRates['ZMW'] || 18);

  const shops = locations.filter(l => l.type === 'shop');

  const allSaleItems = recordSaleGroups.flatMap(g => g.items.map(i => ({ brand_id: g.brand_id, ...i })));

  const shopItems = useMemo(() => {
    if (!recordSaleLocation) return [];
    
    // Create an item map for faster lookups O(1) instead of O(N) inside the loop
    const itemMap = new Map();
    for (const item of items) {
      itemMap.set(item.id, item);
    }

    return inventory
      .filter(e => e.location_id === recordSaleLocation && e.quantity > 0)
      .map(e => ({ ...e, item: itemMap.get(e.item_id) }))
      .filter(e => e.item)
      .sort((a, b) => a.item!.name.localeCompare(b.item!.name));
  }, [recordSaleLocation, inventory, items]);

  const totalEstimatedProfit = allSaleItems.reduce((acc, si) => {
    if (!si.item_id || si.selling_price <= 0) return acc;
    const costUSD = items.find(i => i.id === si.item_id)?.avg_cost_USD
      ?? inventory.find(e => e.location_id === recordSaleLocation && e.item_id === si.item_id)?.avg_cost_USD
      ?? 0;

    // EXACT formula: profit = (retail_price_per_unit - unit_cost_USD × exchange_rate) × qty
    const unitCostLocal = fromUSD(costUSD, si.currency); // unit_cost_USD × rate
    const profitPerUnit = si.selling_price - unitCostLocal;  // retail - cost_in_local
    const profitLocal = profitPerUnit < 0 ? 0 : profitPerUnit * si.quantity;

    // Convert local profit back to USD for the summary (formatCurrency will re-convert for display)
    return acc + toUSD(profitLocal, si.currency);
  }, 0);
  
  const totalAmount = allSaleItems.reduce((acc, si) => acc + toUSD(si.selling_price * si.quantity, si.currency), 0);

  const handleRecordSale = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!recordSaleLocation || saving || isSubmitting.current) return;
    
    for (let i = 0; i < allSaleItems.length; i++) {
      const si = allSaleItems[i];
      if (!si.item_id) {
        alert("Please select an item for all rows.");
        return;
      }
      const inv = inventory.find(en => en.location_id === recordSaleLocation && en.item_id === si.item_id);
      if (!inv || inv.quantity < si.quantity) {
        alert("Not enough quantity in inventory for one of the selected items.");
        return;
      }
    }

    const totalQty = allSaleItems.reduce((acc, si) => acc + si.quantity, 0);
    if (!window.confirm(`Are you sure you want to complete this sale?\n\n• Items: ${allSaleItems.length} (${totalQty} units)\n• Total Value: ${formatCurrency(totalAmount)}`)) {
      return;
    }

    isSubmitting.current = true;
    setSaving(true);
    try {
      const appliedRates = saleDate !== todayDateStr ? { ...exchangeRates, 'ZMW': customZmwRate } : exchangeRates;

      await useStore.getState().batchRecordSale(allSaleItems.map(si => {
        const itemName = items.find(i => i.id === si.item_id)?.name ?? 'Unknown Item';
        return {
          location_id: recordSaleLocation,
          item_id: si.item_id,
          item_name: itemName,
          quantity: si.quantity,
          selling_price: si.selling_price,
          currency: si.currency,
          sold_by: appUser?.name ?? 'Staff',
          timestamp: saleDate !== todayDateStr
            ? new Date(saleDate + 'T12:00:00').toISOString()
            : new Date().toISOString(),
        };
      }), { exchange_rates: appliedRates });


      const shopName = locations.find(l => l.id === recordSaleLocation)?.name ?? 'Shop';
      const itemNames = allSaleItems.map(si => items.find(i => i.id === si.item_id)?.name).filter(Boolean);
      const uniqueItemNames = Array.from(new Set(itemNames));
      const totalQty = allSaleItems.reduce((acc, si) => acc + si.quantity, 0);
      const summaryText = uniqueItemNames.length <= 2 
        ? uniqueItemNames.join(' and ') 
        : `${uniqueItemNames.slice(0, 2).join(', ')} and ${uniqueItemNames.length - 2} other(s)`;

      await createNotification({
        type: 'sale',
        location_id: recordSaleLocation,
        message: `🛍️ Bulk Sale Recorded: ${totalQty} units across ${allSaleItems.length} items (${summaryText}) sold at ${shopName} by ${appUser?.name ?? 'Staff'}.`,
        target_roles: ['super_admin', 'admin', 'shop_staff'],
      });

      setRecordSaleModalOpen(false);
      setRecordSaleModalMinimized(false);
      setRecordSaleLocation('');
      setRecordSaleGroups([{ brand_id: '', _id: Date.now(), items: [{ item_id: '', quantity: 1, selling_price: 0, currency: 'ZMW', _id: Date.now() + 1 }] }]);
    } catch (err: any) {
      alert(err.message);
    } finally {
      setSaving(false);
      isSubmitting.current = false;
    }
  };

  const addSaleGroupRow = () => {
    const loc = locations.find(l => l.id === recordSaleLocation);
    const defaultCurrency = 'ZMW';
    const newId = Date.now();
    setRecordSaleGroups([...recordSaleGroups, { brand_id: '', _id: newId, items: [{ item_id: '', quantity: 1, selling_price: 0, currency: defaultCurrency, _id: newId + 1 }] }]);
  };

  const removeSaleGroupRow = (index: number) => {
    setRecordSaleGroups(recordSaleGroups.filter((_, i) => i !== index));
  };
  
  const addSaleItemToGroup = (groupIndex: number) => {
    const loc = locations.find(l => l.id === recordSaleLocation);
    const defaultCurrency = 'ZMW';
    const newGroups = [...recordSaleGroups];
    newGroups[groupIndex].items.push({ item_id: '', quantity: 1, selling_price: 0, currency: defaultCurrency, _id: Date.now() });
    setRecordSaleGroups(newGroups);
  };
  
  const removeSaleItemFromGroup = (groupIndex: number, itemIndex: number) => {
    const newGroups = [...recordSaleGroups];
    newGroups[groupIndex].items = newGroups[groupIndex].items.filter((_, i) => i !== itemIndex);
    setRecordSaleGroups(newGroups);
  };

  const minimizeLabel = (() => {
    const shopName = recordSaleLocation ? locations.find(l => l.id === recordSaleLocation)?.name : null;
    const selectedCount = allSaleItems.filter(i => i.item_id).length;
    if (!shopName) return 'Selecting shop...';
    return `Sale at ${shopName} · ${selectedCount} item${selectedCount !== 1 ? 's' : ''}`;
  })();

  if (!isRecordSaleModalOpen && !isRecordSaleModalMinimized) return null;

  return (
    <Modal
      isOpen={isRecordSaleModalOpen || isRecordSaleModalMinimized}
      onClose={() => {
        setRecordSaleModalOpen(false);
        setRecordSaleModalMinimized(false);
        // Reset state on close
        setRecordSaleLocation('');
        setRecordSaleGroups([{ brand_id: '', _id: Date.now(), items: [{ item_id: '', quantity: 1, selling_price: 0, currency: 'ZMW', _id: Date.now() + 1 }] }]);
      }}
      onOutsideClick={() => {
        setRecordSaleModalMinimized(true);
        setRecordSaleModalOpen(false);
      }}
      title="Record Multiple Sales"
      description="Record multiple items sold at once"
      size="md"
      minimized={isRecordSaleModalMinimized}
      onMinimize={() => {
        setRecordSaleModalMinimized(true);
        setRecordSaleModalOpen(false);
      }}
      onRestore={() => {
        setRecordSaleModalMinimized(false);
        setRecordSaleModalOpen(true);
      }}
      minimizeLabel={minimizeLabel}
    >
      <form 
        onSubmit={handleRecordSale} 
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            const target = e.target as HTMLElement;
            if (target.tagName === 'INPUT' || target.tagName === 'SELECT') {
              e.preventDefault();
              if (recordSaleGroups.length > 0) {
                addSaleItemToGroup(recordSaleGroups.length - 1);
              }
            }
          }
        }} 
        className="space-y-6"
      >
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <div className="md:col-span-2">
            <label className="label">Shop</label>
            <select
              required
              className="input-field h-12 bg-white font-bold"
              value={recordSaleLocation}
              onChange={e => {
                setRecordSaleLocation(e.target.value);
                const loc = locations.find(l => l.id === e.target.value);
                const defaultCurrency = 'ZMW';
                setRecordSaleGroups([{ brand_id: '', _id: Date.now(), items: [{ item_id: '', quantity: 1, selling_price: 0, currency: defaultCurrency, _id: Date.now() + 1 }] }]);
              }}
            >
              <option value="">Select a shop...</option>
              {shops.map(l => (
                <option key={l.id} value={l.id}>{l.name}</option>
              ))}
            </select>
          </div>
          
          <div className="md:col-span-2 bg-gray-50/50 p-4 rounded-xl border border-gray-100 flex flex-col gap-4">
            <div className="flex items-center justify-between cursor-pointer" onClick={() => {
              if (saleDate === todayDateStr) {
                // do nothing, native date picker triggers on input click
              } else {
                setSaleDate(todayDateStr);
              }
            }}>
              <div className="flex items-center gap-3">
                <div className="p-2 bg-white rounded-lg shadow-sm">
                  <Calendar className="w-5 h-5 text-primary" />
                </div>
                <div>
                  <label className="label mb-0">Sale Date</label>
                  <p className="text-xs text-gray-500 font-medium">Leave as today unless recording past sales</p>
                </div>
              </div>
              <input
                type="date"
                required
                className="input-field h-10 w-40 bg-white font-bold cursor-pointer text-sm"
                value={saleDate}
                max={todayDateStr}
                onChange={(e) => setSaleDate(e.target.value)}
                onClick={(e) => e.stopPropagation()}
              />
            </div>
            
            {saleDate !== todayDateStr && (
              <div className="pl-12 pr-4 pb-2 animate-in slide-in-from-top-2 opacity-100">
                <div className="bg-orange-50 border border-orange-200 rounded-lg p-3 text-xs text-orange-800 font-medium mb-3">
                  <AlertTriangle className="w-4 h-4 inline-block mr-1 -mt-0.5" />
                  Recording a past sale. Please verify the exchange rate that was active on <span className="font-bold">{saleDate}</span>.
                </div>
                
                <div className="flex items-center justify-between bg-white border border-gray-200 rounded-lg p-3">
                  <span className="text-xs font-bold text-gray-600 tracking-wide">USD to ZMW Rate</span>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-medium text-gray-400">1 USD =</span>
                    <input 
                      type="number"
                      step="0.01"
                      min="1"
                      required
                      className="input-field h-8 w-24 text-right font-bold text-sm bg-gray-50"
                      value={customZmwRate}
                      onChange={(e) => setCustomZmwRate(Number(e.target.value))}
                    />
                    <span className="text-xs font-bold text-gray-600">ZMW</span>
                  </div>
                </div>
              </div>
            )}
          </div>

          <div className="md:col-span-2 space-y-4">
            <div className="flex items-center justify-between">
              <label className="label">Items to Record</label>
            </div>

            {recordSaleGroups.map((group, groupIndex) => (
              <div key={group._id} className="p-5 border border-gray-100 rounded-2xl bg-white shadow-sm space-y-5">
                <div className="flex justify-between items-center pb-3 border-b border-gray-50">
                  <span className="text-[10px] uppercase font-black tracking-widest text-primary">Brand Selection #{groupIndex + 1}</span>
                  {recordSaleGroups.length > 1 && (
                    <button type="button" onClick={() => removeSaleGroupRow(groupIndex)} className="text-red-400 hover:text-red-600 transition-colors p-1 bg-red-50 rounded-lg">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>

                <div className="w-full sm:w-1/2">
                  <label className="label text-[10px] mb-1">Select Brand for these Items</label>
                  <select className="input-field h-12 bg-gray-50 font-bold w-full" value={group.brand_id}
                    onChange={e => {
                      const newGroups = [...recordSaleGroups];
                      newGroups[groupIndex].brand_id = e.target.value;
                      newGroups[groupIndex].items = newGroups[groupIndex].items.map(i => ({ ...i, item_id: '' }));
                      setRecordSaleGroups(newGroups);
                    }}
                    disabled={!recordSaleLocation}>
                    <option value="">All Brands</option>
                    {brands.map(b => (
                      <option key={b.id} value={b.id}>{b.name}</option>
                    ))}
                  </select>
                </div>
                
                <div className="space-y-3 pt-2">
                {group.items.map((itemRow, itemIndex) => {
                  const rowEntry = recordSaleLocation && itemRow.item_id
                    ? inventory.find(e => e.location_id === recordSaleLocation && e.item_id === itemRow.item_id)
                    : null;

                  const selectedItem = itemRow.item_id ? items.find(i => i.id === itemRow.item_id) : null;
                  const selectedBrand = selectedItem ? brands.find(b => b.id === selectedItem.brand_id) : null;
                  const selectedSku = selectedItem?.sku?.trim() || 'No SKU';

                  return (
                    <div key={itemRow._id} className="p-4 border border-gray-100 rounded-xl bg-gray-50/50 space-y-4">
                      <div className="flex justify-between items-center mb-1">
                        <span className="text-[10px] uppercase font-black tracking-widest text-gray-400">Item #{itemIndex + 1}</span>
                        {group.items.length > 1 && (
                          <button type="button" onClick={() => removeSaleItemFromGroup(groupIndex, itemIndex)} className="text-red-400 hover:text-red-600 transition-colors">
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
                              const newGroups = [...recordSaleGroups];
                              newGroups[groupIndex].items[itemIndex].item_id = '';
                              setRecordSaleGroups(newGroups);
                            }}
                            className="text-gray-300 hover:text-red-400 transition-colors flex-shrink-0"
                          >
                            <span className="text-xs font-black">✕</span>
                          </button>
                        </div>
                      )}
                      
                      <div className="space-y-3">
                        <div className="flex flex-col sm:flex-row gap-3">
                          <div className="w-full sm:w-2/3">
                            <select required className="input-field h-12 bg-white font-bold w-full" value={itemRow.item_id}
                              onChange={e => {
                                const newGroups = [...recordSaleGroups];
                                const selected = items.find(i => i.id === e.target.value);
                                newGroups[groupIndex].items[itemIndex].item_id = e.target.value;
                                if (selected && selected.retail_price_local) {
                                  newGroups[groupIndex].items[itemIndex].selling_price = Math.round(selected.retail_price_local * (newGroups[groupIndex].items[itemIndex].quantity || 1));
                                  if (selected.local_currency) {
                                    newGroups[groupIndex].items[itemIndex].currency = selected.local_currency;
                                  } else {
                                    newGroups[groupIndex].items[itemIndex].currency = 'ZMW';
                                  }
                                }
                                setRecordSaleGroups(newGroups);
                              }}
                              disabled={!recordSaleLocation}>
                              <option value="">Choose an item...</option>
                              {shopItems
                                .filter(e => !group.brand_id || e.item!.brand_id === group.brand_id)
                                .map(e => {
                                const brand = brands.find(b => b.id === e.item!.brand_id);
                                return (
                                  <option key={e.item_id} value={e.item_id}>
                                    {e.item!.name} | {brand?.name ?? 'No Brand'} | {e.quantity} in stock
                                  </option>
                                );
                              })}
                            </select>
                          </div>
                          <div className="w-full sm:w-1/3">
                            <input placeholder="Qty to Sell" required type="number" min={1} max={rowEntry?.quantity ?? undefined} className="input-field h-12 text-lg font-black w-full"
                              value={itemRow.quantity || ''}
                              onChange={e => {
                                const newGroups = [...recordSaleGroups];
                                const newQty = Number(e.target.value);
                                newGroups[groupIndex].items[itemIndex].quantity = newQty;
                                
                                const selected = items.find(i => i.id === newGroups[groupIndex].items[itemIndex].item_id);
                                if (selected && selected.retail_price_local) {
                                  newGroups[groupIndex].items[itemIndex].selling_price = Math.round(selected.retail_price_local * (newQty || 1));
                                }
                                
                                setRecordSaleGroups(newGroups);
                              }} />
                          </div>
                        </div>

                        <div className="flex flex-col sm:flex-row gap-3">
                          <div className="w-full sm:w-1/3">
                            <select className="input-field h-12 bg-white font-bold w-full" value={itemRow.currency}
                              onChange={e => {
                                const newGroups = [...recordSaleGroups];
                                newGroups[groupIndex].items[itemIndex].currency = e.target.value;
                                setRecordSaleGroups(newGroups);
                              }}>
                              {CURRENCIES.map(c => (
                                <option key={c} value={c}>{c}</option>
                              ))}
                            </select>
                          </div>
                          <div className="w-full sm:w-2/3">
                            <div className="relative">
                              <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 font-bold">
                                {itemRow.currency === 'ZMW' ? 'K' : itemRow.currency === 'USD' ? '$' : itemRow.currency}
                              </span>
                              <input required type="number" step="1" min="0" className="input-field h-12 pl-12 text-lg font-black w-full"
                                placeholder="Total Selling Price"
                                value={itemRow.selling_price || ''}
                                onChange={e => {
                                  const newGroups = [...recordSaleGroups];
                                  newGroups[groupIndex].items[itemIndex].selling_price = Math.round(Number(e.target.value));
                                  setRecordSaleGroups(newGroups);
                                }} />
                            </div>
                          </div>
                        </div>
                      </div>

                      {rowEntry && (() => {
                        // Use the same cost source as profit calculation:
                        // item master avg_cost_USD first, fall back to inventory entry
                        const itemCostUSD = items.find(i => i.id === itemRow.item_id)?.avg_cost_USD ?? rowEntry.avg_cost_USD;
                        // Convert to the currently selected sale currency so the user sees
                        // the true break-even price in the same currency they're selling in
                        const minPriceInSaleCurrency = fromUSD(itemCostUSD, itemRow.currency);
                        const currSymbol = itemRow.currency === 'ZMW' ? 'K' : itemRow.currency === 'USD' ? '$' : itemRow.currency;
                        return (
                          <div className="flex items-center justify-between text-[11px] font-bold uppercase tracking-widest bg-white p-3 rounded-lg border border-gray-100 mt-2">
                            <span className="text-gray-400">Available: <span className="text-primary">{rowEntry.quantity}u</span></span>
                            <span className="text-gray-400">Min Price (Break-even): <span className="text-red-400">{currSymbol}{minPriceInSaleCurrency.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} /u</span></span>
                          </div>
                        );
                      })()}
                    </div>
                  );
                })}
                </div>
                
                <div className="flex justify-end pt-1">
                  <button type="button" onClick={() => addSaleItemToGroup(groupIndex)} className="text-xs h-8 px-3 font-bold uppercase tracking-widest text-primary flex items-center gap-1 hover:bg-primary/5 rounded-lg border border-transparent hover:border-primary/20 transition-all">
                    <Plus className="w-3 h-3" /> Add Item to this Brand
                  </button>
                </div>
              </div>
            ))}

            <div className="flex justify-end pt-2">
              <button type="button" onClick={addSaleGroupRow} className="btn-secondary text-xs h-10 px-4 font-black uppercase tracking-widest text-primary flex items-center gap-1 hover:bg-gray-100 border-dashed border-2 border-primary/30">
                <Plus className="w-4 h-4" /> Add Brand Group
              </button>
            </div>
            
            {recordSaleLocation && shopItems.length === 0 && (
              <p className="text-[10px] text-red-500 font-black uppercase tracking-widest mt-2 flex items-center gap-1">
                 <AlertTriangle className="w-3 h-3" /> Zero Available Stock
              </p>
            )}

          </div>
        </div>

        <div className="bg-gray-900 text-white rounded-2xl p-6 shadow-xl flex flex-col gap-4">
          <div className="flex justify-between items-center pb-4 border-b border-white/10">
            <span className="text-xs font-bold text-gray-400 uppercase tracking-widest">Total Value</span>
            <span className="text-2xl font-black text-emerald-400">{formatCurrency(totalAmount)}</span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-xs font-bold text-gray-400 uppercase tracking-widest">Estimated Net Profit</span>
            <span className={clsx("text-lg font-black", totalEstimatedProfit > 0 ? "text-white" : "text-gray-400")}>
              {formatCurrency(totalEstimatedProfit)}
            </span>
          </div>
        </div>

        <div className="flex justify-end gap-3 pt-6 border-t border-gray-100">
          <button type="button" onClick={() => { setRecordSaleModalOpen(false); setRecordSaleModalMinimized(false); }} className="btn-secondary">
            Cancel
          </button>
          <button type="submit" disabled={saving || isSubmitting.current || !recordSaleLocation} className="btn-primary">
            {saving || isSubmitting.current ? 'Recording...' : 'Complete Sale'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
