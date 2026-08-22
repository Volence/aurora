// A model of the `monospace` metrics THIS APP ACTUALLY RESOLVES, for tests that
// need `measureText` in node (where there is no font stack at all).
//
// Every number here was read out of the running app's own 2D context on
// 2026-08-22 (`scratchpad/label-measure-probe.mjs`, Electron under xvfb, the map
// canvas' own `getContext('2d')`), never estimated:
//
//     8px monospace   'M'  3.9999542236328125   'i' 3.9999542236328125
//                     '…'  7.9998931884765625   '...' 11.999862670898438
//                     'solid' 19.999771118164062
//    16px monospace   'M'  8.000015258789062    'solid' 40.00007629394531
//    32px monospace   'M' 16.000030517578125    'solid' 80.00015258789062
//
// Two facts fall out of that table and are what this helper encodes:
//
//   1. THE ADVANCE IS EXACTLY HALF THE EM. 3.9999542/8 = 0.4999943,
//      8.0000153/16 = 0.5000001, 16.0000305/32 = 0.5000001 — one ratio across a
//      4x size range, so it is the face's advance and not a rounding artefact.
//      (It is also why the booked figure is what it is: 5 cells x 0.5 x 8px =
//      20px of "solid" inside a 16px box.)
//   2. THE ELLIPSIS COSTS TWO CELLS. 7.9998932 / 3.9999542 = 2.0000. U+2026 is
//      not in the mono face, so it is served by a fallback that is double-width.
//      Any budget arithmetic that assumes one cell for it is wrong ON THIS
//      BUILD — which is the whole reason `fitLabel` measures the candidate
//      instead of counting characters.
//
// The production code never imports this: it measures the live context. This
// exists so a node test can state an expectation that was DERIVED from the real
// metric rather than copied from an observed output.

/** Advance width of one monospace cell, as a fraction of the font size. */
export const MONO_ADVANCE_EM = 0.5;

/** Cells the ellipsis occupies in this build's monospace + fallback. */
export const MONO_ELLIPSIS_CELLS = 2;

/** Cells `text` occupies, ellipsis counted at its measured double width. */
export function monoCells(text: string): number {
  let cells = 0;
  for (const ch of text) cells += ch === '…' ? MONO_ELLIPSIS_CELLS : 1;
  return cells;
}

/** Width of `text` at `fontPx`, in the same units `fontPx` is in. */
export function monoWidth(text: string, fontPx: number): number {
  return monoCells(text) * fontPx * MONO_ADVANCE_EM;
}

/** Pixel size out of a CSS font shorthand like `"8px monospace"`. */
export function fontPxOf(font: string): number {
  const m = /(-?[\d.]+)px/.exec(font);
  return m ? Number(m[1]) : NaN;
}

/**
 * `measureText` for a recording context stub: reads the stub's own `.font`, so
 * a draw path that sets the font itself (both overlay paths do) is measured at
 * the size it will actually draw with.
 */
export function monoMeasureText(this: { font: string }, text: string): { width: number } {
  return { width: monoWidth(text, fontPxOf(this.font)) };
}
