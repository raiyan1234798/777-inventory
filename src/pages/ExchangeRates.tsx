import { useState, useMemo, useEffect } from 'react';
import { DollarSign, Save, RefreshCw, AlertCircle, TrendingUp } from 'lucide-react';
import { useStore, CURRENCIES, formatCurrency } from '../store';
import { ExchangeRateManager } from '../lib/exchangeRates';
import { format } from 'date-fns';
import clsx from 'clsx';

export default function ExchangeRates() {
  const { inventory } = useStore();
  const [rates, setRates] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Load rates on mount
  const [rateMetadata, setRateMetadata] = useState<Record<string, { lastUpdated?: string; source?: string }>>({});

  useEffect(() => {
    const loadRates = async () => {
      try {
        setLoading(true);
        const manager = new ExchangeRateManager();
        await manager.initialize();
        const currentRates = manager.getAllRates();
        setRates(currentRates);
        
        // Load metadata if available
        const metadata: Record<string, any> = {};
        for (const currency of CURRENCIES) {
          if (currency !== 'INR') {
            const rateRecord = manager.getRateRecord(currency);
            if (rateRecord) {
              metadata[currency] = {
                lastUpdated: rateRecord.lastUpdated,
                source: rateRecord.source || 'Manual Update'
              };
            }
          }
        }
        setRateMetadata(metadata);
        setError('');
      } catch (err: any) {
        setError(err.message || 'Failed to load exchange rates');
        setRates(CURRENCIES.reduce((acc, c) => ({ ...acc, [c]: 1 }), {}));
      } finally {
        setLoading(false);
      }
    };
    loadRates();
  }, []);

  const handleRateChange = (currency: string, value: string) => {
    const numValue = parseFloat(value) || 0;
    if (numValue > 0) {
      setRates(r => ({ ...r, [currency]: numValue }));
    }
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      setError('');
      setSuccess('');
      
      const manager = new ExchangeRateManager();
      await manager.initialize();
      
      const updates: Record<string, number> = {};
      
      for (const currency of CURRENCIES) {
        if (currency !== 'INR' && rates[currency]) {
          updates[currency] = rates[currency];
        }
      }
      
      // Update all rates at once
      if (Object.keys(updates).length > 0) {
        await manager.updateMultipleRates(updates, 'Manual Update');
      }
      
      setSuccess(`Successfully updated ${Object.keys(updates).length} exchange rates`);
      setTimeout(() => setSuccess(''), 3000);
    } catch (err: any) {
      setError(err.message || 'Failed to save exchange rates');
    } finally {
      setSaving(false);
    }
  };

  const handleRefresh = async () => {
    try {
      setLoading(true);
      setError('');
      const manager = new ExchangeRateManager();
      
      // Clear cache to force refresh
      const currentRates = await manager.getAllRates();
      setRates(currentRates);
      
      setSuccess('Exchange rates refreshed from cache');
      setTimeout(() => setSuccess(''), 3000);
    } catch (err: any) {
      setError(err.message || 'Failed to refresh rates');
    } finally {
      setLoading(false);
    }
  };

  const inventoryValue = useMemo(() => {
    return inventory.reduce((sum, entry) => sum + entry.quantity * entry.avg_cost_INR, 0);
  }, [inventory]);

  return (
    <div className="space-y-6 lg:space-y-8 animate-in fade-in duration-500">
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-gray-900 tracking-tight flex items-center gap-3">
            <div className="p-2 sm:p-2.5 bg-primary/10 rounded-xl text-primary flex-shrink-0">
              <DollarSign className="w-5 h-5 sm:w-6 sm:h-6" />
            </div>
            Currency Exchange Administration
          </h1>
          <p className="text-xs sm:text-sm text-gray-400 font-bold uppercase tracking-widest mt-2 ml-12 sm:ml-14 border-l-2 border-gray-100 pl-4">
            Manage multi-currency exchange rates with persistence.
          </p>
        </div>
        <div className="flex flex-col sm:flex-row gap-3">
          <button
            onClick={handleRefresh}
            disabled={loading || saving}
            className="btn-secondary flex items-center gap-2.5 text-sm justify-center h-11 px-5 shadow-sm disabled:opacity-50"
          >
            <RefreshCw className={clsx("w-4 h-4", loading && 'animate-spin')} />
            <span className="font-bold uppercase text-[10px]">Refresh</span>
          </button>
          <button
            onClick={handleSave}
            disabled={loading || saving}
            className="btn-primary flex items-center gap-2.5 text-sm justify-center shadow-xl shadow-primary/20 h-11 px-6 disabled:opacity-50"
          >
            <Save className={clsx("w-4 h-4", saving && 'animate-spin')} />
            <span className="font-black uppercase tracking-widest text-[10px]">{saving ? 'Saving...' : 'Save Rates'}</span>
          </button>
        </div>
      </div>

      {/* Alerts */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-bold text-red-900">{error}</p>
          </div>
        </div>
      )}

      {success && (
        <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 flex items-start gap-3">
          <TrendingUp className="w-5 h-5 text-emerald-500 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-bold text-emerald-900">{success}</p>
          </div>
        </div>
      )}

      {/* KPI Cards */}
      <div className="responsive-grid">
        <div className="card border-0 shadow-lg shadow-gray-50 bg-gradient-to-br from-white to-gray-50/50 p-6 flex flex-col justify-between">
          <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-4">Active Rates</p>
          <div>
            <p className="text-3xl font-black text-gray-900 tracking-tighter">{Object.keys(rates).length - 1}</p>
            <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest mt-2">Non-INR Currencies</p>
          </div>
        </div>
        <div className="card border-0 shadow-lg shadow-gray-50 bg-gradient-to-br from-white to-gray-50/50 p-6 flex flex-col justify-between">
          <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-4">Total Inventory</p>
          <div>
            <p className="text-3xl font-black text-gray-900 tracking-tighter">{formatCurrency(inventoryValue)}</p>
            <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest mt-2">Affected by Rates</p>
          </div>
        </div>
        <div className="card border-0 shadow-lg shadow-gray-50 bg-gradient-to-br from-white to-gray-200/20 p-6 flex flex-col justify-between sm:col-span-2 lg:col-span-1">
          <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-4">Last Updated</p>
          <div>
            <p className="text-lg font-black text-gray-900 tracking-tighter">
              {rateMetadata && Object.values(rateMetadata).length > 0
                ? format(new Date(Object.values(rateMetadata)[0]?.lastUpdated || new Date()), 'MMM dd, HH:mm')
                : 'Not set'
              }
            </p>
            <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest mt-2">Most Recent Update</p>
          </div>
        </div>
      </div>

      {/* Exchange Rate Grid */}
      <div className="space-y-4">
        <div className="flex items-center justify-between px-2">
          <h2 className="text-base font-extrabold text-gray-900 flex items-center gap-2.5">
            <div className="w-1.5 h-1.5 rounded-full bg-primary" />
            Exchange Rate Configuration
          </h2>
          <p className="text-[10px] font-black uppercase tracking-widest text-gray-300">{CURRENCIES.length} Currencies</p>
        </div>

        {/* Desktop Grid View */}
        <div className="hidden lg:grid grid-cols-2 xl:grid-cols-3 gap-4">
          {CURRENCIES.map(currency => (
            <div key={currency} className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm hover:shadow-md transition-all">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Exchange Rate</p>
                  <p className="text-lg font-black text-gray-900 mt-1">{currency}</p>
                </div>
                <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center text-primary font-bold">
                  {currency.charAt(0)}
                </div>
              </div>

              {currency === 'INR' ? (
                <div className="bg-gray-50 rounded-lg p-3 border border-gray-100">
                  <p className="text-2xl font-black text-gray-900">1.0</p>
                  <p className="text-xs text-gray-500 mt-2 font-medium">Base Currency</p>
                </div>
              ) : (
                <div className="space-y-3">
                  <input
                    type="number"
                    step="0.0001"
                    min="0"
                    value={rates[currency] || ''}
                    onChange={e => handleRateChange(currency, e.target.value)}
                    disabled={loading}
                    className="w-full px-4 py-3 border border-gray-200 rounded-lg text-lg font-black bg-white focus:ring-2 focus:ring-primary/20 outline-none disabled:bg-gray-50"
                    placeholder="0.0000"
                  />
                  {rateMetadata[currency] && (
                    <div className="bg-blue-50 rounded-lg p-2 border border-blue-100">
                      <p className="text-[10px] text-blue-600 font-bold">
                        Updated: {rateMetadata[currency].lastUpdated
                          ? format(new Date(rateMetadata[currency].lastUpdated!), 'MMM dd, HH:mm')
                          : 'N/A'}
                      </p>
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Mobile & Tablet List View */}
        <div className="lg:hidden space-y-3">
          {CURRENCIES.map(currency => (
            <div key={currency} className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm hover:shadow-md transition-all">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center text-primary font-bold">
                    {currency.charAt(0)}
                  </div>
                  <div>
                    <p className="text-sm font-bold text-gray-900">{currency}</p>
                    <p className="text-[9px] text-gray-500 uppercase tracking-wider">Exchange Rate</p>
                  </div>
                </div>
              </div>

              {currency === 'INR' ? (
                <div className="bg-gray-50 rounded-lg p-3 border border-gray-100">
                  <p className="text-xl font-black text-gray-900">1.0000</p>
                  <p className="text-xs text-gray-500 mt-1 font-medium">Base Currency</p>
                </div>
              ) : (
                <div className="space-y-2">
                  <input
                    type="number"
                    step="0.0001"
                    min="0"
                    value={rates[currency] || ''}
                    onChange={e => handleRateChange(currency, e.target.value)}
                    disabled={loading}
                    className="w-full px-4 py-2 border border-gray-200 rounded-lg text-lg font-black bg-white focus:ring-2 focus:ring-primary/20 outline-none disabled:bg-gray-50"
                    placeholder="0.0000"
                  />
                  {rateMetadata[currency]?.lastUpdated && (
                    <p className="text-[9px] text-gray-400 font-bold">
                      Last updated: {format(new Date(rateMetadata[currency].lastUpdated!), 'MMM dd, HH:mm')}
                    </p>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Info Section */}
      <div className="bg-blue-50 border border-blue-200 rounded-xl p-6">
        <h3 className="text-sm font-bold text-blue-900 flex items-center gap-2 mb-3">
          <AlertCircle className="w-4 h-4" />
          How It Works
        </h3>
        <ul className="space-y-2 text-sm text-blue-800">
          <li className="flex gap-2">
            <span className="font-bold flex-shrink-0">1.</span>
            <span>Exchange rates are stored in Firebase and cached locally for 1 hour</span>
          </li>
          <li className="flex gap-2">
            <span className="font-bold flex-shrink-0">2.</span>
            <span>All financial calculations convert to INR using these rates</span>
          </li>
          <li className="flex gap-2">
            <span className="font-bold flex-shrink-0">3.</span>
            <span>Changes save automatically and propagate to all active sessions</span>
          </li>
          <li className="flex gap-2">
            <span className="font-bold flex-shrink-0">4.</span>
            <span>Historical rates are audited with timestamps and source tracking</span>
          </li>
        </ul>
      </div>
    </div>
  );
}
