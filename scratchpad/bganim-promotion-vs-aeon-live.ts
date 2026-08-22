/**
 * THE ACCEPTANCE PROBE for band promotion: run it against aeon's LIVE
 * `editor_bg_override.json`, the document Aurora's add-band command provably
 * cannot touch.
 *
 * WHY THIS IS NOT A SUITE TEST. The subject is another repo's moving file. The
 * suite asserts the PROPERTY ("promotion succeeds on a document with zero free
 * tile slots") against a document padded to the contract's own capacity, so it
 * stays true when aeon's tile count moves. This probe asserts the same thing
 * about their actual bytes, at a revision resolved with `ls-remote` — evidence
 * for a report, not a fixture to vendor (aeon EFFECTS_CONSUMER_CONTRACT.md §5:
 * canonicalization governs what a tool WRITES, never what it VENDORS as
 * evidence, and a second copy of a moving file is a maintenance trap).
 *
 *   REV=$(git -C ../aeon ls-remote origin refs/heads/master | cut -f1)
 *   git -C ../aeon cat-file blob "$REV:games/sonic4/data/editor_bg_override.json" > live.json
 *   npx esbuild --bundle --platform=node --format=cjs \
 *     scratchpad/bganim-promotion-vs-aeon-live.ts --outfile=/tmp/probe.cjs && node /tmp/probe.cjs live.json
 *
 * THE INSTRUMENT IS INDEPENDENT OF THE CODE UNDER TEST. `resolveCell` is
 * written from aeon `inject_editor_bg.py`'s own nametable loop, quoted in
 * test/formats/bg-anim-band.test.ts, and carries aeon's literal 0x7FF rather
 * than the module's constant.
 */
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import {
  parseBgOverride, serializeBgOverride, validateBgOverride,
  animatedSlotCount, bandTileCount,
  BG_TILE_CAPACITY, BGANIM_PHASE_BANKS,
  type BgOverrideDocument,
} from '../src/core/formats/bg-override/bg-override';
import {
  bandFromStaticTiles, bandsRemaining, demoteBand, documentBands,
  planBandDemotion, planBandInsertion, planBandPromotion, promoteBand,
  tileSlotsRemaining,
} from '../src/core/formats/bg-override/bg-anim-band';

const path = process.argv[2];
if (!path) throw new Error('usage: probe <aeon editor_bg_override.json at a pinned revision>');
const text = readFileSync(path, 'utf8');

const fail: string[] = [];
function check(ok: boolean, what: string): void {
  console.log(`${ok ? '  ok  ' : ' FAIL '} ${what}`);
  if (!ok) fail.push(what);
}

console.log(`[live] input ${path}`);
console.log(`[live] sha256 ${createHash('sha256').update(text).digest('hex')}`);
console.log(`[live] git blob ${createHash('sha1')
  .update(`blob ${Buffer.byteLength(text)}\0`).update(text).digest('hex')}`);

const { doc, notices } = parseBgOverride(text);
for (const n of notices) console.log(`[live] notice: ${n}`);
console.log(`[live] ${documentBands(doc).length} band(s), ${doc.tiles.length} tiles, ` +
            `${doc.layout.length} layout words, ${bandsRemaining(doc)} band slots free, ` +
            `${tileSlotsRemaining(doc)} tile slots free`);

// -- the instrument, written from the consumer -------------------------------
const AEON_TILE_INDEX_MASK = 0x7FF;
type Cell = { kind: 'blank' } | { kind: 'tile'; attrs: number; pixels: string }
          | { kind: 'dangling'; attrs: number; idx: number };
function resolveCell(d: BgOverrideDocument, i: number): Cell {
  const word = d.layout[i];
  if (word === 0) return { kind: 'blank' };
  const idx = word & AEON_TILE_INDEX_MASK;
  const attrs = word & ~AEON_TILE_INDEX_MASK;
  const t = d.tiles[idx];
  return t === undefined ? { kind: 'dangling', attrs, idx }
                         : { kind: 'tile', attrs, pixels: t.join(',') };
}
const renderAll = (d: BgOverrideDocument) => d.layout.map((_, i) => JSON.stringify(resolveCell(d, i)));

// -- anti-vacuity: the subject has to BE the hard case ------------------------
console.log('\n[live] the subject is the hard case');
check(tileSlotsRemaining(doc) === 0, `tile headroom is zero (${doc.tiles.length}/${BG_TILE_CAPACITY})`);
check(bandsRemaining(doc) > 0, `band slots are free (${bandsRemaining(doc)}) and unreachable`);
const drawn = renderAll(doc);
check(drawn.every(c => JSON.parse(c).kind === 'tile'),
      `every one of ${doc.layout.length} cells draws a real tile`);
check(new Set(drawn).size > 1, `the picture is not uniform (${new Set(drawn).size} distinct cells)`);

// -- insertion refuses, at every size ----------------------------------------
console.log('\n[live] insertion cannot touch it');
for (const [cols, rows] of [[1, 1], [2, 1], [1, 2], [8, 4]] as const) {
  let msg = '(no refusal!)';
  try {
    planBandInsertion(doc, bandFromStaticTiles(doc, 0, { cols, rows }));
  } catch (e) { msg = e instanceof Error ? e.message.split('\n')[0] : String(e); }
  check(msg.includes(`capacity of ${BG_TILE_CAPACITY}`), `insert ${cols}x${rows} refuses: ${msg}`);
}

