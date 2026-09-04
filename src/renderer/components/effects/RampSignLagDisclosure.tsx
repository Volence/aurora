// THE NEGATIVE-VALUE DISCLOSURE on the ramp card.
//
// ⚠ SILENT SINCE 2026-09-03 — THIS COMPONENT RENDERS NOTHING TODAY, for a
// negative document as much as a positive one. aeon's `raster_ramp_program`
// now encodes the two's complement at comptime (`origin/master` `065dc790`;
// the blob and the encode are recorded in core/formats/effects/ramp-sign-lag.ts),
// so `RAMP_SIGN_FIELDS_AWAITING_AEON` is `[]` and `rampSignLagFields` returns
// `[]` for every input. NOT DELETED, and not hard-wired: the body below is
// unchanged, so re-filling that one constant brings the sentence back with no
// edit here. A `return null` bolted to the top would pass every "it is silent"
// row and kill the re-arm — `__tests__/ramp-sign-lag-disclosure.test.ts`'s
// poison replays the filled premise through this module and requires the whole
// derivation back, which is exactly the shape such a shortcut fails.
//
// ONE LEAF, HOOKLESS — so the node suite can call it as a plain function and
// walk what it returns (the `PresetLagDisclosure` idiom).
//
// IT TAKES THE DOCUMENT'S OWN TWO VALUES AND NOTHING ELSE, and that is the whole
// of its gate. `PresetLagDisclosure` is propless because its premise is about a
// KEY and applies to every document; this one is about a SIGN, so an author
// ramping downward — every ramp that has ever existed in this tier — must see
// nothing. Handing it the numbers rather than a boolean means the panel cannot
// pass it a guard: whether to speak is decided in `rampSignLagFields`, from the
// premise and the values, and there is no third opinion here.
//
// RENDER-GATED ON THE PREMISE TOO, NOT ONLY ON THE SIGN.
// `RAMP_SIGN_FIELDS_AWAITING_AEON` emptied the day aeon's constructor encoded
// (`test/formats/aeon-ramp-sign-drift.test.ts` measured exactly that, at a
// committed revision, and now reads TIP for the reverse), and this leaf renders
// nothing for a negative value as a result. There is no second copy of the
// sentence here to outlive that — which is why the retirement cost no edit to
// this file's body, and why a re-arm will cost none either.

import React from 'react';
import { T } from '../ui';
import { Hint } from './column-layout';
import {
  RAMP_SIGN_FIELDS_AWAITING_AEON, RAMP_SIGN_LAG_LEAD,
  rampSignLagDisclosure, rampSignLagFields,
} from '../../../core/formats/effects/ramp-sign-lag';

export function RampSignLagDisclosure(
  { start, step }: { start: number; step: number },
): React.ReactElement | null {
  const fields = rampSignLagFields({ start, step }, RAMP_SIGN_FIELDS_AWAITING_AEON);
  const sentence = rampSignLagDisclosure(fields);
  if (sentence === null) return null;
  const rest = sentence.startsWith(RAMP_SIGN_LAG_LEAD)
    ? sentence.slice(RAMP_SIGN_LAG_LEAD.length) : sentence;
  return (
    <Hint tone="warning" style={{ marginBottom: T.s3 }}>
      <span style={{ color: T.textHi }}>{RAMP_SIGN_LAG_LEAD}</span>{rest}
    </Hint>
  );
}
