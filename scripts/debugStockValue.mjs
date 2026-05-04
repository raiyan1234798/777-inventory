import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs, limit, query } from 'firebase/firestore';

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

async function debug() {
  console.log("Fetching first 5 inventory records...");
  const q = query(collection(db, 'inventory'), limit(5));
  const snap = await getDocs(q);
  snap.forEach(d => {
    console.log(`Inventory ID: ${d.id}`, d.data());
  });
  process.exit(0);
}

debug();
