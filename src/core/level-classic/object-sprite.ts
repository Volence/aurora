// Pure core preview pipeline for a classic (Sonic 1) object's sprite: turn a
// parsed mappings frame + decoded art tiles into an indexed 4bpp bitmap with its
// signed origin, then (renderer-side) to RGBA via a live palette line. This
// reuses the SAME sprite machinery the Sprite mode read path uses —
// `parseAsmMappings` (mappings `.asm` call-site parser), `nemesisDecompress` /
// `parseTiles`, and `renderFrameToIndices` (Task 15's inverse renderer).
//
// Pure core: no fs, no canvas, no DOM. The renderer reads the art/map files
// (classic-object-art.ts) and wraps the returned indices in an ImageBitmap; the
// headless render script (render-classic-act.mjs) does the same with fs.

import { parseAsmMappings } from '../import/asm-mappings';
import { parseTiles } from '../formats/tiles';
import { nemesisDecompress } from '../compress/nemesis';
import { renderFrameToIndices } from '../art/sprite-render';
import type { ObjectArtCompression, ObjectArtSource } from '../project/profiles/s1-object-art';
import type { SpriteFrame } from '../model/sprite-types';
import type { Tile } from '../model/s4-types';
import type { S1ObjectEntry } from '../formats/classic/s1-objpos';

/** An object frame rendered to a palette-indexed bitmap + its signed origin. */
export interface RenderedObjectFrame {
  /** width*height indices (0 = transparent); 4bpp values 0..15. */
  indices: Uint8Array;
  width: number;
  height: number;
  /** Origin offset: the object's (x,y) maps to (originX, originY) in the bitmap. */
  originX: number;
  originY: number;
  /**
   * Per-pixel sprite-piece PRIORITY mask (width*height; 1 = the pixel's winning
   * piece carries the VDP priority bit), or null when NO piece does (the common
   * case — all-low, nothing to allocate). The bit is bit 15 of the mappings
   * attrs word (sprite-mappings-import.ts: `priority: (attrs & 0x8000) !== 0`;
   * ASM call-site path: `spritePiece` arg 9, asm-mappings.ts `priority: !!pri`).
   * On hardware it is compared PER PIECE against the plane tile's own bit: a
   * high piece's pixels render above high-priority plane tiles, a low piece's
   * behind them — which is exactly what the viewport's occlusion pass needs and
   * what the flat composite alone cannot say. "Winning" follows the pixel
   * composite's own rule (first mappings piece on top; transparent pixels never
   * claim), so mask and indices agree pixel-for-pixel. Only meaningful where
   * `indices` is non-zero.
   */
  priMask: Uint8Array | null;
}

/** Decode an object's 8x8 art file into tiles (nemesis-compressed or raw 4bpp). */
export function decodeObjectArt(bytes: Uint8Array, compression: ObjectArtCompression): Tile[] {
  const raw = compression === 'nemesis' ? nemesisDecompress(bytes) : bytes;
  return parseTiles(raw);
}

/**
 * Tight bounds of ONE frame's pieces (its own bounding box — NOT the shared
 * multi-frame canvas the Sprite editor uses). A frame with no pieces yields an
 * 8x8 origin-0 box so callers never divide by zero.
 */
function frameBounds(frame: SpriteFrame): { minX: number; minY: number; width: number; height: number } {
  if (frame.pieces.length === 0) return { minX: 0, minY: 0, width: 8, height: 8 };
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const p of frame.pieces) {
    minX = Math.min(minX, p.xOffset);
    minY = Math.min(minY, p.yOffset);
    maxX = Math.max(maxX, p.xOffset + p.widthCells * 8);
    maxY = Math.max(maxY, p.yOffset + p.heightCells * 8);
  }
  return { minX, minY, width: maxX - minX, height: maxY - minY };
}

/**
 * Render one frame of a sprite (by index into its frame table) to an indexed
 * bitmap sized to that frame's own bounding box. `originX/Y = -minX/-minY`, so
 * placing the bitmap's top-left at `(obj.x - originX, obj.y - originY)` puts the
 * object origin where the engine's signed piece offsets expect it. An
 * out-of-range frame index yields an empty 8x8 frame (never throws).
 */
