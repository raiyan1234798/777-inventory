/**
 * generateBrandSKU
 *
 * Produces a unique SKU based on brand name + item name.
 *
 * Format: {BRAND_PREFIX}-{ITEM_INITIALS}[-{SEQ}]
 *
 * Examples:
 *   "Chinese Panda" + "Leather Jacket"  → "CP-LJ"
 *   "Chinese Panda" + "Men Jeans Pant"  → "CP-MJP"
 *   "Nike"          + "Air Max 90"       → "NK-AM9"
 *   "Adidas"        + "Ultra Boost"      → "AD-UB"
 *
 * If the generated SKU already exists in existingSkus, a numeric suffix is appended:
 *   "CP-LJ", "CP-LJ-2", "CP-LJ-3", …
 */

/** Get 2-3 letter brand prefix from brand name */
export function brandPrefix(brandName: string): string {
  const words = brandName
    .toUpperCase()
    .replace(/[^A-Z0-9\s]/g, '')
    .split(/\s+/)
    .filter(Boolean);

  if (words.length === 0) return 'XX';

  if (words.length === 1) {
    // Single word: take first 2 chars
    return words[0].slice(0, 2);
  }

  // Multiple words: take first letter of each word, max 3
  return words
    .slice(0, 3)
    .map(w => w[0])
    .join('');
}

/** Get 2-4 letter item code from item name */
export function itemCode(itemName: string): string {
  const words = itemName
    .toUpperCase()
    .replace(/[^A-Z0-9\s]/g, '')
    .split(/\s+/)
    .filter(Boolean);

  if (words.length === 0) return 'XX';

  if (words.length === 1) {
    // Single word: take first 3 chars
    return words[0].slice(0, 3);
  }

  // Multiple words: first letter of each word, max 4
  return words
    .slice(0, 4)
    .map(w => w[0])
    .join('');
}

/**
 * Generate a brand-based SKU.
 * @param brandName  - The brand name (e.g. "Chinese Panda")
 * @param itemName   - The item name (e.g. "Leather Jacket")
 * @param existingSkus - Set of already-used SKUs (to avoid collisions)
 * @returns          - Unique SKU string (e.g. "CP-LJ")
 */
export function generateBrandSKU(
  brandName: string,
  itemName: string,
  existingSkus: Set<string> = new Set()
): string {
  const bp = brandPrefix(brandName || 'XX');
  const ic = itemCode(itemName || 'XX');
  const base = `${bp}-${ic}`;

  if (!existingSkus.has(base)) return base;

  // Append incrementing suffix to avoid collision
  let seq = 2;
  while (existingSkus.has(`${base}-${seq}`)) {
    seq++;
    if (seq > 9999) break; // safety valve
  }
  return `${base}-${seq}`;
}

/**
 * Regenerate a SKU for an item without collision checking.
 * Use when you just want the canonical form (not guaranteed unique).
 */
export function canonicalSKU(brandName: string, itemName: string): string {
  const bp = brandPrefix(brandName || 'XX');
  const ic = itemCode(itemName || 'XX');
  return `${bp}-${ic}`;
}
