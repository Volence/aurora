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

import { decodeIndexedPng } from '../../core/art/indexed-png';
import { importPngAgainstPalette } from '../../core/art/png-import';
import type { PngImport } from '../../core/art/png-import';
import { fmtGenesisWord } from '../../core/formats/palette';
import { CANVAS_LINE_LENGTH } from '../../core/art/canvas-doc';
import type { LevelDoc } from '../../core/level-classic/model';

export interface LoadedSheet extends PngImport {
  /** The file it came from, for the dialog's title. */
  path: string;
  /** The act palette the pixels were mapped against, flattened line-major —
   *  what the commit planner must compare against, and by construction a match,
   *  so an imported sheet never triggers the palette-drift refusal. */
  palette: number[];
}

/** The act's 64 CRAM words, line-major. */
export function flattenActPalette(doc: LevelDoc): number[] {
  const out: number[] = [];
  for (let l = 0; l < 4; l++) {
    for (let e = 0; e < CANVAS_LINE_LENGTH; e++) out.push(doc.palettes[l]?.[e] ?? 0);
  }
  return out;
}

export type LoadSheetOutcome =
  | { ok: true; sheet: LoadedSheet }
  | { ok: false; error: string }
  | { cancelled: true };

async function readAbsolute(path: string): Promise<Uint8Array> {
  return new Uint8Array(await window.api.readBinaryFile(path, ''));
}

/**
 * Pick a PNG and map it onto `doc`'s palette.
 *
 * Both refusals are stated in the artist's terms rather than as codes, because
 * they are the two things that actually go wrong with a sheet made elsewhere: a
 * colour the level does not have, and a cell that mixes colours from lines the
 * hardware cannot combine.
 */
export async function loadSheetForAct(doc: LevelDoc): Promise<LoadSheetOutcome> {
  const path = await window.api.selectFile('Import art sheet', [{ name: 'PNG image', extensions: ['png'] }]);
  if (!path) return { cancelled: true };

  let png;
  try {
    png = await decodeIndexedPng(await readAbsolute(path));
  } catch (e) {
    return { ok: false, error: `${(e as Error).message} — the importer needs an INDEXED (paletted) PNG` };
  }

  const palette = flattenActPalette(doc);
  const mapped = importPngAgainstPalette(png, palette);
  if (!mapped.ok) {
    if (mapped.refusal.kind === 'colour-not-in-act') {
      const list = (mapped.refusal.colours ?? []).slice(0, 8).map(fmtGenesisWord).join(', ');
      const more = (mapped.refusal.colours ?? []).length - 8;
      return {
        ok: false,
        error: `This sheet uses colours the act does not have: ${list}${more > 0 ? `, and ${more} more` : ''}. `
          + 'Recolour it to the act\'s palette, or add those colours to the zone palette first.',
      };
    }
    const cells = mapped.refusal.cells ?? [];
    const where = cells.slice(0, 4).map((c) => `(${c.x},${c.y})`).join(' ');
    return {
      ok: false,
      error: `${cells.length} cell${cells.length === 1 ? '' : 's'} mix colours that no single palette line holds — `
        + `${where}${cells.length > 4 ? ' and more' : ''}. Each 8×8 cell must draw from one line.`,
    };
  }

  return { ok: true, sheet: { ...mapped.result, path, palette } };
}
