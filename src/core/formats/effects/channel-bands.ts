/**
 * ═══════════════════════════════════════════════════════════════════════════
 * THE SCREEN BAND EACH PATCH CHANNEL IS CONFINED TO — and the ONE thing it can
 * prove about a sweep, which is a REFUSAL and never a clearance.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Source: aeon `games/sonic4/data/generated/effects_channel_bands.json`,
 * vendored at a committed revision beside this file with a `.provenance.json`
 * recording aeon's own git blob id. See
 * `src/core/formats/effects/aeon-effects-channel-bands.provenance.json` for the
 * pin and `test/formats/effects-channel-bands-drift.test.ts` for the two checks
 * it carries (byte identity here, and currency against aeon's published tip —
 * the question a pinned blob can never answer about itself).
 *
 * ─── THE TEST IS ONE-DIRECTIONAL, AND THAT IS THE WHOLE DESIGN ─────────────
 *
 * The contract's own words, `how_to_use`, guarded verbatim below:
 *
 *   "travel > lines is a CERTAIN refusal and worth warning on; travel <= lines
 *    is CANNOT TELL, never a clearance -- the latched line is (anchor -
 *    Camera_Y), so where the sweep sits inside [lo, hi] is camera-dependent and
 *    unknowable at author time."
 *
 * ⚠ SO `AnchorBandFit` HAS NO `fits` MEMBER, AT THE TYPE LEVEL. The tempting
 * design here is a green "fits ✓" beside the `Travel` select, and it is exactly
 * the sentence this data cannot support: a clearance Aurora cannot honour is
 * worse than no sentence at all, because an author who has been told it fits
 * stops looking. Making the reassuring verdict UNREPRESENTABLE is the only
 * defence that survives somebody editing this file in a hurry — a comment
 * saying "do not add a pass" is one `||` away from being ignored.
 *
 * ─── AND THE FIT IS PEAK-TO-PEAK, NOT PEAK ─────────────────────────────────
 *
 * `2 * (256 >> amp_shift)`. aeon's own sidecar said `256 >> amp_shift` until
 * `8d217dd4` and was wrong by 2x IN THE PERMISSIVE DIRECTION — a warning built
 * on the earlier wording would have stayed silent on sweeps that certainly do
 * not fit, which is the failure mode nobody notices. The factor is therefore
 * not typed here: it is PARSED out of the contract's own sentence and then
 * cross-checked against `ANCHOR_AMP_RUNGS.peak_to_peak_px` for every rung on
 * the ladder (`assertLadderAgreesWithContract`, run at module load). The panel's
 * label and the panel's warning are then computed from the SAME number, so the
 * two can never disagree on screen.
 *
 * ─── UNITS: NOTHING HERE CONVERTS, AND THAT IS AN ASSERTION ────────────────
 *
 * `units` says SCREEN LINES, 1:1 with the authored `patchable(lo:, hi:)`, "Not
 * fire lines: the engine subtracts 1 once, in Raster_BuildSchedule. Do not
 * convert." The -1 is already applied on the far side. Any ±1 introduced here
 * is a defect, so the sentence is guarded rather than trusted to memory.
 *
 * ─── WHAT A GREEN ON THIS MODULE DOES *NOT* RULE OUT ───────────────────────
 *
 * With the bands sonic4 declares today, the refusal is REACHABLE ON TWO OF THE
 * FOUR CHANNELS, and which two is a property of the DATA rather than of this
 * code. The ladder's widest rung travels 128 px, so:
 *
 *   • channel 0 (218 lines) — no legal sweep can ever be refused.
 *   • channel 1 (2 lines)   — six of the seven rungs are refused; the seventh
 *                             (amp_shift 8, 2 px) is the cannot-tell boundary.
 *   • channel 2 (158 lines) — no legal sweep can ever be refused.
 *   • channel 3 (62 lines)  — amp_shift 2 (128 px) and 3 (64 px) are refused;
 *                             the remaining five rungs are cannot-tell.
 *
 * That is why the tests plant a violating sweep on channel 1 specifically: a
 * suite that only ever exercised channel 0 would be green forever with the rule
 * inverted.
 *
 * ⚠ AND `no-band` IS CURRENTLY UNREACHABLE THROUGH THE PANEL. Channels 2 and 3
 * had no declared band until the 2026-09-05 re-vendor (aeon `ddd8881a`) added
 * them for OJZ act 1 section 7's `OJZ_WorldWater` pair; with all of 0..3
 * declared and `EFFECTS_PRESET_MAX_PATCH` at 4, no channel an author can select
 * returns `no-band`. The arm and `anchorSweepNoBandAdvisory` are deliberately
 * KEPT — the gap is a fact about aeon's data, and it reopens the moment aeon
 * retires a `patchable()` or Aurora grows a fifth channel. `[6e0]` in
 * `effects-preset-anchors.test.ts` asserts the gap is closed rather than
 * assuming it, and the `no-band` rows there drive a synthetic undeclared
 * channel so the arm keeps its coverage.
 */

