import { useState, useMemo, useCallback, useRef, useEffect, memo } from 'react';
import {
  PackagePlus, Boxes, Search, Trash2, Plus,
  Truck, Tag, Globe2, Package, Store, Upload, FileText, X, AlertTriangle,
  Pencil, ChevronUp, ChevronDown, ChevronsUpDown, ChevronLeft, ChevronRight,
  Warehouse as WarehouseIcon, Filter, BarChart3, TrendingUp, ArrowUpDown, Settings, MapPin,
  History, CheckCircle, Edit3, Minus, RefreshCw, Eye, EyeOff, Printer
} from 'lucide-react';
import clsx from 'clsx';
import { db } from '../lib/firebase';
import { collection, doc, setDoc, updateDoc, writeBatch } from 'firebase/firestore';
import Modal from '../components/Modal';
import {
  useStore, COUNTRIES, CURRENCIES, toUSD, fromUSD, formatCurrency, formatInCurrency, formatDualCurrency, formatHistoricalDualCurrency,
  type Location, type Brand, type Item, type InventoryEntry, type ImportSession
} from '../store';
import { useAuthStore } from '../store/authStore';
import { exportInventorySystemData, exportInventoryToLedger, exportStockReport } from '../lib/bulkOperations';
import { generateBrandSKU, canonicalSKU } from '../lib/skuGenerator';
import { sortStockDistribution, sortLocationBreakdown } from '../lib/stockDistribution';
import { matchesItemSearch } from '../lib/searchUtils';

type ActiveTab = 'inventory' | 'containers' | 'brands' | 'items' | 'locations' | 'settings' | 'imports';
type SortField = 'name' | 'location' | 'category' | 'brand' | 'quantity' | 'avg_cost' | 'retail_price' | 'stock_health';
type SortDir = 'asc' | 'desc';

const PAGE_SIZES = [10, 25, 50, 100] as const;

// Helper component to drastically improve performance for imports > 100 items
const ImportPreviewRow = memo(({ item, idx, importCurrency, onUpdate, onRemove }: any) => {
  return (
    <tr className="bg-white hover:bg-blue-50/30 transition-colors">
      <td className="py-2 px-3">
        <input id={`imp-name-${idx}`} title="Item Name" placeholder="Item Name" className="bg-white border-gray-100 rounded border-0 hover:border p-1 text-[11px] w-full focus:ring-1 focus:ring-primary font-medium text-gray-900" 
          value={item.name} onChange={e => onUpdate(idx, 'name', e.target.value)} />
      </td>
      <td className="py-2 px-3">
        <input title="SKU" placeholder="Auto-SKU" className="bg-white border-gray-100 rounded border-0 hover:border p-1 text-[11px] w-full focus:ring-1 focus:ring-blue-400 text-gray-600" 
          value={item.sku} onChange={e => onUpdate(idx, 'sku', e.target.value)} />
      </td>
      <td className="py-2 px-3">
        <input title="Brand" placeholder="Brand" className="bg-white border-gray-100 rounded border-0 hover:border p-1 text-[11px] w-full focus:ring-1 focus:ring-blue-400 text-gray-600" 
          value={item.category} onChange={e => onUpdate(idx, 'category', e.target.value)} />
      </td>
      <td className="py-2 px-3 text-right">
        <input title="Quantity" placeholder="0" type="number" className="bg-white border-gray-100 rounded border-0 hover:border p-1 text-[11px] w-12 text-right focus:ring-1 focus:ring-primary font-bold text-primary" 
          value={item.qty} onChange={e => onUpdate(idx, 'qty', Number(e.target.value))} />
      </td>
      <td className="py-2 px-3 text-right">
        <input title="Unit Cost" placeholder="0" type="number" className="bg-white border-gray-100 rounded border-0 hover:border p-1 text-[11px] w-16 text-right focus:ring-1 focus:ring-gray-400 text-gray-600" 
          value={item.unitCost} onChange={e => onUpdate(idx, 'unitCost', Number(e.target.value))} />
      </td>
      <td className="py-2 px-3 text-right">
        <input title="Retail Price" placeholder="0" type="number" className="bg-white border-gray-100 rounded border-0 hover:border p-1 text-[11px] w-16 text-right focus:ring-1 focus:ring-emerald-400 text-emerald-600 font-bold" 
          value={item.retailPrice} onChange={e => onUpdate(idx, 'retailPrice', Number(e.target.value))} />
      </td>
      <td className="py-2 px-3 text-right">
        <input title="Min Stock Limit" placeholder="10" type="number" className="bg-white border-gray-100 rounded border-0 hover:border p-1 text-[11px] w-12 text-right focus:ring-1 focus:ring-orange-400 text-orange-600 font-bold" 
          value={item.minStockLimit === undefined ? '' : item.minStockLimit} onChange={e => onUpdate(idx, 'minStockLimit', Number(e.target.value))} />
      </td>
      <td className="py-2 px-3 text-center">
        <div className="flex items-center justify-center gap-2">
          <button 
            type="button"
            title="Edit Item Details" 
            onClick={() => document.getElementById(`imp-name-${idx}`)?.focus()}
            className="text-blue-400 hover:text-blue-600 p-1 hover:bg-blue-50 rounded transition-all"
          >
            <Pencil className="w-3 h-3" />
          </button>
          <button type="button" title="Remove item" onClick={() => onRemove(idx)} className="text-red-400 hover:text-red-600 p-1 hover:bg-red-50 rounded outline-none transition-all">
            <Trash2 className="w-3 h-3" />
          </button>
        </div>
      </td>
    </tr>
  );
});

