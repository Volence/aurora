// THE RASTER TIMELINE — where this scene's layer bands and splits, and the
// selected PRESET's palette bands, land down the 224-line frame (ROADMAP §4.6,
// "224-line strip, split markers, palette stops").
//
// THE DEFECT IT CLOSES. An author sets `vsplit.at` in a spinner and **nothing on
// screen changes**. It is the same shape as the two defects closed earlier on
// 2026-08-28 — the curve ramp was authorable and invisible, priority was
// authorable and invisible — and it is closed the same way: by drawing the
// value, not by describing it.
//
// ═══ TWO COLUMNS, TWO DOCUMENTS, AND ONLY ONE OF THEM IS EDITABLE HERE ═══
//
// The PRESET column (left, against the ruler) draws `EffectsPreset.bands` —
// intervals with two edges, from `presets/<id>.json`. It is the editable one:
// drag an edge, double-click (or Alt-click) inside a band to split it. Every
// rule those gestures obey is declared in `providers/effects-preset.ts`'s
// timeline block and derived there from aeon's shipped `raster_dsl.emp`; NOTHING
// in this file spells a bound of its own.
//
// The LAYER column (right) draws the scene's `CameraPreviewPlan` bands, and the
// split rules across the strip draw `vsplit` fires. Both are READ-ONLY here and
// stay so: a layer top is authored on the MAP, in the map's world axis, by a
// guide this strip must not become a second, disagreeing ruler for.
//
// ═══ THE RULING THIS FILE USED TO CARRY — DISCHARGED 2026-08-28, ACTED ON HERE
//
// It said: "Aeon is designing N-bands (`docs/superpowers/specs/2026-08-28-raster
// -band-ownership-design.md` at aeon `0bee83c61e9c53ade6899f7389f666720215caf7`
// ...). That design decides band OWNERSHIP and EDGE semantics. So this module
// DRAWS and does not EDIT: no marker is draggable, no split is created or
// deleted here." **The design landed on 2026-08-28** — P1, P2a and
// `parcel/band-first-consumer` all shipped, N bands exercised by `OJZ_BandDemo`
// on every build; only P2b/P3 remain design-only. The ownership and edge
// semantics it was waiting on are now shipped CODE, in `band()`,
// `check_intervals` and `check_band_ownership`, and that code is what the
// editing half reads. Kept as the record of what was believed, for the reason
// the panel's own header states at length: nothing re-reads a comment to check
// whether the rule it cites still holds.
//
// ⚠ WHAT IS STILL NOT TRANSCRIBED, and this half of the ruling is UNCHANGED. NO
// BAND COUNT, NO BAND HEIGHT MINIMUM, NO WIRE SIZE is copied out of that design.
// Its height minimum is cost-keyed in the engine on purpose; a number copied out
// of it is the copied-pin defect this repo keeps paying for. The two bounds the
// editing half does name are the two that live in shipped engine code, and it
// names them by importing them.
//
// ⚠ AND NOT THE CLOCK. Nothing here moves a band over time. That is ROADMAP §5.1
// row 95 and it is genuinely gated on aeon's DoD item 4 (P2b plus the
// time-driven anchor mover, still design-only). Camera bands preview
// clocklessly; only timer-driven bands would need one.
//
// ═══ THE COORDINATE-SPACE FINDING — READ THIS BEFORE ADDING A ROW ═══
//
// A layer's top and a split's line are **not the same quantity**, and putting
// both on one 224-line ruler without establishing that they are commensurable
// would produce a picture that looks authoritative and is wrong. Three spaces,
// and aeon names them in exactly these words (`engine/level/scene_dsl.emp`, at
// the revision above):
//
//   1. ACT space. `layer(world_y:)` ensures `world_y >= 0 && world_y < $8000`
//      — "the engine's act-axis span". A layer top is authored HERE.
//   2. PLANE space. `scene_plane_line(s, wy)` maps act -> Plane-B line, ensured
//      into `0 .. 511`. Locked (`v_factor == 15`) it is the IDENTITY; unlocked
//      it is `((wy - v_center) >> v_factor) + v_offset`.
//   3. SCREEN space — the strip's own ruler, 0..223. Step 4a maps plane to
//      screen as `plane_line - (Vscroll_BG mod 512)` EVERY FRAME.
//
// `scene_vsplit_line()`'s own header calls its result "a vertical split's SCREEN
// line" and calls itself "the second hop of two", and its first statement is
//
//     ensure(s.sc_v_factor == 15,
//            "... this scene's Plane B tracks the camera (v_factor {..}), so a
//             layer top has no comptime SCREEN line — Vscroll_BG changes every
//             frame and the fire line is baked ...")
//     return scene_plane_line(s, wy) - s.sc_v_offset
//
// and `scene()` refuses the unlocked-plus-vsplit combination outright, because
// a split "carries ONE baked scroll value at ONE baked fire line, and that line
// is derived at comptime from the layer top, which is a screen line only while
// Vscroll_BG is constant."
//
// **THE ANSWER: the two axes are commensurable exactly when `v_factor == 15`,
// and not otherwise.** On an unlocked scene a layer top does not merely have an
// unknown screen line — it has none until runtime. `rasterTimelineSpaceNotice`
// says that, in the app's own voice, and `spaceCertain` on every row lets the
// draw put those rows in a different visual register: what the strip shows for
// an unlocked scene is where the tops land FOR THE CAMERA AT THE FRAME'S ANCHOR
// RIGHT NOW, which slides the instant the camera moves.
//
// AND WHERE THEY DO MEET, THEY MEET EXACTLY. Under the lock, for every split
// whose fire line is legal, the preview's own band top and the engine's baked
// line are THE SAME NUMBER — not approximately, identically:
//
//   locked  =>  planeTop = world_y  and  vs = v_offset & 511
//   a legal fire line is 3..223, so  planeTop - vs = world_y - v_offset >= 3 > 0
//   `rebasePlaneTopsToScreen` picks k = the LAST band with planeTop <= vs, so a
//   band with planeTop > vs is never band k, never takes the `top = 0` arm, and
//   never takes the `top <= 0 => += 512` wrap; 223 < SCREEN_HEIGHT so the clamp
//   is not reached either. Its screen top is therefore `planeTop - vs`, which is
//   `world_y - v_offset`, which is `fireScreenLineOf` — aeon's
//   `scene_plane_line(s, wy) - s.sc_v_offset`.
//
// `__tests__/raster-timeline.test.ts` sweeps that rather than asserting it once:
// it is the load-bearing claim of the whole strip, and it is the claim a tidy
// false ruler would break silently.
//
// ═══ TWO MECHANISMS, TWO GRAMMARS — A SPLIT IS NOT A BAND ═══
//
// Both are called "raster" and they are shaped differently, so they must not be
// drawn alike:
//
//   • A VERTICAL SPLIT is a **boundary with ONE edge**. One mid-frame write of
//     an absolute value to VSRAM entry 1; no paired restore, no end line. It
//     runs from its line to the bottom of the frame, superseded by the next
//     split if there is one, and undone only by the next frame's top-of-frame
//     write. Drawn here as a rule with a downward flag.
//   • A PALETTE BAND is an **interval with TWO edges** — an ON op and a paired
//     `pal_restore`, which is the whole subject of aeon's N-bands design. Drawn
//     here as a RECTANGLE with two grabbable edges, in its own column, and never
//     as a rule. An interval drawn as a boundary, or a boundary drawn as an
//     interval, is the picture that looks authoritative and misstates the
//     mechanism. `rasterTimelineAbsences` still says "palette bands" when there
//     is no preset to draw, because then they really are not drawn.
//
// ═══ NO CLOCK ═══
//
// Everything here is a pure function of the scene and the frame anchor, drawn
// out of a React render that already runs on a store change. Nothing schedules
// anything; MapViewport's measured zero-idle-repaint property is untouched
// because this is not MapViewport.

