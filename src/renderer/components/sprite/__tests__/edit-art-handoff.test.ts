// Task B2 / Task 14 — edit-art handoff wiring. Verifies the classic object UI →
// sprite-doc handoff resolves the correct art linkage and opens it through the
// SAME discovered-set path a manual pick uses, with the right absolute base dir +
// disasm-relative paths, frame preselection, and standalone-palette seeding.
// The opener is stubbed via the module's injectable seam (mirrors the classic
// stores' __set…ForTest convention), so no window.api / canvas is needed.
//
// editObjectArtCheckout retargets the singleton sprite editor and derives its
// zone from the open classic level's `ref` (no longer a caller argument); the
// thin editObjectArt wrapper additionally surfaces the sprite-doc tab.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  editObjectArt,
  editObjectArtCheckout,
  __setSpriteSetOpenerForTest,
  __resetSpriteSetOpenerForTest,
} from '../export-sprite';
import type { DiscoveredSpriteSet } from '../../../../core/import/sprite-discovery';
import type { CompressionKind } from '../../../../core/compress';
import { useClassicProjectStore } from '../../../state/classicProjectStore';
import { useClassicLevelStore } from '../../../state/classicLevelStore';
import { useSpriteStore } from '../../../state/spriteStore';
import { useSessionStore } from '../../../state/sessionStore';
import { markSpriteDocLoaded, getLoadedSpriteDocId } from '../../../shell/tab-activation';
import { HOME_TAB } from '../../../../core/shell/session';
import { createBuffer } from '../../../../core/art/pixel-ops';

const DIR = '/home/user/s1disasm';

type OpenCall = { baseDir: string; set: DiscoveredSpriteSet; comp: CompressionKind };

/** A stub opener that records its call and loads `frameCount` blank frames so
 *  frame preselection (selectFrame) has real frames to clamp against. Returns
 *  true to mirror a successful real open. */
function stubOpener(calls: OpenCall[], frameCount = 4) {
  return async (baseDir: string, set: DiscoveredSpriteSet, comp: CompressionKind) => {
    calls.push({ baseDir, set, comp });
    const frames = Array.from({ length: frameCount }, () => createBuffer(16, 16));
    useSpriteStore.getState().loadSprite(frames, [], 8, 8);
    return true;
  };
}

/** Point the classic level store at an open act in `zone` (the checkout derives
 *  its zone from this ref). */
function setZone(zone: string): void {
  useClassicLevelStore.setState({ ref: { zone, act: 1, label: `${zone} 1`, available: true }, doc: null });
}

beforeEach(() => {
  useClassicProjectStore.setState({ dir: DIR, status: 'open' });
  setZone('ghz');
  useSpriteStore.getState().newSprite(32, 32);
  useSessionStore.getState().replace({ tabs: [HOME_TAB], activeId: HOME_TAB.id });
  markSpriteDocLoaded(null);
});

afterEach(() => {
  __resetSpriteSetOpenerForTest();
  vi.restoreAllMocks();
});

