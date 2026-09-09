// GuardConflict is DEFINED IN CORE (core/project/save-guard.ts) and re-exported
// through this wire type, rather than redeclared here: the guard is the only thing
// that can produce a cause, and two declarations of the same four-case union are
// two things that drift. Type-only, so nothing about core is pulled into the
// preload bundle. Same posture as ReadOutcome flowing the other way, into
// core/project/adapter.ts.
import type { GuardConflict } from '../core/project/save-guard';

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
  // Renamed from PATH_EXISTS ('file:path-exists') when the answer stopped being a
  // boolean: see PathProbe. The name moved with the meaning so that no caller can
  // keep asking a yes/no question of a channel that has three answers.
  PATH_PROBE: 'file:path-probe',
  // Renamed from LIST_DIR ('file:list-dir') when the answer stopped being a bare
  // array: see DirListing. The name moved WITH the meaning, on PATH_PROBE's
  // precedent above, so that no caller can keep asking "what is in this
  // directory" of a channel whose real answer includes "I could not look".
  DIR_PROBE: 'file:dir-probe',
  // Batch read: one IPC round-trip returns bytes + read-time mtime for many
  // project-relative files. The classic level read fans out ~18 mandatory files
  // plus its guarded-save mtime baseline; issuing those as individual
  // renderer→main invokes is ~36 serial round-trips on the act-load critical
  // path. Batching collapses that to one round-trip (main reads them
  // concurrently), which is the dominant win on any machine where IPC / fs
  // latency is non-trivial. Rel-path-guarded per entry; a path that produced no
  // bytes yields `bytes: null` (no reject, no error-log spam) AND an `outcome`
  // saying which of absent / unreadable / refused it was. That field is the fix
  // for FABRICATED-ENOENT; this comment said only "a missing/unsafe path yields
  // { bytes: null, mtimeMs: null }", which is exactly the conflation two
  // consumers then reported as a nonexistent file. See ReadOutcome below.
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

/**
 * What WRITE_BINARY_FILE did to one path, and WHY IT IS NOT A BOOLEAN.
 *
 * It was a boolean until 2026-09-08, `false` meaning "the path escapes the
 * project and I refused to write it". Ten renderer call sites received that
 * boolean and EIGHT of them dropped it, so a refusal reported as a successful
 * save: the aeon save pushed the path to `written`, cleared the dirty flag and
 * toasted "Project saved" (measured, 4 refused writes in one call). The guard
 * exists because a sprite named `../../.ssh/authorized_keys` wrote outside the
 * project, and the sprite exporter is one of the eight, so the exploit was
 * blocked and reported as a successful export.
 *
 * Two things changed together, and the pair is the fix:
 *
 *  1. THE SHAPE. A refusal now carries its reason, in the same discriminated
 *     form as DeleteOutcome, so main cannot answer a bare `false` that
 *     typechecks and says nothing, and the preload cannot forward the answer
 *     without narrowing `ok`.
 *  2. THE CHANNEL. `unwrapWriteOutcome` converts a refusal into a THROW at the
 *     preload boundary, exactly as `unwrapBinaryRead` converts a missing-file
 *     marker back into an ENOENT. Real fs errors already threw, and every one
 *     of the ten call sites already reports a throw (or, in the one case that
 *     did not, now does). So the DANGEROUS DEFAULT IS GONE: a caller that
 *     ignores the answer is now safe, rather than silently claiming success.
 *
 * Reading it is still allowed, and two callers do. What is no longer possible is
 * for ignoring it to be quiet.
 */
export type WriteOutcome =
  | { ok: true }
  | { ok: false; reason: string };

/**
 * Turn a refused write into a throw. The preload applies this to every
 * WRITE_BINARY_FILE answer (see the WriteOutcome docblock for why the refusal
 * travels as a value and becomes an exception here rather than being rejected in
 * main: ipcMain.handle logs every rejected invoke as a main-process error).
 *
 * The message names the guard that refused. It deliberately does NOT reuse the
 * wording `deleteProjectFile` and `performGuardedWrite` share, so a test
 * asserting on it cannot be satisfied by a different rule's refusal.
 */
