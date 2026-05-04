/**
 * clearAllData.mjs
 * Clears ALL test data from Firestore for the 777 Inventory project.
 * Preserves: nothing — full clean slate for production use.
 *
 * Usage: node scripts/clearAllData.mjs
 *
 * Requires: npm install firebase (already installed in the project)
 */

import { initializeApp } from 'firebase/app';
import {
  getFirestore,
  collection,
  getDocs,
  writeBatch,
  doc,
} from 'firebase/firestore';

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

// All collections to wipe — leave 'users' so admins can still log in
const COLLECTIONS_TO_CLEAR = [
  'inventory',
  'transactions',
  'sales',
  'returns',
  'notifications',
  'expenses',
  'targets',
  'containers',
  'locations',
  'brands',
  'items',
];

async function deleteCollection(collectionName) {
  const colRef = collection(db, collectionName);
  const snapshot = await getDocs(colRef);

  if (snapshot.empty) {
    console.log(`  ✓ ${collectionName}: already empty`);
    return 0;
  }

  // Firestore batch max = 500 ops
  const BATCH_SIZE = 400;
  const docs = snapshot.docs;
  let deleted = 0;

  for (let i = 0; i < docs.length; i += BATCH_SIZE) {
    const batch = writeBatch(db);
    const chunk = docs.slice(i, i + BATCH_SIZE);
    chunk.forEach(d => batch.delete(doc(db, collectionName, d.id)));
    await batch.commit();
    deleted += chunk.length;
    console.log(`  ↳ deleted ${deleted}/${docs.length} from ${collectionName}...`);
  }

  console.log(`  ✓ ${collectionName}: cleared ${deleted} documents`);
  return deleted;
}

async function main() {
  console.log('\n🗑️  777 Inventory — Clear All Test Data');
  console.log('═══════════════════════════════════════');
  console.log('Project: inventory-77.firebaseapp.com');
  console.log('');

  let totalDeleted = 0;

  for (const col of COLLECTIONS_TO_CLEAR) {
    process.stdout.write(`Clearing ${col}...\n`);
    try {
      const count = await deleteCollection(col);
      totalDeleted += count;
    } catch (err) {
      console.error(`  ✗ Error clearing ${col}:`, err.message);
    }
  }

  console.log('');
  console.log(`✅ Done! Total documents deleted: ${totalDeleted}`);
  console.log('');
  console.log('ℹ️  Note: User accounts in Firebase Auth are NOT affected.');
  console.log('   The "users" Firestore collection was also preserved.');
  console.log('   You can now set up fresh shops, warehouses, and inventory.');
  console.log('');
  process.exit(0);
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
