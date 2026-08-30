/**
 * Types for `sibling-root.mjs`.
 *
 * ⚠ THIS IS A SIGNATURE, NOT A SECOND DERIVATION. It declares the shape of two
 * functions and contains no path logic, no environment read and no git call —
 * there is nothing here that can disagree with the implementation about WHERE
 * the sibling root is, which is the only kind of drift the one-definition rule
 * exists to prevent. It is here because `tsconfig.json` deliberately keeps
 * `allowJs` off ("checking them needs `allowJs`, which is a separate
 * decision"), so tsc needs the signature stated rather than inferred.
 */

/** This repository's own root. */
export declare const AURORA_ROOT: string;

/** The directory holding this repo and its siblings, or null when undecidable. */
export declare function siblingRoot(): string | null;

/** The path a peer checkout would have, whether or not it exists. */
export declare function siblingPath(name: string, ...rel: string[]): string | null;

/** Stand-in root for "no sibling root could be derived at all". */
export declare const UNRESOLVED_ROOT: string;

/** `siblingPath`, but always a string — falls back under `UNRESOLVED_ROOT`. */
export declare function siblingPathOrUnresolved(name: string, ...rel: string[]): string;
