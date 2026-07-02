import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs, setDoc, doc, deleteDoc, writeBatch } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: "AIzaSyB33KC6pcPfzKz2MEPDQ6aNBu8T0lU8Y98",
  authDomain: "inventory-1390b.firebaseapp.com",
  projectId: "inventory-1390b",
  storageBucket: "inventory-1390b.firebasestorage.app",
  messagingSenderId: "287931209007",
  appId: "1:287931209007:web:40d892b6840d8a6fdbbdda",
};

const app = initializeApp(firebaseConfig);
const db  = getFirestore(app);

async function run() {
  console.log("Fetching items...");
  const itemsSnap = await getDocs(collection(db, 'items'));
  const items = itemsSnap.docs.map(d => ({ ...d.data(), _id: d.id }));
  
  // Group by exact name (case-insensitive) and brand_id
  const groups = new Map();
  for (const item of items) {
    const key = `${(item.name || '').toLowerCase().trim()}_${item.brand_id}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(item);
  }

  const duplicatesToMerge = Array.from(groups.values()).filter(g => g.length > 1);
  console.log(`Found ${duplicatesToMerge.length} duplicate groups.`);

  if (duplicatesToMerge.length === 0) {
    console.log("No duplicates found. Exiting.");
    process.exit(0);
  }

  // Fetch all inventory and transactions
  console.log("Fetching inventory...");
  const inventorySnap = await getDocs(collection(db, 'inventory'));
  const inventory = inventorySnap.docs.map(d => ({ ...d.data(), _docId: d.id }));

  console.log("Fetching transactions...");
  const txSnap = await getDocs(collection(db, 'transactions'));
  const transactions = txSnap.docs.map(d => ({ ...d.data(), _docId: d.id }));

  let deletedItemsCount = 0;
  
  // We will run the operations in batches.
  let ops = [];

  for (const group of duplicatesToMerge) {
    // Pick the first item as the "primary" one to keep
    const primary = group[0];
    const duplicates = group.slice(1);
    
    console.log(`\nMerging ${duplicates.length} duplicates into primary item: ${primary.name} (${primary.id})`);

    for (const dup of duplicates) {
      // Find all inventory entries for the duplicate item
      const duplicateInventory = inventory.filter(inv => inv.item_id === dup.id);
      
      for (const dupInv of duplicateInventory) {
        // Find if primary already has an inventory entry in this location
        const primaryInvId = `${dupInv.location_id.replace(/\//g, '-')}_${primary.id.replace(/\//g, '-')}`;
        const primaryInv = inventory.find(inv => inv.id === primaryInvId || inv.item_id === primary.id && inv.location_id === dupInv.location_id);
        
        let newQty = dupInv.quantity;
        let newOpening = dupInv.opening_balance || 0;
        let newReceived = dupInv.received_balance || 0;
        let newSupplied = dupInv.supplied_balance || 0;
        
        if (primaryInv) {
          newQty += (primaryInv.quantity || 0);
          newOpening += (primaryInv.opening_balance || 0);
          newReceived += (primaryInv.received_balance || 0);
          newSupplied += (primaryInv.supplied_balance || 0);
          
          ops.push(setDoc(doc(db, 'inventory', primaryInv._docId || primaryInv.id), {
            quantity: newQty,
            opening_balance: newOpening,
            received_balance: newReceived,
            supplied_balance: newSupplied
          }, { merge: true }));
        } else {
          // Move the inventory record to primary
          ops.push(setDoc(doc(db, 'inventory', primaryInvId), {
            ...dupInv,
            id: primaryInvId,
            item_id: primary.id
          }));
        }
        
        // Delete old inventory record
        ops.push(deleteDoc(doc(db, 'inventory', dupInv._docId || dupInv.id)));
      }

      // Reassign transactions
      const dupTransactions = transactions.filter(tx => tx.item_id === dup.id);
      for (const tx of dupTransactions) {
        ops.push(setDoc(doc(db, 'transactions', tx._docId || tx.id), {
          item_id: primary.id
        }, { merge: true }));
      }
      
      // Delete the duplicate item
      ops.push(deleteDoc(doc(db, 'items', dup._id || dup.id)));
      deletedItemsCount++;
    }
  }

  console.log(`\nExecuting ${ops.length} operations...`);
  // Since some operations might exceed batch limits, we just await them sequentially (or Promise.all with chunks)
  const CHUNK_SIZE = 50;
  for (let i = 0; i < ops.length; i += CHUNK_SIZE) {
    await Promise.all(ops.slice(i, i + CHUNK_SIZE));
    console.log(`Progress: ${Math.min(i + CHUNK_SIZE, ops.length)} / ${ops.length}`);
  }

  console.log(`\n✅ Finished cleaning up ${deletedItemsCount} duplicate items.`);
  process.exit(0);
}

run().catch(console.error);
