/**
 * SKU Migration Script — Brand-Prefix SKU Assignment
 *
 * Rules:
 *  - New SKU format: {BRAND_PREFIX}-{ITEM_CODE}
 *  - BRAND_PREFIX = first letter of the brand name, uppercased
 *    e.g. "Mukango" → "M", "PANDA" → "P", "GIRAFFE" → "G"
 *  - ITEM_CODE = existing numeric/alpha part of the old SKU (stripped of any old prefix),
 *    OR a zero-padded sequential counter per brand if the old SKU has no usable number
 *  - Only updates the `sku` field — all other item fields are left exactly as-is
 *  - Skips items where the SKU already starts with the correct brand prefix + '-'
 *  - Guarantees uniqueness within the collection by tracking generated SKUs
 *
 * Usage:
 *   node scripts/migrateSKUs.mjs
 */

import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs, writeBatch, doc } from 'firebase/firestore';

// ── Firebase config (same as .env) ──────────────────────────────────────────
const firebaseConfig = {
  apiKey: "AIzaSyCCmkNhkx9FbUtV4m2IQM-LzvM0AdV4IVo",
  authDomain: "zwashdemo.firebaseapp.com",
  projectId: "zwashdemo",
  storageBucket: "zwashdemo.firebasestorage.app",
  messagingSenderId: "233891684120",
  appId: "1:233891684120:web:266e0ffcc84a164da0886d",
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

// ── Helper: extract usable numeric/alpha code from an existing SKU ───────────
function extractCode(sku) {
  if (!sku) return null;
  // Strip any leading prefix like "SKU-", "M-", "P-", etc.
  const stripped = sku.replace(/^[A-Za-z]+-/i, '').trim();
  return stripped || null;
}

// ── Helper: generate a brand-prefixed SKU ───────────────────────────────────
function makeSku(brandName, existingSku, counter) {
  const prefix = (brandName || 'X').charAt(0).toUpperCase();
  const code = extractCode(existingSku);
  // If the old SKU already has a useful code (not just random digits from auto-gen), use it
  // Otherwise fall back to zero-padded counter
  const useCode = code && !/^SKU-/i.test(existingSku) ? code : String(counter).padStart(4, '0');
  return `${prefix}-${useCode}`;
}

async function run() {
  console.log('\n🔍 Fetching brands and items from Firestore...\n');

  // Fetch all brands
  const brandsSnap = await getDocs(collection(db, 'brands'));
  const brands = {};
  brandsSnap.forEach(d => { brands[d.id] = d.data(); });
  console.log(`  ✅ ${Object.keys(brands).length} brands loaded`);

  // Fetch all items
  const itemsSnap = await getDocs(collection(db, 'items'));
  const items = [];
  itemsSnap.forEach(d => items.push(d.data()));
  console.log(`  ✅ ${items.length} items loaded\n`);

  // Track all generated SKUs to guarantee uniqueness
  const usedSkus = new Set();
  // Counters per brand prefix
  const brandCounters = {};

  // Sort items by brand then name for deterministic ordering
  items.sort((a, b) => {
    const ba = brands[a.brand_id]?.name ?? '';
    const bb = brands[b.brand_id]?.name ?? '';
    return ba.localeCompare(bb) || a.name.localeCompare(b.name);
  });

  const updates = []; // { id, oldSku, newSku }

  for (const item of items) {
    const brand = brands[item.brand_id];
    const brandName = brand?.name ?? 'Unknown';
    const prefix = brandName.charAt(0).toUpperCase();

    if (!brandCounters[prefix]) brandCounters[prefix] = 1;

    // Generate candidate SKU
    let candidate = makeSku(brandName, item.sku, brandCounters[prefix]);

    // Ensure uniqueness — increment counter if collision
    while (usedSkus.has(candidate.toUpperCase())) {
      brandCounters[prefix]++;
      candidate = `${prefix}-${String(brandCounters[prefix]).padStart(4, '0')}`;
    }

    usedSkus.add(candidate.toUpperCase());
    brandCounters[prefix]++;

    // Only mark for update if SKU is actually changing
    if (item.sku !== candidate) {
      updates.push({ id: item.id, name: item.name, brandName, oldSku: item.sku, newSku: candidate });
    }
  }

  if (updates.length === 0) {
    console.log('✅ All items already have correct brand-prefixed SKUs. Nothing to update.\n');
    process.exit(0);
  }

  console.log(`📋 ${updates.length} items need SKU updates:\n`);
  updates.forEach(u => {
    console.log(`  [${u.brandName}] ${u.name}`);
    console.log(`    ${u.oldSku || '(empty)'} → ${u.newSku}`);
  });

  console.log(`\n⏳ Writing updates to Firestore in batches...`);

  // Write in batches of 500
  for (let i = 0; i < updates.length; i += 499) {
    const chunk = updates.slice(i, i + 499);
    const batch = writeBatch(db);
    chunk.forEach(u => {
      // updateDoc equivalent via writeBatch — only updates 'sku' field
      batch.update(doc(db, 'items', u.id), { sku: u.newSku });
    });
    await batch.commit();
    console.log(`  ✅ Batch ${Math.floor(i / 499) + 1} committed (${chunk.length} items)`);
  }

  console.log(`\n🎉 Done! ${updates.length} SKUs updated successfully.\n`);
  process.exit(0);
}

run().catch(err => {
  console.error('\n❌ Migration failed:', err.message);
  process.exit(1);
});
