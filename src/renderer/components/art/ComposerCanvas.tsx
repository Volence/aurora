import React, { useRef, useEffect, useCallback, useMemo, useState } from 'react';
import { useArtStore } from '../../state/artStore';
import { useEditorStore, executeCommand } from '../../state/editorStore';
import {
  useProjectStore, getCurrentZone, getActiveLevel, getCurrentAct,
} from '../../state/projectStore';
import { useToastStore } from '../../state/toastStore';
import {
  cellAt, setPixels, docToBuffer, bufferToWrites, stampTile,
  adoptPaletteLineForEmptyCells, docLineMap,
} from '../../../core/art/composer-buffer';
import type { ComposerDoc } from '../../../core/art/composer-buffer';
import {
  createBuffer, flipH, flipV, rotate90, wrapShift,
} from '../../../core/art/pixel-ops';
import type { PixelBuffer } from '../../../core/art/pixel-ops';
import { tileUsageCounts } from '../../../core/art/usage';
import type { AnyCommand, SetTilesetTilesCommand } from '../../../core/editing/commands';
import { PixelEditController } from '../../../core/art/pixel-edit-controller';
import type { GestureResult, ArtTool as CtlArtTool } from '../../../core/art/pixel-edit-controller';
import PixelViewport from '../art-shared/PixelViewport';
import type { HostPointer } from '../art-shared/PixelViewport';
import type { Tile, Color } from '../../../core/model/s4-types';

interface Write { x: number; y: number; value: number; }
interface SelRect { x: number; y: number; w: number; h: number; }

/** Bresenham point list (inclusive) — interpolates tile-space brush drags. */
function linePoints(x0: number, y0: number, x1: number, y1: number): Array<{ x: number; y: number }> {
  const pts: Array<{ x: number; y: number }> = [];
  const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
  let err = dx + dy, cx = x0, cy = y0;
  for (;;) {
    pts.push({ x: cx, y: cy });
    if (cx === x1 && cy === y1) break;
    const e2 = 2 * err;
    if (e2 >= dy) { err += dy; cx += sx; }
    if (e2 <= dx) { err += dx; cy += sy; }
  }
  return pts;
}

function tilesEqual(a: Uint8Array, b: Uint8Array): boolean {
  for (let i = 0; i < 64; i++) if (a[i] !== b[i]) return false;
  return true;
}

/**
 * Level-art canvas. Renders the working document through the shared PixelViewport
 * (multi-palette cells + checkerboard + repeat-tiling + grids) and routes pixel
 * tools through the shared PixelEditController; gesture results are diffed and
 * committed through this component's existing per-cell undo path (live-tile /
 * chunk-atlas / doc-local). Tile-space tools (stamp/collision) bypass the engine
 * via the viewport's host-pointer hook. See
 * docs/specs/2026-06-18-unified-drawing-core-design.md.
 */