import type { EffectsScene, EffectsLayer } from '../../core/formats/effects/scene';
import type { EffectsPreset, EffectsPresetBand } from '../../core/formats/effects/preset';
import { bandArm, bandCollisionAdvisory, clampBandEdge } from '../providers/effects-preset';
import { factorLabel } from '../../core/formats/effects/scene-ui';
import type { CameraPreviewPlan, CameraPreviewBand } from './camera-preview';
import {
  layerTopSpace, fireScreenLineOf, layerEmitsFire, vsplitFieldValue, vDeformValue,
  EFFECTS_FIRE_LINE_MIN, EFFECTS_FIRE_LINE_MAX, VSPLIT_LOCK_CLAUSES, VSPLIT_VDEFORM_CLAUSES,
  type LayerTopSpace,
} from '../providers/effects-aeon';
import { SCREEN_HEIGHT } from '../../core/model/screen';
import {
  EFFECTS_GUIDE_LINE, EFFECTS_GUIDE_LINE_DISABLED,
  EFFECTS_GUIDE_LABEL_BG, EFFECTS_GUIDE_LABEL_TEXT,
  EFFECTS_GUIDE_REFUSED, EFFECTS_GUIDE_REFUSED_BG, EFFECTS_GUIDE_REFUSED_TEXT,
  CAMERA_PREVIEW_LABEL_BG, CAMERA_PREVIEW_LABEL_TEXT, CAMERA_PREVIEW_LABEL_WARN,
} from './canvas-colors';

/**
 * How many lines the strip is. `SCREEN_HEIGHT`, not a literal 224 — the ruler IS
 * the frame, and `core/model/screen.ts` is where that number is agreed with
 * aeon's `engine/system/constants.emp`.
 */
export const RASTER_TIMELINE_LINES = SCREEN_HEIGHT;

// ---------------------------------------------------------------------------
// THE STRIP'S OWN GEOMETRY — fixed, integral, and published
//
// ⚠ FIXED INTRINSIC SIZE ON PURPOSE. `devicePixelRatio` under Xvfb has been
// observed at 1 and at 1.35 in one session on this host, and a canvas sized from
// its client rect is then fractional — which presents as an off-by-one in the
// FEATURE when the feature is fine, and cost a full review cycle on this exact
// surface. This canvas has a constant backing store, so `getImageData` here is
// in strip space with no dpr factor and no rounding anywhere. CSS may scale the
// element; nothing measured depends on that.
// ---------------------------------------------------------------------------

/** 1 strip pixel per screen line — the ruler is 1:1 so no aim needs a scale. */
export const RASTER_TIMELINE_SCALE = 1;
/**
 * Canvas-local Y of screen line 0. Room above for the header line AND for the
 * two column captions — two columns that are not named are two columns an author
 * has to guess between, and only one of them is editable.
 */
export const RASTER_TIMELINE_ORIGIN_Y = 26;
/**
 * The PRESET band column — the editable one, and it gets the ruler.
 *
 * ⚠ AGAINST THE TICKS ON PURPOSE. This is the column an author drags, and the
 * numbers they are dragging TO are the ruler's. The layer column, which nothing
 * here edits, moved right to make room; its own constants are still what the
 * report publishes, so no aim anywhere is typed.
 */
export const RASTER_TIMELINE_PRESET_X = 34;
export const RASTER_TIMELINE_PRESET_W = 26;
/** The scene LAYER band column: left edge and width, in strip px. */
export const RASTER_TIMELINE_STRIP_X = 66;
export const RASTER_TIMELINE_STRIP_W = 26;
/** Where a split's rule starts and how far it runs. */
export const RASTER_TIMELINE_RULE_X = RASTER_TIMELINE_STRIP_X - 6;
/** Overall canvas size, derived from the pieces above. */
export const RASTER_TIMELINE_W = 258;
export const RASTER_TIMELINE_H =
  RASTER_TIMELINE_ORIGIN_Y + RASTER_TIMELINE_LINES * RASTER_TIMELINE_SCALE + 30;

/**
 * How near an edge a pointer must be to grab it, in strip px.
 *
 * `GUIDE_GRAB_PX`'s value and its reason, on the surface that already settled
 * this question for a horizontal line the author aims at with a mouse.
 */
export const BAND_EDGE_GRAB_PX = 5;

/** Canvas-local Y of a screen line. The one transform, and it is exact. */
export function lineToStripY(line: number): number {
  return RASTER_TIMELINE_ORIGIN_Y + line * RASTER_TIMELINE_SCALE;
}