import bandsJson from './aeon-effects-channel-bands.json';
import { ANCHOR_AMP_RUNGS } from './preset';

/** The document as vendored. Shape is asserted below, not assumed. */
const DOC = bandsJson as unknown as {
  schema?: unknown;
  game?: unknown;
  units?: unknown;
  how_to_use?: unknown;
  channels?: Record<string, { lo?: unknown; hi?: unknown; lines?: unknown; source?: unknown }>;
  edges?: Record<string, { behaviour?: unknown; note?: unknown }>;
};

/**
 * Every failure in this module is a THROW AT LOAD, in the posture `preset.ts`
 * established for the schema's prose: a contract sentence that has moved must
 * stop the editor, not quietly downgrade a warning into silence. A wrong-but-
 * plausible band would be invisible for exactly as long as nobody happened to
 * author the sweep it lies about.
 */
function fail(what: string): never {
  throw new Error(
    `aeon-effects-channel-bands.json (vendored at the revision in its .provenance.json) ${what}. `
    + 'Re-read the file before trusting the band warning under the Travel select: it is computed '
    + 'from these sentences, and a warning built on a rule the contract no longer holds is worse '
    + 'than no warning. The re-vendor command is in the sidecar.',
  );
}

function prose(key: 'units' | 'how_to_use'): string {
  const v = DOC[key];
  if (typeof v !== 'string' || v.length === 0) fail(`no longer carries a "${key}" string`);
  return v;
}

if (DOC.schema !== 'aeon-effects-channel-bands/1') {
  fail(`declares schema ${JSON.stringify(DOC.schema)}, not "aeon-effects-channel-bands/1"`);
}

/** The game whose raster module these bands describe. Not a global constant. */
export const EFFECTS_CHANNEL_BANDS_GAME: string = typeof DOC.game === 'string' && DOC.game.length > 0
  ? DOC.game
  : fail('no longer names the `game` its bands belong to');

// ── The units sentence. THE ONE THING THIS MODULE MUST NEVER DO IS CONVERT. ──
{
  const units = prose('units');
  if (!/SCREEN LINES, 1:1 with the authored patchable\(lo:, hi:\)/.test(units)
    || !/Do not convert\./.test(units)) {
    fail('no longer states that its numbers are SCREEN LINES, 1:1 with the authored '
      + 'patchable(lo:, hi:), and that they must not be converted. Aurora applies no ±1 '
      + 'anywhere on this path; if the engine has moved its single subtraction, that is a code '
      + 'change here and not a re-read');
  }
}

