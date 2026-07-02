import { create } from 'zustand';
import { db } from '../lib/firebase';
import {
  collection, doc, setDoc, deleteDoc, updateDoc,
  writeBatch, onSnapshot, query, orderBy, where, addDoc
} from 'firebase/firestore';
import { DEFAULT_EXCHANGE_RATES } from '../lib/exchangeRates';
import { transactionLockManager } from '../lib/transactionLocks';
import { useAuthStore } from './authStore';

// ─── Audit Log Helper ────────────────────────────────────────────────────────
export async function logAction(
  action: 'create' | 'update' | 'delete' | 'clear',
  entityType: 'item' | 'container' | 'brand' | 'location' | 'other',
  entityId: string,
  entityName: string,
  details: string
) {
  try {
    const user = useAuthStore.getState().user;
    if (!user) return; // Silent return if not logged in
    
    await addDoc(collection(db, 'audit_logs'), {
      action,
      entityType,
      entityId,
      entityName,
      details,
      userId: user.uid,
      userEmail: user.email,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Failed to write audit log:', error);
  }
}

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
  retail_price_local?: number;
  avg_cost_USD?: number; 
  avg_cost_local?: number;
  local_currency?: string;
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
  avg_cost_local?: number;
  local_currency?: string;
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
  import_session_id?: string;
  transfer_session_id?: string;
  unit_cost_local?: number;
  local_currency?: string;
  exchange_rates?: Record<string, number>;
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
  avg_cost_local?: number;
  profit_local?: number;
  local_currency?: string;
  sold_by: string;
  timestamp: string;
  exchange_rates?: Record<string, number>;
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
  performed_by?: string;
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
  performed_by?: string;
}

// Snapshot stored when a container is deleted with revertStock=true, for undo within 24hrs
export interface DeletedContainerSnapshot {
  id: string;
  container_no: string;
  deleted_at: string;      // ISO timestamp
  expires_at: string;      // ISO timestamp (deleted_at + 24h)
  location_id: string;
  location_name?: string;
  currency: string;
  items: {
    item_id: string;
    item_name: string;
    sku: string;
    receivedQty: number;
    unitCost: number;
  }[];
  total_items_count: number;
}


export interface TransferSessionItem {
  item_id: string;
  item_name: string;
  sku: string;
  brand: string;
  quantity: number;
}

export interface TransferSession {
  id: string;
  date: string;
  from_location: string;
  to_location: string;
  itemCount: number;
  totalItems: number;
  items: TransferSessionItem[];
  performed_by: string;
  notes?: string;
  status: 'Completed' | 'Reconciled';
}

export type Permission = 
  | 'view_dashboard'
  | 'manage_users'
  | 'manage_warehouses'
  | 'manage_shops'
  | 'view_finance'
  | 'record_sales'
  | 'manage_transfers'
  | 'view_reports';

export interface AuditLog {
  id: string;
  action: 'create' | 'update' | 'delete' | 'clear';
  entityType: 'item' | 'container' | 'brand' | 'location' | 'other';
  entityId: string;
  entityName: string;
  details: string;
  userId: string;
  userEmail: string;
  timestamp: string;
}

export interface User {
  id: string;
  name: string;
  email: string;
  role: 'super_admin' | 'admin' | 'warehouse_staff' | 'shop_staff';
  location_id: string;
  status: 'Active' | 'Inactive' | 'Pending';
  permissions?: Permission[];
}

export const ROLE_DEFAULT_PERMISSIONS: Record<User['role'], Permission[]> = {
  super_admin: ['view_dashboard', 'manage_users', 'manage_warehouses', 'manage_shops', 'view_finance', 'record_sales', 'manage_transfers', 'view_reports'],
  admin: ['view_dashboard', 'manage_users', 'manage_warehouses', 'manage_shops', 'view_finance', 'record_sales', 'manage_transfers', 'view_reports'],
  warehouse_staff: ['view_dashboard', 'manage_warehouses', 'manage_transfers'],
  shop_staff: ['view_dashboard', 'record_sales'],
};

export const hasPermission = (user: User | null, permission: Permission): boolean => {
  if (!user) return false;
  if (user.role === 'super_admin') return true; // Super admin always has all permissions
  if (user.permissions) {
    return user.permissions.includes(permission);
  }
  // Fallback to default role permissions
  return ROLE_DEFAULT_PERMISSIONS[user.role]?.includes(permission) ?? false;
};

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
  { name: 'India', currency: 'INR' },
  { name: 'Zambia', currency: 'ZMW' },
  { name: 'USA', currency: 'USD' }
];

export function toUSD(amount: number, currency: string, customRates?: Record<string, number>): number {
  const state = useStore.getState();
  const rates = customRates || state?.exchangeRates || EXCHANGE_RATES;
  const rate = rates[currency] ?? 1;
  return rate > 0 ? amount / rate : amount;
}

export function fromUSD(amountUSD: number, currency: string, customRates?: Record<string, number>): number {
  const state = useStore.getState();
  const rates = customRates || state?.exchangeRates || EXCHANGE_RATES;
  const rate = rates[currency] ?? 1;
  return amountUSD * rate;
}

export function calculateDynamicProfit(sale: { selling_price: number; quantity: number; avg_cost_USD: number; profit_local?: number; profit_USD?: number; currency: string; exchange_rates?: Record<string, number>; [key: string]: any }, customRates?: Record<string, number>): number {
  const currency = sale.currency || 'USD';
  const qty = sale.quantity || 1;

  // ── PREFERRED: use the profit that was saved at sale time with historical rates ──
  if (sale.profit_local != null && sale.profit_local >= 0) {
    const historicalRates = sale.exchange_rates || customRates;
    return toUSD(sale.profit_local, currency, historicalRates);
  }

  // ── FALLBACK: exact formula ──
  // profit = (retail_price_per_unit - unit_cost_USD × exchange_rate) × qty
  const rates = customRates || sale.exchange_rates;
  const unitCostLocal = fromUSD(sale.avg_cost_USD || 0, currency, rates);
  const profitPerUnit = (sale.selling_price || 0) - unitCostLocal;
  const profitLocal = profitPerUnit < 0 ? 0 : profitPerUnit * qty;
  return toUSD(profitLocal, currency, rates);
}

export function formatCurrency(amount: number | null | undefined, currency: string = 'USD'): string {
  if (amount === null || amount === undefined) return '—';
  
  let activeBase = 'USD';
  try {
    const state = useStore.getState();
    if (state && state.baseCurrency) {
      activeBase = state.baseCurrency;
    }
  } catch (e) {
    // Fail-safe
  }
  
  let targetCurrency = currency;
  let targetAmount = amount;
  
  if (currency === 'USD' && activeBase !== 'USD') {
    targetCurrency = activeBase;
    targetAmount = fromUSD(amount, activeBase);
  }
  
  const symbols: Record<string, string> = {
    INR: '₹', USD: '$', EUR: '€', GBP: '£', PKR: '₨', CNY: '¥',
    SAR: '﷼', AED: 'د.إ', JPY: '¥', CAD: 'C$', AUD: 'A$', SGD: 'S$',
    KWD: 'د.ك', OMR: 'ر.ع.', BHD: '.د.ب', QAR: 'ر.ق', MYR: 'RM', THB: '฿',
    ZMW: 'K',
  };
  
  const symbol = symbols[targetCurrency] ?? `${targetCurrency} `;
  const formattedAmount = targetAmount.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
  
  return `${symbol}${formattedAmount}`;
}

/**
 * formatStaticCurrency uses the fixed fallback exchange rate (18.40) 
 * for calculating total inventory values so they don't fluctuate 
 * when the global exchange rate changes.
 */
export function formatStaticCurrency(amountUSD: number | null | undefined): string {
  if (amountUSD === null || amountUSD === undefined) return '—';
  
  let activeBase = 'USD';
  try {
    const state = useStore.getState();
    if (state && state.baseCurrency) {
      activeBase = state.baseCurrency;
    }
  } catch (e) {}
  
  let targetCurrency = activeBase;
  let targetAmount = amountUSD;
  
  if (activeBase === 'ZMW') {
    targetAmount = amountUSD * 18.40;
  } else if (activeBase !== 'USD') {
    targetAmount = fromUSD(amountUSD, activeBase);
  }
  
  const symbol = CURRENCY_SYMBOLS[targetCurrency] ?? `${targetCurrency} `;
  const formattedAmount = targetAmount.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
  
  return `${symbol}${formattedAmount}`;
}

const CURRENCY_SYMBOLS: Record<string, string> = {
  INR: '₹', USD: '$', EUR: '€', GBP: '£', PKR: '₨', CNY: '¥',
  SAR: '﷼', AED: 'د.إ', JPY: '¥', CAD: 'C$', AUD: 'A$', SGD: 'S$',
  KWD: 'د.ك', OMR: 'ر.ع.', BHD: '.د.ب', QAR: 'ر.ق', MYR: 'RM', THB: '฿',
  ZMW: 'K',
};

/**
 * Format a USD-stored amount in an explicit target currency, independent of the
 * global base-currency toggle. Used by the inventory table's per-column currency
 * selectors (Unit Cost defaults to USD, Retail defaults to ZMW).
 */
export function formatInCurrency(amountUSD: number | null | undefined, currency: string): string {
  if (amountUSD === null || amountUSD === undefined) return '—';
  const converted = currency === 'USD' ? amountUSD : fromUSD(amountUSD, currency);
  const symbol = CURRENCY_SYMBOLS[currency] ?? `${currency} `;
  
  // Custom precision handling: if integer, show without decimals. If has decimals, show 2 decimals.
  const formatted = converted % 1 === 0 ? converted.toLocaleString('en-US') : converted.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return `${symbol}${formatted}`;
}