/**
 * The screen line at a canvas-local Y — `lineToStripY` inverted, EXACTLY.
 *
 * ⚠ NOT ROUNDED HERE. A gesture's raw request is fractional and the raw request
 * is what an advisory has to speak about: `bandEdgeNotice` rounds it once, and a
 * second rounding on the way in would make a pointer at 66.6 ask for a bound it
 * is not actually against. `clampBandEdge` is the one that rounds to write.
 */
export function stripYToLine(y: number): number {
  return (y - RASTER_TIMELINE_ORIGIN_Y) / RASTER_TIMELINE_SCALE;
}

// ---------------------------------------------------------------------------
// The view-model. LOCAL, per-render, and deliberately not a document shape.
// ---------------------------------------------------------------------------

/**
 * One band's extent on the strip — a projection of `CameraPreviewBand`, not a
 * second model of one. Every field is either copied from the plan or is
 * arithmetic on the strip's own ruler.
 */
export interface RasterTimelineBandRow {
  layer: number;
  screenTop: number;
  screenBottom: number;
  /** Canvas-local Y of `screenTop`, and the height in strip px. */
  y: number;
  h: number;
  enabled: boolean;
  /** `fb` is the locked factor — this band will not move for any camera X. */
  locked: boolean;
  /** This band showed the band above's scroll (`.band_disabled` inheritance). */
  inherited: boolean;
  label: string;
  /**
   * ⚠ FALSE means this row's screen position DOES NOT EXIST outside this
   * instant — the scene's Plane B tracks the camera, so the top is an act
   * coordinate that Step 4a re-maps every frame. The draw puts these in a
   * different register; see the file docblock.
   */
  spaceCertain: boolean;
}

/**
 * One vertical split, as the ENGINE fires it: a **boundary with one edge**.
 *
 * `line` is `fireScreenLineOf` — aeon's `scene_vsplit_line`, which is the baked
 * comptime number, NOT a position read off the preview. Where both exist they
 * are identical (see the docblock's derivation, swept in the tests); where they
 * differ the scene does not build, and `refusal` is why.
 */
export interface RasterTimelineSplitRow {
  layer: number;
  /** The baked SCREEN line the fire lands on. May be outside 0..223. */
  line: number;
  /** `vsplit.at` — the Plane-B ROW scrolled to from `line` down. A PAYLOAD, not a position. */
  at: number;
  /** Canvas-local Y of `line`, or null when the line is off the strip. */
  y: number | null;
  /** The engine's own refusal for this split, or null. */
  refusal: string | null;
}

/**
 * One PRESET palette band on the strip — an interval with two grabbable edges.
 *
 * ⚠ `top` AND `bot` ARE THE DOCUMENT'S OWN NUMBERS, not a projection of a plan.
 * That is the difference from `RasterTimelineBandRow` above and it is the whole
 * reason this column is editable and that one is not: a preset band's edges ARE
 * screen lines, authored as screen lines, so a drag writes back exactly what the
 * ruler shows. A layer's top is an ACT coordinate that only has a screen line
 * under the lock, and a strip that let an author drag it would be authoring in a
 * space the value does not live in.
 */
export interface RasterTimelinePresetBandRow {
  index: number;
  top: number;
  bot: number;
  /** Canvas-local Y of `top`, and the height in strip px. Clipped to the ruler. */
  y: number;
  h: number;
  /** True while this row is the one a gesture is moving. */
  dragging: boolean;
  sh: boolean;
  /** Which ON arm, for the column's label. Null when the band carries none. */
  arm: string | null;
  /** What this band collides with in the rest of the preset, or null. */
  collision: string | null;
}

/** What the strip is showing, in one throwaway bundle. */
export interface RasterTimelineView {
  sceneId: string;
  space: LayerTopSpace;
  bands: RasterTimelineBandRow[];
  splits: RasterTimelineSplitRow[];
  /** The preset whose bands the left column is drawing, or null. */
  presetId: string | null;
  presetBands: RasterTimelinePresetBandRow[];
  /** Sentences the strip must say for this scene. Empty is the common case. */
  notices: string[];
  /** Mechanisms this strip does not draw. Never empty. */
  absent: string[];
}

/**
 * What a gesture is asking of one preset band, while it is asking.
 *
 * PER-GESTURE AND THROWN AWAY, exactly like the view it feeds: the document is
 * not touched until the pointer comes up, so a drag that is abandoned leaves no
 * command and no undo entry. `MapViewport`'s guide drag is the idiom.
 */
export interface RasterTimelinePresetDrag {
  index: number;
  edge: 'top' | 'bot';
  /** The value that WOULD be written — already held at the bound. */
  line: number;
  /** The raw line the pointer is asking for, pre-clamp. Drives the notice. */
  requested: number;
}

/**
 * The strip's caption when a layer top has no screen line at all.
 *
 * ⚠ NOT A HEDGE — a statement of what the engine believes. `scene_vsplit_line`
 * refuses to compute a screen line for this scene, in those words; drawing the
 * tops on a screen ruler anyway and saying nothing would be inventing a fact.
 */
export function rasterTimelineSpaceNotice(
  scene: Pick<EffectsScene, 'v_factor'>,
): string | null {
  if (layerTopSpace(scene) === 'screen') return null;
  return `Plane B tracks the camera (v_factor ${scene.v_factor}), so a layer top has no `
    + 'fixed screen line: these rows are where the tops land for THIS camera only, '
    + 'and the engine refuses a split on this scene.';
}

/**
 * The refusal for one split, or null.
 *
 * TWO ENGINE RULES, and they are different failures:
 *   • an unlocked scene cannot carry a split at all (`scene()`'s two-writer
 *     ensure) — the split has no baked line to draw;
 *   • a locked scene's fire must land on `3..223` (`fire()`), because lines
 *     0..2 belong to the priming records.
 *
 * ⚠ THE FIRST ARM COMPOSES THE PROVIDER'S CLAUSES (ROADMAP row 80). It used to
 * carry its own wording, which named ONE of the engine's two remedies and never
 * named the mechanism — and it was, until row 80, the ONLY thing in Aurora that
 * said anything about this combination, in a collapsible section away from the
 * controls that create it. `VSPLIT_LOCK_CLAUSES` is now the single declaration
 * and the panel's two sentences compose the same words; see the block above
 * `vsplitLockAdvisory` in `providers/effects-aeon.ts`.
 */
