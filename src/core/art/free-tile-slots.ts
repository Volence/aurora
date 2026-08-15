// How many tile slots this zone's pool has spare — the number BlockTab and
// ChunkTab each computed inline, and the number the origination canvas's budget
// readout needs as its denominator. One copy, in core, where the suite can
// reach it: inside a useMemo in a .tsx it was two identical loops that no test
// could execute, and the canvas would have made a third.
//
// APPROXIMATE, FOR DISPLAY ONLY. It mirrors `findFreeSlot`'s three conditions
// (classic-surface-plan.ts: unreferenced, not object-reserved, editable)
// without importing it — that function is a private implementation detail of
// the planner, not an exported predicate — so this can only ever be off by the
// handful of slots a single in-flight gesture claims, never wrong about what an
// edit is ALLOWED to do: `planSurfaceEdit` remains the sole authority for that,
// every time.

/** The one thing this needs from a UsageIndex, named so a caller can pass the
 *  real index and a test can pass four lines. */
export interface TileUsageLookup { tileUsage(t: number): { cells: number } }

export function countFreeTileSlots(input: {
  poolTileCount: number;
  usage: TileUsageLookup;
  /** Tiles this act's objects draw through mappings. Null when unknown. */
  reserved: ReadonlySet<number> | null;
  isEditable: (t: number) => boolean;
}): number {
  const { poolTileCount, usage, reserved, isEditable } = input;
  let n = 0;
  // Tile 0 is the transparent tile — never counted free, at any pool size.
  for (let t = 1; t < poolTileCount; t++) {
    if (usage.tileUsage(t).cells !== 0) continue;
    if (reserved?.has(t)) continue;
    if (!isEditable(t)) continue;
    n++;
  }
  return n;
}
