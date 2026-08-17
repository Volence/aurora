import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { T } from '../ui';
import { useClassicLevelStore } from '../../state/classicLevelStore';
import { useClassicProjectStore } from '../../state/classicProjectStore';
import type { EditableTileRange } from '../../../core/project/adapter';
import { CANVAS_BLACK } from '../../canvas/canvas-colors';
import { levelKeysEnabled } from '../../workspace/level-keys';
import type { CanvasGeom } from './composer-math';

// Shared building blocks for the composer dock's three tabs (Task B3/B4). The dock
// was split into ChunkTab/BlockTab/TileTab sibling files (a mechanical move, no
// behavior change); the pieces every tab shares live here so the split doesn't
// duplicate them: the solidity vocabulary, the editable-tile-range hook + lock
// reason, the shared-edit banner, the Escape-cancel gesture hook, a nearest-
// neighbor blit helper, and the composer `styles`.

export const hex = (n: number) => `$${n.toString(16).toUpperCase()}`;

// Solidity vocabulary — verified against SonLVLAPI's Solidity enum
//   /home/volence/sonic_hacks/programs/SonLVL/SonLVLAPI/DataTypes.cs:400
//   0 NotSolid, 1 TopSolid, 2 LRBSolid, 3 AllSolid.
//
// `full` IS THE TOOLTIP, so it says what the value DOES rather than what
// SonLVL's C# enum member is called. "TopSolid" is a name from another tool's
// source; "Solid from above only — you can jump up through it" is the thing the
// artist is choosing. The enum spellings stay in the comment above, where they
// belong: they are provenance for whoever checks the mapping, not UI copy.
export const SOLIDITY = [
  { v: 0, label: 'None', full: 'Not solid — the player passes straight through', tint: null as string | null },
  { v: 1, label: 'Top', full: 'Solid from above only — you can jump up through it', tint: 'rgba(80,160,255,0.30)' },
  { v: 2, label: 'LRB', full: 'Solid from the sides and below, but not from above', tint: 'rgba(255,170,60,0.30)' },
  { v: 3, label: 'All', full: 'Solid from every direction', tint: 'rgba(255,70,70,0.32)' },
];

/** The writable tile span for the open act, or null (unknown / fakes). */
export function useEditableTileRange(): EditableTileRange | null {
  const ref = useClassicLevelStore((s) => s.ref);
  const handle = useClassicProjectStore((s) => s.handle);
  return useMemo(() => {
    if (!ref || !handle?.levels?.editableTileRange) return null;
    return handle.levels.editableTileRange(ref);
  }, [ref, handle]);
}

// The lock predicate itself lives in core (project/editable-tiles) so the UI and
// the command that actually refuses the commit cannot drift, and so it is
// reachable from the node-only test suite — this file is .tsx, which vitest does
// not collect. Re-exported here because every composer tab imports it from the
// shared module.
export { tileLockReason } from '../../../core/project/editable-tiles';

/**
 * An inline status strip stating a tile/block/chunk's linkage — that editing it
 * edits every place it is used — with an optional Duplicate action.
 *
 * DELIBERATELY NEUTRAL, not a warning. A662e99's `⚠` glyph and amber hazard
 * tint framed the shared-art reference ladder as a defect to route around; per
 * plan A8 (docs/superpowers/plans/2026-08-15-art-authoring-phase1-paint-through.md,
 * "A8 resolved") the SAME MECHANISM — edit once, every placement updates — is
 * the headline feature of a tileset-based pixel editor, so the banner now
 * states it as one: `styles.banner` carries neutral chrome tokens (the same
 * `T.overlay`/`T.border` the composer's other secondary controls use), and this
 * component draws no glyph of its own. `text` still carries the copy, so this
 * is styling-and-copy only — no prop shape change, no new command.
 *
 * NOT THE LOCKED-TILE BANNER. TileTab's red "🔒 tile … is locked" banner is a
 * genuine refusal (the tile cannot be edited at all here, not just edited
 * everywhere) and is a SEPARATE inline `<div>` in TileTab.tsx that spreads
 * `styles.banner` and then overrides its background/borderColor back to a
 * hazard red — it does not call this component, so restyling `SharedBanner`
 * cannot neutralise it. See TileTab.tsx's locked-tile block.
 */
