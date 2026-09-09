// TWO THINGS THE MAP SURFACE HAS TO DO IN THE .TSX ITSELF, where no pure module
// can be asked and there is no jsdom here to mount the component in.
//
// A SOURCE SCAN, the `map-teardown.test.ts` precedent, for the same reason it
// gives: the decision is not "what should this compute" — that part left for
// `map-gesture-witness.ts` and is unit-tested beside this file — it is "does the
// component ASK, and is the listener even there". Neither is reachable from a
// pure module.
//
// ═══ ROW 1: BG-STROKE-WRONG-ACT (lens sweep) ═══
//
// Four gesture carriers got a witness; the BG stroke was examined and left, on
// the reading that its commands name their own target document. That holds for
// `override` and `library` and NOT for `act`: `set-bg-tiles` with `bgRef: null`
// resolves `level.act.bgLayout` at commit time out of `getActiveLevel()`, so an
// act switch redirects it into a plane nobody painted. See the second half of
// `map-gesture-witness.ts` for the full derivation.
//
// ═══ ROW 2: WHEEL-PREVENTDEFAULT-DEAD (lens sweep) ═══
//
// React registers root `wheel` listeners as PASSIVE, so `preventDefault` in an
// `onWheel` prop is a no-op and the browser's own ctrl+wheel page zoom runs
// anyway — a wheel gesture over the map zooms the whole application window. The
// repo already ruled on this: `art-shared/use-anchored-zoom.ts:11-12` states the
// rule and attaches a native `{ passive: false }` listener, through
// `use-attached-effect.ts` because a `useEffect(..., [])` that early-returns on a
// null ref never runs again for a CONDITIONALLY MOUNTED element — and this
// container is exactly that, since MapViewport returns an "open a level" panel
// before it ever renders the div.

import { describe, it, expect } from 'vitest';
import { join } from 'node:path';
// The repo's one comment-stripping source reader.
import { code, COMPONENTS } from './helpers/section-panels';

const MAP_VIEWPORT = join(COMPONENTS, 'MapViewport.tsx');

function mapViewport(): string {
  const src = code(MAP_VIEWPORT);
  if (!src.includes('export default function MapViewport()')) {
    throw new Error('map-surface-listeners scan: MapViewport.tsx did not read back as source. '
      + 'The comment stripper or the path is wrong, so nothing below measured anything.');
  }
  return src;
}

/** Text from `signature` to the brace that closes it, or a throw. */
function blockAt(src: string, signature: string): string {
  const at = src.indexOf(signature);
  if (at < 0) {
    throw new Error(`map-surface-listeners scan: could not find \`${signature}\` in `
      + 'MapViewport.tsx. Re-anchor this rule on whatever replaced it; do not delete the rule.');
  }
  const open = src.indexOf('{', at + signature.length - 1);
  let depth = 0;
  for (let i = open; i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}') {
      depth--;
      if (depth === 0) return src.slice(at, i + 1);
    }
  }
  throw new Error(`map-surface-listeners scan: \`${signature}\` has no closing brace. `
    + 'The reader lost its place, so this rule measured nothing.');
}

