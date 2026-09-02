#!/usr/bin/env node
// BUILD THE ONE PROJECT ON WHICH A BAND PREVIEW CAN BE MEASURED.
//
// ═══ WHY A FIXTURE IS NEEDED AT ALL, AND WHY THAT IS A FINDING ═══
//
// The live aeon tree CANNOT exercise this feature, and the reason is the parcel's
// central finding rather than a shortcoming of the tree:
// `games/sonic4/data/editor_bg_override.json` (320 tiles, one 8x4 `timer` band)
// and the background Aurora actually paints for OJZ act 1 section 0
// (`editor/ojz_bg_ingame-forest-v15-…_tiles.bin`, 448 tiles) are two different
// blobs. Same art, different indices — 0/320 tiles match by index, 320/320 match
// as a set. See docs/reviews/2026-08-26-bganim-preview-blob-divergence.md.
//
// So on the live tree the preview's licence check REFUSES, correctly, and every
// motion row would be vacuous. This script builds the coherent state instead of
// pretending it exists: a hardlinked copy of the aeon tree with the library
// background section 0 displays REGENERATED FROM THE OVERRIDE DOCUMENT itself.
//
// ═══ WHAT IS DERIVED AND WHAT IS INVENTED ═══
//
// Nothing is invented. The layout, the tiles and the band all come out of the
// real `editor_bg_override.json`; the only thing this script does is write them
// into the two files Aurora's loader reads for that library entry, in the shapes
// its own serializers produce (`serializeNametable`: big-endian words;
// `serializeBgTiles`: a big-endian byte-length header then packed nibbles). The
// entry loads WITHOUT `normalizeBgLayout` — the loader's own comment says editor
// -saved library layouts are already blob-local — which is exactly the
// convention the document's `layout` is in.
//
// A SECOND BAND IS ADDED, and it is the only edit to the document's meaning: a
// `camera_x` band, so the harness can watch the two driver classes side by side
// on one screen. Its geometry and its art are taken from the tiles the document
// already holds (promoted from the static range immediately after the timer
// band, with `phases` filled by the SAME pre-shift rule the codec's `shift` fill
// uses), so the prefix identity still holds and the consumer would still bake it.
//
// ⚠ WRITES ONLY INSIDE scratchpad/fixtures/. The aeon tree is hardlinked, never
// modified: every file this script rewrites is unlinked first so the hardlink
// breaks rather than the original being edited in place.
//
// Run: node scratchpad/bganim-preview-fixture.mjs [--force]

import { AURORA_DIR, siblingPathOrUnresolved } from '../test/support/sibling-root.mjs';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, unlinkSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = AURORA_DIR;
export const AEON = siblingPathOrUnresolved('aeon');
export const FIXTURE = join(ROOT, 'scratchpad/fixtures/aeon-bganim-coherent');

const CONTRACT = JSON.parse(readFileSync(
  join(ROOT, 'src/core/formats/bg-override/bganim-consumer-contract.json'), 'utf8'));
const PHASE_BANKS = CONTRACT.constants.BGANIM_PHASE_BANKS.value;
const TILE_PIXELS = CONTRACT.constants.TILE_PIXELS.value;
const TILE_WIDTH_PX = CONTRACT.constants.TILE_WIDTH_PX.value;
const TILE_BYTES = CONTRACT.constants.TILE_BYTES.value;

/** `serializeNametable`'s shape: one big-endian word per cell. */
function packLayout(words) {
  const out = Buffer.alloc(words.length * 2);
  words.forEach((w, i) => out.writeUInt16BE(w & 0xFFFF, i * 2));
  return out;
}

/** `serializeBgTiles`'s shape: BE byte-length header, then packed 4bpp nibbles. */
function packTiles(tiles) {
  const body = Buffer.alloc(tiles.length * TILE_BYTES);
  tiles.forEach((t, i) => {
    for (let b = 0; b < TILE_BYTES; b++) {
      body[i * TILE_BYTES + b] = ((t[b * 2] & 0xF) << 4) | (t[b * 2 + 1] & 0xF);
    }
  });
  const out = Buffer.alloc(2 + body.length);
  out.writeUInt16BE(body.length, 0);
  body.copy(out, 2);
  return out;
}

/**
 * Bank k of a band, as phase 0 pre-shifted k pixels within its own pattern width.
 *
 * The same rule as `bg-anim-band.ts::shiftedPhaseBanks` and aeon's own
 * `forest_bg_gen.py`: bank k's pixel at x IS phase 0's pixel at (x + k) mod
 * pattern_px, over COLUMN-MAJOR slots.
 */
function shiftedBanks(cols, rows, phase0) {
  const patternPx = cols * TILE_WIDTH_PX;
  return Array.from({ length: PHASE_BANKS }, (_, bank) =>
    Array.from({ length: cols * rows }, (_, t) => {
      const col = Math.floor(t / rows);
      const row = t % rows;
      const out = new Array(TILE_PIXELS);
      for (let py = 0; py < TILE_WIDTH_PX; py++) {
        for (let px = 0; px < TILE_WIDTH_PX; px++) {
          const srcX = (col * TILE_WIDTH_PX + px + bank) % patternPx;
          const srcTile = Math.floor(srcX / TILE_WIDTH_PX) * rows + row;
          out[py * TILE_WIDTH_PX + px] = phase0[srcTile][py * TILE_WIDTH_PX + (srcX % TILE_WIDTH_PX)];
        }
      }
      return out;
    }));
}

