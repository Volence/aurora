// Every decision the effects facet makes, checked without React.
//
// The component is a renderer of these answers; the answers are here. What this
// file is really guarding is the class of defect the node suite normally cannot
// see at all — a dropdown offering a value the codec refuses, a `<select>`
// onChange pushing an empty undo step, a delete button that fires on a scene
// that is not there.

import { describe, it, expect } from 'vitest';
import {
  CUSTOM_FACTOR_VALUE, factorOptions, factorSelectValue, factorFromSelect,
  clampPackedField, clampWorldY, clampVCenter, clampVOffset,
  sceneListEntries, resolveSelectedScene, sceneRefOptions, unassignableSceneRef,
  sectionSceneCommand, createSceneCommand, deleteSceneCommand,
  addLayerCommand, removeLayerCommand, setLayerFieldCommand, setSceneFieldCommand,
  SCENE_FORM_CHOICES,
  layerTopSpace, layerTopBounds, clampLayerTop, planeLineOf, PLANE_LINE_SPAN,
  layerCountLine, vFactorHint,
} from '../effects-aeon';
import {
  EFFECTS_FACTOR_NAMES, EFFECTS_LAYER_COUNT, EFFECTS_PACKED_FACTOR_BOUNDS,
  EFFECTS_WORLD_Y_BOUNDS, EFFECTS_V_FACTOR_LOCK, newEffectsScene,
} from '../../../core/formats/effects/scene-ui';
import { BG_LAYOUT_WORDS, TILE_WIDTH_PX } from '../../../core/formats/bg-override/bg-override';
import { BG_WIDTH } from '../../../core/formats/bg-tiles';
import { serializeEffectsScene, type EffectsScene, type EffectsSceneLibrary } from '../../../core/formats/effects/scene';
import { EditHistory } from '../../../core/editing/history';
import type { S4Level } from '../../../core/editing/commands';
import rawSchema from '../../../core/formats/effects/aurora-effects-scene.schema.json';

// The schema walked by hand, so an expectation here is not the module's own
// constant read back to it.
const S = rawSchema as unknown as Record<string, any>;

function library(scenes: EffectsScene[] = [], unreadable: EffectsSceneLibrary['unreadable'] = []): EffectsSceneLibrary {
  return { scenes, unreadable, notices: [] };
}

const canopy = () => {
  const s = newEffectsScene('canopy', 'Canopy');
  s.layers.push({ world_y: 96, fa: 'FACTOR_1_2', fb: { s1: 2, s2: 4, op: 1 } });
  return s;
};

