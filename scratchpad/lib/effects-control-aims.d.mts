/**
 * Types for `effects-control-aims.mjs`.
 *
 * A SIGNATURE, NOT A SECOND SOURCE OF TRUTH: no title, no arm name and no
 * pattern is stated here, so nothing here can disagree with the source the
 * module reads. It exists because `tsconfig.json` keeps `allowJs` off.
 */

export declare const VSPLIT_ROW_SOURCE: string;
export declare const SCENE_PANEL_SOURCE: string;
export declare const PRESET_SCHEMA_SOURCE: string;
export declare const VSPLIT_SELECT_COMPOSITION: string;

export interface VsplitAims {
  /** The literal head of `LAYER_VSPLIT_ROW.title`, before its first interpolation. */
  readonly titleHead: string;
  /** The literal text the panel writes before the bound in the row spinner's title. */
  readonly spinnerHead: string;
  /** Title prefix of layer `i`'s vsplit toggle `<select>`. */
  select(i: number): string;
  /** Title prefix of layer `i`'s vsplit row spinner `<input>`. */
  spinner(i: number): string;
  /** Where the aims were read from, for a miss message. */
  readonly where: string;
}

export declare function vsplitAims(root: string): VsplitAims;
export declare function programArms(root: string): readonly string[];

export declare const BAND_REFUSAL_SOURCE: string;

export interface BandRefusal {
  /** `PROGRAM_ARM_NOUNS[arm]`, as the composing module spells it. */
  readonly noun: string;
  /** The sentence's first clause: single-line, and a prefix of `needles[0]`. */
  readonly search: string;
  /** Every contiguous run of the composed sentence this reader can resolve. */
  readonly needles: readonly string[];
  /** Which function the sentence was read out of, for a miss message. */
  readonly where: string;
}

export declare function bandRefusalNeedles(
  root: string, arm: string, presetId: string): BandRefusal;
