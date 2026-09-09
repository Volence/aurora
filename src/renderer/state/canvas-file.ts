// src/renderer/state/canvas-file.ts
//
// The ONE place that knows where a canvas lives on disk. Everything above this
// module addresses a canvas by NAME.
//
// Layout: `<project>/.aurora/canvas/<name>.png` plus `<name>.canvas.json`. The
// `.aurora` directory is the project's existing sidecar home (see
// core/project/s1/index.ts SIDECAR = '.aurora/project.json'), so canvases land
// with the rest of Aurora's per-project state rather than scattered into the
// disassembly's own tree.
//
// THE NAME IS PART OF A PATH, so `canvasNameIsSafe` is checked here before
// either loadCanvasFile or saveCanvasFile touches disk. It is deliberately
// stricter than rel-path safety (no dots, no slashes, no spaces) — a canvas
// name also has to survive being a tab id and a file stem.
//
// WHO ELSE GUARDS, AND WHY THIS ONE STILL MATTERS. For WRITES, this is defense
// in depth, not the only line: `saveCanvasFile` goes through
// `window.api.writeGuarded`, whose main-process handler
// (`src/main/guarded-write.ts`) re-checks every relPath with `isRelPathSafe`
// and throws on an escape — so a bug here would be caught one layer down.
//
// SINCE 2026-09-08 THE SAME IS TRUE OF READS. This paragraph used to say that
// `loadCanvasFile` reads through `window.api.readBinaryFile`, that "that channel
// has NO main-side rel-path guard (adding one would break aeon's absolute-path
// chunk import)", and that `canvasNameIsSafe` is therefore "the only thing
// standing between `loadCanvasFile('../../../../etc/passwd')` and the
// filesystem". `readBinaryFile` now guards (main/file-io.ts), and the chunk
// import that was the stated obstacle passes its absolute path in the BASE
// argument instead. The name guard here is still not redundant — it is
// STRICTER than rel-path safety and it also refuses names that are merely
// unusable as a tab id or a file stem — but it is no longer alone.
//
// Both call sites are pinned by name-escape tests below precisely because
// deleting either one currently leaves the suite green.

import type { CanvasDoc } from '../../core/art/canvas-doc';
import { encodeCanvasFiles, decodeCanvasFiles } from '../../core/art/canvas-file-format';
import type { CanvasSource } from './canvasStore';
import type { GuardedWriteFile, GuardedWriteResult } from '../../shared/ipc-types';
import type { GuardConflict } from '../../core/project/save-guard';
import { saveConflictCauses } from '../../core/project/conflict-message';
import { CANVAS_NAME_PATTERN } from '../../shared/canvas-name';

export const CANVAS_DIR = '.aurora/canvas';

// The pattern itself lives in src/shared/canvas-name.ts: the `commit_canvas`
// tool schema (main process) must state the same rule this guard enforces, so
// that a bad name is INVALID_PARAMS at the protocol edge rather than the
// INTERNAL error this throw becomes.
export function canvasNameIsSafe(name: string): boolean {
  return CANVAS_NAME_PATTERN.test(name);
}

export function canvasPngPath(name: string): string { return `${CANVAS_DIR}/${name}.png`; }
export function canvasSidecarPath(name: string): string { return `${CANVAS_DIR}/${name}.canvas.json`; }

/**
 * The narrow guarded-write capability `saveCanvasFile` needs (`window.api` by
 * default). Deliberately re-declared rather than imported from
 * `classic-save.ts`, which defines the identical shape for the identical
 * reason (its unit tests supply a typed fake instead of mocking global
 * `window`) — the two save paths are otherwise independent, and importing a
 * "classic"-named type into the canvas layer would be the wrong coupling for
 * three lines saved.
 */
export interface GuardedWriteApi {
  writeGuarded(basePath: string, files: GuardedWriteFile[]): Promise<GuardedWriteResult>;
}

function defaultWriteApi(): GuardedWriteApi {
  return { writeGuarded: (dir, files) => window.api.writeGuarded(dir, files) };
}

export interface CanvasListing {
  /** Canvas names Aurora will open. */
  names: string[];
  /**
   * `.png` files present under the canvas dir whose stem fails
   * `canvasNameIsSafe` — e.g. a hand-dropped Aseprite export named
   * `my art.png`. Not silently hidden: a name that vanishes from a listing
   * with no explanation, in a directory users are EXPECTED to hand-populate,
   * is indistinguishable from data loss. The caller (Task 13's Explorer) is
   * expected to surface these rather than pretend the directory is empty of
   * them.
   */
  skipped: string[];
}

