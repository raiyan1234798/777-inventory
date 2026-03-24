import { DollarSign, Download, IndianRupee, PieChart, Activity } from 'lucide-react';

export default function Finance() {
  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center sm:flex-row flex-col gap-4">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 tracking-tight">Financial Overview</h1>
          <p className="text-gray-500 mt-2">Multi-currency financial tracking and reporting.</p>
        </div>
        <button className="btn-secondary flex items-center bg-white border border-gray-200">
          <Download className="w-4 h-4 mr-2" />
          Export Report
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <div className="card bg-gray-900 text-white">
          <div className="flex justify-between">
            <p className="text-sm font-medium text-gray-400">Total Profit (INR)</p>
            <IndianRupee className="w-5 h-5 text-success" />
          </div>
          <p className="text-3xl font-bold mt-4">₹4,250,800</p>
          <div className="mt-4 text-sm text-success">
            +18% from last quarter
          </div>
        </div>

        <div className="card">
          <div className="flex justify-between">
            <p className="text-sm font-medium text-gray-500">Expenses</p>
            <DollarSign className="w-5 h-5 text-danger" />
          </div>
          <p className="text-3xl font-bold mt-4 text-gray-900">₹850,200</p>
          <div className="mt-4 text-sm text-gray-400">
            Logistics & Warehousing
          </div>
        </div>

        <div className="card col-span-1 md:col-span-2 flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-gray-500">Currency Conversion Engine</p>
            <p className="text-xl font-bold mt-1 text-gray-900">Real-time Rates Active</p>
            <div className="mt-2 flex space-x-3 text-xs">
              <span className="bg-primary/10 text-primary px-2 py-1 rounded">1 USD = ₹83.42</span>
              <span className="bg-primary/10 text-primary px-2 py-1 rounded">1 EUR = ₹89.10</span>
              <span className="bg-primary/10 text-primary px-2 py-1 rounded">1 CNY = ₹11.55</span>
            </div>
          </div>
          <div className="w-16 h-16 bg-success/10 rounded-full flex items-center justify-center text-success">
            <Activity className="w-8 h-8" />
          </div>
        </div>
      </div>

      <div className="card">
        <h2 className="text-lg font-semibold text-gray-900 mb-6 flex items-center">
          <PieChart className="w-5 h-5 mr-2 text-primary" />
          Revenue by Region
        </h2>
        <div className="space-y-4">
          {[
            { region: 'India', amount: '₹12,450,000', percent: 65, color: 'bg-primary' },
            { region: 'Middle East', amount: '₹4,500,000', percent: 25, color: 'bg-indigo-500' },
            { region: 'Europe', amount: '₹1,200,000', percent: 10, color: 'bg-gray-400' }
          ].map((item, i) => (
            <div key={i}>
              <div className="flex justify-between text-sm mb-2">
                <span className="font-medium text-gray-700">{item.region}</span>
                <span className="font-bold text-gray-900">{item.amount}</span>
              </div>
              <div className="w-full bg-gray-100 rounded-full h-3">
                <div className={`${item.color} h-3 rounded-full`} style={{ width: `${item.percent}%` }}></div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
