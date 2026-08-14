// Classic port for the neutral MapStatusBar. Nothing renders this port yet — it
// lands before the workspace task that consumes it — so these branches are the
// only thing standing between a typo and a status bar that is wired blind.

import { describe, it, expect } from 'vitest';
import { classicScopeInfo, type ScopeDoc } from '../map-status-classic';
import type { ZoneActRef } from '../../../core/project/adapter';

const REF: ZoneActRef = { zone: 'GHZ', act: 1, label: 'Green Hill 1', available: true };

const OBJECT = { x: 0, y: 0, xflip: false, yflip: false, respawn: false, id: 0, subtype: 0 };

/**
 * Only what the scope line reads — which is exactly what `ScopeDoc` says, so
 * this is type-checked against the real LevelDoc field types with NO cast. A
 * rename or retype of `fg`/`chunks`/`blocks`/`objects` breaks the build here
 * rather than letting a green test hide it.
 */
function doc(fg: { width: number; height: number }, chunks: number, blocks: number, objects: number): ScopeDoc {
  return {
    fg: { ...fg, cells: new Uint8Array(fg.width * fg.height) },
    chunks: Array.from({ length: chunks }, () => ({ cells: [] })),
    blocks: Array.from({ length: blocks }, () => ({ cells: [] })),
    objects: Array.from({ length: objects }, () => ({ ...OBJECT })),
  };
}

describe('classicScopeInfo', () => {
  it('says nothing is open when no act is selected, whatever the load state', () => {
    expect(classicScopeInfo(null, 'idle', null)).toBe('no act selected');
    expect(classicScopeInfo(null, 'ready', doc({ width: 1, height: 1 }, 0, 0, 0)))
      .toBe('no act selected');
  });

  it('reports the two non-terminal load states the old bar reported', () => {
    expect(classicScopeInfo(REF, 'loading', null)).toBe('loading…');
    expect(classicScopeInfo(REF, 'error', null)).toBe('load failed');
  });

  it('shows nothing rather than a lie when the doc is not there yet', () => {
    // 'idle' with an act selected, and the impossible-but-cheap-to-guard
    // ready-without-a-doc: neither has counts to report.
    expect(classicScopeInfo(REF, 'idle', null)).toBe('');
    expect(classicScopeInfo(REF, 'ready', null)).toBe('');
  });

  it('reports the act shape and contents once loaded', () => {
    expect(classicScopeInfo(REF, 'ready', doc({ width: 40, height: 8 }, 3, 5, 7)))
      .toBe('40×8 chunks · 3 chunks · 5 blocks · 7 objects');
  });

  it('reports the DECLARED grid size, not the payload length', () => {
    // The two differ for four real S1 files (LayoutGrid's header note: some carry
    // a trailing byte, ending.bin is truncated), so cells.length is not the shape.
    const d = doc({ width: 40, height: 8 }, 0, 0, 0);
    d.fg.cells = new Uint8Array(321);
    expect(classicScopeInfo(REF, 'ready', d)).toContain('40×8 chunks');
  });

  // Reading BG's dimensions instead of FG's is no longer testable: ScopeDoc does
  // not include `bg`, so that mistake is now a compile error rather than a wrong
  // string. That is the point of narrowing the parameter.
});
