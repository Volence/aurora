import { groupDPLCRuns } from './dplc-runs';

/**
 * Parameterized reader/writer for classic Sonic-disassembly DPLC tables (S1 = Ver 1,
 * S2 = Ver 2, S3K = Ver 3). Word offset table + per-frame count header + 2-byte
 * entries; read returns the per-frame expanded list of SOURCE art-tile indices.
 * Verified against `s2disasm/mappings/MapMacros.asm` `dplcHeader`/`dplcEntry` and
 * assembled fixtures.
 *
 * | Ver | count hdr        | entry word                 |
 * |-----|------------------|----------------------------|
 * | 1   | byte (count)     | (tiles-1)<<12 \| offset     |
 * | 2   | word (count)     | (tiles-1)<<12 \| offset     |
 * | 3   | word (count-1)   | (offset<<4) \| (tiles-1)  ⚠ reversed |
 *
 * S3K has TWO quirks vs S1/S2: the header stores `count-1` (so an empty frame is
 * `0xffff`), and each entry packs the nibbles in reverse order.
 */
export type SonicDplcVer = 1 | 2 | 3;

export function readSonicDPLC(bytes: Uint8Array, ver: SonicDplcVer): number[][] {
  if (bytes.length < 2) return [];
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const firstOffset = dv.getUint16(0, false);
  if (firstOffset < 2 || firstOffset % 2 !== 0 || firstOffset > bytes.length) return [];

  const frameCount = firstOffset / 2;
  const hdr = ver === 1 ? 1 : 2;
  const out: number[][] = [];
  for (let f = 0; f < frameCount; f++) {
    const off = dv.getUint16(f * 2, false);
    const local: number[] = [];
    if (off + hdr <= bytes.length) {
      let count: number;
      if (ver === 1) count = bytes[off];
      else if (ver === 2) count = dv.getUint16(off, false);
      else count = (dv.getUint16(off, false) + 1) & 0xffff; // Ver 3 stores count-1
      let o = off + hdr;
      for (let e = 0; e < count && o + 2 <= bytes.length; e++) {
        const w = dv.getUint16(o, false);
        o += 2;
        const tiles = ver === 3 ? (w & 0xf) + 1 : ((w >> 12) & 0xf) + 1;
        const start = ver === 3 ? (w >> 4) & 0xfff : w & 0xfff;
        for (let t = 0; t < tiles; t++) local.push(start + t);
      }
    }
    out.push(local);
  }
  return out;
}

export function writeSonicDPLC(perFrameTiles: number[][], ver: SonicDplcVer): Uint8Array {
  const hdr = ver === 1 ? 1 : 2;
  const tableSize = perFrameTiles.length * 2;

  const blocks = perFrameTiles.map((tiles) => {
    const runs = groupDPLCRuns(tiles);
    const buf = new Uint8Array(hdr + runs.length * 2);
    const dv = new DataView(buf.buffer);
    if (ver === 1) buf[0] = runs.length & 0xff;
    else if (ver === 2) dv.setUint16(0, runs.length, false);
    else dv.setUint16(0, (runs.length - 1) & 0xffff, false); // Ver 3 stores count-1
    runs.forEach((r, i) => {
      const word = ver === 3
        ? ((r.start & 0xfff) << 4) | ((r.count - 1) & 0xf)
        : (((r.count - 1) & 0xf) << 12) | (r.start & 0xfff);
      dv.setUint16(hdr + i * 2, word & 0xffff, false);
    });
    return buf;
  });

  const body = tableSize + blocks.reduce((s, b) => s + b.length, 0);
  const total = body + (body & 1);
  const out = new Uint8Array(total);
  const dv = new DataView(out.buffer);
  let off = tableSize;
  perFrameTiles.forEach((_, i) => { dv.setUint16(i * 2, off, false); out.set(blocks[i], off); off += blocks[i].length; });
  return out;
}
