// Task 11 — paint mode on BlockTab. Mirrors chunk-paint-mode.test.ts's guard
// (see that file's header for why this is a source scan, not a mount): the
// renderer suite is node-only, so this proves the composed path is wired the
// way the contract requires by reading BlockTab.tsx, comments stripped.
//
// PLANT THE VIOLATION FIRST. Every assertion below was run against a
// deliberately broken copy of BlockTab.tsx before being trusted.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const read = (f: string) => readFileSync(join(__dirname, '..', f), 'utf8');

const strip = (src: string) => src
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/(^|[^:])\/\/.*$/gm, '$1');

const BLOCK_TAB = strip(read('BlockTab.tsx'));

describe('BlockTab paint mode: the composed write path', () => {
  it('imports planSurfaceEdit and classicPaintSurface from the real modules', () => {
    expect(BLOCK_TAB).toMatch(/import\s*\{\s*planSurfaceEdit[^}]*\}\s*from\s*'\.\.\/\.\.\/\.\.\/core\/art\/classic-surface-plan'/);
    expect(BLOCK_TAB, 'BlockTab does not import classicPaintSurface from the level store')
      .toMatch(/import\s*\{[^}]*\bclassicPaintSurface\b[^}]*\}\s*from\s*'\.\.\/\.\.\/state\/classicLevelStore'/);
  });

  it('calls planSurfaceEdit BEFORE classicPaintSurface: a plan is built, then applied', () => {
    const planCall = BLOCK_TAB.indexOf('planSurfaceEdit(');
    const applyCall = BLOCK_TAB.indexOf('classicPaintSurface(');
    expect(planCall, 'planSurfaceEdit( is never called').toBeGreaterThan(-1);
    expect(applyCall, 'classicPaintSurface( is never called').toBeGreaterThan(-1);
    expect(planCall, 'classicPaintSurface is called before planSurfaceEdit: the plan must exist first')
      .toBeLessThan(applyCall);
  });

  it('NEVER calls classicEditTiles: that command has no divergence and no reserved-tile guard', () => {
    expect(BLOCK_TAB).not.toMatch(/\bclassicEditTiles\b/);
  });

  it('diffWrites feeds planSurfaceEdit\'s writes: the gesture result is diffed, not resent whole', () => {
    expect(BLOCK_TAB).toMatch(/\bdiffWrites\(/);
    const planArgs = /planSurfaceEdit\(\{([\s\S]*?)\}\);/.exec(BLOCK_TAB);
    expect(planArgs, 'could not find the planSurfaceEdit({...}) call to inspect its args').not.toBeNull();
    expect(planArgs![1]).toMatch(/writes,?\s*$|writes:/m);
  });

  it('threads reservedTiles (T4) into the plan', () => {
    const planArgs = /planSurfaceEdit\(\{([\s\S]*?)\}\);/.exec(BLOCK_TAB);
    expect(planArgs).not.toBeNull();
    expect(planArgs![1], 'reservedTiles is not passed to planSurfaceEdit').toMatch(/reservedTiles/);
    expect(BLOCK_TAB, 'BlockTab does not read reservedTiles off the level store')
      .toMatch(/useClassicLevelStore\(\(s\)\s*=>\s*s\.reservedTiles\)/);
  });

  it('composes the surface via buildBlockSurface', () => {
    expect(BLOCK_TAB).toMatch(/import\s*\{\s*buildBlockSurface[^}]*\}\s*from\s*'\.\.\/\.\.\/\.\.\/core\/art\/classic-surface-buffer'/);
    expect(BLOCK_TAB, 'buildBlockSurface is not called with (doc, composerBlockId)')
      .toMatch(/buildBlockSurface\(doc,\s*composerBlockId\)/);
  });

  it('drives the gesture through PixelEditController + PixelViewport, like TileTab/ChunkTab', () => {
    expect(BLOCK_TAB).toMatch(/new PixelEditController\(/);
    expect(BLOCK_TAB).toMatch(/<PixelViewport\b/);
    expect(BLOCK_TAB).toMatch(/controller=\{paintControllerRef\.current\}/);
  });

  it('on a refused plan, toasts `reason` VERBATIM: the message names the Link-mode escape', () => {
    expect(BLOCK_TAB).toMatch(/addToast\(planResult\.reason,\s*'error'\)/);
  });
});

describe('BlockTab: Assign | Paint toggle (Task 11, "decided")', () => {
  it('defaults to assign and offers both values through the store', () => {
    expect(BLOCK_TAB).toMatch(/useClassicLevelStore\(\(s\)\s*=>\s*s\.blockPaintMode\)/);
    expect(BLOCK_TAB).toMatch(/setBlockPaintMode\('assign'\)/);
    expect(BLOCK_TAB).toMatch(/setBlockPaintMode\('paint'\)/);
  });

  it('the assignment grid (classicEditBlock) is still reachable: Paint does not replace it', () => {
    expect(BLOCK_TAB).toMatch(/\bclassicEditBlock\(/);
  });
});

describe('BlockTab: Link | Isolate + limits readout', () => {
  it('offers both Link and Isolate through the shared store field', () => {
    expect(BLOCK_TAB).toMatch(/useClassicLevelStore\(\(s\)\s*=>\s*s\.paintDivergeMode\)/);
    expect(BLOCK_TAB).toMatch(/setPaintDivergeMode\('isolate'\)/);
    expect(BLOCK_TAB).toMatch(/setPaintDivergeMode\('link'\)/);
  });

  it('the limits readout says "limit" vocabulary and never "budget"', () => {
    expect(BLOCK_TAB, 'no limits readout string found (expected "blocks N/N" and "tiles N/N")')
      .toMatch(/blocks \$\{[^}]+\}\/\$\{[^}]+\}.*tiles \$\{[^}]+\}\/\$\{[^}]+\}/);
    expect(BLOCK_TAB, 'BlockTab says "budget": no surveyed tool uses that word; say "limit"')
      .not.toMatch(/budget/i);
  });
});

describe('BlockTab: the discovery breadcrumb', () => {
  it("its linkage banner points at the Chunk tab's Isolate mode for a single-place change", () => {
    const call = /<SharedBanner[\s\S]*?\/>/.exec(BLOCK_TAB);
    expect(call, 'BlockTab has no <SharedBanner> call at all').not.toBeNull();
    expect(call![0], 'BlockTab banner is missing the deferred discovery breadcrumb')
      .toMatch(/To change one place only, paint it on the Chunk tab \(Isolate\)\./);
  });
});
