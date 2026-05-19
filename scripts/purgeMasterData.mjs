import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs, writeBatch, doc } from 'firebase/firestore';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config({ path: join(__dirname, '../.env') });

const firebaseConfig = {
  apiKey: process.env.VITE_FIREBASE_API_KEY,
  authDomain: process.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: process.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.VITE_FIREBASE_APP_ID
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

async function clearCollections(collectionNames) {
  for (const name of collectionNames) {
    console.log(`Clearing collection: ${name}...`);
    const colRef = collection(db, name);
    const snapshot = await getDocs(colRef);
    
    if (snapshot.empty) {
      console.log(`Collection ${name} is already empty.`);
      continue;
    }

    const docs = snapshot.docs;
    for (let i = 0; i < docs.length; i += 500) {
      const batch = writeBatch(db);
      const chunk = docs.slice(i, i + 500);
      chunk.forEach(d => batch.delete(d.ref));
      await batch.commit();
      console.log(`Deleted ${i + chunk.length}/${docs.length} from ${name}`);
    }
  }
}

// Collections to clear: Brands, Items, Inventory, Containers
// NOT: locations, users, transactions, sales, returns, notifications (unless user asks for history too)
// The user said: "delete the items and brands and the inventry shows 1 want to delete this also"
// and "delete the locations stocks only not the locations"
const collectionsToClear = ['brands', 'items', 'inventory', 'containers'];

clearCollections(collectionsToClear)
  .then(() => {
    console.log('✅ Success: Master data (Items, Brands, Inventory, Containers) has been cleared.');
    process.exit(0);
  })
  .catch(err => {
    console.error('❌ Error clearing data:', err);
    process.exit(1);
  });
