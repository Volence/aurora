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
import { defaultCanvasPalette, paletteHasVisibleColour } from '../../core/art/canvas-default-palette';
import { CHUNK_PX } from '../../core/art/canvas-resolve';
import { canvasNameIsSafe, canvasPngPath, canvasSidecarPath, listCanvasNames } from '../state/canvas-file';
import {
  useCanvasStore, openCanvasDoc, closeCanvasDoc, activateCanvasDoc, clearCanvasFocus,
} from '../state/canvasStore';
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

/**
 * What the New Canvas dialog opens on (contract 2's two named values).
 *
 * HERE RATHER THAN IN THE DIALOG because they are rules, not presentation, and
 * the file that displays them is the one file the node suite cannot reach. As
 * module constants in the .tsx they were referenced by no test at all: an edit
 * pushing the default side past `CANVAS_MAX_SIDE` — or naming a profile id that
 * no longer exists — would ship a dialog that opens already-invalid, with the
 * whole suite green. The test asserts `validateNewCanvas(NEW_CANVAS_DEFAULTS,
 * [])` is ok, which is the one thing a default has to be.
 *
 * 256x256 is ONE CHUNK — the smallest size a commit can actually take. The
 * default used to be 128x128, described here as "two chunks square", which is
 * wrong twice over: a chunk is 256px, so that is a QUARTER of one, and
 * `canvasChunkCapacity` floors to zero for it. A new canvas therefore opened at
 * a size the commit panel could only answer "there is nothing to commit yet"
 * for — the one thing a default must not be. Undo snapshots grow 4x with it
 * (64KB a step), which is well inside what canvas-doc's MAX_SIDE budgets.
 * `genesis-level-art` is spec §4.2's default target and the profile whose grids
 * (8/16/256) match the tile/block/chunk ladder the rest of the app speaks.
 *
 * THERE IS NO DEFAULT NAME, and that is why this is a partial input rather than
 * a whole one: the name field opens empty on purpose (Create starts disabled
 * until the artist types one), so a default here would be a name nobody chose
 * landing on disk. The test supplies one and asserts the rest is valid.
 */
export const NEW_CANVAS_DEFAULTS: Omit<NewCanvasInput, 'name'> = {
  width: 256,
  height: 256,
  profileId: 'genesis-level-art',
};

/**
 * Why a size cannot be committed into a level, or null when it can.
 *
 * NOT a refusal — a canvas smaller than a chunk is a perfectly good place to
 * draw something you will paste, import or grow later. It is a thing the dialog
 * has to SAY, because the consequence only shows up much later, in a commit
 * panel that reports "nothing to commit yet" without explaining that the size
 * chosen at creation is the reason.
 */
export function commitReachNote(width: number, height: number): string | null {
  if (!Number.isFinite(width) || !Number.isFinite(height)) return null;
  if (width >= CHUNK_PX && height >= CHUNK_PX) return null;
  return `Smaller than one ${CHUNK_PX}x${CHUNK_PX} chunk, so this cannot be committed into a level `
    + 'as it stands: commit works on whole chunks. Fine for art you will paste or import from.';
}

/** Which field a refusal is about, so the dialog can point at it. */
export type NewCanvasField = 'name' | 'width' | 'height';

export type NewCanvasValidation =
  | { ok: true }
  | { ok: false; field: NewCanvasField; reason: string };

/** Every field that is wrong, with its reason. `{}` means the input is valid. */
export type NewCanvasFieldErrors = Partial<Record<NewCanvasField, string>>;

/** Refusal priority — also the reading order of the form. */
const FIELD_ORDER: NewCanvasField[] = ['name', 'width', 'height'];

/**
 * What a width/height FIELD holds, as a number.
 *
 * An EMPTY field is `NaN`, not 0, and that is the whole point. `Number('')` is
 * 0, so a dialog that stored its sizes as numbers turned a cleared field into a
 * literal `0` on screen — a value the user did not type, shown back to them as
 * though they had. NaN is refused by `validateNewCanvas` with the bounds
 * message, which is the true statement about an empty field ("must be a whole
 * number between 8 and 1024"), and it lets the input render the raw text so an
 * emptied field simply looks empty.
 */
export function parseCanvasSide(text: string): number {
  return text.trim() === '' ? Number.NaN : Number(text);
}

