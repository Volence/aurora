// Classic (S1 disasm) port for the one shared swatch grid
// (components/art-shared/palette-grid-model.ts).
//
// The whole write path is a pure function with the command injected, so it is
// node-testable without a store; the hook underneath is the only part that binds
// it to classicLevelStore.
//
// THIS FILE IS A CLASSIC COMMAND SITE. It calls classicSetPalette, so it must
// keep claiming the ART facet — a palette edit belongs to the zone-art document,
// and without the claim a Ctrl+Z after a recolour reverts whatever the LAYOUT
// document did last. That claim used to live on ClassicPalettePanel's own root
// element; a shared grid in art-shared/ has no engine of its own to claim for,
// so it rides in on `rootProps` exactly as it does for the object list. The
// wiring guard is components/classic/__tests__/classic-surface.test.ts, whose
// COMMAND_SITES lists this file.
//
// NOTHING HERE PREVIEWS. Classic's live preview is the grid's own draft word —
// no document is touched until the slider is released — so `preview` and `drain`
// are honest no-ops, and giving them anything to do would be importing aeon's
// stranded-drag hazard into an engine that does not have it.

import React from 'react';
import {
  LINE_LENGTH,
  TRANSPARENT_INDEX,
  type PaletteGridPort,
  type PalettePolicy,
} from '../components/art-shared/palette-grid-model';
import {
  useClassicLevelStore,
  classicSetPalette,
  type CommandResult,
} from '../state/classicLevelStore';
import { useToastStore } from '../state/toastStore';
import { useAetherStore } from '../state/aetherStore';
import { classicSurfaceProps } from '../components/classic/classic-surface';

/**
 * Classic locks NOTHING. Its line 0 is an ordinary act palette line — there is
 * no player palette shared across the zone to protect, which is the one reason
 * aeon's Art mount locks its own line 0. Index 0 is still the VDP backdrop, so
 * it is uneditable, but there is no brush on this surface to bind it to as an
 * eraser: clicking it selects it purely so the panel can say why it has no
 * sliders (`'explain'`).
 */
export const CLASSIC_PALETTE_POLICY: PalettePolicy = {
  lockedLines: [],
  transparent: 'explain',
};

/**
 * The act's four CRAM lines as neutral word arrays. Padded to LINE_LENGTH so a
 * short or missing line renders as black rather than as a ragged row — the grid
 * is a fixed 4x16 and a hole in it would read as corruption.
 */
export function classicPaletteLines(palettes: readonly Uint16Array[] | undefined): number[][] {
  if (!palettes) return [];
  return palettes.map((line) =>
    Array.from({ length: LINE_LENGTH }, (_, i) => line[i] ?? 0));
}

/**
 * The repaint key: the act, plus `paletteEpoch` and nothing else.
 *
 * paletteEpoch is the FINE clock — it bumps only when a palette line is written
 * (classicLevelStore's applyCommit reads it off the commit's dirty patch), and
 * an art undo/redo allocates a fresh one (writeArtSnapshot), so it covers every
 * way these swatches can change including the ones no command issued.
 *
 * Two clocks are deliberately NOT in here. `doc` identity, which is what the
 * panel used to subscribe, churns on every classic command in either document —
 * a layout stamp would repaint the palette. And `chunkEpoch`, the coarse clock,
 * bumps for tile and block edits too; keying on it is the regression the finer
 * clocks were introduced to end (a pencil stroke rebuilding every object sprite
 * and all ~965 tile thumbnails).
 */
export function classicPaletteVersionKey(zone: string, act: number, paletteEpoch: number): string {
  return `${zone}:${act}:${paletteEpoch}`;
}

/**
 * Write one swatch as ONE classicSetPalette — a whole-line replace with a single
 * word changed, which is the command shape that makes it a single undo step.
 * `setPalette` is injected so the write path is testable without a store.
 *
 * Rejects rather than clamps. A missing line or an out-of-range index means the
 * caller and the document disagree about the grid's shape, and writing 16 words
 * on that assumption would overwrite a real line with black.
 */
export function commitClassicSwatch(
  setPalette: (line: number, colors: Uint16Array) => CommandResult,
  palettes: readonly Uint16Array[] | undefined,
  line: number,
  idx: number,
  word: number,
): CommandResult {
  const cur = palettes?.[line];
  if (!cur) return { ok: false, error: `no palette line ${line}` };
  if (!Number.isInteger(idx) || idx <= TRANSPARENT_INDEX || idx >= LINE_LENGTH) {
    return { ok: false, error: `palette index ${idx} is not editable` };
  }
  const next = new Uint16Array(LINE_LENGTH);
  for (let i = 0; i < LINE_LENGTH; i++) next[i] = cur[i] ?? 0;
  next[idx] = word & 0xffff;
  return setPalette(line, next);
}

