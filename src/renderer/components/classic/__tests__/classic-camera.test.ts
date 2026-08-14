// Source guard: classic's viewport must not subscribe to the camera.
//
// The camera moved into viewStore so it can be driven from outside the
// component (the agent handler's goto, per-tab viewport restore, any shared
// zoom control). The obvious way to consume it — `useViewStore((s) => s.vpX)`,
// exactly how MapViewport does it — is a performance bug HERE and not there:
// this viewport's render effect has no dependency array, so every re-render is
// a full clear-and-recompose, and a subscribed camera re-renders on every
// mousemove of a drag. That is the redraw storm three perf commits (493edd/
// 56ad2ff/9ad109d lineage) converged on removing, by making the camera a ref
// mutated during the gesture and painted once per rAF.
//
// So the component publishes to the store from inside that rAF and adopts
// external writes through an imperative `subscribe`. Both are easy to "tidy"
// into a hook by someone who reads the selector-free access as an oversight —
// and the renderer suite is node-only, so nothing else in it would notice. This
// test is the note that says the ref is deliberate.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const VIEWPORT = join(__dirname, '..', 'ClassicLevelViewport.tsx');

/** Source with comments stripped — this file's rationale is echoed in the
 *  component's own docblock, which names the very pattern it forbids. */
function code(): string {
  return readFileSync(VIEWPORT, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');
}

describe('the classic viewport keeps the camera off the render path', () => {
  it('never selector-subscribes to vpX / vpY / zoom', () => {
    const selectors = [...code().matchAll(/useViewStore\(\s*\(\s*\w+\s*\)\s*=>\s*\w+\.(\w+)/g)]
      .map((m) => m[1]);
    // Other viewStore selectors are fine — `overlays` is genuinely React state
    // here. Only the three camera fields are forbidden.
    expect(selectors.filter((f) => ['vpX', 'vpY', 'zoom'].includes(f))).toEqual([]);
  });

  it('still reaches the camera the two intended ways', () => {
    const src = code();
    // Publish: imperative getState().setViewport, from inside the rAF.
    expect(src).toContain('setViewport');
    // Adopt: imperative subscribe, so an external write repaints without
    // making this component re-render on its own pushes.
    expect(src).toMatch(/useViewStore\.subscribe\(/);
    // And the camera itself is still a ref, not state.
    expect(src).toMatch(/camRef\s*=\s*useRef/);
  });

  it('guards a file that actually exists and still holds a viewStore selector', () => {
    // Vacuity check: if the component stopped importing viewStore at all, the
    // first assertion would pass for the wrong reason.
    expect(code()).toMatch(/useViewStore\(\s*\(\s*\w+\s*\)\s*=>/);
  });
});
