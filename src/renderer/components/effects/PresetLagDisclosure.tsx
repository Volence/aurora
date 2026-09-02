// The no-ROM disclosure above the `cycles` / `variants` controls.
//
// ONE LEAF, HOOKLESS, PROPLESS — so the node suite can call it as a plain
// function and walk what it returns (the object-inspector-field-bounds idiom),
// and so the panel cannot pass it a `bound`/`section` guard one level down.
//
// RENDER-GATED ON THE PREMISE, NOT ON A FLAG. `presetLagDisclosure` derives the
// sentence from `PRESET_KEYS_AWAITING_AEON` and returns null when that list is
// empty; this leaf renders nothing then. The list is the fact the drift test
// measures against aeon at origin/master (core/formats/effects/preset-lag.ts
// says how), so the sentence retires when the measurement says it should, and
// there is no second copy of it here to outlive that.

import React from 'react';
import { T } from '../ui';
import { Hint } from './column-layout';
import {
  PRESET_KEYS_AWAITING_AEON, PRESET_LAG_LEAD, presetLagDisclosure,
} from '../../../core/formats/effects/preset-lag';

export function PresetLagDisclosure(): React.ReactElement | null {
  const sentence = presetLagDisclosure(PRESET_KEYS_AWAITING_AEON);
  if (sentence === null) return null;
  const rest = sentence.startsWith(PRESET_LAG_LEAD) ? sentence.slice(PRESET_LAG_LEAD.length) : sentence;
  return (
    <Hint tone="warning" style={{ marginBottom: T.s3 }}>
      <span style={{ color: T.textHi }}>{PRESET_LAG_LEAD}</span>{rest}
    </Hint>
  );
}
