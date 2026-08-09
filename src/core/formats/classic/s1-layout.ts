// Sonic 1 foreground/background layout — a plain, uncompressed chunk map.
//
// Byte 0 = width-1, byte 1 = height-1, followed by height rows of width bytes,
// each byte a chunk (map256) id. Bit 7 of a cell is Sonic 1's "loop" flag
// (SonLVLAPI S1.Layout masks the id with 0x7F and reads 0x80 as loop); Aurora
// keeps the whole byte in `cells` so the flag round-trips without a separate
// field.
//
// `cells` is the exact raw payload (everything after the 2-byte header). It is
// normally width*height bytes, but a handful of real S1 files are irregular:
// some carry one trailing byte past the grid, and ending.bin is truncated short
// of a full grid. SonLVLAPI's reader tolerates both (its bounds-checked loop
// stops at end-of-data) but its writer always emits a full width*height grid, so
// SonLVL does NOT round-trip those files. Storing the literal payload here makes
// encode(decode(b)) byte-identical for every file, which is the fidelity gate.

export interface S1Layout {
  /** Declared width in chunks (header byte 0 + 1). */
  width: number;
  /** Declared height in chunks (header byte 1 + 1). */
  height: number;
  /** Raw payload bytes (chunk ids; bit 7 = loop flag). Usually width*height. */
  cells: Uint8Array;
}

export function decodeS1Layout(b: Uint8Array): S1Layout {
  if (b.length < 2) throw new Error('S1 layout too short for a width/height header');
  const width = b[0] + 1;
  const height = b[1] + 1;
  return { width, height, cells: b.slice(2) };
}

export function encodeS1Layout(l: S1Layout): Uint8Array {
  const out = new Uint8Array(2 + l.cells.length);
  out[0] = (l.width - 1) & 0xff;
  out[1] = (l.height - 1) & 0xff;
  out.set(l.cells, 2);
  return out;
}