// ── The one-directional sentence. If this softens, the whole feature changes. ──
{
  const how = prose('how_to_use');
  if (!/travel > lines is a CERTAIN refusal/.test(how)) {
    fail('no longer says that travel > lines is a CERTAIN refusal — the only thing Aurora warns on');
  }
  if (!/travel <= lines is CANNOT TELL, never a clearance/.test(how)) {
    fail('no longer says that travel <= lines is CANNOT TELL and never a clearance. If aeon has '
      + 'made the fit two-directional, `AnchorBandFit` can grow a `fits` arm — until then it '
      + 'deliberately cannot');
  }
  if (!/`lines` is an INCLUSIVE COUNT of lines in \[lo, hi\]/.test(how)) {
    fail('no longer says that `lines` is an INCLUSIVE COUNT over [lo, hi], which is what makes '
      + 'travel == lines the widest sweep that fits rather than one too many');
  }
}

/**
 * The travel formula, READ OUT of the contract's own sentence rather than
 * typed: `2 * (256 >> amp_shift)`. Both numbers are captured, because the one
 * that was wrong in aeon's first cut was the leading 2.
 */
const TRAVEL = (() => {
  // ⚠ THE TAIL IS `EXCEEDS`, AND ONLY `EXCEEDS`. `CHBAND-PROSE-REPIN` closed
  // 2026-09-05 — a three-step expand-then-contract across two repos, and this
  // is the contract half.
  //
  // aeon's sentence used to open CLEARANCE-SHAPED (`A sweep ... fits when its
  // ... TRAVEL ... is <= channels[c].lines`) while a later sentence in the SAME
  // string said `travel <= lines is CANNOT TELL, never a clearance`. Two people
  // could implement that document accurately and build OPPOSITE warnings, so
  // aeon restated the test in the refusal direction only, at b8913cda, and this
  // repo pins that text. A transitional arm here accepted the old tail as well
  // — added at bbdf1890, deleted the moment the new document was vendored,
  // because every miss below is `fail()`, which throws at module load: a parser
  // that knew only one phrasing would not degrade a warning, it would stop the
  // editor from STARTING at whichever instant the two repos disagreed.
  //
  // ⚠ DO NOT RE-WIDEN THIS TO ACCEPT `is <=` AGAIN. The old phrasing is now
  // REFUSED, deliberately and loudly, and that refusal is asserted in
  // `test/formats/effects-channel-bands-prose-repin.test.ts` — which is what
  // makes the arm's absence a property rather than an accident. A document
  // opening with the clearance wording is a document that has REGRESSED to the
  // contradiction, and it should stop the editor rather than load.
  //
  // Only the multiplier and the base are read out of the sentence (2 and 256);
  // the comparison DIRECTION is never inferred from prose. It is written once,
  // in `anchorFitAgainstBand` (`travelPx > band.lines`), held by the two
  // interlocks above, and by `AnchorBandFit` having no `fits` member at the
  // type level.
  const m = /PEAK-TO-PEAK TRAVEL \((\d+) \* \((\d+) >> amp_shift\), whole pixels\) EXCEEDS channels\[c\]\.lines/
    .exec(prose('how_to_use'));
  if (!m) {
    fail('no longer states the fit formula as "PEAK-TO-PEAK TRAVEL (2 * (256 >> amp_shift), whole '
      + 'pixels) EXCEEDS channels[c].lines". That sentence is what the ladder is checked against; '
      + 'it was wrong by 2x, permissively, until aeon 8d217dd4, so it is parsed and never '
      + 'remembered. ⚠ IF THE DOCUMENT SAYS "is <= channels[c].lines" IT HAS GONE BACKWARDS: that '
      + 'clearance-shaped wording was retired at aeon b8913cda precisely because it contradicted '
      + 'the same string\'s "never a clearance" clause, and it is refused here rather than '
      + 'accepted (CHBAND-PROSE-REPIN, closed 2026-09-05)');
  }
  const multiplier = Number(m[1]);
  const base = Number(m[2]);
  if (!Number.isInteger(multiplier) || multiplier < 1) fail(`states a travel multiplier of ${m[1]}`);
  if (!Number.isInteger(base) || base < 1) fail(`states an amplitude base of ${m[2]}`);
  return { multiplier, base };
})();