/** Classic has no brush on this surface, so a swatch pick binds nothing. Kept as
 *  a real (stable) function rather than an optional port member: a port that can
 *  omit `select` is a port that can forget it. */
const SELECT_NOTHING = (): void => {};
/** No document is written until the slider is released, so there is nothing to
 *  preview into and — crucially — nothing to strand. */
const PREVIEW_NOTHING = (): void => {};
/** …and therefore nothing to drain on teardown. Aeon's `drain` exists because
 *  its preview mutates the open document; classic's never does. */
const DRAIN_NOTHING = (): void => {};

export function useClassicPaletteGridPort(): PaletteGridPort {
  // The DATA and the CLOCK are subscribed separately, and both are narrow.
  // `doc.palettes` is a fresh array only when a palette command (or an undo)
  // replaced it, so it never churns for a layout edit; `paletteEpoch` is the
  // repaint signal the versionKey is built from. Subscribing `doc` itself —
  // which is what ClassicPalettePanel did — would re-render this grid for every
  // command in the act, undo and redo included.
  const palettes = useClassicLevelStore((s) => s.doc?.palettes);
  const paletteEpoch = useClassicLevelStore((s) => s.paletteEpoch);
  const ref = useClassicLevelStore((s) => s.ref);

  const lines = React.useMemo(() => classicPaletteLines(palettes), [palettes]);
  const rootProps = React.useMemo(() => classicSurfaceProps('art'), []);

  // LIVE PUSH, mirroring the aeon port: whenever a line's words change while a
  // classic ROM is connected, push it so the running game recolours without a
  // rebuild. Only lines that actually changed are (re)sent; the store then
  // coalesces at ~10Hz. ALL FOUR lines are pushable on classic — line 0 is an
  // ordinary act line (see CLASSIC_PALETTE_POLICY above), unlike aeon's.
  //
  // Kind-gated on `paletteKind === 'classic'`: `palette` alone would light up
  // against an AEON ROM, whose listing has no v_palette_line_N to write.
  const lastPushedRef = React.useRef(new Map<number, string>());
  const aetherReady = useAetherStore((s) => s.status === 'connected' && s.paletteKind === 'classic');
  React.useEffect(() => {
    if (!aetherReady) {
      // Forget what was pushed, so reconnecting re-sends the current palette
      // rather than assuming the game still holds it — a reload_rom or a
      // restart puts ROM colours back.
      lastPushedRef.current.clear();
      return;
    }
    const push = useAetherStore.getState().pushPaletteLine;
    for (let line = 0; line < lines.length; line++) {
      const words = lines[line];
      const key = words.join(',');
      if (lastPushedRef.current.get(line) === key) continue;
      lastPushedRef.current.set(line, key);
      push(line, [...words], 'classic');
    }
  }, [lines, aetherReady]);

  const commit = React.useCallback((line: number, idx: number, word: number): void => {
    // Re-read the store rather than closing over `palettes`: a blur can land a
    // frame after an undo replaced the line, and the command must build on what
    // the document holds NOW.
    const res = commitClassicSwatch(
      classicSetPalette,
      useClassicLevelStore.getState().doc?.palettes,
      line, idx, word,
    );
    if (!res.ok) useToastStore.getState().addToast(`Palette edit failed: ${res.error}`, 'error');
  }, []);

  return React.useMemo((): PaletteGridPort => ({
    lines,
    policy: CLASSIC_PALETTE_POLICY,
    paintSel: null,
    versionKey: classicPaletteVersionKey(ref?.zone ?? '', ref?.act ?? -1, paletteEpoch),
    select: SELECT_NOTHING,
    preview: PREVIEW_NOTHING,
    commit,
    drain: DRAIN_NOTHING,
    title: (line, idx) => (idx === TRANSPARENT_INDEX
      ? 'index 0 — transparent'
      : `line ${line}, index ${idx}`),
    heading: (line, idx) => `Line ${line} · Index ${idx}`,
    note: (line, idx) => (idx === TRANSPARENT_INDEX
      ? `Line ${line} · index 0 is transparent — not editable.`
      : null),
    lineLabel: (line) => String(line),
    hint: 'click a swatch to edit · line 0 index 0 = transparent',
    rootProps,
  }), [lines, ref?.zone, ref?.act, paletteEpoch, commit, rootProps]);
}
