import { useState } from 'react';
import { Download, AlertCircle, Loader, Calendar } from 'lucide-react';
import Modal from '../components/Modal';
import { DataExporter } from '../lib/dataExporter';
import type { ExportConfig } from '../lib/dataExporter';
import { useStore } from '../store';
import clsx from 'clsx';

interface ExportDataModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function ExportDataModal({ isOpen, onClose }: ExportDataModalProps) {
  const {
    sales, inventory, returns: returnData, expenses,
    transactions, items, locations
  } = useStore();

  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [selectedSheets, setSelectedSheets] = useState<Set<string>>(
    new Set(['sales', 'inventory', 'returns', 'expenses', 'transfers'])
  );
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [selectedLocation, setSelectedLocation] = useState('');
  const [includeAllLocations, setIncludeAllLocations] = useState(true);

  const toggleSheet = (sheet: string) => {
    const newSet = new Set(selectedSheets);
    if (newSet.has(sheet)) {
      newSet.delete(sheet);
    } else {
      newSet.add(sheet);
    }
    setSelectedSheets(newSet);
  };

  const handleExport = async () => {
    if (selectedSheets.size === 0) {
      setMessage('Please select at least one data type to export');
      return;
    }

    try {
      setLoading(true);
      setMessage('Preparing export...');

      const config: ExportConfig = {
        includeSheets: Array.from(selectedSheets) as any[],
        dateFrom: dateFrom ? new Date(dateFrom) : undefined,
        dateTo: dateTo ? new Date(dateTo) : undefined,
        locationId: selectedLocation,
        includeAllLocations
      };

      await DataExporter.generateCompleteExport(
        {
          sales,
          inventory,
          returns: returnData,
          expenses,
          transfers: transactions,
          items,
          locations
        },
        config
      );

      setMessage('✓ Export downloaded successfully!');
      setTimeout(() => {
        onClose();
        setMessage('');
      }, 2000);
    } catch (err: any) {
      setMessage(err.message || 'Failed to export data');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Export Data to Excel" size="md">
      <div className="space-y-6">
        {/* Sheet Selection */}
        <div>
          <label className="text-sm font-bold text-gray-900 mb-3 block">
            Select Data Types to Export
          </label>
          <div className="space-y-2">
            {[
              { id: 'sales', label: 'Sales Records', count: sales.length },
              { id: 'inventory', label: 'Current Stock', count: inventory.length },
              { id: 'returns', label: 'Returns', count: returnData.length },
              { id: 'expenses', label: 'Expenses', count: expenses.length },
              { id: 'transfers', label: 'Transfers', count: transactions.length }
            ].map(sheet => (
              <label key={sheet.id} className="flex items-center gap-3 p-3 border border-gray-200 rounded-lg hover:bg-gray-50 cursor-pointer">
                <input
                  type="checkbox"
                  checked={selectedSheets.has(sheet.id)}
                  onChange={() => toggleSheet(sheet.id)}
                  className="w-4 h-4"
                />
                <div className="flex-1">
                  <p className="font-bold text-gray-900">{sheet.label}</p>
                  <p className="text-xs text-gray-500">{sheet.count} records</p>
                </div>
              </label>
            ))}
          </div>
        </div>

        {/* Location Filter */}
        <div>
          <label className="text-sm font-bold text-gray-900 mb-3 flex items-center gap-2">
            <Calendar className="w-4 h-4" />
            Filter Options
          </label>
          
          <div className="space-y-4">
            <label className="flex items-center gap-3">
              <input
                type="checkbox"
                checked={includeAllLocations}
                onChange={e => setIncludeAllLocations(e.target.checked)}
                className="w-4 h-4"
              />
              <span className="text-sm font-medium text-gray-700">All Locations</span>
            </label>

            {!includeAllLocations && (
              <select
                value={selectedLocation}
                onChange={e => setSelectedLocation(e.target.value)}
                className="w-full px-4 py-2 border border-gray-200 rounded-lg font-bold focus:ring-2 focus:ring-primary/20 outline-none"
              >
                <option value="">Select Location...</option>
                {locations.map(loc => (
                  <option key={loc.id} value={loc.id}>
                    {loc.name} ({loc.type})
                  </option>
                ))}
              </select>
            )}
          </div>
        </div>

        {/* Date Range */}
        <div>
          <p className="text-sm font-bold text-gray-900 mb-3">Date Range (Optional)</p>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-bold text-gray-600 block mb-2">From</label>
              <input
                type="date"
                value={dateFrom}
                onChange={e => setDateFrom(e.target.value)}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg font-bold focus:ring-2 focus:ring-primary/20 outline-none"
              />
            </div>
            <div>
              <label className="text-xs font-bold text-gray-600 block mb-2">To</label>
              <input
                type="date"
                value={dateTo}
                onChange={e => setDateTo(e.target.value)}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg font-bold focus:ring-2 focus:ring-primary/20 outline-none"
              />
            </div>
          </div>
        </div>

        {/* Status Message */}
        {message && (
          <div
            className={clsx(
              "p-4 rounded-lg flex items-start gap-3",
              message.startsWith('✓')
                ? 'bg-emerald-50 border border-emerald-200'
                : 'bg-red-50 border border-red-200'
            )}
          >
            {message.startsWith('✓') ? (
              <div className="w-5 h-5 text-emerald-500 flex-shrink-0 mt-0.5">✓</div>
            ) : (
              <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
            )}
            <p className={message.startsWith('✓') ? 'text-emerald-700' : 'text-red-700'}>
              {message}
            </p>
          </div>
        )}

        {/* Action Buttons */}
        <div className="flex gap-3 justify-end">
          <button
            onClick={onClose}
            disabled={loading}
            className="px-6 py-2.5 font-bold text-gray-900 border border-gray-200 rounded-lg hover:bg-gray-50 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={handleExport}
            disabled={loading || selectedSheets.size === 0}
            className="px-6 py-2.5 font-bold text-white bg-primary rounded-lg hover:bg-primary/90 disabled:opacity-50 flex items-center gap-2"
          >
            {loading ? (
              <>
                <Loader className="w-4 h-4 animate-spin" />
                Exporting...
              </>
            ) : (
              <>
                <Download className="w-4 h-4" />
                Export to Excel
              </>
            )}
          </button>
        </div>
      </div>
    </Modal>
  );
}