describe('the BG stroke is witnessed like every other gesture on this surface', () => {
  it('records WHICH PLANE it is painting when the stroke begins', () => {
    const paint = blockAt(mapViewport(), 'function paintBgTile(worldX: number, worldY: number): void {');
    // The identity of the array, not the (source, bgRef) pair: between two acts
    // that both fall back to their own default that pair is ('act', null) on both
    // sides, so it cannot see the switch at all.
    const init = paint.indexOf('bgStroke.current = {');
    expect(init, 'paintBgTile must be the one place a stroke is opened').toBeGreaterThan(-1);
    const opened = paint.slice(init, paint.indexOf('};', init) + 2);
    expect(opened, 'the stroke must carry the act it began on')
      .toContain('actKey: actKeyNow()');
    expect(opened, 'the stroke must carry the plane it writes through, by identity')
      .toContain('layout: resolved.layout');
    expect(opened, 'and the override document, whose replacement also moves the plane')
      .toContain('doc,');
    // The pair stays too: it is what separates a flush from a cancel.
    expect(opened).toContain('source: resolved.source');
    expect(opened).toContain('bgRef,');
  });

  it('decides same-stroke-or-next through the witness, not the pair alone', () => {
    const paint = blockAt(mapViewport(), 'function paintBgTile(worldX: number, worldY: number): void {');
    expect(paint, 'the continuity guard must ask the witness')
      .toContain('bgStrokeStatus(bgStroke.current,');
    // The pair comparison it replaced is the one that could not see an act
    // switch between two act-default planes. If it comes back as the whole test,
    // the hole comes back with it.
    expect(paint, 'a bare (source, bgRef) comparison cannot see an act switch')
      .not.toContain('bgStroke.current.source !== resolved.source');
  });

  it('is dropped by abandonStaleGestures when its plane moved', () => {
    const abandon = blockAt(mapViewport(), 'function abandonStaleGestures(): boolean {');
    expect(abandon, 'abandonStaleGestures must read the bg stroke')
      .toContain('bgStroke.current');
    expect(abandon, 'and ask the witness rather than re-deriving the question here')
      .toContain('bgStrokeStatus(');
    expect(abandon, 'and use the predicate that spares a background-switch')
      .toContain('bgStrokeMustRevert(');
    expect(abandon, 'and put back what the stroke already wrote')
      .toContain('revertBgStroke(');
    expect(abandon, 'and say why, through the one cancel notice')
      .toContain('bgStrokeStaleReason(');
  });

  it('reverts through the plane the stroke HELD, not the one resolved now', () => {
    // The whole point of an identity witness: after an act switch the fresh
    // resolution names somebody else's plane, and writing the old words into it
    // is the corruption rather than the fix. The stroke still holds the array it
    // wrote to, so the revert is exact even after that act was closed.
    const revert = blockAt(mapViewport(), 'function revertBgStroke(');
    expect(revert).toContain('stroke.entries');
    expect(revert, 'the revert must write through the stroke\'s own held plane')
      .toMatch(/stroke\.doc|stroke\.layout/);
    expect(revert, 'a revert that re-resolves the plane would write into the wrong act')
      .not.toContain('resolveDisplayedBg');
    expect(revert).not.toContain('getCurrentAct');
  });

  it('refuses to COMMIT a stroke whose act moved, at the writer itself', () => {
    // A consumer-side guard, derived from the producer's own sentence: the order
    // in `finishGesture` (abandonStaleGestures first) already makes this
    // unreachable today, and that order is a property of a caller. The commit is
    // where the corruption would actually be written, so the refusal lives here
    // too — and this is the arm a NEW call site to endBgStroke cannot defeat.
    const end = blockAt(mapViewport(), 'function endBgStroke(): void {');
    const guard = end.indexOf('stroke.actKey !== actKeyNow()');
    expect(guard, 'endBgStroke must check the act it is about to commit against')
      .toBeGreaterThan(-1);
    expect(end.indexOf('executeCommand'), 'the act check must precede every commit')
      .toBeGreaterThan(guard);
    expect(end.indexOf('revertBgStroke'), 'and a refused commit must put the live writes back')
      .toBeGreaterThan(-1);
  });

  it('CONTROL: the (source, bgRef) flush still commits rather than reverting', () => {
    // The row that catches the over-application. An artist whose active section
    // moves to a different background mid-drag made an edit the act still owns;
    // `paintBgTile` flushes it into a command, and turning that into a revert
    // would delete it. `bgStrokeMustRevert` spares `background-switched`, and
    // this is the call site that depends on it.
    const paint = mapViewport();
    const at = paint.indexOf('const bgRef = resolved.source === \'library\' ? resolved.libraryId : null;');
    expect(at, 'paintBgTile\'s stroke-continuity guard moved; re-anchor this rule')
      .toBeGreaterThan(-1);
    const after = paint.slice(at, at + 900);
    expect(after, 'the continuity guard must still flush through endBgStroke')
      .toContain('endBgStroke();');
  });
});

describe('the map\'s wheel listener is native and non-passive', () => {
  it('attaches wheel with { passive: false }, not through onWheel', () => {
    const src = mapViewport();
    expect(src, 'a native wheel listener is required: React\'s onWheel is passive, '
      + 'so preventDefault there never suppresses the browser\'s own zoom '
      + '(art-shared/use-anchored-zoom.ts:11-12 states this rule)')
      .toContain("addEventListener('wheel', onWheel, { passive: false })");
    expect(src, 'the listener must be removed again')
      .toContain("removeEventListener('wheel', onWheel)");
    expect(src, 'onWheel as a React prop is the dead form this row exists to keep out')
      .not.toContain('onWheel={');
  });

  it('attaches it through useAttachedEffect, not a mount-once effect', () => {
    // The repo's helper, and the reason it exists (use-attached-effect.ts): a
    // `useEffect(..., [])` that early-returns on a null ref never runs again, and
    // this container is conditionally mounted — MapViewport returns the "open a
    // level" panel before the div exists. That is the same shape that left
    // wheel-zoom dead in classic's Chunk and Block tabs.
    const src = mapViewport();
    expect(src, 'import the repo helper rather than re-deriving the attach')
      .toContain('useAttachedEffect');
    expect(src).toContain('useAttachedEffect(containerRef, (el) => {');
  });

  it('preventDefault is inside the native handler, where it works', () => {
    const src = mapViewport();
    const onWheel = blockAt(src, 'const onWheel = (e: WheelEvent) => {');
    expect(onWheel, 'the whole point of the native listener')
      .toContain('e.preventDefault();');
    // Unconditional, the convention use-anchored-zoom sets: it is the ctrl+wheel
    // case (the browser's page zoom) that is visible to the user, and gating the
    // suppression on a modifier would leave that one running.
    expect(onWheel, 'gating preventDefault on a modifier leaves the app-window zoom alive')
      .not.toContain('ctrlKey');
    expect(onWheel).not.toContain('metaKey');
  });

  it('reads the zoom action fresh, so the listener cannot go stale', () => {
    // The listener is re-attached only when the ELEMENT changes
    // (use-attached-effect.ts), so a store action captured from the first render
    // would be the one it keeps. Reading through getState() is what the rest of
    // this file already does for exactly this reason.
    const onWheel = blockAt(mapViewport(), 'const onWheel = (e: WheelEvent) => {');
    expect(onWheel).toContain('useViewStore.getState()');
    expect(onWheel, 'a captured setZoom would be the first render\'s')
      .not.toMatch(/^\s*setZoom\(/m);
  });
});
