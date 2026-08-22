import { describe, it, expect } from 'vitest';
import { serializeSectionMeta, parseSectionMeta } from '../../src/core/formats/section-meta';

describe('section meta sidecar ({prefix}.meta.json)', () => {
  it('round-trips bgLayoutRef and paletteRef', () => {
    const text = serializeSectionMeta({ bgLayoutRef: 'forest-1718000000', paletteRef: 'OJZ_AltPal', sceneRef: null });
    expect(text).not.toBeNull();
    const meta = parseSectionMeta(text!);
    expect(meta).toEqual({ bgLayoutRef: 'forest-1718000000', paletteRef: 'OJZ_AltPal', sceneRef: null });
  });

  it('round-trips a single non-null field (the others stay null)', () => {
    const text = serializeSectionMeta({ bgLayoutRef: 'forest-1', paletteRef: null, sceneRef: null });
    expect(text).not.toBeNull();
    expect(parseSectionMeta(text!)).toEqual({ bgLayoutRef: 'forest-1', paletteRef: null, sceneRef: null });
  });

  it('returns null when every field is null (callers skip the write)', () => {
    expect(serializeSectionMeta({ bgLayoutRef: null, paletteRef: null, sceneRef: null })).toBeNull();
  });

  it('parses missing/invalid fields as null (forward compatible)', () => {
    expect(parseSectionMeta('{}')).toEqual({ bgLayoutRef: null, paletteRef: null, sceneRef: null });
    expect(parseSectionMeta('{"bgLayoutRef": 7, "other": true}')).toEqual({ bgLayoutRef: null, paletteRef: null, sceneRef: null });
    expect(parseSectionMeta('null')).toEqual({ bgLayoutRef: null, paletteRef: null, sceneRef: null });
  });

  // ---- sceneRef: the effects-arc assignment ref ----------------------------
  // Key name and type are the contract's, not this repo's: a per-section
  // `sceneRef` holding a STRING scene id or null, empyrean
  // docs/AURORA_EFFECTS_SCHEMA.md §3 at 1326ceb, mirrored in aeon
  // tools/EFFECTS_CONSUMER_CONTRACT.md §2.2 at 00607dd5. (`effectsRef` is
  // reserved for a wave-2 preset ref, schema §7 — deliberately not this key.)

  it('sceneRef alone is enough to make the sidecar worth writing', () => {
    // The write condition enumerates every ref; a sceneRef-only section must
    // not fall through to "all default, write nothing".
    const text = serializeSectionMeta({ bgLayoutRef: null, paletteRef: null, sceneRef: 'canopy_dusk' });
    expect(text).not.toBeNull();
    expect(parseSectionMeta(text!)).toEqual({ bgLayoutRef: null, paletteRef: null, sceneRef: 'canopy_dusk' });
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
      '  "sceneRef": "canopy_dusk"',
      '}',
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
   * two refs alone kept the file non-empty and byte-stable; this one cannot.
   */
  it('preserves a sceneRef-only document across parse -> serialize', () => {
    const onDisk = [
      '{',
      '  "bgLayoutRef": null,',
      '  "paletteRef": null,',
      '  "sceneRef": "canopy_dusk"',
      '}',
    ].join('\n');
    expect(JSON.parse(onDisk).sceneRef).toBe('canopy_dusk');
    expect(serializeSectionMeta(parseSectionMeta(onDisk))).toBe(onDisk);
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
