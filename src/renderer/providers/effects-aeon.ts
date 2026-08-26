// Aeon port for the effects (parallax) facet: every decision the scene editor
// makes, as pure functions over plain values.
//
// WHY A PROVIDER AND NOT LOGIC IN THE COMPONENT. The node-only suite cannot see
// React — ~3,900 tests pass here while a rendered surface is visibly broken — so
// anything decided inside a component is a decision nothing in `vitest run` can
// check. The interesting decisions on this surface are all of that kind: what a
// factor dropdown may offer, when a change is a no-op that must NOT consume an
// undo slot, which ids a new scene may not take, and what an edit's undo command
// carries. They live here; the component wires events to them and renders.
//
// EVERY MUTATION RETURNS A COMMAND, it does not execute one. Same rule (and same
// reason) as `aeonBackgroundCommand` in properties-aeon: `executeCommand` throws
// for a non-aeon focused document, so a function that dispatched could only be
// tested with a whole focused aeon session standing up.
//
// THE NO-OP GUARD IS LOAD-BEARING, not tidiness. A `<select>` fires onChange for
// the option already selected, and a number field fires on every keystroke that
// re-types the same value. A command either way pushes an undo entry that
// visibly does nothing, which is the §6 "one undo step per mutation" bar failing
// from the other direction.

import type {
  SetEffectsSceneCommand, SetSectionSceneCommand,
} from '../../core/editing/commands';
import type {
  EffectsScene, EffectsSceneLibrary, EffectsFactor, EffectsLayer,
} from '../../core/formats/effects/scene';
import {
  EFFECTS_FACTOR_NAMES, EFFECTS_PACKED_FACTOR_BOUNDS, EFFECTS_LAYER_COUNT,
  EFFECTS_WORLD_Y_BOUNDS, EFFECTS_V_FACTOR_BOUNDS, EFFECTS_V_CENTER_BOUNDS,
  EFFECTS_V_OFFSET_BOUNDS, EFFECTS_V_CENTER_DEFAULT, EFFECTS_V_OFFSET_DEFAULT,
  EFFECTS_V_FACTOR_LOCK,
  WAVE1_PRECISION_VALUES,
  EFFECTS_TRANSITION_VALUES,
  cloneEffectsScene, factorLabel, isNamedFactor, newEffectsLayer, newEffectsScene,
  sceneIdRefusal,
} from '../../core/formats/effects/scene-ui';
import { BG_LAYOUT_WORDS, TILE_WIDTH_PX } from '../../core/formats/bg-override/bg-override';
import { BG_WIDTH } from '../../core/formats/bg-tiles';

// ---------------------------------------------------------------------------
// Factor picker
// ---------------------------------------------------------------------------

/**
 * The sentinel a factor `<select>` uses for "custom packed value".
 *
 * Not a legal FACTOR_* name by the schema's own enum (every published name
 * starts `FACTOR_`), so it can never collide with one. Asserted in the tests
 * rather than merely asserted here.
 */
export const CUSTOM_FACTOR_VALUE = '__packed__';

export interface FactorOption { value: string; label: string }

/**
 * What a factor dropdown offers: the published names, then the custom packed
 * escape hatch. Derived from the schema (EFFECTS_FACTOR_NAMES), so §2.3's
 * "constrained to representable shift-add fractions" cannot drift into a
 * hand-typed list.
 */
export function factorOptions(): FactorOption[] {
  return [
    ...EFFECTS_FACTOR_NAMES.map((n) => ({ value: n, label: n })),
    { value: CUSTOM_FACTOR_VALUE, label: 'Custom packed…' },
  ];
}

/** Which option is selected for a factor that may be either form. */
export function factorSelectValue(f: EffectsFactor): string {
  return isNamedFactor(f) ? f : CUSTOM_FACTOR_VALUE;
}