describe('factor picker', () => {
  it('offers every schema factor plus one custom escape hatch, and nothing else', () => {
    const options = factorOptions();
    expect(options.map((o) => o.value))
      .toEqual([...EFFECTS_FACTOR_NAMES, CUSTOM_FACTOR_VALUE]);
  });

  it("uses a sentinel that cannot collide with a real factor name", () => {
    // The whole risk of a sentinel: a schema amendment adding a factor spelled
    // like it would make the picker silently un-selectable.
    expect(EFFECTS_FACTOR_NAMES as readonly string[]).not.toContain(CUSTOM_FACTOR_VALUE);
    for (const n of EFFECTS_FACTOR_NAMES) expect(n.startsWith('FACTOR_')).toBe(true);
  });

  it('selects the right option for each factor form', () => {
    expect(factorSelectValue('FACTOR_1_4')).toBe('FACTOR_1_4');
    expect(factorSelectValue({ s1: 1, s2: 2, op: 0 })).toBe(CUSTOM_FACTOR_VALUE);
  });

  it('KEEPS an existing packed triple when the picker re-selects custom', () => {
    // Re-picking "Custom packed…" on a factor that already IS packed must not
    // reset the author's tuned s1/s2/op back to a seed.
    const packed = { s1: 3, s2: 9, op: 1 as const };
    expect(factorFromSelect(CUSTOM_FACTOR_VALUE, packed)).toEqual(packed);
  });

  it('seeds a schema-legal packed triple when switching from a named factor', () => {
    const seeded = factorFromSelect(CUSTOM_FACTOR_VALUE, 'FACTOR_1');
    expect(seeded).toEqual({
      s1: EFFECTS_PACKED_FACTOR_BOUNDS.s1.min,
      s2: EFFECTS_PACKED_FACTOR_BOUNDS.s2.max,
      op: 0,
    });
    // ANTI-VACUOUS: the seed is only useful if the codec accepts it.
    const scene = newEffectsScene('probe');
    scene.layers[0].fa = seeded;
    expect(() => serializeEffectsScene(scene)).not.toThrow();
  });

  it('clamps packed fields and world_y to the schema, including NaN from an empty input', () => {
    expect(clampPackedField('s1', -4)).toBe(EFFECTS_PACKED_FACTOR_BOUNDS.s1.min);
    expect(clampPackedField('s2', 99)).toBe(EFFECTS_PACKED_FACTOR_BOUNDS.s2.max);
    // `<input type=number>` yields '' -> Number('') is 0, but a partially typed
    // '-' yields NaN, which would otherwise be written into the document.
    expect(clampPackedField('s1', NaN)).toBe(EFFECTS_PACKED_FACTOR_BOUNDS.s1.min);
    expect(clampWorldY(NaN)).toBe(EFFECTS_WORLD_Y_BOUNDS.min);
    expect(clampWorldY(-1)).toBe(EFFECTS_WORLD_Y_BOUNDS.min);
    expect(clampWorldY(999999)).toBe(EFFECTS_WORLD_Y_BOUNDS.max);
    expect(clampWorldY(96.7)).toBe(97);
  });

  /**
   * ROADMAP item 37. `NumberField`'s `min`/`max` are decorative for typed
   * input, so these clamps ARE the bound. Every expectation is read out of the
   * vendored schema, never typed: aeon refuses out-of-range at emit and asked
   * that Aurora's clamps match exactly, and a literal here could drift.
   */
  it('clamps v_center and v_offset to the schema, and v_offset is SIGNED', () => {
    const vc = S.properties.v_center;
    const vo = S.properties.v_offset;
    // Anti-vacuous: the schema really bounds both, and v_offset really is signed.
    expect(typeof vc.minimum).toBe('number');
    expect(typeof vo.minimum).toBe('number');
    expect(vo.minimum, 'v_offset must admit negative values').toBeLessThan(0);
    expect(vc.minimum, 'v_center must not admit negative values').toBeGreaterThanOrEqual(0);

    // The engine-legal negative value the item was opened over.
    expect(clampVOffset(-8)).toBe(-8);
    // Out of range, at both ends of both fields.
    expect(clampVOffset(-40000)).toBe(vo.minimum);
    expect(clampVOffset(40000)).toBe(vo.maximum);
    expect(clampVCenter(40000)).toBe(vc.maximum);
    expect(clampVCenter(-1)).toBe(vc.minimum);
    // One past each end is pulled back exactly to the end; the ends themselves pass.
    expect(clampVCenter(vc.maximum + 1)).toBe(vc.maximum);
    expect(clampVCenter(vc.maximum)).toBe(vc.maximum);
    expect(clampVOffset(vo.minimum - 1)).toBe(vo.minimum);
    expect(clampVOffset(vo.minimum)).toBe(vo.minimum);
    // A half-typed '-' is NaN; it falls to the schema's default, NOT to min —
    // min is -32768 for the signed field and nobody meant to type that.
    expect(clampVOffset(NaN)).toBe(vo.default);
    expect(clampVCenter(NaN)).toBe(vc.default);
    expect(clampVOffset(Infinity)).toBe(vo.default);
    expect(clampVCenter(12.6)).toBe(13);

    // And the clamped values are what the codec accepts: the clamp's ceiling is
    // the codec's ceiling, not one either side of it.
    const scene = newEffectsScene('probe');
    scene.v_center = clampVCenter(40000);
    scene.v_offset = clampVOffset(-40000);
    expect(() => serializeEffectsScene(scene)).not.toThrow();
    scene.v_offset = -8;
    expect(() => serializeEffectsScene(scene)).not.toThrow();
  });
});

