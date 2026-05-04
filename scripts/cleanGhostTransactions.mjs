/**
 * cleanGhostTransactions.mjs
 * Removes fake supply/return/received/opening records that were injected 
 * by the hasLedger import code path in Warehouse.tsx.
 *
 * Only deletes documents with notes matching one of the injected labels:
 *   - 'Imported Opening Balance'
 *   - 'Imported Received'
 *   - 'Imported Supplied'
 *   - 'Imported Return'
 *
 * Usage: node scripts/cleanGhostTransactions.mjs
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

const GHOST_NOTES = new Set([
  'Imported Opening Balance',
  'Imported Received',
  'Imported Supplied',
  'Imported Return',
]);

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

async function deleteGhostDocs(collectionName) {
  const colRef = collection(db, collectionName);
  const snapshot = await getDocs(colRef);

  if (snapshot.empty) {
    console.log(`  ✓ ${collectionName}: empty — skipped`);
    return 0;
  }

  const ghostDocs = snapshot.docs.filter(d => GHOST_NOTES.has(d.data().notes));

  if (ghostDocs.length === 0) {
    console.log(`  ✓ ${collectionName}: no ghost records found`);
    return 0;
  }

  const BATCH_SIZE = 400;
  let deleted = 0;

  for (let i = 0; i < ghostDocs.length; i += BATCH_SIZE) {
    const batch = writeBatch(db);
    const chunk = ghostDocs.slice(i, i + BATCH_SIZE);
    chunk.forEach(d => batch.delete(doc(db, collectionName, d.id)));
    await batch.commit();
    deleted += chunk.length;
    console.log(`  ↳ deleted ${deleted}/${ghostDocs.length} ghost records from ${collectionName}...`);
  }

  console.log(`  ✓ ${collectionName}: removed ${deleted} ghost documents`);
  return deleted;
}

async function main() {
  console.log('\n🧹  777 Inventory — Clean Ghost Import Transactions');
  console.log('═══════════════════════════════════════════════════');
  console.log('Project: inventory-77.firebaseapp.com');
  console.log('Targeting notes: "Imported Opening Balance", "Imported Received",');
  console.log('                 "Imported Supplied", "Imported Return"');
  console.log('');

  let total = 0;

  // Clean fake "Imported Opening Balance" and "Imported Received" from transactions
  process.stdout.write('Scanning transactions...\n');
  total += await deleteGhostDocs('transactions');

  // Clean fake "Imported Supplied" from sales
  process.stdout.write('Scanning sales...\n');
  total += await deleteGhostDocs('sales');

  // Clean fake "Imported Return" from returns
  process.stdout.write('Scanning returns...\n');
  total += await deleteGhostDocs('returns');

  console.log('');
  console.log(`✅ Done! Total ghost documents removed: ${total}`);
  console.log('');
  console.log('ℹ️  All real transactions, sales, and returns are untouched.');
  console.log('   Stock quantities in inventory collection are also unchanged.');
  console.log('   Re-import your Excel files to set closing balances correctly.');
  console.log('');
  process.exit(0);
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
