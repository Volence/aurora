// classic-save — the renderer save path for a classic (disasm) project (Task 10,
// spec §2.6). Sibling to classic-bridge.ts, following Task 9's structure: a pure,
// injectable pipe (`saveClassicWriteResult`) plus a store-driven orchestrator
// (`saveClassicProject`) that Ctrl+S / the app-bar Save call.
//
// SOURCE-OF-TRUTH NOTE (carried Task-7 review): the buffers to persist come from
// `WriteResult.files` ({path, bytes}). `WriteResult.written` is display metadata
// only and is NEVER read for bytes here. `WriteResult.fileMtimes` supplies each
// file's expected (read-time) mtime for the guarded write's conflict check.

import type { GuardedWriteFile, GuardedWriteResult } from '../../shared/ipc-types';
import type { WriteResult, ProjectHandle, ZoneActRef, DirtyDomains, LevelDoc } from '../../core/project/adapter';
import { useClassicProjectStore } from './classicProjectStore';
import { useToastStore } from './toastStore';

/** The narrow guarded-write capability the save pipe needs (window.api by default). */
export interface GuardedWriteApi {
  writeGuarded(basePath: string, files: GuardedWriteFile[]): Promise<GuardedWriteResult>;
}

export type SaveClassicResult =
  | { kind: 'nothing' }
  | { kind: 'saved'; written: string[]; newMtimes: Record<string, number> }
  | {
      // The conflict check passed and writing began, but an fs error interrupted
      // the batch: `written`/`newMtimes` did land; `failed`/`unwritten` did not.
      kind: 'partial';
      written: string[];
      newMtimes: Record<string, number>;
      failed: { path: string; message: string };
      unwritten: string[];
    }
  | { kind: 'conflict'; conflicts: string[] }
  | { kind: 'error'; errors: { path: string; message: string }[] } // pre-write self-check
  | { kind: 'channel-error'; message: string }; // the IPC call itself rejected

/**
 * Persist ONE act's WriteResult through the guarded channel. Pure w.r.t. the
 * store (takes `dir` + `result` + `api`), so it's unit-tested with a fake api.
 * Never rejects — every failure mode is a returned variant:
 *
 *  • self-check errors present            → { error } (nothing sent to disk)
 *  • no files to write                    → { nothing }
 *  • the channel call rejected            → { channel-error } (unknown outcome)
 *  • main reports a conflict              → { conflict } (main wrote nothing)
 *  • an fs error hit mid-batch            → { partial } (some files landed)
 *  • success                              → { saved, written, newMtimes }
 */
export async function saveClassicWriteResult(
  dir: string,
  result: WriteResult,
  api: GuardedWriteApi,
): Promise<SaveClassicResult> {
  // A self-check failure (encoder produced un-decodable bytes) must not reach
  // disk — surface it rather than writing a partial/corrupt level.
  if (result.errors.length > 0) return { kind: 'error', errors: result.errors };

  const files = result.files ?? []; // SOURCE OF TRUTH — never result.written
  if (files.length === 0) return { kind: 'nothing' };

  const expected = result.fileMtimes ?? {};
  const payload: GuardedWriteFile[] = files.map((f) => ({
    relPath: f.path,
    bytes: f.bytes,
    // No captured mtime → treat as a file that did not exist at read (null),
    // so main creates it (or conflicts if it turns out to already exist).
    expectedMtimeMs: expected[f.path] ?? null,
  }));

  let res: GuardedWriteResult;
  try {
    res = await api.writeGuarded(dir, payload);
  } catch (e) {
    // The IPC/main call itself threw (e.g. an unsafe path slipped through, or the
    // channel is unavailable). Report rather than letting it become an unhandled
    // rejection — the disk state is unknown, so we refresh no mtimes.
    return { kind: 'channel-error', message: e instanceof Error ? e.message : String(e) };
  }
  if ('conflicts' in res) return { kind: 'conflict', conflicts: res.conflicts };
  if (res.failed) {
    return {
      kind: 'partial',
      written: res.written,
      newMtimes: res.newMtimes,
      failed: res.failed,
      unwritten: res.unwritten ?? [],
    };
  }
  return { kind: 'saved', written: res.written, newMtimes: res.newMtimes };
}

/** A dirty act to save: which ref, its current doc, and which domains changed. */
export interface DirtyLevel {
  ref: ZoneActRef;
  doc: LevelDoc;
  dirty: DirtyDomains;
}

