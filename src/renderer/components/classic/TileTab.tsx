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
import { pixelAt } from '../../../core/art/viewport-coords';
import PixelViewport from '../art-shared/PixelViewport';
import type { HostPointer } from '../art-shared/PixelViewport';
import { TileThumb } from './composer-thumbs';
import { COMPOSER_CHECK_RGB, COMPOSER_SWATCH_A, COMPOSER_SWATCH_B } from '../../canvas/canvas-colors';
import { hex, SharedBanner, useEditableTileRange, tileLockReason, styles } from './composer-shared';

// Tile tab — 8x8 pixel editor for the selected tile, drawn and edited through the
// SHARED pixel substrate (PixelViewport + PixelEditController), the same engine
// the sprite editor and aeon's composer use. It renders the tile through one
// 16-color row of the act palette; the armed tool comes from `artStore` (pencil,
// eraser, fill, eyedropper, line, rect, marquee select, dither). Anim/gap tiles
// lock. The right column is a BROWSE-ONLY tile strip (unlike the Block tab's
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

const PX = 26; // px per pixel → 208px editor. Pan/zoom is a later task.

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

  const [selection, setSelection] = useState<Selection | null>(null);
  // A marquee is a region of ONE tile; browsing to another tile leaves it behind.
  // Deliberately keyed on the tile index only, NOT on `doc` — `doc` is a new object
  // after every commit, so that would drop the selection on each stroke.
  useEffect(() => { setSelection(null); }, [composerTileIndex]);

  const onCommit = useCallback((result: GestureResult) => {
    // Order matters: the marquee answer is applied BEFORE the lock is consulted, so
    // selecting still works on a view-only tile. `resolveTileGesture` owns that rule
    // and the undefined-vs-null one (see its docblock — it is unit-tested; this
    // callback is not, because the suite cannot load .tsx at all).
    const out = resolveTileGesture(buffer, result, locked);
    if (out.applySelection) setSelection(out.selection);
    if (!out.bytes) return;
    // NOTHING may escape a pointer handler here. An uncaught throw mid-gesture
    // leaves React's event dispatch half-unwound and the whole window reads as
    // frozen, which is a far worse failure than a refused edit — so the command's
    // own invariant guards (classicLevelStore's assertSingleDomain /
    // requireClassicHistory both throw) are turned into the same visible toast a
    // clean refusal gets.
    let res;
    try {
      res = classicEditTiles([{ tileIndex: composerTileIndex, data: out.bytes }]);
    } catch (e) {
      res = { ok: false as const, error: e instanceof Error ? e.message : String(e) };
    }
    if (!res.ok) useToastStore.getState().addToast(`Tile edit failed: ${res.error}`, 'error');
  }, [buffer, locked, composerTileIndex]);

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

  // Right-click eyedrop, kept from the hand-rolled editor (it matches the chunk
  // tab's idiom and is the only way to sample a color until the tool dock lands).
  // PixelViewport ignores non-primary buttons and exposes no coordinate hook, so
  // the mapping is redone here from the canvas's own rect — the same rect and the
  // same pure `pixelAt` the viewport uses, so the two agree pixel for pixel.
  const onContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    const el = e.target as HTMLElement;
    if (el.tagName !== 'CANVAS') return;
    const r = el.getBoundingClientRect();
    const p = pixelAt(e.clientX - r.left, e.clientY - r.top, PX, 8, 8);
    if (p) useArtStore.getState().setSelectedColor(buffer.data[p.y * 8 + p.x]);
  }, [buffer]);

  const copyTile = useCallback(() => {
    setTileClipboard(new Uint8Array(buffer.data));
    useToastStore.getState().addToast(`Copied tile ${hex(composerTileIndex)} — select another tile and Paste`, 'info');
  }, [buffer, composerTileIndex, setTileClipboard]);

  const pasteTile = useCallback(() => {
    if (!tileClipboard || locked) return;
    let res;
    try {
      res = classicEditTiles([{ tileIndex: composerTileIndex, data: packTilePixels(tileClipboard) }]);
    } catch (e) {
      res = { ok: false as const, error: e instanceof Error ? e.message : String(e) };
    }
    if (!res.ok) useToastStore.getState().addToast(`Paste failed: ${res.error}`, 'error');
  }, [tileClipboard, locked, composerTileIndex]);

  // The composer's 1px BORDER is dropped and PixelViewport's own 1px ring left to
  // stand in for it — not cosmetics: a border is inside `getBoundingClientRect()`,
  // and PixelViewport's hit-test subtracts only `rect.left/top`, so a border would
  // shift every click one CSS pixel and put the leftmost/topmost column of the
  // 26px grid on the wrong pixel. The ring is a box-shadow, which takes no layout.
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
        {/* The wrapper carries the right-click handler AND keeps the canvas out of
            the flex column: as a direct flex item it was align-stretch'd to the
            column's width (the header row above can be wider than 208px), which
            scaled the bitmap — the old hand-rolled hit-test compensated for that,
            PixelViewport's does not. Inside a block wrapper the canvas is a
            replaced element at its intrinsic 208px, so 1 canvas px = 1 CSS px. */}
        <div onContextMenu={onContextMenu} style={{ lineHeight: 0 }}>
          <PixelViewport
            buffer={buffer}
            palette={paletteColors}
            zoom={PX}
            controller={controllerRef.current}
            selection={selection}
            layers={{ checkerboard: true, checkerScale: 1, checkerColors: COMPOSER_CHECK_RGB, grids: ['pixel'] }}
            hostPointer={hostPointer}
            onCommit={onCommit}
            onPick={onPick}
            style={canvasStyle}
          />
        </div>
        <div style={styles.rowWrap}>
          <span style={styles.dim}>Line:</span>
          {[0, 1, 2, 3].map((p) => (
            <Chip key={p} active={composerPalLine === p} onClick={() => setComposerPalLine(p)}>{p}</Chip>
          ))}
        </div>
        <div style={{ ...styles.swatchRow, maxWidth: PX * 8 }}>
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
        <div style={styles.hintRow}>right-click the canvas to eyedrop a color</div>
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
