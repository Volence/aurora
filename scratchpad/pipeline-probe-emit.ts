// FOREGROUND PIPELINE PROBE (overseer's, throwaway). Question: does a promoted,
// shift-filled band survive aeon's regenerate+build into a ROM at all?
// This is NOT the handover artifact — that is the UI-authored band on parcel/handover-band.
import { readFileSync, writeFileSync } from 'node:fs';
import { parseBgOverride, serializeBgOverride } from '../src/core/formats/bg-override/bg-override';
import { bandFromStaticTiles, describeBands, planBandPromotion, promoteBand,
         tileSlotsRemaining } from '../src/core/formats/bg-override/bg-anim-band';
const [, , src, dst] = process.argv;
const { doc } = parseBgOverride(readFileSync(src, 'utf8'));
if (describeBands(doc).length !== 0) throw new Error('source already carries bands');
const COLS = 8, ROWS = 4, FROM = 2;
const band = bandFromStaticTiles(doc, FROM, {
  cols: COLS, rows: ROWS, driver: 'timer', rate_shift: 3, phaseFill: 'shift',
});
const plan = planBandPromotion(doc, band, FROM);
const out = promoteBand(doc, plan, band);
if (out.tiles.length !== doc.tiles.length) throw new Error('promotion changed tiles.length');
// Independent check that the banks really differ: bank 7 must not equal bank 0.
const b = describeBands(out)[0];
const p = band.phases;
const same = JSON.stringify(p[0]) === JSON.stringify(p[7]);
console.log(`[band] ${COLS}x${ROWS} from tile ${FROM}; bands ${describeBands(out).length}; ` +
            `tiles ${doc.tiles.length}->${out.tiles.length}; free ${tileSlotsRemaining(out)}; ` +
            `layout words rewritten ${plan.layout.length}; bank7==bank0? ${same}`);
if (same) throw new Error('VACUOUS: shift produced identical banks — it would not move');
writeFileSync(dst, serializeBgOverride(out));
console.log('[emit] wrote', dst);
