import { useState, useMemo, useCallback } from 'react';
import * as XLSX from 'xlsx';
import { useDropzone } from 'react-dropzone';
import Tesseract from 'tesseract.js';
import {
  PackagePlus, Boxes, Search, Trash2, Plus,
  Truck, Tag, Globe2, Package, Store, Upload, FileText, X, AlertTriangle
} from 'lucide-react';
import clsx from 'clsx';
import { db } from '../lib/firebase';
import { collection, doc, setDoc } from 'firebase/firestore';
import Modal from '../components/Modal';
import {
  useStore, COUNTRIES, CURRENCIES, toINR, formatCurrency, formatDualCurrency,
  type Location, type Brand, type Item, type InventoryEntry
} from '../store';
import { useAuthStore } from '../store/authStore';

type ActiveTab = 'inventory' | 'containers' | 'brands' | 'items' | 'locations';

export default function Warehouse() {
  const { appUser } = useAuthStore();
  const {
    locations, brands, items, inventory, containers, transactions,
    addLocation, deleteLocation, addBrand, deleteBrand, addItem, deleteItem,
    addContainer, stockEntry, transfer,
  } = useStore();

  const warehouses = locations.filter(l => l.type === 'warehouse');
  const [activeTab, setActiveTab] = useState<ActiveTab>('inventory');
  const [search, setSearch] = useState('');
  const [filterLocation, setFilterLocation] = useState('');
  const [saving, setSaving] = useState(false);

  // ── Modals ──────────────────────────────────────────────────────────────────
  const [locationModal, setLocationModal] = useState(false);
  const [brandModal, setBrandModal] = useState(false);
  const [itemModal, setItemModal] = useState(false);
  const [transferModal, setTransferModal] = useState(false);
  const [onboardModal, setOnboardModal] = useState(false);
  const [importExcelModal, setImportExcelModal] = useState(false);
  const [activeStep, setActiveStep] = useState(1);

  const [locationForm, setLocationForm] = useState({ name: '', type: 'warehouse' as 'warehouse' | 'shop', country: 'India', currency: 'INR' });
  const [brandForm, setBrandForm] = useState({ name: '', origin_country: 'India' });
  const [itemForm, setItemForm] = useState({ id: '', brand_id: '', name: '', category: '', sku: '', min_stock_limit: 10, avg_cost_INR: 0, retail_price: 0 });
  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [excelFile, setExcelFile] = useState<File | null>(null);
  const [importTargetLocation, setImportTargetLocation] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [processingStatus, setProcessingStatus] = useState('');
  const [importPreview, setImportPreview] = useState<{ name: string; qty: number; unitCost: number; retailPrice: number; sku: string; category: string }[]>([]);
  
  const [transferForm, setTransferForm] = useState({
    from_location: '',
    to_location: '',
    item_id: '',
    quantity: 1,
  });

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
      matched_item_id: '' 
    }]
  });
  

  // Computed inventory table rows
  type RowType = InventoryEntry & { item: Item; loc: Location; brand: Brand | undefined; isLow: boolean };
  const inventoryRows = useMemo((): RowType[] => {
    return inventory
      .map(entry => {
        const item = items.find(i => i.id === entry.item_id);
        const loc = locations.find(l => l.id === entry.location_id);
        const brand = brands.find(b => b.id === item?.brand_id);
        if (!item || !loc) return null;
        const isLow = entry.quantity < (item.min_stock_limit ?? 10);
        return { ...entry, item, loc, brand, isLow };
      })
      .filter(Boolean)
      .filter(r => {
        const q = search.toLowerCase();
        const matchSearch = !q || r!.item.name.toLowerCase().includes(q) ||
          r!.item.sku.toLowerCase().includes(q) ||
          r!.item.category.toLowerCase().includes(q) ||
          r!.loc.name.toLowerCase().includes(q);
        const matchLoc = !filterLocation || r!.location_id === filterLocation;
        return matchSearch && matchLoc;
      }) as NonNullable<typeof inventoryRows[0]>[];
  }, [inventory, items, locations, brands, search, filterLocation]);

  const totalItems = inventoryRows.reduce((s, r) => s + r.quantity, 0);
  const totalValue = inventoryRows.reduce((s, r) => s + r.quantity * r.avg_cost_INR, 0);
  const lowCount = inventoryRows.filter(r => r.isLow).length;

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
    e.preventDefault(); setSaving(true);
    try { 
      await addItem(itemForm); 
      setItemModal(false);
      setEditingItemId(null);
      setItemForm({ id: '', brand_id: '', name: '', category: '', sku: '', min_stock_limit: 10, avg_cost_INR: 0, retail_price: 0 }); 
    }
    finally { setSaving(false); }
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

      // 2. Process Items
      for (const row of onboardForm.rows) {
        let itemId = row.matched_item_id;
        let itemName = row.item_name;

        if (!itemId) {
          // Find or create brand
          let brand = brands.find(b => b.name.toLowerCase() === row.brand_name.toLowerCase());
          let brandId = brand?.id;
          if (!brandId) {
             const bRef = doc(collection(db, 'brands'));
             brandId = bRef.id;
             await setDoc(bRef, { id: brandId, name: row.brand_name, origin_country: onboardForm.source_country });
          }

          // Create item
          const iRef = doc(collection(db, 'items'));
          itemId = iRef.id;
          await setDoc(iRef, {
            id: itemId,
            brand_id: brandId,
            name: row.item_name,
            sku: row.sku || `SKU-${Date.now().toString().slice(-6)}`,
            category: row.category || 'General',
            retail_price: row.retail_price,
            min_stock_limit: 10
          });
          itemName = row.item_name;
        }

        // 3. Stock Entry
        await stockEntry({
          container_id: containerId,
          location_id: onboardForm.location_id,
          item_id: itemId,
          item_name: itemName,
          quantity: row.quantity,
          unit_cost: row.unit_cost,
          currency: onboardForm.currency,
          performed_by: appUser?.name ?? 'Admin',
        });
      }

      setOnboardModal(false);
      setActiveStep(1);
      setOnboardForm({
        container_no: '', source_country: 'China', total_cost: 0, currency: 'CNY', location_id: '',
        date: new Date().toISOString().split('T')[0], notes: '',
        rows: [{ brand_name: '', item_name: '', sku: '', category: '', quantity: 1, unit_cost: 0, retail_price: 0, matched_item_id: '' }]
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

  const handleImportExcel = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!excelFile || !importTargetLocation) return;
    setSaving(true);
    setIsProcessing(true);
    setProcessingStatus('Initialising parser...');
    
    try {
      let rows: any[][] = [];
      const fileType = excelFile.name.split('.').pop()?.toLowerCase();

      if (fileType === 'xlsx' || fileType === 'xls') {
        setProcessingStatus('Reading spreadsheet...');
        const buffer = await excelFile.arrayBuffer();
        const workbook = XLSX.read(buffer, { type: 'array' });
        const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
        rows = XLSX.utils.sheet_to_json<any[]>(firstSheet, { header: 1 });
      } else if (fileType === 'pdf' || fileType?.match(/png|jpg|jpeg/)) {
        setProcessingStatus('Performing OCR text extraction...');
        const { data: { text } } = await Tesseract.recognize(excelFile, 'eng', {
          logger: m => m.status === 'recognizing text' ? setProcessingStatus(`OCR: ${Math.round(m.progress * 100)}%`) : null
        });
        
        // Convert text lines to rows
        rows = text.split('\n').filter(l => l.trim()).map(line => line.split(/\s{2,}|\t/));
      }

      setIsProcessing(true);
      setProcessingStatus('Analyzing structure...');
      let parsedItems: { name: string; qty: number; unitCost: number; retailPrice: number; sku: string; category: string }[] = [];

      let isMatrix = false;
      let metricRowIdx = -1;
      for (let i = 0; i < Math.min(15, rows.length); i++) {
        const rowString = (rows[i] || []).map(c => String(c).toUpperCase()).join(' ');
        if (rowString.includes('OPS') || rowString.includes('REC') || rowString.includes('CLS')) {
          isMatrix = true;
          metricRowIdx = i;
          break;
        }
      }

      if (isMatrix && metricRowIdx >= 1) {
        setProcessingStatus('Mapping matrix data...');
        const itemNames: Record<number, string> = {};
        let currentItem = '';
        const headerRow = rows[metricRowIdx - 1] || [];
        const topHeaderRow = metricRowIdx >= 2 ? rows[metricRowIdx - 2] : [];

        for (let c = 2; c < (rows[metricRowIdx]?.length || 0); c++) {
          const val = String(topHeaderRow[c] || headerRow[c] || '').trim();
          if (val && val !== '0' && isNaN(Number(val)) && val.length > 2) {
            currentItem = val;
          }
          if (currentItem) itemNames[c] = currentItem;
        }

        const itemRecSums: Record<string, number> = {};
        for(let i = metricRowIdx + 1; i < rows.length; i++) {
           const row = rows[i] || [];
           for (let c = 2; c < row.length; c++) {
             const colHeader = String(rows[metricRowIdx][c] || '').trim().toUpperCase();
             const iName = itemNames[c];
             if (iName && colHeader === 'REC') {
               const val = Number(row[c]);
               if (!isNaN(val) && val > 0) {
                 itemRecSums[iName] = (itemRecSums[iName] || 0) + val;
               }
             }
           }
        }
        
        parsedItems = Object.entries(itemRecSums).map(([name, qty]) => ({
          name, qty, unitCost: 0, retailPrice: 0, 
          sku: `SKU-${Math.floor(Math.random()*1000000)}`, category: 'Imported'
        }));
      } else {
         setProcessingStatus('Processing list entries...');
         for (let i = 0; i < rows.length; i++) {
           const row = (rows[i] || []).filter(c => String(c).trim());
           if (row.length < 2) continue;
           
           const potentialName = String(row[0]).trim();
           const potentialQty = Number(String(row[1]).replace(/[^\d.]/g, ''));
           if (!potentialName || isNaN(potentialQty) || potentialQty <= 0 || potentialName.length < 3) continue;
           if (['DATE', 'PARTICULARS', 'TOTAL', 'REMARKS'].includes(potentialName.toUpperCase())) continue;

           parsedItems.push({
             name: potentialName, qty: potentialQty, 
             unitCost: Number(row[2]) || 0, retailPrice: Number(row[3]) || 0,
             sku: `SKU-${Date.now().toString().slice(-8)}`, category: 'Uncategorized'
           });
         }
      }

      setImportPreview(parsedItems);
      setProcessingStatus(`Detected ${parsedItems.length} items. Please review below.`);
    } catch (err: any) {
      console.error(err);
      alert("Error: " + err.message);
    } finally {
      setIsProcessing(false);
    }
  };

  const executeFinalImport = async () => {
    if (!importTargetLocation || importPreview.length === 0) return;
    setSaving(true);
    try {
      const containerId = await addContainer({
        container_no: `IMP-PRO-${Date.now().toString().slice(-6)}`,
        source_country: 'Smart Import',
        total_cost: 0, currency: 'INR', converted_cost_INR: 0,
        date: new Date().toISOString(),
        notes: `Confirmed import with ${importPreview.length} items`,
      });

      for (const pItem of importPreview) {
        let item = items.find(it => it.name.toLowerCase() === pItem.name.toLowerCase());
        let itemId = item?.id;
        if (!itemId) {
          let brandId = brands[0]?.id;
          const iRef = doc(collection(db, 'items'));
          itemId = iRef.id;
          await setDoc(iRef, {
            id: itemId, brand_id: brandId || 'imported', name: pItem.name,
            sku: pItem.sku, category: pItem.category, 
            min_stock_limit: 10, retail_price: pItem.retailPrice
          });
        }

        await stockEntry({
          container_id: containerId,
          location_id: importTargetLocation,
          item_id: itemId,
          item_name: pItem.name,
          quantity: pItem.qty,
          unit_cost: pItem.unitCost,
          currency: 'INR',
          performed_by: appUser?.name ?? 'Admin',
        });
      }

      alert("Import successful!");
      setImportPreview([]);
      setImportExcelModal(false);
      setExcelFile(null);
    } catch (err: any) {
      alert("Import failed: " + err.message);
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
          <button onClick={() => setImportExcelModal(true)} className="btn-secondary flex items-center gap-2 text-sm justify-center border-primary/20 hover:bg-primary/5 hover:text-primary transition-all">
            <PackagePlus className="w-4 h-4 text-primary" /> 
            <span className="whitespace-nowrap">Import Excel</span>
          </button>
          <button onClick={() => { setActiveStep(1); setOnboardModal(true); }} className="btn-primary flex items-center gap-2 text-sm justify-center shadow-lg shadow-primary/20">
            <PackagePlus className="w-4 h-4" /> 
            <span className="whitespace-nowrap">Onboard Container</span>
          </button>
          <button onClick={() => setTransferModal(true)} className="btn-secondary flex items-center gap-2 text-sm justify-center">
            <Truck className="w-4 h-4" /> 
            <span className="whitespace-nowrap">Move Stock</span>
          </button>
        </div>
      </div>

      {/* KPI Strip */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
        <div className="bg-white rounded-2xl border border-gray-100 p-5 shadow-sm hover:shadow-md transition-all">
          <div className="flex items-center justify-between">
            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Total Units</p>
            <div className="w-8 h-8 rounded-lg bg-blue-50 flex items-center justify-center text-primary">
              <Boxes className="w-4 h-4" />
            </div>
          </div>
          <p className="text-3xl font-extrabold text-gray-900 mt-2">{totalItems.toLocaleString()}</p>
          <div className="h-1.5 w-full bg-gray-50 rounded-full mt-3 overflow-hidden">
            <div className="h-full bg-primary rounded-full" style={{ width: '70%' }} />
          </div>
          <p className="text-[10px] text-gray-400 mt-2 font-medium">{inventoryRows.length} active inventory entries</p>
        </div>
        <div className="bg-white rounded-2xl border border-gray-100 p-5 shadow-sm hover:shadow-md transition-all">
          <div className="flex items-center justify-between">
            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Stock Value</p>
            <div className="w-8 h-8 rounded-lg bg-emerald-50 flex items-center justify-center text-emerald-600">
              <Tag className="w-4 h-4" />
            </div>
          </div>
          <p className="text-3xl font-extrabold text-gray-900 mt-2">{formatCurrency(totalValue)}</p>
          <p className="text-[10px] text-gray-400 mt-5 font-medium flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" /> Valuation at average cost (INR)
          </p>
        </div>
        <div className="bg-white rounded-2xl border border-gray-100 p-5 shadow-sm hover:shadow-md transition-all group sm:col-span-2 lg:col-span-1">
          <div className="flex items-center justify-between">
            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Low Stock Alerts</p>
            <div className={clsx("w-8 h-8 rounded-lg flex items-center justify-center", lowCount > 0 ? "bg-red-50 text-red-500 animate-pulse" : "bg-gray-50 text-gray-400")}>
              <AlertTriangle className="w-4 h-4" />
            </div>
          </div>
          <p className={clsx("text-3xl font-extrabold mt-2", lowCount > 0 ? 'text-red-500' : 'text-gray-900')}>{lowCount}</p>
          <p className="text-[10px] text-gray-400 mt-5 font-medium">Critical items requiring replenishment</p>
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
                "flex items-center gap-2.5 px-6 py-4 text-sm font-semibold whitespace-nowrap transition-all border-b-2",
                activeTab === key
                  ? 'border-primary text-primary bg-primary/[0.02]'
                  : 'border-transparent text-gray-500 hover:text-gray-900 hover:bg-gray-50/50'
              )}
            >
              <Icon className={clsx("w-4 h-4", activeTab === key ? "text-primary" : "text-gray-400")} />
              {label}
            </button>
          ))}
        </div>

        {/* ── Inventory Tab ── */}
        {activeTab === 'inventory' && (
          <div className="flex flex-col">
            <div className="p-4 sm:p-5 flex flex-col sm:flex-row gap-4 border-b border-gray-50">
              <div className="relative flex-1">
                <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input value={search} onChange={e => setSearch(e.target.value)}
                  placeholder="Search item, SKU, category..." className="input-field pl-10 h-11" />
              </div>
              <select title="Filter by Location" value={filterLocation} onChange={e => setFilterLocation(e.target.value)} className="input-field bg-white h-11 sm:max-w-[240px]">
                <option value="">All Locations</option>
                {locations.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
              </select>
            </div>
            
            {/* Desktop Table View */}
            <div className="hidden lg:block table-container border-0 rounded-none shadow-none">
              <table className="w-full text-sm text-left min-w-[900px]">
                <thead className="bg-gray-50 text-xs uppercase text-gray-500">
                  <tr>
                    <th className="px-5 py-3 font-medium">Item</th>
                    <th className="px-5 py-3 font-medium">Location</th>
                    <th className="px-5 py-3 font-medium">Category</th>
                    <th className="px-5 py-3 font-medium text-right">Qty</th>
                    <th className="px-5 py-3 font-medium text-right">Avg Cost (INR)</th>
                    <th className="px-5 py-3 font-medium text-right">Retail Price</th>
                    <th className="px-5 py-3 font-medium text-center">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50 bg-white">
                  {inventoryRows.length === 0 ? (
                    <tr><td colSpan={8} className="px-5 py-12 text-center text-gray-400 text-sm">
                      {inventory.length === 0 ? 'No inventory yet. Start by onboarding a new container.' : 'No results match your filters.'}
                    </td></tr>
                  ) : inventoryRows.map(r => (
                    <tr key={r.id} className={`hover:bg-gray-50/50 transition-colors ${r.isLow ? 'bg-red-50/30' : ''}`}>
                      <td className="px-5 py-3.5">
                        <p className="font-medium text-gray-900">{r.item.name}</p>
                        <p className="text-xs text-gray-400">SKU: {r.item.sku} · {r.brand?.name}</p>
                        <p className="text-[11px] font-semibold text-primary mt-1.5">Total: {getTotalStockForItem(r.item_id)} units</p>
                        <div className="flex gap-1 mt-1.5 flex-wrap">
                          {getItemLocations(r.item_id).map((loc, idx) => (
                            <span key={idx} className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-blue-50 text-blue-600">{loc.location}: {loc.quantity}</span>
                          ))}
                        </div>
                      </td>
                      <td className="px-5 py-3.5">
                        <p className="text-gray-700">{r.loc.name}</p>
                        <p className="text-xs text-gray-400 capitalize">{r.loc.type} · {r.loc.country}</p>
                      </td>
                      <td className="px-5 py-3.5">
                        <span className="inline-flex px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-700">{r.item.category}</span>
                      </td>
                      <td className="px-5 py-3.5 text-right font-semibold text-gray-900">{r.quantity}</td>
                      <td className="px-5 py-3.5 text-right text-gray-700">{formatCurrency(r.avg_cost_INR)}</td>
                      <td className="px-5 py-3.5 text-right font-bold text-gray-900">{formatCurrency(r.item.retail_price || 0)}</td>
                      <td className="px-5 py-3.5">
                        <div className="flex justify-end gap-2">
                          <button title="Edit Item & Costs" onClick={() => { setEditingItemId(r.item_id); setItemForm({ id: r.item_id, brand_id: r.item.brand_id, name: r.item.name, category: r.item.category, sku: r.item.sku, min_stock_limit: r.item.min_stock_limit, avg_cost_INR: r.avg_cost_INR, retail_price: r.item.retail_price || 0 }); setItemModal(true); }} className="text-gray-400 hover:text-primary transition-colors p-1.5 rounded-lg bg-gray-50 hover:bg-primary/10"><Search className="w-4 h-4" /></button>
                          <button title="Transfer Stock" onClick={() => { setTransferForm({ from_location: r.location_id, to_location: '', item_id: r.item_id, quantity: 1 }); setTransferModal(true); }} className="text-gray-400 hover:text-orange-500 transition-colors p-1.5 rounded-lg bg-gray-50 hover:bg-orange-50"><Truck className="w-4 h-4" /></button>
                          <button title="Delete" onClick={() => { if(confirm(`Delete "${r.item.name}" from this location?`)) deleteItem(r.item_id); }} className="text-gray-400 hover:text-red-500 transition-colors p-1.5 rounded-lg bg-gray-50 hover:bg-red-50"><Trash2 className="w-4 h-4" /></button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile & Tablet Card View */}
            <div className="lg:hidden p-4 sm:p-5">
              {inventoryRows.length === 0 ? (
                <div className="text-center text-gray-400 text-sm py-12">
                  {inventory.length === 0 ? 'No inventory yet. Start by onboarding a new container.' : 'No results match your filters.'}
                </div>
              ) : (
                <div className="space-y-4">
                  {inventoryRows.map(r => (
                    <div key={r.id} className={`bg-white rounded-xl border border-gray-200 p-4 shadow-sm hover:shadow-md transition-all ${r.isLow ? 'border-red-200 bg-red-50/30' : ''}`}>
                      {/* Header with item name and actions */}
                      <div className="flex justify-between items-start mb-3 gap-2">
                        <div className="flex-1 min-w-0">
                          <h3 className="font-bold text-gray-900 text-sm truncate">{r.item.name}</h3>
                          <p className="text-xs text-gray-500 mt-0.5">SKU: {r.item.sku}</p>
                          {r.brand && <p className="text-xs text-gray-500">{r.brand.name}</p>}
                        </div>
                        <div className="flex gap-1.5 flex-shrink-0">
                          <button title="Edit Item & Costs" onClick={() => { setEditingItemId(r.item_id); setItemForm({ id: r.item_id, brand_id: r.item.brand_id, name: r.item.name, category: r.item.category, sku: r.item.sku, min_stock_limit: r.item.min_stock_limit, avg_cost_INR: r.avg_cost_INR, retail_price: r.item.retail_price || 0 }); setItemModal(true); }} className="text-gray-400 hover:text-primary transition-colors p-2 rounded-lg bg-gray-50 hover:bg-primary/10"><Search className="w-4 h-4" /></button>
                          <button title="Transfer Stock" onClick={() => { setTransferForm({ from_location: r.location_id, to_location: '', item_id: r.item_id, quantity: 1 }); setTransferModal(true); }} className="text-gray-400 hover:text-orange-500 transition-colors p-2 rounded-lg bg-gray-50 hover:bg-orange-50"><Truck className="w-4 h-4" /></button>
                          <button title="Delete" onClick={() => { if(confirm(`Delete "${r.item.name}" from this location?`)) deleteItem(r.item_id); }} className="text-gray-400 hover:text-red-500 transition-colors p-2 rounded-lg bg-gray-50 hover:bg-red-50"><Trash2 className="w-4 h-4" /></button>
                        </div>
                      </div>

                      {/* Category badge */}
                      <div className="mb-3">
                        <span className="inline-flex px-2 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-700">{r.item.category}</span>
                      </div>

                      {/* Location info */}
                      <div className="bg-gray-50 rounded-lg p-3 mb-3 border border-gray-100">
                        <p className="text-xs font-semibold text-gray-600 uppercase tracking-wider mb-1">Location</p>
                        <p className="text-sm font-medium text-gray-900">{r.loc.name}</p>
                        <p className="text-xs text-gray-500 capitalize">{r.loc.type} · {r.loc.country}</p>
                      </div>

                      {/* Metrics grid */}
                      <div className="grid grid-cols-3 gap-2 mb-3">
                        <div className="bg-blue-50 rounded-lg p-3 border border-blue-100">
                          <p className="text-[9px] uppercase font-bold text-blue-600 tracking-wider">Qty</p>
                          <p className="text-lg font-extrabold text-blue-900 mt-1">{r.quantity}</p>
                        </div>
                        <div className="bg-emerald-50 rounded-lg p-3 border border-emerald-100">
                          <p className="text-[9px] uppercase font-bold text-emerald-600 tracking-wider">Avg Cost</p>
                          <p className="text-xs font-bold text-emerald-900 mt-1">{formatCurrency(r.avg_cost_INR)}</p>
                        </div>
                        <div className="bg-purple-50 rounded-lg p-3 border border-purple-100">
                          <p className="text-[9px] uppercase font-bold text-purple-600 tracking-wider">Retail</p>
                          <p className="text-xs font-bold text-purple-900 mt-1">{formatCurrency(r.item.retail_price || 0)}</p>
                        </div>
                      </div>

                      {/* Total stock breakdown */}
                      <div className="bg-gray-50 rounded-lg p-3 border border-gray-100">
                        <p className="text-[9px] uppercase font-bold text-gray-600 tracking-wider mb-2">Total Stock: {getTotalStockForItem(r.item_id)} units</p>
                        <div className="flex flex-wrap gap-1.5">
                          {getItemLocations(r.item_id).map((loc, idx) => (
                            <span key={idx} className="text-[10px] font-bold px-2 py-1 rounded-full bg-blue-100 text-blue-700">{loc.location}: {loc.quantity}</span>
                          ))}
                        </div>
                      </div>

                      {/* Low stock warning */}
                      {r.isLow && (
                        <div className="mt-3 bg-red-50 border border-red-200 rounded-lg p-2 flex items-start gap-2">
                          <AlertTriangle className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" />
                          <p className="text-xs text-red-700 font-medium">Low stock - below {r.item.min_stock_limit} minimum</p>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="px-5 py-3 border-t border-gray-50 text-xs text-gray-400">
              Showing {inventoryRows.length} of {inventory.length} inventory entries
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
            <div className="p-4 flex justify-end border-b border-gray-50">
              <button onClick={() => setItemModal(true)} className="btn-primary flex items-center gap-2 text-sm">
                <Plus className="w-4 h-4" /> Add Item
              </button>
            </div>
            
            {/* Desktop Table View */}
            <div className="hidden lg:block overflow-x-auto">
              <table className="w-full text-sm text-left min-w-[600px]">
                <thead className="bg-gray-50 text-xs uppercase text-gray-500">
                  <tr>
                    <th className="px-5 py-3 font-medium">Name</th>
                    <th className="px-5 py-3 font-medium">SKU</th>
                    <th className="px-5 py-3 font-medium">Category</th>
                    <th className="px-5 py-3 font-medium">Brand</th>
                    <th className="px-5 py-3 font-medium text-right">Min Stock</th>
                    <th className="px-5 py-3 font-medium text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50 bg-white">
                  {items.length === 0 ? (
                    <tr><td colSpan={6} className="px-5 py-12 text-center text-gray-400 text-sm">No items defined yet.</td></tr>
                  ) : items.map(item => (
                    <tr key={item.id} className="hover:bg-gray-50/50 transition-colors">
                      <td className="px-5 py-3.5 font-medium text-gray-900">{item.name}</td>
                      <td className="px-5 py-3.5 text-gray-500 font-mono text-xs">{item.sku}</td>
                      <td className="px-5 py-3.5"><span className="px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-700">{item.category}</span></td>
                      <td className="px-5 py-3.5 text-gray-500">{brands.find(b => b.id === item.brand_id)?.name ?? '—'}</td>
                      <td className="px-5 py-3.5 text-right text-gray-700">{item.min_stock_limit}</td>
                      <td className="px-5 py-3.5 text-right">
                        <button title="Delete Item" onClick={() => deleteItem(item.id)} className="text-gray-400 hover:text-red-500 transition-colors p-1 rounded"><Trash2 className="w-4 h-4" /></button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile & Tablet Card View */}
            <div className="lg:hidden p-4 sm:p-5">
              {items.length === 0 ? (
                <div className="text-center text-gray-400 text-sm py-12">
                  No items defined yet.
                </div>
              ) : (
                <div className="space-y-3">
                  {items.map(item => (
                    <div key={item.id} className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm hover:shadow-md transition-all">
                      <div className="flex justify-between items-start gap-2 mb-3">
                        <div className="flex-1 min-w-0">
                          <h3 className="font-bold text-gray-900 text-sm">{item.name}</h3>
                          <p className="text-xs text-gray-500 mt-1 font-mono">{item.sku}</p>
                        </div>
                        <button title="Delete Item" onClick={() => deleteItem(item.id)} className="text-gray-400 hover:text-red-500 transition-colors p-2 rounded-lg bg-gray-50 hover:bg-red-50 flex-shrink-0"><Trash2 className="w-4 h-4" /></button>
                      </div>
                      
                      <div className="grid grid-cols-2 gap-2 mb-3">
                        <div className="bg-gray-50 rounded-lg p-3 border border-gray-100">
                          <p className="text-[9px] uppercase font-bold text-gray-600 tracking-wider">Category</p>
                          <p className="text-xs font-bold text-gray-900 mt-1">{item.category}</p>
                        </div>
                        <div className="bg-gray-50 rounded-lg p-3 border border-gray-100">
                          <p className="text-[9px] uppercase font-bold text-gray-600 tracking-wider">Min Stock</p>
                          <p className="text-xs font-bold text-gray-900 mt-1">{item.min_stock_limit}</p>
                        </div>
                      </div>

                      {brands.find(b => b.id === item.brand_id) && (
                        <div className="bg-blue-50 rounded-lg p-3 border border-blue-100">
                          <p className="text-[9px] uppercase font-bold text-blue-600 tracking-wider">Brand</p>
                          <p className="text-xs font-bold text-blue-900 mt-1">{brands.find(b => b.id === item.brand_id)?.name}</p>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── Brands Tab ── */}
        {activeTab === 'brands' && (
          <div>
            <div className="p-4 flex justify-end border-b border-gray-50">
              <button onClick={() => setBrandModal(true)} className="btn-primary flex items-center gap-2 text-sm"><Plus className="w-4 h-4" /> Add Brand</button>
            </div>
            
            {/* Desktop Table View */}
            <div className="hidden lg:block overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead className="bg-gray-50 text-xs uppercase text-gray-500">
                  <tr>
                    <th className="px-5 py-3 font-medium">Brand Name</th>
                    <th className="px-5 py-3 font-medium">Origin Country</th>
                    <th className="px-5 py-3 font-medium text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50 bg-white">
                  {brands.length === 0 ? (
                    <tr><td colSpan={3} className="px-5 py-12 text-center text-gray-400 text-sm">No brands yet.</td></tr>
                  ) : brands.map(b => (
                    <tr key={b.id} className="hover:bg-gray-50/50 transition-colors">
                      <td className="px-5 py-3.5 font-medium text-gray-900">{b.name}</td>
                      <td className="px-5 py-3.5 text-gray-500">{b.origin_country}</td>
                      <td className="px-5 py-3.5 text-right">
                        <button title="Delete Brand" onClick={() => deleteBrand(b.id)} className="text-gray-400 hover:text-red-500 transition-colors p-1 rounded"><Trash2 className="w-4 h-4" /></button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile & Tablet Card View */}
            <div className="lg:hidden p-4 sm:p-5">
              {brands.length === 0 ? (
                <div className="text-center text-gray-400 text-sm py-12">
                  No brands yet.
                </div>
              ) : (
                <div className="space-y-3">
                  {brands.map(b => (
                    <div key={b.id} className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm hover:shadow-md transition-all">
                      <div className="flex justify-between items-start gap-2">
                        <div>
                          <h3 className="font-bold text-gray-900 text-sm">{b.name}</h3>
                          <p className="text-xs text-gray-500 mt-1">Origin: {b.origin_country}</p>
                        </div>
                        <button title="Delete Brand" onClick={() => deleteBrand(b.id)} className="text-gray-400 hover:text-red-500 transition-colors p-2 rounded-lg bg-gray-50 hover:bg-red-50 flex-shrink-0"><Trash2 className="w-4 h-4" /></button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── Locations Tab ── */}
        {activeTab === 'locations' && (
          <div>
            <div className="p-4 flex justify-end border-b border-gray-50">
              <button onClick={() => setLocationModal(true)} className="btn-primary flex items-center gap-2 text-sm"><Plus className="w-4 h-4" /> Add Location</button>
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
                    <th className="px-5 py-3 font-medium text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50 bg-white">
                  {locations.length === 0 ? (
                    <tr><td colSpan={5} className="px-5 py-12 text-center text-gray-400 text-sm">No locations yet.</td></tr>
                  ) : locations.map(l => (
                    <tr key={l.id} className="hover:bg-gray-50/50 transition-colors">
                      <td className="px-5 py-3.5 font-medium text-gray-900">{l.name}</td>
                      <td className="px-5 py-3.5"><span className={`px-2.5 py-0.5 rounded-full text-xs font-medium ${l.type === 'warehouse' ? 'bg-blue-100 text-blue-700' : 'bg-violet-100 text-violet-700'}`}>{l.type}</span></td>
                      <td className="px-5 py-3.5 text-gray-500">{l.country}</td>
                      <td className="px-5 py-3.5 text-gray-500">{l.currency}</td>
                      <td className="px-5 py-3.5 text-right">
                        <button title="Delete Location" onClick={() => deleteLocation(l.id)} className="text-gray-400 hover:text-red-500 transition-colors p-1 rounded"><Trash2 className="w-4 h-4" /></button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile & Tablet Card View */}
            <div className="lg:hidden p-4 sm:p-5">
              {locations.length === 0 ? (
                <div className="text-center text-gray-400 text-sm py-12">
                  No locations yet.
                </div>
              ) : (
                <div className="space-y-3">
                  {locations.map(l => (
                    <div key={l.id} className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm hover:shadow-md transition-all">
                      <div className="flex justify-between items-start gap-2 mb-3">
                        <h3 className="font-bold text-gray-900 text-sm">{l.name}</h3>
                        <button title="Delete Location" onClick={() => deleteLocation(l.id)} className="text-gray-400 hover:text-red-500 transition-colors p-2 rounded-lg bg-gray-50 hover:bg-red-50 flex-shrink-0"><Trash2 className="w-4 h-4" /></button>
                      </div>

                      <div className="grid grid-cols-3 gap-2">
                        <div className="bg-blue-50 rounded-lg p-3 border border-blue-100">
                          <p className="text-[9px] uppercase font-bold text-blue-600 tracking-wider">Type</p>
                          <p className="text-xs font-bold text-blue-900 mt-1 capitalize">{l.type}</p>
                        </div>
                        <div className="bg-emerald-50 rounded-lg p-3 border border-emerald-100">
                          <p className="text-[9px] uppercase font-bold text-emerald-600 tracking-wider">Country</p>
                          <p className="text-xs font-bold text-emerald-900 mt-1">{l.country}</p>
                        </div>
                        <div className="bg-purple-50 rounded-lg p-3 border border-purple-100">
                          <p className="text-[9px] uppercase font-bold text-purple-600 tracking-wider">Currency</p>
                          <p className="text-xs font-bold text-purple-900 mt-1">{l.currency}</p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
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
            <div className="space-y-4">
              <div>
                <label className="label text-gray-900 font-bold flex items-center gap-2">
                  <Store className="w-4 h-4 text-primary" /> Destination Location
                </label>
                <select title="Select Location" required className="input-field bg-white shadow-sm" value={importTargetLocation} onChange={e => setImportTargetLocation(e.target.value)}>
                  <option value="">Select where to unload items…</option>
                  {locations.map(l => <option key={l.id} value={l.id}>{l.name} ({l.type})</option>)}
                </select>
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
                    <thead className="sticky top-0 bg-gray-50 text-gray-500 uppercase font-bold text-[9px]">
                      <tr>
                        <th className="py-2 px-3">Item Name</th>
                        <th className="py-2 px-3 text-right">Qty</th>
                        <th className="py-2 px-3 text-right">Unit Cost</th>
                        <th className="py-2 px-3 text-right">Retail</th>
                        <th className="py-2 px-3 text-center">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {importPreview.map((item, idx) => (
                        <tr key={idx} className="bg-white hover:bg-blue-50/30 transition-colors">
                          <td className="py-2 px-3">
                            <input title="Item Name" placeholder="Item Name" className="bg-transparent border-0 p-0 text-[11px] w-full focus:ring-0 font-medium text-gray-900" 
                              value={item.name} onChange={e => {
                                const newP = [...importPreview]; newP[idx].name = e.target.value; setImportPreview(newP);
                              }} />
                          </td>
                          <td className="py-2 px-3 text-right">
                            <input title="Quantity" placeholder="0" type="number" className="bg-transparent border-0 p-0 text-[11px] w-12 text-right focus:ring-0 font-bold text-primary" 
                              value={item.qty} onChange={e => {
                                const newP = [...importPreview]; newP[idx].qty = Number(e.target.value); setImportPreview(newP);
                              }} />
                          </td>
                          <td className="py-2 px-3 text-right">
                            <input title="Unit Cost" placeholder="0" type="number" className="bg-transparent border-0 p-0 text-[11px] w-16 text-right focus:ring-0 text-gray-600" 
                              value={item.unitCost} onChange={e => {
                                const newP = [...importPreview]; newP[idx].unitCost = Number(e.target.value); setImportPreview(newP);
                              }} />
                          </td>
                          <td className="py-2 px-3 text-right">
                            <input title="Retail Price" placeholder="0" type="number" className="bg-transparent border-0 p-0 text-[11px] w-16 text-right focus:ring-0 text-emerald-600 font-bold" 
                              value={item.retailPrice} onChange={e => {
                                const newP = [...importPreview]; newP[idx].retailPrice = Number(e.target.value); setImportPreview(newP);
                              }} />
                          </td>
                          <td className="py-2 px-3 text-center text-red-400 hover:text-red-600 cursor-pointer" onClick={() => setImportPreview(p => p.filter((_, i) => i !== idx))}>
                            <Trash2 className="w-3 h-3 mx-auto" />
                          </td>
                        </tr>
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

      <Modal isOpen={itemModal} onClose={() => { setItemModal(false); setEditingItemId(null); setItemForm({ id: '', brand_id: '', name: '', category: '', sku: '', min_stock_limit: 10, avg_cost_INR: 0, retail_price: 0 }); }} title={editingItemId ? "Edit Item & Pricing" : "Add Item"} description={editingItemId ? "Update product details and pricing." : "Define a new product/SKU."} size="md">
        <form onSubmit={handleAddItem} className="space-y-4">
          <div>
            <label className="label">Brand</label>
            <select title="Select Brand" required className="input-field bg-white" value={itemForm.brand_id} onChange={e => setItemForm(f => ({ ...f, brand_id: e.target.value }))}>
              <option value="">Select brand…</option>
              {brands.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
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
              <input title="Min Stock Limit" placeholder="0" required type="number" min={1} className="input-field" value={itemForm.min_stock_limit} onChange={e => setItemForm(f => ({ ...f, min_stock_limit: Number(e.target.value) }))} />
            </div>
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
            <button type="button" className="btn-secondary" onClick={() => { setItemModal(false); setEditingItemId(null); setItemForm({ id: '', brand_id: '', name: '', category: '', sku: '', min_stock_limit: 10, avg_cost_INR: 0, retail_price: 0 }); }}>Cancel</button>
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
                  onClick={() => setOnboardForm(f => ({ ...f, rows: [...f.rows, { brand_name: '', item_name: '', sku: '', category: '', quantity: 1, unit_cost: 0, retail_price: 0, matched_item_id: '' }] }))}
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
                          {row.matched_item_id && (
                            <div className="mt-1 flex items-center gap-1 text-[9px] text-emerald-600 font-bold uppercase">
                              <Package className="w-3 h-3" /> Linked to existing record
                            </div>
                          )}
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
                        <div className="col-span-4 md:col-span-2">
                          <label className="text-[10px] font-bold text-gray-400 uppercase mb-1 block">Retail Price (INR)</label>
                          <input title="Retail Price" type="number" step="1" className="input-field text-xs bg-white" value={row.retail_price || ''} onChange={e => {
                            const newRows = [...onboardForm.rows];
                            newRows[idx].retail_price = Number(e.target.value);
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
                            <label className="text-[9px] font-bold text-gray-400 uppercase mb-1 block">Category</label>
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
    </div>
  );
}