export function SharedBanner({ text, onDuplicate, dupLabel }: { text: string; onDuplicate?: () => void; dupLabel?: string }) {
  return (
    <div style={styles.banner}>
      <span style={{ flex: 1 }}>{text}</span>
      {onDuplicate && (
        <button onClick={onDuplicate} style={styles.dupBtn}>{dupLabel ?? 'Duplicate'}</button>
      )}
    </div>
  );
}

/** Whether a keyboard event targets a text-entry field (Escape belongs to it).
 *  Re-exported, not restated: shell/typing-target.ts owns the rule now, because
 *  five other surfaces had each grown their own slightly different copy. */
export { isTypingTarget } from '../../shell/typing-target';
import { isTypingTarget } from '../../shell/typing-target';

/**
 * Register a window Escape handler for a composer tab, under the two guards
 * every one of them needs: inert while a sprite-doc tab owns the keyboard (the
 * classic composer is keep-alive/hidden then — see workspace/level-keys.ts,
 * finding 1), and inert while a text field has focus, where Escape belongs to
 * the field.
 *
 * The guards are here rather than in each tab because they are what makes an
 * Escape binding SAFE, and a tab that reimplemented the keydown would be a tab
 * that could forget one. `handler` decides only whether there is anything to
 * cancel.
 */
export function useEscapeKey(handler: () => void): void {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!levelKeysEnabled()) return;
      if (e.key !== 'Escape') return;
      if (isTypingTarget(e.target as HTMLElement)) return;
      handler();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [handler]);
}

/**
 * Escape cancels an in-progress canvas gesture held as a `strokeRef` Map — the
 * shape the Chunk tab's hand-rolled paint uses.
 *
 * ONE CALLER TODAY: ChunkTab, the only tab with a `strokeRef` at all. BlockTab
 * commits per click rather than per drag, so it has neither a stroke to cancel
 * nor an Escape binding (`useWindowStrokeEnd`'s docblock below says the same of
 * the release path). The Tile tab's stroke lives inside a PixelEditController
 * instead and cancels through `useEscapeKey` directly.
 */
export function useEscapeCancel(strokeRef: React.MutableRefObject<Map<number, number> | null>, redraw: () => void): void {
  useEscapeKey(useCallback(() => {
    if (strokeRef.current) { strokeRef.current = null; redraw(); }
  }, [strokeRef, redraw]));
}

/**
 * Finish an in-progress canvas gesture on the window's mouseup — wherever the
 * button is actually released.
 *
 * WHY: the hand-rolled tab editors are small canvases (the Chunk tab's grid is
 * 320px square), so a paint drag leaves them constantly. They used to hang the
 * commit off the canvas's own `onMouseUp` and additionally DISCARD the whole
 * stroke on `onMouseLeave`, which meant any drag that crossed the edge silently
 * threw the user's work away — no commit, no message, nothing on the canvas.
 * Ending on the window instead is what every paint tool does, and it leaves
 * Escape (useEscapeCancel) as the ONE deliberate cancel.
 *
 * `endStroke` must be idempotent — the canvas's own onMouseUp may fire first.
 *
 * ONE CALLER TODAY: ChunkTab. BlockTab commits per click rather than per drag
 * and only borrows the latest-ref idiom (see its note); the Tile tab's release
 * is PixelViewport's pointer capture, which needs no window listener. Kept
 * shared because the two hand-rolled tabs remain a pair and either could grow a
 * drag back.
 */
export function useWindowStrokeEnd(endStroke: () => void): void {
  const latest = React.useRef(endStroke);
  useEffect(() => { latest.current = endStroke; }, [endStroke]);
  useEffect(() => {
    const onUp = (): void => latest.current();
    window.addEventListener('mouseup', onUp);
    return () => window.removeEventListener('mouseup', onUp);
  }, []);
}

/**
 * Read a canvas's live box geometry for the hit-test math in composer-math.
 *
 * Kept as a one-liner DOM reader so the actual mapping stays pure and node-
 * testable (this file is .tsx, which vitest does not collect — same reason
 * tileLockReason lives in core). `clientLeft`/`clientTop` ARE the left/top
 * border widths, and `clientWidth`/`clientHeight` the rendered content size, so
 * no getComputedStyle parse is needed on this per-mousemove path.
 */
export function canvasGeom(canvas: HTMLCanvasElement): CanvasGeom {
  const rect = canvas.getBoundingClientRect();
  return {
    left: rect.left, top: rect.top,
    borderLeft: canvas.clientLeft, borderTop: canvas.clientTop,
    cssWidth: canvas.clientWidth, cssHeight: canvas.clientHeight,
    width: canvas.width, height: canvas.height,
  };
}

