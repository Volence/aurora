const VRAM_BASE_A = 0 * 32;     // color 0: tile 0
const VRAM_BASE_B = 113 * 32;   // color 1: tile 113 ($0E20)

export function computeVramBases(
  gridWidth: number,
  gridHeight: number,
  activeSlots: boolean[],
): number[] {
  const count = gridWidth * gridHeight;
  const bases = new Array<number>(count).fill(0);

  for (let i = 0; i < count; i++) {
    if (!activeSlots[i]) {
      bases[i] = 0;
      continue;
    }

    const col = i % gridWidth;
    const row = Math.floor(i / gridWidth);

    bases[i] = (col + row) % 2 === 0 ? VRAM_BASE_A : VRAM_BASE_B;
  }

  return bases;
}

export function generateVramBasesAsm(
  zonePrefix: string,
  bases: number[],
): string {
  const lines: string[] = [];
  for (let i = 0; i < bases.length; i++) {
    const tileIndex = bases[i] / 32;
    lines.push(`${zonePrefix}_SEC${i}_VRAM = ${tileIndex} * 32   ; = $${bases[i].toString(16).toUpperCase().padStart(4, '0')}`);
  }
  return lines.join('\n');
}
