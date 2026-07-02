import { useState, useEffect } from 'react';
import { Link, Outlet, useLocation } from 'react-router-dom';
import {
  LayoutDashboard,
  Warehouse,
  Store,
  ArrowRightLeft,
  Undo2,
  PieChart,
  Users,
  Bell,
  Globe,
  Menu,
  X,
  ChevronRight,
  Zap,
  Building2,
  FileText,
  BarChart2,
  ShieldAlert,
} from 'lucide-react';
import clsx from 'clsx';
import { useAuthStore } from '../store/authStore';
import { useStore, hasPermission } from '../store';
import type { Permission, User } from '../store';
import GlobalTransferModal from './GlobalTransferModal';
import GlobalRecordSaleModal from './GlobalRecordSaleModal';
import GlobalReturnModal from './GlobalReturnModal';
import GlobalImportModal from './GlobalImportModal';
import { auth } from '../lib/firebase';

const navItems: { name: string, path: string, icon: any, group: string, permission: Permission }[] = [
  { name: 'Dashboard', path: '/dashboard', icon: LayoutDashboard, group: 'CORE', permission: 'view_dashboard' },
  { name: 'Analytics', path: '/insights', icon: Zap, group: 'ANALYTICS', permission: 'view_reports' },

  { name: 'Warehouse Mgmt', path: '/warehouse', icon: Warehouse, group: 'OPERATIONS', permission: 'manage_warehouses' },
  { name: 'Manage Warehouses', path: '/manage-warehouses', icon: Building2, group: 'OPERATIONS', permission: 'manage_warehouses' },
  
  { name: 'Stock Transfer', path: '/transfers', icon: ArrowRightLeft, group: 'OPERATIONS', permission: 'manage_transfers' },
  { name: 'Returns handling', path: '/returns', icon: Undo2, group: 'OPERATIONS', permission: 'manage_warehouses' },
  { name: 'Stock Reports', path: '/stock-reports', icon: BarChart2, group: 'OPERATIONS', permission: 'view_reports' },

  { name: 'Sales & Shops', path: '/shops', icon: Store, group: 'FINANCE', permission: 'manage_shops' },
  { name: 'Finance Hub', path: '/finance', icon: PieChart, group: 'FINANCE', permission: 'view_finance' },
  { name: 'Reports Archive', path: '/reports', icon: FileText, group: 'FINANCE', permission: 'view_reports' },

  { name: 'Manage Shops', path: '/manage-shops', icon: Globe, group: 'ADMIN', permission: 'manage_shops' },
  { name: 'Notifications', path: '/notifications', icon: Bell, group: 'ADMIN', permission: 'manage_users' },
  { name: 'Control Users', path: '/users', icon: Users, group: 'ADMIN', permission: 'manage_users' },
  { name: 'Audit Logs', path: '/audit-logs', icon: ShieldAlert, group: 'ADMIN', permission: 'manage_users' },
];

