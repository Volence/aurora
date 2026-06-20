// A 16px collision cell = the 2x2 block of 8px tiles. Both tiles of each axis
// carry the same engine attr byte, so painting a cell writes all four indices.
export function cellTileIndices(cellCol: number, cellRow: number, width: number): number[] {
  const tc = cellCol * 2, tr = cellRow * 2;
  return [tr * width + tc, tr * width + tc + 1, (tr + 1) * width + tc, (tr + 1) * width + tc + 1];
}
