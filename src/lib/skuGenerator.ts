/**
 * generateBrandSKU
 *
 * Produces a unique SKU based on brand name + item name (with optional code override).
 *
 * Format: {BRAND_PREFIX}-{ITEM_CODE}
 *
 * Brand Prefix is the first letter of each word in the brand name:
 *   "Zomba"         → "Z"
 *   "Mukango"       → "M"
 *   "Chinese Panda" → "CP"
 *
 * If a code override (like "LCB", "BAGS", or "22") is provided, we format it as {BRAND_PREFIX}-{CODE}.
 * If the code override already starts with the brand prefix, we preserve it.
 *
 * Collision Handling:
 * If the SKU already exists, we append "-2", "-3", etc.
 */

/** Get brand prefix by taking the first letter of each word in the brand name */
export function brandPrefix(brandName: string): string {
  const cleaned = (brandName || '')
    .replace(/[-_/]/g, ' ')
    .toUpperCase()
    .replace(/[^A-Z0-9\s]/g, '')
    .trim();

  const words = cleaned.split(/\s+/).filter(Boolean);

  if (words.length === 0) return 'XX';

  return words
    .map(w => w[0])
    .join('');
}

/** Get initials/code from item name */
export function itemCode(itemName: string): string {
  const cleaned = (itemName || '')
    .replace(/[-_/]/g, ' ')
    .toUpperCase()
    .replace(/[^A-Z0-9\s]/g, '')
    .trim();

  const words = cleaned.split(/\s+/).filter(Boolean);

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
 * @param codeOverride - Optional existing SKU/code (e.g. "LCB" or "BAGS" or "22")
 * @returns          - Unique SKU string (e.g. "CP-LCB")
 */
export function generateBrandSKU(
  brandName: string,
  itemName: string,
  existingSkus: Set<string> = new Set(),
  codeOverride?: string
): string {
  const cleanOverride = codeOverride ? codeOverride.trim().toUpperCase() : '';

  let base = '';
  if (cleanOverride) {
    base = cleanOverride;
  } else {
    // Generate SKU base from item name instead of prepending brand
    const ic = itemCode(itemName || 'XX');
    base = ic;
  }

  // Final sanitization of double hyphens or spacing
  base = base.replace(/-+/g, '-').trim();

  return base;
}

/**
 * Find which column to use as the SKU source from an (upper-cased) header row.
 *
 * Prefers a dedicated "SKU" column (which holds the lengthy descriptive name)
 * and only falls back to a "CODE" column when no SKU column exists.
 *
 * @returns the column index, or -1 when neither is present.
 */
export function findSkuColumn(headerRowUpper: string[]): number {
  let idx = headerRowUpper.findIndex(c => c.includes('SKU'));
  if (idx === -1) idx = headerRowUpper.findIndex(c => c.includes('CODE'));
  return idx;
}

/**
 * Resolve the final SKU for an imported row.
 *
 * The SKU from the file is used verbatim (never abbreviated or altered). Only
 * rows without any SKU value fall back to using the item name as the SKU.
 */
export function resolveImportSku(skuValue: string | undefined | null, itemName: string): string {
  const v = (skuValue ?? '').trim();
  return v ? v : (itemName ?? '').trim();
}

export function canonicalSKU(brandName: string, itemName: string, codeOverride?: string): string {
  const cleanOverride = codeOverride ? codeOverride.trim().toUpperCase() : '';

  if (cleanOverride) {
    return cleanOverride.replace(/-+/g, '-');
  }

  const ic = itemCode(itemName || 'XX');
  return ic.replace(/-+/g, '-');
}
