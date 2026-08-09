#!/usr/bin/env node
// Headless renderer for a classic (Sonic 1) act — opens a real s1disasm tree,
// reads a zone/act LevelDoc through the same ProjectAdapter the app uses, and
// composes a plane (FG or BG) into one RGBA image via the core `renderChunk`,
// then writes an 8-bit RGBA PNG.
//
// This is a verification harness (Task 11), NOT app/core code: it may use fs and
// it bundles the TypeScript core on the fly with esbuild (the core uses
// extensionless relative imports Node can't resolve directly). The composition
// logic here mirrors ClassicLevelViewport's exactly — same layout indexing
// (defensive min(cells.length, w*h)), same bit-7 loop-flag mask on chunk ids,
// same `renderChunk` — so a bad render points at the shared composition, not two
// separate code paths.
//
// Usage:
//   node scripts/render-classic-act.mjs --zone GHZ --act 1 --plane fg --out /path/x.png
//   node scripts/render-classic-act.mjs --zone GHZ --act 1 --plane fg \
//        --crop 0,0,4,3 --scale 4 --out /path/crop.png
//
// --crop cx,cy,cw,ch selects a chunk rectangle (in chunk units); --scale N
// nearest-neighbor upscales the output.

import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import * as zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(__dirname, '..');
const S1DIR = '/home/volence/sonic_hacks/s1disasm';
const CHUNK_PX = 256;

// ---------------------------------------------------------------------------
// Arg parsing
// ---------------------------------------------------------------------------
function parseArgs(argv) {
  const a = { zone: 'GHZ', act: 1, plane: 'fg', out: null, crop: null, scale: 1, objects: false };
  for (let i = 0; i < argv.length; i++) {
    const k = argv[i];
    const v = argv[i + 1];
    if (k === '--zone') { a.zone = v; i++; }
    else if (k === '--act') { a.act = Number(v); i++; }
    else if (k === '--plane') { a.plane = v; i++; }
    else if (k === '--out') { a.out = v; i++; }
    else if (k === '--crop') { a.crop = v.split(',').map(Number); i++; }
    else if (k === '--scale') { a.scale = Number(v); i++; }
    else if (k === '--objects') { a.objects = true; }
  }
  if (!a.out) throw new Error('--out <path> is required');
  return a;
}

// ---------------------------------------------------------------------------
// Bundle the core we need (adapter open + renderChunk) into a temp ESM module.
// ---------------------------------------------------------------------------
async function loadCore() {
  const entry = `
    export { s1Adapter } from ${JSON.stringify(path.join(REPO, 'src/core/project/s1/index.ts'))};
    export { renderChunk } from ${JSON.stringify(path.join(REPO, 'src/core/level-classic/render.ts'))};
    export { layoutCellAt, ringGroupPositions } from ${JSON.stringify(path.join(REPO, 'src/renderer/components/classic/viewport-math.ts'))};
    export { renderObjectFrameFromFiles, objectFrameRect } from ${JSON.stringify(path.join(REPO, 'src/core/level-classic/object-sprite.ts'))};
    export { resolveObjectArt } from ${JSON.stringify(path.join(REPO, 'src/core/project/profiles/s1-object-art.ts'))};
    export { indicesToRGBA } from ${JSON.stringify(path.join(REPO, 'src/core/art/sprite-render.ts'))};
    export { decodeGenesisColor } from ${JSON.stringify(path.join(REPO, 'src/core/formats/palette.ts'))};
  `;
  const outfile = path.join(os.tmpdir(), `classic-core-${process.pid}.mjs`);
  await build({
    stdin: { contents: entry, resolveDir: REPO, sourcefile: 'entry.ts', loader: 'ts' },
    bundle: true,
    platform: 'node',
    format: 'esm',
    outfile,
    logLevel: 'silent',
  });
  const mod = await import(`file://${outfile}`);
  fs.rmSync(outfile, { force: true });
  return mod;
}

// ---------------------------------------------------------------------------
// Node FileAccess rooted at a directory (mirrors the test helpers' realFs).
// ---------------------------------------------------------------------------
function realFs(root) {
  return {
    async exists(rel) { return fs.existsSync(path.join(root, rel)); },
    async read(rel) { return new Uint8Array(fs.readFileSync(path.join(root, rel))); },
    async list(rel) { return fs.readdirSync(path.join(root, rel)); },
  };
}

