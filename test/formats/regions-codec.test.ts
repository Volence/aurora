import { describe, it, expect } from 'vitest';
import {
  REGIONS_SCHEMA, REGIONS_SCHEMA_VERSION,
  parseRegionsDocument, serializeRegionsDocument, RegionsDocumentError,
  type RegionsDocument,
} from '../../src/core/formats/regions/document';
import { validateAgainstSchema } from '../../src/core/formats/effects/json-schema-subset';

/**
 * Aurora's OWN rows for the regions codec, beside the contract's vectors.
 *
 * WHY BOTH. test/formats/regions-vectors.test.ts runs the ten cases empyrean
 * publishes, and they pin the SCHEMA's rules. They do not pin the CODEC's, and
 * the two are not the same population: every one of the ten declares
 * `"schema": 1`, so nothing there reaches the version sentence
 * `parseRegionsDocument` speaks before the schema runs, and nothing there
 * reaches the writer at all. The effects lane learned this from the other
 * direction and booked it: a mutation that deleted the preset codec's
 * missing-key rule left all 43 contract vectors green, and only that repo's own
 * row went red.
 *
 * Every document below is built from the MINIMAL SHAPE at the top, perturbed in
 * one place, so no row is quietly asserting two things at once.
 */

/** The smallest document the contract accepts. Every row below starts here. */
const MINIMAL: RegionsDocument = {
  schema: 1,
  act: 'ojz_act1',
  regions: [
    { id: 'forest', rect: { x: 0, y: 0, w: 3400, h: 1024 }, preset: 'OJZ_Preset_Sec1' },
  ],
};

/** A copy of MINIMAL with `edit` applied to its one region. */
function withRegion(edit: Record<string, unknown>): Record<string, unknown> {
  const doc = JSON.parse(JSON.stringify(MINIMAL)) as Record<string, unknown>;
  Object.assign((doc.regions as Record<string, unknown>[])[0], edit);
  return doc;
}

const textOf = (doc: unknown) => JSON.stringify(doc, null, 2) + '\n';

describe('regions codec: the minimal document is really accepted', () => {
  /**
   * THE ACCEPTING CONTROL FOR EVERY REFUSAL ROW IN THIS FILE. A codec that
   * refused everything would pass all of them; this is what makes each of those
   * rows a statement about the perturbation and not about the codec's mood.
   */
  it('parses, and the schema itself reports no issue', () => {
    expect(validateAgainstSchema(MINIMAL, REGIONS_SCHEMA)).toEqual([]);
    expect(parseRegionsDocument(textOf(MINIMAL))).toEqual(MINIMAL);
  });
});

describe('regions codec: the version rule, which NO contract vector reaches', () => {
  it('refuses a document declaring a version other than 1, quoting the value back', () => {
    const doc = { ...MINIMAL, schema: 2 };
    let thrown: unknown = null;
    try { parseRegionsDocument(textOf(doc), 'ojz_act1.json'); } catch (e) { thrown = e; }
    expect(thrown).toBeInstanceOf(RegionsDocumentError);
    expect((thrown as Error).message).toContain('"schema": 2');
    expect((thrown as Error).message).toContain('not a file the reader upgrades');
  });

  /**
   * THE ABSENT KEY IS A SEPARATE ROW, and the effects lane proved by mutation
   * that it has to be. The schema's `required` refuses this document anyway,
   * with a different sentence one layer down, so a codec that only checked
   * `schema !== undefined && schema !== 1` would still refuse it and every
   * contract vector would stay green. Only a row like this one goes red.
   */
  it('refuses a document with NO schema key at all, quoting the absence back', () => {
    const doc = JSON.parse(JSON.stringify(MINIMAL)) as Record<string, unknown>;
    delete doc.schema;
    let thrown: unknown = null;
    try { parseRegionsDocument(textOf(doc), 'ojz_act1.json'); } catch (e) { thrown = e; }
    expect(thrown).toBeInstanceOf(RegionsDocumentError);
    expect((thrown as Error).message).toContain('"schema": undefined');
  });

  it('the version the codec accepts is the one the schema pins, not a second copy', () => {
    // Derived from the vendored file, so a contract that bumps the version
    // cannot leave this constant behind.
    const pinned = (REGIONS_SCHEMA.properties as Record<string, { const: unknown }>).schema.const;
    expect(REGIONS_SCHEMA_VERSION).toBe(pinned);
  });
});

