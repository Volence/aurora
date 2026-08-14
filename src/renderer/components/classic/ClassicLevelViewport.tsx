import React, { useRef, useEffect, useState, useCallback } from 'react';
import { T } from '../ui';
import { useClassicLevelStore, classicSetLayoutCells, classicSetObjects, classicSetStart } from '../../state/classicLevelStore';
import { useEditorStore } from '../../state/editorStore';
import { useViewStore } from '../../state/viewStore';
import { useWorkspaceStore } from '../../workspace/workspaceStore';
import { levelDocId } from '../../shell/tabs';
import { armedPlacementId } from '../../state/classic-placement';
import { useClassicProjectStore } from '../../state/classicProjectStore';
import { useClassicObjectArtStore, refreshClassicObjectSprites, spriteFor } from '../../state/classicObjectArtStore';
import { useToastStore } from '../../state/toastStore';
import { renderChunk } from '../../../core/level-classic/render';
import type { LevelDoc } from '../../../core/level-classic/model';
import { s1ObjectIsInvisible } from '../../../core/project/profiles/s1-objects';
import {
  CHUNK_PX, visibleChunkRange, layoutCellAt, screenToWorld, clampInt,
  worldToLayoutCell, addStampCell, stampAccumToCells, hitTestObjectFrames, hitTestPoint,
  type ObjectHitBounds, type StampCell,
} from './viewport-math';
import { drawCollision, drawObjects, drawStart, GHOST_MARKER_BOUNDS } from './classic-overlays';
import { isTypingTarget } from './composer-shared';
import { classicSurfaceProps } from './classic-surface';
import { levelKeysEnabled } from '../../workspace/level-keys';
import {
  CANVAS_VOID,
  STAMP_PREVIEW_FILL, STAMP_PREVIEW_STROKE,
  LOOP_GLYPH_FILL, LOOP_GLYPH_TEXT,
} from '../../canvas/canvas-colors';

interface Camera {
  x: number;
  y: number;
  zoom: number;
}

/**
 * Env-guarded paint instrumentation switch (AURORA_PERF=1, read in main, surfaced
 * as a preload boolean). When off (the default) every perf hook below short-
 * circuits on this constant — zero overhead. When on, the viewport logs ONE line
 * per act load to the MAIN-process terminal (store-ready ms, first-paint ms, draw
 * count, avg/max draw ms over the first 2s), so we can read real paint numbers off
 * a user's GPU-poor machine without a CDP session. Cheap: performance.now diffs,
 * no profiler.
 */
const PERF = typeof window !== 'undefined' && !!window.api?.perfEnabled;

/** Object-tool pick tolerance in SCREEN pixels (converted to world via /zoom). */
const OBJECT_PICK_PX = 12;
/**
 * S1 object coordinate bounds (validateLevelDoc): x is 16-bit but the top value
 * $FFFF is the objpos terminator sentinel (an object can't hold it — the encoder
 * self-check rejects it downstream), so edit-time clamps to $FFFE; y is 12-bit.
 */
const OBJ_X_MAX = 0xfffe;
const OBJ_Y_MAX = 0x0fff;
/**
 * Player-start coordinate bound. Start lives in its own startpos file (two 16-bit
 * words), NOT the objpos table, so it has no terminator sentinel — the full
 * 0..$FFFF range is valid (matches classicSetStart's validation).
 */
const START_MAX = 0xffff;

/**
 * Draw the loop-flag corner badge for a layout cell whose top-left is at world
 * (x0,y0). Sized in world units × invZoom so it stays a constant on-screen size
 * regardless of camera zoom. A filled amber disc with an "∞" glyph — distinct
 * from the object/ring/stamp overlays.
 */
