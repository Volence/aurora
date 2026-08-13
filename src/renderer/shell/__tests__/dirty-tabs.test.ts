import { describe, it, expect } from 'vitest';
import { tabHasDirtyDot, type DirtySnapshot } from '../dirty-tabs';

const base: DirtySnapshot = {
  classicOpen: false, classicRef: null, classicDirty: false,
  aeonOpen: false, aeonDirty: false, spriteArtPending: false,
};

describe('tabHasDirtyDot', () => {
  it('home and tool tabs never dot', () => {
    const s = { ...base, classicOpen: true, classicDirty: true, classicRef: { zone: 'ghz', act: 1 } };
    expect(tabHasDirtyDot('home', 'home', s)).toBe(false);
    expect(tabHasDirtyDot('tool:project-setup', 'tool', s)).toBe(false);
  });

  it('classic: only the LOADED act tab dots, and only when dirty', () => {
    const s = { ...base, classicOpen: true, classicDirty: true, classicRef: { zone: 'ghz', act: 1 } };
    expect(tabHasDirtyDot('level:ghz:1', 'level', s)).toBe(true);
    expect(tabHasDirtyDot('level:mz:2', 'level', s)).toBe(false);
    expect(tabHasDirtyDot('level:ghz:1', 'level', { ...s, classicDirty: false })).toBe(false);
  });

  it('classic: pending sprite-art edits dot the loaded act tab too', () => {
    const s = {
      ...base, classicOpen: true, classicRef: { zone: 'ghz', act: 1 },
      spriteArtPending: true,
    };
    expect(tabHasDirtyDot('level:ghz:1', 'level', s)).toBe(true);
  });

  it('aeon: project-wide dirtiness dots every level tab (honest aggregate, spec §10)', () => {
    const s = { ...base, aeonOpen: true, aeonDirty: true };
    expect(tabHasDirtyDot('level:ehz:act1', 'level', s)).toBe(true);
    expect(tabHasDirtyDot('level:cpz:act2', 'level', s)).toBe(true);
    expect(tabHasDirtyDot('level:ehz:act1', 'level', { ...s, aeonDirty: false })).toBe(false);
  });

  it('no project → no dots', () => {
    expect(tabHasDirtyDot('level:ghz:1', 'level', base)).toBe(false);
  });
});
