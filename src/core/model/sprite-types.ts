/**
 * One hardware sprite piece, LOGICAL (authoring) form: offsets are the UNFLIPPED
 * top-left corner relative to the object origin; flips are bits only (the engine
 * recomputes flipped corners at render time). Tile index is relative to the
 * object's art_tile base, never absolute VRAM.
 */
export interface SpritePiece {
  xOffset: number;      // signed, unflipped top-left
  yOffset: number;      // signed, unflipped top-left
  widthCells: number;   // 1..4 (1 cell = 8px)
  heightCells: number;  // 1..4
  tile: number;         // 0..0x7FF, relative to art base
  palette: number;      // 0..3
  priority: boolean;
  xFlip: boolean;
  yFlip: boolean;
}

export interface SpriteFrame {
  id: string;
  pieces: SpritePiece[];
}

/**
 * VDP size byte = ((widthCells-1)<<2) | (heightCells-1).
 * bits 3-2 = WIDTH-1, bits 1-0 = HEIGHT-1. (s4_engine macros.asm `sprSize`.)
 */
export function sizeCode(widthCells: number, heightCells: number): number {
  for (const [name, v] of [['widthCells', widthCells], ['heightCells', heightCells]] as const) {
    if (!Number.isInteger(v) || v < 1 || v > 4) {
      throw new Error(`sizeCode: ${name}=${v} out of range [1,4]`);
    }
  }
  return (((widthCells - 1) & 3) << 2) | ((heightCells - 1) & 3);
}
