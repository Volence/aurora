// Two shared-substrate props whose failure mode is a HOST QUIETLY LOSING A RULE,
// and which nothing else in the suite can reach: the renderer tests are node-only
// with no DOM and no .tsx collection, so the substrate's three hosts
// (classic TileTab, aeon ComposerCanvas, the sprite canvas) can be checked only
// by reading them.
//
// WHAT IS ACTUALLY EXECUTED ELSEWHERE, so this file does not have to pretend:
//   * the controller's move-branch behaviour, and that withholding the selection
//     from `begin` suppresses it — core/art/__tests__/classic-tile-gesture.test.ts
//     drives the real PixelEditController through both;
//   * `levelKeysEnabled` itself — workspace/__tests__/level-keys.test.ts.
// What is left is the WIRING, and each assertion below names the specific way it
// silently breaks.
//
// Every read is COMMENT-STRIPPED. All four files discuss these props by name in
// their docblocks, and a scan that read raw source would pass on prose after the
// code was deleted — which has happened in this repo before.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const read = (...p: string[]) => readFileSync(join(__dirname, '..', '..', ...p), 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/(^|[^:])\/\/.*$/gm, '$1');

const VIEWPORT = read('art-shared', 'PixelViewport.tsx');
const HAND_PAN = read('art-shared', 'use-hand-pan.ts');
const TILE_TAB = read('classic', 'TileTab.tsx');
const COMPOSER = read('art', 'ComposerCanvas.tsx');
const SPRITE_HOST = read('sprite', 'SpriteCanvasHost.tsx');
const SPRITE_MODE = read('sprite', 'SpriteMode.tsx');

// `select` IS NOT A READ-ONLY TOOL. A pointerdown inside an existing marquee takes
// the controller's move branch, which cuts the region out of the snapshot and
// returns relocated pixels plus a moved marquee. On classic's LOCKED tiles — which
// deliberately still accept marquees — the pixels are refused downstream and the
// marquee is not, so it ends up marking a region its contents never went to.
// `gestureSelection` is the fix: draw the marquee, withhold it from `begin`.
describe('PixelViewport.gestureSelection', () => {
  it('is what `controller.begin` is handed', () => {
    // Passing `selection` straight to begin() again is the whole regression: it
    // compiles, it renders identically, and only a locked tile behaves wrongly.
    expect(VIEWPORT, 'begin() no longer takes the resolved gesture selection')
      .toMatch(/controller\.begin\(\s*buffer\s*,\s*p\.x\s*,\s*p\.y\s*,\s*gestureSel\s*\)/);
  });

  it('falls back to `selection`, distinguishing an omitted prop from an explicit null', () => {
    // `??` here would be a bug, not a shorthand: a host that passes `null` on
    // purpose (locked) means "begin with no selection", which is NOT the same
    // answer as saying nothing. `??` would collapse it back to `selection`.
    const decl = /const gestureSel = ([^;]*);/.exec(VIEWPORT);
    expect(decl, 'the gestureSel fallback is gone').not.toBeNull();
    expect(decl![1], 'an explicit null is being collapsed back into `selection`')
      .toMatch(/gestureSelection\s*!==\s*undefined/);
    expect(decl![1]).toMatch(/\bselection\b/);
  });

  it('is INERT for the two hosts that do not pass it', () => {
    // The claim that made this an additive prop rather than a substrate change.
    // Neither aeon's composer nor the sprite canvas mentions it, so both get the
    // pre-existing `selection ?? null` and cannot have changed behaviour.
    expect(COMPOSER, 'aeon now passes gestureSelection: re-check its locked-tile story')
      .not.toMatch(/gestureSelection/);
    expect(SPRITE_HOST, 'the sprite canvas now passes gestureSelection')
      .not.toMatch(/gestureSelection/);
  });

  it('is withheld by classic exactly while the tile is locked', () => {
    expect(TILE_TAB, 'TileTab hands the marquee to the gesture even when locked')
      .toMatch(/gestureSelection=\{\s*locked\s*\?\s*null\s*:\s*selection\s*\}/);
    // …and the marquee is still DRAWN, or the fix would have removed the feature
    // instead of the bug.
    expect(TILE_TAB, 'the marquee is no longer drawn at all').toMatch(/selection=\{selection\}/);
  });
});

// THE LEVEL PANE STAYS MOUNTED under a sprite-doc tab (App.tsx — `display:none`,
// not unmounted), so every WINDOW-level handler a level-side surface registers is
// still live while SpriteMode owns the keyboard. `useHandPan`'s Space keydown
// calls `preventDefault()`, so ungated it swallows Space from a focused button in
// the sprite editor. The gate cannot live inside the hook: SpriteMode is its third
// caller and is the very thing `levelKeysEnabled()` goes false for.
describe('useHandPan: the keyboard gate', () => {
  it('takes an optional gate and consults it on keydown', () => {
    expect(HAND_PAN, 'the enabled option is gone').toMatch(/enabled\?:\s*\(\)\s*=>\s*boolean/);
    // Scoped to the HANDLER BODY, not the file. `enabledRef.current` is assigned
    // on every render whether or not the listener reads it, so a file-wide match
    // stays green while the handler goes back to the effect's closure — which is
    // the actual bug (the listener is bound once on mount, so a captured
    // predicate would answer for the first render forever).
    const body = /const onKeyDown = \(e: KeyboardEvent\) => \{([\s\S]*?)\n {4}\};/.exec(HAND_PAN);
    expect(body, 'the Space keydown handler is gone: re-read this test').not.toBeNull();
    expect(body![1], 'the keydown does not consult the gate at all').toMatch(/gate\(\)[\s\S]*?return/);
    expect(body![1], 'the gate is read out of a stale closure').toMatch(/enabledRef\.current/);
  });

  it('is NOT gated unconditionally inside the hook', () => {
    // SpriteMode would lose Space-panning outright.
    expect(HAND_PAN, 'the hook imports a level-side predicate of its own')
      .not.toMatch(/levelKeysEnabled/);
  });

  it('is gated by both level-side hosts', () => {
    for (const [name, src] of [['classic TileTab', TILE_TAB], ['aeon ComposerCanvas', COMPOSER]] as const) {
      expect(src, `${name} imports no keyboard gate`).toMatch(/levelKeysEnabled/);
      expect(src, `${name} registers an ungated window Space handler`)
        .toMatch(/useHandPan\([^)]*enabled:\s*levelKeysEnabled/);
    }
  });

  it('is NOT gated by SpriteMode', () => {
    // The sprite canvas is what the level gate goes false for; gating it on the
    // same predicate would leave it unable to pan at all.
    expect(SPRITE_MODE, 'the sprite canvas gated itself on a level-side predicate')
      .not.toMatch(/useHandPan\([^)]*levelKeysEnabled/);
  });
});
