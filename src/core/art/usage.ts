import type { Act } from '../model/s4-types';
import { unpackNametableWord } from '../model/s4-types';

/** Map usage count per tile index across all sections of an act. */
export function tileUsageCounts(act: Act): Map<number, number> {
  const counts = new Map<number, number>();
  for (const section of act.sections) {
    if (!section) continue;
    const nt = section.tileGrid.nametable;
    for (let i = 0; i < nt.length; i++) {
      if (nt[i] === 0) continue;
      const idx = unpackNametableWord(nt[i]).tileIndex;
      counts.set(idx, (counts.get(idx) ?? 0) + 1);
    }
  }
  return counts;
}

/** Map usage count per palette line (0-3) across all sections of an act. */
export function paletteLineUsageCounts(act: Act): Map<number, number> {
  const counts = new Map<number, number>();
  for (const section of act.sections) {
    if (!section) continue;
    const nt = section.tileGrid.nametable;
    for (let i = 0; i < nt.length; i++) {
      if (nt[i] === 0) continue;
      const line = unpackNametableWord(nt[i]).palette;
      counts.set(line, (counts.get(line) ?? 0) + 1);
    }
  }
  return counts;
}
