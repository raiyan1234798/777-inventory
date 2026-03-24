import { create } from 'zustand';

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

interface AppState {
  inventory: InventoryItem[];
  invoices: Invoice[];
  returns: ReturnRecord[];
  
  // Actions
  addInvoice: (invoice: Invoice) => void;
  processReturn: (returnRec: ReturnRecord) => void;
}

// Initial Mock Data
const initialInventory: InventoryItem[] = [
  { id: '1', name: 'Premium Leather Jacket', category: 'Apparel', sku: 'ZRA-1021', quantity: 200, unitCost: 1200, sellingPrice: 4200 },
  { id: '2', name: 'Wireless Headphones', category: 'Electronics', sku: 'SNY-992', quantity: 150, unitCost: 4500, sellingPrice: 8900 },
  { id: '3', name: 'Running Sneakers', category: 'Footwear', sku: 'NKE-303', quantity: 80, unitCost: 2100, sellingPrice: 5500 },
];

const initialInvoices: Invoice[] = [
  {
    id: 'INV-1001',
    date: new Date().toISOString(),
    customerName: 'Aarav Patel',
    shopLocation: 'Mumbai Downtown',
    items: [
      { itemId: '1', name: 'Premium Leather Jacket', quantity: 3, unitPrice: 4200, total: 12600 },
      { itemId: '3', name: 'Running Sneakers', quantity: 1, unitPrice: 5500, total: 5500 }
    ],
    subtotal: 18100,
    currency: 'INR',
    convertedTotalINR: 18100,
    status: 'Paid'
  }
];

export const useStore = create<AppState>((set) => ({
  inventory: initialInventory,
  invoices: initialInvoices,
  returns: [],

  addInvoice: (invoice) => set((state) => {
    // Deduct from inventory
    const newInventory = [...state.inventory];
    invoice.items.forEach(invItem => {
      const target = newInventory.find(i => i.id === invItem.itemId);
      if (target) {
        target.quantity -= invItem.quantity;
      }
    });

    return {
      inventory: newInventory,
      invoices: [invoice, ...state.invoices]
    };
  }),

  processReturn: (returnRec) => set((state) => {
    const newInventory = [...state.inventory];
    
    // Add restockable items back to inventory if they are restocked
    if (returnRec.status === 'Restocked') {
      returnRec.items.forEach(retItem => {
         const target = newInventory.find(i => i.id === retItem.itemId);
         if (target) {
           target.quantity += retItem.returnQuantity;
         }
      });
    }

    return {
      inventory: newInventory,
      returns: [returnRec, ...state.returns]
    };
  })
}));
