import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { T, Chip } from '../ui';
import { useClassicLevelStore, classicEditTiles } from '../../state/classicLevelStore';
import { useArtStore } from '../../state/artStore';
import { useToastStore } from '../../state/toastStore';
import type { LevelDoc } from '../../../core/level-classic/model';
import type { UsageIndex } from '../../../core/level-classic/usage-index';
import { decodeGenesisColor } from '../../../core/formats/palette';
import { PixelEditController } from '../../../core/art/pixel-edit-controller';
import type { GestureResult, Selection } from '../../../core/art/pixel-edit-controller';
import { toolConfigFrom } from '../../../core/art/tool-config';
import { tileToBuffer, packTilePixels } from '../../../core/art/classic-tile-buffer';
import { resolveTileGesture } from '../../../core/art/classic-tile-gesture';
import { resolveTileTransform } from '../../../core/art/classic-tile-transform';
import PixelViewport from '../art-shared/PixelViewport';
import type { HostPointer } from '../art-shared/PixelViewport';
import { useAnchoredZoom } from '../art-shared/use-anchored-zoom';
import { useHandPan } from '../art-shared/use-hand-pan';
import { cappedZoom } from '../art-shared/zoom-cap';
import { TileThumb } from './composer-thumbs';
import { COMPOSER_CHECK_RGB, COMPOSER_SWATCH_A, COMPOSER_SWATCH_B } from '../../canvas/canvas-colors';
import { hex, SharedBanner, useEditableTileRange, useEscapeKey, tileLockReason, styles } from './composer-shared';

// Tile tab — 8x8 pixel editor for the selected tile, drawn and edited through the
// SHARED pixel substrate (PixelViewport + PixelEditController), the same engine
// the sprite editor and aeon's composer use. It renders the tile through one
// 16-color row of the act palette; the armed tool comes from `artStore` (pencil,
// eraser, fill, eyedropper, line, rect, marquee select, dither), set on the
// facet's own rail — ClassicArtToolDock, which draws only while this tab is the
// active tier, and the modifiers beside it (mirror / dither / pixel-perfect) plus
// the flip/rotate/wrap-shift grid on the shared ArtToolOptions; that grid arrives
// here as `artStore.pendingAction`, consumed by the effect below.
// Anim/gap tiles lock. Right-click does nothing here:
// sampling a colour is the dock's eyedropper, one input path with one hit-test.
// The right column is a BROWSE-ONLY tile strip (unlike the Block tab's
// strip, which assigns the clicked tile to a block cell) — selecting here never
// mutates anything.
//
// ONE GESTURE = ONE `classicEditTiles` = ONE UNDO ENTRY. That is the constraint
// this host exists to satisfy, and it is why this tab does NOT copy aeon's
// copy-on-write staging (`localPixels` + an explicit Save). Staged writes are not
// commands, and classic's per-document undo stack (`zoneart:<zone>`) is built on
// every edit being one — staging here would quietly break Ctrl+Z on the whole Art
// facet. The controller's own snapshot/working buffers during a drag are NOT
// staging: they live inside a single gesture and resolve at `end()`.
//
// What is deliberately NOT merged: `composerPalLine` (the chips below the canvas)
// is a VIEW LENS — it picks which of the four 16-color rows the tile is RENDERED
// through and writes nothing. `artStore.paletteLine` is aeon's paint modifier and
// BlockTab's per-cell `pal` is a third, per-cell, meaning. Three different things
// that all read "palette line"; keep them apart.

/**
 * The editor's VIEWPORT box, in CSS px — the window the tile is seen through,
 * NOT the tile's size. The canvas inside it is `8 * zoom` and can be smaller
 * (zoom 2 → 16px, centred) or far larger (zoom 64 → 512px, scrolled). Nothing
 * here may be derived from a zoom: this is the one size in the tab that must
 * stay put while the canvas grows, or the whole column would reflow on every
 * wheel notch.
 */
const TILE_VIEW_PX = 240;

