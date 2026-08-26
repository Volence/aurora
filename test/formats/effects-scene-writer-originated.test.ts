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
  return new Set(['schema', 'id', 'layers', 'v_factor', ...found]);
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
    // Eight layers is the app's own ceiling, reached by clicking Add layer until
    // it refused — see provenance R3.
    expect(Array.isArray(doc.layers) && (doc.layers as unknown[]).length).toBe(8);
    // The packed triple the app SEEDED when the enumeration landed on the
    // custom-factor sentinel (R6). Nothing in the session typed these numbers.
    expect((doc.layers as Record<string, unknown>[])[0].fb).toEqual({ op: 0, s1: 0, s2: 15 });
    // Non-ASCII survived the writer's `ensure_ascii=False`-equivalent rendering.
    expect(doc.name).toContain('—');
    expect(BYTES.length).toBeGreaterThan(200);
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
   * `deform*`, `dsa/dsb`, `phase`, `enabled`, `left_column_mask`, `v_deform`,
   * `v_factor_fg` are all schema-legal and all unreachable from the UI today, so
   * any of them appearing here means the file did not come from a session.
   * (`curve` and `vsplit` became authorable in parcel H; the fixture predates
   * that and carries neither, which the set below still permits.)
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
    expect(sceneKeys.has('precision')).toBe(true);
    expect(sceneKeys.has('budget_class')).toBe(false);
    expect(layerKeys.has('world_y')).toBe(true);
    // Parcel H gave the card curve/vsplit controls, so those two are authorable
    // now; `deform` is the layer key that still is not (wave 2).
    expect(layerKeys.has('curve')).toBe(true);
    expect(layerKeys.has('vsplit')).toBe(true);
    expect(layerKeys.has('deform')).toBe(false);
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
