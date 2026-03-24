export default function Dashboard() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-gray-900 tracking-tight">Dashboard Overview</h1>
        <p className="text-gray-500 mt-2">Real-time valuation and activity of the global inventory.</p>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <div className="card border-l-4 border-l-primary flex flex-col justify-between hover:shadow-md transition-shadow">
          <p className="text-sm font-medium text-gray-500">Total Inventory Value</p>
          <div className="mt-4 flex items-baseline">
            <span className="text-3xl font-bold text-gray-900">₹84,592,000</span>
          </div>
          <div className="mt-4 text-sm text-success flex items-center">
            <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 10l7-7m0 0l7 7m-7-7v18"></path></svg>
            12% vs last month
          </div>
        </div>

        <div className="card border-l-4 border-l-success flex flex-col justify-between hover:shadow-md transition-shadow">
          <p className="text-sm font-medium text-gray-500">Total Profit (MTD)</p>
          <div className="mt-4 flex items-baseline">
            <span className="text-3xl font-bold text-gray-900">₹1,240,500</span>
          </div>
          <div className="mt-4 text-sm text-success flex items-center">
            <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 10l7-7m0 0l7 7m-7-7v18"></path></svg>
            2.4% vs last month
          </div>
        </div>

        <div className="card border-l-4 border-l-danger flex flex-col justify-between hover:shadow-md transition-shadow">
          <p className="text-sm font-medium text-gray-500">Low Stock Alerts</p>
          <div className="mt-4 flex items-baseline">
            <span className="text-3xl font-bold text-gray-900">14 Items</span>
          </div>
          <div className="mt-4 text-sm text-danger flex items-center">
            Needs immediate attention
          </div>
        </div>

        <div className="card flex flex-col justify-between hover:shadow-md transition-shadow">
          <p className="text-sm font-medium text-gray-500">Active Container Ships</p>
          <div className="mt-4 flex items-baseline">
            <span className="text-3xl font-bold text-gray-900">3</span>
            <span className="ml-2 text-sm text-gray-500">In transit</span>
          </div>
          <div className="mt-4 text-sm text-gray-500">
            Next arrival: 2 days (CN to IN)
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Recent Activity */}
        <div className="lg:col-span-2 card">
          <h2 className="text-lg font-semibold text-gray-900 mb-6">Recent Transactions</h2>
          <div className="space-y-6">
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="flex items-center">
                <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-primary flex-shrink-0">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4"></path></svg>
                </div>
                <div className="ml-4 flex-1">
                  <p className="text-sm font-medium text-gray-900">Warehouse Transfer - TXN-{4902 + i}</p>
                  <p className="text-xs text-gray-500 mt-1">200x Nike Dunk Low to Mumbai Shop</p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-semibold text-gray-900">₹450,000</p>
                  <p className="text-xs text-gray-400 mt-1">2 hours ago</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Inventory Summary */}
        <div className="card">
          <h2 className="text-lg font-semibold text-gray-900 mb-6">Stock by Location</h2>
          <div className="space-y-5">
            <div>
              <div className="flex justify-between text-sm mb-2">
                <span className="font-medium text-gray-700">Main Warehouse (IN)</span>
                <span className="text-gray-500">45%</span>
              </div>
              <div className="w-full bg-gray-100 rounded-full h-2">
                <div className="bg-primary h-2 rounded-full" style={{ width: '45%' }}></div>
              </div>
            </div>
            <div>
              <div className="flex justify-between text-sm mb-2">
                <span className="font-medium text-gray-700">Mumbai Shop</span>
                <span className="text-gray-500">25%</span>
              </div>
              <div className="w-full bg-gray-100 rounded-full h-2">
                <div className="bg-blue-400 h-2 rounded-full" style={{ width: '25%' }}></div>
              </div>
            </div>
            <div>
              <div className="flex justify-between text-sm mb-2">
                <span className="font-medium text-gray-700">Delhi Shop</span>
                <span className="text-gray-500">20%</span>
              </div>
              <div className="w-full bg-gray-100 rounded-full h-2">
                <div className="bg-indigo-400 h-2 rounded-full" style={{ width: '20%' }}></div>
              </div>
            </div>
            <div>
              <div className="flex justify-between text-sm mb-2">
                <span className="font-medium text-gray-700">Transit</span>
                <span className="text-gray-500">10%</span>
              </div>
              <div className="w-full bg-gray-100 rounded-full h-2">
                <div className="bg-gray-400 h-2 rounded-full" style={{ width: '10%' }}></div>
              </div>
            </div>
          </div>
          
          <button className="w-full mt-8 btn-secondary">
            View Detailed Reports
          </button>
        </div>
      </div>
    </div>
  );
}
