import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { decodeS1Layout, encodeS1Layout } from '../s1-layout';
import { decodeS1Objpos, encodeS1Objpos, type S1ObjectEntry } from '../s1-objpos';
import { decodeS1StartPos, encodeS1StartPos } from '../s1-startpos';
import { decodeS1ColInd, encodeS1ColInd } from '../s1-colind';
import { decodeS1CollisionArray, decodeS1AngleMap, decodeS1CollisionShapes } from '../s1-collision-shapes';

const S1DIR = '/home/volence/sonic_hacks/s1disasm';

function bytes(...v: number[]): Uint8Array {
  return new Uint8Array(v);
}

// ---------------------------------------------------------------------------
// CI-safe, unguarded vectors — hand-built buffers that always run.
// ---------------------------------------------------------------------------

describe('s1 layout round-trip vectors (CI-safe, no fixtures)', () => {
  it('decodes header + grid and re-encodes byte-identically', () => {
    // width=3 (byte 2), height=2 (byte 1), 6 payload bytes.
    const buf = bytes(0x02, 0x01, 0x00, 0x01, 0x02, 0x80, 0x81, 0x7f);
    const l = decodeS1Layout(buf);
    expect(l.width).toBe(3);
    expect(l.height).toBe(2);
    expect(Array.from(l.cells)).toEqual([0x00, 0x01, 0x02, 0x80, 0x81, 0x7f]);
    expect(Array.from(encodeS1Layout(l))).toEqual(Array.from(buf));
  });

  it('preserves the loop flag (bit 7) inside cells', () => {
    const buf = bytes(0x00, 0x00, 0x80); // 1x1 grid, cell = chunk 0 + loop
    const l = decodeS1Layout(buf);
    expect(l.cells[0]).toBe(0x80);
    expect(Array.from(encodeS1Layout(l))).toEqual(Array.from(buf));
  });

  it('round-trips an irregular payload (trailing byte past the grid)', () => {
    // declared 1x1 but two payload bytes — SonLVL would drop the extra on write;
    // Aurora keeps it so the file is byte-identical.
    const buf = bytes(0x00, 0x00, 0x12, 0x34);
    const l = decodeS1Layout(buf);
    expect(l.cells.length).toBe(2);
    expect(Array.from(encodeS1Layout(l))).toEqual(Array.from(buf));
  });

  it('round-trips a short payload (grid truncated, like ending.bin)', () => {
    // declared 4x1 but only 2 payload bytes present.
    const buf = bytes(0x03, 0x00, 0xaa, 0xbb);
    const l = decodeS1Layout(buf);
    expect(l.width).toBe(4);
    expect(l.cells.length).toBe(2);
    expect(Array.from(encodeS1Layout(l))).toEqual(Array.from(buf));
  });
});

