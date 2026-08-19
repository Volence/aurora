// src/renderer/state/import-sheet.ts
//
// Loading a foreign art sheet: pick a PNG, decode it, and map it onto the open
// act's palette.
//
// IT DELIBERATELY NEVER BUILDS A CanvasDoc. `decodeCanvasFiles` refuses anything
// over CANVAS_MAX_SIDE because a canvas keeps 40 whole-buffer undo snapshots
// (canvas-file-format.ts:249) — that cap belongs to the DOCUMENT, not to the
// decoder, and sidestepping it is the entire reason this path exists. SonED2's
// importer takes a layout-sized image; so does this one. The pixels go straight
// to the commit planner.
//
// Everything past picking the file delegates to core/art/sheet-import.ts — the
// decode, the palette mapping, and the refusal wording all live there, where
// the agent surface can reach them too. This file is the dialog's plumbing: a
// file picker, a read, and turning that module's result into something a
// dialog can render.

import {
  sheetFromBytes, explainSheetRefusal, sheetRefusalResolution, flattenActPalette,
} from '../../core/art/sheet-import';
import type { ImportedSheet } from '../../core/art/sheet-import';
import type { LevelDoc } from '../../core/level-classic/model';

export { flattenActPalette };

export interface LoadedSheet extends ImportedSheet {
  /** The file it came from, for the dialog's title. */
  path: string;
}

export type LoadSheetOutcome =
  | { ok: true; sheet: LoadedSheet }
  | { ok: false; error: string }
  | { cancelled: true };

async function readAbsolute(path: string): Promise<Uint8Array> {
  return new Uint8Array(await window.api.readBinaryFile(path, ''));
}

/** Pick a PNG and map it onto `doc`'s palette. The decode/map/refuse half is core. */
export async function loadSheetForAct(doc: LevelDoc): Promise<LoadSheetOutcome> {
  const path = await window.api.selectFile('Import art sheet', [{ name: 'PNG image', extensions: ['png'] }]);
  if (!path) return { cancelled: true };

  let res;
  try {
    res = await sheetFromBytes(doc, await readAbsolute(path));
  } catch (e) {
    // Covers a failed READ (moved file, permission denied) as well as a failed
    // DECODE — readAbsolute and sheetFromBytes both throw into here. The
    // "needs an INDEXED PNG" wording lives inside sheetFromBytes, scoped to the
    // decode alone, so a read failure surfaces its own message rather than
    // being mislabelled as an encoding problem it never got far enough to see.
    return { ok: false, error: (e as Error).message };
  }
  // BOTH HALVES, joined. The dialog renders one string, but a refusal that says
  // only what is wrong leaves the artist to guess the fix — and the agent
  // surface returns `message` and `resolution` as separate fields off these
  // same two functions, so joining here is what keeps the human and the agent
  // reading the identical sentences (spec §4) instead of the artist reading
  // strictly less.
  if (!res.ok) {
    return { ok: false, error: `${explainSheetRefusal(res.refusal)} ${sheetRefusalResolution(res.refusal)}` };
  }
  return { ok: true, sheet: { ...res.sheet, path } };
}
