// Classic port for the neutral MapStatusBar. Nothing renders this port yet — it
// lands before the workspace task that consumes it — so these branches are the
// only thing standing between a typo and a status bar that is wired blind.

import { describe, it, expect } from 'vitest';
import { classicScopeInfo } from '../map-status-classic';
import type { LevelDoc } from '../../../core/level-classic/model';
import type { ZoneActRef } from '../../../core/project/adapter';

const REF: ZoneActRef = { zone: 'GHZ', act: 1, label: 'Green Hill 1', available: true };

/** Only the four counts the bar reads; the rest of a LevelDoc is irrelevant to
 *  it, so the fixture stays a shape rather than a whole level. */
function doc(fg: { width: number; height: number }, chunks: number, blocks: number, objects: number): LevelDoc {
  return {
    fg: { ...fg, cells: new Uint8Array(fg.width * fg.height) },
    chunks: Array.from({ length: chunks }, () => ({ cells: [] })),
    blocks: Array.from({ length: blocks }, () => ({ cells: [] })),
    objects: Array.from({ length: objects }, () => ({})),
  } as unknown as LevelDoc;
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

  it('reads the FG plane, not BG — the layout dimensions the map is drawn at', () => {
    const d = doc({ width: 40, height: 8 }, 0, 0, 0);
    (d as { bg: unknown }).bg = { width: 99, height: 99, cells: new Uint8Array(0) };
    expect(classicScopeInfo(REF, 'ready', d)).toContain('40×8 chunks');
  });
});
