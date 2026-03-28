import { useState } from 'react';
import { Upload, AlertCircle, CheckCircle, Loader } from 'lucide-react';
import Modal from '../components/Modal';
import { parseExcelFile, processBatch, validateStockImportRow } from '../lib/bulkOperations';
import clsx from 'clsx';

interface BulkImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  onImport: (items: any[]) => Promise<void>;
}

export default function BulkImportModal({ isOpen, onClose, onImport }: BulkImportModalProps) {
  const [file, setFile] = useState<File | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState<'idle' | 'parsing' | 'validating' | 'importing' | 'complete' | 'error'>('idle');
  const [message, setMessage] = useState('');
  const [stats, setStats] = useState({ total: 0, valid: 0, errors: 0 });
  const [parsedRows, setParsedRows] = useState<any[]>([]);
  const [previewMode, setPreviewMode] = useState(false);

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(e.type === 'dragenter' || e.type === 'dragover');
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const droppedFile = e.dataTransfer.files[0];
    if (droppedFile?.name.endsWith('.xlsx') || droppedFile?.name.endsWith('.xls')) {
      setFile(droppedFile);
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0];
    if (selected) setFile(selected);
  };

  const handleParseAndValidate = async () => {
    if (!file) return;

    try {
      setLoading(true);
      setStatus('parsing');
      setMessage('Parsing Excel file...');
      setProgress(0);

      // Parse Excel
      const { rows, total } = await parseExcelFile(file);
      setProgress(25);
      setMessage(`Parsed ${total} rows. Validating...`);

      // Validate rows
      setStatus('validating');
      const validated: any[] = [];
      let errorCount = 0;

      for (let i = 0; i < rows.length; i++) {
        const validation = validateStockImportRow(rows[i]);
        
        if (validation.valid && validation.data) {
          validated.push(validation.data);
        } else {
          errorCount++;
        }

        // Update progress every 10 items
        if (i % 10 === 0) {
          setProgress(25 + (i / rows.length) * 25);
        }
      }

      setProgress(50);
      setParsedRows(validated);
      setStats({ total, valid: validated.length, errors: errorCount });
      setMessage(`✓ Validated ${validated.length}/${total} items. Ready to import!`);
      setPreviewMode(true);
      setStatus('idle');
    } catch (err: any) {
      setStatus('error');
      setMessage(err.message);
      setProgress(0);
    } finally {
      setLoading(false);
    }
  };

  const handleImport = async () => {
    if (parsedRows.length === 0) return;

    try {
      setLoading(true);
      setStatus('importing');
      setMessage('Importing items...');
      setProgress(0);

      // Process in batches of 50
      await processBatch(
        parsedRows,
        async (item) => {
          // This will be called for each item
          await onImport([item]);
        },
        50,
        (current, total) => {
          setProgress((current / total) * 100);
          setMessage(`Imported ${current}/${total} items...`);
        }
      );

      setStatus('complete');
      setMessage(`✓ Successfully imported ${parsedRows.length} items!`);
      setProgress(100);

      setTimeout(() => {
        resetModal();
        onClose();
      }, 2000);
    } catch (err: any) {
      setStatus('error');
      setMessage(err.message);
    } finally {
      setLoading(false);
    }
  };

  const resetModal = () => {
    setFile(null);
    setProgress(0);
    setStatus('idle');
    setMessage('');
    setStats({ total: 0, valid: 0, errors: 0 });
    setParsedRows([]);
    setPreviewMode(false);
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Smart Stock Import" size="lg">
      <div className="space-y-6">
        {!previewMode ? (
          <>
            {/* File Upload */}
            <div
              onDragEnter={handleDrag}
              onDragOver={handleDrag}
              onDragLeave={handleDrag}
              onDrop={handleDrop}
              className={clsx(
                "border-2 border-dashed rounded-xl p-8 text-center transition-all cursor-pointer",
                isDragging
                  ? 'border-primary bg-primary/5'
                  : 'border-gray-200 bg-gray-50 hover:border-primary/50'
              )}
            >
              <Upload className="w-10 h-10 mx-auto mb-3 text-gray-400" />
              <p className="text-sm font-bold text-gray-900 mb-1">
                Drag & drop your Excel file here
              </p>
              <p className="text-xs text-gray-400 mb-4">or click to browse</p>
              
              <input
                type="file"
                accept=".xlsx,.xls"
                onChange={handleFileSelect}
                className="hidden"
                id="file-input"
              />
              <label
                htmlFor="file-input"
                className="inline-block px-4 py-2 bg-primary text-white rounded-lg font-bold text-sm cursor-pointer hover:bg-primary/90 transition"
              >
                Browse Files
              </label>

              {file && (
                <div className="mt-4 flex items-center justify-center gap-2 text-sm font-bold text-emerald-600">
                  <CheckCircle className="w-4 h-4" />
                  {file.name}
                </div>
              )}
            </div>

            {/* Status Messages */}
            {message && (
              <div
                className={clsx(
                  "p-4 rounded-lg flex items-start gap-3",
                  status === 'error'
                    ? 'bg-red-50 border border-red-200'
                    : 'bg-blue-50 border border-blue-200'
                )}
              >
                {status === 'error' ? (
                  <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
                ) : (
                  <Loader className="w-5 h-5 text-blue-500 flex-shrink-0 mt-0.5 animate-spin" />
                )}
                <p className={status === 'error' ? 'text-red-700' : 'text-blue-700'}>
                  {message}
                </p>
              </div>
            )}

            {/* Progress Bar */}
            {progress > 0 && (
              <div>
                <div className="flex justify-between items-center mb-2">
                  <p className="text-xs font-bold uppercase text-gray-600">Progress</p>
                  <p className="text-xs font-bold text-gray-600">{Math.round(progress)}%</p>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-2 overflow-hidden">
                  <div
                    className="bg-primary h-full transition-all rounded-full"
                    style={{ width: `${progress}%` }}
                  />
                </div>
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
                onClick={handleParseAndValidate}
                disabled={!file || loading}
                className="px-6 py-2.5 font-bold text-white bg-primary rounded-lg hover:bg-primary/90 disabled:opacity-50 flex items-center gap-2"
              >
                <Upload className="w-4 h-4" />
                Parse & Validate
              </button>
            </div>
          </>
        ) : (
          <>
            {/* Preview Mode */}
            <div className="space-y-4">
              {/* Stats */}
              <div className="grid grid-cols-3 gap-3">
                <div className="bg-blue-50 p-4 rounded-lg border border-blue-100">
                  <p className="text-xs font-bold text-blue-600 uppercase mb-1">Total Items</p>
                  <p className="text-2xl font-black text-blue-900">{stats.total}</p>
                </div>
                <div className="bg-emerald-50 p-4 rounded-lg border border-emerald-100">
                  <p className="text-xs font-bold text-emerald-600 uppercase mb-1">Valid</p>
                  <p className="text-2xl font-black text-emerald-900">{stats.valid}</p>
                </div>
                <div className="bg-red-50 p-4 rounded-lg border border-red-100">
                  <p className="text-xs font-bold text-red-600 uppercase mb-1">Errors</p>
                  <p className="text-2xl font-black text-red-900">{stats.errors}</p>
                </div>
              </div>

              {/* Preview Table */}
              <div>
                <p className="text-xs font-bold uppercase text-gray-600 mb-3">
                  Preview ({Math.min(5, parsedRows.length)} of {parsedRows.length})
                </p>
                <div className="overflow-auto max-h-64 rounded-lg border border-gray-200">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50 sticky top-0">
                      <tr>
                        <th className="px-4 py-2 text-left font-bold text-gray-600">Item Name</th>
                        <th className="px-4 py-2 text-left font-bold text-gray-600">QTY</th>
                        <th className="px-4 py-2 text-left font-bold text-gray-600">Cost</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200">
                      {parsedRows.slice(0, 5).map((row, idx) => (
                        <tr key={idx} className="hover:bg-gray-50">
                          <td className="px-4 py-2 font-medium text-gray-900">{row.item_name}</td>
                          <td className="px-4 py-2 text-gray-600">{row.quantity}</td>
                          <td className="px-4 py-2 text-gray-600">{row.unit_cost}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Progress Bar */}
              {progress > 0 && (
                <div>
                  <div className="flex justify-between items-center mb-2">
                    <p className="text-xs font-bold uppercase text-gray-600">Importing</p>
                    <p className="text-xs font-bold text-gray-600">{Math.round(progress)}%</p>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-2 overflow-hidden">
                    <div
                      className="bg-primary h-full transition-all rounded-full"
                      style={{ width: `${progress}%` }}
                    />
                  </div>
                  <p className="text-xs text-gray-500 mt-2">{message}</p>
                </div>
              )}

              {/* Status Message */}
              {status === 'complete' && (
                <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-lg flex items-start gap-3">
                  <CheckCircle className="w-5 h-5 text-emerald-500 flex-shrink-0 mt-0.5" />
                  <p className="text-sm font-bold text-emerald-700">{message}</p>
                </div>
              )}

              {status === 'error' && (
                <div className="p-4 bg-red-50 border border-red-200 rounded-lg flex items-start gap-3">
                  <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
                  <p className="text-sm font-bold text-red-700">{message}</p>
                </div>
              )}

              {/* Action Buttons */}
              <div className="flex gap-3 justify-end">
                <button
                  onClick={() => setPreviewMode(false)}
                  disabled={loading}
                  className="px-6 py-2.5 font-bold text-gray-900 border border-gray-200 rounded-lg hover:bg-gray-50 disabled:opacity-50"
                >
                  Back
                </button>
                <button
                  onClick={handleImport}
                  disabled={loading || status === 'complete'}
                  className="px-6 py-2.5 font-bold text-white bg-emerald-600 rounded-lg hover:bg-emerald-700 disabled:opacity-50 flex items-center gap-2"
                >
                  {loading ? (
                    <>
                      <Loader className="w-4 h-4 animate-spin" />
                      Importing...
                    </>
                  ) : (
                    <>
                      <CheckCircle className="w-4 h-4" />
                      Import {stats.valid} Items
                    </>
                  )}
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}
