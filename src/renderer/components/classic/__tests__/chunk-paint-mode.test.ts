// Task 11 — paint mode on ChunkTab. The renderer suite is node-only (no
// jsdom/DOM environment — see composer-shared.tsx's own note), so this cannot
// mount ChunkTab and drag a stroke across it. What it CAN do, same as every
// other classic-composer guard test (classic-surface.test.ts,
// classic-art-dock.test.ts, composer-linkage-banner.test.ts), is read the
// SOURCE, comments stripped, and prove the composed path is wired the way the
// contract requires:
//
//   diffWrites -> planSurfaceEdit -> classicPaintSurface, in that order, and
//   NEVER classicEditTiles — which mutates a shared tile unconditionally, no
//   divergence, no reserved-tile guard, exactly the bug paint-through exists
//   to prevent.
//
// PLANT THE VIOLATION FIRST. Every assertion below was run against a
// deliberately broken copy of ChunkTab.tsx before being trusted — see the
// commit message for the falsification transcript. A guard that has not been
// seen to fail is not a guard (aurora-guards-assert-nothing).

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const read = (f: string) => readFileSync(join(__dirname, '..', f), 'utf8');

/** Comments stripped, so the guard reads CODE and not prose — a docblock that
 *  merely NAMES `classicEditTiles` while explaining why it must not be called
 *  (as this file's own header does) must not itself trip the "never calls it"
 *  assertion below. */
const strip = (src: string) => src
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/(^|[^:])\/\/.*$/gm, '$1');

const CHUNK_TAB = strip(read('ChunkTab.tsx'));

describe('ChunkTab paint mode: the composed write path', () => {
  it('imports planSurfaceEdit and classicPaintSurface from the real modules', () => {
    expect(CHUNK_TAB).toMatch(/import\s*\{\s*planSurfaceEdit[^}]*\}\s*from\s*'\.\.\/\.\.\/\.\.\/core\/art\/classic-surface-plan'/);
    expect(CHUNK_TAB).toMatch(/\bclassicPaintSurface\b/);
    expect(CHUNK_TAB, 'ChunkTab does not import classicPaintSurface from the level store')
      .toMatch(/import\s*\{[^}]*\bclassicPaintSurface\b[^}]*\}\s*from\s*'\.\.\/\.\.\/state\/classicLevelStore'/);
  });

  it('calls planSurfaceEdit BEFORE classicPaintSurface: a plan is built, then applied', () => {
    const planCall = CHUNK_TAB.indexOf('planSurfaceEdit(');
    const applyCall = CHUNK_TAB.indexOf('classicPaintSurface(');
    expect(planCall, 'planSurfaceEdit( is never called').toBeGreaterThan(-1);
    expect(applyCall, 'classicPaintSurface( is never called').toBeGreaterThan(-1);
    expect(planCall, 'classicPaintSurface is called before planSurfaceEdit: the plan must exist first')
      .toBeLessThan(applyCall);
  });

  it('NEVER calls classicEditTiles: that command has no divergence and no reserved-tile guard', () => {
    expect(CHUNK_TAB).not.toMatch(/\bclassicEditTiles\b/);
  });

  it('diffWrites feeds planSurfaceEdit\'s writes: the gesture result is diffed, not resent whole', () => {
    expect(CHUNK_TAB).toMatch(/\bdiffWrites\(/);
    // The write list planSurfaceEdit receives must be the diff's OUTPUT, not the
    // raw GestureResult buffer — otherwise every gesture would re-plan all
    // 65536 chunk-surface pixels instead of only the ones that changed.
    const planArgs = /planSurfaceEdit\(\{([\s\S]*?)\}\);/.exec(CHUNK_TAB);
    expect(planArgs, 'could not find the planSurfaceEdit({...}) call to inspect its args').not.toBeNull();
    expect(planArgs![1]).toMatch(/writes,?\s*$|writes:/m);
  });

  it('threads reservedTiles (T4) into the plan: the whole point of task 5c', () => {
    const planArgs = /planSurfaceEdit\(\{([\s\S]*?)\}\);/.exec(CHUNK_TAB);
    expect(planArgs).not.toBeNull();
    expect(planArgs![1], 'reservedTiles is not passed to planSurfaceEdit').toMatch(/reservedTiles/);
    expect(CHUNK_TAB, 'ChunkTab does not read reservedTiles off the level store')
      .toMatch(/useClassicLevelStore\(\(s\)\s*=>\s*s\.reservedTiles\)/);
  });

  it('composes the surface via buildChunkSurface, a FILE-order index (not the engine chunk id)', () => {
    expect(CHUNK_TAB).toMatch(/import\s*\{\s*buildChunkSurface[^}]*\}\s*from\s*'\.\.\/\.\.\/\.\.\/core\/art\/classic-surface-buffer'/);
    expect(CHUNK_TAB, 'buildChunkSurface is not called with the FILE-order chunkIndex')
      .toMatch(/buildChunkSurface\(doc,\s*chunkIndex\)/);
    // chunkIndex must come from chunkIndexForId — the conversion the plan's
    // header warns is easy to skip ("it takes a FILE-ORDER index, not an
    // engine chunk id; chunkIndexForId converts").
    expect(CHUNK_TAB).toMatch(/chunkIndexForId\(doc,\s*selectedChunkId\)/);
  });

  it('drives the gesture through PixelEditController + PixelViewport, like TileTab', () => {
    expect(CHUNK_TAB).toMatch(/new PixelEditController\(/);
    expect(CHUNK_TAB).toMatch(/<PixelViewport\b/);
    expect(CHUNK_TAB).toMatch(/controller=\{paintControllerRef\.current\}/);
  });

  it('on a refused plan, toasts `reason` VERBATIM: the message names the Link-mode escape', () => {
    // Not `${planResult.reason}` glued into a bigger string and not a rewritten
    // literal — passed straight through, since classic-surface-plan.ts's
    // refusal strings were written to be actionable on their own.
    expect(CHUNK_TAB).toMatch(/addToast\(planResult\.reason,\s*'error'\)/);
  });
});

