// What a ZonePane's hover names at a world point, as data (no DOM), so node
// rows can hold it. ZonePane sets the canvas's `title` to these names, one per
// line.
//
// Every outline under the pointer that has a name, in paint order, each name
// once: a label the layout had to hide (pane-labels.ts) is still one hover away
// (row 235 (b)).

import type { PaneOutline } from './ZonePane';

/** The names of every outline under world point `p`, in paint order, each once. */
export function outlineNamesAt(outlines: ReadonlyArray<PaneOutline>, p: { x: number; y: number }): string[] {
  return [...new Set(outlines.filter((o) => o.label && p.x >= o.rect.x && p.x < o.rect.x + o.rect.w
    && p.y >= o.rect.y && p.y < o.rect.y + o.rect.h).map((o) => o.label as string))];
}
