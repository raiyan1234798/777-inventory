import { useMemo, useState, useCallback } from 'react';
import { useStore } from '../store';
import { useAuthStore } from '../store/authStore';
import { format, formatDistanceToNow, isToday, isYesterday, isThisWeek } from 'date-fns';
import {
  Bell, AlertTriangle, ShoppingCart, ArrowRightLeft,
  Package, Undo2, CheckCheck, BellOff, Globe2, Activity,
  Search, Trash2, X, ChevronDown, ChevronUp, Eye, EyeOff,
  MailOpen, Clock, MapPin, ArrowRight, Inbox
} from 'lucide-react';
import clsx from 'clsx';
import type { AppNotification } from '../store';


type FilterTab = 'all' | 'low_stock' | 'transfer' | 'sale' | 'stock_entry';

const TYPE_META: Record<string, { label: string; icon: React.ElementType; color: string; bg: string; border: string }> = {
  low_stock:   { label: 'Low Stock',    icon: AlertTriangle,    color: 'text-red-500',     bg: 'bg-red-50',     border: 'border-red-200' },
  transfer:    { label: 'Transfer',     icon: ArrowRightLeft,   color: 'text-blue-500',    bg: 'bg-blue-50',    border: 'border-blue-200' },
  sale:        { label: 'Sale',         icon: ShoppingCart,     color: 'text-emerald-500', bg: 'bg-emerald-50', border: 'border-emerald-200' },
  stock_entry: { label: 'Stock Entry',  icon: Package,          color: 'text-violet-500',  bg: 'bg-violet-50',  border: 'border-violet-200' },
  return:      { label: 'Return',       icon: Undo2,            color: 'text-amber-500',   bg: 'bg-amber-50',   border: 'border-amber-200' },
  onboard:     { label: 'Onboard',      icon: Package,          color: 'text-primary',     bg: 'bg-blue-50',    border: 'border-blue-200' },
};

type DateGroup = 'today' | 'yesterday' | 'this_week' | 'older';

function getDateGroup(timestamp: string): DateGroup {
  const date = new Date(timestamp);
  if (isToday(date)) return 'today';
  if (isYesterday(date)) return 'yesterday';
  if (isThisWeek(date)) return 'this_week';
  return 'older';
}

const DATE_GROUP_LABELS: Record<DateGroup, string> = {
  today: 'Today',
  yesterday: 'Yesterday',
  this_week: 'This Week',
  older: 'Earlier',
};