// ---------------------------------------------------------------------------
// Layout composition — uses the SHARED layoutCellAt bundled from viewport-math.ts
// (passed in), so the defensive min(cells.length, w*h) policy is defined once.
// ---------------------------------------------------------------------------
// Compose a chunk rectangle of a plane into a flat RGBA buffer.
function composePlane(doc, renderChunk, layoutCellAt, plane, crop) {
  const grid = plane === 'bg' ? doc.bg : doc.fg;
  const cx = crop ? crop[0] : 0;
  const cy = crop ? crop[1] : 0;
  const cw = crop ? crop[2] : grid.width;
  const ch = crop ? crop[3] : grid.height;
  const W = cw * CHUNK_PX;
  const H = ch * CHUNK_PX;
  const out = new Uint8ClampedArray(W * H * 4);
  // Solid dark backdrop so transparent chunk pixels read as "void", not garbage.
  for (let i = 0; i < out.length; i += 4) { out[i] = 10; out[i + 1] = 12; out[i + 2] = 18; out[i + 3] = 255; }

  const chunkCache = new Map();
  for (let row = 0; row < ch; row++) {
    for (let col = 0; col < cw; col++) {
      const cell = layoutCellAt(grid, cx + col, cy + row);
      if (cell === undefined) continue;
      const chunkId = cell & 0x7f; // strip S1's bit-7 loop flag
      let buf = chunkCache.get(chunkId);
      if (buf === undefined) { buf = renderChunk(doc, chunkId); chunkCache.set(chunkId, buf); }
      // Blit the 256x256 chunk over the backdrop (respect alpha for color 0).
      const ox = col * CHUNK_PX;
      const oy = row * CHUNK_PX;
      for (let y = 0; y < CHUNK_PX; y++) {
        for (let x = 0; x < CHUNK_PX; x++) {
          const so = (y * CHUNK_PX + x) * 4;
          if (buf[so + 3] === 0) continue; // transparent — keep backdrop
          const doff = ((oy + y) * W + (ox + x)) * 4;
          out[doff] = buf[so];
          out[doff + 1] = buf[so + 1];
          out[doff + 2] = buf[so + 2];
          out[doff + 3] = 255;
        }
      }
    }
  }
  return { data: out, width: W, height: H };
}

// ---------------------------------------------------------------------------
// Object overlay — draws the REAL object sprites onto the composed plane using
// the SAME core helpers the app viewport uses (resolveObjectArt linkage +
// renderObjectFrameFromFiles + objectFrameRect + palette). fs reads the art/map
// files (this is a harness). Ring groups ($25) expand per-ring.
// ---------------------------------------------------------------------------
function overlayObjects(img, doc, core, zone, crop) {
  const { renderObjectFrameFromFiles, objectFrameRect, resolveObjectArt, indicesToRGBA, decodeGenesisColor, ringGroupPositions } = core;
  const offX = crop ? crop[0] * CHUNK_PX : 0;
  const offY = crop ? crop[1] * CHUNK_PX : 0;
  const { data, width, height } = img;
  const RING_ID = 0x25;
  let linked = 0, unlinked = 0;

  // Cache rendered frames by `id` (all placements of an id share art/palette).
  const frameCache = new Map();
  const getFrame = (id) => {
    if (frameCache.has(id)) return frameCache.get(id);
    const link = resolveObjectArt(id, zone);
    let entry = null;
    if (link) {
      try {
        const artBytes = new Uint8Array(fs.readFileSync(path.join(S1DIR, link.artFile)));
        const mapText = fs.readFileSync(path.join(S1DIR, link.mapAsm), 'latin1');
        const f = renderObjectFrameFromFiles(mapText, artBytes, link.compression, link.frame);
        const colorsLine = doc.palettes[link.pal] ?? doc.palettes[0] ?? new Uint16Array(16);
        const colors = [];
        for (let i = 0; i < 16; i++) colors.push(decodeGenesisColor(colorsLine[i] ?? 0));
        const rgba = indicesToRGBA(f.indices, colors);
        entry = { rgba, width: f.width, height: f.height, originX: f.originX, originY: f.originY };
      } catch { entry = null; }
    }
    frameCache.set(id, entry);
    return entry;
  };

  // Blit one frame (flip-aware) with its top-left in world coords.
  const blitFrame = (frame, anchorX, anchorY, xflip, yflip) => {
    const rect = objectFrameRect(frame, anchorX, anchorY, xflip, yflip);
    const sx0 = Math.round(rect.left) - offX;
    const sy0 = Math.round(rect.top) - offY;
    for (let py = 0; py < frame.height; py++) {
      for (let px = 0; px < frame.width; px++) {
        const srcX = xflip ? frame.width - 1 - px : px;
        const srcY = yflip ? frame.height - 1 - py : py;
        const so = (srcY * frame.width + srcX) * 4;
        if (frame.rgba[so + 3] === 0) continue;
        const dx = sx0 + px, dy = sy0 + py;
        if (dx < 0 || dy < 0 || dx >= width || dy >= height) continue;
        const doff = (dy * width + dx) * 4;
        data[doff] = frame.rgba[so];
        data[doff + 1] = frame.rgba[so + 1];
        data[doff + 2] = frame.rgba[so + 2];
        data[doff + 3] = 255;
      }
    }
  };

  for (const obj of doc.objects) {
    const frame = getFrame(obj.id);
    if (!frame) { unlinked++; continue; }
    linked++;
    if (obj.id === RING_ID) {
      for (const p of ringGroupPositions(obj.subtype, obj.x, obj.y)) blitFrame(frame, p.x, p.y, obj.xflip, obj.yflip);
    } else {
      blitFrame(frame, obj.x, obj.y, obj.xflip, obj.yflip);
    }
  }
  return { linked, unlinked };
}

