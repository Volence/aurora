/**
 * Types for `fixture-provenance.mjs`.
 *
 * ⚠ THIS IS A SIGNATURE, NOT A SECOND SOURCE OF TRUTH. It declares the shape of
 * the exports and states no path, no git invocation and no `tracks` sentence --
 * there is nothing here that can disagree with the implementation about WHICH
 * revision a run read, which is the only drift this module exists to prevent.
 * It is here because `tsconfig.json` deliberately keeps `allowJs` off, so tsc
 * needs the signature stated rather than inferred (the same reason
 * `test/support/sibling-root.d.mts` exists, and written the same way).
 */

export declare class FixtureProvenanceError extends Error {}

export declare const READ_MODES: {
  readonly COMMITTED: 'committed';
  readonly WORKTREE: 'worktree';
};

export type ReadMode = 'committed' | 'worktree';

/** One separately readable claim. `tracks` says what the value follows. */
export interface ProvenanceClaim {
  label: string;
  value: string;
  /** What this value follows, and what it may not be read as saying. */
  tracks: string;
  /** ISO timestamp. Claims do not share a clock, so each carries its own. */
  at: string;
}

export interface UnknownClaim {
  claim: string;
  why: string;
  /** The named option that would accept this gap. */
  allowedBy: string;
  allowed: boolean;
}

export interface WorktreeState {
  dirty: boolean;
  changed: number;
  at: string;
}

export interface FixtureProvenance {
  peer: string;
  dir: string;
  dirSource: string;
  mode: ReadMode;
  /** The ref the caller asked for, in committed mode; null in worktree mode. */
  ref: string | null;
  /** Resolved 40-hex commit, or null when the directory carries no history. */
  revision: string | null;
  /** True only when the bytes came from the object database at a commit. */
  revisionNamesBytes: boolean;
  worktree: WorktreeState | null;
  unknown: UnknownClaim[];
  at: string;
  claims: ProvenanceClaim[];
}

export interface FixtureProvenanceOptions {
  peer: string;
  mode: ReadMode;
  ref?: string;
  dir?: string;
  dirSource?: string;
  allowUnrevisioned?: boolean;
  allowUnknownWorktreeState?: boolean;
  git?: (dir: string, args: string[]) => { ok: boolean; out?: string; why?: string };
}

export declare function fixtureProvenance(opts: FixtureProvenanceOptions): FixtureProvenance;

export declare function claimsAreLabelled(p: unknown): boolean;

export declare const UNKNOWN_BANNER: string;

export declare function describeFixtureProvenance(p: FixtureProvenance): string;

export declare function announceFixture(
  opts: FixtureProvenanceOptions,
  write?: (s: string) => void,
): FixtureProvenance;
