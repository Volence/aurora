import type { SpriteFrame, SpritePiece } from '../../model/sprite-types';
import { sizeCode } from '../../model/sprite-types';

/**
 * Parameterized reader/writer for the classic Sonic-disassembly sprite MAPPINGS
 * format (Sonic 1 = Ver 1, Sonic 2 = Ver 2, Sonic 3&K = Ver 3). All three are a
 * word offset table (frameCount = firstOffset/2) + per-frame piece-count header +
 * pieces; they differ only in count-header width and piece layout. Verified
 * against the real `s2disasm/mappings/MapMacros.asm` `spriteHeader`/`spritePiece`
 * macros and assembled fixtures (test/fixtures/mappings/).
 *
 * | Ver | count hdr | piece | piece fields                                   |
 * |-----|-----------|-------|------------------------------------------------|
 * | 1   | byte      | 5 B   | ypos.b, size.b, tile.w, xpos.b                 |
 * | 2   | word      | 8 B   | (ypos<<8\|size).w, tile.w, 2P-tile.w, xpos.w   |
 * | 3   | word      | 6 B   | (ypos<<8\|size).w, tile.w, xpos.w              |
 *
 * The "size" byte is `((w-1)&3)<<2 | (h-1)&3`; the tile word is
 * `pri<<15 | pal<<13 | yflip<<12 | xflip<<11 | tile` (identical across versions).
 * The Ver 2 2P-tile word is a 2-player-mode duplicate `attrs | (tile>>1)` —
 * ignored on read, derived on write.
 */
export type SonicMappingsVer = 1 | 2 | 3;

const COUNT_HDR_BYTES: Record<SonicMappingsVer, number> = { 1: 1, 2: 2, 3: 2 };
const PIECE_BYTES: Record<SonicMappingsVer, number> = { 1: 5, 2: 8, 3: 6 };

function decodeTileWord(w: number): Pick<SpritePiece, 'tile' | 'palette' | 'priority' | 'xFlip' | 'yFlip'> {
  return {
    tile: w & 0x7ff,
    palette: (w >> 13) & 3,
    priority: (w & 0x8000) !== 0,
    yFlip: (w & 0x1000) !== 0,
    xFlip: (w & 0x0800) !== 0,
  };
}

function encodeTileWord(p: SpritePiece): number {
  return (
    ((p.priority ? 1 : 0) << 15) |
    ((p.palette & 3) << 13) |
    ((p.yFlip ? 1 : 0) << 12) |
    ((p.xFlip ? 1 : 0) << 11) |
    (p.tile & 0x7ff)
  ) & 0xffff;
}

function decodeSize(size: number): { widthCells: number; heightCells: number } {
  return { widthCells: ((size >> 2) & 3) + 1, heightCells: (size & 3) + 1 };
}

function validatePiece(p: SpritePiece): void {
  if (!Number.isInteger(p.tile) || p.tile < 0 || p.tile > 0x7ff) {
    throw new Error(`sprite piece tile=${p.tile} out of range [0,0x7FF]`);
  }
  if (!Number.isInteger(p.palette) || p.palette < 0 || p.palette > 3) {
    throw new Error(`sprite piece palette=${p.palette} out of range [0,3]`);
  }
}

export function readSonicMappings(bytes: Uint8Array, ver: SonicMappingsVer): SpriteFrame[] {
  if (bytes.length < 2) return [];
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const firstOffset = dv.getUint16(0, false);
  if (firstOffset < 2 || firstOffset % 2 !== 0 || firstOffset > bytes.length) return [];

  const frameCount = firstOffset / 2;
  const hdr = COUNT_HDR_BYTES[ver];
  const pieceLen = PIECE_BYTES[ver];
  const frames: SpriteFrame[] = [];

  for (let f = 0; f < frameCount; f++) {
    const frameOff = dv.getUint16(f * 2, false);
    if (frameOff + hdr > bytes.length) break;
    const count = ver === 1 ? bytes[frameOff] : dv.getUint16(frameOff, false);
    const pieces: SpritePiece[] = [];
    let o = frameOff + hdr;
    for (let p = 0; p < count; p++) {
      if (o + pieceLen > bytes.length) break;
      let yOffset: number, size: number, tileWord: number, xOffset: number;
      if (ver === 1) {
        yOffset = dv.getInt8(o);
        size = bytes[o + 1];
        tileWord = dv.getUint16(o + 2, false);
        xOffset = dv.getInt8(o + 4);
      } else {
        const w0 = dv.getUint16(o, false);
        yOffset = (w0 >> 8) & 0xff;
        if (yOffset > 127) yOffset -= 256;
        size = w0 & 0xff;
        tileWord = dv.getUint16(o + 2, false);
        // Ver 2 has a 2P-tile word at o+4 (ignored); xpos follows it.
        xOffset = dv.getInt16(o + (ver === 2 ? 6 : 4), false);
      }
      pieces.push({ xOffset, yOffset, ...decodeSize(size), ...decodeTileWord(tileWord) });
      o += pieceLen;
    }
    frames.push({ id: `f${f}`, pieces });
  }
  return frames;
}

export function writeSonicMappings(frames: SpriteFrame[], ver: SonicMappingsVer): Uint8Array {
  const hdr = COUNT_HDR_BYTES[ver];
  const pieceLen = PIECE_BYTES[ver];
  const tableSize = frames.length * 2;

  const blocks = frames.map((frame) => {
    const buf = new Uint8Array(hdr + frame.pieces.length * pieceLen);
    const dv = new DataView(buf.buffer);
    if (ver === 1) buf[0] = frame.pieces.length & 0xff;
    else dv.setUint16(0, frame.pieces.length, false);
    let o = hdr;
    for (const p of frame.pieces) {
      validatePiece(p);
      const size = sizeCode(p.widthCells, p.heightCells);
      const tileWord = encodeTileWord(p);
      if (ver === 1) {
        dv.setInt8(o, p.yOffset);
        buf[o + 1] = size;
        dv.setUint16(o + 2, tileWord, false);
        dv.setInt8(o + 4, p.xOffset);
      } else {
        dv.setUint16(o, ((p.yOffset & 0xff) << 8) | size, false);
        dv.setUint16(o + 2, tileWord, false);
        if (ver === 2) {
          const attrs = tileWord & 0xf800;
          dv.setUint16(o + 4, (attrs | ((p.tile >> 1) & 0x3ff)) & 0xffff, false);
          dv.setInt16(o + 6, p.xOffset, false);
        } else {
          dv.setInt16(o + 4, p.xOffset, false);
        }
      }
      o += pieceLen;
    }
    return buf;
  });

  const body = tableSize + blocks.reduce((s, b) => s + b.length, 0);
  const total = body + (body & 1); // assembler `even` pads the table to a word boundary
  const out = new Uint8Array(total);
  const dv = new DataView(out.buffer);
  let off = tableSize;
  frames.forEach((_, i) => { dv.setUint16(i * 2, off, false); out.set(blocks[i], off); off += blocks[i].length; });
  return out;
}
