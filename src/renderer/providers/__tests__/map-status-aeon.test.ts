// Aeon port for the neutral MapStatusBar. The hook is store reads; the one
// decision it makes is the stamp tool's context line, which is what is tested
// here.

import { describe, it, expect } from 'vitest';
import { sectionScope, stampContext } from '../map-status-aeon';

describe('stampContext', () => {
  it('says the library is empty before it says nothing is selected', () => {
    // Order matters: with no chunks at all, "select a chunk from the library
    // panel" points the user at a panel that has nothing in it.
    expect(stampContext(0, null)).toBe('No chunks loaded; import chunks first');
    expect(stampContext(0, 'grass')).toBe('No chunks loaded; import chunks first');
  });

  it('asks for a selection once there is a library to select from', () => {
    expect(stampContext(12, null)).toBe('Select a chunk from the library panel');
  });

  it('names the armed chunk and aeon\'s art-only modifier', () => {
    // The Alt modifier is aeon's stamp ONLY — classic does not implement it — so
    // it must stay on this engine-specific line and out of tool-meta's shared
    // hint, which classic's chip row also shows.
    expect(stampContext(12, 'grass')).toBe('Chunk: grass · Alt: art only');
  });
});

// O31 — the map's own admission that it is not showing what the section names.
describe('sectionScope', () => {
  const LIB = [{ id: 'bg-sky' }];

  it('is the plain index when the section resolves, or is deliberately unbound', () => {
    // ANTI-VACUOUS both ways: a suffix appended always would fail here, and a
    // suffix never appended would fail the row below.
    expect(sectionScope(3, null, LIB)).toBe('Section 3');
    expect(sectionScope(3, 'bg-sky', LIB)).toBe('Section 3');
  });

  it('names the missing entry AND what is on screen instead', () => {
    // The id alone would leave the reader to work out whether anything is
    // wrong; "missing" alone would not say which one. Both, or the line is
    // another thing to squint at.
    const s = sectionScope(0, 'ingame-forest-v15-1786630615596', LIB);
    expect(s).toContain('ingame-forest-v15-1786630615596');
    expect(s).toContain('missing');
    expect(s).toContain('act default');
    expect(s.startsWith('Section 0')).toBe(true);
  });

  it('an EMPTY library is the clean-clone case, not a reason to go quiet', () => {
    // aeon's tracked manifest names 17 entries and tracks none of their bodies,
    // so `bgLibrary` really is `[]` there while `bgLayoutRef` really is set.
    expect(sectionScope(0, 'anything', [])).toContain('missing');
    expect(sectionScope(0, null, [])).toBe('Section 0');
  });
});