describe('scene list and section assignment', () => {
  it('labels a scene by its name, falling back to the id — never an empty row', () => {
    const named = newEffectsScene('canopy', 'Canopy at dusk');
    const unnamed = newEffectsScene('rocks');
    expect(sceneListEntries(library([named, unnamed]))).toEqual([
      { id: 'canopy', label: 'Canopy at dusk', layers: 1 },
      { id: 'rocks', label: 'rocks', layers: 1 },
    ]);
  });

  it('offers the act default plus the LOADED scenes only', () => {
    const lib = library([newEffectsScene('canopy', 'Canopy')],
      [{ path: 'data/editor/effects/broken.json', reason: 'x' }]);
    expect(sceneRefOptions(lib)).toEqual([
      { value: '', label: 'Act default' },
      { value: 'canopy', label: 'Canopy' },
    ]);
    // ...and the unreadable one is genuinely absent, not merely last.
    expect(sceneRefOptions(lib).some((o) => o.value === 'broken')).toBe(false);
  });

  it('warns about a sceneRef that names nothing assignable, and says which kind', () => {
    const lib = library([newEffectsScene('canopy')],
      [{ path: 'data/editor/effects/broken.json', reason: 'x' }]);
    expect(unassignableSceneRef(lib, null)).toBeNull();
    expect(unassignableSceneRef(lib, 'canopy')).toBeNull();
    expect(unassignableSceneRef(lib, 'broken')).toMatch(/could not be read/);
    expect(unassignableSceneRef(lib, 'gone')).toMatch(/not a scene in this project/);
  });

  it("maps the select's empty string to the model's null, and re-picking issues NOTHING", () => {
    expect(sectionSceneCommand(3, null, 'canopy'))
      .toEqual({
        type: 'set-section-scene', description: 'Section 3 scene', sectionIndex: 3,
        oldRef: null, newRef: 'canopy',
      });
    expect(sectionSceneCommand(3, 'canopy', '')?.newRef).toBeNull();
    // The no-op guard, both directions. A `<select>` fires onChange for the
    // option already selected; a command here would be an undo step that
    // visibly does nothing.
    expect(sectionSceneCommand(3, 'canopy', 'canopy')).toBeNull();
    expect(sectionSceneCommand(3, null, '')).toBeNull();
  });
});

