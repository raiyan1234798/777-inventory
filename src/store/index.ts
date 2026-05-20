import { create } from 'zustand';
import { db } from '../lib/firebase';
import {
  collection, doc, setDoc, deleteDoc, updateDoc,
  writeBatch, onSnapshot, query, orderBy
} from 'firebase/firestore';
import { DEFAULT_EXCHANGE_RATES } from '../lib/exchangeRates';
import { transactionLockManager } from '../lib/transactionLocks';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface Location {
  id: string;
  name: string;
  type: 'warehouse' | 'shop';
  country: string;
  currency: string;
  manager?: string;
  contact?: string;
  address?: string;
}

export interface Brand {
  id: string;
  name: string;
  origin_country: string;
}

export interface Item {
  id: string;
  brand_id: string;
  name: string;
  category: string;
  sku: string;
  min_stock_limit: number;
  retail_price?: number; 
  avg_cost_USD?: number; 
}

export interface InventoryEntry {
  id: string; // locationId_itemId composite
  location_id: string;
  item_id: string;
  quantity: number;
  opening_balance: number;
  received_balance: number;
  supplied_balance: number;
  returned_balance: number;
  last_rollover_date?: string; // YYYY-MM-DD
  avg_cost_USD: number;
}

export interface Container {
  id: string;
  container_no: string; // "Number" requested by user
  source_country: string;
  total_cost: number;
  currency: string;
  converted_cost_USD: number;
  date: string;
  notes?: string;
  status?: 'Pending' | 'Received';
}

export type TransactionType = 'stock_entry' | 'transfer' | 'sale' | 'return';

export interface Transaction {
  id: string;
  type: TransactionType;
  from_location: string;
  to_location: string;
  item_id: string;
  item_name: string;
  quantity: number;
  unit_cost: number;
  currency: string;
  converted_value_USD: number;
  performed_by: string;
  timestamp: string;
  container_id?: string;
}

export interface Sale {
  id: string;
  item_id: string;
  item_name: string;
  location_id: string;
  quantity: number;
  selling_price: number;
  currency: string;
  converted_price_USD: number;
  avg_cost_USD: number;
  profit_USD: number;
  sold_by: string;
  timestamp: string;
}

export interface ReturnRecord {
  id: string;
  type: 'sale_return' | 'warehouse_return';
  item_id: string;
  item_name: string;
  location_id: string;
  quantity: number;
  reason: string;
  status: 'Restocked' | 'Disposed';
  timestamp: string;
  ref_transaction_id?: string;
  image_proof?: string;
}

export interface AppNotification {
  id: string;
  type: 'low_stock' | 'transfer' | 'sale' | 'stock_entry' | 'return' | 'onboard';
  item_id?: string;
  location_id: string;            // primary location this notification concerns
  target_location_id?: string;    // secondary location (e.g. destination of a transfer)
  target_roles: ('super_admin' | 'admin' | 'warehouse_staff' | 'shop_staff')[]; // who sees this
  message: string;
  status: 'unread' | 'read';
  timestamp: string;
}

export interface ShopExpense {
  id: string;
  location_id: string;
  location_type: 'warehouse' | 'shop'; // FIX: Track whether expense is for warehouse or shop
  amount: number;
  currency: string;
  converted_amount_USD: number;
  category: string;
  date: string;
  notes?: string;
}

export interface ShopTarget {
  id: string;
  location_id: string;
  target_amount_USD: number;
  month: string; // YYYY-MM
}

export interface ImportSessionItem {
  item_id: string;
  item_name: string;
  sku: string;
  brand: string;
  invoiceQty: number;   // what was in the Excel/invoice
  receivedQty: number;  // what was actually committed to inventory
  unitCost: number;
  retailPrice: number;
}

export interface ImportSession {
  id: string;
  date: string;            // ISO timestamp
  fileName: string;        // original file name
  location_id: string;     // target warehouse
  currency: string;
  itemCount: number;
  totalItems: number;      // total qty
  items: ImportSessionItem[];
  status: 'confirmed';     // only confirmed imports are stored
  container_id?: string;
}


export interface User {
  id: string;
  name: string;
  email: string;
  role: 'super_admin' | 'admin' | 'warehouse_staff' | 'shop_staff';
  location_id: string;
  status: 'Active' | 'Inactive';
}

// ─── Exchange Rates (Dynamic, loaded from Firebase) ────────────────────────
export const EXCHANGE_RATES: Record<string, number> = { ...DEFAULT_EXCHANGE_RATES };

export const CURRENCIES = [
  'USD',
  'ZMW',
  ...Object.keys(EXCHANGE_RATES).filter(c => c !== 'USD' && c !== 'ZMW').sort()
];

/**
 * Recursively remove all `undefined` values from an object before writing to Firestore.
 * Firestore rejects any field set to `undefined` — this prevents those errors globally.
 */
export function sanitizeForFirestore<T extends Record<string, any>>(obj: T): T {
  const result: any = {};
  for (const key of Object.keys(obj)) {
    const val = obj[key];
    if (val === undefined) continue; // drop undefined fields
    if (val !== null && typeof val === 'object' && !Array.isArray(val) && !(val instanceof Date)) {
      result[key] = sanitizeForFirestore(val);
    } else {
      result[key] = val;
    }
  }
  return result as T;
}

export const COUNTRIES = [
  { name: 'India', currency: 'USD' },
  { name: 'Zambia', currency: 'ZMW' },
  { name: 'China', currency: 'CNY' },
  { name: 'Pakistan', currency: 'PKR' },
  { name: 'Saudi Arabia', currency: 'SAR' },
  { name: 'UAE', currency: 'AED' },
  { name: 'United Kingdom', currency: 'GBP' },
  { name: 'Europe', currency: 'EUR' },
  { name: 'USA', currency: 'USD' },
  { name: 'Kuwait', currency: 'KWD' },
  { name: 'Qatar', currency: 'QAR' },
];

export function toUSD(amount: number, currency: string): number {
  return amount * (EXCHANGE_RATES[currency] ?? 1);
}

