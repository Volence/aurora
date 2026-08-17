#!/usr/bin/env node
// READ-ONLY: pool sizes vs the S1 format's hard caps, per zone. Auto-forking a
// shared block on edit (the Aseprite "Auto" contract) SPENDS pool budget, so the
// headroom is what decides whether that policy is affordable here.
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { build } from 'esbuild';

const REPO = process.env.AURORA_REPO ?? '/home/volence/sonic_hacks/aurora/.claude/worktrees/ux-plan6';
const S1DIR = '/home/volence/sonic_hacks/s1disasm';

const MAX_BLOCKS = 0x400;       // model.ts MAX_BLOCKS — 10-bit block field
const MAX_CHUNKS_DECL = 256;    // model.ts MAX_CHUNKS — "one byte"
const MAX_CHUNKS_ADDRESSABLE = 127; // layout masks bit 7 as S1's loop flag (&0x7f)

async function loadCore() {
  const entry = `
    export { s1Adapter } from ${JSON.stringify(path.join(REPO, 'src/core/project/s1/index.ts'))};
    export { buildUsageIndex } from ${JSON.stringify(path.join(REPO, 'src/core/level-classic/usage-index.ts'))};
  `;
  const outfile = path.join(os.tmpdir(), `headroom-core-${process.pid}.mjs`);
  await build({ stdin: { contents: entry, resolveDir: REPO, sourcefile: 'entry.ts', loader: 'ts' },
    bundle: true, platform: 'node', format: 'esm', outfile, logLevel: 'silent' });
  const mod = await import(`file://${outfile}`);
  fs.rmSync(outfile, { force: true });
  return mod;
}
const realFs = (root) => ({
  async exists(rel) { return fs.existsSync(path.join(root, rel)); },
  async read(rel) { return new Uint8Array(fs.readFileSync(path.join(root, rel))); },
  async list(rel) { return fs.readdirSync(path.join(root, rel)); },
});

const core = await loadCore();
const handle = await core.s1Adapter.open(realFs(S1DIR));
const seen = new Set();
console.log('zone   blocks(pool/used/cap)   chunks(pool/placed/cap)   tiles(pool/used)   blocks used once');
for (const ref of handle.levels.list().filter((r) => r.available)) {
  if (seen.has(ref.zone)) continue;
  seen.add(ref.zone);
  const doc = await handle.levels.read(ref);
  const idx = core.buildUsageIndex(doc);
  const usedBlocks = [...idx.blockToChunks.keys()];
  const once = usedBlocks.filter((b) => idx.blockUsage(b).cells === 1).length;
  const tilePool = Math.floor(doc.tiles.length / 32);
  console.log(
    `${ref.zone.padEnd(5)}  ${String(doc.blocks.length).padStart(4)}/${String(usedBlocks.length).padStart(4)}/${MAX_BLOCKS}` +
    `   headroom ${String(MAX_BLOCKS - doc.blocks.length).padStart(4)}` +
    `   ${String(doc.chunks.length).padStart(3)}/${String(idx.chunkPlacements.size).padStart(3)}/${MAX_CHUNKS_ADDRESSABLE}` +
    ` (decl ${MAX_CHUNKS_DECL})  headroom ${String(MAX_CHUNKS_ADDRESSABLE - doc.chunks.length).padStart(4)}` +
    `   ${String(tilePool).padStart(4)}/${String(idx.tileToBlocks.size).padStart(4)}` +
    `   ${once}/${usedBlocks.length} (${((once / usedBlocks.length) * 100).toFixed(0)}%)`,
  );
}
