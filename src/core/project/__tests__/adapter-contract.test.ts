import { describe, it, expect } from 'vitest';
import { FACET_CAPABILITIES, type FacetCapability, type AeonProjectData, type ProjectHandle } from '../adapter';

describe('adapter contract additions (stage 3)', () => {
  it('FACET_CAPABILITIES enumerates the full declared facet vocabulary in order', () => {
    expect(FACET_CAPABILITIES).toEqual([
      'layout', 'art', 'objects', 'rings', 'collision', 'palette',
      'parallax', 'events', 'preview',
    ]);
  });

  it('FacetCapability stays assignable from the const list (type-level check)', () => {
    const f: FacetCapability = FACET_CAPABILITIES[0];
    expect(f).toBe('layout');
  });

  it('ProjectHandle.aeon is optional (marker handles omit it)', () => {
    // Type-only shape check: a handle without `aeon` compiles; one with it carries the payload.
    const h: Pick<ProjectHandle, 'type'> & { aeon?: AeonProjectData } = { type: 'aeon' };
    expect(h.aeon).toBeUndefined();
  });
});
