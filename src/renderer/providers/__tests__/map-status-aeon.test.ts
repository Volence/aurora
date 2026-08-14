// Aeon port for the neutral MapStatusBar. The hook is store reads; the one
// decision it makes is the stamp tool's context line, which is what is tested
// here.

import { describe, it, expect } from 'vitest';
import { stampContext } from '../map-status-aeon';

describe('stampContext', () => {
  it('says the library is empty before it says nothing is selected', () => {
    // Order matters: with no chunks at all, "select a chunk from the library
    // panel" points the user at a panel that has nothing in it.
    expect(stampContext(0, null)).toBe('No chunks loaded — import chunks first');
    expect(stampContext(0, 'grass')).toBe('No chunks loaded — import chunks first');
  });

  it('asks for a selection once there is a library to select from', () => {
    expect(stampContext(12, null)).toBe('Select a chunk from the library panel');
  });

  it('names the armed chunk and aeon\'s art-only modifier', () => {
    // The Alt modifier is aeon's stamp ONLY — classic does not implement it — so
    // it must stay on this engine-specific line and out of tool-meta's shared
    // hint, which classic's chip row also shows.
    expect(stampContext(12, 'grass')).toBe('Chunk: grass — Alt: art only');
  });
});
