// REBINDING AN OCCUPIED SECTION ORPHANS THE INCUMBENT — cold read D-B.
//
// `docs/reviews/2026-09-05-effects-cold-read.md`, D-B, one of the two findings
// that STOPPED that reader. The strip published `act: … threaded 5,6`; both of
// those sections already carried a preset (`ojz_sec5_showcase`,
// `ojz_sec6_baseswap`), so every home the strip named was occupied and taking
// one made aeon's build red on the document that was displaced. The reader had
// no route through the UI to a green build with a new raster band in it.
//
// The fix is DISCLOSURE, in two halves, and this file holds both to their
// sources:
//
//   the act line   `bound`, the sections whose sidecar already names a preset
//                  (`section-wiring.ts`'s `boundSections`, tested there).
//   the control    `rebindOrphanNotice`, at the Section dropdown that displaces
//                  the incumbent. Tested here.
//
// ⚠ THE RULE IS READ IN AEON'S SOURCE, NOT IN THE REPORT. The cold read quoted
// a build log; a sentence Aurora paints stating a rule nobody read at the other
// end is how a confident-and-wrong label ships. The last describe below parses
// aeon's own lint and holds Aurora's sentence to it, and SKIPS WITH A REASON
// when no checkout is reachable rather than passing on nothing.
//
// ⚠ THESE ROWS READ SOURCE AND CALL THE PROVIDER. Whether the sentence is
// really painted under the select is a CDP harness's claim, not this file's.
//
// ═══ 2026-09-17: OJZ ACT 1 IS IN REGION MODE, AND THE LAST DESCRIBE FOLLOWED IT ═══
//
// aeon bcd844aa re-keyed the raster chooser from the SECTION INDEX to the preset
// RECORD (`ojz_act1_sec_raster(sec: N)` -> `ojz_act1_preset_raster(preset:
// <Record>_KEY)`), and aeon e2af59ea moved every raster binding off
// `section_N.meta.json` onto the rows of `regions.json`. The D-B row read both
// in their section shapes and went red on "no section threads the raster
// chooser". It now re-measures D-B where the facts live: the region rows whose
// record threads the chooser are the homes, and each carries a document nothing
// else reaches. aeon's own lint agrees about the installer: its REACHABLE
// message names "a `rasterRef` on a REGION ROW (or, for an act still in legacy
// mode, on a section sidecar)".
//
// ⚠ WHAT THIS FILE NO LONGER CLAIMS, SAID OUT LOUD. The D-B row now proves the
// AEON half of D-B is still live. It does NOT prove Aurora's disclosure reaches
// it: `rebindOrphanNotice` and `boundSections` are fed `act.sections`, the
// section sidecars, which are all null in region mode, so on this act the
// notice and the `bound` set say nothing about the region rows that are
// actually occupied. That is product behaviour and was reported, not changed,
// in the aeon-region-mode-consumers parcel. The two describes above still test
// the section-keyed functions exactly as before.
//
// ⚠ AND IT NO LONGER OPENS AEON'S WORKING TREE. Until 2026-09-17 these rows read
// `../aeon` by path; they now read `origin/master` in that checkout through git
// objects (`test/support/peer-repo.ts`), never fetch, and skip LOUDLY when the
// ref does not resolve.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { rebindOrphanNotice, sectionsBindingPreset } from '../../../providers/effects-preset';
import { boundSections } from '../../../../core/formats/effects/section-wiring';
import { peerRepo, resolveRev, readAtRev } from '../../../../../test/support/peer-repo';

const panel = readFileSync(join(__dirname, '..', 'BandPresetPanel.tsx'), 'utf8');
const code = panel.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const strip = readFileSync(join(__dirname, '..', 'SectionPicker.tsx'), 'utf8');
const stripCode = strip.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

const sec = (rasterRef: string | null) => ({ rasterRef });

/** The ref these rows read aeon at. A remote-tracking ref, never fetched here. */
const AEON_TIP = 'origin/master';
/** aeon-repo-relative, because these go to `git show <rev>:<path>` and nothing else. */
const LINT = 'tools/test_raster_cycle_table_lint.py';
const HOTKEY = 'games/sonic4/test/ojz_scroll_test.emp';
const REGIONS = 'games/sonic4/data/editor/ojz/act1/regions.json';
const LIB = 'games/sonic4/data/effects/ojz_effects.emp';
/**
 * aeon `ActNames`' record-keyed raster chooser, as renamed at aeon bcd844aa.
 * Spelled here and NOT taken from section-wiring.ts's `rasterChooserName`,
 * which still returns the pre-bcd844aa `<zone>_<act>_sec_raster`.
 */
