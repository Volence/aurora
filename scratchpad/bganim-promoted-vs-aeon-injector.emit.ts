/**
 * Emit HALF of the last open link: a band PROMOTED on aeon's LIVE 448/448
 * document, serialized by Aurora, for aeon's own injector to judge.
 *
 * Items 20 and 23 ran aeon's inject_editor_bg.main() against an INSERTED band
 * on the b0e5a661 fixture. The promotion parcel proved promotion works on the
 * live document but exercised Aurora's writer only. This joins the two.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { parseBgOverride, serializeBgOverride } from '../src/core/formats/bg-override/bg-override';
import { bandFromStaticTiles, planBandPromotion, promoteBand, describeBands,
         tileSlotsRemaining } from '../src/core/formats/bg-override/bg-anim-band';

const [, , live, out] = process.argv;
const { doc } = parseBgOverride(readFileSync(live, 'utf8'));
console.log(`[live] ${doc.tiles.length} tiles, ${describeBands(doc).length} bands, ` +
            `tileSlotsRemaining=${tileSlotsRemaining(doc)}`);
if (tileSlotsRemaining(doc) !== 0) throw new Error('VACUOUS: this document is not full; the point is that it is');
if (describeBands(doc).length !== 0) throw new Error('expected the live document to carry no bands');

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

writeFileSync(`${out}/live-before.json`, serializeBgOverride(doc));
writeFileSync(`${out}/live-promoted.json`, serializeBgOverride(promoted));
console.log('[emit] wrote live-before.json + live-promoted.json');
