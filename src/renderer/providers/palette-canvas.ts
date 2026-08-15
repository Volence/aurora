// Canvas port for the one shared swatch grid
// (components/art-shared/palette-grid-model.ts).
//
// A canvas document owns its OWN 64 colours — it is not showing a zone's
// palette, it IS the palette — so this port is the only one of the three whose
// `lines` come from a document the same pane is drawing on. That is what makes
// the click rule differ from classic's: there IS a brush here, and a canvas
// pixel index is a palette index, so clicking swatch (line, idx) binds
// `canvasIndex(line, idx)` as the paint colour. Index 0 uses the `'paint'`
// transparent behaviour for the same reason aeon does — index 0 is the eraser,
// and clicking it arms it rather than opening sliders it has no colours for.
//
// FOUR ROWS ALWAYS, whatever the profile says. `genesis-sprite` declares
// `paletteLines: 1`, and the temptation is to show one row. Spec §4.3 is
// explicit that constraints are REPORTED, never PREVENTED: the artist may paint
// across four lines under a one-line profile and see the violation, and a grid
// that hides three quarters of the document's own colours would make the
// violation unreadable and the colours uneditable. Plan 2B is what checks the
// profile; nothing here does.
//
// NOTHING HERE PREVIEWS, exactly as in palette-classic.ts and for a sharper
// reason: the only way to preview into a canvas document is `setPalette`, which
// RECORDS an undo entry and dirties the document, so a slider drag would push
// one undo entry per pointer-move tick. The grid's own draft word is the
// preview (PaletteGrid keeps it in local state), so `preview` and `drain` are
// honest no-ops. The cost is real and worth naming: the ARTWORK does not
// recolour until the slider is released. See the note on `commit`.
//
// The write path is a pure function (`commitCanvasSwatch`) so it is node-
// testable without a store; the hook underneath is the only part that binds it
// to canvasStore.

import React from 'react';
import {
  LINE_LENGTH,
  TRANSPARENT_INDEX,
  type PaletteGridPort,
  type PalettePolicy,
  type SwatchRef,
} from '../components/art-shared/palette-grid-model';
import {
  CANVAS_COLORS, CANVAS_LINES,
  canvasIndex, paletteEntryOf, paletteLineOf,
} from '../../core/art/canvas-doc';
import { useCanvasStore } from '../state/canvasStore';
import { useToastStore } from '../state/toastStore';

/**
 * A canvas locks NOTHING — every one of its four lines is the artist's own, with
 * no player palette to protect (aeon's reason) and no act data behind it
 * (classic's). Index 0 is the backdrop in every line, so it is uneditable, but
 * unlike classic there IS a brush to bind it to: `'paint'` makes clicking it arm
 * the eraser.
 */
export const CANVAS_PALETTE_POLICY: PalettePolicy = {
  lockedLines: [],
  transparent: 'paint',
};

/**
 * The document's 64 words as 4 rows of 16.
 *
 * Padded and truncated to exactly CANVAS_LINES x LINE_LENGTH rather than
 * trusting the length: a short palette would otherwise render a ragged grid,
 * which reads as corruption, and a long one (a sidecar hand-edited to 80 words)
 * would render swatches no pixel index can name.
 */
export function canvasPaletteLines(palette: readonly number[]): number[][] {
  return Array.from({ length: CANVAS_LINES }, (_, line) =>
    Array.from({ length: LINE_LENGTH }, (_, idx) => palette[line * LINE_LENGTH + idx] ?? 0));
}

/**
 * Which swatch carries the paint outline, for a 0..63 paint index.
 *
 * Index 0 always resolves to line 0's swatch, even when the artist clicked line
 * 2's index 0. That is not a rounding error — it is the document's whole
 * transparency thesis (canvas-doc.ts): 0, 16, 32 and 48 are ONE colour with one
 * spelling, so there is exactly one swatch that can honestly claim to be it.
 */
export function canvasPaintSel(paintIndex: number): SwatchRef {
  const v = canvasIndex(paletteLineOf(paintIndex), paletteEntryOf(paintIndex));
  return { line: paletteLineOf(v), idx: paletteEntryOf(v) };
}

/**
 * The repaint key. Built from the document id and the WORDS THEMSELVES rather
 * than from a clock, because this store has no palette epoch to read and a
 * content key cannot drift from what it describes — `versionKey`'s contract is
 * "changes iff the rendered swatches can have changed, and nothing else", which
 * a hash of exactly those swatches satisfies by construction. 64 numbers is
 * cheap enough to stringify beside a grid that renders 64 buttons.
 */
export function canvasPaletteVersionKey(docId: string, palette: readonly number[]): string {
  let key = docId;
  for (let i = 0; i < CANVAS_COLORS; i++) key += `:${(palette[i] ?? 0).toString(36)}`;
  return key;
}

