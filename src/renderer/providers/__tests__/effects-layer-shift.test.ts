// A LAYER's `dsa`/`dsb` - the two ladders and the writer, checked without React.
//
// WHAT THIS FILE IS REALLY FOR. The keys it authors have a TOP-OF-RANGE
// SENTINEL: 0..15 where **15 means the plane does not move**, so a control that
// clamps toward its maximum authors the exact opposite of what the gesture asked
// for, and the document validates, builds and renders flat. Every row is either
// about that inversion or about the thing that makes this pair different from
// the anchor's - a layer's shifts are OPTIONAL with `default: 15`, so "off" has
// two spellings on disk and the writer has to choose between them per document
// rather than once.
//
// Expectations are derived from `EFFECTS_LAYER_SHIFT_*`, themselves derived from
// the schema, so a contract amendment moves both sides together; where a row
// needs something the schema cannot say, it walks the raw schema by hand and
// never a number typed here.

import { describe, it, expect } from 'vitest';
import {
  LAYER_SHIFT_ROW, layerShiftOptions, layerShiftLadder, layerShiftValue,
  layerShiftIsSpelled, setLayerShiftCommand, layerShiftAdvisories,
  layerExtrasLine, layerCurveDeformAdvisory,
  type LayerShiftField,
} from '../effects-aeon';
import {
  EFFECTS_LAYER_SHIFT_BOUNDS, EFFECTS_LAYER_SHIFT_NONE, newEffectsScene,
} from '../../../core/formats/effects/scene-ui';
import {
  parseEffectsScene, serializeEffectsScene,
  type EffectsScene, type EffectsSceneLibrary,
} from '../../../core/formats/effects/scene';
import rawSchema from '../../../core/formats/effects/aurora-effects-scene.schema.json';

const S = rawSchema as unknown as Record<string, any>;
const FIELDS: readonly LayerShiftField[] = ['dsa', 'dsb'];

function library(scenes: EffectsScene[]): EffectsSceneLibrary {
  return { scenes, unreadable: [], notices: [], loadedPaths: [] };
}

function applied(cmd: ReturnType<typeof setLayerShiftCommand>): EffectsScene {
  expect(cmd, 'the command was null - nothing was authored').not.toBeNull();
  const next = cmd!.newScene;
  expect(next, 'the command carries no document').not.toBeNull();
  return next!;
}

/** A one-layer scene, with whatever layer keys a row needs. */
function sceneWith(layer: Record<string, unknown> = {}): EffectsScene {
  const s = newEffectsScene('probe');
  Object.assign(s.layers[0], layer);
  return s;
}

/** What lands on DISK, which is the only claim that matters to the build. */
function onDisk(scene: EffectsScene): Record<string, any> {
  return JSON.parse(serializeEffectsScene(scene));
}

// ---------------------------------------------------------------------------
// The ladder
// ---------------------------------------------------------------------------

describe('a layer deform ladder never offers the sentinel as a rung', () => {
  it('spans exactly the schema range, once per value', () => {
    for (const field of FIELDS) {
      const { min, max } = EFFECTS_LAYER_SHIFT_BOUNDS[field];
      const shifts = layerShiftOptions(field).map((o) => o.shift);
      expect(shifts.slice().sort((a, b) => a - b), field)
        .toEqual(Array.from({ length: max - min + 1 }, (_, i) => min + i));
    }
  });

  it('EXCLUDES the sentinel from the live rungs, and names it exactly once', () => {
    for (const field of FIELDS) {
      const opts = layerShiftOptions(field);
      const off = opts.filter((o) => o.off);
      expect(off.length, `${field}: off must be named exactly once`).toBe(1);
      expect(off[0].shift, field).toBe(EFFECTS_LAYER_SHIFT_NONE);
      // THE ROW THIS FILE EXISTS FOR: no live rung carries the sentinel.
      expect(layerShiftLadder(field).map((o) => o.shift), field)
        .not.toContain(EFFECTS_LAYER_SHIFT_NONE);
    }
  });

  it('labels off for what it DOES and never for the number it means', () => {
    for (const field of FIELDS) {
      const off = layerShiftOptions(field).find((o) => o.off)!;
      expect(off.label, field).toMatch(/off/i);
      // The number lives in the title, not the label - a label reading "15"
      // beside a list of divisors is the inversion made visible to nobody.
      expect(off.label, field).not.toMatch(new RegExp(`\\b${EFFECTS_LAYER_SHIFT_NONE}\\b`));
      expect(off.title, field).toMatch(new RegExp(`\\b${EFFECTS_LAYER_SHIFT_NONE}\\b`));
      // ANTI-VACUOUS: the live rungs are NOT labelled off, so this row is
      // distinguishing two things that really differ on screen.
      for (const rung of layerShiftLadder(field)) {
        expect(rung.label, `${field} rung ${rung.shift}`).not.toMatch(/off/i);
      }
    }
  });

  it('runs LEAST MOTION FIRST, so off sits beside the quietest rung and opposite the loudest', () => {
    for (const field of FIELDS) {
      const { min } = EFFECTS_LAYER_SHIFT_BOUNDS[field];
      const opts = layerShiftOptions(field);
      expect(opts[0].off, field).toBe(true);
      // After the off entry the shift DESCENDS, which is motion ascending.
      const rungs = opts.slice(1).map((o) => o.shift);
      expect(rungs, field).toEqual([...rungs].sort((a, b) => b - a));
      expect(rungs[rungs.length - 1], field).toBe(min);
      // The loudest setting is the LAST option - the farthest place on the list
      // from off, so no drag crosses from one to the other.
      expect(opts[opts.length - 1].shift, field).toBe(min);
      expect(opts[opts.length - 1].off, field).toBe(false);
    }
  });
});

