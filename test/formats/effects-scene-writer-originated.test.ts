import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { createHash } from 'crypto';
import {
  parseEffectsScene,
  serializeEffectsScene,
  EFFECTS_SCENE_SCHEMA,
} from '../../src/core/formats/effects/scene';
import { validateAgainstSchema } from '../../src/core/formats/effects/json-schema-subset';
import { SCENE_DEFORM_ROWS } from '../../src/renderer/providers/effects-aeon';
import { EFFECTS_LAYER_COUNT } from '../../src/core/formats/effects/scene-ui';

/**
 * THE WRITER-ORIGINATED FIXTURE (ROADMAP item 31).
 *
 * `canopy_dusk.json` next to it is writer-CERTIFIED: hand-written for shape
 * coverage, then proven a byte-exact fixed point of the writer. That is a real
 * cross-implementation check and it is NOT what this file is. A hand-written
 * fixture was derived by reading the same schema the codec reads, so it can only
 * echo the schema back; it cannot corroborate it.
 *
 * `writer_session_ojz.json` came off disk after a real authoring session in the
 * running app — every encoded value picked by INDEX out of a `<select>`'s own
 * option list, saved through the app's own Ctrl+S, committed byte-for-byte. The
 * full gesture sequence, the build it came from, and the limits of what is
 * asserted below are in `../fixtures/effects/writer_session_ojz.provenance.md`.
 *
 * ⚠ READ THIS BEFORE ADDING AN ASSERTION THAT WOULD PASS MORE EASILY IF THE FILE
 * WERE EDITED. Nothing here may motivate touching the JSON. If a check wants a
 * key the session could not produce, the answer is a new session, not a new key.
 *
 * WHAT THESE TESTS DO NOT PROVE — stated here and not only in the provenance
 * note, because the gap is easy to paper over: a round-trip assertion proves the
 * WRITER IS SELF-CONSISTENT on this document. It does not prove the document was
 * writer-ORIGINATED. A hand-written file in canonical order, using only the keys
 * the wave-1 UI can author, with the hash table updated to match, would pass
 * every test below. The blob-hash guard catches the realistic failure (the
 * fixture edited without its provenance record changing), not a determined
 * substitution. The evidence of origination is the harness run, not the suite.
 */

const FIXTURE_PATH = resolve(__dirname, '../fixtures/effects/writer_session_ojz.json');
const PROVENANCE_PATH = resolve(__dirname, '../fixtures/effects/writer_session_ojz.provenance.md');
const PANEL_PATH = resolve(__dirname, '../../src/renderer/components/effects/EffectsScenePanel.tsx');

const BYTES = readFileSync(FIXTURE_PATH);
const TEXT = BYTES.toString('utf8');
const PROVENANCE = readFileSync(PROVENANCE_PATH, 'utf8');
const PANEL = readFileSync(PANEL_PATH, 'utf8');

/** git's own object hash for a blob: sha1 over `blob <len>\0<content>`. */
function gitBlobHash(bytes: Buffer): string {
  return createHash('sha1')
    .update(Buffer.concat([Buffer.from(`blob ${bytes.length}\0`, 'utf8'), bytes]))
    .digest('hex');
}

/**
 * Every scene-level key the wave-1 panel can write, DERIVED FROM THE PANEL rather
 * than typed here — so a control added tomorrow widens this set on its own and
 * this test does not become a second place to remember.
 *
 * The four seeded by `newEffectsScene` are unioned in because they arrive with
 * the create gesture rather than through a field: `schema`, `id`, `layers`,
 * `v_factor` are the schema's `required` list.
 */
