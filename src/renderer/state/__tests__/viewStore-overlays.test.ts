// The overlay set became SHARED state when classic's viewport stopped keeping
// its four toggles in component-local useState. Two things follow, and neither
// is visible to the type system:
//
//  - a key can be listed for an engine but misspelled, in which case the View
//    menu renders a checkbox bound to `undefined` and the toggle silently does
//    nothing;
//  - a key can be added to OverlayOptions and listed for NO engine, in which
//    case it is unreachable from the menu entirely.
//
// Both are one-character mistakes with no compile error and no runtime throw.

import { describe, it, expect } from 'vitest';
import { useViewStore, OVERLAY_KEYS_BY_ENGINE, type OverlayOptions } from '../viewStore';

const defaults = (): OverlayOptions => useViewStore.getState().overlays;

describe('overlay defaults', () => {
  it('shows the player start by default, as classic\'s local state did', () => {
    expect(defaults().showStart).toBe(true);
  });

  it('keeps the rest of classic\'s former local defaults', () => {
    // The three keys classic already shared a name with, so that moving its
    // toggles onto the store could not quietly change what a fresh act shows.
    expect(defaults().showObjects).toBe(true);
    expect(defaults().showCollision).toBe(false);
    expect(defaults().showCollisionAngles).toBe(false);
  });

  it('toggleOverlay flips showStart', () => {
    const before = defaults().showStart;
    useViewStore.getState().toggleOverlay('showStart');
    expect(defaults().showStart).toBe(!before);
    useViewStore.getState().toggleOverlay('showStart');
    expect(defaults().showStart).toBe(before);
  });
});

describe('OVERLAY_KEYS_BY_ENGINE', () => {
  const allKeys = Object.keys(defaults()) as (keyof OverlayOptions)[];

  it('lists only keys that actually exist on OverlayOptions', () => {
    for (const [engine, keys] of Object.entries(OVERLAY_KEYS_BY_ENGINE)) {
      for (const key of keys) {
        expect(allKeys, `${engine} lists a key that is not an overlay`).toContain(key);
      }
    }
  });

  it('reaches every overlay from at least one engine', () => {
    const listed = new Set(Object.values(OVERLAY_KEYS_BY_ENGINE).flat());
    const orphans = allKeys.filter((k) => !listed.has(k));
    // An overlay no engine lists cannot be toggled from the View menu at all.
    expect(orphans).toEqual([]);
  });

  it('gives the player start to classic and NOT to aeon', () => {
    // The reason the filter exists: aeon's level model has no spawn point, so an
    // unfiltered menu would show it a checkbox that renders nothing.
    expect(OVERLAY_KEYS_BY_ENGINE.s1).toContain('showStart');
    expect(OVERLAY_KEYS_BY_ENGINE.aeon).not.toContain('showStart');
  });

  it('keeps aeon-only overlays out of classic', () => {
    // Rings, the section grid and the BG-plane overlay are aeon concepts;
    // classic's viewport draws none of them.
    for (const key of ['showRings', 'showChunkGrid', 'showBgPlane'] as const) {
      expect(OVERLAY_KEYS_BY_ENGINE.s1).not.toContain(key);
      expect(OVERLAY_KEYS_BY_ENGINE.aeon).toContain(key);
    }
  });

  it('lists exactly the seven overlays classic\'s viewport draws', () => {
    // The four originally shared with classic's chip row, plus the priority
    // lens (per-8x8-tile VDP bit-15 overlay, feat/s1-priority-lens), the
    // animated-art play toggle (feat/s1-animated-art-playback), and sprite
    // occlusion (feat/s1-priority-occlusion — occlusion-correct previews,
    // default ON). The two lenses stay classic-only: aeon's tile words are a
    // different engine's format and its viewport has no
    // drawPriority/occlusion pass, so listing them there would be dead toggles.
    expect([...OVERLAY_KEYS_BY_ENGINE.s1].sort()).toEqual(
      ['occludeSprites', 'playAnimatedArt', 'showCollision', 'showCollisionAngles', 'showObjects', 'showPriority', 'showStart'],
    );
    expect(OVERLAY_KEYS_BY_ENGINE.aeon).not.toContain('showPriority');
    expect(OVERLAY_KEYS_BY_ENGINE.aeon).not.toContain('occludeSprites');
  });

  it('SHARES the play toggle with aeon — it drives BgAnim bands there', () => {
    // ROADMAP item 42. The two engines play different things off one key (the
    // OverlayOptions docblock says which), and the ruling chose this key
    // precisely because it already existed with the right default rather than
    // inventing a second playback mechanism.
    expect(OVERLAY_KEYS_BY_ENGINE.aeon).toContain('playAnimatedArt');
    expect(OVERLAY_KEYS_BY_ENGINE.s1).toContain('playAnimatedArt');
  });

  it('keeps the priority lens OFF by default, like the collision lens', () => {
    expect(defaults().showPriority).toBe(false);
  });

  it('keeps animated-art playback OFF by default (asked for, never ambient)', () => {
    expect(defaults().playAnimatedArt).toBe(false);
  });
});

describe('the screen frame (triage 2026-08-26 row G)', () => {
  it('is OFF by default — a reference the author asks for, like the lenses', () => {
    expect(defaults().showScreenFrame).toBe(false);
  });
  it('toggles through the same toggleOverlay the View menu uses', () => {
    useViewStore.getState().toggleOverlay('showScreenFrame');
    expect(defaults().showScreenFrame).toBe(true);
    useViewStore.getState().toggleOverlay('showScreenFrame');
    expect(defaults().showScreenFrame).toBe(false);
  });
  it('is reachable from aeon\'s View menu', () => {
    expect(OVERLAY_KEYS_BY_ENGINE.aeon).toContain('showScreenFrame');
  });
  it('keeps its anchor in the store, clamped to the world origin, for the session', () => {
    expect(useViewStore.getState().screenFrame).toEqual({ x: 0, y: 0 });
    useViewStore.getState().setScreenFrame(640, 224);
    expect(useViewStore.getState().screenFrame).toEqual({ x: 640, y: 224 });
    useViewStore.getState().setScreenFrame(-5, -5);
    expect(useViewStore.getState().screenFrame).toEqual({ x: 0, y: 0 });
  });
});
