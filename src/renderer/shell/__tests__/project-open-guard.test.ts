import { describe, it, expect } from 'vitest';
import { planProjectOpen } from '../project-open-guard';

describe('planProjectOpen', () => {
  it('proceeds when nothing is dirty', () => {
    expect(planProjectOpen({ classicDirty: false, aeonDirty: false, spriteArtPending: false }))
      .toEqual({ kind: 'proceed' });
  });
  it.each([
    ['classic level edits', { classicDirty: true, aeonDirty: false, spriteArtPending: false }],
    ['aeon project edits', { classicDirty: false, aeonDirty: true, spriteArtPending: false }],
    ['checked-out sprite art', { classicDirty: false, aeonDirty: false, spriteArtPending: true }],
  ] as const)('asks before opening over %s', (_label, snap) => {
    expect(planProjectOpen(snap)).toEqual({ kind: 'confirm' });
  });
});
