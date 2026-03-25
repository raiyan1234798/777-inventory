import { create } from 'zustand';
import { db } from '../lib/firebase';
import { collection, doc, setDoc, deleteDoc, writeBatch, onSnapshot, query, orderBy } from 'firebase/firestore';

export interface InventoryItem {
  id: string;
  name: string;
  category: string;
  sku: string;
  quantity: number;
  unitCost: number; // in INR
  sellingPrice: number; // in INR
}

export interface InvoiceItem {
  itemId: string;
  name: string;
  quantity: number;
  unitPrice: number; // in INR
  total: number;
}

export interface Invoice {
  id: string;
  date: string;
  customerName: string;
  shopLocation: string;
  items: InvoiceItem[];
  subtotal: number;
  currency: string;
  convertedTotalINR: number;
  status: 'Paid' | 'Pending';
}

export interface ReturnRecord {
  id: string;
  invoiceId: string;
  date: string;
  items: { itemId: string; name: string; returnQuantity: number; reason: string }[];
  status: 'Restocked' | 'Disposed';
}

export interface User {
  id: string;
  name: string;
  email: string;
  role: 'Super Admin' | 'Admin' | 'Warehouse Staff' | 'Shop Staff';
  location: string;
  status: 'Active' | 'Inactive';
}

interface AppState {
  inventory: InventoryItem[];
  invoices: Invoice[];
  returns: ReturnRecord[];
  users: User[];
  isSyncing: boolean;
  
  // Actions
  addInvoice: (invoice: Invoice) => Promise<void>;
  processReturn: (returnRec: ReturnRecord) => Promise<void>;
  addUser: (user: User) => Promise<void>;
  updateUser: (id: string, updatedUser: Partial<User>) => Promise<void>;
  deleteUser: (id: string) => Promise<void>;
  
  // Real-time setters
  setInventory: (data: InventoryItem[]) => void;
  setInvoices: (data: Invoice[]) => void;
  setReturns: (data: ReturnRecord[]) => void;
  setUsers: (data: User[]) => void;
  setIsSyncing: (val: boolean) => void;
}

export const useStore = create<AppState>((set, get) => ({
  inventory: [],
  invoices: [],
  returns: [],
  users: [],
  isSyncing: false,

  setInventory: (data) => set({ inventory: data }),
  setInvoices: (data) => set({ invoices: data }),
  setReturns: (data) => set({ returns: data }),
  setUsers: (data) => set({ users: data }),
  setIsSyncing: (val) => set({ isSyncing: val }),

  addInvoice: async (invoice) => {
    try {
      const batch = writeBatch(db);
      
      // Save Invoice
      const invoiceRef = doc(db, 'invoices', invoice.id);
      batch.set(invoiceRef, invoice);

      // Deduct from inventory
      const currentInventory = get().inventory;
      for (const invItem of invoice.items) {
        const target = currentInventory.find(i => i.id === invItem.itemId);
        if (target) {
          const itemRef = doc(db, 'inventory', target.id);
          batch.set(itemRef, { ...target, quantity: target.quantity - invItem.quantity }, { merge: true });
        }
      }

      await batch.commit();
    } catch (error) {
      console.error("Error adding invoice: ", error);
      throw error;
    }
  },

  processReturn: async (returnRec) => {
    try {
      const batch = writeBatch(db);
      
      // Save return record
      const returnRef = doc(db, 'returns', returnRec.id);
      batch.set(returnRef, returnRec);

      // Add restockable items back to inventory if they are restocked
      if (returnRec.status === 'Restocked') {
        const currentInventory = get().inventory;
        for (const retItem of returnRec.items) {
          const target = currentInventory.find(i => i.id === retItem.itemId);
          if (target) {
             const itemRef = doc(db, 'inventory', target.id);
             batch.set(itemRef, { ...target, quantity: target.quantity + retItem.returnQuantity }, { merge: true });
          }
        }
      }

      await batch.commit();
    } catch (error) {
      console.error("Error processing return: ", error);
      throw error;
    }
  },

  addUser: async (user) => {
    try {
      await setDoc(doc(db, 'users', user.id), user);
    } catch (error) {
      console.error("Error adding user: ", error);
      throw error;
    }
  },
  
  updateUser: async (id, updatedUser) => {
    try {
      await setDoc(doc(db, 'users', id), updatedUser, { merge: true });
    } catch (error) {
      console.error("Error updating user: ", error);
      throw error;
    }
  },

  deleteUser: async (id) => {
    try {
      await deleteDoc(doc(db, 'users', id));
    } catch (error) {
      console.error("Error deleting user: ", error);
      throw error;
    }
  }
}));

// Setup Firestore listeners
export const initFirestoreSync = () => {
  const store = useStore.getState();
  store.setIsSyncing(true);

  const unsubInventory = onSnapshot(collection(db, 'inventory'), (snapshot) => {
    const data = snapshot.docs.map(doc => doc.data() as InventoryItem);
    store.setInventory(data);
  });

  const unsubInvoices = onSnapshot(query(collection(db, 'invoices'), orderBy('date', 'desc')), (snapshot) => {
    const data = snapshot.docs.map(doc => doc.data() as Invoice);
    store.setInvoices(data);
  });

  const unsubReturns = onSnapshot(query(collection(db, 'returns'), orderBy('date', 'desc')), (snapshot) => {
    const data = snapshot.docs.map(doc => doc.data() as ReturnRecord);
    store.setReturns(data);
  });

  const unsubUsers = onSnapshot(collection(db, 'users'), (snapshot) => {
    const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }) as User);
    store.setUsers(data);
  });

  store.setIsSyncing(false);

  // Return a cleanup function
  return () => {
    unsubInventory();
    unsubInvoices();
    unsubReturns();
    unsubUsers();
  };
};
