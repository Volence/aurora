/**
 * Group a per-frame flat list of source art-tile indices into DPLC entries:
 * maximal runs of consecutive ascending tiles, each capped at `maxRun` tiles
 * (the count nibble is 4 bits, so a single entry loads at most 16 tiles).
 * This is the inverse of expanding `{start,count}` entries back to a flat list,
 * shared by every Sonic-format DPLC writer.
 */
export interface DplcRun { start: number; count: number; }

export function groupDPLCRuns(tiles: number[], maxRun = 16): DplcRun[] {
  const runs: DplcRun[] = [];
  for (const t of tiles) {
    const last = runs[runs.length - 1];
    if (last && t === last.start + last.count && last.count < maxRun) {
      last.count++;
    } else {
      runs.push({ start: t, count: 1 });
    }
  }
  return runs;
}
