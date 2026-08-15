// src/renderer/shell/new-canvas.ts
//
// Creating a canvas: the rules that decide whether a name/size is allowed, the
// palette a new canvas starts with, and the one flow that turns all of that into
// files on disk plus an open tab.
//
// THE RULES ARE PURE AND THE FLOW IS THIN, on purpose. The node suite renders no
// React, so anything that lives inside `NewCanvasDialog.tsx` is a rule no test
// can reach. Everything below the dialog line — name safety, the collision
// refusal, the size bounds, the zone-palette seeding — is a plain function here
// with a test beside it; the dialog only collects four values and renders what
// these say.
//
// WHY THE COLLISION REFUSAL IS THE IMPORTANT ONE. Every other rule here costs a
// user a retyped name. This one, if it were missing, would silently overwrite
// somebody's art: `<name>.png` is the whole document, and a create that lands on
// an existing name writes a blank 128x128 over it. It is guarded TWICE and both
// guards are deliberate:
//
//   1. here, against a fresh `listCanvasNames`, so the user is TOLD (a refusal
//      with a reason is the only version of this that is usable);
//   2. at the write, because `createCanvasDocument` sets the guarded-write
//      baselines to `null` — the "this file did not exist when we read it"
//      spelling — and `planGuardedWrite` turns expected-null-but-present into a
//      CONFLICT. That is what covers the gap between the listing and the write,
//      and the case a listing cannot see at all: a case-insensitive filesystem
//      folding `Sky` onto `sky.png`.
//
// The listing check below is case-INSENSITIVE for that second reason. On Linux
// `Sky` and `sky` are two files and the strict answer would be "allowed"; on
// macOS they are one file and the write guard would refuse it with a conflict
// message about mtimes, which explains nothing. Refusing here, with the name
// that is in the way, is the same answer in language the artist can act on.

import type { ConstraintProfileId } from '../../core/art/canvas-profiles';
import { CANVAS_COLORS, CANVAS_LINE_LENGTH, CANVAS_MIN_SIDE, CANVAS_MAX_SIDE } from '../../core/art/canvas-doc';
import {
  defaultCanvasPalette, mostVisiblePaintIndex, paletteHasVisibleColour,
} from '../../core/art/canvas-default-palette';
import { canvasNameIsSafe, canvasPngPath, canvasSidecarPath, listCanvasNames } from '../state/canvas-file';
import { useCanvasStore, openCanvasDoc, closeCanvasDoc } from '../state/canvasStore';
import { saveCanvasDocument } from '../state/canvas-save';
import { useClassicLevelStore } from '../state/classicLevelStore';
import { openProjectDir } from '../state/open-project';
import { canvasDocTab } from './tabs';
import { requestOpenTab } from './tab-activation';

export interface NewCanvasInput {
  name: string;
  width: number;
  height: number;
  profileId: ConstraintProfileId;
}

/** Which field a refusal is about, so the dialog can point at it. */
export type NewCanvasField = 'name' | 'width' | 'height';

export type NewCanvasValidation =
  | { ok: true }
  | { ok: false; field: NewCanvasField; reason: string };

/**
 * Whether this canvas may be created, and if not, WHY — the reason is the whole
 * value of the function. "Invalid name" with no explanation, on a rule as
 * unusual as `canvasNameIsSafe`'s (no spaces, no dots, no slashes, must start
 * alphanumeric), leaves the user guessing which of five things they broke.
 *
 * `existing` is the project's current canvas names (`listCanvasNames().names`).
 */
