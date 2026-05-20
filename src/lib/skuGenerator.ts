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
  const bp = brandPrefix(brandName || 'XX');
  const cleanOverride = codeOverride ? codeOverride.trim().toUpperCase() : '';

  let base = '';
  if (cleanOverride) {
    // Normalize cleanOverride (remove leading/trailing spaces, replace duplicate separators if any)
    const upperOverride = cleanOverride;
    // Check if cleanOverride already starts with bp (e.g. "CP-LCB" starts with "CP")
    // To be safe, we can match: bp followed by non-alphanumeric, or equal to bp, or just startsWith
    const startsWithBp = upperOverride.startsWith(bp);
    if (startsWithBp) {
      base = upperOverride;
    } else {
      // Prepend brand prefix
      base = `${bp}-${upperOverride}`;
    }
  } else {
    const ic = itemCode(itemName || 'XX');
    base = `${bp}-${ic}`;
  }

  // Final sanitization of double hyphens or spacing
  base = base.replace(/-+/g, '-').trim();

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
 * Get canonical SKU form.
 */
export function canonicalSKU(brandName: string, itemName: string, codeOverride?: string): string {
  const bp = brandPrefix(brandName || 'XX');
  const cleanOverride = codeOverride ? codeOverride.trim().toUpperCase() : '';

  if (cleanOverride) {
    if (cleanOverride.startsWith(bp)) return cleanOverride;
    return `${bp}-${cleanOverride}`.replace(/-+/g, '-');
  }

  const ic = itemCode(itemName || 'XX');
  return `${bp}-${ic}`.replace(/-+/g, '-');
}
