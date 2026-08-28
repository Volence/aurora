// Parcel H — `curve` and `vsplit` become EDITABLE, and the codec must keep
// doing what §6 hazard 1 demands of it while they are: round-trip what it does
// not edit, and never write a `"none"` where absence was.
//
// Every expectation is derived from the schema JSON or the codec, never typed
// beside it: the "none" spelling and the `at` bounds are read out of
// `$defs.layer.properties.{curve,vsplit}`.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  parseEffectsScene, serializeEffectsScene, type EffectsScene, type EffectsSceneLibrary,
} from '../../src/core/formats/effects/scene';
import { EFFECTS_VSPLIT_AT_BOUNDS } from '../../src/core/formats/effects/scene-ui';
import { setLayerFieldCommand, clampVSplitAt } from '../../src/renderer/providers/effects-aeon';
import { EditHistory } from '../../src/core/editing/history';
import type { S4Level } from '../../src/core/editing/commands';
import rawSchema from '../../src/core/formats/effects/aurora-effects-scene.schema.json';

const S = rawSchema as unknown as Record<string, any>;
const LAYER_PROPS = S.$defs.layer.properties as Record<string, any>;
const NONE = LAYER_PROPS.curve.oneOf[0].const as string; // "none"
const AT = LAYER_PROPS.vsplit.oneOf[1].properties.at as { minimum: number; maximum: number };

function library(scenes: EffectsScene[]): EffectsSceneLibrary {
  return { scenes, unreadable: [], notices: [] };
}

/** A scene that never had the keys, plus one layer spelling both as explicit "none". */
function scene(): EffectsScene {
  return {
    id: 'ramp', schema: 1, v_factor: 15,
    layers: [
      { world_y: 0, fa: 'FACTOR_1', fb: 'FACTOR_1_16' },
      { world_y: 64, fa: 'FACTOR_1', fb: 'FACTOR_1_8', curve: NONE as 'none', vsplit: NONE as 'none' },
    ],
  };
}

const roundTrip = (s: EffectsScene) => parseEffectsScene(serializeEffectsScene(s), s.id);

describe('the vsplit bound comes from the schema', () => {
  it('EFFECTS_VSPLIT_AT_BOUNDS is $defs.layer.properties.vsplit.oneOf[1].properties.at', () => {
    expect(EFFECTS_VSPLIT_AT_BOUNDS).toEqual({ min: AT.minimum, max: AT.maximum });
    // The engine's guard is `split_off >= 0 && split_off < 512` (scene_dsl.emp,
    // layer()); the schema transcribes it as 0..511. Anti-vacuous.
    expect(AT.maximum).toBe(511);
  });

  it('clampVSplitAt holds a typed value inside it and rounds', () => {
    expect(clampVSplitAt(-1)).toBe(AT.minimum);
    expect(clampVSplitAt(AT.maximum + 1)).toBe(AT.maximum);
    expect(clampVSplitAt(20.4)).toBe(20);
    expect(clampVSplitAt(NaN)).toBe(AT.minimum);
  });
});