export function splitRefusal(
  scene: Pick<EffectsScene, 'v_factor' | 'v_offset' | 'v_deform'>,
  layer: Pick<EffectsLayer, 'world_y' | 'vsplit'>,
): string | null {
  if (layerTopSpace(scene) !== 'screen') {
    // Phrased to follow the strip's own subject ("Layer N's split …"), which is
    // why the clause itself carries no subject.
    return `cannot be baked: ${VSPLIT_LOCK_CLAUSES.sceneIs(scene.v_factor)}, so it has no fire `
      + `line and the build refuses the WHOLE SCENE. ${VSPLIT_LOCK_CLAUSES.mechanism} `
      + VSPLIT_LOCK_CLAUSES.remedies;
  }
  // ⚠ AEON'S SECOND VSPLIT ENSURE, AND IT WAS MISSING HERE.
  //
  // `scene()` refuses a vsplit on a per-column scene as flatly as it refuses one
  // on an unlocked scene — the two ensures are adjacent lines in
  // `engine/level/scene_dsl.emp`. This function transcribed the first and not the
  // second, so a scene with `v_factor: 15` AND a `v_deform` drew its splits as
  // perfectly good marks with no refusal at all, on a document the build will not
  // accept. A guard whose two halves sit on different scene fields is exactly the
  // one a transcription drops; `curveAnchorDeformAdvisory`'s docblock says the
  // same thing about the anchor guard, and this is the second instance.
  //
  // ORDER MATTERS AND IS DELIBERATE: the lock arm goes first because it is the
  // one that destroys the FIRE LINE (`layerTopSpace` decides whether a layer top
  // is even a screen line), so the sentence below it would be arithmetic on a
  // quantity that does not exist. This arm's scene has a fire line; what it does
  // not have is a plane to apply it to.
  if (vDeformValue(scene) !== null) {
    return `cannot be authored beside a V deform: ${VSPLIT_VDEFORM_CLAUSES.sceneIs}, and the `
      + `build refuses the WHOLE SCENE. ${VSPLIT_VDEFORM_CLAUSES.mechanism} `
      + VSPLIT_VDEFORM_CLAUSES.remedies;
  }
  const line = fireScreenLineOf(scene, layer.world_y);
  if (line >= EFFECTS_FIRE_LINE_MIN && line <= EFFECTS_FIRE_LINE_MAX) return null;
  return `fires on screen line ${line}, outside ${EFFECTS_FIRE_LINE_MIN}..${EFFECTS_FIRE_LINE_MAX} `
    + `(lines 0-${EFFECTS_FIRE_LINE_MIN - 1} belong to the priming records). The build refuses it.`;
}

/**
 * What this strip does not draw. Never empty — see the two-grammars block.
 *
 * ⚠ SHORT PHRASES, BECAUSE THIS IS DRAWN. The first build put the whole
 * interval-versus-boundary sentence in here and the canvas truncated it to
 * "palette bands (an interval with tw…" — an honesty line that cannot be read is
 * not an honesty line. The canvas says WHAT is missing; `RASTER_TIMELINE_GRAMMAR`
 * below says WHY the two mechanisms are not interchangeable, in prose beside the
 * strip where a sentence has room to be a sentence.
 */
export function rasterTimelineAbsences(hasPreset = false): string[] {
  // ⚠ THE FLAG IS NOT A COSMETIC. "palette bands" was true of every build until
  // row 94 and is now true only when there is no preset to draw — and an honesty
  // line that keeps naming something the strip IS showing teaches an author to
  // stop reading it, which costs the two entries that are still true.
  return hasPreset ? ['per-line deform'] : ['palette bands', 'per-line deform'];
}

/**
 * THE SENTENCE THE STRIP'S SHAPE DEPENDS ON, for the panel to render beside it.
 *
 * Two mechanisms are both called "raster" and they are shaped differently. A
 * reader who takes the split rules for band edges has the wrong model of the
 * hardware, and that is a worse outcome than not drawing them at all.
 */
export const RASTER_TIMELINE_GRAMMAR =
  'A split is ONE edge: from its line to the bottom of the frame, until the next split '
  + 'supersedes it: there is no paired restore and no end line, and nothing here edits one. '
  + 'A palette band is an INTERVAL with two edges, and those two edges are the ones you drag.';

/**
 * How to work the editable column, in the app's own voice.
 *
 * ⚠ NAMED GESTURES, BESIDE THE THING THEY WORK ON. A drag handle nobody knows is
 * a handle is the same defect as a value nobody can see — this strip's own
 * founding defect one turn later. `BAND_SPLIT_LAW` carries WHY the cut line goes
 * clear; this carries WHAT to do, and the two are separate sentences because one
 * is about the hardware and one is about the mouse.
 *
 * ⚠ AND "ABOUT THE HARDWARE" OVERSTATES IT. The cut line goes clear because
 * ABUTTING BANDS DO NOT BUILD at aeon `2e976223` — a dated claim about their
 * current guards, not a property of the VDP. OVERLAP IS DESIGNED, NOT
 * IMPOSSIBLE (their `check_intervals` comment); a swept runtime-resolution
 * design is banked. Stated ONCE, with its date, owner, expiry and re-read list,
 * in the GAP RULE block of `providers/effects-preset.ts` — go there before
 * writing anything new about it here, and do not relax anything on the strength
 * of the banked design.
 */
export const RASTER_TIMELINE_GESTURES =
  'Drag a band edge in the left column to move it. Double-click (or Alt-click) inside a band '
  + 'to split it there. Each gesture is one undo step.';

/**
 * The whole view, derived from the plan the camera preview draws from.
 *
 * ⚠ IT TAKES THE PLAN RATHER THAN RE-DERIVING FROM THE SCENE. That is the point
 * of the parcel: the strip has to be the SAME OBJECT the frame shows, seen a
 * different way. A second walk over `scene.layers` would drift from the preview
 * on the first change to either, and the symptom would be a strip that disagrees
 * with the rectangle beside it about where a band starts.
 *
 * The SPLITS are the exception and they come from the scene, because they are
 * not a plan quantity: the plan carries `vsplitAt` only for the bands it could
 * place, and a split the engine REFUSES has no band to hang off. Drawing only
 * the ones the preview placed would hide exactly the ones that break the build.
 */
