// src/core/art/canvas-file-format.ts
//
// A canvas document on disk: an indexed PNG next to a JSON sidecar.
//
// WHY TWO FILES (spec §4.1). The PNG is the picture, in a format Aseprite, GIMP
// and every browser already open; the sidecar carries what a PNG cannot say —
// which constraint profile the artist chose, the exact CRAM words behind the
// 8-bit-per-channel PLTE, and the grid origin. Deliberately an open pair: the
// origination surface should win by being Genesis-aware, not by trapping files.
//
// WHICH FILE WINS. The PNG is authoritative for PIXELS; the sidecar is
// authoritative for everything else, and its absence is normal — that is what
// opening a plain Aseprite export looks like. When it is missing the palette is
// recovered from PLTE by snapping each colour into the Genesis 3-bit space, and
// the profile falls back to `none` rather than to a guess: an unconstrained
// canvas is honest about knowing nothing, a wrongly-assumed profile is not.
//
// R10 — DO NOT ASSUME SYMMETRY WITH THE CODEC. encodeIndexedPng's
// IndexedImage.indices promises "each byte < palette.length" and enforces it;
// decodeIndexedPng's DecodedIndexedPng.indices deliberately does NOT — a
// foreign file can index past its own PLTE, and guarding that in the codec
// would duplicate a rule canvas-doc.ts already owns. This module is the
// checkpoint: `normalizeCanvasPixels` folds the WHOLE pixel domain (not just
// "past this palette's length") back into 0..63, and the recovered palette is
// padded out to exactly 64 entries rather than trusted to already be that long.
// A decoded palette shorter than the file's indices imply is normal, not an
// error — the surplus canvas colours are simply black (blankCanvasPalette's
// default), same as any newly-created canvas's unused entries.
//
// Pure core — no fs. Path layout lives in renderer/state/canvas-file.ts.

import type { CanvasDoc } from './canvas-doc';
import { CANVAS_COLORS, CANVAS_TRANSPARENT, blankCanvasPalette, normalizeCanvasPixels } from './canvas-doc';
import { CONSTRAINT_PROFILES, constraintProfile } from './canvas-profiles';
import { decodeIndexedPng, encodeIndexedPng, type Rgb } from './indexed-png';
import { decodeGenesisColor, encodeGenesisColor } from '../formats/palette';

export const CANVAS_SIDECAR_VERSION = 1;

export interface CanvasSidecar {
  version: number;
  name: string;
  profile: string;              // a ConstraintProfileId, or an id this build doesn't know
  palette: number[];            // 64 CRAM words
  gridOrigin: { originX: number; originY: number };
}

export type SidecarParse =
  | { ok: true; sidecar: CanvasSidecar }
  | { ok: false; error: string };

/**
 * Parse a sidecar's JSON text, never throwing: a hand-edited or foreign
 * sidecar rots for reasons that have nothing to do with the art, and
 * `decodeCanvasFiles` treats a parse failure as "no sidecar", not fatal (see
 * this module's header). Every rejection reason names the thing that is wrong
 * and, where useful, the number the caller can compare against.
 */
export function parseCanvasSidecar(json: string): SidecarParse {
  let raw: unknown;
  try { raw = JSON.parse(json); } catch (e) {
    return { ok: false, error: `sidecar is not valid JSON: ${e instanceof Error ? e.message : String(e)}` };
  }
  if (typeof raw !== 'object' || raw === null) return { ok: false, error: 'sidecar is not an object' };
  const o = raw as Record<string, unknown>;
  if (o.version !== CANVAS_SIDECAR_VERSION) {
    return {
      ok: false,
      error: `sidecar version ${String(o.version)} — this Aurora reads version ${CANVAS_SIDECAR_VERSION}`,
    };
  }
  if (!Array.isArray(o.palette) || o.palette.length !== CANVAS_COLORS) {
    return { ok: false, error: `sidecar palette must hold ${CANVAS_COLORS} CRAM words (got ${Array.isArray(o.palette) ? o.palette.length : 'none'})` };
  }
  // Palette entries are coerced, not trusted: a hand-edited sidecar can hold a
  // string, null or an out-of-range number for any word. `Number(w) & 0xffff`
  // turns every one of those into a well-defined 16-bit value (non-numeric ->
  // NaN -> ToInt32(NaN) === 0 -> 0; negative wraps via two's complement, same
  // as any other bitwise mask) rather than propagating NaN into a CRAM word
  // that then renders as garbage with no error anywhere.
  const grid = (o.gridOrigin ?? {}) as Record<string, unknown>;
  return {
    ok: true,
    sidecar: {
      version: CANVAS_SIDECAR_VERSION,
      name: typeof o.name === 'string' ? o.name : 'Canvas',
      profile: typeof o.profile === 'string' ? o.profile : 'none',
      palette: (o.palette as unknown[]).map((w) => Number(w) & 0xffff),
      gridOrigin: {
        // A missing/non-object gridOrigin, or one whose fields are missing or
        // non-numeric, all fall back to 0 the same way: an origin is a
        // convenience for aligning guides, not load-bearing data, so a rotted
        // or absent one should never be the reason a document fails to open.
        originX: Number(grid.originX) || 0,
        originY: Number(grid.originY) || 0,
      },
    },
  };
}

