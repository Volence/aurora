// What a ZonePane's hover names at a world point, as data (no DOM), so node
// rows can hold it. ZonePane sets the canvas's `title` to these names, one per
// line.
//
// Every outline under the pointer that has a name, in paint order, each name
// once: a label the layout had to hide (pane-labels.ts) is still one hover away
// (row 235 (b)). An outline's name is its `hover` when it has one, else its
// `label`: a refused-subject outline carries no label (its id, if any, is the
// standing outline beneath it) and is named "<rule tag>: <subject label>"
// (row 236 (a), ruled), so a refused shaft, which has no standing outline, is
// named on the pane even when the layout hid its rule tag.

import type { PaneOutline } from './ZonePane';

/** The names of every outline under world point `p`, in paint order, each once. */
export function outlineNamesAt(outlines: ReadonlyArray<PaneOutline>, p: { x: number; y: number }): string[] {
  const names: string[] = [];
  for (const o of outlines) {
    const name = o.hover ?? o.label;
    if (name && p.x >= o.rect.x && p.x < o.rect.x + o.rect.w && p.y >= o.rect.y && p.y < o.rect.y + o.rect.h) names.push(name);
  }
  return [...new Set(names)];
}
