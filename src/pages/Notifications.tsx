import { useMemo, useState } from 'react';
import { useStore } from '../store';
import { useAuthStore } from '../store/authStore';
import { format, formatDistanceToNow } from 'date-fns';
import {
  Bell, AlertTriangle, ShoppingCart, ArrowRightLeft,
  Package, Undo2, CheckCheck, Filter, BellOff, ChevronRight, Globe2, Activity
} from 'lucide-react';
import clsx from 'clsx';


type FilterTab = 'all' | 'low_stock' | 'transfer' | 'sale' | 'stock_entry';

const TYPE_META: Record<string, { label: string; icon: React.ElementType; color: string; bg: string }> = {
  low_stock:   { label: 'Low Stock',    icon: AlertTriangle,    color: 'text-red-500',     bg: 'bg-red-50' },
  transfer:    { label: 'Transfer',     icon: ArrowRightLeft,   color: 'text-blue-500',    bg: 'bg-blue-50' },
  sale:        { label: 'Sale',         icon: ShoppingCart,     color: 'text-emerald-500', bg: 'bg-emerald-50' },
  stock_entry: { label: 'Stock Entry',  icon: Package,          color: 'text-violet-500',  bg: 'bg-violet-50' },
  return:      { label: 'Return',       icon: Undo2,            color: 'text-amber-500',   bg: 'bg-amber-50' },
  onboard:     { label: 'Onboard',      icon: Package,          color: 'text-primary',     bg: 'bg-blue-50' },
};

