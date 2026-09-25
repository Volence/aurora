// The target clip act, as aeon's bake composed it. Filled in by the paste slice.
import React from 'react';
import { T } from '../ui/theme';

export default function DonorTargetPane(): React.ReactElement {
  return (
    <div data-donors-target-message style={{ margin: 'auto', color: T.textLo, fontSize: T.tSm, padding: T.s4 }}>
      The target clip act appears here once pasting is built.
    </div>
  );
}