/** The overflow:auto box the pan/zoom hooks drive. Fixed on BOTH axes so the
 *  surrounding column never reflows as the canvas changes size. */
const TILE_SCROLLER: React.CSSProperties = {
  width: TILE_VIEW_PX, height: TILE_VIEW_PX, overflow: 'auto',
  display: 'flex', background: T.void, borderRadius: 3,
};
/** Centres a canvas smaller than the box; contributes no offset the hit-test
 *  cares about (that is measured from the canvas's own rect). */
const TILE_HOLDER: React.CSSProperties = { margin: 'auto', padding: 6, lineHeight: 0 };

/** Tools that only READ the tile, so a locked tile may still run them. */
const READ_ONLY_TOOLS = new Set(['eyedropper', 'select']);

export default function TileTab({ doc, usage }: { doc: LevelDoc; usage: UsageIndex }) {
  const composerTileIndex = useClassicLevelStore((s) => s.composerTileIndex);
  const setComposerTileIndex = useClassicLevelStore((s) => s.setComposerTileIndex);
  const composerPalLine = useClassicLevelStore((s) => s.composerPalLine);
  const setComposerPalLine = useClassicLevelStore((s) => s.setComposerPalLine);
  const tileClipboard = useClassicLevelStore((s) => s.tileClipboard);
  const setTileClipboard = useClassicLevelStore((s) => s.setTileClipboard);
  // Fine clocks for the browse-only tile strip's per-thumbnail version key.
  const paletteEpoch = useClassicLevelStore((s) => s.paletteEpoch);
  const tileVersions = useClassicLevelStore((s) => s.tileVersions);
  const range = useEditableTileRange();

  // The drawing config is the ART STORE's, not this tab's: the swatch row below,
  // the tool dock and the tool options must all mean the same "current color" and
  // "current tool". `toolConfigFrom` is the one place a tile-space tool left armed
  // from aeon's facet gets coerced to something this controller can execute.
  const tool = useArtStore((s) => s.tool);
  const selectedColor = useArtStore((s) => s.selectedColor);
  const mirror = useArtStore((s) => s.mirror);
  const ditherPattern = useArtStore((s) => s.ditherPattern);
  const ditherSecondary = useArtStore((s) => s.ditherSecondary);
  const pixelPerfect = useArtStore((s) => s.pixelPerfect);
  // ZOOM IS THE ART STORE'S TOO, and for the same reason as the tool: the option
  // bar's ZoomControl (ArtToolOptions, gated by CLASSIC_TILE_CAPS.zoom) reads and
  // writes exactly this field, so a classic-local zoom would leave that readout
  // counting against a canvas it no longer moves — the state the previous commit
  // deliberately hid the control to avoid. `setZoom` clamps to 2..64.
  //
  // It is a CROSS-ENGINE SINGLETON: zooming here also zooms aeon's composer, and
  // both default to 24 (8x8 tile → 192px, 128px chunk → its usual working view),
  // so the shared default is sane at both ends. The cost is that a tile pushed to
  // 64 leaves aeon's next chunk at 64 as well. Judged worth it over a second zoom
  // state the shared control cannot see; if that changes, the fix is a per-tier
  // zoom map INSIDE artStore, not a private useState here.
  const zoom = useArtStore((s) => s.zoom);

  const lockReason = tileLockReason(range, composerTileIndex);
  const locked = lockReason !== null;
  const tileCount = Math.floor(doc.tiles.length / 32);

  const config = toolConfigFrom({ tool, selectedColor, mirror, ditherPattern, ditherSecondary, pixelPerfect });
  const controllerRef = useRef<PixelEditController | null>(null);
  if (!controllerRef.current) controllerRef.current = new PixelEditController(config);
  controllerRef.current.setConfig(config);

  // `classicEditTiles` replaces `doc` (and its `tiles`) on every commit, so keying
  // the buffer on `doc.tiles` is what re-reads the tile after an edit — no epoch
  // needed, and no rebuild on unrelated store ticks.
  const buffer = useMemo(() => tileToBuffer(doc.tiles, composerTileIndex), [doc.tiles, composerTileIndex]);
  const paletteWords = useMemo(
    () => doc.palettes[composerPalLine] ?? doc.palettes[0] ?? new Uint16Array(16),
    [doc.palettes, composerPalLine],
  );
  const paletteColors = useMemo(
    () => Array.from({ length: 16 }, (_, i) => decodeGenesisColor(paletteWords[i] ?? 0)),
    [paletteWords],
  );

  // The zoom that is DRAWN. An 8x8 tile cannot reach the canvas ceiling at the
  // store's own 64 cap — but the cap is applied anyway, because `cappedZoom` is
  // the shared rule (aeon's composer applies the identical one) and because the
  // number it guards against is the buffer's, not this tier's: the day a classic
  // host renders something bigger than a tile through here, the guard is already
  // in place. Capping on the LARGER axis covers a future non-square buffer.
  // Whatever value this yields must be the value handed to PixelViewport, since
  // the viewport hit-tests with the zoom it renders at.
  const effectiveZoom = cappedZoom(zoom, Math.max(buffer.width, buffer.height));

  // Cursor-anchored wheel zoom + Space/middle-drag pan, the SHARED hooks aeon's
  // composer and the sprite canvas use. Both work by adjusting the scroller's
  // scroll offsets, so they need the overflow:auto box below — not the canvas.
  // `getZoom` reads the store fresh (the wheel handler is bound once) while the
  // capped value is what the post-zoom scroll fix measures against.
  const scrollerRef = useRef<HTMLDivElement>(null);
  useAnchoredZoom(scrollerRef, effectiveZoom, () => useArtStore.getState().zoom, (z) => useArtStore.getState().setZoom(z));
  useHandPan(scrollerRef);

  const [selection, setSelection] = useState<Selection | null>(null);
  // A marquee is a region of ONE tile; browsing to another tile leaves it behind.
  // Deliberately keyed on the tile index only, NOT on `doc` — `doc` is a new object
  // after every commit, so that would drop the selection on each stroke.
  useEffect(() => { setSelection(null); }, [composerTileIndex]);

  // Set by the Escape handler below and read by onCommit; declared up here so the
  // two sit either side of the ref rather than the callback closing over a
  // binding that appears further down the body.
  const cancelledRef = useRef(false);
  const [, bumpFrame] = useState(0);

  // THE ONE WRITE PATH. Every edit this tab makes — stroke, paste, transform —
  // goes through here, so every edit is exactly one `classicEditTiles`, i.e. one
  // undo entry (the constraint in this file's header).
  //
  // NOTHING may escape it. An uncaught throw out of a pointer handler leaves
  // React's event dispatch half-unwound and the whole window reads as frozen,
  // which is a far worse failure than a refused edit — so the command's own
  // invariant guards (classicLevelStore's assertSingleDomain /
  // requireClassicHistory both throw) are turned into the same visible toast a
  // clean refusal gets. `what` names the action in that toast.
  const commitTileBytes = useCallback((bytes: Uint8Array, what: string) => {
    let res;
    try {
      res = classicEditTiles([{ tileIndex: composerTileIndex, data: bytes }]);
    } catch (e) {
      res = { ok: false as const, error: e instanceof Error ? e.message : String(e) };
    }
    if (!res.ok) useToastStore.getState().addToast(`${what} failed: ${res.error}`, 'error');
  }, [composerTileIndex]);

  const onCommit = useCallback((result: GestureResult) => {
    // Escape already ended this gesture and threw its result away; this is the
    // release that follows, carrying PixelViewport's second `end()`. Drop it
    // whole — a cancelled stroke changes neither the tile nor the marquee.
    if (cancelledRef.current) { cancelledRef.current = false; return; }
    // Order matters: the marquee answer is applied BEFORE the lock is consulted, so
    // selecting still works on a view-only tile. `resolveTileGesture` owns that rule
    // and the undefined-vs-null one (see its docblock — it is unit-tested; this
    // callback is not, because the suite cannot load .tsx at all).
    const out = resolveTileGesture(buffer, result, locked);
    if (out.applySelection) setSelection(out.selection);
    if (out.bytes) commitTileBytes(out.bytes, 'Tile edit');
  }, [buffer, locked, commitTileBytes]);

  // ---------- transforms via artStore.pendingAction ----------
  //
  // The shared option bar's transform grid does not call anything; it writes ONE
  // STRING into `artStore.pendingAction` and waits for a host to notice. That
  // slot is a CROSS-ENGINE SINGLETON — aeon's ComposerCanvas has the mirror of
  // this effect (ComposerCanvas.tsx:508) — so the rule this effect must not break
  // is that `clearAction()` runs on EVERY path, including the ones that write
  // nothing. Leave a string behind and it fires on whichever art host mounts
  // next, against a document the user was not looking at when they clicked.
  // `App` gates classic and aeon so only one is ever mounted, but that is a
  // property of today's shell, not a guarantee this effect may lean on: hence
  // `finally`, which also covers a throw out of the pure resolver.
  //
  // The locked case is the sharp one. A locked tile REFUSES THE WRITE BUT STILL
  // CLEARS — swallow the clear instead and the transform would fire the instant
  // the user browsed to an unlocked tile, silently editing the wrong tile. The
  // refusal is toasted rather than silent because the button gave no other
  // feedback; aeon skips silently in the same situation and that is a papercut
  // there, not a contract worth copying.
  const pendingAction = useArtStore((s) => s.pendingAction);
  useEffect(() => {
    if (!pendingAction) return;
    try {
      const out = resolveTileTransform(buffer, pendingAction, selection, locked);
      if (out.bytes) commitTileBytes(out.bytes, 'Transform');
      else if (out.refusal) useToastStore.getState().addToast(out.refusal, 'info');
    } finally {
      useArtStore.getState().clearAction();
    }
  }, [pendingAction, buffer, selection, locked, commitTileBytes]);

  // Eyedropper → the shared selected color. Reading a pixel is not an edit, so this
  // is NOT gated on `locked`.
  const onPick = useCallback((value: number) => {
    useArtStore.getState().setSelectedColor(value);
  }, []);

  // A locked tile must not even PREVIEW a stroke: the controller would happily show
  // a live working buffer for a drag whose commit is then refused, which reads as
  // "the pencil is broken" rather than "this tile is view-only". PixelViewport routes
  // every pointer event to `hostPointer` when one is supplied, so an inert host hook
  // is how a tile refuses input outright — while eyedropper and marquee select (both
  // read-only) keep going straight to the controller.
  const inertPointer = useMemo<HostPointer>(() => ({ down() {}, move() {}, up() {} }), []);
  const hostPointer = locked && !READ_ONLY_TOOLS.has(config.tool) ? inertPointer : null;

  // ESCAPE CANCELS AN IN-PROGRESS STROKE — the behaviour the hand-rolled editor
  // had through `useEscapeCancel` and that the move to PixelViewport dropped
  // silently (ChunkTab and BlockTab still have it; the viewport has no keyboard
  // handling at all).
  //
  // TWO STEPS, because the gesture state is split across two owners. Ending the
  // controller is what kills the stroke: `end()` resets its snapshot, path and
  // preview, so the next render's `shown` falls back to the committed buffer and
  // `move()` becomes a no-op for the rest of the drag (it returns early when not
  // active). Its RESULT is thrown away — that is the cancel. But PixelViewport
  // owns a `drawing` ref this cannot reach, so it will still call `end()` again
  // on the release and hand us that second result; `cancelledRef` is what makes
  // onCommit drop it. A double `end()` is safe by inspection — every branch of
  // the controller's `finishInner` is guarded on `this.start`/`moveRegion`, both
  // null after a reset, so it yields a buffer-less result rather than throwing —
  // but onCommit never looks, because the flag is checked first.
  //
  // THE CLEAN FIX IS NOT HERE. Escape belongs in PixelViewport (a `cancel()` on
  // the controller plus clearing `drawing` and releasing pointer capture), which
  // would fix the sprite editor and aeon's composer in the same stroke — they
  // lost it too, and neither has noticed. That is a change to the shared
  // substrate under three hosts and is deliberately left to be decided on its
  // own rather than smuggled in under a classic dock task.
  useEscapeKey(useCallback(() => {
    const ctl = controllerRef.current;
    if (!ctl?.isActive) return;   // nothing in progress — do not arm the flag
    ctl.end(0, 0);
    cancelledRef.current = true;
    bumpFrame((n) => n + 1);      // repaint without the working buffer / preview
  }, []));

  const copyTile = useCallback(() => {
    setTileClipboard(new Uint8Array(buffer.data));
    useToastStore.getState().addToast(`Copied tile ${hex(composerTileIndex)} — select another tile and Paste`, 'info');
  }, [buffer, composerTileIndex, setTileClipboard]);

  const pasteTile = useCallback(() => {
    if (!tileClipboard || locked) return;
    commitTileBytes(packTilePixels(tileClipboard), 'Paste');
  }, [tileClipboard, locked, commitTileBytes]);

  // The composer's 1px BORDER is dropped and PixelViewport's own 1px ring left to
  // stand in for it — not cosmetics: a border is inside `getBoundingClientRect()`,
  // and PixelViewport's hit-test subtracts only `rect.left/top`, so a border would
  // shift every click one CSS pixel and put the leftmost/topmost column of the
  // grid on the wrong pixel. The ring is a box-shadow, which takes no layout.
  // This got WORSE with zoom, not better: one CSS pixel of border is a whole art
  // pixel of error at zoom 1..2 and never stops being an error above that.
  const canvasStyle: React.CSSProperties = {
    ...styles.gridCanvas, border: 'none',
    cursor: locked ? 'not-allowed' : 'crosshair', opacity: locked ? 0.6 : 1,
  };

  const tileUse = usage.tileUsage(composerTileIndex);
  // A tile thumbnail bakes exactly two things: the tile's own 32 bytes and the
  // selected palette line. So it invalidates on the palette clock plus that
  // tile's own version — NOT on `chunkEpoch`, which also bumps for block edits
  // (which cannot change a tile) and for edits to any OTHER tile. Keying the
  // whole strip on chunkEpoch repainted all 965 thumbnails on every committed
  // pencil stroke; this repaints the one tile the stroke actually wrote.
  const versionKeyFor = (id: number) => `${paletteEpoch}:${tileVersions.get(id) ?? 0}`;

  return (
    <div style={styles.tabBody}>
      <div style={styles.editorCol}>
        <div style={styles.rowWrap}>
          <span style={styles.title}>Tile {hex(composerTileIndex)}</span>
          <span style={styles.count}>in {tileUse.containers} block{tileUse.containers === 1 ? '' : 's'} · {tileUse.cells} cell{tileUse.cells === 1 ? '' : 's'}</span>
          <span style={{ flex: 1 }} />
          <button onClick={copyTile} style={styles.smallBtn} title="Copy this tile's pixels">Copy</button>
          <button
            onClick={pasteTile}
            disabled={!tileClipboard || locked}
            style={{ ...styles.smallBtn, ...(!tileClipboard || locked ? { opacity: 0.4, cursor: 'default' } : {}) }}
            title={tileClipboard ? `Paste the copied pixels onto tile ${hex(composerTileIndex)}` : 'Nothing copied yet'}
          >Paste</button>
        </div>
        {locked && (
          <div style={{ ...styles.banner, background: 'rgba(255,70,70,0.12)', borderColor: 'rgba(255,70,70,0.4)' }}>
            🔒 tile {hex(composerTileIndex)} is locked: {lockReason}
          </div>
        )}
        {!locked && tileUse.cells > 1 && (
          <SharedBanner text={`tile ${hex(composerTileIndex)} is used in ${tileUse.cells} block cells — edits affect all uses`} />
        )}
        {/* SCROLLER + HOLDER, the shape both shared hooks are written against
            (see ComposerCanvas's frame/scroller/holder) — the pan hook adjusts
            THIS element's scrollLeft/Top and catches its pointerdown in the
            capture phase, and the zoom hook measures the anchor against its
            rect. The fixed box is also what keeps the canvas out of the flex
            column: as a direct flex item it was align-stretch'd to the column's
            width, which SCALED the bitmap and broke the hit-test (PixelViewport
            maps clicks through `zoom` alone and cannot see a CSS scale).
            `margin: auto` centres a canvas smaller than the box; when it is
            larger, flex resolves auto margins to 0, so the top-left stays
            reachable. Padding/margins here are safe for the hit-test — it is
            measured from the CANVAS's own rect, and only a border ON THE CANVAS
            would shift it (which is why the ring is a box-shadow). */}
        <div ref={scrollerRef} style={TILE_SCROLLER}>
          <div style={TILE_HOLDER}>
            <PixelViewport
              buffer={buffer}
              palette={paletteColors}
              zoom={effectiveZoom}
              controller={controllerRef.current}
              selection={selection}
              layers={{ checkerboard: true, checkerScale: 1, checkerColors: COMPOSER_CHECK_RGB, grids: ['pixel'] }}
              hostPointer={hostPointer}
              onCommit={onCommit}
              onPick={onPick}
              style={canvasStyle}
            />
          </div>
        </div>
        <div style={styles.rowWrap}>
          <span style={styles.dim}>Line:</span>
          {[0, 1, 2, 3].map((p) => (
            <Chip key={p} active={composerPalLine === p} onClick={() => setComposerPalLine(p)}>{p}</Chip>
          ))}
        </div>
        {/* Wraps to the VIEWPORT's width, not the canvas's — the canvas is now a
            zoom away from any width at all, and a swatch row that reflowed on a
            wheel notch would move the colour under the cursor. */}
        <div style={{ ...styles.swatchRow, maxWidth: TILE_VIEW_PX }}>
          {Array.from({ length: 16 }, (_, i) => {
            const c = paletteColors[i];
            const bg = i === 0 ? 'transparent' : `rgb(${c.r},${c.g},${c.b})`;
            return (
              <button
                key={i}
                onClick={() => useArtStore.getState().setSelectedColor(i)}
                title={i === 0 ? 'index 0 — transparent' : `index ${i}`}
                style={{
                  width: 22, height: 22, flexShrink: 0, cursor: 'pointer', borderRadius: 3,
                  backgroundColor: bg,
                  backgroundImage: i === 0 ? `linear-gradient(45deg,${COMPOSER_SWATCH_A} 25%,transparent 25%,transparent 75%,${COMPOSER_SWATCH_A} 75%),linear-gradient(45deg,${COMPOSER_SWATCH_A} 25%,${COMPOSER_SWATCH_B} 25%,${COMPOSER_SWATCH_B} 75%,${COMPOSER_SWATCH_A} 75%)` : undefined,
                  backgroundSize: i === 0 ? '8px 8px' : undefined,
                  backgroundPosition: i === 0 ? '0 0,4px 4px' : undefined,
                  border: selectedColor === i ? `2px solid ${T.accent}` : `1px solid ${T.border}`,
                }}
              />
            );
          })}
        </div>
      </div>
      <div style={styles.paletteCol}>
        <div style={styles.paletteHead}>Tiles ({tileCount}) · click to edit</div>
        <div style={styles.paletteStrip}>
          {Array.from({ length: tileCount }, (_, id) => (
            <TileThumb
              key={id} tileIndex={id} palLine={composerPalLine} size={26} versionKey={versionKeyFor(id)}
              selected={id === composerTileIndex} locked={tileLockReason(range, id) !== null}
              containers={usage.tileUsage(id).containers} cells={usage.tileUsage(id).cells}
              onSelect={setComposerTileIndex}
            />
          ))}
        </div>
        <div style={styles.hintRow}>browse-only — selecting never edits · badge = used-in count · no badge = unused (safe to repurpose) · 🔒 = view-only</div>
      </div>
    </div>
  );
}
