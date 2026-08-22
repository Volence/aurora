#!/usr/bin/env node
// probe-sonic-dplc-sharing — measure the S1 Sonic DPLC shared-pool structure
// (save-back parcel, docs/reviews/2026-08-20-s1-nonlevel-art-audit.md §5
// "Cross-cutting"). READ-ONLY over the real s1disasm; writes nothing anywhere.
//
// Question it answers, BEFORE any DPLC write-back code exists: for each tile of
// the shared source pool (artunc/Sonic.unc, 1289 tiles), how many of the 88
// mapping frames reference it — through the DPLC list (what the engine DMAs)
// and through actual mapping-piece coverage (what an edit through a frame's
// canvas can touch). The distribution decides the shared-edit UX contract.
//
// Uses Aurora's SHIPPED parsers (parseAsmMappings / parseAsmDPLC) bundled on
// the fly with esbuild, exactly like scripts/render-classic-act.mjs, so the
// numbers are measured through the same code the editor runs.
//
// Usage: node scripts/probe-sonic-dplc-sharing.mjs

import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(__dirname, '..');
const S1DIR = '/home/volence/sonic_hacks/s1disasm';

async function loadCore() {
  const entry = `
    export { parseAsmMappings, parseAsmDPLC } from ${JSON.stringify(path.join(REPO, 'src/core/import/asm-mappings.ts'))};
  `;
  const outfile = path.join(os.tmpdir(), `dplc-probe-core-${process.pid}.mjs`);
  await build({
    stdin: { contents: entry, resolveDir: REPO, sourcefile: 'entry.ts', loader: 'ts' },
    bundle: true, platform: 'node', format: 'esm', outfile, logLevel: 'silent',
  });
  const mod = await import(`file://${outfile}`);
  fs.rmSync(outfile, { force: true });
  return mod;
}

const { parseAsmMappings, parseAsmDPLC } = await loadCore();

const mapText = fs.readFileSync(path.join(S1DIR, '_maps/Sonic.asm'), 'utf8');
const dplcText = fs.readFileSync(path.join(S1DIR, '_maps/Sonic - Dynamic Gfx Script.asm'), 'utf8');
const artBytes = fs.readFileSync(path.join(S1DIR, 'artunc/Sonic.unc'));

const frames = parseAsmMappings(mapText);
const dplc = parseAsmDPLC(dplcText);
const poolTiles = Math.floor(artBytes.length / 32);
console.log(`frames=${frames.length} dplcEntries=${dplc.length} poolBytes=${artBytes.length} poolTiles=${poolTiles} (bytes%32=${artBytes.length % 32})`);

// Per-frame COVERED pool tiles: walk each mapping piece's cell grid exactly as
// renderFrameToIndices does (VDP column-major p.tile + col*heightCells + row),
// resolving each frame-local index through that frame's DPLC list.
function coveredPoolTiles(frame, list) {
  const out = new Set();
  for (const p of frame.pieces) {
    for (let c = 0; c < p.widthCells; c++) {
      for (let r = 0; r < p.heightCells; r++) {
        const local = p.tile + c * p.heightCells + r;
        const src = list[local];
        if (src !== undefined) out.add(src);
      }
    }
  }
  return out;
}

const byDplc = new Map();    // pool tile -> Set(frame ids) via DPLC list membership
const byCover = new Map();   // pool tile -> Set(frame ids) via piece coverage
for (let f = 0; f < frames.length; f++) {
  const list = dplc[f] ?? [];
  for (const t of new Set(list)) {
    if (!byDplc.has(t)) byDplc.set(t, new Set());
    byDplc.get(t).add(f);
  }
  for (const t of coveredPoolTiles(frames[f], list)) {
    if (!byCover.has(t)) byCover.set(t, new Set());
    byCover.get(t).add(f);
  }
}

function histogram(map, label) {
  const hist = new Map(); // refcount -> tile count
  for (const set of map.values()) hist.set(set.size, (hist.get(set.size) ?? 0) + 1);
  const keys = [...hist.keys()].sort((a, b) => a - b);
  console.log(`\n${label}: ${map.size} of ${poolTiles} pool tiles referenced`);
  for (const k of keys) console.log(`  referenced by ${String(k).padStart(2)} frame(s): ${hist.get(k)} tiles`);
  const shared = [...map.entries()].filter(([, s]) => s.size > 1);
  console.log(`  shared (>1 frame): ${shared.length} tiles across ${new Set(shared.flatMap(([, s]) => [...s])).size} frames`);
  return shared;
}

histogram(byDplc, 'DPLC-list references (what the engine DMAs per frame)');
const sharedCover = histogram(byCover, 'Piece-COVERED references (what an edit through a frame can touch)');

// Frame-local duplicate loads: a pool tile appearing twice in ONE frame's DPLC
// list (would make within-frame inverse writes order-dependent).
let dupFrames = 0;
for (let f = 0; f < dplc.length; f++) {
  const list = dplc[f] ?? [];
  if (new Set(list).size !== list.length) { dupFrames++; console.log(`frame ${f}: DUPLICATE pool tiles within its own DPLC list`); }
}
console.log(`\nframes with duplicate pool tiles in their own list: ${dupFrames}`);

// The concrete shared examples (covered-tier) — the write-back tests derive
// their co-affected expectations from this structure at runtime; these prints
// are the human-readable report.
sharedCover.sort((a, b) => b[1].size - a[1].size);
console.log('\nTop shared covered tiles (pool tile: frames):');
for (const [t, s] of sharedCover.slice(0, 12)) {
  console.log(`  tile ${t} ($${t.toString(16)}): frames [${[...s].sort((a, b) => a - b).join(', ')}]`);
}

// Whole-frame sharing relations: which frame PAIRS share covered tiles.
const pairCounts = new Map();
for (const [, s] of sharedCover) {
  const arr = [...s].sort((a, b) => a - b);
  for (let i = 0; i < arr.length; i++) for (let j = i + 1; j < arr.length; j++) {
    const k = `${arr[i]}+${arr[j]}`;
    pairCounts.set(k, (pairCounts.get(k) ?? 0) + 1);
  }
}
console.log(`\nframe pairs sharing >=1 covered tile: ${pairCounts.size}`);
const pairs = [...pairCounts.entries()].sort((a, b) => b[1] - a[1]);
for (const [k, n] of pairs.slice(0, 12)) console.log(`  frames ${k}: ${n} shared tiles`);

// Are shared tiles IDENTICAL across their referencing frames? Trivially yes at
// the pool level (one physical tile) — the question that matters for the UX
// contract is only surfaced counts above. But also check: do any two frames'
// DPLC lists map the SAME local slot index to different pool tiles while their
// mappings share piece geometry? Not needed for the contract; skipped.
