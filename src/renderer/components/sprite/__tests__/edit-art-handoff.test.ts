// Task B2 — edit-art handoff wiring. Verifies the classic object UI → Sprite mode
// handoff resolves the correct art linkage and opens it through the SAME
// discovered-set path a manual pick uses, with the right absolute base dir +
// disasm-relative paths, frame preselection, and standalone-palette seeding.
// The opener is stubbed via the module's injectable seam (mirrors the classic
// stores' __set…ForTest convention), so no window.api / canvas is needed.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  editObjectArt,
  __setSpriteSetOpenerForTest,
  __resetSpriteSetOpenerForTest,
} from '../export-sprite';
import type { DiscoveredSpriteSet } from '../../../../core/import/sprite-discovery';
import type { CompressionKind } from '../../../../core/compress';
import { useEditorStore } from '../../../state/editorStore';
import { useClassicProjectStore } from '../../../state/classicProjectStore';
import { useClassicLevelStore } from '../../../state/classicLevelStore';
import { useSpriteStore } from '../../../state/spriteStore';
import { createBuffer } from '../../../../core/art/pixel-ops';

const DIR = '/home/user/s1disasm';

type OpenCall = { baseDir: string; set: DiscoveredSpriteSet; comp: CompressionKind };

/** A stub opener that records its call and loads `frameCount` blank frames so
 *  frame preselection (selectFrame) has real frames to clamp against. */
function stubOpener(calls: OpenCall[], frameCount = 4) {
  return async (baseDir: string, set: DiscoveredSpriteSet, comp: CompressionKind) => {
    calls.push({ baseDir, set, comp });
    const frames = Array.from({ length: frameCount }, () => createBuffer(16, 16));
    useSpriteStore.getState().loadSprite(frames, [], 8, 8);
  };
}

beforeEach(() => {
  useEditorStore.getState().setAppMode('map');
  useClassicProjectStore.setState({ dir: DIR, status: 'open' });
  useClassicLevelStore.setState({ doc: null });
  useSpriteStore.getState().newSprite(32, 32);
});

afterEach(() => {
  __resetSpriteSetOpenerForTest();
  vi.restoreAllMocks();
});

describe('editObjectArt handoff', () => {
  it('opens a base-linked id through the discovered-set path with correct paths', async () => {
    const calls: OpenCall[] = [];
    __setSpriteSetOpenerForTest(stubOpener(calls));

    const ok = await editObjectArt(0x0d, 'ghz'); // Signpost (base linkage)

    expect(ok).toBe(true);
    expect(useEditorStore.getState().appMode).toBe('sprite');
    expect(calls).toHaveLength(1);
    expect(calls[0].baseDir).toBe(DIR);
    expect(calls[0].comp).toBe('nemesis');
    expect(calls[0].set).toMatchObject({
      game: 's1',
      mappings: '_maps/Signpost.asm',
      art: 'artnem/Signpost.nem',
      name: 'Signpost',
    });
  });

  it('resolves a per-zone override id to the zone-specific art', async () => {
    const calls: OpenCall[] = [];
    __setSpriteSetOpenerForTest(stubOpener(calls));

    // $1C is GHZ "Bridge stump" but SLZ "Fireball Thrower" — the zone wins.
    await editObjectArt(0x1c, 'slz');
    expect(calls[0].set).toMatchObject({ mappings: '_maps/Scenery.asm', art: 'artnem/SLZ Cannon.nem' });

    calls.length = 0;
    await editObjectArt(0x1c, 'ghz');
    expect(calls[0].set).toMatchObject({ mappings: '_maps/Bridge.asm', art: 'artnem/GHZ Bridge.nem' });
  });

  it('passes uncompressed compression for an uncompressed linkage', async () => {
    const calls: OpenCall[] = [];
    __setSpriteSetOpenerForTest(stubOpener(calls));

    await editObjectArt(0x4b, 'ghz'); // Giant Ring (uncompressed)
    expect(calls[0].comp).toBe('uncompressed');
  });

  it('preselects the objdef declared frame', async () => {
    const calls: OpenCall[] = [];
    __setSpriteSetOpenerForTest(stubOpener(calls, 4));

    await editObjectArt(0x7d, 'ghz'); // Point bonus, declared frame 3
    expect(useSpriteStore.getState().currentIndex).toBe(3);
  });

  it('seeds a standalone palette from the classic doc declared line', async () => {
    __setSpriteSetOpenerForTest(stubOpener([]));
    // Signpost declares pal line 0. Give line 0 a distinctive first non-zero color.
    const line0 = new Uint16Array(16);
    line0[1] = 0x0eee; // near-white
    useClassicLevelStore.setState({ doc: { palettes: [line0] } as never });

    await editObjectArt(0x0d, 'ghz');

    const s = useSpriteStore.getState();
    expect(s.paletteMode).toBe('standalone');
    expect(s.standalonePalette).toHaveLength(16);
    expect(s.standalonePalette[0].a).toBe(0); // index 0 forced transparent
    expect(s.standalonePalette[1].a).toBe(255);
    expect(s.standalonePalette[1].r).toBeGreaterThan(0);
  });

  it('is a no-op for an unlinked id (no open, no mode switch)', async () => {
    const calls: OpenCall[] = [];
    __setSpriteSetOpenerForTest(stubOpener(calls));

    const ok = await editObjectArt(0x02, 'ghz'); // not linked in any zone

    expect(ok).toBe(false);
    expect(calls).toHaveLength(0);
    expect(useEditorStore.getState().appMode).toBe('map');
  });

  it('is a no-op when no classic project dir is open', async () => {
    useClassicProjectStore.setState({ dir: null });
    const calls: OpenCall[] = [];
    __setSpriteSetOpenerForTest(stubOpener(calls));

    const ok = await editObjectArt(0x0d, 'ghz'); // linked, but no dir
    expect(ok).toBe(false);
    expect(calls).toHaveLength(0);
    expect(useEditorStore.getState().appMode).toBe('map');
  });
});
