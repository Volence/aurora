/**
 * ORIGINATION probe: compose a band that has never existed with Aurora's OWN
 * add-band command, then hand it to aeon's injection path.
 *
 * This is the half the round-trip probe (bganim-writer-vs-aeon-gate) could not
 * reach: there, every band came from aeon-generated content that already
 * satisfied the invariants. Here Aurora INVENTS the band.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { parseBgOverride, serializeBgOverride, BGANIM_PHASE_BANKS, TILE_PIXELS,
         TILE_PIXEL_MAX } from '../src/core/formats/bg-override/bg-override';
import { createBand, planBandInsertion, insertBand, describeBands,
         bandsRemaining, tileSlotsRemaining } from '../src/core/formats/bg-override/bg-anim-band';

const out = process.argv[2];
const { doc } = parseBgOverride(readFileSync('test/fixtures/bg-override/editor_bg_override.b0e5a661.json', 'utf8'));
console.log(`[orig] fixture: ${describeBands(doc).length} bands, ${doc.tiles.length} tiles, ` +
            `${bandsRemaining(doc)} band slots free, ${tileSlotsRemaining(doc)} tile slots free`);

// ANTI-VACUOUS ART: a blank band bakes to all-zero banks, which would pass the
// consumer trivially and prove nothing about pixel packing. Every phase gets a
// distinct, non-zero, in-range pattern so the emitted banks must differ per bank.
const COLS = 8, ROWS = 4, N = COLS * ROWS;
const phases = Array.from({ length: BGANIM_PHASE_BANKS }, (_, bank) =>
  Array.from({ length: N }, (_, t) =>
    Array.from({ length: TILE_PIXELS }, (_, px) => ((bank * 7 + t * 3 + px) % TILE_PIXEL_MAX) + 1)));

const band = createBand({ cols: COLS, rows: ROWS, driver: 'timer', rate_shift: 3, phases });
console.log(`[orig] composed a NEW band: ${COLS}x${ROWS} (${N} tiles), driver=timer, ` +
            `rate_shift=3, ${BGANIM_PHASE_BANKS} banks of non-zero art`);

const plan = planBandInsertion(doc, band);           // append
console.log(`[orig] plan: bandIndex=${plan.bandIndex} slotBase=${plan.slotBase} ` +
            `tileCount=${plan.tileCount} layoutEdits=${plan.layout.length} ` +
            `dangling=${plan.danglingRefs} referencing=${plan.referencingCells}`);
if (plan.referencingCells !== 0) throw new Error('insertion must arrive unreferenced');

const next = insertBand(doc, plan, band);
const before = describeBands(doc).length, after = describeBands(next).length;
if (after !== before + 1) throw new Error(`VACUOUS: band count ${before} -> ${after}`);
if (next.tiles.length !== doc.tiles.length + N) throw new Error('static blob did not grow by n');
console.log(`[orig] after insert: ${after} bands, ${next.tiles.length} tiles`);

writeFileSync(`${out}/originated.json`, serializeBgOverride(next));
writeFileSync(`${out}/pre-origination.json`, serializeBgOverride(doc));
console.log('[orig] wrote originated.json + pre-origination.json');
