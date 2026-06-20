import { findMatchingBlockCells } from './collision-block';

export interface CellRC { cellCol: number; cellRow: number; }

/** The block cells a collision paint stroke writes — the single source of truth
 *  shared by the actual paint (MapViewport.paintCollisionCell) and the hover
 *  preview, so the preview can never drift from what painting does.
 *
 *  - brush > 1  → the N×N block area centred on the cell (clamped to the section),
 *  - brush 1 + justHere (Alt) → only the clicked block,
 *  - brush 1 default → every block in the section with the same tiles (reuse).
 *
 *  Returns { primary, all }: `primary` is the cell under the cursor; `all` is
 *  every cell that would change. Cell coords are in 16px-block units (0..cellsW). */
export function collisionPaintTargets(args: {
  cellCol: number; cellRow: number; brush: number; justHere: boolean;
  nametable: Uint16Array; width: number; cellsW: number; cellsH: number;
}): { primary: CellRC; all: CellRC[] } {
  const { cellCol, cellRow, brush, justHere, nametable, width, cellsW, cellsH } = args;
  const primary: CellRC = { cellCol, cellRow };

  if (brush > 1) {
    const half = brush >> 1;
    const all: CellRC[] = [];
    for (let dr = -half; dr <= half; dr++) {
      for (let dc = -half; dc <= half; dc++) {
        const cc = cellCol + dc, cr = cellRow + dr;
        if (cc >= 0 && cr >= 0 && cc < cellsW && cr < cellsH) all.push({ cellCol: cc, cellRow: cr });
      }
    }
    return { primary, all };
  }
  if (justHere) return { primary, all: [primary] };
  return { primary, all: findMatchingBlockCells(nametable, cellCol, cellRow, width, cellsW, cellsH) };
}
