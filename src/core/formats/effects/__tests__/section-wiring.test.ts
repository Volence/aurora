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
// `ojz_effects.emp` when a checkout is reachable, and are SKIPPED WITH A REASON
// when it is not — never quietly passed on fixtures alone. The fixtures are
// here too, for the shapes the real tree cannot produce.
//
// ⚠ WHAT THE NUMBERS BELOW ARE. `[0,1,2,3,4,5]` and `{OJZ_Preset_Sec5: 5}` are
// NOT the contract and are not a list this repository holds — they are what the
// parse returns TODAY, asserted here so a changed world is distinguishable from
// a broken parser. When aeon splits `OJZ_Preset_Plain`, these rows go red and
// the correct response is to read the new numbers off the file and update them,
// not to touch the derivation. The PRODUCT never sees a literal: it renders
// whatever the parse returned on this load.

import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import {
  descriptorEffectsBindings, libraryRasterChooserCalls, rasterChooserName, wiringPaths,
  unknownWiring, sectionRasterState, sectionRasterAdvisory, sectionSharers,
  wiredSections, eligibleSections, type SectionRasterWiring,
} from '../section-wiring';
import { siblingPathOrUnresolved } from '../../../../../test/support/sibling-root.mjs';

const AEON = siblingPathOrUnresolved('aeon');
const DESC = join(AEON, 'games/sonic4/data/levels/ojz/act1/act_descriptor.emp');
const LIB = join(AEON, 'games/sonic4/data/effects/ojz_effects.emp');
const haveTree = existsSync(DESC) && existsSync(LIB);

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

const SYNTHETIC_LIB = `
pub data ZZZ_Preset_Sec0: EffectsPreset = preset(pal: P,
    raster: zzz_act1_sec_raster(sec: 0, hand: Raster_Program_None))
pub data ZZZ_Preset_Shared: EffectsPreset = preset(pal: P, raster: Raster_Program_None)
`;

function synthetic(): SectionRasterWiring {
  return {
    bindings: descriptorEffectsBindings(SYNTHETIC_DESC, 'zzz'),
    threadedBy: libraryRasterChooserCalls(SYNTHETIC_LIB, rasterChooserName('zzz', 'act1')),
    descriptor: { path: '(synthetic)', parsed: true },
    library: { path: '(synthetic)', parsed: true },
  };
}

describe('the parse has no window — the defect that produced a wrong answer', () => {
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
  it('a section binding no preset at all is named as such (SYNTHETIC — no real one exists)', () => {
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

describe('the two paths are derived from dataPath, never written down', () => {
  it('a standard aeon act', () => {
    expect(wiringPaths('games/sonic4/data/editor/ojz/act1/', 'ojz')).toEqual({
      descriptor: 'games/sonic4/data/levels/ojz/act1/act_descriptor.emp',
      library: 'games/sonic4/data/effects/ojz_effects.emp',
    });
  });

  it('a dataPath outside data/editor/ yields null — "could not locate", not "not eligible"', () => {
    expect(wiringPaths('some/other/place/', 'ojz')).toBeNull();
    expect(wiringPaths('games/sonic4/data/editor/', 'ojz')).toBeNull();
  });
});

describe('against aeon\'s real ojz/act1 — the numbers as they stand today', () => {
  const desc = haveTree ? readFileSync(DESC, 'utf8') : '';
  const lib = haveTree ? readFileSync(LIB, 'utf8') : '';
  // ⚠ SKIPPED WITH A REASON, NEVER QUIETLY. A row that cannot reach aeon's tree
  // measured NOTHING; a green total that swallowed it would be exactly the
  // silent zero this whole derivation exists to prevent.
  const need = (ctx: { skip: (reason: string) => void }): boolean => {
    if (haveTree) return true;
    ctx.skip(`SKIPPED, NOT PASSED: no aeon checkout at ${AEON} — this row reads their real `
      + 'act_descriptor.emp and ojz_effects.emp and could not. The synthetic rows above still '
      + 'ran and cover the parser\'s shapes; what is unmeasured here is whether aeon\'s CURRENT '
      + 'files still parse the way this module expects.');
    return false;
  };

  it('every section 0-8 binds a preset record', (ctx) => {
    if (!need(ctx)) return;
    const b = descriptorEffectsBindings(desc, 'ojz');
    expect(Object.keys(b).map(Number).sort((x, y) => x - y))
      .toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8]);
    // Named, so a rename in aeon is visible here rather than silently shifting
    // the eligible set.
    expect(b[0]).toBe('OJZ_Preset_Sec0');
    expect(b[6]).toBe('OJZ_Preset_Plain');
    expect(b[7]).toBe('OJZ_Preset_Plain');
    expect(b[8]).toBe('OJZ_Preset_Plain');
  });

  it('SIX sections own their preset; 6, 7 and 8 share one', (ctx) => {
    if (!need(ctx)) return;
    const w: SectionRasterWiring = {
      bindings: descriptorEffectsBindings(desc, 'ojz'),
      threadedBy: libraryRasterChooserCalls(lib, rasterChooserName('ojz', 'act1')),
      descriptor: { path: DESC, parsed: true },
      library: { path: LIB, parsed: true },
    };
    expect(eligibleSections(w, 9)).toEqual([0, 1, 2, 3, 4, 5]);
    for (const s of [6, 7, 8]) expect(sectionRasterState(w, s)).toBe('shared');
    expect(sectionSharers(w, 7)).toEqual([6, 7, 8]);
  });

  it('exactly ONE section is threaded today — and it is not the same fact as eligible', (ctx) => {
    if (!need(ctx)) return;
    // ⚠ THE TWO FACTS ARE DIFFERENT AND BOTH MATTER. "Section 0 may have a
    // band" (its preset is its own) and "section 0 has one wired" (a preset
    // threads the chooser on index 0) are different claims, and conflating them
    // is how "only section 5" and "sections 0-5" were BOTH published as the
    // answer on the same day. They are 5 and 0-5 respectively.
    const calls = libraryRasterChooserCalls(lib, rasterChooserName('ojz', 'act1'));
    expect(calls).toEqual({ OJZ_Preset_Sec5: 5 });
    const w: SectionRasterWiring = {
      bindings: descriptorEffectsBindings(desc, 'ojz'),
      threadedBy: calls,
      descriptor: { path: DESC, parsed: true },
      library: { path: LIB, parsed: true },
    };
    expect(wiredSections(w, 9)).toEqual([5]);
    expect(eligibleSections(w, 9)).not.toEqual(wiredSections(w, 9));
  });
});
