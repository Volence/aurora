// Classic port for the neutral MapStatusBar. Both s1 map facets render it
// (workspace/facets/s1-facets.tsx), but the port is a hook and the suite has no
// renderer, so these branches are the only thing standing between a typo and a
// status bar that is wired blind.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { classicScopeInfo, classicScopeTone, type ScopeDoc } from '../map-status-classic';
import type { ClassicLevelStatus } from '../../state/classicLevelStore';
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

// The old classic bar drew a failed load in T.error (ClassicProjectView.tsx);
// the neutral bar draws every scope string in T.textLo, which would have made
// the ONE state the user most needs to notice the quietest thing on screen.
// `scopeTone` is what carries the red across.
describe('classicScopeTone', () => {
  const STATUSES: readonly ClassicLevelStatus[] = ['idle', 'loading', 'ready', 'error'];

  it('is error only for a failed load of a selected act', () => {
    expect(classicScopeTone(REF, 'error')).toBe('error');
    expect(classicScopeTone(REF, 'loading')).toBe('normal');
    expect(classicScopeTone(REF, 'ready')).toBe('normal');
    expect(classicScopeTone(REF, 'idle')).toBe('normal');
  });

  it('stays normal with no act selected, even in the error state', () => {
    // classicScopeInfo says 'no act selected' there, not 'load failed' — a red
    // "no act selected" would announce a failure that is not being reported.
    expect(classicScopeTone(null, 'error')).toBe('normal');
  });

  // The two functions are separate so the string one keeps its narrow signature,
  // which means they CAN drift. This is the guard: the tone is red exactly when
  // the text says the load failed, over every (ref, status) pair there is.
  it('is red exactly when the text reads "load failed"', () => {
    for (const ref of [null, REF]) {
      for (const status of STATUSES) {
        expect(classicScopeTone(ref, status) === 'error')
          .toBe(classicScopeInfo(ref, status, null) === 'load failed');
      }
    }
  });
});

// `ownHintLine` is a claim about the FACETS, made in the port: "every classic
// map facet mounts a hint line of its own, so the bar must not add a generic
// one". Two files have to agree for that to be true, and only one of them says
// it — so this pairs the port's flag with the modules' actual ToolOptions slot.
// Drop the bar from either facet and the flag becomes a silent hole where the
// tool is explained nowhere at all.
describe('the bar defers because classic\'s map facets speak for themselves', () => {
  it('EVERY s1 map module mounts a ToolOptions hint line', async () => {
    // Derived from the registry rather than named one by one: the flag is a
    // claim about the whole set, and the set has changed four times in as many
    // weeks — layout+objects, then layout+palette, then all three, now all four
    // with collision. The palette module was written WITHOUT this bar until this
    // test failed, which is the hole the flag creates, exactly as described
    // above, on a facet whose only tool would then go unexplained.
    const [{ registerS1FacetModules }, { moduleFor, facetModules }, { S1_FACETS }] =
      await Promise.all([
        import('../../workspace/register-facets'),
        import('../../workspace/facet-registry'),
        import('../../../core/project/s1'),
      ]);
    facetModules.clear();
    registerS1FacetModules();
    const mapFacets = S1_FACETS.filter((f) => moduleFor('s1', f)?.mapOverlays === true);
    // The composer is not a map facet and has no such bar; if this ever empties,
    // the loop below would pass by testing nothing.
    expect(mapFacets).toEqual(['layout', 'objects', 'collision', 'palette']);
    for (const f of mapFacets) {
      expect(moduleFor('s1', f)?.ToolOptions, `s1/${f}`).toBeTypeOf('function');
    }
  });

  it('…and the port therefore suppresses the generic hint', () => {
    // Source-level: the port is a hook, and the suite has no renderer. Comments
    // stripped so the rationale above the field cannot satisfy the assertion.
    const src = readFileSync(join(__dirname, '..', 'map-status-classic.ts'), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
    expect(src).toMatch(/ownHintLine:\s*true/);
  });

  it('aeon does NOT suppress it — its map facets have no such bar', () => {
    const src = readFileSync(join(__dirname, '..', 'map-status-aeon.ts'), 'utf8');
    expect(src).not.toContain('ownHintLine');
  });
});