export default function ComposerCanvas() {
  const open = useArtStore((s) => s.open);
  const docVersion = useArtStore((s) => s.docVersion);
  const zoom = useArtStore((s) => s.zoom);
  const repeatPreview = useArtStore((s) => s.repeatPreview);
  const pendingAction = useArtStore((s) => s.pendingAction);
  const tool = useArtStore((s) => s.tool);
  const brushTile = useArtStore((s) => s.brushTile);
  const selectedColor = useArtStore((s) => s.selectedColor);
  const mirror = useArtStore((s) => s.mirror);
  const ditherPattern = useArtStore((s) => s.ditherPattern);
  const ditherSecondary = useArtStore((s) => s.ditherSecondary);
  const selectedCollisionType = useEditorStore((s) => s.selectedCollisionType);
  // Atlas tiles / palette can change underneath the doc (undo, agent writes).
  const historyVersion = useEditorStore((s) => s.historyVersion);
  // paletteVersion ticks on every live preview step (kept off historyVersion).
  const paletteVersion = useArtStore((s) => s.paletteVersion);

  /** Pending H/V flips for the tile-stamp brush (X/Y keys toggle, HUD shows). */
  const flipRef = useRef<{ hf: boolean; vf: boolean }>({ hf: false, vf: false });
  /** One hint toast per document when tile tools are used on a live-tile doc. */
  const tileHintRef = useRef(false);
  /** One warning toast per chunk document when an atlas-shared tile is edited. */
  const sharedEditHintRef = useRef(false);
  const clipboardRef = useRef<{ w: number; h: number; data: Uint8Array } | null>(null);
  /** Last in-bounds doc pixel under the pointer (paste anchor). */
  const hoverRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  /** Last cell touched by a tile-space drag (Bresenham fill between samples). */
  const lastTileCellRef = useRef<{ cx: number; cy: number } | null>(null);
  const [selection, setSelection] = useState<SelRect | null>(null);
  const selectionRef = useRef<SelRect | null>(null);
  selectionRef.current = selection;
  // Force a re-render when ref-only state (tile-stamp flips) changes the HUD.
  const [, forceHud] = useState(0);

  // ---------- helpers ----------

  function getAtlas(): Tile[] {
    const zone = getCurrentZone(useProjectStore.getState());
    return zone?.tileset.tiles ?? [];
  }

  function getDoc(): ComposerDoc | null {
    return useArtStore.getState().open?.doc ?? null;
  }

  /**
   * Effective zoom: capped so the composed canvas never exceeds 16000px on its
   * wider axis. The same value feeds the viewport's render AND its pointer
   * mapping, so clicks always land on the correct pixel.
   */
  const effectiveZoom = useMemo(() => {
    const doc = open?.doc;
    if (!doc) return zoom;
    const docPxWidth = doc.widthTiles * 8;
    return Math.max(1, Math.min(zoom, Math.floor(16000 / (docPxWidth * (repeatPreview ? 3 : 1)))));
  }, [open, zoom, repeatPreview]);

  // ---------- resolved render inputs ----------

  const buffer = useMemo<PixelBuffer>(() => {
    const doc = open?.doc;
    return doc ? docToBuffer(doc, getAtlas()) : createBuffer(8, 8);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, docVersion, historyVersion]);

  const lineMap = useMemo<Uint8Array>(() => {
    const doc = open?.doc;
    return doc ? docLineMap(doc) : new Uint8Array(64);
  }, [open, docVersion]);

  const paletteLines = useMemo<Color[][]>(() => {
    const lines = getCurrentZone(useProjectStore.getState())?.palette.lines ?? [];
    const l0 = lines[0]?.colors ?? [];
    return [0, 1, 2, 3].map((i) => lines[i]?.colors ?? l0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, historyVersion, paletteVersion]);

  // ---------- commit paths (per-cell undo) ----------

  /**
   * Commit a batch of writes (stroke / fill / shapes / transforms / paste /
   * selection moves) as ONE undo step:
   * - live-tile doc            → set-tileset-tiles on open.liveTileIndex
   * - chunk doc, direct paint  → edit the shared tileset art of EVERY atlas
   *                              cell the writes cross (batched into one undo
   *                              step); empty/local cells paint doc-local
   * - otherwise / `allowCow`   → doc-local setPixels (no command until save);
   *                              paste/move/transform pass allowCow so they
   *                              copy-on-write into NEW local tiles rather than
   *                              mutating the chunk's shared tileset art.
   */
  const commitWrites = useCallback((writes: Write[], allowCow = false) => {
    if (!writes.length) return;
    const o = useArtStore.getState().open;
    if (!o) return;
    const doc = o.doc;
    const atlas = getAtlas();

    // Live-tile doc: the whole canvas is one shared tileset tile.
    if (o.liveTileIndex !== null) {
      commitAtlasTile(o.liveTileIndex, 0, writes);
      return;
    }

    // Chunk doc, direct paint: edit each crossed atlas tile's shared art in
    // flip-space; collect doc-local writes for empty/local cells.
    if (o.chunkId !== null && !allowCow) {
      const newPixels = new Map<number, Uint8Array>();
      const oldPixels = new Map<number, Uint8Array>();
      const localWrites: Write[] = [];
      for (const w of writes) {
        const cell = cellAt(doc, w.x >> 3, w.y >> 3);
        if (cell.atlasTile !== null && atlas[cell.atlasTile]) {
          const ti = cell.atlasTile;
          if (!newPixels.has(ti)) {
            oldPixels.set(ti, new Uint8Array(atlas[ti].pixels));
            newPixels.set(ti, new Uint8Array(atlas[ti].pixels));
          }
          const lx = w.x & 7, ly = w.y & 7;
          const ax = cell.hf ? 7 - lx : lx;       // doc-space → atlas-space
          const ay = cell.vf ? 7 - ly : ly;
          newPixels.get(ti)![ay * 8 + ax] = w.value & 0xF;
        } else {
          localWrites.push(w);
        }
      }
      const level = getActiveLevel(useProjectStore.getState());
      const cmds: SetTilesetTilesCommand[] = [];
      for (const [ti, nw] of newPixels) {
        if (tilesEqual(oldPixels.get(ti)!, nw)) continue;
        cmds.push({
          type: 'set-tileset-tiles', description: `art: edit tile #${ti}`,
          sectionIndex: -1, at: ti,
          oldTiles: [{ pixels: oldPixels.get(ti)! }], newTiles: [{ pixels: nw }],
        });
      }
      if (cmds.length && level) {
        const cmd: AnyCommand = cmds.length === 1 ? cmds[0]
          : { type: 'batch', description: `art: edit ${cmds.length} tiles`, sectionIndex: -1, commands: cmds };
        executeCommand(cmd, level);
        warnSharedTileEdit(cmds[0].at);
        useArtStore.getState().bumpDoc();
      }
      if (localWrites.length) {
        adoptPaletteLineForEmptyCells(doc, localWrites, useArtStore.getState().paletteLine);
        setPixels(doc, atlas, localWrites);
        useArtStore.getState().markOpenDirty();
        useArtStore.getState().bumpDoc();
      }
      return;
    }

    // Doc-local path (new docs; and allowCow paste/move/transform on chunks,
    // which copy-on-write atlas cells into fresh local tiles). Empty cells
    // adopt the active palette line so painted colors render correctly.
    adoptPaletteLineForEmptyCells(doc, writes, useArtStore.getState().paletteLine);
    setPixels(doc, atlas, writes);
    useArtStore.getState().markOpenDirty();
    useArtStore.getState().bumpDoc();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /**
   * One-shot per chunk document: warn that a pixel edit landed on a shared
   * atlas tile, so the change shows up everywhere that tile is used.
   */
  function warnSharedTileEdit(tileIndex: number) {
    const o = useArtStore.getState().open;
    if (!o || o.chunkId === null || sharedEditHintRef.current) return;
    sharedEditHintRef.current = true;
    const act = getCurrentAct(useProjectStore.getState());
    const uses = act ? (tileUsageCounts(act).get(tileIndex) ?? 0) : 0;
    useToastStore.getState().addToast(
      `tile #${tileIndex} used ${uses}× in this act — edited everywhere`, 'info');
  }

  /** One set-tileset-tiles command for writes landing on a single atlas tile. */
  function commitAtlasTile(tileIndex: number, cellIndex: number, writes: Write[]) {
    if (!writes.length) return;
    const atlas = getAtlas();
    const doc = getDoc();
    const tile = atlas[tileIndex];
    if (!tile || !doc) return;
    const cell = doc.cells[cellIndex];
    const oldPixels = new Uint8Array(tile.pixels);
    const newPixels = new Uint8Array(tile.pixels);
    for (const w of writes) {
      const lx = w.x & 7, ly = w.y & 7;
      // Doc-space → atlas-space: undo the cell's flip bits.
      const ax = cell?.hf ? 7 - lx : lx;
      const ay = cell?.vf ? 7 - ly : ly;
      newPixels[ay * 8 + ax] = w.value & 0xF;
    }
    if (tilesEqual(oldPixels, newPixels)) return;
    const level = getActiveLevel(useProjectStore.getState());
    if (!level) return;
    executeCommand({
      type: 'set-tileset-tiles',
      description: `art: edit tile #${tileIndex}`,
      sectionIndex: -1,
      at: tileIndex,
      oldTiles: [{ pixels: oldPixels }],
      newTiles: [{ pixels: newPixels }],
    }, level);
    warnSharedTileEdit(tileIndex);
    useArtStore.getState().bumpDoc();
  }

  /** Apply one tile-space tool action to a doc cell (stamp or collision). */
  function applyTileCell(t: 'tile-stamp' | 'collision', cx: number, cy: number) {
    const o = useArtStore.getState().open;
    if (!o) return;
    const doc = o.doc;
    if (cx < 0 || cx >= doc.widthTiles || cy < 0 || cy >= doc.heightTiles) return;
    if (t === 'tile-stamp') {
      const s = useArtStore.getState();
      const zone = getCurrentZone(useProjectStore.getState());
      stampTile(doc, cx, cy, {
        tile: s.brushTile,
        pal: s.paletteLine,
        hf: flipRef.current.hf,
        vf: flipRef.current.vf,
        pri: false,
        coll: zone?.tileset.collisionTypes?.[s.brushTile] ?? 0,
      });
    } else {
      cellAt(doc, cx, cy).coll = useEditorStore.getState().selectedCollisionType;
    }
    useArtStore.getState().markOpenDirty();
    useArtStore.getState().bumpDoc();
  }

  // ---------- shared drawing engine ----------

  const controllerRef = useRef<PixelEditController | null>(null);
  const ctlTool: CtlArtTool = (tool === 'tile-stamp' || tool === 'collision') ? 'pencil' : tool;
  const config = {
    tool: ctlTool, color: selectedColor, mirror,
    ditherPattern, ditherSecondary, pixelPerfect: false,
  };
  if (!controllerRef.current) controllerRef.current = new PixelEditController(config);
  controllerRef.current.setConfig(config);

  /** Pixel-tool gesture result → per-cell commit + selection sync. */
  const onCommit = useCallback((r: GestureResult) => {
    if (r.selection !== undefined) setSelection(r.selection);
    const writes = bufferToWrites(buffer, r.buffer);
    if (!writes.length) return;
    // 'select' moves pixels across cells → copy-on-write into local tiles
    // (don't mutate the chunk's shared tileset art). Direct paint edits shared art.
    commitWrites(writes, useArtStore.getState().tool === 'select');
  }, [buffer, commitWrites]);

  const onPick = useCallback((value: number, pixel: { x: number; y: number }) => {
    useArtStore.getState().setSelectedColor(value);
    const doc = getDoc();
    if (doc) useArtStore.getState().setPaletteLine(cellAt(doc, pixel.x >> 3, pixel.y >> 3).pal);
  }, []);

  const onHover = useCallback((pixel: { x: number; y: number } | null) => {
    if (pixel) hoverRef.current = pixel;
  }, []);

  /** Wheel over the canvas: up doubles, down halves (setZoom clamps the range). */
  const onWheel = useCallback((e: React.WheelEvent) => {
    e.stopPropagation();
    const s = useArtStore.getState();
    s.setZoom(s.zoom * (e.deltaY < 0 ? 2 : 0.5));
  }, []);

  // Tile-space tools (stamp/collision) are tile-space by nature — route them to
  // the host hook whenever selected, regardless of the px/tile tab state.
  const tileTools = tool === 'tile-stamp' || tool === 'collision';
  const hostPointer: HostPointer | null = useMemo(() => {
    if (!tileTools) return null;
    const t = tool as 'tile-stamp' | 'collision';
    return {
      down(p) {
        const o = useArtStore.getState().open;
        if (!o) return;
        // Live-tile docs are a single atlas tile — stamping/collision is
        // pointless (the chunk nametable carries those). Hint once.
        if (o.liveTileIndex !== null) {
          if (!tileHintRef.current) {
            tileHintRef.current = true;
            useToastStore.getState().addToast(
              'Tile-space tools work on chunk/new documents, not single live tiles', 'info');
          }
          return;
        }
        const cx = p.x >> 3, cy = p.y >> 3;
        applyTileCell(t, cx, cy);
        lastTileCellRef.current = { cx, cy };
      },
      move(p) {
        const last = lastTileCellRef.current;
        if (!last) return;
        const cx = p.x >> 3, cy = p.y >> 3;
        if (cx === last.cx && cy === last.cy) return;
        for (const pt of linePoints(last.cx, last.cy, cx, cy).slice(1)) applyTileCell(t, pt.x, pt.y);
        lastTileCellRef.current = { cx, cy };
      },
      up() { lastTileCellRef.current = null; },
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tileTools, tool]);

  // ---------- overlay escape hatches (origin-translated by the viewport) ----------

  /** Grid lines: pixel (z≥8), 8px tile, 128px block (chunk-scale docs). */
  const drawUnderlay = useCallback((ctx: CanvasRenderingContext2D, z: number) => {
    const doc = getDoc();
    if (!doc) return;
    const pxW = doc.widthTiles * 8, pxH = doc.heightTiles * 8;
    if (z >= 8) {
      ctx.strokeStyle = 'rgba(255,255,255,0.08)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let x = 1; x < pxW; x++) { ctx.moveTo(x * z + 0.5, 0); ctx.lineTo(x * z + 0.5, pxH * z); }
      for (let y = 1; y < pxH; y++) { ctx.moveTo(0, y * z + 0.5); ctx.lineTo(pxW * z, y * z + 0.5); }
      ctx.stroke();
    }
    ctx.strokeStyle = 'rgba(255,255,255,0.22)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = 8; x < pxW; x += 8) { ctx.moveTo(x * z + 0.5, 0); ctx.lineTo(x * z + 0.5, pxH * z); }
    for (let y = 8; y < pxH; y += 8) { ctx.moveTo(0, y * z + 0.5); ctx.lineTo(pxW * z, y * z + 0.5); }
    ctx.stroke();
    if (doc.widthTiles >= 16) {
      ctx.strokeStyle = 'rgba(249,226,175,0.45)';
      ctx.beginPath();
      for (let x = 128; x < pxW; x += 128) { ctx.moveTo(x * z + 0.5, 0); ctx.lineTo(x * z + 0.5, pxH * z); }
      for (let y = 128; y < pxH; y += 128) { ctx.moveTo(0, y * z + 0.5); ctx.lineTo(pxW * z, y * z + 0.5); }
      ctx.stroke();
    }
  }, []);

  /** Tile-space HUD: per-cell collision values + a corner status chip. */
  const drawOverlay = useCallback((ctx: CanvasRenderingContext2D, z: number) => {
    const doc = getDoc();
    if (!doc) return;
    const s = useArtStore.getState();
    if (!(s.tool === 'tile-stamp' || s.tool === 'collision')) return;
    const pxW = doc.widthTiles * 8, pxH = doc.heightTiles * 8;

    if (s.tool === 'collision' && z >= 6) {
      ctx.font = `${Math.max(9, Math.min(14, z))}px monospace`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      for (let cy = 0; cy < doc.heightTiles; cy++) {
        for (let cx = 0; cx < doc.widthTiles; cx++) {
          const coll = doc.cells[cy * doc.widthTiles + cx].coll;
          const tx = (cx * 8 + 4) * z, ty = (cy * 8 + 4) * z;
          ctx.fillStyle = 'rgba(17,17,27,0.65)';
          ctx.fillRect(tx - z, ty - z * 0.75, z * 2, z * 1.5);
          ctx.fillStyle = coll === 0 ? '#6c7086' : '#f9e2af';
          ctx.fillText(String(coll), tx, ty);
        }
      }
      ctx.textAlign = 'left';
      ctx.textBaseline = 'alphabetic';
    }

    // Corner chip pinned to the canvas top-left (undo the origin translation).
    const originX = repeatPreview ? pxW * z : 0;
    const originY = repeatPreview ? pxH * z : 0;
    ctx.save();
    ctx.translate(-originX, -originY);
    const hud = s.tool === 'tile-stamp'
      ? `stamp #${s.brushTile}  flip[X]:${flipRef.current.hf ? 'H' : '–'} [Y]:${flipRef.current.vf ? 'V' : '–'}`
      : `collision: ${useEditorStore.getState().selectedCollisionType}`;
    ctx.font = '11px monospace';
    const tw = ctx.measureText(hud).width;
    ctx.fillStyle = 'rgba(17,17,27,0.85)';
    ctx.fillRect(4, 4, tw + 12, 18);
    ctx.fillStyle = '#f9e2af';
    ctx.fillText(hud, 10, 17);
    ctx.restore();
  }, [repeatPreview]);

  // ---------- transforms via artStore pendingAction (ToolColumn) ----------

  useEffect(() => {
    if (!pendingAction) return;
    const o = useArtStore.getState().open;
    if (!o) { useArtStore.getState().clearAction(); return; }
    const doc = o.doc;
    const atlas = getAtlas();
    const before = docToBuffer(doc, atlas);
    const region = selectionRef.current ?? { x: 0, y: 0, w: before.width, h: before.height };

    // Extract the region into its own buffer.
    const sub = createBuffer(region.w, region.h);
    for (let ry = 0; ry < region.h; ry++) {
      sub.data.set(
        before.data.subarray((region.y + ry) * before.width + region.x,
          (region.y + ry) * before.width + region.x + region.w),
        ry * region.w);
    }

    let out: PixelBuffer | null = null;
    switch (pendingAction) {
      case 'flip-h': out = flipH(sub); break;
      case 'flip-v': out = flipV(sub); break;
      case 'rotate-90': if (region.w === region.h) out = rotate90(sub); break;
      case 'shift-left': out = wrapShift(sub, -1, 0); break;
      case 'shift-right': out = wrapShift(sub, 1, 0); break;
      case 'shift-up': out = wrapShift(sub, 0, -1); break;
      case 'shift-down': out = wrapShift(sub, 0, 1); break;
    }
    if (out) {
      const after = { width: before.width, height: before.height, data: new Uint8Array(before.data) };
      for (let ry = 0; ry < region.h; ry++) {
        after.data.set(out.data.subarray(ry * region.w, (ry + 1) * region.w),
          (region.y + ry) * after.width + region.x);
      }
      commitWrites(bufferToWrites(before, after), true);
    }
    useArtStore.getState().clearAction();
  }, [pendingAction, commitWrites]);

  // ---------- keyboard: tile-stamp flips + selection copy/paste ----------

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).tagName === 'INPUT') return;

      // X/Y: toggle pending flips for the tile-stamp brush (guard !e.repeat so
      // holding the key doesn't strobe the flip).
      if (!e.repeat && !e.ctrlKey && !e.metaKey && !e.altKey
          && (e.key === 'x' || e.key === 'y')
          && useArtStore.getState().tool === 'tile-stamp') {
        if (e.key === 'x') flipRef.current.hf = !flipRef.current.hf;
        else flipRef.current.vf = !flipRef.current.vf;
        forceHud((n) => n + 1);
        e.preventDefault();
        return;
      }

      // Copy (Ctrl/Cmd+C) or Cut (Ctrl/Cmd+X) the active selection.
      if ((e.ctrlKey || e.metaKey) && (e.key === 'c' || e.key === 'x')) {
        const sel = selectionRef.current;
        const doc = getDoc();
        if (!sel || !doc) return;
        const buf = docToBuffer(doc, getAtlas());
        const data = new Uint8Array(sel.w * sel.h);
        for (let ry = 0; ry < sel.h; ry++) {
          data.set(buf.data.subarray((sel.y + ry) * buf.width + sel.x,
            (sel.y + ry) * buf.width + sel.x + sel.w), ry * sel.w);
        }
        clipboardRef.current = { w: sel.w, h: sel.h, data };
        if (e.key === 'x') {
          // Cut: clear the selected region as one undo step, then drop the marquee.
          const after = { width: buf.width, height: buf.height, data: new Uint8Array(buf.data) };
          for (let ry = 0; ry < sel.h; ry++) {
            for (let rx = 0; rx < sel.w; rx++) after.data[(sel.y + ry) * after.width + (sel.x + rx)] = 0;
          }
          commitWrites(bufferToWrites(buf, after), true);
          setSelection(null);
        }
        e.preventDefault();
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key === 'v') {
        const clip = clipboardRef.current;
        const doc = getDoc();
        if (!clip || !doc) return;
        const before = docToBuffer(doc, getAtlas());
        const px = Math.max(0, Math.min(before.width - clip.w, hoverRef.current.x));
        const py = Math.max(0, Math.min(before.height - clip.h, hoverRef.current.y));
        const after = { width: before.width, height: before.height, data: new Uint8Array(before.data) };
        for (let ry = 0; ry < clip.h; ry++) {
          after.data.set(clip.data.subarray(ry * clip.w, (ry + 1) * clip.w),
            (py + ry) * after.width + px);
        }
        commitWrites(bufferToWrites(before, after), true);
        setSelection({ x: px, y: py, w: clip.w, h: clip.h });
        e.preventDefault();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [commitWrites]);

  // Drop selection + transient state when the document changes identity.
  useEffect(() => {
    setSelection(null);
    tileHintRef.current = false;
    sharedEditHintRef.current = false;
    flipRef.current = { hf: false, vf: false };
    lastTileCellRef.current = null;
  }, [open?.doc]);

  if (!open) return null;

  return (
    <div style={styles.scroller}>
      <div style={styles.holder} onWheel={onWheel}>
        <PixelViewport
          buffer={buffer}
          palette={paletteLines[0]}
          paletteLines={paletteLines}
          lineMap={lineMap}
          zoom={effectiveZoom}
          controller={controllerRef.current}
          selection={selection}
          layers={{
            checkerboard: true,
            checkerScale: 2,
            checkerColors: [[0x55, 0x55, 0x55], [0x3a, 0x3a, 0x3a]],
            repeat: repeatPreview ? { tilesX: 3, tilesY: 3 } : null,
          }}
          drawUnderlay={drawUnderlay}
          drawOverlay={drawOverlay}
          hostPointer={hostPointer}
          onCommit={onCommit}
          onPick={onPick}
          onHover={onHover}
        />
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  scroller: {
    flex: 1,
    overflow: 'auto',
    display: 'flex',
    background: '#11111b',
  },
  holder: {
    margin: 'auto',
    padding: 24,
  },
};
