// The Art doc header's shared-tile warning, in its compact form.
//
// The whole sentence used to sit in the tool-options bar as text, and it was
// the item that made that bar wrap: at 1400x872 the bar grew from 37px to 88px
// or 116px with the tool, and the composer canvas below it moved with every
// tool switch (ROADMAP row 210, ART-OPTIONS-BAR-HEIGHT). The bar is now one
// fixed-height row, so the warning shows a short label and keeps the full
// sentence on `title` (hover) and `aria-label` (assistive tech): nothing is
// dropped, it is only moved off the row.

import React from 'react';
import { T } from '../ui';

/** The full warning. The harness row AOB.t and the node row both read it. */
export const SHARED_TILE_WARNING = "pixel edits to existing tiles propagate everywhere they're used";

/** What the bar shows. `role="note"` so the aria-label names the element: a
 *  bare span has no role that takes a name. */
export default function SharedTileWarning() {
  return (
    <span role="note" title={SHARED_TILE_WARNING} aria-label={SHARED_TILE_WARNING}
      style={{ fontSize: T.t2xs, color: T.warning, cursor: 'help' }}>
      ⚠ shared tiles
    </span>
  );
}