describe('regions codec: it REFUSES what it does not understand, it never drops it', () => {
  /**
   * The banked rule this file exists to hold: a codec that quietly drops a key
   * it does not understand is the failure mode, because the author's file is
   * then rewritten without it and nothing said so. Checked at all three closed
   * levels, in BOTH directions, because they are different guards: reading is
   * `validateAgainstSchema` and writing is `canonicalizeBySchema`.
   */
  const NESTED: { where: string; doc: Record<string, unknown> }[] = [
    { where: 'the document root', doc: { ...MINIMAL, flavour: 'night' } },
    { where: 'a region', doc: withRegion({ effectsRef: 'ojz_sec1_tint' }) },
    { where: 'bg', doc: withRegion({ bg: { layoutRef: 'ojz_forest', anchorY: 64 } }) },
  ];

  for (const { where, doc } of NESTED) {
    it(`READING refuses an unknown key at ${where}`, () => {
      expect(() => parseRegionsDocument(textOf(doc))).toThrow(RegionsDocumentError);
    });

    it(`WRITING refuses an unknown key at ${where} rather than erasing it`, () => {
      // The document never went through the reader, which is the real hazard:
      // an in-memory document built by an edit path is the one a writer can
      // silently narrow.
      let thrown: unknown = null;
      try { serializeRegionsDocument(doc as unknown as RegionsDocument); } catch (e) { thrown = e; }
      expect(thrown, `serializing a document with an unknown key at ${where} did not throw`)
        .not.toBeNull();
      // ...and it refused rather than returning a document with the key gone.
      expect(String((thrown as Error).message)).not.toBe('');
    });
  }

  /**
   * THE ACCEPTING CONTROL FOR THE WRITER. Without it the three rows above are
   * met by a writer that throws on everything.
   */
  it('WRITING accepts the same documents with the unknown key removed', () => {
    expect(() => serializeRegionsDocument(MINIMAL)).not.toThrow();
    expect(() => serializeRegionsDocument(
      withRegion({ bg: { layoutRef: 'ojz_forest', span: 1536 } }) as unknown as RegionsDocument,
    )).not.toThrow();
  });

  /**
   * ...and the keys that ARE declared survive a write, by value, nulls
   * included. A `rasterRef: null` is a THREE-STATE key (absent, null, a string)
   * and a writer that folded null into absent would lose the author's explicit
   * "no raster program here".
   */
  it('keeps every declared key across a write, including an explicit null', () => {
    const rich = withRegion({
      name: 'night stretch',
      rasterRef: null,
      sceneRef: 'ojz_night_scene',
      bg: { layoutRef: null, span: 1536 },
    });
    const out = JSON.parse(serializeRegionsDocument(parseRegionsDocument(textOf(rich))));
    expect(out).toEqual(rich);
    const region = (out.regions as Record<string, unknown>[])[0];
    expect('rasterRef' in region, 'an explicit null rasterRef was folded into absent').toBe(true);
    expect(region.rasterRef).toBeNull();
    expect((region.bg as Record<string, unknown>).layoutRef).toBeNull();
  });
});

describe('regions codec: the key order on write is aeon section 5, alphabetical and recursive', () => {
  /**
   * The rule is asserted at EVERY depth, not only the root, because
   * "recursively" is the half a writer forgets: a root-level sort with
   * insertion order inside the region objects would pass a root-only check and
   * produce a file a Python writer cannot reproduce.
   */
  it('sorts keys alphabetically at every depth', () => {
    const doc = withRegion({
      name: 'night stretch',
      sceneRef: 'ojz_night_scene',
      bg: { span: 1536, layoutRef: 'ojz_forest' },
    });
    const text = serializeRegionsDocument(parseRegionsDocument(textOf(doc)));

    // PER OBJECT, never per indent level. An indent-based sweep pools the keys
    // of SIBLING objects (a region's `bg` and its `rect` sit at the same depth)
    // and then asks whether the pool is sorted, which it never is and never
    // should be. `JSON.parse` preserves the file's key order for non-integer
    // keys, and every key in this schema is an identifier, so the parsed
    // object's own `Object.keys` IS the text's order.
    const unsorted: string[] = [];
    let objectsSeen = 0;
    const walk = (value: unknown, where: string): void => {
      if (Array.isArray(value)) { value.forEach((v, i) => walk(v, `${where}/${i}`)); return; }
      if (typeof value !== 'object' || value === null) return;
      objectsSeen += 1;
      const keys = Object.keys(value as Record<string, unknown>);
      if (keys.join(' ') !== [...keys].sort().join(' ')) {
        unsorted.push(`${where || '<root>'}: ${keys.join(', ')}`);
      }
      for (const [k, v] of Object.entries(value as Record<string, unknown>)) walk(v, `${where}/${k}`);
    };
    walk(JSON.parse(text), '');
    expect(unsorted, 'these objects are written with keys out of order').toEqual([]);
    // Anti-vacuous: the walk really visited the nested objects, so an empty
    // `unsorted` is a measurement and not a walk that found nothing to look at.
    // Four at minimum: the document, its one region, that region's `rect` and
    // its `bg`.
    expect(objectsSeen).toBeGreaterThanOrEqual(4);
  });

  it('writes exactly one trailing newline and no other', () => {
    const text = serializeRegionsDocument(MINIMAL);
    expect(text.endsWith('}\n')).toBe(true);
    expect(text.endsWith('}\n\n')).toBe(false);
  });

  /**
   * THE ROUND-TRIP PROPERTY, stated exactly. Aurora writes the canonical form,
   * so an authored file whose keys are in some other order is NORMALIZED on its
   * first save; what must hold is that the canonical text is a FIXED POINT.
   * Both halves are asserted, because only the pair says what the codec does:
   * the content survives any input order, and the bytes stop moving after one
   * write.
   */
  it('canonical text is a byte-identical fixed point, and content survives any input order', () => {
    const authored = {
      regions: [{ preset: 'OJZ_Preset_Sec1', rect: { w: 3400, h: 1024, y: 0, x: 0 }, id: 'forest' }],
      act: 'ojz_act1',
      schema: 1,
    };
    const once = serializeRegionsDocument(parseRegionsDocument(textOf(authored)));
    expect(JSON.parse(once)).toEqual(authored);
    expect(serializeRegionsDocument(parseRegionsDocument(once))).toBe(once);
    // Anti-vacuous: the first write really did move the bytes, so the fixed
    // point above is a property of the SECOND write and not of a no-op.
    expect(once).not.toBe(textOf(authored));
  });
});

