// The Genesis swatch grid reduced to what BOTH engines actually share: how one
// swatch renders, what clicking it means, and the CRAM-word arithmetic behind
// the sliders. No React, no stores, no engine names.
//
// A palette is 4 lines x 16 CRAM words in both engines, but they HOLD them
// differently: classic keeps `Uint16Array[]` straight off the level file, aeon
// keeps `{ colors: Color[] }[]` decoded to RGBA. The neutral form here is the
// WORD — it is what the hardware stores, what the sliders edit, and what both
// commit paths ultimately write. RGBA is a render detail, and nothing is lost by
// dropping it: alpha only ever varies on index 0, which draws as a checker
// regardless of what alpha says.
//
// Every conversion goes through core/formats/palette (encodeGenesisColor /
// decodeGenesisColor). There is no second 0BGR bit-layout in this file, on
// purpose: three copies of a `>> 9 & 7` is how the two panels drifted apart in
// the first place.
//
// THE ENGINE DIFFERENCES ARRIVE AS DATA, not as a mode flag. A `PalettePolicy`
// says which lines are locked and what index 0 does when clicked; a port hands
// one over. Anything shaped like `if (engine === 'aeon')` belongs on the far
// side of the port, not here — see components/shared/object-inspector-model.ts,
// whose schema does the same job for the object inspectors.

import type React from 'react';
import {
  decodeGenesisColor, encodeGenesisColor, CRAM_LINE_ENTRIES,
} from '../../../core/formats/palette';

/** The three Genesis colour channels, each 3 bits (0-7) of a CRAM word. */
export type Channel = 'r' | 'g' | 'b';

/**
 * Colours per palette line. Fixed by the VDP, not by either engine.
 *
 * ⚠ IT IS THE CORE CONSTANT, NOT A SECOND 16. It read `= 16` until the effects
 * panel needed the same fact to say where a CRAM byte address lands; two
 * spellings of one hardware number is how two surfaces drift. `CRAM_LINE_ENTRIES`
 * is the one, in core/formats/palette, beside the word arithmetic it belongs to.
 */
export const LINE_LENGTH = CRAM_LINE_ENTRIES;

/**
 * Colour 0 of every line is the BACKDROP: the VDP draws it as transparent in
 * every sprite and in every non-backdrop plane cell. That is hardware, so it is
 * a constant here rather than something a policy could disagree about. What the
 * engines disagree about is what a CLICK on it should do — see
 * `TransparentBehaviour`.
 */
export const TRANSPARENT_INDEX = 0;

/**
 * What clicking the transparent index 0 means. The engines genuinely differ, and
 * this is the honest shape of the difference — both treat index 0 as
 * uneditable, but for opposite reasons.
 *
 *  • `'paint'`   — index 0 IS a usable colour: the eraser. Clicking it binds it
 *    as the brush colour so the next stroke punches transparency. It never opens
 *    the sliders, because there is nothing to edit. (aeon, every mode.)
 *  • `'explain'` — there is no brush to bind it to, so a click selects it purely
 *    so the panel can say WHY it has no sliders. Without this the swatch would be
 *    inert on click and read as broken. (classic.)
 *
 * Both are "index 0 is not editable"; they differ in what the click is FOR.
 */
export type TransparentBehaviour = 'paint' | 'explain';

/**
 * The engine's rules for its swatch grid. Deliberately CONSTANT per mount — no
 * selection state, no callbacks — so a port can declare it as a module-level
 * literal and `swatchState` stays a pure function of (position, rules, selection).
 */
export interface PalettePolicy {
  /**
   * Lines no edit may reach, drawn dimmed and inert.
   *
   * This is the one difference the whole port design exists for. Aeon's line 0
   * is the PLAYER palette — sprite-reserved, shared across the zone, and
   * repainting it from the Art facet would restain Sonic — so the Art mount
   * locks it. Classic's line 0 is an ordinary act palette line with nothing
   * reserved about it, so its policy locks nothing. And aeon's own SPRITE mount
   * unlocks line 0, because editing the player palette is exactly what that pane
   * is for. Three mounts, three lists — one of which is empty, and none of which
   * needs the component to know which engine it is rendering.
   */
  readonly lockedLines: readonly number[];
  /** What a click on `TRANSPARENT_INDEX` does. */
  readonly transparent: TransparentBehaviour;
}

/** A position in the grid. */
export interface SwatchRef {
  readonly line: number;
  readonly idx: number;
}

