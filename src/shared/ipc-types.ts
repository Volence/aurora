export const IPC_CHANNELS = {
  READ_BINARY_FILE: 'file:read-binary',
  OPEN_PROJECT: 'project:open',
  SELECT_DIRECTORY: 'dialog:select-directory',
  GET_RECENT_PROJECTS: 'projects:get-recent',
  ADD_RECENT_PROJECT: 'projects:add-recent',
  REMOVE_RECENT_PROJECT: 'projects:remove-recent',
  SAVE_FILE: 'file:save',
  WRITE_BINARY_FILE: 'file:write-binary',
  SELECT_FILES: 'dialog:select-files',
  LIST_PROJECT_FILES: 'file:list-project-files',
  // Directory-level probes backing the classic-project FileAccess bridge (Task
  // 9). `read` reuses READ_BINARY_FILE; these cover exists/list.
  PATH_EXISTS: 'file:path-exists',
  LIST_DIR: 'file:list-dir',
  // Batch read: one IPC round-trip returns bytes + read-time mtime for many
  // project-relative files. The classic level read fans out ~18 mandatory files
  // plus its guarded-save mtime baseline; issuing those as individual
  // renderer→main invokes is ~36 serial round-trips on the act-load critical
  // path. Batching collapses that to one round-trip (main reads them
  // concurrently), which is the dominant win on any machine where IPC / fs
  // latency is non-trivial. Rel-path-guarded per entry; a missing/unsafe path
  // yields { bytes: null, mtimeMs: null } (no reject, no error-log spam).
  READ_MANY: 'file:read-many',
  // Classic guarded-save channels (Task 10). MTIME captures the read-time
  // baseline; WRITE_GUARDED performs the atomic, conflict-checked multi-file
  // write. Both are fully rel-path-guarded on the main side (new channels — no
  // legacy absolute-path exception).
  FILE_MTIME: 'file:mtime',
  WRITE_GUARDED: 'file:write-guarded',
} as const;

export type IpcChannels = typeof IPC_CHANNELS;

export interface RecentProject {
  path: string;
  name: string;
  lastOpened: number; // timestamp
}

/**
 * One file in a guarded write (Task 10). `expectedMtimeMs` is the mtime captured
 * when the file was last read/written (null when it did not exist at read); the
 * main side refuses the whole batch if the on-disk mtime disagrees. `bytes`
 * survives structured-clone across IPC as a typed array.
 */
export interface GuardedWriteFile {
  relPath: string;
  bytes: Uint8Array;
  expectedMtimeMs: number | null;
}

/**
 * Result of a guarded write. Two shapes:
 *  • `{ conflicts }` — the conflict check failed; NOTHING was written.
 *  • `{ written, newMtimes, failed?, unwritten? }` — the conflict check passed
 *    and writing began. `written`/`newMtimes` cover the files that landed. If an
 *    fs error interrupted the batch, `failed` names the file that errored and
 *    `unwritten` lists the files after it that were never attempted — the batch
 *    is PARTIAL (per-file rename atomicity holds; batch atomicity does not).
 *    On a fully successful batch `failed`/`unwritten` are absent.
 */
export type GuardedWriteResult =
  | { conflicts: string[] }
  | {
      written: string[];
      newMtimes: Record<string, number>;
      failed?: { path: string; message: string };
      unwritten?: string[];
    };

/**
 * Marker the read-binary IPC handler RESOLVES with for a missing file instead
 * of rejecting: ipcMain.handle logs every rejected invoke in the main process
 * ("Error occurred in handler for 'file:read-binary'"), and the renderer's
 * optional-file probes (section sidecars, bg library, sprite bindings) would
 * bury real errors in expected-miss spam. The preload unwraps the marker back
 * into a thrown ENOENT so renderer callers keep their try/catch semantics.
 */
/**
 * One entry of a READ_MANY response, aligned by index to the requested paths.
 * `bytes` survives structured-clone as a typed array; null means the file was
 * missing or its path was unsafe. `mtimeMs` is the read-time fs.stat mtime (the
 * guarded-save baseline), null when unavailable.
 */
export interface ReadManyEntry {
  relPath: string;
  bytes: Uint8Array | null;
  mtimeMs: number | null;
}

export interface MissingFileMarker { __missing: string }

export function isMissingFileMarker(v: unknown): v is MissingFileMarker {
  return typeof v === 'object' && v !== null && !ArrayBuffer.isView(v)
    && typeof (v as MissingFileMarker).__missing === 'string';
}

export function unwrapBinaryRead<T>(result: T | MissingFileMarker): T {
  if (isMissingFileMarker(result)) {
    throw new Error(`ENOENT: no such file or directory, open '${result.__missing}'`);
  }
  return result;
}
