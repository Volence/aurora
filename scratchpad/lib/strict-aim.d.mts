/**
 * Types for `strict-aim.mjs`.
 *
 * A SIGNATURE, NOT A SECOND SOURCE OF TRUTH: it states no selector, no message
 * and no id. It exists because `tsconfig.json` keeps `allowJs` off, so a test
 * importing the module needs the shape stated (as `aeon-shipped-preset.d.mts`).
 * Every function returns JS SOURCE to be evaluated in the renderer.
 */

/** The phrase every miss begins with. */
export declare const AIM_MISSED: string;
/** The in-page `(what, where, hits) => hit` function, as source. */
export declare const AIM_ONE_FN: string;
export declare function aimOne(what: string, where: string, listExpr: string): string;
export declare function aimOneByTitle(tag: string, prefix: string, where: string): string;
export declare function aimOneByText(re: string, tag: string, where: string): string;
export declare function clickOneByText(re: string, tag?: string, where?: string): string;
export declare function showSubTabOrThrow(tabId: string): string;
export declare function openSectionOrThrow(sectionId: string): string;
