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

async function migrateCategoryToBrand() {
  console.log('🔍 Reading all brands and items...');
  const brandsSnap = await getDocs(collection(db, 'brands'));
  const brands = [];
  brandsSnap.forEach(b => brands.push({ id: b.id, ...b.data() }));

  const itemsSnap = await getDocs(collection(db, 'items'));
  
  const toFix = [];
  itemsSnap.forEach(docSnap => {
    const data = docSnap.data();
    
    // If the item has a category but no proper brand, try matching it
    if (data.category && (data.brand_id === 'imported' || !data.brand_id)) {
      const match = brands.find(b => b.name.toLowerCase().trim() === data.category.toLowerCase().trim());
      if (match) {
        toFix.push({ id: docSnap.id, data, newBrandId: match.id });
      }
    }
  });

  if (toFix.length === 0) {
    console.log('✅ No items need brand migration. Everyone is mapped properly!');
    process.exit(0);
  }

  console.log(`⚠️  Found ${toFix.length} item(s) to map to real Brands:`);
  
  const BATCH_SIZE = 499;
  for (let i = 0; i < toFix.length; i += BATCH_SIZE) {
    const chunk = toFix.slice(i, i + BATCH_SIZE);
    const batch = writeBatch(db);
    chunk.forEach(({ id, data, newBrandId }) => {
      batch.update(doc(db, 'items', id), { brand_id: newBrandId });
    });
    await batch.commit();
    console.log(`✅ Fixed batch ${Math.floor(i / BATCH_SIZE) + 1} (${chunk.length} items)`);
  }

  console.log(`\n🎉 Done! Mapped ${toFix.length} item(s) to their respective brands.`);
  process.exit(0);
}

migrateCategoryToBrand().catch(err => {
  console.error('❌ Error:', err);
  process.exit(1);
});