function paletteToRgb(words: number[]): Rgb[] {
  return words.map((w) => {
    const c = decodeGenesisColor(w);
    return { r: c.r, g: c.g, b: c.b };
  });
}

export async function encodeCanvasFiles(doc: CanvasDoc): Promise<{ png: Uint8Array; sidecar: string }> {
  const png = await encodeIndexedPng({
    width: doc.pixels.width,
    height: doc.pixels.height,
    indices: doc.pixels.data,
    palette: paletteToRgb(doc.palette),
    transparentIndex: CANVAS_TRANSPARENT,
  });
  const sidecar: CanvasSidecar = {
    version: CANVAS_SIDECAR_VERSION,
    name: doc.name,
    profile: doc.profileId,
    palette: doc.palette.slice(),
    gridOrigin: { ...doc.gridOrigin },
  };
  // Trailing newline + 2-space indent: these land in a git tree next to the art
  // they describe, so they should diff like source, not like a blob.
  return { png, sidecar: `${JSON.stringify(sidecar, null, 2)}\n` };
}

export async function decodeCanvasFiles(png: Uint8Array, sidecarJson: string | null): Promise<CanvasDoc> {
  const img = await decodeIndexedPng(png);
  // This is the ceiling: a canvas holds 64 colours, full stop. Refused with the
  // count and the ceiling rather than quantized, because silently discarding
  // colours the artist chose is a worse failure than refusing to open the file
  // (spec decision 4).
  if (img.palette.length > CANVAS_COLORS) {
    throw new Error(
      `this PNG has ${img.palette.length} colours; a canvas holds ${CANVAS_COLORS} ` +
      `(${CONSTRAINT_PROFILES['genesis-level-art'].paletteLines} lines x ` +
      `${CONSTRAINT_PROFILES['genesis-level-art'].lineLength}) — reduce its palette before opening it`,
    );
  }

  const parsed = sidecarJson === null ? null : parseCanvasSidecar(sidecarJson);
  // A sidecar that fails to parse is treated as ABSENT, not fatal: the picture is
  // still openable, and refusing to open art because its metadata rotted would
  // lose the artist's work for the sake of the annotation about it.
  const sidecar = parsed && parsed.ok ? parsed.sidecar : null;
  // NOTE (review correction R2): `constraintProfile` takes a plain string and
  // falls back to `none` itself, so do NOT restate that rule here with a cast.

  let palette: number[];
  if (sidecar) {
    palette = sidecar.palette.slice();
  } else {
    // Snap PLTE into the Genesis colour space (spec §4.2: what is new is
    // SNAPPING colour that arrives by paste or import). blankCanvasPalette()
    // seeds all 64 entries first: a PNG's own PLTE can be (and very often is,
    // for hand-authored or Aseprite-exported art) shorter than 64, and the
    // untouched entries stay a well-defined black rather than leftover memory
    // from wherever `palette` would otherwise have come from.
    palette = blankCanvasPalette();
    img.palette.forEach((c, i) => { palette[i] = encodeGenesisColor({ r: c.r, g: c.g, b: c.b }); });
  }

  const profileId = constraintProfile(sidecar?.profile ?? 'none').id;

  // R10: img.indices is NOT guaranteed to be < img.palette.length — that is a
  // promise the ENCODER's IndexedImage makes, not one DecodedIndexedPng
  // repeats (see indexed-png.ts's two JSDoc comments). normalizeCanvasPixels
  // folds the whole 0..255 domain into 0..63 by construction (canvasIndex
  // masks both fields), independent of how long img.palette happened to be —
  // it is not merely rewriting the transparent aliases.
  const pixels = normalizeCanvasPixels({
    width: img.width, height: img.height, data: new Uint8Array(img.indices),
  });

  return {
    name: sidecar?.name ?? 'Canvas',
    pixels,
    palette,
    profileId,
    gridOrigin: sidecar?.gridOrigin ?? { originX: 0, originY: 0 },
  };
}
