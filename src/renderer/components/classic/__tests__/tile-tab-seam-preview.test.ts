// Task 9 — the tile tier's seam preview.
//
// PixelViewport already renders a 3x3 seamless-tiling preview (`layers.repeat`,
// see art-shared/PixelViewport.tsx) and aeon's ComposerCanvas already wires it
// up to `artStore.repeatPreview`. TileTab is the one pixel-tier host that never
// passed it through, which is exactly the gap this task closes. The renderer
// suite is node-only and cannot mount TileTab (it is .tsx, no DOM), so — same
// pattern as workspace/__tests__/classic-art-dock.test.ts — this proves the
// SOURCE actually wires the prop, comments stripped so prose alone cannot pass
// it.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const read = (...p: string[]) => readFileSync(join(__dirname, '..', ...p), 'utf8');
const TILE_TAB = read('TileTab.tsx');

/** Comments stripped, so an assertion about behaviour cannot pass on prose that
 *  merely discusses it (this file's own header, TileTab's docblocks, etc.). */
const CODE = TILE_TAB
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/(^|[^:])\/\/.*$/gm, '$1');

describe('TileTab seam preview', () => {
  it('reads the shared repeatPreview field from artStore', () => {
    expect(CODE, 'TileTab does not subscribe to artStore.repeatPreview')
      .toMatch(/useArtStore\(\(s\)\s*=>\s*s\.repeatPreview\)/);
    expect(CODE, 'TileTab does not read the toggle action')
      .toMatch(/useArtStore\(\(s\)\s*=>\s*s\.toggleRepeatPreview\)/);
  });

  it('passes repeat into the PixelViewport layers prop', () => {
    // Scoped to the actual <PixelViewport ...> call, not just anywhere in the
    // file — the whole point is that the LAYERS OBJECT the viewport receives
    // carries the tiling config, not merely that the word "repeat" appears.
    const call = /<PixelViewport[\s\S]*?\/>/.exec(CODE);
    expect(call, 'no <PixelViewport /> call found at all').not.toBeNull();
    const layers = /layers=\{\{([\s\S]*?)\}\}/.exec(call![0]);
    expect(layers, 'PixelViewport is called with no layers prop').not.toBeNull();
    expect(layers![1], 'the layers object has no repeat field').toMatch(/repeat:/);
    expect(layers![1], 'repeat is not driven by repeatPreview, or not a 3x3 tiling config')
      .toMatch(/repeatPreview\s*\?\s*\{\s*tilesX:\s*3\s*,\s*tilesY:\s*3\s*\}\s*:\s*null/);
  });

  it('offers a toggle in the options row, styled like its Chip neighbours', () => {
    // The ui kit's `Chip` is a <span>, not a <button> — a naive `/<button[^>]*onClick=\{toggleRepeatPreview\}/`
    // assertion here would fail even on a correct implementation, which is
    // exactly the trap this task's brief calls out. Assert on the component
    // TileTab's surrounding controls (the palette-line row) actually use.
    expect(CODE, 'no Chip wired to the repeat-preview toggle')
      .toMatch(/<Chip\s+active=\{repeatPreview\}\s+onClick=\{toggleRepeatPreview\}/);
  });

  it('defaults OFF (artStore.repeatPreview starts false, not flipped locally)', () => {
    // TileTab must not shadow the field with a local `useState(true)` or similar
    // — the default lives in artStore (repeatPreview: false), one place.
    expect(CODE).not.toMatch(/useState\([^)]*repeatPreview[^)]*true/);
  });

  it('caps the effective zoom for the tripled canvas, matching ComposerCanvas', () => {
    // art-shared/zoom-cap.ts documents `contentPx` as including "any multiplier
    // the host draws around it (e.g. the composer's 3x3 repeat preview triples
    // it)" — ComposerCanvas applies `(repeatPreview ? 3 : 1)`. TileTab should
    // apply the identical rule rather than one that only agrees with it at
    // today's tile size.
    expect(CODE, 'cappedZoom is not scaled for the repeat preview')
      .toMatch(/cappedZoom\(\s*zoom\s*,\s*Math\.max\(buffer\.width,\s*buffer\.height\)\s*\*\s*\(repeatPreview\s*\?\s*3\s*:\s*1\)\s*\)/);
  });
});
