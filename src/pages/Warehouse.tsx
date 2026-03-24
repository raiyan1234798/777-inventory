import { useState } from 'react';
import { PackagePlus, Boxes, Filter, Search, MoreVertical, Plus } from 'lucide-react';
import Modal from '../components/Modal';

export default function Warehouse() {
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center sm:flex-row flex-col gap-4">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 tracking-tight">Warehouse</h1>
          <p className="text-gray-500 mt-2">Manage incoming containers and bulk stock entry.</p>
        </div>
        <div className="flex space-x-3 w-full sm:w-auto">
          <button className="flex-1 sm:flex-none btn-secondary flex items-center justify-center">
            <Filter className="w-4 h-4 mr-2" />
            Filter
          </button>
          <button 
            onClick={() => setIsAddModalOpen(true)}
            className="flex-1 sm:flex-none btn-primary flex items-center justify-center shadow-lg shadow-primary/30"
          >
            <PackagePlus className="w-4 h-4 mr-2" />
            Add Container
          </button>
        </div>
      </div>

      {/* Stock Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-6">
        <div className="card bg-gradient-to-br from-primary to-blue-600 text-white transform hover:-translate-y-1 transition-transform">
          <p className="text-blue-100 text-sm font-medium">Total Items in Warehouse</p>
          <p className="text-4xl font-bold mt-2">124,500</p>
          <div className="mt-4 flex items-center text-sm text-blue-200">
            <Boxes className="w-4 h-4 mr-2" />
            Spread across 45 categories
          </div>
        </div>
        <div className="card transform hover:-translate-y-1 transition-transform">
          <p className="text-gray-500 text-sm font-medium">Containers Arriving</p>
          <p className="text-4xl font-bold mt-2 text-gray-900">2</p>
          <div className="mt-4 flex items-center text-sm text-gray-500">
            Next: CN-773 (Tomorrow)
          </div>
        </div>
        <div className="card transform hover:-translate-y-1 transition-transform">
          <p className="text-gray-500 text-sm font-medium">Needs Restock</p>
          <p className="text-4xl font-bold mt-2 text-danger">8</p>
          <div className="mt-4 flex items-center text-sm text-gray-500">
            Items below minimum threshold
          </div>
        </div>
      </div>

      {/* Inventory Table */}
      <div className="card overflow-hidden !px-0 !py-0">
        <div className="p-4 sm:p-6 border-b border-gray-100 flex flex-col sm:flex-row justify-between items-start sm:items-center bg-white gap-4">
          <h2 className="text-lg font-semibold text-gray-900">Current Stock View</h2>
          <div className="relative w-full sm:w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input 
              type="text" 
              placeholder="Search items, categories..." 
              className="w-full bg-gray-50 border border-gray-200 text-sm rounded-lg pl-9 pr-4 py-2 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all duration-200"
            />
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm text-gray-500 min-w-[800px]">
            <thead className="bg-gray-50 text-xs uppercase text-gray-700">
              <tr>
                <th scope="col" className="px-6 py-4 font-medium">Item & Brand</th>
                <th scope="col" className="px-6 py-4 font-medium">Category</th>
                <th scope="col" className="px-6 py-4 font-medium">Quantity</th>
                <th scope="col" className="px-6 py-4 font-medium">Avg Cost (INR)</th>
                <th scope="col" className="px-6 py-4 font-medium">Status</th>
                <th scope="col" className="px-6 py-4 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 bg-white">
              {[1, 2, 3, 4, 5].map((row) => (
                <tr key={row} className="hover:bg-gray-50 transition-colors">
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex flex-col">
                      <span className="font-semibold text-gray-900">Premium Leather Jacket {row}</span>
                      <span className="text-xs text-gray-500 mt-1">Brand: Zara • SKU: ZRA-{1020 + row}</span>
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800">
                      Apparel
                    </span>
                  </td>
                  <td className="px-6 py-4 font-medium text-gray-900">{200 * row}</td>
                  <td className="px-6 py-4">₹{(1200 + row * 100).toLocaleString()}</td>
                  <td className="px-6 py-4">
                    <span className="px-3 py-1 rounded-full text-xs font-medium bg-success/10 text-success">
                      In Stock
                    </span>
                  </td>
                  <td className="px-6 py-4 text-right">
                    <button className="text-gray-400 hover:text-primary transition-colors p-1 rounded hover:bg-primary/10">
                      <MoreVertical className="w-5 h-5" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="p-4 border-t border-gray-100 flex flex-col sm:flex-row items-center justify-between text-sm text-gray-500 bg-white gap-4">
          <span>Showing 1 to 5 of 45 results</span>
          <div className="flex space-x-2">
            <button className="px-3 py-1 border border-gray-200 rounded hover:bg-gray-50">Prev</button>
            <button className="px-3 py-1 border border-primary bg-primary text-white rounded shadow-sm">1</button>
            <button className="px-3 py-1 border border-gray-200 rounded hover:bg-gray-50 transition-colors">2</button>
            <button className="px-3 py-1 border border-gray-200 rounded hover:bg-gray-50 transition-colors">Next</button>
          </div>
        </div>
      </div>

      <Modal 
        isOpen={isAddModalOpen} 
        onClose={() => setIsAddModalOpen(false)}
        title="Add Delivery Container"
        description="Register a new shipping container and log its item manifest."
        size="lg"
      >
        <form className="space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Container ID</label>
              <input type="text" className="input-field" placeholder="e.g. CN-9942" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Source Country</label>
              <select className="input-field bg-white">
                <option>China (CNY)</option>
                <option>USA (USD)</option>
                <option>Europe (EUR)</option>
              </select>
            </div>
          </div>
          
          <div className="border border-gray-200 rounded-xl p-4 bg-gray-50">
            <h4 className="text-sm font-semibold text-gray-900 mb-3 flex items-center">
              <Boxes className="w-4 h-4 mr-2 text-primary" />
              Item Manifest
            </h4>
            <div className="space-y-3">
              <div className="grid grid-cols-12 gap-3 pb-2 border-b border-gray-200 text-xs font-medium text-gray-500 uppercase">
                <div className="col-span-6">Item/SKU</div>
                <div className="col-span-3">Quantity</div>
                <div className="col-span-3">Unit Cost</div>
              </div>
              <div className="grid grid-cols-12 gap-3 items-center">
                <div className="col-span-6"><input type="text" className="input-field text-sm" placeholder="Search SKU..." /></div>
                <div className="col-span-3"><input type="number" className="input-field text-sm" placeholder="Qty" /></div>
                <div className="col-span-3"><input type="number" className="input-field text-sm" placeholder="Cost" /></div>
              </div>
            </div>
            <button type="button" className="mt-4 text-sm font-medium text-primary hover:text-blue-700 flex items-center transition-colors">
              <Plus className="w-4 h-4 mr-1" /> Add Another Row
            </button>
          </div>

          <div className="flex justify-end space-x-3 pt-4 border-t border-gray-100">
            <button type="button" className="btn-secondary" onClick={() => setIsAddModalOpen(false)}>Cancel</button>
            <button type="button" className="btn-primary" onClick={() => setIsAddModalOpen(false)}>Save Container</button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