/**
 * The live content-box size of an element, in CSS px, tracked by ResizeObserver.
 *
 * WHAT IT IS FOR: the Chunk and Block tiers size their canvas from the room the
 * layout gives them (`fitCellSize` in composer-math), and the room is only
 * knowable at layout time. Zero until the first observation — `fitCellSize`
 * treats that as "unmeasured" and returns its floor, so the first paint is the
 * size the tab has always had rather than a degenerate one.
 *
 * TAKES THE ELEMENT, NOT A REF. The box it measures is mounted conditionally
 * (ChunkTab draws no canvas for air), and an effect keyed on a ref object never
 * re-runs when the ref's `current` later becomes non-null — it would bind an
 * observer to nothing and stay at the floor forever. A callback ref into state
 * re-runs it. Same reason PixelViewport's `canvasRef` is an out-param.
 *
 * NO FEEDBACK LOOP: the observed box is a flex item with `overflow: hidden`, so
 * the canvas this measurement sizes cannot push it back. The size is compared
 * before it is stored anyway, so an observation that changes nothing renders
 * nothing.
 */
export function useBoxSize(el: HTMLElement | null): { w: number; h: number } {
  const [size, setSize] = useState({ w: 0, h: 0 });
  useEffect(() => {
    if (!el) return;
    const read = () => setSize((prev) => (
      prev.w === el.clientWidth && prev.h === el.clientHeight ? prev : { w: el.clientWidth, h: el.clientHeight }
    ));
    const ro = new ResizeObserver(read);
    ro.observe(el);
    read();
    return () => ro.disconnect();
  }, [el]);
  return size;
}

/**
 * Draw a small RGBA buffer scaled (nearest-neighbor) into a canvas via a temp
 * canvas. The ONE composer blit helper — shared by the tab editors and the
 * composer thumbnails (both were near-identical copies).
 */
export function drawBufferScaled(
  canvas: HTMLCanvasElement | null, buf: Uint8ClampedArray,
  srcW: number, srcH: number, dstW: number, dstH: number,
): void {
  // willReadFrequently keeps both the destination (composer tab / thumbnail) canvas
  // and the temp upscale-source CPU-backed. These are pixel-art putImageData +
  // nearest-neighbor blits — a GPU texture buys nothing, and on GPU-poor machines
  // (NVKMS/GEM allocation failures) canvas promotion is a stall path. Matches the
  // classic viewport's CPU-canvas strategy. NOTE: getContext options only apply on
  // the FIRST call for a canvas — the tab editors that call getContext directly
  // (before drawBufferScaled) set the same option there so their context is CPU-
  // backed too.
  const ctx = canvas?.getContext('2d', { willReadFrequently: true });
  if (!ctx) return;
  ctx.imageSmoothingEnabled = false;
  ctx.clearRect(0, 0, dstW, dstH);
  const tmp = document.createElement('canvas');
  tmp.width = srcW; tmp.height = srcH;
  const tctx = tmp.getContext('2d', { willReadFrequently: true });
  if (!tctx) return;
  const img = tctx.createImageData(srcW, srcH);
  img.data.set(buf);
  tctx.putImageData(img, 0, 0);
  ctx.drawImage(tmp, 0, 0, dstW, dstH);
}

