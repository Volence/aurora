/**
 * Types for `repo-walk.mjs`, so a `.ts` test can drive the containment rule
 * directly.
 *
 * ⚠ A SIGNATURE, NOT A SECOND SOURCE OF TRUTH — written the same way, and for
 * the same reason, as `harness-guard.d.mts` beside it: `tsconfig.json`
 * deliberately keeps `allowJs` off, so tsc needs the shape stated rather than
 * inferred. It states no path, no prefix and no count; nothing here can
 * disagree with the implementation about an ANSWER, only about a shape.
 */

/** A symlink the walk refused to follow, or a directory it reached twice. */
export interface WalkLink {
  /** The link as it was encountered, inside the walked tree. */
  link: string;
  /** Where it resolves to. */
  target: string;
}

/** An entry that could not be stat'ed or resolved, with its errno. */
export interface WalkUnreadable {
  path: string;
  code: string;
}

/**
 * ⚠ THE LAST THREE FIELDS ARE THE POINT OF THE SHAPE. A walk that answered
 * with `files` alone would let a caller render a clean count over a tree it had
 * declined to look at.
 */
export interface ContainedWalk {
  /** Absolute paths, readdir sort order, depth first. */
  files: string[];
  /** Symlinks resolving outside `root`: not descended into, not read. */
  escaped: WalkLink[];
  /** Directories reached a second time, so a link to an ancestor terminates. */
  revisited: WalkLink[];
  /** Entries the walk could not classify. */
  unreadable: WalkUnreadable[];
  /** The root, resolved. */
  root: string;
}

/** Walk `dir` for files ending in one of `exts`, and never leave `root`.
 *  Throws when `root` is missing: a containment rule with a guessed boundary
 *  is not a containment rule. */
export declare function walkContained(
  dir: string,
  exts: readonly string[],
  options: { root: string },
): ContainedWalk;

/** Does the calling gate have standing over this walked-directory-relative
 *  path? False under the out-of-scope prefixes, which are vendored copies of
 *  other repos. */
export declare function hasStandingOver(rel: string): boolean;

/** Is `p` the root itself, or under it? Both must be resolved paths. */
export declare function contains(root: string, p: string): boolean;

/** Directory prefixes this repo's gates have no standing over. */
export declare const OUT_OF_SCOPE_PREFIXES: readonly string[];
