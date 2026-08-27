import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import {
  parseEffectsScene,
  serializeEffectsScene,
  EFFECTS_SCENE_SCHEMA,
} from '../../src/core/formats/effects/scene';
import { validateAgainstSchema, type JsonSchema } from '../../src/core/formats/effects/json-schema-subset';

/**
 * The writer-side golden, per AURORA_EFFECTS_SCHEMA.md §8.
 *
 * PINS (re-verified at dispatch, not taken on trust):
 *   • empyrean contract/schema/aurora-effects-scene.schema.json, git blob
 *     dd972cf0e203a11330dfcec60b8c3ca59eac5b49 — re-vendored from empyrean
 *     0bd4753 (ROADMAP row 59: `precision` RETIRED, because aeon deleted the
 *     storage). Earlier blobs, current last: 2d7a9fee (byte-identical 1326ceb
 *     through c2c81e2) -> cab3ca58 (a32bcb03, CR-1: `v_factor`/`v_factor_fg`
 *     retyped from a `$ref` to `$defs/factor` into plain integers 0..15) ->
 *     d4345af5 (5c930d6, `v_center`/`v_offset` bounded) -> 0f661b70 (277bc15,
 *     `layers` maxItems 8 -> 16). The blob hash is the invariant; the vendored
 *     copy is held to it by effects-schema-drift.test.ts, which is the PIN OF
 *     RECORD — this citation is prose, and it had gone THREE re-pins stale
 *     (it still read cab3ca58) before row 59 corrected it, because nothing
 *     hashes a comment.
 *   • empyrean docs/AURORA_EFFECTS_SCHEMA.md at 069cf59 (commit) — §2 unchanged
 *     since 0ea8734 landed it; the two later doc commits (2f3b6fd, 069cf59)
 *     touched §3's site count and §3's cites, not §2.
 *   • aeon tools/EFFECTS_CONSUMER_CONTRACT.md at 00607dd5 (commit) — the
 *     consumer read set (§2.1 scene fields, §2.3 referenced binaries).
 *
 * THE FIXTURE IS NOT PRODUCED BY THE WRITER UNDER TEST, and that is the whole
 * point of it: a serializer-built golden drifts in lockstep with a broken
 * serializer and passes while proving nothing (the standard set by the sceneRef
 * parcel, aurora 61d4b80). It was typed by hand against the schema, and when §5
 * canonical order was adopted it was re-sorted by the OTHER implementation the
 * clause names — `json.dumps(doc, sort_keys=True, indent=2,
 * ensure_ascii=False)` — never by serializeEffectsScene. So the byte round-trip
 * below is now cross-implementation evidence that Aurora and aeon agree on the
 * rendering, which is strictly more than it proved before.
 *
 * The re-sort was FORMAT-ONLY, measured rather than assumed: 2,524 bytes and
 * 140 lines before and after, sha256 1f99f25ccb2742f3… -> 9034790c09ec0935…,
 * and `json.loads(before) == json.loads(after)` is True.
 *
 * EDITED 2026-08-27 (ROADMAP row 59) — and editing it is LEGITIMATE, which is the
 * one place this fixture differs from `writer_session_ojz.json` beside it. This
 * one is writer-CERTIFIED: hand-written, then proven byte-identical through
 * `serializeEffectsScene(parseEffectsScene(GOLDEN))`. Its sibling is writer-
 * ORIGINATED — it came off disk from a real session — so the same change there
 * had to be made by RE-RUNNING the session, never by deleting the key. Confusing
 * the two silently converts the sibling into a second copy of this file; see
 * test/fixtures/effects/writer_session_ojz.provenance.md.
 *
 * The edit: `"precision": "cell"` removed, the retired key. Re-emitted by the
 * same formatter §5 names above — `json.dumps(sort_keys=True, indent=2,
 * ensure_ascii=False)` plus the §8 terminator — never by the writer under test,
 * so the round-trip below stays cross-implementation evidence. EXACTLY ONE LINE
 * changed, and the fixed point was re-proven after. Before: blob
 * 01cadfae08bd044548c9754b9d321031e9ae3d1b, sha256 556a425de0f8308e9…, 2,505
 * bytes, 140 lines. After: blob 67efc2684831a9b55f1fd0128d01c97b44e6e8fa,
 * sha256 4a498433a96c8d1be9…, 2,482 bytes, 139 lines.
 *
 * It is a SHAPE-COVERAGE document, not a scene anyone would ship: it carries
 * every optional key and every alternative form so the coverage assertions
 * below can be exhaustive. Whether those values make a good-looking parallax —
 * or even a legal one under the two-sources and budget rules — is sigil's
 * question at build time, not this codec's.
 */

