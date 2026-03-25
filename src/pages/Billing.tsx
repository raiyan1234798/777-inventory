import { useState } from 'react';
import { useStore } from '../store';
import type { Invoice, InvoiceItem } from '../store';
import { Receipt, Search, FileText, Download } from 'lucide-react';
import Modal from '../components/Modal';
import { format } from 'date-fns';

export default function Billing() {
  const { invoices, addInvoice, inventory } = useStore();
  const [isInvoiceModalOpen, setIsInvoiceModalOpen] = useState(false);
  const [customerName, setCustomerName] = useState('');
  const [selectedShop, setSelectedShop] = useState('Mumbai Downtown');
  const [cart, setCart] = useState<InvoiceItem[]>([]);
  const [skuSearch, setSkuSearch] = useState('');

  const handleAddToCart = (itemSku: string) => {
    const invItem = inventory.find(i => i.sku.toLowerCase() === itemSku.toLowerCase() || i.id === itemSku);
    if (!invItem) return;

    const existingCartItem = cart.find(c => c.itemId === invItem.id);
    if (existingCartItem) {
      setCart(cart.map(c => 
        c.itemId === invItem.id 
          ? { ...c, quantity: c.quantity + 1, total: (c.quantity + 1) * c.unitPrice } 
          : c
      ));
    } else {
      setCart([...cart, { 
        itemId: invItem.id, 
        name: invItem.name, 
        quantity: 1, 
        unitPrice: invItem.sellingPrice, 
        total: invItem.sellingPrice 
      }]);
    }
    setSkuSearch('');
  };

  const handleCreateInvoice = () => {
    if (cart.length === 0) return;
    
    const subtotal = cart.reduce((sum, item) => sum + item.total, 0);
    const newInvoice: Invoice = {
      id: `INV-${Date.now().toString().slice(-4)}`,
      date: new Date().toISOString(),
      customerName: customerName || 'Walk-in Customer',
      shopLocation: selectedShop,
      items: cart,
      subtotal,
      currency: 'INR',
      convertedTotalINR: subtotal,
      status: 'Paid'
    };
    
    addInvoice(newInvoice);
    setIsInvoiceModalOpen(false);
    setCart([]);
    setCustomerName('');
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center sm:flex-row flex-col gap-4">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 tracking-tight">Billing & Invoices</h1>
          <p className="text-gray-500 mt-2">Generate bills, manage invoices, and track sales records centrally.</p>
        </div>
        <button 
          onClick={() => setIsInvoiceModalOpen(true)}
          className="w-full sm:w-auto btn-primary flex items-center justify-center shadow-lg shadow-primary/30"
        >
          <Receipt className="w-4 h-4 mr-2" />
          Create Invoice
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="card text-center py-8">
          <p className="text-gray-500 text-sm font-medium uppercase tracking-wider">Total Revenue</p>
          <p className="text-4xl font-bold mt-4 text-gray-900">
            ₹{invoices.reduce((acc, inv) => acc + inv.subtotal, 0).toLocaleString()}
          </p>
        </div>
        <div className="card text-center py-8">
          <p className="text-gray-500 text-sm font-medium uppercase tracking-wider">Invoices Generated</p>
          <p className="text-4xl font-bold mt-4 text-gray-900">{invoices.length}</p>
        </div>
      </div>

      <div className="card overflow-hidden !px-0 !py-0">
        <div className="p-6 border-b border-gray-100 bg-white">
          <h2 className="text-lg font-semibold text-gray-900 flex items-center">
            <FileText className="w-5 h-5 mr-2 text-primary" />
            Invoice Ledger
          </h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm text-gray-500 min-w-[700px]">
            <thead className="bg-gray-50 text-xs uppercase text-gray-700">
              <tr>
                <th className="px-6 py-4 font-medium">Invoice ID</th>
                <th className="px-6 py-4 font-medium">Date</th>
                <th className="px-6 py-4 font-medium">Customer</th>
                <th className="px-6 py-4 font-medium">Location</th>
                <th className="px-6 py-4 font-medium">Amount (INR)</th>
                <th className="px-6 py-4 font-medium">Status</th>
                <th className="px-6 py-4 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 bg-white">
              {invoices.map((inv) => (
                <tr key={inv.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-6 py-4 font-medium text-gray-900">{inv.id}</td>
                  <td className="px-6 py-4">{format(new Date(inv.date), 'MMM dd, yyyy')}</td>
                  <td className="px-6 py-4">{inv.customerName}</td>
                  <td className="px-6 py-4">{inv.shopLocation}</td>
                  <td className="px-6 py-4 font-medium text-gray-900">₹{inv.subtotal.toLocaleString()}</td>
                  <td className="px-6 py-4">
                    <span className="inline-flex items-center px-2 py-1 text-xs font-semibold text-success bg-success/10 rounded-full">
                      {inv.status}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-right">
                    <button className="text-gray-400 hover:text-primary transition-colors p-1 rounded hover:bg-primary/10">
                      <Download className="w-5 h-5" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <Modal 
        isOpen={isInvoiceModalOpen} 
        onClose={() => setIsInvoiceModalOpen(false)}
        title="Generate New Invoice"
        description="Add items to the bill. Inventory will be updated automatically."
        size="lg"
      >
        <form className="space-y-6">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Customer Name</label>
              <input 
                type="text" 
                className="input-field" 
                placeholder="Walk-in Customer"
                value={customerName}
                onChange={e => setCustomerName(e.target.value)}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Billing Location</label>
              <select className="input-field bg-white" value={selectedShop} onChange={e => setSelectedShop(e.target.value)}>
                <option>Mumbai Downtown</option>
                <option>Delhi Central</option>
                <option>Dubai Mall</option>
              </select>
            </div>
          </div>

          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
            <input 
              type="text" 
              placeholder="Scan Barcode or Type SKU (e.g. ZRA-1021)" 
              className="w-full bg-white border-2 border-primary/20 text-gray-900 text-sm rounded-xl pl-10 pr-4 py-3 focus:outline-none focus:border-primary shadow-sm"
              value={skuSearch}
              onChange={e => setSkuSearch(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  handleAddToCart(skuSearch);
                }
              }}
            />
          </div>

          <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 min-h-[150px]">
            <h4 className="text-sm font-semibold text-gray-900 mb-4 flex items-center">
              <Receipt className="w-4 h-4 mr-2 text-primary" />
              Invoice Cart {cart.length === 0 ? '(Empty)' : ''}
            </h4>
            <div className="space-y-4">
              {cart.map((item, idx) => (
                <div key={idx} className="flex items-center justify-between border-b border-gray-200 pb-3">
                  <div className="flex flex-col">
                    <span className="text-sm font-semibold text-gray-900">{item.name}</span>
                  </div>
                  <div className="flex items-center space-x-4">
                    <span className="text-sm font-medium text-gray-700">{item.quantity} x ₹{item.unitPrice}</span>
                    <span className="text-sm font-bold text-gray-900">₹{item.total}</span>
                  </div>
                </div>
              ))}
              
              {cart.length > 0 && (
                <>
                  <div className="flex justify-between items-center pt-2">
                    <span className="text-gray-500 text-sm font-medium">Subtotal</span>
                    <span className="text-gray-900 font-bold">
                      ₹{cart.reduce((a, b) => a + b.total, 0).toLocaleString()}
                    </span>
                  </div>
                </>
              )}
            </div>
          </div>

          <div className="flex justify-end space-x-3 pt-4 border-t border-gray-100">
            <button type="button" className="btn-secondary" onClick={() => setIsInvoiceModalOpen(false)}>Cancel</button>
            <button type="button" className="btn-primary flex justify-center items-center px-8" onClick={handleCreateInvoice}>
              Generate Bill & Deduct Stock
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