/** Peak-to-peak travel, in screen lines, for one rung of the amplitude ladder. */
export function anchorTravelPx(ampShift: number): number {
  return TRAVEL.multiplier * (TRAVEL.base >> ampShift);
}

/**
 * ═══ THE INTERLOCK, AND IT IS THE ONE ASSERTION THIS PARCEL TURNS ON ═══
 *
 * `ANCHOR_AMP_RUNGS[i].peak_to_peak_px` is computed in `preset.ts` from the
 * PRESET SCHEMA's prose (`peak excursion 256 >> amp_shift px`, doubled). The
 * fit rule is stated in aeon's BANDS sidecar (`2 * (256 >> amp_shift)`). Those
 * are two different documents, published by two different repos, and until this
 * line nothing compared them.
 *
 * They agree today — checked, not assumed. If either moves, a warning would be
 * computed from one quantity and displayed beside a label computed from the
 * other, and a fit test one factor off is confidently wrong in BOTH directions:
 * silent where it should warn, and warning where it should not.
 */
function assertLadderAgreesWithContract(): void {
  const disagree = ANCHOR_AMP_RUNGS
    .filter((r) => r.peak_to_peak_px !== anchorTravelPx(r.amp_shift))
    .map((r) => `amp_shift ${r.amp_shift}: the preset schema's ladder says ${r.peak_to_peak_px} px `
      + `peak-to-peak, aeon's fit formula says ${anchorTravelPx(r.amp_shift)} px`);
  if (ANCHOR_AMP_RUNGS.length === 0) fail('was checked against an EMPTY amplitude ladder');
  if (disagree.length > 0) {
    fail(`disagrees with the preset schema's amplitude ladder:\n  ${disagree.join('\n  ')}\n  `
      + 'One of the two documents has been amended. Until they agree, the band warning is '
      + 'computed from a quantity the panel does not display');
  }
}
assertLadderAgreesWithContract();

/** One channel's declared screen band, in SCREEN LINES, inclusive of both ends. */
export interface EffectsChannelBand {
  /** Channel index — the same index space as `patch_world_ys` / `patch_motion`. */
  channel: number;
  /** Topmost screen line the boundary may sit on. */
  lo: number;
  /** Bottommost screen line the boundary may sit on. */
  hi: number;
  /** INCLUSIVE count of lines in [lo, hi]. A sweep of travel == lines is the widest that fits. */
  lines: number;
  /** Where the band is declared, in aeon's source. */
  source: string;
}

/** Every channel aeon declares a band for, by channel index. */
export const EFFECTS_CHANNEL_BANDS: ReadonlyMap<number, EffectsChannelBand> = (() => {
  const raw = DOC.channels;
  if (raw === null || typeof raw !== 'object') fail('no longer carries a `channels` object');
  const out = new Map<number, EffectsChannelBand>();
  for (const [key, v] of Object.entries(raw as Record<string, Record<string, unknown>>)) {
    if (!/^\d+$/.test(key)) fail(`names a channel ${JSON.stringify(key)} that is not an index`);
    const channel = Number(key);
    const { lo, hi, lines, source } = v as
      { lo: unknown; hi: unknown; lines: unknown; source: unknown };
    for (const [name, n] of [['lo', lo], ['hi', hi], ['lines', lines]] as const) {
      if (!Number.isInteger(n)) fail(`channel ${key} no longer declares an integer \`${name}\``);
    }
    if ((hi as number) < (lo as number)) fail(`channel ${key} declares hi < lo`);
    // `lines` is the contract's own INCLUSIVE count. Deriving it here instead
    // would be Aurora inventing a number the file already states; checking it
    // catches a generator that has started counting some other way — which is
    // the ±1 this feature must never introduce on either side.
    if ((lines as number) !== (hi as number) - (lo as number) + 1) {
      fail(`channel ${key} declares lines ${String(lines)} for the band [${String(lo)}, ${String(hi)}], `
        + `but an INCLUSIVE count over that range is ${(hi as number) - (lo as number) + 1}`);
    }
    if (typeof source !== 'string' || source.length === 0) {
      fail(`channel ${key} no longer names the source line it is declared on`);
    }
    out.set(channel, Object.freeze({ channel, lo: lo as number, hi: hi as number, lines: lines as number, source }));
  }
  if (out.size === 0) fail('declares no channels at all');
  return out;
})();