/**
 * The factor a dropdown choice means.
 *
 * Picking "Custom packed…" keeps the packed triple already on the field when
 * there is one, and otherwise seeds the identity-ish `{s1: 0, s2: max, op: 0}` —
 * `s2 = 15` is the schema's own "single-term" encoding (§2.3), i.e. the packed
 * spelling closest to "one shift, nothing added", which is what an author
 * switching to custom is almost always about to tune.
 */
export function factorFromSelect(value: string, current: EffectsFactor): EffectsFactor {
  if (value !== CUSTOM_FACTOR_VALUE) return value as EffectsFactor;
  if (!isNamedFactor(current)) return current;
  return { s1: EFFECTS_PACKED_FACTOR_BOUNDS.s1.min, s2: EFFECTS_PACKED_FACTOR_BOUNDS.s2.max, op: 0 };
}

/** Clamp a packed-factor field to the schema's range for it. */
export function clampPackedField(field: 's1' | 's2', value: number): number {
  const { min, max } = EFFECTS_PACKED_FACTOR_BOUNDS[field];
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, Math.round(value)));
}

/** Clamp a layer's `world_y` to the schema's range (§2.2). */
export function clampWorldY(value: number): number {
  const { min, max } = EFFECTS_WORLD_Y_BOUNDS;
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, Math.round(value)));
}

// ---------------------------------------------------------------------------
// Which space a layer top is authored in
// ---------------------------------------------------------------------------
//
// Owner feedback 2026-08-26, point 4 ("why max 8 layers if they go well beyond
// the screen?"). Schema §2.2 calls a layer's `world_y` an act-axis coordinate,
// and for an UNLOCKED plane it is: aeon `scene_dsl.emp` `scene_plane_line`
// lowers it to a Plane-B line as `((world_y - v_center) >> v_factor) + v_offset`
// — the same mapping Parallax_Step5_Vscroll applies to the camera. But when
// `v_factor` is the lock sentinel the plane ignores the camera entirely, that
// expression collapses every top onto one line, and the engine's ruling is:
//
//   "For a locked plane the authoring space IS the plane, so the mapping is
//    the identity. EIGHTEEN OF THE TWENTY shipped scenes are that case (tops
//    0/32/80/112/160, which read as screen lines because v_offset is 0)."
//
// Both Aurora scene files are locked. So for every scene that exists a layer
// top is a screen/plane line, and the eight layers divide the visible screen,
// not the act — which is what the owner was asking for. The provider decides
// the space per scene; the panel's label and bound, the drag clamp, the guide
// origin and the guide caption all read it here rather than each re-deriving
// "locked" from `v_factor`.

/** `'screen'`: the top is a plane/screen line. `'act'`: it is a world Y the scene maps. */
export type LayerTopSpace = 'screen' | 'act';

/**
 * The Plane-B vertical span in pixels — the modulus aeon's Step 4a rotates
 * tops in, and the ceiling `scene_plane_line` refuses beyond (`pl < 512`).
 *
 * DERIVED THE WAY AEON DERIVES IT (`parallax.emp`: `PLANE_B_SPAN =
 * PLANE_B_CELL_ROWS * 8`), not typed. Aurora carries no plane-rows constant;
 * the plane is `BG_LAYOUT_WORDS / BG_WIDTH` rows (64x64 nametable words, from
 * the vendored consumer contract) of `TILE_WIDTH_PX` each.
 */
export const PLANE_LINE_SPAN: number = (BG_LAYOUT_WORDS / BG_WIDTH) * TILE_WIDTH_PX;

export function layerTopSpace(scene: Pick<EffectsScene, 'v_factor'>): LayerTopSpace {
  return scene.v_factor === EFFECTS_V_FACTOR_LOCK ? 'screen' : 'act';
}

export interface LayerTopBounds {
  space: LayerTopSpace;
  /** The row label the panel shows for the field. */
  label: 'Screen line' | 'world_y';
  min: number;
  max: number;
}