export const styles: Record<string, React.CSSProperties> = {
  // THE CANVAS, not a bottom strip. Until task 9 this carried `borderTop` (the
  // rule separating it from the map above) and `flexShrink: 0` (so it kept its
  // content height in a column that also held the viewport). In the shell's
  // canvas slot both were wrong: the border read as a stray rule across the top
  // of the screen, and not growing left the composer a bordered card floating
  // above two thirds of empty window. `flex: 1` + `minHeight: 0` is what
  // MapViewport gets in the same slot.
  dock: { display: 'flex', flexDirection: 'column', background: T.void, flex: 1, minHeight: 0 },
  dockHead: { display: 'flex', alignItems: 'center', gap: 10, padding: '2px 8px', borderBottom: `1px solid ${T.border}` },
  tabBar: { display: 'flex', gap: 2 },
  tabBtn: {
    background: 'transparent', borderWidth: 1, borderStyle: 'solid', borderColor: 'transparent', color: T.textLo,
    padding: '2px 12px', fontSize: T.tXs, cursor: 'pointer', borderRadius: 3,
  },
  tabBtnActive: { background: T.accent, color: T.onAccent, borderColor: T.accent, fontWeight: T.wSemibold },
  dockHint: { fontSize: T.t2xs, color: T.textFaint },
  // `maxHeight: 380` was the strip's cap on how much of the window it could take
  // from the map. As the canvas there is no map to protect, and the cap left a
  // hard edge with empty space below it — so it grows instead, and scrolls
  // inside itself when the open tier needs more room than the slot has.
  // A COLUMN, so `tabBody` below has a main axis to grow along. As a plain block
  // box (what this was) a child's `flex` means nothing and the tab body took its
  // content height no matter what the dock did.
  dockContent: { flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', overflowY: 'auto', overflowX: 'auto' },

  // ---------------------------------------------------------------------------
  // THE TAB BODY FILLS THE SLOT (H3.1). MEASURED, BEFORE: on a 1400x872 window
  // the dock content box was 751px and the tab body 500px (Chunk), 478 (Block),
  // 394 (Tile) — 251/273/325px of dead canvas, 33%/36%/45% of the slot. It was
  // `alignItems: 'flex-start'` in a box that never told it to grow.
  // ---------------------------------------------------------------------------
  //
  // `flex: '1 1 0'` — BASIS ZERO, and that is the load-bearing part. The obvious
  // shape is `flex: '1 0 auto'` ("at least my content, all of the slot when the
  // slot is bigger"), and it was tried and MEASURED: the body went to 2387px on
  // Chunk, 4071 on Block, 3201 on Tile. Basis `auto` is the INTRINSIC height,
  // and a flex container's intrinsic height counts a `flex-grow` child by its
  // own max-content size (CSS Flexbox §9.9.1) — so the palette strips below,
  // which lost their `maxHeight` in the same change, contributed all 1814/2739/
  // 3510px of unwrapped thumbnails, the body grew to hold them, and the tiers
  // that had 251px of dead space now had a 3000px scrollbar. Basis 0 takes the
  // height from the CONTAINER instead, which is the only source that knows how
  // big the slot is.
  //
  // Shrinking below content is then handled where it belongs: the browse strips
  // scroll their own rows, and the editor's fit box carries a `minHeight` floor
  // (see `fitBox`), so a window too short for the tier overflows this box and
  // `dockContent`'s scrollbar — which is what that scroller is for — rather than
  // crushing the canvas.
  //
  // `alignItems: 'stretch'` is the other half — it is what hands the height on
  // to the columns, which is where it gets spent (see `paletteStrip`).
  tabBody: { display: 'flex', gap: 12, padding: 10, alignItems: 'stretch', flex: '1 1 0', minHeight: 0 },

  // A SHARE OF THE WIDTH, not its content's width. It was `flexShrink: 0` with
  // no basis, so it sized to whatever its widest ROW happened to be (385px on
  // Chunk, 269 on Tile) and left the rest of the body empty — and, worse, it
  // align-stretched its canvas child to that width, which is how a 320px chunk
  // bitmap came to be drawn in a 385px box. A definite share is also what makes
  // the fit box below measurable: a content-sized column measured by its own
  // content is a circular constraint.
  //
  // `2 1 0` against the palettes' `1 1 0`: the editor is the subject and the
  // strips are the browser. `minWidth` is a floor for the header row's buttons.
  editorCol: { display: 'flex', flexDirection: 'column', gap: 6, flex: '2 1 0', minWidth: 320, minHeight: 0 },
  paletteCol: { display: 'flex', flexDirection: 'column', gap: 4, minWidth: 220, maxWidth: 360, flex: '1 1 0', minHeight: 0 },
  paletteHead: { fontSize: T.t2xs, color: T.textLo, textTransform: 'uppercase', letterSpacing: 0.5, fontWeight: T.wSemibold },

  // WHERE THE RECOVERED HEIGHT ACTUALLY GOES. `maxHeight: 300` was the browse
  // strips' own cap; with the body now full-height it was the thing keeping the
  // dead space — a 300px box of 26px thumbnails scrolling 2553px of tiles in a
  // 719px column. `flex: 1` + `minHeight: 0` is the same column-bounded shape
  // the panel columns use (see components/__tests__/panel-scrollers.test.ts):
  // the ceiling arrives from the column instead of from a number that cannot
  // know how tall the column is.
  paletteStrip: {
    display: 'flex', flexWrap: 'wrap', alignContent: 'flex-start', gap: 3,
    flex: '1 1 0', minHeight: 0, overflowY: 'auto', padding: 2, background: T.surface, borderRadius: 3,
  },

  // ---------------------------------------------------------------------------
  // THE CHUNK/BLOCK FIT BOX — and why those two tiers are NOT stretched.
  // ---------------------------------------------------------------------------
  // The Tile tier zooms (artStore.zoom, useAnchoredZoom, useHandPan), so giving
  // it room is the whole fix: TileTab's viewport box grows and zoom spends it.
  // The Chunk and Block canvases have no zoom, and they are `imageRendering:
  // pixelated` bitmaps sized in integer cells — so the size has to come from the
  // CELL, never from the CSS box.
  //
  // WHAT SHIPPED: a fit-to-space that picks the largest WHOLE-PIXEL cell that
  // fits this box (`fitCellSize`, unit-tested in composer-math), with the
  // remainder CENTRED. Both halves matter: the fit is what stops the grid being
  // a 320px card in a 900px slot, and the centring is what absorbs the few px
  // the integer cell leaves over.
  //
  // REJECTED — stretching the box with CSS. It is not hypothetical: it is what
  // the composer was already doing by accident. The canvases were direct
  // children of the column-flex `editorCol` and so were align-stretched, so a
  // 320px chunk bitmap was presented in a 385px box and a 128px block bitmap in
  // a 340px one. `pixelated` then draws art pixels unevenly 1 or 2 screen px
  // wide, and `canvasLocalPoint`'s CSS-vs-backing-store scale term — written as
  // "the identity today" — was silently the only reason clicks still landed.
  // This box has `alignItems/justifyContent: center`, which is also what stops
  // that stretch from coming back.
  //
  // REJECTED — centring alone (no fit). It moves the dead space rather than
  // removing it: ~125px above and ~125px below, and a chunk grid still at 20px
  // cells, which IS the thing being complained about.
  //
  // `overflow: hidden` keeps the loop open: a canvas larger than the box cannot
  // push the box wider, so the measurement that sized it cannot be changed by
  // it. CALLERS MUST SUPPLY `minHeight` — the floor cell size times the grid, so
  // that a window too short for the tier overflows the tab body and reaches
  // `dockContent`'s scrollbar instead of clipping the canvas. It is per-tab, so
  // it is not baked in here.
  fitBox: {
    flex: '1 1 0', minWidth: 0, overflow: 'hidden',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
  },
  gridCanvas: { display: 'block', imageRendering: 'pixelated', background: CANVAS_BLACK, border: `1px solid ${T.border}`, borderRadius: 3 },
  rowWrap: { display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
  title: { fontSize: T.tSm, fontWeight: T.wSemibold, color: T.textHi, fontFamily: T.fontMono },
  count: { fontSize: T.t2xs, color: T.textLo, fontFamily: T.fontMono },
  dim: { fontSize: T.t2xs, color: T.textLo },
  hintRow: { fontSize: T.t2xs, color: T.textFaint },
  notice: { fontSize: T.tXs, color: T.textLo, padding: '12px 4px', maxWidth: 320, lineHeight: 1.5 },
  // NEUTRAL STATUS CHROME, not a warning — same tokens as `smallBtn`/`dupBtn`'s
  // own resting chrome (`T.overlay`/`T.border`), because the linkage this
  // banner states (edit one, every placement updates) is a mechanism, not a
  // hazard. Task 10 dropped the `⚠` glyph and the amber `rgba(255,170,60,…)`
  // hazard tint this used to carry; TileTab's LOCKED-tile banner is a real
  // refusal and still overrides these two fields back to red on its own
  // (see SharedBanner's docblock) — it does not go through this component.
  banner: {
    display: 'flex', alignItems: 'center', gap: 8, fontSize: T.t2xs, color: T.textBase,
    background: T.overlay, borderWidth: 1, borderStyle: 'solid', borderColor: T.border,
    borderRadius: 3, padding: '4px 8px', maxWidth: 340,
  },
  dupBtn: {
    background: T.accent, color: T.onAccent, border: 'none', borderRadius: 3,
    padding: '2px 8px', fontSize: T.t2xs, fontWeight: T.wSemibold, cursor: 'pointer', flexShrink: 0,
  },
  smallBtn: {
    background: T.overlay, color: T.textBase, border: `1px solid ${T.border}`, borderRadius: 3,
    padding: '2px 8px', fontSize: T.t2xs, cursor: 'pointer',
  },
  swatchRow: { display: 'flex', gap: 3, flexWrap: 'wrap' },
};
