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
} from '../effects-aeon';
import {
  EFFECTS_FACTOR_NAMES, EFFECTS_LAYER_COUNT, EFFECTS_PACKED_FACTOR_BOUNDS,
  EFFECTS_WORLD_Y_BOUNDS, newEffectsScene,
} from '../../../core/formats/effects/scene-ui';
import {
  serializeEffectsScene, parseEffectsScene, EFFECTS_LAYER_DEFAULTS,
  type EffectsScene, type EffectsSceneLibrary, type EffectsLayer,
} from '../../../core/formats/effects/scene';
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

  it('names dsa/dsb/phase, disabled, deform, curve and vsplit, in schema key order', () => {
    const layer: EffectsLayer = {
      ...baseLayer(), dsa: 3, dsb: 4, phase: 9, enabled: false,
      deform: { own: { table: { generator: 'sine', amplitude: 8, period: 64 }, shift_a: 1, shift_b: 2, phase: 0, speed: 1 } },
      curve: { to: { s1: 2, s2: 4, op: 1 } },
      vsplit: { at: 112 },
    };
    const extras = layerExtras(layer);
    expect(extras.map((e) => e.key)).toEqual(['dsa', 'dsb', 'phase', 'enabled', 'deform', 'curve', 'vsplit']);
    expect(extras.map((e) => e.text)).toEqual([
      'dsa 3', 'dsb 4', 'phase 9', 'disabled',
      'deform: own sine(8, 64)',
      'curve → packed(2, 4, -)',
      'vsplit at 112',
    ]);
    expect(layerExtrasLine(layer)).toBe(extras.map((e) => e.text).join(' · '));
  });

  it('spells every table form the codec knows', () => {
    const own = (table: any): EffectsLayer =>
      ({ ...baseLayer(), deform: { own: { table, shift_a: 15, shift_b: 15, phase: 0, speed: 0 } } });
    expect(layerExtrasLine(own({ generator: 'triangle', amplitude: 4, period: 32 }))).toBe('deform: own triangle(4, 32)');
    expect(layerExtrasLine(own({ generator: 'zero' }))).toBe('deform: own zero');
    expect(layerExtrasLine(own({ generator: 'v_column_perspective', focal: 96, max_offset: 12 })))
      .toBe('deform: own v_column_perspective(96, 12)');
    expect(layerExtrasLine(own({ generator: 'v_column_floor', center: 100, max_offset: 6 })))
      .toBe('deform: own v_column_floor(100, 6)');
    expect(layerExtrasLine(own({ bin: 'tables/canopy.bin' }))).toBe('deform: own tables/canopy.bin');
  });

  it('explicit "none" and enabled:true are defaults, not extras', () => {
    expect(layerExtras({ ...baseLayer(), curve: 'none', vsplit: 'none', deform: 'none', enabled: true })).toEqual([]);
  });

  // The shipped scene, from the aeon tree. Expectations are re-derived from the
  // file's own JSON so a re-authored fixture cannot leave a stale pin green.
  const SHIPPED = '/home/volence/sonic_hacks/aeon/games/sonic4/data/editor/effects/ojz_act1_depth.json';
  it('every layer of the shipped ojz_act1_depth.json — the curved layers show curve + vsplit, the flat ones nothing', (ctx) => {
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
      if (r.deform !== undefined && r.deform !== 'none') want.push(expect.stringMatching(/^deform: own /));
      if (r.curve !== undefined && r.curve !== 'none') { want.push(`curve → ${r.curve.to}`); withCurve++; }
      if (r.vsplit !== undefined && r.vsplit !== 'none') want.push(`vsplit at ${r.vsplit.at}`);
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
  });
});