/**
 * The label and bound for a layer's top in this scene's space.
 *
 * Locked: `0..PLANE_LINE_SPAN-1`, the engine's own ensure. The visible screen
 * is the top 224 of those lines, but the plane is the authoring space (a top
 * below the visible strip is legal and the plane wraps), so the bound is the
 * plane's. Unlocked: the schema's `world_y` range, as before; `planeLineOf`
 * carries the mapped-line advisory for that arm.
 */
export function layerTopBounds(scene: Pick<EffectsScene, 'v_factor'>): LayerTopBounds {
  if (layerTopSpace(scene) === 'screen') {
    return { space: 'screen', label: 'Screen line', min: 0, max: PLANE_LINE_SPAN - 1 };
  }
  return {
    space: 'act', label: 'world_y',
    min: EFFECTS_WORLD_Y_BOUNDS.min, max: EFFECTS_WORLD_Y_BOUNDS.max,
  };
}

/**
 * Clamp a layer top to the scene's space. THE CLAMP IS THE BOUND (ROADMAP
 * item 37): the spinner's min/max only style it, and the guide drag routes
 * through this too, so a locked layer cannot be dragged to a line the bake
 * would refuse.
 */
export function clampLayerTop(scene: Pick<EffectsScene, 'v_factor'>, value: number): number {
  const { min, max } = layerTopBounds(scene);
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, Math.round(value)));
}

/**
 * The Plane-B line a layer top lands on — aeon `scene_plane_line`, transcribed:
 *
 *     locked:   line = world_y
 *     unlocked: line = ((world_y - v_center) >> v_factor) + v_offset
 *
 * with the engine's two `ensure`s returned as ADVISORY HINTS rather than
 * thrown: the panel shows them beside the field so the author learns the bake
 * would refuse before it does. `>>` is deliberate — the runtime is `asr.w`.
 */
export function planeLineOf(
  scene: Pick<EffectsScene, 'v_factor' | 'v_center' | 'v_offset'>, worldY: number,
): { line: number; hint: string | null } {
  const vf = scene.v_factor;
  const vc = scene.v_center ?? EFFECTS_V_CENTER_DEFAULT;
  const vo = scene.v_offset ?? EFFECTS_V_OFFSET_DEFAULT;
  const locked = layerTopSpace(scene) === 'screen';
  if (!locked && worldY < vc) {
    return {
      line: ((worldY - vc) >> vf) + vo,
      hint: `world_y ${worldY} is above this scene's v_center ${vc}: the plane never reaches it. `
        + 'Move the top down, or v_center up.',
    };
  }
  const line = locked ? worldY : ((worldY - vc) >> vf) + vo;
  if (line < 0 || line >= PLANE_LINE_SPAN) {
    return {
      line,
      hint: `${locked ? 'line' : `maps to plane line ${line},`} outside the ${PLANE_LINE_SPAN}-px `
        + 'Plane-B span: the engine would wrap it onto another band\'s rows.',
    };
  }
  return { line, hint: null };
}

/**
 * "N of 8 layers (per scene; scenes are assigned per section)" — the cap and
 * its scope, stated where the owner reads the count. 8 is `MAX_PARALLAX_BANDS`
 * per SCENE (schema §2.1); a section binds its own scene (§3), so "per what's
 * drawn" is the section, and on a locked scene the eight divide one screen.
 */
export function layerCountLine(scene: Pick<EffectsScene, 'layers'>): string {
  return `${scene.layers.length} of ${EFFECTS_LAYER_COUNT.max} layers `
    + '(per scene; scenes are assigned per section)';
}

/** The V-factor row's label, with the sentinel's meaning inline rather than in a tooltip. */
export function vFactorLabel(): string {
  return `V factor (${EFFECTS_V_FACTOR_LOCK} = locked, no vertical scroll)`;
}

/**
 * Clamp a scene's `v_factor` to the schema's range.
 *
 * DELIBERATELY NOT A FACTOR PICKER. `v_factor` is a right-shift amount 0..15,
 * not a `$defs/factor` — see EFFECTS_V_FACTOR_BOUNDS. The form offers a spinner
 * over this range and nothing else, because the FACTOR_* names that used to be
 * on offer here are values no engine can consume (ROADMAP item 35).
 */
