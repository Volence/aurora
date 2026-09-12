// What the CHANGED pixels look like ON SCREEN, not in the buffer.
//
// The map canvas has no background of its own (styles.canvas sets none), and its container
// is painted `--void: #0A0C12` (src/renderer/styles/theme.css), so what a viewer sees at a
// pixel is `src * a + void * (1 - a)`. This composites both builds' pixels over that ground
// and reports the largest per-channel difference a viewer could see.
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
    if (type === 'IHDR') { w = data.readUInt32BE(0); h = data.readUInt32BE(4); bitDepth = data[8]; colour = data[9]; interlace = data[12]; }
    else if (type === 'IDAT') idat.push(data);
    off += 12 + len;
  }
  if (bitDepth !== 8 || colour !== 6 || interlace !== 0) throw new Error(`${path}: unsupported PNG`);
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

const VOID = [0x0a, 0x0c, 0x12];
const over = (d, i) => { const a = d[i + 3] / 255; return [0, 1, 2].map((k) => d[i + k] * a + VOID[k] * (1 - a)); };

const [, , A, B] = process.argv;
const a = decode(A), b = decode(B);
let n = 0, maxDelta = 0, maxAt = null, sum = 0;
const hist = new Map();
for (let y = 0; y < a.h; y++) for (let x = 0; x < a.w; x++) {
  const i = (y * a.w + x) * 4;
  if (a.data[i] === b.data[i] && a.data[i + 1] === b.data[i + 1] && a.data[i + 2] === b.data[i + 2] && a.data[i + 3] === b.data[i + 3]) continue;
  n++;
  const pa = over(a.data, i), pb = over(b.data, i);
  const d = Math.max(...[0, 1, 2].map((k) => Math.abs(pa[k] - pb[k])));
  sum += d;
  const bucket = Math.round(d);
  hist.set(bucket, (hist.get(bucket) ?? 0) + 1);
  if (d > maxDelta) {
    maxDelta = d;
    maxAt = `(${x},${y}) master rgba ${a.data[i]},${a.data[i + 1]},${a.data[i + 2]},${a.data[i + 3]} -> fix ${b.data[i]},${b.data[i + 1]},${b.data[i + 2]},${b.data[i + 3]}; `
      + `on screen ${pa.map((v) => v.toFixed(1)).join(',')} -> ${pb.map((v) => v.toFixed(1)).join(',')}`;
  }
}
console.log(`${A.split('/').pop()} vs ${B.split('/').pop()}: ${n} changed pixel(s) of ${a.w * a.h}`);
console.log(`  ON SCREEN over --void #0A0C12: largest per-channel difference ${maxDelta.toFixed(1)} / 255, mean ${(sum / Math.max(n, 1)).toFixed(2)}`);
console.log(`  worst pixel: ${maxAt}`);
console.log(`  histogram of the on-screen difference (rounded): ${[...hist.entries()].sort((p, q) => p[0] - q[0]).map(([k, v]) => `${k}:${v}`).join(' ')}`);
