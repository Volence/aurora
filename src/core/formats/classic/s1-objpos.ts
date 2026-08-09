// Sonic 1 object layout ("objpos") — a flat table of 6-byte object entries
// terminated by an 0xFFFF x-word. Ported from SonLVLAPI's S1.Object /
// S1ObjectEntry (all multi-byte fields are big-endian, matching ByteConverter).
//
// Entry layout (6 bytes):
//   [0..1] x  : big-endian word
//   [2..3] yw : big-endian word — bit15 = yflip, bit14 = xflip, bits0..11 = y
//   [4]    id : bit7 = respawn/RememberState, bits0..6 = object id
//   [5]    subtype
//
// Terminator: any entry whose first word is 0xFFFF ends the table (SonLVL writes
// it as FF FF 00 00 00 00). A well-formed table MUST contain that terminator;
// `decodeS1Objpos` throws on a buffer that ends without one, or on a would-be
// entry with fewer than 6 bytes remaining, rather than fabricating a partial
// entry from out-of-bounds reads.
//
// Round-trip contract: every real S1 objpos file ends exactly at the terminator
// with NO trailing bytes. When `encodeS1Objpos` is given `originalLength`, the
// pad it writes past the terminator is 0xFF — this padding is load-bearing for
// byte-identity (it reproduces the source file's exact length), not a "just in
// case": a caller round-tripping a real file passes originalLength = file.length
// and relies on the 0xFF fill to match.

export interface S1ObjectEntry {
  x: number;
  y: number;
  xflip: boolean;
  yflip: boolean;
  respawn: boolean;
  id: number;
  subtype: number;
}

const ENTRY_SIZE = 6;
const Y_MASK = 0x0fff; // S1 y is 12 bits
const XFLIP_BIT = 0x4000;
const YFLIP_BIT = 0x8000;
const ID_MASK = 0x7f;
const RESPAWN_BIT = 0x80;

export function decodeS1Objpos(b: Uint8Array): S1ObjectEntry[] {
  const entries: S1ObjectEntry[] = [];
  let o = 0;
  for (;;) {
    if (o + ENTRY_SIZE > b.length) {
      // Ran out of bytes before finding a terminator. A trailing chunk shorter
      // than a full entry (length not a multiple of 6) lands here too.
      throw new Error(
        `S1 objpos is malformed: reached end of buffer at offset ${o} without a 0xFFFF terminator`,
      );
    }
    const x = (b[o] << 8) | b[o + 1];
    if (x === 0xffff) break; // terminator
    const yw = (b[o + 2] << 8) | b[o + 3];
    const idByte = b[o + 4];
    entries.push({
      x,
      y: yw & Y_MASK,
      xflip: (yw & XFLIP_BIT) === XFLIP_BIT,
      yflip: (yw & YFLIP_BIT) === YFLIP_BIT,
      respawn: (idByte & RESPAWN_BIT) === RESPAWN_BIT,
      id: idByte & ID_MASK,
      subtype: b[o + 5],
    });
    o += ENTRY_SIZE;
  }
  return entries;
}

export function encodeS1Objpos(e: S1ObjectEntry[], originalLength?: number): Uint8Array {
  const body = (e.length + 1) * ENTRY_SIZE; // entries + terminator
  const total = originalLength !== undefined ? Math.max(originalLength, body) : body;
  const out = new Uint8Array(total);
  if (originalLength !== undefined) out.fill(0xff);
  let p = 0;
  for (const obj of e) {
    out[p] = (obj.x >> 8) & 0xff;
    out[p + 1] = obj.x & 0xff;
    let yw = obj.y & Y_MASK;
    if (obj.xflip) yw |= XFLIP_BIT;
    if (obj.yflip) yw |= YFLIP_BIT;
    out[p + 2] = (yw >> 8) & 0xff;
    out[p + 3] = yw & 0xff;
    out[p + 4] = (obj.id & ID_MASK) | (obj.respawn ? RESPAWN_BIT : 0);
    out[p + 5] = obj.subtype & 0xff;
    p += ENTRY_SIZE;
  }
  // Terminator: FF FF 00 00 00 00
  out[p] = 0xff;
  out[p + 1] = 0xff;
  out[p + 2] = 0x00;
  out[p + 3] = 0x00;
  out[p + 4] = 0x00;
  out[p + 5] = 0x00;
  return out;
}
