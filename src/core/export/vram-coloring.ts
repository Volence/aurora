// VRAM color-group base assignment — mirrors s4_engine/tools/tile_dedupe.py
// assign_section_slots: groups get cumulative bases from measured union sizes.

// BG region starts at tile slot 1024 ($400); FG group unions must fit below it.
export const FG_TILE_LIMIT = 1024;

/**
 * Checkerboard coloring: active sections get (col+row)%2, inactive get -1.
 * Adjacent (H/V) sections are co-visible during teleports and must differ.
 */
export function computeVramColoring(
  gridWidth: number,
  gridHeight: number,
  activeSlots: boolean[],
): number[] {
  const count = gridWidth * gridHeight;
  const colors = new Array<number>(count).fill(-1);
  for (let i = 0; i < count; i++) {
    if (!activeSlots[i]) continue;
    const col = i % gridWidth;
    const row = Math.floor(i / gridWidth);
    colors[i] = (col + row) % 2;
  }
  return colors;
}

export interface VramBaseAssignment {
  /** Per-section VRAM byte address (colorBases[color] * 32; 0 for inactive). */
  bases: number[];
  /** Tile-slot base per color group (cumulative union counts). */
  colorBases: number[];
}

export function assignVramBases(
  colors: number[],
  groupUnionCounts: number[],
): VramBaseAssignment {
  const colorBases: number[] = [];
  let cursor = 0;
  for (let c = 0; c < groupUnionCounts.length; c++) {
    colorBases.push(cursor);
    cursor += groupUnionCounts[c];
  }
  if (cursor > FG_TILE_LIMIT) {
    throw new Error(
      `VRAM overflow: color groups need ${cursor} tiles, FG pool limit is ${FG_TILE_LIMIT}`,
    );
  }
  const bases = colors.map(c => (c < 0 ? 0 : colorBases[c] * 32));
  return { bases, colorBases };
}

export function generateVramBasesAsm(zonePrefix: string, bases: number[]): string {
  const lines: string[] = [];
  for (let i = 0; i < bases.length; i++) {
    const tileIndex = bases[i] / 32;
    lines.push(`${zonePrefix}_SEC${i}_VRAM = ${tileIndex} * 32   ; = $${bases[i].toString(16).toUpperCase().padStart(4, '0')}`);
  }
  return lines.join('\n');
}
