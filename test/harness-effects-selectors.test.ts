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
 *      the labels this rename moved, which is a list and lists rot. Row 4 is
 *      what keeps it honest: it asserts the panel does not render any of them
 *      today. If the app ever adopts one of these words again, row 4 goes red
 *      and the list gets re-examined rather than silently forbidding a string
 *      that is correct again.
 *
 * ⚠ AND WHAT NONE OF THEM COVER. This is a SOURCE scan. It cannot tell whether
 * a repaired harness actually opens the section on screen, because the node
 * suite has no Electron and an agent worktree has no `node_modules/.bin/
 * electron` at all. "The string is in src/" is a much weaker claim than "the
 * gesture worked", and the runtime confirmation is tagged for a foreground
 * seat rather than asserted here.
 */

import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';

import { EFFECTS_SUB_TABS } from '../src/renderer/providers/effects-sub-tabs';

const ROOT = resolve(__dirname, '..');
const HELPER = join(ROOT, 'scratchpad/lib/effects-sections.mjs');
const PANEL = join(ROOT, 'src/renderer/components/effects/BgAnimBandPanel.tsx');
const SECTION_COMPONENT = join(ROOT, 'src/renderer/components/ui/CollapsibleSection.tsx');
const SUB_TAB_BAR = join(ROOT, 'src/renderer/components/effects/EffectsSubTabBar.tsx');
/** Every panel in the facet — which one renders a section is DERIVED, not pinned. */
const EFFECTS_PANELS = join(ROOT, 'src/renderer/components/effects');

/**
 * THE LABELS THE TILE-ANIMATION RENAME RETIRED, and what each became.
 *
 * A named list, and row 4 below is the reason that is defensible: it asserts
 * the panel renders none of them, so a word that becomes correct again turns
 * this file red rather than staying quietly banned.
 *
 * `Band N` is deliberately anchored on the digit: the RASTER side still says
 * "band" and must (aeon's own build errors say `band:`), so a bare /band/ here
 * would forbid the correct raster selectors in the same directory.
 */
const RETIRED: ReadonlyArray<{ readonly pattern: RegExp; readonly now: string }> = [
  { pattern: /BG animation bands/, now: 'Tile animations (n/m)' },
  { pattern: /\bNew band\b/, now: 'New tile animation' },
  { pattern: /\bAdd band\b/, now: 'Add' },
  { pattern: /\bRemove band [\d\\]/, now: 'Remove tile animation N' },
  { pattern: /\bDemote band [\d\\]/, now: 'Demote tile animation N to static tiles' },
  { pattern: /\bBand \d/, now: 'Tile animation N' },
  { pattern: /Band \$\{/, now: 'Tile animation ${...}' },
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

interface Hit { file: string; line: number; text: string; now: string }

function retiredHits(files: readonly string[]): Hit[] {
  const hits: Hit[] = [];
  for (const rel of files) {
    const raw = readFileSync(join(ROOT, rel), 'utf8');
    const live = stripComments(raw, /\.(sh|py)$/.test(rel));
    live.split('\n').forEach((l, i) => {
      for (const { pattern, now } of RETIRED) {
        if (pattern.test(l)) { hits.push({ file: rel, line: i + 1, text: l.trim().slice(0, 120), now }); break; }
      }
    });
  }
  return hits;
}

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
      expect(routed.get(id), `the helper routes ${id} to a tab the app does not put it on — the `
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

  it('no live line in scratchpad/ selects on a retired tile-animation label', () => {
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
    expect(hits, `${hits.length} live line(s) still select on wording the app retired:\n  `
      + hits.map((h) => `${h.file}:${h.line} -> now ${h.now}\n      ${h.text}`).join('\n  '))
      .toEqual([]);
  });

  it('and the retired labels really are retired: the panel renders none of them', () => {
    const panel = readFileSync(PANEL, 'utf8');
    const live = stripComments(panel, false);
    const back = RETIRED.filter((r) => r.pattern.test(live)).map((r) => String(r.pattern));
    expect(back, 'the panel renders a label this file forbids harnesses from selecting on. One '
      + 'of the two is wrong: either the app re-adopted a retired word, or the RETIRED list '
      + 'above has outlived the rename it describes').toEqual([]);
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
});
