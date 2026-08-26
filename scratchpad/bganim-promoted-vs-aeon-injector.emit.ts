/**
 * Emit HALF of the last open link: a band authored by Aurora's MODEL on a real
 * aeon document, serialized by Aurora, for aeon's own injector to judge.
 *
 * Two modes, one file (ROADMAP item 24 added the second as a flag rather than
 * a copy, so the two composition probes cannot drift):
 *
 *   default   PROMOTE on aeon's LIVE 448/448 document — refuses unless the
 *             document is FULL and bandless. Writes live-before.json +
 *             live-promoted.json. (Items 27/29.)
 *   --insert  INSERT a brand-new band on a ROOMY document (aeon's generator's
 *             output under band_reserve, e.g. test/fixtures/bg-override/
 *             editor_bg_override.roomy.json) — refuses unless the document has
 *             FREE slots and is bandless. Writes live-before.json +
 *             live-inserted.json. Geometry derived from the free room, or
 *             given as `--insert=CxR`. (Item 24.)
 *
 *             WHY THE GEOMETRY IS A PARAMETER: aeon's injector at a840d68f
 *             gates the whole act's `ojz_bg_anim` section on
 *             BGANIM_PLACER_CEILING = 1026 B (2 + 44/band + 256/slot), so ONE
 *             band may cover at most 3 slots today — sigil placer work
 *             (BGANIM-PLACE) — and an 8x4 band that Aurora inserts correctly is
 *             refused there for a reason that is not Aurora's. Pick 3x1 to
 *             compose at that pin; the derived default proves the writer.
 *
 * Usage: node emit.cjs <doc.json> <outdir> [--insert[=CxR]]
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { parseBgOverride, serializeBgOverride, bandTileCount } from '../src/core/formats/bg-override/bg-override';
import { bandFromStaticTiles, createBand, describeBands, insertBand, planBandInsertion,
         planBandPromotion, promoteBand, tileSlotsRemaining } from '../src/core/formats/bg-override/bg-anim-band';

const [, , live, out, flag] = process.argv;
const INSERT = typeof flag === 'string' && flag.startsWith('--insert');
const GEOM = INSERT && flag.includes('=') ? flag.split('=')[1].split('x').map(Number) : null;
const { doc } = parseBgOverride(readFileSync(live, 'utf8'));
const free = tileSlotsRemaining(doc);
console.log(`[doc] ${doc.tiles.length} tiles, ${describeBands(doc).length} bands, tileSlotsRemaining=${free}`);
if (describeBands(doc).length !== 0) throw new Error('expected the source document to carry no bands');
writeFileSync(`${out}/live-before.json`, serializeBgOverride(doc));

if (INSERT) {
  if (free === 0) throw new Error('VACUOUS: --insert needs a document with free slots; this one is full');
  // Rows 4; cols a quarter of what fits, at least 1 — the same derivation the
  // item-24 harness uses, so a UI-authored and a model-authored band agree.
  const ROWS = GEOM ? GEOM[1] : 4;
  const COLS = GEOM ? GEOM[0] : Math.max(1, Math.floor(free / ROWS / 4));
  const band = createBand({ cols: COLS, rows: ROWS, driver: 'timer', rate_shift: 3 });
  const plan = planBandInsertion(doc, band);
  const inserted = insertBand(doc, plan, band);
  const n = bandTileCount(band);
  if (inserted.tiles.length !== doc.tiles.length + n) {
    throw new Error(`insertion grew tiles.length by ${inserted.tiles.length - doc.tiles.length}, expected ${n}`);
  }
  console.log(`[insert] a ${COLS}x${ROWS} band (${n} tiles) at the front; tiles.length ` +
              `${doc.tiles.length} -> ${inserted.tiles.length}, bands ${describeBands(inserted).length}, ` +
              `layout words rewritten ${plan.layout.length}`);
  writeFileSync(`${out}/live-inserted.json`, serializeBgOverride(inserted));
  console.log('[emit] wrote live-before.json + live-inserted.json');
} else {
  if (free !== 0) throw new Error('VACUOUS: this document is not full; the point is that it is (use --insert for a roomy one)');
  const COLS = 8, ROWS = 4, FROM = 200;
  const band = bandFromStaticTiles(doc, FROM, { cols: COLS, rows: ROWS, driver: 'timer', rate_shift: 3 });
  const plan = planBandPromotion(doc, band, FROM);
  const promoted = promoteBand(doc, plan, band);
  if (promoted.tiles.length !== doc.tiles.length) {
    throw new Error(`promotion changed tiles.length ${doc.tiles.length} -> ${promoted.tiles.length}`);
  }
  console.log(`[promote] tiles ${FROM}..${FROM + COLS * ROWS} -> an ${COLS}x${ROWS} band; ` +
              `tiles.length ${doc.tiles.length} (UNCHANGED), bands ${describeBands(promoted).length}, ` +
              `layout words rewritten ${plan.layout.length}`);
  writeFileSync(`${out}/live-promoted.json`, serializeBgOverride(promoted));
  console.log('[emit] wrote live-before.json + live-promoted.json');
}