function drawLoopGlyph(ctx: CanvasRenderingContext2D, x0: number, y0: number, invZoom: number): void {
  const r = 8 * invZoom;
  const cx = x0 + r + 2 * invZoom;
  const cy = y0 + r + 2 * invZoom;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fillStyle = LOOP_GLYPH_FILL;
  ctx.fill();
  ctx.fillStyle = LOOP_GLYPH_TEXT;
  ctx.font = `bold ${11 * invZoom}px sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('∞', cx, cy + 0.5 * invZoom);
  ctx.textAlign = 'start';
  ctx.textBaseline = 'alphabetic';
}

/**
 * Read-only classic (Sonic 1) level viewport (Task 11). Composes the FG/BG chunk
 * layout from `renderChunk` prerenders (cached per chunk id — read-only, so the
 * cache is only invalidated when the whole doc changes), with a pan/zoom camera
 * and the collision / object / start overlays the shared View menu toggles.
 *
 * JUST THE CANVAS. It renders no chrome of its own: the tool buttons, the FG/BG
 * plane control and the overlay toggles it used to stack above the canvas are
 * the shared shell's (tool dock + workspace header), reading the same stores it
 * reads. The contextual hint line that was genuinely classic's own lives in
 * ClassicMapToolOptions, mounted in the facet's toolOptions slot.
 *
 * CAMERA MATH matches the map viewport's (src/renderer/state/viewStore.ts):
 * `cam.x/cam.y` is the world coordinate at the canvas top-left, `zoom` scales
 * world→screen, so the draw transform is `scale(zoom); translate(-cam.x,
 * -cam.y)` and screen→world is `cam.x + screenPx/zoom`. The visible-chunk /
 * layout-index / ring-expansion logic lives in the unit-tested `./viewport-math`.
 *
 * The camera is a REF that publishes to `viewStore` once per painted frame, and
 * adopts writes that came from elsewhere — not a subscribed selector. Both
 * halves matter: the store is what makes the camera addressable from outside
 * (agent goto, per-tab restore), and the ref is what keeps a drag from
 * re-rendering this component on every mousemove. Reverting the ref to state
 * rebuilds the redraw storm three perf commits removed; there is a guard test.
 */
export default function ClassicLevelViewport() {
  const status = useClassicLevelStore((s) => s.status);
  const doc = useClassicLevelStore((s) => s.doc);
  const ref = useClassicLevelStore((s) => s.ref);
  const error = useClassicLevelStore((s) => s.error);
  // Per-chunk content versions (Task 12): edits bump only the chunks they touch
  // (or the whole epoch), so the chunk-art cache below invalidates precisely.
  const chunkVersions = useClassicLevelStore((s) => s.chunkVersions);
  const chunkEpoch = useClassicLevelStore((s) => s.chunkEpoch);
  // Fine content clocks for the object-sprite refresh below. Chunk art keeps
  // using the coarse chunkEpoch above (it genuinely bakes tiles+blocks+palette);
  // sprites do not, so they read the narrower signals.
  const paletteEpoch = useClassicLevelStore((s) => s.paletteEpoch);
  const tileEpoch = useClassicLevelStore((s) => s.tileEpoch);
  // The tool is engine-neutral now (spec §3.6): classic's pan/stamp/object are
  // view / stamp-chunk / (select | place-object) in the one vocabulary.
  const tool = useEditorStore((s) => s.tool);
  const setTool = useEditorStore((s) => s.setTool);
  const selectedChunkId = useClassicLevelStore((s) => s.selectedChunkId);
  // No `stampLoop` subscription: nothing this component DRAWS depends on it (the
  // loop badge comes from the layout byte, the hover ghost from the chunk art),
  // and the commit path reads it through getState at stamp time. The hint line
  // that used to render it moved out (ClassicMapToolOptions), so subscribing
  // here would only re-render the canvas host for a toggle it cannot show.
  const setSelectedChunkId = useClassicLevelStore((s) => s.setSelectedChunkId);
  const setStampLoop = useClassicLevelStore((s) => s.setStampLoop);
  // Task 14 object-tool UI state (selection index + armed place-mode id).
  const selectedObjectIndex = useClassicLevelStore((s) => s.selectedObjectIndex);
  const armedObjectId = useClassicLevelStore((s) => s.armedObjectId);
  const setSelectedObjectIndex = useClassicLevelStore((s) => s.setSelectedObjectIndex);
  const setArmedObjectId = useClassicLevelStore((s) => s.setArmedObjectId);
  // The armed id, gated on the place-object tool — switching tools disarms
  // without any call site having to clear it (classic-placement.ts).
  const armedId = armedPlacementId(tool, armedObjectId);
  // Task B1 object sprites: real art keyed by object id. The published map +
  // version are read by the render pass; `version` bumps on every republish (a
  // sprite finished loading), which re-runs the depless render effect below.
  const objectSprites = useClassicObjectArtStore((s) => s.sprites);
  const objectArtVersion = useClassicObjectArtStore((s) => s.version);
  const projectDir = useClassicProjectStore((s) => s.dir);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const camRef = useRef<Camera>({ x: 0, y: 0, zoom: 1 });
  // Cached canvas backing-store size. Written ONLY by the measure/ResizeObserver
  // path below — the render pass reads it and never resizes the canvas (assigning
  // width/height reinitializes the backing store) nor forces layout via
  // getBoundingClientRect, so drags stay cheap.
  const sizeRef = useRef<{ w: number; h: number }>({ w: 0, h: 0 });
  const [, forceRedraw] = useState(0);
  // Coalesce redraws through requestAnimationFrame: a pan/stamp/object drag can
  // fire redraw() on every mousemove (a high-poll mouse emits hundreds/sec), and
  // each redraw is a full clear+recompose. Without coalescing that is a redraw
  // storm — many draws per displayed frame, all but the last wasted. rafRef holds
  // the pending frame handle; the first redraw of a frame schedules one draw, and
  // further redraws before it fires are absorbed (the trailing state bump still
  // reflects the latest ref-based camera/stroke state). Cancelled on unmount.
  const rafRef = useRef<number | null>(null);
  // The camera values last pushed to viewStore. Two jobs: it keeps the push
  // below to frames where the camera actually moved, and it is what lets the
  // adopt-subscription tell OUR OWN echo from a genuine external write.
  const syncedRef = useRef<Camera>({ x: 0, y: 0, zoom: 1 });
  // The tab the fit effect last ran for, so it can tell an ACT LOAD from a plane
  // switch — only the former defers to a remembered viewport.
  const lastFitTabRef = useRef<string | null>(null);
  const redraw = useCallback(() => {
    if (rafRef.current != null) return;
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = null;
      // Publish the camera ONCE PER PAINTED FRAME (spec §3.6 / step D). The ref
      // stays the hot path — a drag mutates it on every mousemove and this rAF
      // is what a high-poll mouse's hundreds of events per second collapse
      // into. Subscribing to vpX/vpY/zoom with a selector instead would
      // re-render this component per mousemove and rebuild exactly the redraw
      // storm the perf work removed (see the guard test in __tests__).
      const cam = camRef.current;
      const last = syncedRef.current;
      if (cam.x !== last.x || cam.y !== last.y || cam.zoom !== last.zoom) {
        syncedRef.current = { ...cam };
        useViewStore.getState().setViewport(cam.x, cam.y, cam.zoom);
      }
      forceRedraw((n) => n + 1);
    });
  }, []);
  useEffect(() => () => { if (rafRef.current != null) cancelAnimationFrame(rafRef.current); }, []);

  // Adopt camera writes that did NOT come from this component — the agent
  // handler's goto, a per-tab viewport restore, any future shared zoom control.
  // Imperative subscribe, not a selector hook, for the reason above.
  //
  // Self-echo is filtered by exact equality against what we just published: the
  // push writes those three numbers verbatim, and setViewport's clamps match the
  // bounds the wheel handler already applies, so a value that survived our own
  // push comes back identical. No epsilon, no in-flight flag, no feedback loop.
  useEffect(() => useViewStore.subscribe((s) => {
    const cam = camRef.current;
    if (s.vpX === cam.x && s.vpY === cam.y && s.zoom === cam.zoom) return;
    cam.x = s.vpX;
    cam.y = s.vpY;
    cam.zoom = s.zoom;
    syncedRef.current = { ...cam };
    redraw();
  }), [redraw]);

  // Plane and overlays are shared state now (spec §3.6), not viewport-local:
  // unreachable from outside the component is exactly what stopped a shared
  // plane control and shared overlay toggles from serving both engines. The
  // plane IS aeon's editingLayer — same 'fg' | 'bg' union, same meaning.
  //
  // READ-ONLY here now. The writers are the workspace header's FG/BG chips and
  // its View menu; this component only reacts to them. Note that object editing
  // below is gated on `plane === 'fg'`, which is why the header offers the plane
  // control on the OBJECTS facet as well as layout (LevelWorkspace's showPlane)
  // — without it, place-object on BG would silently pan.
  const plane = useEditorStore((s) => s.editingLayer);
  const overlays = useViewStore((s) => s.overlays);

  // Per-chunk prerender cache (chunkId → {offscreen canvas, version key}). A cached
  // canvas is reused while its content version is unchanged; edits bump the version
  // of only the affected chunk(s) (or the epoch, for edits that touch all chunk
  // art), so a single-chunk edit rebuilds just that one canvas. The whole cache is
  // wiped only when a DIFFERENT act is loaded (ref identity changes) — edits keep
  // the same ref, so they never wipe it. (Version values are process-unique, so a
  // reload's fresh epoch also can't collide with a prior level's cached keys.)
  //
  // UNDO CAVEAT (tempered): this holds only the LATEST canvas per chunk id, keyed
  // by its current version. Undo/redo restore an OLDER version value, whose key
  // won't match the stored one, so an undo re-renders the affected chunk(s) rather
  // than reusing a retained pre-edit canvas. That is correct (the render is
  // deterministic in the doc), just not free — a bounded LRU keyed by version
  // would make undo a cache hit, but isn't worth the memory for v1.
  const chunkCache = useRef<Map<number, { canvas: HTMLCanvasElement; key: string }>>(new Map());
  useEffect(() => {
    chunkCache.current = new Map();
  }, [ref]);

  // ---- paint instrumentation (AURORA_PERF=1) -------------------------------
  // The current act load's paint accumulator (null when perf is off). Written by
  // the render effect (draw count + timings) and the ready-transition effect
  // (store-ready ms); flushed as one main-process log line 2s after the load
  // starts. Everything is gated on PERF, so this whole block is inert by default.
  const perfRef = useRef<{
    loadStart: number; ready: number | null; firstPaint: number | null;
    draws: number; sum: number; max: number; reported: boolean;
  } | null>(null);
  const perfTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!PERF) return;
    if (perfTimer.current != null) clearTimeout(perfTimer.current);
    const acc = { loadStart: performance.now(), ready: null as number | null, firstPaint: null as number | null, draws: 0, sum: 0, max: 0, reported: false };
    perfRef.current = acc;
    const r = ref;
    // Flush after a 2s measurement window (captures the load burst; a faster act
    // switch cancels this incomplete window and starts a fresh one).
    perfTimer.current = setTimeout(() => {
      acc.reported = true;
      const label = r ? `${r.zone}${r.act}` : '?';
      const avg = acc.draws ? acc.sum / acc.draws : 0;
      const n = (v: number | null) => (v == null ? 'n/a' : `${v.toFixed(1)}ms`);
      window.api?.perfLog(
        `${label} storeReady=${n(acc.ready)} firstPaint=${n(acc.firstPaint)} ` +
        `draws=${acc.draws} avgDraw=${avg.toFixed(2)}ms maxDraw=${acc.max.toFixed(2)}ms (first 2s)`,
      );
    }, 2000);
    return () => { if (perfTimer.current != null) { clearTimeout(perfTimer.current); perfTimer.current = null; } };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ref]);
  useEffect(() => {
    if (!PERF) return;
    const acc = perfRef.current;
    if (acc && acc.ready == null && status === 'ready') acc.ready = performance.now() - acc.loadStart;
  }, [status]);

  const getChunkCanvas = useCallback(
    (d: LevelDoc, chunkId: number, key: string): HTMLCanvasElement => {
      const cache = chunkCache.current;
      const hit = cache.get(chunkId);
      if (hit && hit.key === key) return hit.canvas;
      const c = hit?.canvas ?? document.createElement('canvas');
      c.width = CHUNK_PX;
      c.height = CHUNK_PX;
      // willReadFrequently keeps Chromium's 2D backing store in CPU memory rather
      // than promoting it to a GPU texture. These per-chunk caches are only ever
      // filled by putImageData (a CPU write) and then blitted into the main canvas;
      // a GPU texture buys nothing and, on GPU-poor machines (e.g. NVIDIA drivers
      // failing NVKMS/GEM allocations), each promotion/blit hits a failure/stall
      // path that turns a full viewport paint into seconds. Software canvas at this
      // scale (≤ ~60 chunk blits/frame, pixel-art, smoothing off) is comfortably
      // 60fps AND independent of GPU allocation health. The chunk-picker thumbs are
      // already CPU-backed via a shared scratch canvas — the same lesson, applied
      // to the viewport.
      const cctx = c.getContext('2d', { willReadFrequently: true });
      if (cctx) {
        // createImageData + data.set avoids the ImageData ctor's ArrayBuffer-typed
        // overload rejecting the core's Uint8ClampedArray<ArrayBufferLike> (repo
        // pattern — see TilesetPanel/ArtBrowser).
        const img = cctx.createImageData(CHUNK_PX, CHUNK_PX);
        img.data.set(renderChunk(d, chunkId));
        cctx.putImageData(img, 0, 0);
      }
      cache.set(chunkId, { canvas: c, key });
      return c;
    },
    [],
  );

  // Object-sprite refresh (Task B1): render (or reuse cached) the real art for
  // every linked object id in the act, against the live palette.
  //
  // Keyed on the distinct object-id set, the act ref, the project dir, and the
  // two FINE content clocks — deliberately NOT `chunkEpoch`. `chunkEpoch` bumps
  // on block edits too, which change no sprite whatsoever, and it cannot tell a
  // tile edit from a palette edit; keying on it re-ran a full rebuild of every
  // sprite in the act on every committed composer stroke (IPC re-read + Nemesis
  // re-decode + a fresh createImageBitmap each). `paletteEpoch`/`tileEpoch` let
  // `objectSpriteEpoch` invalidate exactly the sprites whose inputs moved.
  //
  // The refresh stays idempotent (cached per id:zone:variant:epoch), so a bump
  // that changes no sprite's own epoch now resolves entirely from cache.
  const objectIdSig = doc
    ? [...new Set(doc.objects.map((o) => o.id))].sort((a, b) => a - b).join(',')
    : '';
  useEffect(() => {
    const d = useClassicLevelStore.getState().doc;
    const r = useClassicLevelStore.getState().ref;
    if (!d || !r || !projectDir) return;
    void refreshClassicObjectSprites(projectDir, d, r.zone, { palette: paletteEpoch, tile: tileEpoch });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [objectIdSig, paletteEpoch, tileEpoch, projectDir, ref]);

  // Fit the level's height into the canvas when an act finishes loading (and on
  // plane switches), anchored top-left. Keyed on load status + act + plane, NOT
  // on doc identity: commit() replaces the doc object on every edit, so a
  // doc-keyed fit resets the user's pan/zoom on every committed gesture —
  // invisible at the default fit view, but a hard camera reset the moment you
  // zoom in and then move an object / stamp a chunk / undo.
  useEffect(() => {
    if (status !== 'ready' || !doc) return;
    // A REMEMBERED viewport beats fit-to-height, but only on an act load — that
    // is the per-tab restore (tab-activation wrote viewStore just before this
    // act started loading, and the adopt-subscription has already applied it).
    // A plane switch still refits, because FG and BG grids differ in height and
    // the fit is what keeps the whole plane on screen.
    const tabId = ref ? levelDocId(ref.zone, String(ref.act)) : null;
    const isActLoad = lastFitTabRef.current !== tabId;
    lastFitTabRef.current = tabId;
    if (isActLoad && tabId && useWorkspaceStore.getState().viewFor(tabId)) return;
    const grid = plane === 'bg' ? doc.bg : doc.fg;
    const container = containerRef.current;
    const h = container?.clientHeight ?? 600;
    const levelPxH = grid.height * CHUNK_PX;
    const zoom = Math.max(0.125, Math.min(2, levelPxH > 0 ? h / levelPxH : 1));
    camRef.current = { x: 0, y: 0, zoom };
    // Publish the fit immediately rather than waiting for the first drag, so the
    // store never sits holding the PREVIOUS act's camera — which anything
    // reading it between load and first gesture would otherwise believe.
    syncedRef.current = { x: 0, y: 0, zoom };
    useViewStore.getState().setViewport(0, 0, zoom);
    redraw();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, ref, plane]);

  // ---- main render effect --------------------------------------------------
  // Pure draw pass: clears + composes using the cached size. It never resizes the
  // canvas or calls getBoundingClientRect (see measure() below), so redraws during
  // a drag do no synchronous layout and don't reallocate the backing store.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    // willReadFrequently forces this main viewport canvas CPU-backed too (see the
    // chunk-cache note in getChunkCanvas). It composes ~60 CPU-backed chunk blits
    // plus vector overlays per rAF-coalesced frame; keeping it software makes the
    // whole paint independent of GPU allocation health — the fix for the NVKMS-
    // failure stall. Sprite overlays draw ImageBitmaps, which decode once and blit
    // fine into a software canvas, so the sprite cache stays ImageBitmap-backed.
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return;

    const { w, h } = sizeRef.current;
    if (w === 0 || h === 0) return; // not yet measured — measure() will redraw
    ctx.imageSmoothingEnabled = false;
    // Paint timing start (AURORA_PERF): inert when off.
    const perfDraw0 = PERF ? performance.now() : 0;

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = CANVAS_VOID;
    ctx.fillRect(0, 0, w, h);
    if (!doc) return;

    const cam = camRef.current;
    const grid = plane === 'bg' ? doc.bg : doc.fg;
    const invZoom = 1 / cam.zoom;

    ctx.scale(cam.zoom, cam.zoom);
    ctx.translate(-cam.x, -cam.y);

    const range = visibleChunkRange(cam.x, cam.y, w, h, cam.zoom, grid.width, grid.height);

    // Chunk layer.
    for (let row = range.startRow; row < range.endRow; row++) {
      for (let col = range.startCol; col < range.endCol; col++) {
        const cell = layoutCellAt(grid, col, row);
        if (cell === undefined) continue;
        // Engine chunk id: strip S1's bit-7 loop flag. id 0 = air (renderChunk
        // composes nothing); 1..N map to chunks[id-1]. Cache + versions are keyed
        // by this engine id, matching classicEditChunkCells' version bump.
        const chunkId = cell & 0x7f;
        const key = `${chunkEpoch}:${chunkVersions.get(chunkId) ?? 0}`;
        ctx.drawImage(getChunkCanvas(doc, chunkId, key), col * CHUNK_PX, row * CHUNK_PX);
        // Loop-flag glyph (Task B4): a small top-left corner badge on cells whose
        // layout byte carries S1's bit-7 loop flag, kept a constant on-screen size
        // (world units × invZoom) so it reads at any zoom.
        if (cell & 0x80) drawLoopGlyph(ctx, col * CHUNK_PX, row * CHUNK_PX, invZoom);
      }
    }

    // Collision / object / start overlays are all FG concepts (S1 collision,
    // object placement and the spawn point live on the foreground plane).
    if (plane === 'fg') {
      // Collision overlay (per visible chunk).
      if (overlays.showCollision) {
        for (let row = range.startRow; row < range.endRow; row++) {
          for (let col = range.startCol; col < range.endCol; col++) {
            const cell = layoutCellAt(grid, col, row);
            if (cell === undefined) continue;
            drawCollision(ctx, doc, col, row, cell & 0x7f, overlays.showCollisionAngles);
          }
        }
      }
      if (overlays.showObjects) {
        // Selection highlight + live drag preview (Task 14). The selection index
        // can be stale (a delete/undo shrank the list) — treat out-of-range as
        // no selection. During a move the drag ref carries the preview position.
        const selIndex =
          selectedObjectIndex != null && selectedObjectIndex < doc.objects.length
            ? selectedObjectIndex
            : null;
        const drag = objDragRef.current;
        const previewPos = drag && drag.index === selIndex ? drag.preview : null;
        // objectArtVersion is read so this depless render effect re-runs when a
        // sprite finishes loading (the store republishes + bumps version).
        void objectArtVersion;
        drawObjects(ctx, doc, invZoom, objectSprites, ref?.zone ?? '', selIndex, previewPos);
      }
      if (overlays.showStart) {
        // During a start drag the ref carries the live (clamped) preview position.
        const sdrag = startDragRef.current;
        drawStart(ctx, doc, invZoom, sdrag ? sdrag.preview : null);
      }
    }

    // Hover ghost preview: a translucent preview of what a click would paint/place
    // right now, positioned via the SAME refs the hover-tracking in onMouseMove
    // computed (which itself uses the click handlers' own cell/world helpers) —
    // so it can't desync from the actual paint/place target. Never drawn mid-
    // gesture (the refs are only written when none is active) or off-canvas
    // (cleared on mouse-leave).
    if (tool === 'stamp-chunk') {
      const hc = hoverCellRef.current;
      if (hc) {
        const hx = hc.col * CHUNK_PX;
        const hy = hc.row * CHUNK_PX;
        ctx.save();
        if (selectedChunkId !== 0) {
          // Air (id 0) has no art to draw — outline-only cell in that case.
          const key = `${chunkEpoch}:${chunkVersions.get(selectedChunkId) ?? 0}`;
          ctx.globalAlpha = 0.6;
          ctx.drawImage(getChunkCanvas(doc, selectedChunkId, key), hx, hy);
          ctx.globalAlpha = 1;
        }
        ctx.strokeStyle = STAMP_PREVIEW_STROKE;
        ctx.lineWidth = 1 * invZoom;
        ctx.strokeRect(hx, hy, CHUNK_PX, CHUNK_PX);
        ctx.restore();
      }
    } else if (armedId != null && plane === 'fg') {
      const hw = hoverWorldRef.current;
      if (hw) {
        // Same shape + clamp constants as the click-to-place object in
        // onMouseDown, so the ghost lands exactly where that click would.
        const ghostObj = {
          x: clampInt(hw.x, OBJ_X_MAX), y: clampInt(hw.y, OBJ_Y_MAX),
          xflip: false, yflip: false, respawn: false, id: armedId, subtype: 0,
        };
        ctx.save();
        ctx.globalAlpha = 0.6;
        // Reuse drawObjects' own sprite/fallback draw math via a one-object doc,
        // rather than duplicating the sprite/ghost-marker/hex-box branching here.
        drawObjects(ctx, { ...doc, objects: [ghostObj] }, invZoom, objectSprites, ref?.zone ?? '', null, null);
        ctx.restore();
      }
    }

    // Stamp-gesture preview: highlight the cells the in-progress drag has painted
    // so far (the store commit lands on mouseup). Read from a ref, so it repaints
    // whenever the stroke calls redraw(). Nothing draws when not stamping.
    const stroke = strokeRef.current;
    if (stroke && stroke.size > 0) {
      ctx.fillStyle = STAMP_PREVIEW_FILL;
      ctx.strokeStyle = STAMP_PREVIEW_STROKE;
      ctx.lineWidth = 2 * invZoom;
      for (const c of stroke.values()) {
        ctx.fillRect(c.x * CHUNK_PX, c.y * CHUNK_PX, CHUNK_PX, CHUNK_PX);
        ctx.strokeRect(c.x * CHUNK_PX, c.y * CHUNK_PX, CHUNK_PX, CHUNK_PX);
      }
    }

    // Paint timing record (AURORA_PERF): accumulate this full compose into the
    // current act-load window. First real paint stamps first-paint latency.
    if (PERF) {
      const acc = perfRef.current;
      if (acc && !acc.reported) {
        if (acc.firstPaint == null) acc.firstPaint = perfDraw0 - acc.loadStart;
        const dt = performance.now() - perfDraw0;
        acc.draws++;
        acc.sum += dt;
        if (dt > acc.max) acc.max = dt;
      }
    }
  });

  // ---- resize → measure → redraw -------------------------------------------
  // The ONLY place the canvas backing store is (re)sized. It reads the container
  // rect (forcing layout) here, off the render path, then triggers a redraw. Runs
  // on mount, whenever the container resizes, and when `status` flips (the canvas
  // is conditionally mounted, so a fresh element needs re-measuring).
  useEffect(() => {
    const measure = () => {
      const canvas = canvasRef.current;
      const container = containerRef.current;
      if (!canvas || !container) return;
      const rect = container.getBoundingClientRect();
      const w = Math.max(1, Math.floor(rect.width));
      const h = Math.max(1, Math.floor(rect.height));
      const prev = sizeRef.current;
      sizeRef.current = { w, h };
      // Assigning width/height reinitializes the backing store — only do it when
      // the size actually changed (or the canvas element was just remounted).
      if (canvas.width !== w || canvas.height !== h || prev.w !== w || prev.h !== h) {
        canvas.width = w;
        canvas.height = h;
      }
      redraw();
    };
    measure();
    const container = containerRef.current;
    if (!container) return;
    const ro = new ResizeObserver(measure);
    ro.observe(container);
    return () => ro.disconnect();
  }, [redraw, status]);

  // ---- pan / zoom / stamp --------------------------------------------------
  const dragging = useRef(false);
  const lastMouse = useRef({ x: 0, y: 0 });
  // The active stamp gesture's accumulated cells (null when not stamping). Keyed
  // by linear cell index so wiggling over a cell dedupes → ONE undo step per drag,
  // committed on mouseUp. A ref (not state): mutated during the drag, drawn from
  // the render effect, and reset without a partial command on cancel.
  const strokeRef = useRef<Map<number, StampCell> | null>(null);
  // The active object-move gesture (null when not dragging an object). Like the
  // stamp stroke it's a ref: mutated during the drag, drawn from the render
  // effect, committed as ONE classicSetObjects on mouseup, discarded on cancel.
  // `grabDX/DY` preserve the pointer's offset within the marker so the object
  // doesn't jump its centre to the cursor; `preview` is the clamped live
  // position; `moved` distinguishes a click (select only) from a real drag.
  const objDragRef = useRef<
    { index: number; grabDX: number; grabDY: number; preview: { x: number; y: number }; moved: boolean } | null
  >(null);
  // The active player-start move gesture (null when not dragging the spawn point).
  // Mirrors objDragRef exactly (grab offset, clamped live preview, moved flag) but
  // carries no index — there is one start point — and commits as ONE classicSetStart
  // on mouseup, discarded on cancel (Esc / mouseleave). Spec §2.3 start-position drag.
  const startDragRef = useRef<
    { grabDX: number; grabDY: number; preview: { x: number; y: number }; moved: boolean } | null
  >(null);
  // Hover ghost preview (stamp chunk / armed object). Refs, not state — mirrors
  // camRef/strokeRef: mousemove writes these directly and redraws only when the
  // tracked value actually changed, so a stationary cursor doesn't redraw storm.
  // hoverCellRef is the stamp tool's hovered layout cell (discrete — one redraw
  // per cell crossed); hoverWorldRef is the object tool's raw world position
  // (continuous — redraws on every changed pixel, coalesced by rAF like drags).
  // Both are only written when NO gesture owns the move (see onMouseMove) and are
  // cleared on mouse-leave, so the ghost never renders mid-drag.
  const hoverCellRef = useRef<{ col: number; row: number } | null>(null);
  const hoverWorldRef = useRef<{ x: number; y: number } | null>(null);

  // The world-pixel coordinate under a mouse event, using the shared camera math.
  const worldUnderCursor = useCallback((e: React.MouseEvent): { x: number; y: number } | null => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    return screenToWorld(camRef.current, e.clientX - rect.left, e.clientY - rect.top);
  }, []);

  // The layout cell (col,row) under a mouse event, using the shared camera math.
  const cellUnderCursor = useCallback((e: React.MouseEvent): { col: number; row: number } | null => {
    const w = worldUnderCursor(e);
    return w ? worldToLayoutCell(w.x, w.y) : null;
  }, [worldUnderCursor]);

  const activeGrid = useCallback(() => {
    const d = useClassicLevelStore.getState().doc;
    if (!d) return null;
    return plane === 'bg' ? d.bg : d.fg;
  }, [plane]);

  const onMouseDown = useCallback((e: React.MouseEvent) => {
    // Middle-drag always pans, whatever the active tool — matching the aeon
    // MapViewport convention. preventDefault suppresses Chromium's autoscroll.
    if (e.button === 1) {
      e.preventDefault();
      dragging.current = true;
      lastMouse.current = { x: e.clientX, y: e.clientY };
      return;
    }
    if (e.button !== 0) return; // left drags tools; right-click eyedrops (below)
    if (tool === 'stamp-chunk') {
      const grid = activeGrid();
      const cell = cellUnderCursor(e);
      if (!grid || !cell) return;
      const acc = new Map<number, StampCell>();
      addStampCell(acc, cell.col, cell.row, grid.width, grid.height);
      strokeRef.current = acc;
      redraw();
      return;
    }
    // The object tools — only on the FG plane (objects are an FG concept). On BG
    // both fall through to pan so navigation still works. `place-object` drops a
    // new one; `select` picks / moves / (via the Delete key) removes.
    if (plane === 'fg' && (tool === 'place-object' || tool === 'select')) {
      const world = worldUnderCursor(e);
      const d = useClassicLevelStore.getState().doc;
      if (!world || !d) return;
      const armed = armedPlacementId(tool, useClassicLevelStore.getState().armedObjectId);
      if (armed != null) {
        // Place a new object of the armed id at the click, default subtype 0, no
        // flips, respawn off. One classicSetObjects command; then select it and
        // disarm (reverts to select behaviour, per the click-to-place idiom).
        const next = [
          ...d.objects,
          {
            x: clampInt(world.x, OBJ_X_MAX), y: clampInt(world.y, OBJ_Y_MAX),
            xflip: false, yflip: false, respawn: false, id: armed, subtype: 0,
          },
        ];
        const res = classicSetObjects(next);
        if (!res.ok) { useToastStore.getState().addToast(`Place failed: ${res.error}`, 'error'); return; }
        // Disarm and fall back to select — the click-to-place idiom, which used
        // to be "clear the armed id and let the dual-purpose object tool mean
        // select again" and is now literally that tool switch.
        setArmedObjectId(null);
        setTool('select');
        setSelectedObjectIndex(next.length - 1);
        redraw();
        return;
      }
      // Armed but with nothing to drop (place-object with no id) does nothing
      // rather than falling through to a pan the user did not ask for.
      if (tool === 'place-object') return;
      // Hit-test with frame bounds where a sprite is loaded (else a constant
      // on-screen anchor tolerance, world radius = px / zoom). The bounds resolver
      // reads the live sprite map; a ring group ($25) is expanded per-ring inside
      // hitTestObjectFrames so a far ring in the row/column is grabbable.
      const pickWorld = OBJECT_PICK_PX / camRef.current.zoom;
      const sprites = useClassicObjectArtStore.getState().sprites;
      const zone = ref?.zone ?? '';
      const boundsFor = (o: { id: number; subtype: number }): ObjectHitBounds | null => {
        // Composed sprites are keyed by subtype for rule objects, so the hit region
        // spans a bridge's whole span / a spike row's full width, not just frame 0.
        const s = spriteFor(sprites, o.id, zone, o.subtype);
        if (s) return { width: s.width, height: s.height, originX: s.originX, originY: s.originY };
        // Invisible/trigger objects draw a fixed ghost box — grab that same region so
        // the hit area matches the visual (else it would fall back to the anchor box).
        if (s1ObjectIsInvisible(o.id)) return { ...GHOST_MARKER_BOUNDS };
        return null; // unlinked → anchor-radius fallback in hitTestObjectFrames
      };
      const hit = hitTestObjectFrames(d.objects, world.x, world.y, boundsFor, pickWorld);
      if (hit == null) {
        // No object under the cursor — try the start marker (only while it's
        // visible, so you can only grab what you can see). Objects win ties: an
        // object drawn over the spawn point stays grabbable. Begins a start drag
        // that commits ONE classicSetStart on mouseup (spec §2.3).
        if (overlays.showStart && hitTestPoint(world.x, world.y, d.start.x, d.start.y, pickWorld)) {
          setSelectedObjectIndex(null);
          startDragRef.current = {
            grabDX: d.start.x - world.x, grabDY: d.start.y - world.y,
            preview: { x: d.start.x, y: d.start.y }, moved: false,
          };
          redraw();
          return;
        }
        setSelectedObjectIndex(null); redraw(); return;
      }
      setSelectedObjectIndex(hit);
      const o = d.objects[hit];
      objDragRef.current = {
        index: hit, grabDX: o.x - world.x, grabDY: o.y - world.y,
        preview: { x: o.x, y: o.y }, moved: false,
      };
      redraw();
      return;
    }
    dragging.current = true;
    lastMouse.current = { x: e.clientX, y: e.clientY };
  }, [tool, plane, overlays.showStart, activeGrid, cellUnderCursor, worldUnderCursor, redraw, setArmedObjectId, setSelectedObjectIndex, setTool]);

  const onMouseMove = useCallback((e: React.MouseEvent) => {
    // Hover ghost tracking — BEFORE the drag/stroke dispatch below, and gated on
    // no gesture being active (a pan/stamp/object/start drag already owns this
    // move's redraw + its own preview; the ghost must not also update or render
    // during one). Uses the SAME cellUnderCursor/worldUnderCursor helpers the
    // click handlers use, so the ghost can't desync from where a click would
    // actually paint/place.
    if (!dragging.current && !startDragRef.current && !objDragRef.current && !strokeRef.current) {
      if (tool === 'stamp-chunk') {
        const grid = activeGrid();
        const cell = cellUnderCursor(e);
        const inBounds =
          grid && cell && cell.col >= 0 && cell.row >= 0 && cell.col < grid.width && cell.row < grid.height
            ? cell
            : null;
        const prev = hoverCellRef.current;
        if (inBounds?.col !== prev?.col || inBounds?.row !== prev?.row) {
          hoverCellRef.current = inBounds;
          redraw();
        }
      } else if (armedId != null && plane === 'fg') {
        const world = worldUnderCursor(e);
        const prev = hoverWorldRef.current;
        if (world?.x !== prev?.x || world?.y !== prev?.y) {
          hoverWorldRef.current = world;
          redraw();
        }
      } else if (hoverCellRef.current != null || hoverWorldRef.current != null) {
        hoverCellRef.current = null;
        hoverWorldRef.current = null;
        redraw();
      }
    }
    const sdrag = startDragRef.current;
    if (sdrag) {
      const world = worldUnderCursor(e);
      if (world) {
        sdrag.preview = {
          x: clampInt(world.x + sdrag.grabDX, START_MAX),
          y: clampInt(world.y + sdrag.grabDY, START_MAX),
        };
        sdrag.moved = true;
        redraw();
      }
      return;
    }
    const drag = objDragRef.current;
    if (drag) {
      const world = worldUnderCursor(e);
      if (world) {
        drag.preview = {
          x: clampInt(world.x + drag.grabDX, OBJ_X_MAX),
          y: clampInt(world.y + drag.grabDY, OBJ_Y_MAX),
        };
        drag.moved = true;
        redraw();
      }
      return;
    }
    const stroke = strokeRef.current;
    if (stroke) {
      const grid = activeGrid();
      const cell = cellUnderCursor(e);
      if (grid && cell && addStampCell(stroke, cell.col, cell.row, grid.width, grid.height)) redraw();
      return;
    }
    if (!dragging.current) return;
    const cam = camRef.current;
    const dx = e.clientX - lastMouse.current.x;
    const dy = e.clientY - lastMouse.current.y;
    lastMouse.current = { x: e.clientX, y: e.clientY };
    // A screen drag delta is a world delta scaled by 1/zoom: convert it with the
    // shared screenToWorld using a zero-origin camera, then pan by its negation.
    const d = screenToWorld({ x: 0, y: 0, zoom: cam.zoom }, dx, dy);
    cam.x = Math.max(0, cam.x - d.x);
    cam.y = Math.max(0, cam.y - d.y);
    redraw();
  }, [tool, plane, armedId, activeGrid, cellUnderCursor, worldUnderCursor, redraw]);

  // Commit an object-move gesture as ONE classicSetObjects (or none, when the
  // gesture was a click without movement, or the net position is unchanged).
  const endObjectDrag = useCallback(() => {
    const drag = objDragRef.current;
    objDragRef.current = null;
    if (!drag || !drag.moved) { redraw(); return; }
    const d = useClassicLevelStore.getState().doc;
    const cur = d?.objects[drag.index];
    if (!d || !cur) { redraw(); return; }
    if (cur.x === drag.preview.x && cur.y === drag.preview.y) { redraw(); return; }
    const next = d.objects.map((o, i) =>
      i === drag.index ? { ...o, x: drag.preview.x, y: drag.preview.y } : o);
    const res = classicSetObjects(next);
    if (!res.ok) useToastStore.getState().addToast(`Move failed: ${res.error}`, 'error');
    redraw();
  }, [redraw]);

  // Commit a start-move gesture as ONE classicSetStart (or none, when the gesture
  // was a click without movement, or the net position is unchanged — the store's
  // no-op guard also elides an identical write, but skipping here avoids the round
  // trip). Cancel paths (Esc / mouseleave) discard the ref without committing.
  const endStartDrag = useCallback(() => {
    const sdrag = startDragRef.current;
    startDragRef.current = null;
    if (!sdrag || !sdrag.moved) { redraw(); return; }
    const d = useClassicLevelStore.getState().doc;
    if (!d) { redraw(); return; }
    if (d.start.x === sdrag.preview.x && d.start.y === sdrag.preview.y) { redraw(); return; }
    const res = classicSetStart(sdrag.preview.x, sdrag.preview.y);
    if (!res.ok) useToastStore.getState().addToast(`Move start failed: ${res.error}`, 'error');
    redraw();
  }, [redraw]);

  // Commit the stamp gesture as ONE undoable command (or cancel with none pending).
  const endStroke = useCallback(() => {
    const stroke = strokeRef.current;
    strokeRef.current = null;
    if (!stroke || stroke.size === 0) { redraw(); return; }
    const s = useClassicLevelStore.getState();
    // Loop flag (Task B4): OR in S1's bit 7 when the Loop toggle is armed AND the
    // selected id is a real engine id (1..$7F) — air ($00) never loops.
    const id = s.selectedChunkId;
    const stampByte = s.stampLoop && id >= 1 && id <= 0x7f ? id | 0x80 : id;
    const cells = stampAccumToCells(stroke, stampByte);
    const res = classicSetLayoutCells(plane, cells);
    if (!res.ok) useToastStore.getState().addToast(`Stamp failed: ${res.error}`, 'error');
    redraw();
  }, [plane, redraw]);

  // Mouse-up ends whichever gesture is active. Mouse-leave CANCELS a stamp stroke
  // cleanly (no partial command) but also ends a pan.
  const onMouseUp = useCallback(() => {
    if (startDragRef.current) { endStartDrag(); return; }
    if (objDragRef.current) { endObjectDrag(); return; }
    if (strokeRef.current) { endStroke(); return; }
    dragging.current = false;
  }, [endStroke, endObjectDrag, endStartDrag]);
  const onMouseLeave = useCallback(() => {
    // Abandon an in-progress stamp / object move / start move without committing
    // (mouseleave cancels cleanly). A pan just ends. Also clears the hover ghost —
    // there's no cursor position off-canvas for it to preview.
    strokeRef.current = null;
    objDragRef.current = null;
    startDragRef.current = null;
    hoverCellRef.current = null;
    hoverWorldRef.current = null;
    dragging.current = false;
    redraw();
  }, [redraw]);

  // Right-click eyedrops the chunk under the cursor into the stamp selection. It
  // reads the ACTIVE plane's layout cell (the same id used when stamping either
  // plane), stripping S1's bit-7 loop flag. preventDefault suppresses the browser
  // context menu.
  const onContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    const grid = activeGrid();
    const cell = cellUnderCursor(e);
    if (!grid || !cell) return;
    const raw = layoutCellAt(grid, cell.col, cell.row);
    if (raw === undefined) return;
    setSelectedChunkId(raw & 0x7f);
    // Preserve S1's bit-7 loop flag into the armed stamp state (Task B4) so
    // re-stamping the eyedropped cell reproduces it. Air ($00) can't loop, so a
    // loop-flagged air byte (never legitimately written) syncs the toggle off.
    setStampLoop((raw & 0x80) !== 0 && (raw & 0x7f) >= 1);
  }, [activeGrid, cellUnderCursor, setSelectedChunkId, setStampLoop]);

  // Keyboard: Escape cancels an in-progress gesture / clears armed-place /
  // deselects; Delete or Backspace removes the selected object. The Delete key is
  // guarded against text-entry the same way the undo keys are (ClassicProjectView)
  // so a hex/number field edit can't be hijacked into a deletion.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // Keep-alive under a sprite-doc tab: bail so Escape/Delete can't act on the
      // hidden classic level while SpriteMode owns the keyboard (finding 1).
      if (!levelKeysEnabled()) return;
      if (e.key === 'Escape') {
        // While editing an inspector field, Escape belongs to that field (revert /
        // blur) — the viewport must not clear the selection and unmount the field
        // mid-edit. Guarded like the Delete keys.
        if (isTypingTarget(e.target as HTMLElement)) return;
        if (strokeRef.current) { strokeRef.current = null; redraw(); return; }
        if (objDragRef.current) { objDragRef.current = null; redraw(); return; }
        if (startDragRef.current) { startDragRef.current = null; redraw(); return; }
        const s = useClassicLevelStore.getState();
        const editor = useEditorStore.getState();
        // Cancelling a pending placement drops back to select, the same landing
        // the place-then-disarm path takes — Esc must not leave the tool armed
        // with nothing to place.
        if (armedPlacementId(editor.tool, s.armedObjectId) != null) {
          s.setArmedObjectId(null);
          editor.setTool('select');
          redraw();
          return;
        }
        if (s.selectedObjectIndex != null) { s.setSelectedObjectIndex(null); redraw(); return; }
        return;
      }
      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (isTypingTarget(e.target as HTMLElement)) return;
        const s = useClassicLevelStore.getState();
        const idx = s.selectedObjectIndex;
        if (idx == null || !s.doc || idx >= s.doc.objects.length) return;
        e.preventDefault();
        const next = s.doc.objects.filter((_, i) => i !== idx);
        const res = classicSetObjects(next);
        if (res.ok) s.setSelectedObjectIndex(null);
        else useToastStore.getState().addToast(`Delete failed: ${res.error}`, 'error');
        redraw();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [redraw]);

  const onWheel = useCallback((e: React.WheelEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const cam = camRef.current;
    const factor = e.deltaY < 0 ? 1.15 : 1 / 1.15;
    const newZoom = Math.max(0.125, Math.min(8, cam.zoom * factor));
    // Zoom about the cursor: keep the world point under the pointer fixed.
    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;
    const { x: worldX, y: worldY } = screenToWorld(cam, sx, sy);
    cam.x = Math.max(0, worldX - sx / newZoom);
    cam.y = Math.max(0, worldY - sy / newZoom);
    cam.zoom = newZoom;
    redraw();
  }, [redraw]);

  // ---- render --------------------------------------------------------------
  return (
    // Working in the map claims the LAYOUT facet, so Ctrl+Z here reverts this
    // act's layout document (see classic-surface.ts).
    <div
      {...classicSurfaceProps('map')}
      style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, minHeight: 0 }}
    >
      {/* NO OPTION BAR HERE. The Tool chips, the FG/BG plane group and the
          overlay toggles that used to sit above the canvas were live copies of
          controls the shared shell already renders from the same stores — the
          workspace header (plane + View menu) and the facet tool dock (the same
          toolsForFacet list). Two copies of one control is two places to fix a
          bug and two places for the lit state to disagree. The one thing that
          was NOT a duplicate, the contextual hint line, moved to the facet's
          toolOptions slot: ClassicMapToolOptions. */}
      <div
        ref={containerRef}
        style={{ flex: 1, position: 'relative', overflow: 'hidden', minHeight: 0, background: T.void }}
      >
        {status === 'ready' && doc ? (
          <canvas
            ref={canvasRef}
            onMouseDown={onMouseDown}
            onMouseMove={onMouseMove}
            onMouseUp={onMouseUp}
            onMouseLeave={onMouseLeave}
            onContextMenu={onContextMenu}
            onWheel={onWheel}
            style={{
              position: 'absolute', inset: 0,
              cursor: tool === 'stamp-chunk' ? 'crosshair'
                : armedId != null ? 'copy'
                : tool === 'select' || tool === 'place-object' ? 'default'
                : 'grab',
            }}
          />
        ) : (
          <div style={{
            position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: status === 'error' ? T.error : T.textLo, fontSize: 13, textAlign: 'center', padding: 24,
          }}>
            {status === 'loading' && `Loading ${ref?.label ?? 'level'}…`}
            {status === 'error' && <span style={{ whiteSpace: 'pre-line' }}>{error ?? 'Failed to load level'}</span>}
            {status === 'idle' && 'Select an act from the tree to view it.'}
          </div>
        )}
      </div>
    </div>
  );
}
