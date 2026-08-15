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
// THE NAME IS PART OF A PATH, so it is validated here and nowhere else: a canvas
// called `../../s1.asm` must never become a write target. The predicate is
// deliberately stricter than rel-path safety (no dots, no slashes, no spaces) —
// a canvas name also has to survive being a tab id and a file stem.

import type { CanvasDoc } from '../../core/art/canvas-doc';
import { encodeCanvasFiles, decodeCanvasFiles } from '../../core/art/canvas-file-format';
import type { CanvasSource } from './canvasStore';

export const CANVAS_DIR = '.aurora/canvas';

const SAFE_NAME = /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/;

export function canvasNameIsSafe(name: string): boolean {
  return SAFE_NAME.test(name);
}

export function canvasPngPath(name: string): string { return `${CANVAS_DIR}/${name}.png`; }
export function canvasSidecarPath(name: string): string { return `${CANVAS_DIR}/${name}.canvas.json`; }

/** The canvases in a project, by name. Tolerant: a missing dir lists as empty
 *  (window.api.listDir already resolves [] rather than rejecting). */
export async function listCanvasNames(dir: string): Promise<string[]> {
  const entries = await window.api.listDir(dir, CANVAS_DIR);
  return entries
    .filter((e) => e.toLowerCase().endsWith('.png'))
    .map((e) => e.slice(0, -4))
    .filter(canvasNameIsSafe);
}

// R12: `warnings` and `sidecarRejected` come straight through from
// decodeCanvasFiles. A load that could not read the sidecar has to say so, and
// the SAVE has to know it, because the mtime guard cannot help here — the file
// did not change on disk, we just could not parse it.
export interface LoadedCanvas {
  doc: CanvasDoc;
  source: CanvasSource;
  warnings: string[];
  sidecarRejected: boolean;
}

export async function loadCanvasFile(dir: string, name: string): Promise<LoadedCanvas> {
  if (!canvasNameIsSafe(name)) throw new Error(`'${name}' is not a valid canvas name`);
  const pngPath = canvasPngPath(name);
  const sidecarPath = canvasSidecarPath(name);

  const png = new Uint8Array(await window.api.readBinaryFile(dir, pngPath));
  // The sidecar is OPTIONAL — that is what opening a plain Aseprite export looks
  // like — so a miss is not an error.
  let sidecarJson: string | null = null;
  try {
    sidecarJson = new TextDecoder().decode(new Uint8Array(await window.api.readBinaryFile(dir, sidecarPath)));
  } catch { sidecarJson = null; }

  const loaded = await decodeCanvasFiles(png, sidecarJson);
  const [pngMtimeMs, sidecarMtimeMs] = await Promise.all([
    window.api.fileMtime(dir, pngPath),
    window.api.fileMtime(dir, sidecarPath),
  ]);
  return {
    // The FILE STEM is the canvas's name — the sidecar no longer carries one
    // (R12), because a field only ever written as a copy of the filename
    // becomes a lie the moment the pair is renamed.
    doc: { ...loaded.doc, name },
    source: { dir, pngPath, sidecarPath, pngMtimeMs, sidecarMtimeMs },
    warnings: loaded.warnings,
    sidecarRejected: loaded.sidecarRejected,
  };
}

export type SaveCanvasResult =
  | { ok: true; pngMtimeMs: number | null; sidecarMtimeMs: number | null }
  | { ok: false; error: string };

/**
 * Write both files as ONE guarded batch. One batch because the conflict check is
 * per batch: a PNG that landed while its sidecar was refused would leave art
 * whose metadata describes the previous version — and the sidecar is where the
 * palette lives, so that is a silently recoloured picture.
 */
export async function saveCanvasFile(
  dir: string, name: string, doc: CanvasDoc,
  expected: { pngMtimeMs: number | null; sidecarMtimeMs: number | null },
  /** R12: true when the load could not parse the sidecar. The mtime guard does
   *  NOT cover this — the file never changed on disk — so the batch below
   *  deliberately omits the sidecar rather than replacing metadata Aurora
   *  admits it did not understand. Do not destroy what you could not read. */
  sidecarRejected = false,
): Promise<SaveCanvasResult> {
  if (!canvasNameIsSafe(name)) return { ok: false, error: `'${name}' is not a valid canvas name` };
  const { png, sidecar } = await encodeCanvasFiles({ ...doc, name });
  const pngPath = canvasPngPath(name);
  const sidecarPath = canvasSidecarPath(name);

  const batch = [{ relPath: pngPath, bytes: png, expectedMtimeMs: expected.pngMtimeMs }];
  if (!sidecarRejected) {
    batch.push({
      relPath: sidecarPath,
      bytes: new TextEncoder().encode(sidecar),
      expectedMtimeMs: expected.sidecarMtimeMs,
    });
  }
  const result = await window.api.writeGuarded(dir, batch);

  if ('conflicts' in result) {
    return {
      ok: false,
      error: `${result.conflicts.join(', ')} changed on disk since it was opened — nothing was written`,
    };
  }
  if (result.failed) {
    return { ok: false, error: `${result.failed.path}: ${result.failed.message}` };
  }
  return {
    ok: true,
    pngMtimeMs: result.newMtimes[pngPath] ?? null,
    sidecarMtimeMs: result.newMtimes[sidecarPath] ?? null,
  };
}