/** The canvases in a project. Tolerant of ABSENCE ONLY: a missing dir lists as
 *  empty, and every other failure THROWS.
 *
 *  ⚠ THAT DISTINCTION IS LOAD-BEARING AND IT USED NOT TO EXIST
 *  (LISTING-SWALLOWS-FAILURE, fixed 2026-09-08). This read `window.api.listDir`,
 *  which resolved `[]` rather than rejecting — for an empty directory, a missing
 *  one, an EACCES, and a refused path alike. `shell/new-canvas.ts` calls this to
 *  get the names a new canvas must not collide with, and its own header calls
 *  that "the important one": `<name>.png` IS the document, so a create that
 *  lands on an existing name writes a blank canvas over somebody's art. An
 *  unreadable directory answered "there are no canvases", every name passed the
 *  collision check, and the second guard (the guarded write's expected-null
 *  baseline) was left holding it alone. That file ALREADY wraps this call in a
 *  try/catch that refuses with "Could not read …" — a branch nothing could reach
 *  until now.
 *
 *  Matches the `.png` extension EXACTLY (not case-insensitively): Aurora only
 *  ever writes lowercase `.png` via `canvasPngPath`, so a case-insensitive
 *  match here would let a foreign `sky.PNG` list as `sky` and then fail to
 *  open on a case-sensitive filesystem — `canvasPngPath('sky')` reconstructs
 *  `sky.png`, a different file from `sky.PNG` on Linux. A `sky.PNG` sitting in
 *  the directory is simply not a canvas Aurora recognises; it is silently
 *  excluded (not listed as `skipped`, since `skipped` is reserved for files
 *  this module DOES recognise as candidate canvases but whose name it
 *  refuses). */
export async function listCanvasNames(dir: string): Promise<CanvasListing> {
  const listing = await window.api.probeDir(dir, CANVAS_DIR);
  if (listing.outcome !== 'listed' && listing.outcome !== 'absent') {
    throw new Error(
      `could not list ${dir}/${CANVAS_DIR}: ${listing.reason ?? `directory ${listing.outcome}`}`,
    );
  }
  // 'absent' is DETERMINATE — a project with no canvases yet, which is the
  // ordinary state and stays silent.
  const entries = listing.entries ?? [];
  const names: string[] = [];
  const skipped: string[] = [];
  for (const e of entries) {
    if (!e.endsWith('.png')) continue;
    const stem = e.slice(0, -'.png'.length);
    if (canvasNameIsSafe(stem)) names.push(stem);
    else skipped.push(e);
  }
  names.sort(); // a stable listing, not readdir order
  return { names, skipped };
}

// R12: `warnings` comes straight through from decodeCanvasFiles, plus a second
// source below (a sidecar that could not even be READ, as opposed to one that
// read but did not parse). A load that could not read the sidecar has to say
// so, and the SAVE has to know it, because the mtime guard cannot help here —
// the file did not change on disk, we just could not read or parse it. That
// last fact lives on `source.sidecarRejected` (CanvasSource carries it because
// it must outlive this one load call, for the life of the document — see its
// own doc comment); there is no second copy at the top level here, so there is
// nothing for the two to disagree about.
export interface LoadedCanvas {
  doc: CanvasDoc;
  source: CanvasSource;
  warnings: string[];
}