const GOLDEN_PATH = resolve(__dirname, '../fixtures/effects/canopy_dusk.json');
const GOLDEN = readFileSync(GOLDEN_PATH, 'utf8');

/** Collect every value that sits under a "table" key, at any depth. */
function collectTables(value: unknown, out: unknown[] = []): unknown[] {
  if (Array.isArray(value)) { value.forEach(v => collectTables(v, out)); return out; }
  if (typeof value !== 'object' || value === null) return out;
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    if (k === 'table') out.push(v);
    collectTables(v, out);
  }
  return out;
}

describe('effects scene golden (AURORA_EFFECTS_SCHEMA.md §8)', () => {
  it('the golden validates against the committed schema', () => {
    const doc = JSON.parse(GOLDEN);
    expect(validateAgainstSchema(doc, EFFECTS_SCENE_SCHEMA)).toEqual([]);
  });

  it('parses under its own filename stem', () => {
    const scene = parseEffectsScene(GOLDEN, 'canopy_dusk');
    expect(scene.id).toBe('canopy_dusk');
    expect(scene.layers).toHaveLength(5);
  });

  /**
   * The round trip, proven on DISK BYTES against the hand-written document.
   * This is the §6-hazard-1 property in its strongest available form: the
   * wave-1 UI edits none of these fields, and the file that comes back out is
   * byte-for-byte the file that went in.
   */
  it('round-trips the golden byte for byte', () => {
    // Anti-vacuous: the document really carries the fields whose survival is
    // the point — a deform table, an anchor, a packed factor, a raw .bin ref.
    expect(GOLDEN).toContain('"v_column_perspective"');
    expect(GOLDEN).toContain('"bin": "tables/canopy_wind.bin"');
    expect(GOLDEN).toContain('"anchor"');
    expect(GOLDEN).toContain('"s1": 2');

    expect(serializeEffectsScene(parseEffectsScene(GOLDEN, 'canopy_dusk'))).toBe(GOLDEN);
  });

  it('ends in exactly one LF after the closing brace (empyrean e1ebd20 §8)', () => {
    expect(GOLDEN.endsWith('}\n')).toBe(true);
    expect(GOLDEN.endsWith('\n\n')).toBe(false);
    // A file saved with TWO terminators is not canonical and does not survive:
    // the round trip lands on exactly one.
    const doubled = GOLDEN + '\n';
    expect(serializeEffectsScene(parseEffectsScene(doubled, 'canopy_dusk'))).toBe(GOLDEN);
  });

  /**
   * The fixture is itself in §5 canonical order, checked against the DOCUMENT
   * rather than against the serializer — so the round-trip above cannot pass by
   * both sides agreeing on a wrong order.
   */
  it('the golden on disk is in §5 canonical key order, at every depth', () => {
    function everyObjectSorted(value: unknown, path = '<document>'): string[] {
      if (Array.isArray(value)) return value.flatMap((v, i) => everyObjectSorted(v, `${path}[${i}]`));
      if (typeof value !== 'object' || value === null) return [];
      const keys = Object.keys(value as Record<string, unknown>);
      const bad = keys.join(',') === keys.slice().sort().join(',') ? [] : [path];
      return [...bad, ...Object.entries(value as Record<string, unknown>)
        .flatMap(([k, v]) => everyObjectSorted(v, `${path}.${k}`))];
    }
    const doc = JSON.parse(GOLDEN) as Record<string, unknown>;

    // Subject check: the walker really does reach nested objects and really
    // does report them, so an empty result below means "all sorted" rather
    // than "nothing looked at". Proven by unsorting one object DEEP inside a
    // layer's deform table and seeing that exact path come back.
    const poisoned = JSON.parse(GOLDEN) as Record<string, unknown>;
    const table = ((poisoned.layers as Record<string, Record<string, Record<string, unknown>>>[])
      .find(l => l.deform)!.deform.own.table) as Record<string, unknown>;
    const unsorted: Record<string, unknown> = {};
    for (const k of Object.keys(table).reverse()) unsorted[k] = table[k];
    ((poisoned.layers as Record<string, Record<string, Record<string, unknown>>>[])
      .find(l => l.deform)!.deform.own).table = unsorted;
    expect(Object.keys(unsorted).length).toBeGreaterThan(1);
    expect(everyObjectSorted(poisoned).join(',')).toMatch(/\.deform\.own\.table$/);

    expect(everyObjectSorted(doc)).toEqual([]);
    // ...and alphabetical really did move things: `schema` is no longer first.
    expect(Object.keys(doc)[0]).not.toBe('schema');
  });

  /**
   * Coverage, DERIVED from the schema rather than asserted as a count: every
   * top-level key the contract declares appears in the golden. A schema
   * amendment that adds a key makes this fail until the golden covers it.
   */
  it('exercises every top-level key the schema declares', () => {
    const declared = Object.keys(EFFECTS_SCENE_SCHEMA.properties as Record<string, unknown>);
    expect(declared.length).toBeGreaterThan(10);
    const doc = JSON.parse(GOLDEN) as Record<string, unknown>;
    expect(declared.filter(k => !(k in doc))).toEqual([]);
  });

  it('exercises every layer key the schema declares', () => {
    const layerProps = (EFFECTS_SCENE_SCHEMA.$defs as Record<string, JsonSchema>).layer.properties;
    const declared = Object.keys(layerProps as Record<string, unknown>);
    expect(declared.length).toBeGreaterThan(5);
    const layers = (JSON.parse(GOLDEN) as { layers: Record<string, unknown>[] }).layers;
    const seen = new Set(layers.flatMap(l => Object.keys(l)));
    expect(declared.filter(k => !seen.has(k))).toEqual([]);
  });

  /**
   * Every tableRef FORM (§2.4) is exercised somewhere in the golden: sine,
   * triangle, zero, v_column_perspective, v_column_floor, and the raw .bin.
   * The branch list is read out of the schema, so adding a seventh form fails
   * this test rather than quietly going untested.
   */
  it('exercises every tableRef form the schema declares', () => {
    const branches = ((EFFECTS_SCENE_SCHEMA.$defs as Record<string, JsonSchema>)
      .tableRef.oneOf) as JsonSchema[];
    expect(branches).toHaveLength(6);
    const tables = collectTables(JSON.parse(GOLDEN));
    expect(tables.length).toBeGreaterThan(0);
    const uncovered = branches.filter(branch =>
      !tables.some(t => validateAgainstSchema(t, branch, EFFECTS_SCENE_SCHEMA).length === 0));
    expect(uncovered.map(b => JSON.stringify(b).slice(0, 60))).toEqual([]);
  });

  /**
   * Both factor spellings (§2.3) appear: a published FACTOR_* name and a custom
   * packed triple.
   *
   * BOTH SAMPLES ARE LAYER FACTORS. The named half used to be read off
   * `v_factor`, which was never a `$defs/factor` at all — item 35. Sampling two
   * different layers keeps the row discriminating: layer 0 carries a name and
   * layer 1 carries the packed triple, so a golden that lost either spelling
   * fails rather than passing on one field that happens to satisfy both.
   */
  it('exercises both factor spellings', () => {
    const factorBranches = ((EFFECTS_SCENE_SCHEMA.$defs as Record<string, JsonSchema>)
      .factor.oneOf) as JsonSchema[];
    expect(factorBranches).toHaveLength(2);
    const doc = JSON.parse(GOLDEN) as { v_factor: unknown; layers: { fa: unknown }[] };
    expect(validateAgainstSchema(doc.layers[0].fa, factorBranches[0], EFFECTS_SCENE_SCHEMA)).toEqual([]);
    expect(validateAgainstSchema(doc.layers[1].fa, factorBranches[1], EFFECTS_SCENE_SCHEMA)).toEqual([]);
    // And the field that is NOT a factor: `v_factor` matches NEITHER branch.
    for (const branch of factorBranches) {
      expect(validateAgainstSchema(doc.v_factor, branch, EFFECTS_SCENE_SCHEMA).length,
        'v_factor is a shift count, not a $defs/factor').toBeGreaterThan(0);
    }
  });
});