function write(path, bytes) {
  if (existsSync(path)) unlinkSync(path);   // break the hardlink, never edit through it
  writeFileSync(path, bytes);
}

export function buildFixture({ force = false } = {}) {
  if (existsSync(FIXTURE)) {
    if (!force) return FIXTURE;
    rmSync(FIXTURE, { recursive: true, force: true });
  }
  mkdirSync(dirname(FIXTURE), { recursive: true });
  // Hardlinked copy: instant and near-free, and every file this script then
  // rewrites is unlinked first so the original cannot be touched.
  execFileSync('cp', ['-al', AEON, FIXTURE]);

  const docPath = join(FIXTURE, 'games/sonic4/data/editor_bg_override.json');
  const doc = JSON.parse(readFileSync(docPath, 'utf8'));
  const bands = doc.anims ?? [];
  if (bands.length !== 1 || bands[0].driver !== 'timer') {
    throw new Error(`expected the live document's single timer band; got ${JSON.stringify(
      bands.map((b) => ({ cols: b.cols, rows: b.rows, driver: b.driver })))}. This fixture is `
      + 'derived from the real document, so a changed document needs the derivation re-read, '
      + 'not a number edited here.');
  }

  // The camera band: the static range immediately after the timer band, promoted
  // in place. Same geometry as the band already there, so `rows*TILE_BYTES` is a
  // power of two by the same argument the document already satisfies.
  const timer = bands[0];
  const n = timer.cols * timer.rows;
  const camPhase0 = doc.tiles.slice(n, n + n).map((t) => [...t]);
  if (camPhase0.length !== n) throw new Error('the blob has no room after the timer band');
  const camera = {
    cols: timer.cols, rows: timer.rows, pattern_px: timer.cols * TILE_WIDTH_PX,
    driver: 'camera_x', phases: shiftedBanks(timer.cols, timer.rows, camPhase0),
  };
  doc.anims = [timer, camera];
  // The promotion is a no-op move (the range is already where the second band
  // starts), so `layout` needs no renumbering and the prefix identity holds for
  // both bands by construction. Assert it rather than assume it.
  for (const [i, b] of doc.anims.entries()) {
    const base = i * n;
    for (let s = 0; s < n; s++) {
      if (JSON.stringify(b.phases[0][s]) !== JSON.stringify(doc.tiles[base + s])) {
        throw new Error(`prefix identity broken for band ${i} slot ${s}`);
      }
    }
  }
  write(docPath, JSON.stringify(doc));

  // The background section 0 displays, regenerated FROM the document.
  const entry = 'ingame-forest-v15-1786630615596';
  const dir = join(FIXTURE, 'games/sonic4/data/editor');
  write(join(dir, `ojz_bg_${entry}.bin`), packLayout(doc.layout));
  write(join(dir, `ojz_bg_${entry}_tiles.bin`), packTiles(doc.tiles));

  const meta = join(FIXTURE, 'games/sonic4/data/editor/ojz/act1/section_0.meta.json');
  const parsed = JSON.parse(readFileSync(meta, 'utf8'));
  if (parsed.bgLayoutRef !== entry) {
    throw new Error(`section 0 displays ${parsed.bgLayoutRef}, not ${entry} — re-derive which `
      + 'library entry to regenerate rather than editing the id here.');
  }
  return FIXTURE;
}

/**
 * What a harness needs to know about a TREE's bands, derived from its document.
 *
 * Takes the tree because, since decision d-12, the LIVE aeon project can
 * exercise the preview too: the canvas paints `editor_bg_override.json`, so a
 * band's rest art IS the blob on screen by construction and the licence check
 * passes. The fixture is still built and still measured — it carries a SECOND,
 * `camera_x` band, which the live document does not, and the camera/timer
 * contrast is what makes the posture rows a contrast rather than two separate
 * measurements. Neither replaces the other: the fixture proves the contrast, the
 * live tree proves the feature works where an author would use it.
 */
export function documentFacts(tree = FIXTURE) {
  const doc = JSON.parse(readFileSync(
    join(tree, 'games/sonic4/data/editor_bg_override.json'), 'utf8'));
  return {
    layout: doc.layout,
    bands: doc.anims.map((b, i) => ({
      index: i,
      cols: b.cols, rows: b.rows,
      driver: b.driver ?? CONTRACT.bandKeys.driver.default,
      rateShift: b.rate_shift ?? CONTRACT.bandKeys.rate_shift.default,
      slotBase: doc.anims.slice(0, i).reduce((a, x) => a + x.cols * x.rows, 0),
      tileCount: b.cols * b.rows,
      patternPx: b.cols * TILE_WIDTH_PX,
    })),
  };
}

/** The fixture's own facts — `documentFacts(FIXTURE)`, kept as the old name. */
export function fixtureFacts() { return documentFacts(FIXTURE); }

if (process.argv[1] && process.argv[1].endsWith('bganim-preview-fixture.mjs')) {
  const dir = buildFixture({ force: process.argv.includes('--force') });
  console.log(dir);
  console.log(JSON.stringify(fixtureFacts().bands, null, 2));
}
