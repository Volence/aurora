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
// WHICH FILE WINS, AND THE SHARP EDGE ON IT. The PNG is authoritative for
// PIXELS; the sidecar is authoritative for everything else, and its absence is
// normal — that is what opening a plain Aseprite export looks like. When it is
// missing the palette is recovered from PLTE by snapping each colour into the
// Genesis 3-bit space, and the profile falls back to `none` rather than to a
// guess: an unconstrained canvas is honest about knowing nothing, a
// wrongly-assumed profile is not.
//
// The sharp edge: when a sidecar IS present, it wins for colour even if the
// PNG's own PLTE disagrees with it — which happens the moment another tool
// recolours the PNG without knowing the sidecar exists (open sky.png in
// Aseprite, change a colour, save: Aseprite rewrites PLTE and has never heard
// of sky.canvas.json). Silently trusting the sidecar would keep the artist's
// PIXEL edits but erase their COLOUR edit with no record it ever happened, and
// the next save would rewrite PLTE from the stale sidecar, erasing the
// evidence too. This module cannot resolve that conflict — which file should
// win is a UI decision for Task 9 — but it CAN detect it exactly (see the I2
// comment at the palette-recovery site below) and say so as a warning rather
// than silently picking a winner.
//
// REPORTABILITY. This module computes several genuine diagnoses — a sidecar
// that failed to parse, a PNG that disagrees with its own sidecar, a foreign
// tRNS index a canvas cannot honour, a PLTE shorter than a canvas holds — and
// every one of them needs a path to a human, or computing it is pointless.
// `CanvasLoad.warnings` is that path: ONE channel, not a different mechanism
// per diagnosis. `sidecarRejected` is separate and narrower than "something
// looked odd": it means Aurora could not READ the artist's saved settings, and
// the mtime guard that normally protects a file from a stale overwrite will
// NOT catch this case, because the PNG on disk did not change — Aurora simply
// failed to parse the sidecar next to it. Task 9 must decline to overwrite a
// rejected sidecar rather than replace it with a freshly-guessed one; this
// module's job is only to say, honestly, that it could not be read.
//
// WHY sidecarRejected, NOT KEY-PASSTHROUGH. An alternative was considered: have
// a rejected sidecar carry its own unrecognised keys through unread, so that a
// v2 file survives being opened (and re-saved) by a v1 Aurora unharmed. That
// was rejected as the wrong owner: it would put a persistence concern — what
// to do with bytes this build cannot interpret — inside `CanvasDoc`, which is
// meant to be a plain in-memory document, not a bag of bytes some future
// version might want back. "Do not destroy what you could not read" is the
// simpler rule, and refusing to write is Task 9's job, not a field this
// module's document type has to carry forever on the chance it is needed.
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
// default), same as any newly-created canvas's unused entries. A magenta
// sentinel would be worse here: a CanvasDoc has no "unset" slot, so a sentinel
// colour would become indistinguishable from one the artist actually chose the
// first time the document round-tripped.
//
// Pure core — no fs. Path layout lives in renderer/state/canvas-file.ts.

import type { CanvasDoc } from './canvas-doc';
import {
  CANVAS_COLORS, CANVAS_LINES, CANVAS_LINE_LENGTH, CANVAS_TRANSPARENT,
  blankCanvasPalette, normalizeCanvasPixels,
} from './canvas-doc';
import { constraintProfile } from './canvas-profiles';
import { decodeIndexedPng, encodeIndexedPng, type Rgb } from './indexed-png';
import { decodeGenesisColor, encodeGenesisColor } from '../formats/palette';

export const CANVAS_SIDECAR_VERSION = 1;

// The Genesis CRAM word's meaningfully-live bits: 0BGR0, one nibble per
// channel, low bit of each nibble always 0 (decodeGenesisColor/
// encodeGenesisColor in ../formats/palette only ever read/write bits
// 1-3/5-7/9-11). Masking sidecar palette words to exactly this domain, not the
// full 16 bits, is what makes "did this word change" plain equality: a
// hand-edited sidecar carrying junk in the unused bits would otherwise
// round-trip as a value that looks different from a canvas-authored word
// carrying the identical colour — which is exactly the equality I2's
// stale-PNG detection below depends on being exact.
const GENESIS_WORD_MASK = 0x0eee;