/**
 * The PRESET column's rows, with one band's edge optionally moved by a gesture.
 *
 * ⚠ THE DRAG IS APPLIED HERE AND NOWHERE ELSE. The document is not touched until
 * the pointer comes up, so the preview and the committed value must be the SAME
 * arithmetic or the band jumps on release — the class of defect a preview drawn
 * from a second copy of the rule always eventually has. `clampBandEdge` is that
 * arithmetic, imported, and the commit calls it too.
 */
export function rasterTimelinePresetRows(
  preset: EffectsPreset | null, drag: RasterTimelinePresetDrag | null,
): RasterTimelinePresetBandRow[] {
  if (preset === null) return [];
  return (preset.bands ?? []).map((band, index) => {
    const held = drag !== null && drag.index === index
      ? { ...band, [drag.edge]: drag.line } as EffectsPresetBand
      : band;
    // CLIPPED TO THE RULER, not dropped: a band whose edges sit outside 3..223
    // is a document the loader keeps and the build refuses, and a row that
    // vanished would hide exactly the band the author has to fix.
    const topY = lineToStripY(Math.max(0, Math.min(RASTER_TIMELINE_LINES, held.top)));
    const botY = lineToStripY(Math.max(0, Math.min(RASTER_TIMELINE_LINES, held.bot)));
    return {
      index,
      top: held.top,
      bot: held.bot,
      y: topY,
      h: Math.max(0, botY - topY),
      dragging: drag !== null && drag.index === index,
      sh: held.sh === true || held.sh === 1,
      arm: bandArm(held),
      collision: bandCollisionAdvisory(preset, index),
    };
  });
}

/**
 * Which preset band edge is under this canvas-local point, or null.
 *
 * NEAREST WINS, and a tie goes to the LATER band — `guideAtCanvasY`'s rule, for
 * its reason: the later row is the one drawn on top, so it is the one the author
 * believes they are pointing at.
 */
export function presetEdgeAt(
  rows: RasterTimelinePresetBandRow[], x: number, y: number,
): { index: number; edge: 'top' | 'bot' } | null {
  if (x < RASTER_TIMELINE_PRESET_X - 2
    || x > RASTER_TIMELINE_PRESET_X + RASTER_TIMELINE_PRESET_W + 2) return null;
  let best: { index: number; edge: 'top' | 'bot' } | null = null;
  let bestD = BAND_EDGE_GRAB_PX + 1;
  for (const r of rows) {
    for (const edge of ['top', 'bot'] as const) {
      const d = Math.abs(y - (edge === 'top' ? r.y : r.y + r.h));
      if (d <= BAND_EDGE_GRAB_PX && d <= bestD) { bestD = d; best = { index: r.index, edge }; }
    }
  }
  return best;
}

/**
 * Which preset band's INTERIOR is under this point, or null.
 *
 * The split gesture's hit test, and it is deliberately NOT the edge test's
 * complement: a band tall enough to split is at least three lines, so its
 * interior always survives the two grab zones being taken out of it.
 */
export function presetBandAt(
  rows: RasterTimelinePresetBandRow[], x: number, y: number,
): number | null {
  if (x < RASTER_TIMELINE_PRESET_X
    || x > RASTER_TIMELINE_PRESET_X + RASTER_TIMELINE_PRESET_W) return null;
  for (let i = rows.length - 1; i >= 0; i--) {
    const r = rows[i];
    if (y >= r.y && y <= r.y + r.h) return r.index;
  }
  return null;
}

/**
 * What a pointer at `canvasY` is asking of this edge — the ONE place a gesture's
 * value is computed.
 *
 * ⚠ THE PREVIEW AND THE COMMIT MUST NOT BE TWO COPIES OF THIS. The strip draws
 * `drag.line` and the release WRITES `drag.line`; if the component recomputed
 * the value from the pointer at commit time, a rounding difference of half a
 * pixel would make the band jump on release, which is the defect every
 * two-copies preview eventually has.
 */
export function presetDragFor(
  preset: EffectsPreset | null, index: number, edge: 'top' | 'bot', canvasY: number,
): RasterTimelinePresetDrag | null {
  const band = preset?.bands?.[index];
  if (!band) return null;
  const requested = stripYToLine(canvasY);
  return { index, edge, line: clampBandEdge(band, edge, requested), requested };
}

export function rasterTimelineView(
  scene: EffectsScene, plan: CameraPreviewPlan,
  preset: EffectsPreset | null = null, drag: RasterTimelinePresetDrag | null = null,
): RasterTimelineView {
  const space = layerTopSpace(scene);
  const certain = space === 'screen';
  const bands: RasterTimelineBandRow[] = plan.bands.map((b: CameraPreviewBand) => {
    const h = Math.max(0, b.screenBottom - b.screenTop) * RASTER_TIMELINE_SCALE;
    return {
      layer: b.layer,
      screenTop: b.screenTop,
      screenBottom: b.screenBottom,
      y: lineToStripY(b.screenTop),
      h,
      enabled: scene.layers[b.layer]?.enabled !== false,
      locked: b.locked,
      inherited: b.inherited,
      label: `L${b.layer} ${factorLabel(b.factor)}`,
      spaceCertain: certain,
    };
  });

  const splits: RasterTimelineSplitRow[] = [];
  for (let i = 0; i < scene.layers.length; i++) {
    const layer = scene.layers[i];
    if (!layerEmitsFire(layer)) continue;
    const at = vsplitFieldValue(layer);
    if (at === null) continue;           // unreachable past layerEmitsFire; narrows the type
    const line = fireScreenLineOf(scene, layer.world_y);
    const refusal = splitRefusal(scene, layer);
    const onStrip = certain && line >= 0 && line < RASTER_TIMELINE_LINES;
    splits.push({ layer: i, line, at, y: onStrip ? lineToStripY(line) : null, refusal });
  }

  const presetBands = rasterTimelinePresetRows(preset, drag);

  const notices: string[] = [];
  const spaceNote = rasterTimelineSpaceNotice(scene);
  if (spaceNote !== null) notices.push(spaceNote);
  // ⚠ THE COLLISIONS SPEAK WITH NOBODY ASKING. They are a property of the
  // DOCUMENT, not of a gesture, and the route that creates one is usually not
  // the control that owns it — the `v_offset` hole's lesson, one surface over.
  // De-duplicated because a colliding PAIR would otherwise say the same fact
  // twice in two subjects.
  for (const sentence of new Set(presetBands.map((b) => b.collision).filter((s): s is string => s !== null))) {
    notices.push(sentence);
  }

  return {
    sceneId: scene.id, space, bands, splits,
    presetId: preset?.id ?? null, presetBands,
    notices, absent: rasterTimelineAbsences(preset !== null),
  };
}

