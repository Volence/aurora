/**
 * ═══════════════════════════════════════════════════════════════════════════
 * AN AIM THAT MISSES STOPS THE RUN, AND SAYS WHAT IT WAS LOOKING FOR
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * TIMELINE-HARNESS-AIM-DRIFT, 2026-09-12. Two harnesses addressed controls by
 * words the app had since renamed (`raster-timeline-harness.mjs` by the title
 * prefix `Layer N vsplit.at <dash>`, `ramp-control-harness.mjs` by a row labelled
 * `Raster`). Neither aim found anything, and neither said so. The miss became
 * `undefined` or `null`, and what the run printed was about the APP:
 *
 *   - the ramp harness failed [f0] with `raster select = null`, then cv-a and
 *     cv-z, which read as a dead conversion;
 *   - the timeline harness failed 4a/5b/5b2/5cA/5cB (no split had been set, so
 *     none was drawn) and then threw a TypeError at its line 550, three sections
 *     after the miss.
 *
 * The fix is not only the new words, which the next rename would retire. It is
 * that an aim which finds ZERO elements, or MORE THAN ONE where one is meant,
 * throws at the aim, naming what it looked for and where. The next rename says
 * `aim missed: <what>` instead of looking like an app defect.
 *
 * ═══ WHAT IS AND IS NOT AN AIM ═══
 *
 * An aim is a lookup whose element the run needs in order to DO something:
 * type into it, click it, read its value. A lookup whose ABSENCE is the thing
 * a row measures (a painted sentence that must be gone, a pill whose presence
 * is itself the row) is a MEASUREMENT, not an aim, and keeps returning null.
 * Folding the two would turn a real "the sentence is gone" pass into a stop.
 *
 * ═══ HOW IT STOPS ═══
 *
 * In the page, by throwing. `Runtime.evaluate` reports the exception, every
 * harness's `evalExpr` rethrows it as `eval threw: ... aim missed: ...`, and the
 * run ends in its catch with the message. Nothing downstream sees a null.
 */

/** The phrase every miss begins with. Grep a run's output for it. */
export const AIM_MISSED = 'aim missed';

/**
 * The in-page function, as SOURCE: `(what, where, hits) => the one hit`, or a
 * throw. It is a string because it runs in the renderer, not in node.
 *
 * `where` is the caller's words for the place it looked (a panel, a section,
 * the file the aim was derived from). The ACTIVE SUB-TAB is read from the page
 * and appended, because the commonest miss on the effects column is a control
 * that exists but is on a job that is not showing (d-26b's sub-tabs unmount,
 * they do not hide). On more than one hit, the first three are named, so an
 * ambiguous aim says what it was ambiguous between.
 */
export const AIM_ONE_FN = String.raw`function (what, where, hits) {
  hits = Array.from(new Set(Array.from(hits || [])));
  if (hits.length === 1) return hits[0];
  const tab = (typeof document !== 'undefined' && document.querySelector)
    ? document.querySelector('[data-effects-sub-tab][aria-selected="true"]') : null;
  const name = (h) => String((h && (h.title || h.textContent || h.tagName)) || h).trim().slice(0, 60);
  throw new Error(${JSON.stringify(AIM_MISSED)} + ': ' + what + '; looked in ' + where
    + ' (active sub-tab: ' + (tab ? tab.getAttribute('data-effects-sub-tab') : 'none') + ')'
    + '; found ' + hits.length + ', want exactly 1'
    + (hits.length > 1 ? ' [' + hits.slice(0, 3).map(name).join(' | ') + ']' : ''));
}`;

/**
 * An in-page EXPRESSION that evaluates to the one element `listExpr` yields,
 * or throws. `listExpr` is any array-like JS expression, evaluated in the page.
 */
export function aimOne(what, where, listExpr) {
  return `(${AIM_ONE_FN})(${JSON.stringify(what)}, ${JSON.stringify(where)}, ${listExpr})`;
}

/** The one `<tag>` whose `title` starts with `prefix`. */
export function aimOneByTitle(tag, prefix, where) {
  return aimOne(`<${tag}> whose title starts with ${JSON.stringify(prefix)}`, where,
    `[...document.querySelectorAll(${JSON.stringify(tag)})]`
    + `.filter((e) => (e.title || '').startsWith(${JSON.stringify(prefix)}))`);
}

/** The one `<tag>` whose trimmed text (plus aria-label) matches the regex SOURCE `re`. */
export function aimOneByText(re, tag, where) {
  return aimOne(`<${tag}> whose text matches ${re}`, where,
    `[...document.querySelectorAll(${JSON.stringify(tag)})]`
    + `.filter((e) => ${re}.test(((e.textContent || '') + ' ' + (e.getAttribute('aria-label') || '')).trim()))`);
}

/** Click the one `<tag>` matching `re`, or throw. Returns true. */
export function clickOneByText(re, tag = 'button', where = 'the page') {
  return `(() => { const el = ${aimOneByText(re, tag, where)}; el.click(); return true; })()`;
}

/**
 * Show an effects sub-tab by its `data-effects-sub-tab` id, or throw. The id is
 * the app's own routing key (`providers/effects-sub-tabs.ts`), so it moves only
 * when the app's routing moves.
 */
export function showSubTabOrThrow(tabId) {
  return `(() => { const t = ${aimOne(`effects sub-tab [data-effects-sub-tab="${tabId}"]`,
    'the Effects facet sub-tab bar (EffectsSubTabBar.tsx)',
    `document.querySelectorAll(${JSON.stringify(`[data-effects-sub-tab="${tabId}"]`)})`)};
    t.click(); return 'ok'; })()`;
}

/**
 * Open a CollapsibleSection by its `data-section` id, or throw. Clicks the
 * header only when the app's own `data-section-collapsed` says it is shut, the
 * same way `lib/effects-sections.mjs` does; this is that door made loud.
 * Returns 'already-open' | 'clicked'.
 */
export function openSectionOrThrow(sectionId) {
  return `(() => { const el = ${aimOne(`section [data-section="${sectionId}"]`,
    'CollapsibleSection ids (is its sub-tab showing?)',
    `document.querySelectorAll(${JSON.stringify(`[data-section="${sectionId}"]`)})`)};
    if (el.getAttribute('data-section-collapsed') !== 'true') return 'already-open';
    if (!el.firstElementChild) throw new Error(${JSON.stringify(`${AIM_MISSED}: the header of [data-section="${sectionId}"]; `
      + 'looked in its first child; found none')});
    el.firstElementChild.click(); return 'clicked'; })()`;
}
