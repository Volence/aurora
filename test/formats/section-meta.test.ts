import { describe, it, expect } from 'vitest';
import { serializeSectionMeta, parseSectionMeta } from '../../src/core/formats/section-meta';
import type { SectionMeta } from '../../src/core/formats/section-meta';
import { canonicalJsonPretty, canonicalKeyOrder } from '../../src/core/formats/canonical-json';

describe('section meta sidecar ({prefix}.meta.json)', () => {
  it('round-trips bgLayoutRef and paletteRef', () => {
    const text = serializeSectionMeta({ bgLayoutRef: 'forest-1718000000', paletteRef: 'OJZ_AltPal', rasterRef: null, sceneRef: null });
    expect(text).not.toBeNull();
    const meta = parseSectionMeta(text!);
    expect(meta).toEqual({ bgLayoutRef: 'forest-1718000000', paletteRef: 'OJZ_AltPal', rasterRef: null, sceneRef: null });
  });

  it('round-trips a single non-null field (the others stay null)', () => {
    const text = serializeSectionMeta({ bgLayoutRef: 'forest-1', paletteRef: null, rasterRef: null, sceneRef: null });
    expect(text).not.toBeNull();
    expect(parseSectionMeta(text!)).toEqual({ bgLayoutRef: 'forest-1', paletteRef: null, rasterRef: null, sceneRef: null });
  });

  it('returns null when every field is null (callers skip the write)', () => {
    expect(serializeSectionMeta({ bgLayoutRef: null, paletteRef: null, rasterRef: null, sceneRef: null })).toBeNull();
  });

  it('parses missing/invalid fields as null (forward compatible)', () => {
    expect(parseSectionMeta('{}')).toEqual({ bgLayoutRef: null, paletteRef: null, rasterRef: null, sceneRef: null });
    expect(parseSectionMeta('{"bgLayoutRef": 7, "other": true}')).toEqual({ bgLayoutRef: null, paletteRef: null, rasterRef: null, sceneRef: null });
    expect(parseSectionMeta('null')).toEqual({ bgLayoutRef: null, paletteRef: null, rasterRef: null, sceneRef: null });
  });

  // ---- sceneRef: the effects-arc assignment ref ----------------------------
  // Key name and type are the contract's, not this repo's: a per-section
  // `sceneRef` holding a STRING scene id or null, empyrean
  // docs/AURORA_EFFECTS_SCHEMA.md §3 at 1326ceb, mirrored in aeon
  // tools/EFFECTS_CONSUMER_CONTRACT.md §2.2 at 00607dd5. (`effectsRef` is
  // reserved for a wave-2 TOTAL preset ref, schema §7 — deliberately not this
  // key, and deliberately not `rasterRef` below either: §3.1's ruling adopted a
  // separate narrow key rather than spending the reservation.)

  it('sceneRef alone is enough to make the sidecar worth writing', () => {
    // The write condition enumerates every ref; a sceneRef-only section must
    // not fall through to "all default, write nothing".
    const text = serializeSectionMeta({ bgLayoutRef: null, paletteRef: null, rasterRef: null, sceneRef: 'canopy_dusk' });
    expect(text).not.toBeNull();
    expect(parseSectionMeta(text!)).toEqual({ bgLayoutRef: null, paletteRef: null, rasterRef: null, sceneRef: 'canopy_dusk' });
  });

  /**
   * The named contract requirement (schema §3/§6/§8, consumer list §2.2):
   * parse→serialize PRESERVES sceneRef. Pinned against a hand-written document
   * rather than the serializer's own output — a fixture built by calling
   * serializeSectionMeta would drift in lockstep with any bug in it, and the
   * comparison would pass while the key was being dropped.
   */
  it('preserves sceneRef verbatim across parse -> serialize', () => {
    const onDisk = [
      '{',
      '  "bgLayoutRef": "forest-1718000000",',
      '  "paletteRef": "OJZ_AltPal",',
      '  "rasterRef": null,',
      '  "sceneRef": "canopy_dusk"',
      '}',
      '',   // the canonical trailing newline (§8): aeon's shipped sidecar carries it
    ].join('\n');
    // Anti-vacuous: the document really carries a non-null sceneRef going in.
    expect(JSON.parse(onDisk).sceneRef).toBe('canopy_dusk');

    const parsed = parseSectionMeta(onDisk);
    expect(parsed.sceneRef).toBe('canopy_dusk');
    expect(serializeSectionMeta(parsed)).toBe(onDisk);
  });

  /**
   * A section that carries ONLY a sceneRef still survives the round trip. The
   * three-ref document above would survive a broken sceneRef arm if the other
   * refs alone kept the file non-empty and byte-stable; this one cannot.
   */
  it('preserves a sceneRef-only document across parse -> serialize', () => {
    const onDisk = [
      '{',
      '  "bgLayoutRef": null,',
      '  "paletteRef": null,',
      '  "rasterRef": null,',
      '  "sceneRef": "canopy_dusk"',
      '}',
      '',
    ].join('\n');
    expect(JSON.parse(onDisk).sceneRef).toBe('canopy_dusk');
    expect(serializeSectionMeta(parseSectionMeta(onDisk))).toBe(onDisk);
  });

  // ---- rasterRef: the per-section raster-preset binding ---------------------
  // Key name, shape and semantics are the contract's, adjudicated 2026-08-30:
  // empyrean docs/AURORA_EFFECTS_SCHEMA.md §3.1 at `da91abce` (reachable from
  // origin/main), which supersedes an earlier reading in which this binding
  // would have been spelt `effectsRef`.
  //
  // ⚠ RE-PIN, HALF-DONE AND SAID SO. §8 has this golden amend together with
  // empyrean's §3.1 and aeon's tools/EFFECTS_CONSUMER_CONTRACT.md §2.2. At the
  // time of writing the aeon half is NOT amended: `rasterRef` appears zero
  // times in that file at aeon origin/master `8f670d5f` (contract blob
  // `b2ca5eb7`), whose `tools/effects_gen.py` still reads `sceneRef` only. That
  // is the SEQUENCING PRECONDITION working as designed — this extension lands
  // FIRST so aeon's first `rasterRef` writer is not erased by its author's next
  // save — not a missing pin. Re-pin the aeon SHA when that half lands.
  //
  // `effectsRef` is NOT this key and is NOT superseded by it: it stays reserved
  // and unspent for a TOTAL preset binding (schema §7, §3.1's ruling), because a
  // preset document can only supply the raster channel of aeon's eight-channel
  // EffectsPreset.

  /**
   * GOLDEN 1 (§8) — a sidecar carrying `rasterRef` round-trips unchanged
   * alongside `sceneRef`, `bgLayoutRef` and `paletteRef`. Pinned against a
   * HAND-WRITTEN document rather than the serializer's own output, for the same
   * reason the sceneRef golden above is: a fixture built by calling
   * `serializeSectionMeta` drifts in lockstep with a broken serializer and
   * passes while the key is being dropped.
   */
  it('preserves rasterRef verbatim across parse -> serialize, beside the other three', () => {
    const onDisk = [
      '{',
      '  "bgLayoutRef": "ingame-forest-v15-1786630615596",',
      '  "paletteRef": "OJZ_AltPal",',
      '  "rasterRef": "canopy_tint",',
      '  "sceneRef": "canopy_dusk"',
      '}',
      '',
    ].join('\n');
    // Anti-vacuous, both keys: the document really carries a non-null rasterRef
    // AND a non-null sceneRef going in, so neither arm can pass by absence.
    expect(JSON.parse(onDisk).rasterRef).toBe('canopy_tint');
    expect(JSON.parse(onDisk).sceneRef).toBe('canopy_dusk');

    const parsed = parseSectionMeta(onDisk);
    expect(parsed.rasterRef).toBe('canopy_tint');
    expect(parsed.sceneRef).toBe('canopy_dusk');
    expect(serializeSectionMeta(parsed)).toBe(onDisk);
  });

  /**
   * GOLDEN 2 (§8) — the write condition WIDENED. A section whose ONLY non-null
   * ref is `rasterRef` must get a file. The four-ref document above would
   * survive a serializer that dropped `rasterRef` from the all-null check,
   * because the other three refs keep it non-empty; this one cannot.
   */
  it('rasterRef alone is enough to make the sidecar worth writing', () => {
    const text = serializeSectionMeta({
      bgLayoutRef: null, paletteRef: null, rasterRef: 'canopy_tint', sceneRef: null,
    });
    expect(text).not.toBeNull();
    expect(parseSectionMeta(text!)).toEqual({
      bgLayoutRef: null, paletteRef: null, rasterRef: 'canopy_tint', sceneRef: null,
    });
  });

  /** GOLDEN 2b — and it survives the byte round trip on its own. */
  it('preserves a rasterRef-only document across parse -> serialize', () => {
    const onDisk = [
      '{',
      '  "bgLayoutRef": null,',
      '  "paletteRef": null,',
      '  "rasterRef": "canopy_tint",',
      '  "sceneRef": null',
      '}',
      '',
    ].join('\n');
    expect(JSON.parse(onDisk).rasterRef).toBe('canopy_tint');
    expect(serializeSectionMeta(parseSectionMeta(onDisk))).toBe(onDisk);
  });

  /**
   * GOLDEN 3 (§8) — the EXPLICIT-NULL CLEAR. Absent and explicit-null are the
   * same state ("this section keeps its hand-authored raster channel"), exactly
   * as for `sceneRef`, and clearing the last ref must still suppress the write
   * so save.ts's exists-probe branch — not the content branch — is what runs.
   */
  it('an explicit-null rasterRef reads as the absent state, and clears', () => {
    const explicit = parseSectionMeta('{"rasterRef": null}');
    const absent = parseSectionMeta('{}');
    expect(explicit).toEqual(absent);          // the two spellings are ONE state
    expect(explicit.rasterRef).toBeNull();

    // Clearing the only ref suppresses the write entirely: an all-null meta is
    // the state that makes save.ts overwrite an existing sidecar with the
    // cleared body rather than emit content.
    expect(serializeSectionMeta({
      bgLayoutRef: null, paletteRef: null, rasterRef: null, sceneRef: null,
    })).toBeNull();
    // And the clear really is a CLEAR of something: the same document with the
    // ref set survives, so the null above is not just a serializer that never
    // emits.
    expect(serializeSectionMeta({
      bgLayoutRef: null, paletteRef: null, rasterRef: 'canopy_tint', sceneRef: null,
    })).not.toBeNull();
  });

  /**
   * The numeric-index hazard, restated for `rasterRef` because §3.1 states it
   * for `rasterRef` in its own words and cites THESE lines as the reason:
   * "Aurora's parser nulls a non-string value silently (section-meta.ts:29-30),
   * so `rasterRef: 3` presents to the author as an assignment that did not
   * stick." Pinned as CURRENT BEHAVIOUR on the contract's instruction — the
   * consumer is the party that refuses a non-string by name, not this parser.
   */
  it('reads a numeric rasterRef as null, silently — why the id is a string', () => {
    expect(parseSectionMeta('{"rasterRef": 3}').rasterRef).toBeNull();
    expect(parseSectionMeta('{"rasterRef": {"id": "canopy_tint"}}').rasterRef).toBeNull();
    // And the erasure that follows from it.
    expect(serializeSectionMeta(parseSectionMeta('{"rasterRef": 3}'))).toBeNull();
  });

  /**
   * A LEGACY sidecar — three keys, written before `rasterRef` existed — is
   * normalized, not refused: the absent key reads as null and comes back
   * explicit. This is the shape aeon's tree is full of TODAY, and it must not
   * lose its `sceneRef` on the way through.
   */
  it('a pre-rasterRef sidecar keeps its refs and gains an explicit null', () => {
    const legacy = [
      '{',
      '  "bgLayoutRef": "forest-1718000000",',
      '  "paletteRef": null,',
      '  "sceneRef": "canopy_dusk"',
      '}',
      '',
    ].join('\n');
    expect('rasterRef' in (JSON.parse(legacy) as object)).toBe(false); // the poison is real
    const parsed = parseSectionMeta(legacy);
    expect(parsed.bgLayoutRef).toBe('forest-1718000000');
    expect(parsed.sceneRef).toBe('canopy_dusk');
    expect(parsed.rasterRef).toBeNull();
    const written = serializeSectionMeta(parsed)!;
    expect(JSON.parse(written).rasterRef).toBeNull();
    expect(JSON.parse(written).sceneRef).toBe('canopy_dusk');
  });

  // ---- §5 canonical form: the sortedness gate (ROADMAP item 26) -------------
  // Contract §2.2 names this sidecar a document of the contract, so §5 binds
  // it: keys sorted alphabetically, scalar document pretty at indent 2. Before
  // this gate the writer was a hand-enumerated literal that HAPPENED to be
  // alphabetical; a fourth ref added in the natural place would have broken
  // §5 silently. Expectations below are derived from canonical-json.ts, never
  // typed — a typed string proves one input renders one way, not that the
  // writer agrees with the §5 chokepoint.

  describe('§5 canonical form', () => {
    const full: SectionMeta = {
      bgLayoutRef: 'forest-1718000000', paletteRef: 'OJZ_AltPal',
      rasterRef: 'canopy_tint', sceneRef: 'canopy_dusk',
    };

    it('emits exactly the canonical pretty form of its own content', () => {
      const text = serializeSectionMeta(full)!;
      // Independent derivation: parse the bytes back to a plain object and
      // re-canonicalize through the chokepoint. A writer whose key order or
      // indentation differs from §5 cannot equal this.
      const independent = canonicalJsonPretty(JSON.parse(text));
      expect(text).toBe(independent);
      // Anti-vacuous: the emitted key sequence really is the sorted one, and
      // the document really carries every ref the interface declares (a
      // one-key document is trivially sorted). The COUNT IS DERIVED from the
      // value under test, never typed — a typed `3` is exactly what a fourth
      // ref makes wrong, and the point of this row is to survive that.
      const keys = Object.keys(JSON.parse(text) as object);
      expect(keys.length).toBe(Object.keys(full).length);
      expect(keys.length).toBeGreaterThan(1);
      expect(keys).toEqual(Object.keys(canonicalKeyOrder(full) as object));
    });

    it('poison: a meta whose keys arrive out of order still serializes sorted', () => {
      // The interface's declaration order is bgLayoutRef, paletteRef,
      // rasterRef, sceneRef; build the value with insertion order REVERSED
      // (and via a cast so a type-widening refactor cannot silently narrow
      // this back).
      const reversed = {
        sceneRef: 'canopy_dusk', rasterRef: 'canopy_tint',
        paletteRef: 'OJZ_AltPal', bgLayoutRef: 'forest-1718000000',
      } as SectionMeta;
      expect(Object.keys(reversed))
        .toEqual(['sceneRef', 'rasterRef', 'paletteRef', 'bgLayoutRef']); // the poison is real
      const text = serializeSectionMeta(reversed)!;
      expect(text).toBe(canonicalJsonPretty(JSON.parse(text)));
      expect(text).toBe(serializeSectionMeta(full)); // insertion order is invisible in the bytes
      expect(Object.keys(JSON.parse(text) as object)).toEqual(Object.keys(canonicalKeyOrder(reversed) as object));
    });
  });

  /**
   * The wrong-type case, pinned as the CURRENT behaviour on the contract's
   * instruction rather than made loud. Both halves state it in these words:
   * "A present-but-non-string `sceneRef` also reads as `null`"
   * (schema §3), and it is the stated REASON a numeric scene index is
   * forbidden — "the parser's failure mode for a non-string value is a silent
   * null, not a loud reject ... do not later 'helpfully' switch this field to
   * an integer index" (consumer list §2.2). The silent null is the hazard the
   * string-id ruling routes around; it is not a defect to fix here.
   */
  it('reads a numeric sceneRef as null, silently — why the id is a string', () => {
    expect(parseSectionMeta('{"sceneRef": 3}').sceneRef).toBeNull();
    expect(parseSectionMeta('{"sceneRef": null}').sceneRef).toBeNull();
    expect(parseSectionMeta('{"sceneRef": {"id": "canopy_dusk"}}').sceneRef).toBeNull();
    // And the erasure that follows from it, which is what makes `sceneRef: 3`
    // present to the user as "the assignment didn't stick": the value is gone
    // from the very next serialization.
    expect(serializeSectionMeta(parseSectionMeta('{"sceneRef": 3}'))).toBeNull();
  });
});