export function formatCurrency(amount: number | null | undefined, currency: string = 'USD'): string {
  if (amount === null || amount === undefined) return '—';
  const symbols: Record<string, string> = {
    INR: '$', USD: '$', EUR: '€', GBP: '£', PKR: '₨', CNY: '¥',
    SAR: '﷼', AED: 'د.إ', JPY: '¥', CAD: 'C$', AUD: 'A$', SGD: 'S$',
    KWD: 'د.ك', OMR: 'ر.ع.', BHD: '.د.ب', QAR: 'ر.ق', MYR: 'RM', THB: '฿',
    ZMW: 'K',
  };
  return `${symbols[currency] ?? currency + ' '}${amount.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
}

/**
 * Returns a string like "SAR 100 ($2,220)"
 */
export function formatDualCurrency(amount: number, currency: string): string {
  if (currency === 'USD') return formatCurrency(amount, 'USD');
  const inrValue = toUSD(amount, currency);
  return `${formatCurrency(amount, currency)} (${formatCurrency(inrValue, 'USD')})`;
}

// ─── Notification Helper Functions ───────────────────────────────────────────

/**
 * Get all staff members (users) assigned to a specific location
 */
export function getStaffByLocation(users: User[], locationId: string): User[] {
  return users.filter(u => u.location_id === locationId && u.status === 'Active');
}

/**
 * Determine target roles for notifications based on location type
 * For Warehouse: warehouse_staff + admin + super_admin
 * For Shop: shop_staff + admin + super_admin
 * Always includes super_admin
 */
export function getTargetRolesForLocationStockEntry(
  locationType: 'warehouse' | 'shop'
): ('super_admin' | 'admin' | 'warehouse_staff' | 'shop_staff')[] {
  if (locationType === 'warehouse') {
    return ['super_admin', 'admin', 'warehouse_staff'];
  } else {
    return ['super_admin', 'admin', 'shop_staff'];
  }
}

// ─── Store ───────────────────────────────────────────────────────────────────

interface AppState {
  locations: Location[];
  brands: Brand[];
  items: Item[];
  inventory: InventoryEntry[];
  containers: Container[];
  transactions: Transaction[];
  sales: Sale[];
  returns: ReturnRecord[];
  notifications: AppNotification[];
  users: User[];
  expenses: ShopExpense[];
  targets: ShopTarget[];
  importSessions: ImportSession[];
  isSyncing: boolean;
  exchangeRates: Record<string, number>;

  setImportSessions: (d: ImportSession[]) => void;
  saveImportSession: (session: Omit<ImportSession, 'id'>) => Promise<string>;
  deleteImportSession: (id: string) => Promise<void>;
  fixImportStock: (sessionId: string, fixes: { item_id: string; newQty: number; location_id: string }[]) => Promise<void>;


  // Global Modals State
  isTransferModalOpen: boolean;
  isTransferModalMinimized: boolean;
  transferForm: { from_location: string; to_location: string };
  transferItems: { brand_id: string; item_id: string; quantity: number; _id: number }[];
  
  isRecordSaleModalOpen: boolean;
  isRecordSaleModalMinimized: boolean;
  recordSaleLocation: string;
  recordSaleItems: { brand_id: string; item_id: string; quantity: number; selling_price: number; currency: string; _id: number }[];

  // Setters (called by Firestore listeners)
  setLocations: (d: Location[]) => void;
  setBrands: (d: Brand[]) => void;
  setItems: (d: Item[]) => void;
  setInventory: (d: InventoryEntry[]) => void;
  setContainers: (d: Container[]) => void;
  setTransactions: (d: Transaction[]) => void;
  setSales: (d: Sale[]) => void;
  setReturns: (d: ReturnRecord[]) => void;
  setNotifications: (d: AppNotification[]) => void;
  setUsers: (d: User[]) => void;
  setExchangeRates: (d: Record<string, number>) => void;
  setIsSyncing: (v: boolean) => void;

  setTransferModalOpen: (v: boolean) => void;
  setTransferModalMinimized: (v: boolean) => void;
  setTransferForm: (f: { from_location: string; to_location: string }) => void;
  setTransferItems: (items: any[]) => void;

  setRecordSaleModalOpen: (v: boolean) => void;
  setRecordSaleModalMinimized: (v: boolean) => void;
  setRecordSaleLocation: (v: string) => void;
  setRecordSaleItems: (items: any[]) => void;

  isReturnModalOpen: boolean;
  isReturnModalMinimized: boolean;
  returnActionState: string;
  returnTypeState: string;
  returnFormState: {
    location_id: string;
    brand_id: string;
    item_id: string;
    quantity: number;
    notes: string;
    image_proof?: string;
  };
  setReturnModalOpen: (v: boolean) => void;
  setReturnModalMinimized: (v: boolean) => void;
  setReturnActionState: (v: string) => void;
  setReturnTypeState: (v: string) => void;
  setReturnFormState: (f: any) => void;

  isImportModalOpen: boolean;
  isImportModalMinimized: boolean;
  importPreview: any[];
  importTargetLocation: string;
  importCurrency: string;
  importExcelFileName: string | null;
  importProcessingStatus: string;
  importProgress: number;
  importSaving: boolean;

  setImportModalOpen: (v: boolean) => void;
  setImportModalMinimized: (v: boolean) => void;
  setImportPreview: (v: any[] | ((prev: any[]) => any[])) => void;
  setImportTargetLocation: (v: string) => void;
  setImportCurrency: (v: string) => void;
  setImportExcelFileName: (v: string | null) => void;
  setImportProcessingStatus: (v: string) => void;
  setImportProgress: (v: number) => void;
  setImportSaving: (v: boolean) => void;

  // Actions
  deleteStockEntry: (id: string) => Promise<void>;
  deleteStockEntries: (ids: string[]) => Promise<void>;
  addLocation: (loc: Omit<Location, 'id'>) => Promise<void>;
  updateLocation: (id: string, loc: Partial<Location>) => Promise<void>;
  deleteLocation: (id: string) => Promise<void>;
  addBrand: (brand: Omit<Brand, 'id'>) => Promise<string>;
  deleteBrand: (id: string) => Promise<void>;
  addItem: (item: Omit<Item, 'id'>) => Promise<void>;
  updateItem: (id: string, updates: Partial<Item>) => Promise<void>;
  deleteItem: (id: string) => Promise<void>;

  addContainer: (container: Omit<Container, 'id'>) => Promise<string>;
  adjustInvoiceStock: (container_id: string, updates: { transaction_id: string; new_quantity: number }[]) => Promise<void>;

  // Stock entry: add items from a container into a warehouse
  stockEntry: (params: {
    container_id: string;
    location_id: string;
    item_id: string;
    item_name: string;
    quantity: number;
    unit_cost: number;
    currency: string;
    performed_by: string;
  }) => Promise<void>;

  // Batch stock entry for faster processing
  batchStockEntry: (items: {
    container_id?: string;
    location_id: string;
    item_id: string;
    item_name: string;
    quantity: number;
    unit_cost: number;
    currency: string;
    is_absolute_override?: boolean;
  }[], performed_by: string, options?: { skipNotifications?: boolean; isPending?: boolean }) => Promise<void>;

  // Transfer between locations
  transfer: (params: {
    from_location: string;
    to_location: string;
    item_id: string;
    item_name: string;
    quantity: number;
    unit_cost_USD: number;
    performed_by: string;
  }) => Promise<void>;

  // Sale from a shop
  recordSale: (params: {
    item_id: string;
    item_name: string;
    location_id: string;
    quantity: number;
    selling_price: number;
    currency: string;
    sold_by: string;
  }) => Promise<void>;

  // Return
  processReturn: (ret: Omit<ReturnRecord, 'id'>) => Promise<void>;

  // Users
  addUser: (user: Omit<User, 'id'>) => Promise<void>;
  updateUser: (id: string, data: Partial<User>) => Promise<void>;
  deleteUser: (id: string) => Promise<void>;

  // Shop & Warehouse Management
  addExpense: (expense: Omit<ShopExpense, 'id'>) => Promise<void>;
  deleteExpense: (id: string) => Promise<void>;
  setTarget: (target: Omit<ShopTarget, 'id'>) => Promise<void>;

  // Setters
  setExpenses: (d: ShopExpense[]) => void;
  setTargets: (d: ShopTarget[]) => void;

  // Rollover management
  performRolloverIfNecessary: () => Promise<void>;

  // Helpers
  getInventoryAt: (location_id: string, item_id: string) => InventoryEntry | undefined;
  markNotificationRead: (id: string) => Promise<void>;
  deleteNotification: (id: string) => Promise<void>;
  deleteNotifications: (ids: string[]) => Promise<void>;
  initFirestoreSync: () => void;

  // Maintenance
  clearMasterData: () => Promise<void>;
  clearHistory: () => Promise<void>;
  clearLocationStock: (locationId: string) => Promise<void>;

  // Bulk Deletion
  deleteLocations: (ids: string[]) => Promise<void>;
  deleteBrands: (ids: string[]) => Promise<void>;
  deleteItems: (ids: string[]) => Promise<void>;
  deleteContainers: (ids: string[]) => Promise<void>;
}

export const useStore = create<AppState>((set, get) => ({
  locations: [],
  brands: [],
  items: [],
  inventory: [],
  containers: [],
  transactions: [],
  sales: [],
  returns: [],
  notifications: [],
  users: [],
  expenses: [],
  targets: [],
  importSessions: [],
  isSyncing: false,
  exchangeRates: { ...DEFAULT_EXCHANGE_RATES },

  setImportSessions: (d) => set({ importSessions: d }),

  saveImportSession: async (session) => {
    const id = `imp-${Date.now()}`;
    const full: ImportSession = { id, ...session };
    await setDoc(doc(db, 'import_sessions', id), full);
    return id;
  },

  deleteImportSession: async (id) => {
    await deleteDoc(doc(db, 'import_sessions', id));
  },

  fixImportStock: async (sessionId, fixes) => {
    const batch = writeBatch(db);
    const { inventory, importSessions, transactions } = get();

    const session = importSessions.find(s => s.id === sessionId);
    if (!session) throw new Error('Session not found');

    const updatedSessionItems = [...session.items];

    for (const fix of fixes) {
      const safeLocId = fix.location_id.replace(/\//g, '-');
      const safeItemId = fix.item_id.replace(/\//g, '-');
      const invId = `${safeLocId}_${safeItemId}`;
      const existing = inventory.find(e => e.id === invId);
      const currentQty = existing?.quantity ?? 0;
      const diff = fix.newQty - currentQty;

      batch.set(doc(db, 'inventory', invId), {
        id: invId,
        location_id: fix.location_id,
        item_id: fix.item_id,
        quantity: fix.newQty,
        opening_balance: existing?.opening_balance ?? fix.newQty,
        received_balance: (existing?.received_balance ?? 0) + diff,
        supplied_balance: existing?.supplied_balance ?? 0,
        returned_balance: existing?.returned_balance ?? 0,
        avg_cost_USD: existing?.avg_cost_USD ?? 0,
        last_import_timestamp: new Date().toISOString(),
        last_fix_timestamp: new Date().toISOString(),
        fixed_from_session: sessionId,
      });

      const sItemIdx = updatedSessionItems.findIndex(si => si.item_id === fix.item_id);
      if (sItemIdx !== -1) {
        const sItem = updatedSessionItems[sItemIdx];
        const newReceivedQty = Math.max(0, sItem.receivedQty + diff);
        updatedSessionItems[sItemIdx] = {
          ...sItem,
          receivedQty: newReceivedQty
        };
      }

      if (session.container_id) {
        const tx = transactions.find(t => t.container_id === session.container_id && t.item_id === fix.item_id && t.type === 'stock_entry');
        if (tx) {
          const newTxQty = Math.max(0, tx.quantity + diff);
          const newConvertedValue = newTxQty * tx.unit_cost;
          batch.update(doc(db, 'transactions', tx.id), {
            quantity: newTxQty,
            converted_value_USD: newConvertedValue
          });
        }
      }
    }

    const updatedTotalItems = updatedSessionItems.reduce((sum, item) => sum + item.receivedQty, 0);
    batch.update(doc(db, 'import_sessions', sessionId), {
      items: updatedSessionItems,
      totalItems: updatedTotalItems
    });

    await batch.commit();
  },


  setLocations: (d) => set({ locations: d }),
  setBrands: (d) => set({ brands: d }),
  setItems: (d) => set({ items: d }),
  setInventory: (d) => set({ inventory: d }),
  setContainers: (d) => set({ containers: d }),
  setTransactions: (d) => set({ transactions: d }),
  setSales: (d) => set({ sales: d }),
  setReturns: (d) => set({ returns: d }),
  setNotifications: (d) => set({ notifications: d }),
  setUsers: (d) => set({ users: d }),
  setExpenses: (d) => set({ expenses: d }),
  setTargets: (d) => set({ targets: d }),

  isTransferModalOpen: false,
  isTransferModalMinimized: false,
  transferForm: { from_location: '', to_location: '' },
  transferItems: [{ brand_id: '', item_id: '', quantity: 1, _id: Date.now() }],
  
  isRecordSaleModalOpen: false,
  isRecordSaleModalMinimized: false,
  recordSaleLocation: '',
  recordSaleItems: [{ brand_id: '', item_id: '', quantity: 1, selling_price: 0, currency: 'USD', _id: Date.now() }],

  setTransferModalOpen: (v) => set({ isTransferModalOpen: v }),
  setTransferModalMinimized: (v) => set({ isTransferModalMinimized: v }),
  setTransferForm: (f) => set({ transferForm: f }),
  setTransferItems: (items) => set({ transferItems: items }),

  setRecordSaleModalOpen: (v) => set({ isRecordSaleModalOpen: v }),
  setRecordSaleModalMinimized: (v) => set({ isRecordSaleModalMinimized: v }),
  setRecordSaleLocation: (v) => set({ recordSaleLocation: v }),
  setRecordSaleItems: (items) => set({ recordSaleItems: items }),

  isReturnModalOpen: false,
  isReturnModalMinimized: false,
  returnActionState: 'Restocked',
  returnTypeState: 'sale_return',
  returnFormState: {
    location_id: '',
    brand_id: '',
    item_id: '',
    quantity: 1,
    notes: '',
    image_proof: ''
  },
  setReturnModalOpen: (v) => set({ isReturnModalOpen: v }),
  setReturnModalMinimized: (v) => set({ isReturnModalMinimized: v }),
  setReturnActionState: (v) => set({ returnActionState: v }),
  setReturnTypeState: (v) => set({ returnTypeState: v }),
  setReturnFormState: (f) => set({ returnFormState: typeof f === 'function' ? f(get().returnFormState) : f }),

  isImportModalOpen: false,
  isImportModalMinimized: false,
  importPreview: [],
  importTargetLocation: '',
  importCurrency: 'USD',
  importExcelFileName: null,
  importProcessingStatus: '',
  importProgress: 0,
  importSaving: false,

  setImportModalOpen: (v) => set({ isImportModalOpen: v }),
  setImportModalMinimized: (v) => set({ isImportModalMinimized: v }),
  setImportPreview: (v) => set({ importPreview: typeof v === 'function' ? v(get().importPreview) : v }),
  setImportTargetLocation: (v) => set({ importTargetLocation: v }),
  setImportCurrency: (v) => set({ importCurrency: v }),
  setImportExcelFileName: (v) => set({ importExcelFileName: v }),
  setImportProcessingStatus: (v) => set({ importProcessingStatus: v }),
  setImportProgress: (v) => set({ importProgress: v }),
  setImportSaving: (v) => set({ importSaving: v }),

  setExchangeRates: (d) => {
    // Merge remote rates with defaults to ensure keys like 'USD' (1) are always present
    const merged = { ...DEFAULT_EXCHANGE_RATES, ...d };
    set({ exchangeRates: merged });
    
    // Update the exported constant (optional, but good for legacy components)
    Object.assign(EXCHANGE_RATES, merged);
  },
  setIsSyncing: (v) => set({ isSyncing: v }),

  getInventoryAt: (location_id, item_id) => {
    return get().inventory.find(e => e.location_id === location_id && e.item_id === item_id);
  },

  performRolloverIfNecessary: async () => {
    const todayStr = new Date().toISOString().split('T')[0];
    const { inventory } = get();
    const staleItems = inventory.filter(inv => inv.last_rollover_date && inv.last_rollover_date !== todayStr);
    
    if (staleItems.length === 0) return;

    console.log(`[Store] Day changed! Rolling over ${staleItems.length} inventory items to new opening balances...`);
    
    // Process in batches
    for (let i = 0; i < staleItems.length; i += 500) {
      const batch = writeBatch(db);
      const chunk = staleItems.slice(i, i + 500);
      chunk.forEach(inv => {
        batch.update(doc(db, 'inventory', inv.id), {
          opening_balance: inv.quantity, // Closing becomes Opening
          received_balance: 0,
          supplied_balance: 0,
          returned_balance: 0,
          last_rollover_date: todayStr
        });
      });
      await batch.commit();
    }
  },

  deleteStockEntry: async (id: string) => {
    return get().deleteStockEntries([id]);
  },
  deleteStockEntries: async (ids: string[]) => {
    try {
      console.log("[Store] Bulk deleting stock and all associated history for:", ids.length, "items");
      // id format is locationId_itemId. Extract target pairs for matching history:
      const targetMap = new Map<string, Set<string>>(); // itemId -> Set of locationIds
      ids.forEach(id => {
        const [loc, item] = id.split('_');
        if (!targetMap.has(item)) targetMap.set(item, new Set());
        targetMap.get(item)!.add(loc);
      });

      const st = get();
      const txToDelete = st.transactions.filter(tx => 
        targetMap.has(tx.item_id) && (targetMap.get(tx.item_id)!.has(tx.from_location) || targetMap.get(tx.item_id)!.has(tx.to_location))
      ).map(t => doc(db, 'transactions', t.id));

      const salesToDelete = st.sales.filter(s => 
        targetMap.has(s.item_id) && targetMap.get(s.item_id)!.has(s.location_id)
      ).map(s => doc(db, 'sales', s.id));

      const retToDelete = st.returns.filter(r => 
        targetMap.has(r.item_id) && targetMap.get(r.item_id)!.has(r.location_id)
      ).map(r => doc(db, 'returns', r.id));

      const invToDelete = ids.map(id => doc(db, 'inventory', id));

      const allDocs = [...invToDelete, ...txToDelete, ...salesToDelete, ...retToDelete];
      
      // Batch process deletion
      for (let i = 0; i < allDocs.length; i += 500) {
        const batch = writeBatch(db);
        allDocs.slice(i, i + 500).forEach(dRef => batch.delete(dRef));
        await batch.commit();
      }
    } catch (err: any) {
      console.error("[Store] Deletion Error:", err);
      throw err;
    }
  },

  clearMasterData: async () => {
    try {
      const st = get();
      const allInventory = st.inventory.map(i => doc(db, 'inventory', i.id));
      const allBrands = st.brands.map(b => doc(db, 'brands', b.id));
      const allItems = st.items.map(i => doc(db, 'items', i.id));
      const allContainers = st.containers.map(c => doc(db, 'containers', c.id));

      const allDocs = [...allInventory, ...allBrands, ...allItems, ...allContainers];
      
      for (let i = 0; i < allDocs.length; i += 500) {
        const batch = writeBatch(db);
        allDocs.slice(i, i + 500).forEach(dRef => batch.delete(dRef));
        await batch.commit();
      }
    } catch (err: any) {
      console.error("[Store] Clear Master Data Error:", err);
      throw err;
    }
  },

  clearHistory: async () => {
    try {
      const st = get();
      const allTransactions = st.transactions.map(t => doc(db, 'transactions', t.id));
      const allSales = st.sales.map(s => doc(db, 'sales', s.id));
      const allReturns = st.returns.map(r => doc(db, 'returns', r.id));
      const allNotifications = st.notifications.map(n => doc(db, 'notifications', n.id));
      const allExpenses = st.expenses.map(e => doc(db, 'expenses', e.id));
      const allTargets = st.targets.map(t => doc(db, 'targets', t.id));

      const allDocs = [...allTransactions, ...allSales, ...allReturns, ...allNotifications, ...allExpenses, ...allTargets];
      
      for (let i = 0; i < allDocs.length; i += 500) {
        const batch = writeBatch(db);
        allDocs.slice(i, i + 500).forEach(dRef => batch.delete(dRef));
        await batch.commit();
      }
    } catch (err: any) {
      console.error("[Store] Clear History Error:", err);
      throw err;
    }
  },

  clearLocationStock: async (locationId: string) => {
    try {
      const allInventory = get().inventory
        .filter(i => i.location_id === locationId)
        .map(i => doc(db, 'inventory', i.id));

      for (let i = 0; i < allInventory.length; i += 500) {
        const batch = writeBatch(db);
        allInventory.slice(i, i + 500).forEach(dRef => batch.delete(dRef));
        await batch.commit();
      }
    } catch (err: any) {
      console.error("[Store] Clear Location Stock Error:", err);
      throw err;
    }
  },

  addLocation: async (loc: Omit<Location, 'id'>) => {
    if (!loc.name?.trim()) throw new Error('Location name is required.');
    if (!['warehouse', 'shop'].includes(loc.type)) throw new Error('Invalid location type.');
    
    // Check for duplicate names
    const exists = get().locations.some(l => l.name.toLowerCase() === loc.name.toLowerCase());
    if (exists) throw new Error(`A location named "${loc.name}" already exists.`);

    const ref = doc(collection(db, 'locations'));
    await setDoc(ref, sanitizeForFirestore({ id: ref.id, ...loc }));
  },
  updateLocation: async (id: string, loc: Partial<Location>) => {
    if (loc.name && !loc.name.trim()) throw new Error('Location name cannot be empty.');
    if (loc.type && !['warehouse', 'shop'].includes(loc.type)) throw new Error('Invalid location type.');

    await updateDoc(doc(db, 'locations', id), sanitizeForFirestore(loc as Record<string, any>));
  },
  deleteLocation: async (id: string) => {
    // We only block if there is POSITIVE quantity. 
    // Records with 0 quantity (ghost records) should not block deletion.
    const hasActiveStock = get().inventory.some(e => e.location_id === id && e.quantity > 0);
    if (hasActiveStock) {
      throw new Error('Cannot delete: This location still has items in stock. Please clear stock first.');
    }
    await deleteDoc(doc(db, 'locations', id));
  },
  deleteLocations: async (ids: string[]) => {
    const hasActiveStock = get().inventory.some(e => ids.includes(e.location_id) && e.quantity > 0);
    if (hasActiveStock) {
      throw new Error('Cannot delete: Some selected locations still have items in stock.');
    }
    const batch = writeBatch(db);
    ids.forEach(id => batch.delete(doc(db, 'locations', id)));
    await batch.commit();
  },

  // ── Brands ─────────────────────────────────────────────────────────────────
  addBrand: async (brand: Omit<Brand, 'id'>) => {
    if (!brand.name?.trim()) throw new Error('Brand name is required.');
    
    const exists = get().brands.some(b => b.name.toLowerCase() === brand.name.toLowerCase());
    if (exists) throw new Error(`Brand "${brand.name}" already exists.`);

    const ref = doc(collection(db, 'brands'));
    await setDoc(ref, sanitizeForFirestore({ id: ref.id, ...brand }));
    return ref.id;
  },
  deleteBrand: async (id: string) => {
    // Check if items use this brand
    const hasItems = get().items.some(i => i.brand_id === id);
    if (hasItems) throw new Error('Cannot delete brand: items are still assigned to it.');
    await deleteDoc(doc(db, 'brands', id));
  },
  deleteBrands: async (ids: string[]) => {
    const hasItems = get().items.some(i => ids.includes(i.brand_id));
    if (hasItems) throw new Error('Cannot delete brands: some have items assigned to them.');
    const batch = writeBatch(db);
    ids.forEach(id => batch.delete(doc(db, 'brands', id)));
    await batch.commit();
  },

  // ── Items ──────────────────────────────────────────────────────────────────
  addItem: async (item: Omit<Item, 'id'>) => {
    if (!item.name?.trim()) throw new Error('Item name is required.');
    if (!item.sku?.trim()) throw new Error('SKU is required.');
    
    const exists = get().items.some(i => i.sku.toLowerCase() === item.sku.toLowerCase());
    if (exists) throw new Error(`An item with SKU "${item.sku}" already exists.`);

    const ref = doc(collection(db, 'items'));
    await setDoc(ref, sanitizeForFirestore({ id: ref.id, ...item }));
  },
  updateItem: async (id: string, updates: Partial<Item>) => {
    if (updates.sku) {
      const exists = get().items.some(i => i.id !== id && i.sku.toLowerCase() === updates.sku!.toLowerCase());
      if (exists) throw new Error(`An item with SKU "${updates.sku}" already exists.`);
    }
    await updateDoc(doc(db, 'items', id), sanitizeForFirestore(updates as Record<string, any>));
  },
  deleteItem: async (id: string) => {
    // Check for inventory
    const hasInv = get().inventory.some(e => e.item_id === id && e.quantity > 0);
    if (hasInv) throw new Error('Cannot delete item: active inventory exists.');
    await deleteDoc(doc(db, 'items', id));
  },
  deleteItems: async (ids: string[]) => {
    const hasInv = get().inventory.some(e => ids.includes(e.item_id) && e.quantity > 0);
    if (hasInv) throw new Error('Cannot delete items: active inventory exists for some selection.');
    const batch = writeBatch(db);
    ids.forEach(id => batch.delete(doc(db, 'items', id)));
    await batch.commit();
  },

  // ── Container ──────────────────────────────────────────────────────────────
  addContainer: async (container: Omit<Container, 'id'>) => {
    const ref = doc(collection(db, 'containers'));
    await setDoc(ref, sanitizeForFirestore({ id: ref.id, ...container }));
    return ref.id; // Return ID for chaining
  },
  adjustInvoiceStock: async (container_id: string, updates: { transaction_id: string; new_quantity: number }[]) => {
    const st = get();
    const batch = writeBatch(db);
    
    const container = st.containers.find(c => c.id === container_id);
    const isPending = container?.status === 'Pending';

    if (isPending) {
      batch.update(doc(db, 'containers', container_id), { status: 'Received' });
    }

    for (const update of updates) {
      const tx = st.transactions.find(t => t.id === update.transaction_id);
      if (!tx || tx.type !== 'stock_entry') continue;
      
      const discrepancy = update.new_quantity - tx.quantity;
      if (discrepancy === 0 && !isPending) continue;
      
      // Update transaction
      const newConvertedValue = update.new_quantity * tx.unit_cost;
      batch.update(doc(db, 'transactions', tx.id), {
        quantity: update.new_quantity,
        converted_value_USD: newConvertedValue
      });
      
      // Update inventory
      const invId = `${tx.to_location}_${tx.item_id}`;
      const inv = st.inventory.find(i => i.id === invId);
      
      const qtyToAdd = isPending ? update.new_quantity : discrepancy;

      if (inv) {
        batch.update(doc(db, 'inventory', invId), {
          quantity: inv.quantity + qtyToAdd,
          received_balance: (inv.received_balance || 0) + qtyToAdd
        });
      }
    }

    // Sync corresponding import session if it exists
    const session = st.importSessions.find(s => s.container_id === container_id);
    if (session) {
      const updatedSessionItems = [...session.items];
      let sessionUpdated = false;
      for (const update of updates) {
        const tx = st.transactions.find(t => t.id === update.transaction_id);
        if (!tx || tx.type !== 'stock_entry') continue;
        const sItemIdx = updatedSessionItems.findIndex(si => si.item_id === tx.item_id);
        if (sItemIdx !== -1) {
          updatedSessionItems[sItemIdx] = {
            ...updatedSessionItems[sItemIdx],
            receivedQty: update.new_quantity
          };
          sessionUpdated = true;
        }
      }
      if (sessionUpdated) {
        const updatedTotalItems = updatedSessionItems.reduce((sum, item) => sum + item.receivedQty, 0);
        batch.update(doc(db, 'import_sessions', session.id), {
          items: updatedSessionItems,
          totalItems: updatedTotalItems
        });
      }
    }
    
    await batch.commit();
  },
  deleteContainers: async (ids: string[]) => {
    const batch = writeBatch(db);
    ids.forEach(id => batch.delete(doc(db, 'containers', id)));
    await batch.commit();
  },

  // ── Stock Entry ────────────────────────────────────────────────────────────
  stockEntry: async (params) => {
    return get().batchStockEntry([params], params.performed_by);
  },
  batchStockEntry: async (items_to_process, performed_by, { skipNotifications = false, isPending = false } = {}) => {
    // Prebuild global inventory map for O(1) lookups
    const inventorySnapshot = new Map(get().inventory.map(e => [`${e.location_id.replace(/\//g, '-')}_${e.item_id.replace(/\//g, '-')}`, e]));
    const locationsMap = new Map(get().locations.map(l => [l.id, l]));
    const itemsMap = new Map(get().items.map(i => [i.id, i]));

    // Estimate ops per item: 1 inventory + 1 tx + (0 or 1 notif) = 2-3
    // Firestore limit = 500 ops per batch; use 150 items/batch for safety with notifications, 240 without
    const CHUNK_SIZE = skipNotifications ? 240 : 150;

    // Build ALL batches first, then commit them in parallel groups of 3
    const batches: ReturnType<typeof writeBatch>[] = [];
    
    for (let i = 0; i < items_to_process.length; i += CHUNK_SIZE) {
      const chunk = items_to_process.slice(i, i + CHUNK_SIZE);
      const batch = writeBatch(db);
      const pendingInventory = new Map<string, { quantity: number; avg_cost_USD: number }>();

      for (const params of chunk) {
        const { container_id, location_id, item_id, item_name, quantity, unit_cost, currency, is_absolute_override } = params;
        const avgCostINR = toUSD(unit_cost, currency);

        const safeLocId = location_id.replace(/\//g, '-');
        const safeItemId = item_id.replace(/\//g, '-');
        const invId = `${safeLocId}_${safeItemId}`;

        let currentInv = pendingInventory.get(invId);
        if (!currentInv) {
          const existing = inventorySnapshot.get(invId);
          currentInv = existing
            ? { quantity: existing.quantity, avg_cost_USD: existing.avg_cost_USD }
            : { quantity: 0, avg_cost_USD: 0 };
        }

        const deltaQty = is_absolute_override
          ? Math.max(0, quantity - currentInv.quantity)
          : quantity;
        const deltaToApply = isPending ? 0 : deltaQty;
        const newQty = is_absolute_override ? (isPending ? currentInv.quantity : quantity) : currentInv.quantity + deltaToApply;

        let newAvg = currentInv.avg_cost_USD;
        if (!is_absolute_override) {
          newAvg = currentInv.quantity > 0 || deltaToApply > 0
            ? (currentInv.avg_cost_USD * currentInv.quantity + avgCostINR * deltaToApply) / newQty
            : avgCostINR;
        } else if (avgCostINR > 0) {
          newAvg = avgCostINR;
        }

        const safeQty = Math.round(newQty);
        pendingInventory.set(invId, { quantity: safeQty, avg_cost_USD: newAvg });

        const currentDay = new Date().toISOString().split('T')[0];

        batch.set(doc(db, 'inventory', invId), sanitizeForFirestore({
          id: invId, location_id, item_id, quantity: safeQty, avg_cost_USD: newAvg,
          opening_balance: currentInv.quantity, // Closing becomes Opening
          received_balance: deltaToApply,
          supplied_balance: 0,
          returned_balance: 0,
          last_rollover_date: currentDay
        }));

        if (deltaQty !== 0) {
          const txRef = doc(collection(db, 'transactions'));
          batch.set(txRef, sanitizeForFirestore({
            id: txRef.id, type: 'stock_entry',
            from_location: 'supplier', to_location: location_id,
            item_id, item_name, quantity: deltaQty, unit_cost, currency,
            converted_value_USD: toUSD(unit_cost * Math.abs(deltaQty), currency),
            performed_by, container_id: container_id || null,
            notes: is_absolute_override ? 'Stock level override (Import)' : null,
            timestamp: new Date().toISOString(),
          }));
        }

        // Skip individual notifications during bulk imports — dramatically reduces batch count
        if (!skipNotifications) {
          const location = locationsMap.get(location_id);
          const locationType = location?.type ?? 'warehouse';
          const targetRoles = getTargetRolesForLocationStockEntry(locationType);

          const notifRef = doc(collection(db, 'notifications'));
          batch.set(notifRef, sanitizeForFirestore({
            id: notifRef.id, type: 'stock_entry', location_id,
            message: locationType === 'warehouse'
              ? `📦 Stock Received: ${item_name} — ${deltaQty} units added to ${location?.name ?? 'warehouse'}.`
              : `📦 Stock Transfer: ${item_name} — ${deltaQty} units added to ${location?.name ?? 'shop'}.`,
            target_roles: targetRoles, status: 'unread',
            timestamp: new Date().toISOString(), item_id
          }));

          const item = itemsMap.get(item_id);
          if (item && newQty < item.min_stock_limit) {
            const lowNotifRef = doc(collection(db, 'notifications'));
            batch.set(lowNotifRef, {
              id: lowNotifRef.id, type: 'low_stock', location_id,
              message: `⚠️ Low Stock Alert: ${item_name} is below minimum (${newQty}/${item.min_stock_limit} units).`,
              target_roles: targetRoles, status: 'unread',
              timestamp: new Date().toISOString(), item_id
            });
          }
        }
      }

      batches.push(batch);
    }

    // Commit in parallel groups of 4 for maximum throughput
    const PARALLEL = 4;
    for (let i = 0; i < batches.length; i += PARALLEL) {
      await Promise.all(batches.slice(i, i + PARALLEL).map(b => b.commit()));
    }
  },


  // ── Transfer ───────────────────────────────────────────────────────────────
  transfer: async ({ from_location, to_location, item_id, item_name, quantity, unit_cost_USD, performed_by }) => {
    // FIX: Use transaction locks on both source and destination to prevent race conditions
    const fromLock = `inventory_${from_location}_${item_id}`;
    const toLock = `inventory_${to_location}_${item_id}`;

    return transactionLockManager.executeWithLock(fromLock, async () => {
      return transactionLockManager.executeWithLock(toLock, async () => {
        const batch = writeBatch(db);

        const fromEntry = get().getInventoryAt(from_location, item_id);
        if (!fromEntry || fromEntry.quantity < quantity) throw new Error('Insufficient stock at source.');

        const fromId = `${from_location}_${item_id}`;
        const toId = `${to_location}_${item_id}`;
        const toEntry = get().getInventoryAt(to_location, item_id);

        const newFromQty = Math.round(fromEntry.quantity - quantity);
        const toQty = Math.round((toEntry?.quantity ?? 0) + quantity);
        const toAvg = toEntry
          ? (toEntry.avg_cost_USD * toEntry.quantity + unit_cost_USD * quantity) / toQty
          : unit_cost_USD;

        const currentDay = new Date().toISOString().split('T')[0];

        // Update Source
        const updatedFrom = {
          ...fromEntry,
          quantity: newFromQty,
          supplied_balance: (fromEntry.supplied_balance || 0) + quantity,
          last_rollover_date: fromEntry.last_rollover_date || currentDay
        };
        batch.set(doc(db, 'inventory', fromId), sanitizeForFirestore(updatedFrom));

        // Update Destination
        const updatedTo = toEntry 
          ? {
              ...toEntry,
              quantity: toQty,
              received_balance: (toEntry.received_balance || 0) + quantity,
              avg_cost_USD: toAvg
            }
          : {
              id: toId, location_id: to_location, item_id,
              quantity: toQty, avg_cost_USD: toAvg,
              opening_balance: 0, received_balance: quantity,
              supplied_balance: 0, returned_balance: 0,
              last_rollover_date: currentDay
            };
        batch.set(doc(db, 'inventory', toId), sanitizeForFirestore(updatedTo));

        const txRef = doc(collection(db, 'transactions'));
        batch.set(txRef, {
          id: txRef.id, type: 'transfer',
          from_location, to_location, item_id, item_name, quantity,
          unit_cost: unit_cost_USD, currency: 'USD',
          converted_value_USD: unit_cost_USD * quantity,
          performed_by,
          timestamp: new Date().toISOString(),
        });

        // Low stock check for source after transfer
        const item = get().items.find(i => i.id === item_id);

        // Helper (local)
        const createNotif2 = (
          type: AppNotification['type'],
          location_id: string,
          message: string,
          target_roles: AppNotification['target_roles'],
          extra?: Partial<AppNotification>
        ) => {
          const notifRef = doc(collection(db, 'notifications'));
          batch.set(notifRef, {
            id: notifRef.id, type, location_id, message,
            target_roles, status: 'unread',
            timestamp: new Date().toISOString(),
            ...extra,
          });
        };

        // Transfer notification — notify location-specific staff based on location type
        const fromLoc = get().locations.find(l => l.id === from_location);
        const toLoc = get().locations.find(l => l.id === to_location);
        const fromName = fromLoc?.name ?? from_location;
        const toName = toLoc?.name ?? to_location;

        // Get target roles for source and destination based on their location types
        const fromTargetRoles = getTargetRolesForLocationStockEntry(fromLoc?.type ?? 'warehouse');
        const toTargetRoles = getTargetRolesForLocationStockEntry(toLoc?.type ?? 'warehouse');

        // Notify source location staff
        createNotif2(
          'transfer', from_location,
          `🔄 Transfer Out: ${item_name} — ${quantity} units transferred from ${fromName} → ${toName} by ${performed_by}.`,
          fromTargetRoles,
          { item_id, target_location_id: to_location }
        );
        // Notify destination location staff separately
        createNotif2(
          'transfer', to_location,
          `📥 Transfer In: ${item_name} — ${quantity} units received at ${toName} from ${fromName} by ${performed_by}.`,
          toTargetRoles,
          { item_id, target_location_id: from_location }
        );

        if (item && newFromQty < item.min_stock_limit) {
          createNotif2(
            'low_stock', from_location,
            `⚠️ Low Stock Alert: ${item_name} at ${fromName} is below minimum after transfer (${newFromQty}/${item.min_stock_limit} units). Immediate action required.`,
            fromTargetRoles,
            { item_id }
          );
        }

        await batch.commit();
      }, performed_by);
    }, performed_by);
  },

  // ── Sale ───────────────────────────────────────────────────────────────────
  recordSale: async ({ item_id, item_name, location_id, quantity, selling_price, currency, sold_by }) => {
    // FIX: Use transaction lock to prevent overselling
    const lockResource = `inventory_${location_id}_${item_id}`;
    
    return transactionLockManager.executeWithLock(lockResource, async () => {
      const batch = writeBatch(db);

      const invEntry = get().getInventoryAt(location_id, item_id);
      if (!invEntry || invEntry.quantity < quantity) throw new Error('Insufficient stock for sale.');

      const currentDay = new Date().toISOString().split('T')[0];
      const invId = `${location_id}_${item_id}`;
      const newQty = Math.round(invEntry.quantity - quantity);
      
      batch.set(doc(db, 'inventory', invId), sanitizeForFirestore({ 
        ...invEntry, 
        quantity: newQty,
        supplied_balance: (invEntry.supplied_balance || 0) + quantity,
        last_rollover_date: invEntry.last_rollover_date || currentDay
      }));

      const convertedPriceINR = toUSD(selling_price * quantity, currency);
      const profitINR = convertedPriceINR - invEntry.avg_cost_USD * quantity;

      const saleRef = doc(collection(db, 'sales'));
      batch.set(saleRef, {
        id: saleRef.id, item_id, item_name, location_id, quantity,
        selling_price, currency, converted_price_USD: convertedPriceINR,
        avg_cost_USD: invEntry.avg_cost_USD, profit_USD: profitINR,
        sold_by, timestamp: new Date().toISOString(),
      });

      const txRef = doc(collection(db, 'transactions'));
      batch.set(txRef, {
        id: txRef.id, type: 'sale',
        from_location: location_id, to_location: 'customer',
        item_id, item_name, quantity, unit_cost: selling_price, currency,
        converted_value_USD: convertedPriceINR, performed_by: sold_by,
        timestamp: new Date().toISOString(),
      });

      // Sale notification + low stock check
      const item = get().items.find(i => i.id === item_id);
      const saleLoc = get().locations.find(l => l.id === location_id);
      const saleLocName = saleLoc?.name ?? location_id;
      const saleTargetRoles = getTargetRolesForLocationStockEntry(saleLoc?.type ?? 'shop');

      const createNotif3 = (
        type: AppNotification['type'],
        loc_id: string,
        message: string,
        target_roles: AppNotification['target_roles'],
        extra?: Partial<AppNotification>
      ) => {
        const notifRef = doc(collection(db, 'notifications'));
        batch.set(notifRef, {
          id: notifRef.id, type, location_id: loc_id, message,
          target_roles, status: 'unread',
          timestamp: new Date().toISOString(),
          ...extra,
        });
      };

      // Sale notification — location staff + admin + super_admin
      createNotif3(
        'sale', location_id,
        `🛍️ Sale Recorded: ${quantity}x ${item_name} sold at ${saleLocName} by ${sold_by}.`,
        saleTargetRoles,
        { item_id }
      );

      if (item && newQty < item.min_stock_limit) {
        createNotif3(
          'low_stock', location_id,
          `⚠️ Low Stock Alert: ${item_name} at ${saleLocName} is below minimum after sale (${newQty}/${item.min_stock_limit} units). Immediate restock needed.`,
          saleTargetRoles,
          { item_id }
        );
      }

      await batch.commit();
    }, sold_by);
  },

  processReturn: async (ret) => {
    const lockResource = `inventory_${ret.location_id}_${ret.item_id}`;
    
    return transactionLockManager.executeWithLock(lockResource, async () => {
      const batch = writeBatch(db);
      const retRef = doc(collection(db, 'returns'));
      batch.set(retRef, sanitizeForFirestore({ id: retRef.id, ...ret }));

      if (ret.status === 'Restocked') {
        const currentDay = new Date().toISOString().split('T')[0];
        const invId = `${ret.location_id}_${ret.item_id}`;
        const existing = get().getInventoryAt(ret.location_id, ret.item_id);
        const newQty = Math.round((existing?.quantity ?? 0) + ret.quantity);
        
        if (existing) {
          batch.set(doc(db, 'inventory', invId), sanitizeForFirestore({ 
            ...existing, 
            quantity: newQty,
            returned_balance: (existing.returned_balance || 0) + ret.quantity,
            last_rollover_date: existing.last_rollover_date || currentDay
          }));
        } else {
          batch.set(doc(db, 'inventory', invId), sanitizeForFirestore({ 
            id: invId, location_id: ret.location_id, item_id: ret.item_id, 
            quantity: newQty, avg_cost_USD: 0,
            opening_balance: 0, received_balance: 0, supplied_balance: 0,
            returned_balance: ret.quantity, last_rollover_date: currentDay
          }));
        }
      }

      // FIX: Record the cost impact of the return properly
      const refSale = get().sales.find(s => s.id === ret.ref_transaction_id);
      const returnCostINR = refSale ? refSale.avg_cost_USD * ret.quantity : 0;

      const txRef = doc(collection(db, 'transactions'));
      batch.set(txRef, {
        id: txRef.id, type: 'return',
        from_location: ret.type === 'warehouse_return' ? 'shop' : 'customer',
        to_location: ret.location_id,
        item_id: ret.item_id, item_name: ret.item_name, quantity: ret.quantity,
        unit_cost: returnCostINR, currency: 'USD', converted_value_USD: returnCostINR * ret.quantity,
        performed_by: 'system',
        timestamp: new Date().toISOString(),
      });

      await batch.commit();
    }, 'system');
  },

  // ── Users ──────────────────────────────────────────────────────────────────
  addUser: async (user) => {
    const ref = doc(collection(db, 'users'));
    await setDoc(ref, { id: ref.id, ...user });
  },
  updateUser: async (id, data) => {
    await setDoc(doc(db, 'users', id), data, { merge: true });
  },
  deleteUser: async (id) => {
    await deleteDoc(doc(db, 'users', id));
  },

  // ── Shop Management Implementation ─────────────────────────────────────────
  addExpense: async (expense) => {
    const ref = doc(collection(db, 'expenses'));
    await setDoc(ref, { id: ref.id, ...expense });
  },
  deleteExpense: async (id) => {
    await deleteDoc(doc(db, 'expenses', id));
  },
  setTarget: async (target) => {
    // Unique target per location per month
    const targetId = `${target.location_id}_${target.month}`;
    await setDoc(doc(db, 'targets', targetId), { id: targetId, ...target });
  },

  markNotificationRead: async (id) => {
    await setDoc(doc(db, 'notifications', id), { status: 'read' }, { merge: true });
  },

  deleteNotification: async (id) => {
    await deleteDoc(doc(db, 'notifications', id));
  },

  deleteNotifications: async (ids) => {
    const batch = writeBatch(db);
    ids.forEach(id => batch.delete(doc(db, 'notifications', id)));
    await batch.commit();
  },

  initFirestoreSync: () => {
    set({ isSyncing: true });
    
    let loadedCollections = 0;
    const totalCollections = 14;
    
    const checkSyncComplete = () => {
      loadedCollections++;
      if (loadedCollections === totalCollections) {
        set({ isSyncing: false });
      }
    };

    const logError = (name: string, err: any) => {
      console.error(`[Firestore Sync] Error in ${name} listener:`, err);
      // Even if one fails, we increment to avoid getting stuck in isSyncing=true
      checkSyncComplete();
    };
    
    onSnapshot(collection(db, 'locations'), {
      next: snap => { set({ locations: snap.docs.map(d => ({ id: d.id, ...d.data() } as Location)) }); checkSyncComplete(); },
      error: err => logError('locations', err)
    });
    onSnapshot(collection(db, 'brands'), {
      next: snap => { set({ brands: snap.docs.map(d => ({ id: d.id, ...d.data() } as Brand)) }); checkSyncComplete(); },
      error: err => logError('brands', err)
    });
    onSnapshot(collection(db, 'items'), {
      next: snap => { set({ items: snap.docs.map(d => ({ id: d.id, ...d.data() } as Item)) }); checkSyncComplete(); },
      error: err => logError('items', err)
    });
    onSnapshot(query(collection(db, 'inventory')), {
      next: (snap) => { get().setInventory(snap.docs.map(d => d.data() as InventoryEntry)); get().performRolloverIfNecessary(); checkSyncComplete(); },
      error: err => logError('inventory', err)
    });
    onSnapshot(query(collection(db, 'containers'), orderBy('date', 'desc')), {
      next: snap => { set({ containers: snap.docs.map(d => ({ id: d.id, ...d.data() } as Container)) }); checkSyncComplete(); },
      error: err => logError('containers', err)
    });
    onSnapshot(query(collection(db, 'transactions'), orderBy('timestamp', 'desc')), {
      next: snap => { set({ transactions: snap.docs.map(d => ({ id: d.id, ...d.data() } as Transaction)) }); checkSyncComplete(); },
      error: err => logError('transactions', err)
    });
    onSnapshot(query(collection(db, 'sales'), orderBy('timestamp', 'desc')), {
      next: snap => { set({ sales: snap.docs.map(d => ({ id: d.id, ...d.data() } as Sale)) }); checkSyncComplete(); },
      error: err => logError('sales', err)
    });
    onSnapshot(query(collection(db, 'returns'), orderBy('timestamp', 'desc')), {
      next: snap => { set({ returns: snap.docs.map(d => ({ id: d.id, ...d.data() } as ReturnRecord)) }); checkSyncComplete(); },
      error: err => logError('returns', err)
    });
    onSnapshot(query(collection(db, 'notifications'), orderBy('timestamp', 'desc')), {
      next: snap => { set({ notifications: snap.docs.map(d => ({ id: d.id, ...d.data() } as AppNotification)) }); checkSyncComplete(); },
      error: err => logError('notifications', err)
    });
    onSnapshot(collection(db, 'users'), {
      next: snap => { set({ users: snap.docs.map(d => ({ id: d.id, ...d.data() } as User)) }); checkSyncComplete(); },
      error: err => logError('users', err)
    });
    onSnapshot(collection(db, 'exchange_rates'), {
      next: snap => {
        const rates: Record<string, number> = {};
        snap.forEach(d => {
          const data = d.data();
          if (data.rate) rates[d.id] = data.rate;
        });
        get().setExchangeRates(rates);
        checkSyncComplete();
      },
      error: err => logError('exchange_rates', err)
    });
    onSnapshot(collection(db, 'expenses'), {
      next: snap => { set({ expenses: snap.docs.map(d => ({ id: d.id, ...d.data() } as ShopExpense)) }); checkSyncComplete(); },
      error: err => logError('expenses', err)
    });
    onSnapshot(collection(db, 'targets'), {
      next: snap => { set({ targets: snap.docs.map(d => ({ id: d.id, ...d.data() } as ShopTarget)) }); checkSyncComplete(); },
      error: err => logError('targets', err)
    });
    onSnapshot(query(collection(db, 'import_sessions'), orderBy('date', 'desc')), {
      next: snap => { set({ importSessions: snap.docs.map(d => ({ id: d.id, ...d.data() } as ImportSession)) }); checkSyncComplete(); },
      error: err => logError('import_sessions', err)
    });
  },
}));