const RASTER_CHOOSER = 'ojz_act1_preset_raster';

/**
 * `{preset record: the record whose _KEY it passes}` for every `preset()` record
 * whose `raster:` channel CALLS the record-keyed chooser. The record split is the
 * `(pub )?(const|data) <Name>:` one `libraryRasterChooserCalls` uses, with line
 * comments stripped first: aeon's library discusses the chooser in prose, and a
 * home read out of a comment would be a home that does not exist.
 */
function recordsThreadingRasterChooser(lib: string, chooserFn: string): Record<string, string> {
  const code = lib.replace(/\/\/[^\n]*/g, '');
  const decl = /\b(?:pub\s+)?(?:const|data)\s+([A-Za-z_][A-Za-z0-9_]*)\s*:/g;
  const marks: { name: string; at: number }[] = [];
  let m: RegExpExecArray | null;
  while ((m = decl.exec(code)) !== null) marks.push({ name: m[1], at: m.index });
  const call = new RegExp(`raster\\s*:\\s*${chooserFn}\\s*\\(\\s*preset\\s*:\\s*([A-Za-z_][A-Za-z0-9_]*)_KEY\\b`);
  const out: Record<string, string> = {};
  for (let i = 0; i < marks.length; i++) {
    const hit = call.exec(code.slice(marks[i].at, marks[i + 1]?.at ?? code.length));
    if (hit) out[marks[i].name] = hit[1];
  }
  return out;
}

describe('rebindOrphanNotice: it fires on the ONE shape aeon refuses', () => {
  it('nothing bound here, nothing to displace', () => {
    // ANTI-VACUOUS for every row below: a function that spoke on every section
    // would satisfy the positive rows and say nothing at all.
    expect(rebindOrphanNotice([sec(null), sec('x')], 0)).toBeNull();
    expect(rebindOrphanNotice([], 0)).toBeNull();
    expect(rebindOrphanNotice([null], 0)).toBeNull();
    // Out of range is not an orphan, it is a question about no section.
    expect(rebindOrphanNotice([sec('x')], 7)).toBeNull();
  });

  it('ANOTHER section binds the same document, so rebinding orphans nothing', () => {
    // THE ARM THAT MAKES THIS A DERIVATION AND NOT A MOOD. aeon refuses a
    // document in NEITHER installer; a document two sections bind survives
    // losing one of them, and a notice here would be a false alarm.
    expect(rebindOrphanNotice([sec('shared'), sec('shared')], 0)).toBeNull();
    expect(rebindOrphanNotice([sec('shared'), sec('shared')], 1)).toBeNull();
    expect(rebindOrphanNotice([sec('shared'), null, sec('shared'), sec('mine')], 2)).toBeNull();
    // ...while the section that IS a sole binder in the same act still speaks.
    expect(rebindOrphanNotice([sec('shared'), null, sec('shared'), sec('mine')], 3)).not.toBeNull();
  });

  it('sole binder: it names the section, the document, and aeon\'s own refusal', () => {
    const say = rebindOrphanNotice([sec(null), sec(null), sec('ojz_sec5_showcase')], 2)!;
    expect(say).toMatch(/^Section 2 binds "ojz_sec5_showcase", and no other section in this act/);
    // The build's own words, so the author who meets the failure recognises it.
    expect(say).toContain('reachable by NOTHING');
    // BOTH installers, because the disjunction is the whole rule.
    expect(say).toMatch(/rasterRef/);
    expect(say).toMatch(/DEBUG raster-table row/);
    // WHAT IT CANNOT SEE, SAID OUT LOUD. Aurora reads neither the lab table nor
    // another act's sidecars, so the sentence is conditional in both places
    // rather than promising a refusal it cannot prove.
    expect(say).toMatch(/Aurora does not read that table/);
    expect(say).toMatch(/in this act/);
    // AND IT IS NOT A DELETE. The reader's own worry.
    expect(say).toMatch(/not deleted/);
    expect(say).toMatch(/one undo step/);
  });

  it('the id is quoted from the section, never from a caller\'s idea of it', () => {
    expect(rebindOrphanNotice([sec('a_b_c')], 0)).toContain('"a_b_c"');
    // One derivation of "who else names this document", shared with the delete
    // guard: two answers to one question would drift.
    expect(sectionsBindingPreset([sec('a'), null, sec('a')], 'a')).toEqual([0, 2]);
  });
});