describe('scene commands', () => {
  it('refuses a create whose id is illegal or taken, with the reason', () => {
    const lib = library([newEffectsScene('canopy')],
      [{ path: 'data/editor/effects/broken.json', reason: 'x' }]);
    expect(createSceneCommand(lib, 'Canopy-Dusk')).toEqual({
      ok: false, reason: expect.stringContaining('not a legal scene id'),
    });
    expect(createSceneCommand(lib, 'canopy')).toEqual({
      ok: false, reason: expect.stringContaining('already a scene'),
    });
    // The invisible collision: `broken` is in no list the author can see.
    expect(createSceneCommand(lib, 'broken')).toEqual({
      ok: false, reason: expect.stringContaining('could not be read'),
    });
  });

  it('creates a scene the codec accepts', () => {
    const result = createSceneCommand(library(), 'canopy_dusk', 'Canopy');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.command.sceneId).toBe('canopy_dusk');
    expect(result.command.oldScene).toBeNull();
    expect(() => serializeEffectsScene(result.command.newScene!)).not.toThrow();
  });

  it('deletes an existing scene and does nothing for one that is not there', () => {
    const lib = library([canopy()]);
    expect(deleteSceneCommand(lib, 'canopy')?.newScene).toBeNull();
    expect(deleteSceneCommand(lib, 'canopy')?.oldScene).toEqual(canopy());
    expect(deleteSceneCommand(lib, 'nope')).toBeNull();
  });

  it('emits NOTHING when an edit changes nothing', () => {
    const lib = library([canopy()]);
    expect(setSceneFieldCommand(lib, 'canopy', 'name', 'Canopy')).toBeNull();
    expect(setLayerFieldCommand(lib, 'canopy', 0, 'world_y', 0)).toBeNull();
    expect(setLayerFieldCommand(lib, 'canopy', 1, 'fb', { s1: 2, s2: 4, op: 1 })).toBeNull();
    // ...but a real change does emit.
    expect(setLayerFieldCommand(lib, 'canopy', 0, 'world_y', 8)).not.toBeNull();
  });

  it('DELETES an optional key rather than writing the schema default', () => {
    // The model rule scene.ts states: a default written out turns every
    // untouched load/save into a diff. Clearing `name` must return the document
    // to not-having-it.
    const lib = library([canopy()]);
    const cmd = setSceneFieldCommand(lib, 'canopy', 'name', undefined);
    expect(cmd).not.toBeNull();
    expect(cmd!.newScene).not.toHaveProperty('name');
    expect(JSON.parse(serializeEffectsScene(cmd!.newScene!))).not.toHaveProperty('name');
  });

  it('does not touch the live library — only the command carries the new state', () => {
    const live = canopy();
    const lib = library([live]);
    setLayerFieldCommand(lib, 'canopy', 0, 'world_y', 512);
    setSceneFieldCommand(lib, 'canopy', 'name', 'Changed');
    expect(live.layers[0].world_y).toBe(0);
    expect(live.name).toBe('Canopy');
  });

  it('adds layers up to the schema ceiling and then stops', () => {
    const scene = newEffectsScene('canopy');
    const lib = library([scene]);
    const h = new EditHistory();
    const level = { sections: [], effectsScenes: lib } as unknown as S4Level;

    for (let i = 1; i < EFFECTS_LAYER_COUNT.max; i++) {
      const cmd = addLayerCommand(lib, 'canopy');
      expect(cmd, `add #${i} was refused early`).not.toBeNull();
      h.execute(cmd!, level);
    }
    expect(lib.scenes[0].layers).toHaveLength(EFFECTS_LAYER_COUNT.max);
    // ANTI-VACUOUS: the full scene is still one the codec accepts...
    expect(() => serializeEffectsScene(lib.scenes[0])).not.toThrow();
    // ...and the ceiling really is a refusal, not just a validator error later.
    expect(addLayerCommand(lib, 'canopy')).toBeNull();
  });

  it('copies the layer above so a new band is a visible no-op, not a jump', () => {
    const lib = library([canopy()]);
    const cmd = addLayerCommand(lib, 'canopy')!;
    const added = cmd.newScene!.layers[2];
    expect(added.fa).toEqual(cmd.newScene!.layers[1].fa);
    expect(added.fb).toEqual(cmd.newScene!.layers[1].fb);
    expect(added.world_y).toBe(96 + 32);
  });

  it('keeps world_y in range when the layer above is already at the ceiling', () => {
    const scene = newEffectsScene('canopy');
    scene.layers[0].world_y = EFFECTS_WORLD_Y_BOUNDS.max;
    const lib = library([scene]);
    const cmd = addLayerCommand(lib, 'canopy')!;
    expect(cmd.newScene!.layers[1].world_y).toBe(EFFECTS_WORLD_Y_BOUNDS.max);
    expect(() => serializeEffectsScene(cmd.newScene!)).not.toThrow();
  });

  it('refuses to remove the last layer, or an index that is not there', () => {
    const lib = library([canopy()]);
    expect(removeLayerCommand(lib, 'canopy', 1)).not.toBeNull();
    expect(removeLayerCommand(lib, 'canopy', 5)).toBeNull();
    const single = library([newEffectsScene('rocks')]);
    expect(single.scenes[0].layers).toHaveLength(EFFECTS_LAYER_COUNT.min);
    expect(removeLayerCommand(single, 'rocks', 0)).toBeNull();
  });

  it('offers only cell precision, and both transitions', () => {
    expect([...SCENE_FORM_CHOICES.precision]).toEqual(['cell']);
    expect([...SCENE_FORM_CHOICES.transition]).toEqual(['smooth', 'instant']);
  });

  it("a whole form's worth of edits, run through history, is one step per gesture", () => {
    // The §6 bar, end to end: each provider call is one command, and each
    // command is one undoable step that returns the document exactly.
    const lib = library([canopy()]);
    const level = { sections: [], effectsScenes: lib } as unknown as S4Level;
    const h = new EditHistory();
    const before = JSON.stringify(lib.scenes[0]);

    h.execute(setLayerFieldCommand(lib, 'canopy', 0, 'fa', 'FACTOR_1_8')!, level);
    h.execute(setSceneFieldCommand(lib, 'canopy', 'v_factor', 1)!, level);
    h.execute(addLayerCommand(lib, 'canopy')!, level);
    expect(lib.scenes[0].layers).toHaveLength(3);

    h.undo(level); h.undo(level); h.undo(level);
    expect(JSON.stringify(lib.scenes[0])).toBe(before);
    expect(h.canUndo).toBe(false);
  });
});

