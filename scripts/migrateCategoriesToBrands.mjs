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

async function migrateExistingCategoriesToBrands() {
  const itemsSnap = await getDocs(collection(db, 'items'));
  
  // 1. Collect all unique categories
  const categories = new Set();
  const items = [];
  itemsSnap.forEach(snap => {
    const data = snap.data();
    items.push({ id: snap.id, ...data });
    if (data.category && data.category.trim() !== '') {
      categories.add(data.category.trim().toUpperCase());
    }
  });

  if (categories.size === 0) {
    console.log("No categories found to migrate!");
    process.exit(0);
  }

  // 2. Fetch existing brands to avoid duplicates
  const brandsSnap = await getDocs(collection(db, 'brands'));
  const brands = new Map(); // Name -> ID
  brandsSnap.forEach(b => {
      brands.set(b.data().name.toUpperCase().trim(), b.id);
  });

  // 3. Create missing brands
  const brandBatch = writeBatch(db);
  let newBrandsCount = 0;
  for (const cat of categories) {
    if (!brands.has(cat)) {
      const bRef = doc(collection(db, 'brands'));
      brandBatch.set(bRef, { id: bRef.id, name: cat, description: 'Auto-migrated brand' });
      brands.set(cat, bRef.id);
      newBrandsCount++;
    }
  }

  if (newBrandsCount > 0) {
    console.log(`Creating ${newBrandsCount} missing brands...`);
    await brandBatch.commit();
  } else {
    console.log("Brand names already exist.");
  }

  // 4. Update items' brand_id
  const itemBatch = writeBatch(db);
  let updatedCount = 0;
  items.forEach(item => {
    if (item.category) {
      const matchName = item.category.trim().toUpperCase();
      const bId = brands.get(matchName);
      if (bId && item.brand_id !== bId) {
         itemBatch.update(doc(db, 'items', item.id), { brand_id: bId });
         updatedCount++;
      }
      // Set to 'unbranded' if it has no category, but since we are looping `if(item.category)` we don't need to
    }
  });

  if (updatedCount > 0) {
    console.log(`Updating ${updatedCount} items with correct brand_id...`);
    await itemBatch.commit();
  }

  console.log("✅ Database migration complete!");
  process.exit();
}

migrateExistingCategoriesToBrands();
