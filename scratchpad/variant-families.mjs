#!/usr/bin/env node
// READ-ONLY probe: does Sonic 1's shipped level art look like FAMILIES OF VARIANTS?
//
// The open design question is whether the real authoring loop is bottom-up
// (draw tile -> compose block -> compose chunk) or "clone the nearest thing and
// diverge" (duplicate a chunk, duplicate the blocks you must change, edit those).
//
// If clone-and-diverge produced this data, the signature is near-duplicates:
// chunks whose nearest neighbour differs in a handful of the 256 block cells,
// blocks differing in one of four tile cells or only in flip/palette flags, and
// tiles differing in a few pixels. If composition were genuinely from-scratch
// bottom-up, near-neighbours would be rare and distances would be broad.
//
// Reads a real s1disasm tree through the SAME s1Adapter the app uses. Writes
// nothing but its own report.

import { AURORA_DIR, siblingPathOrUnresolved } from '../test/support/sibling-root.mjs';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO = AURORA_DIR;
const S1DIR = siblingPathOrUnresolved('s1disasm');

async function loadCore() {
  const entry = `
    export { s1Adapter } from ${JSON.stringify(path.join(REPO, 'src/core/project/s1/index.ts'))};
    export { buildUsageIndex } from ${JSON.stringify(path.join(REPO, 'src/core/level-classic/usage-index.ts'))};
    export { chunkIndexForId, packBlockCell, packChunkCell } from ${JSON.stringify(path.join(REPO, 'src/core/level-classic/model.ts'))};
  `;
  const outfile = path.join(os.tmpdir(), `variant-core-${process.pid}.mjs`);
  await build({
    stdin: { contents: entry, resolveDir: REPO, sourcefile: 'entry.ts', loader: 'ts' },
    bundle: true, platform: 'node', format: 'esm', outfile, logLevel: 'silent',
  });
  const mod = await import(`file://${outfile}`);
  fs.rmSync(outfile, { force: true });
  return mod;
}

function realFs(root) {
  return {
    async exists(rel) { return fs.existsSync(path.join(root, rel)); },
    async read(rel) { return new Uint8Array(fs.readFileSync(path.join(root, rel))); },
    async list(rel) { return fs.readdirSync(path.join(root, rel)); },
  };
}

// --- distance helpers --------------------------------------------------------

// Chunk distance = number of the 256 cells that differ. Two flavours:
//  - full:  block id AND flags (xflip/yflip/solidity) must match
//  - blocks-only: only the block id must match (flag-only variants collapse)
// NOTE the real field names: ChunkCell = {block,xf,yf,solidity}, BlockCell =
// {tile,xf,yf,pal,pri}. An earlier revision of this probe compared `xflip`/
// `palette`/`priority`, which are undefined on both sides and therefore always
// compared equal — silently collapsing "full" into "ids". Keep these aligned
// with src/core/level-classic/model.ts.
function chunkDistances(a, b) {
  let full = 0, ids = 0;
  const n = Math.min(a.cells.length, b.cells.length);
  for (let i = 0; i < n; i++) {
    const ca = a.cells[i], cb = b.cells[i];
    if (ca.block !== cb.block) { ids++; full++; continue; }
    if (ca.xf !== cb.xf || ca.yf !== cb.yf || ca.solidity !== cb.solidity) full++;
  }
  return { full, ids };
}

function blockDistances(a, b) {
  let full = 0, ids = 0;
  for (let i = 0; i < 4; i++) {
    const ca = a.cells[i], cb = b.cells[i];
    if (ca.tile !== cb.tile) { ids++; full++; continue; }
    if (ca.xf !== cb.xf || ca.yf !== cb.yf || ca.pal !== cb.pal || ca.pri !== cb.pri) full++;
  }
  return { full, ids };
}

// Exact art signature of a block (all four cells, every field).
function blockArtKey(b) {
  return b.cells.map((c) => `${c.tile}:${c.xf ? 1 : 0}${c.yf ? 1 : 0}:${c.pal}:${c.pri ? 1 : 0}`).join('|');
}

