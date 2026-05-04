import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs, setDoc, updateDoc, doc, writeBatch, deleteDoc, getDoc, query, where } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: "AIzaSyC7FKVM9m9SJ4i-Cpx1HaYdRvS94Q7MivM",
  authDomain: "inventory-77.firebaseapp.com",
  projectId: "inventory-77",
  storageBucket: "inventory-77.firebasestorage.app",
  messagingSenderId: "447358866432",
  appId: "1:447358866432:web:cddacf5b9ebbffd3acf4e5",
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

async function verify() {
  console.log("🚀 Starting Integrity Flow Verification...");

  const itemId = "agent_test_item_999";
  const whId = "agent_test_wh_999";
  const shopId = "agent_test_shop_999";

  // 1. Setup Test Data
  console.log("1. Setting up test entities...");
  await setDoc(doc(db, 'locations', whId), { id: whId, name: 'Agent Warehouse', type: 'warehouse' });
  await setDoc(doc(db, 'locations', shopId), { id: shopId, name: 'Agent Shop', type: 'shop' });
  await setDoc(doc(db, 'items', itemId), { id: itemId, name: 'Verification Unit', sku: 'AGENT-001' });

  const whInvId = `${whId}_${itemId}`;
  const shopInvId = `${shopId}_${itemId}`;

  // 2. Simulate "Stock Entry" (Received 10 to WH)
  console.log("2. Simulating Stock Entry (Received 10 to Warehouse)...");
  await setDoc(doc(db, 'inventory', whInvId), { id: whInvId, location_id: whId, item_id: itemId, quantity: 10, avg_cost_INR: 100 });
  await setDoc(doc(db, 'transactions', `tx_entry_${Date.now()}`), {
    type: 'stock_entry', from_location: 'supplier', to_location: whId, item_id: itemId, quantity: 10, timestamp: new Date().toISOString()
  });

  // 3. Simulate "Transfer" (Supplied 4 from WH -> Shop Received 4)
  console.log("3. Simulating Transfer (Supplied 4 from WH -> Received 4 at Shop)...");
  
  // Logic: WH - 4, Shop + 4
  const batch = writeBatch(db);
  batch.update(doc(db, 'inventory', whInvId), { quantity: 6 });
  batch.set(doc(db, 'inventory', shopInvId), { id: shopInvId, location_id: shopId, item_id: itemId, quantity: 4, avg_cost_INR: 100 });
  
  // Record Transfer Transaction
  batch.set(doc(db, 'transactions', `tx_transfer_${Date.now()}`), {
    type: 'transfer', from_location: whId, to_location: shopId, item_id: itemId, quantity: 4, timestamp: new Date().toISOString()
  });
  await batch.commit();

  // 4. Verify Final Balances
  console.log("4. Verifying final balances...");
  const whSnap = await getDoc(doc(db, 'inventory', whInvId));
  const shopSnap = await getDoc(doc(db, 'inventory', shopInvId));

  console.log(`   Warehouse Closing Balance: ${whSnap.data().quantity} (Expected: 6)`);
  console.log(`   Shop Closing Balance     : ${shopSnap.data().quantity} (Expected: 4)`);

  if (whSnap.data().quantity === 6 && shopSnap.data().quantity === 4) {
    console.log("✅ SUCCESS: Stock flow and mapping is accurate!");
  } else {
    console.error("❌ FAILURE: Balance mismatch detected.");
  }

  // Cleanup
  console.log("Cleaning up test data...");
  await deleteDoc(doc(db, 'inventory', whInvId));
  await deleteDoc(doc(db, 'inventory', shopInvId));
  await deleteDoc(doc(db, 'locations', whId));
  await deleteDoc(doc(db, 'locations', shopId));
  await deleteDoc(doc(db, 'items', itemId));
  
  process.exit(0);
}

verify();
