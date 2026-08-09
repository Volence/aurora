#!/usr/bin/env node
// verify-s1-roundtrip — the M5 acceptance gate (Task 13, spec §3 M5).
//
// Proves the FULL Aurora classic (Sonic 1) edit → save → ROM pipeline end to end:
// a headless edit driven through the SAME core code the UI uses (s1Adapter open +
// levels.read/write + the main-process performGuardedWrite) lands in a rebuilt ROM
// exactly where the layout lives, and nowhere else but the checksum.
//
// SAFETY: never touches the real disasm. It copies /home/volence/sonic_hacks/
// s1disasm into the scratchpad and operates only on that copy. Two builds of the
// SAME copy control for any build nondeterminism: build once unedited (baseline
// ROM), apply the edit, rebuild (edited ROM), diff.
//
// This harness may use fs and bundles the TypeScript core on the fly with esbuild
// (the core uses extensionless relative imports Node can't resolve directly) — it
// mirrors scripts/render-classic-act.mjs's loader.
//
// Usage: node scripts/verify-s1-roundtrip.mjs
//   Exit 0 = PASS, 1 = FAIL (or an honest build/toolchain failure, reported).

import * as fs from 'node:fs';
import * as path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(__dirname, '..');
const S1DIR = '/home/volence/sonic_hacks/s1disasm';
const SCRATCH =
  '/tmp/claude-1000/-home-volence-sonic-hacks-aurora/f87d5d2e-4db0-467e-8e74-11d9672d1a09/scratchpad';
const WORK = path.join(SCRATCH, 's1disasm-verify');
const BASELINE_ROM = path.join(SCRATCH, 's1-baseline.bin');
const EDITED_ROM = path.join(SCRATCH, 's1-edited.bin');

// ROM header fields the build's fix_header rewrites (see build_tools/lua/common.lua).
const CHECKSUM_OFF = 0x18e; // 2 bytes
const ROMEND_OFF = 0x1a4; // 4 bytes

function log(...a) { console.log(...a); }
function fail(msg) { log(`\nFAIL: ${msg}`); process.exit(1); }

// ---------------------------------------------------------------------------
// Bundle the core we drive: adapter open + the main-process guarded write.
// ---------------------------------------------------------------------------
async function loadCore() {
  const entry = `
    export { s1Adapter } from ${JSON.stringify(path.join(REPO, 'src/core/project/s1/index.ts'))};
    export { performGuardedWrite } from ${JSON.stringify(path.join(REPO, 'src/main/guarded-write.ts'))};
  `;
  const outfile = path.join(SCRATCH, `verify-core-${process.pid}.mjs`);
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

// Node FileAccess rooted at a directory (mirrors the app's createIpcFileAccess and
// the test helpers' realFs, adding mtime for the guarded save's baseline).
function realFs(root) {
  return {
    async exists(rel) { return fs.existsSync(path.join(root, rel)); },
    async read(rel) { return new Uint8Array(fs.readFileSync(path.join(root, rel))); },
    async list(rel) { return fs.readdirSync(path.join(root, rel)); },
    async mtime(rel) {
      try { return fs.statSync(path.join(root, rel)).mtimeMs; } catch { return null; }
    },
  };
}

function buildRom(dir) {
  // The disasm's own Lua build: native asl + p2bin from build_tools/Linux-*, then
  // fix_header. Throws (caught by caller) on a nonzero exit.
  execFileSync('lua', ['build.lua'], { cwd: dir, stdio: 'pipe' });
  const rom = path.join(dir, 's1built.bin');
  if (!fs.existsSync(rom)) throw new Error('build.lua produced no s1built.bin');
  return new Uint8Array(fs.readFileSync(rom));
}

/** All byte offsets where two equal-length buffers differ. */
function diffOffsets(a, b) {
  const out = [];
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) if (a[i] !== b[i]) out.push(i);
  return out;
}

/** Collapse a sorted offset list into [start,end] inclusive ranges. */
function toRanges(offsets) {
  const ranges = [];
  for (const o of offsets) {
    const last = ranges[ranges.length - 1];
    if (last && o === last[1] + 1) last[1] = o;
    else ranges.push([o, o]);
  }
  return ranges;
}

/** First offset of `needle` in `hay` (or -1). */
function indexOfBytes(hay, needle) {
  outer: for (let i = 0; i + needle.length <= hay.length; i++) {
    for (let j = 0; j < needle.length; j++) if (hay[i + j] !== needle[j]) continue outer;
    return i;
  }
  return -1;
}

