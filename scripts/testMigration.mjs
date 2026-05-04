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
  brandsSnap.forEach(b => brands.push({ id: b.id, name: b.data().name }));

  const itemsSnap = await getDocs(collection(db, 'items'));
  
  const toFix = [];
  let noMatch = [];
  
  itemsSnap.forEach(docSnap => {
    const data = docSnap.data();
    if (data.category) {
      const match = brands.find(b => b.name.toLowerCase().trim() === data.category.toLowerCase().trim());
      if (match) {
        // If it matches a brand name, BUT its current brand_id doesn't match that brand...
        if (data.brand_id !== match.id) {
          toFix.push({ id: docSnap.id, item: data.name, currentBrand: data.brand_id, newBrand: match, category: data.category });
        }
      } else {
         noMatch.push(data.category);
      }
    }
  });

  console.log('To fix:', toFix.slice(0, 5), 'Total:', toFix.length);
  // console.log('No match categories:', [...new Set(noMatch)]);
  process.exit(0);
}

test();
