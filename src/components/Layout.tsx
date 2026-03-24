import { useState } from 'react';
import { Link, Outlet, useLocation } from 'react-router-dom';
import { 
  LayoutDashboard, 
  Warehouse, 
  Store,
  ReceiptText,
  ArrowRightLeft, 
  Undo2, 
  PieChart, 
  Users,
  Bell,
  Search,
  Globe,
  Menu,
  ScanBarcode,
  X
} from 'lucide-react';
import clsx from 'clsx';

const navItems = [
  { name: 'Dashboard', path: '/dashboard', icon: LayoutDashboard },
  { name: 'Warehouse', path: '/warehouse', icon: Warehouse },
  { name: 'Shops', path: '/shops', icon: Store },
  { name: 'Billing', path: '/billing', icon: ReceiptText },
  { name: 'Transfers', path: '/transfers', icon: ArrowRightLeft },
  { name: 'Returns', path: '/returns', icon: Undo2 },
  { name: 'Finance', path: '/finance', icon: PieChart },
  { name: 'Users', path: '/users', icon: Users },
];

export default function Layout() {
  const location = useLocation();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  return (
    <div className="flex h-screen bg-gray-50 font-sans text-text">
      {/* Mobile Sidebar Overlay */}
      {isMobileMenuOpen && (
        <div 
          className="fixed inset-0 bg-gray-900/40 backdrop-blur-sm z-40 md:hidden"
          onClick={() => setIsMobileMenuOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside className={clsx(
        "fixed md:static inset-y-0 left-0 z-50 w-64 bg-white border-r border-gray-100 flex flex-col shadow-sm transform transition-transform duration-300 md:translate-x-0",
        isMobileMenuOpen ? "translate-x-0" : "-translate-x-full"
      )}>
        <div className="h-16 flex items-center justify-between px-6 border-b border-gray-100">
          <div className="flex items-center">
            <Globe className="w-8 h-8 text-primary mr-3" />
            <span className="text-xl font-bold tracking-tight text-gray-900">777 Global</span>
          </div>
          <button className="md:hidden text-gray-500 hover:text-gray-700" onClick={() => setIsMobileMenuOpen(false)}>
            <X className="w-6 h-6" />
          </button>
        </div>
        
        <div className="flex-1 py-6 px-4 space-y-1 overflow-y-auto">
          {navItems.map((item) => {
            const isActive = location.pathname.startsWith(item.path);
            const Icon = item.icon;
            
            return (
              <Link
                key={item.name}
                to={item.path}
                onClick={() => setIsMobileMenuOpen(false)}
                className={clsx(
                  "flex items-center px-4 py-3 text-sm font-medium rounded-xl transition-all duration-200 group relative",
                  isActive 
                    ? "bg-primary/10 text-primary" 
                    : "text-gray-500 hover:bg-gray-50 hover:text-gray-900"
                )}
              >
                <Icon className={clsx("w-5 h-5 mr-3", isActive ? "text-primary" : "text-gray-400 group-hover:text-gray-600")} />
                {item.name}
              </Link>
            );
          })}
        </div>

        <div className="p-4 border-t border-gray-100">
          <div className="flex items-center space-x-3 cursor-pointer p-2 rounded-xl hover:bg-gray-50 transition-colors">
            <div className="w-10 h-10 rounded-full bg-primary/20 flex flex-shrink-0 items-center justify-center text-primary font-bold">
              RA
            </div>
            <div className="flex flex-col overflow-hidden">
              <span className="text-sm font-semibold text-gray-900 truncate">Rayan Admin</span>
              <span className="text-xs text-gray-500 truncate">super_admin</span>
            </div>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Top Navbar */}
        <header className="h-16 bg-white/80 backdrop-blur-md border-b border-gray-100 flex items-center justify-between px-4 sm:px-8 sticky top-0 z-10 transition-all shadow-sm">
          <div className="flex items-center flex-1">
            <button className="mr-4 md:hidden text-gray-500 hover:text-gray-700" onClick={() => setIsMobileMenuOpen(true)}>
              <Menu className="w-6 h-6" />
            </button>
            <div className="relative w-full max-w-md hidden sm:block">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input 
                type="text" 
                placeholder="Search inventory, tags, locations..." 
                className="w-full bg-gray-50 border border-gray-200 text-sm rounded-full pl-10 pr-4 py-2 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all duration-300"
              />
            </div>
          </div>

          <div className="flex items-center space-x-3 sm:space-x-6">
            {/* Quick Actions */}
            <button className="hidden sm:flex items-center text-sm font-medium text-gray-600 hover:text-primary transition-colors bg-gray-50 hover:bg-primary/10 px-3 py-1.5 rounded-full border border-gray-200 hover:border-primary/20">
              <ScanBarcode className="w-4 h-4 mr-2" />
              Scan
            </button>

            <div className="flex items-center space-x-2 bg-gray-50 px-3 py-1.5 rounded-full border border-gray-200 text-xs font-semibold text-gray-700 shadow-sm cursor-pointer hover:bg-gray-100 transition-colors">
              <div className="w-2 h-2 rounded-full bg-success animate-pulse"></div>
              <span className="hidden sm:inline">Base: INR</span>
              <span className="sm:hidden">INR</span>
            </div>
            
            <button className="relative text-gray-400 hover:text-gray-600 transition-colors">
              <Bell className="w-6 h-6" />
              <span className="absolute top-0 right-0 w-2 h-2 bg-danger rounded-full ring-2 ring-white"></span>
            </button>
          </div>
        </header>

        {/* Page Content */}
        <div className="flex-1 overflow-y-auto bg-gray-50/50 p-4 sm:p-8">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