async function main() {
  log('=== Aurora S1 ROM round-trip verification (M5 gate) ===\n');
  if (!fs.existsSync(S1DIR)) fail(`s1disasm not found at ${S1DIR}`);
  fs.mkdirSync(SCRATCH, { recursive: true });

  // 1. Work on a fresh COPY — never the real disasm.
  log(`[1] Copying ${S1DIR} -> ${WORK} (temp copy; real disasm untouched)`);
  fs.rmSync(WORK, { recursive: true, force: true });
  fs.cpSync(S1DIR, WORK, { recursive: true });

  // 2. Baseline build (unedited copy).
  log('[2] Building BASELINE ROM (unedited copy) via `lua build.lua`…');
  let baseline;
  try {
    baseline = buildRom(WORK);
  } catch (e) {
    fail(
      'baseline build failed — the s1disasm toolchain did not run here.\n' +
        `  command: lua build.lua (cwd ${WORK})\n  error: ${e.message}\n` +
        (e.stdout ? `  stdout tail:\n${String(e.stdout).slice(-1200)}\n` : '') +
        (e.stderr ? `  stderr tail:\n${String(e.stderr).slice(-1200)}\n` : '') +
        '  NOTE: byte-level write verification (s1-io goldens + the store command\n' +
        '  tests) still proves Aurora\'s half; only the ROM-embed check is blocked.',
    );
  }
  fs.writeFileSync(BASELINE_ROM, baseline);
  log(`    baseline ROM: ${baseline.length} bytes -> ${BASELINE_ROM}`);

  // 3. Headless edit through the SAME core the UI uses.
  log('[3] Opening the copy via s1Adapter and editing GHZ1 FG layout…');
  const { s1Adapter, performGuardedWrite } = await loadCore();
  const fa = realFs(WORK);
  const detect = await s1Adapter.detect(fa);
  if (!detect || detect.type !== 's1') fail(`adapter did not detect an S1 project (got ${JSON.stringify(detect)})`);
  const handle = await s1Adapter.open(fa);
  if (!handle.levels) fail('opened handle has no levels capability');

  const ghz1 = handle.levels.list().find((r) => r.zone === 'ghz' && r.act === 1 && r.available);
  if (!ghz1) fail('GHZ1 act not found / unavailable');
  const doc = await handle.levels.read(ghz1);
  const grid = doc.fg;
  log(`    GHZ1 FG layout: ${grid.width}x${grid.height} chunks, ${grid.cells.length} payload bytes`);

  // Stamp a distinctive chunk id ($05) across a short row near the start. Values
  // are chosen to differ from the originals so the diff is guaranteed non-empty;
  // we record the before-bytes to report the exact edit.
  const STAMP_CHUNK = 0x05;
  const STAMP_ROW = 1;
  const STAMP_COLS = [1, 2, 3, 4, 5, 6, 7, 8].filter((c) => c < grid.width);
  if (STAMP_ROW >= grid.height || STAMP_COLS.length === 0) fail('GHZ1 layout too small for the planned edit');

  const nextCells = new Uint8Array(grid.cells);
  const editedCellIndexes = [];
  for (const col of STAMP_COLS) {
    const idx = STAMP_ROW * grid.width + col;
    if (idx >= nextCells.length) continue;
    nextCells[idx] = STAMP_CHUNK;
    editedCellIndexes.push(idx);
  }
  const editedDoc = { ...doc, fg: { ...grid, cells: nextCells } };
  log(`    stamped chunk $${STAMP_CHUNK.toString(16).toUpperCase().padStart(2, '0')} into ` +
      `${editedCellIndexes.length} cells (row ${STAMP_ROW}, cols ${STAMP_COLS.join(',')})`);

  // 4. Save via the encoder + the REAL main-process guarded write path.
  const writeResult = await handle.levels.write(ghz1, editedDoc, { fg: true });
  if (writeResult.errors.length) fail(`encoder self-check failed: ${JSON.stringify(writeResult.errors)}`);
  const writtenPaths = writeResult.files.map((f) => f.path);
  log(`[4] Encoder emitted ${writeResult.files.length} file(s): ${writtenPaths.join(', ')}`);
  if (!writtenPaths.includes('levels/ghz1.bin')) fail(`expected levels/ghz1.bin in the write set, got ${writtenPaths.join(', ')}`);

  const payload = writeResult.files.map((f) => ({
    relPath: f.path,
    bytes: f.bytes,
    expectedMtimeMs: writeResult.fileMtimes[f.path] ?? null,
  }));
  const gw = await performGuardedWrite(WORK, payload);
  if (gw.conflicts) fail(`guarded write reported a conflict: ${gw.conflicts.join(', ')}`);
  if (gw.failed) fail(`guarded write partial failure at ${gw.failed.path}: ${gw.failed.message}`);
  log(`    guarded write committed: ${gw.written.join(', ')}`);

  // Sanity: the on-disk layout now decodes back to what we intended.
  const diskLayout = new Uint8Array(fs.readFileSync(path.join(WORK, 'levels/ghz1.bin')));
  for (const idx of editedCellIndexes) {
    if (diskLayout[2 + idx] !== STAMP_CHUNK) {
      fail(`on-disk levels/ghz1.bin cell ${idx} = ${diskLayout[2 + idx]}, expected ${STAMP_CHUNK}`);
    }
  }

  // 5. Rebuild the (now edited) copy.
  log('[5] Rebuilding EDITED ROM via `lua build.lua`…');
  let edited;
  try {
    edited = buildRom(WORK);
  } catch (e) {
    fail(`edited rebuild failed: ${e.message}\n${e.stderr ? String(e.stderr).slice(-1200) : ''}`);
  }
  fs.writeFileSync(EDITED_ROM, edited);
  log(`    edited ROM: ${edited.length} bytes -> ${EDITED_ROM}`);

  // 6. Verify: locate the layout in the ROM and confirm the diff is confined to
  //    the layout bytes + the checksum word.
  log('[6] Verifying the edit landed in the ROM…');
  if (edited.length !== baseline.length) fail(`ROM sizes differ (${baseline.length} vs ${edited.length})`);

  const origLayout = new Uint8Array(2 + grid.cells.length);
  origLayout[0] = (grid.width - 1) & 0xff;
  origLayout[1] = (grid.height - 1) & 0xff;
  origLayout.set(grid.cells, 2);
  const layoutOff = indexOfBytes(baseline, origLayout);
  if (layoutOff < 0) fail('could not locate the original GHZ1 layout bytes in the baseline ROM');
  log(`    GHZ1 layout is binclude'd at ROM offset 0x${layoutOff.toString(16)} (${origLayout.length} bytes)`);

  // The edited layout must appear at the same offset in the edited ROM.
  for (const idx of editedCellIndexes) {
    const romByte = edited[layoutOff + 2 + idx];
    if (romByte !== STAMP_CHUNK) {
      fail(`edited ROM layout cell ${idx} (ROM 0x${(layoutOff + 2 + idx).toString(16)}) = ${romByte}, expected ${STAMP_CHUNK}`);
    }
  }

  const offsets = diffOffsets(baseline, edited);
  const ranges = toRanges(offsets);
  log(`    ${offsets.length} byte(s) differ between baseline and edited ROM:`);
  for (const [s, en] of ranges) {
    let tag = 'unexpected';
    if (s >= CHECKSUM_OFF && en < CHECKSUM_OFF + 2) tag = 'checksum';
    else if (s >= ROMEND_OFF && en < ROMEND_OFF + 4) tag = 'end-of-ROM';
    else if (s >= layoutOff && en < layoutOff + origLayout.length) tag = 'GHZ1 layout';
    log(`      0x${s.toString(16)}..0x${en.toString(16)} (${en - s + 1} byte(s)) — ${tag}`);
  }

  // Every differing byte must be in the layout region OR the checksum word. The
  // ROM end value is unchanged (same size), so it should NOT appear; if it does
  // that's still within the header and harmless, but we don't expect it.
  const layoutStart = layoutOff;
  const layoutEnd = layoutOff + origLayout.length; // exclusive
  const stray = offsets.filter(
    (o) => !((o >= layoutStart && o < layoutEnd) || (o >= CHECKSUM_OFF && o < CHECKSUM_OFF + 2)),
  );
  if (stray.length) {
    fail(
      `ROM changed OUTSIDE the layout + checksum: ${stray.length} stray byte(s), ` +
        `first at 0x${stray[0].toString(16)}. The edit is not surgical.`,
    );
  }

  const layoutDiffs = offsets.filter((o) => o >= layoutStart && o < layoutEnd);
  if (layoutDiffs.length === 0) fail('no layout bytes changed in the ROM — the edit did not take');

  log('\n=== PASS ===');
  log(`  • Edit driven through s1Adapter.open + levels.write + performGuardedWrite (the app's own path)`);
  log(`  • GHZ1 layout embedded at ROM 0x${layoutOff.toString(16)}; ${layoutDiffs.length} layout byte(s) changed as stamped`);
  log(`  • All ${offsets.length} ROM diffs confined to the layout region + checksum word`);
  log(`  • Artifacts: ${BASELINE_ROM} , ${EDITED_ROM}`);
  process.exit(0);
}

main().catch((e) => fail(e.stack || e.message));