/** What a slider release should do to the document's palette. */
export type CanvasSwatchCommit =
  | { kind: 'palette'; palette: number[] }
  | { kind: 'unchanged' }
  | { kind: 'rejected'; error: string };

/**
 * Build the 64-word palette one swatch edit produces.
 *
 * `'unchanged'` IS THE IDEMPOTENCE the port contract demands: the shared slider
 * commits on release AND again on the blur that follows, and `setPalette`
 * records unconditionally, so without this every slider drag would leave two
 * undo entries — the second of which restores the value it already had. The
 * user would then press Ctrl+Z, see nothing happen, and press it again,
 * throwing away the stroke before the recolour.
 *
 * Rejects rather than clamps, for palette-classic's reason: an out-of-range
 * line or index means the caller and the document disagree about the grid's
 * shape, and writing 64 words on that assumption would overwrite real colours.
 */
export function commitCanvasSwatch(
  palette: readonly number[],
  line: number,
  idx: number,
  word: number,
): CanvasSwatchCommit {
  if (palette.length !== CANVAS_COLORS) {
    return { kind: 'rejected', error: `palette holds ${palette.length} colours, not ${CANVAS_COLORS}` };
  }
  if (!Number.isInteger(line) || line < 0 || line >= CANVAS_LINES) {
    return { kind: 'rejected', error: `no palette line ${line}` };
  }
  // idx 0 is the backdrop in every line — hardware, not policy. `swatchClick`
  // already refuses to open sliders on it, so reaching here means a caller went
  // around the grid.
  if (!Number.isInteger(idx) || idx <= TRANSPARENT_INDEX || idx >= LINE_LENGTH) {
    return { kind: 'rejected', error: `palette index ${idx} is not editable` };
  }
  const at = line * LINE_LENGTH + idx;
  const next = word & 0xffff;
  if (palette[at] === next) return { kind: 'unchanged' };
  const out = palette.slice();
  out[at] = next;
  return { kind: 'palette', palette: out };
}

/** Nothing is written to the document until the slider is released (see the
 *  header), so there is nothing to preview into and nothing to strand. */
const PREVIEW_NOTHING = (): void => {};
/** …and therefore nothing to drain on teardown. */
const DRAIN_NOTHING = (): void => {};

/**
 * The port for ONE canvas document. `docId` comes from the pane, which derives
 * it from the ACTIVE TAB (R14c) — not from `activeDocId`, so this grid can never
 * edit one document's palette while another's pixels are on screen.
 */
export function useCanvasPaletteGridPort(docId: string): PaletteGridPort {
  // Subscribed narrowly: the palette array identity (a fresh array on every
  // setPalette / undo / redo — see canvasStore.setPalette and
  // writeCanvasSnapshot) and the paint index. Subscribing to the whole document
  // entry would repaint all 64 swatches on every pencil stroke.
  const palette = useCanvasStore((s) => s.docs.get(docId)?.doc.palette);
  const paintIndex = useCanvasStore((s) => s.paintIndex);

  const words = React.useMemo(() => palette ?? [], [palette]);
  const lines = React.useMemo(() => canvasPaletteLines(words), [words]);

  const select = React.useCallback((line: number, idx: number): void => {
    useCanvasStore.getState().setPaintIndex(canvasIndex(line, idx));
  }, []);

  const commit = React.useCallback((line: number, idx: number, word: number): void => {
    // Re-read the document rather than closing over `words`: a blur can land a
    // frame after an undo replaced the palette, and the write must build on what
    // the document holds NOW.
    const cur = useCanvasStore.getState().docs.get(docId)?.doc.palette;
    if (!cur) return; // the document closed while the slider was open
    const res = commitCanvasSwatch(cur, line, idx, word);
    if (res.kind === 'unchanged') return;
    if (res.kind === 'rejected') {
      useToastStore.getState().addToast(`Palette edit failed: ${res.error}`, 'error');
      return;
    }
    useCanvasStore.getState().setPalette(docId, res.palette);
  }, [docId]);

  return React.useMemo((): PaletteGridPort => ({
    lines,
    policy: CANVAS_PALETTE_POLICY,
    paintSel: canvasPaintSel(paintIndex),
    versionKey: canvasPaletteVersionKey(docId, words),
    select,
    preview: PREVIEW_NOTHING,
    commit,
    drain: DRAIN_NOTHING,
    title: (line, idx) => (idx === TRANSPARENT_INDEX
      ? `index 0 — transparent (the eraser); paints ${canvasIndex(line, idx)}`
      : `line ${line}, index ${idx} — paints ${canvasIndex(line, idx)}`),
    heading: (line, idx) => `Line ${line} · Index ${idx}`,
    lineLabel: (line) => String(line),
    hint: 'click a swatch to paint with it · index 0 is the eraser · colours are this canvas’s own',
  }), [lines, words, docId, paintIndex, select, commit]);
}