/**
 * EVERY field's error at once — what the dialog needs, because it marks each bad
 * field and shows the message for the one the user last touched.
 *
 * `validateNewCanvas` (below) is this plus "first in FIELD_ORDER wins", which is
 * what the CREATE path needs: one refusal, and the name checked before the size
 * so a collision is never masked by a typo'd number. Two shapes, one set of
 * rules — the earlier split showed a name error while the user was editing the
 * width, because the create-time priority was also driving the display.
 */
export function newCanvasFieldErrors(
  input: NewCanvasInput,
  existing: readonly string[],
): NewCanvasFieldErrors {
  const errors: NewCanvasFieldErrors = {};
  const name = input.name.trim();
  if (name === '') {
    errors.name = 'Give the canvas a name.';
  } else if (!canvasNameIsSafe(name)) {
    // The rule spelled out rather than named: it is also a FILE STEM and a tab
    // id, which is why it is stricter than a filename would have to be.
    errors.name =
      'A canvas name must start with a letter or digit and use only letters, digits, '
      + '- and _ (no spaces, dots or slashes), up to 64 characters. It is the name of '
      + 'the file on disk.';
  } else {
    const clash = existing.find((e) => e.toLowerCase() === name.toLowerCase());
    if (clash !== undefined) {
      // Names the file, because "already exists" without the path invites the
      // user to assume Aurora means some other kind of already.
      errors.name =
        `A canvas named "${clash}" already exists (${canvasPngPath(clash)}). `
        + 'Creating over it would replace that art with a blank canvas; pick another name, '
        + 'or open the existing one from the Explorer.';
    }
  }

  const sideOk = (v: number): boolean =>
    Number.isFinite(v) && Math.floor(v) === v && v >= CANVAS_MIN_SIDE && v <= CANVAS_MAX_SIDE;
  const bounds = (label: string): string =>
    `${label} must be a whole number between ${CANVAS_MIN_SIDE} and ${CANVAS_MAX_SIDE} pixels.`;
  if (!sideOk(input.width)) errors.width = bounds('Width');
  if (!sideOk(input.height)) errors.height = bounds('Height');

  return errors;
}

/**
 * Whether this canvas may be created, and if not, WHY — the reason is the whole
 * value of the function. "Invalid name" with no explanation, on a rule as
 * unusual as `canvasNameIsSafe`'s (no spaces, no dots, no slashes, must start
 * alphanumeric), leaves the user guessing which of five things they broke.
 *
 * `existing` is the project's current canvas names (`listCanvasNames().names`).
 */
