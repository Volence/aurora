// THE COMPOSER FILLS THE CANVAS SLOT IT IS GIVEN (H3.1), and none of it is
// renderable here.
//
// Measured on the running app, 1400x872, BEFORE: the dock content box was 751px
// and the tab body 500 (Chunk), 478 (Block), 394 (Tile) — 251/273/325px of dead
// canvas under a composer that had stopped growing. AFTER: 751/751/719, 0px
// dead on all three.
//
// A SOURCE SCAN, like panel-scrollers.test.ts beside it: these are .tsx, the
// renderer suite is node-only and does not collect them, so nothing can render
// a dock and measure a box. What CAN be executed is `fitCellSize`, which is why
// the size decision was put in composer-math (tested in composer-math.test.ts);
// the rules here are the LAYOUT declarations around it — every one of them is a
// property that, if deleted, compiles, draws, and silently restores a version of
// the defect.
//
// The source is COMMENT-STRIPPED before anything is asked of it. The styles in
// composer-shared are documented at length and the docblocks quote the very
// declarations these rules look for (`alignItems: 'flex-start'`, `maxHeight:
// 300`, `flex: 1`), so a raw-source scan would pass on prose alone — the same
// reason classic-art-dock.test.ts strips TileTab.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const read = (f: string): string => readFileSync(join(__dirname, '..', f), 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/(^|[^:])\/\/.*$/gm, '$1');

const SHARED = read('composer-shared.tsx');
const CHUNK = read('ChunkTab.tsx');
const BLOCK = read('BlockTab.tsx');
const TILE = read('TileTab.tsx');

/**
 * One entry of the `styles` object in composer-shared, as its raw body text.
 *
 * INNERMOST BRACES ONLY (`[^{}]*`), which is what makes this stop where it
 * should: every entry here is one level deep, so the first `}` after the key IS
 * that entry's. A lazy `[\s\S]*?\}` would end at the same place for a
 * well-formed entry but would run into the NEXT declaration the moment one
 * grows a nested object — the failure mode an earlier guard on this branch
 * actually shipped, where the planted violation passed because the match had
 * swallowed a neighbouring style.
 */
function style(source: string, name: string): string {
  // Template interpolations are flattened first, or a `${T.border}` inside a
  // value cuts the entry in half and the innermost-braces match finds nothing —
  // which is a THROWN test, not a silent pass, but it is still the wrong
  // failure. Same flattening, same reason, as panel-scrollers.test.ts.
  const flat = source.replace(/\$\{[^{}]*\}/g, 'X');
  const m = new RegExp(`\\b${name}:\\s*\\{([^{}]*)\\}`).exec(flat);
  expect(m, `no style entry named '${name}': the composer's style object was renamed or restructured`).not.toBeNull();
  return m![1].replace(/\s+/g, ' ').trim();
}

