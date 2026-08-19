// src/core/art/sheet-import.ts
//
// FOREIGN ART SHEET -> PIXELS THE COMMIT PLANNER CAN TAKE. The half of sheet
// import with no dialog in it.
//
// This lives in core rather than in renderer/state/import-sheet.ts because two
// callers now need it: the Import dialog, and the agent surface's
// `import_art_sheet`. The refusal SENTENCES live here too, not just the refusal
// KINDS — the agent should read what the artist reads, and a second copy written
// for the agent would drift the first time either is reworded.
//
// It deliberately never builds a CanvasDoc; see import-sheet.ts's header for why
// (the CANVAS_MAX_SIDE cap belongs to the document, not to the decoder).

import { decodeIndexedPng } from './indexed-png';
import { importPngAgainstPalette } from './png-import';
import type { PngImport, PngImportRefusal } from './png-import';
import { fmtGenesisWord } from '../formats/palette';
import { CANVAS_LINE_LENGTH } from './canvas-doc';
import type { LevelDoc } from '../level-classic/model';

export interface ImportedSheet extends PngImport {
  /** The act palette the pixels were mapped against, flattened line-major — what
   *  the commit planner compares against, and by construction a match, so an
   *  imported sheet never trips the palette-drift refusal. */
  palette: number[];
}

export type SheetImportResult =
  | { ok: true; sheet: ImportedSheet }
  | { ok: false; refusal: PngImportRefusal };

/** The act's 64 CRAM words, line-major. */
export function flattenActPalette(doc: LevelDoc): number[] {
  const out: number[] = [];
  for (let l = 0; l < 4; l++) {
    for (let e = 0; e < CANVAS_LINE_LENGTH; e++) out.push(doc.palettes[l]?.[e] ?? 0);
  }
  return out;
}

/**
 * Decode PNG bytes and map them onto `doc`'s palette.
 *
 * THROWS for bytes that are not a usable PNG — that is a broken input, not a
 * decision about the art. REFUSES for the two things that actually go wrong with
 * a sheet made elsewhere: a colour the level does not have, and a cell that mixes
 * colours from lines the hardware cannot combine.
 */
export async function sheetFromBytes(doc: LevelDoc, bytes: Uint8Array): Promise<SheetImportResult> {
  let png;
  try {
    png = await decodeIndexedPng(bytes);
  } catch (e) {
    throw new Error(`${(e as Error).message} — the importer needs an INDEXED (paletted) PNG`);
  }
  const palette = flattenActPalette(doc);
  const mapped = importPngAgainstPalette(png, palette);
  if (!mapped.ok) return { ok: false, refusal: mapped.refusal };
  return { ok: true, sheet: { ...mapped.result, palette } };
}

/**
 * The refusal, in the artist's terms: WHAT IS WRONG, not what to do about it.
 *
 * Split the way `refusalView` splits the commit refusals
 * (canvas-commit-model.ts:124) — message here, remedy in
 * `sheetRefusalResolution` below — so the two halves can be shown separately
 * (the agent returns them as separate fields) without either being restated.
 * One copy of each, read by the dialog and the agent alike.
 */
export function explainSheetRefusal(refusal: PngImportRefusal): string {
  if (refusal.kind === 'colour-not-in-act') {
    const all = refusal.colours ?? [];
    const list = all.slice(0, 8).map(fmtGenesisWord).join(', ');
    const more = all.length - 8;
    return `This sheet uses colours the act does not have: ${list}${more > 0 ? `, and ${more} more` : ''}.`;
  }
  const cells = refusal.cells ?? [];
  const where = cells.slice(0, 4).map((c) => `(${c.x},${c.y})`).join(' ');
  return `${cells.length} cell${cells.length === 1 ? '' : 's'} mix colours that no single palette line holds — `
    + `${where}${cells.length > 4 ? ' and more' : ''}. Each 8×8 cell must draw from one line.`;
}

/**
 * What to do about it. The remedy half of the pair above, per kind.
 *
 * WHY IT IS PER-KIND, AND WHY IT LEADS WITH REDRAWING. One remedy for both
 * kinds sends a `cell-needs-two-lines` caller down a loop: widening the palette
 * DOES fix that refusal, but only if the missing colour lands on the LINE the
 * cell's other colours already use — add it to whichever line happens to have a
 * free slot, re-import, and the identical refusal comes back. So the sentence
 * leads with the move that always works (the same answer the canvas side gives
 * for the identical hardware condition — `refusalView`'s `cell-clash`) and
 * states the constraint on the other one rather than implying it is free.
 */
export function sheetRefusalResolution(refusal: PngImportRefusal): string {
  if (refusal.kind === 'colour-not-in-act') {
    return 'Recolour it to the act\'s palette, or add those colours to the zone palette first '
      + '(the zone palette is shared by every act in the zone).';
  }
  return 'Redraw those cells so each 8×8 draws from a single line. Widening the palette only helps '
    + 'if the missing colour is added to the LINE the cell\'s other colours already use — putting it '
    + 'on any other line leaves this refusal unchanged.';
}
