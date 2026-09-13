/**
 * A HARNESS MUST NOT SELECT ON WORDS THE APP RETIRED.
 *
 * BGANIM-HARNESS-REPAIR, booked 2026-09-06:
 *
 *     "Eight harnesses select on UI wording the app retired, so they fail the
 *      moment anyone runs them."
 *
 * The wording is the tile-animation vocabulary. EFFECTS-W1 defect 2 ruled that
 * the two effects features get names sharing no word, so the tile-animation
 * side stopped saying "band"
 * (`src/renderer/components/effects/__tests__/band-vocabulary.test.ts` holds
 * the app side of that). The harnesses that opened those sections by TITLE
 * went blind, and nothing in the repo could see it: they are run by hand, and
 * a selector that matches nothing looks exactly like a control that is missing.
 *
 * ⚠ AND THEN IT HAPPENED AGAIN, one axis over. The 2026-09-05 dash sweep
 * (`24541886`) gave every effects section header a colon, so `Scene` + em dash
 * became `Scene: <id>` and `Preset` + em dash became `Preset: <id>`. Seven rigs
 * hunted the scene header by the dash and went blind the same way
 * (EFFECTS-RIGS-AIM-MISS re-aimed two, EFFECTS-RIGS-FIVE-MORE five more), and
 * `effects-sub-tabs` asserted an ABSENCE against both dead spellings and so
 * passed vacuously. Those two needles are in `RETIRED` now.
 *
 * ═══ WHAT THESE ROWS COVER, SAID EXACTLY ═══
 *
 * FOUR different claims, and they are not interchangeable:
 *
 *   1. THE HELPER AGREES WITH THE APP. `scratchpad/lib/effects-sections.mjs`
 *      is a `.mjs` module and the app's routing table is TypeScript, so the
 *      helper carries a COPY of "which sub-tab owns which section". The copy
 *      is compared against `EFFECTS_SUB_TABS` here. A copy nothing compares is
 *      how a harness ends up clicking a tab that no longer owns its section.
 *
 *   2. THE ATTRIBUTES IT SELECTS ON ARE RENDERED. `data-section`,
 *      `data-section-collapsed`, `data-effects-sub-tab` and `aria-selected`
 *      are read out of the components that render them. A harness selecting on
 *      an attribute the app stopped emitting is the same defect one axis over.
 *
 *   3. NO RETIRED LABEL SURVIVES IN A LIVE SELECTOR POSITION in `scratchpad/`.
 *
 *   4. AND THE RETIRED LIST IS STILL RETIRED. Row 3 works from a NAMED LIST of
 *      the labels that moved, which is a list and lists rot. Row 4 is what
 *      keeps it honest: it asserts the panel that would paint each label does
 *      not paint it today. If the app ever adopts one of these words again, row
 *      4 goes red and the list gets re-examined rather than silently forbidding
 *      a string that is correct again.
 *
 * ⚠ AND WHAT NONE OF THEM COVER. This is a SOURCE scan. It cannot tell whether
 * a repaired harness actually opens the section on screen, because the node
 * suite has no Electron. "The string is in src/" is a much weaker claim than
 * "the gesture worked"; the runtime proof of each re-aimed rig is in its
 * landing packet (`docs/reviews/2026-09-12-effects-rigs-aim-miss.md`,
 * `docs/reviews/2026-09-13-effects-rigs-five-more.md`), not here.
 *
 * ═══ WHY THE DASH IS NEVER SPELLED IN THIS FILE ═══
 *
 * Two of the retired labels ARE an em dash, and `scripts/check-test-dashes.mjs`
 * counts every dash inside a string, template or regex literal in the test
 * tree, in both spellings. This file follows that gate's own SELF-VISIBILITY
 * idiom ("the pattern is built from `String.fromCharCode` ... so a dash cannot
 * enter this file as part of its own machinery"): `EM` and `EM_ESCAPE_TEXT`
 * below are built from the code point, and every pattern and planted source is
 * composed from them. What that gate protects is text shown to a person, so
 * the other half is kept too: NO FAILURE MESSAGE HERE PRINTS A PATTERN OR A
 * PLANT. Row 3 does print the offending scratchpad line, which is a quotation
 * of the file that broke the rule, and the only useful artifact it has.
 */

