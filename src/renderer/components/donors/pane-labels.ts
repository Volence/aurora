// Where a ZonePane prints its outline labels, as data (no canvas), so node rows
// can hold it. ROW 235 (b).
//
// THE RULE: NO LABEL IS DRAWN OVER ANOTHER. Each label sits on an opaque chip at
// its rectangle's top-left, on its preferred line (an id on the first, a rule
// tag on the second). Labels are placed in paint order; a label whose chip
// would touch a chip already placed STEPS DOWN one line at a time, and it may
// step only while its chip still starts inside its own rectangle, so a label
// never wanders off the thing it names. A label with no free line there is
// HIDDEN, and the pane's hover tooltip (every id under the pointer) still names
// it. Two outlines carrying the same text at the same corner (aeon's R10 names
// both subjects of a pair rule on one rectangle) print it once.
//
// WHY THIS RULE and not the others the row listed. Clipping each label to its
// own rectangle loses the corridor's id outright (a 384-px corridor is about 18
// screen px wide on a whole-act view), and an offset in a fixed direction just
// moves the collision somewhere else. Stacking keeps every id readable in full
// at the corner of its own rectangle, which is where the eye looks, and the
// chip keeps it legible over the art it sits on (the booked shot read
// "ehz_2xct1": the draft's id printed over ehz_act1's, both straight over art).

/** One line of label text is this many screen px tall (the 11-px id font plus leading). */
export const LABEL_LINE_PX = 13;
/** Text starts this far in from the rectangle's left edge (as it always has). */
export const LABEL_INSET_PX = 4;
/** The chip reaches this far past the text on each side. */
export const LABEL_CHIP_PAD_PX = 2;

export interface LabelBox { x: number; y: number; w: number; h: number }

export interface LabelItem {
  text: string;
  kind: 'label' | 'tag';
  /** Index of the outline this text belongs to. */
  outline: number;
  /** The outline's rectangle, in the pane's screen px (top-left origin of the canvas). */
  rect: LabelBox;
  /** The line it wants: 0 for an id, 1 for a rule tag. */
  line: number;
  /** Text width in screen px, as the canvas measured it with the label's font. */
  width: number;
}

export interface PlacedLabel extends LabelItem {
  /** The chip, in screen px; null when hidden or printed by an earlier twin. */
  box: LabelBox | null;
  /** The text baseline, in screen px; null with box. */
  baseline: { x: number; y: number } | null;
  /** The line it landed on (== the wanted line unless it stepped down). */
  placedLine: number | null;
  hidden: boolean;
  /** The index (in the result) of the identical text at the same corner that printed this one. */
  twinOf: number | null;
}

const hit = (a: LabelBox, b: LabelBox) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

function chipAt(it: LabelItem, line: number): { box: LabelBox; baseline: { x: number; y: number } } {
  const bx = it.rect.x + LABEL_INSET_PX;
  const by = it.rect.y + LABEL_LINE_PX * (line + 1);
  return {
    box: { x: bx - LABEL_CHIP_PAD_PX, y: by - LABEL_LINE_PX + LABEL_CHIP_PAD_PX, w: it.width + LABEL_CHIP_PAD_PX * 2, h: LABEL_LINE_PX },
    baseline: { x: bx, y: by },
  };
}

/** Place every label under THE RULE above, in the order given (paint order). */
export function layoutLabels(items: readonly LabelItem[]): PlacedLabel[] {
  const out: PlacedLabel[] = [];
  const placed: LabelBox[] = [];
  items.forEach((it) => {
    const twin = out.findIndex((p) => p.box && p.text === it.text && p.kind === it.kind
      && p.rect.x === it.rect.x && p.rect.y === it.rect.y);
    if (twin >= 0) {
      out.push({ ...it, box: null, baseline: null, placedLine: null, hidden: false, twinOf: twin });
      return;
    }
    for (let line = it.line; ; line++) {
      const c = chipAt(it, line);
      // Its chip must start inside its own rectangle (the first line always may).
      if (line > it.line && c.box.y >= it.rect.y + it.rect.h) break;
      if (!placed.some((b) => hit(b, c.box))) {
        placed.push(c.box);
        out.push({ ...it, box: c.box, baseline: c.baseline, placedLine: line, hidden: false, twinOf: null });
        return;
      }
    }
    out.push({ ...it, box: null, baseline: null, placedLine: null, hidden: true, twinOf: null });
  });
  return out;
}