export async function loadCanvasFile(dir: string, name: string): Promise<LoadedCanvas> {
  if (!canvasNameIsSafe(name)) throw new Error(`'${name}' is not a valid canvas name`);
  const pngPath = canvasPngPath(name);
  const sidecarPath = canvasSidecarPath(name);

  const png = new Uint8Array(await window.api.readBinaryFile(dir, pngPath));

  // The sidecar is OPTIONAL — a MISSING sidecar is what opening a plain
  // Aseprite export looks like, not an error. A sidecar that exists but could
  // not be READ (permissions, a locked file, a transient fs error) is a
  // DIFFERENT story: treating it the same as "no sidecar" is the R12 chain
  // arriving through a second door — the settings are still there on disk,
  // Aurora just failed to see them, and the next save must not overwrite them
  // either. `readBinaryFile`'s ENOENT is the one failure that means "absent";
  // anything else is a read failure worth reporting.
  let sidecarJson: string | null = null;
  let sidecarReadError: string | null = null;
  try {
    sidecarJson = new TextDecoder().decode(new Uint8Array(await window.api.readBinaryFile(dir, sidecarPath)));
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    if (!/ENOENT/.test(message)) sidecarReadError = message;
  }

  const loaded = await decodeCanvasFiles(png, sidecarJson);
  const [pngMtimeMs, sidecarMtimeMs] = await Promise.all([
    window.api.fileMtime(dir, pngPath),
    window.api.fileMtime(dir, sidecarPath),
  ]);

  const sidecarRejected = loaded.sidecarRejected || sidecarReadError !== null;
  const warnings = sidecarReadError
    ? [
        ...loaded.warnings,
        `the sidecar could not be read (${sidecarReadError}); opening the art without it: ` +
          'the canvas is unconstrained until this is fixed, and the sidecar file will not be overwritten on save',
      ]
    : loaded.warnings;

  return {
    // The FILE STEM is the canvas's name — the sidecar no longer carries one
    // (R12), because a field only ever written as a copy of the filename
    // becomes a lie the moment the pair is renamed.
    doc: { ...loaded.doc, name },
    source: { dir, pngPath, sidecarPath, pngMtimeMs, sidecarMtimeMs, sidecarRejected },
    warnings,
  };
}

export type SaveCanvasResult =
  | {
      ok: true;
      pngMtimeMs: number | null;
      sidecarMtimeMs: number | null;
      /** Whether the sidecar was actually part of this write. False exactly
       *  when `sidecarRejected` made `saveCanvasFile` omit it from the batch —
       *  a caller (Task 10) that clears the dirty dot on `ok: true` without
       *  checking this loses the "profile/gridOrigin never persisted" fact
       *  R12 exists to prevent, one layer downstream of the load. */
      sidecarWritten: boolean;
    }
  | {
      ok: false;
      error: string;
      kind: 'invalid-name' | 'conflict' | 'partial' | 'channel-error';
      /** Set only for `kind: 'conflict'` — the files that blocked the write, EACH
       *  WITH ITS CAUSE. It was `string[]` until 2026-09-08, which is what let
       *  every caller say "changed on disk" about a file that had been deleted or
       *  that had appeared; see GuardConflict and core/project/conflict-message.ts. */
      conflicts?: GuardConflict[];
      /** Set only for `kind: 'partial'`: the conflict check passed and SOME
       *  files landed before an fs error interrupted the batch (per
       *  guarded-write.ts's own partial semantics — per-file rename atomicity
       *  holds, batch atomicity does not). The mtimes below are already folded
       *  through the same "unwritten keeps its old baseline" rule as the
       *  success path, so a caller can fold them into `CanvasSource` even
       *  though the overall save failed — skipping that leaves the NEXT save
       *  conflicting against a file Aurora itself just wrote, an
       *  unresolvable conflict whose only fix is reopening. */
      partial?: {
        pngMtimeMs: number | null;
        sidecarMtimeMs: number | null;
        sidecarWritten: boolean;
        failed: { path: string; message: string };
        unwritten: string[];
      };
    };

/**
 * The mtime a caller should treat as this file's new baseline after a write
 * attempt.
 *
 *  - Never queued in the batch at all (the sidecar, when `sidecarRejected`)
 *    → nothing changed on disk for it: keep the ORIGINAL expected value. This
 *    is the R12 fix for the mtime guard specifically: `newMtimes` has no entry
 *    for a file that was never sent, and folding that absence to `null` reads
 *    as "did not exist at read" (see core/project/save-guard.ts's conflict
 *    table) — which turns the artist's very next real sidecar save into a
 *    false "appeared externally" conflict.
 *  - Queued and it landed (present in `newMtimes`) → the fresh stamp.
 *  - Queued but never reached (a partial batch stopped before it, or it is
 *    the file that failed) → also unchanged on disk: keep the original
 *    expected value.
 */
function mtimeAfterWrite(
  path: string,
  queued: boolean,
  expectedMs: number | null,
  newMtimes: Record<string, number>,
): number | null {
  if (!queued) return expectedMs;
  return newMtimes[path] ?? expectedMs;
}

