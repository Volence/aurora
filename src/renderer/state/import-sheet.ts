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
// The interesting half — deciding which palette LINE each 8x8 cell draws from —
// is in core/art/png-import.ts, where the suite can execute it. This file is the
// plumbing: a file dialog, a read, and the act's palette.

import { sheetFromBytes, explainSheetRefusal, flattenActPalette } from '../../core/art/sheet-import';
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
    // A dialog reports; it does not throw at its caller.
    return { ok: false, error: (e as Error).message };
  }
  if (!res.ok) return { ok: false, error: explainSheetRefusal(res.refusal) };
  return { ok: true, sheet: { ...res.sheet, path } };
}