export default function Notifications() {
  const { notifications, markNotificationRead, locations } = useStore();
  const { appUser } = useAuthStore();
  const [activeTab, setActiveTab] = useState<FilterTab>('all');
  const [showOnlyUnread, setShowOnlyUnread] = useState(false);

  const role = appUser?.role ?? 'shop_staff';
  const userLocationId = (appUser as any)?.location_id ?? '';

  const visibleNotifs = useMemo(() => {
    return notifications.filter(n => {
      const targets = (n as any).target_roles as string[] | undefined;
      if (!targets || targets.length === 0) return true;
      if (!targets.includes(role)) return false;

      if ((role === 'shop_staff' || role === 'warehouse_staff') && userLocationId) {
        return n.location_id === userLocationId || n.target_location_id === userLocationId;
      }
      return true;
    });
  }, [notifications, role, userLocationId]);

  const filtered = useMemo(() => {
    let result = visibleNotifs;
    if (activeTab !== 'all') result = result.filter(n => n.type === activeTab);
    if (showOnlyUnread) result = result.filter(n => n.status === 'unread');
    return result;
  }, [visibleNotifs, activeTab, showOnlyUnread]);

  const unreadCount = visibleNotifs.filter(n => n.status === 'unread').length;

  const tabs: { id: FilterTab; label: string; count: number }[] = [
    { id: 'all',         label: 'All',         count: visibleNotifs.length },
    { id: 'low_stock',   label: 'Low Stock',   count: visibleNotifs.filter(n => n.type === 'low_stock').length },
    { id: 'transfer',    label: 'Transfers',   count: visibleNotifs.filter(n => n.type === 'transfer').length },
    { id: 'sale',        label: 'Sales',       count: visibleNotifs.filter(n => n.type === 'sale').length },
    { id: 'stock_entry', label: 'Stock Entry', count: visibleNotifs.filter(n => n.type === 'stock_entry').length },
  ];

  const getLocationName = (id: string) => locations.find(l => l.id === id)?.name ?? id;

  const markAllRead = () => {
    visibleNotifs.filter(n => n.status === 'unread').forEach(n => markNotificationRead(n.id));
  };

  return (
    <div className="max-w-[1200px] mx-auto space-y-6 lg:space-y-10 animate-in fade-in duration-500">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-gray-900 flex items-center gap-3 tracking-tight">
            <div className="p-2 sm:p-2.5 bg-primary/10 rounded-xl text-primary flex-shrink-0">
               <Bell className="w-5 h-5 sm:w-6 sm:h-6" />
            </div>
            Node Notifications
          </h1>
          <p className="text-xs sm:text-sm text-gray-400 font-bold uppercase tracking-widest mt-2 ml-10 sm:ml-12 border-l-2 border-gray-100 pl-4 uppercase tracking-tighter">
            {role === 'super_admin' || role === 'admin'
              ? 'Global Operations Stream'
              : `Scoped Feed: ${getLocationName(userLocationId) || 'Branch Node'}`}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 sm:gap-3 ml-10 sm:ml-0 md:justify-end">
          <button
            onClick={() => setShowOnlyUnread(v => !v)}
            className={clsx(
              "flex items-center gap-2 text-[10px] font-black uppercase tracking-widest px-4 py-2 rounded-full border transition-all h-10",
              showOnlyUnread
                ? 'bg-primary text-white border-primary shadow-lg shadow-primary/20'
                : 'bg-white text-gray-500 border-gray-100 hover:border-primary/30 hover:bg-gray-50'
            )}
          >
            <Filter className={clsx("w-3.5 h-3.5", showOnlyUnread ? "text-white" : "text-primary")} />
            {showOnlyUnread ? 'Unread Only' : 'Unified Feed'}
          </button>
          {unreadCount > 0 && (
            <button
              onClick={markAllRead}
              className="group flex items-center gap-2 text-[10px] font-black uppercase tracking-widest px-4 py-2 rounded-full border bg-white text-gray-500 border-gray-100 hover:border-gray-300 hover:bg-gray-50 transition-all h-10"
            >
              <CheckCheck className="w-3.5 h-3.5 group-hover:text-emerald-500 transition-colors" />
              Mark All Read
            </button>
          )}
        </div>
      </div>

      {/* KPI Stats Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 lg:gap-6">
        <div className="card border-0 shadow-lg shadow-gray-50 bg-gradient-to-br from-white to-gray-50/50">
          <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest leading-none mb-4">Unread Alerts</p>
          <div className="flex items-center justify-between">
            <p className={clsx("text-4xl font-black tracking-tighter", unreadCount > 0 ? 'text-red-500' : 'text-gray-900')}>{unreadCount}</p>
            <div className={clsx("w-10 h-10 rounded-xl flex items-center justify-center", unreadCount > 0 ? "bg-red-50 text-red-500 animate-pulse" : "bg-gray-100 text-gray-300")}>
               <Bell className="w-5 h-5" />
            </div>
          </div>
        </div>
        <div className="card border-0 shadow-lg shadow-gray-50 bg-gradient-to-br from-white to-gray-50/50">
          <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest leading-none mb-4">Stream Volume</p>
          <div className="flex items-center justify-between">
            <p className="text-4xl font-black text-gray-900 tracking-tighter">{visibleNotifs.length}</p>
            <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-500 flex items-center justify-center">
               <Activity className="w-5 h-5" />
            </div>
          </div>
        </div>
        <div className="card border-0 shadow-lg shadow-gray-50 bg-gradient-to-br from-white to-gray-50/50">
          <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest leading-none mb-4">Restock Triggers</p>
          <div className="flex items-center justify-between">
            <p className="text-4xl font-black text-amber-500 tracking-tighter">
              {visibleNotifs.filter(n => n.type === 'low_stock').length}
            </p>
            <div className="w-10 h-10 rounded-xl bg-amber-50 text-amber-500 flex items-center justify-center">
               <AlertTriangle className="w-5 h-5" />
            </div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-gray-100 overflow-x-auto no-scrollbar scroll-smooth">
        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={clsx(
              "flex items-center gap-3 px-6 py-4 text-sm font-bold tracking-tight whitespace-nowrap transition-all border-b-2 relative",
              activeTab === tab.id
                ? 'border-primary text-primary bg-primary/[0.02]'
                : 'border-transparent text-gray-400 hover:text-gray-900 hover:bg-gray-50/50'
            )}
          >
            {tab.label}
            {tab.count > 0 && (
              <span className={clsx(
                "text-[9px] font-black px-1.5 py-0.5 rounded-md min-w-[20px] text-center",
                activeTab === tab.id ? 'bg-primary text-white shadow-sm shadow-primary/30' : 'bg-gray-100 text-gray-400'
              )}>
                {tab.count}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Notification List Container */}
      <div className="bg-white rounded-3xl border border-gray-100 shadow-xl shadow-gray-100/50 overflow-hidden min-h-[400px]">
        {filtered.length === 0 ? (
          <div className="p-24 text-center flex flex-col items-center">
            <div className="w-20 h-20 bg-gray-50 rounded-3xl flex items-center justify-center mb-6">
              <BellOff className="w-10 h-10 text-gray-200" />
            </div>
            <p className="font-extrabold text-gray-900 text-lg tracking-tight">Stream Silence</p>
            <p className="text-sm text-gray-400 mt-2 max-w-[240px] leading-relaxed">
              {showOnlyUnread ? 'Every node is currently operational and synchronized.' : 'No alerts have entered the event queue yet.'}
            </p>
          </div>
        ) : (
          <div className="divide-y divide-gray-50">
            {filtered.sort((a,b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()).map((n) => {
              const meta = TYPE_META[n.type] ?? TYPE_META['stock_entry'];
              const Icon = meta.icon;
              return (
                <div
                  key={n.id}
                  className={clsx(
                    "p-5 sm:p-6 lg:p-8 flex items-start gap-4 sm:gap-6 hover:bg-gray-50/50 transition-all cursor-pointer relative group",
                    n.status === 'unread' && "bg-blue-50/20"
                  )}
                  onClick={() => n.status === 'unread' && markNotificationRead(n.id)}
                >
                  {/* Status Indicator */}
                  {n.status === 'unread' && (
                    <div className="absolute left-1.5 inset-y-8 w-1 sm:w-1.5 bg-primary rounded-full shadow-[0_0_12px_rgba(37,99,235,0.4)]" />
                  )}

                  {/* Icon */}
                  <div className={clsx(
                    "mt-0.5 p-3 rounded-2xl flex-shrink-0 transition-transform group-hover:scale-110 duration-300",
                    n.status === 'unread' ? meta.bg : 'bg-gray-100 shadow-inner'
                  )}>
                    <Icon className={clsx("w-5 h-5 sm:w-6 sm:h-6", n.status === 'unread' ? meta.color : 'text-gray-400')} />
                  </div>

                  {/* Content Content Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-2.5">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className={clsx(
                          "text-[9px] font-black uppercase tracking-widest px-2.5 py-1 rounded-md",
                          n.status === 'unread' ? `${meta.bg} ${meta.color}` : 'bg-gray-100 text-gray-400'
                        )}>
                          {meta.label}
                        </span>
                        
                        <div className="flex items-center gap-1.5 text-[10px] font-bold text-gray-400 bg-gray-50 px-2 py-0.5 rounded-full whitespace-nowrap">
                          <Globe2 className="w-3 h-3 text-gray-300" />
                          {getLocationName(n.location_id)}
                          {n.target_location_id && (
                             <>
                               <ChevronRight className="w-2.5 h-2.5 text-gray-300" />
                               {getLocationName(n.target_location_id)}
                             </>
                          )}
                        </div>
                      </div>
                      
                      <span className="text-[10px] font-black text-gray-400 uppercase tracking-tighter whitespace-nowrap bg-white/80 px-2 py-1 rounded-md shadow-sm border border-gray-100 sm:border-0 sm:shadow-none sm:bg-transparent">
                        {formatDistanceToNow(new Date(n.timestamp), { addSuffix: true })}
                      </span>
                    </div>

                    <p className={clsx(
                      "text-sm sm:text-base leading-relaxed tracking-tight",
                      n.status === 'unread' ? 'text-gray-900 font-bold' : 'text-gray-500 font-medium'
                    )}>
                      {n.message}
                    </p>

                    <div className="flex items-center justify-between mt-4">
                      <p className="text-[10px] font-bold text-gray-300 uppercase tracking-widest">
                        {format(new Date(n.timestamp), 'MMM dd, yyyy · HH:mm:ss')}
                      </p>
                      
                      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <span className="text-[9px] font-black text-primary uppercase tracking-widest">Read Details</span>
                        <ChevronRight className="w-3 h-3 text-primary" />
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
      
      <div className="flex justify-center py-4">
        <p className="text-[10px] font-bold text-gray-300 uppercase tracking-[0.2em]">End of Transmission</p>
      </div>
    </div>
  );
}
