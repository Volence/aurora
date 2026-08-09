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
 * Result of a guarded write: either the conflicting relPaths (nothing written),
 * or the written relPaths plus each one's fresh on-disk mtime so the renderer
 * can refresh its captured baseline without re-reading.
 */
export type GuardedWriteResult =
  | { conflicts: string[] }
  | { written: string[]; newMtimes: Record<string, number> };

/**
 * Marker the read-binary IPC handler RESOLVES with for a missing file instead
 * of rejecting: ipcMain.handle logs every rejected invoke in the main process
 * ("Error occurred in handler for 'file:read-binary'"), and the renderer's
 * optional-file probes (section sidecars, bg library, sprite bindings) would
 * bury real errors in expected-miss spam. The preload unwraps the marker back
 * into a thrown ENOENT so renderer callers keep their try/catch semantics.
 */
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