/**
 * The channels aeon declares a band for, ascending — the COVERAGE of this
 * whole feature, stated as data so a sentence can name it instead of retyping
 * it. `RASTER_MAX_PATCH` is 4 and this list has FOUR entries as of the
 * 2026-09-05 re-vendor, so the gap it exists to disclose is currently empty —
 * see the header. It is still computed rather than asserted away, because the
 * gap is aeon's data to reopen and an author is entitled to be told when it is.
 */
export const EFFECTS_CHANNEL_BANDS_DECLARED: readonly number[] = Object.freeze(
  [...EFFECTS_CHANNEL_BANDS.keys()].sort((a, b) => a - b),
);

/** What the engine does when the latched line leaves the band at one end. */
export interface EffectsChannelBandEdge {
  /** aeon's own word: `drop` at hi, `clamp_up` at lo. */
  behaviour: string;
  /** aeon's own note, verbatim. */
  note: string;
}

function edge(which: 'lo' | 'hi', expected: string, phrases: RegExp[]): EffectsChannelBandEdge {
  const e = DOC.edges?.[which];
  const behaviour = e?.behaviour;
  const note = e?.note;
  if (typeof behaviour !== 'string' || typeof note !== 'string') {
    fail(`no longer describes what happens at the \`${which}\` edge`);
  }
  if (behaviour !== expected) {
    fail(`says the \`${which}\` edge now behaves as "${behaviour}", not "${expected}". The warning `
      + 'text names what actually happens at each end; it must be rewritten, not re-pointed');
  }
  for (const p of phrases) {
    if (!p.test(note)) {
      fail(`\`edges.${which}.note\` no longer says ${String(p)} — the asymmetry the warning `
        + 'describes is read from these words');
    }
  }
  return Object.freeze({ behaviour, note });
}

/**
 * PAST `hi` THE BAND VANISHES. Not "clipped", not "pinned to hi": the record is
 * not emitted at all that frame, so no boundary is drawn anywhere.
 */
export const EFFECTS_CHANNEL_BAND_EDGE_HI: EffectsChannelBandEdge =
  edge('hi', 'drop', [/NOT EMITTED/, /does NOT pin to hi/i]);

/**
 * BELOW `lo` IT IS STILL DRAWN. Clamped up to `lo`, pinned at the top of the
 * band and visible — the opposite outcome from the same over-long sweep, which
 * is why one tidy verb cannot describe this.
 */
export const EFFECTS_CHANNEL_BAND_EDGE_LO: EffectsChannelBandEdge =
  edge('lo', 'clamp_up', [/clamped UP to lo/, /stays visible/]);

/**
 * The verdict on one sweep against one channel's band.
 *
 * ⚠ THERE IS NO `fits` ARM AND THERE MUST NOT BE ONE. See the header: the
 * contract's test is one-directional, so "not refused" is the strongest true
 * statement available and it is spelled `cannot-tell`.
 */
export type AnchorBandFit =
  /**
   * aeon declares no band for this channel — NONE in sonic4 as of the
   * 2026-09-05 re-vendor, which declares all of 0..3; see the header for why
   * this arm is kept anyway. Nothing is known —
   * and since 2026-09-04 the panel SAYS SO rather than rendering nothing, because
   * an author cannot tell a coverage gap from a clean result by looking at an
   * empty space. See `anchorSweepNoBandAdvisory` for why this arm is spoken
   * aloud while `cannot-tell` is not.
   */
  | { verdict: 'no-band'; channel: number; travelPx: number }
  /** travel <= lines. NOT a clearance: where the sweep sits in [lo, hi] is camera-dependent. */
  | { verdict: 'cannot-tell'; channel: number; travelPx: number; band: EffectsChannelBand }
  /** travel > lines. The only CERTAIN verdict, and the only one worth a sentence. */
  | { verdict: 'cannot-fit'; channel: number; travelPx: number; band: EffectsChannelBand };

