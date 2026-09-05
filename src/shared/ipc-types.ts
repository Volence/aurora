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
  // ⚠ THE ONLY CHANNEL IN AURORA THAT DELETES A FILE, and it is deliberately
  // the narrowest one here: one project-relative path per call, rel-path-guarded
  // with NO legacy absolute-path exception, no recursion, no directories. It
  // exists for `state/aeon-save.ts`'s removal step (a document the author
  // deleted in the panel must leave the disk, or their deletion is silently
  // undone on the next open) and for nothing else. WHICH paths may be named is
  // not this channel's business and must never become it — that judgement lives
  // in `core/project/aeon/save.ts`'s `removalsFor`, which derives the set from
  // what the editor LOADED rather than from what is on disk.
  DELETE_FILE: 'file:delete',
  // Env-guarded paint instrumentation (AURORA_PERF=1). The renderer posts one
  // summary line per act load; main prints it to the launch terminal so we get
  // real paint numbers off the user's machine without a CDP session. Fire-and-
  // forget (send, not invoke) — never on a hot path, no-op when perf is off.
  PERF_LOG: 'perf:log',
  // The window-close handshake. Main intercepts `close`, asks the renderer
  // (which is the only side that knows what is unsaved), and closes only on a
  // true answer. Two one-way channels rather than an invoke, because the
  // question travels main → renderer and `ipcMain.handle` only goes the other
  // way.
  CLOSE_REQUEST: 'app:close-request',
  CLOSE_RESPONSE: 'app:close-response',
  // The OUTBOUND Aether link (the playtest loop). The client itself lives in
  // main — it owns a unix socket, which the renderer has no business holding —
  // and the renderer drives it over these. STATUS is a main→renderer push, the
  // same shape as CLOSE_REQUEST and for the same reason: the connection changes
  // state on its own (the emulator can exit), so the renderer cannot be the one
  // asking.
  AETHER_CONNECT: 'aether:connect',
  AETHER_DISCONNECT: 'aether:disconnect',
  AETHER_STATUS: 'aether:status',
  AETHER_PUSH_PALETTE: 'aether:push-palette',
  AETHER_WARP: 'aether:warp',
  AETHER_BUILD: 'aether:build',
  /** Main→renderer stream of build output, so the panel fills as it runs. */
  AETHER_BUILD_OUTPUT: 'aether:build-output',
} as const;

export interface AetherBuildResult {
  ok: boolean;
  exitCode: number | null;
  output: string[];
  reloaded: boolean;
  reloadError?: string;
  missingEnv: string[];
  command: string;
  /** Whether the DEBUG flavour was built — decides which ROM file was written. */
  debugBuild?: boolean;
  /** Where the player actually LANDED after the reload (engine-clamped), if the position survived. */
  restoredTo?: { x: number; y: number };
  /** How: `boot-override` (first painted frame is the destination) or the `warp` fallback. */
  restoredVia?: 'boot-override' | 'warp';
  /** FAST shape — verification lanes skipped, NOT a ship artifact. */
  fast?: boolean;
  /** Milliseconds per phase, so a slow loop can be attributed rather than guessed at. */
  timings?: { build: number; reload: number; restore: number };
  /**
   * Aether methods the connected server does NOT serve, which this run needed.
   * Present means a capability gap, not a broken build — different problem,
   * different fix, so it never hides inside `reloadError`.
   */
  unservedMethods?: string[];
}

export interface AetherWarpResult {
  warped: boolean;
  gate?: string;
  error?: string;
  /** Where the player ACTUALLY IS — never the ask. */
  landed?: { x: number; y: number };
  /**
   * CLASSIC: where the player was BEFORE the poke.
   *
   * S1 has no mailbox, so the classic route pokes `v_player`, lets the game
   * run, and asks again. `landed === from` is the signature of a poke that was
   * silently discarded (S1's level init re-seeds Sonic from the start-position
   * table while the act loads), and the UI needs both halves to say so — "it
   * did not take" without "he is still at (80, 1084)" is half an answer.
   *
   * Absent on the aeon route: the engine publishes its own clamped
   * destination there, so nothing has to be compared against a before-shot.
   */
  from?: { x: number; y: number };
  clamped?: boolean;
  /**
   * The method the server does not serve, when THAT is why the warp did not
   * happen. Distinguishes a capability gap from a release ROM with no mailbox.
   */
  unservedMethod?: string;
}

/** What the renderer knows about the outbound link. */
export interface AetherStatusPayload {
  status: 'disconnected' | 'connecting' | 'connected';
  serverName?: string;
  serverVersion?: string;
  socketPath?: string;
  /** Set when the last connect attempt failed — shown, not swallowed. */
  error?: string;
  /** True when a palette symbol family resolved, i.e. live palette can push. */
  palette?: boolean;
  /**
   * WHICH family the running ROM's listing carries: aeon's Pal_Base pair or
   * classic's v_palette_line_1..4. The UI gates per open project on this, so a
   * classic panel does not light up green against an aeon ROM (or vice versa).
   */
  paletteKind?: 'aeon' | 'classic';
  /**
   * WHICH IMPLEMENTATION ANSWERED — protocol.md §2.1's registry value
   * (`oracle-rs` | `oracle-cpp`), straight off the handshake.
   *
   * ⚠ NOT `serverName`, which is above and is a *deployment* label §2.1 forbids
   * discriminating on; the Rust core still reports `oracle-next` there. The
   * socket chain selects a path and not a server, so this is the only field
   * that answers "which emulator am I talking to".
   */
  implementation?: string;
  /** Provenance only — §2.1 build identity, rendered. NEVER compared for equality. */
  serverBuild?: string;
  /** Non-fatal complaint from the identity check (unknown lineage, missing build). */
  identityWarning?: string;
  /**
   * HOW MANY METHODS. A different question from `implementation`: an installed
   * binary can advertise a different count from the source tree it was built
   * from. Recorded, never pinned.
   */
  methodCount?: number;
  /** The advertised list itself, exactly as it arrived. */
  servedMethods?: string[];
  /**
   * Set when the palette probe was blocked by the SERVER rather than the ROM.
   * Without it, "no palette symbols" is indistinguishable from "never asked".
   */
  paletteUnservedMethod?: string;
}

export type IpcChannels = typeof IPC_CHANNELS;

/**
 * What DELETE_FILE did to one path.
 *
 * `{ ok: true, deleted: false }` is a SUCCESS and means the file was already
 * absent — the caller's desired end state, reached by somebody else. Only
 * `{ ok: false }` is a failure, and it carries the fs message so the caller can
 * keep that path in its ledger and retry on the next save.
 */
export type DeleteOutcome =
  | { ok: true; deleted: boolean }
  | { ok: false; reason: string };

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
