import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  parseBgOverride, type BgOverrideDocument,
} from '../../src/core/formats/bg-override/bg-override';
import {
  bandFromStaticTiles, planBandPromotion, promoteBand,
} from '../../src/core/formats/bg-override/bg-anim-band';

/**
 * THE VERTICAL BAND, BUILT THROUGH AURORA'S REAL PROMOTE DOOR.
 *
 * Shared by the codec's axis tests and by the aeon-guard bake, and it lives in
 * `test/support` rather than in one of them for a reason this repo has already
 * paid for: importing a `*.test.ts` file to borrow a helper RE-REGISTERS every
 * describe in it, so the borrower's totals silently swallow the lender's rows
 * and a failure appears in two files at once.
 *
 * WHY PROMOTION AND NOT A HAND-BUILT BAND. The bake proof is only worth
 * anything if the bytes are the ones the product actually writes. `roomy` is
 * the generator's own output with room to spare (320 tiles of 448, no bands),
 * so a promotion there is the same call the panel's `Promote` button and the
 * agent's `promote_bg_anim_band` make.
 *
 * THE GEOMETRY IS 4x8 ON PURPOSE. Both dimensions are powers of two — so the
 * band is LEGAL on both axes and the axis is what decides which number means
 * what — and they DIFFER, so aeon's derived `unit_bytes` and `period_px` are
 * different numbers on each axis. A square band would make both readings agree
 * and every axis assertion over it vacuous.
 */
export const ROOMY: BgOverrideDocument = parseBgOverride(readFileSync(
  resolve(__dirname, '../fixtures/bg-override/editor_bg_override.roomy.json'), 'utf8')).doc;

export function verticalBandDocument(
  cols = 4, rows = 8, staticBase = 64,
): BgOverrideDocument {
  const band = bandFromStaticTiles(ROOMY, staticBase, {
    cols, rows, axis: 'vertical', phaseFill: 'shift', driver: 'camera_y',
  });
  return promoteBand(ROOMY, planBandPromotion(ROOMY, band, staticBase), band);
}