export default function Notifications() {
  const { notifications, markNotificationRead, deleteNotification, deleteNotifications, locations } = useStore();
  const { appUser } = useAuthStore();
  const [activeTab, setActiveTab] = useState<FilterTab>('all');
  const [showOnlyUnread, setShowOnlyUnread] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [selectMode, setSelectMode] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [confirmBulkDelete, setConfirmBulkDelete] = useState(false);

  const role = appUser?.role ?? 'shop_staff';
  const userLocationId = (appUser as any)?.location_id ?? '';

  // ─── Existing filter conditions (untouched) ────────────────────────────
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
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(n =>
        (n.message || '').toLowerCase().includes(q) ||
        (getLocationName(n.location_id) || '').toLowerCase().includes(q) ||
        (n.target_location_id && (getLocationName(n.target_location_id) || '').toLowerCase().includes(q))
      );
    }
    return result.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  }, [visibleNotifs, activeTab, showOnlyUnread, searchQuery]);

  // ─── Group by date ─────────────────────────────────────────────────────
  const groupedNotifs = useMemo(() => {
    const groups: Record<DateGroup, AppNotification[]> = { today: [], yesterday: [], this_week: [], older: [] };
    filtered.forEach(n => groups[getDateGroup(n.timestamp)].push(n));
    return groups;
  }, [filtered]);

  const unreadCount = visibleNotifs.filter(n => n.status === 'unread').length;

  const tabs: { id: FilterTab; label: string; icon: React.ElementType; count: number }[] = [
    { id: 'all',         label: 'All',         icon: Inbox,           count: visibleNotifs.length },
    { id: 'low_stock',   label: 'Low Stock',   icon: AlertTriangle,   count: visibleNotifs.filter(n => n.type === 'low_stock').length },
    { id: 'transfer',    label: 'Transfers',   icon: ArrowRightLeft,  count: visibleNotifs.filter(n => n.type === 'transfer').length },
    { id: 'sale',        label: 'Sales',       icon: ShoppingCart,    count: visibleNotifs.filter(n => n.type === 'sale').length },
    { id: 'stock_entry', label: 'Stock Entry',  icon: Package,        count: visibleNotifs.filter(n => n.type === 'stock_entry').length },
  ];

  const getLocationName = (id: string) => locations.find(l => l.id === id)?.name ?? id;

  const markAllRead = () => {
    visibleNotifs.filter(n => n.status === 'unread').forEach(n => markNotificationRead(n.id));
  };

  const toggleSelect = useCallback((id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }, []);

  const selectAll = () => {
    setSelectedIds(new Set(filtered.map(n => n.id)));
  };

  const clearSelection = () => {
    setSelectedIds(new Set());
    setSelectMode(false);
  };

  const handleBulkDelete = async () => {
    if (selectedIds.size === 0) return;
    await deleteNotifications(Array.from(selectedIds));
    setSelectedIds(new Set());
    setSelectMode(false);
    setConfirmBulkDelete(false);
  };

  const handleDelete = async (id: string) => {
    await deleteNotification(id);
    setConfirmDeleteId(null);
    if (expandedId === id) setExpandedId(null);
  };

  const handleMarkSelectedRead = () => {
    selectedIds.forEach(id => {
      const n = filtered.find(n => n.id === id);
      if (n && n.status === 'unread') markNotificationRead(id);
    });
  };

  // ─── Type distribution for mini chart ──────────────────────────────────
  const typeDistribution = useMemo(() => {
    const counts: Record<string, number> = {};
    visibleNotifs.forEach(n => { counts[n.type] = (counts[n.type] || 0) + 1; });
    const total = visibleNotifs.length || 1;
    return Object.entries(counts).map(([type, count]) => ({
      type,
      count,
      pct: Math.round((count / total) * 100),
      meta: TYPE_META[type] || TYPE_META['stock_entry'],
    })).sort((a, b) => b.count - a.count);
  }, [visibleNotifs]);

  // ─── Render a notification card ────────────────────────────────────────
  const renderNotification = (n: AppNotification) => {
    const meta = TYPE_META[n.type] ?? TYPE_META['stock_entry'];
    const Icon = meta.icon;
    const isExpanded = expandedId === n.id;
    const isSelected = selectedIds.has(n.id);
    const isConfirmingDelete = confirmDeleteId === n.id;

    return (
      <div
        key={n.id}
        className={clsx(
          "group relative transition-all duration-200",
          isSelected && "ring-2 ring-primary/30 rounded-2xl",
        )}
      >
        <div
          className={clsx(
            "p-4 sm:p-5 flex items-start gap-3 sm:gap-4 rounded-2xl transition-all duration-200 cursor-pointer",
            n.status === 'unread'
              ? 'bg-white shadow-sm border border-gray-100 hover:shadow-md hover:border-gray-200'
              : 'bg-gray-50/50 border border-transparent hover:bg-gray-100/50 hover:border-gray-100',
          )}
          onClick={() => {
            if (selectMode) {
              toggleSelect(n.id);
            } else {
              setExpandedId(prev => prev === n.id ? null : n.id);
              if (n.status === 'unread') markNotificationRead(n.id);
            }
          }}
        >
          {/* Checkbox in select mode */}
          {selectMode && (
            <div className="flex items-center pt-1">
              <div className={clsx(
                "w-5 h-5 rounded-lg border-2 flex items-center justify-center transition-all",
                isSelected ? "bg-primary border-primary" : "border-gray-300 hover:border-primary"
              )}>
                {isSelected && <CheckCheck className="w-3 h-3 text-white" />}
              </div>
            </div>
          )}

          {/* Unread dot */}
          {n.status === 'unread' && !selectMode && (
            <div className="absolute top-4 left-1.5 sm:top-5 sm:left-2">
              <div className="w-2 h-2 bg-primary rounded-full shadow-[0_0_8px_rgba(37,99,235,0.5)]" />
            </div>
          )}

          {/* Icon */}
          <div className={clsx(
            "mt-0.5 p-2.5 rounded-xl flex-shrink-0 transition-all duration-300",
            n.status === 'unread'
              ? `${meta.bg} ${meta.border} border`
              : 'bg-gray-100'
          )}>
            <Icon className={clsx("w-4 h-4 sm:w-5 sm:h-5", n.status === 'unread' ? meta.color : 'text-gray-400')} />
          </div>

          {/* Content */}
          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-2">
              <div className="flex-1 min-w-0">
                {/* Type & Location */}
                <div className="flex flex-wrap items-center gap-1.5 mb-1.5">
                  <span className={clsx(
                    "text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md",
                    n.status === 'unread' ? `${meta.bg} ${meta.color}` : 'bg-gray-100 text-gray-400'
                  )}>
                    {meta.label}
                  </span>
                  <span className="text-gray-200">·</span>
                  <span className="text-[10px] font-medium text-gray-400 flex items-center gap-1">
                    <MapPin className="w-3 h-3" />
                    {getLocationName(n.location_id)}
                    {n.target_location_id && (
                      <>
                        <ArrowRight className="w-3 h-3 text-gray-300" />
                        {getLocationName(n.target_location_id)}
                      </>
                    )}
                  </span>
                </div>

                {/* Message */}
                <p className={clsx(
                  "text-sm leading-relaxed",
                  n.status === 'unread' ? 'text-gray-900 font-semibold' : 'text-gray-500'
                )}>
                  {n.message}
                </p>
              </div>

              {/* Time & actions */}
              <div className="flex items-center gap-2 flex-shrink-0">
                <span className="text-[10px] font-medium text-gray-400 whitespace-nowrap hidden sm:block">
                  {formatDistanceToNow(new Date(n.timestamp), { addSuffix: true })}
                </span>
                {!selectMode && (
                  <button
                    type="button"
                    title={isExpanded ? 'Collapse' : 'Expand'}
                    onClick={(e) => { e.stopPropagation(); setExpandedId(prev => prev === n.id ? null : n.id); }}
                    className="p-1 rounded-lg hover:bg-gray-100 text-gray-300 hover:text-gray-500 transition-colors"
                  >
                    {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                  </button>
                )}
              </div>
            </div>

            {/* Mobile time */}
            <div className="flex items-center gap-1.5 mt-1.5 sm:hidden">
              <Clock className="w-3 h-3 text-gray-300" />
              <span className="text-[10px] font-medium text-gray-400">
                {formatDistanceToNow(new Date(n.timestamp), { addSuffix: true })}
              </span>
            </div>
          </div>
        </div>

        {/* Expanded Detail Panel */}
        {isExpanded && !selectMode && (
          <div className="mx-4 sm:mx-5 mb-4 -mt-1 p-4 bg-gray-50 rounded-xl border border-gray-100 animate-in slide-in-from-top-2 duration-200">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-sm">
              <div>
                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">Full Timestamp</p>
                <p className="text-gray-700 font-medium">{format(new Date(n.timestamp), 'EEEE, MMM dd yyyy · hh:mm:ss a')}</p>
              </div>
              <div>
                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">Location</p>
                <div className="flex items-center gap-1.5 text-gray-700 font-medium">
                  <Globe2 className="w-3.5 h-3.5 text-gray-400" />
                  {getLocationName(n.location_id)}
                  {n.target_location_id && (
                    <>
                      <ArrowRight className="w-3.5 h-3.5 text-gray-400" />
                      {getLocationName(n.target_location_id)}
                    </>
                  )}
                </div>
              </div>
              <div>
                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">Status</p>
                <span className={clsx(
                  "inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-md",
                  n.status === 'unread' ? 'bg-blue-50 text-blue-600' : 'bg-gray-100 text-gray-500'
                )}>
                  {n.status === 'unread' ? <Eye className="w-3 h-3" /> : <EyeOff className="w-3 h-3" />}
                  {n.status === 'unread' ? 'Unread' : 'Read'}
                </span>
              </div>
            </div>
            <div className="mt-4 pt-3 border-t border-gray-200 flex items-center gap-2 justify-end">
              {n.status === 'unread' && (
                <button
                  onClick={() => markNotificationRead(n.id)}
                  className="text-xs font-semibold text-gray-500 hover:text-primary px-3 py-1.5 rounded-lg hover:bg-white transition-all flex items-center gap-1.5"
                >
                  <MailOpen className="w-3.5 h-3.5" /> Mark as Read
                </button>
              )}
              {isConfirmingDelete ? (
                <div className="flex items-center gap-2">
                  <span className="text-xs text-red-500 font-medium">Delete?</span>
                  <button
                    onClick={() => handleDelete(n.id)}
                    className="text-xs font-bold text-white bg-red-500 hover:bg-red-600 px-3 py-1.5 rounded-lg transition-colors"
                  >
                    Confirm
                  </button>
                  <button
                    onClick={() => setConfirmDeleteId(null)}
                    className="text-xs font-medium text-gray-500 hover:text-gray-700 px-2 py-1.5 rounded-lg hover:bg-white transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => setConfirmDeleteId(n.id)}
                  className="text-xs font-semibold text-gray-400 hover:text-red-500 px-3 py-1.5 rounded-lg hover:bg-red-50 transition-all flex items-center gap-1.5"
                >
                  <Trash2 className="w-3.5 h-3.5" /> Delete
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="max-w-[1000px] mx-auto space-y-5 lg:space-y-8 animate-in fade-in duration-500">
      {/* ─── Header ─────────────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-gray-900 flex items-center gap-2.5">
            <div className="p-2 bg-primary/10 rounded-xl text-primary">
              <Bell className="w-5 h-5" />
            </div>
            Notifications
            {unreadCount > 0 && (
              <span className="ml-1 text-xs font-bold bg-red-500 text-white px-2 py-0.5 rounded-full min-w-[22px] text-center">
                {unreadCount}
              </span>
            )}
          </h1>
          <p className="text-xs text-gray-400 mt-1 ml-[42px]">
            {role === 'super_admin' || role === 'admin'
              ? 'Global Operations Stream'
              : `Scoped Feed: ${getLocationName(userLocationId) || 'Shop'}`}
          </p>
        </div>
      </div>

      {/* ─── Stats Row ──────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-white rounded-xl border border-gray-100 p-3.5">
          <div className="flex items-center justify-between mb-2">
            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Unread</p>
            <Bell className={clsx("w-4 h-4", unreadCount > 0 ? "text-red-500" : "text-gray-300")} />
          </div>
          <p className={clsx("text-2xl font-bold tracking-tight", unreadCount > 0 ? 'text-red-500' : 'text-gray-900')}>{unreadCount}</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-100 p-3.5">
          <div className="flex items-center justify-between mb-2">
            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Total</p>
            <Activity className="w-4 h-4 text-blue-500" />
          </div>
          <p className="text-2xl font-bold text-gray-900 tracking-tight">{visibleNotifs.length}</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-100 p-3.5">
          <div className="flex items-center justify-between mb-2">
            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Low Stock</p>
            <AlertTriangle className="w-4 h-4 text-amber-500" />
          </div>
          <p className="text-2xl font-bold text-amber-500 tracking-tight">
            {visibleNotifs.filter(n => n.type === 'low_stock').length}
          </p>
        </div>
        {/* Type breakdown mini-bar */}
        <div className="bg-white rounded-xl border border-gray-100 p-3.5">
          <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-2.5">Breakdown</p>
          <div className="flex w-full h-2 rounded-full overflow-hidden bg-gray-100">
            {typeDistribution.map(d => (
              <div
                key={d.type}
                className={clsx(d.meta.bg, "transition-all duration-500")}
                style={{ width: `${d.pct}%` }}
                title={`${d.meta.label}: ${d.count} (${d.pct}%)`}
              />
            ))}
          </div>
          <div className="flex flex-wrap gap-x-2 gap-y-0.5 mt-2">
            {typeDistribution.slice(0, 3).map(d => (
              <span key={d.type} className="text-[9px] font-medium text-gray-400">
                <span className={clsx("inline-block w-1.5 h-1.5 rounded-full mr-1", d.meta.bg.replace('bg-', 'bg-'), d.meta.color.replace('text-', 'bg-'))} />
                {d.meta.label} {d.count}
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* ─── Search & Actions Bar ───────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
        {/* Search */}
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="Search notifications..."
            className="w-full pl-9 pr-8 py-2.5 text-sm bg-white border border-gray-200 rounded-xl focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all"
          />
          {searchQuery && (
            <button onClick={() => setSearchQuery('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* Action buttons */}
        <div className="flex items-center gap-2 flex-shrink-0">
          <button
            onClick={() => setShowOnlyUnread(v => !v)}
            className={clsx(
              "flex items-center gap-1.5 text-xs font-semibold px-3 py-2.5 rounded-xl border transition-all",
              showOnlyUnread
                ? 'bg-primary text-white border-primary shadow-sm'
                : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300'
            )}
          >
            {showOnlyUnread ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
            {showOnlyUnread ? 'Unread' : 'All'}
          </button>

          {unreadCount > 0 && (
            <button
              onClick={markAllRead}
              className="flex items-center gap-1.5 text-xs font-semibold px-3 py-2.5 rounded-xl border bg-white text-gray-600 border-gray-200 hover:border-emerald-300 hover:text-emerald-600 hover:bg-emerald-50 transition-all"
            >
              <CheckCheck className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Read All</span>
            </button>
          )}

          <button
            onClick={() => { setSelectMode(v => !v); if (selectMode) clearSelection(); }}
            className={clsx(
              "flex items-center gap-1.5 text-xs font-semibold px-3 py-2.5 rounded-xl border transition-all",
              selectMode
                ? 'bg-primary/10 text-primary border-primary/30'
                : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300'
            )}
          >
            <CheckCheck className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Select</span>
          </button>
        </div>
      </div>

      {/* ─── Bulk Actions Bar ───────────────────────────────────────────── */}
      {selectMode && selectedIds.size > 0 && (
        <div className="flex items-center gap-2 p-3 bg-primary/5 rounded-xl border border-primary/20 animate-in slide-in-from-top-2 duration-200">
          <span className="text-xs font-bold text-primary mr-1">{selectedIds.size} selected</span>
          <div className="h-4 w-px bg-primary/20" />
          <button onClick={selectAll} className="text-xs font-semibold text-primary hover:underline px-2 py-1">Select All</button>
          <button onClick={clearSelection} className="text-xs font-semibold text-gray-500 hover:underline px-2 py-1">Clear</button>
          <div className="flex-1" />
          <button
            onClick={handleMarkSelectedRead}
            className="text-xs font-semibold text-gray-600 hover:text-primary px-3 py-1.5 rounded-lg bg-white border border-gray-200 hover:border-primary/30 transition-all flex items-center gap-1.5"
          >
            <MailOpen className="w-3.5 h-3.5" /> Mark Read
          </button>
          {confirmBulkDelete ? (
            <div className="flex items-center gap-2">
              <span className="text-xs text-red-500 font-medium">Delete {selectedIds.size}?</span>
              <button onClick={handleBulkDelete} className="text-xs font-bold text-white bg-red-500 hover:bg-red-600 px-3 py-1.5 rounded-lg transition-colors">
                Confirm
              </button>
              <button onClick={() => setConfirmBulkDelete(false)} className="text-xs font-medium text-gray-500 px-2 py-1.5">
                Cancel
              </button>
            </div>
          ) : (
            <button
              onClick={() => setConfirmBulkDelete(true)}
              className="text-xs font-semibold text-red-500 hover:text-white hover:bg-red-500 px-3 py-1.5 rounded-lg border border-red-200 transition-all flex items-center gap-1.5"
            >
              <Trash2 className="w-3.5 h-3.5" /> Delete
            </button>
          )}
        </div>
      )}

      {/* ─── Filter Tabs ────────────────────────────────────────────────── */}
      <div className="flex gap-1.5 overflow-x-auto no-scrollbar pb-1">
        {tabs.map(tab => {
          const TabIcon = tab.icon;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={clsx(
                "flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-lg whitespace-nowrap transition-all",
                activeTab === tab.id
                  ? 'bg-primary text-white shadow-sm'
                  : 'bg-white text-gray-500 border border-gray-100 hover:border-gray-200 hover:text-gray-700'
              )}
            >
              <TabIcon className="w-3.5 h-3.5" />
              {tab.label}
              {tab.count > 0 && (
                <span className={clsx(
                  "text-[10px] font-bold px-1.5 py-0.5 rounded-md min-w-[18px] text-center",
                  activeTab === tab.id ? 'bg-white/20 text-white' : 'bg-gray-100 text-gray-400'
                )}>
                  {tab.count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* ─── Notification List ──────────────────────────────────────────── */}
      {filtered.length === 0 ? (
        <div className="py-20 text-center flex flex-col items-center bg-white rounded-2xl border border-gray-100">
          <div className="w-16 h-16 bg-gray-50 rounded-2xl flex items-center justify-center mb-4">
            <BellOff className="w-8 h-8 text-gray-200" />
          </div>
          <p className="font-bold text-gray-900 text-base">No Notifications</p>
          <p className="text-sm text-gray-400 mt-1.5 max-w-[260px]">
            {searchQuery
              ? `No results for "${searchQuery}"`
              : showOnlyUnread
                ? 'All caught up — no unread notifications.'
                : 'No alerts have been recorded yet.'}
          </p>
          {(searchQuery || showOnlyUnread) && (
            <button
              onClick={() => { setSearchQuery(''); setShowOnlyUnread(false); setActiveTab('all'); }}
              className="mt-4 text-xs font-semibold text-primary hover:underline"
            >
              Clear all filters
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-6">
          {(['today', 'yesterday', 'this_week', 'older'] as DateGroup[]).map(group => {
            const items = groupedNotifs[group];
            if (items.length === 0) return null;
            return (
              <div key={group}>
                {/* Date Group Header */}
                <div className="flex items-center gap-3 mb-3">
                  <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider">{DATE_GROUP_LABELS[group]}</h3>
                  <div className="flex-1 h-px bg-gray-100" />
                  <span className="text-[10px] font-medium text-gray-300">{items.length}</span>
                </div>
                {/* Notification Cards */}
                <div className="space-y-2">
                  {items.map(renderNotification)}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ─── Footer ─────────────────────────────────────────────────────── */}
      {filtered.length > 0 && (
        <div className="flex justify-center py-2">
          <p className="text-[10px] font-medium text-gray-300 uppercase tracking-widest">
            Showing {filtered.length} of {visibleNotifs.length} notifications
          </p>
        </div>
      )}
    </div>
  );
}