export function unwrapWriteOutcome(outcome: WriteOutcome): void {
  if (!outcome.ok) {
    throw new Error(`write refused by the main process: ${outcome.reason}`);
  }
}

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
 *
 * ⚠ `conflicts` CARRIES A CAUSE PER FILE (`GuardConflict`), not a bare path. It was
 * `string[]` until 2026-09-08 and that is what ONE-MESSAGE-FOUR-CAUSES was: the
 * guard computes 'changed' / 'deleted' / 'appeared' / 'unknown' and used to throw
 * the answer away, so five author-facing surfaces told everyone their files had
 * changed and to reload. Reloading is the fix for one of the four. Read
 * core/project/conflict-message.ts before writing any sentence from this list; it
 * owns the wording and the enumeration of the surfaces.
 */
export type GuardedWriteResult =
  | { conflicts: GuardConflict[] }
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
 * How a batch read of one file turned out. FOUR ANSWERS, NOT ONE, and the reason
 * is the same one PathPresence gives one type down: "I could not look", "I looked
 * and there is nothing" and "it is there and I could not read it" are three
 * different facts, and a single null told all of them.
 *
 * WHAT THE SINGLE NULL COST (FABRICATED-ENOENT, found by the lens sweep and fixed
 * 2026-09-08). `readManyFiles` folded an ENOENT, an EACCES, an EISDIR, an EIO and
 * a REFUSED escaping path into `bytes: null`. Two consumers of that null then threw
 * a message they had typed out by hand:
 *
 *     throw new Error(`ENOENT: no such file or directory, open '${p}'`)
 *
 * (core/level-classic/s1-io.ts's `readBytes`, and renderer/state/classicObjectArtStore's
 * `readOne`). So a permissions failure on a level's own tile file, and a path Aurora
 * had REFUSED to look at, both told the author their file did not exist. Both sites
 * had copied that sentence from `unwrapBinaryRead` below, where it is CORRECT because
 * ipc-handlers.ts gates it on `e?.code === 'ENOENT'`; the copies dropped the gate.
 *
 * ⚠ AND WHY THE SUITE WAS GREEN OVER IT: `readMany` is OPTIONAL on FileAccess, so
 * every in-memory test fake fell through to per-file `read`, which PROPAGATES the
 * real error. The fabricated string existed only on the path production takes. A
 * fake that behaves better than production is not a test of production.
 *
 * `outcome` is REQUIRED so a producer has to state which of the four it means; the
 * dangerous default (absence) is no longer what a forgetful producer falls into.
 * `reason` is REQUIRED too, null when there is nothing to say, on PathProbe's rule.
 *
 *   'read'       bytes is non-null. reason null.
 *   'absent'     ENOENT/ENOTDIR: nothing at the path. reason null. This is the ONLY
 *                outcome for which the ENOENT sentence is a true statement.
 *   'unreadable' something IS (or may be) there and the read failed: EACCES, EISDIR,
 *                ELOOP, EIO, EMFILE. reason carries the errno message.
 *   'refused'    the path escaped the project root, so Aurora DECLINED TO LOOK. That
 *                is not a statement about the filesystem at all. reason carries the
 *                refusal.
 */
export type ReadOutcome = 'read' | 'absent' | 'unreadable' | 'refused';

/** The three `ReadOutcome`s that carry no bytes. A consumer building an error for a
 *  null read narrows to this, which is what stops it from writing one sentence for
 *  all of them. */
export type ReadFailureOutcome = Exclude<ReadOutcome, 'read'>;

/**
 * One entry of a READ_MANY response, aligned by index to the requested paths.
 * `bytes` survives structured-clone as a typed array. `mtimeMs` is the read-time
 * fs.stat mtime (the guarded-save baseline).
 *
 * A UNION DISCRIMINATED ON `outcome`, not an interface with a nullable `bytes`,
 * so that `if (e.outcome !== 'read')` both (a) hands the failure branch a
 * `ReadFailureOutcome` the message builder will accept and (b) leaves `bytes`
 * non-null on the other side. The old shape let a consumer test `bytes === null`
 * and then say whatever it liked about why; this one makes the WHY the thing you
 * have to look at to get at the bytes.
 */
