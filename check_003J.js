import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: "AIzaSyB33KC6pcPfzKz2MEPDQ6aNBu8T0lU8Y98",
  authDomain: "inventory-1390b.firebaseapp.com",
  projectId: "inventory-1390b",
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

async function run() {
  const snapshot = await getDocs(collection(db, 'items'));
  const items = snapshot.docs.map(d => ({id: d.id, ...d.data()}));
  
  const testItems = items.filter(i => i.name.includes('99N') || i.sku?.includes('003J') || i.name.includes('003J') || i.sku?.includes('99N'));
  console.log(testItems.map(i => ({ name: i.name, sku: i.sku, retail_price: i.retail_price, retail_price_local: i.retail_price_local, local_currency: i.local_currency })));
}

run();