/**
 * Does a sweep of `travelPx` peak-to-peak fit channel `channel`'s band?
 *
 * `travelPx` is in SCREEN LINES and is compared to `band.lines` with no
 * conversion whatsoever — the engine's single -1 lives in Raster_BuildSchedule
 * and is already applied on the far side of these numbers.
 */
export function anchorBandFit(channel: number, travelPx: number): AnchorBandFit {
  const band = EFFECTS_CHANNEL_BANDS.get(channel);
  if (band === undefined) return { verdict: 'no-band', channel, travelPx };
  return anchorFitAgainstBand(band, travelPx);
}

/**
 * The same one-directional verdict, against a band supplied by the CALLER
 * instead of looked up in aeon's vendored map.
 *
 * ═══ WHY THIS EXISTS, AND WHY IT IS THE SAME FUNCTION ═══
 *
 * Until empyrean `c4a1da2` a channel's `[lo, hi]` could only come from aeon's
 * hand-authored module, so the lookup and the comparison were one step. The
 * `boundary` key lets a DOCUMENT declare its own `lo` and `hi` — and a document
 * that declares them supersedes the vendored map for its own channel, because
 * the vendored map is a reading of the hand-authored program the document is
 * replacing. So the band now has two possible sources and the RULE must have
 * exactly one implementation: this one. `boundary.ts` calls it with a band built
 * from the document; `anchorBandFit` calls it with a band built from aeon's
 * file; neither restates `travel > lines`.
 *
 * ⚠ AND THE ONE-DIRECTIONAL RULE COMES WITH IT. There is still no `fits` arm.
 * A caller handing in a document's own band gets `cannot-tell`, not a clearance,
 * for exactly the reason the header gives: the latched line is `anchor -
 * Camera_Y`, so where the sweep sits inside `[lo, hi]` is camera-dependent and
 * unknowable at author time. That property is a fact about the ENGINE and does
 * not become weaker because the band was authored rather than measured.
 */
export function anchorFitAgainstBand(band: EffectsChannelBand, travelPx: number): AnchorBandFit {
  if (travelPx > band.lines) {
    return { verdict: 'cannot-fit', channel: band.channel, travelPx, band };
  }
  return { verdict: 'cannot-tell', channel: band.channel, travelPx, band };
}

/**
 * A band from numbers a DOCUMENT declares, with `lines` derived the one way the
 * contract derives it, or `null` when the pair cannot make a band at all.
 *
 * ⚠ `lines` IS AN INCLUSIVE COUNT AND IS NOT AUTHORED. The vendored file STATES
 * its own `lines` and the loader above CHECKS it rather than computing it — the
 * right posture for a value someone else generated. Here there is no second
 * statement to check against: the document declares `lo` and `hi` only, so the
 * count is computed, and it is computed as `hi - lo + 1` because that is what
 * aeon's `how_to_use` says the number means ("an INCLUSIVE COUNT of lines in
 * [lo, hi]", so travel == lines is the widest sweep that fits). The sentence is
 * guarded at module load; this arithmetic is the same sentence applied.
 *
 * `lo > hi` returns null rather than a negative-length band: that pair is one of
 * the two cross-field refusals the schema cannot express, it belongs to aeon's
 * generator, and a fit verdict computed over it would be a second wrong answer
 * layered on the first.
 */
export function effectsChannelBandFromDocument(
  channel: number, lo: number, hi: number, source: string,
): EffectsChannelBand | null {
  if (!Number.isInteger(lo) || !Number.isInteger(hi) || hi < lo) return null;
  return Object.freeze({ channel, lo, hi, lines: hi - lo + 1, source });
}