import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';

import { EFFECTS_SUB_TABS } from '../src/renderer/providers/effects-sub-tabs';

const ROOT = resolve(__dirname, '..');
const HELPER = join(ROOT, 'scratchpad/lib/effects-sections.mjs');
const PANEL = join(ROOT, 'src/renderer/components/effects/BgAnimBandPanel.tsx');
const SCENE_PANEL = join(ROOT, 'src/renderer/components/effects/EffectsScenePanel.tsx');
const PRESET_PANEL = join(ROOT, 'src/renderer/components/effects/BandPresetPanel.tsx');
const SECTION_COMPONENT = join(ROOT, 'src/renderer/components/ui/CollapsibleSection.tsx');
const SUB_TAB_BAR = join(ROOT, 'src/renderer/components/effects/EffectsSubTabBar.tsx');
/** Every panel in the facet — which one renders a section is DERIVED, not pinned. */
const EFFECTS_PANELS = join(ROOT, 'src/renderer/components/effects');

/** U+2014, from its code point: see "WHY THE DASH IS NEVER SPELLED" above. */
const EM = String.fromCharCode(0x2014);
/** The same dash as a `.mjs` file spells it with an escape: six characters of text. */
const EM_ESCAPE_TEXT = `\\u${(0x2014).toString(16)}`;
/** Regex source matching either spelling. */
const DASH = `(?:${EM}|${EM_ESCAPE_TEXT.replace(/\\/g, '\\\\')})`;

interface Retired {
  /** The label as a harness would SELECT on it, matched against scratchpad sources. */
  readonly pattern: RegExp;
  /** What replaced it, for the failure message. */
  readonly now: string;
  /** The component that would paint it, read by row 4. */
  readonly panel: string;
  /** A section id that panel renders: row 4's proof it is reading the right file. */
  readonly section: string;
  /** The label as that panel's own source would spell it, if it painted it again. */
  readonly painted: RegExp;
}

/** A tile-animation label: the harness spelling and the painted spelling are one. */
const tileAnim = (pattern: RegExp, now: string, section: string): Retired =>
  ({ pattern, now, panel: PANEL, section, painted: pattern });

/**
 * A section header the dash sweep retired: `word` followed by an em dash.
 *
 * AS A SELECTOR it is ANCHORED: a regex caret (`/^SCENE\s*` + dash) or the
 * opening quote of a string that BEGINS with the header (the shape of
 * `effects-sub-tabs`' old TITLE_OF map). That anchor is what separates a
 * selector from PROSE: a check message saying "...SECTION 0'S SCENE" + dash +
 * "highlighted row..." carries the same characters mid-sentence and must stay
 * green (`effects-scene-selection-harness.mjs`, row 2b). Between the word and
 * the dash it allows spaces and a regex `\s`, `\s*` or `\s+`, which covers
 * every spelling the rigs used.
 *
 * AS PAINTED it is the plain word, case-insensitive, because the header is
 * uppercased by CSS and the rigs matched with /i: if the panel composed the
 * word and a dash again in ANY case, every one of those rigs would see it.
 */
const dashHeader = (word: string, now: string, panel: string, section: string): Retired => ({
  pattern: new RegExp(`(?:\\^|['"\`])${word}(?:\\\\s[*+]?| )*${DASH}`, 'i'),
  now,
  panel,
  section,
  painted: new RegExp(`\\b${word}\\s*${DASH}`, 'i'),
});

