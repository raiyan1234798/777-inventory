import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs, doc, setDoc } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: "AIzaSyB33KC6pcPfzKz2MEPDQ6aNBu8T0lU8Y98",
  authDomain: "inventory-1390b.firebaseapp.com",
  projectId: "inventory-1390b",
  storageBucket: "inventory-1390b.firebasestorage.app",
  messagingSenderId: "287931209007",
  appId: "1:287931209007:web:40d892b6840d8a6fdbbdda",
  measurementId: "G-NN01FJM2QY"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

async function run() {
  console.log("Fetching items from REAL database...");
  const itemsSnap = await getDocs(collection(db, 'items'));
  
  let premiumId = null;
  let superId = null;

  itemsSnap.forEach(doc => {
    const data = doc.data();
    if (data.name === 'MEN JEANS (PREMIUM) 100PCS') premiumId = doc.id;
    if (data.name === 'MEN JEANS (SUPER) 100PCS') superId = doc.id;
  });

  console.log("Premium ID:", premiumId);
  console.log("Super ID:", superId);

  // ZAAKI SHOP-3 ID
  const locSnap = await getDocs(collection(db, 'locations'));
  let zaakiId = null;
  locSnap.forEach(doc => {
    if (doc.data().name === 'ZAAKI SHOP-3') zaakiId = doc.id;
  });

  console.log("ZAAKI SHOP-3 ID:", zaakiId);

  if (premiumId && zaakiId) {
    const invId = `${zaakiId}_${premiumId}`;
    console.log("Fixing Premium:", invId);
    await setDoc(doc(db, 'inventory', invId), {
      id: invId,
      item_id: premiumId,
      location_id: zaakiId,
      quantity: 1,
      received_balance: 1,
      supplied_balance: 0,
      returned_balance: 0,
      opening_balance: 0,
      avg_cost_USD: 0,
      avg_cost_local: 0,
      last_rollover_date: new Date().toISOString().split('T')[0]
    }, { merge: true });
    console.log("Premium fixed.");
  }

  if (superId && zaakiId) {
    const invId = `${zaakiId}_${superId}`;
    console.log("Fixing Super:", invId);
    await setDoc(doc(db, 'inventory', invId), {
      id: invId,
      item_id: superId,
      location_id: zaakiId,
      quantity: 8,
      received_balance: 8,
      supplied_balance: 0,
      returned_balance: 0,
      opening_balance: 0,
      avg_cost_USD: 0,
      avg_cost_local: 0,
      last_rollover_date: new Date().toISOString().split('T')[0]
    }, { merge: true });
    console.log("Super fixed.");
  }
  
  console.log("Done!");
  process.exit(0);
}

run().catch(console.error);