export function clampVFactor(value: number): number {
  const { min, max } = EFFECTS_V_FACTOR_BOUNDS;
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, Math.round(value)));
}

/**
 * Clamp a scene's `v_center` (0..32767) / `v_offset` (-32768..32767, signed) to
 * the schema's range. THE CLAMP IS THE BOUND — `NumberField`'s `min`/`max`
 * only style the spinner and never stop a typed value (ROADMAP item 37), so
 * these are what keep the document inside what aeon's emit accepts.
 *
 * A non-finite value (a half-typed '-' in the input) falls to the schema's
 * `default`, not to `min`: for the signed `v_offset`, `min` would be -32768,
 * which is not a sane thing to write into a document mid-keystroke.
 */
function clampSceneField(bounds: { min: number; max: number }, fallback: number, value: number): number {
  if (!Number.isFinite(value)) return fallback;
  return Math.min(bounds.max, Math.max(bounds.min, Math.round(value)));
}
export function clampVCenter(value: number): number {
  return clampSceneField(EFFECTS_V_CENTER_BOUNDS, EFFECTS_V_CENTER_DEFAULT, value);
}
export function clampVOffset(value: number): number {
  return clampSceneField(EFFECTS_V_OFFSET_BOUNDS, EFFECTS_V_OFFSET_DEFAULT, value);
}

// ---------------------------------------------------------------------------
// Scene list
// ---------------------------------------------------------------------------

export interface SceneListEntry {
  id: string;
  /** `name` when the document has one, else the id — never an empty row. */
  label: string;
  layers: number;
}

export function sceneListEntries(library: EffectsSceneLibrary): SceneListEntry[] {
  return library.scenes.map((s) => ({
    id: s.id,
    label: (typeof s.name === 'string' && s.name !== '') ? s.name : s.id,
    layers: s.layers.length,
  }));
}

/**
 * The scene a selected id resolves to — id if it still exists, else the first
 * scene, else nothing.
 *
 * LIFTED OUT OF THE PANEL VERBATIM (ROADMAP item 43). This was one expression
 * inside EffectsScenePanel and its fallback is load-bearing: undoing a create,
 * or opening a different project, leaves a stale id in the selection, and
 * without the fallback the whole editor below it would vanish rather than land
 * on the scene that IS there.
 *
 * It is a function now because there are two readers. The panel draws the form;
 * MapViewport draws that scene's layers as world-Y guides. If they resolved a
 * stale id differently — one falling back, one showing nothing — the canvas
 * would be editing a scene the panel is not, which is worse than either
 * behaviour alone.
 */
export function resolveSelectedScene(
  library: EffectsSceneLibrary, selectedId: string | null,
): EffectsScene | null {
  return library.scenes.find((s) => s.id === selectedId) ?? library.scenes[0] ?? null;
}

/**
 * The `sceneRef` dropdown for one section: the act default plus every LOADED
 * scene.
 *
 * Unreadable scenes are deliberately absent — assigning a section to a file
 * Aurora could not read would write a ref the build then cannot resolve. They are
 * not silent, though: the load already raised a notice per file, and
 * `unassignableSceneRef` below reports a section already pointing at one.
 */
export function sceneRefOptions(library: EffectsSceneLibrary): FactorOption[] {
  return [
    { value: '', label: 'Act default' },
    ...sceneListEntries(library).map((e) => ({ value: e.id, label: e.label })),
  ];
}

/**
 * A warning for a section whose `sceneRef` names nothing this project can offer,
 * or null.
 *
 * REACHABLE WITHOUT ANY BUG: the sidecar is hand-editable and aeon's generator
 * writes it too, so a ref can name a scene that was deleted, renamed, or is
 * sitting in `unreadable`. Showing the ref as "Act default" (what a plain
 * `<select>` does with an unknown value) would be a quiet lie about what the
 * build will use.
 */