function scaleNearest(img, scale) {
  if (scale <= 1) return img;
  const W = img.width * scale;
  const H = img.height * scale;
  const out = new Uint8ClampedArray(W * H * 4);
  for (let y = 0; y < H; y++) {
    const sy = (y / scale) | 0;
    for (let x = 0; x < W; x++) {
      const sx = (x / scale) | 0;
      const so = (sy * img.width + sx) * 4;
      const doff = (y * W + x) * 4;
      out[doff] = img.data[so];
      out[doff + 1] = img.data[so + 1];
      out[doff + 2] = img.data[so + 2];
      out[doff + 3] = img.data[so + 3];
    }
  }
  return { data: out, width: W, height: H };
}

// ---------------------------------------------------------------------------
// Minimal 8-bit RGBA PNG encoder (no interlace), zlib via node:zlib.
// ---------------------------------------------------------------------------
function crc32(buf) {
  let c = ~0;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i];
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return ~c >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, 'latin1');
  const body = Buffer.concat([typeBuf, data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([len, body, crc]);
}
function encodePng(img) {
  const { width, height, data } = img;
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type RGBA
  ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0; // deflate / no filter / no interlace
  // Raw scanlines, each prefixed with filter byte 0.
  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0;
    Buffer.from(data.buffer, data.byteOffset + y * stride, stride).copy(raw, y * (stride + 1) + 1);
  }
  const idat = zlib.deflateSync(raw, { level: 6 });
  return Buffer.concat([sig, chunk('IHDR', ihdr), chunk('IDAT', idat), chunk('IEND', Buffer.alloc(0))]);
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!fs.existsSync(S1DIR)) throw new Error(`s1disasm not found at ${S1DIR}`);

  const core = await loadCore();
  const { s1Adapter, renderChunk, layoutCellAt } = core;
  const fa = realFs(S1DIR);
  const match = await s1Adapter.detect(fa);
  if (!match) throw new Error('s1disasm did not fingerprint as an S1 project');
  const handle = await s1Adapter.open(fa);
  const refs = handle.levels.list();
  const wantZone = args.zone.toLowerCase();
  const ref = refs.find((r) => r.zone.toLowerCase() === wantZone && r.act === args.act);
  if (!ref) throw new Error(`no such act ${args.zone}/${args.act}`);
  if (!ref.available) throw new Error(`act ${args.zone}/${args.act} unavailable: ${ref.reason}`);

  const doc = await handle.levels.read(ref);
  const grid = args.plane === 'bg' ? doc.bg : doc.fg;
  let img = composePlane(doc, renderChunk, layoutCellAt, args.plane, args.crop);
  let objStats = null;
  if (args.objects && args.plane === 'fg') {
    objStats = overlayObjects(img, doc, core, ref.zone, args.crop);
  }
  img = scaleNearest(img, args.scale);

  fs.mkdirSync(path.dirname(args.out), { recursive: true });
  fs.writeFileSync(args.out, encodePng(img));
  console.log(
    `${args.zone}${args.act} ${args.plane}: grid ${grid.width}x${grid.height} chunks, ` +
    `${doc.chunks.length} chunks / ${doc.blocks.length} blocks / ${doc.objects.length} objects → ` +
    `${img.width}x${img.height}px → ${args.out}` +
    (objStats ? ` [objects: ${objStats.linked} drawn / ${objStats.unlinked} hex-fallback]` : ''),
  );
}

main().catch((e) => { console.error(e); process.exit(1); });
