/**
 * Types for `sibling-root.mjs`.
 *
 * ⚠ THIS IS A SIGNATURE, NOT A SECOND DERIVATION. It declares the shape of the
 * exported functions and contains no path logic, no environment read and no git
 * call — there is nothing here that can disagree with the implementation about
 * WHERE the sibling root is, which is the only kind of drift the one-definition
 * rule exists to prevent. It is here because `tsconfig.json` deliberately keeps
 * `allowJs` off ("checking them needs `allowJs`, which is a separate
 * decision"), so tsc needs the signature stated rather than inferred.
 */

/** This repository's own checkout — `AURORA_DIR`, then this module's location. */
export declare const AURORA_DIR: string;

/** The canonical variable naming THIS repo's checkout — `AURORA_DIR`. */
export declare const AURORA_DIR_ENV: string;

/** Transitional aliases for it (`AURORA_ROOT`), accepted and announced. */
export declare const AURORA_DIR_ENV_ALIASES: string[];

/** Which precedence step produced `AURORA_DIR`, as printable prose. */
export declare function auroraDirSource(): string;

/** Every refusal from the resolver. */
export declare class SuitePathError extends Error {}

/** The suite-root variable — `EMPYREAN_SUITE_ROOT`. THIS is the name. */
export declare const SUITE_ROOT_ENV: string;

/** Transitional aliases for the suite root, accepted and announced. */
export declare const SUITE_ROOT_ENV_ALIASES: string[];

/** The peer checkouts this repo can name, by directory name. */
export declare const SUITE_PEERS: string[];

/** The canonical checkout variable for a peer: `aeon` → `AEON_DIR`. */
export declare function checkoutEnv(name: string): string;

/** Transitional aliases for one peer's checkout variable. */
export declare function checkoutEnvAliases(name: string): string[];

/** The directory holding this repo and its siblings, or null at step 4 alone. */
export declare function siblingRoot(): string | null;

/** Which precedence step produced `siblingRoot()`, as printable prose. */
export declare function siblingRootSource(): string;

/** The path a peer checkout would have, whether or not it exists. */
export declare function siblingPath(name: string, ...rel: string[]): string | null;

/** Which precedence step answered for this peer. */
export declare function siblingPathSource(name: string): string;

/** The path a peer would have IGNORING its own `<NAME>_DIR` override. */
export declare function siblingDefaultPath(name: string, ...rel: string[]): string | null;

/** The explicit checkout override for a peer, or null when none is set. */
export declare function checkoutOverride(name: string): { name: string; value: string } | null;

/** Resolve a peer path, throwing `SuitePathError` when no step can answer. */
export declare function requireSiblingPath(name: string, ...rel: string[]): string;

/** Stand-in root for "no sibling root could be derived at all". */
export declare const UNRESOLVED_ROOT: string;

/** `siblingPath`, but always a string — falls back under `UNRESOLVED_ROOT`. */
export declare function siblingPathOrUnresolved(name: string, ...rel: string[]): string;

/** `siblingDefaultPath`, but always a string, on the same terms. */
export declare function siblingDefaultPathOrUnresolved(name: string, ...rel: string[]): string;
