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
 *     2d7a9fee37d85334103ca1a3e03e1a40466d6d9c — byte-identical from empyrean
 *     1326ceb (commit, the merge landing the contract) through c2c81e2 (commit,
 *     HEAD at cut). The blob hash is the invariant; the vendored copy is held to
 *     it by effects-schema-drift.test.ts.
 *   • empyrean docs/AURORA_EFFECTS_SCHEMA.md at 069cf59 (commit) — §2 unchanged
 *     since 0ea8734 landed it; the two later doc commits (2f3b6fd, 069cf59)
 *     touched §3's site count and §3's cites, not §2.
 *   • aeon tools/EFFECTS_CONSUMER_CONTRACT.md at 00607dd5 (commit) — the
 *     consumer read set (§2.1 scene fields, §2.3 referenced binaries).
 *
 * THE FIXTURE IS HAND-WRITTEN. test/fixtures/effects/canopy_dusk.json was typed
 * against the schema, never produced by serializeEffectsScene — a
 * serializer-built golden drifts in lockstep with a broken serializer and
 * passes while proving nothing (the standard set by the sceneRef parcel,
 * aurora 61d4b80).
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
   */
  it('exercises both factor spellings', () => {
    const factorBranches = ((EFFECTS_SCENE_SCHEMA.$defs as Record<string, JsonSchema>)
      .factor.oneOf) as JsonSchema[];
    expect(factorBranches).toHaveLength(2);
    const doc = JSON.parse(GOLDEN) as { v_factor: unknown; layers: { fa: unknown }[] };
    expect(validateAgainstSchema(doc.v_factor, factorBranches[0], EFFECTS_SCENE_SCHEMA)).toEqual([]);
    expect(validateAgainstSchema(doc.layers[1].fa, factorBranches[1], EFFECTS_SCENE_SCHEMA)).toEqual([]);
  });
});