describe('setLayerFieldCommand: curve and vsplit, set and cleared', () => {
  it('sets curve.to and vsplit.at, and the codec round-trips both', () => {
    const lib = library([scene()]);
    const c1 = setLayerFieldCommand(lib, 'ramp', 0, 'curve', { to: 'FACTOR_3_8' });
    expect(c1).not.toBeNull();
    expect(c1!.newScene!.layers[0].curve).toEqual({ to: 'FACTOR_3_8' });
    const c2 = setLayerFieldCommand(library([c1!.newScene!]), 'ramp', 0, 'vsplit', { at: 20 });
    expect(c2).not.toBeNull();
    const back = roundTrip(c2!.newScene!);
    expect(back.layers[0].curve).toEqual({ to: 'FACTOR_3_8' });
    expect(back.layers[0].vsplit).toEqual({ at: 20 });
    // A packed far end is a factor too (§2.3), and survives the trip.
    const c3 = setLayerFieldCommand(library([back]), 'ramp', 0, 'curve', { to: { s1: 2, s2: 4, op: 1 } });
    expect(roundTrip(c3!.newScene!).layers[0].curve).toEqual({ to: { s1: 2, s2: 4, op: 1 } });
  });

  it('clearing DELETES the key — absence is the schema default, so no "none" is written', () => {
    const set = setLayerFieldCommand(library([scene()]), 'ramp', 0, 'curve', { to: 'FACTOR_1' })!;
    const cleared = setLayerFieldCommand(library([set.newScene!]), 'ramp', 0, 'curve', undefined);
    expect(cleared).not.toBeNull();
    expect(cleared!.newScene!.layers[0]).not.toHaveProperty('curve');
    // (Layer 1 spells an explicit "none" on purpose, so the check is per layer.)
    const text = serializeEffectsScene(cleared!.newScene!);
    expect(JSON.parse(text).layers[0]).not.toHaveProperty('curve');
    expect(JSON.parse(text).layers[1]).toHaveProperty('curve', NONE);
    // Same for vsplit.
    const setV = setLayerFieldCommand(library([scene()]), 'ramp', 0, 'vsplit', { at: 44 })!;
    const clearedV = setLayerFieldCommand(library([setV.newScene!]), 'ramp', 0, 'vsplit', undefined)!;
    expect(JSON.parse(serializeEffectsScene(clearedV.newScene!)).layers[0]).not.toHaveProperty('vsplit');
  });

  it('clearing a layer that never had the key is a no-op — no undo slot', () => {
    const lib = library([scene()]);
    expect(setLayerFieldCommand(lib, 'ramp', 0, 'curve', undefined)).toBeNull();
    expect(setLayerFieldCommand(lib, 'ramp', 0, 'vsplit', undefined)).toBeNull();
  });

  it('clearing a layer spelled with an explicit "none" is ALSO a no-op — the spelling on disk is kept', () => {
    const lib = library([scene()]);
    expect(setLayerFieldCommand(lib, 'ramp', 1, 'curve', undefined)).toBeNull();
    expect(setLayerFieldCommand(lib, 'ramp', 1, 'vsplit', undefined)).toBeNull();
    // ...and the explicit "none" survives a write untouched.
    const text = serializeEffectsScene(lib.scenes[0]);
    expect(JSON.parse(text).layers[1]).toMatchObject({ curve: NONE, vsplit: NONE });
    expect(JSON.parse(text).layers[0]).not.toHaveProperty('curve');
  });

  it('setting the same value again is a no-op', () => {
    const set = setLayerFieldCommand(library([scene()]), 'ramp', 0, 'vsplit', { at: 20 })!;
    expect(setLayerFieldCommand(library([set.newScene!]), 'ramp', 0, 'vsplit', { at: 20 })).toBeNull();
    expect(setLayerFieldCommand(library([set.newScene!]), 'ramp', 0, 'curve', undefined)).toBeNull();
  });

  it('undo restores the exact prior document, including an untouched sibling layer', () => {
    const lib = library([scene()]);
    const before = serializeEffectsScene(lib.scenes[0]);
    const h = new EditHistory();
    const level = { sections: [], effectsScenes: lib } as unknown as S4Level;
    h.execute(setLayerFieldCommand(lib, 'ramp', 0, 'curve', { to: 'FACTOR_1_2' })!, level);
    h.execute(setLayerFieldCommand(lib, 'ramp', 0, 'vsplit', { at: 100 })!, level);
    expect(lib.scenes[0].layers[0].curve).toEqual({ to: 'FACTOR_1_2' });
    // The sibling with explicit "none" was never edited and never re-spelled.
    expect(lib.scenes[0].layers[1]).toMatchObject({ curve: NONE, vsplit: NONE });
    h.undo(level); h.undo(level);
    expect(serializeEffectsScene(lib.scenes[0])).toBe(before);
    h.redo(level);
    expect(lib.scenes[0].layers[0].curve).toEqual({ to: 'FACTOR_1_2' });
    expect(lib.scenes[0].layers[0]).not.toHaveProperty('vsplit');
  });
});