describe('the tab body fills the dock content box', () => {
  it('dockContent is a flex COLUMN, or the body has no axis to grow along', () => {
    // It was a plain block box with `overflow: auto`. A `flex` on a block box's
    // child means nothing, so the body took its content height however tall the
    // dock was — which is the defect, one level up from where it shows.
    const s = style(SHARED, 'dockContent');
    expect(s, 'dockContent is not a flex column').toMatch(/flexDirection:\s*'column'/);
    expect(s, 'dockContent stopped being the scroller the tiers overflow into').toMatch(/overflowY:\s*'auto'/);
    expect(s, 'dockContent no longer takes the slot').toMatch(/flex:\s*1\b/);
    expect(s, 'dockContent lost the minHeight:0 that lets it shrink into the slot').toMatch(/minHeight:\s*0\b/);
  });

  it('tabBody stretches its columns and grows into the slot', () => {
    const s = style(SHARED, 'tabBody');
    expect(s, "tabBody is top-anchored again: this IS the defect (`alignItems: 'flex-start'`)")
      .not.toMatch(/alignItems:\s*'flex-start'/);
    expect(s, 'tabBody does not stretch its columns, so the height stops at the body')
      .toMatch(/alignItems:\s*'stretch'/);
    expect(s, 'tabBody does not grow').toMatch(/flex:\s*'1 1 0'/);
  });

  it('tabBody does not size itself from its CONTENT', () => {
    // MEASURED: `flex: '1 0 auto'` took the body to 2387px (Chunk), 4071
    // (Block), 3201 (Tile) — a flex container's intrinsic height counts a
    // flex-grow child by its own max-content size, so the uncapped browse strips
    // (1814/2739/3510px of thumbnails) became the body's height and the tiers
    // that had dead space got a 3000px scrollbar instead. Any basis but 0 is
    // that bug: `auto`, `content`, `max-content`, a px number.
    const s = style(SHARED, 'tabBody');
    const basis = /flex:\s*'\s*\d+\s+\d+\s+([^']+)'/.exec(s);
    expect(basis, 'tabBody no longer declares a three-part flex: check what its basis is now').not.toBeNull();
    expect(basis![1].trim(), 'tabBody sizes itself from its content, which the browse strips make unbounded').toBe('0');
    expect(s, 'tabBody declares a fixed height').not.toMatch(/\bheight:/);
  });

  it('the browse strips spend the height instead of capping it', () => {
    // `maxHeight: 300` was where the recovered height used to stop: a 300px box
    // of thumbnails scrolling 2553px of tiles inside a 719px column. A number
    // cannot know how tall the column is; the column can.
    const s = style(SHARED, 'paletteStrip');
    expect(s, 'the browse strip capped itself again: a fixed cap cannot know the column height')
      .not.toMatch(/maxHeight:/);
    expect(s, 'the browse strip does not grow into its column').toMatch(/flex:\s*'1 1 0'/);
    expect(s, 'the browse strip cannot shrink below its content, so it would push the column')
      .toMatch(/minHeight:\s*0\b/);
    expect(s, 'the browse strip stopped scrolling its own rows').toMatch(/overflowY:\s*'auto'/);
  });

  it('BlockTab does not re-cap its own strip', () => {
    // It carried `{ ...styles.paletteStrip, maxHeight: 140 }`, which left a
    // 175px column beside a 348px one in a 478px body.
    expect(BLOCK, 'BlockTab overrides the strip height again').not.toMatch(/paletteStrip[\s\S]{0,60}maxHeight/);
  });
});