export function renderObjectFrame(
  frames: SpriteFrame[], tiles: Tile[], frameIndex: number,
): RenderedObjectFrame {
  const frame = frames[frameIndex];
  if (!frame) return { indices: new Uint8Array(64), width: 8, height: 8, originX: 0, originY: 0, priMask: null };
  const { minX, minY, width, height } = frameBounds(frame);
  const originX = -minX;
  const originY = -minY;
  // S1 sprite priority: the FIRST mappings piece has the highest priority and is drawn
  // ON TOP (SonLVL's MapFrameToBmp iterates pieces in reverse for exactly this reason).
  // renderFrameToIndices composites in array order (a later piece overwrites an earlier
  // one), so reverse the pieces here — otherwise e.g. a monitor's opaque shell piece
  // (declared after its icon) would paint over the icon and every subtype would look
  // identical.
  const ordered: SpriteFrame = { ...frame, pieces: [...frame.pieces].reverse() };
  const indices = renderFrameToIndices(ordered, tiles, width, height, originX, originY);
  // Per-pixel piece-priority mask (see RenderedObjectFrame.priMask). Composed
  // with the SAME later-overwrites-earlier walk as the pixels — each piece is
  // rasterized alone through the very same renderFrameToIndices, so a pixel's
  // mask bit is exactly its winning piece's priority bit. Skipped entirely
  // (null) when no piece carries the bit.
  let priMask: Uint8Array | null = null;
  if (frame.pieces.some((p) => p.priority)) {
    priMask = new Uint8Array(width * height);
    for (const p of ordered.pieces) {
      const single = renderFrameToIndices({ id: 'pri', pieces: [p] }, tiles, width, height, originX, originY);
      const bit = p.priority ? 1 : 0;
      for (let i = 0; i < single.length; i++) if (single[i] !== 0) priMask[i] = bit;
    }
  }
  return { indices, width, height, originX, originY, priMask };
}

/** Convenience: decode a standalone art file + parse mappings + render one frame. */
export function renderObjectFrameFromFiles(
  mapAsmText: string, artBytes: Uint8Array, compression: ObjectArtCompression, frameIndex: number,
): RenderedObjectFrame {
  return renderResolvedObjectFrame(
    { artSource: 'file', compression, frame: frameIndex, pieces: null }, mapAsmText, artBytes, null,
  );
}

/**
 * One composited piece of a subtype-aware object: a mappings frame index drawn at
 * a signed (dx, dy) offset from the composite anchor, with an optional per-piece
 * flip. This is the render-side shape produced by the subtype-rule table
 * (object-subtype-rules.ts) — e.g. a bridge's N log frames laid out in a row, or a
 * swinging platform's chain links plus platform.
 */
export interface ObjectPiece {
  /** Frame index into the object's mappings frame table. */
  frame: number;
  /** Signed world offset of this piece's anchor from the composite anchor. */
  dx: number;
  dy: number;
  /** Per-piece horizontal / vertical flip (mirrored about this piece's anchor). */
  xf?: boolean;
  yf?: boolean;
}

/** Mirror a w×h index bitmap horizontally in place-safe (returns a new array). */
function flipIndicesX(src: Uint8Array, width: number, height: number): Uint8Array {
  const out = new Uint8Array(src.length);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) out[y * width + (width - 1 - x)] = src[y * width + x];
  }
  return out;
}

/** Mirror a w×h index bitmap vertically (returns a new array). */
function flipIndicesY(src: Uint8Array, width: number, height: number): Uint8Array {
  const out = new Uint8Array(src.length);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) out[(height - 1 - y) * width + x] = src[y * width + x];
  }
  return out;
}

/**
 * Compose several mappings frames into ONE indexed bitmap laid out by a subtype
 * rule. Each piece renders its own frame (via `renderObjectFrame`), is optionally
 * flipped about its anchor, and is placed with its anchor at `(dx, dy)` relative to
 * the composite anchor; the returned bitmap is sized to the union of every piece's
 * bounds with `originX/Y = -min` so `objectFrameRect` treats it exactly like a
 * single frame (selection box + hit region span the whole composite). Later pieces
 * paint over earlier ones (transparent pixels never overwrite). Empty pieces yield
 * an 8×8 origin-0 box so callers never divide by zero.
 */
