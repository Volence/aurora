/**
 * Types for `aeon-shipped-preset.mjs`.
 *
 * ⚠ THIS IS A SIGNATURE, NOT A SECOND SOURCE OF TRUTH. It declares the shape of
 * the exports and states no path, no id and no filename — there is nothing here
 * that can disagree with the implementation about WHICH document aeon ships,
 * which is the only drift this module exists to prevent. It is here because
 * `tsconfig.json` deliberately keeps `allowJs` off, so tsc needs the signature
 * stated rather than inferred (the same reason `test/support/sibling-root.d.mts`
 * exists, and written the same way).
 */

/** Where aeon keeps the editor's raster-band preset documents, project-relative. */
export declare const AEON_PRESET_DIR_REL: string;

/** The one shipped document this repo's harnesses read on purpose. */
export declare const AEON_SHIPPED_PRESET_FILE: string;

/** Absolute path of a shipped preset document inside an aeon project root. */
export declare function shippedPresetPath(aeonDir: string, file?: string): string;

export interface AeonShippedPreset {
  /** Absolute path the document was read from. */
  path: string;
  /** The file name inside the preset directory. */
  file: string;
  /** `id` as the document states it — proven equal to the filename's stem. */
  id: string;
  /** `name`, when the document carries one. */
  name: string | undefined;
  /** How many raster bands the document carries (0 when `bands` is absent). */
  bands: number;
  /** The bytes, verbatim. */
  text: string;
  /** The parsed document. */
  doc: Record<string, unknown>;
}

/**
 * Read aeon's shipped preset document BY PATH and prove it is what it claims.
 * Throws — naming the absolute path — when absent, unreadable, not JSON, not an
 * object, `id`-less, or when `id` disagrees with the filename.
 */
export declare function readAeonShippedPreset(aeonDir: string, file?: string): AeonShippedPreset;

/** The id, read out of the document on disk. */
export declare function shippedPresetId(aeonDir: string, file?: string): string;

/** Escape a string for embedding in a RegExp source. */
export declare function reQuote(s: string): string;