describe('the two surfaces are wired to the two derivations', () => {
  it('the panel renders the notice under the Section select, in the NOTE tier', () => {
    expect(code).toMatch(/rebindOrphanNotice\(act\.sections, activeSectionIndex\)/);
    expect(code).toMatch(/\{rebindNotice !== null && \(/);
    // ⚠ NOT `tone="warning"`. Nothing is refused while the binding stands, and
    // C1 of the same cold read is what drawing a not-yet-a-problem in the
    // damage vocabulary costs. `wiringAdvisory` above it keeps its warning tone.
    expect(code).toMatch(/<Hint under testid="effects-rebind-notice">\{rebindNotice\}<\/Hint>/);
    expect(code).not.toMatch(/tone="warning">\{rebindNotice\}/);
    // ...and the panel does not re-derive the binding question itself.
    expect(code).not.toMatch(/sections\.filter[\s\S]{0,40}rasterRef ===/);
  });

  it('the strip prints `bound` as a THIRD SET on the act line, not a fourth row', () => {
    expect(stripCode).toMatch(/boundSections\(act\.sections\)/);
    expect(stripCode).toMatch(/`bound \$\{bound\.length === 0 \? 'none' : bound\.join\(','\)\}`/);
    // ⚠ THE ROW COUNT IS THE ASSERTION. Conditions 1 to 3 answer "can a band go
    // here"; occupancy answers "is something already there" and would read as a
    // fourth condition on the same question. The strip publishes three
    // ConditionRows and the titles still say "of 3".
    const rows = [...stripCode.matchAll(/<ConditionRow\b/g)];
    expect(rows.length, 'the strip grew or lost a condition row: re-read boundSections\' '
      + 'docblock for why occupancy is a set on the act line and not a row').toBe(3);
    expect([...stripCode.matchAll(/CONDITION \d of 3:/g)].length).toBe(3);
    expect(stripCode).not.toMatch(/CONDITION \d of 4:/);
    // The set is derived from the SECTIONS, never folded through the wiring
    // parse, or it would answer `none` whenever a file aeon owns was unreadable.
    expect(stripCode).not.toMatch(/boundSections\(act\.rasterWiring/);
  });
});

describe('aeon\'s own lint is where the rule was read', () => {
  /**
   * aeon's committed bytes for `rel` at `AEON_TIP`, or null after a LOUD skip.
   * Once the ref has resolved, an absent path is a MEASUREMENT and throws.
   */
  const committed = (ctx: { skip: (reason: string) => void }, rel: string): string | null => {
    const aeon = peerRepo('aeon');
    if (aeon === null) {
      ctx.skip(`SKIPPED, NOT PASSED: no aeon git checkout beside this repo (set AEON_DIR), so aeon:${rel} `
        + `at ${AEON_TIP} was not read. The sentence rebindOrphanNotice paints states aeon's refusal `
        + 'condition, and these rows are the only thing holding it to aeon\'s source.');
      return null;
    }
    const sha = resolveRev(aeon, AEON_TIP);
    if (sha === null) {
      ctx.skip(`SKIPPED, NOT PASSED: ${AEON_TIP} does not resolve in ${aeon}. These rows read that ref `
        + `and never the working tree, so aeon:${rel} was not measured.`);
      return null;
    }
    const r = readAtRev(aeon, sha, rel);
    if (!r.ok) throw new Error(`aeon:${rel} at ${AEON_TIP} (${sha}): ${r.why}`);
    return r.text;
  };

  it('unreachable_presets subtracts EXACTLY TWO installers', (ctx) => {
    const src = committed(ctx, LINT);
    if (src === null) return;
    const fn = /def unreachable_presets\([\s\S]*?\n(?=def |\n\ndef )/.exec(src);
    expect(fn, 'aeon\'s unreachable_presets could not be located in '
      + 'tools/test_raster_cycle_table_lint.py: the shape changed, so re-read it rather than '
      + 'deleting this row').not.toBeNull();
    const body = fn![0];
    // ⚠ THE EXPRESSION, NOT A COUNT TYPED HERE. `- set(<name>)` IS an installer;
    // a third one appearing is exactly the change that would make Aurora's
    // "no section binds it and no DEBUG raster-table row names it" a lie by
    // omission, and it lands as a diff to this one line.
    const subtracted = [...body.matchAll(/-\s*set\((\w+)\)/g)].map((m) => m[1]);
    expect(subtracted,
      `aeon's unreachable_presets now subtracts [${subtracted.join(', ')}]. Aurora's `
      + 'rebindOrphanNotice names exactly two installers by hand (a sidecar rasterRef and a '
      + 'DEBUG raster-table row). Re-read the lint and re-word that sentence.')
      .toEqual(['row_ids', 'bound_ids']);
    expect(body).toMatch(/return sorted\(set\(preset_ids\)/);
    // The refusal Aurora quotes is the one this function feeds.
    expect(src).toContain('reachable by NOTHING');
    expect(src).toMatch(/def test_every_preset_document_is_REACHABLE\b/);
    // ...and both installers are named at the assertion, in aeon's own words.
    const msg = /def test_every_preset_document_is_REACHABLE[\s\S]*?\n(?=def )/.exec(src)![0];
    expect(msg).toContain('.raster_table');
    expect(msg).toContain('ACT_RASTER_REF_KEY');
  });

  it('D-B REPRODUCED: every threaded region of ojz act1 is occupied', (ctx) => {
    const lib = committed(ctx, LIB);
    if (lib === null) return;
    // ⚠ THIS ROW IS THE PARCEL'S LIVE SUBJECT, re-measured in REGION MODE (see
    // the header). The homes an editor-authored band has are the region rows
    // whose preset RECORD threads the raster chooser, and every one of them
    // already carries a document nothing else reaches. If aeon threads a record
    // bound by a region with no rasterRef, or gives one of these documents a
    // `.raster_table` row, THIS ROW GOES RED and the disclosure has a smaller
    // subject than it did. That is a change to read, not a row to delete.
    const threaded = recordsThreadingRasterChooser(lib, RASTER_CHOOSER);
    expect(Object.keys(threaded).length, `no preset() record threads ${RASTER_CHOOSER} in `
      + `aeon:${LIB} at ${AEON_TIP}: the parse, not the tree`).toBeGreaterThan(0);
    // SELF-KEYING, which is what makes "the record" and "the key" one thing:
    // aeon bcd844aa's seam gate refuses a record that threads another's key.
    for (const [record, key] of Object.entries(threaded)) {
      expect(key, `${record} threads ${RASTER_CHOOSER} with ${key}_KEY, not its own key`).toBe(record);
    }

    // ⚠ A MISSING DOCUMENT THROWS INSIDE `committed`, and that is the MODE
    // assertion: this row is about a region-mode act, and an act that went back
    // to section sidecars would have no regions.json to read.
    const doc = JSON.parse(committed(ctx, REGIONS)!) as {
      regions: { id: string; preset: string; rasterRef?: string | null }[];
    };
    const rows = doc.regions.map((r) => ({ id: r.id, preset: r.preset, rasterRef: r.rasterRef ?? null }));
    const homes = rows
      .map((r, i) => ({ ...r, i }))
      .filter((r) => Object.prototype.hasOwnProperty.call(threaded, r.preset));
    expect(homes.length, `no region row of aeon:${REGIONS} binds a record that threads `
      + `${RASTER_CHOOSER}: the join, not the tree`).toBeGreaterThan(0);

    const bound = boundSections(rows);
    const free = homes.filter((h) => !bound.includes(h.i)).map((h) => h.id);
    expect(free,
      `aeon now threads the record of region(s) [${free.join(', ')}] with no rasterRef on them. `
      + 'That is a FREE home for an editor-authored raster band, which the cold read (D-B) had '
      + 'none of. Re-read docs/reviews/2026-09-06-coldread-db-occupied.md: the disclosure is '
      + 'still correct, but its subject shrank.').toEqual([]);

    // ...and each incumbent is reachable ONLY by its binding, which is what
    // makes taking the region a build failure rather than a free swap.
    const table = /(?:export\s+)?\.raster_table:\s*\n([\s\S]*?)\n\s*\}/.exec(committed(ctx, HOTKEY)!);
    expect(table, 'aeon\'s .raster_table could not be located in ojz_scroll_test.emp: re-read it')
      .not.toBeNull();
    const labels = [...table![1].matchAll(/^\s*dc\.l\s+(\w+)/gm)].map((m) => m[1]);
    expect(labels.length, 'the table parsed as empty: the regex, not the table').toBeGreaterThan(1);
    for (const h of homes) {
      const id = h.rasterRef!;
      expect(sectionsBindingPreset(rows, id),
        `${id} is bound by more than region ${h.id}, so rebinding ${h.id} would not orphan it`)
        .toEqual([h.i]);
      expect(labels.some((l) => l.endsWith(id)),
        `${id} now has a DEBUG .raster_table row, so displacing it from region ${h.id} no longer `
        + 'orphans it. The notice is still honest (it says Aurora cannot read that table), but '
        + 'this half of D-B is no longer live.').toBe(false);
    }
  });
});
