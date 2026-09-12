// Minimal PNG (8-bit RGBA, colour type 6, no interlace) decoder, to say EXACTLY which
// pixels differ between two captures and by how much. Used once, for the packet.
import { readFileSync } from 'node:fs';
import { inflateSync } from 'node:zlib';

function decode(path) {
  const b = readFileSync(path);
  let off = 8; let w = 0, h = 0, bitDepth = 0, colour = 0, interlace = 0;
  const idat = [];
  while (off < b.length) {
    const len = b.readUInt32BE(off);
    const type = b.toString('ascii', off + 4, off + 8);
    const data = b.subarray(off + 8, off + 8 + len);
    if (type === 'IHDR') {
      w = data.readUInt32BE(0); h = data.readUInt32BE(4);
      bitDepth = data[8]; colour = data[9]; interlace = data[12];
    } else if (type === 'IDAT') idat.push(data);
    off += 12 + len;
  }
  if (bitDepth !== 8 || colour !== 6 || interlace !== 0) {
    throw new Error(`${path}: unsupported PNG (bitDepth ${bitDepth}, colour ${colour}, interlace ${interlace})`);
  }
  const raw = inflateSync(Buffer.concat(idat));
  const bpp = 4, stride = w * bpp;
  const out = Buffer.alloc(h * stride);
  let p = 0;
  for (let y = 0; y < h; y++) {
    const filter = raw[p++];
    const line = raw.subarray(p, p + stride); p += stride;
    const cur = out.subarray(y * stride, (y + 1) * stride);
    const prev = y > 0 ? out.subarray((y - 1) * stride, y * stride) : null;
    for (let x = 0; x < stride; x++) {
      const a = x >= bpp ? cur[x - bpp] : 0;
      const bb = prev ? prev[x] : 0;
      const c = (prev && x >= bpp) ? prev[x - bpp] : 0;
      let v = line[x];
      if (filter === 1) v += a;
      else if (filter === 2) v += bb;
      else if (filter === 3) v += (a + bb) >> 1;
      else if (filter === 4) {
        const pp = a + bb - c, pa = Math.abs(pp - a), pb = Math.abs(pp - bb), pc = Math.abs(pp - c);
        v += (pa <= pb && pa <= pc) ? a : (pb <= pc ? bb : c);
      }
      cur[x] = v & 0xff;
    }
  }
  return { w, h, data: out };
}

const [, , A, B] = process.argv;
const a = decode(A), b = decode(B);
if (a.w !== b.w || a.h !== b.h) { console.log(`size differs: ${a.w}x${a.h} vs ${b.w}x${b.h}`); process.exit(1); }
let n = 0; const cols = new Set(), rows = new Set(); const samples = []; const deltas = new Map();
for (let y = 0; y < a.h; y++) {
  for (let x = 0; x < a.w; x++) {
    const i = (y * a.w + x) * 4;
    if (a.data[i] === b.data[i] && a.data[i + 1] === b.data[i + 1] && a.data[i + 2] === b.data[i + 2] && a.data[i + 3] === b.data[i + 3]) continue;
    n++; cols.add(x); rows.add(y);
    const key = `${a.data[i]},${a.data[i + 1]},${a.data[i + 2]},${a.data[i + 3]} -> ${b.data[i]},${b.data[i + 1]},${b.data[i + 2]},${b.data[i + 3]}`;
    deltas.set(key, (deltas.get(key) ?? 0) + 1);
    if (samples.length < 4) samples.push(`(${x},${y}) ${key}`);
  }
}
const lastColOnly = [...cols].every((x) => x === a.w - 1);
const lastRowOnly = [...rows].every((y) => y === a.h - 1);
let outside = 0;
for (const x of cols) for (const y of rows) { /* counted below instead */ void x; void y; }
outside = 0;
for (let y = 0; y < a.h; y++) for (let x = 0; x < a.w; x++) {
  if (x === a.w - 1 || y === a.h - 1) continue;
  const i = (y * a.w + x) * 4;
  if (a.data[i] !== b.data[i] || a.data[i + 1] !== b.data[i + 1] || a.data[i + 2] !== b.data[i + 2] || a.data[i + 3] !== b.data[i + 3]) outside++;
}
console.log(`${A.split('/').pop()} vs ${B.split('/').pop()}: ${a.w}x${a.h}, ${n} differing pixel(s)`);
console.log(`  columns touched ${cols.size} (only the last column: ${lastColOnly}); rows touched ${rows.size} (only the last row: ${lastRowOnly})`);
console.log(`  differing pixels OUTSIDE the last column and last row: ${outside}`);
console.log(`  samples: ${samples.join(' | ')}`);
const top = [...deltas.entries()].sort((p, q) => q[1] - p[1]).slice(0, 8);
console.log(`  ${deltas.size} distinct RGBA transitions; commonest:`);
for (const [k, v] of top) console.log(`    ${v.toString().padStart(5)} x  ${k}`);