export function formatRetailPrice(item: Item, displayCurrency: string): string {
  if (displayCurrency === (item.local_currency || 'ZMW')) {
    if (item.retail_price_local != null) {
      const symbol = CURRENCY_SYMBOLS[displayCurrency] ?? `${displayCurrency} `;
      const price = item.retail_price_local;
      const formatted = price % 1 === 0 ? price.toLocaleString('en-US') : price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
      return `${symbol}${formatted}`;
    }
    // Fallback for old items missing a local price: Use a FIXED exchange rate of 18.40 so it NEVER fluctuates dynamically.
    const symbol = CURRENCY_SYMBOLS[displayCurrency] ?? `${displayCurrency} `;
    const price = (item.retail_price || 0) * 18.40;
    const formatted = price % 1 === 0 ? price.toLocaleString('en-US') : price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    return `${symbol}${formatted}`;
  }
  
  // If requesting USD, always return the pure USD price
  if (displayCurrency === 'USD') {
    const symbol = '$';
    const price = item.retail_price || 0;
    const formatted = price % 1 === 0 ? price.toLocaleString('en-US') : price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    return `${symbol}${formatted}`;
  }

  return formatInCurrency(item.retail_price || 0, displayCurrency);
}

export function formatUnitCost(item: Item, displayCurrency: string): string {
  if (displayCurrency === (item.local_currency || 'ZMW')) {
    if (item.avg_cost_local != null) {
      const symbol = CURRENCY_SYMBOLS[displayCurrency] ?? `${displayCurrency} `;
      const cost = item.avg_cost_local;
      const formatted = cost % 1 === 0 ? cost.toLocaleString('en-US') : cost.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
      return `${symbol}${formatted}`;
    }
    // Fallback for old items missing a local price: Use a FIXED exchange rate of 18.40 so it NEVER fluctuates dynamically.
    const symbol = CURRENCY_SYMBOLS[displayCurrency] ?? `${displayCurrency} `;
    const cost = (item.avg_cost_USD || 0) * 18.40;
    const formatted = cost % 1 === 0 ? cost.toLocaleString('en-US') : cost.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    return `${symbol}${formatted}`;
  }
  
  // If requesting USD, always return the pure USD cost
  if (displayCurrency === 'USD') {
    const symbol = '$';
    const cost = item.avg_cost_USD || 0;
    const formatted = cost % 1 === 0 ? cost.toLocaleString('en-US') : cost.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    return `${symbol}${formatted}`;
  }

  return formatInCurrency(item.avg_cost_USD || 0, displayCurrency);
}

/**
 * Returns a string like "SAR 100 ($2,220)"
 */
export function formatDualCurrency(amount: number, currency: string): string {
  let activeBase = 'USD';
  try {
    const state = useStore.getState();
    if (state && state.baseCurrency) {
      activeBase = state.baseCurrency;
    }
  } catch (e) {}

  if (currency === activeBase) {
    return formatCurrency(amount, currency);
  }
  const usdValue = toUSD(amount, currency);
  return `${formatCurrency(amount, currency)} (${formatCurrency(usdValue, 'USD')})`;
}

/**
 * Returns a dual currency string using a historical USD value, so that historical 
 * transactions do not fluctuate when today's exchange rates change.
 */