export function validateNewCanvas(input: NewCanvasInput, existing: readonly string[]): NewCanvasValidation {
  const name = input.name.trim();
  if (name === '') return { ok: false, field: 'name', reason: 'Give the canvas a name.' };
  if (!canvasNameIsSafe(name)) {
    return {
      ok: false,
      field: 'name',
      // The rule spelled out rather than named: it is also a FILE STEM and a tab
      // id, which is why it is stricter than a filename would have to be.
      reason:
        'A canvas name must start with a letter or digit and use only letters, digits, '
        + '- and _ (no spaces, dots or slashes), up to 64 characters. It is the name of '
        + 'the file on disk.',
    };
  }
  const clash = existing.find((e) => e.toLowerCase() === name.toLowerCase());
  if (clash !== undefined) {
    return {
      ok: false,
      field: 'name',
      // Names the file, because "already exists" without the path invites the
      // user to assume Aurora means some other kind of already.
      reason:
        `A canvas named "${clash}" already exists (${canvasPngPath(clash)}). `
        + 'Creating over it would replace that art with a blank canvas — pick another name, '
        + 'or open the existing one from the Explorer.',
    };
  }
  const side = (v: number, field: 'width' | 'height'): NewCanvasValidation | null =>
    Number.isFinite(v) && Math.floor(v) === v && v >= CANVAS_MIN_SIDE && v <= CANVAS_MAX_SIDE
      ? null
      : {
          ok: false,
          field,
          reason: `${field === 'width' ? 'Width' : 'Height'} must be a whole number `
            + `between ${CANVAS_MIN_SIDE} and ${CANVAS_MAX_SIDE} pixels.`,
        };
  return side(input.width, 'width') ?? side(input.height, 'height') ?? { ok: true };
}

/**
 * A classic act's 4x16 CRAM words flattened LINE-MAJOR into a canvas's 64, or
 * null when there is no usable zone palette.
 *
 * Line-major is not a choice here — it is the layout `CanvasDoc.palette` already
 * documents (`palette[line * 16 + entry]`), and it is what makes a canvas index
 * and a palette index the same number. Getting it wrong would not throw; it
 * would silently transpose the artist's colours, which is exactly the kind of
 * bug a test pins rather than a reader spots.
 *
 * Tolerant about SHAPE (a short line, a missing line, more than four lines) and
 * strict about USE: a palette that is entirely black is rejected outright, since
 * seeding from it would hand back the black-on-black canvas R18 exists to
 * prevent — through the zone door instead of the blank-palette one. A level
 * document that is mid-load, or a profile that resolved no palette file, is
 * exactly that case.
 */
export function flattenZonePalette(palettes: readonly ArrayLike<number>[] | null | undefined): number[] | null {
  if (!palettes || palettes.length === 0) return null;
  const flat = new Array<number>(CANVAS_COLORS).fill(0);
  const lines = Math.min(palettes.length, CANVAS_COLORS / CANVAS_LINE_LENGTH);
  for (let line = 0; line < lines; line++) {
    const src = palettes[line];
    if (!src) continue;
    for (let entry = 0; entry < CANVAS_LINE_LENGTH; entry++) {
      flat[line * CANVAS_LINE_LENGTH + entry] = entry < src.length ? (src[entry] ?? 0) : 0;
    }
  }
  return paletteHasVisibleColour(flat) ? flat : null;
}

/**
 * The palette a new canvas starts with: the open zone's, or the visible default
 * ramp.
 *
 * The zone case is the reason contract 3 exists — a canvas drawn for Green Hill
 * has to LOOK like Green Hill, or every colour decision made on it is made
 * against the wrong reference and has to be redone at commit time.
 */
export function newCanvasPalette(palettes: readonly ArrayLike<number>[] | null | undefined): number[] {
  return flattenZonePalette(palettes) ?? defaultCanvasPalette();
}

/** The open classic act's palettes, or null. Aeon has no equivalent yet — its
 *  palette model is per-sprite/per-zone in a different shape — so an aeon
 *  project seeds from the default ramp, which is honest rather than wrong. */
function openZonePalettes(): readonly Uint16Array[] | null {
  return useClassicLevelStore.getState().doc?.palettes ?? null;
}

export type CreateCanvasResult =
  | { ok: true; tabId: string }
  | { ok: false; field: NewCanvasField | null; reason: string };

