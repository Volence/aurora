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
//   2. The panel READS them and renders them UNCONDITIONALLY. A limit behind a
//      `title=` or a collapsed detail is a limit the panel does not carry — the
//      brief's words, and the whole reason `LimitBlock` is not a tooltip.
//   3. NOTHING here claims anyone has SEEN one. No band in this suite has ever
//      been looked at on screen; copy implying otherwise is the one thing worse
//      than no preview.
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
  PRESET_HEADLINE, PRESET_LIMITS, NO_PREVIEW, lastBandRefusal, armOptions,
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
    expect(l.body).toMatch(/no control in the band-preset panel writes a rasterRef/i);
    // THE READER EXISTS. Pinned to the file that resolves the key rather than to
    // a loose "reads it", which limit 2's "aeon steps a band-demo table" prose
    // could drift into satisfying.
    expect(l.body).toMatch(/tools\/effects_gen\.py resolves rasterRef/i);
    // ...AND THE CALL SITE DOES NOT. The half that keeps this from reading as
    // "it works now": the chooser is emitted and nothing passes it to preset().
    expect(l.body).toMatch(/no preset\(\) in aeon's games\/sonic4\/data\/effects\/ojz_effects\.emp/i);
    expect(l.body).toMatch(/the band does not play/i);
    // The hand-work is now a CALL-SITE edit, not authoring the effect — the
    // difference an author acts on.
    expect(l.body).toMatch(/one line per section at that call site/i);
    expect(l.body).toMatch(/costs ROM/i);
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
    // wording. The verb is what makes the anchor this limit's own.
    expect(l.body).toMatch(/Verified at aeon 4aa2abc0/);
    expect(l.body).toMatch(/EXPIRES when aeon threads the chooser into ojz_effects\.emp/);
    // The two files to re-read are named IN the sentence, not left to the reader.
    expect(l.body).toMatch(/re-read games\/sonic4\/data\/effects\/ojz_effects\.emp/i);
    expect(l.body).toMatch(/re-read tools\/effects_gen\.py/i);
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
   * ⚠ NOBODY HAS EVER LOOKED AT ONE OF THESE BANDS ON SCREEN. No emulator run,
   * no capture, anywhere in the suite. Nothing on this surface may imply
   * otherwise — and the absence of a preview must be EXPLAINED, because an empty
   * space reads as "coming soon" rather than "there is no ground truth".
   */
  it('NO_PREVIEW says there is nothing to draw a faithful preview from', () => {
    expect(NO_PREVIEW).toMatch(/never been looked at on screen/i);
    expect(NO_PREVIEW).toMatch(/nothing to draw a faithful preview from/i);
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
    expect(code).toMatch(/PRESET_LIMITS\.map/);
    expect(code).toMatch(/\{PRESET_HEADLINE\}/);
    expect(code).toMatch(/\{NO_PREVIEW\}/);
    // The bodies must reach the render, not just the titles.
    expect(code).toMatch(/\{l\.body\}/);
  });

  it('the limits are BODY TEXT, not a title= attribute', () => {
    // The failure this rules out: `title={l.body}` — technically present,
    // invisible until hover, which the brief forbids in as many words.
    expect(code).not.toMatch(/title=\{(?:l|limit)\.body\}/);
    expect(code).not.toMatch(/title=\{NO_PREVIEW\}/);
    expect(code).not.toMatch(/title=\{PRESET_HEADLINE\}/);
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
    expect(why).toMatch(/at least one band/i);
    expect(why).toMatch(/zero-band program/i);

    // ...and with two bands the refusal lifts, so this is a condition and not
    // a permanent wall.
    one.bands.push(one.bands[0]);
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
    const empty = { presets: [], unreadable: [], notices: [] };
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
      notices: [],
    };
    expect(presetIdRefusal('broken', lib)).toMatch(/exists but could not be read/);
    expect(presetIdRefusal('broken', lib)).toMatch(/would destroy it/);
  });
});
