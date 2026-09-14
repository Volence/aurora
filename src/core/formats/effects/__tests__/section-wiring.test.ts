// WHICH SECTIONS CAN CARRY A RASTER BAND — the derivation, against aeon's own files.
//
// ═══ WHY THIS FILE READS A REAL CHECKOUT AND NOT ONLY FIXTURES ═══
//
// The question this derivation answers was answered wrong three times on
// 2026-09-02, and EVERY wrong answer was produced by an instrument that was
// never run against the real text: one came from prose in Aurora's own panel,
// one from a parse that windowed to 800 characters after each `sec: N` and so
// missed section 0's `effects:` at offset 964. A WINDOW THAT FINDS NOTHING AND
// A FIELD THAT DOES NOT EXIST PRINT THE SAME THING.
//
// So the rows below run the parser over aeon's ACTUAL `act_descriptor.emp` and
// `ojz_effects.emp`, read at a pinned revision out of aeon's object database,
// and are SKIPPED WITH A REASON when that revision cannot be reached — never
// quietly passed on fixtures alone. The fixtures are here too, for the shapes
// the real tree cannot produce.
//
// ⚠ WHAT THE NUMBERS BELOW ARE. `[0..8]`, `{OJZ_Preset_Sec5: 5, OJZ_Preset_Sec6: 6}`
// and the rest are NOT the contract and are not a list this repository holds —
// they are what the parse returns at `AEON_PIN`, asserted here so a broken
// parser is distinguishable from a correct one on real text. Since 2026-09-13
// they no longer move when aeon moves (see the WHICH BYTES banner below): a
// changed aeon is the REGIONS work's currency row, not these. The PRODUCT never
// sees a literal: it renders whatever the parse returned on this load.

// ═══ WHICH BYTES: a PINNED aeon revision, never that lane's working tree ═══
//
// (2026-09-13, docs/reviews/2026-09-13-section-wiring-off-live-aeon.md; review
// bar 19, "A TEST MUST NOT READ A PEER REPO'S WORKING TREE".) Until this date the
// two "against aeon's real ojz/act1" blocks opened `act_descriptor.emp` and
// `ojz_effects.emp` BY PATH inside aeon's live checkout. aeon `1a657990`
// (2026-09-13, "regions-p1 step 4: delete the section identity fields") took
// `effects:` and `sec:` off every `ojz_sec(...)` row, the lane moved its
// checkout, and 8 rows here went red with no aurora commit at all: their colour
// had always been decided in someone else's directory.
//
// SO THOSE ROWS NOW READ `AEON_PIN` THROUGH GIT OBJECTS (`test/support/peer-repo.ts`):
// `git -C <aeon> show <pin>:<path>`. aeon's working tree is never opened and never
// written to. They record a HISTORICAL reading, the cold read and the arm ruling
// as they stood before regions, and at a fixed revision that reading is a
// property of THIS repo's parser, which is what they can honestly still assert.
//
// ⚠ WHAT THEY NO LONGER DO, SAID SO NOBODY READS THEM AS COVER FOR IT. A pinned
// blob equals itself forever, so these rows CANNOT tell you whether the parser
// still understands aeon's CURRENT files. On 2026-09-13 it did not: against aeon
// `origin/master` after regions the old reader found no records at all and the
// load marked the descriptor unread (measured in the packet above).
//
// ⚠ AMENDED 2026-09-14 (SECTIONS-0-7-UNBARRED-AFTER-REGIONS,
// docs/reviews/2026-09-14-sections-0-7-regions-reader.md). The reader now pairs
// each `effects:` with the `sec:` inside its own call, which reads the region
// rows, and the currency rows this paragraph said were owed are the LAST block
// of this file. They read `AEON_REGIONS_PIN`, a second committed revision, and
// derive their expectations with instruments that share no code with the
// reader. The pre-regions rows above them still read `AEON_PIN` and are
// unchanged except for row 8's anti-vacuous line.
//
// The one row in these blocks that IS a currency question, "the channel TABLE
// still matches aeon's SECTION_CHANNELS", reads `AEON_TIP` (origin/master) at a
// COMMITTED revision instead of the pin, because a pin could never answer it.

import { describe, it, expect } from 'vitest';
import { existsSync } from 'node:fs';
import {
  descriptorEffectsBindings, libraryRasterChooserCalls, rasterChooserName, wiringPaths,
  unknownWiring, sectionRasterState, sectionRasterAdvisory, sectionSharers,
  wiredSections, eligibleSections, sectionWiringConditions, threadedSections,
  ownPresetSections, boundSections, sectionConditionsAgreeWithState, libraryChannelCalls,
  libraryChannelChooserCalls, channelChooserName, sectionExtraChannelsCondition,
  libraryPatchedArmBindings, sectionArmExclusivity, sectionArmExclusivityRefusal,
  sectionArmExclusivityUnknownNotice, armBarredSections, sectionBindingControlDisabled,
  extraChannelsAdvisory, EXTRA_SECTION_CHANNELS, type SectionRasterWiring,
  descriptorEffectsRows, readDescriptorWiring,
} from '../section-wiring';
import { siblingPathOrUnresolved, siblingPathSource } from '../../../../../test/support/sibling-root.mjs';
import { peerRepo, resolveRev, readAtRev } from '../../../../../test/support/peer-repo';
import {
  announceFixture, READ_MODES,
} from '../../../../../scratchpad/lib/fixture-provenance.mjs';

const AEON = siblingPathOrUnresolved('aeon');
/** aeon-repo-relative, because these go to `git show <rev>:<path>` and nothing else. */
const DESC_REL = 'games/sonic4/data/levels/ojz/act1/act_descriptor.emp';
const LIB_REL = 'games/sonic4/data/effects/ojz_effects.emp';
const GEN_REL = 'tools/effects_gen.py';

/**
 * THE AEON REVISION THE HISTORICAL ROWS READ. A full SHA, so it cannot move.
 *
 * DERIVED FROM `git log`, NOT GUESSED (2026-09-13, against aeon `origin/master`
 * `55c062a4`):
 *   `git -C <aeon> log -- <act_descriptor.emp> <ojz_effects.emp> <effects_gen.py>`
 *   names `1a657990` as the commit that deleted `ojz_sec`'s `effects:` and `sec:`
 *   and as the LAST commit to touch any of the three; `git log 1a657990..origin/master`
 *   over the same paths is empty. `1a657990` has exactly one parent, `31c0ddd8`,
 *   and is an ancestor of `origin/master`. So `31c0ddd8` is the newest revision
 *   whose three blobs are the pre-regions ones (act_descriptor `cf8a860b`,
 *   ojz_effects `1506943c`, effects_gen `67f5f2db`, byte-identical to their
 *   last-touching commit `b048f571`), and every revision after it carries the
 *   deletion. Every row in the two "against aeon's real ojz/act1" blocks was run
 *   at `31c0ddd8` (green) and at `1a657990` (the 8 reds this pin exists for), plus
 *   the file-touching commits back to `9c45616d` (the [0, 7] ruling) — the table
 *   is in the packet. Re-pin only by re-running that derivation.
 */
const AEON_PIN = '31c0ddd834821c5c89f808a9051957c4cf793b3b';
/**
 * THE BRANCH THAT ANSWERS "WHAT HAS AEON PUBLISHED", for the one currency row.
 * A remote-tracking ref, read through git objects, so no local edit in that
 * checkout moves it; the same spelling every other aeon-facing gate here uses.
 */
const AEON_TIP = 'origin/master';

type AeonAt =
  | { ok: true; dir: string; sha: string; provenance: string }
  | { ok: false; why: string };

/**
 * Resolve `ref` in aeon's checkout and stamp its provenance, or say why not.
 *
 * THREE WAYS TO FAIL, KEPT APART in the reason (the precedent is
 * `raster-binding-threaded-set.test.ts`): no checkout, a checkout that is not a
 * git repository, and a repository in which `ref` does not resolve. Each is a
 * loud skip in the rows, never a pass, and NONE FALLS BACK TO THE WORKING TREE:
 * a fallback is how "I could not look" becomes "I looked and it was fine".
 */
function openAeonAt(ref: string): AeonAt {
  if (!existsSync(AEON)) {
    return {
      ok: false,
      why: `no aeon checkout at ${AEON} (resolved by: ${siblingPathSource('aeon') ?? 'unresolved'}). `
        + 'Set AEON_DIR or EMPYREAN_SUITE_ROOT',
    };
  }
  const dir = peerRepo('aeon');
  if (dir === null) {
    return {
      ok: false,
      why: `${AEON} exists but is not a git checkout, so aeon at ${ref} cannot be read out of `
        + 'its object database, and these rows will not read that directory\'s files instead',
    };
  }
  const sha = resolveRev(dir, ref);
  if (sha === null) {
    return {
      ok: false,
      why: `${ref} does not resolve to a commit in ${dir} (unfetched, shallow, or history `
        + 'rewritten). These rows ask for that revision and nothing else',
    };
  }
  let provenance = '';
  try {
    // COMMITTED, with no allowance: any claim the module cannot measure throws
    // and becomes a loud skip below rather than a partial stamp.
    announceFixture(
      {
        peer: 'aeon', mode: READ_MODES.COMMITTED, ref, dir,
        dirSource: siblingPathSource('aeon') ?? 'peerRepo(\'aeon\')',
      },
      (s: string) => { provenance += s; },
    );
  } catch (e) {
    return {
      ok: false,
      why: `provenance for aeon at ${ref} could not be taken in ${dir}: `
        + `${e instanceof Error ? e.message : String(e)}`,
    };
  }
  process.stderr.write(provenance);
  return { ok: true, dir, sha, provenance };
}

/**
 * aeon's bytes at a resolved revision, out of its object database.
 *
 * ⚠ AFTER THE REVISION HAS RESOLVED, `ok: false` CAN ONLY MEAN THE PATH IS NOT IN
 * THAT TREE. That is a measurement, not a failure to look, so it throws and the
 * row goes red naming the peer, the path and the revision.
 */
function readAeon(at: AeonAt & { ok: true }, rel: string): string {
  const r = readAtRev(at.dir, at.sha, rel);
  if (!r.ok) {
    throw new Error(`aeon:${rel} at ${at.sha}: ${r.why}. That is a MEASURED absence at a `
      + 'resolved revision, not a failure to look');
  }
  return r.text;
}

/**
 * WHICH AEON THE HISTORICAL ROWS READ, printed before the rows that read it.
 *
 * Aurora's lens ledger, FIXTURE-REVISION-UNSTAMPED, and now its answer: the
 * stamp names `AEON_PIN` and says, in `fixture-provenance.mjs`'s own words, that
 * this revision names the bytes these rows read. The "working tree" line it also
 * prints is informational about aeon's disk and is NOT their input.
 */
const pinned = openAeonAt(AEON_PIN);
const provenance = pinned.ok ? pinned.provenance : '';
const pinnedDesc = pinned.ok ? readAeon(pinned, DESC_REL) : '';
const pinnedLib = pinned.ok ? readAeon(pinned, LIB_REL) : '';
/** What a real-tree wiring's `path` fields say: the file AND the revision it came from. */
const DESC = `aeon:${DESC_REL}@${AEON_PIN.slice(0, 8)}`;
const LIB = `aeon:${LIB_REL}@${AEON_PIN.slice(0, 8)}`;

/**
 * THE AEON REVISION THE CURRENCY ROWS READ: aeon's published act 1 AFTER
 * regions step 4 (`1a657990`), with the section bindings in the region table
 * `OJZ_ACT1_REGION_ROWS`. A full SHA, so it cannot move.
 *
 * WHY THIS ONE (2026-09-14): it was aeon `origin/master`'s tip when this parcel
 * was cut, and the three blobs these rows read (act_descriptor `a25f55e7`,
 * ojz_effects `86b630e9`, effects_gen `0ba8a14c`) are byte-identical at aeon
 * `eec81e48`, the revision aeon's own answer was read at
 * (docs/reviews/2026-09-14-aeon-answer-sections-0-7.md). It is deliberately NOT
 * `origin/master`: a later aeon (its step 5 adds a region row with no section
 * key) is measured against the file when it is published, by re-pinning here
 * and re-running the derivation in the packet, never by following a branch.
 */
const AEON_REGIONS_PIN = '6bd8ed8925d292d5f70f13ea24302161bef405bc';
const regions = openAeonAt(AEON_REGIONS_PIN);
const regionsProvenance = regions.ok ? regions.provenance : '';
const regionsDesc = regions.ok ? readAeon(regions, DESC_REL) : '';
const regionsLib = regions.ok ? readAeon(regions, LIB_REL) : '';
const RDESC = `aeon:${DESC_REL}@${AEON_REGIONS_PIN.slice(0, 8)}`;
const RLIB = `aeon:${LIB_REL}@${AEON_REGIONS_PIN.slice(0, 8)}`;

