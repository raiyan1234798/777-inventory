import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs, writeBatch, doc } from 'firebase/firestore';

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

async function wipeGhosts() {
  console.log('Fetching active inventory...');
  const invSnap = await getDocs(collection(db, 'inventory'));
  const activeIds = new Set();
  invSnap.forEach(snap => activeIds.add(snap.id));

  const allDocsToDelete = [];
  
  // 1. Transactions
  const txSnap = await getDocs(collection(db, 'transactions'));
  txSnap.forEach(snap => {
    const data = snap.data();
    const isGhostFrom = data.from_location !== 'supplier' && data.from_location !== 'customer' && !activeIds.has(`${data.from_location}_${data.item_id}`);
    const isGhostTo = data.to_location !== 'customer' && data.to_location !== 'supplier' && !activeIds.has(`${data.to_location}_${data.item_id}`);
    
    // In our system, if it's orphan, we delete it to clean the slate.
    // If it's a transfer and ONE side is dead, effectively the whole transaction should be killed based on user's hard delete
    if (isGhostFrom || isGhostTo) allDocsToDelete.push(doc(db, 'transactions', snap.id));
  });

  // 2. Sales
  const salesSnap = await getDocs(collection(db, 'sales'));
  salesSnap.forEach(snap => {
    const data = snap.data();
    if (!activeIds.has(`${data.location_id}_${data.item_id}`)) allDocsToDelete.push(doc(db, 'sales', snap.id));
  });

  // 3. Returns
  const returnsSnap = await getDocs(collection(db, 'returns'));
  returnsSnap.forEach(snap => {
    const data = snap.data();
    if (!activeIds.has(`${data.location_id}_${data.item_id}`)) allDocsToDelete.push(doc(db, 'returns', snap.id));
  });

  if (allDocsToDelete.length === 0) {
    console.log("No ghost records to delete!");
    process.exit(0);
  }

  console.log(`Deleting ${allDocsToDelete.length} ghost records...`);

  // Batch delete
  for (let i = 0; i < allDocsToDelete.length; i += 500) {
    const batch = writeBatch(db);
    allDocsToDelete.slice(i, i + 500).forEach(d => batch.delete(d));
    await batch.commit();
  }
  
  console.log("Done wiping ghost history!");
  process.exit(0);
}

wipeGhosts();