export default function Layout() {
  const location = useLocation();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const { appUser } = useAuthStore();
  const { notifications, baseCurrency, setBaseCurrency, fetchLiveExchangeRates, isSyncingRates } = useStore();
  const role = appUser?.role ?? 'shop_staff';
  const userLocationId = (appUser as any)?.location_id ?? '';

  const unreadCount = notifications.filter(n => {
    if (n.status !== 'unread') return false;
    const targets = (n as any).target_roles as string[] | undefined;
    if (!targets || targets.length === 0) return true; // legacy
    if (!targets.includes(role)) return false;
    if ((role === 'shop_staff' || role === 'warehouse_staff') && userLocationId) {
      return n.location_id === userLocationId || n.target_location_id === userLocationId;
    }
    return true;
  }).length;

  useEffect(() => {
    useStore.getState().initFirestoreSync();
  }, []);

  const activePage = navItems.find(n => location.pathname.startsWith(n.path))?.name ?? 'Dashboard';

  return (
    <div className="flex h-screen bg-gray-50 font-sans text-gray-900 overflow-hidden">
      {/* Mobile/Tablet Overlay */}
      {isMobileMenuOpen && (
        <div
          className="fixed inset-0 bg-gray-900/60 backdrop-blur-md z-40 lg:hidden"
          onClick={() => setIsMobileMenuOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside className={clsx(
        "fixed lg:static inset-y-0 left-0 z-50 w-[280px] sm:w-64 bg-white border-r border-gray-100 flex flex-col shadow-2xl lg:shadow-none transform transition-transform duration-300 ease-in-out lg:translate-x-0",
        isMobileMenuOpen ? "translate-x-0" : "-translate-x-full"
      )}>
        {/* Logo */}
        <div className="h-16 flex items-center justify-between px-5 border-b border-gray-100">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center">
              <Globe className="w-4.5 h-4.5 text-white" size={18} />
            </div>
            <div>
              <span className="text-base font-bold text-gray-900 leading-none tracking-tight">777 Global</span>
              <p className="text-[10px] text-gray-400 font-medium leading-none mt-0.5">Inventory & Distribution</p>
            </div>
          </div>
          <button className="lg:hidden text-gray-400 hover:text-gray-700 p-1.5 rounded-lg hover:bg-gray-50" onClick={() => setIsMobileMenuOpen(false)}>
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Nav */}
        <nav className="flex-1 py-5 px-3 space-y-4 overflow-y-auto">
          {(() => {
             const permittedNavItems = navItems.filter(item => hasPermission(appUser as User, item.permission));
             const groups = ['CORE', 'ANALYTICS', 'OPERATIONS', 'FINANCE', 'ADMIN'];
             return groups.map(group => {
               const itemsInGroup = permittedNavItems.filter(i => i.group === group);
               if (itemsInGroup.length === 0) return null;
               return (
                 <div key={group} className="space-y-1">
                   <p className="px-3 text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2 font-sans">{group}</p>
                   {itemsInGroup.map((item) => {
                     const isActive = location.pathname.startsWith(item.path);
                     const Icon = item.icon;
                     return (
                       <Link
                         key={item.name}
                         to={item.path}
                         onClick={() => setIsMobileMenuOpen(false)}
                         className={clsx(
                           "flex items-center px-3 py-2 text-sm font-medium rounded-lg transition-all duration-150 group/item",
                           isActive
                             ? "bg-primary text-white shadow-sm shadow-primary/30"
                             : "text-gray-500 hover:bg-gray-50 hover:text-gray-900"
                         )}
                       >
                         <Icon className={clsx("w-4 mr-3 flex-shrink-0", isActive ? "text-white" : "text-gray-400 group-hover/item:text-gray-600")} size={16} />
                         <span className="truncate">{item.name}</span>
                         {isActive && <ChevronRight className="w-3.5 h-3.5 ml-auto text-white/60" />}
                       </Link>
                     );
                   })}
                 </div>
               );
             });
          })()}
        </nav>

        {/* User Footer */}
        <div className="p-4 border-t border-gray-100 space-y-3">
          <div className="flex items-center gap-3 px-2 py-2 rounded-lg bg-gray-50">
            <div className="w-8 h-8 rounded-full bg-primary/10 flex flex-shrink-0 items-center justify-center text-primary font-bold text-sm">
              {appUser?.name ? appUser.name.charAt(0).toUpperCase() : 'U'}
            </div>
            <div className="flex flex-col min-w-0">
              <span className="text-sm font-semibold text-gray-900 truncate">{appUser?.name || 'User'}</span>
            </div>
          </div>
          <button
            onClick={() => auth.signOut()}
            className="w-full py-2 px-3 text-xs font-bold text-red-600 bg-red-50 hover:bg-red-100 rounded-lg transition-colors flex items-center justify-center gap-2"
          >
            Sign Out
          </button>
        </div>
      </aside>

      {/* Main */}
      <main className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Top Bar */}
        <header className="h-16 bg-white/80 backdrop-blur-lg border-b border-gray-100 flex items-center justify-between px-4 sm:px-6 lg:px-8 flex-shrink-0 sticky top-0 z-30">
          <div className="flex items-center gap-3">
            <button className="lg:hidden text-gray-400 hover:text-gray-700 p-2 -ml-2 rounded-lg hover:bg-gray-50" onClick={() => setIsMobileMenuOpen(true)}>
              <Menu className="w-5 h-5" />
            </button>
            <div>
              <h2 className="text-sm sm:text-base font-bold text-gray-900 leading-tight">{activePage}</h2>
              <p className="text-[10px] sm:text-xs text-gray-400 hidden xs:block">777 Global Inventory System</p>
            </div>
          </div>
          <div className="flex items-center gap-2 sm:gap-3">
            <div className="flex items-center gap-2">
              <select
                title="Select Base Currency"
                value={baseCurrency}
                onChange={(e) => setBaseCurrency(e.target.value)}
                className="bg-blue-50 border border-blue-100 text-blue-700 text-xs font-bold px-3 py-1.5 rounded-full cursor-pointer hover:bg-blue-100/70 focus:outline-none transition-colors"
              >
                <option value="USD">💵 USD ($)</option>
                <option value="ZMW">🇿🇲 ZMW (K)</option>
                <option value="INR">🇮🇳 INR (₹)</option>
              </select>
            </div>
            <Link to="/notifications" className="relative text-gray-400 hover:text-gray-700 p-2 rounded-lg hover:bg-gray-50 transition-colors">
              <Bell className="w-5 h-5" />
              {unreadCount > 0 && (
                <span className="absolute top-1 right-1 w-4 h-4 bg-red-500 text-white text-[9px] font-bold rounded-full flex items-center justify-center">
                  {unreadCount > 9 ? '9+' : unreadCount}
                </span>
              )}
            </Link>
          </div>
        </header>

        {/* Page Content */}
        <div className="flex-1 overflow-y-auto bg-gray-50/50">
          <div className="p-4 sm:p-6 lg:p-10 max-w-[1600px] mx-auto w-full">
            <Outlet />
          </div>
        </div>
      </main>

      <GlobalTransferModal />
      <GlobalRecordSaleModal />
      <GlobalReturnModal />
      <GlobalImportModal />
    </div>
  );
}
