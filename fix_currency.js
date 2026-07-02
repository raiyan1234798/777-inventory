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
    batch.update(doc(db, 'items', item.id), {
      local_currency: 'ZMW'
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