// ---------------------------------------------------------------------------
// The two directions the parcel exists to prove
// ---------------------------------------------------------------------------

describe('driving a ladder to its extreme, and choosing off', () => {
  it('DRIVEN TO THE EXTREME authors the LOUDEST shift and never the sentinel', () => {
    for (const field of FIELDS) {
      const opts = layerShiftOptions(field);
      // The two things a person can do to a <select> that means "as much as
      // this offers": take the last option, or take the loudest label.
      for (const chosen of [opts[opts.length - 1], opts.reduce((a, b) => (b.shift < a.shift ? b : a))]) {
        expect(chosen.off, field).toBe(false);
        expect(chosen.shift, field).not.toBe(EFFECTS_LAYER_SHIFT_NONE);
        const lib = library([sceneWith()]);
        const next = applied(setLayerShiftCommand(lib, 'probe', 0, field, chosen.shift));
        expect(next.layers[0][field], field).toBe(EFFECTS_LAYER_SHIFT_BOUNDS[field].min);
        // Asserted ON DISK: the claim is what aeon's generator will read.
        expect(onDisk(next).layers[0][field], field).toBe(EFFECTS_LAYER_SHIFT_BOUNDS[field].min);
        expect(onDisk(next).layers[0][field], field).not.toBe(EFFECTS_LAYER_SHIFT_NONE);
      }
    }
  });

  it('CHOOSING OFF from a live shift really turns the plane off, and the strip survives', () => {
    for (const field of FIELDS) {
      const off = layerShiftOptions(field).find((o) => o.off)!;
      // From a LIVE shift, so the gesture is a real change and not a no-op.
      const lib = library([sceneWith({ [field]: EFFECTS_LAYER_SHIFT_BOUNDS[field].min })]);
      const next = applied(setLayerShiftCommand(lib, 'probe', 0, field, off.shift));
      // The plane is off...
      expect(layerShiftValue(next.layers[0], field), field).toBe(EFFECTS_LAYER_SHIFT_NONE);
      // ...and the STRIP is still there, still scrolling. One plane's off is not
      // the layer's off, and it is not the scene's.
      expect(next.layers.length, field).toBe(1);
      expect(onDisk(next).layers[0].world_y, field).toBe(0);
      expect(onDisk(next).layers[0].fa, field).toBeDefined();
    }
  });
});

// ---------------------------------------------------------------------------
// What OFF actually puts on disk - the decision this parcel had to make
// ---------------------------------------------------------------------------

