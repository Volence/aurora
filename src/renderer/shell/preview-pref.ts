// src/renderer/shell/preview-pref.ts
//
// ═══ WHAT "ON BY DEFAULT" MEANS WHEN THE AUTHOR TURNED IT OFF ═══
//
// The parallax composite is ON by default on the Effects > Parallax sub-tab
// (d-26b `three_sub_tabs_plus_section_strip`, third clause). A default is a
// statement about an author who has NEVER DECIDED — it is not a value that gets
// re-applied. An author who switched the preview off and finds it back on the
// next time he opens the tab has met a new defect, and it is the one people
// describe as "it keeps doing that".
//
// So the flag is not a boolean. It is a TRI-STATE:
//
//     null   — never operated the switch. The default speaks: ON, on Parallax.
//     true   — he turned it on.  His choice, and the default never speaks again.
//     false  — he turned it off. Same.
//
// ⚠ AND THE CHOICE OUTLIVES THE SESSION, which every other View toggle does
// not. That asymmetry is deliberate and is the whole point of this file:
//
//   • The other ten overlays are all "off until asked for". None of them has a
//     default that could ever overrule a choice, so none of them needs a memory
//     — losing them at exit costs the author a click he was going to make.
//   • This one is the only overlay whose default is ON. If the choice died with
//     the session, then every restart would re-assert ON over an author who had
//     said no — the exact defect the tri-state exists to prevent, moved from
//     "when I come back to the tab" to "when I come back tomorrow". A session
//     boundary is not a decision boundary: he closed the app, he did not change
//     his mind.
//   • And the facet already persists an arrival-state preference of exactly
//     this kind: `shell/panel-state` remembers which sections are open when you
//     arrive, in this same localStorage, for this same reason.
//
// ⚠ A CONSEQUENCE FOR ANY INSTRUMENT THAT MEASURES THE DEFAULT: a stored
// choice from an earlier run will answer instead of it. `localStorage.clear()`
// before the measurement, as the sub-tabs harness already does for the section
// disclosures. A harness that skips that is measuring its own history.

/** `null` = the author has never operated the switch, so the default speaks. */
export type PreviewChoice = boolean | null;

const KEY = 'aurora.effects.parallaxPreview';

/**
 * The author's stored choice, or null when there is none.
 *
 * Anything that is not exactly `true` or `false` reads as null — a corrupted or
 * half-written value must fall back to the DEFAULT, never to "off", because
 * "off" would be a choice the author never made.
 */
export function loadPreviewChoice(): PreviewChoice {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw === 'true') return true;
    if (raw === 'false') return false;
    return null;
  } catch { return null; }
}

/** Record a choice. `null` erases it, which puts the default back in charge. */
export function savePreviewChoice(v: PreviewChoice): void {
  try {
    if (v === null) localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, v ? 'true' : 'false');
  } catch { /* storage unavailable — the choice then lives for the session */ }
}