/**
 * The two selections a grid can carry, which are NOT the same thing:
 *
 *  • `edit`  — the swatch whose sliders (or explain-note) are open. Owned by the
 *    grid itself in both engines; a purely local UI concern.
 *  • `paint` — the swatch bound as the painting colour. Owned by the ENGINE
 *    (aeon's artStore.selectedColor + paletteLine, or the sprite's zoneLine),
 *    and simply absent in classic, which has no brush on this surface. `null`
 *    means the engine has no such concept, not "nothing picked".
 */
export interface PaletteSelection {
  readonly edit: SwatchRef | null;
  readonly paint: SwatchRef | null;
}

export const NO_SELECTION: PaletteSelection = { edit: null, paint: null };

/** Everything the renderer needs to know about one swatch. */
export interface SwatchState {
  /** On a locked line: dimmed, not clickable, never the paint colour. */
  readonly locked: boolean;
  /** Index 0 — drawn as a checker rather than as its RGB, in both engines. */
  readonly transparent: boolean;
  /** Carries the paint-colour outline. */
  readonly paintSelected: boolean;
  /** Carries the edit outline; its sliders (or note) are the ones on screen. */
  readonly editSelected: boolean;
}

export function isLineLocked(line: number, policy: PalettePolicy): boolean {
  return policy.lockedLines.includes(line);
}

export function isTransparent(idx: number): boolean {
  return idx === TRANSPARENT_INDEX;
}

/**
 * How one swatch renders.
 *
 * `policy` is the ENGINE's rules and `sel` is the current state — separate
 * arguments on purpose, so the policy can be a frozen module constant and only
 * the cheap half changes per render.
 *
 * The two "selected" flags treat `locked` differently, which mirrors the two
 * panels as they stand and is not an oversight:
 *
 *  • `paintSelected` is gated on `locked`. The paint line is engine state that
 *    outlives this grid (aeon's artStore.paletteLine persists across a mode
 *    flip), so it CAN point at a line this mount has locked — and outlining a
 *    swatch the user cannot use would be a lie about where the brush is.
 *  • `editSelected` is not gated. The only thing that sets the edit selection is
 *    a click, and `swatchClick` already refuses locked lines — so an edit
 *    selection on a locked swatch means a caller bypassed the click rule, and
 *    hiding that would only make it harder to find.
 */
export function swatchState(
  line: number,
  idx: number,
  policy: PalettePolicy,
  sel: PaletteSelection = NO_SELECTION,
): SwatchState {
  const locked = isLineLocked(line, policy);
  return {
    locked,
    transparent: isTransparent(idx),
    paintSelected: !locked && sel.paint !== null && sel.paint.line === line && sel.paint.idx === idx,
    editSelected: sel.edit !== null && sel.edit.line === line && sel.edit.idx === idx,
  };
}

/** What a click on a swatch is allowed to do. */
export interface SwatchClick {
  /** Tell the port the user picked this swatch (bind the brush colour/line).
   *  A port whose engine has no brush makes this a no-op. */
  readonly select: boolean;
  /** Make it the edit selection — which opens the sliders, or, for index 0
   *  under `'explain'`, the note that says why there are none. */
  readonly edit: boolean;
}

const CLICK_NOTHING: SwatchClick = { select: false, edit: false };

/**
 * The click rule, which is where both engine differences actually bite:
 *
 *  • a locked line does nothing at all;
 *  • index 0 selects-without-editing under `'paint'` (it is the eraser) and
 *    edits-without-selecting under `'explain'` (there is no brush; the "edit"
 *    selection is what makes the note appear);
 *  • every other swatch does both.
 */
export function swatchClick(line: number, idx: number, policy: PalettePolicy): SwatchClick {
  if (isLineLocked(line, policy)) return CLICK_NOTHING;
  if (isTransparent(idx)) {
    return policy.transparent === 'paint'
      ? { select: true, edit: false }
      : { select: false, edit: true };
  }
  return { select: true, edit: true };
}

/** 8-bit channel value → the Genesis 3-bit level (0-7) that can hold it. */
export function channelLevel(v8: number): number {
  return Math.round(Math.min(255, Math.max(0, v8)) / 255 * 7);
}

/**
 * Rebuild a CRAM word with one channel replaced by a 0-7 level.
 *
 * No clamping here, deliberately: `encodeGenesisColor` already clamps to 0-255
 * and quantises, so scaling an out-of-range level back up lands on 0 or 7 either
 * way. A second clamp would be unreachable code pretending to be a safeguard —
 * and a planted violation proved it: removing it changed no test.
 */
