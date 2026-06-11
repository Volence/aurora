/**
 * Sonic 2 sprite mapping format parser.
 *
 * Format (default/version 0):
 *   Frame table: N word offsets, relative to start of file
 *   Each frame: word piece_count, then piece_count * 6 bytes
 *   Each piece (6 bytes):
 *     word 0: (y_offset << 8) | (((width-1)&3) << 2) | ((height-1)&3)
 *     word 1: (priority<<15) | (palette<<13) | (yflip<<12) | (xflip<<11) | tile_index
 *     word 2: x_offset (signed 16-bit)
 */

export interface SpritePiece {
  xOffset: number;    // signed, relative to sprite center
  yOffset: number;    // signed, relative to sprite center
  width: number;      // in tiles (1-4)
  height: number;     // in tiles (1-4)
  tileIndex: number;  // base tile index (relative to object's art_tile)
  xFlip: boolean;
  yFlip: boolean;
  palette: number;    // 0-3
  priority: boolean;
}

export interface SpriteFrame {
  pieces: SpritePiece[];
}

export interface SpriteMappings {
  frames: SpriteFrame[];
}

/**
 * Parse a sprite mapping binary file.
 */
export function parseSpriteMappings(data: Uint8Array): SpriteMappings {
  if (data.length < 2) return { frames: [] };

  // Read frame offsets from the table
  // The first offset tells us how many frames there are
  const firstOffset = (data[0] << 8) | data[1];
  if (firstOffset === 0 || firstOffset > data.length) return { frames: [] };

  const frameCount = firstOffset / 2; // each offset is a word
  const frames: SpriteFrame[] = [];

  for (let f = 0; f < frameCount; f++) {
    const tableOffset = f * 2;
    if (tableOffset + 1 >= data.length) break;

    const frameOffset = (data[tableOffset] << 8) | data[tableOffset + 1];
    if (frameOffset >= data.length) break;

    const frame = parseFrame(data, frameOffset);
    frames.push(frame);
  }

  return { frames };
}

function parseFrame(data: Uint8Array, offset: number): SpriteFrame {
  if (offset + 1 >= data.length) return { pieces: [] };

  const pieceCount = (data[offset] << 8) | data[offset + 1];
  offset += 2;

  // Sanity check
  if (pieceCount > 100 || pieceCount < 0) return { pieces: [] };

  const pieces: SpritePiece[] = [];
  for (let p = 0; p < pieceCount; p++) {
    if (offset + 5 >= data.length) break;

    const w0 = (data[offset] << 8) | data[offset + 1];
    const w1 = (data[offset + 2] << 8) | data[offset + 3];
    const w2 = (data[offset + 4] << 8) | data[offset + 5];

    let yOffset = (w0 >> 8) & 0xFF;
    if (yOffset > 127) yOffset -= 256;

    const sizeBits = w0 & 0xFF;
    const width = ((sizeBits >> 2) & 3) + 1;
    const height = (sizeBits & 3) + 1;

    const priority = (w1 & 0x8000) !== 0;
    const palette = (w1 >> 13) & 3;
    const yFlip = (w1 & 0x1000) !== 0;
    const xFlip = (w1 & 0x0800) !== 0;
    const tileIndex = w1 & 0x07FF;

    let xOffset = w2;
    if (xOffset > 32767) xOffset -= 65536;

    pieces.push({ xOffset, yOffset, width, height, tileIndex, xFlip, yFlip, palette, priority });
    offset += 6;
  }

  return { pieces };
}

/**
 * Render a sprite frame to an ImageData buffer.
 * Takes decompressed tile data and palette lines.
 * Returns the rendered sprite and its bounding box offset.
 */
export function renderSpriteFrame(
  frame: SpriteFrame,
  tileData: Uint8Array, // decompressed 4bpp tile data
  paletteLines: Array<{ colors: Array<{ r: number; g: number; b: number; a: number }> }>,
  artTileBase: number = 0, // the object's art_tile base (VRAM offset)
): { imageData: ImageData; offsetX: number; offsetY: number } | null {
  if (frame.pieces.length === 0) return null;

  // Calculate bounding box
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const piece of frame.pieces) {
    minX = Math.min(minX, piece.xOffset);
    minY = Math.min(minY, piece.yOffset);
    maxX = Math.max(maxX, piece.xOffset + piece.width * 8);
    maxY = Math.max(maxY, piece.yOffset + piece.height * 8);
  }

  const imgWidth = maxX - minX;
  const imgHeight = maxY - minY;
  if (imgWidth <= 0 || imgHeight <= 0) return null;

  const imageData = new ImageData(imgWidth, imgHeight);
  const pixels = imageData.data;

  for (const piece of frame.pieces) {
    const pal = paletteLines[piece.palette]?.colors ?? paletteLines[0]?.colors ?? [];

    for (let ty = 0; ty < piece.height; ty++) {
      for (let tx = 0; tx < piece.width; tx++) {
        // The tile index in the piece is relative — add the object's art_tile base,
        // then subtract artTileBase to get the index into our decompressed tile buffer
        const tileIdx = piece.tileIndex + ty * piece.width + tx;
        const tileByteOffset = tileIdx * 32; // 32 bytes per 8x8 tile

        if (tileByteOffset + 31 >= tileData.length) continue;

        for (let py = 0; py < 8; py++) {
          for (let px = 0; px < 8; px++) {
            // Apply flips
            const srcTx = piece.xFlip ? (piece.width - 1 - tx) : tx;
            const srcTy = piece.yFlip ? (piece.height - 1 - ty) : ty;
            const srcPx = piece.xFlip ? (7 - px) : px;
            const srcPy = piece.yFlip ? (7 - py) : py;

            const srcTileIdx = piece.tileIndex + srcTy * piece.width + srcTx;
            const srcByteOffset = srcTileIdx * 32 + srcPy * 4 + Math.floor(srcPx / 2);
            if (srcByteOffset >= tileData.length) continue;

            const byte = tileData[srcByteOffset];
            const colorIdx = (srcPx & 1) === 0 ? (byte >> 4) & 0xF : byte & 0xF;

            if (colorIdx === 0) continue; // transparent

            const color = pal[colorIdx] ?? { r: 0, g: 0, b: 0, a: 255 };
            const destX = piece.xOffset - minX + tx * 8 + px;
            const destY = piece.yOffset - minY + ty * 8 + py;
            const destIdx = (destY * imgWidth + destX) * 4;

            pixels[destIdx] = color.r;
            pixels[destIdx + 1] = color.g;
            pixels[destIdx + 2] = color.b;
            pixels[destIdx + 3] = color.a;
          }
        }
      }
    }
  }

  return { imageData, offsetX: minX, offsetY: minY };
}
