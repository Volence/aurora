// Measured, elided labels for the map viewports' object markers.
//
// WHY THIS EXISTS (ROADMAP §5.1 item 17). Three overlay call sites centre a text
// label inside a fixed-size marker box and, until this module, none of them
// measured it: `OverlayRenderer.drawObjects` (aeon), and classic-overlays'
// ghost-marker name + hex-id fallback. Re-measured in the app's own 2D context
// on 2026-08-22: this build's `monospace` advance is exactly 0.5 em (a cell is
// 3.9999542px at an 8px font), so `"solid"` is **19.999771px inside a 16px
// box** — it spills ~2px each side, at every zoom and every window size. Long
// ids are far worse: the classic ghost marker draws `"Conveyor Belt
// Controller"` — 95.999px of text — through a 24px box, a 4x overflow.
//
// THE CONTRACT. `fitLabel` never returns text wider than the budget it was
// given. It either returns the whole string (it fits), the longest prefix that
// still leaves room for an ellipsis, or nothing at all. There is no fourth
// outcome, and in particular there is no "draw it and hope" — which is what all
// three call sites did.
//
// WHY AN ELLIPSIS AND NOT A BARE PREFIX. A silently-cut identifier is a lie an
// author cannot detect: `"sol"` is a perfectly plausible typeId, so a reader has
// no way to know it stands for `"solid"`. The marker costs two cells to say so
// in this font (`…` measures 7.9999px at an 8px monospace, i.e. two advances,
// because the mono face has no U+2026 and the fallback is double-width) and
// that is expensive on a 16px box — but a label that lies is worse than a label
// that is short and honest.
//
// WHY "NOTHING AT ALL" IS A REAL OUTCOME. If not even one character plus the
// ellipsis fits, the only things that would render are a bare `…` (which tells
// a reader strictly nothing the box's own presence did not) or a half glyph
// (which IS the defect). The box alone still marks the placement, and the id is
// one zoom step or one inspector click away. Suppression is therefore decided by
// MEASUREMENT, not by a second hand-picked size threshold: "too small to draw"
// and "too small to fit" are the same question asked twice, and only one of them
// can be answered from the font actually in the context.
//
// NO CLIP REGION. Elision bounds the label inside its own box by construction,
// so nothing can reach past the marker; a `save()/clip()/restore()` per object
// would only mask an arithmetic error here, at a real per-object cost in a loop
// that runs on every repaint. An object at the *canvas* edge still shows a half
// box — which is exactly what a half tile, a half sprite and a half ring already
// do there, and is not this defect. What item 15 photographed was the label
// escaping its MARKER; once it cannot, the canvas edge clips it like everything
// else on the map.

/** Truncation marker. One glyph, so a font that has it costs one cell. */
export const LABEL_ELLIPSIS = '…';

/** Measures a candidate string in the same units the caller's budget is in. */
export type LabelMeasurer = (text: string) => number;

export interface FittedLabel {
  /** What to draw. `''` means draw no label at all. */
  text: string;
  /** Measured width of `text` in the measurer's units; `0` when suppressed. */
  width: number;
  /** True when characters were dropped (so `text` carries the ellipsis). */
  elided: boolean;
}

const SUPPRESSED: FittedLabel = { text: '', width: 0, elided: false };

/**
 * Horizontal room a marker box leaves for a centred label, in the box's own
 * units: the box minus the part of its own border that is painted inside it.
 *
 * DERIVED, NOT PICKED. A canvas stroke is painted centred on the path, so a
 * `strokeWidth` border eats `strokeWidth / 2` of the interior on each side —
 * `strokeWidth` in total. The interior clear of the border is the boundary, and
 * there is deliberately NO extra breathing gap on top of it: a gap costs nothing
 * at zoom 1 (every marker here fits the same number of cells with or without
 * one) and costs a whole label at the classic viewport's fit-to-window zoom,
 * where the box shrinks with the world while the font does not. `"0E"` at
 * zoom 0.58 is 13.8 world px inside a 16 world px box whose border reaches
 * 0.86 in — it clears the frame, and half a pixel of politeness would have
 * deleted it. A glyph touching the frame is legible; a glyph that is not drawn
 * is not.
 */
export function labelBudget(boxWidth: number, strokeWidth: number): number {
  return Math.max(0, boxWidth - strokeWidth);
}

/**
 * Fit `text` into `maxWidth`, eliding with {@link LABEL_ELLIPSIS} when it does
 * not fit and suppressing it entirely when not even one character plus the
 * ellipsis does.
 *
 * `measure` is the live 2D context's own `measureText(...).width` at the font
 * the caller is about to draw with — never a modelled advance. A font that
 * cannot be measured (a non-finite width, which is what a detached or
 * mid-teardown context returns) draws NOTHING rather than being treated as
 * zero-width and drawn anyway.
 */
export function fitLabel(text: string, maxWidth: number, measure: LabelMeasurer): FittedLabel {
  if (!text || !(maxWidth > 0)) return SUPPRESSED;

  // A non-finite width — what a detached or mid-teardown context answers — fails
  // this comparison and every one in the loop below, so it lands in the
  // suppressed outcome. There is deliberately no separate early return for it:
  // a guard no test can distinguish from its absence is a guard that asserts
  // nothing. The load-bearing half is the explicit `Number.isFinite` in the
  // loop, which IS distinguishable (see the note there).
  const full = measure(text);
  if (full <= maxWidth) return { text, width: full, elided: false };

  // Longest prefix whose ellipsised form still fits. Prefix widths are
  // non-decreasing in length for every font, so a binary search is exact and
  // costs ~log2(n) measurements instead of n.
  //
  // Code points, not UTF-16 units: slicing at a surrogate boundary would emit a
  // lone half of an astral character, which renders as a replacement box —
  // a fresh way of drawing garbage inside a box that is supposed to be honest.
  const chars = [...text];
  // A prefix of the FULL length would just be `text + '…'`, wider than `text`,
  // which already failed — so the search never needs to consider it.
  let lo = 1;
  let hi = chars.length - 1;
  let best = 0;
  let bestWidth = 0;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const candidate = chars.slice(0, mid).join('') + LABEL_ELLIPSIS;
    const w = measure(candidate);
    // `Number.isFinite` is NOT redundant with the `<=`: the equivalent-looking
    // `if (w > maxWidth) hi = mid - 1; else accept` accepts NaN, because every
    // comparison against NaN is false. That refactor is one keystroke away and
    // would draw a label of unmeasured width — the defect this file exists to
    // remove, wearing a tidier shape.
    if (Number.isFinite(w) && w <= maxWidth) {
      best = mid;
      bestWidth = w;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  if (best === 0) return SUPPRESSED;
  return { text: chars.slice(0, best).join('') + LABEL_ELLIPSIS, width: bestWidth, elided: true };
}

/**
 * `fitLabel` against a live 2D context, measuring at whatever font the context
 * currently carries. The call sites set `ctx.font` before drawing anyway; this
 * just makes the measurement use the same one instead of a second copy of it.
 */
export function fitLabelInContext(
  ctx: { measureText(text: string): { width: number } },
  text: string,
  maxWidth: number,
): FittedLabel {
  return fitLabel(text, maxWidth, (s) => ctx.measureText(s).width);
}