export function unassignableSceneRef(
  library: EffectsSceneLibrary, sceneRef: string | null,
): string | null {
  if (sceneRef === null) return null;
  if (library.scenes.some((s) => s.id === sceneRef)) return null;
  if (library.unreadable.some((u) => u.path.endsWith(`/${sceneRef}.json`))) {
    return `Assigned to "${sceneRef}", whose file exists but could not be read.`;
  }
  return `Assigned to "${sceneRef}", which is not a scene in this project.`;
}

// ---------------------------------------------------------------------------
// Commands
// ---------------------------------------------------------------------------

/** Assign (or clear) one section's `sceneRef`. `''` from a select = act default. */
export function sectionSceneCommand(
  sectionIndex: number, currentRef: string | null, value: string,
): SetSectionSceneCommand | null {
  const newRef = value === '' ? null : value;
  if (newRef === currentRef) return null;
  return {
    type: 'set-section-scene',
    description: `Section ${sectionIndex} scene`,
    sectionIndex,
    oldRef: currentRef,
    newRef,
  };
}

function sceneCommand(
  sceneId: string, description: string,
  oldScene: EffectsScene | null, newScene: EffectsScene | null,
): SetEffectsSceneCommand {
  return {
    type: 'set-effects-scene',
    description,
    // -1: act-ambient. See the command's docblock.
    sectionIndex: -1,
    sceneId,
    oldScene: oldScene && cloneEffectsScene(oldScene),
    newScene: newScene && cloneEffectsScene(newScene),
  };
}

/**
 * Create a new scene, or explain why not.
 *
 * A DISCRIMINATED RESULT rather than `null`-for-both: the two failures need
 * different things from the author (fix the id / pick another) and a bare null
 * would make the button do nothing with no reason on screen. `sceneIdRefusal`
 * owns the wording so the UI and the agent tool cannot describe the rule
 * differently.
 */
export type CreateSceneResult =
  | { ok: true; command: SetEffectsSceneCommand }
  | { ok: false; reason: string };

export function createSceneCommand(
  library: EffectsSceneLibrary, id: string, name?: string,
): CreateSceneResult {
  const refusal = sceneIdRefusal(id, library);
  if (refusal) return { ok: false, reason: refusal };
  return {
    ok: true,
    command: sceneCommand(id, `New scene ${id}`, null, newEffectsScene(id, name)),
  };
}

/** Delete a scene. Null when there is no such scene to delete. */
export function deleteSceneCommand(
  library: EffectsSceneLibrary, id: string,
): SetEffectsSceneCommand | null {
  const existing = library.scenes.find((s) => s.id === id);
  if (!existing) return null;
  return sceneCommand(id, `Delete scene ${id}`, existing, null);
}

/**
 * Put a WHOLE scene document at `id`, creating or replacing.
 *
 * The agent surface's shape rather than the form's: a caller that already has a
 * complete document (`set_effects_scene` takes one, because a field-patch API
 * would need the field enumeration this format is handled without). Null when the
 * document is byte-identical to what is already there, so a re-send is not an
 * undo step.
 *
 * It does NOT check the id rules — a REPLACE of an existing scene must not be
 * refused for an id that is obviously already in use, and a CREATE's extra
 * question (is this id taken by an unreadable file?) belongs to the caller, which
 * is the only party that knows which of the two it is doing.
 */
export function replaceSceneCommand(
  library: EffectsSceneLibrary, id: string, scene: EffectsScene,
): SetEffectsSceneCommand | null {
  const existing = library.scenes.find((s) => s.id === id) ?? null;
  if (existing && JSON.stringify(existing) === JSON.stringify(scene)) return null;
  return sceneCommand(id, existing ? `Replace scene ${id}` : `New scene ${id}`, existing, scene);
}