// decodeCanvasFiles has no way to know the file's own name (that is path
// layout, owned by renderer/state/canvas-file.ts — see the header). This is
// the value it returns instead, and every caller MUST replace it with the
// file's stem before showing or saving the document; nothing in this module
// enforces that, because a pure core module cannot see a path.
export const CANVAS_PLACEHOLDER_NAME = 'Canvas';

export interface CanvasSidecar {
  version: number;
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
 * `decodeCanvasFiles` treats a parse failure as "no sidecar to trust", not
 * fatal (see this module's header) — while still reporting it (`sidecarRejected`
 * plus a warning), which a bare `null` could not do. Every rejection reason
 * names the thing that is wrong and, where useful, the number the caller can
 * compare against.
 */
export function parseCanvasSidecar(json: string): SidecarParse {
  let raw: unknown;
  try { raw = JSON.parse(json); } catch (e) {
    return { ok: false, error: `sidecar is not valid JSON: ${e instanceof Error ? e.message : String(e)}` };
  }
  if (typeof raw !== 'object' || raw === null) return { ok: false, error: 'sidecar is not an object' };
  const o = raw as Record<string, unknown>;
  if (o.version !== CANVAS_SIDECAR_VERSION) {
    const v = o.version;
    // A newer file and an older file are different problems with different
    // fixes — "update Aurora" vs. "this needs a migration" — so they get
    // different messages rather than collapsing into one "wrong version"
    // notice. This also makes the eventual migration site (the branch below)
    // obvious rather than reusing a message written for the other direction.
    if (typeof v === 'number' && v > CANVAS_SIDECAR_VERSION) {
      return {
        ok: false,
        error: `sidecar version ${v} is newer than this Aurora understands (it reads up to version ${CANVAS_SIDECAR_VERSION}) — update Aurora; opening now ignores this file's settings, and saving would overwrite them`,
      };
    }
    return {
      ok: false,
      error: `sidecar version ${String(v)} is older than this Aurora writes (version ${CANVAS_SIDECAR_VERSION}) — update Aurora to migrate it`,
    };
  }
  if (!Array.isArray(o.palette) || o.palette.length !== CANVAS_COLORS) {
    return { ok: false, error: `sidecar palette must hold ${CANVAS_COLORS} CRAM words (got ${Array.isArray(o.palette) ? o.palette.length : 'none'})` };
  }
  const grid = (o.gridOrigin ?? {}) as Record<string, unknown>;
  return {
    ok: true,
    sidecar: {
      // Returning the constant rather than `o.version` is equivalent — the
      // strict-equality check just above is exhaustive, anything else already
      // returned — and sidesteps re-narrowing `unknown` back to the literal
      // type for no benefit.
      version: CANVAS_SIDECAR_VERSION,
      profile: typeof o.profile === 'string' ? o.profile : 'none',
      // Palette entries are coerced, not trusted: a hand-edited sidecar can
      // hold a string, null or an out-of-range number for any word.
      // `Number(w) & GENESIS_WORD_MASK` turns every one of those into a
      // well-defined value inside the live-bit domain (non-numeric -> NaN ->
      // ToInt32(NaN) === 0 -> 0; negative wraps via two's complement, same as
      // any other bitwise mask) rather than propagating NaN into a CRAM word
      // that then renders as garbage with no error anywhere.
      palette: (o.palette as unknown[]).map((w) => Number(w) & GENESIS_WORD_MASK),
      gridOrigin: {
        // `Number(x) || 0` (the previous form) lets Infinity through:
        // `Number('1e400')` is `Infinity`, and `Infinity || 0` is still
        // `Infinity` because `Infinity` is truthy — a coordinate that poisons
        // whatever draws the guides, far from here. `| 0` is the same fold
        // `blankCanvasDoc` already applies to width/height: it truncates AND
        // turns every non-finite value into 0 in one step.
        originX: Number(grid.originX) | 0,
        originY: Number(grid.originY) | 0,
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
  // encodeIndexedPng's own length guard fires on the wrong symptom for this: a
  // short doc.palette produces an out-of-range PIXEL error ("indices[0] is out
  // of range for a 30-colour palette") for what is actually a corrupt
  // PALETTE. Catch it here, with the noun that is actually wrong.
  if (doc.palette.length !== CANVAS_COLORS) {
    throw new Error(`canvas palette must hold ${CANVAS_COLORS} CRAM words (got ${doc.palette.length}) — this document is corrupt`);
  }
  const png = await encodeIndexedPng({
    width: doc.pixels.width,
    height: doc.pixels.height,
    indices: doc.pixels.data,
    palette: paletteToRgb(doc.palette),
    transparentIndex: CANVAS_TRANSPARENT,
  });
  const sidecar: CanvasSidecar = {
    version: CANVAS_SIDECAR_VERSION,
    profile: doc.profileId,
    palette: doc.palette.slice(),
    gridOrigin: { ...doc.gridOrigin },
  };
  // Trailing newline + 2-space indent: these land in a git tree next to the art
  // they describe, so they should diff like source, not like a blob.
  return { png, sidecar: `${JSON.stringify(sidecar, null, 2)}\n` };
}

export interface CanvasLoad {
  doc: CanvasDoc;
  /** Non-fatal: the art opened, but something about its metadata did not (or
   *  looks inconsistent). A caller that ignores these still gets a legal
   *  document — but should not ignore them, since some are the only record a
   *  real problem ever existed (see sidecarRejected and the I2 comment below). */
  warnings: string[];
  /** A sidecar was supplied and NOT understood (failed to parse, or named a
   *  version this build refuses). The caller must not overwrite it on the
   *  next save without saying so first — the usual mtime guard will not catch
   *  this, because the file did NOT change on disk; Aurora simply could not
   *  read it. `false` when no sidecar was supplied at all: that is the normal
   *  "opened a plain Aseprite export" case, not a rejection. */
  sidecarRejected: boolean;
}

export async function decodeCanvasFiles(png: Uint8Array, sidecarJson: string | null): Promise<CanvasLoad> {
  const img = await decodeIndexedPng(png);
  // This is the ceiling: a canvas holds 64 colours, full stop. Refused with the
  // count and the ceiling rather than quantized, because silently discarding
  // colours the artist chose is a worse failure than refusing to open the file
  // (spec decision 4). CANVAS_LINES x CANVAS_LINE_LENGTH — not
  // CONSTRAINT_PROFILES['genesis-level-art'] — because 64 is Genesis hardware,
  // owned by canvas-doc.ts; sourcing it from a profile table would make this
  // message quietly wrong the day someone edits that profile for an unrelated
  // reason.
  if (img.palette.length > CANVAS_COLORS) {
    throw new Error(
      `this PNG has ${img.palette.length} colours; a canvas holds ${CANVAS_COLORS} ` +
      `(${CANVAS_LINES} lines x ${CANVAS_LINE_LENGTH}) — reduce its palette before opening it`,
    );
  }

  const warnings: string[] = [];
  const parsed = sidecarJson === null ? null : parseCanvasSidecar(sidecarJson);
  // A sidecar that fails to parse still lets the picture open — refusing to
  // open art because its metadata rotted would lose the artist's work for the
  // sake of the annotation about it — but it IS reported, both so a human sees
  // why the canvas looks unconstrained and so the caller knows not to
  // overwrite a sidecar it could not read (see CanvasLoad.sidecarRejected).
  const sidecarRejected = parsed !== null && !parsed.ok;
  if (parsed && !parsed.ok) {
    warnings.push(`the sidecar could not be read (${parsed.error}); opening the art without it — the canvas is unconstrained until this is fixed, and the sidecar file will not be overwritten on save`);
  }
  const sidecar = parsed && parsed.ok ? parsed.sidecar : null;
  // NOTE (review correction R2): `constraintProfile` takes a plain string and
  // falls back to `none` itself, so do NOT restate that rule here with a cast.

  let palette: number[];
  if (sidecar) {
    palette = sidecar.palette.slice();
    // I2: detect a PNG recoloured by another tool since the sidecar was last
    // saved. This is exact, not a heuristic: for a CANONICAL CRAM word,
    // encodeGenesisColor(decodeGenesisColor(w)) === w always (decodeGenesisColor
    // only ever produces RGB values sitting exactly on one of the 8 Genesis
    // steps per channel), so PLTE is a lossless carrier of a word Aurora wrote.
    // Any disagreement between the sidecar's word and the word re-derived from
    // this PNG's own PLTE is therefore proof something other than Aurora wrote
    // this PLTE — most likely another tool's re-save (see the header's "sharp
    // edge"). Only compared across entries the PNG actually defines: a short
    // PLTE says nothing about slots it never had an opinion on.
    const n = Math.min(img.palette.length, CANVAS_COLORS);
    for (let i = 0; i < n; i++) {
      if (encodeGenesisColor(img.palette[i]) !== palette[i]) {
        warnings.push("this PNG's colours no longer match its sidecar, as if another tool (e.g. Aseprite) recoloured it after Aurora last saved; Aurora is using the sidecar's palette, and saving will overwrite the PNG's colours with the sidecar's");
        break;
      }
    }
  } else {
    // Snap PLTE into the Genesis colour space (spec §4.2: what is new is
    // SNAPPING colour that arrives by paste or import). blankCanvasPalette()
    // seeds all 64 entries first: a PNG's own PLTE can be (and very often is,
    // for hand-authored or Aseprite-exported art) shorter than 64, and the
    // untouched entries stay a well-defined black rather than leftover memory
    // from wherever `palette` would otherwise have come from.
    palette = blankCanvasPalette();
    img.palette.forEach((c, i) => { palette[i] = encodeGenesisColor({ r: c.r, g: c.g, b: c.b }); });
    if (img.palette.length < CANVAS_COLORS) {
      warnings.push(`this PNG's palette has only ${img.palette.length} colours; the remaining ${CANVAS_COLORS - img.palette.length} canvas colour slots default to black`);
    }
  }

  // A foreign PNG can name any index as transparent via tRNS; a canvas can only
  // ever treat entry 0 as transparent (canvas-doc.ts: hardware, not a
  // convention). Silently ignoring a different index is the right BEHAVIOUR —
  // honouring it would mean permuting the palette — but doing that silently
  // was out of character for a module this careful about diagnostics.
  if (img.transparentIndex !== null && img.transparentIndex !== 0) {
    warnings.push(`this PNG marks palette entry ${img.transparentIndex} as transparent; a canvas can only treat entry 0 as transparent, so that setting was not honoured`);
  }

  const profileId = constraintProfile(sidecar?.profile ?? 'none').id;

  // R10: img.indices is NOT guaranteed to be < img.palette.length — that is a
  // promise the ENCODER's IndexedImage makes, not one DecodedIndexedPng
  // repeats (see indexed-png.ts's two JSDoc comments). normalizeCanvasPixels
  // folds the whole 0..255 domain into 0..63 by construction (canvasIndex
  // masks both fields), independent of how long img.palette happened to be —
  // it is not merely rewriting the transparent aliases. No defensive copy of
  // img.indices here: `img` is local to this call (decodeIndexedPng allocates
  // it fresh and nothing else retains a reference), so there is nothing for a
  // later mutation to alias — normalizeCanvasPixels already never mutates its
  // input, whether that input is a copy or not.
  const pixels = normalizeCanvasPixels({ width: img.width, height: img.height, data: img.indices });

  const doc: CanvasDoc = {
    // See CANVAS_PLACEHOLDER_NAME's own doc comment: the caller MUST replace
    // this with the file's stem.
    name: CANVAS_PLACEHOLDER_NAME,
    pixels,
    palette,
    profileId,
    gridOrigin: sidecar?.gridOrigin ?? { originX: 0, originY: 0 },
  };

  return { doc, warnings, sidecarRejected };
}