export function validateNewCanvas(input: NewCanvasInput, existing: readonly string[]): NewCanvasValidation {
  const errors = newCanvasFieldErrors(input, existing);
  for (const field of FIELD_ORDER) {
    const reason = errors[field];
    if (reason !== undefined) return { ok: false, field, reason };
  }
  return { ok: true };
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
 * Refuse, LEAVING THE CANVAS FOCUS EXACTLY AS IT WAS FOUND.
 *
 * The bug this exists for: `openCanvasDoc` focuses the document it opens (or,
 * on a name collision, the one already open), and `closeCanvasDoc` clears the
 * focus when it drops that document. So a create that failed at the write, or
 * was refused for a name already open, left `activeDocId` pointing at null or
 * at some other canvas — while the ACTIVE TAB was still whatever canvas the
 * artist had on screen. `canvasPaneState` compares the two, disagrees, and
 * renders `CanvasDocUnloaded`: "this canvas could not be loaded" over a document
 * that is open, intact and possibly mid-stroke. A false data-loss signal, raised
 * by a dialog the user has not even dismissed yet.
 *
 * The invariant, stated once: A CREATE THAT DOES NOT SUCCEED CHANGES NO FOCUS.
 * It is the same rule tab-activation.ts already states for the load path — "a
 * failed load that is NOT taking focus must leave the visible document alone" —
 * and a create rollback is exactly that. Routing EVERY failure return through
 * here (including the ones that run before any store is touched, where it is a
 * no-op) means a future early return inherits the rule instead of reopening the
 * bug.
 *
 * WHY NOT THE ROOT FIX — writing the files before touching the store at all,
 * which would make the rollback unnecessary. It requires `saveCanvasFile` to be
 * called directly from here, because `saveCanvasDocument` reads its document out
 * of the store. Task 9's review ruled specifically against a second
 * `saveCanvasFile` call site: this one would bypass canvas-save.ts's conflict,
 * partial-write and channel-error messages, each of which carries its own
 * recovery instruction, and would restate the baseline-folding rule those
 * failures depend on. Reshaping canvas-save.ts to take a document instead is the
 * real version of that fix, and it is a change to the save layer at the end of a
 * fourteen-task branch, immediately before CDP verification. It also would not
 * remove the second route on its own — the already-open refusal is
 * `openCanvasDoc`'s focus side effect, which happens before any write in either
 * design. One mechanism covering both routes is the better trade here; the
 * store-last ordering is worth revisiting in 2B alongside the tab-activation
 * split.
 */
function refuse(
  previous: { focus: string | null; paintIndex: number },
  field: NewCanvasField | null,
  reason: string,
): CreateCanvasResult {
  if (previous.focus === null) clearCanvasFocus();
  else activateCanvasDoc(previous.focus);
  // The PAINT INDEX is restored for the same reason and by the same rule.
  // `openCanvasDoc` arms the brush from the new document's palette, so a create
  // that is then rolled back would leave the artist's colour derived from a
  // palette no longer in the store — i.e. a silently recoloured brush on the
  // canvas they are actually looking at.
  useCanvasStore.getState().setPaintIndex(previous.paintIndex);
  return { ok: false, field, reason };
}

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
 * A FAILED WRITE LEAVES NOTHING BEHIND — no document, no undo stack, no tab, and
 * NO CHANGE OF FOCUS (see `refuse`). The last of those is the easiest to lose
 * and the loudest when lost: it makes an unrelated canvas tab render "could not
 * be loaded" over work that is fine.
 *
 * It goes through `saveCanvasDocument` rather than calling `saveCanvasFile`
 * directly — canvas-save.ts's header asks for exactly that, so the mtime
 * baselines, the sidecar-rejected rule and the failure messages have one home.
 */
export async function createCanvasDocument(input: NewCanvasInput): Promise<CreateCanvasResult> {
  // Captured BEFORE anything can move it, and restored by every failure path
  // (see `refuse`). Read once here rather than inside `refuse` for the obvious
  // reason: by the time a refusal runs, the value has already been overwritten
  // by the thing being rolled back.
  const previous = {
    focus: useCanvasStore.getState().activeDocId,
    paintIndex: useCanvasStore.getState().paintIndex,
  };

  const dir = openProjectDir();
  if (dir === null) {
    // The files land under `<project>/.aurora/canvas/`, so with no project there
    // is no directory to put them in. The command is gated on this too; this is
    // the guard for the race (a project closing while the dialog is open).
    return refuse(previous, null, 'No project is open, so there is nowhere to put the canvas.');
  }

  // A FRESH listing, not the one the dialog opened with: the dialog can sit on
  // screen indefinitely, and another Aurora window — or the artist's own file
  // manager — can add a canvas in the meantime.
  let existing: string[];
  try {
    existing = (await listCanvasNames(dir)).names;
  } catch (e) {
    return refuse(previous, null,
      `Could not read ${dir}/.aurora/canvas: ${e instanceof Error ? e.message : String(e)}`);
  }

  const valid = validateNewCanvas(input, existing);
  if (!valid.ok) return refuse(previous, valid.field, valid.reason);

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
    // `refuse` also undoes the focus this very call just handed to the colliding
    // document — a pure validation refusal must not move the artist's view onto
    // a canvas that isn't even the active tab.
    return refuse(previous, 'name',
      `A canvas named "${name}" is already open in a tab. Close it first, or pick another name.`);
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
    // …and no focus change either: closeCanvasDoc clears activeDocId, which
    // would otherwise leave whichever canvas tab is actually on screen rendering
    // "could not be loaded" over live, possibly dirty work.
    return refuse(previous, null, e instanceof Error ? e.message : String(e));
  }

  // The brush was armed on a visible colour by `openCanvasDoc` above — the rule
  // lives in the store (armVisiblePaintIndex) so that CREATING and REOPENING a
  // canvas cannot drift apart, which is exactly what happened when this flow
  // owned its own copy: a new canvas armed white, and the same canvas reopened
  // next session armed black.

  // Through the ordinary tab route, so the create path shares the activation
  // glue with every other way a canvas tab is focused. The document is already
  // open, so this resolves to a plain focus rather than a second read.
  await requestOpenTab(tab);
  return { ok: true, tabId: tab.id };
}