export function composeObjectFrames(
  frames: SpriteFrame[], tiles: Tile[], pieces: readonly ObjectPiece[],
): RenderedObjectFrame {
  if (pieces.length === 0) return { indices: new Uint8Array(64), width: 8, height: 8, originX: 0, originY: 0, priMask: null };
  // Render + flip each piece once; track its anchor-relative top-left. The
  // sub-frame's priMask is flipped alongside its indices (same axes, same
  // functions) so mask and pixels stay in lockstep.
  const rendered = pieces.map((p) => {
    const sub = renderObjectFrame(frames, tiles, p.frame);
    let indices = sub.indices;
    let mask = sub.priMask;
    let oX = sub.originX;
    let oY = sub.originY;
    if (p.xf) {
      indices = flipIndicesX(indices, sub.width, sub.height);
      if (mask) mask = flipIndicesX(mask, sub.width, sub.height);
      oX = sub.width - sub.originX;
    }
    if (p.yf) {
      indices = flipIndicesY(indices, sub.width, sub.height);
      if (mask) mask = flipIndicesY(mask, sub.width, sub.height);
      oY = sub.height - sub.originY;
    }
    // Top-left of this piece relative to the composite anchor.
    return { indices, mask, width: sub.width, height: sub.height, left: p.dx - oX, top: p.dy - oY };
  });
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const r of rendered) {
    minX = Math.min(minX, r.left);
    minY = Math.min(minY, r.top);
    maxX = Math.max(maxX, r.left + r.width);
    maxY = Math.max(maxY, r.top + r.height);
  }
  const width = maxX - minX;
  const height = maxY - minY;
  // `+ 0` normalises a `-0` (when minX/minY is 0) to `+0` so the origin compares
  // cleanly and never surprises downstream Object.is checks.
  const originX = -minX + 0;
  const originY = -minY + 0;
  const out = new Uint8Array(width * height);
  // Composite mask: allocated only if any sub-frame carries one. A later
  // piece's winning pixel overwrites the mask too — with 0 when that piece has
  // no mask — so the mask always follows the visible pixel's owner.
  const outMask = rendered.some((r) => r.mask !== null) ? new Uint8Array(width * height) : null;
  for (const r of rendered) {
    const bx = originX + r.left; // piece top-left in composite buffer coords
    const by = originY + r.top;
    for (let y = 0; y < r.height; y++) {
      for (let x = 0; x < r.width; x++) {
        const v = r.indices[y * r.width + x];
        if (v === 0) continue;
        const dx = bx + x, dy = by + y;
        if (dx < 0 || dx >= width || dy < 0 || dy >= height) continue;
        out[dy * width + dx] = v;
        if (outMask) outMask[dy * width + dx] = r.mask ? r.mask[y * r.width + x] : 0;
      }
    }
  }
  return { indices: out, width, height, originX, originY, priMask: outMask };
}

/** Decode a standalone art file + parse mappings + compose the given rule pieces. */
export function composeObjectFramesFromFiles(
  mapAsmText: string, artBytes: Uint8Array, compression: ObjectArtCompression, pieces: readonly ObjectPiece[],
): RenderedObjectFrame {
  return renderResolvedObjectFrame(
    { artSource: 'file', compression, frame: 0, pieces }, mapAsmText, artBytes, null,
  );
}

// ---------------------------------------------------------------------------
// B6: LevelArt-backed + offset-art. THE single resolved render path — both the
// app store builder (classicObjectArtStore) and the headless render harness
// (render-classic-act.mjs) resolve to `ResolvedObjectArt` and call
// `renderResolvedObjectFrame`, so app + harness cannot diverge.
// ---------------------------------------------------------------------------

/**
 * Shift a raw byte pool exactly as SonLVLAPI's `MultiFileIndexer<byte>` does when a
 * file is added at `offsetBytes`: the combined array C has `C[i] = raw[i −
 * offsetBytes]` for indices whose source byte exists, else 0 (a blank byte). C spans
 * `0 .. offsetBytes + raw.length − 1` (MultiFileIndexer.Count for one file). A
 * positive offset prepends `offsetBytes` zero bytes; a negative offset drops the
 * first `-offsetBytes` bytes.
 */
