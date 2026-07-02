/** Lowercase + collapse whitespace for readable matching */
export function normalizeSearchText(value: string): string {
  return value.toLowerCase().replace(/\s+/g, ' ').trim();
}

/** Remove spaces/hyphens/underscores so "ccr b" matches "CCRB" */
export function compactSearchText(value: string): string {
  return value.toLowerCase().replace(/[\s\-_]+/g, '');
}

/** Match query against name, SKU, brand, etc. — case/spacing insensitive.
 *
 * Strategy (all applied, short-circuit on first match):
 *  1. Normalized full-text inclusion (e.g. "ccr b" in "ccr b uk summer …")
 *  2. Compact full-text inclusion (e.g. "ccrb" in "ccrbuksum…")
 *  3. Per-field compact match — each individual field is compacted and
 *     checked against the compact query.  This is the key fix that makes
 *     "ccr b" reliably match an item whose name is "CCR B" even when the
 *     other joined fields break the substring.
 *  4. All-token match — every space-separated token must appear somewhere.
 */
export function matchesItemSearch(
  fields: (string | undefined | null)[],
  query: string
): boolean {
  const q = normalizeSearchText(query);
  if (!q) return true;

  const parts = fields.filter(Boolean).map(String);
  const qCompact = compactSearchText(q);

  // 1. Normalized joined inclusion
  const spaced = normalizeSearchText(parts.join(' '));
  if (spaced.includes(q)) return true;

  // 2. Compact joined inclusion
  const compact = compactSearchText(parts.join(''));
  if (compact.includes(qCompact)) return true;

  // 3. Per-field compact match — most reliable for names like "CCR B"
  //    where compacting each field individually avoids boundary bleed.
  if (parts.some(p => compactSearchText(p).includes(qCompact))) return true;

  // 4. All-token match (multi-word queries)
  const tokens = q.split(' ').filter(Boolean);
  if (tokens.length > 1) {
    return tokens.every(
      token =>
        spaced.includes(token) ||
        compact.includes(compactSearchText(token)) ||
        parts.some(p => compactSearchText(p).includes(compactSearchText(token)))
    );
  }

  return false;
}
