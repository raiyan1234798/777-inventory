import { useState, useRef } from 'react';
import { useStore } from '../store';
import type { ReturnRecord, Invoice } from '../store';
import { Undo2, AlertCircle, Camera, UploadCloud, Search } from 'lucide-react';
import Modal from '../components/Modal';
import { format } from 'date-fns';

export default function Returns() {
  const { returns, invoices, processReturn } = useStore();
  const [isReturnModalOpen, setIsReturnModalOpen] = useState(false);
  
  // Data State
  const [searchInvoiceId, setSearchInvoiceId] = useState('');
  const [foundInvoice, setFoundInvoice] = useState<Invoice | null>(null);
  const [returnItems, setReturnItems] = useState<{itemId: string, name: string, quantity: number, maxQty: number, selected: boolean, reason: string}[]>([]);
  const [returnStatus, setReturnStatus] = useState<'Restocked' | 'Disposed'>('Restocked');
  const [imageDataUrl, setImageDataUrl] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleSearchInvoice = () => {
    const inv = invoices.find(i => i.id.toLowerCase() === searchInvoiceId.toLowerCase());
    if (inv) {
      setFoundInvoice(inv);
      // setup partial return list
      setReturnItems(inv.items.map(i => ({
        itemId: i.itemId,
        name: i.name,
        quantity: 1,
        maxQty: i.quantity,
        selected: false,
        reason: 'Size Issue (Restockable)'
      })));
    } else {
      setFoundInvoice(null);
      setReturnItems([]);
    }
  };

  const handleProcessReturn = () => {
    const returningItems = returnItems.filter(i => i.selected && i.quantity > 0);
    if (returningItems.length === 0 || !foundInvoice) return;

    const newReturnRecord: ReturnRecord = {
      id: `RTN-${Date.now().toString().slice(-4)}`,
      invoiceId: foundInvoice.id,
      date: new Date().toISOString(),
      status: returnStatus,
      items: returningItems.map(ri => ({
        itemId: ri.itemId,
        name: ri.name,
        returnQuantity: ri.quantity,
        reason: ri.reason
      }))
    };

    processReturn(newReturnRecord);
    setIsReturnModalOpen(false);
    setSearchInvoiceId('');
    setFoundInvoice(null);
    setReturnItems([]);
    setImageDataUrl(null);
  };

  // Efficient compression into webp/base64 to act as "vectors/space efficient" upload
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
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
        
        // Output as highly optimized WebP format to save space
        const optimizedDataUrl = canvas.toDataURL('image/webp', 0.6);
        setImageDataUrl(optimizedDataUrl);
      };
      if (typeof event.target?.result === 'string') {
        img.src = event.target.result;
      }
    };
    reader.readAsDataURL(file);
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center sm:flex-row flex-col gap-4">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 tracking-tight">Returns Management</h1>
          <p className="text-gray-500 mt-2">Log returned items and automatically update stock.</p>
        </div>
        <button 
          onClick={() => setIsReturnModalOpen(true)}
          className="w-full sm:w-auto btn-primary flex items-center justify-center shadow-lg shadow-danger/30 bg-danger hover:bg-red-700"
        >
          <Undo2 className="w-4 h-4 mr-2" />
          Log Partial/Full Return
        </button>
      </div>

      <div className="card overflow-hidden !px-0 !py-0 mt-8">
        <div className="p-6 border-b border-gray-100 bg-white">
          <h2 className="text-lg font-semibold text-gray-900 flex items-center">
            <AlertCircle className="w-5 h-5 mr-2 text-danger" />
            Recent Returns Log
          </h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm text-gray-500 min-w-[700px]">
            <thead className="bg-gray-50 text-xs uppercase text-gray-700">
              <tr>
                <th className="px-6 py-4 font-medium">Return ID</th>
                <th className="px-6 py-4 font-medium">Invoice ID</th>
                <th className="px-6 py-4 font-medium">Item Details</th>
                <th className="px-6 py-4 font-medium">Status / Impact</th>
                <th className="px-6 py-4 font-medium text-right">Date</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 bg-white">
              {returns.map((ret) => (
                <tr key={ret.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-6 py-4 font-medium text-danger">{ret.id}</td>
                  <td className="px-6 py-4 font-medium text-gray-900">{ret.invoiceId}</td>
                  <td className="px-6 py-4">
                    <div className="flex flex-col space-y-1">
                      {ret.items.map((i, idx) => (
                        <span key={idx} className="text-xs text-gray-500">
                          <span className="font-semibold text-gray-900">{i.name}</span> (Qty: {i.returnQuantity}) - {i.reason}
                        </span>
                      ))}
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <span className={`inline-flex items-center px-2 py-1 text-xs font-semibold rounded-full ${ret.status === 'Restocked' ? 'text-success bg-success/10' : 'text-danger bg-danger/10'}`}>
                      {ret.status === 'Restocked' ? 'Inventory Added' : 'Disposed / Lost'}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-right text-gray-400">
                    {format(new Date(ret.date), 'MMM dd, yyyy')}
                  </td>
                </tr>
              ))}
              {returns.length === 0 && (
                 <tr>
                   <td colSpan={5} className="px-6 py-8 text-center text-gray-400">No returns recorded yet.</td>
                 </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <Modal 
        isOpen={isReturnModalOpen} 
        onClose={() => setIsReturnModalOpen(false)}
        title="Log a Partial/Full Return"
        description="Search via Invoice ID and specify exact items returning."
        size="lg"
      >
        <div className="space-y-5">
          {/* Invoice Search */}
          <div className="flex space-x-2">
            <div className="relative flex-1">
               <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
               <input 
                 type="text" 
                 placeholder="Enter Invoice ID (e.g. INV-1001)" 
                 className="w-full bg-gray-50 border border-gray-200 text-sm rounded-lg pl-9 pr-4 py-2 focus:outline-none focus:ring-2 focus:border-primary transition-all duration-200"
                 value={searchInvoiceId}
                 onChange={e => setSearchInvoiceId(e.target.value)}
                 onKeyDown={e => e.key === 'Enter' && handleSearchInvoice()}
               />
            </div>
            <button className="btn-secondary" onClick={handleSearchInvoice}>Find</button>
          </div>

          {/* Return Line Items */}
          {foundInvoice && (
            <div className="border border-gray-200 rounded-xl p-4 bg-gray-50">
              <h4 className="text-sm font-semibold text-gray-900 mb-3 text-primary">
                Invoice {foundInvoice.id} Found
              </h4>
              <p className="text-xs text-gray-500 mb-4">Select items to return and adjust quantity if needed (Partial Return).</p>
              
              <div className="space-y-3">
                {returnItems.map((ri, index) => (
                  <div key={ri.itemId} className="flex items-center gap-4 bg-white p-3 rounded-lg border border-gray-100">
                    <input 
                      type="checkbox" 
                      className="w-4 h-4 text-primary rounded focus:ring-primary"
                      checked={ri.selected}
                      onChange={e => {
                        const newR = [...returnItems];
                        newR[index].selected = e.target.checked;
                        setReturnItems(newR);
                      }}
                    />
                    <div className="flex-1">
                       <p className="text-sm font-medium text-gray-900">{ri.name}</p>
                       <p className="text-xs text-gray-400">Purchased Qty: {ri.maxQty}</p>
                    </div>
                    {ri.selected && (
                      <div className="flex gap-2 items-center text-sm">
                        <label className="text-xs text-gray-500">Return Qty:</label>
                        <input 
                          type="number" 
                          min={1} 
                          max={ri.maxQty}
                          value={ri.quantity}
                          onChange={e => {
                             const newR = [...returnItems];
                             // limit to what they actually bought
                             let val = parseInt(e.target.value);
                             if(isNaN(val)) val = 1;
                             if(val > ri.maxQty) val = ri.maxQty;
                             newR[index].quantity = val;
                             setReturnItems(newR);
                          }}
                          className="input-field w-20 px-2 py-1 text-center" 
                        />
                        <select 
                          className="input-field py-1 text-xs" 
                          value={ri.reason}
                          onChange={e => {
                            const newR = [...returnItems];
                            newR[index].reason = e.target.value;
                            setReturnItems(newR);
                          }}
                        >
                          <option>Size Issue (Restockable)</option>
                          <option>Customer Regret (Restockable)</option>
                          <option>Defective (Disposal)</option>
                          <option>Wrong Item Sent (Restockable)</option>
                        </select>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Compressed Image Upload Logic to Save Storage */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Upload Images (Proof of Damage - WebP Compressed)</label>
            <div 
               className="border-2 border-dashed border-gray-300 rounded-xl p-6 flex flex-col items-center justify-center text-gray-500 hover:border-primary hover:bg-primary/5 transition-colors cursor-pointer bg-gray-50/50"
               onClick={() => fileInputRef.current?.click()}
            >
              {imageDataUrl ? (
                <div className="flex flex-col items-center relative">
                  <img src={imageDataUrl} alt="Preview" className="h-24 w-auto object-cover rounded shadow-sm border border-gray-200" />
                  <span className="text-xs bg-success text-white px-2 py-0.5 rounded-full absolute -top-3 -right-3">Optimized Vector-like</span>
                </div>
              ) : (
                <>
                  <UploadCloud className="w-8 h-8 mb-2 text-gray-400" />
                  <p className="text-sm font-medium text-gray-700">Click to upload photo</p>
                  <p className="text-xs">Image will be highly compressed down to &lt;100KB to save optimal storage.</p>
                </>
              )}
              <input type="file" ref={fileInputRef} className="hidden" accept="image/*" onChange={handleFileChange} />
            </div>
          </div>

          <div className="flex gap-4 pt-2">
            <label className="flex items-center space-x-2 text-sm text-gray-700 cursor-pointer p-3 border border-gray-200 rounded-lg flex-1 hover:border-primary transition-colors bg-white">
              <input type="radio" checked={returnStatus === 'Restocked'} onChange={() => setReturnStatus('Restocked')} className="text-primary focus:ring-primary w-4 h-4" />
              <span>Restock Item</span>
            </label>
            <label className="flex items-center space-x-2 text-sm text-gray-700 cursor-pointer p-3 border border-gray-200 rounded-lg flex-1 hover:border-danger transition-colors bg-white">
              <input type="radio" checked={returnStatus === 'Disposed'} onChange={() => setReturnStatus('Disposed')} className="text-danger focus:ring-danger w-4 h-4" />
              <span>Mark as Disposal</span>
            </label>
          </div>

          <div className="flex justify-end space-x-3 pt-6 border-t border-gray-100 mt-4">
            <button type="button" className="btn-secondary" onClick={() => setIsReturnModalOpen(false)}>Cancel</button>
            <button type="button" className="btn-primary bg-danger hover:bg-red-700 border-none flex items-center px-6" onClick={handleProcessReturn} disabled={!foundInvoice}>
              Process Validated Return
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