// Tiles are 4bpp, 32 bytes = 64 pixels.
function tilePixels(pool, index) {
  const out = new Uint8Array(64);
  const base = index * 32;
  for (let i = 0; i < 32; i++) {
    const b = pool[base + i] ?? 0;
    out[i * 2] = b >> 4;
    out[i * 2 + 1] = b & 0x0f;
  }
  return out;
}

function pixelDistance(a, b) {
  let d = 0;
  for (let i = 0; i < 64; i++) if (a[i] !== b[i]) d++;
  return d;
}

function histogram(values, buckets) {
  const h = new Map();
  for (const v of values) {
    const label = buckets.find((bk) => v <= bk.max)?.label ?? '?';
    h.set(label, (h.get(label) ?? 0) + 1);
  }
  return buckets.map((bk) => `${bk.label}:${h.get(bk.label) ?? 0}`).join('  ');
}

// --- per-zone analysis -------------------------------------------------------

function analyseZone(zone, doc, core) {
  const idx = core.buildUsageIndex(doc);

  // Only consider chunks that are actually PLACED in this act's layout, and
  // blocks actually referenced by a placed chunk. Unused slots are padding and
  // would fake a huge duplicate population.
  const placedIds = [...idx.chunkPlacements.keys()];
  const placedChunkIdx = [];
  for (const id of placedIds) {
    const ci = core.chunkIndexForId(doc, id);
    if (ci !== null && doc.chunks[ci]) placedChunkIdx.push(ci);
  }
  const usedBlocks = [...idx.blockToChunks.keys()].filter((b) => doc.blocks[b]);
  const usedTiles = [...idx.tileToBlocks.keys()];

  // ---- chunk nearest-neighbour ----
  const chunkNN = [];
  let chunkExactFull = 0, chunkExactIds = 0;
  for (let i = 0; i < placedChunkIdx.length; i++) {
    let best = Infinity, bestIds = Infinity, bestJ = -1;
    for (let j = 0; j < placedChunkIdx.length; j++) {
      if (i === j) continue;
      const d = chunkDistances(doc.chunks[placedChunkIdx[i]], doc.chunks[placedChunkIdx[j]]);
      if (d.full < best) { best = d.full; bestJ = placedChunkIdx[j]; }
      if (d.ids < bestIds) bestIds = d.ids;
    }
    if (best === 0) chunkExactFull++;
    if (bestIds === 0) chunkExactIds++;
    chunkNN.push({ chunk: placedChunkIdx[i], nn: bestJ, dist: best, idDist: bestIds });
  }

  // ---- block nearest-neighbour ----
  const blockNN = [];
  let blockExactFull = 0, blockFlagOnly = 0;
  for (let i = 0; i < usedBlocks.length; i++) {
    let best = Infinity, bestIds = Infinity, bestJ = -1;
    for (let j = 0; j < usedBlocks.length; j++) {
      if (i === j) continue;
      const d = blockDistances(doc.blocks[usedBlocks[i]], doc.blocks[usedBlocks[j]]);
      if (d.full < best) { best = d.full; bestJ = usedBlocks[j]; }
      if (d.ids < bestIds) bestIds = d.ids;
    }
    if (best === 0) blockExactFull++;
    if (best > 0 && bestIds === 0) blockFlagOnly++;
    blockNN.push({ block: usedBlocks[i], nn: bestJ, dist: best, idDist: bestIds });
  }

  // ---- tile nearest-neighbour (pixel level) ----
  const pool = doc.tiles ?? doc.tilePixels ?? null;
  let tileNN = null;
  if (pool && pool.length) {
    const px = new Map();
    for (const t of usedTiles) px.set(t, tilePixels(pool, t));
    tileNN = [];
    for (let i = 0; i < usedTiles.length; i++) {
      const a = px.get(usedTiles[i]);
      let best = Infinity;
      for (let j = 0; j < usedTiles.length; j++) {
        if (i === j) continue;
        const d = pixelDistance(a, px.get(usedTiles[j]));
        if (d < best) { best = d; if (best === 0) break; }
      }
      tileNN.push({ tile: usedTiles[i], dist: best });
    }
  }

  // ---- art-identical block families, and whether COLLISION is what separates
  // them. In S1 a block's collision shape is a SEPARATE table (colind, indexed by
  // block id), so two blocks can draw identically and collide differently — which
  // would make collision, not art, the reason a variant exists.
  const colind = doc.collision?.colind;
  const families = new Map(); // artKey -> block ids
  for (const b of usedBlocks) {
    const k = blockArtKey(doc.blocks[b]);
    let arr = families.get(k);
    if (!arr) { arr = []; families.set(k, arr); }
    arr.push(b);
  }
  const dupFamilies = [...families.values()].filter((a) => a.length > 1);
  let artDupBlocks = 0, dupSameCollision = 0, dupDiffCollision = 0;
  for (const fam of dupFamilies) {
    artDupBlocks += fam.length;
    const cols = new Set(fam.map((b) => (colind ? colind[b] : 0)));
    if (cols.size === 1) dupSameCollision += fam.length; else dupDiffCollision += fam.length;
  }

  const sanity = { bxf: 0, byf: 0, bpri: 0, bcells: 0, cxf: 0, cyf: 0, csol: 0, ccells: 0, ncol: 0 };
  for (const b of usedBlocks) {
    for (const c of doc.blocks[b].cells) {
      sanity.bcells++;
      if (c.xf) sanity.bxf++;
      if (c.yf) sanity.byf++;
      if (c.pri) sanity.bpri++;
    }
  }
  for (const ci of placedChunkIdx) {
    for (const c of doc.chunks[ci].cells) {
      sanity.ccells++;
      if (c.xf) sanity.cxf++;
      if (c.yf) sanity.cyf++;
      if (c.solidity) sanity.csol++;
    }
  }
  sanity.ncol = colind ? new Set(usedBlocks.map((b) => colind[b])).size : 0;

  return { zone, idx, placedChunkIdx, usedBlocks, usedTiles, chunkNN, blockNN, tileNN,
    chunkExactFull, chunkExactIds, blockExactFull, blockFlagOnly, sanity,
    dupFamilies, artDupBlocks, dupSameCollision, dupDiffCollision, hasColind: !!colind };
}