/**
 * THE LABELS RETIRED UNDER THE HARNESSES, and what each became.
 *
 * A named list, and row 4 below is the reason that is defensible: it asserts
 * the owning panel renders none of them, so a word that becomes correct again
 * turns this file red rather than staying quietly banned.
 *
 * THE TILE-ANIMATION RENAME. `Band N` is deliberately anchored on the digit:
 * the RASTER side still says "band" and must (aeon's own build errors say
 * `band:`), so a bare /band/ here would forbid the correct raster selectors in
 * the same directory.
 *
 * THE DASH SWEEP'S TWO SECTION HEADERS, `Scene` and `Preset` (see
 * `dashHeader`). Neither is repaired to the colon spelling in any harness: the
 * titles are composed per document (`Scene: ${selected.id}`), so the
 * harnesses open and judge these sections by `data-section` instead.
 */
const RETIRED: readonly Retired[] = [
  tileAnim(/BG animation bands/, 'Tile animations (n/m)', 'aeon.bganim.bands'),
  tileAnim(/\bNew band\b/, 'New tile animation', 'aeon.bganim.new'),
  tileAnim(/\bAdd band\b/, 'Add', 'aeon.bganim.bands'),
  tileAnim(/\bRemove band [\d\\]/, 'Remove tile animation N', 'aeon.bganim.bands'),
  tileAnim(/\bDemote band [\d\\]/, 'Demote tile animation N to static tiles', 'aeon.bganim.bands'),
  tileAnim(/\bBand \d/, 'Tile animation N', 'aeon.bganim.bands'),
  tileAnim(/Band \$\{/, 'Tile animation ${...}', 'aeon.bganim.bands'),
  dashHeader('SCENE', 'Scene: <id>, composed per document; open it by data-section '
    + '(SECTION_SCENE_FORM in scratchpad/lib/effects-sections.mjs)',
  SCENE_PANEL, 'aeon.effects.scene'),
  dashHeader('PRESET', 'Preset: <id>, composed per document; judge it by '
    + 'data-section="aeon.effects.preset.bands"',
  PRESET_PANEL, 'aeon.effects.preset.bands'),
];

/**
 * THE TWO FILES ALLOWED TO CARRY A RETIRED LABEL, each with what it is doing.
 *
 * Printed every run rather than kept quiet, which is this repo's own idiom for
 * an exemption (`check-harness-guards.mjs` prints its two the same way). An
 * exemption nobody sees is a hole, not a decision.
 */
const EXEMPT: ReadonlyArray<{ readonly file: string; readonly why: string }> = [
  {
    file: 'scratchpad/poisons-effects-usability.sh',
    why: 'a POISON: it writes the retired label into a copy of the source as its '
      + 'mutation, and the label is the mutation',
  },
  {
    file: 'scratchpad/o55-new-band-door-probe.mjs',
    why: 'the probe that MEASURED the rename: its rows assert these labels are '
      + 'absent from the screen, so it has to name them',
  },
];

/**
 * HOLDS: a KNOWN live violation, left in place on purpose, each naming ONE file
 * and ONE retired entry (never the whole file), the day it was taken and why.
 *
 * ⚠ NOT AN EXEMPTION, and the difference is the end condition. An exemption
 * says a file may carry a label forever for a reason that does not expire. A
 * hold says a file carries a label it SHOULD NOT, that fixing it was blocked,
 * and it goes RED THE DAY IT IS NO LONGER TRUE: row 3 asserts every hold still
 * matches a live line, so the parcel that re-aims the rig has to delete the
 * hold in the same change, and a hold that outlives its defect cannot sit here
 * quietly. Printed every run, like the exemptions.
 */
const HOLDS: ReadonlyArray<{
  readonly file: string; readonly section: string; readonly since: string; readonly why: string;
}> = [
  {
    file: 'scratchpad/rowremap-author-harness.mjs',
    section: 'aeon.effects.scene',
    since: '2026-09-13',
    why: 'BLOCKED in EFFECTS-RIGS-FIVE-MORE. The rig carries the dead scene needle '
      + '(openSection, and the anchor toggle needle beside it), but it dies at startup before '
      + 'its door: window.__dbg.aeon.open answers CDP "Promise was collected" in every rig on '
      + 'this build, the sibling rigs swallow it with .catch, and this one does not. That is a '
      + 'different defect class, so the re-aim could not be reproduced or proven red-first. '
      + 'Lift by re-aiming the rig with a red-first, and delete this hold in that change.',
  },
];

/** Tracked files under scratchpad/ that could carry a selector. */
function scratchpadSources(): string[] {
  const out = execFileSync('git', ['ls-files', 'scratchpad'], { cwd: ROOT, encoding: 'utf8' });
  return out.split('\n').filter((p) => /\.(mjs|js|ts|mts|py|sh)$/.test(p));
}

/**
 * Blank out comments, keeping every newline so line numbers survive.
 *
 * The distinction is the whole point of row 3: the sweep that booked this row
 * made it too ("verified as live selectors rather than comments"), and a
 * scanner that cannot tell them apart would fail on every docblock explaining
 * the rename, including the ones this parcel wrote.
 */
function stripComments(src: string, shellish: boolean): string {
  if (shellish) return src.replace(/(^|\s)#[^\n]*/g, (m) => m.replace(/[^\n]/g, ' '));
  return src
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
    .replace(/(^|[^:])\/\/[^\n]*/g, (m, p1: string) => p1 + m.slice(p1.length).replace(/[^\n]/g, ' '));
}

interface Hit { file: string; line: number; text: string; now: string; section: string }

function retiredHits(files: readonly string[]): Hit[] {
  const hits: Hit[] = [];
  for (const rel of files) {
    const raw = readFileSync(join(ROOT, rel), 'utf8');
    const live = stripComments(raw, /\.(sh|py)$/.test(rel));
    live.split('\n').forEach((l, i) => {
      for (const { pattern, now, section } of RETIRED) {
        if (pattern.test(l)) {
          hits.push({ file: rel, line: i + 1, text: l.trim().slice(0, 120), now, section });
          break;
        }
      }
    });
  }
  return hits;
}

/** The two dash-sweep entries. */
const DASH_SWEEP = RETIRED.filter((r) => r.panel !== PANEL);

describe('harness selectors follow the app, not the other way round', () => {
  /**
   * ⚠ GENERALISED BY EFFECTS-RIGS-AIM-MISS (2026-09-12), and the pin it dropped
   * is the point. This row used to assert `toBe('tileAnim')` and
   * `PANEL.toContain(id)` against ONE panel file, because the helper held only
   * the two tile-animation sections. That is a pin copied from the population
   * of the day: the moment the helper gained `aeon.effects.scene` — which lives
   * on `parallax`, in `EffectsScenePanel.tsx` — the row would have gone red
   * about a correct entry. Both the owning tab and the owning panel are now
   * DERIVED: the tab from the app's own `EFFECTS_SUB_TABS`, the panel by
   * searching every effects panel for the id. The claim is unchanged and is now
   * the claim for every section the helper carries, not for two of them.
   */
  it('the helper agrees with the app about which sub-tab owns which section', () => {
    const helper = readFileSync(HELPER, 'utf8');
    const declared = [...helper.matchAll(/^export const (SECTION_[A-Z_]+) = '([^']+)';/gm)]
      .map((m) => ({ name: m[1], id: m[2] }));
    expect(declared.length, 'no SECTION_* constant found in the helper, so this row measured '
      + 'nothing').toBeGreaterThan(0);

    const tabOf = new Map<string, string>();
    for (const tab of EFFECTS_SUB_TABS) for (const s of tab.sections) tabOf.set(s, tab.id);

    // The helper's own map, read out of it rather than restated here — and its
    // VALUES resolved through the helper's own tab constants, so an entry that
    // names the wrong tab is caught rather than merely an entry that is absent.
    const mapBody = /export const SECTION_SUB_TAB = \{([\s\S]*?)\n\};/.exec(helper);
    expect(mapBody, 'the helper no longer declares SECTION_SUB_TAB in the shape this row reads')
      .not.toBeNull();
    const constOf = new Map<string, string>(
      [...helper.matchAll(/^export const ([A-Z][A-Z0-9_]*) = '([^']+)';/gm)]
        .map((m) => [m[1], m[2]]));
    const routed = new Map<string, string>(
      [...(mapBody?.[1] ?? '').matchAll(/\[([A-Z][A-Z0-9_]*)\]:\s*([A-Z][A-Z0-9_]*),/g)]
        .map((m) => [constOf.get(m[1]) ?? `<unresolved ${m[1]}>`,
          constOf.get(m[2]) ?? `<unresolved ${m[2]}>`]));

    const panels = readdirSync(EFFECTS_PANELS)
      .filter((f) => f.endsWith('.tsx'))
      .map((f) => ({ file: f, src: readFileSync(join(EFFECTS_PANELS, f), 'utf8') }));
    expect(panels.length, 'no effects panel sources found, so the id-is-rendered half of this row '
      + 'measured nothing').toBeGreaterThan(0);

    for (const { name, id } of declared) {
      expect(tabOf.get(id), `the helper opens section ${JSON.stringify(id)} but the app's `
        + 'EFFECTS_SUB_TABS gives it to no tab, so activating a tab cannot mount it')
        .toBeDefined();
      // The map is keyed by the constant, so the constant is what is looked
      // for; the id it holds is what the app is asked about.
      expect(mapBody?.[1], `the helper declares ${name} and then routes it to no tab, so `
        + 'openEffectsSection would open the section without activating its tab').toContain(name);
      expect(routed.get(id), `the helper routes ${id} to a tab the app does not put it on: the `
        + 'app moved the section and the helper still names the old tab')
        .toBe(tabOf.get(id));
      // And the section really is rendered by one of the effects panels.
      const owners = panels.filter((p) => p.src.includes(`id="${id}"`)).map((p) => p.file);
      expect(owners, `no CollapsibleSection under ${EFFECTS_PANELS} carries id `
        + `${JSON.stringify(id)}, so the helper opens a door the app does not render`)
        .not.toEqual([]);
    }
  });

  it('the attributes the helper selects on are the ones the components render', () => {
    const section = readFileSync(SECTION_COMPONENT, 'utf8');
    expect(section, 'CollapsibleSection stopped emitting data-section').toContain('data-section=');
    expect(section, 'CollapsibleSection stopped emitting data-section-collapsed')
      .toContain('data-section-collapsed=');

    const bar = readFileSync(SUB_TAB_BAR, 'utf8');
    expect(bar, 'the sub-tab bar stopped emitting data-effects-sub-tab')
      .toContain('data-effects-sub-tab=');
    expect(bar, 'the sub-tab bar stopped emitting aria-selected, which is how the helper knows '
      + 'a tab is already active').toContain('aria-selected=');

    const helper = readFileSync(HELPER, 'utf8');
    for (const attr of ['data-section', 'data-section-collapsed', 'data-effects-sub-tab',
      'aria-selected']) {
      expect(helper, `the helper no longer uses ${attr}; if it moved to another mechanism this `
        + 'row is measuring the wrong thing').toContain(attr);
    }
  });

  it('no live line in scratchpad/ selects on a retired label', () => {
    const exemptFiles = new Set(EXEMPT.map((e) => e.file));
    const files = scratchpadSources();
    expect(files.length, 'git ls-files returned no scratchpad sources, so this row scanned nothing')
      .toBeGreaterThan(0);
    for (const e of EXEMPT) {
      expect(files, `the exemption for ${e.file} names a file that is not in the population, so `
        + 'it is protecting nothing and should be deleted').toContain(e.file);
      // eslint-disable-next-line no-console
      console.log(`  DECLARED EXEMPTION: ${e.file} - ${e.why}`);
    }

    const hits = retiredHits(files.filter((f) => !exemptFiles.has(f)));
    const isHeld = (h: Hit) => HOLDS.some((x) => x.file === h.file && x.section === h.section);
    for (const hold of HOLDS) {
      // eslint-disable-next-line no-console
      console.log(`  DECLARED HOLD since ${hold.since}: ${hold.file} (${hold.section}) - ${hold.why}`);
      expect(hits.some((h) => h.file === hold.file && h.section === hold.section),
        `the hold on ${hold.file} (${hold.section}) matches no live line any more: the rig was `
        + 're-aimed, so delete the hold in the same change').toBe(true);
    }
    const live = hits.filter((h) => !isHeld(h));
    expect(live, `${live.length} live line(s) still select on wording the app retired:\n  `
      + live.map((h) => `${h.file}:${h.line} -> now ${h.now}\n      ${h.text}`).join('\n  '))
      .toEqual([]);
  });

  /**
   * ⚠ WIDENED BY EFFECTS-RIGS-FIVE-MORE (2026-09-13) from one panel to the
   * panel that owns each label. It read `BgAnimBandPanel.tsx` alone, which was
   * right while every entry was a tile-animation word; the scene and preset
   * headers are painted by `EffectsScenePanel.tsx` and `BandPresetPanel.tsx`,
   * and asking the tile-animation panel whether it paints a scene header would
   * have been green for the wrong reason. Each entry now names its panel AND a
   * section id that panel renders, so a label whose section moves to another
   * file turns this row red instead of reading a file that no longer draws it.
   */
  it('and the retired labels really are retired: no owning panel renders one of them', () => {
    const back: string[] = [];
    for (const r of RETIRED) {
      const src = readFileSync(r.panel, 'utf8');
      expect(src, `${relative(ROOT, r.panel)} no longer renders section ${r.section}, so row 4 `
        + 'would be asking the wrong file whether it paints this retired label')
        .toContain(`id="${r.section}"`);
      if (r.painted.test(stripComments(src, false))) {
        back.push(`${relative(ROOT, r.panel)} paints the label retired for ${r.section} `
          + `(harnesses were told: now ${r.now})`);
      }
    }
    expect(back, 'a panel renders a label this file forbids harnesses from selecting on. One of '
      + 'the two is wrong: either the app re-adopted a retired word, or the RETIRED list above '
      + 'has outlived the rename it describes').toEqual([]);
  });

  /**
   * ANTI-VACUOUS, both halves. Row 3 passes trivially if the scanner reads
   * nothing or if comment-stripping eats the whole file, and either failure
   * looks exactly like a clean repo.
   */
  it('ANTI-VACUOUS: the scanner finds a planted violation and ignores a commented one', () => {
    const planted = stripComments(
      'const a = OPEN_SECTION("/^BG animation bands/");\n'
      + '// const b = OPEN_SECTION("/^BG animation bands/");\n'
      + '/* const c = "New band"; */\n', false);
    const lines = planted.split('\n');
    expect(RETIRED.some((r) => r.pattern.test(lines[0])),
      'the scanner cannot see a retired label in a live line, so row 3 proves nothing').toBe(true);
    expect(RETIRED.some((r) => r.pattern.test(lines[1])),
      'the scanner reads a line comment as live, so every docblock explaining the rename would '
      + 'fail row 3').toBe(false);
    expect(RETIRED.some((r) => r.pattern.test(lines[2])),
      'the scanner reads a block comment as live').toBe(false);

    // And the real population is not empty of the WORD, only of the selectors:
    // if `band` had vanished from scratchpad/ entirely, row 3 would be green
    // for the wrong reason.
    const files = scratchpadSources();
    const withBand = files.filter((f) => /\bband/i.test(readFileSync(join(ROOT, f), 'utf8')));
    expect(withBand.length, 'no scratchpad file mentions a band at all, so row 3 is green over an '
      + 'empty population').toBeGreaterThan(0);
  });

  /**
   * ANTI-VACUOUS FOR THE DASH-SWEEP ENTRIES, one property per assertion. The
   * two ways these can lie are opposite: blind to a real selector (so the rigs
   * could regrow the needle), or firing on prose (so a check message that says
   * the header mid-sentence would fail the suite and invite someone to loosen
   * the pattern until it caught nothing). Every shape below is one a real file
   * in scratchpad/ carries, or carried until this parcel.
   */
  it('ANTI-VACUOUS: the scene and preset needles are caught as selectors and not as prose', () => {
    const scene = DASH_SWEEP.find((r) => r.section === 'aeon.effects.scene');
    const preset = DASH_SWEEP.find((r) => r.section === 'aeon.effects.preset.bands');
    expect(scene, 'no RETIRED entry for the scene header').toBeDefined();
    expect(preset, 'no RETIRED entry for the preset header').toBeDefined();
    const sel = (src: string) => stripComments(src, false).split('\n')
      .some((l) => DASH_SWEEP.some((r) => r.pattern.test(l)));

    // The dead openers, in every spelling the files used.
    expect(sel(`&& /^SCENE\\s*${EM}/i.test((d.innerText || '').trim()))[0];`),
      'the scanner misses the scene needle spelled with the character').toBe(true);
    expect(sel(`&& /^SCENE\\s*${EM_ESCAPE_TEXT}/i.test((d.innerText || '').trim()))[0];`),
      'the scanner misses the scene needle spelled with its backslash-u escape').toBe(true);
    expect(sel(`const opened = await openSection(c, String.raw\`/^Scene ${EM_ESCAPE_TEXT} /\`);`),
      'the scanner misses the scene needle written without a regex \\s').toBe(true);
    // The TITLE_OF shape: a string that BEGINS with the header.
    expect(sel(`  'aeon.effects.scene': 'SCENE ${EM} ',`),
      'the scanner misses a title map entry that begins with the scene header').toBe(true);
    expect(sel(`  'aeon.effects.preset.bands': 'PRESET ${EM} ',`),
      'the scanner misses a title map entry that begins with the preset header').toBe(true);

    // PROSE, which must stay green: the check message in
    // effects-scene-selection-harness.mjs, and the header comment of
    // writer-originated-scene-harness.mjs.
    expect(sel(`check('2b', 'THE FORM UNDER THE STRIP IS NOW SECTION 0\\'S SCENE ${EM} highlighted row',`),
      'the scanner fires on a check message that says the words mid-sentence').toBe(false);
    expect(sel(`// WRITER-ORIGINATED EFFECTS SCENE ${EM} author one in the running app`),
      'the scanner fires on a line comment').toBe(false);
    // The docblock in scratchpad/lib/effects-sections.mjs QUOTES the needle.
    expect(sel(`/**\n *  && /^SCENE\\s*${EM}/i.test(x)\n */`),
      'the scanner reads a block comment that quotes the needle as live').toBe(false);

    // The PAINTED side: row 4 would see the app composing either header again,
    // and does not mistake the header it paints today for the retired one.
    expect(scene?.painted.test(`title={\`Scene ${EM} \${selected.id}\`}`),
      'row 4 cannot see the scene panel painting the old header').toBe(true);
    expect(preset?.painted.test(`title={\`Preset ${EM} \${selected.id}\`}`),
      'row 4 cannot see the preset panel painting the old header').toBe(true);
    expect(scene?.painted.test('title={`Scene: ${selected.id}`}'),
      'row 4 reads the header the app paints today as the retired one').toBe(false);

    // And the population still QUOTES the scene needle in comments: otherwise
    // this row's green could mean the comment stripper ate nothing because
    // there was nothing to eat.
    const quoting = scratchpadSources().filter((f) => /\^SCENE\\s\*/.test(readFileSync(join(ROOT, f), 'utf8')));
    expect(quoting.length, 'no scratchpad file quotes the retired scene needle even in a comment, '
      + 'so the comment half of row 3 is unexercised on real files').toBeGreaterThan(0);
  });
});