/**
 * Create a canvas: validate, seed the palette, WRITE BOTH FILES, then open the
 * tab and check the document out.
 *
 * THE WRITE COMES FIRST, and that ordering is the point (R16's last item). A
 * canvas with no `CanvasSource` shows an unsaved dot that Ctrl+S cannot act on
 * and a close confirm with no Save button — a dead end with no escape, since
 * canvas has no Export the way sprites do. Giving every canvas its file pair at
 * creation is the cheaper of the two answers (the other being a save-time naming
 * dialog), and it is what `saveableDirtyCanvasDocIds` and
 * `confirmCloseCanvasDoc` were both written expecting.
 *
 * A FAILED WRITE LEAVES NOTHING BEHIND. The document is closed again and no tab
 * is opened, so a create that could not reach disk cannot leave a tab whose
 * every later save fails for the same reason.
 *
 * It goes through `saveCanvasDocument` rather than calling `saveCanvasFile`
 * directly — canvas-save.ts's header asks for exactly that, so the mtime
 * baselines, the sidecar-rejected rule and the failure messages have one home.
 */
export async function createCanvasDocument(input: NewCanvasInput): Promise<CreateCanvasResult> {
  const dir = openProjectDir();
  if (dir === null) {
    // The files land under `<project>/.aurora/canvas/`, so with no project there
    // is no directory to put them in. The command is gated on this too; this is
    // the guard for the race (a project closing while the dialog is open).
    return { ok: false, field: null, reason: 'No project is open, so there is nowhere to put the canvas.' };
  }

  // A FRESH listing, not the one the dialog opened with: the dialog can sit on
  // screen indefinitely, and another Aurora window — or the artist's own file
  // manager — can add a canvas in the meantime.
  let existing: string[];
  try {
    existing = (await listCanvasNames(dir)).names;
  } catch (e) {
    return {
      ok: false, field: null,
      reason: `Could not read ${dir}/.aurora/canvas: ${e instanceof Error ? e.message : String(e)}`,
    };
  }

  const valid = validateNewCanvas(input, existing);
  if (!valid.ok) return { ok: false, field: valid.field, reason: valid.reason };

  const name = input.name.trim();
  const tab = canvasDocTab(name);
  const palette = newCanvasPalette(openZonePalettes());

  // `openCanvasDoc` returns 'focused' when a document is ALREADY open under this
  // id — a canvas whose files were deleted out from under a still-open tab, so
  // the listing above cannot see it. Focusing it and reporting success would
  // hand the user someone else's art under the name they just typed, which is
  // the exact case that return value was added for.
  if (openCanvasDoc(tab.id, { name, width: input.width, height: input.height, profileId: input.profileId, palette })
      === 'focused') {
    return {
      ok: false, field: 'name',
      reason: `A canvas named "${name}" is already open in a tab. Close it first, or pick another name.`,
    };
  }

  useCanvasStore.getState().setSource(tab.id, {
    dir,
    pngPath: canvasPngPath(name),
    sidecarPath: canvasSidecarPath(name),
    // null = "did not exist when we read it". planGuardedWrite turns
    // expected-null-but-present into a conflict, so this is also the second
    // overwrite guard described in the header.
    pngMtimeMs: null,
    sidecarMtimeMs: null,
    sidecarRejected: false,
  });

  try {
    await saveCanvasDocument(tab.id);
  } catch (e) {
    closeCanvasDoc(tab.id); // no document, no undo stack, no tab
    return { ok: false, field: null, reason: e instanceof Error ? e.message : String(e) };
  }

  // Arm the brush on a colour that can actually be SEEN in this canvas's
  // palette (R18). Set after the write and before the tab opens, so the pane's
  // first frame already shows it in the status bar.
  useCanvasStore.getState().setPaintIndex(mostVisiblePaintIndex(palette));

  // Through the ordinary tab route, so the create path shares the activation
  // glue with every other way a canvas tab is focused. The document is already
  // open, so this resolves to a plain focus rather than a second read.
  await requestOpenTab(tab);
  return { ok: true, tabId: tab.id };
}