export default function Warehouse() {
  const { appUser } = useAuthStore();
  const {
    locations, brands, items, inventory, containers, transactions, expenses,
    addLocation, deleteLocation, addBrand, deleteBrand, deleteItem, updateItem,
    addContainer, batchStockEntry, deleteStockEntry, deleteStockEntries,
    deleteItems, deleteContainers, deleteLocations, deleteBrands,
    clearMasterData, clearHistory, clearLocationStock,
    setImportModalOpen, importSessions, deleteImportSession, fixImportStock, createNotification
  } = useStore();

  const warehouses = locations.filter(l => l.type === 'warehouse');
  const [activeTab, setActiveTab] = useState<ActiveTab>('inventory');
  const [search, setSearch] = useState('');
  const [filterLocation, setFilterLocation] = useState('');
  const [filterCategory, setFilterCategory] = useState('');
  const [filterBrand, setFilterBrand] = useState('');
  const [filterStockStatus, setFilterStockStatus] = useState<'' | 'low' | 'healthy' | 'out'>('');
  const [saving, setSaving] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [selectedInventoryIds, setSelectedInventoryIds] = useState<Set<string>>(new Set());
  const [selectedItemIds, setSelectedItemIds] = useState<Set<string>>(new Set());
  const [selectedContainerIds, setSelectedContainerIds] = useState<Set<string>>(new Set());
  const [selectedLocationIds, setSelectedLocationIds] = useState<Set<string>>(new Set());
  const [selectedBrandIds, setSelectedBrandIds] = useState<Set<string>>(new Set());
  const [selectedPurgeLocation, setSelectedPurgeLocation] = useState('');

  // Sorting
  const [sortField, setSortField] = useState<SortField>('name');
  const [sortDir, setSortDir] = useState<SortDir>('asc');

  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState<number>(25);
  const [itemsPage, setItemsPage] = useState(1);
  const [brandsPage, setBrandsPage] = useState(1);
  const [containersPage, setContainersPage] = useState(1);
  const [locationsPage, setLocationsPage] = useState(1);

  // Show/hide advanced filters
  const [showFilters, setShowFilters] = useState(false);

  // ── Modals ──────────────────────────────────────────────────────────────────
  const [locationModal, setLocationModal] = useState(false);
  const [brandModal, setBrandModal] = useState(false);
  const [itemModal, setItemModal] = useState(false);
  const [transferModal, setTransferModal] = useState(false);
  const [onboardModal, setOnboardModal] = useState(false);
  const [addStockModal, setAddStockModal] = useState(false);
  const [deleteConfirmModal, setDeleteConfirmModal] = useState<{ isOpen: boolean; id?: string; name?: string; isBulk: boolean; tab?: ActiveTab }>({
    isOpen: false, isBulk: false
  });
  const [adjustInvoiceContainer, setAdjustInvoiceContainer] = useState<string | null>(null);
  const [adjustInvoiceItems, setAdjustInvoiceItems] = useState<{ transaction_id: string; name: string; original_qty: number; new_quantity: number }[]>([]);
  const [activeStep, setActiveStep] = useState(1);
  const [isExportModalOpen, setIsExportModalOpen] = useState(false);
  const [exportFilters, setExportFilters] = useState({ locationId: '', brandId: '', categoryId: '' });
  // Export All filter modal state
  const [exportAllModalOpen, setExportAllModalOpen] = useState(false);
  const [exportAllFilters, setExportAllFilters] = useState({ brandId: '', locationType: '' as '' | 'warehouse' | 'shop', locationId: '' });
  const [exportAllLoading, setExportAllLoading] = useState(false);
  const [addStockMode, setAddStockMode] = useState<'existing' | 'new'>('existing');
  const [addStockForm, setAddStockForm] = useState({
    // existing item mode
    item_id: '', location_id: '', quantity: 1, unit_cost: 0, currency: 'USD',
    // new item mode
    brand_id: '', brand_manual: '', item_name: '', category: '', sku: '', retail_price: 0, min_stock_limit: 0,
  });
  const [addStockManualBrand, setAddStockManualBrand] = useState(false);

  const [locationForm, setLocationForm] = useState({ name: '', type: 'warehouse' as 'warehouse' | 'shop', country: 'Zambia', currency: 'USD' });
  const [brandForm, setBrandForm] = useState({ name: '', origin_country: 'Zambia' });
  const [itemForm, setItemForm] = useState({ id: '', brand_id: '', name: '', category: '', sku: '', min_stock_limit: 0, avg_cost_USD: 0, retail_price: 0, stock: 0, inventory_id: '', location_id: '', brand_manual: '' });
  const [avgCostCurrency, setAvgCostCurrency] = useState<'USD' | 'ZMW'>('USD');
  // Independent display-currency selectors for the inventory table columns.
  // Defaults: Unit Cost in USD ($), Retail in ZMW (Kwacha).
  const [costDisplayCurrency, setCostDisplayCurrency] = useState<string>('USD');
  const [retailDisplayCurrency, setRetailDisplayCurrency] = useState<string>('ZMW');
  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [editingBrandId, setEditingBrandId] = useState<string | null>(null);
  const [isManualBrand, setIsManualBrand] = useState(false);

  const [transferForm, setTransferForm] = useState({
    from_location: '',
    to_location: '',
    item_id: '',
    quantity: 1,
    notes: '',
  });

  const [showQuickAddItem, setShowQuickAddItem] = useState(false);
  const [quickAddItemData, setQuickAddItemData] = useState({ brand_id: '', name: '', sku: '' });

  const [drillDownItemId, setDrillDownItemId] = useState<string | null>(null);
  const [isDrillDownOpen, setIsDrillDownOpen] = useState(false);
  const [expandedContainers, setExpandedContainers] = useState<Set<string>>(new Set());

  const toggleContainerExpanded = (id: string) => {
    setExpandedContainers(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // ── Import History State ────────────────────────────────────────────────────
  const [importHistorySearch, setImportHistorySearch] = useState('');
  const [viewItemsSession, setViewItemsSession] = useState<ImportSession | null>(null);
  const [selectedSession, setSelectedSession] = useState<ImportSession | null>(null);
  const [isFixModalOpen, setIsFixModalOpen] = useState(false);
  const [isFixModalMinimized, setIsFixModalMinimized] = useState(false);
  const [fixModalSearch, setFixModalSearch] = useState('');
  const [fixItems, setFixItems] = useState<{
    unique_id: string;
    item_id: string;
    item_name: string;
    sku: string;
    brand: string;
    invoiceQty: number;
    currentQty: number;
    originalReceivedQty: number;
    newReceivedQty: number;
    diff: number;
    itemDeleted?: boolean;
    stockRecordDeleted?: boolean;
    sessionItemIndex: number;
  }[]>([]);
  const [fixSaving, setFixSaving] = useState(false);
  const [deleteSessionConfirm, setDeleteSessionConfirm] = useState<string | null>(null);
  const [expandedSessions, setExpandedSessions] = useState<Record<string, boolean>>({});

  // ── Regenerate SKUs State ─────────────────────────────────────────────────
  const [regenSaving, setRegenSaving] = useState(false);


  const stockDistribution = useMemo(() => {
    if (!drillDownItemId) return null;
    const item = items.find(i => i.id === drillDownItemId);
    const distributions = locations.map(loc => {
      const qty = inventory
        .filter(e => e.item_id === drillDownItemId && e.location_id === loc.id)
        .reduce((sum, e) => sum + e.quantity, 0);
      return { ...loc, qty };
    }).filter(d => d.qty > 0);
    return { item, distributions: sortStockDistribution(distributions) };
  }, [drillDownItemId, inventory, items, locations]);

  const [onboardForm, setOnboardForm] = useState({
    container_no: '',
    source_country: 'China',
    total_cost: 0,
    currency: 'CNY',
    location_id: '',
    date: new Date().toISOString().split('T')[0],
    notes: '',
    rows: [{ 
      brand_name: '', 
      item_name: '', 
      sku: '', 
      category: '', 
      quantity: 1, 
      unit_cost: 0, 
      retail_price: 0,
      min_stock_limit: 0,
      matched_item_id: '' 
    }]
  });
  

  // Computed inventory table rows with sorting + filtering
  type RowType = InventoryEntry & { item: Item; loc: Location; brand: Brand | undefined; isLow: boolean; isOut: boolean; stockPct: number; profitMargin: number };

  // Build lookup maps for O(1) access (perf optimization for large datasets)
  const itemMap = useMemo(() => new Map(items.map(i => [i.id, i])), [items]);
  const locationMap = useMemo(() => new Map(locations.map(l => [l.id, l])), [locations]);
  const brandMap = useMemo(() => new Map(brands.map(b => [b.id, b])), [brands]);

  const allInventoryRows = useMemo((): RowType[] => {
    return inventory
      .map(entry => {
        const item = itemMap.get(entry.item_id);
        const loc = locationMap.get(entry.location_id);
        const brand = item ? brandMap.get(item.brand_id) : undefined;
        if (!item || !loc) return null;
        const minLimit = item.min_stock_limit ?? 0;
        const isOut = entry.quantity === 0;
        const isLow = !isOut && entry.quantity < minLimit;
        const stockPct = minLimit > 0 ? Math.min((entry.quantity / minLimit) * 100, 200) : 100;
        const profitMargin = item.retail_price && item.avg_cost_USD
          ? ((item.retail_price - item.avg_cost_USD) / item.retail_price) * 100
          : 0;
        return { ...entry, item, loc, brand, isLow, isOut, stockPct, profitMargin };
      })
      .filter(Boolean) as RowType[];
  }, [inventory, itemMap, locationMap, brandMap]);

  const inventoryRows = useMemo((): RowType[] => {
    let rows = allInventoryRows.filter(r => {
      const matchSearch = matchesItemSearch(
        [r.item.name, r.item.sku, r.brand?.name, r.item.category, r.loc.name],
        search
      );
      const matchLocation = !filterLocation || r.location_id === filterLocation;
      const matchCategory = !filterCategory || r.item.category === filterCategory;
      const matchBrand = !filterBrand || r.item.brand_id === filterBrand;
      return matchSearch && matchLocation && matchCategory && matchBrand;
    });

    if (!filterLocation) {
      // Group by item_id when "All Locations" is selected
      const grouped = new Map<string, RowType>();
      for (const r of rows) {
        if (!grouped.has(r.item_id)) {
          grouped.set(r.item_id, { 
            ...r, 
            quantity: 0, 
            avg_cost_USD: 0, 
            opening_balance: 0, 
            received_balance: 0, 
            supplied_balance: 0, 
            returned_balance: 0,
            loc: { ...r.loc, name: 'All Locations', id: 'all' } 
          });
        }
        const g = grouped.get(r.item_id)!;
        const totalQty = g.quantity + r.quantity;
        if (totalQty > 0) {
          g.avg_cost_USD = r.item.avg_cost_USD;
        }
        g.quantity = totalQty;
        g.opening_balance += r.opening_balance || 0;
        g.received_balance += r.received_balance || 0;
        g.supplied_balance += r.supplied_balance || 0;
        g.returned_balance += r.returned_balance || 0;
      }
      rows = Array.from(grouped.values());
      
      // Update computed fields for grouped rows
      for (const r of rows) {
        const minLimit = r.item.min_stock_limit ?? 0;
        r.isOut = r.quantity === 0;
        r.isLow = !r.isOut && r.quantity < minLimit;
        r.stockPct = minLimit > 0 ? Math.min((r.quantity / minLimit) * 100, 200) : 100;
        r.profitMargin = r.item.retail_price && r.item.avg_cost_USD
          ? ((r.item.retail_price - r.item.avg_cost_USD) / r.item.retail_price) * 100
          : 0;
      }
    }

    // Now filter by stock status (must be done AFTER grouping so total quantity is correct)
    rows = rows.filter(r => {
      if (!filterStockStatus) return true;
      if (filterStockStatus === 'low') return r.isLow;
      if (filterStockStatus === 'healthy') return !r.isLow && !r.isOut;
      if (filterStockStatus === 'out') return r.isOut;
      return true;
    });

    // Sort
    rows.sort((a, b) => {
      let cmp = 0;
      switch (sortField) {
        case 'name': cmp = a.item.name.localeCompare(b.item.name); break;
        case 'location': cmp = a.loc.name.localeCompare(b.loc.name); break;
        case 'category': cmp = a.item.category.localeCompare(b.item.category); break;
        case 'brand': cmp = (a.brand?.name || '').localeCompare(b.brand?.name || ''); break;
        case 'quantity': cmp = a.quantity - b.quantity; break;
        case 'avg_cost': cmp = (a.item.avg_cost_USD || 0) - (b.item.avg_cost_USD || 0); break;
        case 'retail_price': cmp = (a.item.retail_price || 0) - (b.item.retail_price || 0); break;
        case 'stock_health': cmp = a.stockPct - b.stockPct; break;
      }
      return sortDir === 'asc' ? cmp : -cmp;
    });

    return rows;
  }, [allInventoryRows, search, filterLocation, filterCategory, filterBrand, filterStockStatus, sortField, sortDir]);

  // Pagination for inventory
  const totalPages = Math.max(1, Math.ceil(inventoryRows.length / pageSize));
  const paginatedRows = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return inventoryRows.slice(start, start + pageSize);
  }, [inventoryRows, currentPage, pageSize]);

  // Reset page when filters change
  useEffect(() => { setCurrentPage(1); }, [search, filterLocation, filterCategory, filterBrand, filterStockStatus, sortField, sortDir, pageSize]);

  // Unique categories and brands from current inventory for filter chips
  const availableCategories = useMemo(() => {
    const cats = new Set(allInventoryRows.map(r => r.item.category));
    return Array.from(cats).sort();
  }, [allInventoryRows]);

  const availableBrands = useMemo(() => {
    const bs = new Map<string, string>();
    allInventoryRows.forEach(r => { if (r.brand) bs.set(r.brand.id, r.brand.name); });
    return Array.from(bs.entries()).sort((a, b) => a[1].localeCompare(b[1]));
  }, [allInventoryRows]);

  // Sort handler
  const toggleSort = useCallback((field: SortField) => {
    setSortField(prev => {
      if (prev === field) {
        setSortDir(d => d === 'asc' ? 'desc' : 'asc');
        return field;
      }
      setSortDir('asc');
      return field;
    });
  }, []);

  const SortIcon = ({ field }: { field: SortField }) => {
    if (sortField !== field) return <ChevronsUpDown className="w-3 h-3 text-gray-300" />;
    return sortDir === 'asc' ? <ChevronUp className="w-3 h-3 text-primary" /> : <ChevronDown className="w-3 h-3 text-primary" />;
  };

  // Active filter count
  const activeFilterCount = [filterBrand, filterStockStatus].filter(Boolean).length;

  const toggleInventoryAll = () => {
    const ids = paginatedRows.map(r => r.id);
    const allSelected = ids.length > 0 && ids.every(id => selectedInventoryIds.has(id));
    const next = new Set(selectedInventoryIds);
    if (allSelected) ids.forEach(id => next.delete(id));
    else ids.forEach(id => next.add(id));
    setSelectedInventoryIds(next);
  };

  const toggleItemAll = () => {
    const ids = paginatedItems.map(r => r.id);
    const allSelected = ids.length > 0 && ids.every(id => selectedItemIds.has(id));
    const next = new Set(selectedItemIds);
    if (allSelected) ids.forEach(id => next.delete(id));
    else ids.forEach(id => next.add(id));
    setSelectedItemIds(next);
  };

  const toggleContainerAll = () => {
    const ids = paginatedContainers.map(r => r.id);
    const allSelected = ids.length > 0 && ids.every(id => selectedContainerIds.has(id));
    const next = new Set(selectedContainerIds);
    if (allSelected) ids.forEach(id => next.delete(id));
    else ids.forEach(id => next.add(id));
    setSelectedContainerIds(next);
  };


  const toggleLocationAll = () => {
    const ids = paginatedLocations.map(r => r.id);
    const allSelected = ids.length > 0 && ids.every(id => selectedLocationIds.has(id));
    const next = new Set(selectedLocationIds);
    if (allSelected) ids.forEach(id => next.delete(id));
    else ids.forEach(id => next.add(id));
    setSelectedLocationIds(next);
  };

  const toggleBrandAll = () => {
    const ids = paginatedBrands.map(r => r.id);
    const allSelected = ids.length > 0 && ids.every(id => selectedBrandIds.has(id));
    const next = new Set(selectedBrandIds);
    if (allSelected) ids.forEach(id => next.delete(id));
    else ids.forEach(id => next.add(id));
    setSelectedBrandIds(next);
  };

  const toggleSelect = (set: Set<string>, setter: (s: Set<string>) => void, id: string) => {
    const next = new Set(set);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setter(next);
  };

  const handleBulkDelete = async () => {
    setDeleteConfirmModal({ isOpen: true, isBulk: true, name: `selected ${activeTab}`, tab: activeTab });
  };

  const executeBulkDelete = async () => {
    const { tab } = deleteConfirmModal;
    setSaving(true);
    setDeleteConfirmModal(f => ({ ...f, isOpen: false }));
    try {
      if (tab === 'inventory') {
        await deleteStockEntries(Array.from(selectedInventoryIds));
        setSelectedInventoryIds(new Set());
      } else if (tab === 'items') {
        await deleteItems(Array.from(selectedItemIds));
        setSelectedItemIds(new Set());
      } else if (tab === 'containers') {
        await deleteContainers(Array.from(selectedContainerIds));
        setSelectedContainerIds(new Set());
      } else if (tab === 'locations') {
        await deleteLocations(Array.from(selectedLocationIds));
        setSelectedLocationIds(new Set());
      } else if (tab === 'brands') {
        await deleteBrands(Array.from(selectedBrandIds));
        setSelectedBrandIds(new Set());
      }
      alert(`Successfully deleted selection.`);
    } catch (err: any) {
      alert("Bulk delete failed: " + err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteStock = (id: string, name: string) => {
    setDeleteConfirmModal({ isOpen: true, isBulk: false, id, name });
  };

  const executeSingleDelete = async () => {
    const { id, name, tab } = deleteConfirmModal;
    if (!id) return;
    setSaving(true);
    setDeleteConfirmModal(f => ({ ...f, isOpen: false }));
    try {
      if (tab === 'inventory') {
        await deleteStockEntry(id);
      } else if (tab === 'items') {
        await deleteItems([id]);
      } else if (tab === 'containers') {
        await deleteContainers([id]);
      } else if (tab === 'locations') {
        await deleteLocation(id);
      } else if (tab === 'brands') {
        await deleteBrand(id);
      } else {
        await deleteStockEntry(id);
      }
      alert(`Deleted ${name || 'item'} successfully.`);
    } catch (err: any) {
      alert("Deletion failed: " + err.message);
    } finally {
      setSaving(false);
    }
  };

  const totalItems = useMemo(() => inventoryRows.reduce((s, r) => s + (r.quantity || 0), 0), [inventoryRows]);
  const totalValue = useMemo(() => inventoryRows.reduce((s, r) => s + (r.quantity || 0) * (r.item.avg_cost_USD || 0), 0), [inventoryRows]);
  const lowCount = useMemo(() => inventoryRows.filter(r => r.isLow).length, [inventoryRows]);
  const outCount = useMemo(() => inventoryRows.filter(r => r.isOut).length, [inventoryRows]);
  const healthyCount = useMemo(() => inventoryRows.filter(r => !r.isLow && !r.isOut).length, [inventoryRows]);
  const totalRetailValue = useMemo(() => inventoryRows.reduce((s, r) => s + (r.quantity || 0) * (r.item.retail_price || 0), 0), [inventoryRows]);
  const potentialProfit = totalRetailValue - totalValue;

  // Tab counts
  const tabCounts = useMemo(() => ({
    inventory: inventory.length,
    containers: containers.length,
    items: items.length,
    brands: brands.length,
    locations: locations.length,
    imports: importSessions.length,
    settings: 0,
  }), [inventory.length, containers.length, items.length, brands.length, locations.length, importSessions.length]);

  // Items tab search
  const [itemsSearch, setItemsSearch] = useState('');
  const filteredItems = useMemo(() => {
    if (!itemsSearch) return items;
    return items.filter(i =>
      matchesItemSearch(
        [i.name, i.sku, i.category, brandMap.get(i.brand_id)?.name],
        itemsSearch
      )
    );
  }, [items, itemsSearch, brandMap]);

  // Brands tab search
  const [brandsSearch, setBrandsSearch] = useState('');
  const filteredBrands = useMemo(() => {
    if (!brandsSearch) return brands;
    const q = brandsSearch.toLowerCase();
    return brands.filter(b => b.name.toLowerCase().includes(q) || b.origin_country.toLowerCase().includes(q));
  }, [brands, brandsSearch]);

  // Pagination helpers for other tabs
  const paginatedItems = useMemo(() => {
    const start = (itemsPage - 1) * pageSize;
    return filteredItems.slice(start, start + pageSize);
  }, [filteredItems, itemsPage, pageSize]);

  const paginatedBrands = useMemo(() => {
    const start = (brandsPage - 1) * pageSize;
    return filteredBrands.slice(start, start + pageSize);
  }, [filteredBrands, brandsPage, pageSize]);

  const paginatedContainers = useMemo(() => {
    const start = (containersPage - 1) * pageSize;
    return containers.slice(start, start + pageSize);
  }, [containers, containersPage, pageSize]);

  const paginatedLocations = useMemo(() => {
    const start = (locationsPage - 1) * pageSize;
    return locations.slice(start, start + pageSize);
  }, [locations, locationsPage, pageSize]);

  // Calculate total stock per item across all locations
  const getTotalStockForItem = (itemId: string) => {
    return inventory.filter(e => e.item_id === itemId).reduce((sum, e) => sum + e.quantity, 0);
  };

  // Get location breakdown for an item
  const getItemLocations = (itemId: string) => {
    return sortLocationBreakdown(
      inventory
        .filter(e => e.item_id === itemId)
        .map(e => {
          const loc = locations.find(l => l.id === e.location_id);
          return { location: loc?.name, type: loc?.type, quantity: e.quantity };
        })
        .filter(l => l.location)
    );
  };

  const handleAddLocation = async (e: React.FormEvent) => {
    e.preventDefault(); setSaving(true);
    try { await addLocation(locationForm); setLocationModal(false); setLocationForm({ name: '', type: 'warehouse', country: 'Zambia', currency: 'USD' }); }
    finally { setSaving(false); }
  };

  const handleAddBrand = async (e: React.FormEvent) => {
    e.preventDefault(); setSaving(true);
    try { 
      if (editingBrandId) {
        await updateBrand(editingBrandId, brandForm);
      } else {
        await addBrand(brandForm); 
      }
      setBrandModal(false); 
      setEditingBrandId(null);
      setBrandForm({ name: '', origin_country: 'Zambia' }); 
    } catch (err: any) {
      alert("Failed to save brand: " + err.message);
    } finally { setSaving(false); }
  };

  const handleAddItem = async (e: React.FormEvent) => {
    e.preventDefault(); 
    setSaving(true);
    try {
      let finalBrandId = itemForm.brand_id;

      // Handle manual brand creation or resolution if requested
      if (isManualBrand && itemForm.brand_manual) {
        const manualName = itemForm.brand_manual.trim();
        const existingBrand = brands.find(b => b.name.toLowerCase() === manualName.toLowerCase());
        if (existingBrand) {
          finalBrandId = existingBrand.id;
        } else {
          finalBrandId = await addBrand({ name: manualName, origin_country: 'Zambia' });
        }
      }

      // Auto-generate brand-based SKU if empty
      if (!itemForm.sku) {
        const brandNameForSku = isManualBrand ? itemForm.brand_manual : (brands.find(b => b.id === finalBrandId)?.name ?? 'XX');
        const usedSkusSet = new Set(items.map(i => i.sku).filter(Boolean));
        itemForm.sku = generateBrandSKU(brandNameForSku, itemForm.name, usedSkusSet);
      }

      if (editingItemId) {
        // Prepare item data for master record (exclude inventory-specific fields)
        const { stock, inventory_id, id, location_id, brand_manual, retail_price, avg_cost_USD, ...itemData } = itemForm;
        const processedRetailPrice = toUSD(retail_price, 'ZMW');
        const processedAvgCost = avgCostCurrency === 'ZMW' ? toUSD(avg_cost_USD, 'ZMW') : avg_cost_USD;
        
        // Update item master data
        await updateItem(editingItemId, { ...itemData, retail_price: processedRetailPrice, avg_cost_USD: processedAvgCost, brand_id: finalBrandId });
        
        // Update inventory quantity and cost if this edit was triggered from an inventory row
        if (itemForm.inventory_id) {
          await updateDoc(doc(db, 'inventory', itemForm.inventory_id), { 
            quantity: itemForm.stock,
            avg_cost_USD: processedAvgCost
          });
        }
      } else {
        // Add new item
        const { id: _, stock, inventory_id, location_id, brand_manual, retail_price, avg_cost_USD, ...itemData } = itemForm;
        const processedRetailPrice = toUSD(retail_price, 'ZMW');
        const processedAvgCost = avgCostCurrency === 'ZMW' ? toUSD(avg_cost_USD, 'ZMW') : avg_cost_USD;

        const itemRef = doc(collection(db, 'items'));
        const newItemId = itemRef.id;
        
        // 1. Save Master Item Record
        await setDoc(itemRef, { 
          id: newItemId, 
          ...itemData, 
          retail_price: processedRetailPrice,
          avg_cost_USD: processedAvgCost,
          brand_id: finalBrandId 
        });

        // 2. If initial stock and location provided, seed the inventory
        if (itemForm.location_id && itemForm.stock > 0) {
          const invId = `${itemForm.location_id}_${newItemId}`;
          await setDoc(doc(db, 'inventory', invId), {
            id: invId,
            location_id: itemForm.location_id,
            item_id: newItemId,
            quantity: itemForm.stock,
            avg_cost_USD: processedAvgCost
          });

          // 3. Log initial transaction
          const txRef = doc(collection(db, 'transactions'));
          await setDoc(txRef, {
            id: txRef.id,
            type: 'stock_entry',
            from_location: 'direct_entry',
            to_location: itemForm.location_id,
            item_id: newItemId,
            item_name: itemForm.name,
            quantity: itemForm.stock,
            unit_cost: processedAvgCost,
            currency: 'USD',
            converted_value_USD: processedAvgCost * itemForm.stock,
            performed_by: appUser?.name || 'Admin',
            timestamp: new Date().toISOString()
          });
        }
      }
      
      setItemModal(false);
      setEditingItemId(null);
      setIsManualBrand(false);
      setItemForm({ id: '', brand_id: '', name: '', category: '', sku: '', min_stock_limit: 0, avg_cost_USD: 0, retail_price: 0, stock: 0, inventory_id: '', location_id: '', brand_manual: '' });
    } catch (err: any) {
      console.error("[Warehouse] Error saving item:", err);
      alert("Failed to save item: " + err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleOnboard = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!onboardForm.container_no || !onboardForm.location_id) return;
    setSaving(true);
    try {
      // 1. Create Container
      const convertedCost = toUSD(onboardForm.total_cost, onboardForm.currency);
      const containerId = await addContainer({
        container_no: onboardForm.container_no,
        source_country: onboardForm.source_country,
        total_cost: onboardForm.total_cost,
        currency: onboardForm.currency,
        converted_cost_USD: convertedCost,
        date: new Date(onboardForm.date).toISOString(),
        notes: onboardForm.notes,
        status: 'Pending',
      });

      // 2. Process Items in Batches
      // Identify and create missing items first
      for (const row of onboardForm.rows) {
        if (!row.matched_item_id) {
           let brand = brands.find(b => b.name.toLowerCase() === row.brand_name.toLowerCase());
           let brandId = brand?.id;
           if (!brandId) {
             brandId = await addBrand({ name: row.brand_name, origin_country: onboardForm.source_country });
           }
           const iRef = doc(collection(db, 'items'));
           const itemId = iRef.id;
           const usedSkusSet = new Set(items.map(i => i.sku).filter(Boolean));
           const autoSku = row.sku || generateBrandSKU(row.brand_name || 'Imported', row.item_name, usedSkusSet);
           await setDoc(iRef, {
             id: itemId, brand_id: brandId, name: row.item_name,
             sku: autoSku,
             category: row.category || 'General',
             retail_price: row.retail_price,
             min_stock_limit: row.min_stock_limit || 0
           });
           row.matched_item_id = itemId;
        } else {
           // Update existing item's retail_price and min_stock_limit if provided
           const updates: Partial<any> = {};
           if (row.retail_price) updates.retail_price = row.retail_price;
           if (row.min_stock_limit && row.min_stock_limit !== 0) updates.min_stock_limit = row.min_stock_limit;
           if (Object.keys(updates).length > 0) {
              await updateItem(row.matched_item_id, updates);
           }
        }
      }

      // Now batch all stock entries
      await batchStockEntry(
        onboardForm.rows.map(row => ({
          container_id: containerId,
          location_id: onboardForm.location_id,
          item_id: row.matched_item_id,
          item_name: row.item_name,
          quantity: row.quantity,
          unit_cost: row.unit_cost,
          currency: onboardForm.currency,
        })),
        appUser?.name ?? 'Admin',
        { isPending: true, skipNotifications: true }
      );

      // Generate a single consolidated notification
      const locName = locations.find(l => l.id === onboardForm.location_id)?.name ?? 'Warehouse';
      const totalItems = onboardForm.rows.reduce((acc, r) => acc + r.quantity, 0);
      const uniqueNames = Array.from(new Set(onboardForm.rows.map(r => r.item_name)));
      const summary = uniqueNames.length <= 2 ? uniqueNames.join(' and ') : `${uniqueNames.slice(0, 2).join(', ')} and ${uniqueNames.length - 2} other(s)`;
      
      await createNotification({
        type: 'stock_entry',
        location_id: onboardForm.location_id,
        message: `📦 Stock Onboarded: ${totalItems} units across ${onboardForm.rows.length} items (${summary}) added to ${locName} by ${appUser?.name ?? 'Admin'}.`,
        target_roles: ['super_admin', 'admin', 'warehouse_staff']
      });

      // Save Import Session for manual container onboarding so it shows up in Import History
      const sessionItems = onboardForm.rows.map(row => {
        const itemObj = items.find(i => i.id === row.matched_item_id);
        const brandObj = brands.find(b => b.id === (itemObj?.brand_id || row.brand_name));
        return {
          item_id: row.matched_item_id || row.item_name,
          item_name: row.item_name,
          sku: row.sku || itemObj?.sku || '',
          brand: brandObj?.name || row.brand_name || 'Manual',
          invoiceQty: row.quantity,
          receivedQty: row.quantity,
          unitCost: row.unit_cost,
          retailPrice: row.retail_price,
        };
      });

      await useStore.getState().saveImportSession({
        date: new Date(onboardForm.date).toISOString(),
        fileName: `Manual Onboarding: ${onboardForm.container_no}`,
        location_id: onboardForm.location_id,
        currency: onboardForm.currency,
        itemCount: onboardForm.rows.length,
        totalItems: onboardForm.rows.reduce((sum, r) => sum + r.quantity, 0),
        items: sessionItems,
        status: 'confirmed',
        container_id: containerId,
        performed_by: appUser?.name || 'Unknown',
      });

      setOnboardModal(false);
      setActiveStep(1);
      setOnboardForm({
        container_no: '', source_country: 'China', total_cost: 0, currency: 'CNY', location_id: '',
        date: new Date().toISOString().split('T')[0], notes: '',
        rows: [{ brand_name: '', item_name: '', sku: '', category: '', quantity: 1, unit_cost: 0, retail_price: 0, min_stock_limit: 0, matched_item_id: '' }]
      });
    } catch (err: any) {
      alert(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleTransfer = async (e: React.FormEvent) => {
    e.preventDefault();
    const item = items.find(i => i.id === transferForm.item_id);
    const sourceInv = inventory.find(e => e.location_id === transferForm.from_location && e.item_id === transferForm.item_id);
    if (!item || !sourceInv) return;

    if (transferForm.quantity > sourceInv.quantity) {
      alert(`Insufficient stock! You are trying to move ${transferForm.quantity}, but only ${sourceInv.quantity} units are available.`);
      return;
    }

    setSaving(true);
    try {
      await useStore.getState().executeTransferSession({
        from_location: transferForm.from_location,
        to_location: transferForm.to_location,
        items: [{ brand_id: item.brand_id, item_id: transferForm.item_id, quantity: transferForm.quantity }],
        notes: 'Direct transfer from Warehouse Management',
        performed_by: appUser?.name ?? 'Admin',
      });
      setTransferModal(false);
      setTransferForm({ from_location: '', to_location: '', item_id: '', quantity: 1, notes: '' });
    } catch (err: any) {
      alert(err.message);
    } finally {
      setSaving(false);
    }
  };

  const resetAddStockForm = () => {
    setAddStockForm({ item_id: '', location_id: '', quantity: 1, unit_cost: 0, currency: 'USD', brand_id: '', brand_manual: '', item_name: '', category: '', sku: '', retail_price: 0, min_stock_limit: 0 });
    setAddStockManualBrand(false);
    setAddStockMode('existing');
  };

  const handleAddStock = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!addStockForm.location_id || addStockForm.quantity <= 0) return;
    setSaving(true);
    try {
      let itemId = addStockForm.item_id;
      let itemName = '';

      if (addStockMode === 'new') {
        // Create brand if manual
        let finalBrandId = addStockForm.brand_id;
        if (addStockManualBrand && addStockForm.brand_manual.trim()) {
          finalBrandId = await addBrand({ name: addStockForm.brand_manual.trim(), origin_country: 'Zambia' });
        }
        if (!finalBrandId) { alert('Please select or enter a brand.'); setSaving(false); return; }

        // Create new item
        const itemRef = doc(collection(db, 'items'));
        itemId = itemRef.id;
        itemName = addStockForm.item_name;
        const usedSkusForNewItem = new Set(items.map(i => i.sku).filter(Boolean));
        const brandNameForSku = isManualBrand ? addStockForm.brand_manual : (brands.find(b => b.id === addStockForm.brand_id)?.name ?? 'XX');
        const autoSku = addStockForm.sku || generateBrandSKU(brandNameForSku, addStockForm.item_name, usedSkusForNewItem);
        await setDoc(itemRef, {
          id: itemId,
          brand_id: finalBrandId,
          name: addStockForm.item_name,
          sku: autoSku,
          category: addStockForm.category || 'General',
          retail_price: addStockForm.retail_price || 0,
          min_stock_limit: addStockForm.min_stock_limit || 0,
        });
      } else {
        const item = items.find(i => i.id === itemId);
        if (!item) { alert('Please select an item.'); setSaving(false); return; }
        itemName = item.name;
      }

      // Add stock entry
      await batchStockEntry([{
        container_id: 'manual_entry',
        location_id: addStockForm.location_id,
        item_id: itemId,
        item_name: itemName,
        quantity: addStockForm.quantity,
        unit_cost: addStockForm.unit_cost,
        currency: addStockForm.currency,
      }], appUser?.name ?? 'Admin');

      // Save Import Session for manual add stock so it shows up in Import History
      const itemObj = items.find(i => i.id === itemId);
      const brandObj = brands.find(b => b.id === (itemObj?.brand_id || addStockForm.brand_id));
      const sessionItems = [{
        item_id: itemId,
        item_name: itemName,
        sku: addStockForm.sku || itemObj?.sku || '',
        brand: brandObj?.name || addStockForm.brand_manual || 'Manual',
        invoiceQty: addStockForm.quantity,
        receivedQty: addStockForm.quantity,
        unitCost: addStockForm.unit_cost,
        retailPrice: addStockForm.retail_price || itemObj?.retail_price || 0,
      }];

      await useStore.getState().saveImportSession({
        date: new Date().toISOString(),
        fileName: `Manual Add Stock: ${itemName}`,
        location_id: addStockForm.location_id,
        currency: addStockForm.currency,
        itemCount: 1,
        totalItems: addStockForm.quantity,
        items: sessionItems,
        status: 'confirmed',
        container_id: 'manual_entry',
        performed_by: appUser?.name || 'Unknown',
      });

      setAddStockModal(false);
      resetAddStockForm();
    } catch (err: any) {
      alert('Failed to add stock: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  const openAdjustInvoiceModal = (containerId: string) => {
    const txs = useStore.getState().transactions.filter(t => t.container_id === containerId && t.type === 'stock_entry');
    setAdjustInvoiceItems(txs.map(t => ({
      transaction_id: t.id,
      name: t.item_name,
      original_qty: t.quantity,
      new_quantity: t.quantity
    })));
    setAdjustInvoiceContainer(containerId);
  };

  const handleAdjustInvoiceSave = async () => {
    if (!adjustInvoiceContainer) return;
    setSaving(true);
    try {
      await useStore.getState().adjustInvoiceStock(adjustInvoiceContainer, adjustInvoiceItems);
      alert('Invoice discrepancies resolved and stock adjusted successfully.');
      setAdjustInvoiceContainer(null);
    } catch (err: any) {
      alert('Failed to adjust invoice: ' + err.message);
    } finally {
      setSaving(false);
    }
  };







  const tabs: { key: ActiveTab; label: string; icon: React.ElementType }[] = [
    { key: 'inventory', label: 'Inventory', icon: Boxes },
    { key: 'containers', label: 'Containers', icon: Truck },
    { key: 'items', label: 'Items', icon: Package },
    { key: 'brands', label: 'Brands', icon: Tag },
    { key: 'locations', label: 'Locations', icon: MapPin },
    { key: 'imports', label: 'Import History', icon: History },
    { key: 'settings', label: 'Settings', icon: Settings },
  ];

  // ── Open Fix Stock Modal ──────────────────────────────────────────────────
  const openFixModal = (session: ImportSession) => {
    setSelectedSession(session);
    setFixModalSearch('');
    const rows = session.items.map((si, idx) => {
      const itemExists = items.some(it => it.id === si.item_id);
      const invEntry = inventory.find(e => e.item_id === si.item_id && e.location_id === session.location_id);
      const current = invEntry?.quantity ?? 0;
      return {
        unique_id: `${si.item_id}_${idx}`,
        item_id: si.item_id,
        item_name: si.item_name,
        sku: si.sku,
        brand: si.brand,
        invoiceQty: si.invoiceQty,
        currentQty: current,
        originalReceivedQty: si.receivedQty,
        newReceivedQty: si.receivedQty,
        diff: 0,
        itemDeleted: !itemExists,
        stockRecordDeleted: !invEntry,
        sessionItemIndex: idx,
      };
    });
    setFixItems(rows);
    setIsFixModalOpen(true);
    setIsFixModalMinimized(false);
  };

  const handleFixQtyChange = (uniqueId: string, val: number) => {
    setFixItems(prev => {
      return prev.map(row => {
        if (row.unique_id !== uniqueId) return row;
        return {
          ...row,
          newReceivedQty: val,
          diff: val - row.originalReceivedQty
        };
      });
    });
  };

  const handleApplyFixes = async () => {
    if (!selectedSession) return;
    const changed = fixItems.filter(r => r.diff !== 0);
    if (changed.length === 0) { setIsFixModalOpen(false); setIsFixModalMinimized(false); return; }
    setFixSaving(true);
    try {
      await fixImportStock(
        selectedSession.id,
        changed.map(r => ({
          item_id: r.item_id,
          location_id: selectedSession.location_id,
          newQty: r.newReceivedQty,
          sessionItemIndex: r.sessionItemIndex
        }))
      );
      alert(`✅ Import stocks reconciled! ${changed.length} item(s) adjusted.`);
      setIsFixModalOpen(false);
      setIsFixModalMinimized(false);
    } catch (err: any) {
      alert('Fix failed: ' + err.message);
    } finally {
      setFixSaving(false);
    }
  };

  const filteredFixItems = useMemo(() => {
    const q = fixModalSearch.trim().toLowerCase();
    if (!q) return fixItems;
    return fixItems.filter(item => 
      item.item_name.toLowerCase().includes(q) ||
      item.brand.toLowerCase().includes(q) ||
      (item.sku && item.sku.toLowerCase().includes(q))
    );
  }, [fixItems, fixModalSearch]);

  // ── Regenerate SKUs: Bulk ─────────────────────────────────────────────────
  const handleRegenAllSKUs = async () => {
    if (!window.confirm(
      `This will regenerate SKUs for ALL ${items.length} items based on their brand name + item name.\n\nFormat: BRAND_PREFIX-ITEM_CODE (e.g. CP-LJ for Chinese Panda Leather Jacket)\n\nExisting manual SKUs in the import file will be kept. Continue?`
    )) return;
    setRegenSaving(true);
    try {
      const usedSkus = new Set<string>();
      const CHUNK = 200;
      let batch = writeBatch(db);
      let opCount = 0;

      for (const it of items) {
        const brand = brands.find(b => b.id === it.brand_id);
        const newSku = generateBrandSKU(brand?.name ?? 'XX', it.name, usedSkus, it.sku);
        usedSkus.add(newSku);
        if (opCount >= CHUNK) {
          await batch.commit();
          batch = writeBatch(db);
          opCount = 0;
        }
        batch.update(doc(db, 'items', it.id), { sku: newSku });
        opCount++;
      }
      if (opCount > 0) await batch.commit();
      alert(`✅ SKUs regenerated for ${items.length} items!`);
    } catch (err: any) {
      alert('Regeneration failed: ' + err.message);
    } finally {
      setRegenSaving(false);
    }
  };

  // ── Regenerate SKU: Single item ───────────────────────────────────────────
  const handleRegenSingleSKU = async (item: Item) => {
    const brand = brands.find(b => b.id === item.brand_id);
    const usedSkus = new Set<string>(items.filter(i => i.id !== item.id).map(i => i.sku).filter(Boolean));
    const newSku = generateBrandSKU(brand?.name ?? 'XX', item.name, usedSkus, item.sku);
    if (newSku === item.sku) { alert(`SKU is already correct: ${newSku}`); return; }
    if (!window.confirm(`Regenerate SKU for "${item.name}"?\n\nCurrent: ${item.sku}\nNew:     ${newSku}`)) return;
    try {
      await updateItem(item.id, { sku: newSku });
    } catch (err: any) {
      alert('Failed: ' + err.message);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 tracking-tight">Warehouse</h1>
          <p className="text-xs sm:text-sm text-gray-400 mt-1 uppercase tracking-widest font-semibold flex items-center gap-2">
            <Globe2 className="w-3.5 h-3.5" /> Global Chain Nodes: {locations.length}
          </p>
        </div>
        <div className="flex flex-col sm:flex-row gap-2 sm:items-center">
          <button 
            disabled={exporting || exportAllLoading}
            onClick={() => { setExportAllFilters({ brandId: '', locationType: '', locationId: '' }); setExportAllModalOpen(true); }}
            className="btn-secondary flex items-center gap-2 text-sm justify-center border-emerald-200 hover:bg-emerald-50 hover:text-emerald-600 transition-all font-bold disabled:opacity-50"
          >
            <FileText className="w-4 h-4" />
            <span className="whitespace-nowrap">{exportAllLoading ? 'Exporting...' : 'Export All'}</span>
          </button>

          {filterLocation && (
            <>
              <button
                disabled={exporting}
                onClick={async () => {
                  setExporting(true);
                  try {
                    await exportInventoryToLedger({
                      locationId: filterLocation,
                      locations, items, brands,
                      inventory,
                      transactions: useStore.getState().transactions,
                      sales: useStore.getState().sales,
                      returns: useStore.getState().returns
                    });
                  } catch (err: any) {
                    alert('Ledger export failed: ' + err.message);
                  } finally {
                    setExporting(false);
                  }
                }}
                className="btn-secondary flex items-center gap-2 text-sm justify-center border-blue-200 hover:bg-blue-50 hover:text-blue-600 transition-all font-bold disabled:opacity-50"
              >
                <FileText className="w-4 h-4" />
                <span className="whitespace-nowrap">Ledger Export (Filtered)</span>
              </button>
              <div className="flex bg-white rounded-lg shadow-sm border border-purple-200 overflow-hidden text-sm">
                <button
                  disabled={exporting}
                  onClick={async () => {
                    setExporting(true);
                    try {
                      await exportStockReport({
                        locationId: filterLocation,
                        inventory, items, brands, locations,
                        transactions: useStore.getState().transactions,
                        sales: useStore.getState().sales,
                        returns: useStore.getState().returns,
                        format: 'excel'
                      });
                    } catch (err: any) {
                      alert('Stock report export failed: ' + err.message);
                    } finally {
                      setExporting(false);
                    }
                  }}
                  className="flex items-center gap-2 px-3 py-2 bg-purple-50 hover:bg-purple-100 text-purple-700 font-bold transition-all disabled:opacity-50"
                  title="Download as Excel File"
                >
                  <FileText className="w-4 h-4" />
                  <span className="whitespace-nowrap">Report (Excel)</span>
                </button>
                <div className="w-[1px] bg-purple-200"></div>
                <button
                  disabled={exporting}
                  onClick={async () => {
                    setExporting(true);
                    try {
                      await exportStockReport({
                        locationId: filterLocation,
                        inventory, items, brands, locations,
                        transactions: useStore.getState().transactions,
                        sales: useStore.getState().sales,
                        returns: useStore.getState().returns,
                        format: 'pdf'
                      });
                    } catch (err: any) {
                      alert('Stock report PDF failed: ' + err.message);
                    } finally {
                      setExporting(false);
                    }
                  }}
                  className="flex items-center gap-2 px-3 py-2 bg-rose-50 hover:bg-rose-100 text-rose-700 font-bold transition-all disabled:opacity-50"
                  title="Generate Printable PDF"
                >
                  <FileText className="w-4 h-4" />
                  <span className="whitespace-nowrap">(PDF)</span>
                </button>
              </div>
            </>
          )}

          <button onClick={() => setAddStockModal(true)} className="btn-secondary flex items-center gap-2 text-sm justify-center border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 transition-all font-bold">
            <Plus className="w-4 h-4" />
            <span className="whitespace-nowrap">Add Stock</span>
          </button>
          <button onClick={() => setImportModalOpen(true)} className="btn-secondary flex items-center gap-2 text-sm justify-center border-primary/20 hover:bg-primary/5 hover:text-primary transition-all">
            <PackagePlus className="w-4 h-4 text-primary" />
            <span className="whitespace-nowrap">Import Excel</span>
          </button>
          <button onClick={() => { setActiveStep(1); setOnboardModal(true); }} className="btn-primary flex items-center gap-2 text-sm justify-center shadow-lg shadow-primary/20">
            <PackagePlus className="w-4 h-4" />
            <span className="whitespace-nowrap">Onboard Container</span>
          </button>
        </div>
      </div>

      {/* KPI Strip */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <div className="bg-white rounded-2xl border border-gray-100 p-4 sm:p-5 shadow-sm hover:shadow-md transition-all">
          <div className="flex items-center justify-between">
            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Total Units</p>
            <div className="w-8 h-8 rounded-lg bg-blue-50 flex items-center justify-center text-primary">
              <Boxes className="w-4 h-4" />
            </div>
          </div>
          <p className="text-2xl sm:text-3xl font-extrabold text-gray-900 mt-2">{totalItems.toLocaleString()}</p>
          <div className="h-1.5 w-full bg-gray-50 rounded-full mt-3 overflow-hidden">
            <div className="h-full bg-primary rounded-full transition-all" style={{ width: `${healthyCount > 0 ? Math.round((healthyCount / Math.max(inventoryRows.length, 1)) * 100) : 0}%` }} />
          </div>
          <p className="text-[10px] text-gray-400 mt-2 font-medium">{inventoryRows.length} entries · {healthyCount} healthy</p>
        </div>
        <div className="bg-white rounded-2xl border border-gray-100 p-4 sm:p-5 shadow-sm hover:shadow-md transition-all">
          <div className="flex items-center justify-between">
            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Cost Value</p>
            <div className="w-8 h-8 rounded-lg bg-emerald-50 flex items-center justify-center text-emerald-600">
              <Tag className="w-4 h-4" />
            </div>
          </div>
          <p className="text-2xl sm:text-3xl font-extrabold text-gray-900 mt-2">{formatCurrency(totalValue)}</p>
          <p className="text-[10px] text-gray-400 mt-5 font-medium flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" /> At average cost
          </p>
        </div>
        <div className="bg-white rounded-2xl border border-gray-100 p-4 sm:p-5 shadow-sm hover:shadow-md transition-all">
          <div className="flex items-center justify-between">
            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Potential Profit</p>
            <div className="w-8 h-8 rounded-lg bg-violet-50 flex items-center justify-center text-violet-600">
              <TrendingUp className="w-4 h-4" />
            </div>
          </div>
          <p className={clsx("text-2xl sm:text-3xl font-extrabold mt-2", potentialProfit > 0 ? 'text-violet-600' : 'text-gray-900')}>{formatCurrency(potentialProfit)}</p>
          <p className="text-[10px] text-gray-400 mt-5 font-medium">Retail − Cost on current stock</p>
        </div>
        <div 
          className={clsx(
            "bg-white rounded-2xl border p-4 sm:p-5 shadow-sm hover:shadow-md transition-all cursor-pointer",
            filterStockStatus === 'out' ? "border-red-500 ring-2 ring-red-500/20" : "border-gray-100"
          )}
          onClick={() => {
            setActiveTab('inventory');
            setFilterStockStatus(prev => prev === 'out' ? '' : 'out');
          }}
        >
          <div className="flex items-center justify-between">
            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Stock Alerts</p>
            <div className={clsx("w-8 h-8 rounded-lg flex items-center justify-center", (lowCount + outCount) > 0 ? "bg-red-50 text-red-500 animate-pulse" : "bg-gray-50 text-gray-400")}>
              <AlertTriangle className="w-4 h-4" />
            </div>
          </div>
          <p className={clsx("text-2xl sm:text-3xl font-extrabold mt-2", (lowCount + outCount) > 0 ? 'text-red-500' : 'text-gray-900')}>{lowCount + outCount}</p>
          <div className="flex items-center gap-2 mt-3">
            {lowCount > 0 && <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700">{lowCount} Low</span>}
            {outCount > 0 && <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-red-100 text-red-700">{outCount} Out</span>}
            {lowCount + outCount === 0 && <span className="text-[10px] text-gray-400 font-medium">All stock levels healthy</span>}
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden flex flex-col">
        <div className="flex border-b border-gray-100 overflow-x-auto no-scrollbar">
          {tabs.map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              onClick={() => setActiveTab(key)}
              className={clsx(
                "flex items-center gap-2 px-4 sm:px-6 py-4 text-sm font-semibold whitespace-nowrap transition-all border-b-2",
                activeTab === key
                  ? 'border-primary text-primary bg-primary/[0.02]'
                  : 'border-transparent text-gray-500 hover:text-gray-900 hover:bg-gray-50/50'
              )}
            >
              <Icon className={clsx("w-4 h-4", activeTab === key ? "text-primary" : "text-gray-400")} />
              {label}
              <span className={clsx(
                "text-[10px] font-bold px-1.5 py-0.5 rounded-full min-w-[20px] text-center",
                activeTab === key ? 'bg-primary/10 text-primary' : 'bg-gray-100 text-gray-400'
              )}>
                {tabCounts[key]}
              </span>
            </button>
          ))}
        </div>

        {/* ── Inventory Tab ── */}
        {activeTab === 'inventory' && (
          <div className="flex flex-col">
            {/* Primary Search Bar */}
            <div className="p-4 sm:p-5 flex flex-col sm:flex-row gap-3 border-b border-gray-50">
              <div className="relative flex-1">
                <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input value={search} onChange={e => setSearch(e.target.value)}
                  placeholder="Search item, SKU, category, brand, location..." className="input-field pl-10 h-11" />
              </div>
              <select title="Filter by Location" value={filterLocation} onChange={e => setFilterLocation(e.target.value)} className="input-field bg-white h-11 sm:max-w-[200px]">
                <option value="">All Locations</option>
                {locations.map(l => <option key={l.id} value={l.id}>{l.name} ({l.type})</option>)}
              </select>
              <button
                type="button"
                onClick={() => setShowFilters(!showFilters)}
                className={clsx(
                  "flex items-center gap-2 h-11 px-4 text-xs font-bold rounded-xl border transition-all",
                  showFilters || activeFilterCount > 0
                    ? 'bg-primary/5 border-primary/20 text-primary'
                    : 'bg-white border-gray-200 text-gray-500 hover:text-gray-700 hover:border-gray-300'
                )}
              >
                <Filter className="w-4 h-4" />
                Filters
                {activeFilterCount > 0 && (
                  <span className="w-5 h-5 rounded-full bg-primary text-white text-[10px] flex items-center justify-center font-bold">{activeFilterCount}</span>
                )}
              </button>
              {selectedInventoryIds.size > 0 && (
                <button
                  onClick={handleBulkDelete}
                  disabled={saving}
                  className="btn-secondary text-red-600 border-red-100 bg-red-50 hover:bg-red-100 flex items-center gap-2 h-11 px-6 animate-in fade-in zoom-in duration-200 disabled:opacity-50"
                >
                  {saving ? (
                    <div className="w-4 h-4 border-2 border-red-600 border-t-transparent rounded-full animate-spin" />
                  ) : (
                    <Trash2 className="w-4 h-4" />
                  )}
                  {saving ? 'Deleting...' : `Delete Selected (${selectedInventoryIds.size})`}
                </button>
              )}
            </div>

            {/* Brand Quick Filter Chips */}
            {availableBrands.length > 0 && (
              <div className="px-4 sm:px-5 py-2.5 border-b border-gray-50 flex items-center gap-2 overflow-x-auto no-scrollbar">
                <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider whitespace-nowrap flex-shrink-0">Brands:</span>
                <button
                  type="button"
                  onClick={() => setFilterBrand('')}
                  className={clsx(
                    "px-3 py-1.5 rounded-full text-[11px] font-bold whitespace-nowrap transition-all flex-shrink-0 border",
                    !filterBrand
                      ? 'bg-gray-900 text-white border-gray-900'
                      : 'bg-white text-gray-600 border-gray-200 hover:border-gray-400 hover:text-gray-800'
                  )}
                >
                  All
                </button>
                {availableBrands.map(([id, name]) => {
                  const count = allInventoryRows.filter(r => r.item.brand_id === id).length;
                  return (
                    <button
                      key={id}
                      type="button"
                      onClick={() => setFilterBrand(filterBrand === id ? '' : id)}
                      className={clsx(
                        "px-3 py-1.5 rounded-full text-[11px] font-bold whitespace-nowrap transition-all flex-shrink-0 border flex items-center gap-1.5",
                        filterBrand === id
                          ? 'bg-primary text-white border-primary shadow-sm'
                          : 'bg-white text-gray-600 border-gray-200 hover:border-primary/40 hover:text-primary hover:bg-primary/5'
                      )}
                    >
                      {name}
                      <span className={clsx(
                        "text-[9px] px-1.5 py-0.5 rounded-full font-bold",
                        filterBrand === id ? 'bg-white/20 text-white' : 'bg-gray-100 text-gray-500'
                      )}>{count}</span>
                    </button>
                  );
                })}
              </div>
            )}

            {/* Advanced Filters Panel */}
            {showFilters && (
              <div className="px-4 sm:px-5 pb-4 border-b border-gray-50 animate-in fade-in slide-in-from-top-2 duration-200">
                <div className="bg-gray-50 rounded-xl p-4 space-y-3">
                  <div className="flex flex-wrap gap-3">
                    <div className="flex-1 min-w-[140px]">
                      <label className="text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-1.5 block">Brand</label>
                      <select title="Filter by Brand" value={filterBrand} onChange={e => setFilterBrand(e.target.value)} className="input-field bg-white h-9 text-xs">
                        <option value="">All Brands</option>
                        {availableBrands.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
                      </select>
                    </div>
                    <div className="flex-1 min-w-[140px]">
                      <label className="text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-1.5 block">Stock Status</label>
                      <select title="Filter by Stock Status" value={filterStockStatus} onChange={e => setFilterStockStatus(e.target.value as any)} className="input-field bg-white h-9 text-xs">
                        <option value="">All Status</option>
                        <option value="healthy">Good Stock</option>
                        <option value="low">Refill Soon</option>
                        <option value="out">Out of Stock</option>
                      </select>
                    </div>
                  </div>
                  {activeFilterCount > 0 && (
                    <div className="flex items-center justify-between pt-2 border-t border-gray-200/50">
                      <p className="text-[10px] text-gray-500 font-medium">{inventoryRows.length} results match filters</p>
                      <button
                        type="button"
                        onClick={() => { setFilterBrand(''); setFilterStockStatus(''); }}
                        className="text-[10px] font-bold text-red-500 hover:text-red-700 uppercase tracking-wider"
                      >
                        Clear All Filters
                      </button>
                    </div>
                  )}
                </div>
              </div>
            )}
            
            {/* Desktop Table View */}
            <div className="hidden lg:block table-container border-0 rounded-none shadow-none">
              <table className="w-full text-sm text-left min-w-[1000px]">
                <thead className="bg-gray-50 text-xs uppercase text-gray-500">
                  <tr>
                    <th className="px-4 py-3 w-10">
                      <input
                        type="checkbox"
                        title="Select All"
                        className="rounded border-gray-300 text-primary focus:ring-primary w-4 h-4 cursor-pointer"
                        checked={paginatedRows.length > 0 && paginatedRows.every(r => selectedInventoryIds.has(r.id))}
                        onChange={toggleInventoryAll}
                      />
                    </th>
                    <th className="px-4 py-3 font-medium cursor-pointer select-none hover:text-gray-700 transition-colors" onClick={() => toggleSort('name')}>
                      <span className="flex items-center gap-1">Item <SortIcon field="name" /></span>
                    </th>
                    <th className="px-4 py-3 font-medium cursor-pointer select-none hover:text-gray-700 transition-colors" onClick={() => toggleSort('location')}>
                      <span className="flex items-center gap-1">Location <SortIcon field="location" /></span>
                    </th>
                    <th className="px-4 py-3 font-medium cursor-pointer select-none hover:text-gray-700 transition-colors" onClick={() => toggleSort('brand')}>
                      <span className="flex items-center gap-1">Brand <SortIcon field="brand" /></span>
                    </th>
                    <th className="px-4 py-3 font-medium cursor-pointer select-none hover:text-gray-700 transition-colors" onClick={() => toggleSort('stock_health')}>
                      <span className="flex items-center gap-1 justify-end">Stock Level <SortIcon field="stock_health" /></span>
                    </th>
                    <th className="px-4 py-3 font-medium text-right cursor-pointer select-none hover:text-gray-700 transition-colors" onClick={() => toggleSort('quantity')}>
                      <span className="flex items-center gap-1 justify-end">Qty <SortIcon field="quantity" /></span>
                    </th>
                    <th className="px-4 py-3 font-medium text-right">
                      <div className="flex items-center gap-1.5 justify-end">
                        <span className="flex items-center gap-1 cursor-pointer select-none hover:text-gray-700 transition-colors" onClick={() => toggleSort('avg_cost')}>Unit Cost <SortIcon field="avg_cost" /></span>
                        <select
                          title="Unit Cost display currency"
                          value={costDisplayCurrency}
                          onChange={e => setCostDisplayCurrency(e.target.value)}
                          onClick={e => e.stopPropagation()}
                          className="text-[10px] font-bold uppercase bg-gray-50 border border-gray-200 rounded px-1 py-0.5 text-gray-600 focus:ring-1 focus:ring-primary cursor-pointer"
                        >
                          {CURRENCIES.map(c => <option key={c} value={c}>{c}</option>)}
                        </select>
                      </div>
                    </th>
                    <th className="px-4 py-3 font-medium text-right">
                      <div className="flex items-center gap-1.5 justify-end">
                        <span className="flex items-center gap-1 cursor-pointer select-none hover:text-gray-700 transition-colors" onClick={() => toggleSort('retail_price')}>Retail <SortIcon field="retail_price" /></span>
                        <select
                          title="Retail display currency"
                          value={retailDisplayCurrency}
                          onChange={e => setRetailDisplayCurrency(e.target.value)}
                          onClick={e => e.stopPropagation()}
                          className="text-[10px] font-bold uppercase bg-emerald-50 border border-emerald-200 rounded px-1 py-0.5 text-emerald-700 focus:ring-1 focus:ring-emerald-400 cursor-pointer"
                        >
                          {CURRENCIES.map(c => <option key={c} value={c}>{c}</option>)}
                        </select>
                      </div>
                    </th>
                    <th className="px-4 py-3 font-medium text-center">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50 bg-white">
                  {paginatedRows.length === 0 ? (
                    <tr><td colSpan={9} className="px-5 py-16 text-center">
                      <div className="flex flex-col items-center gap-3">
                        <div className="w-16 h-16 bg-gray-50 rounded-2xl flex items-center justify-center">
                          <Boxes className="w-8 h-8 text-gray-300" />
                        </div>
                        <p className="text-sm font-medium text-gray-500">
                          {inventory.length === 0 ? 'No inventory yet' : 'No results match your filters'}
                        </p>
                        <p className="text-xs text-gray-400 max-w-sm">
                          {inventory.length === 0
                            ? 'Get started by onboarding a container, importing Excel, or adding stock manually.'
                            : 'Try adjusting your search or filter criteria to find what you\'re looking for.'}
                        </p>
                        {inventory.length === 0 && (
                          <div className="flex gap-2 mt-2">
                            <button type="button" onClick={() => setAddStockModal(true)} className="btn-secondary text-xs flex items-center gap-1.5 py-2 px-4">
                              <Plus className="w-3.5 h-3.5" /> Add Stock
                            </button>
                            <button type="button" onClick={() => setImportModalOpen(true)} className="btn-secondary text-xs flex items-center gap-1.5 py-2 px-4">
                              <Upload className="w-3.5 h-3.5" /> Import Excel
                            </button>
                          </div>
                        )}
                      </div>
                    </td></tr>
                  ) : paginatedRows.map(r => (
                    <tr key={r.id} className={clsx(
                      'hover:bg-gray-50/50 transition-colors',
                      r.isOut && 'bg-red-50/20',
                      r.isLow && !r.isOut && 'bg-amber-50/20',
                      selectedInventoryIds.has(r.id) && 'bg-primary/5'
                    )}>
                      <td className="px-4 py-3">
                        <input
                          type="checkbox"
                          title="Select Item"
                          className="rounded border-gray-300 text-primary focus:ring-primary w-4 h-4 cursor-pointer"
                          checked={selectedInventoryIds.has(r.id)}
                          onChange={() => toggleSelect(selectedInventoryIds, setSelectedInventoryIds, r.id)}
                        />
                      </td>
                      <td className="px-4 py-3">
                        <p className="font-medium text-gray-900">{r.item.name}</p>
                        <p className="text-xs text-gray-400 flex items-center gap-1">
                          SKU: {r.item.sku} <span className="opacity-50">·</span>
                          {r.brand && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setFilterBrand(r.item.brand_id);
                              }}
                              className="hover:text-primary hover:underline transition-colors cursor-pointer"
                            >
                              {r.brand.name}
                            </button>
                          )}
                        </p>
                        <button
                          onClick={() => { setDrillDownItemId(r.item_id); setIsDrillDownOpen(true); }}
                          className="group/drill text-left"
                        >
                          <p className="text-[11px] font-black text-primary mt-1 group-hover/drill:underline transition-all">Total: {getTotalStockForItem(r.item_id)} units →</p>
                          <div className="flex gap-1 mt-1 flex-wrap">
                            {getItemLocations(r.item_id).slice(0, 3).map((loc, idx) => (
                              <span key={idx} className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-blue-50 text-blue-600 transition-colors group-hover/drill:bg-primary group-hover/drill:text-white">{loc.location}: {loc.quantity}</span>
                            ))}
                            {getItemLocations(r.item_id).length > 3 && <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-500">+{getItemLocations(r.item_id).length - 3} more</span>}
                          </div>
                        </button>
                      </td>
                      <td className="px-4 py-3">
                        <p className="text-gray-700">{r.loc.name}</p>
                        <p className="text-xs text-gray-400 capitalize">{r.loc.type} · {r.loc.country}</p>
                      </td>
                      <td className="px-4 py-3">
                        <span className="inline-flex px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-700">{r.brand?.name || 'Unbranded'}</span>
                      </td>
                      {/* Stock Health Bar */}
                      <td className="px-4 py-3">
                        <div className="w-full max-w-[120px] ml-auto">
                          <div className="flex items-center justify-between mb-1">
                            <span className={clsx(
                              "text-[9px] font-bold uppercase",
                              r.isOut ? 'text-red-600' : r.isLow ? 'text-amber-600' : 'text-emerald-600'
                            )}>
                              {r.isOut ? 'OUT OF STOCK' : r.isLow ? 'REFILL SOON' : 'GOOD STOCK'}
                            </span>
                            <span className="text-[9px] text-gray-400">{r.quantity}/{r.item.min_stock_limit}</span>
                          </div>
                          <div className="h-1.5 w-full bg-gray-100 rounded-full overflow-hidden">
                            <div
                              className={clsx(
                                "h-full rounded-full transition-all",
                                r.isOut ? 'bg-red-500' : r.isLow ? 'bg-amber-500' : r.stockPct > 150 ? 'bg-emerald-500' : 'bg-emerald-400'
                              )}
                              style={{ width: `${Math.min(r.stockPct, 100)}%` }}
                            />
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right font-semibold text-gray-900 tabular-nums">{r.quantity.toLocaleString()}</td>
                      <td className="px-4 py-3 text-right text-gray-700 tabular-nums">{formatInCurrency(r.item.avg_cost_USD, costDisplayCurrency)}</td>
                      <td className="px-4 py-3 text-right">
                        <p className="font-bold text-gray-900 tabular-nums">{formatInCurrency(r.item.retail_price || 0, retailDisplayCurrency)}</p>
                        {r.profitMargin > 0 && (
                          <p className={clsx("text-[10px] font-bold mt-0.5", r.profitMargin >= 30 ? 'text-emerald-600' : r.profitMargin >= 15 ? 'text-blue-600' : 'text-gray-400')}>
                            {r.profitMargin.toFixed(0)}% margin
                          </p>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex justify-end gap-1.5">
                          <button title="Edit Item & Costs" onClick={() => { setAvgCostCurrency('USD'); setEditingItemId(r.item_id); setItemForm({ id: r.item_id, brand_id: r.item.brand_id, name: r.item.name, category: r.item.category, sku: r.item.sku, min_stock_limit: r.item.min_stock_limit, avg_cost_USD: r.avg_cost_USD, retail_price: Number(fromUSD(r.item.retail_price || 0, 'ZMW').toFixed(2)), stock: r.quantity, inventory_id: r.id, location_id: '', brand_manual: '' }); setItemModal(true); }} className="text-gray-400 hover:text-primary transition-colors p-1.5 rounded-lg bg-gray-50 hover:bg-primary/10"><Pencil className="w-3.5 h-3.5" /></button>
                          <button title="Transfer Stock" onClick={() => { setTransferForm({ from_location: r.location_id, to_location: '', item_id: r.item_id, quantity: 1, notes: '' }); setTransferModal(true); }} className="text-gray-400 hover:text-orange-500 transition-colors p-1.5 rounded-lg bg-gray-50 hover:bg-orange-50"><Truck className="w-3.5 h-3.5" /></button>
                          <button
                            disabled={saving}
                            title="Delete From Location"
                            onClick={() => handleDeleteStock(r.id, r.item.name)}
                            className="text-gray-400 hover:text-red-500 transition-colors p-1.5 rounded-lg bg-gray-50 hover:bg-red-50 disabled:opacity-30"
                          >
                            {saving ? (
                              <div className="w-3.5 h-3.5 border-2 border-red-400 border-t-transparent rounded-full animate-spin" />
                            ) : (
                              <Trash2 className="w-3.5 h-3.5" />
                            )}
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile & Tablet Card View */}
            <div className="lg:hidden p-4 sm:p-5">
              {paginatedRows.length === 0 ? (
                <div className="text-center py-12">
                  <div className="w-16 h-16 bg-gray-50 rounded-2xl flex items-center justify-center mx-auto mb-3">
                    <Boxes className="w-8 h-8 text-gray-300" />
                  </div>
                  <p className="text-sm font-medium text-gray-500">
                    {inventory.length === 0 ? 'No inventory yet' : 'No results match your filters'}
                  </p>
                  {inventory.length === 0 && (
                    <div className="flex gap-2 mt-3 justify-center">
                      <button type="button" onClick={() => setAddStockModal(true)} className="btn-secondary text-xs flex items-center gap-1.5 py-2 px-4">
                        <Plus className="w-3.5 h-3.5" /> Add Stock
                      </button>
                    </div>
                  )}
                </div>
              ) : (
                <div className="space-y-3">
                  {paginatedRows.map(r => (
                    <div key={r.id} className={clsx(
                      'bg-white rounded-xl border p-4 shadow-sm hover:shadow-md transition-all',
                      r.isOut ? 'border-red-200 bg-red-50/20' : r.isLow ? 'border-amber-200 bg-amber-50/20' : 'border-gray-200'
                    )}>
                      {/* Header */}
                      <div className="flex justify-between items-start mb-3 gap-2">
                        <div className="flex-1 min-w-0 flex items-start gap-3">
                          <input
                            type="checkbox"
                            title="Select Item"
                            className="rounded border-gray-300 text-primary focus:ring-primary w-4 h-4 cursor-pointer mt-1"
                            checked={selectedInventoryIds.has(r.id)}
                            onChange={() => toggleSelect(selectedInventoryIds, setSelectedInventoryIds, r.id)}
                          />
                          <div className="min-w-0">
                            <h3 className="font-bold text-gray-900 text-sm truncate">{r.item.name}</h3>
                            <p className="text-xs text-gray-500 mt-0.5 flex items-center gap-1">
                              SKU: {r.item.sku} <span className="opacity-50">·</span>
                              {r.brand && (
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setFilterBrand(r.item.brand_id);
                                  }}
                                  className="hover:text-primary hover:underline transition-colors cursor-pointer"
                                >
                                  {r.brand.name}
                                </button>
                              )}
                            </p>
                          </div>
                        </div>
                        <div className="flex gap-1.5 flex-shrink-0">
                          <button title="Edit" onClick={() => { setAvgCostCurrency('USD'); setEditingItemId(r.item_id); setItemForm({ id: r.item_id, brand_id: r.item.brand_id, name: r.item.name, category: r.item.category, sku: r.item.sku, min_stock_limit: r.item.min_stock_limit, avg_cost_USD: r.avg_cost_USD, retail_price: Number(fromUSD(r.item.retail_price || 0, 'ZMW').toFixed(2)), stock: r.quantity, inventory_id: r.id, location_id: '', brand_manual: '' }); setItemModal(true); }} className="text-gray-400 hover:text-primary transition-colors p-2 rounded-lg bg-gray-50 hover:bg-primary/10"><Pencil className="w-4 h-4" /></button>
                          <button title="Transfer" onClick={() => { setTransferForm({ from_location: r.location_id, to_location: '', item_id: r.item_id, quantity: 1, notes: '' }); setTransferModal(true); }} className="text-gray-400 hover:text-orange-500 transition-colors p-2 rounded-lg bg-gray-50 hover:bg-orange-50"><Truck className="w-4 h-4" /></button>
                          <button
                             disabled={saving}
                             title="Delete"
                             onClick={() => handleDeleteStock(r.id, r.item.name)}
                             className="text-gray-400 hover:text-red-500 transition-colors p-2 rounded-lg bg-gray-50 hover:bg-red-50 disabled:opacity-30"
                          >
                             <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>

                      {/* Category + Status */}
                      <div className="flex items-center gap-2 mb-3">
                        <span className="inline-flex px-2 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-700">{r.item.category}</span>
                        <span className={clsx(
                          "inline-flex px-2 py-1 rounded-full text-[10px] font-bold",
                          r.isOut ? 'bg-red-100 text-red-700' : r.isLow ? 'bg-amber-100 text-amber-700' : 'bg-emerald-100 text-emerald-700'
                        )}>
                          {r.isOut ? 'OUT OF STOCK' : r.isLow ? 'REFILL SOON' : 'GOOD STOCK'}
                        </span>
                      </div>

                      {/* Stock Health Bar */}
                      <div className="mb-3">
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-[10px] font-bold text-gray-500">Stock Level</span>
                          <span className="text-[10px] text-gray-400 tabular-nums">{r.quantity} / {r.item.min_stock_limit} min</span>
                        </div>
                        <div className="h-2 w-full bg-gray-100 rounded-full overflow-hidden">
                          <div
                            className={clsx(
                              "h-full rounded-full transition-all",
                              r.isOut ? 'bg-red-500' : r.isLow ? 'bg-amber-500' : 'bg-emerald-500'
                            )}
                            style={{ width: `${Math.min(r.stockPct, 100)}%` }}
                          />
                        </div>
                      </div>

                      {/* Location */}
                      <div className="bg-gray-50 rounded-lg p-3 mb-3 border border-gray-100">
                        <p className="text-xs font-semibold text-gray-600 uppercase tracking-wider mb-1">Location</p>
                        <p className="text-sm font-medium text-gray-900">{r.loc.name}</p>
                        <p className="text-xs text-gray-500 capitalize">{r.loc.type} · {r.loc.country}</p>
                      </div>

                      {/* Metrics grid */}
                      <div className="grid grid-cols-3 gap-2 mb-3">
                        <div className="bg-blue-50 rounded-lg p-2.5 border border-blue-100">
                          <p className="text-[9px] uppercase font-bold text-blue-600 tracking-wider">Qty</p>
                          <p className="text-base font-extrabold text-blue-900 mt-0.5">{r.quantity}</p>
                        </div>
                        <div className="bg-emerald-50 rounded-lg p-2.5 border border-emerald-100">
                          <p className="text-[9px] uppercase font-bold text-emerald-600 tracking-wider">Unit Cost ({costDisplayCurrency})</p>
                          <p className="text-[11px] font-bold text-emerald-900 mt-0.5">{formatInCurrency(r.item.avg_cost_USD, costDisplayCurrency)}</p>
                        </div>
                        <div className="bg-purple-50 rounded-lg p-2.5 border border-purple-100">
                          <p className="text-[9px] uppercase font-bold text-purple-600 tracking-wider">Retail ({retailDisplayCurrency})</p>
                          <p className="text-[11px] font-bold text-purple-900 mt-0.5">{formatInCurrency(r.item.retail_price || 0, retailDisplayCurrency)}</p>
                          {r.profitMargin > 0 && <p className="text-[9px] font-bold text-purple-500 mt-0.5">{r.profitMargin.toFixed(0)}% margin</p>}
                        </div>
                      </div>

                      {/* Stock breakdown */}
                      <button
                        onClick={() => { setDrillDownItemId(r.item_id); setIsDrillDownOpen(true); }}
                        className="bg-gray-50 rounded-lg p-3 border border-gray-100 w-full text-left active:bg-gray-100 transition-colors"
                      >
                        <p className="text-[9px] uppercase font-bold text-gray-600 tracking-wider mb-2">Total System Stock: {getTotalStockForItem(r.item_id)} units</p>
                        <div className="flex flex-wrap gap-1.5">
                          {getItemLocations(r.item_id).slice(0, 4).map((loc, idx) => (
                            <span key={idx} className="text-[10px] font-bold px-2 py-1 rounded-full bg-blue-100 text-blue-700">{loc.location}: {loc.quantity}</span>
                          ))}
                          {getItemLocations(r.item_id).length > 4 && <span className="text-[10px] font-bold px-2 py-1 rounded-full bg-gray-200 text-gray-500">+{getItemLocations(r.item_id).length - 4} more</span>}
                        </div>
                        <p className="text-[9px] font-black text-primary uppercase mt-2">View Full Breakdown →</p>
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Pagination Footer */}
            <div className="px-4 sm:px-5 py-3 border-t border-gray-100 flex flex-col sm:flex-row items-center justify-between gap-3">
              <div className="flex items-center gap-3 text-xs text-gray-500">
                <span>
                  Showing <span className="font-bold text-gray-700">{inventoryRows.length > 0 ? ((currentPage - 1) * pageSize) + 1 : 0}–{Math.min(currentPage * pageSize, inventoryRows.length)}</span> of <span className="font-bold text-gray-700">{inventoryRows.length}</span>
                </span>
                <select
                  title="Rows per page"
                  value={pageSize}
                  onChange={e => setPageSize(Number(e.target.value))}
                  className="border border-gray-200 rounded-lg px-2 py-1 text-xs bg-white font-medium"
                >
                  {PAGE_SIZES.map(s => <option key={s} value={s}>{s} / page</option>)}
                </select>
              </div>
              {totalPages > 1 && (
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    disabled={currentPage === 1}
                    onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                    className="p-1.5 rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-50 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                  {Array.from({ length: Math.min(totalPages, 7) }, (_, i) => {
                    let page: number;
                    if (totalPages <= 7) {
                      page = i + 1;
                    } else if (currentPage <= 4) {
                      page = i + 1;
                    } else if (currentPage >= totalPages - 3) {
                      page = totalPages - 6 + i;
                    } else {
                      page = currentPage - 3 + i;
                    }
                    return (
                      <button
                        key={page}
                        type="button"
                        onClick={() => setCurrentPage(page)}
                        className={clsx(
                          "w-8 h-8 rounded-lg text-xs font-bold transition-colors",
                          currentPage === page
                            ? 'bg-primary text-white shadow-sm'
                            : 'text-gray-500 hover:bg-gray-50 border border-transparent hover:border-gray-200'
                        )}
                      >
                        {page}
                      </button>
                    );
                  })}
                  <button
                    type="button"
                    disabled={currentPage === totalPages}
                    onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                    className="p-1.5 rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-50 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── Containers Tab ── */}
        {activeTab === 'containers' && (
          <div>
            <div className="p-4 sm:p-5 flex flex-col sm:flex-row gap-3 border-b border-gray-50">
              <div className="relative flex-1">
                <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input placeholder="Search containers..." className="input-field pl-10 h-11" disabled />
              </div>
              <button onClick={() => setOnboardModal(true)} className="btn-primary flex items-center gap-2 text-sm h-11">
                <Plus className="w-4 h-4" /> Onboard Container
              </button>
              {selectedContainerIds.size > 0 && (
                <button
                  onClick={handleBulkDelete}
                  className="btn-secondary text-red-600 border-red-100 bg-red-50 hover:bg-red-100 flex items-center gap-2 h-11 px-6 animate-in fade-in zoom-in duration-200"
                >
                  <Trash2 className="w-4 h-4" />
                  Delete ({selectedContainerIds.size})
                </button>
              )}
            </div>

            {/* Desktop Table View */}
            <div className="hidden lg:block overflow-x-auto">
              <table className="w-full text-sm text-left min-w-[600px]">
                <thead className="bg-gray-50 text-xs uppercase text-gray-500">
                  <tr>
                    <th className="px-5 py-3 w-10">
                      <input
                        type="checkbox"
                        title="Select All"
                        className="rounded border-gray-300 text-primary focus:ring-primary w-4 h-4 cursor-pointer"
                        checked={paginatedContainers.length > 0 && paginatedContainers.every(c => selectedContainerIds.has(c.id))}
                        onChange={toggleContainerAll}
                      />
                    </th>
                    <th className="px-5 py-3 font-medium">Source Country</th>
                    <th className="px-5 py-3 font-medium">Date</th>
                    <th className="px-5 py-3 font-medium text-right">Total Cost</th>
                    <th className="px-5 py-3 font-medium">Packing List (Logged)</th>
                    <th className="px-5 py-3 font-medium text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50 bg-white">
                  {containers.length === 0 ? (
                    <tr><td colSpan={6} className="px-5 py-12 text-center text-gray-400 text-sm">No containers logged yet. Use "Onboard Container" to start.</td></tr>
                  ) : paginatedContainers.map(c => (
                    <tr key={c.id} className={clsx("hover:bg-gray-50/50 transition-colors border-b border-gray-100 last:border-0", selectedContainerIds.has(c.id) && 'bg-primary/5')}>
                      <td className="px-5 py-3.5">
                        <input
                          type="checkbox"
                          className="rounded border-gray-300 text-primary focus:ring-primary w-4 h-4 cursor-pointer"
                          checked={selectedContainerIds.has(c.id)}
                          onChange={() => toggleSelect(selectedContainerIds, setSelectedContainerIds, c.id)}
                        />
                      </td>
                      <td className="px-5 py-3.5 align-top">
                        <div className="font-medium text-gray-900">{c.source_country}</div>
                        <div className="text-[10px] text-primary mt-1 uppercase font-extrabold tracking-wider">#{c.container_no || c.id.slice(-6)}</div>
                        <div className="mt-1.5">
                          {c.status === 'Pending' ? (
                            <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-50 text-amber-600 border border-amber-200">Pending Receipt</span>
                          ) : (
                            <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold bg-emerald-50 text-emerald-600 border border-emerald-200">Received</span>
                          )}
                        </div>
                      </td>
                      <td className="px-5 py-3.5 text-gray-500 align-top whitespace-nowrap">{new Date(c.date).toLocaleDateString('en-IN')}</td>
                      <td className="px-5 py-3.5 text-right font-medium text-gray-900 align-top whitespace-nowrap">{formatHistoricalDualCurrency(c.total_cost, c.currency, c.converted_cost_USD)}</td>
                      <td className="px-5 py-3.5 align-top">
                        <div className="text-gray-400 text-[11px] mb-2 italic line-clamp-1" title={c.notes}>{c.notes || 'No container notes'}</div>
                        <div className="flex flex-wrap gap-1.5 min-h-[20px]">
                          {transactions.filter(t => t.container_id === c.id).length > 0 ? (
                            expandedContainers.has(c.id) ? (
                              transactions.filter(t => t.container_id === c.id).map((t: any) => (
                                <span key={t.id} className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-blue-50 text-blue-600 border border-blue-100 whitespace-nowrap">
                                  {t.item_name} × {t.quantity}
                                </span>
                              ))
                            ) : (
                              <span className="text-[10px] text-gray-500 font-bold bg-gray-50 border border-gray-200 px-2.5 py-1 rounded-md">
                                {transactions.filter(t => t.container_id === c.id).length} items hidden
                              </span>
                            )
                          ) : (
                            <span className="text-[10px] text-gray-300">No stock entry linked yet</span>
                          )}
                        </div>
                      </td>
                      <td className="px-5 py-3.5 text-right">
                        <div className="flex justify-end gap-1">
                          {transactions.filter(t => t.container_id === c.id).length > 0 && (
                            <button title="Toggle Items" onClick={() => toggleContainerExpanded(c.id)} className="text-gray-600 bg-gray-100 hover:bg-gray-200 transition-colors px-3 py-1.5 rounded-lg font-bold text-[10px] uppercase tracking-widest flex items-center gap-1.5">
                              {expandedContainers.has(c.id) ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />} {expandedContainers.has(c.id) ? 'Hide Items' : 'View Items'}
                            </button>
                          )}
                          <button title={c.status === 'Pending' ? 'Receive & Reconcile' : 'Reconcile Mismatch'} onClick={() => openAdjustInvoiceModal(c.id)} className="text-primary bg-primary/10 hover:bg-primary/20 transition-colors px-3 py-1.5 rounded-lg font-bold text-[10px] uppercase tracking-widest flex items-center gap-1.5"><Pencil className="w-3.5 h-3.5" /> {c.status === 'Pending' ? 'Receive & Reconcile' : 'Reconcile Mismatch'}</button>
                          <button title="Delete Container" onClick={() => { setDeleteConfirmModal({ isOpen: true, isBulk: false, id: c.id, name: `Container #${c.container_no}`, tab: 'containers' }); }} className="text-gray-400 hover:text-red-500 transition-colors p-1.5 rounded-lg bg-gray-50 hover:bg-red-50"><Trash2 className="w-3.5 h-3.5" /></button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile & Tablet Card View */}
            <div className="lg:hidden p-4 sm:p-5">
              {containers.length === 0 ? (
                <div className="text-center text-gray-400 text-sm py-12">
                  No containers logged yet. Use "Onboard Container" to start.
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="flex items-center justify-between px-1 mb-2">
                    <label className="flex items-center gap-2 text-xs font-bold text-gray-500 cursor-pointer">
                      <input type="checkbox" className="rounded" checked={paginatedContainers.length > 0 && paginatedContainers.every(c => selectedContainerIds.has(c.id))} onChange={toggleContainerAll} />
                      Select All Containers
                    </label>
                  </div>
                  {paginatedContainers.map(c => (
                    <div key={c.id} className={clsx("bg-white rounded-xl border p-4 shadow-sm hover:shadow-md transition-all", selectedContainerIds.has(c.id) ? 'border-primary bg-primary/5' : 'border-gray-200')}>
                      {/* Header */}
                      <div className="flex justify-between items-start mb-3 gap-2">
                        <div className="flex items-start gap-3">
                          <input type="checkbox" className="rounded mt-1" checked={selectedContainerIds.has(c.id)} onChange={() => toggleSelect(selectedContainerIds, setSelectedContainerIds, c.id)} />
                          <div>
                            <p className="text-sm font-bold text-gray-900">{c.source_country}</p>
                            <div className="flex items-center gap-2 mt-1">
                              <p className="text-[10px] text-primary uppercase font-extrabold tracking-wider">Container #{c.container_no || c.id.slice(-6)}</p>
                              {c.status === 'Pending' ? (
                                <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-amber-50 text-amber-600 border border-amber-200">Pending</span>
                              ) : (
                                <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-emerald-50 text-emerald-600 border border-emerald-200">Received</span>
                              )}
                            </div>
                          </div>
                        </div>
                        <div className="text-right">
                          <p className="text-xs text-gray-500">{new Date(c.date).toLocaleDateString('en-IN')}</p>
                        </div>
                      </div>

                      {/* Cost section */}
                      <div className="bg-gradient-to-r from-blue-50 to-blue-50 border border-blue-100 rounded-lg p-3 mb-3">
                        <p className="text-[9px] uppercase font-bold text-blue-600 tracking-wider">Total Cost</p>
                        <p className="text-sm font-bold text-blue-900 mt-1">{formatHistoricalDualCurrency(c.total_cost, c.currency, c.converted_cost_USD)}</p>
                      </div>

                      {/* Actions */}
                      <div className="flex justify-end gap-2 border-t border-gray-100 pt-3">
                        <button onClick={() => openAdjustInvoiceModal(c.id)} className="text-primary bg-primary/5 hover:bg-primary/10 px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5">
                          <Pencil className="w-3.5 h-3.5" /> {c.status === 'Pending' ? 'Receive & Reconcile' : 'Reconcile Mismatch'}
                        </button>
                        <button onClick={() => { setDeleteConfirmModal({ isOpen: true, isBulk: false, id: c.id, name: `Container #${c.container_no}`, tab: 'containers' }); }} className="text-red-600 bg-red-50 hover:bg-red-100 px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5">
                          <Trash2 className="w-3.5 h-3.5" /> Delete
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Containers Pagination */}
            {containers.length > 0 && (
              <div className="px-4 sm:px-5 py-3 border-t border-gray-100 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-gray-500">
                <div className="flex items-center gap-3">
                  <span>Showing {containers.length > 0 ? ((containersPage - 1) * pageSize) + 1 : 0}–{Math.min(containersPage * pageSize, containers.length)} of {containers.length}</span>
                  <select
                    title="Rows per page"
                    value={pageSize}
                    onChange={e => {
                      setPageSize(Number(e.target.value));
                      setContainersPage(1);
                    }}
                    className="border border-gray-200 rounded-lg px-2 py-1 text-xs bg-white font-medium"
                  >
                    {PAGE_SIZES.map(s => <option key={s} value={s}>{s} / page</option>)}
                  </select>
                </div>
                {Math.ceil(containers.length / pageSize) > 1 && (
                  <div className="flex items-center gap-1">
                    <button type="button" title="Previous page" disabled={containersPage === 1} onClick={() => setContainersPage(p => p - 1)} className="p-1.5 rounded-lg border border-gray-200 disabled:opacity-30"><ChevronLeft className="w-3.5 h-3.5" /></button>
                    <span className="px-3 font-bold">{containersPage} / {Math.ceil(containers.length / pageSize)}</span>
                    <button type="button" title="Next page" disabled={containersPage >= Math.ceil(containers.length / pageSize)} onClick={() => setContainersPage(p => p + 1)} className="p-1.5 rounded-lg border border-gray-200 disabled:opacity-30"><ChevronRight className="w-3.5 h-3.5" /></button>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* ── Items Tab ── */}
        {activeTab === 'items' && (
          <div>
            <div className="p-4 flex flex-col sm:flex-row gap-3 justify-between border-b border-gray-50">
              <div className="relative flex-1 max-w-md flex gap-2">
                <div className="relative flex-1">
                  <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <input value={itemsSearch} onChange={e => { setItemsSearch(e.target.value); setItemsPage(1); }}
                    placeholder="Search items..." className="input-field pl-10 h-10 text-sm" />
                </div>
              </div>
              <div className="flex gap-2">
                <button onClick={handleRegenAllSKUs} disabled={regenSaving} className="btn-secondary flex items-center gap-2 text-sm h-10">
                  <RefreshCw className={clsx("w-4 h-4", regenSaving && "animate-spin")} />
                  {regenSaving ? 'Regenerating...' : 'Regenerate SKUs'}
                </button>
                {selectedItemIds.size > 0 && (
                  <button onClick={handleBulkDelete} className="btn-secondary text-red-600 border-red-100 bg-red-50 hover:bg-red-100 flex items-center gap-2 h-10 px-4 animate-in fade-in zoom-in duration-200">
                    <Trash2 className="w-4 h-4" /> Delete ({selectedItemIds.size})
                  </button>
                )}
                <button onClick={() => { setAvgCostCurrency('USD'); setItemModal(true); }} className="btn-primary flex items-center gap-2 text-sm h-10">
                  <Plus className="w-4 h-4" /> Add Item
                </button>
              </div>
            </div>

            {/* Desktop Table View */}
            <div className="hidden lg:block overflow-x-auto">
              <table className="w-full text-sm text-left min-w-[700px]">
                <thead className="bg-gray-50 text-xs uppercase text-gray-500">
                  <tr>
                    <th className="px-5 py-3 w-10">
                      <input
                        type="checkbox"
                        className="rounded border-gray-300 text-primary focus:ring-primary w-4 h-4 cursor-pointer"
                        checked={paginatedItems.length > 0 && paginatedItems.every(item => selectedItemIds.has(item.id))}
                        onChange={toggleItemAll}
                      />
                    </th>
                    <th className="px-5 py-3 font-medium">Name</th>
                    <th className="px-5 py-3 font-medium">SKU</th>
                    <th className="px-5 py-3 font-medium">Brand</th>
                    <th className="px-5 py-3 font-medium text-right">Total Stock</th>
                    <th className="px-5 py-3 font-medium text-right">Min Limit</th>
                    <th className="px-5 py-3 font-medium text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50 bg-white">
                  {paginatedItems.length === 0 ? (
                    <tr><td colSpan={7} className="px-5 py-12 text-center text-gray-400 text-sm">
                      {items.length === 0 ? 'No items defined yet. Add items via "Add Item" or onboard a container.' : 'No items match your search.'}
                    </td></tr>
                  ) : paginatedItems.map(item => {
                    const totalStock = getTotalStockForItem(item.id);
                    const stockOk = totalStock >= (item.min_stock_limit ?? 0);
                    return (
                      <tr key={item.id} className={clsx("hover:bg-gray-50/50 transition-colors", selectedItemIds.has(item.id) && 'bg-primary/5')}>
                        <td className="px-5 py-3.5">
                          <input
                            type="checkbox"
                            className="rounded border-gray-300 text-primary focus:ring-primary w-4 h-4 cursor-pointer"
                            checked={selectedItemIds.has(item.id)}
                            onChange={() => toggleSelect(selectedItemIds, setSelectedItemIds, item.id)}
                          />
                        </td>
                        <td className="px-5 py-3.5 font-medium text-gray-900">{item.name}</td>
                        <td className="px-5 py-3.5 text-gray-500 font-mono text-xs">{item.sku}</td>
                        <td className="px-5 py-3.5"><span className="px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-700">{brandMap.get(item.brand_id)?.name || item.category || 'Unbranded'}</span></td>
                        <td className="px-5 py-3.5 text-right">
                          <span className={clsx("font-bold tabular-nums", stockOk ? 'text-gray-900' : totalStock === 0 ? 'text-red-500' : 'text-amber-600')}>
                            {totalStock}
                          </span>
                        </td>
                        <td className="px-5 py-3.5 text-right text-gray-700">{item.min_stock_limit}</td>
                        <td className="px-5 py-3.5 text-right">
                          <div className="flex justify-end gap-1.5">
                            <button title="Regenerate SKU" onClick={() => handleRegenSingleSKU(item)} className="text-gray-400 hover:text-primary transition-colors p-1.5 rounded-lg bg-gray-50 hover:bg-primary/10"><RefreshCw className="w-3.5 h-3.5" /></button>
                            <button title="Edit Item" onClick={() => { setAvgCostCurrency('USD'); setEditingItemId(item.id); setItemForm({ id: item.id, brand_id: item.brand_id, name: item.name, category: item.category, sku: item.sku, min_stock_limit: item.min_stock_limit, avg_cost_USD: 0, retail_price: Number(fromUSD(item.retail_price || 0, 'ZMW').toFixed(2)), stock: totalStock, inventory_id: '', location_id: '', brand_manual: '' }); setItemModal(true); }} className="text-gray-400 hover:text-primary transition-colors p-1.5 rounded-lg bg-gray-50 hover:bg-primary/10"><Pencil className="w-3.5 h-3.5" /></button>
                            <button title="Delete Item" onClick={() => setDeleteConfirmModal({ isOpen: true, isBulk: false, id: item.id, name: item.name, tab: 'items' })} className="text-gray-400 hover:text-red-500 transition-colors p-1.5 rounded-lg bg-gray-50 hover:bg-red-50"><Trash2 className="w-3.5 h-3.5" /></button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Mobile & Tablet Card View */}
            <div className="lg:hidden p-4 sm:p-5">
              {paginatedItems.length === 0 ? (
                <div className="text-center text-gray-400 text-sm py-12">
                  {items.length === 0 ? 'No items defined yet.' : 'No items match your search.'}
                </div>
              ) : (
                <div className="space-y-3">
                  {paginatedItems.map(item => {
                    const totalStock = getTotalStockForItem(item.id);
                    return (
                      <div key={item.id} className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm hover:shadow-md transition-all">
                        <div className="flex justify-between items-start gap-2 mb-3">
                          <div className="flex-1 min-w-0 flex items-start gap-3">
                            <input
                              type="checkbox"
                              className="rounded border-gray-300 text-primary focus:ring-primary w-4 h-4 cursor-pointer mt-1"
                              checked={selectedItemIds.has(item.id)}
                              onChange={() => toggleSelect(selectedItemIds, setSelectedItemIds, item.id)}
                            />
                            <div className="min-w-0">
                              <h3 className="font-bold text-gray-900 text-sm">{item.name}</h3>
                              <p className="text-xs text-gray-500 mt-1 font-mono">{item.sku}</p>
                            </div>
                          </div>
                          <div className="flex gap-1.5 flex-shrink-0">
                            <button title="Edit Item" onClick={() => { setAvgCostCurrency('USD'); setEditingItemId(item.id); setItemForm({ id: item.id, brand_id: item.brand_id, name: item.name, category: item.category, sku: item.sku, min_stock_limit: item.min_stock_limit, avg_cost_USD: 0, retail_price: Number(fromUSD(item.retail_price || 0, 'ZMW').toFixed(2)), stock: totalStock, inventory_id: '', location_id: '', brand_manual: '' }); setItemModal(true); }} className="text-gray-400 hover:text-primary transition-colors p-2 rounded-lg bg-gray-50 hover:bg-primary/10"><Pencil className="w-4 h-4" /></button>
                            <button title="Delete Item" onClick={() => setDeleteConfirmModal({ isOpen: true, isBulk: false, id: item.id, name: item.name, tab: 'items' })} className="text-gray-400 hover:text-red-500 transition-colors p-2 rounded-lg bg-gray-50 hover:bg-red-50 flex-shrink-0"><Trash2 className="w-4 h-4" /></button>
                          </div>
                        </div>

                        <div className="grid grid-cols-3 gap-2 mb-3">
                          <div className="bg-gray-50 rounded-lg p-2.5 border border-gray-100">
                            <p className="text-[9px] uppercase font-bold text-gray-600 tracking-wider">Brand</p>
                            <p className="text-xs font-bold text-gray-900 mt-1">{brandMap.get(item.brand_id)?.name || item.category || 'Unbranded'}</p>
                          </div>
                          <div className="bg-gray-50 rounded-lg p-2.5 border border-gray-100">
                            <p className="text-[9px] uppercase font-bold text-gray-600 tracking-wider">Min Stock</p>
                            <p className="text-xs font-bold text-gray-900 mt-1">{item.min_stock_limit}</p>
                          </div>
                          <div className={clsx("rounded-lg p-2.5 border", totalStock >= item.min_stock_limit ? 'bg-emerald-50 border-emerald-100' : 'bg-red-50 border-red-100')}>
                            <p className="text-[9px] uppercase font-bold text-gray-600 tracking-wider">Total Stock</p>
                            <p className={clsx("text-xs font-bold mt-1", totalStock >= item.min_stock_limit ? 'text-emerald-700' : 'text-red-700')}>{totalStock}</p>
                          </div>
                        </div>

                        {brandMap.get(item.brand_id) && (
                          <div className="bg-blue-50 rounded-lg p-2.5 border border-blue-100">
                            <p className="text-[9px] uppercase font-bold text-blue-600 tracking-wider">Brand</p>
                            <p className="text-xs font-bold text-blue-900 mt-1">{brandMap.get(item.brand_id)?.name}</p>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Items Pagination */}
            {filteredItems.length > 0 && (
              <div className="px-4 sm:px-5 py-3 border-t border-gray-100 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-gray-500">
                <div className="flex items-center gap-3">
                  <span>Showing {filteredItems.length > 0 ? ((itemsPage - 1) * pageSize) + 1 : 0}–{Math.min(itemsPage * pageSize, filteredItems.length)} of {filteredItems.length}</span>
                  <select
                    title="Rows per page"
                    value={pageSize}
                    onChange={e => {
                      setPageSize(Number(e.target.value));
                      setItemsPage(1);
                    }}
                    className="border border-gray-200 rounded-lg px-2 py-1 text-xs bg-white font-medium"
                  >
                    {PAGE_SIZES.map(s => <option key={s} value={s}>{s} / page</option>)}
                  </select>
                </div>
                {Math.ceil(filteredItems.length / pageSize) > 1 && (
                  <div className="flex items-center gap-1">
                    <button type="button" title="Previous page" disabled={itemsPage === 1} onClick={() => setItemsPage(p => p - 1)} className="p-1.5 rounded-lg border border-gray-200 disabled:opacity-30"><ChevronLeft className="w-3.5 h-3.5" /></button>
                    <span className="px-3 font-bold">{itemsPage} / {Math.ceil(filteredItems.length / pageSize)}</span>
                    <button type="button" title="Next page" disabled={itemsPage >= Math.ceil(filteredItems.length / pageSize)} onClick={() => setItemsPage(p => p + 1)} className="p-1.5 rounded-lg border border-gray-200 disabled:opacity-30"><ChevronRight className="w-3.5 h-3.5" /></button>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* ── Brands Tab ── */}
        {activeTab === 'brands' && (
          <div>
            <div className="p-4 sm:p-5 flex flex-col sm:flex-row gap-3 justify-between border-b border-gray-50">
              <div className="relative flex-1 max-w-md">
                <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input value={brandsSearch} onChange={e => { setBrandsSearch(e.target.value); setBrandsPage(1); }}
                  placeholder="Search brands..." className="input-field pl-10 h-11 text-sm" />
              </div>
              <button onClick={() => { setEditingBrandId(null); setBrandForm({ name: '', origin_country: 'Zambia' }); setBrandModal(true); }} className="btn-primary flex items-center gap-2 text-sm h-11"><Plus className="w-4 h-4" /> Add Brand</button>
              {selectedBrandIds.size > 0 && (
                <button
                  onClick={handleBulkDelete}
                  className="btn-secondary text-red-600 border-red-100 bg-red-50 hover:bg-red-100 flex items-center gap-2 h-11 px-6 animate-in fade-in zoom-in duration-200"
                >
                  <Trash2 className="w-4 h-4" />
                  Delete ({selectedBrandIds.size})
                </button>
              )}
            </div>

            {/* Desktop Table View */}
            <div className="hidden lg:block overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead className="bg-gray-50 text-xs uppercase text-gray-500">
                  <tr>
                    <th className="px-5 py-3 w-12">
                      <input type="checkbox" className="rounded border-gray-300 text-primary focus:ring-primary w-4 h-4 cursor-pointer" checked={paginatedBrands.length > 0 && paginatedBrands.every(b => selectedBrandIds.has(b.id))} onChange={toggleBrandAll} />
                    </th>
                    <th className="px-5 py-3 font-medium">Brand Name</th>
                    <th className="px-5 py-3 font-medium">Origin Country</th>
                    <th className="px-5 py-3 font-medium text-right">Items</th>
                    <th className="px-5 py-3 font-medium text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50 bg-white">
                  {paginatedBrands.length === 0 ? (
                    <tr><td colSpan={5} className="px-5 py-12 text-center text-gray-400 text-sm">
                      {brands.length === 0 ? 'No brands yet.' : 'No brands match your search.'}
                    </td></tr>
                  ) : paginatedBrands.map(b => {
                    const itemCount = items.filter(i => i.brand_id === b.id).length;
                    return (
                      <tr key={b.id} className={clsx("hover:bg-gray-50/50 transition-colors", selectedBrandIds.has(b.id) && 'bg-primary/5')}>
                        <td className="px-5 py-3.5">
                          <input type="checkbox" className="rounded border-gray-300 text-primary focus:ring-primary w-4 h-4 cursor-pointer" checked={selectedBrandIds.has(b.id)} onChange={() => toggleSelect(selectedBrandIds, setSelectedBrandIds, b.id)} />
                        </td>
                        <td className="px-5 py-3.5 font-medium text-gray-900">{b.name}</td>
                        <td className="px-5 py-3.5 text-gray-500">{b.origin_country}</td>
                        <td className="px-5 py-3.5 text-right">
                          <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-blue-50 text-blue-600">{itemCount}</span>
                        </td>
                        <td className="px-5 py-3.5 text-right">
                          <div className="flex justify-end gap-1">
                            <button title="Edit Brand" onClick={() => { setEditingBrandId(b.id); setBrandForm({ name: b.name, origin_country: b.origin_country }); setBrandModal(true); }} className="text-gray-400 hover:text-blue-500 transition-colors p-1.5 rounded-lg bg-gray-50 hover:bg-blue-50"><Pencil className="w-3.5 h-3.5" /></button>
                            <button title="Delete Brand" onClick={() => { setDeleteConfirmModal({ isOpen: true, isBulk: false, id: b.id, name: b.name, tab: 'brands' }); }} className="text-gray-400 hover:text-red-500 transition-colors p-1.5 rounded-lg bg-gray-50 hover:bg-red-50"><Trash2 className="w-3.5 h-3.5" /></button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Mobile & Tablet Card View */}
            <div className="lg:hidden p-4 sm:p-5">
              {paginatedBrands.length === 0 ? (
                <div className="text-center text-gray-400 text-sm py-12">
                  {brands.length === 0 ? 'No brands yet.' : 'No brands match your search.'}
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="flex items-center gap-2 px-1 mb-2">
                    <input type="checkbox" className="rounded border-gray-300 text-primary focus:ring-primary w-4 h-4 cursor-pointer" checked={paginatedBrands.length > 0 && paginatedBrands.every(b => selectedBrandIds.has(b.id))} onChange={toggleBrandAll} />
                    <span className="text-xs font-bold text-gray-500 uppercase">Select All</span>
                  </div>
                  {paginatedBrands.map(b => {
                    const itemCount = items.filter(i => i.brand_id === b.id).length;
                    return (
                      <div key={b.id} className={clsx("bg-white rounded-xl border p-4 shadow-sm hover:shadow-md transition-all flex gap-3", selectedBrandIds.has(b.id) ? 'border-primary bg-primary/5' : 'border-gray-200')}>
                        <div className="pt-0.5">
                          <input type="checkbox" className="rounded border-gray-300 text-primary focus:ring-primary w-4 h-4 cursor-pointer" checked={selectedBrandIds.has(b.id)} onChange={() => toggleSelect(selectedBrandIds, setSelectedBrandIds, b.id)} />
                        </div>
                        <div className="flex-1 flex justify-between items-start gap-2">
                          <div>
                            <h3 className="font-bold text-gray-900 text-sm">{b.name}</h3>
                            <p className="text-xs text-gray-500 mt-1">Origin: {b.origin_country} · <span className="font-bold text-blue-600">{itemCount} items</span></p>
                          </div>
                          <div className="flex flex-col gap-1">
                            <button title="Edit Brand" onClick={() => { setEditingBrandId(b.id); setBrandForm({ name: b.name, origin_country: b.origin_country }); setBrandModal(true); }} className="text-gray-400 hover:text-blue-500 transition-colors p-2 rounded-lg bg-gray-50 hover:bg-blue-50 flex-shrink-0"><Pencil className="w-4 h-4" /></button>
                            <button title="Delete Brand" onClick={() => { setDeleteConfirmModal({ isOpen: true, isBulk: false, id: b.id, name: b.name, tab: 'brands' }); }} className="text-gray-400 hover:text-red-500 transition-colors p-2 rounded-lg bg-gray-50 hover:bg-red-50 flex-shrink-0"><Trash2 className="w-4 h-4" /></button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Brands Pagination */}
            {filteredBrands.length > 0 && (
              <div className="px-4 sm:px-5 py-3 border-t border-gray-100 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-gray-500">
                <div className="flex items-center gap-3">
                  <span>Showing {filteredBrands.length > 0 ? ((brandsPage - 1) * pageSize) + 1 : 0}–{Math.min(brandsPage * pageSize, filteredBrands.length)} of {filteredBrands.length}</span>
                  <select
                    title="Rows per page"
                    value={pageSize}
                    onChange={e => {
                      setPageSize(Number(e.target.value));
                      setBrandsPage(1);
                    }}
                    className="border border-gray-200 rounded-lg px-2 py-1 text-xs bg-white font-medium"
                  >
                    {PAGE_SIZES.map(s => <option key={s} value={s}>{s} / page</option>)}
                  </select>
                </div>
                {Math.ceil(filteredBrands.length / pageSize) > 1 && (
                  <div className="flex items-center gap-1">
                    <button type="button" title="Previous page" disabled={brandsPage === 1} onClick={() => setBrandsPage(p => p - 1)} className="p-1.5 rounded-lg border border-gray-200 disabled:opacity-30"><ChevronLeft className="w-3.5 h-3.5" /></button>
                    <span className="px-3 font-bold">{brandsPage} / {Math.ceil(filteredBrands.length / pageSize)}</span>
                    <button type="button" title="Next page" disabled={brandsPage >= Math.ceil(filteredBrands.length / pageSize)} onClick={() => setBrandsPage(p => p + 1)} className="p-1.5 rounded-lg border border-gray-200 disabled:opacity-30"><ChevronRight className="w-3.5 h-3.5" /></button>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* ── Locations Tab ── */}
        {activeTab === 'locations' && (
          <div>
            <div className="p-4 flex justify-end border-b border-gray-50 gap-2">
              {selectedLocationIds.size > 0 && (
                <button onClick={handleBulkDelete} className="btn-secondary text-red-600 border-red-100 bg-red-50 hover:bg-red-100 flex items-center gap-2 h-10 px-4 animate-in fade-in zoom-in duration-200">
                  <Trash2 className="w-4 h-4" /> Delete ({selectedLocationIds.size})
                </button>
              )}
              <button onClick={() => setLocationModal(true)} className="btn-primary flex items-center gap-2 text-sm h-10"><Plus className="w-4 h-4" /> Add Location</button>
            </div>

            {/* Desktop Table View */}
            <div className="hidden lg:block overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead className="bg-gray-50 text-xs uppercase text-gray-500">
                  <tr>
                    <th className="px-5 py-3 w-10">
                      <input
                        type="checkbox"
                        className="rounded border-gray-300 text-primary focus:ring-primary w-4 h-4 cursor-pointer"
                        checked={paginatedLocations.length > 0 && paginatedLocations.every(l => selectedLocationIds.has(l.id))}
                        onChange={toggleLocationAll}
                      />
                    </th>
                    <th className="px-5 py-3 font-medium">Name</th>
                    <th className="px-5 py-3 font-medium">Type</th>
                    <th className="px-5 py-3 font-medium">Country</th>
                    <th className="px-5 py-3 font-medium">Currency</th>
                    <th className="px-5 py-3 font-medium text-right">Stock Entries</th>
                    <th className="px-5 py-3 font-medium text-right">Total Units</th>
                    <th className="px-5 py-3 font-medium text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50 bg-white">
                  {paginatedLocations.length === 0 ? (
                    <tr><td colSpan={7} className="px-5 py-12 text-center text-gray-400 text-sm">No locations yet.</td></tr>
                  ) : paginatedLocations.map(l => {
                    const locInventory = inventory.filter(e => e.location_id === l.id);
                    const locUnits = locInventory.reduce((s, e) => s + e.quantity, 0);
                    return (
                      <tr key={l.id} className={clsx("hover:bg-gray-50/50 transition-colors", selectedLocationIds.has(l.id) && 'bg-primary/5')}>
                        <td className="px-5 py-3.5">
                          <input
                            type="checkbox"
                            className="rounded border-gray-300 text-primary focus:ring-primary w-4 h-4 cursor-pointer"
                            checked={selectedLocationIds.has(l.id)}
                            onChange={() => toggleSelect(selectedLocationIds, setSelectedLocationIds, l.id)}
                          />
                        </td>
                        <td className="px-5 py-3.5">
                          <div className="flex items-center gap-2.5">
                            <div className={clsx("w-8 h-8 rounded-lg flex items-center justify-center", l.type === 'warehouse' ? 'bg-blue-50 text-blue-600' : 'bg-violet-50 text-violet-600')}>
                              {l.type === 'warehouse' ? <WarehouseIcon className="w-4 h-4" /> : <Store className="w-4 h-4" />}
                            </div>
                            <span className="font-medium text-gray-900">{l.name}</span>
                          </div>
                        </td>
                        <td className="px-5 py-3.5"><span className={clsx("px-2.5 py-0.5 rounded-full text-xs font-medium", l.type === 'warehouse' ? 'bg-blue-100 text-blue-700' : 'bg-violet-100 text-violet-700')}>{l.type}</span></td>
                        <td className="px-5 py-3.5 text-gray-500">{l.country}</td>
                        <td className="px-5 py-3.5 text-gray-500">{l.currency}</td>
                        <td className="px-5 py-3.5 text-right font-medium text-gray-700 tabular-nums">{locInventory.length}</td>
                        <td className="px-5 py-3.5 text-right font-bold text-gray-900 tabular-nums">{locUnits.toLocaleString()}</td>
                        <td className="px-5 py-3.5 text-right">
                          <button title="Delete Location" onClick={() => setDeleteConfirmModal({ isOpen: true, isBulk: false, id: l.id, name: l.name, tab: 'locations' })} className="text-gray-400 hover:text-red-500 transition-colors p-1.5 rounded-lg bg-gray-50 hover:bg-red-50"><Trash2 className="w-3.5 h-3.5" /></button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Mobile & Tablet Card View */}
            <div className="lg:hidden p-4 sm:p-5">
              {paginatedLocations.length === 0 ? (
                <div className="text-center text-gray-400 text-sm py-12">No locations yet.</div>
              ) : (
                <div className="space-y-3">
                  {paginatedLocations.map(l => {
                    const locInventory = inventory.filter(e => e.location_id === l.id);
                    const locUnits = locInventory.reduce((s, e) => s + e.quantity, 0);
                    return (
                      <div key={l.id} className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm hover:shadow-md transition-all">
                        <div className="flex justify-between items-start gap-2 mb-3">
                          <div className="flex items-center gap-2.5">
                            <div className={clsx("w-9 h-9 rounded-lg flex items-center justify-center", l.type === 'warehouse' ? 'bg-blue-50 text-blue-600' : 'bg-violet-50 text-violet-600')}>
                              {l.type === 'warehouse' ? <WarehouseIcon className="w-4 h-4" /> : <Store className="w-4 h-4" />}
                            </div>
                            <h3 className="font-bold text-gray-900 text-sm">{l.name}</h3>
                          </div>
                          <button title="Delete Location" onClick={() => deleteLocation(l.id)} className="text-gray-400 hover:text-red-500 transition-colors p-2 rounded-lg bg-gray-50 hover:bg-red-50 flex-shrink-0"><Trash2 className="w-4 h-4" /></button>
                        </div>

                        <div className="grid grid-cols-2 gap-2 mb-3">
                          <div className="bg-blue-50 rounded-lg p-2.5 border border-blue-100">
                            <p className="text-[9px] uppercase font-bold text-blue-600 tracking-wider">Stock Entries</p>
                            <p className="text-sm font-bold text-blue-900 mt-0.5">{locInventory.length}</p>
                          </div>
                          <div className="bg-emerald-50 rounded-lg p-2.5 border border-emerald-100">
                            <p className="text-[9px] uppercase font-bold text-emerald-600 tracking-wider">Total Units</p>
                            <p className="text-sm font-bold text-emerald-900 mt-0.5">{locUnits.toLocaleString()}</p>
                          </div>
                        </div>

                        <div className="grid grid-cols-3 gap-2">
                          <div className="bg-gray-50 rounded-lg p-2.5 border border-gray-100">
                            <p className="text-[9px] uppercase font-bold text-gray-500 tracking-wider">Type</p>
                            <p className="text-xs font-bold text-gray-900 mt-0.5 capitalize">{l.type}</p>
                          </div>
                          <div className="bg-gray-50 rounded-lg p-2.5 border border-gray-100">
                            <p className="text-[9px] uppercase font-bold text-gray-500 tracking-wider">Country</p>
                            <p className="text-xs font-bold text-gray-900 mt-0.5">{l.country}</p>
                          </div>
                          <div className="bg-gray-50 rounded-lg p-2.5 border border-gray-100">
                            <p className="text-[9px] uppercase font-bold text-gray-500 tracking-wider">Currency</p>
                            <p className="text-xs font-bold text-gray-900 mt-0.5">{l.currency}</p>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Locations Pagination */}
            {locations.length > 0 && (
              <div className="px-4 sm:px-5 py-3 border-t border-gray-100 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-gray-500">
                <div className="flex items-center gap-3">
                  <span>Showing {locations.length > 0 ? ((locationsPage - 1) * pageSize) + 1 : 0}–{Math.min(locationsPage * pageSize, locations.length)} of {locations.length}</span>
                  <select
                    title="Rows per page"
                    value={pageSize}
                    onChange={e => {
                      setPageSize(Number(e.target.value));
                      setLocationsPage(1);
                    }}
                    className="border border-gray-200 rounded-lg px-2 py-1 text-xs bg-white font-medium"
                  >
                    {PAGE_SIZES.map(s => <option key={s} value={s}>{s} / page</option>)}
                  </select>
                </div>
                {Math.ceil(locations.length / pageSize) > 1 && (
                  <div className="flex items-center gap-1">
                    <button type="button" title="Previous page" disabled={locationsPage === 1} onClick={() => setLocationsPage(p => p - 1)} className="p-1.5 rounded-lg border border-gray-200 disabled:opacity-30"><ChevronLeft className="w-3.5 h-3.5" /></button>
                    <span className="px-3 font-bold">{locationsPage} / {Math.ceil(locations.length / pageSize)}</span>
                    <button type="button" title="Next page" disabled={locationsPage >= Math.ceil(locations.length / pageSize)} onClick={() => setLocationsPage(p => p + 1)} className="p-1.5 rounded-lg border border-gray-200 disabled:opacity-30"><ChevronRight className="w-3.5 h-3.5" /></button>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* ── Import History Tab ── */}
        {activeTab === 'imports' && (() => {
          const filteredSessions = importSessions.filter(s => {
            const loc = locations.find(l => l.id === s.location_id);
            const text = [s.fileName, loc?.name ?? '', s.date, String(s.itemCount)].join(' ').toLowerCase();
            return text.includes(importHistorySearch.toLowerCase());
          });

          return (
            <div className="p-4 sm:p-6 space-y-5">
              {/* Header */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-gray-100 pb-4">
                <div>
                  <h2 className="text-xl font-bold text-gray-900 flex items-center gap-2">
                    <div className="w-8 h-8 bg-indigo-100 rounded-xl flex items-center justify-center">
                      <History className="w-4 h-4 text-indigo-600" />
                    </div>
                    Import History
                  </h2>
                  <p className="text-sm text-gray-400 mt-1">View, fix, and manage all past stock imports</p>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-xs font-bold text-indigo-600 bg-indigo-50 border border-indigo-100 px-3 py-1 rounded-full">
                    {importSessions.length} import{importSessions.length !== 1 ? 's' : ''} saved
                  </span>
                  <button
                    onClick={() => setImportModalOpen(true)}
                    className="btn-primary flex items-center gap-2 text-sm"
                  >
                    <Upload className="w-4 h-4" /> New Import
                  </button>
                </div>
              </div>

              {/* Search */}
              <div className="relative max-w-sm">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  type="text"
                  placeholder="Search by file name, location…"
                  value={importHistorySearch}
                  onChange={e => setImportHistorySearch(e.target.value)}
                  className="w-full pl-9 pr-4 py-2 text-sm border border-gray-200 rounded-xl bg-white focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400 outline-none"
                />
              </div>

              {/* Session Cards */}
              {filteredSessions.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-20 text-center">
                  <div className="w-16 h-16 bg-gray-100 rounded-2xl flex items-center justify-center mb-4">
                    <History className="w-8 h-8 text-gray-300" />
                  </div>
                  <p className="text-gray-400 font-medium">No imports found</p>
                  <p className="text-gray-300 text-sm mt-1">Your import history will appear here after your first import</p>
                  <button onClick={() => setImportModalOpen(true)} className="btn-primary mt-4 text-sm flex items-center gap-2">
                    <Upload className="w-4 h-4" /> Start First Import
                  </button>
                </div>
              ) : (
                <div className="space-y-3">
                  {filteredSessions.map(session => {
                    const loc = locations.find(l => l.id === session.location_id);
                    const dateObj = new Date(session.date);
                    const dateStr = dateObj.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
                    const timeStr = dateObj.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });

                    return (
                      <div
                        key={session.id}
                        className="bg-white rounded-2xl border border-gray-100 shadow-sm hover:shadow-md hover:border-indigo-100 transition-all"
                      >
                        <div className="p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                          {/* Left: info */}
                          <div className="flex items-start gap-4">
                            <div className="w-12 h-12 bg-gradient-to-br from-indigo-100 to-purple-100 rounded-2xl flex items-center justify-center flex-shrink-0">
                              <FileText className="w-6 h-6 text-indigo-600" />
                            </div>
                            <div>
                              <div className="flex items-center gap-2 flex-wrap">
                                <h3 className="text-sm font-bold text-gray-900 line-clamp-1">{session.fileName}</h3>
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-emerald-50 border border-emerald-100 text-emerald-600 text-[10px] font-bold uppercase rounded-full">
                                  <CheckCircle className="w-3 h-3" /> Confirmed
                                </span>
                              </div>
                              <div className="flex items-center gap-3 mt-1 text-xs text-gray-400 flex-wrap">
                                <span className="flex items-center gap-1">
                                  <MapPin className="w-3 h-3" /> {loc?.name ?? session.location_id}
                                </span>
                                <span>·</span>
                                <span>{dateStr} at {timeStr}</span>
                                <span>·</span>
                                <span className="font-semibold text-indigo-600">{session.itemCount} SKUs</span>
                                <span>·</span>
                                <span className="font-semibold text-gray-600">{session.totalItems.toLocaleString()} units</span>
                                <span>·</span>
                                <span className="text-gray-500 uppercase tracking-widest text-[10px] font-bold">BY: {session.performed_by || 'System'}</span>
                              </div>
                              {/* Brand summary */}
                              <div className="flex flex-wrap gap-1 mt-2">
                                {[...new Set(session.items.map(i => i.brand))].slice(0, 5).map(b => (
                                  <span key={b} className="text-[10px] bg-gray-100 text-gray-500 rounded-full px-2 py-0.5 font-medium">{b}</span>
                                ))}
                                {[...new Set(session.items.map(i => i.brand))].length > 5 && (
                                  <span className="text-[10px] bg-gray-100 text-gray-500 rounded-full px-2 py-0.5 font-medium">
                                    +{[...new Set(session.items.map(i => i.brand))].length - 5} more
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>

                          {/* Right: actions */}
                          <div className="flex items-center gap-2 flex-shrink-0 flex-wrap justify-end">
                            <button
                              onClick={() => setViewItemsSession(session)}
                              className="px-3 py-2 bg-gray-100 text-gray-700 text-xs font-bold rounded-xl hover:bg-gray-200 transition-all shadow-sm flex items-center gap-1.5"
                            >
                              <Eye className="w-3.5 h-3.5" /> View Items
                            </button>
                            {/* Fix Stocks Report download buttons */}
                            <div className="flex items-center gap-1">
                              <button
                                title="Download Full Fix Stocks Report (all items, all statuses)"
                                onClick={async () => {
                                  try {
                                    const { exportFixStocksReport } = await import('../lib/bulkOperations');
                                    const loc = locations.find(l => l.id === session.location_id);
                                    // Pass raw session items — the export function normalises field names
                                    const reportItems = session.items.map((it: any) => ({
                                      item_name:      it.item_name,
                                      sku:            it.sku,
                                      brand:          it.brand,
                                      invoiceQty:     it.invoiceQty   ?? 0,
                                      receivedQty:    it.receivedQty  ?? 0,
                                      // newReceivedQty = same as receivedQty when downloaded from card (no live fix open)
                                      newReceivedQty: it.receivedQty  ?? 0,
                                    }));
                                    await exportFixStocksReport({
                                      filename: `FixStocks_Full_${session.fileName.replace(/[^a-zA-Z0-9]/g, '_')}`,
                                      items: reportItems,
                                      adjustedOnly: false,
                                      sessionMeta: {
                                        fileName:     session.fileName,
                                        locationName: loc?.name ?? session.location_id,
                                        importDate:   new Date(session.date).toLocaleString(),
                                      }
                                    });
                                  } catch (e: any) { alert('Export failed: ' + e.message); }
                                }}
                                className="flex items-center gap-1.5 px-3 py-2 bg-purple-50 text-purple-700 text-xs font-bold rounded-xl hover:bg-purple-100 transition-all shadow-sm border border-purple-100"
                              >
                                <FileText className="w-3 h-3" /> Full Report
                              </button>
                              <button
                                title="Download Changed & New Items Report only"
                                onClick={async () => {
                                  try {
                                    const { exportFixStocksReport } = await import('../lib/bulkOperations');
                                    const loc = locations.find(l => l.id === session.location_id);
                                    const reportItems = session.items.map((it: any) => ({
                                      item_name:      it.item_name,
                                      sku:            it.sku,
                                      brand:          it.brand,
                                      invoiceQty:     it.invoiceQty   ?? 0,
                                      receivedQty:    it.receivedQty  ?? 0,
                                      newReceivedQty: it.receivedQty  ?? 0,
                                    }));
                                    await exportFixStocksReport({
                                      filename: `FixStocks_Changed_${session.fileName.replace(/[^a-zA-Z0-9]/g, '_')}`,
                                      items: reportItems,
                                      adjustedOnly: true,   // only changed/new items
                                      sessionMeta: {
                                        fileName:     session.fileName,
                                        locationName: loc?.name ?? session.location_id,
                                        importDate:   new Date(session.date).toLocaleString(),
                                      }
                                    });
                                  } catch (e: any) { alert('Export failed: ' + e.message); }
                                }}
                                className="flex items-center gap-1.5 px-3 py-2 bg-emerald-50 text-emerald-700 text-xs font-bold rounded-xl hover:bg-emerald-100 transition-all shadow-sm border border-emerald-100"
                              >
                                <FileText className="w-3 h-3" /> Changed
                              </button>
                            </div>
                            <button
                              onClick={() => openFixModal(session)}
                              className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white text-xs font-bold rounded-xl hover:bg-indigo-700 transition-all shadow-sm hover:shadow-md"
                            >
                              <Edit3 className="w-3.5 h-3.5" /> Fix Stocks
                            </button>
                            <button
                              onClick={() => setDeleteSessionConfirm(session.id)}
                              className="p-2 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-xl transition-all"
                              title="Delete this import record"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </div>

                        {/* Inline preview removed */}
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Delete Confirm */}
              {deleteSessionConfirm && (
                <Modal isOpen onClose={() => setDeleteSessionConfirm(null)} title="Delete Import Record" size="sm">
                          <div className="text-center py-4">
                    <div className="w-14 h-14 bg-red-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
                      <AlertTriangle className="w-7 h-7 text-red-500" />
                    </div>
                    <p className="text-gray-700 font-medium">Delete this import record?</p>
                    <p className="text-sm text-gray-400 mt-1">This will only remove the history log. <strong>Inventory quantities will NOT change.</strong></p>
                  </div>
                  <div className="flex gap-3 pt-4">
                    <button onClick={() => setDeleteSessionConfirm(null)} className="flex-1 btn-secondary">Cancel</button>
                    <button
                      onClick={async () => {
                        await deleteImportSession(deleteSessionConfirm);
                        setDeleteSessionConfirm(null);
                      }}
                      className="flex-1 py-2 bg-red-600 text-white text-sm font-bold rounded-xl hover:bg-red-700"
                    >
                      Delete Record
                    </button>
                  </div>
                </Modal>
              )}

              {/* ── View Items Modal ── */}
              {viewItemsSession && (
                <Modal
                  isOpen={!!viewItemsSession}
                  onClose={() => setViewItemsSession(null)}
                  title={`View Items — ${viewItemsSession.fileName}`}
                  description={`Review the imported items and their adjusted stocks for ${locations.find(l => l.id === viewItemsSession.location_id)?.name ?? viewItemsSession.location_id}.`}
                  size="xl"
                >
                  <div className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm flex flex-col h-[60vh]">
                    <div className="overflow-y-auto flex-1 p-0 m-0">
                      <table className="w-full text-left text-sm whitespace-nowrap">
                        <thead className="bg-gray-50/80 sticky top-0 z-10 text-xs font-semibold text-gray-500 uppercase tracking-wider backdrop-blur-sm shadow-sm">
                          <tr>
                            <th className="px-4 py-3">Item</th>
                            <th className="px-4 py-3">Brand</th>
                            <th className="px-4 py-3">SKU</th>
                            <th className="px-4 py-3 text-right">Invoice Qty</th>
                            <th className="px-4 py-3 text-right">Received Qty</th>
                            <th className="px-4 py-3 text-right">Difference</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                          {viewItemsSession.items.map((it, idx) => {
                            const isAdjusted = it.invoiceQty !== it.receivedQty;
                            const diff = (it.receivedQty || 0) - (it.invoiceQty || 0);
                            let diffColor = "text-gray-400";
                            if (diff > 0) diffColor = "text-emerald-600 font-bold";
                            if (diff < 0) diffColor = "text-red-600 font-bold";

                            return (
                              <tr key={idx} className={isAdjusted ? "bg-amber-50/60 hover:bg-amber-100/50 transition-colors border-l-2 border-l-amber-400" : "hover:bg-gray-50/50 transition-colors border-l-2 border-l-transparent"}>
                                <td className="px-4 py-3 font-medium text-gray-900">{it.item_name}</td>
                                <td className="px-4 py-3 text-gray-500">
                                  <span className="px-2 py-0.5 bg-gray-100 rounded text-xs">{it.brand}</span>
                                </td>
                                <td className="px-4 py-3 text-gray-400 text-xs font-mono">{it.sku}</td>
                                <td className="px-4 py-3 text-right font-medium text-gray-600">{it.invoiceQty}</td>
                                <td className={`px-4 py-3 text-right font-bold ${isAdjusted ? 'text-amber-600' : 'text-indigo-600'}`}>{it.receivedQty}</td>
                                <td className={`px-4 py-3 text-right ${diffColor}`}>
                                  {diff > 0 ? `+${diff}` : diff}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                  <div className="flex justify-end gap-3 pt-4 mt-4 border-t border-gray-100">
                    <button
                        onClick={async () => {
                          try {
                            const { printFixStocksPDF } = await import('../lib/bulkOperations');
                            const locName = locations.find(l => l.id === viewItemsSession.location_id)?.name ?? viewItemsSession.location_id;
                            await printFixStocksPDF({
                              filename: `ViewItems_Report_${viewItemsSession.fileName.replace(/[^a-zA-Z0-9]/g, '_')}`,
                              items: viewItemsSession.items.map(it => ({
                                ...it,
                                originalReceivedQty: it.invoiceQty,
                                newReceivedQty: it.receivedQty
                              })),
                              adjustedOnly: false,
                              sessionMeta: {
                                fileName: viewItemsSession.fileName,
                                locationName: locName,
                                importDate: new Date(viewItemsSession.date).toLocaleString('en-IN')
                              }
                            });
                          } catch (e: any) {
                            alert('Export failed: ' + e.message);
                          }
                        }}
                        className="btn-secondary flex items-center gap-2"
                      >
                        <Printer className="w-4 h-4" /> Download PDF
                    </button>
                    <button onClick={() => setViewItemsSession(null)} className="btn-secondary">Close</button>
                  </div>
                </Modal>
              )}

              {/* ── Fix Stocks Modal ── */}
              {(isFixModalOpen || isFixModalMinimized) && selectedSession && (
                <Modal
                  isOpen={isFixModalOpen || isFixModalMinimized}
                  onClose={() => { setIsFixModalOpen(false); setIsFixModalMinimized(false); }}
                  minimized={isFixModalMinimized}
                  onMinimize={() => { setIsFixModalMinimized(true); setIsFixModalOpen(false); }}
                  onRestore={() => { setIsFixModalMinimized(false); setIsFixModalOpen(true); }}
                  title={`Reconcile Import — ${selectedSession.fileName}`}
                  minimizeLabel={`Reconciling ${selectedSession.fileName}`}
                  description={`Review and adjust received stock quantities for ${locations.find(l => l.id === selectedSession.location_id)?.name ?? selectedSession.location_id}. Adjustments directly sync to live inventory and transactions.`}
                  size="xl"
                >
                  <div className="space-y-4">
                    {/* Search & Quick Actions bar */}
                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-gray-50/50 p-3 rounded-xl border border-gray-150">
                      {/* Search box */}
                      <div className="relative flex-1 max-w-sm">
                        <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
                        <input
                          type="text"
                          placeholder="Search by brand, item name, or SKU..."
                          value={fixModalSearch}
                          onChange={e => setFixModalSearch(e.target.value)}
                          className="w-full pl-9 pr-8 py-1.5 text-xs border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-300 focus:border-indigo-400 bg-white"
                        />
                        {fixModalSearch && (
                          <button
                            type="button"
                            onClick={() => setFixModalSearch('')}
                            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-650"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>

                      {/* Add Item to Session */}
                      <div className="w-auto flex-shrink-0 relative">
                        {showQuickAddItem ? (
                           <div className="absolute right-0 top-10 z-50 bg-white border border-indigo-200 shadow-xl rounded-xl p-3 w-80">
                             <div className="text-xs font-bold text-indigo-900 mb-2 flex justify-between items-center">
                               <span>✨ Create New Item</span>
                               <button onClick={() => setShowQuickAddItem(false)} className="text-gray-400 hover:text-red-500"><X className="w-4 h-4"/></button>
                             </div>
                             <div className="space-y-2">
                               <select
                                 value={quickAddItemData.brand_id}
                                 onChange={e => setQuickAddItemData({...quickAddItemData, brand_id: e.target.value})}
                                 className="w-full text-xs p-1.5 border rounded bg-gray-50 focus:ring-1 focus:ring-indigo-300"
                               >
                                 <option value="">Select Brand...</option>
                                 {brands.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                               </select>
                               <input 
                                 placeholder="Item Name (e.g., ADULT JOGGING PANTS)" 
                                 value={quickAddItemData.name}
                                 onChange={e => setQuickAddItemData({...quickAddItemData, name: e.target.value})}
                                 className="w-full text-xs p-1.5 border rounded bg-gray-50 focus:ring-1 focus:ring-indigo-300"
                               />
                               <input 
                                 placeholder="SKU (e.g., SW-003K)" 
                                 value={quickAddItemData.sku}
                                 onChange={e => setQuickAddItemData({...quickAddItemData, sku: e.target.value})}
                                 className="w-full text-xs p-1.5 border rounded bg-gray-50 focus:ring-1 focus:ring-indigo-300"
                               />
                               <button
                                 onClick={async () => {
                                   if (!quickAddItemData.brand_id || !quickAddItemData.name || !quickAddItemData.sku) return alert('Please fill all fields');
                                   try {
                                     const newItemId = doc(collection(db, 'items')).id;
                                     await setDoc(doc(db, 'items', newItemId), {
                                       id: newItemId,
                                       brand_id: quickAddItemData.brand_id,
                                       name: quickAddItemData.name,
                                       sku: quickAddItemData.sku,
                                       category: 'Uncategorized',
                                       min_stock_limit: 0
                                     });
                                     
                                     // Add to session
                                     setFixItems(prev => [{
                                        unique_id: `${newItemId}_${Date.now()}`,
                                        item_id: newItemId,
                                        item_name: quickAddItemData.name,
                                        sku: quickAddItemData.sku,
                                        brand: brands.find(b => b.id === quickAddItemData.brand_id)?.name ?? 'Unknown',
                                        invoiceQty: 0,
                                        currentQty: 0,
                                        originalReceivedQty: 0,
                                        newReceivedQty: 1,
                                        diff: 1,
                                        itemDeleted: false,
                                        stockRecordDeleted: false,
                                        sessionItemIndex: -1
                                     }, ...prev]);
                                     
                                     setShowQuickAddItem(false);
                                     setQuickAddItemData({ brand_id: '', name: '', sku: '' });
                                   } catch(err) {
                                     alert('Failed to create item');
                                   }
                                 }}
                                 className="w-full bg-indigo-600 text-white text-xs font-bold py-1.5 rounded hover:bg-indigo-700 mt-1"
                               >
                                 Save & Add to Session
                               </button>
                             </div>
                           </div>
                        ) : (
                          <select
                            className="w-full max-w-[250px] text-xs py-1.5 px-3 border border-gray-200 rounded-lg outline-none focus:ring-2 focus:ring-indigo-300 bg-white"
                            value=""
                            onChange={e => {
                              if (!e.target.value) return;
                              if (e.target.value === 'NEW_ITEM') {
                                setShowQuickAddItem(true);
                                return;
                              }
                              const itemId = e.target.value;
                              if (!fixItems.find(f => f.item_id === itemId)) {
                                const item = items.find(i => i.id === itemId);
                                if (item) {
                                  const existingInv = inventory.find(inv => inv.location_id === selectedSession.location_id && inv.item_id === itemId);
                                  setFixItems(prev => [{
                                    unique_id: `${item.id}_${Date.now()}`,
                                    item_id: item.id,
                                    item_name: item.name,
                                    sku: item.sku || 'No SKU',
                                    brand: brands.find(b => b.id === item.brand_id)?.name ?? 'Unknown',
                                    invoiceQty: 0,
                                    currentQty: existingInv?.quantity ?? 0,
                                    originalReceivedQty: 0,
                                    newReceivedQty: 1,
                                    diff: 1,
                                    itemDeleted: false,
                                    stockRecordDeleted: false,
                                    sessionItemIndex: -1
                                  }, ...prev]);
                                }
                              }
                            }}
                          >
                            <option value="">+ Add Item to Session...</option>
                            <option value="NEW_ITEM" className="font-bold text-indigo-600 bg-indigo-50">✨ Create New Item...</option>
                            {Array.from(new Set(items.map(i => i.brand_id))).map(brandId => {
                              const brandItems = items.filter(i => i.brand_id === brandId);
                              const brandName = brands.find(b => b.id === brandId)?.name || 'Unknown Brand';
                              return (
                                <optgroup key={brandId} label={brandName}>
                                  {brandItems.map(i => (
                                    <option key={i.id} value={i.id}>
                                      {i.name} ({i.sku})
                                    </option>
                                  ))}
                                </optgroup>
                              );
                            })}
                          </select>
                        )}
                      </div>

                      {/* Quick tools */}
                      <div className="flex items-center gap-2 flex-wrap text-xs ml-auto">
                        <span className="text-gray-400 font-semibold hidden lg:inline">Quick Actions:</span>
                        <button
                          type="button"
                          onClick={() => setFixItems(prev => prev.map(r => ({ ...r, newReceivedQty: r.originalReceivedQty, diff: 0 })))}
                          className="px-3 py-1.5 bg-gray-100 rounded-lg hover:bg-gray-200 text-gray-650 font-medium transition"
                        >Reset All</button>
                        <button
                          type="button"
                          onClick={() => setFixItems(prev => prev.map(r => {
                            const diff = r.invoiceQty - r.originalReceivedQty;
                            return { ...r, newReceivedQty: r.invoiceQty, diff };
                          }))}
                          className="px-3 py-1.5 bg-emerald-50 text-emerald-600 border border-emerald-100 rounded-lg hover:bg-emerald-100 font-medium transition"
                        >Match Invoice</button>
                      </div>
                    </div>

                    {/* Table */}
                    <div className="overflow-x-auto rounded-xl border border-gray-150 max-h-[500px] overflow-y-auto">
                      <table className="w-full text-sm">
                        <thead className="bg-gray-50 border-b border-gray-150 sticky top-0 z-10">
                          <tr>
                            <th className="text-left px-4 py-3 text-[11px] font-bold text-gray-500 uppercase tracking-wide">Item</th>
                            <th className="text-left px-4 py-3 text-[11px] font-bold text-gray-500 uppercase tracking-wide">Brand</th>
                            <th className="text-left px-4 py-3 text-[11px] font-bold text-gray-500 uppercase tracking-wide">SKU</th>
                            <th className="text-right px-4 py-3 text-[11px] font-bold text-gray-500 uppercase tracking-wide">Invoice Qty</th>
                            <th className="text-right px-4 py-3 text-[11px] font-bold text-indigo-650 uppercase tracking-wide">Received Qty</th>
                            <th className="text-right px-4 py-3 text-[11px] font-bold text-gray-500 uppercase tracking-wide">Mismatch</th>
                            <th className="text-right px-4 py-3 text-[11px] font-bold text-gray-500 uppercase tracking-wide">Current Stock</th>
                            <th className="text-right px-4 py-3 text-[11px] font-bold text-gray-500 uppercase tracking-wide">Live Impact</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                          {filteredFixItems.map((row) => {
                            const mismatch = row.newReceivedQty - row.invoiceQty;
                            return (
                              <tr key={row.unique_id} className={clsx('transition-colors', row.diff !== 0 ? 'bg-indigo-50/40' : 'bg-white hover:bg-gray-50/50')}>
                                <td className="px-4 py-2.5">
                                  <div className="flex flex-col gap-0.5">
                                    <span className="text-xs font-semibold text-gray-900">{row.item_name}</span>
                                    <div className="flex items-center gap-1.5 flex-wrap">
                                      {row.itemDeleted && (
                                        <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[9px] font-bold bg-rose-100 text-rose-700 border border-rose-200">
                                          ⚠️ Item Deleted
                                        </span>
                                      )}
                                      {!row.itemDeleted && row.stockRecordDeleted && (
                                        <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[9px] font-bold bg-amber-100 text-amber-700 border border-amber-200">
                                          ⚠️ Stock Record Deleted
                                        </span>
                                      )}
                                    </div>
                                  </div>
                                </td>
                                <td className="px-4 py-2.5">
                                  <span className="text-[10px] bg-gray-100 text-gray-600 rounded-md px-2 py-0.5 font-medium">{row.brand}</span>
                                </td>
                                <td className="px-4 py-2.5 text-xs text-gray-400 font-mono">{row.sku || '—'}</td>
                                
                                {/* Invoice Qty */}
                                <td className="px-4 py-2.5 text-right text-xs font-semibold text-gray-500">
                                  {row.invoiceQty}
                                </td>

                                {/* Received Qty input */}
                                <td className="px-4 py-2.5 text-right">
                                  <div className="flex items-center justify-end gap-1">
                                    <button
                                      type="button"
                                      onClick={() => handleFixQtyChange(row.unique_id, Math.max(0, row.newReceivedQty - 1))}
                                      className="p-1 rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-500 transition"
                                    >
                                      <Minus className="w-3 h-3" />
                                    </button>
                                    <input
                                      type="number"
                                      min={0}
                                      value={row.newReceivedQty}
                                      onChange={e => handleFixQtyChange(row.unique_id, Math.max(0, Number(e.target.value)))}
                                      className="w-16 text-right text-xs font-bold text-indigo-700 border border-indigo-200 rounded-lg px-2 py-1 focus:ring-2 focus:ring-indigo-300 bg-white outline-none"
                                    />
                                    <button
                                      type="button"
                                      onClick={() => handleFixQtyChange(row.unique_id, row.newReceivedQty + 1)}
                                      className="p-1 rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-500 transition"
                                    >
                                      <Plus className="w-3 h-3" />
                                    </button>
                                  </div>
                                </td>

                                {/* Mismatch display */}
                                <td className="px-4 py-2.5 text-right">
                                  <span className={clsx(
                                    'text-xs font-bold px-2.5 py-0.5 rounded-full border',
                                    mismatch > 0 ? 'bg-emerald-50 text-emerald-600 border-emerald-100' :
                                    mismatch < 0 ? 'bg-rose-50 text-rose-600 border-rose-100' :
                                    'bg-gray-50 text-gray-400 border-gray-200'
                                  )}>
                                    {mismatch > 0 ? `+${mismatch}` : mismatch < 0 ? `${mismatch}` : 'Match'}
                                  </span>
                                </td>

                                {/* Current stock display */}
                                <td className="px-4 py-2.5 text-right text-xs font-medium text-gray-500">
                                  {row.currentQty}
                                </td>

                                {/* Live stock impact display */}
                                <td className="px-4 py-2.5 text-right">
                                  <span className={clsx(
                                    'text-xs font-bold px-2 py-0.5 rounded-md',
                                    row.diff > 0 ? 'text-emerald-600 bg-emerald-50/50' :
                                    row.diff < 0 ? 'text-rose-600 bg-rose-50/50' :
                                    'text-gray-300'
                                  )}>
                                    {row.diff > 0 ? `+${row.diff} Live` : row.diff < 0 ? `${row.diff} Live` : '—'}
                                  </span>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>

                    {/* Summary footer */}
                    <div className="flex flex-col sm:flex-row items-center justify-between bg-gray-50 rounded-xl px-4 py-3 border border-gray-150 gap-4">
                      <div className="text-xs text-gray-500">
                        <span className="font-bold text-indigo-600">{fixItems.filter(r => r.diff !== 0).length}</span> item(s) will be changed
                      </div>
                      <div className="flex flex-wrap items-center gap-3">
                        <button
                          type="button"
                          onClick={async () => {
                            setFixSaving(true);
                            try {
                              const { exportFixStocksReport } = await import('../lib/bulkOperations');
                              const loc = locations.find(l => l.id === selectedSession?.location_id);
                              await exportFixStocksReport({
                                filename: `Import_Fix_Report_Full_${new Date().toISOString().split('T')[0]}`,
                                // fixItems already has invoiceQty, originalReceivedQty, newReceivedQty
                                items: fixItems,
                                adjustedOnly: false,
                                sessionMeta: {
                                  fileName:     selectedSession?.fileName,
                                  locationName: loc?.name ?? selectedSession?.location_id,
                                  importDate:   selectedSession ? new Date(selectedSession.date).toLocaleString() : undefined,
                                }
                              });
                            } catch (e: any) {
                              alert('Export failed: ' + e.message);
                            } finally {
                              setFixSaving(false);
                            }
                          }}
                          className="btn-secondary text-xs h-9 px-3 font-bold border-purple-200 hover:bg-purple-50 hover:text-purple-600 flex items-center gap-2"
                        >
                          <FileText className="w-3 h-3" /> Full Report
                        </button>
                        <button
                          type="button"
                          onClick={async () => {
                            setFixSaving(true);
                            try {
                              const { exportFixStocksReport } = await import('../lib/bulkOperations');
                              const loc = locations.find(l => l.id === selectedSession?.location_id);
                              await exportFixStocksReport({
                                filename: `Import_Fix_Report_Changed_${new Date().toISOString().split('T')[0]}`,
                                items: fixItems,
                                adjustedOnly: true,
                                sessionMeta: {
                                  fileName:     selectedSession?.fileName,
                                  locationName: loc?.name ?? selectedSession?.location_id,
                                  importDate:   selectedSession ? new Date(selectedSession.date).toLocaleString() : undefined,
                                }
                              });
                            } catch (e: any) {
                              alert('Export failed: ' + e.message);
                            } finally {
                              setFixSaving(false);
                            }
                          }}
                          className="btn-secondary text-xs h-9 px-3 font-bold border-emerald-200 hover:bg-emerald-50 hover:text-emerald-600 flex items-center gap-2"
                        >
                          <FileText className="w-3 h-3" /> Changed Only
                        </button>

                        <button type="button" onClick={() => { setIsFixModalOpen(false); setIsFixModalMinimized(false); }} className="px-4 py-2 text-sm font-medium text-gray-650 bg-white border border-gray-200 rounded-xl hover:bg-gray-50">
                          Cancel
                        </button>
                        <button
                          type="button"
                          onClick={handleApplyFixes}
                          disabled={fixSaving || fixItems.filter(r => r.diff !== 0).length === 0}
                          className="px-6 py-2 bg-indigo-600 text-white text-sm font-bold rounded-xl hover:bg-indigo-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-sm"
                        >
                          {fixSaving ? 'Applying…' : `Apply Fixes (${fixItems.filter(r => r.diff !== 0).length})`}
                        </button>
                      </div>
                    </div>
                  </div>
                </Modal>
              )}
            </div>
          );
        })()}

        {/* ── Settings Tab ── */}
        {activeTab === 'settings' && (

          <div className="p-4 sm:p-6 space-y-8">
            <div className="flex items-center justify-between border-b border-gray-100 pb-4">
              <div>
                <h2 className="text-xl font-bold text-gray-900 tracking-tight">System Settings</h2>
                <p className="text-sm text-gray-400 mt-1">Configure global platform parameters and exchange rates</p>
              </div>
              <div className="flex gap-2">
                <div className="px-3 py-1 bg-gray-100 text-gray-600 rounded-full text-[10px] font-bold uppercase tracking-widest border border-gray-200">Manual Mode Active</div>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {/* Exchange Rates Segment */}
              <div className="md:col-span-2 space-y-4">
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center">
                    <Globe2 className="w-4 h-4" />
                  </div>
                  <h3 className="text-sm font-bold text-gray-900 uppercase tracking-wider">Exchange Rates (Per 1 USD)</h3>
                </div>

                <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50 border-b border-gray-100">
                      <tr>
                        <th className="px-5 py-3 text-left font-bold text-gray-500 uppercase tracking-tighter">Currency Code</th>
                        <th className="px-5 py-3 text-right font-bold text-gray-500 uppercase tracking-tighter">Conversion Rate (from USD)</th>
                        <th className="px-5 py-3 text-right font-bold text-gray-500 uppercase tracking-tighter">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {CURRENCIES.map(curr => {
                        const rates = useStore.getState().exchangeRates;
                        const rate = rates[curr] ?? 1;
                        return (
                          <tr key={curr} className="hover:bg-gray-50/50 transition-colors">
                            <td className="px-5 py-4">
                              <div className="flex items-center gap-3">
                                <div className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center font-black text-[10px] text-gray-500">
                                  {curr}
                                </div>
                                <span className="font-bold text-gray-900">{curr}</span>
                              </div>
                            </td>
                            <td className="px-5 py-4 text-right">
                              <p className="text-base font-black text-gray-900 tabular-nums">1 USD = {rate.toFixed(2)} {curr}</p>
                              <p className="text-[10px] text-gray-400 font-medium">Manual calculation applied</p>
                            </td>
                            <td className="px-5 py-4 text-right">
                              <button
                                type="button"
                                onClick={() => {
                                  const newRate = prompt(`Update exchange rate: 1 USD = ? ${curr}`, rate.toString());
                                  if (newRate && !isNaN(Number(newRate))) {
                                    setDoc(doc(db, 'exchange_rates', curr), { rate: Number(newRate) }, { merge: true });
                                    alert(`1 USD is now set to ${newRate} ${curr} successfully.`);
                                  }
                                }}
                                className="text-xs font-bold text-primary hover:underline px-3 py-1 bg-primary/5 rounded-lg transition-all"
                              >
                                Edit Rate
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Tips Segment */}
              <div className="space-y-4">
                 <div className="bg-blue-600 rounded-2xl p-6 text-white shadow-lg shadow-blue-200">
                    <TrendingUp className="w-8 h-8 opacity-50 mb-4" />
                    <h3 className="text-lg font-black tracking-tight leading-tight">Financial Accuracy</h3>
                    <p className="text-blue-100 text-xs mt-2 leading-relaxed">System-wide profitability and costs are re-calculated instantly when exchange rates are modified. Ensure you update these during significant market shifts.</p>
                 </div>
                 
                 <div className="bg-gray-50 rounded-2xl p-5 border border-gray-200">
                    <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-3">Sync Status</p>
                    <div className="space-y-3">
                       <div className="flex items-center justify-between border-b border-gray-100 pb-2">
                          <span className="text-xs font-bold text-gray-600">Database Engine</span>
                          <span className="text-xs font-black text-emerald-600 uppercase">Firestore Live</span>
                       </div>
                       <div className="flex items-center justify-between border-b border-gray-100 pb-2">
                          <span className="text-xs font-bold text-gray-600">Region</span>
                          <span className="text-xs font-black text-gray-600">Global (Multi-AZ)</span>
                       </div>
                       <div className="flex items-center justify-between">
                          <span className="text-xs font-bold text-gray-600">Network Latency</span>
                          <span className="text-xs font-black text-emerald-600">Optimized</span>
                       </div>
                    </div>
                 </div>
              </div>
            </div>
            
            <div className="mt-12 pt-8 border-t border-gray-100">
              <div className="max-w-4xl">
                <h3 className="text-sm font-black text-gray-900 uppercase tracking-widest mb-2">System Maintenance</h3>
                <p className="text-xs text-gray-400 mb-6">Administrative tools for data purging and system resets. Use with extreme caution.</p>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
                  {/* Master Data Reset */}
                  <div className="bg-orange-50 border border-orange-100 rounded-2xl p-6">
                    <div className="flex items-start gap-4">
                      <div className="w-10 h-10 rounded-xl bg-orange-100 flex items-center justify-center text-orange-600 flex-shrink-0">
                        <Boxes className="w-5 h-5" />
                      </div>
                      <div>
                        <h4 className="text-sm font-black text-orange-900 uppercase tracking-tight">Reset Product Catalog</h4>
                        <p className="text-[11px] text-orange-700/70 mt-1 leading-relaxed">
                          Deletes all <strong className="text-orange-900">Brands, Items, Containers, and Active Stock</strong>. 
                          Transaction history and locations remain intact.
                        </p>
                        <button 
                          onClick={async () => {
                            if (window.confirm("ARE YOU SURE? This will delete all Items and Brands. History will remain but may have broken references.")) {
                               setSaving(true);
                               try { await clearMasterData(); alert("Product catalog cleared."); } catch (err: any) { alert(err.message); } finally { setSaving(false); }
                            }
                          }}
                          disabled={saving}
                          className="mt-4 bg-orange-600 hover:bg-orange-700 text-white px-5 py-2 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all disabled:opacity-50"
                        >
                          Clear Catalog
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* History Purge */}
                  <div className="bg-red-50 border border-red-100 rounded-2xl p-6">
                    <div className="flex items-start gap-4">
                      <div className="w-10 h-10 rounded-xl bg-red-100 flex items-center justify-center text-red-600 flex-shrink-0">
                        <Trash2 className="w-5 h-5" />
                      </div>
                      <div>
                        <h4 className="text-sm font-black text-red-900 uppercase tracking-tight">Purge System History</h4>
                        <p className="text-[11px] text-red-700/70 mt-1 leading-relaxed">
                          Permanently deletes all <strong className="text-red-900">Transactions, Sales, Returns, Expenses, and Notifications</strong>. 
                          Items and active stock are preserved.
                        </p>
                        <button 
                          onClick={async () => {
                            if (window.confirm("CRITICAL: This will permanently delete ALL historical records. This action cannot be undone.")) {
                               setSaving(true);
                               try { await clearHistory(); alert("History purged successfully."); } catch (err: any) { alert(err.message); } finally { setSaving(false); }
                            }
                          }}
                          disabled={saving}
                          className="mt-4 bg-red-600 hover:bg-red-700 text-white px-5 py-2 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all disabled:opacity-50"
                        >
                          Purge All History
                        </button>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Location Specific Stock Reset */}
                <div className="bg-white rounded-2xl border border-gray-100 p-6 mb-8 shadow-sm">
                  <div className="flex items-start gap-4">
                    <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center text-primary flex-shrink-0">
                      <MapPin className="w-5 h-5" />
                    </div>
                    <div className="flex-1">
                      <h4 className="text-sm font-black text-gray-900 uppercase tracking-tight">Location Stock Reset</h4>
                      <p className="text-[11px] text-gray-400 mt-1 leading-relaxed">
                        Clear all active stock entries for a specific shop or warehouse.
                      </p>
                      
                      <div className="mt-4 flex flex-col sm:flex-row gap-3">
                        <select 
                          title="Select Location to Delete Stocks"
                          className="input-field max-w-xs text-xs h-10"
                          value={selectedPurgeLocation}
                          onChange={e => setSelectedPurgeLocation(e.target.value)}
                        >
                          <option value="">Select Location...</option>
                          <option value="ALL" className="font-bold text-red-600">ALL LOCATIONS</option>
                          {locations.map(l => (
                            <option key={l.id} value={l.id}>{l.name} ({l.type})</option>
                          ))}
                        </select>
                        <button 
                          onClick={async () => {
                            if (!selectedPurgeLocation) return alert("Please select a location.");
                            
                            const locName = selectedPurgeLocation === 'ALL' 
                              ? 'ALL LOCATIONS' 
                              : locations.find(l => l.id === selectedPurgeLocation)?.name;
                              
                            const confirmMsg = selectedPurgeLocation === 'ALL'
                              ? `WARNING: You are about to DELETE ALL STOCKS across ALL LOCATIONS. This cannot be undone. Proceed?`
                              : `Delete all stocks for ${locName}? This only affects inventory records for this location.`;
                              
                            if (window.confirm(confirmMsg)) {
                               setSaving(true);
                               try { 
                                 await clearLocationStock(selectedPurgeLocation); 
                                 alert(`Stocks for ${locName} deleted.`); 
                               } catch (err: any) { 
                                 alert(err.message); 
                               } finally { 
                                 setSaving(false); 
                               }
                            }
                          }}
                          disabled={saving || !selectedPurgeLocation}
                          className="bg-red-600 hover:bg-red-700 text-white px-6 py-2 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all disabled:opacity-50"
                        >
                          DELETE STOCKS
                        </button>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="bg-white rounded-2xl border border-gray-100 p-6">
                  <h3 className="text-sm font-black text-gray-900 uppercase tracking-widest mb-4">UI Label Standards</h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="p-4 rounded-xl bg-gray-50 border border-gray-100">
                      <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">Old: Intelligence Matrix</p>
                      <p className="text-xs font-black text-primary">New: Analytics</p>
                    </div>
                    <div className="p-4 rounded-xl bg-gray-50 border border-gray-100">
                      <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">Old: Logistics Flow</p>
                      <p className="text-xs font-black text-primary">New: Stock Transfer</p>
                    </div>
                    <div className="p-4 rounded-xl bg-gray-50 border border-gray-100">
                      <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">Old: Command Center</p>
                      <p className="text-xs font-black text-primary">New: Dashboard</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

    {/* ── Modals ── */}
      <Modal isOpen={locationModal} onClose={() => setLocationModal(false)} title="Add Location" description="Define a warehouse or shop location." size="sm">
        <form onSubmit={handleAddLocation} className="space-y-4">
          <div>
            <label className="label">Name</label>
            <input required className="input-field" placeholder="e.g. Mumbai Warehouse" value={locationForm.name} onChange={e => setLocationForm(f => ({ ...f, name: e.target.value }))} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">Type</label>
              <select title="Location Type" className="input-field bg-white" value={locationForm.type} onChange={e => setLocationForm(f => ({ ...f, type: e.target.value as any }))}>
                <option value="warehouse">Warehouse</option>
                <option value="shop">Shop</option>
              </select>
            </div>
            <div>
              <label className="label">Country</label>
              <select title="Country" className="input-field bg-white" value={locationForm.country} onChange={e => {
                const country = COUNTRIES.find(c => c.name === e.target.value);
                setLocationForm(f => ({ ...f, country: e.target.value, currency: country?.currency ?? 'USD' }));
              }}>
                {COUNTRIES.map(c => <option key={c.name}>{c.name}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Currency</label>
              <select title="Currency" className="input-field bg-white" value={locationForm.currency} onChange={e => setLocationForm(f => ({ ...f, currency: e.target.value }))}>
                {CURRENCIES.map(c => <option key={c}>{c}</option>)}
              </select>
            </div>
          </div>
          <div className="flex justify-end gap-3 pt-3 border-t border-gray-100">
            <button type="button" className="btn-secondary" onClick={() => setLocationModal(false)}>Cancel</button>
            <button type="submit" className="btn-primary" disabled={saving}>{saving ? 'Saving…' : 'Add Location'}</button>
          </div>
        </form>
      </Modal>

      <Modal isOpen={brandModal} onClose={() => setBrandModal(false)} title="Add Brand" description="Register a new product brand." size="sm">
        <form onSubmit={handleAddBrand} className="space-y-4">
          <div>
            <label className="label">Brand Name</label>
            <input required className="input-field" placeholder="e.g. Zara" value={brandForm.name} onChange={e => setBrandForm(f => ({ ...f, name: e.target.value }))} />
          </div>
          <div>
            <label className="label">Origin Country</label>
            <select title="Origin Country" className="input-field bg-white" value={brandForm.origin_country} onChange={e => setBrandForm(f => ({ ...f, origin_country: e.target.value }))}>
              {COUNTRIES.map(c => <option key={c.name}>{c.name}</option>)}
            </select>
          </div>
          <div className="flex justify-end gap-3 pt-3 border-t border-gray-100">
            <button type="button" className="btn-secondary" onClick={() => setBrandModal(false)}>Cancel</button>
            <button type="submit" className="btn-primary" disabled={saving}>{saving ? 'Saving…' : 'Add Brand'}</button>
          </div>
        </form>
      </Modal>

      <Modal isOpen={itemModal} onClose={() => { setItemModal(false); setEditingItemId(null); setIsManualBrand(false); setItemForm({ id: '', brand_id: '', name: '', category: '', sku: '', min_stock_limit: 0, avg_cost_USD: 0, retail_price: 0, stock: 0, inventory_id: '', location_id: '', brand_manual: '' }); }} title={editingItemId ? "Edit Item & Pricing" : "Add Item"} description={editingItemId ? "Update product details and pricing." : "Define a new product/SKU."} size="md">
        <form onSubmit={handleAddItem} className="space-y-4">
          <div className="bg-gray-50 border border-gray-100 rounded-2xl p-4">
            <div className="flex items-center justify-between mb-2">
              <label className="label mb-0">Brand Information</label>
              <button 
                type="button" 
                onClick={() => setIsManualBrand(!isManualBrand)}
                className="text-[10px] font-black uppercase tracking-wider text-primary hover:underline"
              >
                {isManualBrand ? 'Select Existing' : 'Enter Manually'}
              </button>
            </div>
            
            {isManualBrand ? (
              <input 
                required 
                className="input-field bg-white" 
                placeholder="Enter new brand name..." 
                value={itemForm.brand_manual} 
                onChange={e => setItemForm(f => ({ ...f, brand_manual: e.target.value }))} 
              />
            ) : (
              <select 
                title="Select Brand" 
                required 
                className="input-field bg-white" 
                value={itemForm.brand_id} 
                onChange={e => setItemForm(f => ({ ...f, brand_id: e.target.value }))}
              >
                <option value="">Select brand…</option>
                {brands.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
              </select>
            )}
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">Item Name</label>
              <input required className="input-field" placeholder="e.g. Blue Denim Jacket" value={itemForm.name} onChange={e => setItemForm(f => ({ ...f, name: e.target.value }))} />
            </div>
            <div>
              <label className="label">SKU</label>
              <input required className="input-field" placeholder="e.g. ZRA-001" value={itemForm.sku} onChange={e => setItemForm(f => ({ ...f, sku: e.target.value }))} />
            </div>
            <div>
              <label className="label">Category</label>
              <input required className="input-field" placeholder="e.g. Apparel" value={itemForm.category} onChange={e => setItemForm(f => ({ ...f, category: e.target.value }))} />
            </div>
            <div>
              <label className="label">Min Stock Limit</label>
              <input title="Min Stock Limit" placeholder="0" required type="number" min={0} className="input-field" value={itemForm.min_stock_limit} onChange={e => setItemForm(f => ({ ...f, min_stock_limit: Number(e.target.value) }))} />
            </div>
            {!editingItemId && (
              <div className="grid grid-cols-2 gap-4 col-span-2 bg-emerald-50/50 p-4 rounded-2xl border border-emerald-100/50">
                <div className="col-span-1">
                  <label className="label flex items-center gap-2 text-emerald-700">Set Initial Stock</label>
                  <input title="Stock Quantity" placeholder="0" type="number" min={0} className="input-field bg-white border-emerald-200 focus:ring-emerald-400 focus:border-emerald-400" value={itemForm.stock} onChange={e => setItemForm(f => ({ ...f, stock: Number(e.target.value) }))} />
                </div>
                <div>
                  <label className="label flex items-center gap-2 text-emerald-700">Destination Location</label>
                  <select title="Select Location" className="input-field bg-white border-emerald-200 focus:ring-emerald-400 focus:border-emerald-400" value={itemForm.location_id} onChange={e => setItemForm(f => ({ ...f, location_id: e.target.value }))}>
                    <option value="">Select location…</option>
                    {locations.map(l => <option key={l.id} value={l.id}>{l.name} ({l.type})</option>)}
                  </select>
                </div>
                <p className="col-span-2 text-[10px] text-emerald-600 font-medium italic">Assign this item directly to a shop or warehouse starting inventory.</p>
              </div>
            )}

            {editingItemId && (
              <div className="bg-blue-50/50 p-3 rounded-xl border border-blue-100/50 col-span-1">
                <label className="label flex items-center gap-2 text-blue-700">Stock <span className="text-[10px] font-semibold text-blue-600 bg-blue-100 px-2 py-0.5 rounded">Quantity</span></label>
                <input title="Stock Quantity" placeholder="0" type="number" min={0} className="input-field bg-white border-blue-200 focus:ring-blue-400 focus:border-blue-400" value={itemForm.stock} onChange={e => setItemForm(f => ({ ...f, stock: Number(e.target.value) }))} />
                <p className="text-[10px] text-blue-500 mt-1 italic">Update current level.</p>
              </div>
            )}
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="label flex items-center gap-2 mb-0">Unit Cost <span className="text-[10px] font-semibold text-orange-600 bg-orange-50 px-2 py-0.5 rounded">Weighted</span></label>
                <select 
                  className="text-xs bg-gray-50 border border-gray-200 rounded p-1 text-gray-700 font-medium"
                  value={avgCostCurrency}
                  onChange={e => {
                    const newCurrency = e.target.value as 'USD'|'ZMW';
                    if (newCurrency === 'ZMW' && avgCostCurrency === 'USD') {
                       setItemForm(f => ({ ...f, avg_cost_USD: Number(fromUSD(f.avg_cost_USD, 'ZMW').toFixed(2)) }));
                    } else if (newCurrency === 'USD' && avgCostCurrency === 'ZMW') {
                       setItemForm(f => ({ ...f, avg_cost_USD: Number(toUSD(f.avg_cost_USD, 'ZMW').toFixed(2)) }));
                    }
                    setAvgCostCurrency(newCurrency);
                  }}
                >
                  <option value="USD">USD ($)</option>
                  <option value="ZMW">ZMW (K)</option>
                </select>
              </div>
              <input title="Average Cost" placeholder="0" type="number" step="0.01" min={0} className="input-field" value={itemForm.avg_cost_USD} onChange={e => setItemForm(f => ({ ...f, avg_cost_USD: Number(e.target.value) }))} />
            </div>
            <div>
              <label className="label flex items-center gap-2">Retail Price (ZMW) <span className="text-[10px] font-semibold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded">Sellable</span></label>
              <input title="Retail Price in ZMW" placeholder="0" type="number" step="0.01" min={0} className="input-field" value={itemForm.retail_price || ''} onChange={e => setItemForm(f => ({ ...f, retail_price: Number(e.target.value) }))} />
            </div>
          </div>
          <div className="flex justify-end gap-3 pt-3 border-t border-gray-100">
            <button type="button" className="btn-secondary" onClick={() => { setItemModal(false); setEditingItemId(null); setItemForm({ id: '', brand_id: '', name: '', category: '', sku: '', min_stock_limit: 0, avg_cost_USD: 0, retail_price: 0, stock: 0, inventory_id: '', location_id: '', brand_manual: '' }); }}>Cancel</button>
            <button type="submit" className="btn-primary" disabled={saving}>{saving ? 'Saving…' : editingItemId ? 'Update Item' : 'Add Item'}</button>
          </div>
        </form>
      </Modal>


      <Modal 
        isOpen={onboardModal} 
        onClose={() => setOnboardModal(false)} 
        title="Onboard New Container" 
        description="A unified flow to create a container and log its itemized packing list."
        size="xl"
      >
        <form onSubmit={handleOnboard} className="space-y-6">
          {activeStep === 1 && (
            <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
              <div className="bg-blue-50 border border-blue-100 rounded-2xl p-6 grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="col-span-1">
                  <label className="text-[10px] font-bold text-blue-600 uppercase mb-2 block">Container Profile</label>
                  <input required placeholder="Container No (e.g. MSCU1234)" className="input-field bg-white" value={onboardForm.container_no} onChange={e => setOnboardForm(f => ({ ...f, container_no: e.target.value }))} />
                </div>
                <div>
                  <label className="text-[10px] font-bold text-blue-600 uppercase mb-2 block">Source Country</label>
                  <select title="Source Country" className="input-field bg-white" value={onboardForm.source_country} onChange={e => setOnboardForm(f => ({ ...f, source_country: e.target.value, currency: COUNTRIES.find(c => c.name === e.target.value)?.currency || 'CNY' }))}>
                    {COUNTRIES.map(c => <option key={c.name}>{c.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-[10px] font-bold text-blue-600 uppercase mb-2 block">Arrival Date</label>
                  <input title="Arrival Date" type="date" className="input-field bg-white" value={onboardForm.date} onChange={e => setOnboardForm(f => ({ ...f, date: e.target.value }))} />
                </div>
                <div className="md:col-span-2">
                  <label className="text-[10px] font-bold text-blue-600 uppercase mb-2 block">Logistics Notes</label>
                  <input placeholder="Voyage details, shipping line, etc." className="input-field bg-white" value={onboardForm.notes} onChange={e => setOnboardForm(f => ({ ...f, notes: e.target.value }))} />
                </div>
                <div>
                  <label className="text-[10px] font-bold text-blue-600 uppercase mb-2 block">Currency & Freight Cost</label>
                  <div className="flex gap-2">
                    <select title="Currency" className="input-field bg-white flex-1" value={onboardForm.currency} onChange={e => setOnboardForm(f => ({ ...f, currency: e.target.value }))}>
                      {CURRENCIES.map(c => <option key={c}>{c}</option>)}
                    </select>
                    <input type="number" step="0.01" placeholder="Cost" className="input-field bg-white flex-1" value={onboardForm.total_cost || ''} onChange={e => setOnboardForm(f => ({ ...f, total_cost: Number(e.target.value) }))} />
                  </div>
                </div>
              </div>

              <div>
                <label className="label text-gray-900 font-bold mb-3 flex items-center gap-2">
                  <Store className="w-4 h-4 text-primary" /> Destination Warehouse
                </label>
                <select title="Select Warehouse" required className="input-field bg-white shadow-sm" value={onboardForm.location_id} onChange={e => setOnboardForm(f => ({ ...f, location_id: e.target.value }))}>
                  <option value="">Select where to unload items…</option>
                  {warehouses.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
                </select>
              </div>

              <div className="flex justify-end pt-4">
                <button type="button" onClick={() => setActiveStep(2)} className="btn-primary px-8 flex items-center gap-2">
                  Next: Packing List <Plus className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}

          {activeStep === 2 && (
            <div className="space-y-4 animate-in fade-in slide-in-from-right-2 duration-300">
              <div className="flex items-center justify-between border-b border-gray-100 pb-4">
                <div>
                  <h3 className="font-bold text-gray-900">Packing List Entry</h3>
                  <p className="text-xs text-gray-400">Items tagged to container {onboardForm.container_no}</p>
                </div>
                <button 
                  type="button" 
                  onClick={() => setOnboardForm(f => ({ ...f, rows: [...f.rows, { brand_name: '', item_name: '', sku: '', category: '', quantity: 1, unit_cost: 0, retail_price: 0, min_stock_limit: 0, matched_item_id: '' }] }))}
                  className="btn-secondary text-xs flex items-center gap-1 py-1.5"
                >
                  <Plus className="w-3.5 h-3.5" /> Row
                </button>
              </div>

              <div className="max-h-[450px] overflow-y-auto space-y-3 pr-2 custom-scrollbar">
                {onboardForm.rows.map((row, idx) => {
                  const matchingItems = (row.brand_name || row.item_name) ? items.filter(i => {
                    const brand = brands.find(b => b.id === i.brand_id);
                    return (brand?.name.toLowerCase().includes(row.brand_name.toLowerCase())) &&
                           (i.name.toLowerCase().includes(row.item_name.toLowerCase()));
                  }).slice(0, 3) : [];

                  return (
                    <div key={idx} className="bg-gray-50/50 p-4 rounded-xl border border-gray-100 relative group">
                      <div className="grid grid-cols-12 gap-3 items-end">
                        <div className="col-span-12 md:col-span-3">
                          <label className="text-[10px] font-bold text-gray-400 uppercase mb-1 block">Brand</label>
                          <input 
                            placeholder="Type brand..." 
                            className="input-field text-xs bg-white" 
                            value={row.brand_name} 
                            onChange={e => {
                               const newRows = [...onboardForm.rows];
                               newRows[idx].brand_name = e.target.value;
                               setOnboardForm(f => ({ ...f, rows: newRows }));
                            }}
                          />
                        </div>
                        <div className="col-span-12 md:col-span-3">
                          <label className="text-[10px] font-bold text-gray-400 uppercase mb-1 block">Item Name & Matches</label>
                          <input 
                            placeholder="Type name..." 
                            className="input-field text-xs bg-white" 
                            value={row.item_name}
                            onChange={e => {
                               const newRows = [...onboardForm.rows];
                               newRows[idx].item_name = e.target.value;
                               if (row.matched_item_id) newRows[idx].matched_item_id = '';
                               setOnboardForm(f => ({ ...f, rows: newRows }));
                            }}
                          />
                          {matchingItems.length > 0 && !row.matched_item_id && (
                            <div className="absolute z-10 left-0 right-0 mt-1 bg-white border border-primary/20 shadow-xl rounded-lg p-1 space-y-1">
                               <p className="text-[9px] font-bold text-primary px-2 py-1 uppercase tracking-tighter">Existing Matches Found:</p>
                               {matchingItems.map(mi => (
                                 <button key={mi.id} type="button" onClick={() => {
                                   const newRows = [...onboardForm.rows];
                                   const miBrand = brands.find(b => b.id === mi.brand_id);
                                   newRows[idx] = { 
                                     ...newRows[idx], 
                                     matched_item_id: mi.id, 
                                     brand_name: miBrand?.name || '', 
                                     item_name: mi.name, 
                                     sku: mi.sku, 
                                     category: mi.category,
                                     retail_price: mi.retail_price || 0
                                   };
                                   setOnboardForm(f => ({ ...f, rows: newRows }));
                                 }} className="w-full text-left px-2 py-1.5 hover:bg-primary/5 rounded flex justify-between items-center text-[11px]">
                                   <span>{mi.name} ({brands.find(b => b.id === mi.brand_id)?.name})</span>
                                   <span className="text-[9px] text-gray-400">SKU: {mi.sku}</span>
                                 </button>
                               ))}
                            </div>
                          )}
                          {row.matched_item_id && (() => {
                            const itemStocks = inventory.filter(e => e.item_id === row.matched_item_id);
                            const whCount = itemStocks.filter(e => {
                              const l = locations.find(loc => loc.id === e.location_id);
                              return l && l.type === 'warehouse';
                            }).reduce((sum, e) => sum + e.quantity, 0);
                            const shopCount = itemStocks.filter(e => {
                              const l = locations.find(loc => loc.id === e.location_id);
                              return l && l.type === 'shop';
                            }).reduce((sum, e) => sum + e.quantity, 0);
                            const totalCount = whCount + shopCount;
                            
                            return (
                              <div className="mt-2 text-[10px] space-y-1 bg-white p-2.5 rounded-lg border border-emerald-100 shadow-sm">
                                <div className="flex items-center gap-1 text-emerald-600 font-bold uppercase mb-1 border-b border-emerald-50 pb-1.5">
                                  <Package className="w-3 h-3" /> Linked to Existing Record
                                </div>
                                <div className="grid grid-cols-3 gap-2 font-medium">
                                  <div className="flex flex-col"><span className="text-gray-400 text-[8px] uppercase">Total</span><span className="font-black text-gray-800">{totalCount}</span></div>
                                  <div className="flex flex-col"><span className="text-gray-400 text-[8px] uppercase">Warehouses</span><span className="font-bold text-gray-700">{whCount}</span></div>
                                  <div className="flex flex-col"><span className="text-gray-400 text-[8px] uppercase">Shops</span><span className="font-bold text-gray-700">{shopCount}</span></div>
                                </div>
                              </div>
                            );
                          })()}
                        </div>
                        <div className="col-span-4 md:col-span-2">
                          <label className="text-[10px] font-bold text-gray-400 uppercase mb-1 block">Qty</label>
                          <input title="Quantity" type="number" min={1} className="input-field text-xs bg-white" value={row.quantity} onChange={e => {
                            const newRows = [...onboardForm.rows];
                            newRows[idx].quantity = Number(e.target.value);
                            setOnboardForm(f => ({ ...f, rows: newRows }));
                          }} />
                        </div>
                        <div className="col-span-4 md:col-span-2">
                          <label className="text-[10px] font-bold text-gray-400 uppercase mb-1 block">Unit Cost ({onboardForm.currency})</label>
                          <input title="Unit Cost" type="number" step="0.01" className="input-field text-xs bg-white" value={row.unit_cost || ''} onChange={e => {
                            const newRows = [...onboardForm.rows];
                            newRows[idx].unit_cost = Number(e.target.value);
                            setOnboardForm(f => ({ ...f, rows: newRows }));
                          }} />
                        </div>
                        <div className="col-span-4 md:col-span-1">
                          <label className="text-[10px] font-bold text-gray-400 uppercase mb-1 block">Retail (ZMW)</label>
                          <input title="Retail Price" type="number" step="1" className="input-field text-xs bg-white" value={row.retail_price || ''} onChange={e => {
                            const newRows = [...onboardForm.rows];
                            newRows[idx].retail_price = Number(e.target.value);
                            setOnboardForm(f => ({ ...f, rows: newRows }));
                          }} />
                        </div>
                        <div className="col-span-4 md:col-span-1">
                          <label className="text-[10px] font-bold text-gray-400 uppercase mb-1 block group/tooltip relative">Min Stock
                            <div className="absolute opacity-0 group-hover/tooltip:opacity-100 bg-gray-900 text-white text-[9px] p-1.5 rounded-lg -top-8 left-1/2 -translate-x-1/2 whitespace-nowrap z-50 pointer-events-none transition-opacity">Notify if stock falls below</div>
                          </label>
                          <input title="Min Stock Limit" type="number" step="1" className="input-field text-xs bg-white text-orange-600 font-bold" value={row.min_stock_limit || ''} onChange={e => {
                            const newRows = [...onboardForm.rows];
                            newRows[idx].min_stock_limit = Number(e.target.value);
                            setOnboardForm(f => ({ ...f, rows: newRows }));
                          }} />
                        </div>
                        <button 
                          title="Remove Row"
                          type="button" 
                          onClick={() => setOnboardForm(f => ({ ...f, rows: f.rows.filter((_, i) => i !== idx) }))}
                          className="absolute -top-2 -right-2 bg-white border border-gray-100 shadow-sm p-1.5 rounded-full text-gray-300 hover:text-red-500 hover:border-red-100 opacity-0 group-hover:opacity-100 transition-opacity"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                      {!row.matched_item_id && row.item_name && (
                        <div className="mt-3 grid grid-cols-2 gap-3 pt-3 border-t border-gray-100/50">
                          <div>
                            <label className="text-[9px] font-bold text-gray-400 uppercase mb-1 block">System SKU</label>
                            <input placeholder="Assign SKU (recommended)" className="input-field text-[10px] py-1 bg-white/50" value={row.sku} onChange={e => {
                              const newRows = [...onboardForm.rows];
                              newRows[idx].sku = e.target.value;
                              setOnboardForm(f => ({ ...f, rows: newRows }));
                            }} />
                          </div>
                          <div>
                            <label className="text-[9px] font-bold text-gray-400 uppercase mb-1 block">Brand</label>
                            <input placeholder="e.g. Electrical" className="input-field text-[10px] py-1 bg-white/50" value={row.category} onChange={e => {
                              const newRows = [...onboardForm.rows];
                              newRows[idx].category = e.target.value;
                              setOnboardForm(f => ({ ...f, rows: newRows }));
                            }} />
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              <div className="flex justify-between items-center pt-4 border-t border-gray-100">
                <button type="button" onClick={() => setActiveStep(1)} className="btn-secondary text-sm">Back to Profile</button>
                <div className="flex gap-3">
                  <button type="button" onClick={() => setOnboardModal(false)} className="btn-secondary text-sm">Cancel</button>
                  <button type="submit" disabled={saving} className="btn-primary min-w-[150px] shadow-lg shadow-primary/20">
                    {saving ? 'Onboarding...' : `Onboard ${onboardForm.rows.length} Items`}
                  </button>
                </div>
              </div>
            </div>
          )}
        </form>
      </Modal>

      <Modal isOpen={transferModal} onClose={() => setTransferModal(false)} title="Move Stock (Internal Transfer)" description="Transfer existing inventory between warehouses and shops." size="md">
        <form onSubmit={handleTransfer} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">Source Location</label>
              <select title="Source Location" required className="input-field bg-white" value={transferForm.from_location} onChange={e => setTransferForm(f => ({ ...f, from_location: e.target.value, item_id: '' }))}>
                <option value="">Select source…</option>
                {locations.map(l => <option key={l.id} value={l.id}>{l.name} ({l.type})</option>)}
              </select>
            </div>
            <div>
              <label className="label">Destination</label>
              <select title="Destination Location" required className="input-field bg-white" value={transferForm.to_location} onChange={e => setTransferForm(f => ({ ...f, to_location: e.target.value }))}>
                <option value="">Select destination…</option>
                {locations.filter(l => l.id !== transferForm.from_location).map(l => <option key={l.id} value={l.id}>{l.name} ({l.type})</option>)}
              </select>
            </div>
          </div>
          <div>
            <label className="label">Item to Move</label>
            <select title="Select Item" required className="input-field bg-white" value={transferForm.item_id} onChange={e => setTransferForm(f => ({ ...f, item_id: e.target.value }))}>
              <option value="">Select item…</option>
              {inventory.filter(e => e.location_id === transferForm.from_location && e.quantity > 0).map(e => {
                const item = items.find(i => i.id === e.item_id);
                return <option key={e.id} value={e.item_id}>{item?.name} — Available: {e.quantity} {item?.sku}</option>
              })}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">Quantity</label>
              <input title="Quantity to Move" required type="number" min={1} max={inventory.find(e => e.location_id === transferForm.from_location && e.item_id === transferForm.item_id)?.quantity} className="input-field" value={transferForm.quantity || ''} onChange={e => setTransferForm(f => ({ ...f, quantity: Number(e.target.value) }))} />
            </div>
            <div>
              <label className="label">Delivery Note (Optional)</label>
              <input title="Delivery Note or Reference" type="text" placeholder="e.g. TR-2023-01" className="input-field" value={transferForm.notes || ''} onChange={e => setTransferForm(f => ({ ...f, notes: e.target.value }))} />
            </div>
          </div>
          <div className="flex justify-end gap-3 pt-3 border-t border-gray-100">
            <button type="button" className="btn-secondary" onClick={() => setTransferModal(false)}>Cancel</button>
            <button type="submit" className="btn-primary" disabled={saving}>{saving ? 'Moving Stock…' : 'Execute Transfer'}</button>
          </div>
        </form>
      </Modal>

      <Modal 
        isOpen={deleteConfirmModal.isOpen} 
        onClose={() => setDeleteConfirmModal(f => ({ ...f, isOpen: false }))} 
        title="Confirm Deletion" 
        description="This action cannot be undone. The stock records will be permanently removed."
        size="sm"
      >
        <div className="space-y-6 pt-2">
          <div className="flex items-center gap-4 p-4 bg-red-50 border border-red-100 rounded-xl">
             <div className="w-12 h-12 bg-white rounded-full flex items-center justify-center shadow-sm text-red-500">
                <Trash2 className="w-6 h-6" />
             </div>
             <div>
                <p className="text-sm font-bold text-gray-900 leading-tight">Delete {deleteConfirmModal.name}?</p>
                <p className="text-[11px] text-red-600 font-medium mt-0.5">Physical items won't be affected, only digital logs.</p>
             </div>
          </div>
          
          <div className="flex gap-3 justify-end sticky bottom-0 bg-white">
            <button type="button" className="btn-secondary" onClick={() => setDeleteConfirmModal(f => ({ ...f, isOpen: false }))}>Cancel</button>
            <button 
              id="confirm-delete-btn"
              type="button" 
              className="btn-primary bg-red-600 hover:bg-red-700 border-none shadow-lg shadow-red-200" 
              onClick={deleteConfirmModal.isBulk ? executeBulkDelete : executeSingleDelete}
              disabled={saving}
            >
              {saving ? 'Deleting...' : 'Yes, Delete Permanently'}
            </button>
          </div>
        </div>
      </Modal>

      {/* Stock Drill Down Modal */}
      <Modal 
        isOpen={isDrillDownOpen} 
        onClose={() => setIsDrillDownOpen(false)} 
        title="Network Stock Audit" 
        description={stockDistribution?.item?.name}
        size="md"
      >
        <div className="space-y-6">
          <div className="grid grid-cols-2 gap-4">
             <div className="p-5 bg-blue-100/30 rounded-2xl border border-blue-100">
                <p className="text-[10px] font-black text-blue-600 uppercase tracking-widest mb-1">Global Units</p>
                <h4 className="text-3xl font-black text-gray-900 tracking-tighter">
                   {stockDistribution?.distributions.reduce((s, d) => s + d.qty, 0).toLocaleString()} <span className="text-xs font-bold text-gray-400">Total</span>
                </h4>
             </div>
             <div className="p-5 bg-amber-100/30 rounded-2xl border border-amber-100">
                <p className="text-[10px] font-black text-amber-600 uppercase tracking-widest mb-1">Safety Limit</p>
                <h4 className="text-3xl font-black text-gray-900 tracking-tighter">
                   {stockDistribution?.item?.min_stock_limit || 0} <span className="text-xs font-bold text-gray-400">Min</span>
                </h4>
             </div>
          </div>

          <div className="space-y-3">
             <h5 className="text-[10px] font-black text-gray-400 uppercase tracking-widest px-1">Physical Distribution</h5>
             {/* Warehouses first */}
             {(() => {
               const warehouses = stockDistribution?.distributions.filter(l => l.type === 'warehouse') ?? [];
               const shops = stockDistribution?.distributions.filter(l => l.type !== 'warehouse') ?? [];
               return (
                 <div className="space-y-2">
                   {warehouses.length > 0 && (
                     <div>
                       <p className="text-[9px] font-black text-blue-500 uppercase tracking-widest px-1 mb-1">Warehouse</p>
                       <div className="bg-blue-50/60 rounded-2xl border border-blue-100 overflow-hidden divide-y divide-blue-100">
                         {warehouses.map(loc => (
                           <div key={loc.id} className="p-4 flex items-center justify-between hover:bg-white transition-colors">
                             <div className="flex items-center gap-3">
                               <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-blue-100 text-blue-600">
                                 <WarehouseIcon className="w-5 h-5" />
                               </div>
                               <div>
                                 <p className="text-base font-bold text-gray-900">{loc.name}</p>
                                 <p className="text-[10px] font-bold text-gray-400 uppercase tracking-tight">{loc.type} · {loc.country}</p>
                               </div>
                             </div>
                             <div className="text-right">
                               <p className="text-base font-bold text-blue-700 tabular-nums">{loc.qty.toLocaleString()} Units</p>
                             </div>
                           </div>
                         ))}
                       </div>
                     </div>
                   )}
                   {shops.length > 0 && (
                     <div>
                       <p className="text-[9px] font-black text-emerald-600 uppercase tracking-widest px-1 mb-1">Shops</p>
                       <div className="bg-gray-50 rounded-2xl border border-gray-100 overflow-hidden divide-y divide-gray-100">
                         {shops.map(loc => (
                           <div key={loc.id} className="p-4 flex items-center justify-between hover:bg-white transition-colors">
                             <div className="flex items-center gap-3">
                               <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-emerald-100 text-emerald-600">
                                 <Store className="w-5 h-5" />
                               </div>
                               <div>
                                 <p className="text-base font-bold text-gray-900">{loc.name}</p>
                                 <p className="text-[10px] font-bold text-gray-400 uppercase tracking-tight">{loc.type} · {loc.country}</p>
                               </div>
                             </div>
                             <div className="text-right">
                               <p className="text-base font-bold text-gray-900 tabular-nums">{loc.qty.toLocaleString()} Units</p>
                             </div>
                           </div>
                         ))}
                       </div>
                     </div>
                   )}
                 </div>
               );
             })()}
          </div>
          
          <div className="p-4 bg-gray-900 rounded-2xl text-white">
             <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-white/10 flex items-center justify-center">
                   <Truck className="w-5 h-5" />
                </div>
                <div>
                   <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Rebalancing Recommendation</p>
                   <p className="text-xs text-white/80 mt-0.5">Contact procurement if total system stock falls below {stockDistribution?.item?.min_stock_limit || 0} units.</p>
                </div>
             </div>
          </div>
        </div>
      </Modal>

      {/* ── Add Stock Modal ─────────────────────────────────────────────────── */}
      <Modal isOpen={addStockModal} onClose={() => { setAddStockModal(false); resetAddStockForm(); }} title="Add Stock Manually" description="Add stock to an existing item or create a new item with stock." size="lg">
        <form onSubmit={handleAddStock} className="space-y-4">
          {/* Mode Toggle */}
          <div className="flex bg-gray-100 rounded-xl p-1 gap-1">
            <button type="button" onClick={() => setAddStockMode('existing')} className={clsx("flex-1 py-2.5 text-xs font-bold rounded-lg transition-all", addStockMode === 'existing' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700')}>
              Existing Item
            </button>
            <button type="button" onClick={() => setAddStockMode('new')} className={clsx("flex-1 py-2.5 text-xs font-bold rounded-lg transition-all", addStockMode === 'new' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700')}>
              New Item
            </button>
          </div>

          {addStockMode === 'existing' ? (
            /* ── Existing Item Mode ──────────────────────────── */
            <div className="space-y-4">
              <div>
                <label className="label">Item</label>
                <select title="Select Item" required className="input-field" value={addStockForm.item_id} onChange={e => setAddStockForm(f => ({ ...f, item_id: e.target.value }))}>
                  <option value="">Select item…</option>
                  {items.map(i => {
                    const brand = brands.find(b => b.id === i.brand_id);
                    return <option key={i.id} value={i.id}>{i.name} — {brand?.name || 'No Brand'} ({i.sku})</option>;
                  })}
                </select>
              </div>
              {addStockForm.item_id && addStockForm.location_id && (
                <div className="p-3 bg-blue-50 rounded-xl border border-blue-100 text-xs text-blue-700 font-medium">
                  Current stock at this location: <span className="font-bold">{inventory.find(e => e.item_id === addStockForm.item_id && e.location_id === addStockForm.location_id)?.quantity ?? 0} units</span>
                </div>
              )}
            </div>
          ) : (
            /* ── New Item Mode ───────────────────────────────── */
            <div className="space-y-4">
              <div className="bg-gray-50 border border-gray-100 rounded-xl p-4">
                <div className="flex items-center justify-between mb-2">
                  <label className="label mb-0">Brand</label>
                  <button type="button" onClick={() => setAddStockManualBrand(!addStockManualBrand)} className="text-[10px] font-black uppercase tracking-wider text-primary hover:underline">
                    {addStockManualBrand ? 'Select Existing' : 'Enter Manually'}
                  </button>
                </div>
                {addStockManualBrand ? (
                  <input required className="input-field bg-white" placeholder="Enter new brand name..." value={addStockForm.brand_manual} onChange={e => setAddStockForm(f => ({ ...f, brand_manual: e.target.value }))} />
                ) : (
                  <select title="Select Brand" required className="input-field bg-white" value={addStockForm.brand_id} onChange={e => setAddStockForm(f => ({ ...f, brand_id: e.target.value }))}>
                    <option value="">Select brand…</option>
                    {brands.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                  </select>
                )}
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="label">Item Name</label>
                  <input required className="input-field" placeholder="e.g. Blue Denim Jacket" value={addStockForm.item_name} onChange={e => setAddStockForm(f => ({ ...f, item_name: e.target.value }))} />
                </div>
                <div>
                  <label className="label">SKU</label>
                  <input className="input-field" placeholder="e.g. SKU-001 (auto if empty)" value={addStockForm.sku} onChange={e => setAddStockForm(f => ({ ...f, sku: e.target.value }))} />
                </div>
                <div>
                  <label className="label">Brand</label>
                  <input className="input-field" placeholder="e.g. Apparel" value={addStockForm.category} onChange={e => setAddStockForm(f => ({ ...f, category: e.target.value }))} />
                </div>
                <div>
                  <label className="label">Min Stock Limit</label>
                  <input title="Min Stock Limit" type="number" min={0} className="input-field" value={addStockForm.min_stock_limit} onChange={e => setAddStockForm(f => ({ ...f, min_stock_limit: Number(e.target.value) }))} />
                </div>
              </div>
              <div>
                <label className="label">Retail Price</label>
                <input title="Retail Price" type="number" step="0.01" min={0} className="input-field" placeholder="Selling price" value={addStockForm.retail_price} onChange={e => setAddStockForm(f => ({ ...f, retail_price: Number(e.target.value) }))} />
              </div>
            </div>
          )}

          {/* ── Common Fields: Location, Qty, Cost ────────── */}
          <div className="border-t border-gray-100 pt-4 space-y-4">
            <div>
              <label className="label">Destination Location</label>
              <select title="Select Location" required className="input-field" value={addStockForm.location_id} onChange={e => setAddStockForm(f => ({ ...f, location_id: e.target.value }))}>
                <option value="">Select location…</option>
                {locations.map(l => <option key={l.id} value={l.id}>{l.name} ({l.type})</option>)}
              </select>
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div>
                <label className="label">Quantity</label>
                <input title="Quantity" required type="number" min={1} className="input-field" value={addStockForm.quantity} onChange={e => setAddStockForm(f => ({ ...f, quantity: Number(e.target.value) }))} />
              </div>
              <div>
                <label className="label">Unit Cost</label>
                <input title="Unit Cost" type="number" step="0.01" min={0} className="input-field" value={addStockForm.unit_cost} onChange={e => setAddStockForm(f => ({ ...f, unit_cost: Number(e.target.value) }))} />
              </div>
              <div>
                <label className="label">Currency</label>
                <select title="Currency" className="input-field" value={addStockForm.currency} onChange={e => setAddStockForm(f => ({ ...f, currency: e.target.value }))}>
                  {CURRENCIES.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-3 border-t border-gray-100">
            <button type="button" className="btn-secondary" onClick={() => { setAddStockModal(false); resetAddStockForm(); }}>Cancel</button>
            <button type="submit" className="btn-primary" disabled={saving}>
              {saving ? 'Adding…' : addStockMode === 'new' ? 'Create & Add Stock' : 'Add Stock'}
            </button>
          </div>
        </form>
      </Modal>
      <Modal isOpen={!!adjustInvoiceContainer} onClose={() => setAdjustInvoiceContainer(null)} title={containers.find(c => c.id === adjustInvoiceContainer)?.status === 'Pending' ? "Receive Container & Reconcile" : "Resolve Invoice Discrepancies"} description={containers.find(c => c.id === adjustInvoiceContainer)?.status === 'Pending' ? "Enter the actual received quantities to officially receive this container into inventory." : "Adjust quantities for items received to fix mismatch between invoice and actual stock."} size="lg">
        <div className="space-y-4">
          <div className="max-h-[60vh] overflow-y-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-gray-50 text-xs text-gray-500 uppercase sticky top-0">
                <tr>
                  <th className="px-4 py-2 font-medium">Item Name</th>
                  <th className="px-4 py-2 font-medium text-right w-24">Invoiced</th>
                  <th className="px-4 py-2 font-medium text-right w-32">Actual Rcvd</th>
                  <th className="px-4 py-2 font-medium text-right w-24">Mismatch</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {adjustInvoiceItems.map((item, idx) => {
                  const diff = item.new_quantity - item.original_qty;
                  return (
                    <tr key={item.transaction_id} className="hover:bg-gray-50">
                      <td className="px-4 py-2 text-gray-900 font-medium">{item.name}</td>
                      <td className="px-4 py-2 text-right text-gray-500">{item.original_qty}</td>
                      <td className="px-4 py-2 text-right">
                        <input 
                          type="number" 
                          min="0"
                          className="w-20 text-right bg-white border border-gray-200 rounded px-2 py-1 text-sm focus:ring-1 focus:ring-primary focus:border-primary font-bold"
                          value={item.new_quantity}
                          onChange={(e) => {
                            const val = Math.max(0, parseInt(e.target.value) || 0);
                            setAdjustInvoiceItems(prev => {
                              const newArr = [...prev];
                              newArr[idx].new_quantity = val;
                              return newArr;
                            });
                          }}
                        />
                      </td>
                      <td className="px-4 py-2 text-right font-bold">
                        <span className={clsx(diff > 0 ? "text-emerald-600" : diff < 0 ? "text-red-600" : "text-gray-300")}>
                          {diff > 0 ? '+' : ''}{diff}
                        </span>
                      </td>
                    </tr>
                  )
                })}
                {adjustInvoiceItems.length === 0 && (
                  <tr>
                    <td colSpan={4} className="px-4 py-8 text-center text-gray-400">No stock entries found for this invoice.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <div className="flex justify-end gap-3 pt-4 border-t border-gray-100">
            <button type="button" onClick={() => setAdjustInvoiceContainer(null)} className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50">Cancel</button>
            <button type="button" onClick={handleAdjustInvoiceSave} disabled={saving || adjustInvoiceItems.length === 0} className="btn-primary">
              {saving ? 'Saving...' : (containers.find(c => c.id === adjustInvoiceContainer)?.status === 'Pending' ? 'Receive into Inventory' : 'Apply Fixes & Adjust Stock')}
            </button>
          </div>
        </div>
      </Modal>


      {/* ── Export All Filter Modal ── */}
      {exportAllModalOpen && (
        <Modal isOpen onClose={() => setExportAllModalOpen(false)} title="Export All Stock" size="sm">
          <div className="space-y-5">
            <p className="text-sm text-gray-500">Filter the export by brand and/or location before downloading the Excel file.</p>

            {/* Brand filter */}
            <div>
              <label className="block text-xs font-bold text-gray-600 mb-2 uppercase tracking-wide">Brand (Optional)</label>
              <select
                value={exportAllFilters.brandId}
                onChange={e => setExportAllFilters(f => ({ ...f, brandId: e.target.value }))}
                className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm font-medium focus:outline-none focus:border-primary bg-white"
              >
                <option value="">All Brands</option>
                {brands.map(b => (
                  <option key={b.id} value={b.id}>{b.name}</option>
                ))}
              </select>
            </div>

            {/* Location type filter */}
            <div>
              <label className="block text-xs font-bold text-gray-600 mb-2 uppercase tracking-wide">Location Type</label>
              <div className="flex gap-2">
                {(['', 'warehouse', 'shop'] as const).map(type => (
                  <button
                    key={type}
                    type="button"
                    onClick={() => setExportAllFilters(f => ({ ...f, locationType: type, locationId: '' }))}
                    className={`flex-1 py-2 text-xs font-bold rounded-xl border transition-all ${exportAllFilters.locationType === type ? 'bg-primary text-white border-primary' : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'}`}
                  >
                    {type === '' ? 'All' : type === 'warehouse' ? '🏭 Warehouses' : '🏪 Shops'}
                  </button>
                ))}
              </div>
            </div>

            {/* Specific location */}
            <div>
              <label className="block text-xs font-bold text-gray-600 mb-2 uppercase tracking-wide">Specific Location (Optional)</label>
              <select
                value={exportAllFilters.locationId}
                onChange={e => setExportAllFilters(f => ({ ...f, locationId: e.target.value }))}
                className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm font-medium focus:outline-none focus:border-primary bg-white"
              >
                <option value="">All Locations</option>
                {locations
                  .filter(l => !exportAllFilters.locationType || l.type === exportAllFilters.locationType)
                  .map(l => (
                    <option key={l.id} value={l.id}>{l.name} ({l.type})</option>
                  ))}
              </select>
            </div>

            {/* Summary */}
            <div className="bg-gray-50 rounded-xl p-3 text-xs text-gray-500">
              <p className="font-bold text-gray-700 mb-1">Export will include:</p>
              <p>• Brand: {exportAllFilters.brandId ? brands.find(b => b.id === exportAllFilters.brandId)?.name : 'All'}</p>
              <p>• Location: {exportAllFilters.locationId ? locations.find(l => l.id === exportAllFilters.locationId)?.name : (exportAllFilters.locationType ? `All ${exportAllFilters.locationType}s` : 'All Locations')}</p>
            </div>

            <div className="flex gap-3 justify-end pt-2 border-t border-gray-100">
              <button type="button" onClick={() => setExportAllModalOpen(false)} className="px-5 py-2.5 font-bold text-gray-700 border border-gray-200 rounded-xl hover:bg-gray-50 text-sm">Cancel</button>
              <button
                type="button"
                disabled={exportAllLoading}
                onClick={async () => {
                  setExportAllLoading(true);
                  try {
                    // Build filtered data
                    const filteredLocs = exportAllFilters.locationId
                      ? locations.filter(l => l.id === exportAllFilters.locationId)
                      : (exportAllFilters.locationType ? locations.filter(l => l.type === exportAllFilters.locationType) : locations);

                    await exportInventorySystemData({
                      inventory,
                      sales: useStore.getState().sales,
                      returns: useStore.getState().returns,
                      expenses: useStore.getState().expenses,
                      locations: filteredLocs,
                      items,
                      brands,
                      filters: {
                        locationId: exportAllFilters.locationId || undefined,
                        brandId: exportAllFilters.brandId || undefined,
                      }
                    });
                    setExportAllModalOpen(false);
                  } catch (err: any) {
                    alert('Export failed: ' + err.message);
                  } finally {
                    setExportAllLoading(false);
                  }
                }}
                className="btn-primary flex items-center gap-2 px-6 py-2.5 text-sm font-bold disabled:opacity-50"
              >
                <FileText className="w-4 h-4" />
                {exportAllLoading ? 'Exporting...' : 'Download Excel'}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