// ---------------------------------------------------------------------------
// Synthetic fixtures — the shapes the real tree cannot produce
// ---------------------------------------------------------------------------

/** A descriptor with three sections: two own presets, one binds nothing. */
const SYNTHETIC_DESC = `
comptime fn zzz_sec(sec: int, effects: Label = 0) -> Sec { }
pub const ZZZ_Act1: Act = act(sections: [
    zzz_sec(sec: 0, blocks: A,
            // a long comment, deliberately more than 800 characters after the
            // sec: 0 marker, so a parser that windows the way aeon's first
            // attempt did reports "binds nothing" for this section. ${'x'.repeat(900)}
            effects: ZZZ_Preset_Sec0),
    zzz_sec(sec: 1, blocks: B, effects: ZZZ_Preset_Shared),
    zzz_sec(sec: 2, blocks: C, effects: ZZZ_Preset_Shared),
    zzz_sec(sec: 3, blocks: D),
])`;

/**
 * ⚠ `ZZZ_Preset_Sec0` THREADS THREE OF THE SIX CHOOSERS AND NOT THE OTHERS, on
 * purpose. It is the shape a real record has (`OJZ_Preset_Sec5` threads
 * `raster`, both patch arrays and NOT `cycle`) and it is what makes condition 3
 * non-vacuous: the cycle chooser is threaded, `variants` is threaded at slot 0
 * only, and neither patch chooser is threaded at all — so one fixture covers
 * "satisfied", "partially threaded" and "threaded nowhere" without a second.
 */
const SYNTHETIC_LIB = `
pub data ZZZ_Preset_Sec0: EffectsPreset = preset(pal: P,
    raster: zzz_act1_sec_raster(sec: 0, hand: Raster_Program_None),
    cycle: zzz_act1_sec_cycle(sec: 0, hand: Pal_Cycle_None),
    variants: [ zzz_act1_sec_variant(sec: 0, slot: 0, hand: Variant_X), 0 ])
pub data ZZZ_Preset_Shared: EffectsPreset = preset(pal: P, raster: Raster_Program_None)
`;

function synthetic(): SectionRasterWiring {
  return {
    bindings: descriptorEffectsBindings(SYNTHETIC_DESC, 'zzz'),
    threadedBy: libraryRasterChooserCalls(SYNTHETIC_LIB, rasterChooserName('zzz', 'act1')),
    channelThreadedBy: libraryChannelCalls(SYNTHETIC_LIB, 'zzz', 'act1'),
    patchedArm: libraryPatchedArmBindings(SYNTHETIC_LIB),
    descriptor: { path: '(synthetic)', parsed: true },
    library: { path: '(synthetic)', parsed: true },
  };
}

