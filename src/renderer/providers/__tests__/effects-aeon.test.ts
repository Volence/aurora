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
  SCENE_FORM_CHOICES, layerExtras, layerExtrasLine,
  layerTopSpace, layerTopBounds, clampLayerTop, planeLineOf, PLANE_LINE_SPAN,
  fireLineAdvisory, layerEmitsFire, fireScreenLineOf, vsplitOrderAdvisory,
  EFFECTS_FIRE_LINE_MIN, EFFECTS_FIRE_LINE_MAX,
  layerCountLine, vFactorHint,
  LAYER_CURVE_ROW, LAYER_VSPLIT_ROW, NONE_FACTOR_VALUE,
  factorFieldSelectValue, factorFieldFromSelect, curveFieldValue, curveFromField,
  vsplitFieldValue, vsplitFromToggle, curveAdvisory, clampVSplitAt,
  // wave 2 — deform authoring
  tableRefLabel, tableRefFormOptions, tableRefFormOf, tableRefFromForm, tableRefParams,
  tableParamLabel, tableRefParamValue, setTableRefParam, clampTableRefParam,
  tableRefBinPath, binPathRefusal, tableRefAdvisory, newTableRef,
  tableRefParamOptions, deformPeriodChoices,
  sceneDeformValue, sceneDeformFromToggle, vDeformValue, vDeformFromToggle,
  layerDeformValue, layerDeformFromToggle, layerDeformAdvisory, sceneDeformAdvisories,
  clampLayerDeformField, clampAmpShift, clampDeformSpeed,
  SCENE_DEFORM_ROWS, V_DEFORM_ROW, LAYER_DEFORM_ROW, TABLE_REF_ROW,
  // the left_column_mask follow-up
  LEFT_COLUMN_MASK_ROW, leftColumnMaskOptions, leftColumnMaskValue, leftColumnMaskRowVisible,
  leftColumnMaskCommand, leftColumnMaskAdvisory, factor0LockRefusal, vDeformToggleCommand,
  layerCurveDeformAdvisory,
} from '../effects-aeon';
import {
  EFFECTS_FACTOR_NAMES, EFFECTS_LAYER_COUNT, EFFECTS_PACKED_FACTOR_BOUNDS,
  EFFECTS_WORLD_Y_BOUNDS, EFFECTS_V_FACTOR_LOCK, newEffectsScene,
  EFFECTS_ANCHOR_SHIFT_BOUNDS,
} from '../../../core/formats/effects/scene-ui';
import { BG_LAYOUT_WORDS, TILE_WIDTH_PX } from '../../../core/formats/bg-override/bg-override';
import { BG_WIDTH } from '../../../core/formats/bg-tiles';
import { serializeEffectsScene, type EffectsScene, type EffectsSceneLibrary } from '../../../core/formats/effects/scene';
import { EFFECTS_LAYER_DEFAULTS, parseEffectsScene, type EffectsLayer } from '../../../core/formats/effects/scene';
import { existsSync, readFileSync } from 'node:fs';
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

  it('offers both transitions, and offers NO precision at all', () => {
    expect([...SCENE_FORM_CHOICES.transition]).toEqual(['smooth', 'instant']);
    // ROADMAP row 59. This used to read `SCENE_FORM_CHOICES.precision -> ['cell']`.
    // The choice set is what the panel maps over to build its dropdowns, so a
    // key here is a control on screen; absence here is the control's absence.
    // Anti-vacuous: the object is real and populated, so this is not an absence
    // assertion against an empty map.
    expect(Object.keys(SCENE_FORM_CHOICES).length).toBeGreaterThan(0);
    expect(Object.keys(SCENE_FORM_CHOICES)).not.toContain('precision');
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
// layerExtras — parcel E. The layer card used to show only world_y/fa/fb, so a
// scene whose curve WAS set ("how are we doing the curved scroll? I don't see
// what's setting it") looked unset. The provider builds the read-only line;
// the card only prints it.
// ---------------------------------------------------------------------------

const LAYER_PROPS = S.$defs.layer.properties as Record<string, any>;
const baseLayer = (): EffectsLayer => ({ world_y: 0, fa: 'FACTOR_1', fb: 'FACTOR_1' });

describe('layerExtras (parcel E)', () => {
  it('a layer at every schema default has NOTHING extra — no empty line on the card', () => {
    const dflt: EffectsLayer = {
      ...baseLayer(),
      dsa: LAYER_PROPS.dsa.default, dsb: LAYER_PROPS.dsb.default, phase: LAYER_PROPS.phase.default,
      enabled: LAYER_PROPS.enabled.default, deform: LAYER_PROPS.deform.default,
      curve: LAYER_PROPS.curve.default, vsplit: LAYER_PROPS.vsplit.default,
    };
    expect(layerExtras(baseLayer())).toEqual([]);
    expect(layerExtras(dflt)).toEqual([]);
    expect(layerExtrasLine(baseLayer())).toBeNull();
  });

  it('names dsa/dsb/phase and disabled in schema key order — curve/vsplit (parcel H) and deform (wave 2) have controls now', () => {
    const layer: EffectsLayer = {
      ...baseLayer(), dsa: 3, dsb: 4, phase: 9, enabled: false,
      deform: { own: { table: { generator: 'sine', amplitude: 8, period: 64 }, shift_a: 1, shift_b: 2, phase: 0, speed: 1 } },
      curve: { to: { s1: 2, s2: 4, op: 1 } },
      vsplit: { at: 112 },
    };
    const extras = layerExtras(layer);
    expect(extras.map((e) => e.key)).toEqual(['dsa', 'dsb', 'phase', 'enabled']);
    expect(extras.map((e) => e.text)).toEqual(['dsa 3', 'dsb 4', 'phase 9', 'disabled']);
    // A layer carrying ONLY the three keys the card now edits gets no line at
    // all: the read-only line must not duplicate a control sitting above it.
    expect(layerExtrasLine({
      ...baseLayer(),
      curve: { to: 'FACTOR_3_8' },
      vsplit: { at: 20 },
      deform: { own: { table: { generator: 'zero' }, shift_a: 15, shift_b: 15, phase: 0, speed: 0 } },
    })).toBeNull();
    expect(layerExtrasLine(layer)).toBe(extras.map((e) => e.text).join(' · '));
  });

  it('spells every table form the codec knows — on tableRefLabel, which the deform ROWS now carry', () => {
    // `tableRefLabel` left the extras line with `deform` in wave 2 and is
    // exported for the table sub-form's title. Same six spellings, checked at
    // the function rather than through a line that no longer prints them.
    expect(tableRefLabel({ generator: 'sine', amplitude: 8, period: 64 })).toBe('sine(8, 64)');
    expect(tableRefLabel({ generator: 'triangle', amplitude: 4, period: 32 })).toBe('triangle(4, 32)');
    expect(tableRefLabel({ generator: 'zero' })).toBe('zero');
    expect(tableRefLabel({ generator: 'v_column_perspective', focal: 96, max_offset: 12 }))
      .toBe('v_column_perspective(96, 12)');
    expect(tableRefLabel({ generator: 'v_column_floor', center: 100, max_offset: 6 }))
      .toBe('v_column_floor(100, 6)');
    expect(tableRefLabel({ bin: 'tables/canopy.bin' })).toBe('tables/canopy.bin');
    // …and a layer that carries any of them contributes NOTHING to the line.
    const own = (table: any): EffectsLayer =>
      ({ ...baseLayer(), deform: { own: { table, shift_a: 15, shift_b: 15, phase: 0, speed: 0 } } });
    expect(layerExtrasLine(own({ generator: 'triangle', amplitude: 4, period: 32 }))).toBeNull();
    expect(layerExtrasLine(own({ bin: 'tables/canopy.bin' }))).toBeNull();
  });

  it('explicit "none" and enabled:true are defaults, not extras', () => {
    expect(layerExtras({ ...baseLayer(), curve: 'none', vsplit: 'none', deform: 'none', enabled: true })).toEqual([]);
  });

  // The shipped scene, from the aeon tree. Expectations are re-derived from the
  // file's own JSON so a re-authored fixture cannot leave a stale pin green.
  const SHIPPED = '/home/volence/sonic_hacks/aeon/games/sonic4/data/editor/effects/ojz_act1_depth.json';
  it('every layer of the shipped ojz_act1_depth.json — nothing extra on any layer; the curve is on the controls, not the line', (ctx) => {
    if (!existsSync(SHIPPED)) {
      ctx.skip(`SKIPPED, NOT PASSED: shipped scene absent at ${SHIPPED}`);
      return;
    }
    const text = readFileSync(SHIPPED, 'utf8');
    const scene = parseEffectsScene(text, 'ojz_act1_depth');
    const raw = JSON.parse(text) as { layers: Record<string, any>[] };
    expect(scene.layers.length).toBe(raw.layers.length);
    let withCurve = 0;
    let withNothing = 0;
    scene.layers.forEach((layer, i) => {
      const r = raw.layers[i];
      const want: unknown[] = [];
      if (r.dsa !== undefined && r.dsa !== EFFECTS_LAYER_DEFAULTS.dsa) want.push(`dsa ${r.dsa}`);
      if (r.dsb !== undefined && r.dsb !== EFFECTS_LAYER_DEFAULTS.dsb) want.push(`dsb ${r.dsb}`);
      if (r.phase !== undefined && r.phase !== EFFECTS_LAYER_DEFAULTS.phase) want.push(`phase ${r.phase}`);
      if (r.enabled === false) want.push('disabled');
      // `deform` is a CONTROL in wave 2, so like curve/vsplit it contributes
      // nothing here however the file spells it.
      // curve / vsplit are the card's own controls now (parcel H) and must NOT
      // appear here as well; counted so the fixture is proven to carry them.
      if (r.curve !== undefined && r.curve !== 'none') withCurve++;
      if (want.length === 0) withNothing++;
      expect(layerExtras(layer).map((e) => e.text), `layer ${i}`).toEqual(want);
      if (want.every((w) => typeof w === 'string')) {
        expect(layerExtrasLine(layer), `layer ${i} line`).toBe(want.length ? want.join(' · ') : null);
      }
    });
    // The owner's question was about a curve the file DOES carry, and row E's
    // acceptance needs flat layers that show nothing; if the fixture ever loses
    // either, this test must say so rather than pass vacuously.
    expect(withCurve, 'the shipped scene is the curved-horizon scene').toBeGreaterThan(0);
    expect(withNothing, 'the shipped scene has layers with no extras').toBeGreaterThan(0);
    // ...and the curved layers read back through the CONTROLS' value functions.
    scene.layers.forEach((layer, i) => {
      const r = raw.layers[i];
      expect(curveFieldValue(layer), `layer ${i} curve`).toEqual(r.curve?.to ?? 'none');
      expect(vsplitFieldValue(layer), `layer ${i} vsplit`).toBe(r.vsplit?.at ?? null);
      expect(layerDeformValue(layer), `layer ${i} deform`).toEqual(r.deform?.own ?? null);
    });
  });
});

// ---------------------------------------------------------------------------
// Controls for curve.to and vsplit.at — parcel H. The card's FactorField grows
// a "none" state for the curve, and vsplit is a none/at toggle over a bounded
// row spinner. Every decision is here; the card wires events to it.
// ---------------------------------------------------------------------------

describe('curve / vsplit controls (parcel H)', () => {
  it('the rows say what the engine does, in plain words, with one hint each', () => {
    expect(LAYER_CURVE_ROW.key).toBe('curve');
    expect(LAYER_VSPLIT_ROW.key).toBe('vsplit');
    // Schema §2.2 / scene_dsl.emp SceneCurve.To: fb at the top, `to` at the bottom.
    expect(LAYER_CURVE_ROW.hint).toBe("Plane B speed ramps from fb at this strip's top to this value at its bottom");
    // SceneVSplit.At: whole-plane Plane-B vscroll from this layer's top down.
    expect(LAYER_VSPLIT_ROW.hint).toBe('from this strip down, Plane B scrolls vertically as a whole');
    for (const row of [LAYER_CURVE_ROW, LAYER_VSPLIT_ROW]) {
      expect(row.label).not.toMatch(/packed/i);
      expect(row.label.length).toBeGreaterThan(0);
      expect(row.title).toContain(row.key);
    }
    // The bound is spelled INTO the vsplit title from the schema, not typed.
    const at = LAYER_PROPS.vsplit.oneOf[1].properties.at;
    expect(LAYER_VSPLIT_ROW.title).toContain(`${at.minimum}..${at.maximum}`);
  });

  it('the "none" sentinel is neither a FACTOR_* name nor the custom sentinel', () => {
    expect(EFFECTS_FACTOR_NAMES).not.toContain(NONE_FACTOR_VALUE);
    expect(NONE_FACTOR_VALUE).not.toBe(CUSTOM_FACTOR_VALUE);
  });

  it('a FactorField with a none state selects the sentinel for none and the factor otherwise', () => {
    expect(factorFieldSelectValue('none')).toBe(NONE_FACTOR_VALUE);
    expect(factorFieldSelectValue('FACTOR_3_8')).toBe('FACTOR_3_8');
    expect(factorFieldSelectValue({ s1: 2, s2: 4, op: 1 })).toBe(CUSTOM_FACTOR_VALUE);
  });

  it('choosing from a none state: a name is that name, custom seeds the single-term packed identity', () => {
    expect(factorFieldFromSelect(NONE_FACTOR_VALUE, 'FACTOR_1')).toBe('none');
    expect(factorFieldFromSelect('FACTOR_3_8', 'none')).toBe('FACTOR_3_8');
    expect(factorFieldFromSelect(CUSTOM_FACTOR_VALUE, 'none'))
      .toEqual({ s1: EFFECTS_PACKED_FACTOR_BOUNDS.s1.min, s2: EFFECTS_PACKED_FACTOR_BOUNDS.s2.max, op: 0 });
    // ...and from a packed state, custom keeps the triple (the existing rule).
    expect(factorFieldFromSelect(CUSTOM_FACTOR_VALUE, { s1: 2, s2: 4, op: 1 })).toEqual({ s1: 2, s2: 4, op: 1 });
  });

  it('curveFieldValue reads the far end; absent and explicit "none" both read as none', () => {
    expect(curveFieldValue(baseLayer())).toBe('none');
    expect(curveFieldValue({ ...baseLayer(), curve: 'none' })).toBe('none');
    expect(curveFieldValue({ ...baseLayer(), curve: { to: 'FACTOR_1' } })).toBe('FACTOR_1');
    expect(curveFieldValue({ ...baseLayer(), curve: { to: { s1: 2, s2: 4, op: 1 } } })).toEqual({ s1: 2, s2: 4, op: 1 });
  });

  it('curveFromField: none CLEARS (undefined → key deleted), a factor becomes {to}', () => {
    expect(curveFromField('none')).toBeUndefined();
    expect(curveFromField('FACTOR_1_2')).toEqual({ to: 'FACTOR_1_2' });
    const lib = library([{ ...canopy(), layers: [{ ...baseLayer(), curve: { to: 'FACTOR_1_2' } }] }]);
    const cmd = setLayerFieldCommand(lib, 'canopy', 0, 'curve', curveFromField('none'));
    expect(cmd!.newScene!.layers[0]).not.toHaveProperty('curve');
  });

  it("vsplitFieldValue is the row or null; the toggle seeds the strip's own top, clamped to the plane", () => {
    expect(vsplitFieldValue(baseLayer())).toBeNull();
    expect(vsplitFieldValue({ ...baseLayer(), vsplit: 'none' })).toBeNull();
    expect(vsplitFieldValue({ ...baseLayer(), vsplit: { at: 44 } })).toBe(44);
    expect(vsplitFromToggle(false, baseLayer())).toBeUndefined();
    expect(vsplitFromToggle(true, { ...baseLayer(), world_y: 112 })).toEqual({ at: 112 });
    expect(vsplitFromToggle(true, { ...baseLayer(), world_y: 4000 })).toEqual({ at: clampVSplitAt(4000) });
    expect(clampVSplitAt(4000)).toBe(LAYER_PROPS.vsplit.oneOf[1].properties.at.maximum);
  });

  it('advises when the ramp goes nowhere — the engine refuses curve.to == fb (scene_dsl layer() guard 4)', () => {
    expect(curveAdvisory(baseLayer())).toBeNull();
    expect(curveAdvisory({ ...baseLayer(), fb: 'FACTOR_1_4', curve: { to: 'FACTOR_3_8' } })).toBeNull();
    const flat = curveAdvisory({ ...baseLayer(), fb: 'FACTOR_1_4', curve: { to: 'FACTOR_1_4' } });
    expect(flat).toMatch(/same/i);
    const packed = curveAdvisory({ ...baseLayer(), fb: { s1: 2, s2: 4, op: 1 }, curve: { to: { s1: 2, s2: 4, op: 1 } } });
    expect(packed).not.toBeNull();
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

// ---------------------------------------------------------------------------
// DEFORM AUTHORING — wave 2
// ---------------------------------------------------------------------------
//
// The panel's own comment named this gap: "deform is wave 2". Four attachments
// (`deform_fg`, `deform_bg`, `v_deform`, a layer's `deform`) all point at one
// `$defs/tableRef` with SIX spellings, and every expectation below is derived
// from the committed schema through `S` rather than pinned — a clean constant
// across varied inputs on this surface would be a confound, because the whole
// risk is a form offering less than the contract carries.

const TABLE_BRANCHES = S.$defs.tableRef.oneOf as Record<string, any>[];
/** The schema's own branch for a form id, found the way the form list is. */
const branchOf = (id: string) => TABLE_BRANCHES.find(
  (b) => (id === 'bin' ? 'bin' in b.properties : b.properties.generator?.const === id));
/** A scene carrying whatever the caller attached — for the writer's own validation. */
const sceneWith = (patch: Partial<EffectsScene>): EffectsScene =>
  ({ ...newEffectsScene('deform_probe'), ...patch });

// ---------------------------------------------------------------------------
// A LAYER THAT BECOMES A FIRE — the 3..223 bound, and WHO IT IS FOR
// ---------------------------------------------------------------------------
//
// The owner's build died on `fire: screen line 303 outside 3..223` from a top
// this panel offered him with a 0..511 bound. The bound is not wrong; it is
// about a DIFFERENT SET OF LAYERS. The rows below are shaped around the trap:
// most of them assert that a layer is NOT advised, because a blanket 3..223
// would make Aurora refuse scenes the build accepts.

describe('fireLineAdvisory — only the layers that actually become raster fires', () => {
  const locked = (vo = 0) =>
    ({ ...newEffectsScene('l', 'L'), v_factor: EFFECTS_V_FACTOR_LOCK, v_offset: vo });
  const unlocked = () => ({ ...newEffectsScene('u', 'U'), v_factor: 2, v_center: 0, v_offset: 0 });
  const plain = (world_y: number): EffectsLayer =>
    ({ world_y, fa: 'FACTOR_1', fb: 'FACTOR_1' });
  const split = (world_y: number, at = 0x43): EffectsLayer =>
    ({ ...plain(world_y), vsplit: { at } });

  it("the bound is the engine's own, not a rounded one", () => {
    // aeon engine/effects/raster_dsl.emp:326-327 — `fire()` ensures
    // `line >= 3 && line <= 223`.
    expect([EFFECTS_FIRE_LINE_MIN, EFFECTS_FIRE_LINE_MAX]).toEqual([3, 223]);
  });

  it('layerEmitsFire is the VARIANT test, so vsplit at: 0 still emits one', () => {
    // aeon scene_dsl.emp:832-837 — `None => 1, At(off) => 0`. 0 is a legal
    // scroll value, not a "no split" sentinel (scene_dsl.emp:347-349), so a
    // falsiness test here would silently exempt a layer the build DOES fire.
    expect(layerEmitsFire(split(300, 0))).toBe(true);
    expect(layerEmitsFire(split(300, 0x43))).toBe(true);
    expect(layerEmitsFire(plain(300))).toBe(false);
  });

  it('⚠ THE WHOLE POINT: a layer with NO split is never advised, anywhere in 0..511', () => {
    // Getting this wrong in the strict direction refuses scenes the build
    // accepts. `ojz_act1_start` ships five plain tops (0/32/80/112/160) and
    // nothing stops a locked scene putting a pure band boundary at 500.
    for (const y of [0, 1, 2, 3, 112, 160, 223, 224, 303, 319, PLANE_LINE_SPAN - 1]) {
      expect(fireLineAdvisory(locked(), plain(y))).toBeNull();
    }
  });

  it("advises exactly the two tops the owner's build refused", () => {
    for (const y of [303, 319]) {
      const advice = fireLineAdvisory(locked(), split(y));
      expect(advice).not.toBeNull();
      expect(advice).toContain(`screen line ${y}`);
      expect(advice).toContain('3..223');
    }
  });

  it('is silent across the whole legal band, and speaks on both edges of it', () => {
    for (let y = EFFECTS_FIRE_LINE_MIN; y <= EFFECTS_FIRE_LINE_MAX; y++) {
      expect(fireLineAdvisory(locked(), split(y))).toBeNull();
    }
    expect(fireLineAdvisory(locked(), split(EFFECTS_FIRE_LINE_MIN - 1))).not.toBeNull();
    expect(fireLineAdvisory(locked(), split(EFFECTS_FIRE_LINE_MAX + 1))).not.toBeNull();
    // The floor is not 0: lines 0-2 belong to the priming records.
    for (const y of [0, 1, 2]) expect(fireLineAdvisory(locked(), split(y))).not.toBeNull();
  });

  it('the LINE is `top - v_offset`, not the top — both shipped scenes hide this', () => {
    // aeon scene_dsl.emp:2456-2461, `scene_vsplit_line`. v_offset is 0 in both
    // shipped scenes, which is exactly why `3 <= world_y <= 223` would have
    // looked right forever.
    expect(fireScreenLineOf(locked(0), 300)).toBe(300);
    expect(fireScreenLineOf(locked(200), 300)).toBe(100);
    // A top of 300 is illegal at v_offset 0 and LEGAL at v_offset 200.
    expect(fireLineAdvisory(locked(0), split(300))).not.toBeNull();
    expect(fireLineAdvisory(locked(200), split(300))).toBeNull();
    // ...and a top of 100 is legal at v_offset 0 and illegal at v_offset 200.
    expect(fireLineAdvisory(locked(0), split(100))).toBeNull();
    expect(fireLineAdvisory(locked(200), split(100))).not.toBeNull();
    expect(fireLineAdvisory(locked(200), split(100))).toContain('v_offset 200');
  });

  it('says nothing on an UNLOCKED scene: a split there is a different refusal', () => {
    // `scene()` refuses vsplit on a camera-tracked plane outright (the
    // two-writer collision, scene_dsl.emp:1259-1261) and the layer top is not
    // what is wrong with it. A screen line does not exist for that scene at all.
    expect(fireLineAdvisory(unlocked(), split(303))).toBeNull();
    expect(fireLineAdvisory(unlocked(), split(112))).toBeNull();
  });

  it('is an ADVISORY: with no layer in hand it does not narrow the bound (ROADMAP row 58)', () => {
    const s = locked();
    expect(layerTopBounds(s)).toEqual({
      space: 'screen', label: 'Screen line', min: 0, max: PLANE_LINE_SPAN - 1,
    });
    expect(clampLayerTop(s, 303)).toBe(303);
    expect(clampLayerTop(s, 319)).toBe(319);
    // ...and it stays loose for a layer that emits no fire.
    expect(clampLayerTop(s, 303, plain(0))).toBe(303);
    expect(layerTopBounds(s, plain(0)).max).toBe(PLANE_LINE_SPAN - 1);
  });
});

// ---------------------------------------------------------------------------
// THE CLAMP KEEPS ITS OWN PROMISE — item 37's sentence, made true for a fire
// ---------------------------------------------------------------------------
//
// The owner produced 303, then 304, then 302 in twenty minutes by DRAGGING a
// guide, three dead builds. `canvasYToLayerTop` collapses to `canvasY / zoom` in
// screen space, so the legal band occupies the first `223 * zoom` canvas px and
// nothing marked where it ended. `clampLayerTop`'s docblock has promised since
// item 37 that "a locked layer cannot be dragged to a line the bake would
// refuse", and it was false for exactly the layers that break a build.

// ---------------------------------------------------------------------------
// SPLITS MUST DESCEND THE SCREEN — the OTHER engine rule a split can trip
// ---------------------------------------------------------------------------
//
// aeon `scene_vsplit_fires()` (engine/level/scene_dsl.emp): `ensure(line > prev)`.
//
// ⚠ AND NOT THE ONE THAT LOOKED LIKE ITS SIBLING. `ojz_effects.emp` carries a
// `== 2` on the vsplit COUNT whose own comment called itself derived while being
// a literal — one scene's GAME DATA, not an engine rule, and there is no engine
// cap on vsplit count at all. It is deliberately NOT transcribed here.

describe('vsplitOrderAdvisory — the ordering rule, transcribed from the DSL and not from game data', () => {
  const locked = (vo = 0) =>
    ({ ...newEffectsScene('l', 'L'), v_factor: EFFECTS_V_FACTOR_LOCK, v_offset: vo });
  const unlocked = () => ({ ...newEffectsScene('u', 'U'), v_factor: 2, v_center: 0, v_offset: 0 });
  const plain = (world_y: number): EffectsLayer => ({ world_y, fa: 'FACTOR_1', fb: 'FACTOR_1' });
  const split = (world_y: number): EffectsLayer => ({ ...plain(world_y), vsplit: { at: 0x43 } });
  const advise = (scene: ReturnType<typeof locked>, ls: EffectsLayer[]) =>
    ls.map((_, i) => vsplitOrderAdvisory(scene, ls, i));

  it('says nothing when the splits descend', () => {
    expect(advise(locked(), [split(20), plain(60), split(100), split(180)]))
      .toEqual([null, null, null, null]);
  });

  it('names the layer above when two splits share a line, or go backwards', () => {
    const same = advise(locked(), [split(100), split(100)]);
    expect(same[0]).toBeNull();
    expect(same[1]).toContain('layer 0');
    expect(same[1]).toContain('line 100');
    const back = advise(locked(), [split(180), split(60)]);
    expect(back[1]).toContain('not BELOW');
  });

  it('THE FIRST SPLIT CAN NEVER TRIP IT — the engine seeds `prev` at -1', () => {
    for (const y of [0, 3, 223, 500]) {
      expect(vsplitOrderAdvisory(locked(), [split(y)], 0)).toBeNull();
    }
  });

  it('LAYERS WITHOUT A SPLIT DO NOT PARTICIPATE, in either direction', () => {
    // The engine updates `prev` only inside the `if`, so a plain layer between
    // two splits neither breaks the chain nor joins it — and a plain layer is
    // never itself advised, however out of order its top is.
    const ls = [split(50), plain(400), split(120)];
    expect(advise(locked(), ls)).toEqual([null, null, null]);
    const ls2 = [plain(500), split(50), split(120)];
    expect(advise(locked(), ls2)).toEqual([null, null, null]);
  });

  it('compares SCREEN lines, so v_offset cancels and cannot invent a violation', () => {
    const ls = [split(300), split(360)];
    expect(advise(locked(200), ls)).toEqual([null, null]);
  });

  it('says nothing on an UNLOCKED scene', () => {
    const ls = [split(180), split(60)];
    expect(ls.map((_, i) => vsplitOrderAdvisory(unlocked(), ls, i))).toEqual([null, null]);
  });

  it('⚠ THERE IS NO COUNT RULE: three splits in order are advised about nothing', () => {
    // The `== 2` that refused the owner's third split was a literal in one
    // scene's game data, since replaced. Transcribing it would have made Aurora
    // refuse what the engine allows.
    expect(advise(locked(), [split(20), split(80), split(160)])).toEqual([null, null, null]);
    expect(advise(locked(), [split(20), split(60), split(100), split(140), split(180)]))
      .toEqual([null, null, null, null, null]);
  });
});

describe('clampLayerTop bounds a fire-emitting layer to the fire line, and nothing else', () => {
  const locked = (vo = 0) =>
    ({ ...newEffectsScene('l', 'L'), v_factor: EFFECTS_V_FACTOR_LOCK, v_offset: vo });
  const unlocked = () => ({ ...newEffectsScene('u', 'U'), v_factor: 2, v_center: 0, v_offset: 0 });
  const plain = (): EffectsLayer => ({ world_y: 0, fa: 'FACTOR_1', fb: 'FACTOR_1' });
  const split = (): EffectsLayer => ({ ...plain(), vsplit: { at: 0x43 } });

  it('a split layer cannot be dragged past 223, nor above 3', () => {
    const s = locked();
    // The three tops that actually killed his build.
    for (const y of [302, 303, 304, 317, 318, 319]) {
      expect(clampLayerTop(s, y, split())).toBe(EFFECTS_FIRE_LINE_MAX);
    }
    expect(clampLayerTop(s, 0, split())).toBe(EFFECTS_FIRE_LINE_MIN);
    expect(clampLayerTop(s, 2, split())).toBe(EFFECTS_FIRE_LINE_MIN);
    // Everything inside the band is untouched.
    for (const y of [3, 112, 160, 223]) expect(clampLayerTop(s, y, split())).toBe(y);
  });

  it('⚠ AND A LAYER WITHOUT A SPLIT KEEPS THE PLANE, so no scene the build accepts is refused', () => {
    const s = locked();
    for (const y of [224, 302, 303, 319, PLANE_LINE_SPAN - 1]) {
      expect(clampLayerTop(s, y, plain())).toBe(y);
    }
    expect(clampLayerTop(s, PLANE_LINE_SPAN, plain())).toBe(PLANE_LINE_SPAN - 1);
  });

  it('the clamped band rides v_offset, because the LINE is `top - v_offset`', () => {
    const s = locked(100);
    expect(layerTopBounds(s, split())).toEqual({
      space: 'screen', label: 'Screen line',
      min: EFFECTS_FIRE_LINE_MIN + 100, max: EFFECTS_FIRE_LINE_MAX + 100,
    });
    expect(clampLayerTop(s, 300, split())).toBe(300);   // line 200 — legal
    expect(clampLayerTop(s, 350, split())).toBe(323);   // line 223 — the edge
    expect(clampLayerTop(s, 0, split())).toBe(103);     // line 3
  });

  it('and it is intersected with the plane, never widened past it', () => {
    // A v_offset that pushes 223 past the plane's last row must not produce a
    // bound the plane refuses.
    const s = locked(PLANE_LINE_SPAN);
    expect(layerTopBounds(s, split()).max).toBe(PLANE_LINE_SPAN - 1);
  });

  it('leaves an UNLOCKED scene alone: a split there is refused for another reason entirely', () => {
    const s = unlocked();
    expect(clampLayerTop(s, 5000, split())).toBe(5000);
    expect(layerTopBounds(s, split()).space).toBe('act');
  });
});

describe('tableRef — every form the contract admits, derived from it', () => {
  it('the dropdown offers exactly the schema branches, in schema order', () => {
    const want = TABLE_BRANCHES.map((b) => ('bin' in b.properties ? 'bin' : b.properties.generator.const));
    expect(tableRefFormOptions().map((o) => o.value)).toEqual(want);
    // ANTI-VACUOUS: the point of deriving is that there are MORE than the two a
    // hand-written picker would have offered.
    expect(want.length).toBeGreaterThan(2);
    expect(want).toContain('zero');
    expect(want).toContain('bin');
    // A generator shows its own name; the raw-file branch has none to show.
    for (const o of tableRefFormOptions()) {
      expect(o.label === o.value || o.value === 'bin', o.value).toBe(true);
    }
  });

  it('each form takes exactly the parameters its branch requires, with its ranges', () => {
    for (const o of tableRefFormOptions()) {
      const b = branchOf(o.value)!;
      const want = (b.required as string[]).filter((k) => k !== 'generator');
      const got = tableRefParams(o.value);
      expect(got.map((p) => p.key), o.value).toEqual(o.value === 'bin' ? [] : want);
      for (const p of got) {
        expect(p.min, `${o.value}.${p.key} min`).toBe(b.properties[p.key].minimum ?? null);
        expect(p.max, `${o.value}.${p.key} max`).toBe(b.properties[p.key].maximum ?? null);
      }
    }
    // The two shapes this has to keep apart, named: a bounded parameter and an
    // unbounded one. A form list that silently gave every parameter a range
    // would pass a check that only looked at the keys.
    expect(tableRefParams('sine').every((p) => p.min !== null && p.max !== null)).toBe(true);
    expect(tableRefParams('v_column_perspective').every((p) => p.min === null && p.max === null)).toBe(true);
    expect(tableRefParams('zero')).toEqual([]);
  });

  it('tableRefFormOf reads the form back off a value of every shape', () => {
    expect(tableRefFormOf({ generator: 'sine', amplitude: 1, period: 256 })).toBe('sine');
    expect(tableRefFormOf({ generator: 'zero' })).toBe('zero');
    expect(tableRefFormOf({ bin: 'a.bin' })).toBe('bin');
  });

  it('a new table is the schema FIRST form at its seeds, and the writer accepts it', () => {
    const first = TABLE_BRANCHES[0];
    const t = newTableRef();
    expect(tableRefFormOf(t)).toBe(first.properties.generator.const);
    // `period` seeds at the whole table — the one value guaranteed to divide it.
    expect((t as { period: number }).period).toBe(first.properties.period.maximum);
    // …and every other bounded parameter at its own minimum.
    expect((t as { amplitude: number }).amplitude).toBe(first.properties.amplitude.minimum);
    expect(tableRefAdvisory(t)).toBeNull();
    // THE REAL CHECK: the codec's writer validates on the way out, so a seed the
    // schema refuses cannot reach disk — and a seed that is schema-legal proves
    // it here rather than at save time.
    expect(() => serializeEffectsScene(sceneWith({ deform_fg: { shared: { table: t, speed: 0 } } })))
      .not.toThrow();
  });

  it('every form, seeded by the form picker, is a document the writer accepts', () => {
    for (const o of tableRefFormOptions()) {
      const t = tableRefFromForm(o.value, newTableRef());
      const scene = sceneWith({ deform_bg: { shared: { table: t, speed: 0 } } });
      if (o.value === 'bin') {
        // The `.bin` branch seeds an EMPTY path, which the schema's pattern
        // refuses — deliberately: a blank box is "not typed yet", and the
        // refusal under it says so. The writer must be the one that stops it.
        expect(() => serializeEffectsScene(scene), o.value).toThrow();
        expect(binPathRefusal('')).toBeNull();
      } else {
        expect(() => serializeEffectsScene(scene), o.value).not.toThrow();
      }
    }
  });

  it('switching sine <-> triangle keeps the numbers the author just tuned', () => {
    const sine = { generator: 'sine' as const, amplitude: 40, period: 64 };
    expect(tableRefFromForm('triangle', sine)).toEqual({ generator: 'triangle', amplitude: 40, period: 64 });
    // …and switching to a form with none of those keys drops to that form's seeds.
    expect(tableRefFromForm('zero', sine)).toEqual({ generator: 'zero' });
    // An unbounded parameter seeds at 0 — a column table that displaces nothing.
    expect(tableRefFromForm('v_column_floor', sine))
      .toEqual({ generator: 'v_column_floor', center: 0, max_offset: 0 });
    // Re-picking the form already selected is the identity, not a reseed: a
    // `<select>` fires onChange for the option already chosen.
    expect(tableRefFromForm('sine', sine)).toBe(sine);
  });

  it('a carried parameter is clamped into the destination form rather than carried out of range', () => {
    const over = { generator: 'sine' as const, amplitude: 9999, period: 64 };
    const moved = tableRefFromForm('triangle', over) as { amplitude: number };
    expect(moved.amplitude).toBe(branchOf('triangle')!.properties.amplitude.maximum);
  });

  it('clampTableRefParam is the bound, and an unbounded parameter has none invented for it', () => {
    const amp = branchOf('sine')!.properties.amplitude;
    expect(clampTableRefParam('sine', 'amplitude', amp.maximum + 5)).toBe(amp.maximum);
    expect(clampTableRefParam('sine', 'amplitude', amp.minimum - 5)).toBe(amp.minimum);
    expect(clampTableRefParam('sine', 'amplitude', 3.6)).toBe(4);
    expect(clampTableRefParam('sine', 'amplitude', NaN)).toBe(amp.minimum);
    // Unbounded: rounded, and otherwise left alone in BOTH directions.
    expect(clampTableRefParam('v_column_perspective', 'focal', 1e6)).toBe(1e6);
    expect(clampTableRefParam('v_column_perspective', 'focal', -1e6)).toBe(-1e6);
    expect(clampTableRefParam('v_column_perspective', 'focal', NaN)).toBe(0);
  });

  it('setTableRefParam writes one parameter through the clamp and leaves the rest alone', () => {
    const t = { generator: 'sine' as const, amplitude: 8, period: 64 };
    expect(setTableRefParam(t, 'amplitude', 9999))
      .toEqual({ generator: 'sine', amplitude: branchOf('sine')!.properties.amplitude.maximum, period: 64 });
    expect(t.amplitude, 'the input is not mutated').toBe(8);
  });

  it('tableRefParamValue falls back to the seed rather than rendering undefined in a spinner', () => {
    expect(tableRefParamValue({ generator: 'sine', amplitude: 12, period: 8 }, 'amplitude')).toBe(12);
    // A hand-written document missing a required key still has to render.
    expect(tableRefParamValue({ generator: 'sine' } as never, 'period'))
      .toBe(branchOf('sine')!.properties.period.maximum);
  });

  it('a .bin path is refused by the SCHEMA pattern, not a second rule', () => {
    expect(tableRefBinPath({ generator: 'zero' })).toBeNull();
    expect(tableRefBinPath({ bin: 'tables/x.bin' })).toBe('tables/x.bin');
    expect(binPathRefusal('tables/canopy.bin')).toBeNull();
    expect(binPathRefusal('')).toBeNull();
    for (const bad of ['../escape.bin', 'tables/../../x.bin', 'notatable.txt', 'has space.bin']) {
      expect(binPathRefusal(bad), bad).toMatch(/not a legal table path/);
    }
    // The refusal quotes the rule the schema's own pattern encodes.
    expect(binPathRefusal('../x.bin')).toContain(TABLE_REF_ROW.binRule);
    // And a path this refuses is a path the WRITER refuses, which is the fact
    // that makes the refusal worth showing.
    expect(() => serializeEffectsScene(sceneWith({
      deform_fg: { shared: { table: { bin: '../escape.bin' }, speed: 0 } },
    }))).toThrow();
  });

  it('a period that does not divide the table is advised, never enforced', () => {
    const bytes = branchOf('sine')!.properties.period.maximum;
    for (const p of [1, 2, 4, 8, 16, 32, 64, 128, bytes]) {
      expect(tableRefAdvisory({ generator: 'sine', amplitude: 1, period: p }), `period ${p}`).toBeNull();
    }
    const bad = tableRefAdvisory({ generator: 'triangle', amplitude: 1, period: 100 });
    expect(bad).toMatch(new RegExp(`period 100 does not divide the ${bytes}-byte table`));
    expect(bad).toMatch(/the build refuses it/);
    // ADVISORY: the shape validator still writes it, because value semantics
    // are sigil's (scene.ts's split).
    expect(() => serializeEffectsScene(sceneWith({
      v_deform: { columns: { table: { generator: 'triangle', amplitude: 1, period: 100 }, speed: 0, amp_shift: 0 } },
    }))).not.toThrow();
    expect(tableRefAdvisory({ bin: 'x.bin' })).toBeNull();
    expect(tableRefAdvisory({ generator: 'zero' })).toBeNull();
  });

  it('period is a PICKER over the divisors, computed — not a spinner over 256 values', () => {
    // ROADMAP row 63. The engine's rule is `256 % period == 0`
    // (parallax_dsl.emp:52 and :87, both measured refusing at 100 and each
    // naming its own generator), so exactly nine values build. The spinner
    // advertised all 256.
    const bytes = branchOf('sine')!.properties.period.maximum;
    const p = tableRefParams('sine').find((q) => q.key === 'period')!;
    const legal = deformPeriodChoices(p);

    // DERIVED, not typed: every value divides, and every divisor in range is
    // offered. Asserting the LIST would pass against a hand-typed constant.
    for (const v of legal) expect(bytes % v, `offered ${v}`).toBe(0);
    for (let v = p.min ?? 1; v <= (p.max ?? bytes); v++) {
      if (bytes % v === 0) expect(legal, `divisor ${v} missing`).toContain(v);
    }
    // ANTI-VACUOUS: the set is far smaller than the range it replaced, which is
    // the entire point of the row. An empty or full list would satisfy the
    // divisor assertions above.
    expect(legal.length).toBe(9);
    expect((p.max ?? 0) - (p.min ?? 0) + 1).toBeGreaterThan(legal.length * 10);

    const opts = tableRefParamOptions('sine', 'period', 64)!;
    expect(opts.map((o) => o.value)).toEqual(legal);
    expect(opts.every((o) => !o.disabled)).toBe(true);

    // A NON-DIVISOR THE FILE CARRIES IS STILL RENDERED, disabled and in order —
    // a `<select>` missing its own value silently shows a different one, which
    // here would let the author read a legal period while the build reads an
    // illegal one. This is `leftColumnMaskOptions`'s rule, one control over.
    const carried = tableRefParamOptions('sine', 'period', 100)!;
    expect(carried.map((o) => o.value)).toContain(100);
    expect(carried.find((o) => o.value === 100)!.disabled).toBe(true);
    expect(carried.filter((o) => o.disabled).map((o) => o.value)).toEqual([100]);
    expect(carried.map((o) => o.value)).toEqual([...carried.map((o) => o.value)].sort((a, b) => a - b));
    // …and the advisory still fires on it. The picker governs what an author can
    // LAND on; the advisory governs what a document CARRIES. Both, or one path
    // is uncovered.
    expect(tableRefAdvisory({ generator: 'sine', amplitude: 1, period: 100 })).not.toBeNull();

    // ONLY `period`, and only where the schema declares one. The `.bin` branch
    // has no parameters at all, so the derivation cannot reach it; `amplitude`
    // is a genuine RANGE and stays a spinner.
    expect(tableRefParamOptions('sine', 'amplitude', 8)).toBeNull();
    expect(tableRefParamOptions('bin', 'period', 64)).toBeNull();
    expect(tableRefParamOptions('zero', 'period', 64)).toBeNull();
    expect(tableRefParamOptions('v_column_perspective', 'focal', 4)).toBeNull();
    // Both generators that declare a period get one — :52 and :87 are separate
    // ensures and a fix that only covered `sine` would leave `triangle` open.
    for (const g of ['sine', 'triangle']) {
      expect(tableRefParamOptions(g, 'period', 64), g).not.toBeNull();
    }

    // STILL NOT ENFORCEMENT (row 58's posture). Narrowing a picker is not a
    // refusal: the document with period 100 saves exactly as it did before.
    expect(() => serializeEffectsScene(sceneWith({
      deform_fg: { shared: { table: { generator: 'sine', amplitude: 1, period: 100 }, speed: 0 } },
    }))).not.toThrow();

    // AND THE SEED IS STILL A LEGAL OPTION — `seedTableRefParam` seeds at `max`
    // "guaranteed to divide the table length", so a new table opens on a value
    // the picker offers rather than on a disabled one.
    expect(legal).toContain(tableRefParamValue(newTableRef(), 'period'));
  });

  it('a parameter label is the schema key, title-cased at its underscores', () => {
    expect(tableParamLabel('amplitude')).toBe('Amplitude');
    expect(tableParamLabel('max_offset')).toBe('Max offset');
    expect(tableParamLabel('shift_a')).toBe('Shift A');
    expect(tableParamLabel('amp_shift')).toBe('Amp shift');
    // Derived, so every key the schema actually declares gets a label with no
    // underscore left in it and no empty token.
    const keys = new Set(tableRefFormOptions().flatMap((o) => tableRefParams(o.value).map((p) => p.key)));
    expect(keys.size).toBeGreaterThan(3);
    for (const k of keys) {
      expect(tableParamLabel(k), k).not.toMatch(/_/);
      expect(tableParamLabel(k).length, k).toBeGreaterThan(0);
    }
  });
});

describe('the four deform attachments read and write', () => {
  const table = { generator: 'sine' as const, amplitude: 8, period: 64 };

  it('a scene with no attachment reads null on every one of them', () => {
    const s = newEffectsScene('plain');
    expect(sceneDeformValue(s, 'deform_fg')).toBeNull();
    expect(sceneDeformValue(s, 'deform_bg')).toBeNull();
    expect(vDeformValue(s)).toBeNull();
    expect(layerDeformValue(s.layers[0])).toBeNull();
    // An EXPLICIT "none" is the same fact spelled out, and must read the same.
    expect(sceneDeformValue({ deform_fg: 'none', deform_bg: 'none' }, 'deform_fg')).toBeNull();
    expect(vDeformValue({ v_deform: 'none' })).toBeNull();
    expect(layerDeformValue({ deform: 'none' })).toBeNull();
  });

  it('turning one on seeds a document the writer accepts; turning it off clears the key', () => {
    const fg = sceneDeformFromToggle(true)!;
    expect(fg).toHaveProperty('shared');
    const cols = vDeformFromToggle(true)!;
    expect(cols).toHaveProperty('columns');
    const own = layerDeformFromToggle(true)!;
    expect(own).toHaveProperty('own');
    const scene = sceneWith({ deform_fg: fg, v_deform: cols });
    scene.layers[0].deform = own;
    expect(() => serializeEffectsScene(scene)).not.toThrow();
    expect(sceneDeformFromToggle(false)).toBeUndefined();
    expect(vDeformFromToggle(false)).toBeUndefined();
    expect(layerDeformFromToggle(false)).toBeUndefined();
  });

  it("a layer's own attachment seeds at the DEFAULTS of the fields it lowers into", () => {
    // The two-sources guard's other half: own.shift_a/shift_b/phase lower into
    // dsa/dsb/phase, so the seed is a true no-op on the picture.
    const own = layerDeformValue({ deform: layerDeformFromToggle(true) })!;
    expect(own.shift_a).toBe(EFFECTS_LAYER_DEFAULTS.dsa);
    expect(own.shift_b).toBe(EFFECTS_LAYER_DEFAULTS.dsb);
    expect(own.phase).toBe(EFFECTS_LAYER_DEFAULTS.phase);
    expect(own.speed).toBe(0);
    // …and the row SAYS it is silent, which is what makes the no-op legible.
    expect(layerDeformAdvisory({ deform: layerDeformFromToggle(true) }))
      .toMatch(/both shifts are 15: the table is attached but neither plane samples it/);
  });

  it('the inert advisory clears the moment either plane is given amplitude', () => {
    const own = layerDeformValue({ deform: layerDeformFromToggle(true) })!;
    expect(layerDeformAdvisory({ deform: { own: { ...own, shift_b: 0 } } })).toBeNull();
    expect(layerDeformAdvisory({ deform: { own: { ...own, shift_a: 3 } } })).toBeNull();
    expect(layerDeformAdvisory({ deform: 'none' })).toBeNull();
    expect(layerDeformAdvisory({})).toBeNull();
  });

  it('the three integer fields clamp to the schema, and speed is deliberately unbounded', () => {
    const b = S.$defs.layerDeform.oneOf[1].properties.own.properties;
    expect(clampLayerDeformField('shift_a', 99)).toBe(b.shift_a.maximum);
    expect(clampLayerDeformField('shift_b', -4)).toBe(b.shift_b.minimum);
    expect(clampLayerDeformField('phase', 9999)).toBe(b.phase.maximum);
    expect(clampLayerDeformField('phase', NaN)).toBe(b.phase.minimum);
    const amp = S.properties.v_deform.oneOf[1].properties.columns.properties.amp_shift;
    expect(clampAmpShift(99)).toBe(amp.maximum);
    expect(clampAmpShift(-1)).toBe(amp.minimum);
    // `speed` has no bound in the schema, so none is invented — only rounding.
    expect(clampDeformSpeed(4.6)).toBe(5);
    expect(clampDeformSpeed(-99999)).toBe(-99999);
    expect(clampDeformSpeed(NaN)).toBe(0);
    expect(S.$defs.sceneDeform.oneOf[1].properties.shared.properties.speed.minimum).toBeUndefined();
  });

  it('setSceneFieldCommand carries an OBJECT value — the first non-scalar on this path', () => {
    const lib = library([newEffectsScene('s')]);
    const cmd = setSceneFieldCommand(lib, 's', 'deform_fg', { shared: { table, speed: 3 } });
    expect(cmd!.newScene!.deform_fg).toEqual({ shared: { table, speed: 3 } });
    // …and it is a whole-document swap, so the undo half is the document before.
    expect(cmd!.oldScene!.deform_fg).toBeUndefined();
  });

  it('clearing an attachment DELETES the key, and re-sending the same value is not an undo step', () => {
    const set = { shared: { table, speed: 0 } } as const;
    const lib = library([{ ...newEffectsScene('s'), deform_bg: set }]);
    expect(setSceneFieldCommand(lib, 's', 'deform_bg', set)).toBeNull();
    const cleared = setSceneFieldCommand(lib, 's', 'deform_bg', undefined);
    expect('deform_bg' in cleared!.newScene!).toBe(false);
  });

  it('an attachment SPELLED "none" on disk is left as spelled — clearing it is a no-op', () => {
    // The rule setLayerFieldCommand has always had for curve/vsplit, which the
    // scene path had no none-defaulted key to need until wave 2. Without it,
    // toggling the row off would silently rewrite a hand-authored line.
    for (const key of ['deform_fg', 'deform_bg', 'v_deform'] as const) {
      const lib = library([{ ...newEffectsScene('s'), [key]: 'none' }]);
      expect(setSceneFieldCommand(lib, 's', key, undefined), key).toBeNull();
    }
    // A key that is genuinely SET is still cleared.
    const lib = library([{ ...newEffectsScene('s'), v_deform: { columns: { table, speed: 0, amp_shift: 0 } } }]);
    expect('v_deform' in setSceneFieldCommand(lib, 's', 'v_deform', undefined)!.newScene!).toBe(false);
    // …and the layer path keeps the behaviour it already had.
    const l = library([{
      ...newEffectsScene('s'),
      layers: [{ world_y: 0, fa: 'FACTOR_1', fb: 'FACTOR_1', deform: 'none' }],
    }]);
    expect(setLayerFieldCommand(l, 's', 0, 'deform', undefined)).toBeNull();
  });

  it("setLayerFieldCommand writes and clears a layer's own attachment", () => {
    const lib = library([newEffectsScene('s')]);
    const own = layerDeformFromToggle(true)!;
    const cmd = setLayerFieldCommand(lib, 's', 0, 'deform', own);
    expect(cmd!.newScene!.layers[0].deform).toEqual(own);
    const lib2 = library([{
      ...newEffectsScene('s'),
      layers: [{ world_y: 0, fa: 'FACTOR_1', fb: 'FACTOR_1', deform: own }],
    }]);
    expect('deform' in setLayerFieldCommand(lib2, 's', 0, 'deform', undefined)!.newScene!.layers[0]).toBe(false);
  });
});

describe('deform advisories — what the build would refuse, said first', () => {
  const table = { generator: 'sine' as const, amplitude: 8, period: 64 };
  const shared = { shared: { table, speed: 0 } } as const;
  const own = { own: { table, shift_a: 0, shift_b: 0, phase: 0, speed: 0 } } as const;
  const columns = { columns: { table, speed: 0, amp_shift: 0 } } as const;

  it('a clean scene is advised nothing', () => {
    expect(sceneDeformAdvisories(newEffectsScene('clean'))).toEqual([]);
    expect(sceneDeformAdvisories(sceneWith({ deform_fg: shared }))).toEqual([]);
  });

  it("a layer's own table with no scene table on either plane", () => {
    const scene = sceneWith({});
    scene.layers[0].deform = own;
    expect(sceneDeformAdvisories(scene).join('\n')).toMatch(/attaches none on either plane/);
    // EITHER plane satisfies it — that is the engine's own condition, and a
    // check that only knew about fg would pass this test by accident.
    for (const key of ['deform_fg', 'deform_bg'] as const) {
      const ok = sceneWith({ [key]: shared });
      ok.layers[0].deform = own;
      expect(sceneDeformAdvisories(ok), key).toEqual([]);
    }
  });

  it('per-column V deform colliding with a layer split, naming the layer', () => {
    const scene = sceneWith({ v_deform: columns, left_column_mask: 'accept' });
    scene.layers.push({ world_y: 64, fa: 'FACTOR_1', fb: 'FACTOR_1', vsplit: { at: 20 } });
    const a = sceneDeformAdvisories(scene).join('\n');
    expect(a).toMatch(/layer 1 authors a Plane B split/);
    expect(a).toMatch(/same VSRAM word/);
    // Without the split there is nothing to collide with.
    scene.layers.pop();
    expect(sceneDeformAdvisories(scene)).toEqual([]);
  });

  it('V deform without a left_column_mask policy — and the advisory names the ROW that answers it', () => {
    const scene = sceneWith({ v_deform: columns });
    const a = sceneDeformAdvisories(scene).join('\n');
    expect(a).toMatch(/no left_column_mask policy/);
    // It used to say "set left_column_mask in the scene file by hand — this
    // panel has no control for it yet", which the follow-up made FALSE. A
    // parcel that adds the control and leaves the sentence is worse than one
    // that adds neither: it sends the author to a text editor for a row four
    // lines below.
    expect(a).not.toMatch(/by hand/);
    expect(a).toContain(LEFT_COLUMN_MASK_ROW.label);
    // Every non-default policy silences it — read out of the schema's own enum,
    // so a value added to the contract is covered without editing this row.
    // EXCEPT factor0_lock on a scene that cannot make the claim: this fixture's
    // layer is FACTOR_1, so it raises a DIFFERENT advisory rather than none.
    const values = S.properties.left_column_mask.enum as string[];
    const dflt = S.properties.left_column_mask.default as string;
    expect(values.filter((v) => v !== dflt).length).toBeGreaterThan(1);
    for (const v of values.filter((x) => x !== dflt)) {
      const got = sceneDeformAdvisories(sceneWith({ v_deform: columns, left_column_mask: v as never }));
      if (v === 'factor0_lock') {
        expect(got.join('\n'), v).toMatch(/left_column_mask factor0_lock:/);
      } else if (v === 'sprite_mask') {
        // ANSWERING guard 1 IS NOT ENOUGH FOR THIS VALUE (ROADMAP row 62). It
        // silences "no policy declared" and immediately raises guard 3's own
        // refusal, because the engine refuses the declaration outright.
        expect(got.join('\n'), v).toMatch(/refuses in every scene/);
        expect(got.join('\n'), v).not.toMatch(/no left_column_mask policy/);
      } else {
        expect(got, v).toEqual([]);
      }
    }
    // …and the default spelled explicitly is still "no policy".
    expect(sceneDeformAdvisories(sceneWith({ v_deform: columns, left_column_mask: dflt as never })).join('\n'))
      .toMatch(/no left_column_mask policy/);
  });

  it('a left_column_mask policy with no per-column V deform to adjudicate', () => {
    const a = sceneDeformAdvisories(sceneWith({ left_column_mask: 'accept' })).join('\n');
    expect(a).toMatch(/attaches no per-column V deform/);
    expect(a).toMatch(/the build refuses it/);
  });

  it('sprite_mask that ARRIVED in the file is advised, not only disabled in the picker', () => {
    // ROADMAP row 62. The disabled `<option>` protects the PICKER; it protects
    // nothing about a document that already holds the value — a hand-edited
    // file, a scene copied from elsewhere, an MCP write. Before this arm, that
    // document produced `(none)` here while the build went rc=1 with
    // "left_column_mask: SpriteMask is declared, but the engine's left-column
    // strip emission has NOT landed" (measured, not read: guard-surface-gaps §2).
    const carried = sceneWith({ v_deform: columns, left_column_mask: 'sprite_mask' });
    const a = sceneDeformAdvisories(carried).join('\n');
    expect(a).toMatch(/sprite_mask/);
    expect(a).toMatch(/refuses in every scene/);
    // It must point at the two values that ARE answers, or the advisory states a
    // problem with no remedy — the row-58 trap ("set it by hand") one field over.
    expect(a).toMatch(/factor0_lock/);
    expect(a).toMatch(/accept/);

    // UNCONDITIONAL, because the engine's ensure is: :1354 fires on the
    // declaration alone. Without `v_deform` the scene reads BOTH this and guard
    // 2's advisory — both true, both cleared by one edit.
    const noVDeform = sceneDeformAdvisories(sceneWith({ left_column_mask: 'sprite_mask' }));
    expect(noVDeform.join('\n')).toMatch(/refuses in every scene/);
    expect(noVDeform.join('\n')).toMatch(/attaches no per-column V deform/);
    expect(noVDeform.length).toBe(2);

    // AND IT IS THE VALUE THAT FIRES IT, not the mere presence of a policy: the
    // other two real answers stay silent on the identical scene. Without this
    // row the arm could be `mask !== undeclared` and still pass everything above.
    for (const other of ['accept', 'factor0_lock'] as const) {
      const s = sceneWith({ v_deform: columns, left_column_mask: other });
      expect(sceneDeformAdvisories(s).join('\n'), other).not.toMatch(/refuses in every scene/);
    }
  });

  it('a curve layer beside an anchor with LIVE deform shifts — the fourth guard-5 ensure', () => {
    // ROADMAP row 64, aeon scene_dsl.emp:1251. MEASURED before it was believed:
    // the identical document builds rc=1 with "this scene carries a curve layer
    // AND an anchor with live deform shifts (anchor dsa 3 / dsb 2 …)" while
    // `sceneDeformAdvisories` returned [] (guard-surface-gaps §3).
    const OFF = S.properties.anchor.oneOf[1].properties.at.properties.dsa.maximum;
    const withCurve = (anchor: unknown) => {
      const s = sceneWith({ anchor: anchor as never });
      s.layers[0].curve = { to: 'FACTOR_1_2' };
      return s;
    };

    const live = sceneDeformAdvisories(withCurve({ at: { channel: 0, dsa: 3, dsb: 2 } })).join('\n');
    expect(live).toMatch(/layer 0 authors a curve/);
    expect(live).toMatch(/anchor dsa 3 \/ dsb 2/);
    expect(live).toMatch(new RegExp(`${OFF} is the no-deform sentinel`));

    // ⚠ THE SENTINEL TRAP, pinned as its own row. `15` means NO DEFORM, so the
    // saturated anchor is the PERMITTED case ("an anchor split inside a curve
    // layer CONTINUES the curve", design §2) — not the extreme one. A check
    // written as "the shifts are large" would fire here and stay silent above,
    // and would agree with a build fixture that never tested it.
    expect(sceneDeformAdvisories(withCurve({ at: { channel: 0, dsa: OFF, dsb: OFF } }))).toEqual([]);

    // EITHER shift arms it — the engine ORs two tests into one flag. `dsa 15 /
    // dsb 2` is the shape the game's own ojz_act1_start already ships, so a
    // both-must-be-live check would miss the only anchor in the tree.
    for (const [dsa, dsb] of [[OFF, 2], [3, OFF]] as const) {
      expect(sceneDeformAdvisories(withCurve({ at: { channel: 0, dsa, dsb } })).join('\n'),
        `dsa ${dsa} dsb ${dsb}`).toMatch(/authors a curve/);
    }

    // BOTH HALVES ARE LOAD-BEARING — the two controls that make the pair legal
    // one at a time. These are the alternative green-paths: without them the arm
    // could be "there is an anchor" or "there is a curve" and pass everything above.
    expect(sceneDeformAdvisories(sceneWith({ anchor: { at: { channel: 0, dsa: 3, dsb: 2 } } })))
      .toEqual([]);                                   // live anchor, NO curve
    const curveOnly = sceneWith({});
    curveOnly.layers[0].curve = { to: 'FACTOR_1_2' };
    expect(sceneDeformAdvisories(curveOnly)).toEqual([]);   // curve, NO anchor
    expect(sceneDeformAdvisories(withCurve('none'))).toEqual([]);  // curve, anchor "none"

    // The curve may be on ANY strip — the anchor writes into every strip below
    // the split, so a scan that only looked at layer 0 would miss the real case.
    const deep = sceneWith({ anchor: { at: { channel: 0, dsa: 3, dsb: 2 } } });
    deep.layers.push({ world_y: 64, fa: 'FACTOR_1', fb: 'FACTOR_1', curve: { to: 'FACTOR_1_2' } });
    expect(sceneDeformAdvisories(deep).join('\n')).toMatch(/layer 1 authors a curve/);

    // And it is ADVICE: the document still serializes.
    expect(() => serializeEffectsScene(withCurve({ at: { channel: 0, dsa: 3, dsb: 2 } }))).not.toThrow();
  });

  it('the anchor sentinel is read from the ANCHOR schema, not a layer deform bound', () => {
    // The two are 15 today and that agreement is held in place by nothing —
    // different $defs, amendable apart. This row fails the moment the constant
    // is re-derived from the wrong place, which is invisible while they agree.
    const anchorMax = S.properties.anchor.oneOf[1].properties.at.properties.dsa.maximum;
    expect(EFFECTS_ANCHOR_SHIFT_BOUNDS.dsa.max).toBe(anchorMax);
    expect(EFFECTS_ANCHOR_SHIFT_BOUNDS.dsb.max)
      .toBe(S.properties.anchor.oneOf[1].properties.at.properties.dsb.maximum);
    expect(EFFECTS_ANCHOR_SHIFT_BOUNDS.dsa.min)
      .toBe(S.properties.anchor.oneOf[1].properties.at.properties.dsa.minimum);
  });

  it('every advisory is ADVICE — the writer still emits each of these documents', () => {
    // The posture scene.ts states: Aurora pre-checks, sigil is the rulebook. A
    // scene Aurora warns about must still save, or the editor has become a
    // second rulebook free to refuse what the build accepts.
    const bad = sceneWith({ v_deform: columns, left_column_mask: 'accept' });
    bad.layers.push({ world_y: 64, fa: 'FACTOR_1', fb: 'FACTOR_1', vsplit: { at: 20 } });
    bad.layers[0].deform = own;
    expect(sceneDeformAdvisories(bad).length).toBeGreaterThan(0);
    expect(() => serializeEffectsScene(bad)).not.toThrow();

    // INCLUDING sprite_mask (ROADMAP row 62), which is the one the picker
    // PREVENTS. Prevention there and advice here are not in tension: the option
    // stops the value being authored, and this arm explains one that arrived.
    // Turning THIS into a refusal would reverse row 58's deliberate posture and
    // strand the author with a file the editor will not write back.
    const carried = sceneWith({ v_deform: columns, left_column_mask: 'sprite_mask' });
    expect(sceneDeformAdvisories(carried).length).toBeGreaterThan(0);
    expect(() => serializeEffectsScene(carried)).not.toThrow();
    expect(serializeEffectsScene(carried)).toContain('sprite_mask');
  });
});

// ---------------------------------------------------------------------------
// left_column_mask — the policy `v_deform` makes MANDATORY
// ---------------------------------------------------------------------------
//
// Every expectation is derived from the SCHEMA (the enum, its default) and from
// aeon's `scene_dsl.emp` guards read at source, never from a summary.
//
//   :1288 v_deform on  + undeclared -> refused   (pinned as a poison in aeon's
//                                                 own emp_expect_fail suite)
//   :1293 v_deform off + declared   -> refused
//   :1310 factor0_lock, half one: every layer's fb is FACTOR_0
//   :1347 factor0_lock, half two: no live plane-B amplitude WITH a table
//   :1354 sprite_mask -> refused outright

describe('left_column_mask — the policy, gated both ways on v_deform', () => {
  const MASK_VALUES = S.properties.left_column_mask.enum as string[];
  const MASK_DEFAULT = S.properties.left_column_mask.default as string;
  const table = { generator: 'sine' as const, amplitude: 8, period: 64 };
  const columns = { columns: { table, speed: 0, amp_shift: 0 } } as const;
  /** A scene whose every layer IS locked to FACTOR_0 — half one satisfied. */
  const lockedScene = (patch: Partial<EffectsScene> = {}): EffectsScene => ({
    ...newEffectsScene('locked'),
    layers: [
      { world_y: 0, fa: 'FACTOR_1', fb: 'FACTOR_0' },
      { world_y: 64, fa: 'FACTOR_1', fb: 'FACTOR_0' },
    ],
    ...patch,
  });

  it('the picker offers the whole schema enum, in schema order, and renders even a refused value', () => {
    const opts = leftColumnMaskOptions(lockedScene());
    expect(opts.map((o) => o.value)).toEqual(MASK_VALUES);
    // ANTI-VACUOUS: the enum really is more than a yes/no.
    expect(MASK_VALUES.length).toBeGreaterThan(3);
  });

  it('sprite_mask is rendered but NOT selectable, with the engine\'s own reason', () => {
    // The schema admits it (`enum` above) and the engine refuses it outright —
    // a live schema-vs-engine divergence, so the option must EXIST (a file can
    // carry it and a select with no matching option silently shows another
    // value) and must not be pickable.
    const sprite = leftColumnMaskOptions(lockedScene()).find((o) => o.value === 'sprite_mask')!;
    expect(MASK_VALUES).toContain('sprite_mask');
    expect(sprite.disabled).toBe(true);
    expect(sprite.title).toMatch(/strip emission has not landed/);
    // …and it is the ONLY disabled one. `factor0_lock` stays selectable even
    // when its precondition fails — see the provider's design-fork banner: an
    // editor that refuses what the build accepts is the worse failure, and
    // Aurora's factor0_lock test is deliberately stricter than the engine's.
    const disabled = leftColumnMaskOptions(sceneWith({})).filter((o) => o.disabled);
    expect(disabled.map((o) => o.value)).toEqual(['sprite_mask']);
  });

  it('accept is presented as a real answer, not a fallback', () => {
    const accept = leftColumnMaskOptions(lockedScene()).find((o) => o.value === 'accept')!;
    expect(accept.disabled).toBe(false);
    expect(accept.title).toMatch(/Rocking and Perspective/);
  });

  // ── factor0_lock, half one (scene_dsl.emp:1310) ─────────────────────────
  it('factor0_lock: available only when EVERY layer\'s fb is FACTOR_0', () => {
    expect(factor0LockRefusal(lockedScene())).toBeNull();
    // ONE layer out of two breaks it, and the refusal names WHICH.
    const one = lockedScene();
    one.layers[1] = { world_y: 64, fa: 'FACTOR_1', fb: 'FACTOR_1_16' };
    const why = factor0LockRefusal(one);
    expect(why).toMatch(/layer 1's Plane B factor is FACTOR_1_16/);
    expect(why).toMatch(/not FACTOR_0/);
    // DISCRIMINATION: it is the SECOND layer, so a check that only looked at
    // layer 0 — or at "some layer is FACTOR_0" instead of "every layer is" —
    // would still be reporting available here.
    expect(factor0LockRefusal({ ...one, layers: [one.layers[0]] })).toBeNull();
    // A DISABLED layer still counts: the engine's scan is over 0..count and
    // does not consult `enabled`, because a dormant band inherits the previous
    // band's scroll words and can still reach the hardware.
    const dormant = lockedScene();
    dormant.layers[1] = { world_y: 64, fa: 'FACTOR_1', fb: 'FACTOR_1_2', enabled: false };
    expect(factor0LockRefusal(dormant)).toMatch(/layer 1/);
  });

  it('factor0_lock: a CUSTOM PACKED fb is refused because Aurora cannot prove it, and says so', () => {
    // The one place Aurora is deliberately STRICTER than the engine. `$0FF` is
    // {s1:15, s2:15, op:0} under the engine's 9-bit encoding, so the engine
    // WOULD accept this scene — Aurora has no packer and will not grow a second
    // copy of that encoding, so it refuses in the safe direction and the
    // refusal names the reason rather than pretending the factor is something
    // else. If this behaviour ever changes, THIS is the assertion to change.
    const packed = lockedScene();
    packed.layers[1] = { world_y: 64, fa: 'FACTOR_1', fb: { s1: 15, s2: 15, op: 0 } };
    const why = factor0LockRefusal(packed);
    expect(why).toMatch(/Aurora cannot prove it is locked/);
    expect(why).toMatch(/layer 1/);
  });

  // ── factor0_lock, half two (scene_dsl.emp:1347) ─────────────────────────
  it('factor0_lock: a live plane-B amplitude WITH a table that can reach the plane', () => {
    const off = S.$defs.layer.properties.dsb.default as number;
    // AMPLITUDE ALONE IS NOT ENOUGH — the engine ANDs the two halves, and a
    // check that fired on either would refuse this scene, which the build
    // accepts. This is the row that keeps the conjunction honest.
    const ampOnly = lockedScene();
    ampOnly.layers[0] = { ...ampOnly.layers[0], dsb: 0 };
    expect(factor0LockRefusal(ampOnly)).toBeNull();
    // A TABLE ALONE IS NOT ENOUGH EITHER.
    expect(factor0LockRefusal(lockedScene({ deform_bg: { shared: { table, speed: 0 } } }))).toBeNull();
    // BOTH: refused.
    const both = lockedScene({ deform_bg: { shared: { table, speed: 0 } } });
    both.layers[0] = { ...both.layers[0], dsb: 0 };
    expect(factor0LockRefusal(both)).toMatch(/layer 0 has a live Plane B deform amplitude/);
    // AN own() TABLE IS BOTH HALVES AT ONCE — it serves both planes, and its
    // shift_b IS that layer's dsb (layer() folds it). A check that read
    // `layer.dsb` alone would miss every own() layer, which is most of what
    // this parcel made authorable.
    const own = lockedScene();
    own.layers[1] = {
      world_y: 64, fa: 'FACTOR_1', fb: 'FACTOR_0',
      deform: { own: { table, shift_a: off, shift_b: 0, phase: 0, speed: 0 } },
    };
    expect(factor0LockRefusal(own)).toMatch(/layer 1 has a live Plane B deform amplitude/);
    // …and an own() table at the NO-SAMPLE sentinel is a table with no
    // amplitude, so the claim survives. This is exactly the state
    // `layerDeformFromToggle` seeds, so turning a strip's deform on does not
    // silently invalidate a factor0_lock claim.
    const silent = lockedScene();
    silent.layers[1] = {
      world_y: 64, fa: 'FACTOR_1', fb: 'FACTOR_0',
      deform: { own: { table, shift_a: off, shift_b: off, phase: 0, speed: 0 } },
    };
    expect(factor0LockRefusal(silent)).toBeNull();
    // THE ANCHOR'S dsb counts too, and Aurora has no anchor control — so this
    // arm is only reachable from a hand-authored file, which is when it matters.
    const anchored = lockedScene({
      deform_bg: { shared: { table, speed: 0 } },
      anchor: { at: { channel: 0, dsa: off, dsb: 2 } },
    });
    expect(factor0LockRefusal(anchored)).toMatch(/the anchor has a live Plane B deform amplitude/);
  });

  it('the advisory fires only when the scene DECLARES factor0_lock', () => {
    const bad = sceneWith({ v_deform: columns, left_column_mask: 'factor0_lock' });
    expect(leftColumnMaskAdvisory(bad)).toMatch(/left_column_mask factor0_lock:/);
    // The same unsupportable scene, declaring something else: no advisory.
    expect(leftColumnMaskAdvisory(sceneWith({ v_deform: columns, left_column_mask: 'accept' }))).toBeNull();
    // …and a scene that CAN make the claim, declaring it: no advisory.
    expect(leftColumnMaskAdvisory(lockedScene({ v_deform: columns, left_column_mask: 'factor0_lock' })))
      .toBeNull();
  });

  // ── the mutual gate (scene_dsl.emp:1288 / :1293) ────────────────────────
  it('the row is visible when there is a V deform — or when a stale policy needs clearing', () => {
    expect(leftColumnMaskRowVisible(newEffectsScene('plain'))).toBe(false);
    expect(leftColumnMaskRowVisible(sceneWith({ v_deform: columns }))).toBe(true);
    // The build-refused state a hand-edited file can reach: policy, no subject.
    // Hiding the row here would leave the advisory with no control to act on.
    expect(leftColumnMaskRowVisible(sceneWith({ left_column_mask: 'accept' }))).toBe(true);
    // The default spelled out is still "no policy", so still hidden.
    expect(leftColumnMaskRowVisible(sceneWith({ left_column_mask: MASK_DEFAULT as never }))).toBe(false);
  });

  it('turning V deform OFF clears the policy WITH it, in one command', () => {
    const lib = library([sceneWith({ v_deform: columns, left_column_mask: 'accept' })]);
    const cmd = vDeformToggleCommand(lib, 'deform_probe', false);
    expect('v_deform' in cmd!.newScene!).toBe(false);
    expect('left_column_mask' in cmd!.newScene!).toBe(false);
    // ONE command — so ONE undo step puts BOTH back. A toggle that cleared only
    // v_deform would leave the document in a state the build refuses, for the
    // author having done nothing but turn a feature off.
    expect(cmd!.oldScene!.v_deform).toEqual(columns);
    expect(cmd!.oldScene!.left_column_mask).toBe('accept');
    // Turning it ON seeds NO policy: which one is an engine-visible claim about
    // the scene, and Aurora does not answer it for the author.
    const on = vDeformToggleCommand(library([newEffectsScene('s')]), 's', true);
    expect(on!.newScene!.v_deform).toHaveProperty('columns');
    expect('left_column_mask' in on!.newScene!).toBe(false);
  });

  it('the policy command clears to the schema default and leaves an explicit one as spelled', () => {
    const lib = library([sceneWith({ v_deform: columns, left_column_mask: 'accept' })]);
    expect('left_column_mask' in leftColumnMaskCommand(lib, 'deform_probe', MASK_DEFAULT)!.newScene!)
      .toBe(false);
    expect(leftColumnMaskCommand(lib, 'deform_probe', 'accept')).toBeNull();  // no-op
    // A file that SPELLS the default keeps its spelling — the general rule the
    // key-defaults map replaced the "none"-only one for. `left_column_mask`'s
    // absent spelling is "undeclared", which a rule keyed on the word "none"
    // would have silently rewritten away.
    const spelled = library([sceneWith({ left_column_mask: MASK_DEFAULT as never })]);
    expect(leftColumnMaskCommand(spelled, 'deform_probe', MASK_DEFAULT)).toBeNull();
    expect(MASK_DEFAULT).not.toBe('none');
  });

  it('curve and deform on one strip is advised — two controls four rows apart on one card', () => {
    const off = S.$defs.layer.properties.dsb.default as number;
    const plain: EffectsLayer = { world_y: 0, fa: 'FACTOR_1', fb: 'FACTOR_1' };
    expect(layerCurveDeformAdvisory(plain)).toBeNull();
    expect(layerCurveDeformAdvisory({ ...plain, curve: { to: 'FACTOR_1_2' } })).toBeNull();
    expect(layerCurveDeformAdvisory({
      ...plain, deform: { own: { table, shift_a: off, shift_b: 0, phase: 0, speed: 0 } },
    })).toBeNull();
    // Both: refused by the engine twice over (layer() guards 1 and 2).
    expect(layerCurveDeformAdvisory({
      ...plain, curve: { to: 'FACTOR_1_2' },
      deform: { own: { table, shift_a: off, shift_b: 0, phase: 0, speed: 0 } },
    })).toMatch(/both a curve and its own deform table/);
    // …and the amplitude-only arm, which the card cannot author but a file can.
    expect(layerCurveDeformAdvisory({ ...plain, curve: { to: 'FACTOR_1_2' }, dsb: 3 }))
      .toMatch(/a curve and a live deform amplitude \(dsa 15 \/ dsb 3;/);
    // An own() at the seed (both shifts silent) still trips guard 2 — the
    // engine refuses the ATTACHMENT, not just the amplitude.
    expect(layerCurveDeformAdvisory({
      ...plain, curve: { to: 'FACTOR_1_2' },
      deform: { own: { table, shift_a: off, shift_b: off, phase: 0, speed: 0 } },
    })).toMatch(/both a curve and its own deform table/);
  });

  it('every one of these is ADVICE — the writer still emits each document', () => {
    const bad = sceneWith({ v_deform: columns, left_column_mask: 'factor0_lock' });
    bad.layers[0] = {
      ...bad.layers[0], curve: { to: 'FACTOR_1_2' },
      deform: { own: { table, shift_a: 0, shift_b: 0, phase: 0, speed: 0 } },
    };
    expect(sceneDeformAdvisories(bad).length).toBeGreaterThan(0);
    expect(layerCurveDeformAdvisory(bad.layers[0])).not.toBeNull();
    expect(() => serializeEffectsScene(bad)).not.toThrow();
  });
});

describe('the deform rows say what they are, inside the column', () => {
  it('every row names its key in the title and fits the label column', () => {
    const rows = [
      SCENE_DEFORM_ROWS.deform_fg, SCENE_DEFORM_ROWS.deform_bg, V_DEFORM_ROW, LAYER_DEFORM_ROW,
    ];
    for (const r of rows) {
      expect(r.title, r.label).toMatch(new RegExp(`^${r.key}`));
      expect(Math.max(...r.label.split(/\s+/).map((t) => t.length)), r.label).toBeLessThanOrEqual(10);
    }
    // The two plane rows are the SAME shape pointed at two planes and must not
    // have drifted into two descriptions.
    expect(SCENE_DEFORM_ROWS.deform_fg.title.replace(/Plane A/, 'Plane B').replace(/_fg/, '_bg'))
      .toBe(SCENE_DEFORM_ROWS.deform_bg.title);
  });
});