function report(r) {
  const nChunks = r.placedChunkIdx.length, nBlocks = r.usedBlocks.length, nTiles = r.usedTiles.length;
  const lines = [];
  lines.push(`\n=== ${r.zone} — ${nChunks} placed chunks / ${nBlocks} used blocks / ${nTiles} used tiles ===`);
  // SANITY: if these are all zero the field names are wrong again and every
  // flag comparison above is silently inert. Non-zero is the proof the fix took.
  lines.push(`sanity — block cells xf/yf/pri set: ${r.sanity.bxf}/${r.sanity.byf}/${r.sanity.bpri}` +
    ` of ${r.sanity.bcells}; chunk cells xf/yf/solid: ${r.sanity.cxf}/${r.sanity.cyf}/${r.sanity.csol}` +
    ` of ${r.sanity.ccells}; distinct colind on used blocks: ${r.sanity.ncol}`);

  const cBuckets = [
    { max: 0, label: 'identical' }, { max: 2, label: '1-2' }, { max: 4, label: '3-4' },
    { max: 8, label: '5-8' }, { max: 16, label: '9-16' }, { max: 32, label: '17-32' },
    { max: 64, label: '33-64' }, { max: Infinity, label: '65+' },
  ];
  lines.push(`chunk NN distance (of 256 cells, id+flags): ${histogram(r.chunkNN.map((x) => x.dist), cBuckets)}`);
  lines.push(`chunk NN distance (block ids only)        : ${histogram(r.chunkNN.map((x) => x.idDist), cBuckets)}`);
  const near = r.chunkNN.filter((x) => x.dist > 0 && x.dist <= 8);
  lines.push(`  chunks with a nearest neighbour <=8 cells away (non-identical): ${near.length}/${nChunks}` +
    ` (${((near.length / Math.max(1, nChunks)) * 100).toFixed(0)}%)`);
  lines.push(`  exactly-identical placed chunks (id+flags): ${r.chunkExactFull}; identical ignoring flags: ${r.chunkExactIds}`);
  const ex = near.slice(0, 6).map((x) => `#${x.chunk}~#${x.nn}:${x.dist}`).join(' ');
  if (ex) lines.push(`  examples: ${ex}`);

  const bBuckets = [
    { max: 0, label: 'identical' }, { max: 1, label: '1' }, { max: 2, label: '2' },
    { max: 3, label: '3' }, { max: Infinity, label: '4' },
  ];
  lines.push(`block NN distance (of 4 cells, id+flags)  : ${histogram(r.blockNN.map((x) => x.dist), bBuckets)}`);
  lines.push(`block NN distance (tile ids only)         : ${histogram(r.blockNN.map((x) => x.idDist), bBuckets)}`);
  lines.push(`  identical used blocks: ${r.blockExactFull}; differing ONLY in flip/palette/priority: ${r.blockFlagOnly}`);
  lines.push(`  art-identical families: ${r.dupFamilies.length} covering ${r.artDupBlocks} blocks` +
    ` (${((r.artDupBlocks / Math.max(1, nBlocks)) * 100).toFixed(0)}% of used blocks)` +
    (r.hasColind
      ? ` — of those, ${r.dupSameCollision} are TRUE duplicates (same collision) and ${r.dupDiffCollision} differ ONLY in collision`
      : ` — NO colind on doc, collision not checked`));

  if (r.tileNN) {
    const tBuckets = [
      { max: 0, label: 'identical' }, { max: 2, label: '1-2px' }, { max: 6, label: '3-6px' },
      { max: 16, label: '7-16px' }, { max: 32, label: '17-32px' }, { max: Infinity, label: '33+px' },
    ];
    lines.push(`tile NN pixel distance (of 64 px)         : ${histogram(r.tileNN.map((x) => x.dist), tBuckets)}`);
  } else {
    lines.push(`tile NN pixel distance: SKIPPED (no tile pool field found on doc)`);
  }

  // Sharing recap so the two measurements sit side by side.
  const blockCont = r.usedBlocks.map((b) => r.idx.blockUsage(b).containers);
  const tileCont = r.usedTiles.map((t) => r.idx.tileUsage(t).containers);
  const share = [{ max: 1, label: '1' }, { max: 2, label: '2' }, { max: 4, label: '3-4' },
    { max: 8, label: '5-8' }, { max: 16, label: '9-16' }, { max: Infinity, label: '17+' }];
  lines.push(`tile -> #blocks  : ${histogram(tileCont, share)}   max=${Math.max(0, ...tileCont)}`);
  lines.push(`block -> #chunks : ${histogram(blockCont, share)}   max=${Math.max(0, ...blockCont)}`);
  return lines.join('\n');
}

async function main() {
  if (!fs.existsSync(S1DIR)) throw new Error(`s1disasm not found at ${S1DIR}`);
  const core = await loadCore();
  const fa = realFs(S1DIR);
  const handle = await core.s1Adapter.open(fa);
  const refs = handle.levels.list().filter((r) => r.available);

  // One act per zone — chunk/block sets are per-zone.
  const seen = new Set();
  const out = [];
  for (const ref of refs) {
    if (seen.has(ref.zone)) continue;
    seen.add(ref.zone);
    let doc;
    try { doc = await handle.levels.read(ref); }
    catch (e) { out.push(`\n=== ${ref.zone} — READ FAILED: ${e.message}`); continue; }
    // Show which field actually carries the tile pool the first time through.
    if (out.length === 0) {
      out.push(`doc fields: ${Object.keys(doc).join(', ')}`);
    }
    out.push(report(analyseZone(`${ref.zone} act ${ref.act}`, doc, core)));
  }
  console.log(out.join('\n'));
}

main().catch((e) => { console.error(e); process.exit(1); });
