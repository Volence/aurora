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
import type React from 'react';
import { useViewStore, OVERLAY_KEYS_BY_ENGINE, type OverlayOptions } from '../viewStore';
import ViewMenu from '../../shell/ViewMenu';
import { renderHooked } from '../../../test/render-hooked';

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
    // default ON).
    expect([...OVERLAY_KEYS_BY_ENGINE.s1].sort()).toEqual(
      ['occludeSprites', 'playAnimatedArt', 'showCollision', 'showCollisionAngles', 'showObjects', 'showPriority', 'showStart'],
    );
    // Sprite OCCLUSION stays classic-only: aeon's object previews have no
    // per-pixel priority mask, so the key would be a dead toggle there. The
    // priority LENS is a different matter and is now shared — see below.
    expect(OVERLAY_KEYS_BY_ENGINE.aeon).not.toContain('occludeSprites');
  });

  it('SHARES the priority lens with aeon: the owner could not see it there', () => {
    // 2026-08-28. The owner, from a play session: "No way to see what art on fg
    // is priority or not. Randomly sometimes sonic just goes behind a tile that
    // I wasn't aware was prioritised." The checkbox was not in the aeon menu at
    // all, which is why. It is ONE key with ONE label and ONE depiction
    // (canvas/tile-lens.ts) drawn from two data sides — not a second lens.
    expect(OVERLAY_KEYS_BY_ENGINE.aeon).toContain('showPriority');
    expect(OVERLAY_KEYS_BY_ENGINE.s1).toContain('showPriority');
  });

  it('SHARES the play toggle with aeon: it drives BgAnim bands there', () => {
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
  it('is OFF by default: a reference the author asks for, like the lenses', () => {
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

// ═══ THE REGIONS WASH (owner, 2026-09-16) ═══
//
// "Can we have it just toggleable if we want to see it exactly?" The thing he
// wants to see exactly is the LEVEL ART, so the key is a way to take Aurora's
// own wash off it. That inverts the posture every other row above asserts, and
// the inversion is the part worth holding in place.
describe('the regions wash', () => {
  it('arrives ON, which no other overlay in this record does', () => {
    // Not a lens over the subject: on the Regions facet the wash IS the
    // subject, so a facet that opened showing nothing would be the opposite of
    // what the toggle was asked for. The control is the row beside it: the
    // screen frame states the NORMAL posture, and if this assertion ever went
    // green by reading some other key, that one would have to be true as well.
    expect(defaults().showRegions).toBe(true);
    expect(defaults().showScreenFrame).toBe(false);
  });

  it('is reachable from aeon and absent from classic, which has no regions', () => {
    expect(OVERLAY_KEYS_BY_ENGINE.aeon).toContain('showRegions');

    // The half below is ABSENCE-SHAPED and vacuous on its own: an empty list, a
    // list that failed to load, and a list that spells the key some other way
    // all satisfy `not.toContain` identically. So pin the classic list down
    // first. It has content, and it holds a key that is certainly in it, which
    // makes the third line read "the list is populated and this key is not in
    // it" rather than "nothing was looked at".
    expect(OVERLAY_KEYS_BY_ENGINE.s1.length).toBeGreaterThan(0);
    expect(OVERLAY_KEYS_BY_ENGINE.s1).toContain('showObjects');
    expect(OVERLAY_KEYS_BY_ENGINE.s1).not.toContain('showRegions');
  });
});

/**
 * Every word the View menu puts in a checkbox row, in render order.
 *
 * Walks CHILDREN only. The `Menu` wrapper carries its own trigger in a `label`
 * PROP, and a walker that followed props would collect that too and let a row
 * pass on text no author sees in the list.
 */
function rowLabels(node: unknown, out: string[] = []): string[] {
  if (typeof node === 'string') {
    const text = node.trim();
    if (text) out.push(text);
    return out;
  }
  if (Array.isArray(node)) {
    for (const child of node) rowLabels(child, out);
    return out;
  }
  if (!node || typeof node !== 'object') return out;
  const el = node as React.ReactElement<{ children?: unknown }>;
  return el.props ? rowLabels(el.props.children, out) : out;
}

describe('the regions wash in the View menu', () => {
  // No project open, which is the branch that offers every key in the record
  // rather than one engine's slice. What is under test here is the LABEL, and
  // the aeon registration is the row above's job.
  const labels = (): string[] => {
    const menu = renderHooked(ViewMenu, {});
    try {
      return rowLabels(menu.el());
    } finally {
      menu.unmount();
    }
  };

  it('renders rows at all, so the two assertions below are not vacuous', () => {
    // The harness returning an empty tree, or a walker that followed the wrong
    // branch, would make every `toContain` below fail loudly and every
    // `not.toContain` pass silently. This row is the positive control for both.
    const rows = labels();
    expect(rows.length).toBeGreaterThan(0);
    expect(rows).toContain('Play animations');
  });

  it('gives it a label that says what unticking the box will do', () => {
    expect(labels()).toContain('Tint the ground by region');
  });

  it('and NOT the name `pretty()` would derive with no LABELS entry', () => {
    // `pretty()` falls back to `key.replace('show', '')` plus spacing, which for
    // this key is the single word "Regions" - the facet the author is already
    // standing in, saying nothing about what the box does. Asserting its
    // ABSENCE is what makes the row above fail rather than silently degrade if
    // the LABELS entry is ever deleted.
    expect(labels()).not.toContain('Regions');
  });
});