// ---------------------------------------------------------------------------
// The draw
// ---------------------------------------------------------------------------

const STRIP_BG = 'rgba(10, 12, 18, 1)';
const PRIMING_FILL = 'rgba(255, 96, 96, 0.20)';
const RULER_TEXT = 'rgba(150, 165, 185, 0.9)';
const RULER_TICK = 'rgba(150, 165, 185, 0.35)';
/** The band column, cycled so adjacent bands are distinguishable without a legend. */
const BAND_FILLS = [
  'rgba(80, 220, 240, 0.38)',
  'rgba(80, 220, 240, 0.20)',
];
const SPLIT_LINE = 'rgba(255, 170, 60, 0.95)';
const SPLIT_TEXT = 'rgba(255, 220, 160, 0.98)';
/**
 * The PRESET column, in a hue no other mark on this strip uses.
 *
 * ⚠ NOT A SHADE OF THE LAYER COLUMN'S CYAN. The two columns are two DOCUMENTS,
 * and a palette band and a layer band are not two grades of one thing — an
 * author who reads them as one has the wrong model of which file they are
 * editing. It is also chosen clear of the split marker's own sampled window
 * (r>=200, 130<=g<=190, b<=90): composited over the strip's background the fill
 * is (82,53,108) and the edge is (210,153,243), so neither can answer for a
 * split rule in a pixel probe.
 */
const PRESET_FILLS = [
  'rgba(200, 120, 255, 0.38)',
  'rgba(200, 120, 255, 0.20)',
];
const PRESET_EDGE = 'rgba(220, 160, 255, 0.95)';
/** The edge under a live gesture. A different VALUE, not a different hue. */
const PRESET_EDGE_HOT = 'rgba(255, 255, 255, 0.98)';

/** Where every ruler tick goes. 32 is the shipped scenes' own spacing (0/32/80/112/160). */
const RULER_STEP = 32;

/** Below this height a band has no middle worth aiming at, and the label goes to its top. */
const LABEL_MID_MIN_H = 20;

/**
 * What one draw actually put down — counted while drawing, never re-derived.
 *
 * `fills` is band rectangles ACTUALLY issued and `markers` is split rules
 * ACTUALLY stroked, so a strip that planned everything and drew nothing reports
 * zeroes. See `RasterTimelineReport`.
 */
export interface RasterTimelineDrawCounts {
  fills: number;
  markers: number;
  /** Preset band rectangles actually filled, and edge handles actually stroked. */
  presetFills: number;
  presetHandles: number;
}

