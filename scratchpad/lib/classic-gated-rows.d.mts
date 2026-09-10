/**
 * Types for `classic-gated-rows.mjs`.
 *
 * ⚠ A SIGNATURE, NOT A SECOND SOURCE OF TRUTH. It states no id, no name and no
 * reason text, so there is nothing here that can disagree with the module about
 * WHICH rows the CLASSIC_DIR gate suppresses. It exists because
 * `tsconfig.json` deliberately keeps `allowJs` off (same reason
 * `scratchpad/lib/fixture-provenance.d.mts` exists, and written the same way).
 */

export interface ClassicGatedRow {
  id: string;
  /** The question, as the measuring branch names it. */
  name: string;
  /** What this row could not ask, as a clause composed after a `because`. */
  cannot: string;
  /** Extra sentence only the CLASSIC_DIR arm appends. */
  whenNoClassicDir?: string;
}

export interface ClassicRefusalRow {
  id: string;
  name: string;
  detail: string;
}

export interface ClassicRefusalOptions {
  only?: string[] | null;
  dirTail?: boolean;
}

export declare const CLASSIC_GATED_ROWS: ClassicGatedRow[];

export declare const CLASSIC_GATED_IDS: string[];

export declare function classicDirClause(dir: string | null | undefined): string;

export declare function classicGatedRefusals(
  because: string,
  opts?: ClassicRefusalOptions,
): ClassicRefusalRow[];
