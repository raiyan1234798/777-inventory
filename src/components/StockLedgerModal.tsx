import React from 'react';
import Modal from './Modal';
import { useStore } from '../store';
import { ArrowRight, ArrowLeft, ShoppingCart, Truck, RotateCcw, AlertTriangle } from 'lucide-react';
import { format } from 'date-fns';

interface StockLedgerModalProps {
  isOpen: boolean;
  onClose: () => void;
  itemId: string | null;
  locationId: string | null;
  dateFrom: string;
  dateTo: string;
  mode: 'supplied' | 'received' | null;
}

export default function StockLedgerModal({ isOpen, onClose, itemId, locationId, dateFrom, dateTo, mode }: StockLedgerModalProps) {
  const { transactions, sales, returns, locations, items } = useStore();

  if (!isOpen || !itemId || !locationId || !mode) return null;

  const item = items.find(i => i.id === itemId);
  const location = locations.find(l => l.id === locationId);

  const isOnDate = (timestamp: string) => {
    const d = new Date(timestamp).toISOString().split('T')[0];
    return d >= dateFrom && d <= dateTo;
  };

  const ledgerEntries = [];

  if (mode === 'supplied') {
    // Sales
    sales.forEach(s => {
      if (s.item_id === itemId && s.location_id === locationId && isOnDate(s.timestamp)) {
        ledgerEntries.push({
          id: s.id,
          date: s.timestamp,
          type: 'Sale',
          quantity: s.quantity,
          destination: 'Customer',
          icon: <ShoppingCart className="w-4 h-4 text-emerald-500" />
        });
      }
    });

    // Transfers Out
    transactions.forEach(t => {
      if (t.item_id === itemId && t.from_location === locationId && t.type === 'transfer' && isOnDate(t.timestamp)) {
        const destLoc = locations.find(l => l.id === t.to_location);
        ledgerEntries.push({
          id: t.id,
          date: t.timestamp,
          type: 'Transfer Out',
          quantity: t.quantity,
          destination: destLoc?.name || 'Unknown Location',
          icon: <ArrowRight className="w-4 h-4 text-orange-500" />
        });
      }
    });
    
    // Also include negative opening balances that were offset to supplied
    // This is harder to calculate dynamically per item here unless we re-run the logic.
    // For now, we show actual transactions. 
  } else if (mode === 'received') {
    // Stock Entries & Transfers In
    transactions.forEach(t => {
      if (t.item_id === itemId && (t.to_location === locationId || (t.location_id === locationId && !t.to_location)) && (t.type === 'stock_entry' || t.type === 'transfer') && isOnDate(t.timestamp)) {
        const sourceLoc = t.type === 'transfer' ? locations.find(l => l.id === t.from_location)?.name || 'Unknown Location' : 'Supplier / Import';
        ledgerEntries.push({
          id: t.id,
          date: t.timestamp,
          type: t.type === 'transfer' ? 'Transfer In' : 'Stock Entry',
          quantity: t.quantity,
          source: sourceLoc,
          icon: t.type === 'transfer' ? <ArrowLeft className="w-4 h-4 text-blue-500" /> : <Truck className="w-4 h-4 text-purple-500" />
        });
      }
    });
  }

  // Sort chronologically
  ledgerEntries.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  const totalQty = ledgerEntries.reduce((sum, e) => sum + (e.quantity || 0), 0);

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={`${mode === 'supplied' ? 'Supplied' : 'Received'} Breakdown`}
      description={`Ledger for ${item?.name} at ${location?.name || 'Multiple Locations'}`}
      size="md"
    >
      <div className="space-y-4">
        <div className="flex justify-between items-center bg-gray-50 p-3 rounded-lg border border-gray-100">
          <span className="text-xs font-bold text-gray-500 uppercase">Period</span>
          <span className="text-sm font-bold text-gray-900">{dateFrom} to {dateTo}</span>
        </div>
        
        <div className="max-h-[400px] overflow-y-auto pr-2 space-y-2">
          {ledgerEntries.length > 0 ? (
            ledgerEntries.map(entry => (
              <div key={entry.id} className="flex items-center justify-between p-3 border border-gray-100 rounded-xl hover:bg-gray-50 transition-colors">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-white rounded-lg shadow-sm border border-gray-100">
                    {entry.icon}
                  </div>
                  <div>
                    <p className="text-sm font-bold text-gray-900">{entry.type}</p>
                    <p className="text-xs text-gray-500">
                      {format(new Date(entry.date), 'MMM d, yyyy h:mm a')}
                    </p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-lg font-black text-gray-900">{entry.quantity}</p>
                  <p className="text-[10px] font-bold text-gray-400 uppercase">
                    {mode === 'supplied' ? `To: ${entry.destination}` : `From: ${entry.source}`}
                  </p>
                </div>
              </div>
            ))
          ) : (
            <div className="text-center py-8">
              <AlertTriangle className="w-8 h-8 text-yellow-400 mx-auto mb-2" />
              <p className="text-sm font-bold text-gray-900">No transactions found</p>
              <p className="text-xs text-gray-500 mt-1">This quantity might be due to a negative balance offset.</p>
            </div>
          )}
        </div>
        
        {ledgerEntries.length > 0 && (
          <div className="flex justify-between items-center bg-gray-900 text-white p-4 rounded-xl mt-4">
            <span className="text-sm font-bold">Total Accounted</span>
            <span className="text-xl font-black">{totalQty}</span>
          </div>
        )}
      </div>
    </Modal>
  );
}
