import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs, updateDoc, doc } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: "AIzaSyCCmkNhkx9FbUtV4m2IQM-LzvM0AdV4IVo",
  authDomain: "zwashdemo.firebaseapp.com",
  projectId: "zwashdemo",
  storageBucket: "zwashdemo.firebasestorage.app",
  messagingSenderId: "233891684120",
  appId: "1:233891684120:web:266e0ffcc84a164da0886d",
  measurementId: "G-MLP7E4JGEJ"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

async function run() {
  console.log("Fetching all items from Firestore...");
  const snapshot = await getDocs(collection(db, "items"));
  const items = [];
  snapshot.forEach(d => {
    items.push({ id: d.id, ...d.data() });
  });

  console.log(`Found ${items.length} items in database.`);

  const skuMap = new Map();
  const duplicates = [];

  for (const item of items) {
    if (!item.sku) continue;
    const lowerSku = item.sku.trim().toUpperCase();
    if (!skuMap.has(lowerSku)) {
      skuMap.set(lowerSku, [item]);
    } else {
      skuMap.get(lowerSku).push(item);
    }
  }

  // Find all duplicates
  let duplicateCount = 0;
  for (const [sku, list] of skuMap.entries()) {
    if (list.length > 1) {
      console.log(`SKU "${sku}" has ${list.length} duplicates:`);
      list.forEach((item, index) => {
        console.log(`  - [${item.id}] "${item.name}"`);
        if (index > 0) {
          duplicates.push({ item, originalSku: sku, index });
          duplicateCount++;
        }
      });
    }
  }

  if (duplicates.length === 0) {
    console.log("No duplicate SKUs found. Database is clean!");
    process.exit(0);
  }

  console.log(`\nFound ${duplicateCount} duplicate SKU records to fix.`);
  
  // Track all currently used SKUs to ensure we generate completely unique names
  const allUsedSkus = new Set(items.map(it => it.sku.toUpperCase()));

  for (const entry of duplicates) {
    const { item, originalSku } = entry;
    
    let suffix = 2;
    let newSku = `${originalSku}-${suffix}`;
    while (allUsedSkus.has(newSku)) {
      suffix++;
      newSku = `${originalSku}-${suffix}`;
    }

    console.log(`Updating item "${item.name}" [${item.id}] SKU: "${item.sku}" -> "${newSku}"`);
    await updateDoc(doc(db, "items", item.id), { sku: newSku });
    allUsedSkus.add(newSku);
  }

  console.log("\nSuccess! All duplicate SKUs have been updated and resolved.");
  process.exit(0);
}

run().catch(err => {
  console.error("Migration failed:", err);
  process.exit(1);
});
