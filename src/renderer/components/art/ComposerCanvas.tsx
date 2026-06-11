import React, { useRef, useEffect, useCallback, useState } from 'react';
import { useArtStore } from '../../state/artStore';
import { useEditorStore, executeCommand } from '../../state/editorStore';
import { useProjectStore, getCurrentZone, getActiveLevel } from '../../state/projectStore';
import { useToastStore } from '../../state/toastStore';
import {
  cellAt, setPixels, getPixel, docToBuffer, bufferToWrites, stampTile,
} from '../../../core/art/composer-buffer';
import type { ComposerDoc } from '../../../core/art/composer-buffer';
import {
  createBuffer, floodFill, drawLine, drawRect, flipH, flipV, rotate90,
  wrapShift, ditherValue, mirrorPoints,
} from '../../../core/art/pixel-ops';
import type { PixelBuffer } from '../../../core/art/pixel-ops';
import type { Tile } from '../../../core/model/s4-types';

interface Write { x: number; y: number; value: number; }
interface SelRect { x: number; y: number; w: number; h: number; }

/**
 * In-place atlas edit target for a pixel stroke. Live-tile docs always target
 * `open.liveTileIndex`; chunk docs target the atlas tile referenced by the
 * cell under pointerdown — and the stroke is CLAMPED to that one tile
 * (`lockTile`), because set-tileset-tiles only supports contiguous `at`
 * ranges and per-tile commands would fracture undo granularity. Cross-tile
 * strokes on chunk docs therefore only work for local (non-atlas) cells via
 * setPixels.
 */
interface AtlasTarget { tileIndex: number; cellIndex: number; }

type Gesture =
  | { kind: 'stroke'; atlasTarget: AtlasTarget | null; lockTile: { cx: number; cy: number } | null;
      strokeBase: Uint8Array | null; touched: boolean; localDirty: boolean; last: { x: number; y: number } }
  | { kind: 'shape'; tool: 'line' | 'rect'; anchor: { x: number; y: number }; last: { x: number; y: number } }
  | { kind: 'marquee'; anchor: { x: number; y: number }; last: { x: number; y: number } }
  | { kind: 'move-sel'; orig: SelRect; start: { x: number; y: number }; last: { x: number; y: number } }
  | { kind: 'tile'; tool: 'tile-stamp' | 'collision'; last: { cx: number; cy: number } };

/** Bresenham point list (inclusive) — interpolates fast pointer moves. */
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