describe('the parse has no window: the defect that produced a wrong answer', () => {
  it('finds an `effects:` field 900+ characters after its `sec: N` marker', () => {
    // THE REGRESSION ROW FOR AEON'S OWN MISTAKE. Their ad-hoc parse windowed to
    // the first 800 characters after each `sec: N`; section 0's field sits at
    // offset 964, so it printed a confident "(none)". This fixture reproduces
    // that geometry exactly, and a windowed parser fails it.
    const b = descriptorEffectsBindings(SYNTHETIC_DESC, 'zzz');
    expect(b[0]).toBe('ZZZ_Preset_Sec0');
  });

  it('a section that binds nothing is ABSENT, not mapped to a name', () => {
    const b = descriptorEffectsBindings(SYNTHETIC_DESC, 'zzz');
    expect(b[3]).toBeUndefined();
    expect(Object.keys(b).map(Number).sort((x, y) => x - y)).toEqual([0, 1, 2]);
  });

  it('the zone key stops the chooser call being read as a section record', () => {
    // `zzz_act1_sec_raster(sec: 5)` also matches `..._sec\(\s*sec:` if the zone
    // is not part of the pattern. It must not become a binding.
    const b = descriptorEffectsBindings(
      `${SYNTHETIC_DESC}\nraster: zzz_act1_sec_raster(sec: 7, hand: X) effects: Ghost`, 'zzz');
    expect(b[7]).toBeUndefined();
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// THE REGION-ROW READER (2026-09-14, SECTIONS-0-7-UNBARRED-AFTER-REGIONS)
// ═══════════════════════════════════════════════════════════════════════════
//
// EVERY FIXTURE HERE IS SYNTHETIC, written for the one property its row names.
// They are shaped like aeon's region rows because that is the shape the reader
// has to survive, and they claim nothing about any aeon file: the rows that read
// aeon are the pinned blocks further down. In particular the key-less row below
// is NOT aeon's step-5 row, which was unpublished when this was written; it is
// the smallest text that has no section key.

/** Lines joined with '\n', so a fixture's line numbers are its argument positions + 1. */
const lines = (...ls: string[]): string => ls.join('\n');

describe('the region-row reader: each `effects:` with the `sec:` inside its OWN call', () => {
  it('THE PAIRING TRAP (SYNTHETIC): effects before sec, adjacent rows, each keeps its own preset', () => {
    // The region rows name their preset BEFORE their key and their keys run out
    // of order; the old-style row names its key FIRST. "Find sec:, search
    // forward for effects:" gives each region row its neighbour's preset. "The
    // nearest sec: before it" gets the region rows right and the old row wrong.
    // Zipping the i-th preset with the i-th key gets every row wrong. Only
    // pairing by the enclosing call gets all four.
    const desc = lines(
      'zzz_region(x0: 0, effects: ZZZ_A, parallax: zzz_act1_sec_scene(sec: 2)),',
      'zzz_region(x0: 1, effects: ZZZ_B, parallax: zzz_act1_sec_scene(sec: 0)),',
      'zzz_region(x0: 2, effects: ZZZ_C, parallax: zzz_act1_sec_scene(sec: 1)),',
      'zzz_sec(sec: 3, blocks: D, effects: ZZZ_D)',
    );
    const r = descriptorEffectsRows(desc, 'zzz');
    expect(r.bindings, 'each preset belongs to the sec: in its own call').toEqual({
      0: 'ZZZ_B', 1: 'ZZZ_C', 2: 'ZZZ_A', 3: 'ZZZ_D',
    });
    expect(r.unkeyed).toEqual([]);
    expect(r.contested).toEqual([]);
  });

  it('A ROW WITH NO SECTION KEY (SYNTHETIC) is reported, never assigned, never dropped', () => {
    const desc = lines(
      'zzz_region(x0: 0, effects: ZZZ_A, parallax: zzz_act1_sec_scene(sec: 0)),',
      'zzz_region(x0: 9, effects: ZZZ_Keyless),',
      'zzz_region(x0: 1, effects: ZZZ_B, parallax: zzz_act1_sec_scene(sec: 1)),',
    );
    const r = descriptorEffectsRows(desc, 'zzz');
    expect(r.unkeyed, 'the key-less row is REPORTED, with what a person needs to find it').toEqual([
      { preset: 'ZZZ_Keyless', constructorName: 'zzz_region', line: 2, sectionKeys: [] },
    ]);
    expect(Object.values(r.bindings), 'and it is ASSIGNED to no section, neighbour or otherwise')
      .not.toContain('ZZZ_Keyless');
    expect(r.bindings, 'the keyed rows around it still read as themselves')
      .toEqual({ 0: 'ZZZ_A', 1: 'ZZZ_B' });
    // It names no section, so it falsifies no section's reading: the descriptor
    // stays usable, and the row travels with the wiring instead of vanishing.
    const read = readDescriptorWiring('g/act_descriptor.emp', desc, 'zzz');
    expect(read.descriptor.parsed).toBe(true);
    expect(read.unkeyedRows, 'the load CARRIES the row').toEqual(r.unkeyed);
    // The bindings-only door has no seat for it, so it REFUSES rather than
    // quietly returning the smaller map.
    expect(() => descriptorEffectsBindings(desc, 'zzz')).toThrow(/ZZZ_Keyless/);
  });

  it('A ROW WITH TWO SECTION KEYS (SYNTHETIC) is reported, never assigned, and the read is refused', () => {
    const desc = lines(
      'zzz_region(x0: 0, effects: ZZZ_Two, parallax: zzz_pick(sec: 1, or: zzz_act1_sec_scene(sec: 2))),',
    );
    const r = descriptorEffectsRows(desc, 'zzz');
    expect(r.unkeyed).toEqual([
      { preset: 'ZZZ_Two', constructorName: 'zzz_region', line: 1, sectionKeys: [1, 2] },
    ]);
    expect(r.bindings, 'neither key is picked').toEqual({});
    const read = readDescriptorWiring('g/act_descriptor.emp', desc, 'zzz');
    expect(read.descriptor.parsed, 'any pick would be Aurora\'s, so nothing is published').toBe(false);
    expect(read.descriptor.read).toBe(true);
    expect(read.descriptor.reason).toContain('ZZZ_Two');
    expect(read.descriptor.reason).toContain('section keys 1 and 2');
    // The control: one key written twice is ONE key, and it binds.
    expect(descriptorEffectsRows(desc.replace('sec: 2', 'sec: 1'), 'zzz').bindings)
      .toEqual({ 1: 'ZZZ_Two' });
  });

  it('a constructor DECLARATION is not a row: it names a type and has no section', () => {
    // aeon's descriptor declares `comptime fn ojz_region(…, effects: Label, …)` a
    // few lines above its table. Read as a row it would be a key-less binding of a
    // preset called `Label`.
    const decl = 'comptime fn zzz_region(x0: int, effects: Label, parallax: Label = 0) -> Region {';
    const desc = lines(decl, '}',
      'zzz_region(x0: 0, effects: ZZZ_A, parallax: zzz_act1_sec_scene(sec: 0)),');
    const r = descriptorEffectsRows(desc, 'zzz');
    expect(r.unkeyed, 'the declaration is not reported as a row').toEqual([]);
    expect(r.bindings).toEqual({ 0: 'ZZZ_A' });
    // The control: the same parentheses as a CALL are a row, and a key-less one,
    // so this row is not passing because the text is inert.
    expect(descriptorEffectsRows(lines(decl.replace('comptime fn ', ''), '}'), 'zzz').unkeyed
      .map((u) => u.preset)).toEqual(['Label']);
  });

  it('a comment or a string literal is not a row', () => {
    const desc = lines(
      '// zzz_region(x0: 0, effects: ZZZ_Ghost, parallax: zzz_act1_sec_scene(sec: 5)),',
      'ensure(ok, "zzz_region(effects: ZZZ_Str) has an unbalanced ( in its message")',
      'zzz_region(x0: 0, effects: ZZZ_A, // a trailing comment',
      '           parallax: zzz_act1_sec_scene(sec: 0)),',
    );
    const r = descriptorEffectsRows(desc, 'zzz');
    expect(r.bindings, 'a commented-out row binds nothing').toEqual({ 0: 'ZZZ_A' });
    expect(r.unkeyed, 'a sentence in a string is not a key-less row').toEqual([]);
  });

  it('CONTESTED (SYNTHETIC): two keyed rows that disagree bind neither; two that agree are one binding', () => {
    // aeon `31c0ddd8` carries BOTH forms at once, the old `ojz_sec(sec: N, …,
    // effects: X)` rows and the region rows, naming the same nine presets. That
    // agreement is one binding per section. A disagreement is not settled by
    // whichever row the parse met last.
    const desc = lines(
      'zzz_sec(sec: 0, blocks: A, effects: ZZZ_A)',
      'zzz_sec(sec: 1, blocks: B, effects: ZZZ_B)',
      'zzz_region(x0: 0, effects: ZZZ_A, parallax: zzz_act1_sec_scene(sec: 0)),',
      'zzz_region(x0: 1, effects: ZZZ_Other, parallax: zzz_act1_sec_scene(sec: 1)),',
    );
    const r = descriptorEffectsRows(desc, 'zzz');
    expect(r.bindings, 'the rows that agree are one binding').toEqual({ 0: 'ZZZ_A' });
    expect(r.contested).toEqual([{
      section: 1,
      rows: [
        { preset: 'ZZZ_B', constructorName: 'zzz_sec', line: 2 },
        { preset: 'ZZZ_Other', constructorName: 'zzz_region', line: 4 },
      ],
    }]);
    const read = readDescriptorWiring('g/act_descriptor.emp', desc, 'zzz');
    expect(read.descriptor.parsed).toBe(false);
    expect(read.descriptor.reason).toContain('section 1 is bound by 2 rows naming different presets');
    expect(read.bindings, 'a refused read publishes no partial map').toEqual({});
    expect(() => descriptorEffectsBindings(desc, 'zzz')).toThrow(/section 1/);
  });

  it('READ AND NOT UNDERSTOOD is not "could not read": the reason and both sentences say it was read', () => {
    // The defect's third face (docs/reviews/2026-09-13-section-wiring-off-live-aeon.md):
    // against aeon after regions the strip said Aurora "could not read" a file it
    // had read. This descriptor is what a file in a shape the reader does not key
    // looks like: rows, and not one of them keyed.
    const desc = lines('zzz_region(x0: 0, effects: ZZZ_A),', 'zzz_region(x0: 1, effects: ZZZ_B),');
    const read = readDescriptorWiring('g/data/levels/zzz/act1/act_descriptor.emp', desc, 'zzz');
    expect(read.descriptor).toMatchObject({ parsed: false, read: true });
    expect(read.descriptor.reason).toContain('no row carries a section key');
    const w: SectionRasterWiring = { ...synthetic(), ...read };
    const CH = rasterChooserName('zzz', 'act1');
    const c1 = sectionWiringConditions(w, 0, CH).ownPreset;
    expect(c1.verdict, 'still unknown: nothing is refused over a file Aurora could not use')
      .toBe('unknown');
    expect(c1.detail).toBe('read act_descriptor.emp; no usable section binding');
    const say = sectionRasterAdvisory(w, 0, CH)!;
    expect(say).toContain(
      'Aurora read g/data/levels/zzz/act1/act_descriptor.emp but found no section binding');
    expect(say, 'the file WAS read').not.toMatch(/could not read/);
    // A file with no rows at all says THAT, naming both shapes it looked for.
    expect(readDescriptorWiring('p', 'nothing here', 'zzz').descriptor.reason).toBe(
      'no zzz_region(… effects: …, … sec: N …) or zzz_sec(sec: N, … effects: …) rows were found in it');
  });
});

describe('the four author-facing states', () => {
  const w = synthetic();

  it('own preset AND threaded → wired, and says nothing', () => {
    expect(sectionRasterState(w, 0)).toBe('wired');
    expect(sectionRasterAdvisory(w, 0, 'zzz_act1_sec_raster')).toBeNull();
  });

  it('a SHARED preset names the sharers and what would happen', () => {
    expect(sectionRasterState(w, 1)).toBe('shared');
    expect(sectionSharers(w, 1)).toEqual([1, 2]);
    const say = sectionRasterAdvisory(w, 1, 'zzz_act1_sec_raster')!;
    // A FACT ABOUT THE LEVEL, not a prohibition by Aurora — the distinction the
    // whole module is shaped around.
    expect(say).toMatch(/Sections 1 and 2 all share the preset record ZZZ_Preset_Shared/);
    expect(say).toMatch(/would give section 2 the same band/);
    expect(say).toMatch(/split/);
    expect(say).not.toMatch(/Aurora|you cannot|not allowed/i);
  });

  it('own preset but NOT threaded → one aeon line, and the message says so', () => {
    const w2 = { ...w, threadedBy: {} };
    expect(sectionRasterState(w2, 0)).toBe('unthreaded');
    const say = sectionRasterAdvisory(w2, 0, 'zzz_act1_sec_raster')!;
    expect(say).toMatch(/nothing threads the raster chooser into it yet/);
    expect(say).toMatch(/no preset threads zzz_act1_sec_raster\(sec: 0\)/);
    expect(say).toMatch(/one line in aeon/);
  });

  /**
   * ⚠ THIS CASE IS SYNTHETIC BECAUSE THE REAL SET IS EMPTY, and that is said
   * out loud rather than hidden. Every section 0-8 of ojz/act1 binds a preset
   * today, so the `unbound` branch is UNREACHABLE in the shipping act. It is
   * kept because it goes live the moment anyone adds a section — and it is
   * exercised on this fixture rather than pointed at section 0, which binds
   * `OJZ_Preset_Sec0` and is fully authorable. A row asserting it fires on
   * section 0 would be asserting today's wrong answer.
   */
  it('a section binding no preset at all is named as such (SYNTHETIC: no real one exists)', () => {
    expect(sectionRasterState(w, 3)).toBe('unbound');
    expect(sectionRasterAdvisory(w, 3, 'zzz_act1_sec_raster'))
      .toMatch(/binds no preset record in the act descriptor/);
  });

  it('an UNREADABLE file is "could not read", never "not allowed"', () => {
    // The standing refusal's hardest clause: a control greyed out because a
    // file was missing is indistinguishable, to the author, from one greyed out
    // because the thing is impossible.
    const u = unknownWiring('a/desc.emp', 'a/lib.emp', 'ENOENT');
    expect(sectionRasterState(u, 0)).toBe('unknown');
    const say = sectionRasterAdvisory(u, 0, 'fn')!;
    expect(say).toMatch(/could not read a\/desc\.emp/);
    expect(say).toMatch(/ENOENT/);
    expect(say).toMatch(/The binding is still written/);
    // NOT a refusal by Aurora. "Aurora cannot SAY" is honest and stays; what
    // must never appear is a sentence telling the author they may not bind.
    expect(say).not.toMatch(/you cannot|not allowed|is refused|may not/i);
  });

  it('the two derived sets, from the same wiring', () => {
    expect(wiredSections(w, 4)).toEqual([0]);
    expect(eligibleSections(w, 4)).toEqual([0]);
    expect(eligibleSections({ ...w, threadedBy: {} }, 4)).toEqual([0]);
    expect(wiredSections({ ...w, threadedBy: {} }, 4)).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// THE TWO CONDITIONS, STATED APART (EW-SHAPE-STRIP)
// ---------------------------------------------------------------------------
//
// The strip prints two rows where the panel used to print one word. These rows
// are about the SPLIT, not about the underlying parse — that is covered above —
// and the one they exist for is the last one: `unknown` must never fold into
// `no`, on either condition, independently.

describe('the two wiring conditions, stated apart', () => {
  const w = synthetic();
  const CH = rasterChooserName('zzz', 'act1');

  it('both hold → two ✓, and the detail names the record and the call', () => {
    const c = sectionWiringConditions(w, 0, CH);
    expect(c.ownPreset.verdict).toBe('yes');
    expect(c.ownPreset.record).toBe('ZZZ_Preset_Sec0');
    expect(c.threaded.verdict).toBe('yes');
    expect(c.threaded.detail).toContain('zzz_act1_sec_raster(sec: 0)');
  });

  it('condition 1 fails and condition 2 IS STILL ASKED: no short-circuit', () => {
    // Section 1 shares its record with 2, and nothing threads sec 1. An author
    // whose strip stopped at the first failure could not tell whether fixing
    // the share would be enough.
    const c = sectionWiringConditions(w, 1, CH);
    expect(c.ownPreset.verdict).toBe('no');
    expect(c.ownPreset.detail).toContain('shared with section 2');
    expect(c.threaded.verdict).toBe('no');
    expect(c.threaded.detail).toBe('nothing threads zzz_act1_sec_raster(sec: 1)');
  });

  it('a section binding nothing fails condition 1 with its own reason', () => {
    const c = sectionWiringConditions(w, 3, CH);
    expect(c.ownPreset.verdict).toBe('no');
    expect(c.ownPreset.record).toBeNull();
    expect(c.ownPreset.detail).toBe('binds no preset record');
  });

  it('the THIRD fact (threaded by a record the section does not bind) is in the detail', () => {
    // SYNTHETIC, and unreachable in ojz/act1 today. A preset that threads sec 2
    // while section 2 binds a different record satisfies condition 2 as aeon's
    // gate words it ("no preset threads …") and still would not reach the
    // screen, so the verdict stays `yes` and the discrepancy is NAMED.
    const w2: SectionRasterWiring = { ...w, threadedBy: { ...w.threadedBy, ZZZ_Preset_Other: 2 } };
    const c = sectionWiringConditions(w2, 2, CH);
    expect(c.threaded.verdict).toBe('yes');
    expect(c.threaded.detail).toContain('but section 2 binds ZZZ_Preset_Shared');
    // …and the collapsed word still refuses it, which is the seam below.
    expect(sectionRasterState(w2, 2)).not.toBe('wired');
  });

  it('an unreadable file is `unknown` PER CONDITION, and never `no`', () => {
    const noDesc = unknownWiring('a/act_descriptor.emp', 'b/zzz_effects.emp', 'ENOENT');
    const c1 = sectionWiringConditions(noDesc, 0, CH);
    expect(c1.ownPreset.verdict).toBe('unknown');
    expect(c1.ownPreset.detail).toBe('could not read act_descriptor.emp');
    expect(c1.threaded.verdict).toBe('unknown');

    // ONE file readable, the other not: the readable condition still answers.
    const halfRead: SectionRasterWiring = {
      ...w, library: { path: 'b/zzz_effects.emp', parsed: false, reason: 'ENOENT' },
    };
    const c2 = sectionWiringConditions(halfRead, 0, CH);
    expect(c2.ownPreset.verdict).toBe('yes');
    expect(c2.threaded.verdict).toBe('unknown');
    expect(c2.threaded.detail).toBe('could not read zzz_effects.emp');
  });

  it('THE SEAM: `wired` means both conditions on the SAME record, for every section', () => {
    // Two derivations of one fact that nothing compares is how they come apart.
    for (let i = 0; i < 4; i++) expect(sectionConditionsAgreeWithState(w, i, CH)).toBe(true);
    const w2: SectionRasterWiring = { ...w, threadedBy: { ...w.threadedBy, ZZZ_Preset_Other: 2 } };
    for (let i = 0; i < 4; i++) expect(sectionConditionsAgreeWithState(w2, i, CH)).toBe(true);
    const noLib: SectionRasterWiring = {
      ...w, library: { path: 'b', parsed: false, reason: 'ENOENT' },
    };
    for (let i = 0; i < 4; i++) expect(sectionConditionsAgreeWithState(noLib, i, CH)).toBe(true);
  });

  it('the ACT-WIDE own-preset set cannot contradict the per-section condition row', () => {
    // THE DEFECT THIS PINS, caught by the strip harness's own output: with the
    // descriptor read and the LIBRARY missing, `eligibleSections` answers `[]`
    // — it goes through `sectionRasterState`, which is `unknown` for every
    // section when either file is unreadable — so the strip printed
    // `✓ own preset ZZZ_Preset_Sec0` on the condition row and `own preset none`
    // on the act line, in the same box, at the same time.
    const noLib: SectionRasterWiring = {
      ...w, library: { path: 'b/zzz_effects.emp', parsed: false, reason: 'ENOENT' },
    };
    expect(eligibleSections(noLib, 4)).toEqual([]);          // the trap
    expect(ownPresetSections(noLib, 4, CH)).toEqual([0]);     // the fix
    // And the invariant, over both worlds: the act-wide set is exactly the
    // sections whose own-preset condition says yes.
    for (const world of [w, noLib]) {
      const perSection = [0, 1, 2, 3]
        .filter((i) => sectionWiringConditions(world, i, CH).ownPreset.verdict === 'yes');
      expect(ownPresetSections(world, 4, CH)).toEqual(perSection);
    }
  });

  it('`threadedSections` is EXISTENCE, and is not the same set as wired', () => {
    expect(threadedSections(w, 4)).toEqual([0]);
    const w2: SectionRasterWiring = { ...w, threadedBy: { ...w.threadedBy, ZZZ_Preset_Other: 2 } };
    expect(threadedSections(w2, 4)).toEqual([0, 2]);
    expect(wiredSections(w2, 4)).toEqual([0]);
  });

  it('`boundSections` is OCCUPANCY, and it is not in aeon\'s files at all', () => {
    // THE COLD READ'S D-B. `threaded 5,6` was read as "5 and 6 are available";
    // both already carried a preset. This is the set that says so, and it is
    // the one set on that line derived from AURORA's own sidecars.
    const s = (rasterRef: string | null) => ({ rasterRef });
    expect(boundSections([s(null), s('a'), null, s('b')])).toEqual([1, 3]);
    expect(boundSections([s(null), null])).toEqual([]);
    expect(boundSections([])).toEqual([]);

    // ⚠ AN EMPTY SECTION IS NOT A BOUND ONE, and a `null` hole must not shift
    // the indices of the sections after it: the act line prints these numbers
    // beside two sets that are indexed the same way.
    expect(boundSections([null, null, s('x')])).toEqual([2]);

    // ⚠ IT DOES NOT DEGRADE WITH AEON'S FILES, which is the whole reason it
    // takes the sections rather than a `SectionRasterWiring`. `ownPresetSections`
    // has a whole row above about the contradiction folding a set through an
    // aeon read produced; occupancy cannot have that defect because no aeon
    // read is in it.
    const sections = [s('a'), s(null)];
    expect(boundSections(sections)).toEqual(boundSections(sections.slice()));
    expect(boundSections(sections)).toEqual([0]);
  });
});

// ---------------------------------------------------------------------------
// CONDITION 3 — THE OTHER CHANNELS ONE `rasterRef` BINDS
// ---------------------------------------------------------------------------
//
// THE DEFECT THESE PIN (cold read 2026-09-05, D-A): section 5 showed ✓ own
// preset AND ✓ threaded, so Aurora told the author a raster band could be bound
// there. The build refused it anyway, because the preset also carried `cycles`
// and nothing threads `ojz_act1_sec_cycle(sec: 5)`. Two ticks was a VERDICT and
// the verdict was wrong.
//
// ⚠ THE DOCUMENTS BELOW ARE OBJECT LITERALS AND NOT `EffectsPreset`s, because
// the condition's input is structural (`ChannelBearingDocument`) and what is
// under test is the KEY PREDICATE — including the three-state absent/null/value
// distinction, which a fully-typed fixture makes harder to spell, not easier.

describe('condition 3: every OTHER chooser a bound document owes', () => {
  const w = synthetic();

  it('the parse finds a chooser call inside an ARRAY LITERAL, not just the first', () => {
    // `variants:` and the two patch arrays hold SEVERAL calls in one bracket.
    // A parameter-anchored regex sees one; aeon matches by chooser NAME for
    // exactly this reason, and so does this.
    const lib = `pub data A: EffectsPreset = preset(
      variants: [ zzz_act1_sec_variant(sec: 4, slot: 0, hand: X),
                  zzz_act1_sec_variant(sec: 4, slot: 1) ])`;
    expect(libraryChannelChooserCalls(lib, 'zzz_act1_sec_variant', 'slot'))
      .toEqual({ A: { 4: [0, 1] } });
  });

  it('an UNINDEXED chooser records the sentinel index 0, so all six read alike', () => {
    expect(libraryChannelChooserCalls(SYNTHETIC_LIB, 'zzz_act1_sec_cycle', null))
      .toEqual({ ZZZ_Preset_Sec0: { 0: [0] } });
  });

  it('the chooser names are DERIVED from the ids, aeon ActNames\' own stem', () => {
    expect(channelChooserName('ojz', 'act1', 'cycle')).toBe('ojz_act1_sec_cycle');
    expect(channelChooserName('ojz', 'act1', 'patch_world_y'))
      .toBe('ojz_act1_sec_patch_world_y');
    // …and `rasterChooserName` is the same function with 'raster'. If these two
    // ever disagreed, condition 2 and condition 3 would be reading different
    // acts out of one file.
    expect(channelChooserName('ojz', 'act1', 'raster')).toBe(rasterChooserName('ojz', 'act1'));
  });

  it('THE COLD READ\'S CASE: a document carrying `cycles` on a section that threads no cycle', () => {
    // Section 1 binds ZZZ_Preset_Shared, which threads nothing at all.
    const c = sectionExtraChannelsCondition(w, 1, { cycles: [{ line: 2 }] }, 'zzz', 'act1', 'mine');
    expect(c.verdict).toBe('no');
    expect(c.detail).toBe('nothing threads zzz_act1_sec_cycle(sec: 1)');
    expect(c.gaps).toHaveLength(1);
    expect(c.gaps[0].channel.key).toBe('cycles');
    // …and conditions 1 and 2 are NOT what caught it on a section that has both.
    const both = sectionExtraChannelsCondition(
      w, 0, { cycles: null, patch_motion: [1, 2] }, 'zzz', 'act1', 'mine');
    const two = sectionWiringConditions(w, 0, rasterChooserName('zzz', 'act1'));
    expect(two.ownPreset.verdict).toBe('yes');
    expect(two.threaded.verdict).toBe('yes');
    expect(both.verdict).toBe('no');            // ✓ ✓ ✗ — the whole point
    expect(both.gaps.map((g) => g.channel.key)).toEqual(['patch_motion']);
  });

  it('`cycles: null` STILL owes the chooser: absent/null/value is three states', () => {
    // aeon's `owed` is `"cycles" in d`, so cycling OFF still emits a row.
    expect(sectionExtraChannelsCondition(w, 1, { cycles: null }, 'zzz', 'act1').verdict)
      .toBe('no');
    // …while an ABSENT key owes nothing, which is the majority document.
    expect(sectionExtraChannelsCondition(w, 1, {}, 'zzz', 'act1').verdict).toBe('yes');
    expect(sectionExtraChannelsCondition(w, 1, { cycles: undefined }, 'zzz', 'act1').verdict)
      .toBe('yes');
  });

  it('`variants: null` owes NOTHING: the one channel where aeon\'s predicate differs', () => {
    // aeon: `d.get("variants") is not None`, NOT `in d`. `variants` has no
    // key-level null state, so a null there is not an authored channel.
    expect(sectionExtraChannelsCondition(w, 1, { variants: null }, 'zzz', 'act1').verdict)
      .toBe('yes');
    expect(sectionExtraChannelsCondition(w, 1, { variants: [{}] }, 'zzz', 'act1').verdict)
      .toBe('no');
  });

  it('PARTIAL threading is its own answer, not a pass: a row per index', () => {
    // ZZZ_Preset_Sec0 threads the variant chooser at slot 0 only. A document
    // authoring two slots emits two rows and one of them would go unread.
    const c = sectionExtraChannelsCondition(w, 0, { variants: [{}, {}] }, 'zzz', 'act1', 'mine');
    expect(c.verdict).toBe('no');
    expect(c.gaps[0].want).toEqual([0, 1]);
    expect(c.gaps[0].got).toEqual([0]);
    expect(c.detail).toContain('threaded only at slot 0');
    // One slot is satisfied by the same threading.
    expect(sectionExtraChannelsCondition(w, 0, { variants: [{}] }, 'zzz', 'act1').verdict)
      .toBe('yes');
  });

  it('a satisfied channel is a ✓ that NAMES what it checked', () => {
    const c = sectionExtraChannelsCondition(w, 0, { cycles: [] }, 'zzz', 'act1', 'mine');
    expect(c.verdict).toBe('yes');
    expect(c.detail).toBe('cycle threaded');
  });

  it('an UNREADABLE library is `unknown`, never `no`: the standing refusal', () => {
    const noLib: SectionRasterWiring = {
      ...w, library: { path: 'b/zzz_effects.emp', parsed: false, reason: 'ENOENT' },
    };
    const c = sectionExtraChannelsCondition(noLib, 1, { cycles: null }, 'zzz', 'act1');
    expect(c.verdict).toBe('unknown');
    expect(c.detail).toBe('could not read zzz_effects.emp');
    expect(c.gaps).toEqual([]);
  });

  it('NOTHING BOUND ticks, and the detail refuses to be read as a promise', () => {
    const c0 = sectionExtraChannelsCondition(w, 0, null, 'zzz', 'act1');
    expect(c0.verdict).toBe('yes');
    expect(c0.detail).toBe('nothing bound; cycle, variant threaded here');
    const c1 = sectionExtraChannelsCondition(w, 1, null, 'zzz', 'act1');
    expect(c1.detail).toBe('nothing bound; no extra chooser threaded here');
  });

  it('a chooser threaded in a DIFFERENT record does not count for this section', () => {
    // aeon's `channel_faults` looks the call up at `bindings.get(sec)` and
    // nowhere else: a row emitted for sec N is read only by sec N's `preset()`.
    // ZZZ_Preset_Sec0 threads `cycle(sec: 0)`; section 2 binds ZZZ_Preset_Shared.
    const shifted: SectionRasterWiring = {
      ...w,
      channelThreadedBy: { ...w.channelThreadedBy, cycle: { ZZZ_Preset_Sec0: { 2: [0] } } },
    };
    expect(sectionExtraChannelsCondition(shifted, 2, { cycles: null }, 'zzz', 'act1').verdict)
      .toBe('no');
  });

  it('the advisory SPELLS THE REMEDY and never a prohibition', () => {
    const c = sectionExtraChannelsCondition(w, 1, { cycles: null }, 'zzz', 'act1', 'mine');
    const say = extraChannelsAdvisory(c.gaps, 1, 'mine', w.bindings[1])!;
    expect(say).toContain('ZZZ_Preset_Shared, the preset record section 1 binds');
    // The exact `preset()` argument, in aeon's own `prescription` spelling.
    expect(say).toContain('cycle: zzz_act1_sec_cycle(sec: 1, hand: Pal_Cycle_None)');
    expect(say).toContain('one line in aeon');
    expect(say).not.toMatch(/you cannot|not allowed|may not|is forbidden/i);
    // No gaps, nothing to say.
    expect(extraChannelsAdvisory([], 1, 'mine', 'X')).toBeNull();
  });
});

describe('the two paths are derived from dataPath, never written down', () => {
  it('a standard aeon act', () => {
    expect(wiringPaths('games/sonic4/data/editor/ojz/act1/', 'ojz')).toEqual({
      descriptor: 'games/sonic4/data/levels/ojz/act1/act_descriptor.emp',
      library: 'games/sonic4/data/effects/ojz_effects.emp',
    });
  });

  it('a dataPath outside data/editor/ yields null: "could not locate", not "not eligible"', () => {
    expect(wiringPaths('some/other/place/', 'ojz')).toBeNull();
    expect(wiringPaths('games/sonic4/data/editor/', 'ojz')).toBeNull();
  });
});

describe('against aeon\'s real ojz/act1: the numbers as they stand today', () => {
  // "TODAY" IS `AEON_PIN`, the last pre-regions revision (see its docblock). The
  // title is kept because the rows below are the reading taken on those days.
  const desc = pinnedDesc;
  const lib = pinnedLib;
  // ⚠ SKIPPED WITH A REASON, NEVER QUIETLY. A row that cannot reach aeon's
  // object database measured NOTHING; a green total that swallowed it would be
  // exactly the silent zero this whole derivation exists to prevent.
  const need = (ctx: { skip: (reason: string) => void }): boolean => {
    if (pinned.ok) return true;
    ctx.skip(`SKIPPED, NOT PASSED: ${pinned.why}: this row reads aeon's real act_descriptor.emp `
      + `and ojz_effects.emp at ${AEON_PIN} and could not. The synthetic rows above still ran and `
      + 'cover the parser\'s shapes; what is unmeasured here is whether this module still reads '
      + 'that revision of aeon\'s files the way these rows record.');
    return false;
  };

  it('the run SAID which aeon REVISION these numbers are, and that revision NAMES the bytes', (ctx) => {
    if (!need(ctx)) return;
    // Without this "the numbers as they stand today" is a claim about an
    // unnamed input, and a stale reading of it is indistinguishable from a
    // current one.
    expect(provenance, 'these rows read aeon and the run printed no provenance, so nothing in '
      + 'this result says which aeon decided it').not.toBe('');
    // ⚠ THE MODE IS THE CLAIM. `COMMITTED OBJECTS` is fixture-provenance.mjs's
    // sentence for "git read the object database; the peer working tree was never
    // opened". Until 2026-09-13 this row asserted `WORKING TREE`, and that is the
    // read that let aeon's lane turn this file red without an aurora commit.
    expect(provenance, 'the stamp does not say the bytes came out of aeon\'s object database')
      .toContain('COMMITTED OBJECTS');
    expect(provenance, 'the stamp claims a WORKING TREE read; these rows must never consume a '
      + 'sibling lane\'s disk').not.toContain('WORKING TREE. the bytes read are');
    // BOTH HALVES OF THE FIXTURE'S NAME, and the pin is a full SHA so the module
    // says it cannot move.
    expect(provenance, `the stamp does not name the pinned revision ${AEON_PIN}`).toContain(AEON_PIN);
    expect(provenance, 'the stamp does not say the pin is immovable')
      .toContain('A full SHA, so it cannot move under the caller');
    expect(provenance, 'the stamp does not say the revision names the bytes this run consumed')
      .toContain('WHICH BYTES this run consumed');
    expect(provenance, 'the stamp declares itself incomplete; no allowance is passed, so that '
      + 'must have been a loud skip instead').not.toContain('PROVENANCE INCOMPLETE');
  });

  it('every section 0-8 binds a preset record', (ctx) => {
    if (!need(ctx)) return;
    const b = descriptorEffectsBindings(desc, 'ojz');
    expect(Object.keys(b).map(Number).sort((x, y) => x - y))
      .toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8]);
    // Named, so a rename in aeon is visible here rather than silently shifting
    // the eligible set.
    //
    // ⚠ RE-PINNED 2026-09-03: section 6 was `OJZ_Preset_Plain` (one of the three
    // sharers) until aeon landed item 11a's base_swap and gave 6 a preset of its
    // own. CONFIRMED INTENDED with aeon; not a regression, and not a rename —
    // section 6 LEFT the shared record, which is why the row below moved too.
    //
    // ⚠ RE-PINNED 2026-09-05: section 7 was `OJZ_Preset_Plain` (the last of the
    // sharers alongside 8) until aeon landed item 9c's live patch channels and
    // gave 7 a preset of its own, `OJZ_Preset_Sec7` — the `OJZ_WorldWater` pair
    // whose bands are channels 2 and 3 in `aeon-effects-channel-bands.json`.
    // aeon's own act_descriptor.emp says so in a comment above the `use` line.
    // Not a regression and not a rename: section 7 LEFT the shared record, which
    // is why the row below moved too — and this time it left NOBODY behind it.
    expect(b[0]).toBe('OJZ_Preset_Sec0');
    expect(b[6]).toBe('OJZ_Preset_Sec6');
    expect(b[7]).toBe('OJZ_Preset_Sec7');
    expect(b[8]).toBe('OJZ_Preset_Plain');
  });

  it('ALL NINE sections now own their preset: nothing is shared any more', (ctx) => {
    if (!need(ctx)) return;
    const w: SectionRasterWiring = {
      bindings: descriptorEffectsBindings(desc, 'ojz'),
      threadedBy: libraryRasterChooserCalls(lib, rasterChooserName('ojz', 'act1')),
      channelThreadedBy: libraryChannelCalls(lib, 'ojz', 'act1'),
      patchedArm: libraryPatchedArmBindings(lib),
      descriptor: { path: DESC, parsed: true },
      library: { path: LIB, parsed: true },
    };
    // ⚠ RE-PINNED 2026-09-05 with the row above, and it is ONE aeon landing seen
    // twice: section 7 acquired `OJZ_Preset_Sec7` for item 9c, so it joined the
    // eligible set and left the sharer set. Eligible 0-6 -> 0-8.
    //
    // ⚠⚠ AND THE SHARER SET IS NOW EMPTY, WHICH THIS ROW NO LONGER MEASURES.
    // `OJZ_Preset_Plain` is section 8's alone, so NO section is in the `shared`
    // state against aeon's real tree and the old `toBe('shared')` assertions had
    // nothing left to assert. They are not silently dropped: the `shared` state
    // is still covered by the SYNTHETIC rows earlier in this file, which build a
    // wiring with a genuinely shared record. What is gone is the confirmation
    // that aeon still SHIPS one — so this row asserts the emptiness explicitly
    // and goes red the day a section is pointed at another's record again.
    expect(eligibleSections(w, 9)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8]);
    const shared: number[] = [];
    for (let s = 0; s < 9; s++) {
      if (sectionRasterState(w, s) === 'shared') shared.push(s);
      // Every section is its own only sharer — the data form of "nothing is
      // shared", checked per section rather than inferred from the list above.
      expect(sectionSharers(w, s), `section ${s}`).toEqual([s]);
    }
    expect(shared,
      'aeon ships a SHARED preset record again: re-pin this row and the one above, and note '
      + 'which sections share it; the shared state is reachable against the real tree once more')
      .toEqual([]);
    // Anti-vacuous: nine sections really were examined, and they really do bind
    // nine DISTINCT records — an empty or single-record binding map would
    // satisfy "nothing is shared" while measuring nothing.
    expect(Object.keys(w.bindings).length).toBe(9);
    expect(new Set(Object.values(w.bindings)).size).toBe(9);
  });

  it('exactly TWO sections are threaded today, and it is not the same fact as eligible', (ctx) => {
    if (!need(ctx)) return;
    // ⚠ THE TWO FACTS ARE DIFFERENT AND BOTH MATTER. "Section 0 may have a
    // band" (its preset is its own) and "section 0 has one wired" (a preset
    // threads the chooser on index 0) are different claims, and conflating them
    // is how "only section 5" and "sections 0-5" were BOTH published as the
    // answer on the same day. They are {5,6} and 0-6 respectively.
    //
    // ⚠ RE-PINNED 2026-09-03, the third face of the SAME aeon landing: item 11a
    // threaded section 6's base_swap program through the chooser as well as
    // giving 6 its own preset record. The two facts moved TOGETHER this time and
    // still are not the same fact — eligible is 0-6, threaded is {5,6} — which
    // is precisely why the row keeps asserting both. CONFIRMED INTENDED.
    const calls = libraryRasterChooserCalls(lib, rasterChooserName('ojz', 'act1'));
    expect(calls).toEqual({ OJZ_Preset_Sec5: 5, OJZ_Preset_Sec6: 6 });
    const w: SectionRasterWiring = {
      bindings: descriptorEffectsBindings(desc, 'ojz'),
      threadedBy: calls,
      channelThreadedBy: libraryChannelCalls(lib, 'ojz', 'act1'),
      patchedArm: libraryPatchedArmBindings(lib),
      descriptor: { path: DESC, parsed: true },
      library: { path: LIB, parsed: true },
    };
    expect(wiredSections(w, 9)).toEqual([5, 6]);
    expect(eligibleSections(w, 9)).not.toEqual(wiredSections(w, 9));
  });

  it('THE COLD READ REPRODUCED: section 5 is ✓ ✓ ✗ against aeon\'s real tree', (ctx) => {
    if (!need(ctx)) return;
    // ⚠ THIS IS THE ROW THE WHOLE PARCEL IS FOR. The cold reader bound a preset
    // carrying `cycles` to section 5 — the ONE section Aurora's own strip marked
    // ✓ own preset AND ✓ threaded — and aeon refused the build:
    //
    //   "But OJZ_Preset_Sec5 … threads ojz_act1_sec_cycle for sec 5 NOWHERE."
    //
    // Derived, not asserted from the report: `OJZ_Preset_Sec5` spells
    // `cycle: Pal_Cycle_None`, a literal, while threading `raster:` and both
    // patch arrays. If aeon ever threads the cycle chooser there, THIS ROW GOES
    // RED and the correct response is to read the new fact off the file.
    const chooser = rasterChooserName('ojz', 'act1');
    const w: SectionRasterWiring = {
      bindings: descriptorEffectsBindings(desc, 'ojz'),
      threadedBy: libraryRasterChooserCalls(lib, chooser),
      channelThreadedBy: libraryChannelCalls(lib, 'ojz', 'act1'),
      patchedArm: libraryPatchedArmBindings(lib),
      descriptor: { path: DESC, parsed: true },
      library: { path: LIB, parsed: true },
    };
    const two = sectionWiringConditions(w, 5, chooser);
    expect(two.ownPreset.verdict, 'section 5 owns its preset').toBe('yes');
    expect(two.threaded.verdict, 'section 5 threads the raster chooser').toBe('yes');

    const withCycles = sectionExtraChannelsCondition(
      w, 5, { cycles: [{ line: 2, first: 8, count: 4, period: 8 }] },
      'ojz', 'act1', 'coldread_water_tint');
    expect(withCycles.verdict, 'the third condition catches what the first two missed').toBe('no');
    expect(withCycles.detail).toBe('nothing threads ojz_act1_sec_cycle(sec: 5)');
    expect(extraChannelsAdvisory(withCycles.gaps, 5, 'coldread_water_tint', w.bindings[5]))
      .toContain('cycle: ojz_act1_sec_cycle(sec: 5, hand: Pal_Cycle_None)');

    // ANTI-VACUOUS, both ways. The same section PASSES for a document with no
    // extra keys (so the row is not simply always `no`), and the patch channels
    // — which OJZ_Preset_Sec5 really does thread, at four indices each — pass
    // where the cycle one fails. A parse that found nothing would fail this.
    expect(sectionExtraChannelsCondition(w, 5, {}, 'ojz', 'act1').verdict).toBe('yes');
    const patched = sectionExtraChannelsCondition(
      w, 5, { patch_world_ys: [0, 0, 0, 0], patch_motion: [0, 0, 0, 0] }, 'ojz', 'act1');
    expect(patched.verdict, 'OJZ_Preset_Sec5 threads both patch choosers at ch 0-3').toBe('yes');
    // …and a FIFTH index would not be threaded, which is aeon's partial arm.
    expect(sectionExtraChannelsCondition(
      w, 5, { patch_world_ys: [0, 0, 0, 0, 0] }, 'ojz', 'act1').verdict).toBe('no');
  });

  it('the channel TABLE still matches aeon\'s SECTION_CHANNELS', (ctx) => {
    // ⚠ THE ONE THING THIS MODULE TRANSCRIBES ACROSS A REPO BOUNDARY. Which
    // sections thread what is derived per load and never written down; the set
    // of CHANNELS is a schema fact and is a table here. A table can go silently
    // short when aeon adds a seventh key — `boundary` was the fourth added in a
    // fortnight — so the divergence is made loud in the suite instead.
    //
    // ⚠ THIS ROW READS `AEON_TIP`, NOT `AEON_PIN`, AND THAT IS THE POINT. It is a
    // CURRENCY question ("still matches"), and a pinned blob equals itself by
    // construction, so a pin could never answer it (review bar 19). It reads the
    // revision aeon has PUBLISHED, through git objects, and names that revision in
    // its messages; the working tree is never opened.
    const tip = openAeonAt(AEON_TIP);
    if (!tip.ok) {
      ctx.skip(`SKIPPED, NOT PASSED: ${tip.why}, so EXTRA_SECTION_CHANNELS was compared against `
        + 'nothing. What is unmeasured is whether aeon has added a chooser channel this table does '
        + 'not carry: the exact hole aeon\'s own channel_faults exists to close, one repo over.');
      return;
    }
    const src = readAeon(tip, GEN_REL);
    const where = `aeon:${GEN_REL} at ${AEON_TIP} (${tip.sha})`;
    const table = /SECTION_CHANNELS\s*=\s*\(([\s\S]*?)\n\)/.exec(src);
    expect(table, `NOT AN AURORA REGRESSION: aeon's SECTION_CHANNELS table could not be located in `
      + `${where}: the shape changed; re-read it rather than deleting this row`).not.toBeNull();
    const arms = /ARM_CHANNELS\s*=\s*\(([^)]*)\)/.exec(src);
    expect(arms, `NOT AN AURORA REGRESSION: aeon's ARM_CHANNELS could not be located in ${where}`)
      .not.toBeNull();
    const armNames = [...arms![1].matchAll(/"([^"]+)"/g)].map((m) => m[1]);
    // The first string of each `SectionChannel(...)` row is its channel name.
    const allChannels = [...table![1].matchAll(/SectionChannel\(\s*"([^"]+)"/g)].map((m) => m[1]);
    expect(allChannels.length, `aeon's table in ${where} parsed as empty: the regex, not the table`)
      .toBeGreaterThan(2);
    const nonArm = allChannels.filter((c) => !armNames.includes(c));
    expect(EXTRA_SECTION_CHANNELS.map((c) => c.channel),
      `NOT AN AURORA REGRESSION, a drift: at ${where} aeon's non-arm channels are now `
      + `[${nonArm.join(', ')}]: transcribe the new row into `
      + 'EXTRA_SECTION_CHANNELS (key, param, chooser suffix, index param, owed, indices, hand) '
      + 'from tools/effects_gen.py, and check tools/effects_seam_gate.py::channel_faults for '
      + 'whether it changed shape too').toEqual(nonArm);
  });
});

// ---------------------------------------------------------------------------
// GUARD-SEAT-RESIDUE — the nine plants this file did not kill
// ---------------------------------------------------------------------------
//
// docs/reviews/2026-09-09-guard-residue-scene-ui.md. Thirty mutations were
// applied to `section-wiring.ts` one at a time, each scored against the WHOLE
// `npm test`. Twenty-one died against the rows above. The nine below did not,
// and they are not scattered: every one of them is a guard whose defect needs a
// SECOND fact to be visible, and every fixture above carries only the first.
//
// ⚠ THE SHARPEST OF THEM IS A ROW THAT ALREADY EXISTS. "the zone key stops the
// chooser call being read as a section record" states its own mechanism in a
// comment — "`zzz_act1_sec_raster(sec: 5)` also matches `..._sec\(\s*sec:` if
// the zone is not part of the pattern" — and that sentence is FALSE about this
// fixture: `zzz_act1_sec_raster(` is `_sec_raster(`, never `_sec(`, so dropping
// the zone id from the anchor does not make it match. The anchor is TWO clauses
// (`${zoneId}_` in front and `_sec` immediately before the paren) and the
// existing row only fails when BOTH are loosened at once. Each half alone
// stayed green. A comment naming a mechanism is not a test of it.

describe('GUARD-SEAT-RESIDUE: the plants the rows above survived', () => {
  const CH = rasterChooserName('zzz', 'act1');

  /** The synthetic wiring, with two paths a reader can tell apart. */
  function named(): SectionRasterWiring {
    return {
      ...synthetic(),
      descriptor: { path: 'g/data/levels/zzz/act1/act_descriptor.emp', parsed: true },
      library: { path: 'g/data/effects/zzz_effects.emp', parsed: true },
    };
  }

  it('the `unknown` advisory names the file that COULD NOT be read, not the one that could', () => {
    // PLANT SW02, SURVIVED: `const which = w.descriptor` — always the
    // descriptor. Every existing `unknown` row is built from `unknownWiring`,
    // where BOTH sources are unparsed, so the selector had nothing to select
    // and naming either one read as correct. Half-read is the live case: the
    // descriptor is per act and the library is per zone, so one can be present
    // while the other is not, and the sentence sends an author to open a file.
    const halfRead: SectionRasterWiring = {
      ...named(),
      library: { path: 'g/data/effects/zzz_effects.emp', parsed: false, reason: 'ENOENT' },
    };
    expect(sectionRasterState(halfRead, 0)).toBe('unknown');
    const say = sectionRasterAdvisory(halfRead, 0, CH)!;
    expect(say).toContain('g/data/effects/zzz_effects.emp');
    expect(say, 'the descriptor read fine; naming it sends the author to the wrong file')
      .not.toContain('act_descriptor.emp');
    expect(say).toContain('ENOENT');

    // …and the mirror, so neither arm of the selector can be pinned by
    // accident: descriptor unreadable, library fine.
    const noDesc: SectionRasterWiring = {
      ...named(),
      descriptor: {
        path: 'g/data/levels/zzz/act1/act_descriptor.emp', parsed: false, reason: 'EACCES',
      },
    };
    const say2 = sectionRasterAdvisory(noDesc, 0, CH)!;
    expect(say2).toContain('act_descriptor.emp');
    expect(say2).not.toContain('zzz_effects.emp');
    expect(say2).toContain('EACCES');
  });

  it('the split anchor is TWO clauses, and each half alone is load-bearing', () => {
    // PLANTS SW05 and SW05b, BOTH SURVIVED. The row above kills only their
    // conjunction. Derived from the guard's own sentence ("the section
    // constructor is `<zone>_sec(sec: N, …)` by aeon's own convention"), which
    // makes two separate claims about the text either side of `_sec`.

    // ⚠ THESE FIXTURES ARE STANDALONE AND NOT `SYNTHETIC_DESC` PLUS A LINE, and
    // the first draft of this row learned why the hard way: the parse has no
    // right-hand bound either, so the LAST section's chunk runs to end of text
    // and swallowed the appended constructor's `effects:` into section 3. That
    // is a real property of the derivation and it is reported, not pinned —
    // see the packet's "not fixed" section.

    // CLAUSE 1, the zone prefix: another zone's section constructor in the same
    // text must not be folded into this act's bindings.
    const twoZones = 'zzz_sec(sec: 0, effects: ZZZ_Own)\n'
      + 'www_sec(sec: 8, blocks: Z, effects: WWW_Preset_Sec8)\n';
    const b1 = descriptorEffectsBindings(twoZones, 'zzz');
    expect(b1[8], 'www_sec is another zone\'s constructor, not this act\'s').toBeUndefined();
    expect(Object.keys(b1).map(Number).sort((x, y) => x - y)).toEqual([0]);
    // …and the same text read AS www does find it, so the fixture is not inert.
    expect(descriptorEffectsBindings(twoZones, 'www')[8]).toBe('WWW_Preset_Sec8');

    // CLAUSE 2, the `_sec` boundary: a name that merely BEGINS with the
    // constructor's spelling is a different symbol.
    const helper = 'zzz_sec_defaults(sec: 9, effects: Ghost)\n'
      + 'zzz_sec(sec: 0, effects: ZZZ_Own)\n';
    expect(descriptorEffectsBindings(helper, 'zzz')[9],
      'zzz_sec_defaults is not zzz_sec').toBeUndefined();
    expect(descriptorEffectsBindings(helper, 'zzz')[0], 'the fixture is not inert')
      .toBe('ZZZ_Own');
  });

  it('the collapsed word asks OWNERSHIP, not existence: a record threading sec 0 is not sec 0\'s', () => {
    // PLANT SW07, SURVIVED: `Object.values(w.threadedBy).includes(sectionIndex)`.
    // The row that exists for this ("the THIRD fact") points at section 2 —
    // which is SHARED, so `sectionRasterState` returns 'shared' two branches
    // earlier and its `.not.toBe('wired')` is answered by a guard that is not
    // the one under test. Section 0 owns its preset, so the threaded branch is
    // actually reached.
    const w = named();
    const elsewhere: SectionRasterWiring = { ...w, threadedBy: { ZZZ_Preset_Shared: 0 } };
    expect(elsewhere.bindings[0], 'section 0 owns ZZZ_Preset_Sec0').toBe('ZZZ_Preset_Sec0');
    expect(sectionRasterState(elsewhere, 0),
      'ZZZ_Preset_Shared threads sec 0, but section 0 does not bind it').toBe('unthreaded');
    expect(wiredSections(elsewhere, 4)).toEqual([]);

    // PLANT SW09, SURVIVED: the seam's `c.threaded.record === c.ownPreset.record`
    // clause. Condition 2 is EXISTENCE by design and says 'yes' here, so
    // without that clause the seam calls `unthreaded` a disagreement. The
    // existing seam rows never reach it for the same reason: their off-record
    // threading lands on a shared section.
    expect(sectionWiringConditions(elsewhere, 0, CH).threaded.verdict,
      'condition 2 is existence and answers yes: that is not the defect').toBe('yes');
    expect(sectionConditionsAgreeWithState(elsewhere, 0, CH)).toBe(true);
  });

  it('an owed channel whose array is EMPTY still owes the chooser once', () => {
    // PLANT SW15, SURVIVED: `const want = indices`. aeon spells it
    // `want = set(ch.indices(doc) or {0})`, and with `want` empty every
    // `some()` is false, so a document carrying `patch_world_ys: []` ticks a
    // condition whose chooser is threaded nowhere. Every existing condition-3
    // fixture carries either a non-empty array or `cycles`, whose `indices` is
    // the constant `[0]` and can never be empty.
    const w = named();
    const c = sectionExtraChannelsCondition(w, 0, { patch_world_ys: [] }, 'zzz', 'act1', 'mine');
    expect(c.verdict).toBe('no');
    expect(c.gaps.map((g) => g.channel.key)).toEqual(['patch_world_ys']);
    expect(c.gaps[0].want, 'the empty array still reaches index 0').toEqual([0]);
    expect(c.gaps[0].got).toEqual([]);
  });

  it('the call parse NORMALISES the indices it reports: deduplicated and in order', () => {
    // PLANTS SW20 and SW21, BOTH SURVIVED. `got` is printed to an author
    // (`threaded only at slot 0,1`) and compared index by index, and the only
    // fixture reaching this function threads one index in ascending order, so
    // neither the dedupe nor the sort was observed. A `variants:` array literal
    // is written in the author's order, not sorted, and a record editable by
    // hand can repeat a call.
    const lib = `
pub data R_Out_Of_Order: EffectsPreset = preset(
    variants: [ zzz_act1_sec_variant(sec: 3, slot: 2, hand: A),
                zzz_act1_sec_variant(sec: 3, slot: 0, hand: B),
                zzz_act1_sec_variant(sec: 3, slot: 2, hand: C) ])
`;
    const calls = libraryChannelChooserCalls(
      lib, channelChooserName('zzz', 'act1', 'variant'), 'slot');
    expect(calls.R_Out_Of_Order[3], 'sorted, and slot 2 recorded once').toEqual([0, 2]);
  });

  it('the index parameter is matched BY NAME: a misspelled one is not threading', () => {
    // PLANT SW22, SURVIVED: `\w+` in place of the channel's own index
    // parameter. The two indexed channels use different words (`slot` for
    // variants, `ch` for both patch arrays) and aeon's build refuses the wrong
    // one — so reading it as threaded is Aurora ticking a condition the build
    // will refuse, which is the one outcome condition 3 was added to stop.
    const fn = channelChooserName('zzz', 'act1', 'patch_world_y');
    const wrong = 'pub data R_Wrong: EffectsPreset = preset(patch_world_ys: [ '
      + `${fn}(sec: 4, slot: 0, hand: PATCH_ANCHOR_NONE) ])`;
    expect(libraryChannelChooserCalls(wrong, fn, 'ch'),
      '`slot:` is not this chooser\'s index parameter').toEqual({});
    // The control: the same record spelled correctly IS found, so the row is
    // not merely asserting that the parse found nothing.
    const right = wrong.replace('slot: 0', 'ch: 0');
    expect(libraryChannelChooserCalls(right, fn, 'ch')).toEqual({ R_Wrong: { 4: [0] } });
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// ARM EXCLUSIVITY — the one structural refusal (SECTION0-SPECIAL-CASE)
// ═══════════════════════════════════════════════════════════════════════════
//
// Aeon ruled at `92d744fc` that the question Aurora asked was the wrong shape:
// section 0 is a STABLE PROPERTY, sections 1/2/4 are incidental-but-occupied
// (content, the owner's call), section 3 is incidental AND FREE. These rows
// hold the derivation that makes the first of those three a disabled control,
// and — just as hard — hold it OFF the other two.

/** A library whose one record binds a `patched:` arm, and one that does not. */
const PATCHED_LIB = `
pub data ZZZ_Preset_Sec0: EffectsPreset = preset(pal: P, patched: ZZZ_TwoChannel,
    cycle: Pal_Cycle_None)
pub data ZZZ_Preset_Shared: EffectsPreset = preset(pal: P, raster: Raster_Program_None)
`;

/** The four sections of SYNTHETIC_DESC, over a library that bars section 0. */
function barred(): SectionRasterWiring {
  return {
    bindings: descriptorEffectsBindings(SYNTHETIC_DESC, 'zzz'),
    threadedBy: libraryRasterChooserCalls(PATCHED_LIB, rasterChooserName('zzz', 'act1')),
    channelThreadedBy: libraryChannelCalls(PATCHED_LIB, 'zzz', 'act1'),
    patchedArm: libraryPatchedArmBindings(PATCHED_LIB),
    descriptor: { path: '(synthetic)', parsed: true },
    library: { path: '(synthetic)', parsed: true },
  };
}

describe('the patched arm: parsing the one thing preset() will not share', () => {
  it('a record binding `patched: <program>` is found, one binding none is absent', () => {
    expect(libraryPatchedArmBindings(PATCHED_LIB))
      .toEqual({ ZZZ_Preset_Sec0: 'ZZZ_TwoChannel' });
  });

  it('`patched: 0` is preset()\'s own OFF and binds no arm', () => {
    // THE VALUE MATTERS, NOT THE KEY. `preset()`'s signature is
    // `patched: Label = 0`, so an explicit 0 and an absent parameter are the
    // same state; a predicate asking `'patched' in body` would refuse a section
    // that binds nothing at all.
    const off = 'pub data R_Off: EffectsPreset = preset(pal: P, patched: 0, raster: R)';
    expect(libraryPatchedArmBindings(off)).toEqual({});
    // The control: the same record with a real program IS found, so the row is
    // not merely asserting that the parse found nothing.
    expect(libraryPatchedArmBindings(off.replace('patched: 0', 'patched: R_Prog')))
      .toEqual({ R_Off: 'R_Prog' });
  });

  it('A COMMENT IS NOT A BINDING, and the plant is aeon\'s own sentence', () => {
    // ⚠ THIS IS NOT A SYNTHETIC HAZARD. `ojz_effects.emp` carries this line in
    // prose at :1459 (aeon f93f9f6f), inside a docblock about why somebody did
    // NOT unbind the arm — and the record split runs declaration-to-declaration,
    // so that comment sits inside the body of `OJZ_DepthVSplit` (:1366), the
    // nearest preceding declaration. Today that record is a raster PROGRAM no
    // section binds as its preset, so the false positive lands somewhere
    // harmless. One more declaration between the two and Aurora would grey out
    // a control on the strength of a sentence explaining an absence.
    const prose = '// UNBINDING `patched: OJZ_TwoChannel` would have done the same thing\n';
    const lib = 'pub data R_Prog: [u16; 4] = raster_program(X)\n'
      + prose
      + 'pub data R_Preset: EffectsPreset = preset(pal: P, raster: Raster_Program_None)\n';
    expect(libraryPatchedArmBindings(lib),
      'a sentence about a binding is not a binding').toEqual({});
    // THE CONTROL, so this row cannot pass by the parse being broken outright:
    // the same text with the comment marker removed DOES bind an arm.
    expect(libraryPatchedArmBindings(lib.replace(prose, 'x: patched: OJZ_TwoChannel\n')))
      .toEqual({ R_Prog: 'OJZ_TwoChannel' });
  });
});

describe('arm exclusivity: the three verdicts, and none of them is the others', () => {
  it('a section whose record binds `patched:` is BARRED, and the sentence names both', () => {
    const w = barred();
    const arm = sectionArmExclusivity(w, 0);
    expect(arm.verdict).toBe('barred');
    expect(arm.record).toBe('ZZZ_Preset_Sec0');
    expect(arm.patched).toBe('ZZZ_TwoChannel');
    const say = sectionArmExclusivityRefusal(w, 0, 'zzz_act1_sec_raster');
    // THE SENTENCE IS THE INSTRUMENT, so it is asserted like one: it must carry
    // the record, the program, the chooser call the seam gate names, and the
    // mechanism — not "you cannot bind this section".
    expect(say).toContain('ZZZ_Preset_Sec0');
    expect(say).toContain('patched: ZZZ_TwoChannel');
    expect(say).toContain('zzz_act1_sec_raster(sec: 0)');
    expect(say).toContain('mutually exclusive');
    expect(say, 'a refusal must not be phrased as a prohibition by Aurora')
      .not.toMatch(/you (can ?not|may not)/i);
  });

  it('a section whose record binds no arm is OPEN, and says nothing at all', () => {
    // Sections 1 and 2 of the synthetic descriptor bind `ZZZ_Preset_Shared`,
    // which hands `raster:` a literal. They fail condition 1 loudly — and this
    // predicate is silent about them, which is the whole three-way point: an
    // occupied or unthreaded section is not a barred one.
    const w = barred();
    expect(sectionArmExclusivity(w, 1).verdict).toBe('open');
    expect(sectionArmExclusivityRefusal(w, 1, 'zzz_act1_sec_raster')).toBeNull();
    expect(sectionWiringConditions(w, 1, 'zzz_act1_sec_raster').ownPreset.verdict,
      'and the OTHER conditions still speak about it').toBe('no');
  });

  it('a section binding NO record is open, not barred: no record is no arm', () => {
    // Section 3 of the synthetic descriptor binds nothing. `unknown` would be
    // wrong (nothing was unreadable) and `barred` would be a refusal invented
    // out of an absence.
    expect(sectionArmExclusivity(barred(), 3).verdict).toBe('open');
  });

  it('AN UNREADABLE LIBRARY IS `unknown`, and it collapses in neither direction', () => {
    // THE LOAD-BEARING ROW. `raster-binding.ts`'s standing refusal, hardest
    // clause: a control greyed out because a file could not be read is
    // indistinguishable, to the author, from one greyed out because the thing is
    // impossible. And the other direction matters as much — enabled AND SILENT
    // would let a structural impossibility present as an ordinary binding.
    const noLib: SectionRasterWiring = {
      ...barred(),
      library: { path: 'ojz_effects.emp', parsed: false, reason: 'ENOENT' },
    };
    expect(sectionArmExclusivity(noLib, 0).verdict).toBe('unknown');
    expect(sectionArmExclusivityRefusal(noLib, 0, 'zzz_act1_sec_raster'),
      'never disabled for a mechanism nobody measured').toBeNull();
    expect(sectionBindingControlDisabled(noLib, 0, null),
      'the control stays ENABLED').toBe(false);
    const notice = sectionArmExclusivityUnknownNotice(noLib, 0);
    expect(notice, 'and never SILENTLY enabled').not.toBeNull();
    expect(notice).toContain('ojz_effects.emp');
    expect(notice).toContain('ENOENT');
    expect(notice).toContain('ENABLED');
  });

  it('the unknown notice is SILENT when there is a real answer', () => {
    // Otherwise it would print beside the refusal it is the alternative to.
    expect(sectionArmExclusivityUnknownNotice(barred(), 0)).toBeNull();
    expect(sectionArmExclusivityUnknownNotice(barred(), 1)).toBeNull();
  });

  it('`armBarredSections` names NOBODY when the library was not read', () => {
    // `unknown` collapses to "refuse nothing" and never to "refuse everything":
    // this set's only use is to grey controls out.
    const noLib: SectionRasterWiring = {
      ...barred(),
      library: { path: 'ojz_effects.emp', parsed: false, reason: 'ENOENT' },
    };
    expect(armBarredSections(noLib, 4)).toEqual([]);
    expect(armBarredSections(barred(), 4), 'the control: it names section 0 when it can')
      .toEqual([0]);
  });
});

describe('the disable rule, both clauses', () => {
  it('barred AND nothing bound: the control is dead', () => {
    expect(sectionBindingControlDisabled(barred(), 0, null)).toBe(true);
  });

  it('BARRED WITH SOMETHING ALREADY BOUND: THE CONTROL STAYS LIVE', () => {
    // ⚠ THE CLAUSE A NEVER-RUN ASSERTION WOULD LET ROT. A barred section that
    // already carries a `rasterRef` is a tree aeon's seam gate is refusing right
    // now, and this select is the only control in the app that can take the
    // binding back out. A disable that traps the broken state and hides its one
    // fix is worse than the defect it prevents. The refusal sentence stays on
    // screen either way — it is `sectionArmExclusivityRefusal`, which does not
    // read `rasterRef` at all.
    expect(sectionBindingControlDisabled(barred(), 0, 'some_doc')).toBe(false);
    expect(sectionArmExclusivityRefusal(barred(), 0, 'zzz_act1_sec_raster'),
      'and the reason is still said').not.toBeNull();
  });

  it('not barred: never disabled, bound or not', () => {
    expect(sectionBindingControlDisabled(barred(), 1, null)).toBe(false);
    expect(sectionBindingControlDisabled(barred(), 1, 'some_doc')).toBe(false);
  });
});

describe('against aeon\'s real ojz/act1: which sections are structurally barred', () => {
  // Read at `AEON_PIN`, the last pre-regions revision; see its docblock. The
  // ruling these rows apply was made against that tree.
  const desc = pinnedDesc;
  const lib = pinnedLib;
  const need = (ctx: { skip: (reason: string) => void }): boolean => {
    if (pinned.ok) return true;
    ctx.skip(`SKIPPED, NOT PASSED: ${pinned.why}: these rows read aeon's real act_descriptor.emp `
      + `and ojz_effects.emp at ${AEON_PIN} and could not. The synthetic rows above still ran and `
      + 'cover every verdict; what is unmeasured here is WHICH sections that revision of aeon\'s '
      + 'files bars.');
    return false;
  };
  const real = (): SectionRasterWiring => ({
    bindings: descriptorEffectsBindings(desc, 'ojz'),
    threadedBy: libraryRasterChooserCalls(lib, rasterChooserName('ojz', 'act1')),
    channelThreadedBy: libraryChannelCalls(lib, 'ojz', 'act1'),
    patchedArm: libraryPatchedArmBindings(lib),
    descriptor: { path: DESC, parsed: true },
    library: { path: LIB, parsed: true },
  });

  it('THE RULING APPLIED: section 0 is barred, and the program is named', (ctx) => {
    if (!need(ctx)) return;
    const arm = sectionArmExclusivity(real(), 0);
    expect(arm.verdict).toBe('barred');
    expect(arm.record).toBe('OJZ_Preset_Sec0');
    expect(arm.patched).toBe('OJZ_TwoChannel');
  });

  it('SECTIONS 1 TO 4 ARE NOT BARRED: the half of the ruling that refuses to refuse', (ctx) => {
    if (!need(ctx)) return;
    // ⚠ THIS IS THE ROW THAT STOPS THE THREE-WAY ANSWER COLLAPSING BACK INTO A
    // BINARY. What bars 1, 2 and 4 is what already sits in their raster channels
    // (`OJZ_TestRaster`, `OJZ_TestGradient`, the d-15 showcase `OJZ_DepthVSplit`)
    // and that is CONTENT: reversible, and the owner's to reverse. Section 3 is
    // free outright. Aeon: a single verdict for "0-4" "would either hide four
    // reversible content calls behind a structural-sounding refusal, or promise
    // section 0 a binding the gate will refuse."
    const w = real();
    for (const sec of [1, 2, 3, 4]) {
      // ⚠ THE INSTRUMENT MUST SEE ITS SUBJECT (2026-09-14). `open` is also what
      // an EMPTY binding map answers (no record, no arm), so until this line the
      // row stayed GREEN against aeon after regions while the reader found
      // nothing at all (docs/reviews/2026-09-13-section-wiring-off-live-aeon.md,
      // noticed 1). A section that binds no record here cannot tell us it is open.
      expect(sectionArmExclusivity(w, sec).record, `section ${sec} binds no record in this reading, `
        + 'so "open" below would be the empty map\'s answer and would measure nothing').not.toBeNull();
      expect(sectionArmExclusivity(w, sec).verdict, `section ${sec} is not structural`)
        .toBe('open');
      expect(sectionArmExclusivityRefusal(w, sec, rasterChooserName('ojz', 'act1')),
        `section ${sec} is refused nothing by Aurora`).toBeNull();
      expect(sectionBindingControlDisabled(w, sec, null),
        `section ${sec} keeps a live control`).toBe(false);
    }
  });

  it('SECTION 7 IS BARRED TOO, AND THE RULING\'S PROSE SAYS IT IS NOT', (ctx) => {
    if (!need(ctx)) return;
    // ⚠ THE REASON THE PROPERTY IS DERIVED AND NOT WRITTEN DOWN. Aeon's ruling
    // at 92d744fc says "Section 0 is the only section in the tree with live
    // patch channels" — a sentence quoted from their own 2026-09-03
    // OJZ_Preset_Sec5 block. Their ojz_effects.emp has contradicted it since
    // 2026-09-05: "SECTION 7 IS THE ACT'S SECOND SECTION WITH LIVE PATCH
    // CHANNELS", and OJZ_Preset_Sec7 binds `patched: OJZ_WorldWater`. A literal
    // `sec === 0` would have shipped two days stale on the day it was written.
    //
    // IF THIS ROW GOES RED the correct response is to read the new fact off
    // aeon's file, never to pin the old one here.
    const arm = sectionArmExclusivity(real(), 7);
    expect(arm.verdict).toBe('barred');
    expect(arm.record).toBe('OJZ_Preset_Sec7');
    expect(arm.patched).toBe('OJZ_WorldWater');
  });

  it('the barred set is DERIVED, and it is not "0 to 4"', (ctx) => {
    if (!need(ctx)) return;
    const set = armBarredSections(real(), 9);
    expect(set).toEqual([0, 7]);
    // Stated as its own claim so a future reader meets the contradiction rather
    // than inferring it: the shape the ruling asked a verdict on is neither.
    expect(set, 'the ruling asked about 0 to 4 and the tree answers 0 and 7')
      .not.toEqual([0, 1, 2, 3, 4]);
  });

  it('SECTION 3 IS FREE, and that is INFORMATION and not a default', (ctx) => {
    if (!need(ctx)) return;
    // Aeon: section 3 "already owns its own preset AND its raster channel is
    // Raster_Program_None — the exact pair of conditions that made section 5 the
    // first candidate. Nothing structural or content-shaped stops it; it has
    // simply never been threaded." This row records that Aurora agrees, from its
    // own parse. Nothing here threads it, selects it or defaults to it: that is
    // the owner's call, and the row exists so the fact survives this session.
    const w = real();
    const chooser = rasterChooserName('ojz', 'act1');
    const c = sectionWiringConditions(w, 3, chooser);
    expect(c.ownPreset.verdict, 'its preset record is its own').toBe('yes');
    expect(c.ownPreset.record).toBe('OJZ_Preset_Sec3');
    expect(c.threaded.verdict, 'and nothing threads it: one aeon line, not a redesign')
      .toBe('no');
    expect(sectionArmExclusivity(w, 3).verdict, 'and nothing structural stops it')
      .toBe('open');
  });

  it('the comment stripper is EXERCISED by aeon\'s real file, not only by the plant', (ctx) => {
    if (!need(ctx)) return;
    // The plant above proves the stripper refuses a sentence. This proves the
    // sentence is really there: an unexercised guard and a guard with no hazard
    // read alike.
    expect(lib, 'aeon still carries the prose that would have parsed as a binding')
      .toContain('UNBINDING `patched: OJZ_TwoChannel`');
    expect(Object.keys(libraryPatchedArmBindings(lib)).sort(),
      'and exactly two records bind an arm, both of them real')
      .toEqual(['OJZ_Preset_Sec0', 'OJZ_Preset_Sec7']);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// AGAINST aeon's CURRENT ACT 1, AFTER REGIONS: the currency rows row 178 left owed
// ═══════════════════════════════════════════════════════════════════════════
//
// (2026-09-14, SECTIONS-0-7-UNBARRED-AFTER-REGIONS; packet
// docs/reviews/2026-09-14-sections-0-7-regions-reader.md.) The blocks above
// read `AEON_PIN`, the last revision before regions, and cannot say whether the
// reader still reads aeon. These read `AEON_REGIONS_PIN`, aeon's published act 1
// with the bindings in `OJZ_ACT1_REGION_ROWS`, through git objects like the rest
// of this file. aeon's working tree is never opened.
//
// ⚠ THE EXPECTATIONS COME FROM A SECOND INSTRUMENT, NOT FROM THE READER. A reader
// checked against itself is green whatever it does. So the map these rows
// expect comes from `regionRowsByLine`, which reads the table one physical line
// at a time and shares no code with the reader, and the barred set from
// `presetsBindingPatched`, which balances each `preset(...)` call where
// `libraryPatchedArmBindings` splits declaration to declaration. The literal
// readings are asserted too, as what both instruments returned at this pin, so
// the two drifting together is red as well.

/**
 * aeon's region table read ONE PHYSICAL LINE AT A TIME: for each row line, the
 * `effects:` and the `sec:` written on that same line. Valid only while the
 * table is written one row per line, which it is at `AEON_REGIONS_PIN`, so the
 * row that uses it ASSERTS that formatting (declared length equals row lines,
 * one of each per line) instead of assuming it.
 */
function regionRowsByLine(desc: string, constName: string): {
  declared: number | null;
  rows: { line: number; presets: string[]; secs: number[]; effectsBeforeSec: boolean }[];
} {
  const ls = desc.split('\n');
  const start = ls.findIndex((l) => new RegExp(`^\\s*(?:pub\\s+)?const\\s+${constName}\\s*:`).test(l));
  if (start < 0) return { declared: null, rows: [] };
  const declared = /\[\s*Region\s*;\s*(\d+)\s*\]/.exec(ls[start]);
  const rows: { line: number; presets: string[]; secs: number[]; effectsBeforeSec: boolean }[] = [];
  for (let i = start + 1; i < ls.length && !/^\s*\]\s*$/.test(ls[i]); i++) {
    const code = ls[i].split('//')[0];
    if (!/^\s*ojz_region\s*\(/.test(code)) continue;
    rows.push({
      line: i + 1,
      presets: [...code.matchAll(/\beffects\s*:\s*([A-Za-z_]\w*)/g)].map((m) => m[1]),
      secs: [...code.matchAll(/\bsec\s*:\s*(\d+)/g)].map((m) => Number(m[1])),
      effectsBeforeSec: code.search(/\beffects\s*:/) < code.search(/\bsec\s*:/),
    });
  }
  return { declared: declared ? Number(declared[1]) : null, rows };
}

/**
 * The `EffectsPreset` records whose OWN `preset(...)` call passes a non-zero
 * `patched:`, found by balancing that call's parentheses after dropping `//`
 * comments line by line. Independent of `libraryPatchedArmBindings`.
 */
function presetsBindingPatched(lib: string): { declared: number; patched: Set<string> } {
  const code = lib.split('\n').map((l) => l.split('//')[0]).join('\n');
  const patched = new Set<string>();
  let declared = 0;
  for (const m of code.matchAll(/\bdata\s+([A-Za-z_]\w*)\s*:\s*EffectsPreset\s*=\s*preset\s*\(/g)) {
    declared++;
    const open = m.index! + m[0].length - 1;
    let depth = 0;
    let j = open;
    for (; j < code.length; j++) {
      if (code[j] === '(') depth++;
      else if (code[j] === ')' && --depth === 0) break;
    }
    const p = /\bpatched\s*:\s*([A-Za-z_]\w*|\d+)/.exec(code.slice(open, j + 1));
    if (p && p[1] !== '0') patched.add(m[1]);
  }
  return { declared, patched };
}

describe('against aeon\'s CURRENT act 1, after regions: the reader reads the region rows', () => {
  const desc = regionsDesc;
  const lib = regionsLib;
  const where = `aeon:${DESC_REL} at ${AEON_REGIONS_PIN}`;
  const need = (ctx: { skip: (reason: string) => void }): boolean => {
    if (regions.ok) return true;
    ctx.skip(`SKIPPED, NOT PASSED: ${regions.why}: this row reads aeon's act_descriptor.emp and `
      + `ojz_effects.emp at ${AEON_REGIONS_PIN}, aeon's published act 1 after regions, and CANNOT `
      + 'MEASURE whether Aurora\'s reader finds the section bindings in the region rows or which '
      + 'sections come back barred. The synthetic reader rows above still ran; the pre-regions rows '
      + 'read a different revision and cannot answer this.');
    return false;
  };
  /** The wiring the load builds, call for call: `readDescriptorWiring` IS the load's descriptor step. */
  const loaded = (): SectionRasterWiring => ({
    ...readDescriptorWiring(RDESC, desc, 'ojz'),
    threadedBy: libraryRasterChooserCalls(lib, rasterChooserName('ojz', 'act1')),
    channelThreadedBy: libraryChannelCalls(lib, 'ojz', 'act1'),
    patchedArm: libraryPatchedArmBindings(lib),
    library: { path: RLIB, parsed: true },
  });

  it('the run SAID it read aeon at AEON_REGIONS_PIN, out of the object database', (ctx) => {
    if (!need(ctx)) return;
    expect(regionsProvenance, 'the stamp does not say the bytes came out of aeon\'s object database')
      .toContain('COMMITTED OBJECTS');
    expect(regionsProvenance, `the stamp does not name the pinned revision ${AEON_REGIONS_PIN}`)
      .toContain(AEON_REGIONS_PIN);
    expect(regionsProvenance, 'the stamp declares itself incomplete').not.toContain('PROVENANCE INCOMPLETE');
  });

  it('the second instrument SAW the table: one line per declared row, one preset and one key on each', (ctx) => {
    if (!need(ctx)) return;
    const t = regionRowsByLine(desc, 'OJZ_ACT1_REGION_ROWS');
    expect(t.declared, `no [Region; N] declaration of OJZ_ACT1_REGION_ROWS in ${where}: the table `
      + 'moved or was renamed; re-read the file before touching this row').not.toBeNull();
    expect(t.rows.length, `${where}: one row line per declared entry`).toBe(t.declared);
    for (const r of t.rows) {
      expect(r.presets, `${where} line ${r.line}: exactly one effects:`).toHaveLength(1);
      expect(r.secs, `${where} line ${r.line}: exactly one sec:`).toHaveLength(1);
      // THE TRAP'S PRECONDITION, measured here rather than taken from aeon's
      // message: on every row the preset is written BEFORE the key.
      expect(r.effectsBeforeSec, `${where} line ${r.line}: effects: before sec:`).toBe(true);
    }
    // And every row names a DIFFERENT preset, so a neighbour shift is visible to
    // the pairing row below rather than landing on an equal value.
    expect(new Set(t.rows.map((r) => r.presets[0])).size, `${where}: the presets are distinct`)
      .toBe(t.rows.length);
  });

  it('THE READER AGAINST IT: one binding per region row, none unkeyed, none contested', (ctx) => {
    if (!need(ctx)) return;
    const t = regionRowsByLine(desc, 'OJZ_ACT1_REGION_ROWS');
    const expected: Record<number, string> = {};
    for (const r of t.rows) expected[r.secs[0]] = r.presets[0];
    const rows = descriptorEffectsRows(desc, 'ojz');
    expect(rows.bindings, `the reader disagrees with the region table read line by line in ${where}`)
      .toEqual(expected);
    expect(rows.unkeyed, `${where}: a row the reader could not key`).toEqual([]);
    expect(rows.contested, `${where}: a section two rows disagree about`).toEqual([]);
    // THE READING AT THIS PIN, as both instruments return it (and as aeon's
    // answer states it, which is a claim this row checked, not its source).
    expect(Object.keys(rows.bindings).map(Number), where).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8]);
    expect(Object.values(rows.bindings), where).toEqual([
      'OJZ_Preset_Sec0', 'OJZ_Preset_Sec1', 'OJZ_Preset_Sec2', 'OJZ_Preset_Sec3', 'OJZ_Preset_Depth',
      'OJZ_Preset_Sec5', 'OJZ_Preset_Sec6', 'OJZ_Preset_Sec7', 'OJZ_Preset_Plain',
    ]);
    // ANTI-VACUOUS FOR `unkeyed: []`: this very file carries the declaration that
    // WOULD be a key-less row if the reader took it for one.
    expect(desc, `${where}: the ojz_region declaration this row relies on`)
      .toMatch(/comptime fn ojz_region\([^)]*effects: Label/);
  });

  it('THE PAIRING TRAP: no section is given its neighbour\'s preset', (ctx) => {
    if (!need(ctx)) return;
    // aeon's point 2. Every row writes `effects:` before `sec:` (the instrument
    // row above measures it), so a reader that finds `sec: N` and searches
    // FORWARD for `effects:` gives section N the NEXT row's preset and still
    // returns a tidy map.
    const t = regionRowsByLine(desc, 'OJZ_ACT1_REGION_ROWS');
    const b = descriptorEffectsRows(desc, 'ojz').bindings;
    t.rows.forEach((own, i) => {
      const next = t.rows[i + 1];
      expect(b[own.secs[0]], `section ${own.secs[0]} (${where} line ${own.line}) must bind `
        + `${own.presets[0]}, the preset in its own row`
        + (next ? `, not ${next.presets[0]} from line ${next.line}` : '')).toBe(own.presets[0]);
    });
  });

  it('THE LOAD\'S READING IS PARSED: condition 1 answers, the act-sets line has its inputs, no "could not read"', (ctx) => {
    if (!need(ctx)) return;
    const w = loaded();
    const n = regionRowsByLine(desc, 'OJZ_ACT1_REGION_ROWS').rows.length;
    expect(w.descriptor, `the load marks ${where} unparsed: ${w.descriptor.reason ?? ''}`)
      .toMatchObject({ parsed: true, read: true });
    expect(w.unkeyedRows, where).toEqual([]);
    const CH = rasterChooserName('ojz', 'act1');
    for (let s = 0; s < n; s++) {
      const c1 = sectionWiringConditions(w, s, CH).ownPreset;
      expect(c1.verdict, `section ${s}: condition 1 still unknown against ${where}`).not.toBe('unknown');
      expect(c1.detail, `section ${s}`).not.toMatch(/could not read|no usable/);
    }
    // The act-sets line is drawn on `descriptor.parsed` (SectionPicker.tsx) and
    // prints these sets. Every row names its own distinct preset (measured
    // above), so every section owns its preset.
    expect(ownPresetSections(w, n, CH), where).toEqual([...Array(n).keys()]);
    expect(wiredSections(w, n), `${where}: the library half, which regions did not touch`)
      .toEqual([5, 6]);
  });

  it('SECTIONS 0 AND 7 COME BACK BARRED, and the barred set is DERIVED from the patched: declarations', (ctx) => {
    if (!need(ctx)) return;
    const w = loaded();
    const t = regionRowsByLine(desc, 'OJZ_ACT1_REGION_ROWS');
    const n = t.rows.length;
    const lib2 = presetsBindingPatched(lib);
    expect(lib2.declared, `aeon:${LIB_REL} at ${AEON_REGIONS_PIN}: the second instrument found `
      + 'fewer preset() records than there are sections, so it is not reading that file')
      .toBeGreaterThanOrEqual(n);
    expect(lib2.patched.size, 'the second instrument found no record binding patched:, so it '
      + 'measured nothing').toBeGreaterThan(0);
    const derived = t.rows.filter((r) => lib2.patched.has(r.presets[0])).map((r) => r.secs[0])
      .sort((a, b) => a - b);
    expect(armBarredSections(w, n), `the barred set disagrees with the sections whose own row binds `
      + `a preset that passes patched:, derived independently from ${where}`).toEqual(derived);
    expect(derived.length, 'a barred set that names every section refuses nothing in particular')
      .toBeLessThan(n);
    // THE READING AT THIS PIN: sections 0 and 7, the two aeon's preset() refuses.
    const reading: [number, string, string][] = [
      [0, 'OJZ_Preset_Sec0', 'OJZ_TwoChannel'], [7, 'OJZ_Preset_Sec7', 'OJZ_WorldWater'],
    ];
    for (const [sec, record, program] of reading) {
      const arm = sectionArmExclusivity(w, sec);
      expect(arm, `section ${sec} against ${where}`).toEqual({ verdict: 'barred', record, patched: program });
      expect(sectionBindingControlDisabled(w, sec, null), `section ${sec}'s control is disabled`).toBe(true);
    }
    // Every OTHER section is open WITH A RECORD: its instrument saw its subject,
    // so `open` here is not the answer an empty binding map would give.
    for (let s = 0; s < n; s++) {
      if (derived.includes(s)) continue;
      const arm = sectionArmExclusivity(w, s);
      expect(arm.verdict, `section ${s}`).toBe('open');
      expect(arm.record, `section ${s} binds a record`).not.toBeNull();
    }
  });
});
