import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs } from 'firebase/firestore';

const app = initializeApp({
  apiKey: "AIzaSyB33KC6pcPfzKz2MEPDQ6aNBu8T0lU8Y98",
  authDomain: "inventory-1390b.firebaseapp.com",
  projectId: "inventory-1390b",
});
const db = getFirestore(app);

async function run() {
  const snap = await getDocs(collection(db, 'items'));
  const docs = snap.docs.map(d => d.data());
  const j003 = docs.filter(d => d.sku && d.sku.includes('003J'));
  console.log(j003);
  process.exit(0);
}
run();