describe('resolveSelectedScene — the selection the panel and the map canvas SHARE', () => {
  // Lifted out of EffectsScenePanel by ROADMAP item 43 so MapViewport can
  // resolve the same id the same way. Every case below is behaviour the panel
  // already had; the point of testing it here is that it now has two callers
  // and a divergence between them would put the canvas on a different scene
  // from the form beside it.
  const canyon = () => newEffectsScene('canyon', 'Canyon');

  it('resolves an id that exists', () => {
    const lib = library([canopy(), canyon()]);
    expect(resolveSelectedScene(lib, 'canyon')?.id).toBe('canyon');
  });

  it('falls back to the FIRST scene for a stale id — undo-a-create, or another project', () => {
    const lib = library([canopy(), canyon()]);
    expect(resolveSelectedScene(lib, 'deleted_by_undo')?.id).toBe('canopy');
  });

  it('falls back to the first scene when nothing is selected yet', () => {
    expect(resolveSelectedScene(library([canopy()]), null)?.id).toBe('canopy');
  });

  it('is null, not a throw, for a project with no scenes at all', () => {
    // The NORMAL case: an aeon tree with no data/editor/effects/ directory.
    expect(resolveSelectedScene(library([]), null)).toBeNull();
    expect(resolveSelectedScene(library([]), 'anything')).toBeNull();
  });

  it('agrees with sceneListEntries about what exists', () => {
    // The panel used to test existence against `entries` and then look the
    // scene up in `library.scenes`. That is one list only because
    // sceneListEntries maps scenes 1:1 — assert it, so a future entry filter
    // (hiding a scene from the picker, say) cannot silently split them.
    const lib = library([canopy(), canyon()]);
    expect(sceneListEntries(lib).map((e) => e.id)).toEqual(lib.scenes.map((s) => s.id));
  });
});

// ---------------------------------------------------------------------------
// Which space a layer top is authored in (owner feedback 2026-08-26, point 4)
// ---------------------------------------------------------------------------

