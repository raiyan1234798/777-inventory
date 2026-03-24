import { ArrowRightLeft, Send, CheckCircle2 } from 'lucide-react';

export default function Transfers() {
  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center sm:flex-row flex-col gap-4">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 tracking-tight">Stock Transfers</h1>
          <p className="text-gray-500 mt-2">Manage movements between warehouses and shops.</p>
        </div>
        <button className="btn-primary flex items-center shadow-lg shadow-primary/30">
          <Send className="w-4 h-4 mr-2" />
          New Transfer
        </button>
      </div>

      <div className="card overflow-hidden !px-0 !py-0">
        <div className="p-6 border-b border-gray-100 bg-white">
          <h2 className="text-lg font-semibold text-gray-900">Transfer History</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm text-gray-500">
            <thead className="bg-gray-50 text-xs uppercase text-gray-700">
              <tr>
                <th className="px-6 py-4 font-medium">Txn ID</th>
                <th className="px-6 py-4 font-medium">Route</th>
                <th className="px-6 py-4 font-medium">Items</th>
                <th className="px-6 py-4 font-medium">Value (INR)</th>
                <th className="px-6 py-4 font-medium">Status</th>
                <th className="px-6 py-4 font-medium">Date</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 bg-white">
              {[1, 2, 3, 4, 5].map((row) => (
                <tr key={row} className="hover:bg-gray-50 transition-colors">
                  <td className="px-6 py-4 font-medium text-primary">TRF-90{row}2</td>
                  <td className="px-6 py-4">
                    <div className="flex items-center text-gray-700 font-medium">
                      <span>Main WH</span>
                      <ArrowRightLeft className="w-4 h-4 mx-2 text-gray-400" />
                      <span>Mumbai Shop</span>
                    </div>
                  </td>
                  <td className="px-6 py-4">250 units</td>
                  <td className="px-6 py-4 font-medium text-gray-900">₹450,000</td>
                  <td className="px-6 py-4">
                    <span className="flex items-center px-3 py-1 rounded-full text-xs font-medium bg-success/10 text-success w-fit">
                      <CheckCircle2 className="w-3 h-3 mr-1" />
                      Completed
                    </span>
                  </td>
                  <td className="px-6 py-4 text-gray-400">Oct 2{row}, 2026</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