// Row H's golden: the shipped curved-horizon scene, parse→serialize byte-stable
// before and after an edit + undo.
//
// THIS READS A FIXTURE INSIDE THIS REPO, AND THAT IS THE POINT. Until 2026-08-28
// it read `/home/volence/sonic_hacks/aeon/games/.../ojz_act1_depth.json` — the
// aeon lane's LIVE WORKING TREE — so it compared Aurora's serializer against a
// peer's uncommitted edits and flipped green/red as they typed. It could never
// have detected drift, because it had no fixed thing to drift from. The property
// under test is a property of AURORA'S CODEC over a real shipped document, so
// the correct instrument is a document committed HERE, vendored at a named aeon
// revision (see `ojz_act1_depth.provenance.json` beside it). The separate
// question — "is that pin still what aeon ships?" — a pinned blob cannot answer
// and is NOT asked here; it lives in `aeon-fixture-currency.test.ts`, which
// reads aeon's origin/master through git objects. Precedent and reasoning:
// docs/reviews/2026-08-28-golden-live-tree.md.
//
// EXACT bytes, no "modulo one byte": empyrean e1ebd20 §8 ruled the canonical
// file form — exactly one `\n` after the closing brace — so the writer now
// produces the shipped file as-is and this pin compares whole files.
const SHIPPED = resolve(__dirname, '../fixtures/effects/ojz_act1_depth.json');

describe('ojz_act1_depth.json round-trip golden (triage §B row H)', () => {
  it('is byte-stable through parse→serialize, and again after an edit and its undo', () => {
    // No existsSync guard and no skip: this fixture is committed to this repo,
    // so its absence is a broken checkout and must be a hard, noisy failure.
    const bytes = readFileSync(SHIPPED, 'utf8');
    // Anti-vacuous: the shipped file really carries the ruled terminator, once.
    expect(bytes.endsWith('}\n')).toBe(true);
    expect(bytes.endsWith('\n\n')).toBe(false);
    const parsed = parseEffectsScene(bytes, 'ojz_act1_depth');
    expect(serializeEffectsScene(parsed)).toBe(bytes);

    const curved = parsed.layers.findIndex((l) => l.curve !== undefined && l.curve !== 'none');
    expect(curved, 'the shipped scene carries a curve').toBeGreaterThan(-1);
    // Anti-vacuous, and it is the row the 2026-08-28 failure needed: the edit
    // below CLEARS a vsplit, which is a no-op returning null when the layer has
    // none. Assert the precondition here so a re-vendored fixture that lost the
    // key says WHICH property went missing, instead of throwing a TypeError out
    // of EditHistory two lines later (that is exactly how the live-tree read
    // presented, and three readers called it "pre-existing, unrelated").
    expect(parsed.layers[curved].vsplit, 'the curved layer carries a vsplit to clear')
      .toEqual({ at: expect.any(Number) });
    const lib = library([parsed]);
    const h = new EditHistory();
    const level = { sections: [], effectsScenes: lib } as unknown as S4Level;
    h.execute(setLayerFieldCommand(lib, 'ojz_act1_depth', curved, 'curve', { to: 'FACTOR_7_8' })!, level);
    h.execute(setLayerFieldCommand(lib, 'ojz_act1_depth', curved, 'vsplit', undefined)!, level);
    expect(serializeEffectsScene(lib.scenes[0])).not.toBe(bytes);
    h.undo(level); h.undo(level);
    expect(serializeEffectsScene(lib.scenes[0])).toBe(bytes);
  });
});
