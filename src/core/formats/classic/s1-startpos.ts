// Sonic 1 player start position — a single 4-byte entry: x big-endian word,
// y big-endian word. Every top-level s1disasm startpos file is exactly 4 bytes.

export interface S1StartPos {
  x: number;
  y: number;
}

export function decodeS1StartPos(b: Uint8Array): S1StartPos {
  if (b.length < 4) throw new Error('S1 start position needs at least 4 bytes');
  return { x: (b[0] << 8) | b[1], y: (b[2] << 8) | b[3] };
}

export function encodeS1StartPos(p: S1StartPos): Uint8Array {
  const out = new Uint8Array(4);
  out[0] = (p.x >> 8) & 0xff;
  out[1] = p.x & 0xff;
  out[2] = (p.y >> 8) & 0xff;
  out[3] = p.y & 0xff;
  return out;
}
