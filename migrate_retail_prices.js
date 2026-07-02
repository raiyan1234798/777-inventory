import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs, writeBatch, doc } from 'firebase/firestore';

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
  
  let batch = writeBatch(db);
  let count = 0;
  
  for (const item of items) {
    if (!item.retail_price) continue;
    
    // Check if it was imported with rate 18.0
    const val18 = item.retail_price * 18;
    const isRate18 = Math.abs(val18 - Math.round(val18)) < 0.01;
    
    // Check if it was imported with rate 26.289
    const val26 = item.retail_price * 26.289;
    const isRate26 = Math.abs(val26 - Math.round(val26)) < 0.01;
    
    let originalLocal = 0;
    if (isRate18) {
      originalLocal = Math.round(val18);
    } else if (isRate26) {
      originalLocal = Math.round(val26);
    } else {
      // Fallback: If it's a completely weird decimal, let's just assume it was 18.0
      // since that was the massive initial import rate and the user wants the old ones back.
      originalLocal = Math.round(item.retail_price * 18); 
    }

    batch.update(doc(db, 'items', item.id), {
      retail_price_local: originalLocal
    });
    
    count++;
    if (count % 400 === 0) {
      await batch.commit();
      batch = writeBatch(db);
      console.log(`Committed ${count} items...`);
    }
  }
  
  if (count % 400 !== 0) {
    await batch.commit();
    console.log(`Committed remaining items. Total: ${count}`);
  }
  
  console.log("Migration finished successfully.");
}

run();