describe('regions codec: what it refuses to do is refuse', () => {
  /**
   * ⚠ THE SPAN HOLE, asserted so it cannot be mistaken for a check. `bg.span`
   * is derived from the referenced layout and never typed by hand (part 2
   * section 6.2 item 1), and nothing at this layer can verify it: the
   * derivation needs the background layout library, which is a later row. This
   * row PROVES the hole is open, so the day it closes this row goes red and
   * whoever closes it is told to update the module header, the type comment and
   * the schema sidecar in the same change.
   */
  it('accepts a bg.span that disagrees with its layout, because it cannot know', () => {
    const absurd = withRegion({ bg: { layoutRef: 'ojz_forest', span: 1 } });
    expect(validateAgainstSchema(absurd, REGIONS_SCHEMA)).toEqual([]);
    expect(() => parseRegionsDocument(textOf(absurd))).not.toThrow();
    // And an out-of-range one is refused, so the row above is about the
    // DERIVATION being unchecked rather than about span being unchecked.
    const zero = withRegion({ bg: { layoutRef: 'ojz_forest', span: 0 } });
    expect(validateAgainstSchema(zero, REGIONS_SCHEMA)).not.toEqual([]);
  });

  /**
   * The other half of the same honesty: a `preset` that names nothing is
   * accepted here, because validating it against the game's own effects library
   * is the GENERATOR's check by the schema's own words.
   */
  it('accepts a preset name no library holds, because that is the generator\'s check', () => {
    const invented = withRegion({ preset: 'Nothing_Named_This' });
    expect(validateAgainstSchema(invented, REGIONS_SCHEMA)).toEqual([]);
    // ...and still refuses one that is not even SHAPED like a record name.
    const misshapen = withRegion({ preset: '9 not a symbol' });
    expect(validateAgainstSchema(misshapen, REGIONS_SCHEMA)).not.toEqual([]);
  });

  it('does not invent a filename identity rule the contract never asked for', () => {
    // `act` is not an .emp label component the way a preset `id` is, so a
    // mismatch with the label is not a refusal. If this ever becomes one it is
    // a contract change, not a loader convenience.
    expect(() => parseRegionsDocument(textOf(MINIMAL), 'something_else.json')).not.toThrow();
  });
});

describe('regions codec: a refusal names the pointer, not just the document', () => {
  it('reports the JSON pointer of the offending value', () => {
    const broken = withRegion({ rect: { x: 0, y: 0, w: 0, h: 1024 } });
    let thrown: unknown = null;
    try { parseRegionsDocument(textOf(broken), 'ojz_act1.json'); } catch (e) { thrown = e; }
    expect(thrown).toBeInstanceOf(RegionsDocumentError);
    expect((thrown as RegionsDocumentError).issues).toEqual(['/regions/0/rect/w: 0 is below the minimum 1']);
  });

  it('reports a root-level defect as <document> rather than an empty pointer', () => {
    const noAct = JSON.parse(JSON.stringify(MINIMAL)) as Record<string, unknown>;
    delete noAct.act;
    let thrown: unknown = null;
    try { parseRegionsDocument(textOf(noAct), 'ojz_act1.json'); } catch (e) { thrown = e; }
    expect((thrown as RegionsDocumentError).issues)
      .toEqual(['<document>: missing required property "act"']);
  });

  it('refuses text that is not JSON, and text that is JSON but not an object', () => {
    expect(() => parseRegionsDocument('{ nope', 'ojz_act1.json')).toThrow(/is not valid JSON/);
    expect(() => parseRegionsDocument('[]', 'ojz_act1.json')).toThrow(/must contain a JSON object/);
  });
});
