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

async function test() {
  const brandsSnap = await getDocs(collection(db, 'brands'));
  const brands = [];
  brandsSnap.forEach(b => {
    brands.push({ id: b.id, name: b.data().name });
    console.log("BRAND IN DB: ", b.data().name);
  });

  const itemsSnap = await getDocs(collection(db, 'items'));
  const categories = new Set();
  
  itemsSnap.forEach(docSnap => {
    categories.add(docSnap.data().category);
  });

  console.log('Categories present:', [...categories]);
  process.exit(0);
}

test();
