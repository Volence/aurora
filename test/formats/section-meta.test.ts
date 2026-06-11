import { describe, it, expect } from 'vitest';
import { serializeSectionMeta, parseSectionMeta } from '../../src/core/formats/section-meta';

describe('section meta sidecar ({prefix}.meta.json)', () => {
  it('round-trips bgLayoutRef and paletteRef', () => {
    const text = serializeSectionMeta({ bgLayoutRef: 'forest-1718000000', paletteRef: 'OJZ_AltPal' });
    expect(text).not.toBeNull();
    const meta = parseSectionMeta(text!);
    expect(meta).toEqual({ bgLayoutRef: 'forest-1718000000', paletteRef: 'OJZ_AltPal' });
  });

  it('round-trips a single non-null field (the other stays null)', () => {
    const text = serializeSectionMeta({ bgLayoutRef: 'forest-1', paletteRef: null });
    expect(text).not.toBeNull();
    expect(parseSectionMeta(text!)).toEqual({ bgLayoutRef: 'forest-1', paletteRef: null });
  });

  it('returns null when every field is null (callers skip the write)', () => {
    expect(serializeSectionMeta({ bgLayoutRef: null, paletteRef: null })).toBeNull();
  });

  it('parses missing/invalid fields as null (forward compatible)', () => {
    expect(parseSectionMeta('{}')).toEqual({ bgLayoutRef: null, paletteRef: null });
    expect(parseSectionMeta('{"bgLayoutRef": 7, "other": true}')).toEqual({ bgLayoutRef: null, paletteRef: null });
    expect(parseSectionMeta('null')).toEqual({ bgLayoutRef: null, paletteRef: null });
  });
});