export function formatHistoricalDualCurrency(amount: number, currency: string, historicalUSDValue: number): string {
  let activeBase = 'USD';
  try {
    const state = useStore.getState();
    if (state && state.baseCurrency) {
      activeBase = state.baseCurrency;
    }
  } catch (e) {}

  if (currency === activeBase) {
    return formatCurrency(amount, currency);
  }
  
  const baseVal = activeBase === 'USD' ? historicalUSDValue : fromUSD(historicalUSDValue, activeBase);
  return `${formatCurrency(amount, currency)} (${formatCurrency(baseVal, activeBase)})`;
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
  transferSessions: TransferSession[];
  deletedContainerSnapshots: DeletedContainerSnapshot[];
  auditLogs: AuditLog[];
  isSyncing: boolean;
  isSyncingRates: boolean;
  baseCurrency: string;
  exchangeRates: Record<string, number>;

  setImportSessions: (d: ImportSession[]) => void;
  saveImportSession: (session: Omit<ImportSession, 'id'>) => Promise<string>;
  deleteImportSession: (id: string) => Promise<void>;
  fixImportStock: (sessionId: string, fixes: { item_id: string; newQty: number; location_id: string; sessionItemIndex?: number }[]) => Promise<void>;

  setTransferSessions: (d: TransferSession[]) => void;
  executeTransferSession: (data: {
    from_location: string;
    to_location: string;
    items: { brand_id: string; item_id: string; quantity: number }[];
    performed_by: string;
    notes?: string;
    date?: string;
  }) => Promise<string>;
  fixTransferStock: (sessionId: string, fixes: { item_id: string; newQty: number }[]) => Promise<void>;
  deleteTransferSession: (id: string) => Promise<void>;
  deleteTransferSessions: (ids: string[]) => Promise<void>;
  setBaseCurrency: (c: string) => void;
  fetchLiveExchangeRates: () => Promise<void>;


  // Global Modals State
  isTransferModalOpen: boolean;
  isTransferModalMinimized: boolean;
  transferForm: { from_location: string; to_location: string; notes?: string };
  transferGroups: { brand_id: string; _id: number; items: { item_id: string; quantity: number; _id: number }[] }[];
  
  isRecordSaleModalOpen: boolean;
  isRecordSaleModalMinimized: boolean;
  recordSaleLocation: string;
  recordSaleGroups: { brand_id: string; _id: number; items: { item_id: string; quantity: number; selling_price: number; currency: string; _id: number }[] }[];

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
  setTransferGroups: (groups: any[]) => void;

  setRecordSaleModalOpen: (v: boolean) => void;
  setRecordSaleModalMinimized: (v: boolean) => void;
  setRecordSaleLocation: (v: string) => void;
  setRecordSaleGroups: (groups: any[]) => void;

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
  updateBrand: (id: string, updates: Partial<Brand>) => Promise<void>;
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
    timestamp?: string; // optional backdated timestamp (YYYY-MM-DD or ISO string)
  }[], performed_by: string, options?: { skipNotifications?: boolean; isPending?: boolean }) => Promise<void>;

  // Transfer between locations
  recordTransfer: (params: {
    from_location: string; to_location: string; item_id: string; item_name: string;
    quantity: number; unit_cost_USD: number; performed_by: string; container_id?: string | null;
  }, options?: { skipNotifications?: boolean }) => Promise<void>;

  // Sale from a shop
  recordSale: (params: {
    item_id: string; item_name: string; location_id: string;
    quantity: number; selling_price: number; currency: string; sold_by: string;
    timestamp?: string; exchange_rates?: Record<string, number>;
  }, options?: { skipNotifications?: boolean }) => Promise<void>;

  // Batch Sale from a shop
  batchRecordSale: (sales: Array<{
    item_id: string; item_name: string; location_id: string;
    quantity: number; selling_price: number; currency: string; sold_by: string;
    timestamp?: string; exchange_rates?: Record<string, number>;
  }>, options?: { skipNotifications?: boolean }) => Promise<void>;

  // Edit Sale
  editSale: (params: {
    id: string; item_id?: string; item_name?: string; 
    quantity: number; selling_price: number;
    timestamp: string; exchange_rates?: Record<string, number>;
  }, performed_by: string) => Promise<void>;

  // Delete Sale
  deleteSale: (saleId: string, performed_by: string) => Promise<void>;

  // Return
  processReturn: (ret: Omit<ReturnRecord, 'id'>, options?: { skipNotifications?: boolean }) => Promise<void>;
  deleteReturn: (id: string) => Promise<void>;

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
  createNotification: (notif: Partial<AppNotification>) => Promise<void>;
  initFirestoreSync: () => void;

  // Maintenance
  clearMasterData: () => Promise<void>;
  clearHistory: () => Promise<void>;
  clearLocationStock: (locationId: string) => Promise<void>;

  // Bulk Deletion & Updates
  deleteLocations: (ids: string[]) => Promise<void>;
  deleteBrands: (ids: string[]) => Promise<void>;
  deleteItems: (ids: string[]) => Promise<void>;
  deleteContainers: (ids: string[], revertStock?: boolean) => Promise<void>;
  undoDeleteContainer: (snapshotId: string) => Promise<void>;
  updateBrandPrices: (brandId: string, itemUpdates: { id: string; avg_cost_USD?: number; retail_price?: number; }[]) => Promise<void>;
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
  transferSessions: [],
  importSessions: [],
  deletedContainerSnapshots: [],
  auditLogs: [],
  isSyncingRates: false,
  baseCurrency: localStorage.getItem('777_base_currency') || 'USD',
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
    const batch = writeBatch(db);
    const { importSessions, transactions, inventory } = get();
    const session = importSessions.find(s => s.id === id);

    if (session) {
      for (const item of session.items) {
        const safeLocId = session.location_id.replace(/\//g, '-');
        const safeItemId = item.item_id.replace(/\//g, '-');
        const toId = `${safeLocId}_${safeItemId}`;
        const toEntry = inventory.find(e => e.id === toId);

        if (toEntry) {
          const qtyToRemove = item.receivedQty || 0;
          const newQty = Math.max(0, toEntry.quantity - qtyToRemove);
          const newReceived = Math.max(0, (toEntry.received_balance || 0) - qtyToRemove);

          batch.update(doc(db, 'inventory', toId), {
            quantity: newQty,
            received_balance: newReceived
          });
        }
      }

      // Delete matching transactions
      const txs = transactions.filter(t => t.import_session_id === id);
      txs.forEach(tx => batch.delete(doc(db, 'transactions', tx.id)));
    }

    // Delete the session document
    batch.delete(doc(db, 'import_sessions', id));
    await batch.commit();
  },

  fixImportStock: async (sessionId, fixes) => {
    const batch = writeBatch(db);
    const { inventory, importSessions, transactions, items, brands } = get();

    const session = importSessions.find(s => s.id === sessionId);
    if (!session) throw new Error('Session not found');

    const updatedSessionItems = [...session.items];

    const runningInventoryMap = new Map<string, number>();

    for (const fix of fixes) {
      const safeLocId = fix.location_id.replace(/\//g, '-');
      const safeItemId = fix.item_id.replace(/\//g, '-');
      const invId = `${safeLocId}_${safeItemId}`;
      
      const existing = inventory.find(e => e.id === invId);
      const baseQty = existing?.quantity ?? 0;
      const currentQty = runningInventoryMap.has(invId) ? runningInventoryMap.get(invId)! : baseQty;

      const sItemIdx = fix.sessionItemIndex;
      const sItem = sItemIdx !== undefined && sItemIdx >= 0 && sItemIdx < updatedSessionItems.length 
        ? updatedSessionItems[sItemIdx] 
        : updatedSessionItems.find(si => si.item_id === fix.item_id);

      const oldReceivedQty = sItem ? sItem.receivedQty : 0;
      const diff = fix.newQty - oldReceivedQty;
      const newInventoryQty = existing ? Math.max(0, currentQty + diff) : fix.newQty;
      
      runningInventoryMap.set(invId, newInventoryQty);

      // 1. Check if the item itself was deleted from the main items collection, and restore it.
      const existingItem = items.find(it => it.id === fix.item_id);
      if (!existingItem) {
        if (sItem) {
          const brandObj = brands.find(b => b.name.toLowerCase() === sItem.brand.toLowerCase());
          const brandId = brandObj?.id ?? sItem.brand; // fallback to brand name if not found
          batch.set(doc(db, 'items', fix.item_id), {
            id: fix.item_id,
            brand_id: brandId,
            name: sItem.item_name,
            sku: sItem.sku || '',
            category: 'Imported (Restored)',
            min_stock_limit: 0,
            retail_price: sItem.retailPrice || 0,
            avg_cost_USD: sItem.unitCost || 0
          });
        }
      }

      // 2. Set/update the inventory document (creates automatically if deleted/missing).
      batch.set(doc(db, 'inventory', invId), {
        id: invId,
        location_id: fix.location_id,
        item_id: fix.item_id,
        quantity: newInventoryQty,
        opening_balance: existing?.opening_balance ?? newInventoryQty,
        received_balance: existing ? (existing.received_balance || 0) + diff : fix.newQty,
        supplied_balance: existing?.supplied_balance ?? 0,
        returned_balance: existing?.returned_balance ?? 0,
        avg_cost_USD: existing?.avg_cost_USD ?? 0,
        last_import_timestamp: new Date().toISOString(),
        last_fix_timestamp: new Date().toISOString(),
        fixed_from_session: sessionId,
      });

      if (sItemIdx !== undefined && sItemIdx >= 0 && sItemIdx < updatedSessionItems.length) {
        updatedSessionItems[sItemIdx] = {
          ...updatedSessionItems[sItemIdx],
          receivedQty: fix.newQty
        };
      } else {
        const fallbackIdx = updatedSessionItems.findIndex(si => si.item_id === fix.item_id);
        if (fallbackIdx !== -1) {
          updatedSessionItems[fallbackIdx] = { ...updatedSessionItems[fallbackIdx], receivedQty: fix.newQty };
        } else {
        const addedItem = items.find(it => it.id === fix.item_id);
        if (addedItem) {
          const brandObj = brands.find(b => b.id === addedItem.brand_id);
          updatedSessionItems.push({
            item_id: addedItem.id,
            item_name: addedItem.name,
            sku: addedItem.sku || '',
            brand: brandObj?.name || 'Unknown',
            invoiceQty: 0,
            receivedQty: fix.newQty,
            unitCost: addedItem.avg_cost_USD || 0,
            retailPrice: addedItem.retail_price || 0
          });
        }
        }
      }

      // 3. Update or recreate the transaction record for this import/container.
      if (session.container_id) {
        const tx = transactions.find(t => t.container_id === session.container_id && t.item_id === fix.item_id && t.type === 'stock_entry');
        if (tx) {
          const newTxQty = Math.max(0, tx.quantity + diff);
          const newConvertedValue = newTxQty * tx.unit_cost;
          batch.update(doc(db, 'transactions', tx.id), {
            quantity: newTxQty,
            converted_value_USD: newConvertedValue
          });
        } else {
          // If transaction was deleted, recreate it in full.
          const sItem = updatedSessionItems.find(si => si.item_id === fix.item_id);
          const txRef = doc(collection(db, 'transactions'));
          const newTxQty = fix.newQty;
          const unitCost = sItem?.unitCost || 0;
          batch.set(txRef, sanitizeForFirestore({
            id: txRef.id,
            type: 'stock_entry',
            from_location: 'supplier',
            to_location: fix.location_id,
            item_id: fix.item_id,
            item_name: sItem?.item_name || 'Restored Item',
            quantity: newTxQty,
            unit_cost: unitCost,
            currency: session.currency || 'USD',
            converted_value_USD: newTxQty * unitCost,
            performed_by: 'System Reconcile',
            timestamp: new Date().toISOString(),
            container_id: session.container_id
          }));
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

  setTransferSessions: (d) => set({ transferSessions: d }),

  executeTransferSession: async (sessionData) => {
    const batch = writeBatch(db);
    const { inventory, items, locations } = get();

    const fromLoc = locations.find(l => l.id === sessionData.from_location);
    const toLoc = locations.find(l => l.id === sessionData.to_location);
    const fromName = fromLoc?.name ?? sessionData.from_location;
    const toName = toLoc?.name ?? sessionData.to_location;

    const fromTargetRoles = getTargetRolesForLocationStockEntry(fromLoc?.type ?? 'warehouse');
    const toTargetRoles = getTargetRolesForLocationStockEntry(toLoc?.type ?? 'warehouse');

    const sessionRef = doc(collection(db, 'transfer_sessions'));
    const sessionId = sessionRef.id;

    const sessionItems: TransferSessionItem[] = [];
    const timestamp = sessionData.date ? new Date(sessionData.date).toISOString() : new Date().toISOString();
    const currentDay = timestamp.split('T')[0];

    for (const sItem of sessionData.items) {
      const item = items.find(i => i.id === sItem.item_id);
      if (!item) throw new Error(`Item ${sItem.item_id} not found.`);

      const fromId = `${sessionData.from_location}_${sItem.item_id}`;
      const toId = `${sessionData.to_location}_${sItem.item_id}`;

      const fromEntry = inventory.find(e => e.id === fromId);
      if (!fromEntry || fromEntry.quantity < sItem.quantity) {
        throw new Error(`Insufficient stock for ${item.name} at source.`);
      }

      const toEntry = inventory.find(e => e.id === toId);

      const newFromQty = Math.round(fromEntry.quantity - sItem.quantity);
      const toQty = Math.round((toEntry?.quantity ?? 0) + sItem.quantity);
      
      const unit_cost_USD = item.avg_cost_USD ?? 0;
      const toAvg = toEntry
        ? (toEntry.avg_cost_USD * toEntry.quantity + unit_cost_USD * sItem.quantity) / toQty
        : unit_cost_USD;

      // Update Source Inventory
      const updatedFrom = {
        ...fromEntry,
        quantity: newFromQty,
        supplied_balance: (fromEntry.supplied_balance || 0) + sItem.quantity,
        last_rollover_date: fromEntry.last_rollover_date || currentDay
      };
      batch.set(doc(db, 'inventory', fromId), sanitizeForFirestore(updatedFrom));

      // Update Destination Inventory
      const updatedTo = toEntry
        ? {
            ...toEntry,
            quantity: toQty,
            received_balance: (toEntry.received_balance || 0) + sItem.quantity,
            avg_cost_USD: toAvg
          }
        : {
            id: toId, location_id: sessionData.to_location, item_id: sItem.item_id,
            quantity: toQty, avg_cost_USD: toAvg,
            opening_balance: 0, received_balance: sItem.quantity,
            supplied_balance: 0, returned_balance: 0,
            last_rollover_date: currentDay
          };
      batch.set(doc(db, 'inventory', toId), sanitizeForFirestore(updatedTo));

      // Create transaction for transfer
      const txRef = doc(collection(db, 'transactions'));
      batch.set(txRef, sanitizeForFirestore({
        id: txRef.id,
        type: 'transfer',
        from_location: sessionData.from_location,
        to_location: sessionData.to_location,
        item_id: sItem.item_id,
        item_name: item.name || 'Unknown Item',
        quantity: sItem.quantity,
        unit_cost: unit_cost_USD,
        currency: 'USD',
        converted_value_USD: unit_cost_USD * sItem.quantity,
        performed_by: sessionData.performed_by,
        timestamp: timestamp,
        transfer_session_id: sessionId
      }));

      // Low stock check
      if (newFromQty < item.min_stock_limit) {
        const notifRef = doc(collection(db, 'notifications'));
        batch.set(notifRef, {
          id: notifRef.id,
          type: 'low_stock',
          location_id: sessionData.from_location,
          message: `⚠️ Low Stock Alert: ${item.name} at ${fromName} is below minimum after transfer (${newFromQty}/${item.min_stock_limit} units).`,
          target_roles: fromTargetRoles,
          status: 'unread',
          timestamp: timestamp,
          item_id: sItem.item_id
        });
      }

      sessionItems.push({
        item_id: sItem.item_id,
        item_name: item.name,
        sku: item.sku,
        brand: get().brands.find(b => b.id === item.brand_id)?.name ?? 'Unknown',
        quantity: sItem.quantity
      });
    }

    // Create session notifications
    const fromNotifRef = doc(collection(db, 'notifications'));
    batch.set(fromNotifRef, {
      id: fromNotifRef.id,
      type: 'transfer',
      location_id: sessionData.from_location,
      message: `🔄 Transfer Out: ${sessionData.items.length} item types (${sessionData.items.reduce((acc, it) => acc + it.quantity, 0)} units) transferred from ${fromName} → ${toName} by ${sessionData.performed_by}.`,
      target_roles: fromTargetRoles,
      status: 'unread',
      timestamp: timestamp,
      target_location_id: sessionData.to_location
    });

    const toNotifRef = doc(collection(db, 'notifications'));
    batch.set(toNotifRef, {
      id: toNotifRef.id,
      type: 'transfer',
      location_id: sessionData.to_location,
      message: `📥 Transfer In: ${sessionData.items.length} item types (${sessionData.items.reduce((acc, it) => acc + it.quantity, 0)} units) received at ${toName} from ${fromName} by ${sessionData.performed_by}.`,
      target_roles: toTargetRoles,
      status: 'unread',
      timestamp: timestamp,
      target_location_id: sessionData.from_location
    });

    // Save TransferSession
    const totalItems = sessionItems.reduce((acc, it) => acc + it.quantity, 0);
    const transferSession: TransferSession = {
      id: sessionId,
      date: timestamp,
      from_location: sessionData.from_location,
      to_location: sessionData.to_location,
      itemCount: sessionItems.length,
      totalItems,
      items: sessionItems,
      performed_by: sessionData.performed_by,
      notes: sessionData.notes,
      status: 'Completed'
    };
    batch.set(sessionRef, sanitizeForFirestore(transferSession));

    await batch.commit();
    return sessionId;
  },

  fixTransferStock: async (sessionId, fixes) => {
    const batch = writeBatch(db);
    const { inventory, transferSessions, transactions, items, brands } = get();

    const session = transferSessions.find(s => s.id === sessionId);
    if (!session) throw new Error('Transfer session not found');

    // Clean up duplicates in session.items first
    const cleanSessionItemsMap = new Map<string, TransferSessionItem>();
    for (const si of session.items) {
      if (cleanSessionItemsMap.has(si.item_id)) {
         cleanSessionItemsMap.get(si.item_id)!.quantity += si.quantity;
      } else {
         cleanSessionItemsMap.set(si.item_id, { ...si });
      }
    }
    let updatedSessionItems = Array.from(cleanSessionItemsMap.values());

    for (const fix of fixes) {
      const fromId = `${session.from_location}_${fix.item_id}`;
      const toId = `${session.to_location}_${fix.item_id}`;

      const fromEntry = inventory.find(e => e.id === fromId);
      const toEntry = inventory.find(e => e.id === toId);

      const sItemIdx = updatedSessionItems.findIndex(si => si.item_id === fix.item_id);
      const oldQty = sItemIdx >= 0 ? updatedSessionItems[sItemIdx].quantity : 0;
      const diff = fix.newQty - oldQty;

      // Recreate item if deleted
      const existingItem = items.find(it => it.id === fix.item_id);
      const sItem = updatedSessionItems[sItemIdx];
      if (!existingItem && sItem) {
        const brandObj = brands.find(b => b.name.toLowerCase() === sItem.brand.toLowerCase());
        const brandId = brandObj?.id ?? sItem.brand;
        batch.set(doc(db, 'items', fix.item_id), {
          id: fix.item_id,
          brand_id: brandId,
          name: sItem.item_name,
          sku: sItem.sku || '',
          category: 'Transferred (Restored)',
          min_stock_limit: 0,
          retail_price: 0,
          avg_cost_USD: 0
        });
      }

      // Update Source Stock (refund items)
      const currentFromQty = fromEntry?.quantity ?? 0;
      const newFromQty = Math.max(0, currentFromQty - diff);
      const newSupplied = Math.max(0, (fromEntry?.supplied_balance ?? 0) + diff);

      batch.set(doc(db, 'inventory', fromId), {
        id: fromId,
        location_id: session.from_location,
        item_id: fix.item_id,
        quantity: newFromQty,
        opening_balance: fromEntry?.opening_balance ?? newFromQty,
        received_balance: fromEntry?.received_balance ?? 0,
        supplied_balance: newSupplied,
        returned_balance: fromEntry?.returned_balance ?? 0,
        avg_cost_USD: fromEntry?.avg_cost_USD ?? (existingItem?.avg_cost_USD ?? 0),
        last_fix_timestamp: new Date().toISOString(),
        fixed_from_transfer_session: sessionId,
      }, { merge: true });

      // Update Destination Stock
      const currentToQty = toEntry?.quantity ?? 0;
      const newToQty = Math.max(0, currentToQty + diff);
      const newReceived = Math.max(0, (toEntry?.received_balance ?? 0) + diff);

      batch.set(doc(db, 'inventory', toId), {
        id: toId,
        location_id: session.to_location,
        item_id: fix.item_id,
        quantity: newToQty,
        opening_balance: toEntry?.opening_balance ?? newToQty,
        received_balance: newReceived,
        supplied_balance: toEntry?.supplied_balance ?? 0,
        returned_balance: toEntry?.returned_balance ?? 0,
        avg_cost_USD: toEntry?.avg_cost_USD ?? (existingItem?.avg_cost_USD ?? 0),
        last_fix_timestamp: new Date().toISOString(),
        fixed_from_transfer_session: sessionId,
      }, { merge: true });

      // Update Session item quantity
      if (sItemIdx !== -1) {
        updatedSessionItems[sItemIdx] = {
          ...updatedSessionItems[sItemIdx],
          quantity: fix.newQty
        };
      } else {
        const addedItem = items.find(it => it.id === fix.item_id);
        if (addedItem) {
          const brandObj = brands.find(b => b.id === addedItem.brand_id);
          updatedSessionItems.push({
            item_id: addedItem.id,
            item_name: addedItem.name,
            sku: addedItem.sku || '',
            brand: brandObj?.name || 'Unknown',
            quantity: fix.newQty
          });
        }
      }

      // Update transaction record, handle duplicates and old transactions missing transfer_session_id
      let txs = transactions.filter(t => 
        (t.transfer_session_id === sessionId || 
         (!t.transfer_session_id && t.timestamp === session.date && t.from_location === session.from_location && t.to_location === session.to_location)) 
        && t.item_id === fix.item_id 
        && t.type === 'transfer'
      );
      if (txs.length > 0) {
        const tx = txs[0];
        const newTxQty = Math.max(0, fix.newQty);
        if (newTxQty > 0) {
          const newConvertedValue = newTxQty * tx.unit_cost;
          batch.update(doc(db, 'transactions', tx.id), {
            quantity: newTxQty,
            converted_value_USD: newConvertedValue
          });
        } else {
          batch.delete(doc(db, 'transactions', tx.id));
        }
        // Delete duplicate transactions
        for (let i = 1; i < txs.length; i++) {
          batch.delete(doc(db, 'transactions', txs[i].id));
        }
      } else if (fix.newQty > 0) {
        // Recreate deleted transaction
        const txRef = doc(collection(db, 'transactions'));
        const unitCost = existingItem?.avg_cost_USD ?? 0;
        batch.set(txRef, sanitizeForFirestore({
          id: txRef.id,
          type: 'transfer',
          from_location: session.from_location,
          to_location: session.to_location,
          item_id: fix.item_id,
          item_name: sItem?.item_name || 'Restored Transfer Item',
          quantity: fix.newQty,
          unit_cost: unitCost,
          currency: 'USD',
          converted_value_USD: fix.newQty * unitCost,
          performed_by: 'System Reconcile',
          timestamp: session.date || new Date().toISOString(),
          transfer_session_id: sessionId
        }));
      }
    }

    updatedSessionItems = updatedSessionItems.filter(si => si.quantity > 0);
    const updatedTotalItems = updatedSessionItems.reduce((sum, item) => sum + item.quantity, 0);
    batch.update(doc(db, 'transfer_sessions', sessionId), {
      items: updatedSessionItems,
      itemCount: updatedSessionItems.length,
      totalItems: updatedTotalItems,
      status: 'Reconciled'
    });

    await batch.commit();
  },

  deleteTransferSession: async (id) => {
    const batch = writeBatch(db);
    const { transferSessions, transactions, inventory } = get();
    const session = transferSessions.find(s => s.id === id);

    if (session) {
      for (const item of session.items) {
        // 1. Revert Source Location
        const safeFromLocId = session.from_location.replace(/\//g, '-');
        const safeItemId = item.item_id.replace(/\//g, '-');
        const fromId = `${safeFromLocId}_${safeItemId}`;
        const fromEntry = inventory.find(e => e.id === fromId);

        if (fromEntry) {
          const newFromQty = Math.max(0, fromEntry.quantity + item.quantity);
          const newSupplied = Math.max(0, (fromEntry.supplied_balance || 0) - item.quantity);
          batch.update(doc(db, 'inventory', fromId), {
            quantity: newFromQty,
            supplied_balance: newSupplied
          });
        }

        // 2. Revert Destination Location
        const safeToLocId = session.to_location.replace(/\//g, '-');
        const toId = `${safeToLocId}_${safeItemId}`;
        const toEntry = inventory.find(e => e.id === toId);

        if (toEntry) {
          const newToQty = Math.max(0, toEntry.quantity - item.quantity);
          const newReceived = Math.max(0, (toEntry.received_balance || 0) - item.quantity);
          batch.update(doc(db, 'inventory', toId), {
            quantity: newToQty,
            received_balance: newReceived
          });
        }
      }

      // 3. Delete matching transactions
      const txs = transactions.filter(t => t.transfer_session_id === id);
      txs.forEach(tx => batch.delete(doc(db, 'transactions', tx.id)));
    }

    // 4. Delete the session document
    batch.delete(doc(db, 'transfer_sessions', id));
    await batch.commit();
  },

  deleteTransferSessions: async (ids: string[]) => {
    const { transferSessions, transactions, inventory } = get();
    
    // Aggregate inventory deltas
    const invDeltas = new Map<string, { qty: number, received: number, supplied: number }>();
    
    for (const id of ids) {
      const session = transferSessions.find(s => s.id === id);
      if (!session) continue;
      
      for (const item of session.items) {
        const safeFromLocId = session.from_location.replace(/\//g, '-');
        const safeToLocId = session.to_location.replace(/\//g, '-');
        const safeItemId = item.item_id.replace(/\//g, '-');
        
        const fromId = `${safeFromLocId}_${safeItemId}`;
        const toId = `${safeToLocId}_${safeItemId}`;
        
        if (!invDeltas.has(fromId)) invDeltas.set(fromId, { qty: 0, received: 0, supplied: 0 });
        if (!invDeltas.has(toId)) invDeltas.set(toId, { qty: 0, received: 0, supplied: 0 });
        
        // Revert Source (increase qty, decrease supplied)
        invDeltas.get(fromId)!.qty += item.quantity;
        invDeltas.get(fromId)!.supplied -= item.quantity;
        
        // Revert Destination (decrease qty, decrease received)
        invDeltas.get(toId)!.qty -= item.quantity;
        invDeltas.get(toId)!.received -= item.quantity;
      }
    }
    
    // Commit everything in chunks
    const allOperations: Function[] = [];
    
    invDeltas.forEach((delta, invId) => {
      const entry = inventory.find(e => e.id === invId);
      if (entry) {
        const newQty = Math.max(0, entry.quantity + delta.qty);
        const newReceived = Math.max(0, (entry.received_balance || 0) + delta.received);
        const newSupplied = Math.max(0, (entry.supplied_balance || 0) + delta.supplied);
        
        allOperations.push((b: any) => {
          b.update(doc(db, 'inventory', invId), {
            quantity: newQty,
            received_balance: newReceived,
            supplied_balance: newSupplied
          });
        });
      }
    });
    
    ids.forEach(id => {
      const txs = transactions.filter(t => t.transfer_session_id === id);
      txs.forEach(tx => {
        allOperations.push((b: any) => b.delete(doc(db, 'transactions', tx.id)));
      });
      allOperations.push((b: any) => b.delete(doc(db, 'transfer_sessions', id)));
    });
    
    // Execute in 500-op chunks
    for (let i = 0; i < allOperations.length; i += 500) {
      const b = writeBatch(db);
      allOperations.slice(i, i + 500).forEach(op => op(b));
      await b.commit();
    }
  },

  setBaseCurrency: (c) => {
    localStorage.setItem('777_base_currency', c);
    set({ baseCurrency: c });
  },

  fetchLiveExchangeRates: async () => {
    set({ isSyncingRates: true });
    try {
      const response = await fetch('https://open.er-api.com/v6/latest/USD');
      if (!response.ok) throw new Error('Network response was not ok');
      const data = await response.json();
      if (!data || !data.rates) throw new Error('Invalid rate data format');

      const batch = writeBatch(db);
      
      const ratesToSync = ['USD', 'ZMW', 'INR', 'EUR', 'GBP', 'CNY', 'PKR', 'SAR', 'AED', 'JPY', 'CAD', 'AUD', 'SGD', 'KWD', 'OMR', 'BHD', 'QAR', 'MYR', 'THB'];
      
      for (const cur of ratesToSync) {
        if (data.rates[cur]) {
          const rateRecord = {
            id: cur,
            currency: cur,
            rate: data.rates[cur],
            lastUpdated: new Date().toISOString(),
            source: 'Open Exchange Rates API (Auto)'
          };
          batch.set(doc(db, 'exchange_rates', cur), rateRecord);
        }
      }
      await batch.commit();
    } catch (err: any) {
      console.error('Failed to sync live rates:', err);
      throw err;
    } finally {
      set({ isSyncingRates: false });
    }
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
  transferForm: { from_location: '', to_location: '', notes: '' },
  transferGroups: [{ brand_id: '', _id: Date.now(), items: [{ item_id: '', quantity: 1, _id: Date.now() + 1 }] }],
  
  isRecordSaleModalOpen: false,
  isRecordSaleModalMinimized: false,
  recordSaleLocation: '',
  recordSaleGroups: [{ brand_id: '', _id: Date.now(), items: [{ item_id: '', quantity: 1, selling_price: 0, currency: 'USD', _id: Date.now() + 1 }] }],

  setTransferModalOpen: (v) => set({ isTransferModalOpen: v }),
  setTransferModalMinimized: (v) => set({ isTransferModalMinimized: v }),
  setTransferForm: (f) => set({ transferForm: f }),
  setTransferGroups: (groups) => set({ transferGroups: groups }),

  setRecordSaleModalOpen: (v) => set({ isRecordSaleModalOpen: v }),
  setRecordSaleModalMinimized: (v) => set({ isRecordSaleModalMinimized: v }),
  setRecordSaleLocation: (v) => set({ recordSaleLocation: v }),
  setRecordSaleGroups: (groups) => set({ recordSaleGroups: groups }),

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

  createNotification: async (notif) => {
    const notifRef = doc(collection(db, 'notifications'));
    await setDoc(notifRef, {
      id: notifRef.id,
      status: 'unread',
      timestamp: new Date().toISOString(),
      ...notif
    });
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
        .filter(i => locationId === 'ALL' ? true : i.location_id === locationId)
        .map(i => doc(db, 'inventory', i.id));

      for (let i = 0; i < allInventory.length; i += 500) {
        const batch = writeBatch(db);
        allInventory.slice(i, i + 500).forEach(dRef => batch.delete(dRef));
        await batch.commit();
      }
      
      const locName = locationId === 'ALL' ? 'All Locations' : get().locations.find(l => l.id === locationId)?.name || locationId;
      await logAction('clear', 'location', locationId, locName, `Cleared all stock for location ${locName}`);
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
  updateBrand: async (id: string, updates: Partial<Brand>) => {
    const st = get();
    const oldBrand = st.brands.find(b => b.id === id);
    const oldName = oldBrand?.name;
    const newName = updates.name;

    const batch = writeBatch(db);
    const bRef = doc(db, 'brands', id);
    batch.update(bRef, updates);

    // If the name changed, cascade the name update to all associated items
    if (oldName && newName && oldName !== newName) {
      const itemsToUpdate = st.items.filter(i => i.brand_id === id);
      itemsToUpdate.forEach(item => {
        // If the item name contains the old brand name, replace it with the new one.
        // We use a case-insensitive replacement or just normal replacement.
        // Usually, the item name starts with the brand name.
        if (item.name.includes(oldName)) {
          const newItemName = item.name.replace(oldName, newName);
          const iRef = doc(db, 'items', item.id);
          batch.update(iRef, { name: newItemName });
        }
      });
    }

    await batch.commit();
  },

  deleteBrand: async (id: string) => {
    return get().deleteBrands([id]);
  },
  deleteBrands: async (ids: string[]) => {
    const st = get();
    const itemsToDelete = st.items.filter(i => ids.includes(i.brand_id));
    const itemIds = itemsToDelete.map(i => i.id);

    const invToDelete = st.inventory.filter(i => itemIds.includes(i.item_id)).map(i => doc(db, 'inventory', i.id));
    const txToDelete = st.transactions.filter(t => itemIds.includes(t.item_id)).map(t => doc(db, 'transactions', t.id));
    const salesToDelete = st.sales.filter(s => itemIds.includes(s.item_id)).map(s => doc(db, 'sales', s.id));
    const retToDelete = st.returns.filter(r => itemIds.includes(r.item_id)).map(r => doc(db, 'returns', r.id));
    
    const brandDocs = ids.map(id => doc(db, 'brands', id));
    const itemDocs = itemIds.map(id => doc(db, 'items', id));

    const allDocs = [...brandDocs, ...itemDocs, ...invToDelete, ...txToDelete, ...salesToDelete, ...retToDelete];

    // Chunk into 500-op batches
    for (let i = 0; i < allDocs.length; i += 500) {
      const b = writeBatch(db);
      allDocs.slice(i, i + 500).forEach(ref => b.delete(ref));
      await b.commit();
    }
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
    const currentItem = get().items.find(i => i.id === id);
    if (updates.sku) {
      if (currentItem && currentItem.sku.toLowerCase() !== updates.sku.toLowerCase()) {
        const exists = get().items.some(i => i.id !== id && i.sku.toLowerCase() === updates.sku!.toLowerCase());
        if (exists) throw new Error(`An item with SKU "${updates.sku}" already exists.`);
      }
    }
    
    const p1 = updateDoc(doc(db, 'items', id), sanitizeForFirestore(updates as Record<string, any>));
    const p2 = currentItem 
      ? logAction('update', 'item', id, currentItem.name, `Updated item details: ${Object.keys(updates).join(', ')}`)
      : Promise.resolve();
      
    await Promise.all([p1, p2]);
  },
  deleteItem: async (id: string) => {
    return get().deleteItems([id]);
  },
  deleteItems: async (ids: string[]) => {
    const st = get();
    
    const invToDelete = st.inventory.filter(i => ids.includes(i.item_id)).map(i => doc(db, 'inventory', i.id));
    const txToDelete = st.transactions.filter(t => ids.includes(t.item_id)).map(t => doc(db, 'transactions', t.id));
    const salesToDelete = st.sales.filter(s => ids.includes(s.item_id)).map(s => doc(db, 'sales', s.id));
    const retToDelete = st.returns.filter(r => ids.includes(r.item_id)).map(r => doc(db, 'returns', r.id));
    const itemDocs = ids.map(id => doc(db, 'items', id));

    const allDocs = [...itemDocs, ...invToDelete, ...txToDelete, ...salesToDelete, ...retToDelete];

    const batchPromises = [];
    for (let i = 0; i < allDocs.length; i += 500) {
      const b = writeBatch(db);
      allDocs.slice(i, i + 500).forEach(ref => b.delete(ref));
      batchPromises.push(b.commit());
    }
    
    // Log deletion concurrently
    for (const id of ids) {
      const item = st.items.find(i => i.id === id);
      if (item) {
        batchPromises.push(logAction('delete', 'item', id, item.name, `Deleted item ${item.name} and all its inventory records.`));
      }
    }
    await Promise.all(batchPromises);
  },
  updateBrandPrices: async (brandId: string, itemUpdates) => {
    const st = get();
    const items = st.items.filter(i => i.brand_id === brandId);
    if (items.length === 0 || itemUpdates.length === 0) return;

    const batchPromises = [];
    for (let i = 0; i < itemUpdates.length; i += 500) {
      const b = writeBatch(db);
      itemUpdates.slice(i, i + 500).forEach(update => {
        const ref = doc(db, 'items', update.id);
        const fbUpdates: Partial<Item> = {};
        if (update.avg_cost_USD !== undefined) fbUpdates.avg_cost_USD = update.avg_cost_USD;
        if (update.retail_price !== undefined) fbUpdates.retail_price = update.retail_price;
        
        if (Object.keys(fbUpdates).length > 0) {
          b.update(ref, sanitizeForFirestore(fbUpdates));
        }
      });
      batchPromises.push(b.commit());
    }
    await Promise.all(batchPromises);
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
  deleteContainers: async (ids: string[], revertStock: boolean = false) => {
    const st = get();

    // Build snapshot BEFORE deletion, to allow undo within 24 hours
    const deletedAt = new Date().toISOString();
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

    for (const containerId of ids) {
      const container = st.containers.find(c => c.id === containerId);
      const session = st.importSessions.find(s => s.container_id === containerId);
      const location = session ? st.locations.find(l => l.id === session.location_id) : undefined;

      if (session && session.items && session.items.length > 0) {
        const snapshotId = `del-${containerId}-${Date.now()}`;
        const snapshot: DeletedContainerSnapshot = {
          id: snapshotId,
          container_no: container?.container_no ?? containerId,
          deleted_at: deletedAt,
          expires_at: expiresAt,
          location_id: session.location_id,
          location_name: location?.name ?? session.location_id,
          currency: session.currency ?? 'USD',
          items: session.items.map(i => ({
            item_id: i.item_id,
            item_name: i.item_name,
            sku: i.sku ?? '',
            receivedQty: i.receivedQty ?? 0,
            unitCost: i.unitCost ?? 0,
          })),
          total_items_count: session.items.length,
        };
        await setDoc(doc(db, 'deleted_container_snapshots', snapshotId), sanitizeForFirestore(snapshot));
      }
    }

    // Delete container documents
    const containerBatch = writeBatch(db);
    ids.forEach(id => containerBatch.delete(doc(db, 'containers', id)));
    containerBatch.commit();

    if (revertStock) {
      const sessions = st.importSessions.filter(s => s.container_id && ids.includes(s.container_id));
      const invUpdates: { invId: string; qtyToSubtract: number }[] = [];

      sessions.forEach(s => {
        if (s.items && Array.isArray(s.items)) {
          s.items.forEach(i => {
            if (i.item_id && i.receivedQty) {
              const safeLocId = s.location_id.replace(/\//g, '-');
              const safeItemId = i.item_id.replace(/\//g, '-');
              invUpdates.push({
                invId: `${safeLocId}_${safeItemId}`,
                qtyToSubtract: i.receivedQty,
              });
            }
          });
        }
      });

      if (invUpdates.length > 0) {
        for (let i = 0; i < invUpdates.length; i += 490) {
          const chunk = invUpdates.slice(i, i + 490);
          const b = writeBatch(db);
          chunk.forEach(({ invId, qtyToSubtract }) => {
            const existing = st.inventory.find(e => e.id === invId);
            if (existing) {
              const newQty = Math.max(0, existing.quantity - qtyToSubtract);
              b.update(doc(db, 'inventory', invId), { quantity: newQty });
            }
          });
          await b.commit();
        }
      }

      // Delete import session records (items stay intact)
      if (sessions.length > 0) {
        const sessionBatch = writeBatch(db);
        sessions.forEach(s => sessionBatch.delete(doc(db, 'import_sessions', s.id)));
        await sessionBatch.commit();
      }
    }
  },

  undoDeleteContainer: async (snapshotId: string) => {
    const st = get();
    const snapshot = st.deletedContainerSnapshots.find(s => s.id === snapshotId);
    if (!snapshot) throw new Error('Snapshot not found or already expired.');

    // Re-add stock quantities for each item in the snapshot
    const validItems = snapshot.items.filter(i => i.item_id && i.receivedQty > 0);
    if (validItems.length > 0) {
      for (let i = 0; i < validItems.length; i += 490) {
        const chunk = validItems.slice(i, i + 490);
        const b = writeBatch(db);
        chunk.forEach(item => {
          const safeLocId = snapshot.location_id.replace(/\//g, '-');
          const safeItemId = item.item_id.replace(/\//g, '-');
          const invId = `${safeLocId}_${safeItemId}`;
          const existing = st.inventory.find(e => e.id === invId);
          const currentQty = existing?.quantity ?? 0;
          const newQty = currentQty + item.receivedQty;
          if (existing) {
            b.update(doc(db, 'inventory', invId), { quantity: newQty });
          } else {
            b.set(doc(db, 'inventory', invId), sanitizeForFirestore({
              id: invId,
              location_id: snapshot.location_id,
              item_id: item.item_id,
              quantity: newQty,
              avg_cost_USD: toUSD(item.unitCost, snapshot.currency),
              avg_cost_local: item.unitCost,
              local_currency: snapshot.currency,
              opening_balance: 0,
              received_balance: item.receivedQty,
              supplied_balance: 0,
              returned_balance: 0,
            }));
          }
        });
        await b.commit();
      }
    }

    // Delete the snapshot after undo
    await deleteDoc(doc(db, 'deleted_container_snapshots', snapshotId));
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
      const pendingInventory = new Map<string, { quantity: number; avg_cost_USD: number; avg_cost_local?: number; local_currency?: string }>();

      for (const params of chunk) {
        const { container_id, location_id, item_id, item_name, quantity, unit_cost, currency, is_absolute_override, timestamp: paramTimestamp } = params;
        const avgCostINR = toUSD(unit_cost, currency);

        const safeLocId = location_id.replace(/\//g, '-');
        const safeItemId = item_id.replace(/\//g, '-');
        const invId = `${safeLocId}_${safeItemId}`;

        let currentInv = pendingInventory.get(invId);
        if (!currentInv) {
          const existing = inventorySnapshot.get(invId);
          currentInv = existing
            ? { quantity: existing.quantity, avg_cost_USD: existing.avg_cost_USD, avg_cost_local: existing.avg_cost_local, local_currency: existing.local_currency }
            : { quantity: 0, avg_cost_USD: 0, avg_cost_local: 0, local_currency: currency };
        }

        const deltaQty = is_absolute_override
          ? Math.max(0, quantity - currentInv.quantity)
          : quantity;
        const deltaToApply = isPending ? 0 : deltaQty;
        const newQty = is_absolute_override ? (isPending ? currentInv.quantity : quantity) : currentInv.quantity + deltaToApply;

        let newAvg = currentInv.avg_cost_USD;
        let newAvgLocal = currentInv.avg_cost_local ?? unit_cost;
        if (!is_absolute_override) {
          if (avgCostINR > 0) newAvg = avgCostINR;
          if (unit_cost > 0) newAvgLocal = unit_cost;
        } else if (avgCostINR > 0) {
          newAvg = avgCostINR;
          newAvgLocal = unit_cost;
        }

        const safeQty = Math.round(newQty);
        pendingInventory.set(invId, { quantity: safeQty, avg_cost_USD: newAvg, avg_cost_local: newAvgLocal, local_currency: currency });

        const currentDay = new Date().toISOString().split('T')[0];

        batch.set(doc(db, 'inventory', invId), sanitizeForFirestore({
          id: invId, location_id, item_id, quantity: safeQty, avg_cost_USD: newAvg,
          avg_cost_local: newAvgLocal, local_currency: currency,
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
            unit_cost_local: unit_cost, local_currency: currency,
            performed_by, container_id: container_id || null,
            notes: is_absolute_override ? 'Stock level override (Import)' : null,
            timestamp: paramTimestamp ? (paramTimestamp.length === 10 ? paramTimestamp + 'T00:00:00.000Z' : paramTimestamp) : new Date().toISOString(),
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
  recordTransfer: async ({ from_location, to_location, item_id, item_name, quantity, unit_cost_USD, performed_by, container_id }, options = {}) => {
    const lockResource1 = `inventory_${from_location}_${item_id}`;
    const lockResource2 = `inventory_${to_location}_${item_id}`;

    return transactionLockManager.executeWithLock(lockResource1, async () => {
      return transactionLockManager.executeWithLock(lockResource2, async () => {
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
        const fromLocalCost = fromEntry.avg_cost_local ?? unit_cost_USD;
        const fromLocalCurrency = fromEntry.local_currency ?? 'USD';
        const toAvgLocal = toEntry
          ? ((toEntry.avg_cost_local || 0) * toEntry.quantity + fromLocalCost * quantity) / toQty
          : fromLocalCost;

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
              avg_cost_USD: toAvg,
              avg_cost_local: toAvgLocal,
              local_currency: fromLocalCurrency
            }
          : {
              id: toId, location_id: to_location, item_id,
              quantity: toQty, avg_cost_USD: toAvg,
              avg_cost_local: toAvgLocal, local_currency: fromLocalCurrency,
              opening_balance: 0, received_balance: quantity,
              supplied_balance: 0, returned_balance: 0,
              last_rollover_date: currentDay
            };
        batch.set(doc(db, 'inventory', toId), sanitizeForFirestore(updatedTo));

        const txRef = doc(collection(db, 'transactions'));
        batch.set(txRef, sanitizeForFirestore({
          id: txRef.id, type: 'transfer',
          from_location, to_location, item_id,
          item_name: item_name || get().items.find(i => i.id === item_id)?.name || 'Unknown Item',
          quantity,
          unit_cost: unit_cost_USD, currency: 'USD',
          converted_value_USD: unit_cost_USD * quantity,
          performed_by: performed_by || 'Staff',
          timestamp: new Date().toISOString(),
          container_id: container_id || null
        }));

        // Helper
        const getLocationName = (id: string) => get().locations.find(l => l.id === id)?.name ?? id;
        const fromLoc = get().locations.find(l => l.id === from_location);
        const toLoc = get().locations.find(l => l.id === to_location);
        const fromTargetRoles = getTargetRolesForLocationStockEntry(fromLoc?.type ?? 'warehouse');
        const toTargetRoles = getTargetRolesForLocationStockEntry(toLoc?.type ?? 'warehouse');

        // Transfer notifications
        if (!options.skipNotifications) {
          const notif1 = doc(collection(db, 'notifications'));
          batch.set(notif1, {
            id: notif1.id, type: 'transfer', location_id: from_location,
            message: `🔄 Transfer Out: ${quantity}x ${item_name} transferred from ${getLocationName(from_location)} → ${getLocationName(to_location)}.`,
            target_roles: fromTargetRoles, status: 'unread',
            timestamp: new Date().toISOString(), item_id, target_location_id: to_location
          });

          const notif2 = doc(collection(db, 'notifications'));
          batch.set(notif2, {
            id: notif2.id, type: 'transfer', location_id: to_location,
            message: `🔄 Transfer: ${quantity}x ${item_name} arrived at ${getLocationName(to_location)} from ${getLocationName(from_location)}.`,
            target_roles: toTargetRoles, status: 'unread',
            timestamp: new Date().toISOString(), item_id, target_location_id: from_location
          });
        }

        const item = get().items.find(i => i.id === item_id);
        if (item && newFromQty < item.min_stock_limit) {
          const lowNotif = doc(collection(db, 'notifications'));
          batch.set(lowNotif, {
            id: lowNotif.id, type: 'low_stock', location_id: from_location,
            message: `⚠️ Low Stock Alert: ${item_name} at ${getLocationName(from_location)} is below minimum (${newFromQty}/${item.min_stock_limit} units).`,
            target_roles: fromTargetRoles, status: 'unread',
            timestamp: new Date().toISOString(), item_id
          });
        }

        await batch.commit();
      }, performed_by);
    }, performed_by);
  },

  // ── Sale ───────────────────────────────────────────────────────────────────
  recordSale: async ({ item_id, item_name: rawItemName, location_id, quantity, selling_price, currency, sold_by, timestamp }, options = {}) => {
    const item_name = rawItemName || get().items.find(i => i.id === item_id)?.name || 'Unknown Item';
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

      const appliedRates = options.exchange_rates || get().exchangeRates;
      const convertedPriceINR = toUSD(selling_price * quantity, currency, appliedRates);
      
      // EXACT formula: profit = (retail_price_per_unit - unit_cost_USD × exchange_rate) × qty
      const globalItem = get().items.find(i => i.id === item_id);
      const saleCostUSD = globalItem?.avg_cost_USD ?? invEntry.avg_cost_USD;
      const saleCostLocal = globalItem?.avg_cost_local ?? invEntry.avg_cost_local ?? saleCostUSD;

      const unitCostLocal = fromUSD(saleCostUSD, currency, appliedRates); // unit_cost_USD × rate
      const profitPerUnit = selling_price - unitCostLocal;                 // retail - cost_in_local
      const profitLocal = profitPerUnit < 0 ? 0 : profitPerUnit * quantity;
      
      // Convert local profit back to USD for storage
      const profitINR = toUSD(profitLocal, currency, appliedRates);

      const saleRef = doc(collection(db, 'sales'));
      batch.set(saleRef, sanitizeForFirestore({
        id: saleRef.id, item_id, item_name, location_id, quantity,
        selling_price, currency, converted_price_USD: convertedPriceINR,
        avg_cost_USD: saleCostUSD, profit_USD: profitINR,
        avg_cost_local: saleCostLocal,
        profit_local: profitLocal, local_currency: invEntry.local_currency ?? 'USD',
        sold_by, timestamp: timestamp || new Date().toISOString(),
        exchange_rates: appliedRates
      }));

      const txRef = doc(collection(db, 'transactions'));
      batch.set(txRef, sanitizeForFirestore({
        id: txRef.id, type: 'sale',
        from_location: location_id, to_location: 'customer',
        item_id, item_name, quantity, unit_cost: selling_price, currency,
        converted_value_USD: convertedPriceINR, performed_by: sold_by || 'Staff',
        timestamp: timestamp || new Date().toISOString(),
        exchange_rates: appliedRates
      }));

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

      // Skip individual sale notifications if requested
      if (!options.skipNotifications) {
        createNotif3(
          'sale', location_id,
          `🛍️ Sale Recorded: ${quantity}x ${item_name} sold at ${saleLocName} by ${sold_by}.`,
          saleTargetRoles,
          { item_id }
        );
      }

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

  batchRecordSale: async (sales, options = {}) => {
    // Process in batches of 400 to stay well under Firestore's 500 limit.
    const CHUNK_SIZE = 400;
    const batches = [];
    
    // We'll use a local Map to keep track of inventory mutations within this bulk operation
    // so we don't accidentally oversell if the same item is listed twice in the array.
    const inventoryMutations = new Map<string, number>();

    for (let i = 0; i < sales.length; i += CHUNK_SIZE) {
      const chunk = sales.slice(i, i + CHUNK_SIZE);
      const batch = writeBatch(db);
      const currentDay = new Date().toISOString().split('T')[0];
      const appliedRates = options.exchange_rates || get().exchangeRates;

      for (const sale of chunk) {
        const item_name = sale.item_name || get().items.find(it => it.id === sale.item_id)?.name || 'Unknown Item';
        const invId = `${sale.location_id}_${sale.item_id}`;
        
        const invEntry = get().getInventoryAt(sale.location_id, sale.item_id);
        if (!invEntry) throw new Error(`Insufficient stock for sale of ${item_name}.`);
        
        const previousMutatedQty = inventoryMutations.get(invId) ?? invEntry.quantity;
        if (previousMutatedQty < sale.quantity) {
           throw new Error(`Insufficient stock for sale of ${item_name}.`);
        }
        
        const newQty = Math.round(previousMutatedQty - sale.quantity);
        inventoryMutations.set(invId, newQty);
        
        batch.set(doc(db, 'inventory', invId), sanitizeForFirestore({ 
          ...invEntry, 
          quantity: newQty,
          supplied_balance: (invEntry.supplied_balance || 0) + sale.quantity,
          last_rollover_date: invEntry.last_rollover_date || currentDay
        }));

        const convertedPriceINR = toUSD(sale.selling_price * sale.quantity, sale.currency, appliedRates);
        const globalItem = get().items.find(it => it.id === sale.item_id);
        const saleCostUSD = globalItem?.avg_cost_USD ?? invEntry.avg_cost_USD;
        const saleCostLocal = globalItem?.avg_cost_local ?? invEntry.avg_cost_local ?? saleCostUSD;

        const unitCostLocal = fromUSD(saleCostUSD, sale.currency, appliedRates); 
        const profitPerUnit = sale.selling_price - unitCostLocal;                 
        const profitLocal = profitPerUnit < 0 ? 0 : profitPerUnit * sale.quantity;
        const profitINR = toUSD(profitLocal, sale.currency, appliedRates);

        const saleRef = doc(collection(db, 'sales'));
        batch.set(saleRef, sanitizeForFirestore({
          id: saleRef.id, item_id: sale.item_id, item_name, location_id: sale.location_id, quantity: sale.quantity,
          selling_price: sale.selling_price, currency: sale.currency, converted_price_USD: convertedPriceINR,
          avg_cost_USD: saleCostUSD, profit_USD: profitINR,
          avg_cost_local: saleCostLocal,
          profit_local: profitLocal, local_currency: invEntry.local_currency ?? 'USD',
          sold_by: sale.sold_by, timestamp: sale.timestamp || new Date().toISOString(),
          exchange_rates: appliedRates
        }));

        const txRef = doc(collection(db, 'transactions'));
        batch.set(txRef, sanitizeForFirestore({
          id: txRef.id, type: 'sale',
          from_location: sale.location_id, to_location: 'customer',
          item_id: sale.item_id, item_name, quantity: sale.quantity, unit_cost: sale.selling_price, currency: sale.currency,
          converted_value_USD: convertedPriceINR, performed_by: sale.sold_by || 'Staff',
          timestamp: sale.timestamp || new Date().toISOString(),
          exchange_rates: appliedRates
        }));
      }
      batches.push(batch);
    }

    // Commit in parallel groups
    const PARALLEL = 4;
    for (let i = 0; i < batches.length; i += PARALLEL) {
      await Promise.all(batches.slice(i, i + PARALLEL).map(b => b.commit()));
    }
  },

  editSale: async ({ id, item_id, item_name, quantity, selling_price, timestamp, exchange_rates }, performed_by) => {
    const lockResource = `sale_edit_${id}`;
    return transactionLockManager.executeWithLock(lockResource, async () => {
      const batch = writeBatch(db);
      
      const { sales, inventory, transactions, items } = get();
      const oldSale = sales.find(s => s.id === id);
      if (!oldSale) throw new Error('Sale not found');

      const newItemId = item_id || oldSale.item_id;
      const newItemName = item_name || oldSale.item_name;
      const isItemChanged = newItemId !== oldSale.item_id;

      const oldInvId = `${oldSale.location_id}_${oldSale.item_id}`;
      const oldInvEntry = inventory.find(i => i.id === oldInvId);
      if (!oldInvEntry) throw new Error('Original inventory entry not found');

      let newInvId = oldInvId;
      let newInvEntry = oldInvEntry;

      if (isItemChanged) {
        newInvId = `${oldSale.location_id}_${newItemId}`;
        const found = inventory.find(i => i.id === newInvId);
        if (!found) throw new Error('New item inventory entry not found in this location');
        newInvEntry = found;

        if (newInvEntry.quantity < quantity) {
          throw new Error('Insufficient stock for the new item');
        }

        // Full refund to old item
        const updatedOldQty = Math.round(oldInvEntry.quantity + oldSale.quantity);
        batch.update(doc(db, 'inventory', oldInvId), {
          quantity: updatedOldQty,
          supplied_balance: Math.max(0, (oldInvEntry.supplied_balance || 0) - oldSale.quantity)
        });

        // Full deduct from new item
        const updatedNewQty = Math.round(newInvEntry.quantity - quantity);
        batch.update(doc(db, 'inventory', newInvId), {
          quantity: updatedNewQty,
          supplied_balance: (newInvEntry.supplied_balance || 0) + quantity
        });
      } else {
        // 1. Calculate qty diff on the same item
        const qtyDiff = quantity - oldSale.quantity;
        if (qtyDiff > 0 && oldInvEntry.quantity < qtyDiff) {
          throw new Error('Insufficient stock to increase sale quantity');
        }

        // Update inventory
        const newInvQty = Math.round(oldInvEntry.quantity - qtyDiff);
        batch.update(doc(db, 'inventory', oldInvId), {
          quantity: newInvQty,
          supplied_balance: (oldInvEntry.supplied_balance || 0) + qtyDiff
        });
      }

      // Recalculate prices
      const appliedRates = exchange_rates || oldSale.exchange_rates || get().exchangeRates;
      const convertedPriceINR = toUSD(selling_price * quantity, oldSale.currency, appliedRates);
      
      // Use new item's avg cost if item changed
      const costUSD = isItemChanged ? (newInvEntry.avg_cost_USD || items.find(i => i.id === newItemId)?.avg_cost_USD || 0) : oldSale.avg_cost_USD;
      const costLocal = isItemChanged ? (newInvEntry.avg_cost_local ?? costUSD) : (oldSale.avg_cost_local ?? oldSale.avg_cost_USD);
      
      // FIXED: Always convert costUSD to sale currency using the applied rates
      // EXACT formula: profit = (retail_price_per_unit - unit_cost_USD × exchange_rate) × qty
      const unitCostLocal = fromUSD(costUSD, oldSale.currency, appliedRates);
      const profitPerUnit = selling_price - unitCostLocal;
      const profitLocal = profitPerUnit < 0 ? 0 : profitPerUnit * quantity;
      const profitINR = toUSD(profitLocal, oldSale.currency, appliedRates);

      // Update Sale
      batch.update(doc(db, 'sales', id), {
        item_id: newItemId,
        item_name: newItemName,
        quantity,
        selling_price,
        converted_price_USD: convertedPriceINR,
        avg_cost_USD: costUSD,
        avg_cost_local: costLocal,
        profit_USD: profitINR,
        profit_local: profitLocal,
        timestamp,
        exchange_rates: appliedRates
      });

      // Find and update the associated transaction
      const txs = transactions.filter(t => t.type === 'sale' && t.item_id === oldSale.item_id && t.from_location === oldSale.location_id);
      const tx = txs.find(t => t.timestamp === oldSale.timestamp && t.quantity === oldSale.quantity) || txs.find(t => t.quantity === oldSale.quantity);

      if (tx) {
        batch.update(doc(db, 'transactions', tx.id), {
          item_id: newItemId,
          item_name: newItemName,
          quantity,
          unit_cost: selling_price,
          converted_value_USD: convertedPriceINR,
          timestamp,
          exchange_rates: appliedRates
        });
      }

      await logAction('update', 'item', oldSale.item_id, oldSale.item_name, `Reconciled sale for ${oldSale.item_name} -> ${newItemName} (${quantity} qty) by ${performed_by}`);

      await batch.commit();
    });
  },

  deleteSale: async (saleId: string, performed_by: string) => {
    const lockResource = `sale_edit_${saleId}`;
    return transactionLockManager.executeWithLock(lockResource, async () => {
      const batch = writeBatch(db);
      
      const { sales, inventory, transactions } = get();
      const oldSale = sales.find(s => s.id === saleId);
      if (!oldSale) throw new Error('Sale not found');

      const invId = `${oldSale.location_id}_${oldSale.item_id}`;
      const invEntry = inventory.find(i => i.id === invId);
      if (invEntry) {
        // Full refund to item
        const updatedOldQty = Math.round(invEntry.quantity + oldSale.quantity);
        batch.update(doc(db, 'inventory', invId), {
          quantity: updatedOldQty,
          supplied_balance: Math.max(0, (invEntry.supplied_balance || 0) - oldSale.quantity)
        });
      }

      // Delete Sale
      batch.delete(doc(db, 'sales', saleId));

      // Find and delete the associated transaction
      const txs = transactions.filter(t => t.type === 'sale' && t.item_id === oldSale.item_id && t.from_location === oldSale.location_id);
      const tx = txs.find(t => t.timestamp === oldSale.timestamp && t.quantity === oldSale.quantity) || txs.find(t => t.quantity === oldSale.quantity);

      if (tx) {
        batch.delete(doc(db, 'transactions', tx.id));
      }

      await logAction('delete', 'item', oldSale.item_id, oldSale.item_name, `Deleted sale for ${oldSale.item_name} (${oldSale.quantity} qty) and refunded to inventory by ${performed_by}`);

      await batch.commit();
    });
  },

  processReturn: async (ret, options = {}) => {
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
      batch.set(txRef, sanitizeForFirestore({
        id: txRef.id, type: 'return',
        from_location: ret.type === 'warehouse_return' ? 'shop' : 'customer',
        to_location: ret.location_id,
        item_id: ret.item_id,
        item_name: ret.item_name || get().items.find(i => i.id === ret.item_id)?.name || 'Unknown Item',
        quantity: ret.quantity,
        unit_cost: returnCostINR, currency: 'USD', converted_value_USD: returnCostINR * ret.quantity,
        performed_by: ret.performed_by || 'system',
        timestamp: new Date().toISOString(),
      }));

      await batch.commit();

      if (!options?.skipNotifications) {
        await get().createNotification({
          type: 'return',
          location_id: ret.location_id,
          message: `🔄 Item Returned: ${ret.quantity} units of ${ret.item_name} returned at ${get().locations.find(l => l.id === ret.location_id)?.name} by ${ret.performed_by || 'System'}.`,
          target_roles: ['super_admin', 'admin', 'warehouse_staff', 'shop_staff']
        });
      }
    }, 'system');
  },

  deleteReturn: async (id) => {
    const ret = get().returns.find(r => r.id === id);
    if (!ret) return;

    const lockResource = `inventory_${ret.location_id}_${ret.item_id}`;
    return transactionLockManager.executeWithLock(lockResource, async () => {
      const batch = writeBatch(db);
      
      batch.delete(doc(db, 'returns', id));

      if (ret.status === 'Restocked') {
        const invId = `${ret.location_id}_${ret.item_id}`;
        const existing = get().getInventoryAt(ret.location_id, ret.item_id);
        if (existing) {
          const newQty = Math.max(0, existing.quantity - ret.quantity);
          batch.set(doc(db, 'inventory', invId), sanitizeForFirestore({
            ...existing,
            quantity: newQty,
            returned_balance: Math.max(0, (existing.returned_balance || 0) - ret.quantity)
          }));
        }
      }

      const relatedTx = get().transactions.find(t => 
        t.type === 'return' && 
        t.item_id === ret.item_id && 
        t.to_location === ret.location_id &&
        t.quantity === ret.quantity &&
        Math.abs(new Date(t.timestamp).getTime() - new Date(ret.timestamp).getTime()) < 10000
      );
      if (relatedTx) {
        batch.delete(doc(db, 'transactions', relatedTx.id));
      }

      await batch.commit();
    });
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
    const totalCollections = 16;
    
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
      next: snap => { 
        const allTxs = snap.docs.map(d => ({ id: d.id, ...d.data() } as Transaction));
        
        // Filter out ghost duplicate transfer transactions
        const validTxs = allTxs.filter(t => {
          if (t.type !== 'transfer' || t.transfer_session_id) return true;
          const hasNewerDuplicate = allTxs.some(newer => 
            newer.type === 'transfer' && 
            newer.transfer_session_id && 
            newer.item_id === t.item_id && 
            newer.from_location === t.from_location && 
            newer.to_location === t.to_location && 
            newer.timestamp === t.timestamp
          );
          return !hasNewerDuplicate;
        });

        set({ transactions: validTxs }); 
        checkSyncComplete(); 
      },
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
    onSnapshot(query(collection(db, 'transfer_sessions'), orderBy('date', 'desc')), {
      next: snap => { set({ transferSessions: snap.docs.map(d => ({ id: d.id, ...d.data() } as TransferSession)) }); checkSyncComplete(); },
      error: err => logError('transfer_sessions', err)
    });
    // Listen for deleted container snapshots (24h undo archive)
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    onSnapshot(query(collection(db, 'deleted_container_snapshots'), where('expires_at', '>', oneDayAgo)), {
      next: snap => { set({ deletedContainerSnapshots: snap.docs.map(d => ({ id: d.id, ...d.data() } as DeletedContainerSnapshot)) }); checkSyncComplete(); },
      error: err => logError('deleted_container_snapshots', err)
    });
    onSnapshot(query(collection(db, 'audit_logs'), orderBy('timestamp', 'desc')), {
      next: snap => { set({ auditLogs: snap.docs.map(d => ({ id: d.id, ...d.data() } as AuditLog)) }); checkSyncComplete(); },
      error: err => logError('audit_logs', err)
    });
  },
}));
