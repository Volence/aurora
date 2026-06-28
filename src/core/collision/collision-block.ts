/** The 4 nametable words of the 16px block (2x2 tiles) at cell (cellCol, cellRow). */
export function blockTileWords(nametable: Uint16Array, cellCol: number, cellRow: number, width: number): [number, number, number, number] {
  const tc = cellCol * 2, tr = cellRow * 2;
  return [
    nametable[tr * width + tc], nametable[tr * width + tc + 1],
    nametable[(tr + 1) * width + tc], nametable[(tr + 1) * width + tc + 1],
  ];
}

/** An all-zero block = no art; reuse is disabled for these (paint stays local).
 *  "Empty" means the full word is 0 (not merely tile index 0): a blank tile on a
 *  non-default palette line or with priority set is a non-empty word and reuses. */
export function isEmptyBlock(words: [number, number, number, number]): boolean {
  return words[0] === 0 && words[1] === 0 && words[2] === 0 && words[3] === 0;
}

/** Every block cell in the section whose 4 words match the block at (cellCol,
 *  cellRow) — the "apply to all matching blocks" set. An empty block matches
 *  only itself. `cellsW`/`cellsH` are the section's block-grid dimensions (=
 *  tiles/2). Returns the painted cell first.
 *  The match key is the EXACT 16-bit words, by design — flips, palette line, and
 *  priority included. So a mirrored slope (which needs mirrored collision) and a
 *  recolored twin are intentionally treated as distinct blocks. Per-section only. */
export function findMatchingBlockCells(
  nametable: Uint16Array, cellCol: number, cellRow: number, width: number, cellsW: number, cellsH: number,
): Array<{ cellCol: number; cellRow: number }> {
  const [a, b, c, d] = blockTileWords(nametable, cellCol, cellRow, width);
  if (isEmptyBlock([a, b, c, d])) return [{ cellCol, cellRow }];
  const out: Array<{ cellCol: number; cellRow: number }> = [];
  for (let cr = 0; cr < cellsH; cr++) {
    for (let cc = 0; cc < cellsW; cc++) {
      const tc = cc * 2, tr = cr * 2;
      if (nametable[tr * width + tc] === a && nametable[tr * width + tc + 1] === b
        && nametable[(tr + 1) * width + tc] === c && nametable[(tr + 1) * width + tc + 1] === d) {
        out.push({ cellCol: cc, cellRow: cr });
      }
    }
  }
  return out;
}
