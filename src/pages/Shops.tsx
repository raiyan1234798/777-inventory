import { useState } from 'react';
import { Store, Plus, TrendingUp, Search, Receipt } from 'lucide-react';
import Modal from '../components/Modal';

export default function Shops() {
  const [isSaleModalOpen, setIsSaleModalOpen] = useState(false);
  const [selectedShop, setSelectedShop] = useState<string | null>(null);

  const openSaleModal = (shopName: string) => {
    setSelectedShop(shopName);
    setIsSaleModalOpen(true);
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center sm:flex-row flex-col gap-4">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 tracking-tight">Shops Overview</h1>
          <p className="text-gray-500 mt-2">Manage shop inventory, sales, and profit tracking.</p>
        </div>
        <button 
          onClick={() => openSaleModal('Global')}
          className="w-full sm:w-auto btn-primary flex items-center justify-center shadow-lg shadow-primary/30"
        >
          <Plus className="w-4 h-4 mr-2" />
          Add Sale Entry
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {[
          { name: 'Mumbai Downtown', location: 'India', stock: 12450, value: '₹14,500,000', profit: '+12.5%' },
          { name: 'Delhi Central', location: 'India', stock: 8200, value: '₹9,200,000', profit: '+8.2%' },
          { name: 'Dubai Mall', location: 'UAE', stock: 5400, value: '₹18,500,000', profit: '+24.1%' },
        ].map((shop, i) => (
          <div key={i} className="card hover:-translate-y-1 transition-transform duration-300">
            <div className="flex justify-between items-start mb-6">
              <div className="w-12 h-12 bg-primary/10 rounded-xl flex items-center justify-center text-primary shadow-inner">
                <Store className="w-6 h-6" />
              </div>
              <span className="flex items-center text-sm font-semibold text-success bg-success/10 px-2.5 py-1 rounded-full border border-success/20">
                <TrendingUp className="w-3 h-3 mr-1" />
                {shop.profit}
              </span>
            </div>
            <h3 className="text-xl font-bold text-gray-900 tracking-tight">{shop.name}</h3>
            <p className="text-sm text-gray-500 mt-1 flex items-center">{shop.location}</p>
            
            <div className="mt-6 pt-6 border-t border-gray-100 flex justify-between items-end">
              <div>
                <p className="text-xs text-gray-500 font-medium uppercase tracking-wider mb-1">Stock Value</p>
                <p className="text-lg font-bold text-gray-900">{shop.value}</p>
              </div>
              <div className="text-right">
                <p className="text-xs text-gray-500 font-medium uppercase tracking-wider mb-1">Total Items</p>
                <p className="text-lg font-bold text-gray-900">{shop.stock}</p>
              </div>
            </div>
            
            <div className="mt-6 flex space-x-3">
              <button className="flex-1 btn-secondary py-2 text-sm">Inventory</button>
              <button 
                className="flex-1 btn-primary py-2 text-sm bg-gray-900 hover:bg-black text-white"
                onClick={() => openSaleModal(shop.name)}
              >
                Enter Sale
              </button>
            </div>
          </div>
        ))}
      </div>

      <Modal 
        isOpen={isSaleModalOpen} 
        onClose={() => setIsSaleModalOpen(false)}
        title="Record New Sale (POS)"
        description={`Logging a direct customer sale from ${selectedShop === 'Global' ? 'the selected shop' : selectedShop}.`}
        size="lg"
      >
        <form className="space-y-6">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
            <input 
              type="text" 
              placeholder="Scan Barcode or Search SKU to add to cart..." 
              className="w-full bg-white border-2 border-primary/20 text-gray-900 text-sm rounded-xl pl-10 pr-4 py-3 focus:outline-none focus:border-primary shadow-sm"
              autoFocus
            />
          </div>

          <div className="bg-gray-50 border border-gray-200 rounded-xl p-4">
            <h4 className="text-sm font-semibold text-gray-900 mb-4 flex items-center">
              <Receipt className="w-4 h-4 mr-2 text-primary" />
              Current Cart
            </h4>
            <div className="space-y-4">
              <div className="flex items-center justify-between border-b border-gray-200 pb-3">
                <div className="flex flex-col">
                  <span className="text-sm font-semibold text-gray-900">Premium Leather Jacket</span>
                  <span className="text-xs text-gray-500">ZRA-1021</span>
                </div>
                <div className="flex items-center space-x-4">
                  <span className="text-sm font-medium text-gray-700">1 x ₹4,200</span>
                  <span className="text-sm font-bold text-gray-900">₹4,200</span>
                </div>
              </div>
              
              <div className="flex justify-between items-center pt-2">
                <span className="text-gray-500 text-sm font-medium">Subtotal</span>
                <span className="text-gray-900 font-bold">₹4,200</span>
              </div>
              <div className="flex justify-between items-center text-success border-t border-gray-200 pt-3">
                <span className="text-sm font-bold">Net Profit (Auto-Calculated)</span>
                <span className="text-sm font-bold">+₹1,800</span>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Payment Method</label>
              <select className="input-field bg-white">
                <option>Credit Card</option>
                <option>Cash (Local Currency)</option>
                <option>Bank Transfer</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Currency Collected</label>
              <select className="input-field bg-white">
                <option>INR</option>
                <option>AED</option>
              </select>
            </div>
          </div>

          <div className="flex justify-end space-x-3 pt-4 border-t border-gray-100">
            <button type="button" className="btn-secondary" onClick={() => setIsSaleModalOpen(false)}>Cancel</button>
            <button type="button" className="btn-primary flex justify-center items-center text-lg w-full" onClick={() => setIsSaleModalOpen(false)}>
              Complete Sale • ₹4,200
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