export type ReadManyEntry =
  | { relPath: string; bytes: Uint8Array; mtimeMs: number; outcome: 'read'; reason: null }
  | {
      relPath: string; bytes: null; mtimeMs: null;
      outcome: ReadFailureOutcome; reason: string | null;
    };

/**
 * What a filesystem presence probe found. THREE ANSWERS, NOT TWO.
 *
 * 'unknown' is the one that had to be added. The probe behind this used to be
 * `pathExists(): Promise<boolean>`, whose `catch { return false }` answered "not
 * there" for an EACCES on a parent directory, for an ELOOP, for an EIO from a
 * volume that dropped out - its own docblock named permissions as a cause. One
 * layer up, core/project/aeon/load.ts's markUnreadable asks exactly this question
 * to tell "the file is simply absent" from "the file is there and I could not
 * read it", and the second answer is what stops the save path writing an empty
 * placeholder over the user's data. For any failure that takes the read and the
 * stat down together, the probe said "absent", markUnreadable returned silently,
 * and a section's objects.json was replaced by `[]`. Measured, before the fix:
 * `PROBE unreadable= undefined  notices= 0  after= []`.
 *
 * Same rule as SidecarRead (core/project/mapping.ts) and RecentsRead
 * (shared/recents.ts): "I could not look" and "I looked and there is nothing" must
 * not be the same value.
 */
export type PathPresence = 'present' | 'absent' | 'unknown';

/** A presence answer plus, for 'unknown', why the probe could not tell. `reason`
 *  is REQUIRED (null when there is nothing to say) so a producer states it. */
export interface PathProbe {
  presence: PathPresence;
  reason: string | null;
}

/**
 * What a directory listing found. FOUR ANSWERS, NOT ONE ARRAY.
 *
 * ═══ WHAT THE BARE ARRAY COST (LISTING-SWALLOWS-FAILURE, lens sweep, fixed
 * 2026-09-08) ══════════════════════════════════════════════════════════════
 *
 * `listDir` was `Promise<string[]>` and its whole failure handling was
 * `catch { return [] }`, so an EMPTY DIRECTORY, a MISSING one, one it lacked
 * permission to read, and a path that ESCAPED the project root were one value.
 * This is PathProbe's defect one level up, at the listing instead of the single
 * path, and the same sentence applies: "I could not look" and "I looked and
 * there is nothing" must not be the same answer.
 *
 * Two consumers turned that `[]` into silence about the author's own files. Both
 * effects libraries (core/formats/effects/{scene,preset}.ts) treat an absent
 * directory as the ordinary "no scenes / no presets yet" and say NOTHING about
 * it — correctly, by contract — so anything that degraded to "absent" degraded
 * to silence: an unreadable `editor/effects/` opened as a project with no
 * effects at all, and the author was not told. They also each carried
 * `try { present = await fa.exists(dir); } catch { present = false; }`, which
 * threw away the third answer PathProbe had just been added to give — and
 * fixing that alone bought nothing while the listing beside it still swallowed.
 * Both halves are closed together.
 *
 * `outcome` is REQUIRED so a producer must state which of the four it means, and
 * the dangerous default (an empty listing, i.e. absence) is no longer what a
 * forgetful one falls into. `entries` is null on every failure, so a consumer
 * cannot iterate its way past the question.
 *
 *   'listed'     entries is non-null (possibly EMPTY — a real empty directory).
 *   'absent'     ENOENT/ENOTDIR: no directory at the path. reason null.
 *   'unreadable' something IS (or may be) there and readdir failed: EACCES,
 *                ELOOP, EIO, EMFILE. reason carries the errno message.
 *   'refused'    the path escaped the project root, so Aurora DECLINED TO LOOK.
 *                Not a statement about the filesystem. reason carries the refusal.
 */
export type DirOutcome = 'listed' | 'absent' | 'unreadable' | 'refused';

/** The three `DirOutcome`s that carry no entries — the ones a consumer must not
 *  collapse into "the directory is empty". */
export type DirFailureOutcome = Exclude<DirOutcome, 'listed'>;

export type DirListing =
  | { outcome: 'listed'; entries: string[]; reason: null }
  | { outcome: DirFailureOutcome; entries: null; reason: string | null };

export type { GuardConflict } from '../core/project/save-guard';

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