/**
 * THE ONE EDIT PATH. Every form control on this surface goes through it: clone
 * the scene, let `mutate` change whatever it likes, and emit a whole-document
 * swap — or null when nothing actually moved.
 *
 * A mutator over a clone rather than a `{ field, value }` delta, for the reason
 * the codec states about itself: a delta API would need a field enumeration, and
 * the whole point of this format's handling is that no such list exists. It also
 * means a single gesture that changes three things is naturally one command.
 *
 * The no-op check is a JSON comparison of the whole document. That is honest
 * about what "changed" means here (any key, at any depth, including ones no form
 * shows) and is cheap: a scene is at most 8 layers of scalars.
 */
export function editSceneCommand(
  library: EffectsSceneLibrary, id: string, description: string,
  mutate: (scene: EffectsScene) => void,
): SetEffectsSceneCommand | null {
  const existing = library.scenes.find((s) => s.id === id);
  if (!existing) return null;
  const next = cloneEffectsScene(existing);
  mutate(next);
  if (JSON.stringify(next) === JSON.stringify(existing)) return null;
  return sceneCommand(id, description, existing, next);
}

/** Add a layer below the last one. Null at the schema's ceiling. */
export function addLayerCommand(
  library: EffectsSceneLibrary, id: string,
): SetEffectsSceneCommand | null {
  const existing = library.scenes.find((s) => s.id === id);
  if (!existing || existing.layers.length >= EFFECTS_LAYER_COUNT.max) return null;
  return editSceneCommand(library, id, `Add layer to ${id}`, (scene) => {
    const last = scene.layers[scene.layers.length - 1];
    // A band below the last one, at a `world_y` that is still in range even when
    // the last layer already sits at the ceiling.
    scene.layers.push(newEffectsLayer(clampWorldY(last.world_y + 32), last));
  });
}

/** Remove one layer. Null at the schema's floor (a scene needs >= 1 layer). */
export function removeLayerCommand(
  library: EffectsSceneLibrary, id: string, index: number,
): SetEffectsSceneCommand | null {
  const existing = library.scenes.find((s) => s.id === id);
  if (!existing) return null;
  if (existing.layers.length <= EFFECTS_LAYER_COUNT.min) return null;
  if (index < 0 || index >= existing.layers.length) return null;
  return editSceneCommand(library, id, `Remove layer ${index} from ${id}`, (scene) => {
    scene.layers.splice(index, 1);
  });
}

/** Set one field of one layer. */
export function setLayerFieldCommand<K extends 'world_y' | 'fa' | 'fb'>(
  library: EffectsSceneLibrary, id: string, index: number, field: K, value: EffectsLayer[K],
): SetEffectsSceneCommand | null {
  return editSceneCommand(library, id, `Layer ${index} ${field}`, (scene) => {
    const layer = scene.layers[index];
    if (layer) layer[field] = value;
  });
}

/**
 * Set a scene-level scalar the wave-1 form owns.
 *
 * `undefined` DELETES the key rather than writing a default. That is the model
 * rule scene.ts states — "parse never fills a default in and serialize never
 * writes one out that was not on disk" — expressed as an editing affordance:
 * clearing `v_center` must return the document to not-having-it, not to having
 * it set to the current default.
 */
export function setSceneFieldCommand<K extends 'name' | 'v_factor' | 'v_center' | 'v_offset'
| 'precision' | 'transition'>(
  library: EffectsSceneLibrary, id: string, field: K, value: EffectsScene[K] | undefined,
): SetEffectsSceneCommand | null {
  return editSceneCommand(library, id, `Scene ${id} ${field}`, (scene) => {
    if (value === undefined) delete scene[field];
    else scene[field] = value;
  });
}

/** Everything the scene-level form may offer, in one place for the component. */
export const SCENE_FORM_CHOICES = {
  precision: WAVE1_PRECISION_VALUES,
  transition: EFFECTS_TRANSITION_VALUES,
} as const;

export {
  factorLabel, EFFECTS_LAYER_COUNT, EFFECTS_PACKED_FACTOR_BOUNDS, EFFECTS_WORLD_Y_BOUNDS,
  EFFECTS_V_FACTOR_BOUNDS, EFFECTS_V_CENTER_BOUNDS, EFFECTS_V_OFFSET_BOUNDS,
};
