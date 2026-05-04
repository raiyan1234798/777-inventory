import { useState, useMemo, useCallback, useRef, useEffect, memo } from 'react';
import * as XLSX from 'xlsx';
import { useDropzone } from 'react-dropzone';
import Tesseract from 'tesseract.js';
import {
  PackagePlus, Boxes, Search, Trash2, Plus,
  Truck, Tag, Globe2, Package, Store, Upload, FileText, X, AlertTriangle,
  Pencil, ChevronUp, ChevronDown, ChevronsUpDown, ChevronLeft, ChevronRight,
  Warehouse as WarehouseIcon, Filter, BarChart3, TrendingUp, ArrowUpDown
} from 'lucide-react';
import clsx from 'clsx';
import { db } from '../lib/firebase';
import { collection, doc, setDoc, updateDoc, writeBatch } from 'firebase/firestore';
import Modal from '../components/Modal';
import {
  useStore, COUNTRIES, CURRENCIES, toINR, formatCurrency, formatDualCurrency,
  type Location, type Brand, type Item, type InventoryEntry
} from '../store';
import { useAuthStore } from '../store/authStore';
import { exportInventorySystemData, exportInventoryToLedger, exportStockReport } from '../lib/bulkOperations';

type ActiveTab = 'inventory' | 'containers' | 'brands' | 'items' | 'locations' | 'settings';
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
    locations, brands, items, inventory, containers, transactions,
    addLocation, deleteLocation, addBrand, deleteBrand, deleteItem, updateItem,
    addContainer, batchStockEntry, transfer, deleteStockEntry, deleteStockEntries
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
  const [importExcelModal, setImportExcelModal] = useState(false);
  const [addStockModal, setAddStockModal] = useState(false);
  const [deleteConfirmModal, setDeleteConfirmModal] = useState<{ isOpen: boolean; id?: string; name?: string; isBulk: boolean }>({
    isOpen: false, isBulk: false
  });
  const [activeStep, setActiveStep] = useState(1);
  const [addStockMode, setAddStockMode] = useState<'existing' | 'new'>('existing');
  const [addStockForm, setAddStockForm] = useState({
    // existing item mode
    item_id: '', location_id: '', quantity: 1, unit_cost: 0, currency: 'INR',
    // new item mode
    brand_id: '', brand_manual: '', item_name: '', category: '', sku: '', retail_price: 0, min_stock_limit: 10,
  });
  const [addStockManualBrand, setAddStockManualBrand] = useState(false);

  const [locationForm, setLocationForm] = useState({ name: '', type: 'warehouse' as 'warehouse' | 'shop', country: 'India', currency: 'INR' });
  const [brandForm, setBrandForm] = useState({ name: '', origin_country: 'India' });
  const [itemForm, setItemForm] = useState({ id: '', brand_id: '', name: '', category: '', sku: '', min_stock_limit: 10, avg_cost_INR: 0, retail_price: 0, stock: 0, inventory_id: '', location_id: '', brand_manual: '' });
  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [isManualBrand, setIsManualBrand] = useState(false);
  const [importPreview, setImportPreview] = useState<any[]>([]);
  const [importTargetLocation, setImportTargetLocation] = useState('');
  const [importCurrency, setImportCurrency] = useState('INR');
  const [isProcessing, setIsProcessing] = useState(false);
  const [excelFile, setExcelFile] = useState<File | null>(null);
  const [processingStatus, setProcessingStatus] = useState('');
  
  const [transferForm, setTransferForm] = useState({
    from_location: '',
    to_location: '',
    item_id: '',
    quantity: 1,
  });

  const handleUpdateImportItem = useCallback((idx: number, field: string, value: any) => {
    setImportPreview(prev => {
      const newP = [...prev];
      newP[idx] = { ...newP[idx], [field]: value };
      return newP;
    });
  }, []);

  const handleRemoveImportItem = useCallback((idx: number) => {
    if(window.confirm("Remove this entry from the import list?")) {
      setImportPreview(prev => prev.filter((_, i) => i !== idx));
    }
  }, []);

  const [drillDownItemId, setDrillDownItemId] = useState<string | null>(null);
  const [isDrillDownOpen, setIsDrillDownOpen] = useState(false);

  const stockDistribution = useMemo(() => {
    if (!drillDownItemId) return null;
    const item = items.find(i => i.id === drillDownItemId);
    const distributions = locations.map(loc => {
      const qty = inventory
        .filter(e => e.item_id === drillDownItemId && e.location_id === loc.id)
        .reduce((sum, e) => sum + e.quantity, 0);
      return { ...loc, qty };
    }).filter(d => d.qty > 0);
    return { item, distributions };
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
      min_stock_limit: 10,
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
        const minLimit = item.min_stock_limit ?? 10;
        const isOut = entry.quantity === 0;
        const isLow = !isOut && entry.quantity < minLimit;
        const stockPct = minLimit > 0 ? Math.min((entry.quantity / minLimit) * 100, 200) : 100;
        const profitMargin = item.retail_price && entry.avg_cost_INR
          ? ((item.retail_price - entry.avg_cost_INR) / item.retail_price) * 100
          : 0;
        return { ...entry, item, loc, brand, isLow, isOut, stockPct, profitMargin };
      })
      .filter(Boolean) as RowType[];
  }, [inventory, itemMap, locationMap, brandMap]);

  const inventoryRows = useMemo((): RowType[] => {
    let rows = allInventoryRows.filter(r => {
      const q = search.toLowerCase();
      const matchSearch = !q || r.item.name.toLowerCase().includes(q) ||
        r.item.sku.toLowerCase().includes(q) ||
        r.item.category.toLowerCase().includes(q) ||
        r.loc.name.toLowerCase().includes(q) ||
        (r.brand?.name.toLowerCase().includes(q));
      const matchLocation = !filterLocation || r.location_id === filterLocation;
      const matchCategory = !filterCategory || r.item.category === filterCategory;
      const matchBrand = !filterBrand || r.item.brand_id === filterBrand;
      const matchStatus = !filterStockStatus ||
        (filterStockStatus === 'low' && r.isLow) ||
        (filterStockStatus === 'healthy' && !r.isLow && !r.isOut) ||
        (filterStockStatus === 'out' && r.isOut);
      return matchSearch && matchLocation && matchCategory && matchBrand && matchStatus;
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
        case 'avg_cost': cmp = (a.avg_cost_INR || 0) - (b.avg_cost_INR || 0); break;
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

  const toggleAllSelection = () => {
    if (selectedInventoryIds.size === inventoryRows.length) {
      setSelectedInventoryIds(new Set());
    } else {
      setSelectedInventoryIds(new Set(inventoryRows.map(r => r.id)));
    }
  };

  const toggleRowSelection = (id: string) => {
    const next = new Set(selectedInventoryIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedInventoryIds(next);
  };

  const handleBulkDelete = async () => {
    setDeleteConfirmModal({ isOpen: true, isBulk: true, name: `${selectedInventoryIds.size} items` });
  };

  const executeBulkDelete = async () => {
    setSaving(true);
    setDeleteConfirmModal(f => ({ ...f, isOpen: false }));
    try {
      await deleteStockEntries(Array.from(selectedInventoryIds));
      alert(`Successfully deleted selection from stock.`);
      setSelectedInventoryIds(new Set());
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
    const { id, name } = deleteConfirmModal;
    if (!id) return;
    setSaving(true);
    setDeleteConfirmModal(f => ({ ...f, isOpen: false }));
    try {
       await deleteStockEntry(id);
       alert(`Deleted ${name} from location.`);
    } catch (err: any) {
       alert("Deletion failed: " + err.message);
    } finally {
       setSaving(false);
    }
  };

  const totalItems = useMemo(() => inventoryRows.reduce((s, r) => s + (r.quantity || 0), 0), [inventoryRows]);
  const totalValue = useMemo(() => inventoryRows.reduce((s, r) => s + (r.quantity || 0) * (r.avg_cost_INR || 0), 0), [inventoryRows]);
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
    settings: 0,
  }), [inventory.length, containers.length, items.length, brands.length, locations.length]);

  // Items tab search
  const [itemsSearch, setItemsSearch] = useState('');
  const filteredItems = useMemo(() => {
    if (!itemsSearch) return items;
    const q = itemsSearch.toLowerCase();
    return items.filter(i =>
      i.name.toLowerCase().includes(q) || i.sku.toLowerCase().includes(q) ||
      i.category.toLowerCase().includes(q) || (brandMap.get(i.brand_id)?.name.toLowerCase().includes(q))
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
    return inventory
      .filter(e => e.item_id === itemId)
      .map(e => {
        const loc = locations.find(l => l.id === e.location_id);
        return { location: loc?.name, type: loc?.type, quantity: e.quantity };
      })
      .filter(l => l.location);
  };

  const handleAddLocation = async (e: React.FormEvent) => {
    e.preventDefault(); setSaving(true);
    try { await addLocation(locationForm); setLocationModal(false); setLocationForm({ name: '', type: 'warehouse', country: 'India', currency: 'INR' }); }
    finally { setSaving(false); }
  };

  const handleAddBrand = async (e: React.FormEvent) => {
    e.preventDefault(); setSaving(true);
    try { await addBrand(brandForm); setBrandModal(false); setBrandForm({ name: '', origin_country: 'India' }); }
    finally { setSaving(false); }
  };

  const handleAddItem = async (e: React.FormEvent) => {
    e.preventDefault(); 
    setSaving(true);
    try {
      let finalBrandId = itemForm.brand_id;

      // Handle manual brand creation if requested
      if (isManualBrand && itemForm.brand_manual) {
        finalBrandId = await addBrand({ name: itemForm.brand_manual, origin_country: 'India' });
      }

      if (editingItemId) {
        // Prepare item data for master record (exclude inventory-specific fields)
        const { stock, inventory_id, id, location_id, brand_manual, ...itemData } = itemForm;
        
        // Update item master data
        await updateItem(editingItemId, { ...itemData, brand_id: finalBrandId });
        
        // Update inventory quantity if this edit was triggered from an inventory row
        if (itemForm.inventory_id) {
          await updateDoc(doc(db, 'inventory', itemForm.inventory_id), { 
            quantity: itemForm.stock 
          });
        }
      } else {
        // Add new item
        const { id: _, stock, inventory_id, location_id, brand_manual, ...itemData } = itemForm;
        const itemRef = doc(collection(db, 'items'));
        const newItemId = itemRef.id;
        
        // 1. Save Master Item Record
        await setDoc(itemRef, { 
          id: newItemId, 
          ...itemData, 
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
            avg_cost_INR: itemForm.avg_cost_INR
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
            unit_cost: itemForm.avg_cost_INR,
            currency: 'INR',
            converted_value_INR: itemForm.avg_cost_INR * itemForm.stock,
            performed_by: appUser?.name || 'Admin',
            timestamp: new Date().toISOString()
          });
        }
      }
      
      setItemModal(false);
      setEditingItemId(null);
      setIsManualBrand(false);
      setItemForm({ id: '', brand_id: '', name: '', category: '', sku: '', min_stock_limit: 10, avg_cost_INR: 0, retail_price: 0, stock: 0, inventory_id: '', location_id: '', brand_manual: '' });
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
      const convertedCost = toINR(onboardForm.total_cost, onboardForm.currency);
      const containerId = await addContainer({
        container_no: onboardForm.container_no,
        source_country: onboardForm.source_country,
        total_cost: onboardForm.total_cost,
        currency: onboardForm.currency,
        converted_cost_INR: convertedCost,
        date: new Date(onboardForm.date).toISOString(),
        notes: onboardForm.notes,
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
           await setDoc(iRef, {
             id: itemId, brand_id: brandId, name: row.item_name,
             sku: row.sku || `SKU-${Date.now().toString().slice(-6)}`,
             category: row.category || 'General',
             retail_price: row.retail_price,
             min_stock_limit: row.min_stock_limit || 10
           });
           row.matched_item_id = itemId;
        } else {
           // Update existing item's retail_price and min_stock_limit if provided
           const updates: Partial<any> = {};
           if (row.retail_price) updates.retail_price = row.retail_price;
           if (row.min_stock_limit && row.min_stock_limit !== 10) updates.min_stock_limit = row.min_stock_limit;
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
        appUser?.name ?? 'Admin'
      );

      setOnboardModal(false);
      setActiveStep(1);
      setOnboardForm({
        container_no: '', source_country: 'China', total_cost: 0, currency: 'CNY', location_id: '',
        date: new Date().toISOString().split('T')[0], notes: '',
        rows: [{ brand_name: '', item_name: '', sku: '', category: '', quantity: 1, unit_cost: 0, retail_price: 0, min_stock_limit: 10, matched_item_id: '' }]
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

    setSaving(true);
    try {
      await transfer({
        ...transferForm,
        item_name: item.name,
        unit_cost_INR: sourceInv.avg_cost_INR,
        performed_by: appUser?.name ?? 'Admin',
      });
      setTransferModal(false);
      setTransferForm({ from_location: '', to_location: '', item_id: '', quantity: 1 });
    } catch (err: any) {
      alert(err.message);
    } finally {
      setSaving(false);
    }
  };

  const resetAddStockForm = () => {
    setAddStockForm({ item_id: '', location_id: '', quantity: 1, unit_cost: 0, currency: 'INR', brand_id: '', brand_manual: '', item_name: '', category: '', sku: '', retail_price: 0, min_stock_limit: 10 });
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
          finalBrandId = await addBrand({ name: addStockForm.brand_manual.trim(), origin_country: 'India' });
        }
        if (!finalBrandId) { alert('Please select or enter a brand.'); setSaving(false); return; }

        // Create new item
        const itemRef = doc(collection(db, 'items'));
        itemId = itemRef.id;
        itemName = addStockForm.item_name;
        await setDoc(itemRef, {
          id: itemId,
          brand_id: finalBrandId,
          name: addStockForm.item_name,
          sku: addStockForm.sku || `SKU-${Date.now().toString().slice(-6)}`,
          category: addStockForm.category || 'General',
          retail_price: addStockForm.retail_price || 0,
          min_stock_limit: addStockForm.min_stock_limit || 10,
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

      setAddStockModal(false);
      resetAddStockForm();
    } catch (err: any) {
      alert('Failed to add stock: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  const onDrop = useCallback((acceptedFiles: File[]) => {
    if (acceptedFiles.length > 0) {
      setExcelFile(acceptedFiles[0]);
    }
  }, []);
  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'],
      'application/vnd.ms-excel': ['.xls'],
      'application/pdf': ['.pdf'],
      'image/*': ['.png', '.jpg', '.jpeg']
    },
    multiple: false
  });

  // ── Parse a single sheet for stock warehouse format ──
  // Supports: SL NO | CODE | ITEM DESCRIPTION | OPENING | RECEIVED | SUPPLIED | RETURNED | CLOSING
  // Also: SL NO | ITEM DESCRIPTION | OPENING | RECEIVED | SALES/SUPPLIED | RETURNED | CLOSING
  const parseStockWarehouseSheet = (rows: any[][], sheetName: string): { name: string; qty: number; unitCost: number; retailPrice: number; sku: string; category: string; brandName: string; code: string; opening: number; received: number; supplied: number; returned: number; closing: number; minStockLimit?: number }[] => {
    const results: any[] = [];

    // Extract brand name from sheet header rows (rows 1-5) or sheet name
    let brandName = sheetName.replace(/-SUMM$/i, '').replace(/[-_]/g, ' ').trim();
    for (let i = 0; i < Math.min(6, rows.length); i++) {
      const rowStr = (rows[i] || []).map(c => String(c || '').trim()).join(' ').toUpperCase();
      // Look for "BRAND:" or brand name line (after STOCK-WAREHOUSE and before column headers)
      if (rowStr.includes('BRAND') || rowStr.includes('FORGE BRAND') || rowStr.includes('HORSE BRAND')) {
        const parts = rowStr.split(/[:–-]/).map(s => s.trim());
        if (parts.length >= 2) brandName = parts[parts.length - 1].replace(/BRAND/gi, '').trim() || brandName;
      }
      // Also check for standalone brand name between company header and table
      if (i >= 1 && i <= 3 && !rowStr.includes('INVESTMENTS') && !rowStr.includes('DATE') && !rowStr.includes('SL') && !rowStr.includes('STOCK')) {
        const cleaned = (rows[i] || []).map(c => String(c || '').trim()).filter(Boolean);
        if (cleaned.length === 1 && cleaned[0].length > 2 && cleaned[0].length < 40 && isNaN(Number(cleaned[0]))) {
          brandName = cleaned[0];
        }
      }
    }

    // Find header row with column names
    let headerIdx = -1;
    let colMap: Record<string, number> = {};
    for (let i = 0; i < Math.min(10, rows.length); i++) {
      const row = (rows[i] || []).map(c => String(c || '').toUpperCase().trim());
      const joined = row.join(' ');

      // Check for standard stock warehouse header patterns
      const hasItem = row.some(c => c.includes('ITEM') || c.includes('DESCRIPTION') || c.includes('NAME'));
      const hasQtyCol = row.some(c => ['OPENING', 'RECEIVED', 'CLOSING', 'SUPPLIED', 'RETURNED', 'SALES'].some(k => c.includes(k)));

      if (hasItem && hasQtyCol) {
        headerIdx = i;
        row.forEach((cell, idx) => {
          if (cell.includes('SL') || cell === 'NO' || cell === 'S.NO' || cell === 'SL.NO' || cell === 'SL NO') colMap['slno'] = idx;
          if (cell.includes('CODE') || cell === 'CODE#' || cell === 'CODE #') colMap['code'] = idx;
          if (cell.includes('ITEM') || cell.includes('DESCRIPTION') || cell.includes('NAME') || cell.includes('PARTICULAR')) colMap['name'] = idx;
          if (cell.includes('OPENING') || cell === 'OPS') colMap['opening'] = idx;
          if (cell.includes('RECEIVED') || cell === 'REC') colMap['received'] = idx;
          if (cell.includes('SUPPLIED') || cell.includes('SALES') || cell === 'SUPP' || cell.includes('SOLD')) colMap['supplied'] = idx;
          if (cell.includes('RETURNED') || cell === 'RTD' || cell.includes('RETURN')) colMap['returned'] = idx;
          if (cell.includes('CLOSING') || cell === 'CLS' || cell.includes('BALANCE')) colMap['closing'] = idx;
        });
        break;
      }
    }

    if (headerIdx === -1 || colMap['name'] === undefined) return results;

    // Parse data rows
    for (let i = headerIdx + 1; i < rows.length; i++) {
      const row = rows[i] || [];
      const itemName = String(row[colMap['name']] || '').trim();

      // Skip empty, header, or total rows
      if (!itemName || itemName.length < 2) continue;
      const upper = itemName.toUpperCase();
      if (['TOTAL', 'GRAND TOTAL', 'TOTAL QTY', 'SL NO', 'DATE', 'PARTICULARS'].some(k => upper === k || upper.startsWith(k + ' '))) continue;
      // Skip section headers (bold category names like "SHORTS", "MEN SHIRT", "COTTON PANTS", "COATS", "JOGGING")
      // These are typically short names with no numeric data in the row
      const hasAnyNumeric = [colMap['opening'], colMap['received'], colMap['supplied'], colMap['returned'], colMap['closing']]
        .filter(c => c !== undefined)
        .some(c => { const v = Number(String(row[c] || '').replace(/[^\d.-]/g, '')); return !isNaN(v) && v !== 0; });
      if (!hasAnyNumeric && itemName.length < 25 && !row[colMap['code']]) continue;

      const parseNum = (idx: number | undefined) => {
        if (idx === undefined) return 0;
        const raw = String(row[idx] || '').replace(/[^\d.-]/g, '');
        const n = Math.round(Number(raw));
        return isNaN(n) ? 0 : n;
      };

      const opening = parseNum(colMap['opening']);
      const received = parseNum(colMap['received']);
      const supplied = parseNum(colMap['supplied']);
      const returned = parseNum(colMap['returned']);
      const closing = parseNum(colMap['closing']);
      const code = String(row[colMap['code']] || '').trim();

      // Use closing stock as quantity; if 0 or missing, use opening + received - supplied + returned
      let qty = closing;
      if (qty === 0 && (opening > 0 || received > 0)) {
        qty = opening + received - supplied + returned;
      }

      results.push({
        name: itemName, qty: Math.max(qty, 0),
        unitCost: 0, retailPrice: 0, minStockLimit: 10,
        sku: code || `SKU-${Math.floor(Math.random() * 1000000)}`,
        category: brandName || 'Imported',
        brandName,
        code,
        opening, received, supplied, returned, closing
      });
    }

    return results;
  };

  const handleImportExcel = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!excelFile || !importTargetLocation) return;
    setIsProcessing(true);
    setProcessingStatus('Initialising parser...');

    try {
      let rows: any[][] = [];
      const fileType = excelFile.name.split('.').pop()?.toLowerCase();
      let workbook: XLSX.WorkBook | null = null;

      if (fileType === 'xlsx' || fileType === 'xls') {
        setProcessingStatus('Reading spreadsheet...');
        const buffer = await excelFile.arrayBuffer();
        workbook = XLSX.read(buffer, { type: 'array' });
        const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
        rows = XLSX.utils.sheet_to_json<any[]>(firstSheet, { header: 1 });
      } else if (fileType === 'pdf' || fileType?.match(/png|jpg|jpeg/)) {
        setProcessingStatus('Performing OCR text extraction...');
        const { data: { text } } = await Tesseract.recognize(excelFile, 'eng', {
          logger: m => m.status === 'recognizing text' ? setProcessingStatus(`OCR: ${Math.round(m.progress * 100)}%`) : null
        });
        rows = text.split('\n').filter(l => l.trim()).map(line => line.split(/\s{2,}|\t/));
      }

      setProcessingStatus('Analyzing structure...');
      let parsedItems: { 
        name: string; qty: number; unitCost: number; retailPrice: number; sku: string; category: string; minStockLimit?: number;
        opening?: number; received?: number; supplied?: number; returned?: number; closing?: number;
      }[] = [];

      // ── MODE 1: Multi-Sheet Stock Warehouse Format ──
      // Detect if this is a multi-brand stock warehouse workbook
      // Signs: multiple sheets with brand names, headers with STOCK/WAREHOUSE, columns with OPENING/CLOSING
      let isMultiSheetStock = false;
      if (workbook && workbook.SheetNames.length > 1) {
        // Check first sheet for stock warehouse indicators
        const firstSheetStr = rows.slice(0, 8).map(r => (r || []).map((c: any) => String(c || '').toUpperCase()).join(' ')).join(' ');
        const hasStockHeader = firstSheetStr.includes('STOCK') || firstSheetStr.includes('WAREHOUSE') || firstSheetStr.includes('INVESTMENTS');
        const hasStockCols = firstSheetStr.includes('OPENING') || firstSheetStr.includes('CLOSING') || firstSheetStr.includes('RECEIVED') || firstSheetStr.includes('SUPPLIED');
        // Also check if sheet names look like brand summaries (contain SUMM, or just brand names)
        const brandSheetCount = workbook.SheetNames.filter(n =>
          n.toUpperCase().includes('SUMM') || n.toUpperCase().includes('SUMMARY') ||
          (!n.toUpperCase().includes('TOTAL') && n.length > 2)
        ).length;

        if ((hasStockHeader || hasStockCols) && brandSheetCount >= 1) {
          isMultiSheetStock = true;
        }
      }

      if (isMultiSheetStock && workbook) {
        setProcessingStatus(`Detected multi-brand stock workbook (${workbook.SheetNames.length} sheets)...`);

        for (let s = 0; s < workbook.SheetNames.length; s++) {
          const sheetName = workbook.SheetNames[s];
          setProcessingStatus(`Reading sheet ${s + 1}/${workbook.SheetNames.length}: ${sheetName}...`);

          const sheet = workbook.Sheets[sheetName];
          const sheetRows = XLSX.utils.sheet_to_json<any[]>(sheet, { header: 1 });

          if (sheetRows.length < 3) continue; // Skip empty or too-small sheets

          const sheetItems = parseStockWarehouseSheet(sheetRows, sheetName);
          parsedItems.push(...sheetItems);
        }

        // Deduplicate by item name (same item may appear on multiple sheets — sum quantities)
        const deduped = new Map<string, typeof parsedItems[0]>();
        for (const item of parsedItems) {
          const key = item.name.toLowerCase();
          if (deduped.has(key)) {
            const existing = deduped.get(key)!;
            existing.qty += item.qty;
            if (existing.opening !== undefined && item.opening !== undefined &&
                existing.received !== undefined && item.received !== undefined &&
                existing.supplied !== undefined && item.supplied !== undefined &&
                existing.returned !== undefined && item.returned !== undefined &&
                existing.closing !== undefined && item.closing !== undefined) {
               existing.opening += item.opening;
               existing.received += item.received;
               existing.supplied += item.supplied;
               existing.returned += item.returned;
               existing.closing += item.closing;
            }
          } else {
            deduped.set(key, { ...item });
          }
        }
        parsedItems = Array.from(deduped.values());

        setProcessingStatus(`Found ${parsedItems.length} unique items across all brand sheets.`);
      }

      // ── MODE 2: Single-sheet stock warehouse format ──
      // Even a single sheet can be in stock warehouse format
      else if (!isMultiSheetStock && rows.length > 3) {
        const headerStr = rows.slice(0, 8).map(r => (r || []).map((c: any) => String(c || '').toUpperCase()).join(' ')).join(' ');
        const isSingleStockSheet = (headerStr.includes('OPENING') || headerStr.includes('CLOSING')) &&
          (headerStr.includes('ITEM') || headerStr.includes('DESCRIPTION'));

        if (isSingleStockSheet) {
          setProcessingStatus('Detected stock warehouse format (single sheet)...');
          parsedItems = parseStockWarehouseSheet(rows, workbook?.SheetNames[0] || 'Import');
        } else {
          // ── MODE 3: Matrix Ledger Format ──
          let isMatrix = false;
          let metricRowIdx = -1;
          for (let i = 0; i < Math.min(20, rows.length); i++) {
            const rowString = (rows[i] || []).map((c: any) => String(c).toUpperCase()).join(' ');
            if (rowString.includes('OPS') || (rowString.includes('REC') && rowString.includes('CLS')) || rowString.includes('SUPP')) {
              isMatrix = true;
              metricRowIdx = i;
              break;
            }
          }

          if (isMatrix && metricRowIdx >= 1) {
            setProcessingStatus('Parsing Ledger Matrix (Priority: Closing Stock)...');
            const itemNames: Record<number, string> = {};
            let currentItem = '';
            const headerRow = rows[metricRowIdx - 1] || [];
            const topHeaderRow = metricRowIdx >= 2 ? rows[metricRowIdx - 2] : [];

            const forbiddenNames = ['DATE', 'PARTICULAR', 'PARTICULARS', '0', 'OPS', 'REC', 'SUPP', 'RTD', 'CLS'];
            for (let c = 1; c < (rows[metricRowIdx]?.length || 0); c++) {
              const subHeader = String(rows[metricRowIdx][c] || '').trim().toUpperCase();
              const val = String(topHeaderRow[c] || headerRow[c] || '').trim();
              const isValidName = val && !forbiddenNames.some(f => val.toUpperCase() === f) && isNaN(Number(val));

              if (subHeader === 'OPS' || subHeader === 'OPENING') {
                if (isValidName) { currentItem = val; } else { currentItem = ''; }
              } else {
                if (isValidName) { currentItem = val; }
              }
              if (currentItem) itemNames[c] = currentItem;
            }

            const itemBalances: Record<string, number> = {};
            for (let c = 2; c < (rows[metricRowIdx]?.length || 0); c++) {
              const iName = itemNames[c];
              if (!iName) continue;
              const colHeader = String(rows[metricRowIdx][c] || '').trim().toUpperCase();
              if (['OPS', 'OPENING', 'REC', 'RECEIVED'].some(head => colHeader === head || colHeader.includes(head))) {
                const topValRaw = headerRow[c];
                if (topValRaw !== undefined && topValRaw !== null && String(topValRaw).trim() !== '') {
                  const v = Math.round(Number(String(topValRaw).replace(/[^\d.-]/g, '')));
                  if (!isNaN(v)) { itemBalances[iName] = (itemBalances[iName] || 0) + v; }
                }
              }
            }

            parsedItems = Object.entries(itemBalances).map(([name, qty]) => ({
              name, qty, unitCost: 0, retailPrice: 0, minStockLimit: 10,
              sku: `SKU-${Math.floor(Math.random() * 1000000)}`, category: 'Ledger Import'
            }));
          } else {
            // ── MODE 4: Flat List ──
            setProcessingStatus('Parsing Flat List (Smart Detect)...');
            let nameCol = -1;
            let qtyCol = -1;
            let startIdx = 0;

            for (let i = 0; i < Math.min(20, rows.length); i++) {
              const row = (rows[i] || []).map((c: any) => String(c).toUpperCase().trim());
              let qIdx = row.findIndex((c: string) => ['CLS', 'CLOSING', 'BALANCE'].some(k => c === k || c.startsWith(k)));
              if (qIdx === -1) qIdx = row.findIndex((c: string) => ['QTY', 'QUANTITY', 'TOTAL', 'REC', 'STOCK'].some(k => c === k || c.startsWith(k)));

              if (qIdx !== -1) {
                qtyCol = qIdx;
                const nIdx = row.findIndex((c: string) => ['ITEM', 'NAME', 'PARTICULAR', 'DESCRIPTION', 'PRODUCT'].some(k => c.includes(k)));
                nameCol = nIdx !== -1 ? nIdx : 0;
                startIdx = i + 1;
                break;
              }
            }

            if (qtyCol === -1) qtyCol = 1;
            if (nameCol === -1) nameCol = 0;

            for (let i = startIdx; i < rows.length; i++) {
              const row = rows[i] || [];
              const pName = String(row[nameCol] || '').trim();
              const pQty = Math.round(Number(String(row[qtyCol] || '').replace(/[^\d.-]/g, '')));

              if (!pName || isNaN(pQty) || pName.length < 2) continue;
              if (['DATE', 'PARTICULARS', 'TOTAL', 'GRAND TOTAL'].includes(pName.toUpperCase())) continue;

              parsedItems.push({
                name: pName, qty: pQty,
                unitCost: 0, retailPrice: 0, minStockLimit: 10,
                sku: `SKU-${Date.now().toString().slice(-6)}-${i}`, category: 'List Import'
              });
            }
          }
        }
      }

      setImportPreview(parsedItems);
      setProcessingStatus(`Success! Found ${parsedItems.length} items with Closing Stock values.`);
    } catch (err: any) {
      console.error(err);
      alert("Parser Error: " + err.message);
    } finally {
      setIsProcessing(false);
    }
  };

  const executeFinalImport = async () => {
    if (!importTargetLocation || importPreview.length === 0) return;
    setSaving(true);
    try {
      setProcessingStatus('Preparing import...');

      // Create container record
      const containerId = await addContainer({
        container_no: `IMP-PRO-${Date.now().toString().slice(-6)}`,
        source_country: 'Smart Import',
        total_cost: 0, currency: 'INR', converted_cost_INR: 0,
        date: new Date().toISOString(),
        notes: `Confirmed import with ${importPreview.length} items`,
      });

      setProcessingStatus(`Building batches for ${importPreview.length} items...`);

      // ── O(1) lookups ──────────────────────────────────────────────────────
      const localItemsMap = new Map<string, any>();
      items.forEach(it => localItemsMap.set(it.name.toLowerCase().trim(), it));
      const localBrandsMap = new Map<string, any>();
      brands.forEach(b => localBrandsMap.set(b.name.trim().toUpperCase(), b));

      // ── Pre-build inventory snapshot for delta calculation ─────────────────
      const inventorySnapshot = new Map(
        useStore.getState().inventory.map(e => [
          `${e.location_id.replace(/\//g, '-')}_${e.item_id.replace(/\//g, '-')}`, e
        ])
      );

      // ── Collect ALL batches up front — zero awaits in the loop ──────────
      // IMPORTANT: We skip transaction records during bulk import.
      // This cuts writes by ~33% (709→~1,418 instead of ~2,127) preventing quota exhaustion.
      // Stock reports derive numbers from inventory quantities directly.
      const allMasterBatches: ReturnType<typeof writeBatch>[] = [];
      let masterBatch = writeBatch(db);
      let masterOpCount = 0;

      const inventoryBatches: ReturnType<typeof writeBatch>[] = [];
      let invBatch = writeBatch(db);
      let invOpCount = 0;

      // Chunk size: 200 ops/batch stays well under Firestore's 500 limit and burst rate
      const MASTER_CHUNK = 200;
      const INV_CHUNK = 200;

      let newItemsCreated = 0;
      let existingItemsUpdated = 0;
      const nowStr = new Date().toISOString();

      for (const pItem of importPreview) {
        let item = localItemsMap.get(pItem.name.toLowerCase().trim());
        let itemId = item?.id;
        const incomingCostINR = toINR(pItem.unitCost, importCurrency);

        // ── Brand resolution (no await) ──────────────────────────────────────
        const brandNameText = (pItem.category || 'Imported').trim().toUpperCase();
        let matchedBrand = localBrandsMap.get(brandNameText);
        let brandId = matchedBrand?.id;

        if (!brandId) {
          const bRef = doc(collection(db, 'brands'));
          brandId = bRef.id;
          if (masterOpCount >= MASTER_CHUNK) {
            allMasterBatches.push(masterBatch);
            masterBatch = writeBatch(db);
            masterOpCount = 0;
          }
          masterBatch.set(bRef, { id: brandId, name: brandNameText, description: 'Auto-imported brand', origin_country: 'Imported' });
          masterOpCount++;
          const newBrand = { id: brandId, name: brandNameText, description: 'Auto-imported brand', origin_country: 'Imported' };
          brands.push(newBrand as Brand);
          localBrandsMap.set(brandNameText, newBrand);
        }

        // ── Item resolution (no await) ────────────────────────────────────────
        if (!itemId) {
          const iRef = doc(collection(db, 'items'));
          itemId = iRef.id;
          const newItem = {
            id: itemId, brand_id: brandId || brands[0]?.id || 'imported', name: pItem.name,
            sku: pItem.sku || `SKU-${Date.now().toString().slice(-6)}`,
            category: pItem.category || 'Imported',
            min_stock_limit: pItem.minStockLimit || 10,
            retail_price: pItem.retailPrice || 0,
            avg_cost_INR: incomingCostINR
          };
          if (masterOpCount >= MASTER_CHUNK) {
            allMasterBatches.push(masterBatch);
            masterBatch = writeBatch(db);
            masterOpCount = 0;
          }
          masterBatch.set(iRef, newItem);
          masterOpCount++;
          localItemsMap.set(pItem.name.toLowerCase().trim(), newItem);
          newItemsCreated++;
        } else {
          const updateData: any = {};
          if (pItem.retailPrice !== undefined && pItem.retailPrice > 0) updateData.retail_price = pItem.retailPrice;
          if (incomingCostINR !== undefined && incomingCostINR > 0) updateData.avg_cost_INR = incomingCostINR;
          if (pItem.minStockLimit !== undefined) updateData.min_stock_limit = pItem.minStockLimit;
          if (brandId) updateData.brand_id = brandId;
          if (Object.keys(updateData).length > 0) {
            if (masterOpCount >= MASTER_CHUNK) {
              allMasterBatches.push(masterBatch);
              masterBatch = writeBatch(db);
              masterOpCount = 0;
            }
            masterBatch.update(doc(db, 'items', itemId), updateData);
            masterOpCount++;
            existingItemsUpdated++;
          }
        }

        // ── Inventory record (no await) ───────────────────────────────────────
        const safeLocId = importTargetLocation.replace(/\//g, '-');
        const safeItemId = (itemId as string).replace(/\//g, '-');
        const invId = `${safeLocId}_${safeItemId}`;
        const existing = inventorySnapshot.get(invId);
        
        let opening = 0;
        let received = 0;
        let supplied = 0;
        let returned = 0;

        // "during the very first import of stocks read the closing stock data from the excel file and place it in the opening stocks column as well as closing column"
        if (!existing) {
          const excelClosing = pItem.closing || pItem.qty || 0;
          opening = excelClosing;
          received = 0;
          supplied = 0;
          returned = 0;
        } else {
          // "during the next import calulate closing stock by opening stock+received-supplied+returned"
          // (Opening is shifted from previous closing as per instruction)
          opening = existing.quantity || 0;
          received = pItem.received || 0;
          supplied = pItem.supplied || 0;
          returned = pItem.returned || 0;
        }
        
        const newQty = opening + received - supplied + returned;

        if (invOpCount >= INV_CHUNK) {
          inventoryBatches.push(invBatch);
          invBatch = writeBatch(db);
          invOpCount = 0;
        }
        invBatch.set(doc(db, 'inventory', invId), {
          id: invId, 
          location_id: importTargetLocation,
          item_id: itemId, 
          quantity: newQty,
          opening_balance: opening,
          received_balance: received,
          supplied_balance: supplied,
          returned_balance: returned,
          last_import_timestamp: new Date().toISOString(),
          avg_cost_INR: incomingCostINR > 0 ? incomingCostINR : (existing?.avg_cost_INR ?? 0)
        });
        invOpCount++;

      }

      // Push remaining partial batches
      if (masterOpCount > 0) allMasterBatches.push(masterBatch);
      if (invOpCount > 0) inventoryBatches.push(invBatch);

      const totalBatches = allMasterBatches.length + inventoryBatches.length;
      setProcessingStatus(`Saving ${totalBatches} batches (${newItemsCreated} new, ${existingItemsUpdated} updated)...`);

      // ── Sequential commits with delay — prevents Firestore quota exhaustion ─
      // 200 ops per batch × sequential = safe for Spark and Blaze plans
      const allBatches = [...allMasterBatches, ...inventoryBatches];
      const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

      for (let i = 0; i < allBatches.length; i++) {
        await allBatches[i].commit();
        setProcessingStatus(`Saving... ${i + 1}/${allBatches.length} batches done`);
        if (i < allBatches.length - 1) await sleep(300);
      }

      alert(`Import successful! ${newItemsCreated} new items created, ${existingItemsUpdated} updated.`);
      setImportPreview([]);
      setImportExcelModal(false);
      setExcelFile(null);
    } catch (err: any) {
      alert('Import failed: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  const tabs: { key: ActiveTab; label: string; icon: React.ElementType }[] = [
    { key: 'inventory', label: 'Inventory', icon: Boxes },
    { key: 'containers', label: 'Containers', icon: Truck },
    { key: 'items', label: 'Items', icon: Package },
    { key: 'brands', label: 'Brands', icon: Tag },
    { key: 'locations', label: 'Locations', icon: Globe2 },
    { key: 'settings', label: 'Settings', icon: Globe2 },
  ];

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
            disabled={exporting}
            onClick={async () => {
              setExporting(true);
              try {
                await exportInventorySystemData({
                  inventory, sales: useStore.getState().sales, 
                  returns: useStore.getState().returns, 
                  expenses: useStore.getState().expenses, 
                  locations, items, brands
                });
              } catch (err: any) {
                alert('Export failed: ' + err.message);
              } finally {
                setExporting(false);
              }
            }} 
            className="btn-secondary flex items-center gap-2 text-sm justify-center border-emerald-200 hover:bg-emerald-50 hover:text-emerald-600 transition-all font-bold disabled:opacity-50"
          >
            <FileText className="w-4 h-4" />
            <span className="whitespace-nowrap">{exporting ? 'Exporting...' : 'Export All'}</span>
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
          <button onClick={() => setImportExcelModal(true)} className="btn-secondary flex items-center gap-2 text-sm justify-center border-primary/20 hover:bg-primary/5 hover:text-primary transition-all">
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
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" /> At average cost (INR)
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
        <div className="bg-white rounded-2xl border border-gray-100 p-4 sm:p-5 shadow-sm hover:shadow-md transition-all">
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
                        onChange={toggleAllSelection}
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
                    <th className="px-4 py-3 font-medium text-right cursor-pointer select-none hover:text-gray-700 transition-colors" onClick={() => toggleSort('avg_cost')}>
                      <span className="flex items-center gap-1 justify-end">Avg Cost <SortIcon field="avg_cost" /></span>
                    </th>
                    <th className="px-4 py-3 font-medium text-right cursor-pointer select-none hover:text-gray-700 transition-colors" onClick={() => toggleSort('retail_price')}>
                      <span className="flex items-center gap-1 justify-end">Retail <SortIcon field="retail_price" /></span>
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
                            <button type="button" onClick={() => setImportExcelModal(true)} className="btn-secondary text-xs flex items-center gap-1.5 py-2 px-4">
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
                          onChange={() => toggleRowSelection(r.id)}
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
                      <td className="px-4 py-3 text-right text-gray-700 tabular-nums">{formatCurrency(r.avg_cost_INR)}</td>
                      <td className="px-4 py-3 text-right">
                        <p className="font-bold text-gray-900 tabular-nums">{formatCurrency(r.item.retail_price || 0)}</p>
                        {r.profitMargin > 0 && (
                          <p className={clsx("text-[10px] font-bold mt-0.5", r.profitMargin >= 30 ? 'text-emerald-600' : r.profitMargin >= 15 ? 'text-blue-600' : 'text-gray-400')}>
                            {r.profitMargin.toFixed(0)}% margin
                          </p>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex justify-end gap-1.5">
                          <button title="Edit Item & Costs" onClick={() => { setEditingItemId(r.item_id); setItemForm({ id: r.item_id, brand_id: r.item.brand_id, name: r.item.name, category: r.item.category, sku: r.item.sku, min_stock_limit: r.item.min_stock_limit, avg_cost_INR: r.avg_cost_INR, retail_price: r.item.retail_price || 0, stock: r.quantity, inventory_id: r.id, location_id: '', brand_manual: '' }); setItemModal(true); }} className="text-gray-400 hover:text-primary transition-colors p-1.5 rounded-lg bg-gray-50 hover:bg-primary/10"><Pencil className="w-3.5 h-3.5" /></button>
                          <button title="Transfer Stock" onClick={() => { setTransferForm({ from_location: r.location_id, to_location: '', item_id: r.item_id, quantity: 1 }); setTransferModal(true); }} className="text-gray-400 hover:text-orange-500 transition-colors p-1.5 rounded-lg bg-gray-50 hover:bg-orange-50"><Truck className="w-3.5 h-3.5" /></button>
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
                            onChange={() => toggleRowSelection(r.id)}
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
                          <button title="Edit" onClick={() => { setEditingItemId(r.item_id); setItemForm({ id: r.item_id, brand_id: r.item.brand_id, name: r.item.name, category: r.item.category, sku: r.item.sku, min_stock_limit: r.item.min_stock_limit, avg_cost_INR: r.avg_cost_INR, retail_price: r.item.retail_price || 0, stock: r.quantity, inventory_id: r.id, location_id: '', brand_manual: '' }); setItemModal(true); }} className="text-gray-400 hover:text-primary transition-colors p-2 rounded-lg bg-gray-50 hover:bg-primary/10"><Pencil className="w-4 h-4" /></button>
                          <button title="Transfer" onClick={() => { setTransferForm({ from_location: r.location_id, to_location: '', item_id: r.item_id, quantity: 1 }); setTransferModal(true); }} className="text-gray-400 hover:text-orange-500 transition-colors p-2 rounded-lg bg-gray-50 hover:bg-orange-50"><Truck className="w-4 h-4" /></button>
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
                          <p className="text-[9px] uppercase font-bold text-emerald-600 tracking-wider">Avg Cost</p>
                          <p className="text-[11px] font-bold text-emerald-900 mt-0.5">{formatCurrency(r.avg_cost_INR)}</p>
                        </div>
                        <div className="bg-purple-50 rounded-lg p-2.5 border border-purple-100">
                          <p className="text-[9px] uppercase font-bold text-purple-600 tracking-wider">Retail</p>
                          <p className="text-[11px] font-bold text-purple-900 mt-0.5">{formatCurrency(r.item.retail_price || 0)}</p>
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
            {/* Desktop Table View */}
            <div className="hidden lg:block overflow-x-auto">
              <table className="w-full text-sm text-left min-w-[600px]">
                <thead className="bg-gray-50 text-xs uppercase text-gray-500">
                  <tr>
                    <th className="px-5 py-3 font-medium">Source Country</th>
                    <th className="px-5 py-3 font-medium">Date</th>
                    <th className="px-5 py-3 font-medium text-right">Total Cost</th>
                    <th className="px-5 py-3 font-medium">Packing List (Logged)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50 bg-white">
                  {containers.length === 0 ? (
                    <tr><td colSpan={4} className="px-5 py-12 text-center text-gray-400 text-sm">No containers logged yet. Use "Onboard Container" to start.</td></tr>
                  ) : containers.map(c => (
                    <tr key={c.id} className="hover:bg-gray-50/50 transition-colors border-b border-gray-100 last:border-0">
                      <td className="px-5 py-3.5 align-top">
                        <div className="font-medium text-gray-900">{c.source_country}</div>
                        <div className="text-[10px] text-primary mt-1 uppercase font-extrabold tracking-wider">#{c.container_no || c.id.slice(-6)}</div>
                      </td>
                      <td className="px-5 py-3.5 text-gray-500 align-top whitespace-nowrap">{new Date(c.date).toLocaleDateString('en-IN')}</td>
                      <td className="px-5 py-3.5 text-right font-medium text-gray-900 align-top whitespace-nowrap">{formatDualCurrency(c.total_cost, c.currency)}</td>
                      <td className="px-5 py-3.5 align-top">
                        <div className="text-gray-400 text-[11px] mb-2 italic line-clamp-1" title={c.notes}>{c.notes || 'No container notes'}</div>
                        <div className="flex flex-wrap gap-1.5 min-h-[20px]">
                          {/* Linked Items Visualization */}
                          {transactions.filter(t => t.container_id === c.id).length > 0 ? (
                             transactions.filter(t => t.container_id === c.id).map((t: any) => (
                               <span key={t.id} className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-blue-50 text-blue-600 border border-blue-100 whitespace-nowrap">
                                 {t.item_name} × {t.quantity}
                               </span>
                             ))
                          ) : (
                            <span className="text-[10px] text-gray-300">No stock entry linked yet</span>
                          )}
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
                  {containers.map(c => (
                    <div key={c.id} className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm hover:shadow-md transition-all">
                      {/* Header */}
                      <div className="flex justify-between items-start mb-3 gap-2">
                        <div>
                          <p className="text-sm font-bold text-gray-900">{c.source_country}</p>
                          <p className="text-[10px] text-primary uppercase font-extrabold tracking-wider mt-1">Container #{c.container_no || c.id.slice(-6)}</p>
                        </div>
                        <div className="text-right">
                          <p className="text-xs text-gray-500">{new Date(c.date).toLocaleDateString('en-IN')}</p>
                        </div>
                      </div>

                      {/* Cost section */}
                      <div className="bg-gradient-to-r from-blue-50 to-blue-50 border border-blue-100 rounded-lg p-3 mb-3">
                        <p className="text-[9px] uppercase font-bold text-blue-600 tracking-wider">Total Cost</p>
                        <p className="text-sm font-bold text-blue-900 mt-1">{formatDualCurrency(c.total_cost, c.currency)}</p>
                      </div>

                      {/* Notes */}
                      {c.notes && (
                        <div className="bg-gray-50 border border-gray-100 rounded-lg p-3 mb-3">
                          <p className="text-[9px] uppercase font-bold text-gray-600 tracking-wider mb-1">Notes</p>
                          <p className="text-xs text-gray-700">{c.notes}</p>
                        </div>
                      )}

                      {/* Linked items */}
                      <div className="bg-gray-50 border border-gray-100 rounded-lg p-3">
                        <p className="text-[9px] uppercase font-bold text-gray-600 tracking-wider mb-2">Packing List</p>
                        <div className="flex flex-wrap gap-1.5 min-h-[20px]">
                          {transactions.filter(t => t.container_id === c.id).length > 0 ? (
                            transactions.filter(t => t.container_id === c.id).map((t: any) => (
                              <span key={t.id} className="inline-flex items-center px-2 py-1 rounded text-[10px] font-medium bg-blue-100 text-blue-700 border border-blue-200">
                                {t.item_name} × {t.quantity}
                              </span>
                            ))
                          ) : (
                            <span className="text-[10px] text-gray-400">No stock entry linked yet</span>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── Items Tab ── */}
        {activeTab === 'items' && (
          <div>
            <div className="p-4 flex flex-col sm:flex-row gap-3 justify-between border-b border-gray-50">
              <div className="relative flex-1 max-w-md">
                <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input value={itemsSearch} onChange={e => { setItemsSearch(e.target.value); setItemsPage(1); }}
                  placeholder="Search items by name, SKU, category, brand..." className="input-field pl-10 h-10 text-sm" />
              </div>
              <button onClick={() => setItemModal(true)} className="btn-primary flex items-center gap-2 text-sm h-10">
                <Plus className="w-4 h-4" /> Add Item
              </button>
            </div>

            {/* Desktop Table View */}
            <div className="hidden lg:block overflow-x-auto">
              <table className="w-full text-sm text-left min-w-[700px]">
                <thead className="bg-gray-50 text-xs uppercase text-gray-500">
                  <tr>
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
                    const stockOk = totalStock >= (item.min_stock_limit ?? 10);
                    return (
                      <tr key={item.id} className="hover:bg-gray-50/50 transition-colors">
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
                            <button title="Edit Item" onClick={() => { setEditingItemId(item.id); setItemForm({ id: item.id, brand_id: item.brand_id, name: item.name, category: item.category, sku: item.sku, min_stock_limit: item.min_stock_limit, avg_cost_INR: 0, retail_price: item.retail_price || 0, stock: totalStock, inventory_id: '', location_id: '', brand_manual: '' }); setItemModal(true); }} className="text-gray-400 hover:text-primary transition-colors p-1.5 rounded-lg bg-gray-50 hover:bg-primary/10"><Pencil className="w-3.5 h-3.5" /></button>
                            <button title="Delete Item" onClick={() => deleteItem(item.id)} className="text-gray-400 hover:text-red-500 transition-colors p-1.5 rounded-lg bg-gray-50 hover:bg-red-50"><Trash2 className="w-3.5 h-3.5" /></button>
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
                          <div className="flex-1 min-w-0">
                            <h3 className="font-bold text-gray-900 text-sm">{item.name}</h3>
                            <p className="text-xs text-gray-500 mt-1 font-mono">{item.sku}</p>
                          </div>
                          <div className="flex gap-1.5 flex-shrink-0">
                            <button title="Edit Item" onClick={() => { setEditingItemId(item.id); setItemForm({ id: item.id, brand_id: item.brand_id, name: item.name, category: item.category, sku: item.sku, min_stock_limit: item.min_stock_limit, avg_cost_INR: 0, retail_price: item.retail_price || 0, stock: totalStock, inventory_id: '', location_id: '', brand_manual: '' }); setItemModal(true); }} className="text-gray-400 hover:text-primary transition-colors p-2 rounded-lg bg-gray-50 hover:bg-primary/10"><Pencil className="w-4 h-4" /></button>
                            <button title="Delete Item" onClick={() => deleteItem(item.id)} className="text-gray-400 hover:text-red-500 transition-colors p-2 rounded-lg bg-gray-50 hover:bg-red-50 flex-shrink-0"><Trash2 className="w-4 h-4" /></button>
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
            {filteredItems.length > pageSize && (
              <div className="px-5 py-3 border-t border-gray-100 flex items-center justify-between text-xs text-gray-500">
                <span>Showing {((itemsPage - 1) * pageSize) + 1}–{Math.min(itemsPage * pageSize, filteredItems.length)} of {filteredItems.length}</span>
                <div className="flex items-center gap-1">
                  <button type="button" title="Previous page" disabled={itemsPage === 1} onClick={() => setItemsPage(p => p - 1)} className="p-1.5 rounded-lg border border-gray-200 disabled:opacity-30"><ChevronLeft className="w-3.5 h-3.5" /></button>
                  <span className="px-3 font-bold">{itemsPage} / {Math.ceil(filteredItems.length / pageSize)}</span>
                  <button type="button" title="Next page" disabled={itemsPage >= Math.ceil(filteredItems.length / pageSize)} onClick={() => setItemsPage(p => p + 1)} className="p-1.5 rounded-lg border border-gray-200 disabled:opacity-30"><ChevronRight className="w-3.5 h-3.5" /></button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── Brands Tab ── */}
        {activeTab === 'brands' && (
          <div>
            <div className="p-4 flex flex-col sm:flex-row gap-3 justify-between border-b border-gray-50">
              <div className="relative flex-1 max-w-md">
                <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input value={brandsSearch} onChange={e => { setBrandsSearch(e.target.value); setBrandsPage(1); }}
                  placeholder="Search brands..." className="input-field pl-10 h-10 text-sm" />
              </div>
              <button onClick={() => setBrandModal(true)} className="btn-primary flex items-center gap-2 text-sm h-10"><Plus className="w-4 h-4" /> Add Brand</button>
            </div>

            {/* Desktop Table View */}
            <div className="hidden lg:block overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead className="bg-gray-50 text-xs uppercase text-gray-500">
                  <tr>
                    <th className="px-5 py-3 font-medium">Brand Name</th>
                    <th className="px-5 py-3 font-medium">Origin Country</th>
                    <th className="px-5 py-3 font-medium text-right">Items</th>
                    <th className="px-5 py-3 font-medium text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50 bg-white">
                  {paginatedBrands.length === 0 ? (
                    <tr><td colSpan={4} className="px-5 py-12 text-center text-gray-400 text-sm">
                      {brands.length === 0 ? 'No brands yet.' : 'No brands match your search.'}
                    </td></tr>
                  ) : paginatedBrands.map(b => {
                    const itemCount = items.filter(i => i.brand_id === b.id).length;
                    return (
                      <tr key={b.id} className="hover:bg-gray-50/50 transition-colors">
                        <td className="px-5 py-3.5 font-medium text-gray-900">{b.name}</td>
                        <td className="px-5 py-3.5 text-gray-500">{b.origin_country}</td>
                        <td className="px-5 py-3.5 text-right">
                          <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-blue-50 text-blue-600">{itemCount}</span>
                        </td>
                        <td className="px-5 py-3.5 text-right">
                          <button title="Delete Brand" onClick={() => deleteBrand(b.id)} className="text-gray-400 hover:text-red-500 transition-colors p-1.5 rounded-lg bg-gray-50 hover:bg-red-50"><Trash2 className="w-3.5 h-3.5" /></button>
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
                  {paginatedBrands.map(b => {
                    const itemCount = items.filter(i => i.brand_id === b.id).length;
                    return (
                      <div key={b.id} className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm hover:shadow-md transition-all">
                        <div className="flex justify-between items-start gap-2">
                          <div>
                            <h3 className="font-bold text-gray-900 text-sm">{b.name}</h3>
                            <p className="text-xs text-gray-500 mt-1">Origin: {b.origin_country} · <span className="font-bold text-blue-600">{itemCount} items</span></p>
                          </div>
                          <button title="Delete Brand" onClick={() => deleteBrand(b.id)} className="text-gray-400 hover:text-red-500 transition-colors p-2 rounded-lg bg-gray-50 hover:bg-red-50 flex-shrink-0"><Trash2 className="w-4 h-4" /></button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Brands Pagination */}
            {filteredBrands.length > pageSize && (
              <div className="px-5 py-3 border-t border-gray-100 flex items-center justify-between text-xs text-gray-500">
                <span>Showing {((brandsPage - 1) * pageSize) + 1}–{Math.min(brandsPage * pageSize, filteredBrands.length)} of {filteredBrands.length}</span>
                <div className="flex items-center gap-1">
                  <button type="button" title="Previous page" disabled={brandsPage === 1} onClick={() => setBrandsPage(p => p - 1)} className="p-1.5 rounded-lg border border-gray-200 disabled:opacity-30"><ChevronLeft className="w-3.5 h-3.5" /></button>
                  <span className="px-3 font-bold">{brandsPage} / {Math.ceil(filteredBrands.length / pageSize)}</span>
                  <button type="button" title="Next page" disabled={brandsPage >= Math.ceil(filteredBrands.length / pageSize)} onClick={() => setBrandsPage(p => p + 1)} className="p-1.5 rounded-lg border border-gray-200 disabled:opacity-30"><ChevronRight className="w-3.5 h-3.5" /></button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── Locations Tab ── */}
        {activeTab === 'locations' && (
          <div>
            <div className="p-4 flex justify-end border-b border-gray-50">
              <button onClick={() => setLocationModal(true)} className="btn-primary flex items-center gap-2 text-sm h-10"><Plus className="w-4 h-4" /> Add Location</button>
            </div>

            {/* Desktop Table View */}
            <div className="hidden lg:block overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead className="bg-gray-50 text-xs uppercase text-gray-500">
                  <tr>
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
                      <tr key={l.id} className="hover:bg-gray-50/50 transition-colors">
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
                          <button title="Delete Location" onClick={() => deleteLocation(l.id)} className="text-gray-400 hover:text-red-500 transition-colors p-1.5 rounded-lg bg-gray-50 hover:bg-red-50"><Trash2 className="w-3.5 h-3.5" /></button>
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
            {locations.length > pageSize && (
              <div className="px-5 py-3 border-t border-gray-100 flex items-center justify-between text-xs text-gray-500">
                <span>Showing {((locationsPage - 1) * pageSize) + 1}–{Math.min(locationsPage * pageSize, locations.length)} of {locations.length}</span>
                <div className="flex items-center gap-1">
                  <button type="button" title="Previous page" disabled={locationsPage === 1} onClick={() => setLocationsPage(p => p - 1)} className="p-1.5 rounded-lg border border-gray-200 disabled:opacity-30"><ChevronLeft className="w-3.5 h-3.5" /></button>
                  <span className="px-3 font-bold">{locationsPage} / {Math.ceil(locations.length / pageSize)}</span>
                  <button type="button" title="Next page" disabled={locationsPage >= Math.ceil(locations.length / pageSize)} onClick={() => setLocationsPage(p => p + 1)} className="p-1.5 rounded-lg border border-gray-200 disabled:opacity-30"><ChevronRight className="w-3.5 h-3.5" /></button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── Settings Tab ── */}
        {activeTab === 'settings' && (
          <div className="p-4 sm:p-6 space-y-8">
            <div className="flex items-center justify-between border-b border-gray-100 pb-4">
              <div>
                <h2 className="text-xl font-bold text-gray-900 tracking-tight">System Settings</h2>
                <p className="text-sm text-gray-400 mt-1">Configure global platform parameters and exchange rates</p>
              </div>
              <div className="flex gap-2">
                <div className="px-3 py-1 bg-blue-50 text-blue-600 rounded-full text-[10px] font-bold uppercase tracking-widest border border-blue-100">Live Sync Active</div>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {/* Exchange Rates Segment */}
              <div className="md:col-span-2 space-y-4">
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center">
                    <Globe2 className="w-4 h-4" />
                  </div>
                  <h3 className="text-sm font-bold text-gray-900 uppercase tracking-wider">Exchange Rates (Per 1 INR)</h3>
                </div>

                <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50 border-b border-gray-100">
                      <tr>
                        <th className="px-5 py-3 text-left font-bold text-gray-500 uppercase tracking-tighter">Currency Code</th>
                        <th className="px-5 py-3 text-right font-bold text-gray-500 uppercase tracking-tighter">Conversion Rate (to INR)</th>
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
                              <p className="text-base font-black text-gray-900 tabular-nums">1 {curr} = ₹{rate.toFixed(2)}</p>
                              <p className="text-[10px] text-gray-400 font-medium">Automatic calculation applied</p>
                            </td>
                            <td className="px-5 py-4 text-right">
                              <button
                                type="button"
                                onClick={() => {
                                  const newRate = prompt(`Update exchange rate for ${curr} to INR:`, rate.toString());
                                  if (newRate && !isNaN(Number(newRate))) {
                                    setDoc(doc(db, 'exchange_rates', curr), { rate: Number(newRate) }, { merge: true });
                                    alert(`${curr} rate updated to ${newRate} INR successfully.`);
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
          </div>
        )}
      </div>

    {/* ── Modals ── */}
      <Modal isOpen={importExcelModal} onClose={() => setImportExcelModal(false)} title="Smart Stock Import" description="Upload Excel, PDF, or Images. Drag & Drop supported." size="xl">
        <form onSubmit={handleImportExcel} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-2">
              <label className="label">Source File</label>
              <div 
                {...getRootProps()} 
                className={`border-2 border-dashed rounded-2xl p-8 transition-all flex flex-col items-center justify-center text-center cursor-pointer
                  ${isDragActive ? 'border-primary bg-primary/5 scale-[0.99]' : 'border-gray-200 hover:border-primary/50 hover:bg-gray-50'}`}
              >
                <input {...getInputProps()} />
                {excelFile ? (
                  <div className="flex flex-col items-center">
                    <div className="w-12 h-12 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mb-3">
                      <FileText className="w-6 h-6" />
                    </div>
                    <p className="text-sm font-bold text-gray-900 line-clamp-1">{excelFile?.name}</p>
                    <button type="button" onClick={(e) => { e.stopPropagation(); setExcelFile(null); }} className="text-[10px] text-red-500 font-bold uppercase mt-2 flex items-center gap-1">
                      <X className="w-3 h-3" /> Remove File
                    </button>
                  </div>
                ) : (
                  <div className="flex flex-col items-center">
                    <div className="w-12 h-12 bg-primary/10 text-primary rounded-full flex items-center justify-center mb-3">
                      <Upload className="w-6 h-6" />
                    </div>
                    <p className="text-sm font-bold text-gray-900">Drag & Drop or Click</p>
                    <p className="text-[10px] text-gray-400 mt-1 uppercase font-semibold">Supports .xlsx, .pdf, .png, .jpg</p>
                  </div>
                )}
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="label text-gray-900 font-bold flex items-center gap-2">
                   Import Currency
                </label>
                <select title="Import Currency" className="input-field bg-white shadow-sm" value={importCurrency} onChange={e => setImportCurrency(e.target.value)}>
                  {CURRENCIES.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
                <p className="text-[10px] text-gray-400 mt-1 uppercase font-bold tracking-tighter">Currency for costs in this file.</p>
              </div>
              <div>
                <label className="label text-gray-900 font-bold flex items-center gap-2">
                  <Store className="w-4 h-4 text-primary" /> Destination Location
                </label>
                <select title="Select Location" required className="input-field bg-white shadow-sm" value={importTargetLocation} onChange={e => setImportTargetLocation(e.target.value)}>
                  <option value="">Select where to unload items…</option>
                  {locations.map(l => <option key={l.id} value={l.id}>{l.name} ({l.type})</option>)}
                </select>
              </div>
            </div>

              {isProcessing && (
                <div className="bg-primary/5 border border-primary/20 rounded-xl p-4 flex items-center gap-4 animate-pulse">
                  <div className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin"></div>
                  <div>
                    <p className="text-xs font-bold text-primary uppercase leading-none">Processing...</p>
                    <p className="text-[11px] text-primary/70 mt-1">{processingStatus}</p>
                  </div>
                </div>
              )}
            </div>

          <div className="mt-2 p-4 bg-gray-50 border border-gray-100 rounded-xl overflow-x-auto">
            {importPreview.length > 0 ? (
              <div className="space-y-4 animate-in fade-in slide-in-from-top-4 duration-500">
                <div className="flex items-center justify-between border-b border-gray-100 pb-3">
                  <p className="font-bold text-gray-900 text-sm flex items-center gap-2"><FileText className="w-4 h-4 text-emerald-500"/> Review Detected Items</p>
                  <p className="text-[10px] text-gray-400 uppercase font-black tracking-widest">{importPreview.length} Items Found</p>
                </div>
                <div className="max-h-[300px] overflow-y-auto custom-scrollbar">
                  <table className="w-full text-[11px] text-left">
                    <thead className="bg-gray-50 text-[10px] uppercase font-bold text-gray-400">
                      <tr>
                        <th className="py-3 px-3 text-left">Item Name</th>
                        <th className="py-3 px-3 text-left">SKU</th>
                        <th className="py-3 px-3 text-left">Brand</th>
                        <th className="py-3 px-3 text-right">Qty</th>
                        <th className="py-3 px-3 text-right">Unit Cost ({importCurrency})</th>
                        <th className="py-3 px-3 text-right">Retail Price</th>
                        <th className="py-3 px-3 text-right">Min Limit</th>
                        <th className="py-3 px-3 text-center">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {importPreview.map((item, idx) => (
                        <ImportPreviewRow 
                          key={item.name + idx} 
                          item={item} 
                          idx={idx} 
                          importCurrency={importCurrency}
                          onUpdate={handleUpdateImportItem}
                          onRemove={handleRemoveImportItem}
                        />
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="bg-emerald-50 border border-emerald-100 p-3 rounded-xl flex items-center justify-between">
                   <p className="text-[10px] text-emerald-700 font-bold uppercase tracking-tight">Review complete? Click below to finalize stock entry.</p>
                   <button type="button" onClick={executeFinalImport} disabled={saving} className="btn-primary py-1.5 px-4 text-[11px] bg-emerald-600 hover:bg-emerald-700 border-none shadow-none">
                     {saving ? 'Saving...' : 'Confirm & Save All'}
                   </button>
                </div>
              </div>
            ) : (
              <div className="animate-in fade-in duration-700">
                <p className="font-bold text-gray-700 mb-2 font-sans text-xs flex items-center gap-1"><Search className="w-3.5 h-3.5"/> Smart Parser Capability:</p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <p className="text-[9px] font-bold text-emerald-600 uppercase">1. Structured Matrices</p>
                    <p className="text-[10px] text-gray-500 font-sans leading-relaxed">Reads grouped columns with sub-metrics (OPS, REC, etc.) from standard inventory Excel files.</p>
                  </div>
                  <div className="space-y-2">
                    <p className="text-[9px] font-bold text-blue-600 uppercase">2. OCR & PDF Lists</p>
                    <p className="text-[10px] text-gray-500 font-sans leading-relaxed">Uses AI visual processing to extract stock items even from scanned PDFs, images, or plain text lists.</p>
                  </div>
                </div>
                <div className="mt-4 pt-4 border-t border-gray-200/50">
                  <p className="font-bold text-gray-700 mb-2 font-sans text-xs">Standard Matrix Example:</p>
                  <table className="w-full text-center border-collapse bg-white shadow-sm text-[9px]">
                    <thead className="bg-gray-100 text-gray-700">
                      <tr>
                        <th rowSpan={2} className="border border-gray-200 px-2 py-1">Date</th>
                        <th rowSpan={2} className="border border-gray-200 px-2 py-1">Particulars</th>
                        <th colSpan={5} className="border border-gray-200 px-2 py-1 bg-yellow-50 font-bold text-yellow-800 uppercase">LADIES T-SHIRT-L/S</th>
                        <th colSpan={5} className="border border-gray-200 px-2 py-1 bg-red-50 font-bold text-red-800 uppercase">MEN COTTON SHIRT</th>
                      </tr>
                      <tr>
                        <th className="border border-gray-200 px-1 py-1 bg-blue-50 text-blue-800 font-black">REC</th>
                        <th className="border border-gray-200 px-1 py-1 text-gray-400">...</th>
                        <th className="border border-gray-200 px-1 py-1 text-gray-400">...</th>
                        <th className="border border-gray-200 px-1 py-1 text-gray-400">...</th>
                        <th className="border border-gray-200 px-1 py-1 text-gray-400">...</th>
                        <th className="border border-gray-200 px-1 py-1 bg-blue-50 text-blue-800 font-black">REC</th>
                        <th className="border border-gray-200 px-1 py-1 text-gray-400">...</th>
                        <th className="border border-gray-200 px-1 py-1 text-gray-400">...</th>
                        <th className="border border-gray-200 px-1 py-1 text-gray-400">...</th>
                        <th className="border border-gray-200 px-1 py-1 text-gray-400">...</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr>
                        <td className="border border-gray-200 px-2 py-1">26/11/22</td>
                        <td className="border border-gray-200 px-2 py-1 text-left">FROM...</td>
                        <td className="border border-gray-200 px-1 py-1 font-bold bg-blue-50/50">5</td>
                        <td className="border border-gray-200 px-1 py-1 text-gray-400"></td><td className="border border-gray-200 px-1 py-1"></td><td className="border border-gray-200 px-1 py-1"></td><td className="border border-gray-200 px-1 py-1"></td>
                        <td className="border border-gray-200 px-1 py-1 font-bold bg-blue-50/50">4</td>
                        <td className="border border-gray-200 px-1 py-1 text-gray-400"></td><td className="border border-gray-200 px-1 py-1"></td><td className="border border-gray-200 px-1 py-1"></td><td className="border border-gray-200 px-1 py-1"></td>
                      </tr>
                    </tbody>
                  </table>
                  <p className="mt-3 text-gray-400 font-sans text-xs uppercase tracking-tighter">Parser will detect REC columns and sum quantities automatically.</p>
                </div>
              </div>
            )}
          </div>

          <div className="flex justify-end gap-3 pt-3 border-t border-gray-100">
            <button type="button" className="btn-secondary" onClick={() => { setImportExcelModal(false); setImportPreview([]); setExcelFile(null); }}>Cancel</button>
            <button type="submit" className="btn-primary" disabled={saving || !excelFile || importPreview.length > 0}>{saving ? 'Processing…' : 'Analyze & Preview'}</button>
          </div>
        </form>
      </Modal>


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
                setLocationForm(f => ({ ...f, country: e.target.value, currency: country?.currency ?? 'INR' }));
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

      <Modal isOpen={itemModal} onClose={() => { setItemModal(false); setEditingItemId(null); setIsManualBrand(false); setItemForm({ id: '', brand_id: '', name: '', category: '', sku: '', min_stock_limit: 10, avg_cost_INR: 0, retail_price: 0, stock: 0, inventory_id: '', location_id: '', brand_manual: '' }); }} title={editingItemId ? "Edit Item & Pricing" : "Add Item"} description={editingItemId ? "Update product details and pricing." : "Define a new product/SKU."} size="md">
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
              <label className="label">Brand</label>
              <input required className="input-field" placeholder="e.g. Apparel" value={itemForm.category} onChange={e => setItemForm(f => ({ ...f, category: e.target.value }))} />
            </div>
            <div>
              <label className="label">Min Stock Limit</label>
              <input title="Min Stock Limit" placeholder="0" required type="number" min={1} className="input-field" value={itemForm.min_stock_limit} onChange={e => setItemForm(f => ({ ...f, min_stock_limit: Number(e.target.value) }))} />
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
              <label className="label flex items-center gap-2">Avg Cost (INR) <span className="text-[10px] font-semibold text-orange-600 bg-orange-50 px-2 py-0.5 rounded">Weighted</span></label>
              <input title="Average Cost in INR" placeholder="0" type="number" step="0.01" min={0} className="input-field" value={itemForm.avg_cost_INR} onChange={e => setItemForm(f => ({ ...f, avg_cost_INR: Number(e.target.value) }))} />
            </div>
            <div>
              <label className="label flex items-center gap-2">Retail Price <span className="text-[10px] font-semibold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded">Sellable</span></label>
              <input title="Retail Price" placeholder="0" type="number" step="0.01" min={0} className="input-field" value={itemForm.retail_price} onChange={e => setItemForm(f => ({ ...f, retail_price: Number(e.target.value) }))} />
            </div>
          </div>
          <div className="flex justify-end gap-3 pt-3 border-t border-gray-100">
            <button type="button" className="btn-secondary" onClick={() => { setItemModal(false); setEditingItemId(null); setItemForm({ id: '', brand_id: '', name: '', category: '', sku: '', min_stock_limit: 10, avg_cost_INR: 0, retail_price: 0, stock: 0, inventory_id: '', location_id: '', brand_manual: '' }); }}>Cancel</button>
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
                  onClick={() => setOnboardForm(f => ({ ...f, rows: [...f.rows, { brand_name: '', item_name: '', sku: '', category: '', quantity: 1, unit_cost: 0, retail_price: 0, min_stock_limit: 10, matched_item_id: '' }] }))}
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
                          <label className="text-[10px] font-bold text-gray-400 uppercase mb-1 block">Retail (INR)</label>
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
          <div>
            <label className="label">Quantity</label>
            <input title="Quantity to Move" required type="number" min={1} max={inventory.find(e => e.location_id === transferForm.from_location && e.item_id === transferForm.item_id)?.quantity} className="input-field" value={transferForm.quantity || ''} onChange={e => setTransferForm(f => ({ ...f, quantity: Number(e.target.value) }))} />
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
             <div className="bg-gray-50 rounded-[1.5rem] border border-gray-100 overflow-hidden divide-y divide-gray-100">
                {stockDistribution?.distributions.map(loc => (
                  <div key={loc.id} className="p-4 flex items-center justify-between hover:bg-white transition-colors">
                     <div className="flex items-center gap-3">
                        <div className={clsx(
                          "w-10 h-10 rounded-xl flex items-center justify-center",
                          loc.type === 'warehouse' ? 'bg-blue-100 text-blue-600' : 'bg-emerald-100 text-emerald-600'
                        )}>
                           {loc.type === 'warehouse' ? <WarehouseIcon className="w-5 h-5" /> : <Store className="w-5 h-5" />}
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
          
          <div className="p-4 bg-gray-900 rounded-2xl text-white">
             <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-white/10 flex items-center justify-center">
                   <Truck className="w-5 h-5" />
                </div>
                <div>
                   <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Rebalancing Recommendation</p>
                   <p className="text-xs text-white/80 mt-0.5">Contact procurement if total system stock falls below {stockDistribution?.item?.min_stock_limit || 10} units.</p>
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
                  <input title="Min Stock Limit" type="number" min={1} className="input-field" value={addStockForm.min_stock_limit} onChange={e => setAddStockForm(f => ({ ...f, min_stock_limit: Number(e.target.value) }))} />
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
    </div>
  );
}