describe('s1 objpos round-trip vectors (CI-safe, no fixtures)', () => {
  it('decodes fields and re-encodes byte-identically', () => {
    // x=0x0123, yword=0x0456 (no flags), id=0x12, subtype=0x34, then terminator.
    const buf = bytes(0x01, 0x23, 0x04, 0x56, 0x12, 0x34, 0xff, 0xff, 0x00, 0x00, 0x00, 0x00);
    const e = decodeS1Objpos(buf);
    expect(e).toHaveLength(1);
    expect(e[0]).toEqual<S1ObjectEntry>({
      x: 0x0123, y: 0x0456, xflip: false, yflip: false, respawn: false, id: 0x12, subtype: 0x34,
    });
    expect(Array.from(encodeS1Objpos(e, buf.length))).toEqual(Array.from(buf));
  });

  it('all flags set: xflip, yflip, respawn, id=0x7f, high y bits', () => {
    // yword: 0x8000 (yflip) | 0x4000 (xflip) | 0x0fff (max y) = 0xcfff
    // idByte: 0x80 (respawn) | 0x7f (id) = 0xff
    const buf = bytes(0xab, 0xcd, 0xcf, 0xff, 0xff, 0x99, 0xff, 0xff, 0x00, 0x00, 0x00, 0x00);
    const e = decodeS1Objpos(buf);
    expect(e[0]).toEqual<S1ObjectEntry>({
      x: 0xabcd, y: 0x0fff, xflip: true, yflip: true, respawn: true, id: 0x7f, subtype: 0x99,
    });
    expect(Array.from(encodeS1Objpos(e, buf.length))).toEqual(Array.from(buf));
  });

  it('all flags clear, id=0x7f without respawn', () => {
    const buf = bytes(0x00, 0x10, 0x00, 0x20, 0x7f, 0x00, 0xff, 0xff, 0x00, 0x00, 0x00, 0x00);
    const e = decodeS1Objpos(buf);
    expect(e[0]).toEqual<S1ObjectEntry>({
      x: 0x0010, y: 0x0020, xflip: false, yflip: false, respawn: false, id: 0x7f, subtype: 0x00,
    });
    expect(Array.from(encodeS1Objpos(e, buf.length))).toEqual(Array.from(buf));
  });

  it('respawn set with id 0x00 (respawn bit is independent of id)', () => {
    const buf = bytes(0x00, 0x01, 0x00, 0x02, 0x80, 0x03, 0xff, 0xff, 0x00, 0x00, 0x00, 0x00);
    const e = decodeS1Objpos(buf);
    expect(e[0].respawn).toBe(true);
    expect(e[0].id).toBe(0x00);
    expect(Array.from(encodeS1Objpos(e, buf.length))).toEqual(Array.from(buf));
  });

  it('empty table (immediate terminator)', () => {
    const buf = bytes(0xff, 0xff, 0x00, 0x00, 0x00, 0x00);
    const e = decodeS1Objpos(buf);
    expect(e).toHaveLength(0);
    expect(Array.from(encodeS1Objpos(e, buf.length))).toEqual(Array.from(buf));
  });

  it('throws on a buffer that ends without a terminator', () => {
    // one complete entry, no terminator
    const buf = bytes(0x00, 0x01, 0x00, 0x02, 0x03, 0x04);
    expect(() => decodeS1Objpos(buf)).toThrow(/terminator/);
  });

  it('throws on a buffer that ends mid-entry', () => {
    // a full entry followed by 3 stray bytes (would-be entry < 6 bytes, no terminator)
    const buf = bytes(0x00, 0x01, 0x00, 0x02, 0x03, 0x04, 0x00, 0x05, 0x00);
    expect(() => decodeS1Objpos(buf)).toThrow(/terminator/);
  });

  it('throws when the length is not a multiple of 6 and lacks a terminator', () => {
    const buf = bytes(0x00, 0x01, 0x00); // 3 bytes, no terminator
    expect(() => decodeS1Objpos(buf)).toThrow(/terminator/);
  });

  it('throws on an empty buffer', () => {
    expect(() => decodeS1Objpos(new Uint8Array(0))).toThrow(/terminator/);
  });

  it('pads to originalLength with 0xff past the terminator', () => {
    const out = encodeS1Objpos([{ x: 1, y: 2, xflip: false, yflip: false, respawn: false, id: 3, subtype: 4 }], 18);
    expect(out.length).toBe(18);
    // 6 bytes entry + 6 bytes terminator + 6 bytes 0xff pad
    expect(Array.from(out.slice(12))).toEqual([0xff, 0xff, 0xff, 0xff, 0xff, 0xff]);
  });
});

describe('s1 startpos round-trip vectors (CI-safe, no fixtures)', () => {
  it('decodes big-endian x/y and re-encodes byte-identically', () => {
    const buf = bytes(0x00, 0x30, 0x01, 0xbd);
    const p = decodeS1StartPos(buf);
    expect(p).toEqual({ x: 0x0030, y: 0x01bd });
    expect(Array.from(encodeS1StartPos(p))).toEqual(Array.from(buf));
  });
});

describe('s1 colind wrapper (CI-safe, no fixtures)', () => {
  it('copies in and out without aliasing the source', () => {
    const src = bytes(0, 1, 2, 3, 0xff);
    const c = decodeS1ColInd(src);
    expect(Array.from(c)).toEqual([0, 1, 2, 3, 0xff]);
    src[0] = 0x99;
    expect(c[0]).toBe(0); // decode copied, not aliased
    const out = encodeS1ColInd(c);
    out[0] = 0x77;
    expect(c[0]).toBe(0); // encode copied too
  });
});

describe('s1 collision shapes (CI-safe, no fixtures)', () => {
  it('reads 16 signed heights per shape', () => {
    const arr = new Uint8Array(256 * 16);
    arr[0] = 0x00; arr[1] = 0x10; arr[2] = 0xfe; arr[3] = 0x80; // 0, 16, -2, -128
    const heights = decodeS1CollisionArray(arr);
    expect(heights).toHaveLength(256);
    expect(heights[0][0]).toBe(0);
    expect(heights[0][1]).toBe(16);
    expect(heights[0][2]).toBe(-2);
    expect(heights[0][3]).toBe(-128);
    expect(heights[0]).toBeInstanceOf(Int8Array);
  });

  it('reads 256 unsigned angle bytes', () => {
    const angleMap = new Uint8Array(256);
    angleMap[0] = 0xff; angleMap[1] = 0x00; angleMap[2] = 0x88;
    const angles = decodeS1AngleMap(angleMap);
    expect(angles).toHaveLength(256);
    expect(angles[0]).toBe(0xff);
    expect(angles[2]).toBe(0x88);
  });

  it('rejects short buffers', () => {
    expect(() => decodeS1CollisionArray(new Uint8Array(10))).toThrow();
    expect(() => decodeS1AngleMap(new Uint8Array(10))).toThrow();
  });
});

