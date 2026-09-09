/**
 * Types for `build-flavour-stamp.mjs`, so `electron.vite.config.ts` and
 * `test/build-flavour.test.ts` can import it under `tsc --noEmit`
 * without an implicit `any`.
 *
 * Deliberately narrow. The plugin is typed as the two members electron-vite
 * actually calls rather than as vite's `Plugin`, so this file does not pull
 * vite's types into a module whose only job is to write one JSON file.
 */

export type BuildFlavour = 'debug' | 'plain';

export interface BuildFlavourStamp {
  readonly stamp: number;
  readonly flavour: BuildFlavour;
  readonly VITE_AURORA_DEBUG: string | null;
  readonly at: string;
  readonly by: string;
}

export const DEBUG_ENV: 'VITE_AURORA_DEBUG';
export const DEBUG_ENV_ON: '1';
export const BUILD_FLAVOUR_REL: string;
export const BUILD_FLAVOUR_STAMP_VERSION: number;
export const FLAVOURS: readonly BuildFlavour[];
export const DEBUG_BUILD_COMMAND: string;

export function flavourOf(env?: Record<string, string | undefined>): BuildFlavour;
export function stampContent(
  env?: Record<string, string | undefined>, now?: Date,
): BuildFlavourStamp;
export function writeBuildFlavourStamp(
  root: string, env?: Record<string, string | undefined>, now?: Date,
): BuildFlavourStamp;
export function buildFlavourStampPlugin(root: string): {
  readonly name: string;
  closeBundle(): void;
};
