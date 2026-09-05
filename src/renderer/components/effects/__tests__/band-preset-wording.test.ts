// THE PROMISE GATE for the raster band preset panel.
//
// ═══ WHAT THIS FILE IS ACTUALLY DEFENDING ═══
//
// This surface's characteristic failure is not a crash and not a wrong number.
// It is a PROMISE: a panel that saves a document and lets an author believe the
// band is now in the game. aeon wrote docs/EDITOR_RASTER_PRESETS.md specifically
// to stop one sentence — "authoring effects no longer needs a programmer" — and
// their accurate one is "an author can author a raster band, and a programmer
// wires it up in one line."
//
// So the rows below assert three different things, and they are different on
// purpose because each covers a way the promise rots:
//
//   1. The three limits EXIST and say the load-bearing words. A limit that
//      loses "not implemented in either repo" has become a shrug.
//   2. The panel READS them and renders them UNCONDITIONALLY, AT BOTH LENGTHS.
//      ⚠ AMENDED at `b8d16256` (EFFECTS-W1 defect 3) and the amendment has two
//      halves: the AUTHOR-LENGTH sentence (`presetLimitsShort()`) must be
//      PAINTED — a limit that is only reachable behind a `title=` or a
//      collapsed detail is a limit the panel does not carry — AND the
//      CONTRACT-length wording (`PRESET_LIMITS[k].body`) must still be
//      REACHABLE on the same element's `title`, or the move became a deletion.
//      The rows near the foot of this file hold both directions; neither half
//      alone is the rule. Do not read the pre-amendment phrasing ("LimitBlock
//      is not a tooltip") as forbidding the hovers — see BandPresetPanel.tsx's
//      header, which was itself left stale by that commit and repaired in O79.
//   3. NOTHING here claims anyone has SEEN one HERE. Until aeon `4a4d3474`
//      (2026-08-30) no band in this suite had been looked at on screen; that
//      commit's `docs/research/reference_captures/2026-08-30-sec5-band/` is
//      the first one, in aeon's emulator, in aeon's tree. LIMIT 1 may cite it,
//      attributed — and the rows pin that it says WHERE, and that nothing of
//      it is visible in this editor. `NO_PREVIEW` cites it too, as the ONE
//      frame a preview could be checked against (O64, 2026-08-30), and its
//      rows pin separately that none is built. Copy implying an author can
//      see a band on THIS surface is still the one thing worse than no preview.
//
// ⚠ THE NODE SUITE CANNOT SEE REACT. These rows read the panel SOURCE and the
// provider's exported strings. That bounds what they can prove: they prove the
// strings exist and that the component references them unconditionally, NOT that
// a pixel appeared. The pixel is the CDP harness's job
// (scratchpad/band-preset-harness.mjs) and the screenshot it parks. Said out
// loud so the green here is not read as more than it is.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  PRESET_HEADLINE, PRESET_LIMITS, NO_PREVIEW, NO_PREVIEW_SHORT, presetLimitsShort,
  lastBandRefusal, armOptions,
  presetIdRefusal, newPreset,
} from '../../../providers/effects-preset';
import { RASTER_SECTION_BINDING_LIMIT } from '../../../../core/formats/raster-binding';

const PANEL_PATH = join(__dirname, '..', 'BandPresetPanel.tsx');
const panel = readFileSync(PANEL_PATH, 'utf8');

/**
 * The panel source with its comments stripped.
 *
 * ═══ THIS IS THE SLICE BOUND, AND IT IS LOAD-BEARING ═══
 *
 * The last parcel in this area shipped a plant that came back green because a
 * test slice ran to end-of-file and swept in two other components that happened
 * to share a line. Here the equivalent trap is COMMENTS: this panel's docblock
 * discusses `PRESET_LIMITS` and `LimitBlock` at length, so a naive
 * `panel.includes('PRESET_LIMITS')` would stay green after the render call was
 * deleted, satisfied entirely by the prose explaining why it should be there.
 *
 * Stripping comments is what makes the rows below assert CODE. The next row
 * proves the strip really removed something, so the bound is asserted and not
 * merely applied.
 */
const code = panel
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/^\s*\/\/.*$/gm, '');