describe('the Chunk and Block canvases resize by CELL, never by CSS box', () => {
  // These two tiers have no zoom. They are `imageRendering: pixelated` bitmaps
  // whose backing store is `cell * cols`, so the only honest way to make them
  // bigger is a bigger CELL — and the composer was ALREADY doing the dishonest
  // one by accident: measured before, a 320px chunk bitmap in a 383px content
  // box and a 128px block bitmap in a 338px one, because both canvases were
  // direct children of a column-flex column and were being align-stretched.

  it('the fit box centres its canvas rather than stretching it', () => {
    const s = style(SHARED, 'fitBox');
    expect(s, 'the fit box no longer centres: a canvas child would be align-stretched')
      .toMatch(/alignItems:\s*'center'/);
    expect(s, 'the fit box no longer centres horizontally').toMatch(/justifyContent:\s*'center'/);
    expect(s, 'the fit box would be pushed by the canvas it sizes (measurement feedback loop)')
      .toMatch(/overflow:\s*'hidden'/);
    expect(s, 'the fit box declares a size of its own: it must take one from the column')
      .not.toMatch(/(?:^|[^n])\b(?:width|height):/);
  });

  it.each([['ChunkTab', CHUNK], ['BlockTab', BLOCK]])('%s sizes its canvas through fitCellSize', (name, src) => {
    expect(src, `${name} does not import the shared fit`).toMatch(/import\s*\{[^}]*\bfitCellSize\b[^}]*\}\s*from\s*'\.\/composer-math'/);
    expect(src, `${name} does not call fitCellSize`).toMatch(/fitCellSize\(/);
    expect(src, `${name} does not measure its box`).toMatch(/useBoxSize\(/);
    // The canvas attributes must be EXPRESSIONS. `width={320}` is the whole
    // regression: it compiles, it draws, and the fit silently stops applying.
    const attrs = [...src.matchAll(/<canvas[\s\S]*?width=\{([^}]*)\}[\s\S]*?height=\{([^}]*)\}/g)];
    expect(attrs.length, `${name} has no <canvas> with width/height props`).toBeGreaterThan(0);
    for (const [, w, h] of attrs) {
      expect(w.trim(), `${name} draws at a hardcoded canvas width`).toMatch(/cellPx|sizePx/);
      expect(h.trim(), `${name} draws at a hardcoded canvas height`).toMatch(/cellPx|sizePx/);
    }
  });

  it.each([['ChunkTab', CHUNK, 20, 16], ['BlockTab', BLOCK, 64, 2]] as const)(
    '%s floors the fit at the size it shipped with', (name, src, floor, cols) => {
      // A fit that can go BELOW the old constant is a fit that makes the tab
      // worse on a small window — the one thing this change must not do.
      const m = /const\s+\w+_MIN_CELL\s*=\s*(\d+);/.exec(src);
      expect(m, `${name} declares no floor cell size`).not.toBeNull();
      expect(Number(m![1]), `${name}'s floor is no longer the size it shipped with`).toBe(floor);
      // …and the floor must reach the fit box, or a short window CLIPS the
      // canvas instead of handing the overflow to dockContent's scrollbar.
      const uses = [...src.matchAll(/styles\.fitBox/g)];
      expect(uses.length, `${name} does not mount the fit box`).toBe(1);
      expect(src, `${name} mounts the fit box without the minHeight floor its contract requires`)
        .toMatch(new RegExp(`\\{\\s*\\.\\.\\.styles\\.fitBox\\s*,\\s*minHeight:[^}]*_MIN_CELL\\s*\\*\\s*${cols}\\s*\\}`));
    });

  it('the grid canvases stay nearest-neighbour', () => {
    // The reason all of the above is about the cell and not the box.
    expect(style(SHARED, 'gridCanvas'), 'the composer canvases would be smoothed')
      .toMatch(/imageRendering:\s*'pixelated'/);
  });
});

describe('the Tile tier takes the room and spends it on zoom', () => {
  it('its viewport box is sized by the layout, not by a constant', () => {
    const m = /const TILE_SCROLLER:[^=]*=\s*\{([^{}]*)\}/.exec(TILE);
    expect(m, 'TILE_SCROLLER is gone. What is the pan/zoom hooks\' scroll container now?').not.toBeNull();
    const s = m![1].replace(/\s+/g, ' ');
    expect(s, 'the tile viewport is a fixed box again: the tier had 325px of dead slot under it')
      .not.toMatch(/(?:^|[^n])\b(?:width|height):/);
    expect(s, 'the tile viewport does not grow into the column').toMatch(/flex:\s*'1 1 0'/);
    expect(s, 'the tile viewport lost its floor').toMatch(/minHeight:\s*TILE_VIEW_PX/);
    expect(s, 'the tile viewport stopped being a scroller: pan and zoom drive its scroll offsets')
      .toMatch(/overflow:\s*'auto'/);
  });

  it('its viewport is not derived from the zoom', () => {
    // THE invariant the box has always had and still has: a viewport that grew
    // with the canvas would reflow the column on every wheel notch and slide the
    // swatch row out from under the cursor. `flex: '1 1 0'` above is what keeps
    // the box independent of its content; a basis of `auto` would make the box
    // the canvas's size, which is `8 * zoom`.
    const m = /const TILE_SCROLLER:[^=]*=\s*\{([^{}]*)\}/.exec(TILE);
    expect(m![1], 'the tile viewport would size itself to the canvas, i.e. to the zoom')
      .not.toMatch(/flex:\s*'[^']*auto'/);
    expect(m![1], 'the tile viewport reads the zoom').not.toMatch(/zoom/i);
  });
});
