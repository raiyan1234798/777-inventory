/**
 * One-time Firestore cleanup script:
 * Reads all inventory documents and rounds any fractional
 * quantity values to the nearest whole number.
 * Run with: node scripts/fixFractionalQuantities.mjs
 */

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

async function fixFractionalQuantities() {
  console.log('🔍 Reading all inventory documents...');
  const snapshot = await getDocs(collection(db, 'inventory'));

  const toFix = [];
  snapshot.forEach(docSnap => {
    const data = docSnap.data();
    const qty = data.quantity;
    if (typeof qty === 'number' && !Number.isInteger(qty)) {
      toFix.push({ id: docSnap.id, data, roundedQty: Math.round(qty) });
    }
  });

  if (toFix.length === 0) {
    console.log('✅ No fractional quantities found. Nothing to fix!');
    process.exit(0);
  }

  console.log(`⚠️  Found ${toFix.length} document(s) with fractional quantities:`);
  toFix.forEach(({ id, data, roundedQty }) => {
    console.log(`   - ${id}: ${data.quantity} → ${roundedQty}`);
  });

  // Firestore batches support up to 500 ops
  const BATCH_SIZE = 499;
  for (let i = 0; i < toFix.length; i += BATCH_SIZE) {
    const chunk = toFix.slice(i, i + BATCH_SIZE);
    const batch = writeBatch(db);
    chunk.forEach(({ id, data, roundedQty }) => {
      batch.set(doc(db, 'inventory', id), { ...data, quantity: roundedQty });
    });
    await batch.commit();
    console.log(`✅ Fixed batch ${Math.floor(i / BATCH_SIZE) + 1} (${chunk.length} docs)`);
  }

  console.log(`\n🎉 Done! Fixed ${toFix.length} inventory document(s). All quantities are now whole numbers.`);
  process.exit(0);
}

fixFractionalQuantities().catch(err => {
  console.error('❌ Error:', err);
  process.exit(1);
});