export function drawRasterTimeline(
  ctx: CanvasRenderingContext2D, view: RasterTimelineView,
): RasterTimelineDrawCounts {
  const counts: RasterTimelineDrawCounts = { fills: 0, markers: 0, presetFills: 0, presetHandles: 0 };
  const x = RASTER_TIMELINE_STRIP_X;
  const w = RASTER_TIMELINE_STRIP_W;
  const top = RASTER_TIMELINE_ORIGIN_Y;
  const bottom = lineToStripY(RASTER_TIMELINE_LINES);

  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = STRIP_BG;
  ctx.fillRect(0, 0, RASTER_TIMELINE_W, RASTER_TIMELINE_H);
  ctx.font = '9px system-ui, sans-serif';
  ctx.textBaseline = 'middle';

  // ── the ruler, and the two columns named ────────────────────────────────
  ctx.fillStyle = RULER_TEXT;
  ctx.fillText(`screen lines 0..${RASTER_TIMELINE_LINES - 1}`, 2, 7);
  ctx.fillStyle = view.presetId === null ? RULER_TICK : PRESET_EDGE;
  ctx.fillText(view.presetId === null ? 'no preset' : 'bands', RASTER_TIMELINE_PRESET_X, 18);
  ctx.fillStyle = RULER_TEXT;
  ctx.fillText('layers', x, 18);
  for (let line = 0; line <= RASTER_TIMELINE_LINES; line += RULER_STEP) {
    const y = Math.round(lineToStripY(Math.min(line, RASTER_TIMELINE_LINES - 1))) + 0.5;
    ctx.strokeStyle = RULER_TICK;
    ctx.lineWidth = 1;
    ctx.beginPath();
    // ⚠ AGAINST THE LEFTMOST COLUMN, which is now the PRESET one. A tick that
    // stopped short of the column an author drags would leave the editable
    // numbers the furthest thing on the strip from their own ruler.
    ctx.moveTo(RASTER_TIMELINE_PRESET_X - 3, y);
    ctx.lineTo(RASTER_TIMELINE_PRESET_X, y);
    ctx.stroke();
    ctx.fillStyle = RULER_TEXT;
    ctx.fillText(String(Math.min(line, RASTER_TIMELINE_LINES - 1)), 2, y);
  }

  // ── the bands ───────────────────────────────────────────────────────────
  //
  // A DISABLED BAND STILL DRAWS. It still owns its rows — the engine's
  // `.band_disabled` arm gives it the band above's scroll rather than skipping
  // it — so a strip that omitted it would disagree with the frame about which
  // rows exist. Dimmed and hatched, never absent.
  for (const b of view.bands) {
    if (b.h <= 0) continue;
    const y = Math.round(b.y);
    const h = Math.round(b.h);
    ctx.fillStyle = b.enabled ? BAND_FILLS[b.layer % BAND_FILLS.length] : EFFECTS_GUIDE_LINE_DISABLED;
    ctx.fillRect(x, y, w, h);
    counts.fills++;
    // ⚠ THE UNCERTAIN REGISTER. On an unlocked scene these rows are this
    // camera's, not the scene's, so they are hatched: a different KIND of mark,
    // not a paler version of the same one.
    if (!b.spaceCertain) {
      ctx.save();
      ctx.beginPath();
      ctx.rect(x, y, w, h);
      ctx.clip();
      ctx.strokeStyle = 'rgba(10, 12, 18, 0.85)';
      ctx.lineWidth = 2;
      for (let d = -h; d < w + h; d += 6) {
        ctx.beginPath();
        ctx.moveTo(x + d, y);
        ctx.lineTo(x + d + h, y + h);
        ctx.stroke();
      }
      ctx.restore();
    }
    ctx.strokeStyle = EFFECTS_GUIDE_LINE;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x, y + 0.5);
    ctx.lineTo(x + w, y + 0.5);
    ctx.stroke();

    const extra = (b.locked ? ' locked' : '') + (b.inherited ? ' inherit' : '')
      + (b.enabled ? '' : ' (off)');
    const text = `${b.label}${extra}`;
    ctx.fillStyle = EFFECTS_GUIDE_LABEL_BG;
    const tw = ctx.measureText(text).width;
    // ⚠ AT THE BAND'S MIDDLE, NOT ITS TOP. A split fires at its layer's own top,
    // so a label at the top sits exactly where that split's caption goes — and
    // the first build lost L1's and L2's labels underneath them entirely, which
    // left an author unable to tell which band was which. The middle is also the
    // truer place: the label names an INTERVAL, and the rules name EDGES.
    const ty = h >= LABEL_MID_MIN_H
      ? Math.round(y + h / 2)
      : Math.min(bottom - 6, y + 6);
    ctx.fillRect(x + w + 4, ty - 6, tw + 6, 12);
    ctx.fillStyle = b.locked ? CAMERA_PREVIEW_LABEL_WARN : EFFECTS_GUIDE_LABEL_TEXT;
    ctx.fillText(text, x + w + 7, ty);
  }

  // ── the PRESET palette bands: INTERVALS, with two grabbable edges ───────
  //
  // ⚠ DRAWN AS A RECTANGLE AND NEVER AS A RULE. That is the two-grammars block
  // at the top of this file, spent: a split is one edge and gets a rule with a
  // downward flag; a palette band is an interval and gets a body with a closing
  // edge, because it HAS one — the paired `pal_restore` this whole column is
  // about. The handles are drawn at both edges of every band, always, and not
  // only under the pointer: a handle that appears on hover is a handle nobody
  // discovers, which is this strip's own founding defect wearing a new hat.
  const px = RASTER_TIMELINE_PRESET_X;
  const pw = RASTER_TIMELINE_PRESET_W;
  for (const b of view.presetBands) {
    const by = Math.round(b.y);
    const bh = Math.round(b.h);
    if (bh > 0) {
      ctx.fillStyle = b.collision !== null
        ? EFFECTS_GUIDE_REFUSED_BG
        : PRESET_FILLS[b.index % PRESET_FILLS.length];
      ctx.fillRect(px, by, pw, bh);
      counts.presetFills++;
    }
    // The two edges. `bot` is the RESTORE's line — the band covers top..bot-1 —
    // so the closing handle is drawn ON that line rather than a pixel above it:
    // it is where the author's pointer must land to grab it, and where the
    // engine's second fire actually goes.
    for (const edge of ['top', 'bot'] as const) {
      const ey = Math.round(edge === 'top' ? b.y : b.y + b.h) + 0.5;
      ctx.strokeStyle = b.dragging ? PRESET_EDGE_HOT
        : (b.collision !== null ? EFFECTS_GUIDE_REFUSED : PRESET_EDGE);
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(px, ey);
      ctx.lineTo(px + pw, ey);
      ctx.stroke();
      counts.presetHandles++;
    }
    // The band's index, inside its own column, so the strip and the panel's
    // list below it are talking about the same band.
    if (bh >= 11) {
      ctx.fillStyle = EFFECTS_GUIDE_LABEL_TEXT;
      ctx.fillText(`${b.index}${b.sh ? ' sh' : ''}`, px + 3, Math.round(by + bh / 2));
    }
  }

  // ── the priming rows ────────────────────────────────────────────────────
  // Lines 0..2 are the raster program's priming records; no fire may land
  // there. Marked so a split near the top reads as near a WALL.
  //
  // ⚠ ACROSS BOTH COLUMNS. The bound is `fire()`'s and a preset band's two edges
  // are fires too — a wall drawn over only one of the two columns it applies to
  // reads as a property of that column.
  ctx.fillStyle = PRIMING_FILL;
  ctx.fillRect(px, top, pw, EFFECTS_FIRE_LINE_MIN * RASTER_TIMELINE_SCALE);
  ctx.fillRect(x, top, w, EFFECTS_FIRE_LINE_MIN * RASTER_TIMELINE_SCALE);

  // ── the splits: ONE EDGE EACH ───────────────────────────────────────────
  //
  // ⚠ THE GRAMMAR IS THE POINT. A rule with a downward flag and NO closing
  // edge, because the mechanism has none: the split writes VSRAM entry 1 once
  // and that value stands to the bottom of the frame unless a later split
  // supersedes it. Anything that looked like a bracket would be a lie about a
  // paired restore this mechanism does not have.
  for (const s of view.splits) {
    if (s.y === null) continue;
    const y = Math.round(s.y) + 0.5;
    const refused = s.refusal !== null;
    ctx.strokeStyle = refused ? EFFECTS_GUIDE_REFUSED : SPLIT_LINE;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(RASTER_TIMELINE_RULE_X, y);
    ctx.lineTo(RASTER_TIMELINE_W - 4, y);
    ctx.stroke();
    counts.markers++;
    // The downward flag — "from here DOWN", the sentence the row's title uses.
    ctx.fillStyle = refused ? EFFECTS_GUIDE_REFUSED : SPLIT_LINE;
    ctx.beginPath();
    ctx.moveTo(RASTER_TIMELINE_RULE_X, y);
    ctx.lineTo(RASTER_TIMELINE_RULE_X + 7, y);
    ctx.lineTo(RASTER_TIMELINE_RULE_X + 3.5, y + 6);
    ctx.closePath();
    ctx.fill();

    const text = `L${s.layer} split -> B row ${s.at}  (line ${s.line})`;
    const tw = ctx.measureText(text).width;
    const ty = y < bottom - 14 ? y + 8 : y - 8;
    ctx.fillStyle = refused ? EFFECTS_GUIDE_REFUSED_BG : CAMERA_PREVIEW_LABEL_BG;
    ctx.fillRect(RASTER_TIMELINE_RULE_X, ty - 6, tw + 6, 12);
    ctx.fillStyle = refused ? EFFECTS_GUIDE_REFUSED_TEXT : SPLIT_TEXT;
    ctx.fillText(text, RASTER_TIMELINE_RULE_X + 3, ty);
  }

  // ── the strip's own honesty line ────────────────────────────────────────
  //
  // ⚠ NOT OPTIONAL CHROME, for `camera-preview.ts`'s reason: inside this
  // rectangle the app is making a claim about what the ROM would do, and this
  // line is the boundary of the claim, said to the person the claim is made to.
  ctx.fillStyle = CAMERA_PREVIEW_LABEL_WARN;
  // ⚠ NOT TRUNCATED. The phrases are short (see `rasterTimelineAbsences`)
  // precisely so this fits; if a future absence makes it overflow, the fix is a
  // shorter phrase, never an ellipsis — half an honesty line reads as chrome.
  ctx.fillText(`not drawn: ${view.absent.join('; ')}`, 2, bottom + 8);
  if (view.splits.length === 0) {
    ctx.fillStyle = CAMERA_PREVIEW_LABEL_TEXT;
    ctx.fillText('no Plane B splits in this scene', 2, bottom + 20);
  }
  ctx.restore();
  return counts;
}