function applyByteOffset(raw: Uint8Array, offsetBytes: number): Uint8Array {
  const count = offsetBytes + raw.length;
  if (count <= 0) return new Uint8Array(0);
  const out = new Uint8Array(count);
  for (let i = 0; i < count; i++) {
    const j = i - offsetBytes;
    if (j >= 0 && j < raw.length) out[i] = raw[j];
  }
  return out;
}

/**
 * Build the effective 4bpp tile pool a mappings frame renders against, for either art
 * source, applying the SonLVL byte offset via `applyByteOffset`:
 *   • source 'file'     → decode `artBytes` (nemesis or raw 4bpp).
 *   • source 'levelArt' → use `levelTiles` (LevelDoc.tiles) as the raw byte pool.
 * `tileIndexOffset` is in TILES; the byte offset is `tileIndexOffset * 32`. Mapping
 * tile T then resolves to raw tile `T − tileIndexOffset` (out-of-range → transparent).
 */
export function objectArtTiles(
  source: ObjectArtSource,
  artBytes: Uint8Array | null,
  compression: ObjectArtCompression,
  levelTiles: Uint8Array | null,
  tileIndexOffset = 0,
): Tile[] {
  let raw: Uint8Array;
  if (source === 'levelArt') {
    raw = levelTiles ?? new Uint8Array(0);
  } else {
    const b = artBytes ?? new Uint8Array(0);
    raw = compression === 'nemesis' ? nemesisDecompress(b) : b;
  }
  const offsetBytes = tileIndexOffset * 32;
  if (offsetBytes !== 0) raw = applyByteOffset(raw, offsetBytes);
  return parseTiles(raw);
}

/**
 * The resolved art a render needs: the subset of ObjectArtLink that decides the tile
 * pool + which frame(s) to draw. `pieces` non-null composes a subtype rule; null
 * renders the single `frame`.
 */
export interface ResolvedObjectArt {
  artSource: ObjectArtSource;
  compression: ObjectArtCompression;
  tileIndexOffset?: number;
  frame: number;
  pieces: readonly ObjectPiece[] | null;
}

/**
 * THE shared object-render entry (B6): resolve the tile pool from the art source +
 * offset, parse the mappings, then render one frame or compose the rule pieces.
 * `artBytes` is the on-disk file for source 'file' (ignored for 'levelArt');
 * `levelTiles` is `LevelDoc.tiles` for source 'levelArt' (ignored for 'file').
 */
export function renderResolvedObjectFrame(
  art: ResolvedObjectArt, mapAsmText: string,
  artBytes: Uint8Array | null, levelTiles: Uint8Array | null,
): RenderedObjectFrame {
  const tiles = objectArtTiles(art.artSource, artBytes, art.compression, levelTiles, art.tileIndexOffset);
  const frames = parseAsmMappings(mapAsmText);
  return art.pieces
    ? composeObjectFrames(frames, tiles, art.pieces)
    : renderObjectFrame(frames, tiles, art.frame);
}

/** An axis-aligned world-space rectangle (top-left + size). */
export interface WorldRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

/**
 * The world-space rectangle a rendered object frame occupies when anchored at
 * (anchorX, anchorY) with the object's flips. The unflipped bitmap top-left sits
 * at `(anchor - origin)`; an X/Y flip mirrors the frame about the anchor, so the
 * bitmap's flipped top-left moves to `anchor - (size - origin)`. This is the
 * selection box and the frame-bounds hit-test region.
 */
export function objectFrameRect(
  bounds: { width: number; height: number; originX: number; originY: number },
  anchorX: number,
  anchorY: number,
  xflip: boolean,
  yflip: boolean,
): WorldRect {
  const left = xflip ? anchorX - (bounds.width - bounds.originX) : anchorX - bounds.originX;
  const top = yflip ? anchorY - (bounds.height - bounds.originY) : anchorY - bounds.originY;
  return { left, top, width: bounds.width, height: bounds.height };
}

/** Whether a world point falls inside a rect (inclusive of the top-left edge). */
export function pointInRect(rect: WorldRect, x: number, y: number): boolean {
  return x >= rect.left && x < rect.left + rect.width && y >= rect.top && y < rect.top + rect.height;
}

/** Object entry subset used for hit-testing (position + flips). */
export type HitObject = Pick<S1ObjectEntry, 'x' | 'y' | 'xflip' | 'yflip' | 'id' | 'subtype'>;