describe('OFF preserves the document\'s own convention rather than imposing one', () => {
  it('a document that OMITS the key does not GAIN it', () => {
    for (const field of FIELDS) {
      const off = layerShiftOptions(field).find((o) => o.off)!;
      const lib = library([sceneWith({ [field]: 2 })]);
      const next = applied(setLayerShiftCommand(lib, 'probe', 0, field, off.shift));
      expect(Object.keys(onDisk(next).layers[0]), field).not.toContain(field);
      // And it reads back as off, because absent already means the sentinel.
      const reread = parseEffectsScene(serializeEffectsScene(next), 'probe');
      expect(layerShiftValue(reread.layers[0], field), field).toBe(EFFECTS_LAYER_SHIFT_NONE);
    }
  });

  it('a document that SPELLS the sentinel does not LOSE it', () => {
    for (const field of FIELDS) {
      const off = layerShiftOptions(field).find((o) => o.off)!;
      const spelled = sceneWith({ [field]: EFFECTS_LAYER_SHIFT_NONE });
      expect(layerShiftIsSpelled(spelled.layers[0], field), field).toBe(true);
      const lib = library([spelled]);
      // Choosing off on an already-off spelled field is a NO-OP: no command, so
      // no undo slot and no rewrite of the author's line.
      expect(setLayerShiftCommand(lib, 'probe', 0, field, off.shift), field).toBeNull();
      // The spelling survives a plain round trip too, which is what makes the
      // no-op meaningful rather than merely quiet.
      expect(onDisk(spelled).layers[0][field], field).toBe(EFFECTS_LAYER_SHIFT_NONE);
    }
  });

  it('a SPELLED sentinel on one field is untouched by the OTHER field being driven', () => {
    // The mixed document: aeon's convention on one plane, a live value on the
    // other. Editing one plane must not normalise the neighbour's spelling.
    const lib = library([sceneWith({ dsa: EFFECTS_LAYER_SHIFT_NONE, dsb: EFFECTS_LAYER_SHIFT_NONE })]);
    const next = applied(setLayerShiftCommand(lib, 'probe', 0, 'dsb', 1));
    const disk = onDisk(next).layers[0];
    expect(disk.dsa).toBe(EFFECTS_LAYER_SHIFT_NONE);
    expect(disk.dsb).toBe(1);
  });

  /**
   * THE ONE LOSSY EDGE, ASSERTED RATHER THAN LEFT TO PROSE.
   *
   * A file that SPELLS the sentinel, is driven to a live shift, and is then
   * taken back to off ends with the key ABSENT. The invariant this control keeps
   * is "a field nobody touched keeps its spelling", not "every byte survives
   * every round trip" - and it is exactly what curve/vsplit/deform/drift have
   * done since parcel H. Written down so a later reader meets the rule rather
   * than discovering it as a surprise diff.
   */
  it('spelled -> live -> off lands ABSENT, which is the ruled behaviour and not a bug', () => {
    const off = layerShiftOptions('dsa').find((o) => o.off)!;
    let scene = sceneWith({ dsa: EFFECTS_LAYER_SHIFT_NONE });
    scene = applied(setLayerShiftCommand(library([scene]), 'probe', 0, 'dsa', 2));
    expect(onDisk(scene).layers[0].dsa).toBe(2);
    scene = applied(setLayerShiftCommand(library([scene]), 'probe', 0, 'dsa', off.shift));
    expect(Object.keys(onDisk(scene).layers[0])).not.toContain('dsa');
    // Same MEANING either way, which is why the normalisation is acceptable.
    expect(layerShiftValue(scene.layers[0], 'dsa')).toBe(EFFECTS_LAYER_SHIFT_NONE);
  });

  it('both spellings are the same document to the contract', () => {
    // The claim the whole write rule rests on, checked against the schema rather
    // than against aeon's source, which this suite cannot read.
    expect(S.$defs.layer.properties.dsa.default).toBe(EFFECTS_LAYER_SHIFT_NONE);
    expect(S.$defs.layer.required).not.toContain('dsa');
    for (const spelling of [{}, { dsa: EFFECTS_LAYER_SHIFT_NONE }]) {
      const s = sceneWith(spelling);
      expect(() => serializeEffectsScene(s), JSON.stringify(spelling)).not.toThrow();
      expect(layerShiftValue(parseEffectsScene(serializeEffectsScene(s), 'probe').layers[0], 'dsa'))
        .toBe(EFFECTS_LAYER_SHIFT_NONE);
    }
  });
});

// ---------------------------------------------------------------------------
// The writer refuses rather than clamping
// ---------------------------------------------------------------------------