/**
 * Write both files as ONE guarded batch. One batch because the conflict check is
 * per batch: a PNG that landed while its sidecar failed to write — a conflict,
 * or an fs error partway through — would leave art whose metadata describes the
 * previous version, and the sidecar is where the palette lives, so that is a
 * silently recoloured picture.
 *
 * That guarantee is about WRITE FAILURES. It is deliberately NOT what happens
 * for `sidecarRejected` below, twenty lines down: when the sidecar could not be
 * READ on load, this function drops it from the batch on purpose (R12) and
 * writes only the PNG — the exact "PNG lands, sidecar doesn't" shape the
 * paragraph above exists to prevent, reached through a door that paragraph
 * isn't talking about. It is the right call anyway (overwriting metadata Aurora
 * never understood is worse than leaving it stale, per this module's header),
 * just not covered by the single-batch atomicity argument — a chosen exception,
 * not a gap in it.
 */
export async function saveCanvasFile(
  dir: string, name: string, doc: CanvasDoc,
  expected: { pngMtimeMs: number | null; sidecarMtimeMs: number | null },
  /** R12: true when the load could not read or parse the sidecar. The mtime
   *  guard does NOT cover this — the file never changed on disk — so the
   *  batch below deliberately omits the sidecar rather than replacing
   *  metadata Aurora admits it did not understand. Do not destroy what you
   *  could not read. */
  sidecarRejected = false,
  api: GuardedWriteApi = defaultWriteApi(),
): Promise<SaveCanvasResult> {
  if (!canvasNameIsSafe(name)) {
    return { ok: false, kind: 'invalid-name', error: `'${name}' is not a valid canvas name` };
  }
  // Not `{ ...doc, name }`: post-R12 the sidecar no longer carries a name field
  // and the PNG encoder never reads one (see canvas-file-format.ts), so
  // spreading a possibly-different name here was a no-op that only implied
  // the two could safely disagree. `name` is the file stem the caller chose to
  // save under; `doc.name` is expected to already match it (loadCanvasFile
  // sets it from the stem on the way in).
  const { png, sidecar } = await encodeCanvasFiles(doc);
  const pngPath = canvasPngPath(name);
  const sidecarPath = canvasSidecarPath(name);

  const includeSidecar = !sidecarRejected;
  const batch: GuardedWriteFile[] = [{ relPath: pngPath, bytes: png, expectedMtimeMs: expected.pngMtimeMs }];
  if (includeSidecar) {
    batch.push({
      relPath: sidecarPath,
      bytes: new TextEncoder().encode(sidecar),
      expectedMtimeMs: expected.sidecarMtimeMs,
    });
  }

  let result: GuardedWriteResult;
  try {
    result = await api.writeGuarded(dir, batch);
  } catch (e) {
    // The IPC/main call itself threw (e.g. an unsafe path slipped through
    // despite the guard above, or the channel is unavailable). Report rather
    // than let it become an unhandled rejection — `saveCanvasFile` promises a
    // result, not a throw, past the name check (see classic-save.ts's
    // identical `channel-error` variant and its comment).
    return { ok: false, kind: 'channel-error', error: e instanceof Error ? e.message : String(e) };
  }

  if ('conflicts' in result) {
    // Surface 3 of the five in ONE-MESSAGE-FOUR-CAUSES. This asserted the files
    // had CHANGED whatever the guard had actually found, and canvas-save.ts
    // (surface 4) then appended a reopen instruction on top of it. The cause
    // clauses come from core/project/conflict-message.ts now; the reload advice
    // does NOT come from here, because canvas-save.ts owns the canvas-specific
    // reopen sentence and two copies of it would drift.
    return {
      ok: false,
      kind: 'conflict',
      error: saveConflictCauses(result.conflicts, { lead: 'Save aborted;' }),
      conflicts: result.conflicts,
    };
  }

  const pngMtimeMs = mtimeAfterWrite(pngPath, true, expected.pngMtimeMs, result.newMtimes);
  const sidecarMtimeMs = mtimeAfterWrite(sidecarPath, includeSidecar, expected.sidecarMtimeMs, result.newMtimes);
  const sidecarWritten = result.written.includes(sidecarPath);

  if (result.failed) {
    return {
      ok: false,
      kind: 'partial',
      error: `${result.failed.path}: ${result.failed.message}`,
      partial: {
        pngMtimeMs, sidecarMtimeMs, sidecarWritten,
        failed: result.failed,
        unwritten: result.unwritten ?? [],
      },
    };
  }
  return { ok: true, pngMtimeMs, sidecarMtimeMs, sidecarWritten };
}
