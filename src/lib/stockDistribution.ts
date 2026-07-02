/** Main warehouse shown first in every stock-audit / distribution list. */
export const PRIMARY_WAREHOUSE_NAME = 'TRIPLE SEVEN-MAKENI & KAVINDELE';

function normalizeLocationName(name: string): string {
  return name.trim().toLowerCase();
}

function isPrimaryWarehouse(name: string): boolean {
  return normalizeLocationName(name) === normalizeLocationName(PRIMARY_WAREHOUSE_NAME);
}

/** Sort rank: primary warehouse → other warehouses → shops. */
function locationSortRank(type: string | undefined, name: string): number {
  if (type === 'warehouse') {
    return isPrimaryWarehouse(name) ? 0 : 1;
  }
  return 2;
}

function compareLocations(
  a: { type?: string; name: string },
  b: { type?: string; name: string }
): number {
  const rankA = locationSortRank(a.type, a.name);
  const rankB = locationSortRank(b.type, b.name);
  if (rankA !== rankB) return rankA - rankB;
  return a.name.localeCompare(b.name);
}

/** Sort stock-audit rows (location + qty) for modal lists. */
export function sortStockDistribution<T extends { type: string; name: string }>(
  distributions: T[]
): T[] {
  return [...distributions].sort(compareLocations);
}

/** Sort inline location breakdown chips (name stored as `location`). */
export function sortLocationBreakdown<T extends { location?: string; type?: string }>(
  rows: T[]
): T[] {
  return [...rows].sort((a, b) =>
    compareLocations(
      { type: a.type, name: a.location ?? '' },
      { type: b.type, name: b.location ?? '' }
    )
  );
}
