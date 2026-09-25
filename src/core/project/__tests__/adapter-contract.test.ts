import { describe, it, expect } from 'vitest';
import {
  FACET_CAPABILITIES,
  type FacetCapability,
  type AeonProjectData,
  type ProjectHandle,
  type ClassicLevelAccess,
  type ZoneActRef,
} from '../adapter';

describe('adapter contract additions (stage 3)', () => {
  // ⚠ THIS LIST IS A VOCABULARY, NOT A FIXTURE. It is transcribed here on
  // purpose so that GROWING the facet vocabulary is a deliberate edit in two
  // places rather than a silent one — a new key reaches every profile, every
  // session record and every facet-bar gate, so the transcription is the
  // review point. `regions` was added 2026-09-16 with the Regions facet
  // (editor spec §7 row 6).
  it('FACET_CAPABILITIES enumerates the full declared facet vocabulary in order', () => {
    expect(FACET_CAPABILITIES).toEqual([
      'layout', 'art', 'objects', 'rings', 'collision', 'palette',
      'parallax', 'regions', 'events', 'preview', 'donors',
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

  it('ClassicLevelAccess.reservedTiles is optional: a minimal fake omitting it still satisfies the interface', () => {
    // Type-only shape check, same pattern as editableTileRange: an adapter (or
    // test fake) that never heard of object-art reservations still compiles.
    const minimal: ClassicLevelAccess = {
      list: () => [],
      read: async () => {
        throw new Error('unused');
      },
      write: async () => ({ written: [], skipped: [], errors: [] }),
    };
    expect(minimal.reservedTiles).toBeUndefined();
  });

  it('ClassicLevelAccess.reservedTiles, when present, returns a ReadonlySet or null', () => {
    // The "null = unknown = permissive" convention, mirrored from
    // editableTileRange — asserted here so a future edit to the return type
    // cannot silently drop the null branch.
    const ref: ZoneActRef = { zone: 'ghz', act: 1, label: 'GHZ 1', available: true };
    const withReservations: ClassicLevelAccess = {
      list: () => [ref],
      read: async () => {
        throw new Error('unused');
      },
      write: async () => ({ written: [], skipped: [], errors: [] }),
      reservedTiles: (r) => (r.zone === 'ghz' ? new Set([0x3b, 0x3c]) : null),
    };
    expect(withReservations.reservedTiles?.(ref)).toEqual(new Set([0x3b, 0x3c]));
    expect(withReservations.reservedTiles?.({ ...ref, zone: 'mz' })).toBeNull();
  });
});