describe('the slice this file measures is bounded', () => {
  it('comment-stripping really removed the prose that discusses the limits', () => {
    // ANTI-VACUOUS, both directions: the comments really mention PRESET_LIMITS
    // (so a naive contains-check WOULD have been fooled)...
    expect(panel).toMatch(/\/\/.*PRESET_LIMITS|PRESET_LIMITS`? renders/);
    expect(panel.length - code.length).toBeGreaterThan(500);
    // ...and the stripped source is still a real component, not an empty string.
    expect(code).toMatch(/export default function BandPresetPanel/);
    expect(code.length).toBeGreaterThan(2000);
  });
});

describe('the three limits say the words that carry them', () => {
  it('there are exactly three, with the keys the panel and this file agree on', () => {
    expect(PRESET_LIMITS.map((l) => l.key))
      .toEqual(['unbound', 'debug_chord', 'unchecked_visibility']);
  });

  /**
   * Limit 1. The load-bearing half used to be "not implemented in EITHER repo",
   * because an author who reads only "a programmer binds it" may reasonably
   * assume the key exists and someone just has to set it.
   *
   * ⚠ THAT HALF CHANGED, AND THE ROW CHANGED WITH IT. Since empyrean
   * docs/AURORA_EFFECTS_SCHEMA.md §3.1 (adjudicated 2026-08-30) the key DOES
   * exist, is called `rasterRef`, and Aurora's sidecar round-trips it — so the
   * old sentence would now be a lie in the direction that matters, telling an
   * author to stop looking for something that is there.
   *
   * ⚠ AND IT CHANGED AGAIN when `assign_section_preset` landed: a WRITER now
   * exists. "Nothing binds a preset to a section" became false, and this row
   * used to assert exactly that phrase. What survived that correction was the
   * only half that was then load-bearing for an author — no CONSUMER reads the
   * key, so binding one still installs nothing — and one new half: the writer
   * that DOES exist is an agent tool, not a control in this panel, which is
   * what an author reading this block needs to know to go find it.
   *
   * ⚠ THIRD CORRECTION, 2026-08-30, AND IT RETIRED A DATED CLAIM ON SCHEDULE.
   * The consumer half is now false too: aeon `4aa2abc0` landed the reader.
   * `tools/effects_gen.py` resolves `rasterRef` against the preset documents
   * and emits the section's program plus the chooser. This row asserted
   * `/no aeon consumer reads a rasterRef yet/` and `/by hand in aeon's
   * ojz_effects\.emp/` — BOTH WENT RED, which is the rows working: the old
   * sentence's expiry named the two aeon files, and they moved.
   *
   * What replaced it is NOT "it works now", and the row asserts the difference
   * on purpose. At `4aa2abc0` nothing CALLS the chooser: every `raster:`
   * argument in `games/sonic4/data/effects/ojz_effects.emp` is a hand-authored
   * label and `EditorRaster_OJZ_Act1_Bindings = 0`. So the rows below assert
   * three separate author-facing claims — the reader EXISTS, the CALL SITE does
   * not, and the sentence names a revision and an expiry — because a limit that
   * loses any one of them misleads in a different direction.
   *
   * The negative assertion is still the point: `effectsRef` is reserved and
   * unspent (§7), and naming it here would send an author to a key no writer
   * produces. NOTHING in this parcel spends that reservation.
   *
   * THE BODY IS NO LONGER THIS FILE'S TO SPELL. It is
   * `RASTER_SECTION_BINDING_LIMIT` (core/formats/raster-binding.ts), quoted
   * verbatim by the panel, by `assign_section_preset`'s reply and by the
   * published tool descriptions — so this row asserts the WORDS the author
   * needs and a second row asserts the identity, rather than pinning a copy.
   */
  it('LIMIT 1 names rasterRef, names the tool that writes it, and says where the read stops', () => {
    const l = PRESET_LIMITS.find((x) => x.key === 'unbound')!;
    expect(l.body).toMatch(/rasterRef/);
    expect(l.body).not.toMatch(/effectsRef/);
    // The author's questions: what writes it, what reads it, where the read
    // stops, and what that leaves them to do by hand.
    expect(l.body).toMatch(/assign_section_preset/);
    // ⚠ REVERSED ON PURPOSE, 2026-08-30, AND IT WAS RED BEFORE IT WAS EDITED.
    // This line read `/no control in the band-preset panel writes a rasterRef/i`
    // until ROADMAP row 93's remaining half landed the per-section raster
    // select. That is the fourth of this limit's claims to expire, and the same
    // mechanism as the other three: the gate went red, someone read why, and
    // the sentence moved. What must NOT drift is the half it shared a clause
    // with — a control now writes the key and the viewport STILL composites
    // nothing — so both are pinned, and the second is what stops "the panel has
    // a select" from being read as "you can see it".
    expect(l.body).toMatch(/the band-preset panel now carries a per-section raster select/i);
    expect(l.body).toMatch(/the viewport does not composite a rasterRef/i);
    expect(l.body).toMatch(/this assignment changes nothing on screen/i);
    // ⚠ AND IT COVERS SECTION 5 TOO, ASSERTED SEPARATELY. Once one section is
    // wired in aeon, "the viewport composites nothing" is the exact clause that
    // would erode first — "aeon threads section 5" reading as "so you can see it
    // here". When this was written nobody in this suite had seen a raster band
    // render; since aeon `4a4d3474` one HAS been, in aeon's emulator, and that
    // makes this clause MORE load-bearing, not less — it is the sentence that
    // keeps "aeon measured it" from reading as "you can see it in this editor".
    expect(l.body).toMatch(/for section 5 as much as for any other/i);
    // THE READER EXISTS. Pinned to the file that resolves the key rather than to
    // a loose "reads it", which limit 2's "aeon steps a band-demo table" prose
    // could drift into satisfying.
    expect(l.body).toMatch(/tools\/effects_gen\.py resolves rasterRef/i);
    // ⚠ FIFTH CORRECTION, 2026-08-30, AND THE ROW WENT RED FIRST. This asserted
    // `/no preset\(\) in aeon's …ojz_effects\.emp/i` and `/the band does not
    // play/i` — the UNIVERSAL call-site clause — until aeon `9cdf32d8` threaded
    // the chooser for ONE section. Step 5 MANUFACTURED that non-uniformity: the
    // universal sentence was true right up until it became the lie, so what
    // replaces it is a CASE SPLIT, and the rows below pin each case separately
    // because collapsing them is how "section 5 is wired" would drift into "a
    // bound section plays".
    //
    // CASE 1 — section 5 is wired, and the NUMBER is asserted. aeon's drafting
    // rule, adopted: a sentence naming the number has an obvious expiry that
    // fires when the number moves; "a bound section plays" has none and goes
    // wrong silently the first time someone binds section 6.
    expect(l.body).toMatch(/ONLY SECTION 5 IS WIRED/);
    expect(l.body).toMatch(/ojz_act1_sec_raster\(sec: 5, hand: Raster_Program_None\)/);
    // CASE 2 — section 5 unbound is the `hand:` label and is a no-op.
    expect(l.body).toMatch(/leaving section 5 unbound resolves to that hand: label/i);
    // CASE 3 — THE REASON THIS SENTENCE EXISTS. Binding any OTHER section writes
    // a key nothing consumes. Kept, and made section-specific rather than
    // deleted.
    expect(l.body).toMatch(/BINDING ANY OTHER SECTION STILL REACHES NOTHING/);
    // ...and case 3 is no longer SILENT, which is a different author experience
    // and must not be understated either. Verified at aeon `9cdf32d8`, not taken
    // on report: `tools/effects_seam_gate.py`'s `raster_seam_faults` appends a
    // fault naming the section for every sidecar `rasterRef` no `preset()`
    // threads, and `fail()` exits 1. The two qualifiers ride with it, because a
    // refusal an author never sees is worse than one they are warned about: the
    // gate is aeon's (nothing here warns) and `FAST=1 ./build.sh` skips it.
    expect(l.body).toMatch(/tools\/effects_seam_gate\.py refuses a full build/i);
    expect(l.body).toMatch(/names the section and the id/i);
    expect(l.body).toMatch(/nothing here warns, and FAST=1 skips that gate/i);
    // The hand-work is a SPLIT plus a line, not "one line per section": sections
    // 6-8 share one `EffectsPreset` record and threading a section-keyed chooser
    // into a shared record is itself a seam-gate refusal, so the old phrasing
    // would send an author to an edit the build rejects.
    expect(l.body).toMatch(/a preset split plus one call-site line/i);
    expect(l.body).toMatch(/costs ROM/i);
    // ⚠ SIXTH CORRECTION, 2026-08-30, AND THE ROWS BELOW WENT RED FIRST. The
    // expiry's first clause fired: aeon `c9a462be` commits section 5's sidecar
    // carrying `ojz_sec5_showcase` (the two files this repo's own handover test
    // authored), so case 1 is now a section that IS bound, not one that could
    // be. The sentence says so — and says, in the same breath, exactly how far
    // "bound" got: to aeon's generator and build (`EditorRaster_OJZ_Act1_
    // Bindings = 1`), and NOT to a frame. Both halves pinned, because a limit
    // that gained the first and lost the second is the promise this file exists
    // to stop.
    expect(l.body).toMatch(/SECTION 5 IS BOUND: aeon's c9a462be commits section_5\.meta\.json/);
    expect(l.body).toMatch(/EditorRaster_OJZ_Act1_Bindings is 1/);
    // ⚠ SEVENTH CORRECTION, 2026-08-30, AND THIS ROW WENT RED FIRST. The
    // has-anyone-seen-it clause was attributed to aeon's `c9a462be` commit
    // message ("nothing has been seen on screen") because that was the only
    // committed artifact that spoke to it. aeon `4a4d3474` then committed the
    // measurement it asked for — `docs/research/reference_captures/
    // 2026-08-30-sec5-band/`, README + CRAM tables + frames + a control — and
    // the row that pinned the "not seen" phrase was red before this line moved.
    //
    // What replaces it is STILL an attribution, and the rows below pin four
    // separate things because each can rot on its own:
    //   • the anchor is the CAPTURES commit, with its directory, and the verb
    //     is MEASURED — not "works", not "plays";
    //   • the VALUES are the artifact's own (README.md and bound-A-sec5.cram.txt
    //     at aeon e6405428): $0EA4 at 40/56/72, $0000 at 8/20/96/150, and the
    //     CONTROL reading $0000 — a rewrite that keeps the verdict and drops
    //     the control has dropped the half that made it a measurement;
    //   • WHERE: aeon's headless oracle-aether instance, not hardware, which
    //     the README says in as many words;
    //   • and the Aurora half, unchanged and still true: no CRAM was sampled
    //     here, and nothing of that frame is visible in this editor.
    expect(l.body).toMatch(/aeon's 4a4d3474 \(2026-08-30, docs\/research\/reference_captures\/2026-08-30-sec5-band\/\) records the section-5 band MEASURED on screen in aeon's emulator capture/);
    expect(l.body).toMatch(/CRAM line 2 entry 8 as \$0EA4 at screen lines 40, 56 and 72 and \$0000 at lines 8, 20, 96 and 150/);
    expect(l.body).toMatch(/two bound runs that agree byte for byte/);
    expect(l.body).toMatch(/\$0000 on every one of those lines on the control ROM built with the sidecar's rasterRef null/);
    expect(l.body).toMatch(/headless oracle-aether instance, not hardware/);
    expect(l.body).toMatch(/no CRAM was sampled here/);
    expect(l.body).toMatch(/nothing of that frame is visible in this editor/);
    // The retired phrase is asserted ABSENT so a revert cannot pass on the
    // kept clauses alone — and so the sentence cannot carry BOTH "not seen"
    // and "measured", which would be two attributions contradicting each other.
    expect(l.body).not.toMatch(/nothing has been seen on screen/);
    expect(l.body).not.toMatch(/and no further/);
    // ⚠ RE-CUT: this used to be `not.toMatch(/band (?:was|has been) (?:seen|
    // measured|observed)/i)`, written against promoting 6e2495a5's left-edge
    // strip into "the band was seen". It stayed GREEN across the retirement
    // above without pinning anything about the new state — a negative that
    // the new wording sidesteps is not a guard. What it must catch now is the
    // DRIFT: every "on screen" in this sentence is either the viewport clause
    // ("changes nothing on screen") or sits inside the clause anchored on the
    // captures commit. A third "on screen" — "you can see it on screen",
    // "visible on screen here" — has no anchor and fails, naming its text.
    const anchorAt = l.body.indexOf("aeon's 4a4d3474");
    expect(anchorAt, 'the captures anchor fell out of LIMIT 1').toBeGreaterThan(0);
    const onScreen = [...l.body.matchAll(/on screen/gi)];
    expect(onScreen.length, 'no "on screen" left to check').toBeGreaterThanOrEqual(2);
    for (const m of onScreen) {
      const tail = l.body.slice(Math.max(0, m.index! - 40), m.index! + 9);
      const isViewportClause = /changes nothing on screen/i.test(tail);
      const isInCaptureClause = m.index! > anchorAt && m.index! - anchorAt < 200;
      expect(isViewportClause || isInCaptureClause,
        `an "on screen" with no attribution: …${tail}`).toBe(true);
    }
    // ...and no clause says the band is seen, shown or drawn HERE. "sampled
    // here" is the one Aurora measurement, and it is a negative.
    expect(l.body).not.toMatch(/band is (?:seen|visible|shown|drawn) (?:here|in this editor)/i);
    expect(l.body).not.toMatch(/(?:seen|measured|observed|rendered) (?:here|in this editor)\b/i);
  });

  /**
   * ⚠ THE EXPIRY IS PART OF THE SENTENCE, NOT OF THE COMMENT AROUND IT.
   *
   * The sentence this replaced named a date and two aeon files, and that is the
   * only reason its retirement was scheduled rather than discovered years late
   * (the files moved; the rows above went red; someone read the expiry). The
   * replacement makes a claim of exactly the same kind — "no call site yet" —
   * so it owes the same treatment, and an author or an agent quoting the
   * constant somewhere this comment does not reach must get the expiry WITH it.
   *
   * Pinned to a revision the reader can check out, not to "recently".
   */
  it('LIMIT 1 carries its own expiry: a revision, what ends it, and what to re-read', () => {
    const l = PRESET_LIMITS.find((x) => x.key === 'unbound')!;
    // ⚠ RE-POINTED AFTER A MATCHER-TRAP CHECK. A bare /aeon 4aa2abc0/ matched
    // LIMIT 2 as well, once its own reachability clause gained the same
    // revision — so this row would have been satisfiable by a DIFFERENT rule's
    // wording. The verb is what makes the anchor this limit's own, and it is
    // kept for the same reason now that the revision has moved — to `9cdf32d8`
    // when the call site landed, to `6e2495a5` (aeon's origin/master the
    // evening `c9a462be` landed the sidecar) when the vacuity clauses expired,
    // and to `e6405428` (their origin/master carrying the captures) when the
    // not-seen clause expired — while LIMIT 2 still names `4aa2abc0`. This row
    // was RED at `/Verified at aeon 9cdf32d8/` and again at `/Verified at aeon
    // 6e2495a5/` before it moved, which is the expiry mechanism working. Both
    // old anchors are asserted absent so a revert cannot pass on kept phrases.
    expect(l.body).toMatch(/Verified at aeon e6405428/);
    expect(l.body).not.toMatch(/Verified at aeon 6e2495a5/);
    expect(l.body).not.toMatch(/Verified at aeon 9cdf32d8/);
    // ⚠ THE EXPIRY IS SEVEN-WAY NOW, because the sentence makes seven
    // falsifiable claims and each fails differently. TWO clauses are SPENT and
    // must not reappear — "a sidecar in aeon's tree actually carries a
    // rasterRef" (fired at `c9a462be`) and "a committed aeon artifact records
    // the section-5 band measured on screen" (fired at `4a4d3474`): an expiry
    // naming an event that has already happened is one nobody will ever see
    // fire again. What replaced the second is what would falsify the CITATION:
    // the captures leaving aeon's tree or their README changing its story, or
    // a later measurement of section 5 saying something else.
    expect(l.body).not.toMatch(/EXPIRES when a sidecar in aeon's tree actually carries a rasterRef/);
    expect(l.body).not.toMatch(/when a committed aeon artifact records the section-5 band measured on screen/i);
    expect(l.body).toMatch(/EXPIRES when a second section is threaded/i);
    expect(l.body).toMatch(/when sec: 5 becomes another index/i);
    expect(l.body).toMatch(/when section 5's sidecar stops naming ojz_sec5_showcase/i);
    expect(l.body).toMatch(/stops refusing the unthreaded case or build\.sh runs it under FAST=1/i);
    expect(l.body).toMatch(/when docs\/research\/reference_captures\/2026-08-30-sec5-band\/ leaves aeon's tree or its README stops saying what is quoted here/i);
    expect(l.body).toMatch(/when a later aeon measurement of section 5 records something else/i);
    expect(l.body).toMatch(/when this viewport learns to composite a rasterRef/i);
    expect(l.body).toMatch(/owner: aeon's lane for all but the last, which is Aurora's/i);
    // The arm's LIVE SUBJECT is part of the sentence, not of the comment around
    // it — it used to say the arm was vacuous and printed that it was, and an
    // author quoting the constant elsewhere must get the new state with it: one
    // sidecar, checked against the threaded set. The retired phrasing is
    // asserted ABSENT so a revert cannot pass on the kept clauses alone.
    expect(l.body).toMatch(/exactly one sidecar carries the key \(section 5's\)/i);
    expect(l.body).toMatch(/the seam gate's section arm is no longer vacuous/i);
    expect(l.body).toMatch(/counts 1 sidecar rasterRef and checks it against the threaded set/i);
    expect(l.body).not.toMatch(/arm is vacuous and prints that it is/i);
    expect(l.body).not.toMatch(/no section number here has been exercised end to end/i);
    // The files to re-read are named IN the sentence, not left to the reader —
    // the seam gate because "no longer silent" is a falsifiable claim about a
    // file that can change, and the SIDECAR DIRECTORY now, because "which
    // sidecars carry the key" stopped being a vacuity and became a live answer.
    expect(l.body).toMatch(/re-read games\/sonic4\/data\/effects\/ojz_effects\.emp/i);
    expect(l.body).toMatch(/re-read games\/sonic4\/data\/editor\/ojz\/act1\/ for which sidecars carry rasterRef/i);
    expect(l.body).toMatch(/re-read tools\/effects_seam_gate\.py/i);
    expect(l.body).toMatch(/tools\/effects_gen\.py/i);
    // ...and the CAPTURES README now, because the sentence quotes it and a
    // quote of a file that can change is a claim with a re-read.
    expect(l.body).toMatch(/re-read docs\/research\/reference_captures\/2026-08-30-sec5-band\/README\.md for what was measured and what it says was not/i);
  });

  /**
   * ⚠ EIGHTH FACT, 2026-08-30 (O62), AND THIS ROW WAS RED BEFORE THE SENTENCE
   * MOVED. The seven corrections above are all about how far ONE binding
   * travels. This one is about the TREE an author leaves behind: at aeon
   * `origin/master` `027ec162` three CONTENT tests in `build.sh`'s pytest lane
   * accept exactly one bound set — section 5 → `ojz_sec5_showcase` — and refuse
   * every other by name. The select's empty option on section 5 produces the
   * tree aeon's own README says could only be built with `FAST=1`; a pick on
   * any other section fails the exact-`[5]` assertion. The control is NOT
   * gated and NOT confirmed (the STANDING REFUSAL in raster-binding.ts): the
   * author reads it here, in the block that renders above the select.
   *
   * Pinned on the PANEL's sentence (`PRESET_LIMITS.unbound`), not the constant,
   * so a panel that stopped reading the constant fails here on the words an
   * author would miss. The matchers are the claims an author acts on: which
   * state is accepted, which tests refuse, what their messages say, when the
   * refusal runs and when it does not, that nothing here prevents the write,
   * and the expiry. The negatives catch the two wrong rewrites — a gate on
   * this side, or the refusal attributed to the FAST=1 build.
   */
  it('LIMIT 1 discloses that aeon\'s full build refuses any tree but section 5 → ojz_sec5_showcase', () => {
    const l = PRESET_LIMITS.find((x) => x.key === 'unbound')!;
    expect(l.body).toMatch(/AND THE BOUND SET ITSELF IS PINNED BY AEON'S FULL BUILD/);
    expect(l.body).toMatch(/read at aeon 027ec162 \(2026-08-30\)/);
    expect(l.body).toMatch(/section 5 bound to ojz_sec5_showcase is the ONLY state aeon's canonical build accepts/);
    expect(l.body).toMatch(/tools\/test_effects_seam_gate\.py::TestRasterSeamAgainstTheRealTree::test_the_bound_sections_are_exactly_the_threaded_ones/);
    expect(l.body).toMatch(/test_section_5_is_the_bound_one_and_its_id_is_the_shipped_document/);
    expect(l.body).toMatch(/tools\/test_raster_cycle_table_lint\.py::test_every_preset_document_is_REACHABLE/);
    // The unbind, in the author's terms — the select's own option is named.
    expect(l.body).toMatch(/UNBINDING SECTION 5 — null from this tool, or the select's Hand-authored raster option/);
    expect(l.body).toMatch(/leaves the bound set empty and the document ojz_sec5_showcase\.json orphaned/);
    expect(l.body).toMatch(/"no sidecar carries a rasterRef — step 6's band is gone"/);
    expect(l.body).toMatch(/"the bound sections are \[\], not \[5\]"/);
    expect(l.body).toMatch(/reachable by NOTHING: \['ojz_sec5_showcase'\]/);
    expect(l.body).toMatch(/BINDING ANY OTHER SECTION, beside 5 or instead of it, fails the exact-\[5\] assertion/);
    expect(l.body).toMatch(/runs only in the canonical FAST=0 build: FAST=1 sets NO_LINT=1, the pytest lane sits under NO_LINT, and FAST=1 builds the tree/);
    expect(l.body).toMatch(/NOTHING HERE PREVENTS THE WRITE/);
    expect(l.body).toMatch(/THAT CLAUSE EXPIRES when the \[5\] literal in test_section_5_is_the_bound_one_and_its_id_is_the_shipped_document changes/);
    expect(l.body).toMatch(/or when a second binding ships — owner: aeon's lane/);
    expect(l.body).not.toMatch(/(?:this editor|Aurora|the panel|this tool|the select) (?:refuses|prevents|blocks|greys out|disables)/i);
    expect(l.body).not.toMatch(/FAST=1 (?:also )?(?:refuses|rejects)/i);
    expect(l.body).not.toMatch(/FAST=0 builds (?:it|the tree)/i);
  });

  /**
   * ⚠ THE MATCHER TRAP, GATED RATHER THAN REMEMBERED. It has been hit twice on
   * this surface: a bare `/aeon 4aa2abc0/` turned out to match LIMIT 2 as well,
   * so a row meant to pin LIMIT 1's expiry was satisfiable by a DIFFERENT rule's
   * wording — coverage that reports forever without having any. The case split
   * makes that worse, not better: LIMIT 1 now says "section", "band", "aeon" and
   * "build" in more places, and every one of those is a phrase LIMIT 2 could
   * grow.
   *
   * So the anchors the rows above stand on are asserted to be LIMIT 1's ALONE.
   * A phrase that leaks into another limit fails HERE, naming the limit it
   * leaked into, instead of quietly making one of those rows vacuous.
   */
  it('LIMIT 1\'s case-split anchors match LIMIT 1 and nothing else on this surface', () => {
    const anchors = [
      /ONLY SECTION 5 IS WIRED/,
      /ojz_act1_sec_raster\(sec: 5, hand: Raster_Program_None\)/,
      /leaving section 5 unbound resolves to that hand: label/i,
      /BINDING ANY OTHER SECTION STILL REACHES NOTHING/,
      /tools\/effects_seam_gate\.py refuses a full build/i,
      /nothing here warns, and FAST=1 skips that gate/i,
      /a preset split plus one call-site line/i,
      /for section 5 as much as for any other/i,
      /Verified at aeon e6405428/,
      /the seam gate's section arm is no longer vacuous/i,
      /SECTION 5 IS BOUND: aeon's c9a462be commits section_5\.meta\.json/,
      /aeon's 4a4d3474 \(2026-08-30, docs\/research\/reference_captures\/2026-08-30-sec5-band\/\) records the section-5 band MEASURED on screen/,
      /nothing of that frame is visible in this editor/,
      // O62's disclosure anchors. LIMIT 2 also says "aeon's build fails
      // loudly" about reachability, so these are the phrases LIMIT 2 must not
      // grow into.
      /AND THE BOUND SET ITSELF IS PINNED BY AEON'S FULL BUILD/,
      /read at aeon 027ec162/,
      /UNBINDING SECTION 5/,
      /test_section_5_is_the_bound_one_and_its_id_is_the_shipped_document/,
      /NOTHING HERE PREVENTS THE WRITE/,
    ];
    const unbound = PRESET_LIMITS.find((x) => x.key === 'unbound')!.body;
    const others = [
      PRESET_HEADLINE, NO_PREVIEW,
      ...PRESET_LIMITS.filter((x) => x.key !== 'unbound').flatMap((x) => [x.title, x.body]),
    ];
    for (const re of anchors) {
      // ANTI-VACUOUS FIRST: an anchor that has fallen out of the constant would
      // otherwise pass the uniqueness half trivially.
      expect(re.test(unbound), `${re} no longer appears in LIMIT 1 at all`).toBe(true);
      for (const s of others) {
        expect(re.test(s), `${re} ALSO matches: ${s.slice(0, 70)}`).toBe(false);
      }
    }
  });

  /**
   * ONE SENTENCE, NOT A COPY OF ONE. The panel, the agent reply and the
   * published tool descriptions all owe this limit, and two hand-written
   * near-identical sentences is how a limit ends up stated two different ways
   * (core/formats/bg-binding.ts says so in as many words). The constant lives
   * in core/ because main/ must not import the renderer.
   */
  it('LIMIT 1 IS the shared constant, not a second wording of it', () => {
    const l = PRESET_LIMITS.find((x) => x.key === 'unbound')!;
    expect(RASTER_SECTION_BINDING_LIMIT.length,
      'the shared constant is empty — this row would assert nothing').toBeGreaterThan(200);
    expect(l.body).toBe(RASTER_SECTION_BINDING_LIMIT);
  });

  /**
   * Limit 2. Two halves: seeing it costs a debug chord, AND the cycle table is
   * hand-typed so a new document does not appear in it. The second half is the
   * one that surprises people, and it comes with its own consolation (the build
   * fails loudly rather than silently), which must survive too — without it the
   * limit reads as "and it might silently not work", which is worse than true.
   *
   * ⚠ THE CONSOLATION WAS NARROWED AT aeon `4aa2abc0` AND THE ROW NOW GATES IT.
   * aeon's reachability check used to fire when a preset had no table ROW; a
   * section binding is a second installer now, so it fires only when a document
   * has NEITHER. Ungated, that clause could quietly drift back to the stronger
   * claim and send an author who bound a preset off to add a row they do not
   * need — a real action taken on a wrong sentence, which is what these rows
   * exist to stop.
   */
  it('LIMIT 2 says seeing it is a debug chord AND the table is hand-typed', () => {
    const l = PRESET_LIMITS.find((x) => x.key === 'debug_chord')!;
    expect(l.body).toMatch(/START/);
    expect(l.body).toMatch(/hand-typed dc\.l list/);
    expect(l.body).toMatch(/does not add itself/i);
    expect(l.body).toMatch(/fails loudly/i);
    expect(l.body).toMatch(/neither a table row nor a section binding/i);
  });

  /** Limit 3. "Builds green and shows nothing" is the sentence that lands. */
  it('LIMIT 3 says nothing checks a band is visible', () => {
    const l = PRESET_LIMITS.find((x) => x.key === 'unchecked_visibility')!;
    expect(l.body).toMatch(/builds green and shows nothing/i);
    expect(l.body).toMatch(/unused palette entry/i);
  });

  /**
   * The headline is aeon's accurate sentence, and the point of quoting it is
   * that the panel says what an author CAN do. A limits block with no headline
   * is a scolding, which the brief rules out as firmly as it rules out the lie.
   */
  it('the headline is the accurate sentence, not the inaccurate one', () => {
    expect(PRESET_HEADLINE).toMatch(/An author can author a raster band/);
    expect(PRESET_HEADLINE).toMatch(/programmer wires it up in one line/);
  });

  /**
   * ⚠ NOBODY HAD EVER LOOKED AT ONE OF THESE BANDS ON SCREEN when this was
   * written, and `NO_PREVIEW` said so. The absence of a preview must be
   * EXPLAINED, because an empty space reads as "coming soon" rather than
   * "there is no ground truth".
   *
   * ⚠ RETIRED 2026-08-30 (O64), AND THE OLD ROW WENT RED FIRST. aeon
   * `4a4d3474` committed exactly such a capture
   * (`docs/research/reference_captures/2026-08-30-sec5-band/`: README
   * "VERDICT: BAND SEEN", CRAM line 2 entry 8 `$0EA4` at lines 40/56/72 and
   * `$0000` at 8/20/96/150 in one frame, two headless `oracle-aether`
   * instances byte-identical, `$0000` everywhere on the control), so "never
   * been looked at on screen anywhere in this suite" became false. The row
   * that pinned that phrase was red on the constant-only edit before any line
   * here moved. What replaced it is FOUR rows, not one, because the sentence
   * now carries four things that rot independently — and the whole hazard of
   * citing a measurement is that "aeon measured a frame" drifts into "you can
   * preview it here":
   *   • the ANCHOR — the captures commit, its directory, and WHERE (aeon's
   *     emulator) — which a citation-dropping rewrite loses;
   *   • the SCOPE — ONE frame, section 5, one camera position, not in this
   *     tree — which a "the band has been verified" rewrite loses;
   *   • the KEPT HALF — this editor draws no band, nothing sampled CRAM here,
   *     nothing to draw a faithful preview from, none is built — which a
   *     "preview coming soon" rewrite loses;
   *   • the EXPIRES list, dated, with an owner per half.
   * Plus a per-sentence DRIFT loop, because a positive pin on the kept half
   * stays green when a fifth sentence is appended after it.
   */
  describe('NO_PREVIEW, after the not-seen premise expired at aeon 4a4d3474', () => {
    it('cites the one measured frame: the captures commit, its directory, and aeon\'s emulator', () => {
      expect(NO_PREVIEW).toMatch(/aeon 4a4d3474 \(2026-08-30\), docs\/research\/reference_captures\/2026-08-30-sec5-band\//);
      expect(NO_PREVIEW).toMatch(/in aeon's emulator/);
      // The VALUES are the README's own, and the control is what made it a
      // measurement rather than a picture.
      expect(NO_PREVIEW).toMatch(/CRAM line 2 entry 8 reading \$0EA4 inside the band and \$0000 outside it and on the control/);
      // The retired phrase is asserted ABSENT so a revert cannot pass on the
      // kept clauses, and so the sentence cannot carry both "never" and "one".
      expect(NO_PREVIEW).not.toMatch(/never been looked at/i);
      expect(NO_PREVIEW).not.toMatch(/anywhere in this suite/i);
    });

    it('scopes it to ONE frame of section 5 at one camera position, in aeon\'s tree and not this one', () => {
      expect(NO_PREVIEW).toMatch(/ONE measured frame, in aeon's tree and not in this one/);
      expect(NO_PREVIEW).toMatch(/section 5 at one camera position/);
      // Not "sections", not "every camera position", not "verified".
      expect(NO_PREVIEW).not.toMatch(/\bverified\b|\bworks\b|\bplays\b|every camera/i);
    });

    it('keeps the half that is still true here: draws no band, nothing to preview from, none built', () => {
      expect(NO_PREVIEW).toMatch(/^No preview\. This editor draws no band: the viewport composites no rasterRef, and nothing in Aurora has sampled CRAM/);
      expect(NO_PREVIEW).toMatch(/nothing to draw a faithful preview from/i);
      expect(NO_PREVIEW).toMatch(/an unfaithful one would be worse than none/);
      expect(NO_PREVIEW).toMatch(/A preview here could at most be checked against that one frame; none is built\./);
    });

    it('carries a dated EXPIRES list with an owner per half', () => {
      expect(NO_PREVIEW).toMatch(/Expires \(2026-08-30\):/);
      expect(NO_PREVIEW).toMatch(/when that directory leaves aeon's tree or its README stops saying so/);
      expect(NO_PREVIEW).toMatch(/a second section or camera position is measured \(aeon's lane\)/);
      // Content, not position: the drift loop below owns "nothing after it".
      expect(NO_PREVIEW).toMatch(/when this editor draws a band \(Aurora's\)\./);
    });

    /**
     * THE DRIFT LOOP. Every positive pin above is satisfied by a sentence that
     * ALSO says "You can preview it here." somewhere after them. So each
     * sentence is checked on its own: none may address the reader with "you
     * can", and any sentence that speaks of HERE or THIS EDITOR must be one of
     * the negatives (draws no band / could at most / none is built / not in
     * this one) or the expiry list — a sentence that names the editor and
     * promises something is the drift, and it fails naming its text.
     */
    it('no sentence of it says a band can be previewed or seen HERE', () => {
      const sentences = NO_PREVIEW.split(/(?<=[.!?])\s+/);
      expect(sentences.length, 'NO_PREVIEW has collapsed to fewer than four sentences').toBeGreaterThanOrEqual(4);
      for (const s of sentences) {
        expect(s, s).not.toMatch(/\byou can\b|\bas you\b|\byou will\b/i);
        if (/\bhere\b|this editor|this one\b/i.test(s)) {
          const isNegative = /draws no band|could at most|none is built|not in this one/i.test(s);
          const isExpiry = /^Expires \(/.test(s);
          expect(isNegative || isExpiry, `a sentence names this editor and promises something: ${s}`).toBe(true);
        }
      }
    });

    /**
     * A DIFFERENT SENTENCE FROM LIMIT 1, kept that way. LIMIT 1 owns where a
     * binding stops; this owns why there is nothing to preview against. The
     * anchor-uniqueness row above already proves none of LIMIT 1's anchors
     * match this string; this row proves it is the SHORTER of the two and not
     * the same string, so the two cannot quietly merge.
     */
    it('is shorter than RASTER_SECTION_BINDING_LIMIT and is not it', () => {
      expect(NO_PREVIEW.length, 'NO_PREVIEW is too short to be carrying its clauses').toBeGreaterThan(300);
      expect(NO_PREVIEW.length).toBeLessThan(RASTER_SECTION_BINDING_LIMIT.length);
      expect(NO_PREVIEW).not.toBe(RASTER_SECTION_BINDING_LIMIT);
    });
  });

  it('no string on this surface claims anyone has seen a band render', () => {
    const strings = [
      PRESET_HEADLINE, NO_PREVIEW,
      ...PRESET_LIMITS.flatMap((l) => [l.title, l.body]),
      lastBandRefusal(newPreset('probe'))!,
      ...armOptions(null).map((o) => o.title),
    ];
    for (const s of strings) {
      expect(s, s).not.toMatch(/\bas you (?:can )?see\b|\blooks like\b|\bwill look\b|\bon screen you\b/i);
      // "preview" may appear ONLY in the sentence saying there is not one.
      if (/preview/i.test(s)) expect(s, s).toBe(NO_PREVIEW);
    }
  });
});

describe('the panel renders the limits, unconditionally, in the body', () => {
  it('mounts LimitBlock with no guard in front of it', () => {
    // The render call really is there, in CODE and not in a comment.
    expect(code).toMatch(/<LimitBlock\s*\/>/);
    // ...and it is not behind a conditional. A limit shown only when a preset
    // exists is a limit an author meets AFTER deciding to author one.
    const line = code.split('\n').find((l) => /<LimitBlock\s*\/>/.test(l))!;
    expect(line).not.toMatch(/&&|\?|selected|entries\.length/);
  });

  it('LimitBlock reads the provider, and does not retype the sentences', () => {
    expect(code).toMatch(/presetLimitsShort\(\)\.map/);
    expect(code).toMatch(/\{PRESET_HEADLINE\}/);
    expect(code).toMatch(/\{NO_PREVIEW_SHORT\}/);
    // The bodies must reach the render, not just the titles.
    expect(code).toMatch(/\{l\.body\}/);
  });

  /**
   * ⚠ THE RULING THIS FILE OPENED WITH WAS AMENDED, NOT ABANDONED — EFFECTS-W1
   * defect 3, and the amendment is worth stating because the old rows read as
   * an absolute.
   *
   * The old rule was "the limits render IN FULL, always visible, never a
   * tooltip", and its reason still stands: a limit behind a hover is a limit
   * the panel does not carry. What was measured is that the FULL wording is
   * 8,059 characters in a 285px column — about seven minutes of reading, citing
   * four aeon SHAs and three pytest names — standing between an author and the
   * first control. A limit nobody reaches the bottom of is also a limit the
   * panel does not carry.
   *
   * So the amendment splits AUDIENCE, not visibility: every limit still renders
   * VISIBLY and unconditionally, at author length; the contract-length wording
   * (owed to the agent reply and the published tool descriptions, and pinned by
   * the rows above) is reachable on the same element's `title` and in full in
   * the guide. The rows below hold that split from BOTH sides — the short text
   * must be painted, and the long text must still be reachable — so neither
   * half can quietly become the other.
   */
  it('every contract limit has an author-length sibling — none can be dropped', () => {
    const short = presetLimitsShort();
    expect(short.map((l) => l.key)).toEqual(PRESET_LIMITS.map((l) => l.key));
    for (const l of short) {
      // Two sentences, not two paragraphs, and not empty.
      expect(l.body.length, `${l.key} is empty`).toBeGreaterThan(40);
      expect(l.body.length, `${l.key} is not author-length`).toBeLessThan(320);
      // The contract wording is CARRIED, verbatim, not paraphrased away.
      expect(l.full).toBe(PRESET_LIMITS.find((x) => x.key === l.key)!.body);
    }
  });

  it('the cut is real: the PAINTED block is a fraction of the contract text', () => {
    const painted = PRESET_HEADLINE.length
      + presetLimitsShort().reduce((n, l) => n + l.title.length + 2 + l.body.length, 0)
      + NO_PREVIEW_SHORT.length;
    const contract = PRESET_HEADLINE.length
      + PRESET_LIMITS.reduce((n, l) => n + l.title.length + 2 + l.body.length, 0)
      + NO_PREVIEW.length;
    // MEASURED BOTH SIDES HERE, not quoted from a report: 8,059 -> ~1,000 at
    // the landing. The bound is generous so ordinary wording edits do not fail
    // it, and tight enough that the 6,508-character `unbound` body coming back
    // into the render does.
    expect(contract, `the contract text is only ${contract} chars — has it been cut instead `
      + 'of moved? It is owed to the agent reply and the tool descriptions').toBeGreaterThan(6000);
    expect(painted, `the painted block is ${painted} chars against a contract ${contract}`)
      .toBeLessThan(2000);
  });

  /**
   * ⚠ THE PLACEMENT ROW FOR O62's DISCLOSURE, AND IT IS STRONGER THAN THE ONE
   * ABOVE ON PURPOSE. "No guard on the `<LimitBlock />` line" is satisfied by a
   * guard on the line BEFORE it —
   *
   *     {!section?.rasterRef && (
   *       <LimitBlock />
   *     )}
   *
   * — which is exactly the shape a well-meant edit takes when it decides an
   * author on a BOUND section has already read the block. That is the case the
   * disclosure exists for: the author about to unbind section 5 is the one
   * standing on a bound section. So this row asserts the STRUCTURE — the block
   * is the first thing inside the section body, with no expression between,
   * and `LimitBlock` takes no props and renders whole bodies — rather than the
   * text of one line.
   */
  it('the disclosure reaches the render whether or not the active section is bound', () => {
    const body = code.indexOf('<SectionBody>');
    const block = code.indexOf('<LimitBlock');
    expect(body, 'no <SectionBody> in the stripped source').toBeGreaterThan(0);
    expect(block, 'no <LimitBlock in the stripped source').toBeGreaterThan(body);
    // Nothing but whitespace between the body's opening tag and the block:
    // no `{`, no `&&`, no `?`, nothing that reads `section` or `rasterRef`.
    const between = code.slice(body + '<SectionBody>'.length, block);
    expect(between.trim(), `something sits between <SectionBody> and <LimitBlock>: ${between.trim()}`).toBe('');
    // The block takes no props — a `bound`/`section` prop is the same guard
    // moved one level down — and renders each body whole, keyed on nothing.
    expect(code).toMatch(/function LimitBlock\(\): React\.ReactElement/);
    const fnStart = code.indexOf('function LimitBlock');
    const fnEnd = code.indexOf('export default function BandPresetPanel');
    expect(fnEnd).toBeGreaterThan(fnStart);
    const fn = code.slice(fnStart, fnEnd);
    expect(fn).toMatch(/\{l\.body\}/);
    expect(fn).not.toMatch(/rasterRef|section|bound|\.slice\(|\.replace\(|\.split\(|indexOf\(/);
  });

  it('the limits are BODY TEXT, not a title= attribute', () => {
    // The failure this rules out is unchanged: the thing an author must READ
    // cannot be hover-only. `l.body` is the SHORT wording now, and it is what
    // must be painted.
    expect(code).not.toMatch(/title=\{(?:l|limit)\.body\}/);
    expect(code).not.toMatch(/title=\{NO_PREVIEW_SHORT\}/);
    expect(code).not.toMatch(/title=\{PRESET_HEADLINE\}/);
  });

  it('and the contract wording is still REACHABLE, on the same elements', () => {
    // The other half of the split. Deleting these two would turn a move into a
    // deletion, which is the failure the amendment above is at pains not to be.
    expect(code).toMatch(/title=\{l\.full\}/);
    expect(code).toMatch(/title=\{NO_PREVIEW\}/);
    // ...and the guide carries it as prose, from the card it is about.
    expect(code).toMatch(/openGuide\(EFFECTS_GUIDE_SLUG, GUIDE_ANCHORS\.rasterBand\)/);
  });
});

describe('the panel spells no rule of its own', () => {
  /**
   * The brief's rule, and `tableRefParamOptions`' idiom: a predicate and its
   * sentence come from ONE source that both the control and the advisory read.
   * A comparison written in the component is a rule the advisory beside it can
   * disagree with — which is how a disabled button ends up with a reason that
   * describes a different condition.
   */
  it('does not re-compare a band count the provider already owns', () => {
    // `lastBandRefusal` owns "at least one band". The component must not
    // independently test a length against 1.
    expect(code).not.toMatch(/bands\.length\s*[<>=]=?\s*1/);
    expect(code).toMatch(/lastBandRefusal\(/);
  });

  it('does not restate the id pattern it could import', () => {
    expect(code).not.toMatch(/\[a-z\]\[a-z0-9_\]/);
    expect(code).toMatch(/presetIdRefusal\(/);
  });

  /**
   * NO CLAMP AND NO min/max ON THE LINE SPINNERS. aeon's §E.4: "Do not validate
   * ranges, and do not clamp. Forward what the author typed", so the author
   * reads the ENGINE's refusal with the measurement behind it. A `min=`/`max=`
   * here is the clamp that ruling forbids wearing an HTML attribute's hat.
   */
  it('puts no range on the band spinners — aeon E.4', () => {
    const numberFields = [...code.matchAll(/<NumberField[\s\S]*?\/>/g)].map((m) => m[0]);
    // ANTI-VACUOUS: there really are spinners to check.
    expect(numberFields.length).toBeGreaterThanOrEqual(3);
    for (const f of numberFields) {
      expect(f, f).not.toMatch(/\bmin=/);
      expect(f, f).not.toMatch(/\bmax=/);
    }
    expect(code).not.toMatch(/clamp/i);
  });
});

describe('the narrowed control carries its reason', () => {
  /**
   * The one refusal on the surface, and it passes `tableRefParamOptions`' own
   * strictness test in the disabling direction: NO document content can make a
   * zero-band preset legal — `bands` is `minItems: 1` unconditionally — so the
   * button withholds nothing the build would have taken.
   */
  it('the last band cannot be removed, and the sentence says why', () => {
    const one = newPreset('probe');
    expect(one.bands).toHaveLength(1);
    const why = lastBandRefusal(one);
    expect(why).toMatch(/at least one/i);
    expect(why).toMatch(/zero-band program/i);
    // EFFECTS-W1 defect 7: the sentence NAMES the preset it is about, so a
    // reader who meets it in a column of several cards knows which.
    expect(why).toMatch(/^preset "probe":/);

    // ...and with two bands the refusal lifts, so this is a condition and not
    // a permanent wall.
    one.bands!.push(one.bands![0]);
    expect(lastBandRefusal(one)).toBeNull();
  });

  /**
   * The ARM picker disables NOTHING among the declared arms, and that is the
   * answer rather than an omission: both are legal in every document, so
   * `tableRefParamOptions`' test forbids disabling either.
   */
  it('offers both arms enabled — neither is refusable by document content', () => {
    const opts = armOptions('cram');
    expect(opts.map((o) => o.value)).toEqual(['cram', 'pal_region']);
    expect(opts.every((o) => !o.disabled)).toBe(true);
  });

  /**
   * But an arm a FILE already carries that the schema does not declare IS
   * rendered, disabled, with the reason — the quiet lie `unassignableSceneRef`
   * exists to stop. A `<select>` whose current value has no option silently
   * shows a different one, and here the author would read `cram` off a file
   * holding something else.
   */
  it('renders an unknown arm the file carries, disabled, carrying why', () => {
    const opts = armOptions('vsram');
    const stray = opts.find((o) => o.value === 'vsram');
    expect(stray, 'an unknown arm the file carries was dropped from the picker').toBeDefined();
    expect(stray!.disabled).toBe(true);
    expect(stray!.title).toMatch(/is not an ON arm/);
    // The declared arms are still offered and still enabled beside it.
    expect(opts.filter((o) => !o.disabled).map((o) => o.value)).toEqual(['cram', 'pal_region']);
  });

  it('the create refusal explains the id rule rather than just refusing', () => {
    const empty = { presets: [], unreadable: [], notices: [], loadedPaths: [] };
    expect(presetIdRefusal('Bad-Id', empty)).toMatch(/lower case/);
    expect(presetIdRefusal('Bad-Id', empty)).toMatch(/\.emp symbol/);
    expect(presetIdRefusal('good_id', empty)).toBeNull();
  });

  /**
   * The id that is taken by an UNREADABLE file gets its own sentence, because
   * the consequence is different: creating it would, at save, write over a file
   * the author still needs to fix.
   */
  it('refuses an id taken by a file that exists and will not parse', () => {
    const lib = {
      presets: [],
      unreadable: [{ path: 'games/sonic4/data/editor/effects/presets/broken.json', reason: 'x' }],
      notices: [], loadedPaths: [],
    };
    expect(presetIdRefusal('broken', lib)).toMatch(/exists but could not be read/);
    expect(presetIdRefusal('broken', lib)).toMatch(/would destroy it/);
  });
});