// ---------------------------------------------------------------------------
// Golden suite over real s1disasm data — skipIf-gated so CI without the tree
// simply skips. Byte-identical re-encode is the key fidelity gate.
// ---------------------------------------------------------------------------

function topLevelBins(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((f) => f.toLowerCase().endsWith('.bin') && fs.statSync(path.join(dir, f)).isFile())
    .sort();
}

// Real S1 layout files whose payload is not exactly width*height: SonLVLAPI's
// bounds-checked reader tolerates them but its writer does not round-trip them.
// (mz3bg/syz1/syz3 carry one trailing byte; ending.bin is truncated short.)
const IRREGULAR_LAYOUTS = new Set(['mz3bg.bin', 'syz1.bin', 'syz3.bin', 'ending.bin']);

describe.skipIf(!fs.existsSync(S1DIR))('s1 binary goldens over real s1disasm data', () => {
  it('levels/*.bin decode, consume the whole file, and re-encode byte-identically', () => {
    const dir = `${S1DIR}/levels`;
    const files = topLevelBins(dir);
    expect(files.length).toBeGreaterThan(0);
    for (const file of files) {
      const raw = new Uint8Array(fs.readFileSync(path.join(dir, file)));
      const l = decodeS1Layout(raw);
      // Whole file consumed: header (2) + payload (cells).
      expect(l.cells.length, `payload length for ${file}`).toBe(raw.length - 2);
      // For well-formed grids the payload is exactly width*height.
      if (!IRREGULAR_LAYOUTS.has(file)) {
        expect(l.cells.length, `grid size for ${file}`).toBe(l.width * l.height);
      }
      // Key fidelity gate.
      expect(Array.from(encodeS1Layout(l)), `re-encode ${file}`).toEqual(Array.from(raw));
    }
  });

  it('objpos/*.bin (top level only) decode, respect the terminator, and re-encode byte-identically', () => {
    const dir = `${S1DIR}/objpos`;
    const files = topLevelBins(dir); // top-level only; skips objpos/platforms
    expect(files.length).toBeGreaterThan(0);
    for (const file of files) {
      const raw = new Uint8Array(fs.readFileSync(path.join(dir, file)));
      const e = decodeS1Objpos(raw);
      // Terminator respected: entries occupy strictly less than the file.
      expect(e.length * 6, `entry span for ${file}`).toBeLessThan(raw.length);
      expect(Array.from(encodeS1Objpos(e, raw.length)), `re-encode ${file}`).toEqual(Array.from(raw));
    }
  });

  it('startpos/*.bin (top level only) decode and re-encode byte-identically', () => {
    const dir = `${S1DIR}/startpos`;
    const files = topLevelBins(dir); // skips Credits Demos / Special Stages subdirs
    expect(files.length).toBeGreaterThan(0);
    for (const file of files) {
      const raw = new Uint8Array(fs.readFileSync(path.join(dir, file)));
      const p = decodeS1StartPos(raw);
      expect(Array.from(encodeS1StartPos(p)), `re-encode ${file}`).toEqual(Array.from(raw));
    }
  });

  it('collide arrays parse to 256 shapes / 256 angles with expected spot values', () => {
    const arr = new Uint8Array(fs.readFileSync(`${S1DIR}/collide/Collision Array (Normal).bin`));
    const angleMap = new Uint8Array(fs.readFileSync(`${S1DIR}/collide/Angle Map.bin`));
    const { heights, angles } = decodeS1CollisionShapes(arr, angleMap);

    expect(heights).toHaveLength(256);
    expect(angles).toHaveLength(256);

    // Verified via hexdump of the real files:
    // shape 0 = all zeros; shape 1 = all 1; shape 2 starts 0xfe -> -2 (signed).
    expect(Array.from(heights[0])).toEqual(new Array(16).fill(0));
    expect(Array.from(heights[1])).toEqual(new Array(16).fill(1));
    expect(heights[2][0]).toBe(-2);
    expect(heights[2][15]).toBe(-6);
    // Angle Map bytes 0..3 = ff 00 88 90.
    expect(angles[0]).toBe(0xff);
    expect(angles[1]).toBe(0x00);
    expect(angles[2]).toBe(0x88);
    expect(angles[3]).toBe(0x90);
  });

  it('collide zone colind files round-trip through the wrapper', () => {
    for (const zone of ['GHZ', 'LZ', 'MZ', 'SBZ', 'SLZ', 'SYZ']) {
      const raw = new Uint8Array(fs.readFileSync(`${S1DIR}/collide/${zone}.bin`));
      const c = decodeS1ColInd(raw);
      expect(c.length, `colind length ${zone}`).toBe(raw.length);
      expect(Array.from(encodeS1ColInd(c)), `colind round-trip ${zone}`).toEqual(Array.from(raw));
    }
  });
});