// ---------------------------------------------------------------------------
// What the last repaint actually drew — a PUBLISH, not a re-derivation, for the
// reason `effects-guides.ts`'s report block states at length: a probe that
// recomputed this from the stores would prove two copies of one arithmetic
// agree, which stays true when nothing is drawn.
// ---------------------------------------------------------------------------

export interface RasterTimelineReport {
  active: boolean;
  sceneId: string | null;
  space: LayerTopSpace | null;
  /** The strip's own constants, published so a harness never types them. */
  lines: number;
  scale: number;
  originY: number;
  stripX: number;
  stripW: number;
  /** The EDITABLE column's geometry and its grab tolerance, published too. */
  presetX: number;
  presetW: number;
  grabPx: number;
  bands: RasterTimelineBandRow[];
  splits: RasterTimelineSplitRow[];
  presetId: string | null;
  presetBands: RasterTimelinePresetBandRow[];
  notices: string[];
  absent: string[];
  /** Band rectangles actually filled, and split rules actually stroked. */
  fills: number;
  markers: number;
  presetFills: number;
  presetHandles: number;
  /**
   * The canvas's LAST MEASURED client rect, and the strip-px-per-client-px scale
   * that follows from it.
   *
   * ⚠ THIS IS WHAT LETS A HARNESS AIM AT AN INTEGER CLIENT PIXEL AND DERIVE THE
   * LINE THE APP WILL COMPUTE, through the app's own contract rather than
   * through a number read off a screenshot. The backing store is fixed, so
   * `scaleX/scaleY` are 1 whenever the column is wide enough — and when they are
   * not, they are the factor a harness must apply, published rather than
   * guessed. `null` before the first paint.
   */
  client: { x: number; y: number; w: number; h: number; scaleX: number; scaleY: number } | null;
  /**
   * What the last pointer event resolved to IN STRIP SPACE, and what it hit.
   *
   * A pure measurement of the app's own client -> strip conversion: a harness
   * that aims at a client pixel can read back the line the app decided that
   * pixel was, which is the difference between proving the FEATURE wrong and
   * proving the AIM wrong.
   */
  pointer: { clientX: number; clientY: number; x: number; y: number; line: number;
             hit: string } | null;
  /** The gesture in flight, or null. */
  drag: RasterTimelinePresetDrag | null;
  /** Why the edge being dragged has stopped, or null. */
  heldText: string | null;
  /** Advanced on every publish, so a harness can prove a repaint HAPPENED. */
  paints: number;
}

/**
 * What a publish must carry.
 *
 * ⚠ `pointer` IS NOT IN IT, and that is load-bearing rather than tidy. A pointer
 * event is followed by a re-render and therefore by a repaint, so a publish that
 * carried `pointer` would erase the reading the event just took — the instrument
 * would report `null` for every gesture it was built to measure. It is carried
 * FORWARD instead, and only `publishRasterTimelinePointer` writes it.
 */
export type RasterTimelinePublish = Omit<RasterTimelineReport, 'paints' | 'pointer'>;

const INACTIVE: RasterTimelinePublish = {
  active: false, sceneId: null, space: null,
  lines: RASTER_TIMELINE_LINES, scale: RASTER_TIMELINE_SCALE,
  originY: RASTER_TIMELINE_ORIGIN_Y, stripX: RASTER_TIMELINE_STRIP_X, stripW: RASTER_TIMELINE_STRIP_W,
  presetX: RASTER_TIMELINE_PRESET_X, presetW: RASTER_TIMELINE_PRESET_W, grabPx: BAND_EDGE_GRAB_PX,
  bands: [], splits: [], presetId: null, presetBands: [], notices: [], absent: [],
  fills: 0, markers: 0, presetFills: 0, presetHandles: 0,
  client: null, drag: null, heldText: null,
};

let lastReport: RasterTimelineReport = { ...INACTIVE, pointer: null, paints: 0 };

export function publishRasterTimelineReport(r: RasterTimelinePublish): void {
  lastReport = { ...r, pointer: lastReport.pointer, paints: lastReport.paints + 1 };
}

/**
 * Record where the last pointer event landed, WITHOUT advancing `paints`.
 *
 * ⚠ THE SEPARATION IS THE POINT. `paints` is the witness that the strip
 * REPAINTED, and a pointer that moved over a canvas is not a repaint. Folding
 * this into `publishRasterTimelineReport` would make every mouse move look like
 * a draw, and would retire the one counter that can tell a live strip from a
 * stale one.
 */
export function publishRasterTimelinePointer(p: RasterTimelineReport['pointer']): void {
  lastReport = { ...lastReport, pointer: p };
}

/** The inactive publish — what a facet with no scene selected reports. */
export function inactiveRasterTimelineReport(): RasterTimelinePublish {
  return { ...INACTIVE };
}

export function lastRasterTimelineReport(): RasterTimelineReport {
  return lastReport;
}
