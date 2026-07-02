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
  
  console.log(items.slice(0, 10).map(i => ({ name: i.name, retail_price: i.retail_price })));

  const ratesSnap = await getDocs(collection(db, 'settings'));
  let currentRate = 26.289;
  ratesSnap.docs.forEach(d => {
    if (d.id === 'exchange_rates') {
       console.log("Current rates:", d.data());
       currentRate = d.data().ZMW;
    }
  });

  // Calculate the local retail price for these items using current rate
  console.log("With current rate:");
  items.slice(0, 10).forEach(i => {
     console.log(`${i.name}: ${i.retail_price} USD -> ${i.retail_price * currentRate} ZMW`);
  });
}

run();
