import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { claimCollisionOverlay, type CollisionOverlayPort } from '../collision-overlay-scope';

function fakePort(startOn = false) {
  const calls: string[] = [];
  let on = startOn;
  const port: CollisionOverlayPort = {
    anyOn: () => on,
    show: (p) => { on = true; calls.push(`show:${p}`); },
    hideAll: () => { on = false; calls.push('hideAll'); },
  };
  return { port, calls, isOn: () => on };
}

describe('the collision overlay is scoped to the facet that turns it on', () => {
  it('turns it on for a map palette, and back off on the way out', () => {
    // The leak: without the cleanup, one visit to the Collision facet left the
    // map collision-shaded (and the floating COLLISION legend drawn over it) on
    // Layout, Objects, Rings and Palette for the rest of the session.
    const f = fakePort(false);
    const cleanup = claimCollisionOverlay(f.port, 'a', 'map');
    expect(f.calls).toEqual(['show:a']);
    expect(cleanup).not.toBeNull();
    cleanup!();
    expect(f.calls).toEqual(['show:a', 'hideAll']);
    expect(f.isOn()).toBe(false);
  });

  it('shows the plane being painted', () => {
    const f = fakePort(false);
    claimCollisionOverlay(f.port, 'b', 'map');
    expect(f.calls).toEqual(['show:b']);
  });

  it('leaves a view the USER set up completely alone', () => {
    // Both halves matter: it must not override the user's A/B diff on entry,
    // and — the half a naive symmetric cleanup gets wrong — it must not clear
    // it on exit either, because it never owned it.
    const f = fakePort(true);
    expect(claimCollisionOverlay(f.port, 'a', 'map')).toBeNull();
    expect(f.calls).toEqual([]);
    expect(f.isOn()).toBe(true);
  });

  it('claims nothing from the ART variant', () => {
    // The composer canvas does not read viewStore.overlays, so switching a MAP
    // overlay on from there is a change invisible from the screen that made it
    // — and it used to persist to every map facet afterwards.
    const f = fakePort(false);
    expect(claimCollisionOverlay(f.port, 'a', 'art')).toBeNull();
    expect(f.calls).toEqual([]);
    expect(f.isOn()).toBe(false);
  });
});

describe('CollisionPalette routes its mount effect through it', () => {
  // Vacuity guard: the function above can be correct and unused, and the
  // component is .tsx so nothing else in this suite renders it.
  const source = readFileSync(join(__dirname, '..', 'CollisionPalette.tsx'), 'utf8');

  it('calls it with the variant, and RETURNS the cleanup from the effect', () => {
    expect(source).toContain('claimCollisionOverlay(');
    expect(source).toMatch(/return claimCollisionOverlay\(/);
    expect(source).toMatch(/\}, plane, variant\)/);
  });

  it('no longer flips the overlays straight from the mount effect', () => {
    // The shape of the original bug: a bare setOverlay/pickPlane in the effect
    // body with no cleanup beside it.
    expect(source).not.toMatch(/useEffect\(\(\) => \{\s*const ov = useViewStore/);
  });
});