describe('editObjectArtCheckout', () => {
  it('opens a base-linked id through the discovered-set path with correct paths', async () => {
    const calls: OpenCall[] = [];
    __setSpriteSetOpenerForTest(stubOpener(calls));

    const ok = await editObjectArtCheckout(0x0d); // Signpost (base linkage)

    expect(ok).toBe(true);
    expect(getLoadedSpriteDocId()).toBeNull(); // checkout is load-only — the winning caller owns the marker
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
    setZone('slz');
    await editObjectArtCheckout(0x1c);
    expect(calls[0].set).toMatchObject({ mappings: '_maps/Scenery.asm', art: 'artnem/SLZ Cannon.nem' });

    calls.length = 0;
    setZone('ghz');
    await editObjectArtCheckout(0x1c);
    expect(calls[0].set).toMatchObject({ mappings: '_maps/Bridge.asm', art: 'artnem/GHZ Bridge.nem' });
  });

  it('passes uncompressed compression for an uncompressed linkage', async () => {
    const calls: OpenCall[] = [];
    __setSpriteSetOpenerForTest(stubOpener(calls));

    await editObjectArtCheckout(0x4b); // Giant Ring (uncompressed)
    expect(calls[0].comp).toBe('uncompressed');
  });

  it('preselects the objdef declared frame', async () => {
    const calls: OpenCall[] = [];
    __setSpriteSetOpenerForTest(stubOpener(calls, 4));

    await editObjectArtCheckout(0x7d); // Point bonus, declared frame 3
    expect(useSpriteStore.getState().currentIndex).toBe(3);
  });

  it('seeds a standalone palette from the classic doc declared line', async () => {
    __setSpriteSetOpenerForTest(stubOpener([]));
    // Signpost declares pal line 0. Give line 0 a distinctive first non-zero color.
    const line0 = new Uint16Array(16);
    line0[1] = 0x0eee; // near-white
    useClassicLevelStore.setState({ ref: { zone: 'ghz', act: 1, label: 'ghz 1', available: true }, doc: { palettes: [line0] } as never });

    await editObjectArtCheckout(0x0d);

    const s = useSpriteStore.getState();
    expect(s.paletteMode).toBe('standalone');
    expect(s.standalonePalette).toHaveLength(16);
    expect(s.standalonePalette[0].a).toBe(0); // index 0 forced transparent
    expect(s.standalonePalette[1].a).toBe(255);
    expect(s.standalonePalette[1].r).toBeGreaterThan(0);
  });

  it('returns false when the open fails (checkout never marks in either case)', async () => {
    // Opener reports failure (a toast fired in the real path) — the user must be
    // left where they were, not stranded on a blank/stale sprite.
    __setSpriteSetOpenerForTest(async () => false);

    const ok = await editObjectArtCheckout(0x0d);

    expect(ok).toBe(false);
    expect(getLoadedSpriteDocId()).toBeNull();
  });

  it('is a no-op for an unlinked id (no open, no loaded doc)', async () => {
    const calls: OpenCall[] = [];
    __setSpriteSetOpenerForTest(stubOpener(calls));

    const ok = await editObjectArtCheckout(0x02); // not linked in any zone

    expect(ok).toBe(false);
    expect(calls).toHaveLength(0);
    expect(getLoadedSpriteDocId()).toBeNull();
  });

  it('is a no-op when no classic project dir is open', async () => {
    useClassicProjectStore.setState({ dir: null });
    const calls: OpenCall[] = [];
    __setSpriteSetOpenerForTest(stubOpener(calls));

    const ok = await editObjectArtCheckout(0x0d); // linked, but no dir
    expect(ok).toBe(false);
    expect(calls).toHaveLength(0);
    expect(getLoadedSpriteDocId()).toBeNull();
  });

  it('is a no-op when no classic level is open (no zone)', async () => {
    useClassicLevelStore.setState({ ref: null, doc: null });
    const calls: OpenCall[] = [];
    __setSpriteSetOpenerForTest(stubOpener(calls));

    const ok = await editObjectArtCheckout(0x0d);
    expect(ok).toBe(false);
    expect(calls).toHaveLength(0);
    expect(getLoadedSpriteDocId()).toBeNull();
  });
});

describe('editObjectArt wrapper', () => {
  it('opens and focuses a sprite-doc tab after a successful checkout', async () => {
    __setSpriteSetOpenerForTest(stubOpener([]));

    const ok = await editObjectArt(0x0d); // Signpost

    expect(ok).toBe(true);
    expect(getLoadedSpriteDocId()).toBe('doc:sprite:s1:13'); // the wrapper owns the marker
    const session = useSessionStore.getState();
    expect(session.activeId).toBe('doc:sprite:s1:13');
    expect(session.tabs.find((t) => t.id === 'doc:sprite:s1:13')).toMatchObject({
      kind: 'sprite-doc', title: 'Signpost',
    });
  });

  it('opens no tab when the checkout fails', async () => {
    __setSpriteSetOpenerForTest(async () => false);

    const ok = await editObjectArt(0x0d);

    expect(ok).toBe(false);
    expect(useSessionStore.getState().tabs.some((t) => t.kind === 'sprite-doc')).toBe(false);
  });
});