// -- promotion succeeds -------------------------------------------------------
console.log('\n[live] promotion');
const COLS = 8, ROWS = 4, FROM = 200;
const band = bandFromStaticTiles(doc, FROM, { cols: COLS, rows: ROWS, driver: 'camera_x', rate_shift: 2 });
const upPlan = planBandPromotion(doc, band, FROM);
const promoted = promoteBand(doc, upPlan, band);

const cellsDrawingRange = doc.layout.filter(
  w => w !== 0 && (w & AEON_TILE_INDEX_MASK) >= FROM
    && (w & AEON_TILE_INDEX_MASK) < FROM + COLS * ROWS).length;
console.log(`[live] promoted tiles ${FROM}..${FROM + COLS * ROWS} into a ${COLS}x${ROWS} band ` +
            `at slot ${upPlan.slotBase}; ${upPlan.layout.length} layout words rewritten, ` +
            `${cellsDrawingRange} cell(s) drew that range before`);

check(validateBgOverride(promoted).length === 0,
      `the promoted document validates: ${JSON.stringify(validateBgOverride(promoted).slice(0, 2))}`);
check(promoted.tiles.length === doc.tiles.length,
      `tiles.length UNCHANGED: ${doc.tiles.length} -> ${promoted.tiles.length}`);
check(tileSlotsRemaining(promoted) === 0, 'still exactly at capacity, with a band');
check(documentBands(promoted).length === documentBands(doc).length + 1,
      `band count ${documentBands(doc).length} -> ${documentBands(promoted).length}`);
check(upPlan.layout.length > 0, `the renumber was real (${upPlan.layout.length} words moved)`);
check(cellsDrawingRange > 0, 'the promoted range was genuinely drawn on screen');
check(upPlan.referencingCells === 0, 'no cell was reported as losing its art');

// THE INVARIANT: the picture, cell by cell, through the independent resolver.
const before = renderAll(doc), after = renderAll(promoted);
let differing = 0;
for (let i = 0; i < before.length; i++) if (before[i] !== after[i]) differing++;
check(differing === 0, `all ${before.length} resolved cells identical (${differing} differ)`);
const rawMoved = doc.layout.filter((w, i) => w !== promoted.layout[i]).length;
check(rawMoved > 0, `...while ${rawMoved} RAW layout words changed, as they must`);

// The blob is a permutation, not a rewrite.
const bag = (d: BgOverrideDocument) => d.tiles.map(t => t.join(',')).sort().join('|');
check(bag(promoted) === bag(doc), 'the tile multiset is unchanged: a permutation, not a rewrite');

// Prefix identity, for every band.
let cursor = 0, prefixOk = true;
for (const b of documentBands(promoted)) {
  const n = bandTileCount(b);
  if (JSON.stringify(b.phases[0]) !== JSON.stringify(promoted.tiles.slice(cursor, cursor + n))) prefixOk = false;
  if (b.slot_base !== undefined && b.slot_base !== cursor) prefixOk = false;
  cursor += n;
}
check(prefixOk, 'phases[0] == tiles[slot_base : slot_base+cols*rows] for every band');
check(cursor === animatedSlotCount(documentBands(promoted)), 'bands pack contiguously from slot 0');
check(documentBands(promoted)[0].phases.length === BGANIM_PHASE_BANKS,
      `the promoted band carries ${BGANIM_PHASE_BANKS} banks`);

// -- the round trip, byte-identical, with its control -------------------------
console.log('\n[live] round trip');
const original = serializeBgOverride(doc);
check(serializeBgOverride(doc) === original, 'CONTROL: serialize(x) === serialize(x)');
const promotedBytes = serializeBgOverride(promoted);
check(promotedBytes !== original, `promotion changed the bytes (${original.length} -> ${promotedBytes.length} B)`);

const downPlan = planBandDemotion(promoted, 0, FROM);
check(JSON.stringify(downPlan.layout) === JSON.stringify(upPlan.layout),
      're-planned demotion reproduces the promotion plan exactly');
check(serializeBgOverride(demoteBand(promoted, downPlan)) === original,
      'promote -> demote is BYTE-IDENTICAL to the live document');
check(serializeBgOverride(demoteBand(promoted, upPlan)) === original,
      '...and so is the same plan read backwards, which is what undo does');

// -- demotion is lossless where removal is not --------------------------------
console.log('\n[live] demotion loses nothing');
const demoted = demoteBand(promoted, planBandDemotion(promoted, 0));
check(demoted.tiles.length === promoted.tiles.length,
      `demotion kept every tile: ${promoted.tiles.length} -> ${demoted.tiles.length}`);
check(!Object.hasOwn(demoted, 'anims'), 'the last band demoted away drops `anims` entirely');
const afterDemote = renderAll(demoted);
let demoteDiff = 0;
for (let i = 0; i < after.length; i++) if (after[i] !== afterDemote[i]) demoteDiff++;
check(demoteDiff === 0, `all ${after.length} resolved cells identical after demotion (${demoteDiff} differ)`);
check(demoted.layout.filter(w => w === 0).length === doc.layout.filter(w => w === 0).length,
      'not one cell was blanked (removal would have had to blank them)');

console.log(`\n[live] ${fail.length === 0 ? 'ALL CHECKS PASSED' : `${fail.length} CHECK(S) FAILED`}`);
if (fail.length > 0) { for (const f of fail) console.log(`  - ${f}`); process.exit(1); }