describe('layerTopSpace — a locked scene authors screen lines, an unlocked one world Y', () => {
  // The engine's own words (aeon scene_dsl.emp `scene_plane_line`): "For a
  // locked plane the authoring space IS the plane, so the mapping is the
  // identity." Both shipped scenes are locked, so for every scene that exists
  // a layer top is a plane/screen line, and the UI has to say so.
  const locked = () => ({ ...newEffectsScene('l', 'L'), v_factor: EFFECTS_V_FACTOR_LOCK });
  const unlocked = (vf = 2, vc = 0, vo = 0) =>
    ({ ...newEffectsScene('u', 'U'), v_factor: vf, v_center: vc, v_offset: vo });

  it('is "screen" exactly when v_factor is the lock sentinel, and "act" for every other shift', () => {
    expect(layerTopSpace(locked())).toBe('screen');
    for (let vf = S.properties.v_factor.minimum; vf < EFFECTS_V_FACTOR_LOCK; vf++) {
      expect(layerTopSpace(unlocked(vf))).toBe('act');
    }
  });

  it('a new scene is locked by default, so it starts in screen space', () => {
    expect(layerTopSpace(newEffectsScene('n', 'N'))).toBe('screen');
  });

  it('bounds a locked top by the Plane-B span, derived from the plane geometry not typed', () => {
    // aeon parallax.emp: PLANE_B_SPAN = PLANE_B_CELL_ROWS * 8, ensure == 512.
    // Aurora has no rows constant; the plane is BG_LAYOUT_WORDS / BG_WIDTH rows
    // of TILE_WIDTH_PX. The expectation is derived the same way, independently.
    const rows = BG_LAYOUT_WORDS / BG_WIDTH;
    expect(PLANE_LINE_SPAN).toBe(rows * TILE_WIDTH_PX);
    const b = layerTopBounds(locked());
    expect(b).toEqual({ space: 'screen', label: 'Screen line', min: 0, max: PLANE_LINE_SPAN - 1 });
    expect(b.max).toBeLessThan(EFFECTS_WORLD_Y_BOUNDS.max);
  });

  it('bounds an unlocked top by the schema world_y range, under the existing label', () => {
    expect(layerTopBounds(unlocked())).toEqual({
      space: 'act', label: 'world_y',
      min: S.$defs.layer.properties.world_y.minimum,
      max: S.$defs.layer.properties.world_y.maximum,
    });
  });

  it('clampLayerTop follows the space: a locked layer cannot reach past the plane', () => {
    expect(clampLayerTop(locked(), 3000)).toBe(PLANE_LINE_SPAN - 1);
    expect(clampLayerTop(locked(), -4)).toBe(0);
    expect(clampLayerTop(locked(), 160.4)).toBe(160);
    expect(clampLayerTop(unlocked(), 3000)).toBe(3000);
    expect(clampLayerTop(unlocked(), 1e9)).toBe(EFFECTS_WORLD_Y_BOUNDS.max);
    expect(clampLayerTop(locked(), NaN)).toBe(0);
  });

  it('planeLineOf reproduces scene_plane_line: identity when locked, ((wy - vc) >> vf) + vo otherwise', () => {
    expect(planeLineOf(locked(), 160)).toEqual({ line: 160, hint: null });
    // (1000 - 200) >> 2 = 200, + 16 = 216
    expect(planeLineOf(unlocked(2, 200, 16), 1000)).toEqual({ line: 216, hint: null });
    // Arithmetic shift, not division: (7 >> 1) is 3.
    expect(planeLineOf(unlocked(1), 7).line).toBe(3);
  });

  it('planeLineOf carries the two engine refusals as advisory hints, not throws', () => {
    // wy above v_center: the runtime's asr.w sign-extends, the top has no image.
    const above = planeLineOf(unlocked(2, 500, 0), 100);
    expect(above.hint).toMatch(/above .*v_center/);
    // Line outside the span: Step 4a would rotate it onto another band's rows.
    const outside = planeLineOf(unlocked(0, 0, 0), PLANE_LINE_SPAN);
    expect(outside.line).toBe(PLANE_LINE_SPAN);
    expect(outside.hint).toMatch(new RegExp(`outside .*${PLANE_LINE_SPAN}`));
    // A locked top past the span gets the same hint — the clamp stops it in the
    // UI, but the provider says so for a document that arrived that way.
    expect(planeLineOf(locked(), PLANE_LINE_SPAN + 1).hint).toMatch(/outside/);
  });

  it('layerCountLine states the cap and its scope where the owner reads it', () => {
    const s = locked();
    expect(layerCountLine(s))
      .toBe(`${s.layers.length} of ${EFFECTS_LAYER_COUNT.max} layers (per scene; scenes are assigned per section)`);
    s.layers.push({ world_y: 32, fa: 'FACTOR_1', fb: 'FACTOR_1' });
    expect(layerCountLine(s).startsWith(`${s.layers.length} of ${EFFECTS_LAYER_COUNT.max} layers`)).toBe(true);
  });

  it('vFactorHint says what the sentinel means inline, from the constant', () => {
    expect(vFactorHint()).toBe(`${EFFECTS_V_FACTOR_LOCK} = locked (no vertical scroll)`);
  });
});
