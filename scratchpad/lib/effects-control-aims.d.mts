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
