import { describe, it, expect } from 'vitest';
import { tabHasDirtyDot, type DirtySnapshot } from '../dirty-tabs';

const base: DirtySnapshot = {
  classicOpen: false, classicRef: null, classicDirty: false,
  aeonOpen: false, aeonDirty: false, dirtySpriteDocIds: [],
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

  it('classic: a checked-out sprite does NOT dot its origin level tab (it dots the sprite-doc tab instead)', () => {
    // Sprite editor is dirty, but the level itself is clean — the level tab stays undotted.
    const s = {
      ...base, classicOpen: true, classicRef: { zone: 'ghz', act: 1 },
      dirtySpriteDocIds: ['doc:sprite:s1:13'],
    };
    expect(tabHasDirtyDot('level:ghz:1', 'level', s)).toBe(false);
  });

  it('sprite-doc: a tab dots exactly when its own document has unsaved edits', () => {
    const s = { ...base, dirtySpriteDocIds: ['doc:sprite:s1:13'] };
    expect(tabHasDirtyDot('doc:sprite:s1:13', 'sprite-doc', s)).toBe(true);
    // A clean sprite-doc tab never dots.
    expect(tabHasDirtyDot('doc:sprite:aeon:motobug', 'sprite-doc', s)).toBe(false);
    // Nothing dirty at all → no dot.
    expect(tabHasDirtyDot('doc:sprite:s1:13', 'sprite-doc', base)).toBe(false);
  });

  it('sprite-doc: a BACKGROUND (parked) document dots its tab too', () => {
    // The regression this guards: dotting only the checked-out document left a
    // dirty background sprite tab looking saved, so closing it discarded edits
    // with no warning at all.
    const s = { ...base, dirtySpriteDocIds: ['doc:sprite:s1:13', 'doc:sprite:aeon:motobug'] };
    expect(tabHasDirtyDot('doc:sprite:s1:13', 'sprite-doc', s)).toBe(true);
    expect(tabHasDirtyDot('doc:sprite:aeon:motobug', 'sprite-doc', s)).toBe(true);
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