export function withChannel(word: number, channel: Channel, level3: number): number {
  const c = decodeGenesisColor(word);
  const levels: Record<Channel, number> = {
    r: channelLevel(c.r),
    g: channelLevel(c.g),
    b: channelLevel(c.b),
  };
  levels[channel] = level3;
  return encodeGenesisColor({
    r: levels.r * 255 / 7,
    g: levels.g * 255 / 7,
    b: levels.b * 255 / 7,
  });
}

/** A CRAM word as a CSS colour. Index-0 swatches never reach this — they draw a
 *  checker — so alpha is deliberately not represented. */
export function swatchCss(word: number): string {
  const c = decodeGenesisColor(word);
  return `rgb(${c.r},${c.g},${c.b})`;
}

/** One aeon palette line (RGBA colours) as the neutral CRAM words. */
export function lineWords(colors: readonly { r: number; g: number; b: number }[]): number[] {
  return colors.map((c) => encodeGenesisColor(c));
}

/**
 * Everything the one swatch grid renders against, supplied per engine by
 * `providers/palette-{classic,aeon}.ts`. The component subscribes to NOTHING —
 * the same discipline as ChunkGridPort and ObjectInspectorPort, and here for a
 * third reason on top of theirs: aeon previews by MUTATING the open document and
 * owes it a guaranteed teardown (`drain`), which only the port can honour.
 */
export interface PaletteGridPort {
  /**
   * The grid to draw: outer index = line, inner = `LINE_LENGTH` CRAM words.
   * Empty when there is nothing open. Not a `Uint16Array[]`, because aeon has no
   * such array to hand over — it holds RGBA and converts (`lineWords`).
   */
  readonly lines: readonly (readonly number[])[];
  /** This engine's swatch rules. Constant for the mount. */
  readonly policy: PalettePolicy;
  /** The engine's paint-colour selection, or null when it has none (classic). */
  readonly paintSel: SwatchRef | null;
  /**
   * Changes iff the rendered swatches can have changed — and NOTHING ELSE. The
   * two engines' clocks are not the same kind of thing (a classic epoch bumped
   * by the palette command; an aeon preview counter plus the history hub), which
   * is the whole reason this is a port and not a prop.
   */
  readonly versionKey: string;
  /** The user picked this swatch as the paint colour / paint line. */
  select(line: number, idx: number): void;
  /**
   * One live-preview tick of an open swatch: no history, no dirty flag. Aeon
   * writes the document in place so the composer canvas repaints; classic has
   * nothing to do here, because the grid's own draft word is its preview.
   */
  preview(line: number, idx: number, word: number): void;
  /**
   * The drag ended normally (pointerup / keyup / blur): record AT MOST ONE undo
   * step. Must be idempotent — the shared slider control commits on release AND
   * again on the blur that follows.
   */
  commit(line: number, idx: number, word: number): void;
  /**
   * The open swatch is going away — the selection moved, closed, or the whole
   * panel unmounted. THIS IS NOT OPTIONAL BOOKKEEPING for an engine that
   * previews by mutating: Chrome does not fire `blur` when a focused element is
   * REMOVED, so without this a drag interrupted by a facet/act/tab change leaves
   * the document changed with no undo entry and no dirty flag — a state no user
   * action can reach or recover. See core/art/palette-drag.ts.
   *
   * Must be safe to call at any time (a no-op with no drag outstanding) and must
   * drain EVERY path the port can preview through, not the one the port thinks
   * is current: by teardown time the mode may already have flipped.
   *
   * Ports must keep this identity-stable, and the host must invoke it through a
   * ref, so an effect cleanup keyed on the open swatch always runs the live one.
   */
  drain(): void;
  /** Tooltip for one swatch. */
  title(line: number, idx: number): string;
  /** Heading over the slider panel, e.g. `Line 2 · Index 5`. */
  heading(line: number, idx: number): string;
  /** Text shown INSTEAD of the sliders for a selected-but-uneditable swatch —
   *  classic's index-0 note. Null means "render the sliders". */
  note?(line: number, idx: number): string | null;
  /** Gutter label for a line (classic's `0`-`3`); absent hides the gutter. */
  lineLabel?(line: number): string;
  /** One-line footer hint under the grid. */
  readonly hint?: string;
  /** Props spread on the root element — classic claims its undo facet here, the
   *  way providers/object-list-classic.ts does. A shared component has no engine
   *  of its own to claim for, so the claim can only ride in on the port. */
  readonly rootProps?: React.HTMLAttributes<HTMLElement>;
}