export default function ComposerCanvas() {
  const open = useArtStore((s) => s.open);
  const docVersion = useArtStore((s) => s.docVersion);
  const zoom = useArtStore((s) => s.zoom);
  const repeatPreview = useArtStore((s) => s.repeatPreview);
  const pendingAction = useArtStore((s) => s.pendingAction);
  // Tile-space brush state: HUD + collision overlay must redraw on changes.
  const tool = useArtStore((s) => s.tool);
  const brushSpace = useArtStore((s) => s.brushSpace);
  const brushTile = useArtStore((s) => s.brushTile);
  const selectedCollisionType = useEditorStore((s) => s.selectedCollisionType);
  // Atlas tiles / palette can change underneath the doc (undo, agent writes).
  const historyVersion = useEditorStore((s) => s.historyVersion);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const overlayRef = useRef<HTMLCanvasElement>(null);
  const gestureRef = useRef<Gesture | null>(null);
  const hoverRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  /** Pending H/V flips for the tile-stamp brush (X/Y keys toggle, HUD shows). */
  const flipRef = useRef<{ hf: boolean; vf: boolean }>({ hf: false, vf: false });
  /** One hint toast per document when tile tools are used on a live-tile doc. */
  const tileHintRef = useRef(false);
  const clipboardRef = useRef<{ w: number; h: number; data: Uint8Array } | null>(null);
  const [selection, setSelection] = useState<SelRect | null>(null);
  const selectionRef = useRef<SelRect | null>(null);
  selectionRef.current = selection;

  // ---------- helpers ----------

  function getAtlas(): Tile[] {
    const zone = getCurrentZone(useProjectStore.getState());
    return zone?.tileset.tiles ?? [];
  }

  function getDoc(): ComposerDoc | null {
    return useArtStore.getState().open?.doc ?? null;
  }

  /**
   * Effective zoom for rendering: capped so the composed canvas never exceeds
   * 16000px on its wider axis. Both render() and pointer-coordinate mapping
   * must call this helper so clicks always land on the correct pixel.
   */
  function getEffectiveZoom(doc: ComposerDoc): number {
    const s = useArtStore.getState();
    const docPxWidth = doc.widthTiles * 8;
    return Math.max(1, Math.min(s.zoom, Math.floor(16000 / (docPxWidth * (s.repeatPreview ? 3 : 1)))));
  }

  /** Canvas-local px → doc pixel coords (accounts for repeat-preview offset). */
  function toDocPx(e: { clientX: number; clientY: number }): { x: number; y: number } | null {
    const canvas = canvasRef.current;
    const doc = getDoc();
    if (!canvas || !doc) return null;
    const rect = canvas.getBoundingClientRect();
    const z = getEffectiveZoom(doc);
    const pxW = doc.widthTiles * 8, pxH = doc.heightTiles * 8;
    const ox = useArtStore.getState().repeatPreview ? pxW * z : 0;
    const oy = useArtStore.getState().repeatPreview ? pxH * z : 0;
    const x = Math.floor((e.clientX - rect.left - ox) / z);
    const y = Math.floor((e.clientY - rect.top - oy) / z);
    if (x < 0 || x >= pxW || y < 0 || y >= pxH) return null;
    return { x, y };
  }

  /** Like toDocPx but clamped into bounds (for shape/move endpoints). */
  function toDocPxClamped(e: { clientX: number; clientY: number }): { x: number; y: number } {
    const canvas = canvasRef.current;
    const doc = getDoc();
    if (!canvas || !doc) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    const z = getEffectiveZoom(doc);
    const pxW = doc.widthTiles * 8, pxH = doc.heightTiles * 8;
    const ox = useArtStore.getState().repeatPreview ? pxW * z : 0;
    const oy = useArtStore.getState().repeatPreview ? pxH * z : 0;
    return {
      x: Math.max(0, Math.min(pxW - 1, Math.floor((e.clientX - rect.left - ox) / z))),
      y: Math.max(0, Math.min(pxH - 1, Math.floor((e.clientY - rect.top - oy) / z))),
    };
  }

  /**
   * Commit a one-shot batch of writes (fill / shapes / transforms / paste /
   * selection moves) as ONE undo step:
   * - live-tile doc           → set-tileset-tiles on open.liveTileIndex
   * - chunk doc, atlas origin → set-tileset-tiles on that tile, writes clamped
   * - otherwise               → doc-local setPixels (no command until save);
   *                             `allowCow` lets transforms/paste copy-on-write
   *                             atlas-referencing chunk cells into locals,
   *                             while strokes/fill skip them (see AtlasTarget).
   */
  const commitWrites = useCallback((
    writes: Write[],
    originCell: { cx: number; cy: number } | null,
    allowCow = false,
  ) => {
    if (!writes.length) return;
    const o = useArtStore.getState().open;
    if (!o) return;
    const doc = o.doc;
    const atlas = getAtlas();

    if (o.liveTileIndex !== null) {
      commitAtlasTile(o.liveTileIndex, 0, writes);
      return;
    }
    if (o.chunkId !== null && originCell && !allowCow) {
      const cell = cellAt(doc, originCell.cx, originCell.cy);
      if (cell.atlasTile !== null) {
        const clamped = writes.filter(
          (w) => (w.x >> 3) === originCell.cx && (w.y >> 3) === originCell.cy);
        commitAtlasTile(cell.atlasTile, originCell.cy * doc.widthTiles + originCell.cx, clamped);
        return;
      }
    }
    // Doc-local path. On chunk docs, strokes/fill must not silently
    // copy-on-write atlas-referencing cells (allowCow=false filters them out).
    const filtered = (o.chunkId !== null && !allowCow)
      ? writes.filter((w) => cellAt(doc, w.x >> 3, w.y >> 3).atlasTile === null)
      : writes;
    if (!filtered.length) return;
    setPixels(doc, atlas, filtered);
    useArtStore.getState().markOpenDirty();
    useArtStore.getState().bumpDoc();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
    useArtStore.getState().bumpDoc();
  }

  // ---------- rendering ----------

  const render = useCallback(() => {
    const canvas = canvasRef.current;
    const overlay = overlayRef.current;
    const o = useArtStore.getState().open;
    const zone = getCurrentZone(useProjectStore.getState());
    if (!canvas || !overlay || !o || !zone) return;

    const doc = o.doc;
    const atlas = zone.tileset.tiles;
    const lines = zone.palette.lines;
    const pxW = doc.widthTiles * 8, pxH = doc.heightTiles * 8;
    const z = getEffectiveZoom(doc);
    const repeat = useArtStore.getState().repeatPreview;

    // Compose the doc at native resolution (one ImageData per 8x8 cell).
    const off = new OffscreenCanvas(pxW, pxH);
    const octx = off.getContext('2d')!;
    for (let cy = 0; cy < doc.heightTiles; cy++) {
      for (let cx = 0; cx < doc.widthTiles; cx++) {
        const cell = doc.cells[cy * doc.widthTiles + cx];
        let px: Uint8Array;
        if (cell.localId !== null) px = doc.localPixels.get(cell.localId)!;
        else if (cell.atlasTile !== null && atlas[cell.atlasTile]) px = atlas[cell.atlasTile].pixels;
        else px = EMPTY_TILE;
        const colors = lines[cell.pal]?.colors ?? lines[0]?.colors ?? [];
        const img = octx.createImageData(8, 8);
        for (let i = 0; i < 64; i++) {
          const sx = cell.hf ? 7 - (i & 7) : i & 7;
          const sy = cell.vf ? 7 - (i >> 3) : i >> 3;
          const v = px[sy * 8 + sx];
          if (v === 0) {
            // Transparency checkerboard (2x2 light/dark gray), continuous
            // across cells via doc-space coordinates.
            const gx = cx * 8 + (i & 7), gy = cy * 8 + (i >> 3);
            const light = ((gx >> 1) + (gy >> 1)) % 2 === 0;
            const g = light ? 0x55 : 0x3a;
            img.data[i * 4] = g; img.data[i * 4 + 1] = g; img.data[i * 4 + 2] = g;
            img.data[i * 4 + 3] = 255;
          } else {
            const c = colors[v] ?? { r: 255, g: 0, b: 255, a: 255 };
            img.data[i * 4] = c.r; img.data[i * 4 + 1] = c.g; img.data[i * 4 + 2] = c.b;
            img.data[i * 4 + 3] = 255;
          }
        }
        octx.putImageData(img, cx * 8, cy * 8);
      }
    }

    const cw = (repeat ? 3 : 1) * pxW * z;
    const ch = (repeat ? 3 : 1) * pxH * z;
    canvas.width = cw;
    canvas.height = ch;
    const ctx = canvas.getContext('2d')!;
    ctx.imageSmoothingEnabled = false;
    ctx.fillStyle = '#11111b';
    ctx.fillRect(0, 0, cw, ch);

    const ox = repeat ? pxW * z : 0;
    const oy = repeat ? pxH * z : 0;
    if (repeat) {
      ctx.globalAlpha = 1 / 3;
      for (let ry = -1; ry <= 1; ry++) {
        for (let rx = -1; rx <= 1; rx++) {
          if (rx === 0 && ry === 0) continue;
          ctx.drawImage(off, ox + rx * pxW * z, oy + ry * pxH * z, pxW * z, pxH * z);
        }
      }
      ctx.globalAlpha = 1;
    }
    ctx.drawImage(off, ox, oy, pxW * z, pxH * z);

    // Grid overlays (center copy only).
    if (z >= 8) {
      ctx.strokeStyle = 'rgba(255,255,255,0.08)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let x = 1; x < pxW; x++) { ctx.moveTo(ox + x * z + 0.5, oy); ctx.lineTo(ox + x * z + 0.5, oy + pxH * z); }
      for (let y = 1; y < pxH; y++) { ctx.moveTo(ox, oy + y * z + 0.5); ctx.lineTo(ox + pxW * z, oy + y * z + 0.5); }
      ctx.stroke();
    }
    // Tile boundaries every 8 px.
    ctx.strokeStyle = 'rgba(255,255,255,0.22)';
    ctx.beginPath();
    for (let x = 8; x < pxW; x += 8) { ctx.moveTo(ox + x * z + 0.5, oy); ctx.lineTo(ox + x * z + 0.5, oy + pxH * z); }
    for (let y = 8; y < pxH; y += 8) { ctx.moveTo(ox, oy + y * z + 0.5); ctx.lineTo(ox + pxW * z, oy + y * z + 0.5); }
    ctx.stroke();
    // Block boundaries every 128 px (16 tiles) for block-scale docs.
    if (doc.widthTiles >= 16) {
      ctx.strokeStyle = 'rgba(249,226,175,0.45)';
      ctx.beginPath();
      for (let x = 128; x < pxW; x += 128) { ctx.moveTo(ox + x * z + 0.5, oy); ctx.lineTo(ox + x * z + 0.5, oy + pxH * z); }
      for (let y = 128; y < pxH; y += 128) { ctx.moveTo(ox, oy + y * z + 0.5); ctx.lineTo(ox + pxW * z, oy + y * z + 0.5); }
      ctx.stroke();
    }

    overlay.width = cw;
    overlay.height = ch;
    drawOverlay();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** Lightweight layer: selection marquee + in-progress shape previews. */
  const drawOverlay = useCallback(() => {
    const overlay = overlayRef.current;
    const doc = getDoc();
    if (!overlay || !doc) return;
    const ctx = overlay.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, overlay.width, overlay.height);
    const z = getEffectiveZoom(doc);
    const repeat = useArtStore.getState().repeatPreview;
    const ox = repeat ? doc.widthTiles * 8 * z : 0;
    const oy = repeat ? doc.heightTiles * 8 * z : 0;

    const pxRect = (r: SelRect, style: string, dashed: boolean) => {
      ctx.strokeStyle = style;
      ctx.lineWidth = 2;
      ctx.setLineDash(dashed ? [4, 4] : []);
      ctx.strokeRect(ox + r.x * z + 1, oy + r.y * z + 1, r.w * z - 2, r.h * z - 2);
      ctx.setLineDash([]);
    };

    const g = gestureRef.current;
    const sel = selectionRef.current;
    if (sel && (!g || g.kind !== 'move-sel')) pxRect(sel, '#89b4fa', true);

    if (g?.kind === 'marquee') {
      const x = Math.min(g.anchor.x, g.last.x), y = Math.min(g.anchor.y, g.last.y);
      const w = Math.abs(g.last.x - g.anchor.x) + 1, h = Math.abs(g.last.y - g.anchor.y) + 1;
      pxRect({ x, y, w, h }, '#89b4fa', true);
    } else if (g?.kind === 'move-sel') {
      const dx = g.last.x - g.start.x, dy = g.last.y - g.start.y;
      pxRect({ ...g.orig, x: g.orig.x + dx, y: g.orig.y + dy }, '#a6e3a1', true);
    } else if (g?.kind === 'shape') {
      ctx.strokeStyle = '#f38ba8';
      ctx.lineWidth = 2;
      if (g.tool === 'line') {
        ctx.beginPath();
        ctx.moveTo(ox + (g.anchor.x + 0.5) * z, oy + (g.anchor.y + 0.5) * z);
        ctx.lineTo(ox + (g.last.x + 0.5) * z, oy + (g.last.y + 0.5) * z);
        ctx.stroke();
      } else {
        const x = Math.min(g.anchor.x, g.last.x), y = Math.min(g.anchor.y, g.last.y);
        const w = Math.abs(g.last.x - g.anchor.x) + 1, h = Math.abs(g.last.y - g.anchor.y) + 1;
        ctx.strokeRect(ox + x * z, oy + y * z, w * z, h * z);
      }
    }

    // Tile brush space extras: collision values per cell + a corner HUD.
    const s = useArtStore.getState();
    if (s.brushSpace === 'tile' && (s.tool === 'tile-stamp' || s.tool === 'collision')) {
      if (s.tool === 'collision' && z >= 6) {
        // Collision is otherwise invisible — show each cell's value.
        ctx.font = `${Math.max(9, Math.min(14, z))}px monospace`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        for (let cy = 0; cy < doc.heightTiles; cy++) {
          for (let cx = 0; cx < doc.widthTiles; cx++) {
            const coll = doc.cells[cy * doc.widthTiles + cx].coll;
            const tx = ox + (cx * 8 + 4) * z, ty = oy + (cy * 8 + 4) * z;
            ctx.fillStyle = 'rgba(17,17,27,0.65)';
            ctx.fillRect(tx - z, ty - z * 0.75, z * 2, z * 1.5);
            ctx.fillStyle = coll === 0 ? '#6c7086' : '#f9e2af';
            ctx.fillText(String(coll), tx, ty);
          }
        }
        ctx.textAlign = 'left';
        ctx.textBaseline = 'alphabetic';
      }
      const hud = s.tool === 'tile-stamp'
        ? `stamp #${s.brushTile}  flip[X]:${flipRef.current.hf ? 'H' : '–'} [Y]:${flipRef.current.vf ? 'V' : '–'}`
        : `collision: ${useEditorStore.getState().selectedCollisionType}`;
      ctx.font = '11px monospace';
      const tw = ctx.measureText(hud).width;
      ctx.fillStyle = 'rgba(17,17,27,0.85)';
      ctx.fillRect(4, 4, tw + 12, 18);
      ctx.fillStyle = '#f9e2af';
      ctx.fillText(hud, 10, 17);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Re-render on document open/edit, zoom, repeat toggle, and any history
  // change (atlas tiles / palette lines can change underneath the doc).
  // openDocument resets docVersion to 0, so `open` must be a dep too.
  useEffect(() => {
    render();
  }, [open, docVersion, zoom, repeatPreview, historyVersion, render]);

  useEffect(() => {
    drawOverlay();
  }, [selection, tool, brushSpace, brushTile, selectedCollisionType, drawOverlay]);

  // ---------- stroke painting ----------

  /** Per-point paint value for the current tool. */
  function strokeValue(x: number, y: number): number {
    const s = useArtStore.getState();
    if (s.tool === 'eraser') return 0;
    if (s.tool === 'dither') return ditherValue(s.ditherPattern, x, y, s.selectedColor, s.ditherSecondary);
    return s.selectedColor;
  }

  /** Expand a stroke point through mirror mode, then paint it. */
  function paintStrokePoints(g: Extract<Gesture, { kind: 'stroke' }>, pts: Array<{ x: number; y: number }>) {
    const o = useArtStore.getState().open;
    if (!o) return;
    const doc = o.doc;
    const s = useArtStore.getState();
    const pxW = doc.widthTiles * 8, pxH = doc.heightTiles * 8;

    const expanded: Array<{ x: number; y: number }> = [];
    for (const p of pts) {
      if (s.mirror) expanded.push(...mirrorPoints(pxW, pxH, p.x, p.y, s.mirror));
      else expanded.push(p);
    }

    if (g.atlasTarget) {
      // In-place atlas edit: write optimistically into the live tile's pixels
      // (strokeBase snapshot already taken); ONE command lands on pointerup.
      const atlas = getAtlas();
      const tile = atlas[g.atlasTarget.tileIndex];
      if (!tile) return;
      const cell = doc.cells[g.atlasTarget.cellIndex];
      for (const p of expanded) {
        if (g.lockTile && ((p.x >> 3) !== g.lockTile.cx || (p.y >> 3) !== g.lockTile.cy)) continue;
        const lx = p.x & 7, ly = p.y & 7;
        const ax = cell?.hf ? 7 - lx : lx;
        const ay = cell?.vf ? 7 - ly : ly;
        tile.pixels[ay * 8 + ax] = strokeValue(p.x, p.y) & 0xF;
        g.touched = true;
      }
      useArtStore.getState().bumpDoc();
      return;
    }

    // Doc-local stroke. On chunk docs, skip atlas-referencing cells so a
    // stray drag never copy-on-writes shared atlas art (see AtlasTarget doc).
    const writes: Write[] = [];
    for (const p of expanded) {
      if (o.chunkId !== null && cellAt(doc, p.x >> 3, p.y >> 3).atlasTile !== null) continue;
      writes.push({ x: p.x, y: p.y, value: strokeValue(p.x, p.y) });
    }
    if (!writes.length) return;
    setPixels(doc, getAtlas(), writes);
    g.localDirty = true;
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

  // ---------- pointer handlers ----------

  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    if (e.button !== 0) return;
    const o = useArtStore.getState().open;
    if (!o) return;
    const s = useArtStore.getState();

    if (s.brushSpace === 'tile') {
      if (s.tool !== 'tile-stamp' && s.tool !== 'collision') return;
      // Live-tile docs are a single atlas tile — stamping/collision over it is
      // pointless (the chunk nametable is what carries those). Hint once.
      if (o.liveTileIndex !== null) {
        if (!tileHintRef.current) {
          tileHintRef.current = true;
          useToastStore.getState().addToast(
            'Tile-space tools work on chunk/new documents, not single live tiles', 'info');
        }
        return;
      }
      const tp = toDocPx(e);
      if (!tp) return;
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
      const cx = tp.x >> 3, cy = tp.y >> 3;
      applyTileCell(s.tool, cx, cy);
      gestureRef.current = { kind: 'tile', tool: s.tool, last: { cx, cy } };
      e.preventDefault();
      return;
    }

    const p = toDocPx(e);
    if (!p) return;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    const doc = o.doc;
    const atlas = getAtlas();

    switch (s.tool) {
      case 'pencil':
      case 'eraser':
      case 'dither': {
        let atlasTarget: AtlasTarget | null = null;
        let lockTile: { cx: number; cy: number } | null = null;
        const cx = p.x >> 3, cy = p.y >> 3;
        if (o.liveTileIndex !== null) {
          atlasTarget = { tileIndex: o.liveTileIndex, cellIndex: cy * doc.widthTiles + cx };
        } else if (o.chunkId !== null) {
          const cell = cellAt(doc, cx, cy);
          if (cell.atlasTile !== null) {
            atlasTarget = { tileIndex: cell.atlasTile, cellIndex: cy * doc.widthTiles + cx };
            lockTile = { cx, cy };
          }
        }
        const g: Extract<Gesture, { kind: 'stroke' }> = {
          kind: 'stroke', atlasTarget, lockTile,
          strokeBase: atlasTarget ? new Uint8Array(atlas[atlasTarget.tileIndex].pixels) : null,
          touched: false, localDirty: false, last: p,
        };
        gestureRef.current = g;
        paintStrokePoints(g, [p]);
        break;
      }
      case 'fill': {
        const before = docToBuffer(doc, atlas);
        const after = floodFill(before, p.x, p.y, s.selectedColor);
        commitWrites(bufferToWrites(before, after), { cx: p.x >> 3, cy: p.y >> 3 });
        break;
      }
      case 'eyedropper': {
        const v = getPixel(doc, atlas, p.x, p.y);
        s.setSelectedColor(v);
        s.setPaletteLine(cellAt(doc, p.x >> 3, p.y >> 3).pal);
        break;
      }
      case 'line':
      case 'rect':
        gestureRef.current = { kind: 'shape', tool: s.tool, anchor: p, last: p };
        drawOverlay();
        break;
      case 'select': {
        const sel = selectionRef.current;
        if (sel && p.x >= sel.x && p.x < sel.x + sel.w && p.y >= sel.y && p.y < sel.y + sel.h) {
          gestureRef.current = { kind: 'move-sel', orig: sel, start: p, last: p };
        } else {
          setSelection(null);
          gestureRef.current = { kind: 'marquee', anchor: p, last: p };
        }
        drawOverlay();
        break;
      }
      default:
        break; // tile-stamp / collision: Task 10
    }
    e.preventDefault();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [commitWrites, drawOverlay]);

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    const p = toDocPx(e);
    if (p) hoverRef.current = p;
    const g = gestureRef.current;
    if (!g) return;
    const cp = toDocPxClamped(e);
    if (g.kind === 'tile') {
      const cx = cp.x >> 3, cy = cp.y >> 3;
      if (cx === g.last.cx && cy === g.last.cy) return;
      // Stamp every cell crossed (Bresenham in cell space).
      for (const pt of linePoints(g.last.cx, g.last.cy, cx, cy).slice(1)) {
        applyTileCell(g.tool, pt.x, pt.y);
      }
      g.last = { cx, cy };
      return;
    }
    if (g.kind === 'stroke') {
      if (cp.x === g.last.x && cp.y === g.last.y) return;
      const pts = linePoints(g.last.x, g.last.y, cp.x, cp.y).slice(1);
      g.last = cp;
      paintStrokePoints(g, pts);
    } else {
      g.last = cp;
      drawOverlay();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drawOverlay]);

  /**
   * Commit a completed (or cancelled) stroke gesture. Nulling gestureRef before
   * calling prevents double-invocation from both onPointerUp and onPointerCancel
   * firing for the same pointer event (some browsers emit both).
   */
  const finishGesture = useCallback((g: Gesture) => {
    const o = useArtStore.getState().open;
    if (!o) { drawOverlay(); return; }
    const doc = o.doc;
    const atlas = getAtlas();
    const s = useArtStore.getState();

    if (g.kind === 'tile') return; // cells already applied + dirtied per stamp

    if (g.kind === 'stroke') {
      if (g.atlasTarget && g.touched && g.strokeBase) {
        // One gesture = one undo step: command pairs the pointerdown snapshot
        // with the optimistically-painted result (re-apply is a no-op).
        const working = new Uint8Array(atlas[g.atlasTarget.tileIndex].pixels);
        if (!tilesEqual(g.strokeBase, working)) {
          const level = getActiveLevel(useProjectStore.getState());
          if (!level) {
            // No active level: roll back the optimistic in-place atlas mutation
            // to keep the atlas consistent with undo history.
            atlas[g.atlasTarget.tileIndex].pixels.set(g.strokeBase);
            useArtStore.getState().bumpDoc();
            return;
          }
          executeCommand({
            type: 'set-tileset-tiles',
            description: `art: edit tile #${g.atlasTarget.tileIndex}`,
            sectionIndex: -1,
            at: g.atlasTarget.tileIndex,
            oldTiles: [{ pixels: g.strokeBase }],
            newTiles: [{ pixels: working }],
          }, level);
        }
      }
      if (g.localDirty) useArtStore.getState().markOpenDirty();
      return;
    }

    if (g.kind === 'shape') {
      const before = docToBuffer(doc, atlas);
      let after: PixelBuffer;
      if (g.tool === 'line') {
        after = drawLine(before, g.anchor.x, g.anchor.y, g.last.x, g.last.y, s.selectedColor);
      } else {
        // drawRect requires positive w/h — normalize to min-corner + abs.
        const x = Math.min(g.anchor.x, g.last.x), y = Math.min(g.anchor.y, g.last.y);
        const w = Math.abs(g.last.x - g.anchor.x) + 1, h = Math.abs(g.last.y - g.anchor.y) + 1;
        after = drawRect(before, x, y, w, h, s.selectedColor, false);
      }
      commitWrites(bufferToWrites(before, after), { cx: g.anchor.x >> 3, cy: g.anchor.y >> 3 });
      drawOverlay();
      return;
    }

    if (g.kind === 'marquee') {
      const x = Math.min(g.anchor.x, g.last.x), y = Math.min(g.anchor.y, g.last.y);
      const w = Math.abs(g.last.x - g.anchor.x) + 1, h = Math.abs(g.last.y - g.anchor.y) + 1;
      setSelection(w > 1 || h > 1 ? { x, y, w, h } : null);
      return;
    }

    if (g.kind === 'move-sel') {
      const dx = g.last.x - g.start.x, dy = g.last.y - g.start.y;
      if (dx === 0 && dy === 0) { drawOverlay(); return; }
      const before = docToBuffer(doc, atlas);
      const after = { width: before.width, height: before.height, data: new Uint8Array(before.data) };
      const { orig } = g;
      // Cut...
      for (let ry = 0; ry < orig.h; ry++) {
        for (let rx = 0; rx < orig.w; rx++) {
          after.data[(orig.y + ry) * after.width + (orig.x + rx)] = 0;
        }
      }
      // ...and paste at the destination (clipped to bounds).
      for (let ry = 0; ry < orig.h; ry++) {
        for (let rx = 0; rx < orig.w; rx++) {
          const tx = orig.x + dx + rx, ty = orig.y + dy + ry;
          if (tx < 0 || tx >= after.width || ty < 0 || ty >= after.height) continue;
          after.data[ty * after.width + tx] = before.data[(orig.y + ry) * before.width + (orig.x + rx)];
        }
      }
      commitWrites(bufferToWrites(before, after), null, true);
      setSelection({
        ...orig,
        x: Math.max(0, Math.min(before.width - orig.w, orig.x + dx)),
        y: Math.max(0, Math.min(before.height - orig.h, orig.y + dy)),
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [commitWrites, drawOverlay]);

  const handlePointerUp = useCallback((e: React.PointerEvent) => {
    const g = gestureRef.current;
    // Null the ref BEFORE calling finishGesture to guard against double-invocation
    // (some browsers fire both pointerup and pointercancel for the same event).
    gestureRef.current = null;
    if (!g) return;
    finishGesture(g);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [finishGesture]);

  const handlePointerCancel = useCallback((_e: React.PointerEvent) => {
    const g = gestureRef.current;
    gestureRef.current = null;
    if (!g) return;
    finishGesture(g);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [finishGesture]);

  // ---------- transforms via artStore pendingAction (ToolColumn, Task 9) ----------

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
      commitWrites(bufferToWrites(before, after), null, true);
    }
    useArtStore.getState().clearAction();
  }, [pendingAction, commitWrites]);

  // ---------- keyboard: selection copy/paste (undo/redo lives in ArtMode,
  // which stays mounted even with no document open) ----------

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).tagName === 'INPUT') return;

      // X/Y: toggle pending flips for the tile-stamp brush (tile-stamp only;
      // guard !e.repeat so holding the key doesn't strobe the flip).
      if (!e.repeat && !e.ctrlKey && !e.metaKey && !e.altKey
          && (e.key === 'x' || e.key === 'y')
          && useArtStore.getState().brushSpace === 'tile'
          && useArtStore.getState().tool === 'tile-stamp') {
        if (e.key === 'x') flipRef.current.hf = !flipRef.current.hf;
        else flipRef.current.vf = !flipRef.current.vf;
        drawOverlay();
        e.preventDefault();
        return;
      }

      if ((e.ctrlKey || e.metaKey) && e.key === 'c') {
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
        commitWrites(bufferToWrites(before, after), null, true);
        setSelection({ x: px, y: py, w: clip.w, h: clip.h });
        e.preventDefault();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [commitWrites, drawOverlay]);

  // Drop selection when the document changes identity.
  useEffect(() => {
    setSelection(null);
    gestureRef.current = null;
    tileHintRef.current = false;
    flipRef.current = { hf: false, vf: false };
  }, [open?.doc]);

  if (!open) return null;

  return (
    <div style={styles.scroller}>
      <div style={styles.holder}>
        <div
          style={styles.canvasWrap}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerCancel}
          onLostPointerCapture={handlePointerCancel}
        >
          <canvas ref={canvasRef} style={styles.canvas} />
          <canvas ref={overlayRef} style={styles.overlay} />
        </div>
      </div>
    </div>
  );
}

const EMPTY_TILE = new Uint8Array(64);

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
  canvasWrap: {
    position: 'relative',
    lineHeight: 0,
    cursor: 'crosshair',
    touchAction: 'none',
  },
  canvas: {
    imageRendering: 'pixelated' as const,
  },
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    pointerEvents: 'none',
  },
};
