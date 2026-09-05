// The ONE answer to "may this tile-pool index be edited?", and the ONE wording
// of why not.
//
// WHY THIS EXISTS: the rule lived twice — once in the composer dock's UI
// (components/classic/composer-shared.tsx `tileLockReason`, which decides the 🔒
// badge, the red banner and whether the pencil responds at all) and once in the
// command (state/classicLevelStore.ts `classicEditTiles`, which rejects the
// commit). Two copies of a predicate that gates a destructive edit is exactly the
// pair you never want to drift: if the UI thought a tile editable and the command
// did not, the pencil would look live and produce nothing.
//
// It also puts the predicate somewhere the node-only test suite can actually
// reach. composer-shared is `.tsx`, which vitest does not collect, so the UI copy
// was untestable by construction.
//
// The rule itself (see EditableTileRange in ./adapter):
//  • [0, baseTileCount) come from a pristine source art file → writable
//  • >= baseTileCount are gap/appended tiles → not writable in v1
//  • anything inside an animRanges span is an animated-art overlay → not writable
// A null range means "unknown" (the act was never read, or a test fake omits the
// query) and is deliberately permissive: the pool-size bound still applies at the
// command, and refusing every edit on missing bookkeeping would be worse.

import type { EditableTileRange } from './adapter';

/**
 * Why `tileIndex` cannot be edited, or null when it can. The string is
 * user-facing (the composer's lock banner shows it verbatim, and the command
 * returns it prefixed by the tile id).
 */
export function tileLockReason(
  range: EditableTileRange | null,
  tileIndex: number,
): string | null {
  if (!range) return null;
  if (tileIndex >= range.baseTileCount) return 'gap/appended tile, not editable in v1';
  if (range.animRanges.some((r) => tileIndex >= r.start && tileIndex < r.start + r.count)) {
    return 'animated-art slot, not editable in v1';
  }
  return null;
}

/** Convenience predicate over {@link tileLockReason}. */
export function isTileEditable(range: EditableTileRange | null, tileIndex: number): boolean {
  return tileLockReason(range, tileIndex) === null;
}

/**
 * The animated-art overlay slots as a set, expanded from `animRanges`.
 *
 * `isTileEditable` already refuses to WRITE these, so this is not a second copy
 * of that rule — it answers a different question that only 2C's commit asks:
 * may new art be REPOINTED at this slot? Matching a pool tile writes nothing, so
 * the editable predicate never fires, and level art bound to an overlay slot
 * would animate in game. Derived from the same `animRanges` rather than from a
 * separate table, so the two can never disagree about which slots those are.
 *
 * An unknown range yields the empty set, matching the permissive null
 * convention — the caller decides whether unknown is safe (2C refuses to
 * reclaim under it; see the commit planner).
 */
export function animatedTileSet(range: EditableTileRange | null): Set<number> {
  const out = new Set<number>();
  if (!range) return out;
  for (const r of range.animRanges) {
    for (let t = r.start; t < r.start + r.count; t++) out.add(t);
  }
  return out;
}
