/**
 * Types for the parts of `harness-guard.mjs` that a `.ts` test drives directly.
 *
 * ⚠ THIS IS A SIGNATURE, NOT A SECOND SOURCE OF TRUTH — written the same way,
 * and for the same reason, as `aeon-shipped-preset.d.mts` beside it and
 * `test/support/sibling-root.d.mts`: `tsconfig.json` deliberately keeps
 * `allowJs` off, so tsc needs the signature stated rather than inferred. It
 * states no path, no directory name and no count; there is nothing here that
 * can disagree with the implementation about an ANSWER, only about a shape, and
 * a wrong shape is a tsc error in the caller rather than a silent pass.
 *
 * ⚠ AND IT IS DELIBERATELY PARTIAL. It declares what a test needs to call in
 * process. The launcher half (`spawnGuarded`, `killTree`, the discovery
 * snapshot, the reap) is NOT here: those are for `.mjs` harnesses, they spawn
 * real Electrons, and giving them a signature would invite a `.ts` caller to
 * use them somewhere `npm test` can reach — which is the one thing this repo's
 * suite must never do. `check-harness-guards.mjs`'s REQUIRED_EXPORTS remains
 * the list that governs the module's full surface.
 */

/** `{ sites, files, dir }`, or `{ sites: null, files: null, dir, why }` when
 *  the directory could not be read. `sites` counts occurrences and `files`
 *  counts files holding at least one: two different units, deliberately both
 *  returned, because conflating them is half of how the old census drifted. */
export interface ClearCallSiteCensus {
  sites: number | null;
  files: number | null;
  dir: string;
  why?: string;
}

/** Every source file under `dir` is read and its comments stripped before the
 *  call sites in it are counted. Defaults to this repo's `scratchpad/`. */
export declare function clearCallSiteCensus(dir?: string): ClearCallSiteCensus;

/** The one sentence a refusal pastes in, with its units and method named. */
export declare function describeClearCensus(census?: ClearCallSiteCensus): string;

/** Line and block comments removed, so prose ABOUT a call is not counted AS
 *  one. Crude by design; its blind spot is a call inside a string literal. */
export declare function stripCommentsForCensus(src: string): string;

/** Insert `--user-data-dir=<dir>` immediately after the Electron binary.
 *  Returns `args` UNCHANGED BY IDENTITY when there is no Electron binary in the
 *  command, or when the caller already passed a `--user-data-dir` of its own. */
export declare function pinUserDataDir(cmd: string, args: string[], dir?: string): string[];

/** Delete this run's profile, unless it was named by the environment or the
 *  operator asked to keep it. Every input defaults to the real module state;
 *  they are injectable so all four branches are reachable from a test. */
export declare function cleanupProfile(opts?: {
  used?: boolean;
  derived?: boolean;
  dir?: string;
  keep?: boolean;
}): string;

/** The profile this run owns — derived once, at module load. */
export declare const RUN_PROFILE_DIR: string;

/** True when this process DERIVED its profile rather than being handed one. */
export declare const RUN_PROFILE_DERIVED: boolean;

/** Chromium's switch, spelled once. */
export declare const USER_DATA_DIR_SWITCH: string;

/** The environment variable that hands a process a profile to share. */
export declare const PROFILE_DIR_ENV: string;

/** Where every derived harness profile is rooted. */
export declare const PROFILE_ROOT: string;

/** Has any launch in this process been pinned to `RUN_PROFILE_DIR`? */
export declare function profileInUse(): boolean;
