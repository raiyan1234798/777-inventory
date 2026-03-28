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
  retail_price?: number; // Added to store default selling price
}

export interface InventoryEntry {
  id: string; // locationId_itemId composite
  location_id: string;
  item_id: string;
  quantity: number;
  avg_cost_INR: number;
}

export interface Container {
  id: string;
  container_no: string; // "Number" requested by user
  source_country: string;
  total_cost: number;
  currency: string;
  converted_cost_INR: number;
  date: string;
  notes?: string;
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
  converted_value_INR: number;
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
  converted_price_INR: number;
  avg_cost_INR: number;
  profit_INR: number;
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
  converted_amount_INR: number;
  category: string;
  date: string;
  notes?: string;
}

export interface ShopTarget {
  id: string;
  location_id: string;
  target_amount_INR: number;
  month: string; // YYYY-MM
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

export const CURRENCIES = Object.keys(EXCHANGE_RATES).sort();

export const COUNTRIES = [
  { name: 'India', currency: 'INR' },
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

export function toINR(amount: number, currency: string): number {
  return amount * (EXCHANGE_RATES[currency] ?? 1);
}

export function formatCurrency(amount: number, currency: string = 'INR'): string {
  const symbols: Record<string, string> = {
    INR: '₹', USD: '$', EUR: '€', GBP: '£', PKR: '₨', CNY: '¥',
    SAR: '﷼', AED: 'د.إ', JPY: '¥', CAD: 'C$', AUD: 'A$', SGD: 'S$',
    KWD: 'د.ك', OMR: 'ر.ع.', BHD: '.د.ب', QAR: 'ر.ق', MYR: 'RM', THB: '฿'
  };
  return `${symbols[currency] ?? currency + ' '}${amount.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
}

/**
 * Returns a string like "SAR 100 (₹2,220)"
 */
export function formatDualCurrency(amount: number, currency: string): string {
  if (currency === 'INR') return formatCurrency(amount, 'INR');
  const inrValue = toINR(amount, currency);
  return `${formatCurrency(amount, currency)} (${formatCurrency(inrValue, 'INR')})`;
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
  isSyncing: boolean;

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
  setIsSyncing: (v: boolean) => void;

  // Actions
  addLocation: (loc: Omit<Location, 'id'>) => Promise<void>;
  updateLocation: (id: string, loc: Partial<Location>) => Promise<void>;
  deleteLocation: (id: string) => Promise<void>;
  addBrand: (brand: Omit<Brand, 'id'>) => Promise<string>;
  deleteBrand: (id: string) => Promise<void>;
  addItem: (item: Omit<Item, 'id'>) => Promise<void>;
  deleteItem: (id: string) => Promise<void>;

  addContainer: (container: Omit<Container, 'id'>) => Promise<string>;

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

  // Transfer between locations
  transfer: (params: {
    from_location: string;
    to_location: string;
    item_id: string;
    item_name: string;
    quantity: number;
    unit_cost_INR: number;
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

  // Helpers
  getInventoryAt: (location_id: string, item_id: string) => InventoryEntry | undefined;
  markNotificationRead: (id: string) => Promise<void>;
  initFirestoreSync: () => void;
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
  isSyncing: false,

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
  setIsSyncing: (v) => set({ isSyncing: v }),

  getInventoryAt: (location_id, item_id) => {
    return get().inventory.find(e => e.location_id === location_id && e.item_id === item_id);
  },

  // ── Locations ──────────────────────────────────────────────────────────────
  addLocation: async (loc) => {
    const ref = doc(collection(db, 'locations'));
    await setDoc(ref, { id: ref.id, ...loc });
  },
  updateLocation: async (id, loc) => {
    await updateDoc(doc(db, 'locations', id), loc);
  },
  deleteLocation: async (id) => {
    // Safety check: ensure no inventory remains
    const hasInventory = get().inventory.some(e => e.location_id === id && e.quantity > 0);
    if (hasInventory) throw new Error('Cannot delete a location that still has active inventory.');
    await deleteDoc(doc(db, 'locations', id));
  },

  // ── Brands ─────────────────────────────────────────────────────────────────
  addBrand: async (brand) => {
    const ref = doc(collection(db, 'brands'));
    await setDoc(ref, { id: ref.id, ...brand });
    return ref.id;
  },
  deleteBrand: async (id) => {
    await deleteDoc(doc(db, 'brands', id));
  },

  // ── Items ──────────────────────────────────────────────────────────────────
  addItem: async (item) => {
    const ref = doc(collection(db, 'items'));
    await setDoc(ref, { id: ref.id, ...item });
  },
  deleteItem: async (id) => {
    await deleteDoc(doc(db, 'items', id));
  },

  // ── Container ──────────────────────────────────────────────────────────────
  addContainer: async (container) => {
    const ref = doc(collection(db, 'containers'));
    await setDoc(ref, { id: ref.id, ...container });
    return ref.id; // Return ID for chaining
  },

  // ── Stock Entry ────────────────────────────────────────────────────────────
  stockEntry: async ({ container_id, location_id, item_id, item_name, quantity, unit_cost, currency, performed_by }) => {
    // FIX: Use transaction lock to prevent race conditions on inventory
    const lockResource = `inventory_${location_id}_${item_id}`;
    
    return transactionLockManager.executeWithLock(lockResource, async () => {
      const batch = writeBatch(db);
      const converted = toINR(unit_cost * quantity, currency);
      const avgCostINR = toINR(unit_cost, currency);

      // Update inventory entry
      const invId = `${location_id}_${item_id}`;
      const existing = get().getInventoryAt(location_id, item_id);
      const newQty = (existing?.quantity ?? 0) + quantity;
      const newAvg = existing
        ? (existing.avg_cost_INR * existing.quantity + avgCostINR * quantity) / newQty
        : avgCostINR;

      batch.set(doc(db, 'inventory', invId), {
        id: invId, location_id, item_id, quantity: newQty, avg_cost_INR: newAvg
      });

      // Log transaction
      const txRef = doc(collection(db, 'transactions'));
      batch.set(txRef, {
        id: txRef.id,
        type: 'stock_entry',
        from_location: 'supplier',
        to_location: location_id,
        item_id, item_name, quantity, unit_cost, currency,
        converted_value_INR: converted,
        performed_by,
        container_id,
        timestamp: new Date().toISOString(),
      });

      // Helper to create a notification in batch
      const createNotif = (
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

      // Determine location type and target roles based on location
      const location = get().locations.find(l => l.id === location_id);
      const locationType = location?.type ?? 'warehouse';
      const targetRoles = getTargetRolesForLocationStockEntry(locationType);

      // Stock-entry notification — location-specific staff + admin + super_admin
      const locationName = location?.name ?? 'Location';
      const operationMsg = locationType === 'warehouse'
        ? `📦 Stock Received: ${item_name} — ${quantity} units added to warehouse.`
        : `📦 Stock Transfer: ${item_name} — ${quantity} units added to shop.`;

      createNotif(
        'stock_entry', location_id,
        operationMsg,
        targetRoles,
        { item_id }
      );

      // Low stock check after stock entry
      const item = get().items.find(i => i.id === item_id);
      if (item && newQty < item.min_stock_limit) {
        createNotif(
          'low_stock', location_id,
          `⚠️ Low Stock Alert: ${item_name} at ${locationName} is below minimum (${newQty}/${item.min_stock_limit} units). Immediate action required.`,
          targetRoles,
          { item_id }
        );
      }

      await batch.commit();
    }, performed_by);
  },

  // ── Transfer ───────────────────────────────────────────────────────────────
  transfer: async ({ from_location, to_location, item_id, item_name, quantity, unit_cost_INR, performed_by }) => {
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

        const newFromQty = fromEntry.quantity - quantity;
        const toQty = (toEntry?.quantity ?? 0) + quantity;
        const toAvg = toEntry
          ? (toEntry.avg_cost_INR * toEntry.quantity + unit_cost_INR * quantity) / toQty
          : unit_cost_INR;

        batch.set(doc(db, 'inventory', fromId), { ...fromEntry, quantity: newFromQty });
        batch.set(doc(db, 'inventory', toId), { id: toId, location_id: to_location, item_id, quantity: toQty, avg_cost_INR: toAvg });

        const txRef = doc(collection(db, 'transactions'));
        batch.set(txRef, {
          id: txRef.id, type: 'transfer',
          from_location, to_location, item_id, item_name, quantity,
          unit_cost: unit_cost_INR, currency: 'INR',
          converted_value_INR: unit_cost_INR * quantity,
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

      const invId = `${location_id}_${item_id}`;
      const newQty = invEntry.quantity - quantity;
      batch.set(doc(db, 'inventory', invId), { ...invEntry, quantity: newQty });

      const convertedPriceINR = toINR(selling_price * quantity, currency);
      const profitINR = convertedPriceINR - invEntry.avg_cost_INR * quantity;

      const saleRef = doc(collection(db, 'sales'));
      batch.set(saleRef, {
        id: saleRef.id, item_id, item_name, location_id, quantity,
        selling_price, currency, converted_price_INR: convertedPriceINR,
        avg_cost_INR: invEntry.avg_cost_INR, profit_INR: profitINR,
        sold_by, timestamp: new Date().toISOString(),
      });

      const txRef = doc(collection(db, 'transactions'));
      batch.set(txRef, {
        id: txRef.id, type: 'sale',
        from_location: location_id, to_location: 'customer',
        item_id, item_name, quantity, unit_cost: selling_price, currency,
        converted_value_INR: convertedPriceINR, performed_by: sold_by,
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

  // ── Return ─────────────────────────────────────────────────────────────────
  processReturn: async (ret) => {
    const batch = writeBatch(db);
    const retRef = doc(collection(db, 'returns'));
    batch.set(retRef, { id: retRef.id, ...ret });

    if (ret.status === 'Restocked') {
      const invId = `${ret.location_id}_${ret.item_id}`;
      const existing = get().getInventoryAt(ret.location_id, ret.item_id);
      const newQty = (existing?.quantity ?? 0) + ret.quantity;
      
      // FIX: When restocking, maintain the original avg_cost (don't change it)
      // This assumes the returned items have the same cost as the original batch
      if (existing) {
        batch.set(doc(db, 'inventory', invId), { ...existing, quantity: newQty });
      } else {
        // If it was somehow deleted or new location, create with cost 0 (requires manual adjustment later)
        batch.set(doc(db, 'inventory', invId), { id: invId, location_id: ret.location_id, item_id: ret.item_id, quantity: newQty, avg_cost_INR: 0 });
      }
    }

    // FIX: Record the cost impact of the return properly
    const refSale = get().sales.find(s => s.id === ret.ref_transaction_id);
    const returnCostINR = refSale ? refSale.avg_cost_INR * ret.quantity : 0;

    const txRef = doc(collection(db, 'transactions'));
    batch.set(txRef, {
      id: txRef.id, type: 'return',
      from_location: 'customer', to_location: ret.location_id,
      item_id: ret.item_id, item_name: ret.item_name, quantity: ret.quantity,
      unit_cost: returnCostINR, currency: 'INR', converted_value_INR: returnCostINR * ret.quantity,
      performed_by: 'system',
      timestamp: new Date().toISOString(),
    });

    await batch.commit();
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

  initFirestoreSync: () => {
    set({ isSyncing: true });
    
    let loadedCollections = 0;
    const totalCollections = 12;
    
    const checkSyncComplete = () => {
      loadedCollections++;
      if (loadedCollections === totalCollections) {
        set({ isSyncing: false }); // FIX: Only set to false once all listeners are ready
      }
    };
    
    onSnapshot(collection(db, 'locations'), snap => {
      set({ locations: snap.docs.map(d => ({ id: d.id, ...d.data() } as Location)) });
      checkSyncComplete();
    });
    onSnapshot(collection(db, 'brands'), snap => {
      set({ brands: snap.docs.map(d => ({ id: d.id, ...d.data() } as Brand)) });
      checkSyncComplete();
    });
    onSnapshot(collection(db, 'items'), snap => {
      set({ items: snap.docs.map(d => ({ id: d.id, ...d.data() } as Item)) });
      checkSyncComplete();
    });
    onSnapshot(collection(db, 'inventory'), snap => {
      set({ inventory: snap.docs.map(d => ({ id: d.id, ...d.data() } as InventoryEntry)) });
      checkSyncComplete();
    });
    onSnapshot(query(collection(db, 'containers'), orderBy('date', 'desc')), snap => {
      set({ containers: snap.docs.map(d => ({ id: d.id, ...d.data() } as Container)) });
      checkSyncComplete();
    });
    onSnapshot(query(collection(db, 'transactions'), orderBy('timestamp', 'desc')), snap => {
      set({ transactions: snap.docs.map(d => ({ id: d.id, ...d.data() } as Transaction)) });
      checkSyncComplete();
    });
    onSnapshot(query(collection(db, 'sales'), orderBy('timestamp', 'desc')), snap => {
      set({ sales: snap.docs.map(d => ({ id: d.id, ...d.data() } as Sale)) });
      checkSyncComplete();
    });
    onSnapshot(query(collection(db, 'returns'), orderBy('timestamp', 'desc')), snap => {
      set({ returns: snap.docs.map(d => ({ id: d.id, ...d.data() } as ReturnRecord)) });
      checkSyncComplete();
    });
    onSnapshot(query(collection(db, 'notifications'), orderBy('timestamp', 'desc')), snap => {
      set({ notifications: snap.docs.map(d => ({ id: d.id, ...d.data() } as AppNotification)) });
      checkSyncComplete();
    });
    onSnapshot(collection(db, 'users'), snap => {
      set({ users: snap.docs.map(d => ({ id: d.id, ...d.data() } as User)) });
      checkSyncComplete();
    });
    onSnapshot(collection(db, 'expenses'), snap => {
      set({ expenses: snap.docs.map(d => ({ id: d.id, ...d.data() } as ShopExpense)) });
      checkSyncComplete();
    });
    onSnapshot(collection(db, 'targets'), snap => {
      set({ targets: snap.docs.map(d => ({ id: d.id, ...d.data() } as ShopTarget)) });
      checkSyncComplete();
    });
  },
}));
