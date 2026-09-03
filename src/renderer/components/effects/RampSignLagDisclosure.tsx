// THE NEGATIVE-VALUE DISCLOSURE on the ramp card.
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
// `RAMP_SIGN_FIELDS_AWAITING_AEON` empties the day aeon's constructor encodes
// (`test/formats/aeon-ramp-sign-drift.test.ts` measures exactly that, at a
// committed revision), and this leaf then renders nothing for a negative value
// too. There is no second copy of the sentence here to outlive that.

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