describe('ChunkTab: Assign | Paint toggle (Task 11, "decided")', () => {
  it('defaults to assign and offers both values through the store', () => {
    expect(CHUNK_TAB).toMatch(/useClassicLevelStore\(\(s\)\s*=>\s*s\.chunkPaintMode\)/);
    expect(CHUNK_TAB).toMatch(/setChunkPaintMode\('assign'\)/);
    expect(CHUNK_TAB).toMatch(/setChunkPaintMode\('paint'\)/);
  });

  it('the assignment grid (classicEditChunkCells) is still reachable: Paint does not replace it', () => {
    expect(CHUNK_TAB).toMatch(/\bclassicEditChunkCells\(/);
  });
});

describe('ChunkTab: Link | Isolate + limits readout', () => {
  it('offers both Link and Isolate through the shared store field, isolate by default', () => {
    expect(CHUNK_TAB).toMatch(/useClassicLevelStore\(\(s\)\s*=>\s*s\.paintDivergeMode\)/);
    expect(CHUNK_TAB).toMatch(/setPaintDivergeMode\('isolate'\)/);
    expect(CHUNK_TAB).toMatch(/setPaintDivergeMode\('link'\)/);
  });

  it('the limits readout says "limit" vocabulary and never "budget"', () => {
    expect(CHUNK_TAB, 'no limits readout string found (expected "blocks N/N" and "tiles N/N")')
      .toMatch(/blocks \$\{[^}]+\}\/\$\{[^}]+\}.*tiles \$\{[^}]+\}\/\$\{[^}]+\}/);
    expect(CHUNK_TAB, 'ChunkTab says "budget": no surveyed tool uses that word; say "limit"')
      .not.toMatch(/budget/i);
  });
});