describe('setLayerShiftCommand refuses out of range and never clamps', () => {
  it('throws past EITHER end, naming the range and the sentinel', () => {
    for (const field of FIELDS) {
      const { min, max } = EFFECTS_LAYER_SHIFT_BOUNDS[field];
      for (const bad of [min - 1, max + 1, 1.5, NaN]) {
        const lib = library([sceneWith()]);
        expect(() => setLayerShiftCommand(lib, 'probe', 0, field, bad), `${field} ${bad}`)
          .toThrow(/refusing to author/);
      }
      // The message must teach the hazard, not merely the bounds: a caller that
      // reads "0..15" and clamps has been told nothing.
      const lib = library([sceneWith()]);
      expect(() => setLayerShiftCommand(lib, 'probe', 0, field, max + 1))
        .toThrow(new RegExp(`${EFFECTS_LAYER_SHIFT_NONE} is the NO-DEFORM sentinel`));
    }
  });

  it('ACCEPTS every legal value, so the refusal is a bound and not a blanket', () => {
    // ANTI-VACUOUS: without this, a function that threw on everything would pass
    // the row above.
    for (const field of FIELDS) {
      const { min, max } = EFFECTS_LAYER_SHIFT_BOUNDS[field];
      for (let v = min; v <= max; v++) {
        const lib = library([sceneWith({ [field]: v === min ? max : min })]);
        expect(() => setLayerShiftCommand(lib, 'probe', 0, field, v), `${field} ${v}`).not.toThrow();
      }
    }
  });

  it('writing the sentinel is LEGAL and is not a special case at the boundary', () => {
    // It is what the ladder's off entry does. The command must not treat it as
    // an error, only as the clear rule.
    const lib = library([sceneWith({ dsa: 0 })]);
    expect(() => setLayerShiftCommand(lib, 'probe', 0, 'dsa', EFFECTS_LAYER_SHIFT_NONE))
      .not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// What the card says about a shift that will do nothing
// ---------------------------------------------------------------------------

describe('layerShiftAdvisories - the state no build will report', () => {
  it('warns when a plane is live and the scene attaches no table it can sample', () => {
    const scene = sceneWith({ dsb: 2 });
    const msgs = layerShiftAdvisories(scene, 0);
    expect(msgs.length).toBe(1);
    expect(msgs[0]).toMatch(/dsb 2/);
    expect(msgs[0]).toMatch(/flat-paths/);
  });

  it('is SILENT when both planes are off - silence means nothing to say', () => {
    expect(layerShiftAdvisories(sceneWith(), 0)).toEqual([]);
    expect(layerShiftAdvisories(sceneWith({ dsa: EFFECTS_LAYER_SHIFT_NONE }), 0)).toEqual([]);
  });

  it('is SILENT once the plane has a table to sample', () => {
    const scene = sceneWith({ dsb: 2 });
    (scene as any).deform_bg = { shared: { table: { generator: 'sine', amplitude: 8, period: 64 }, speed: 0 } };
    expect(layerShiftAdvisories(scene, 0)).toEqual([]);
    // ANTI-VACUOUS: the FG plane still warns, so the silence above is about the
    // table and not about the function having stopped working.
    (scene.layers[0] as any).dsa = 2;
    expect(layerShiftAdvisories(scene, 0).length).toBe(1);
    expect(layerShiftAdvisories(scene, 0)[0]).toMatch(/dsa 2/);
  });

  it('says nothing about a layer index that is not there', () => {
    expect(layerShiftAdvisories(sceneWith({ dsb: 2 }), 9)).toEqual([]);
  });
});

describe('the curve clash now reads the LAYER\'s sentinel', () => {
  it('fires on a curve strip with a live plain shift', () => {
    const layer = { world_y: 0, fa: 'FACTOR_1', fb: 'FACTOR_1', curve: { to: 'FACTOR_1_2' }, dsb: 2 } as any;
    expect(layerCurveDeformAdvisory(layer)).toMatch(/curve and a live deform amplitude/);
  });

  it('is silent on a curve strip whose planes are off, spelled OR absent', () => {
    const base = { world_y: 0, fa: 'FACTOR_1', fb: 'FACTOR_1', curve: { to: 'FACTOR_1_2' } } as any;
    expect(layerCurveDeformAdvisory(base)).toBeNull();
    expect(layerCurveDeformAdvisory({
      ...base, dsa: EFFECTS_LAYER_SHIFT_NONE, dsb: EFFECTS_LAYER_SHIFT_NONE,
    })).toBeNull();
  });
});

describe('the row descriptors', () => {
  it('label the two planes without naming a number', () => {
    for (const label of [LAYER_SHIFT_ROW.planeALabel, LAYER_SHIFT_ROW.planeBLabel]) {
      expect(label).not.toMatch(/\d/);
    }
    expect(LAYER_SHIFT_ROW.planeALabel).not.toBe(LAYER_SHIFT_ROW.planeBLabel);
  });

  it('do not duplicate the read-only extras line', () => {
    // dsa/dsb left that line when they got these controls; asserted here as
    // well as in the extras suite because the duplication is what a reader of
    // THIS parcel would reintroduce.
    expect(layerExtrasLine(sceneWith({ dsa: 1, dsb: 2 }).layers[0])).toBeNull();
  });
});