function uiAuthorableSceneKeys(): Set<string> {
  const found = [...PANEL.matchAll(/setSceneFieldCommand\(\s*library,\s*selected\.id,\s*'([a-z_0-9]+)'/g)]
    .map(m => m[1]);
  // THE KEYS A LITERAL SCAN CANNOT SEE. The two plane-deform rows are ONE loop
  // over `SCENE_DEFORM_ROWS` — deliberately, because `deform_fg` and `deform_bg`
  // are the same `$defs/sceneDeform` pointed at two planes — so the key reaching
  // `setSceneFieldCommand` there is the loop variable, not a literal. Rather
  // than re-type the pair here (which is what this derivation exists to avoid),
  // the loop is PINNED in the panel source and the provider constant's own keys
  // join the set. If the panel stops mapping that constant into the command, the
  // assertion below fails rather than the set quietly shrinking.
  expect(
    PANEL,
    'the panel drives SCENE_DEFORM_ROWS into setSceneFieldCommand as a loop variable',
  ).toMatch(/Object\.keys\(SCENE_DEFORM_ROWS\)[\s\S]{0,1600}?setSceneFieldCommand\(\s*\n?\s*library,\s*selected\.id,\s*key,/);
  // AND ONE MORE THE LITERAL SCAN CANNOT SEE, for a different reason:
  // `left_column_mask` is written through its own `leftColumnMaskCommand`,
  // because the value is not a free choice — three of the four enum members
  // carry engine preconditions and one is refused outright, so the panel asks
  // the provider what to offer rather than passing a string through. Same
  // treatment: pin the call in the panel source, then add the key.
  expect(PANEL, 'the panel writes left_column_mask through leftColumnMaskCommand')
    .toMatch(/leftColumnMaskCommand\(library,\s*selected\.id,\s*v\)/);
  return new Set([
    'schema', 'id', 'layers', 'v_factor', ...found,
    ...Object.keys(SCENE_DEFORM_ROWS), 'left_column_mask',
  ]);
}

/** Same, per layer. `world_y`/`fa`/`fb` are what `newEffectsLayer` seeds. */
function uiAuthorableLayerKeys(): Set<string> {
  const found = [...PANEL.matchAll(/setLayerFieldCommand\(\s*library,\s*selected\.id,\s*i,\s*'([a-z_0-9]+)'/g)]
    .map(m => m[1]);
  return new Set(['world_y', 'fa', 'fb', ...found]);
}

describe('writer-originated effects scene fixture', () => {
  /**
   * ANTI-VACUOUS PREAMBLE. Every assertion below would pass against a one-layer
   * stub, and two of them would pass against an empty object. This is the row
   * that says the instrument saw its subject.
   */
  it('the fixture is the scene the session authored, not a stub', () => {
    const doc = JSON.parse(TEXT) as Record<string, unknown>;
    expect(doc.id).toBe('writer_session_ojz');
    // THE COUNT IS THE APP'S CEILING, AND IT IS DERIVED HERE RATHER THAN TYPED
    // (ROADMAP row 60). Gesture R3 clicks Add layer until the control refuses, so
    // the number in this file is `layers.maxItems` and nothing else. It read
    // `.toBe(8)` until 2026-08-27 — a literal, and it went stale in silence when
    // empyrean `277bc15` raised the ceiling to 16: the fixture disagreed with its
    // own gesture rule for a whole contract revision and no test could say so,
    // because the pin agreed with the stale file. Bound to the constant, the next
    // ceiling change turns this row RED and the fix is a re-run, exactly as the
    // provenance demands.
    expect(Array.isArray(doc.layers) && (doc.layers as unknown[]).length)
      .toBe(EFFECTS_LAYER_COUNT.max);
    // The packed triple the app SEEDED when the enumeration landed on the
    // custom-factor sentinel (R6). Nothing in the session typed these numbers.
    expect((doc.layers as Record<string, unknown>[])[0].fb).toEqual({ op: 0, s1: 0, s2: 15 });
    // Non-ASCII survived the writer's `ensure_ascii=False`-equivalent rendering.
    expect(doc.name).toContain('—');
    expect(BYTES.length).toBeGreaterThan(200);
    // THE DEFORM ATTACHMENTS ARE HERE NOW (ROADMAP row 60), and this is the row
    // that keeps them here. The key-set assertion below is an UPPER bound — it
    // permits a fixture carrying none of them — so a future re-run whose deform
    // gestures silently stopped landing (the failure this fixture has now had
    // five times) would emit a file with no deform keys and pass every other
    // assertion in this file. This one goes red instead.
    for (const k of ['deform_fg', 'deform_bg', 'v_deform', 'left_column_mask']) {
      expect(doc, `the session authored ${k}`).toHaveProperty(k);
    }
    // And the MUTUAL gate the engine enforces (scene_dsl.emp:1288 / :1293): the
    // per-column V deform and its policy stand or fall together, and `undeclared`
    // beside a `v_deform` is a scene aeon's build refuses.
    expect('v_deform' in doc).toBe('left_column_mask' in doc);
    expect(doc.left_column_mask).not.toBe('undeclared');
    // The layer attachment sits on the LAST strip and only there — R16 is a rule
    // ("the last", as R6 and R9 use), so a run that put one on every card would
    // not be the session this record describes.
    const layers = doc.layers as Record<string, unknown>[];
    expect(layers.filter(l => 'deform' in l).length).toBe(1);
    expect(layers[layers.length - 1]).toHaveProperty('deform');
  });

  it('validates against the committed schema exactly as emitted', () => {
    expect(validateAgainstSchema(JSON.parse(TEXT), EFFECTS_SCENE_SCHEMA)).toEqual([]);
  });

  /**
   * The committed bytes are exactly what the CURRENT writer emits for the parsed
   * document — indentation, §5 key order, the single trailing newline (empyrean
   * e1ebd20 §8; the provenance note records the appended byte), all of it.
   *
   * WHAT THIS MEASURES, precisely: writer self-consistency. It goes red if the
   * file is hand-tidied into a shape the writer would not emit, and it goes red
   * if the writer's rendering changes without the fixture being re-derived from a
   * new session. It does NOT measure origination — see the header.
   */
  it('is a byte-exact fixed point of the writer', () => {
    expect(serializeEffectsScene(parseEffectsScene(TEXT, 'writer_session_ojz'))).toBe(TEXT);
  });

  /**
   * The fixture and its provenance record cannot drift apart. This is the guard
   * that notices a fixture edited to make something else pass.
   */
  it('matches the git blob hash recorded in its provenance note', () => {
    const recorded = /git blob hash \| `([0-9a-f]{40})`/.exec(PROVENANCE)?.[1];
    // Anti-vacuous: a missing table row must fail loudly, not compare undefined
    // to undefined.
    expect(recorded, 'the provenance note has no "git blob hash" row').toMatch(/^[0-9a-f]{40}$/);
    expect(gitBlobHash(BYTES)).toBe(recorded);
  });

  /**
   * A NECESSARY CONDITION for "this came out of the wave-1 Effects panel": it
   * carries no key that panel has no control for. `anchor`, `budget_class`,
   * `dsa/dsb`, `phase`, `enabled` and `v_factor_fg` are all schema-legal and all
   * unreachable from the UI today, so any of them appearing here means the file
   * did not come from a session.
   * (`curve` and `vsplit` became authorable in parcel H, and the four deform
   * attachments — `deform_fg`, `deform_bg`, `v_deform`, a layer's `deform` — plus
   * `left_column_mask` in wave 2. ROADMAP row 60 widened the gesture sequence to
   * the deform five and the fixture now carries all of them; `curve` and `vsplit`
   * it still does not, which the set below permits, because the set is an UPPER
   * bound on what a session could produce and it WIDENS as the panel grows
   * controls. That is the point of deriving it. The row that stops the deform
   * keys quietly vanishing again is in the anti-vacuous preamble, not here.)
   *
   * It is NOT a sufficient condition. A hand-written document restricted to these
   * keys passes. Said again because this is the assertion most likely to be
   * mistaken for a proof of origination.
   */
  it('uses only keys the wave-1 Effects panel can actually author', () => {
    const sceneKeys = uiAuthorableSceneKeys();
    const layerKeys = uiAuthorableLayerKeys();
    // SUBJECT CHECK on the derivation itself: an empty or all-permitting set
    // would make the two assertions below vacuous. The panel really does drive
    // these, and really does NOT drive budget_class.
    expect(sceneKeys.has('name')).toBe(true);
    expect(sceneKeys.has('budget_class')).toBe(false);
    expect(layerKeys.has('world_y')).toBe(true);
    // Parcel H gave the card curve/vsplit controls and wave 2 gave it `deform`,
    // so all three are authorable now. `dsa`/`dsb`/`phase`/`enabled` are the
    // layer keys that still are not — and `dsa` is the one that keeps this row
    // discriminating rather than merely permissive.
    expect(layerKeys.has('curve')).toBe(true);
    expect(layerKeys.has('vsplit')).toBe(true);
    expect(layerKeys.has('deform')).toBe(true);
    expect(layerKeys.has('dsa')).toBe(false);
    expect(layerKeys.has('enabled')).toBe(false);
    // The three deform attachments the scene form now writes — the two plane
    // rows through the loop, `v_deform` as a literal.
    expect(sceneKeys.has('deform_fg')).toBe(true);
    expect(sceneKeys.has('deform_bg')).toBe(true);
    expect(sceneKeys.has('v_deform')).toBe(true);
    // `left_column_mask` joined them in the follow-up: `v_deform` makes it
    // MANDATORY at build time, so shipping the one without the other let an
    // author write a scene aeon refuses with no in-app remedy.
    expect(sceneKeys.has('left_column_mask')).toBe(true);
    // Still NOT authorable, and these are what keep this row discriminating:
    expect(sceneKeys.has('anchor')).toBe(false);
    expect(sceneKeys.has('v_factor_fg')).toBe(false);
    // RETIRED, not merely un-authored (ROADMAP row 59). This line read
    // `.toBe(true)` until 2026-08-27: `precision` WAS a control, and the panel
    // scan above found its `setSceneFieldCommand` literal. The engine deleted the
    // storage on 2026-08-26 and empyrean `0bd4753` cut the key from the schema,
    // so the control went with it. The assertion is FLIPPED rather than deleted
    // on purpose — deleting it would leave this row merely stopping being wrong,
    // where flipping it keeps the row DISCRIMINATING: re-add the `Precision`
    // field to the panel and this goes red, which is the only automatic guard
    // against the dead control growing back.
    expect(sceneKeys.has('precision')).toBe(false);
    // And the set genuinely discriminates: the schema offers strictly more.
    const schemaKeys = Object.keys(EFFECTS_SCENE_SCHEMA.properties as Record<string, unknown>);
    expect(schemaKeys.filter(k => !sceneKeys.has(k)).length).toBeGreaterThan(0);

    const doc = JSON.parse(TEXT) as Record<string, unknown>;
    expect(Object.keys(doc).filter(k => !sceneKeys.has(k))).toEqual([]);
    for (const [i, layer] of (doc.layers as Record<string, unknown>[]).entries()) {
      expect(Object.keys(layer).filter(k => !layerKeys.has(k)), `layer ${i}`).toEqual([]);
    }
  });
});