/**
 * Collect the acts with unsaved changes. There is NO classic editing store yet
 * (Tasks 12/13 build it and the Save UX on top of this plumbing), so today this
 * always returns [] — Ctrl+S finds zero dirty domains and no-ops. The pipe below
 * is nonetheless wired and tested end-to-end so those tasks can drop the editing
 * store straight in.
 */
export function collectDirtyLevels(_handle: ProjectHandle): DirtyLevel[] {
  return [];
}

export type SaveClassicProjectResult =
  | { kind: 'nothing' }
  | { kind: 'saved'; count: number }
  | { kind: 'conflict'; conflicts: string[] }
  | { kind: 'partial'; failed: { path: string; message: string }; unwritten: string[] }
  | { kind: 'error' };

/**
 * Save every dirty act of the open classic project through the guarded channel,
 * refreshing captured mtimes on success and posting a notice on any failure.
 * Returns an aggregate outcome (mainly for tests / the caller's Ctrl+S).
 *
 * CROSS-ACT SEMANTICS: each act is its own guarded batch (one levels.write +
 * one writeGuarded call). Acts are processed in order and committed as they go;
 * on the FIRST act that conflicts / errors / partially fails we refresh whatever
 * did land, post a notice, and RETURN — earlier acts are already committed and
 * stay committed (there is no cross-act rollback). This is acceptable because
 * each act's files are disjoint; a later act's failure never corrupts an
 * earlier, fully-written one.
 */
export async function saveClassicProject(
  api: GuardedWriteApi = defaultApi(),
  // The dirty-level collector is injectable so the per-act loop is testable
  // before the editing store lands (Tasks 12/13 will pass a store-backed one).
  collect: (handle: ProjectHandle) => DirtyLevel[] = collectDirtyLevels,
): Promise<SaveClassicProjectResult> {
  const st = useClassicProjectStore.getState();
  if (st.status !== 'open' || !st.handle || !st.dir || !st.handle.levels) return { kind: 'nothing' };
  const dir = st.dir;
  const levels = st.handle.levels;

  const dirtyLevels = collect(st.handle);
  if (dirtyLevels.length === 0) return { kind: 'nothing' };

  let saved = 0;
  for (const dl of dirtyLevels) {
    const result = await levels.write(dl.ref, dl.doc, dl.dirty);
    const outcome = await saveClassicWriteResult(dir, result, api);
    switch (outcome.kind) {
      case 'saved':
        // Refresh the cached read-time mtimes so the next save expects the new
        // on-disk values (no re-read needed).
        levels.updateMtimes?.(dl.ref, outcome.newMtimes);
        saved++;
        break;
      case 'partial':
        // Some files landed — refresh their baseline before stopping so a retry
        // doesn't spuriously conflict on the already-written ones.
        levels.updateMtimes?.(dl.ref, outcome.newMtimes);
        useToastStore.getState().addToast(
          `Save incomplete — write failed at ${outcome.failed.path}; ` +
            `${outcome.written.length} file(s) saved, ${outcome.unwritten.length + 1} not. ` +
            `Fix the error and save again.`,
          'error',
        );
        return { kind: 'partial', failed: outcome.failed, unwritten: outcome.unwritten };
      case 'conflict':
        notifyConflict(outcome.conflicts);
        return { kind: 'conflict', conflicts: outcome.conflicts };
      case 'error':
        useToastStore.getState().addToast(
          `Save blocked: ${outcome.errors.length} file(s) failed self-check`,
          'error',
        );
        return { kind: 'error' };
      case 'channel-error':
        useToastStore.getState().addToast(`Save failed: ${outcome.message}`, 'error');
        return { kind: 'error' };
      case 'nothing':
        break;
    }
  }
  if (saved > 0) useToastStore.getState().addToast(`Saved ${saved} level(s)`, 'success');
  return saved > 0 ? { kind: 'saved', count: saved } : { kind: 'nothing' };
}

/**
 * Conflict notice (spec §2.6: list the files, no merge UI). Uses the toast
 * system; the message names the files and tells the user how to recover.
 */
export function notifyConflict(conflicts: string[]): void {
  const list = conflicts.join(', ');
  useToastStore.getState().addToast(
    `Save aborted — ${conflicts.length} file(s) changed on disk since open: ${list}. ` +
      `Reload project to pick up external changes.`,
    'error',
  );
}

function defaultApi(): GuardedWriteApi {
  return { writeGuarded: (dir, files) => window.api.writeGuarded(dir, files) };
}
