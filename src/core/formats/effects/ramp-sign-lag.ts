/**
 * A NEGATIVE ramp value does not reach the game. A POSITIVE one does.
 *
 * ═══ THE FACT, AND WHY IT IS NOT THE LAG THAT RETIRED ═══
 *
 * `preset-lag.ts` carries the CONTRACT-LEADS-CONSUMER lag: keys the schema
 * declares that aeon's generator does not accept. `ramp` was in it and RETIRED
 * on 2026-09-03 — aeon's page accepts the key, the document builds, the sentence
 * came down. **That retirement is correct and this file does not re-open it.**
 *
 * This is a narrower and stranger fact, one layer further down, and it survived
 * that retirement because nothing measured it: the key is accepted, the document
 * lowers, the generator emits a `raster_ramp_program(...)` call — and then the
 * ASSEMBLER refuses the emission, but only when the value is negative.
 *
 * ═══ THE ARTIFACT PROPERTY, MEASURED FIRSTHAND ═══
 *
 * aeon `engine/effects/raster.emp`, `raster_ramp_program`, at `origin/master`
 * `ddaab2820eebc00b439ea51bc7b04363aa0f2157` ("docs(deferred-work): book the
 * preset-id namespace collision, both directions"):
 *
 *   struct RasterRampProgram {   ...
 *       rrp_start:      u32,    // 16.16 initial accumulator
 *       rrp_step:       u32,    // 16.16 per-line delta, signed
 *   }
 *
 *   pub comptime fn raster_ramp_program(top: int, lines: int, cmd: int,
 *                                       start: int, step: int) -> RasterRampProgram {
 *       ...
 *       return RasterRampProgram{ ...
 *           rrp_start:      start,          // ← RAW. No two's-complement encode.
 *           rrp_step:       step,           // ← RAW.
 *       }
 *   }
 *
 * The fields are `u32`; the parameters are signed `int`; the constructor
 * FORWARDS them. The RUNTIME honours the sign (`add.l` over a 16.16
 * accumulator) — the CONSTRUCTOR never did, and nothing noticed because every
 * step ever authored in this tier's life was positive. So an authored negative
 * fails at emission, in sigil, with:
 *
 *   [emit.out-of-range] -98304 does not fit u32 (0..=4294967295)
 *           — in `EditorRaster_..._rampctl_probe.rrp_step`
 *
 * -98304 is `fp16(-1, 128)`, i.e. -1.5 px — the first negative rate that has
 * ever existed, authored by THIS editor.
 *
 * ═══ WHY THIS EARNS A SENTENCE RATHER THAN A SILENT WAIT ═══
 *
 * `rampRateProblem`/`rampRateNeighbours` (renderer/providers/effects-preset.ts)
 * refuse a rate with no `fp16` spelling and — helpfully — NAME THE NEAREST
 * VALUES THAT DO HAVE ONE. For anything in the unreachable interval (-1, 0) the
 * pair it names is `-1` and `0`. `-1` is one of them, and `-1` is exactly what
 * cannot be built today.
 *
 * **A refusal that names a nearest-representable alternative carries the
 * authority of a fix.** It is the sentence the author will act on without
 * question. So today an author types `-0.5`, the panel tells them to use `-1`,
 * and the document that produces cannot build. On that path silence would be
 * strictly better than what we ship — which is why the caveat below exists.
 *
 * ⚠ THE NEIGHBOURS THEMSELVES ARE NOT TOUCHED, AND MUST NOT BE. `-1` and `0`
 * really ARE the nearest representable values; that is a true fact about the
 * ENCODING, and falsifying it to route around a BUILD limitation would put a lie
 * in the panel to hide a defect in a peer. The caveat is ADDED beside the true
 * arithmetic. Nor is the ability to author a negative removed: the document is
 * well-formed, the schema accepts it, aeon's generator accepts it, and the
 * limitation is downstream of all three.
 *
 * ═══ THE RETIREMENT CONDITION IS AN ARTIFACT PROPERTY, NOT AN ANNOUNCEMENT ═══
 *
 * `test/formats/aeon-ramp-sign-drift.test.ts` reads
 * `engine/effects/raster.emp` at aeon `origin/master` THROUGH GIT OBJECTS and
 * asks one question of the text: **does `raster_ramp_program`'s returned struct
 * literal assign `rrp_start` / `rrp_step` the bare parameter, or does it put
 * them through something?** Bare → the lag is open. Anything else → the row goes
 * RED and names this file as the edit.
 *
 * ⚠ DO NOT EMPTY THE LIST BELOW ON A MERGE ANNOUNCEMENT. The preset-lag row's
 * own failure text is the precedent and says so in as many words. A message
 * saying "the encode landed" is a claim about a conversation; the row above is a
 * claim about a blob at a resolved revision, and only the second can retire a
 * sentence.
 *
 * ⚠ THE FIX EXISTS, AND IT IS STILL NOT ON THEIR MASTER — WAS A RELAY, NOW
 * MEASURED (2026-09-03). aeon `7a5d237d` ("fix(raster): raster_ramp_program
 * never encoded a NEGATIVE step, so no ROM could hold one") adds the
 * two's-complement encode with a two-directional zero-byte pin, on branch
 * `parcel/aurora-ramp-witness` (tip `a1a76741`). Read here firsthand through git
 * objects, and `git merge-base --is-ancestor` says that branch is NOT an
 * ancestor of aeon `origin/master` `ddaab282`. SO THE LIST BELOW STAYS FILLED:
 * the row measures TIP, the constructor at TIP still forwards the bare
 * parameter, and an author ramping downward today still cannot build. This
 * paragraph exists so the next reader who hears "the sign fix landed" checks the
 * ancestry instead of emptying the list — the row will redden by itself on the
 * merge, which is the whole design.
 *
 * ⚠ AND THE RE-MEASURE MUST READ THE ENGINE SOURCE, NOT A PAGE. This lane came
 * within one step of retiring a different disclosure off a message about a
 * source file when the check actually read a documentation page — different
 * artifacts. `RAMP_SIGN_LAG_MEASUREMENT` names the path and the revision spec so
 * the next reader cannot substitute one for the other.
 *
 * Owner of the sentence: Aurora (this file). Owner of the fact: aeon.
 * Evaluate, do not obey.
 */

/** The two ramp fields that carry a signed 16.16 value. */
export type RampSignField = 'start' | 'step';

/** Both of them, in the order the panel paints them. */
export const RAMP_SIGN_FIELDS: readonly RampSignField[] = Object.freeze(['start', 'step']);

/**
 * The ramp fields whose NEGATIVE values aeon's constructor cannot encode — the
 * ONLY hand-typed statement of the fact, and the whole of what it takes to
 * retire this disclosure everywhere.
 *
 * BOTH fields, because `rrp_start` and `rrp_step` are both `u32` and both
 * forwarded raw: a negative `start` (a run that begins above the layer's rest
 * position) is as unbuildable as a negative `step`.
 *
 * `['start','step']` from 2026-09-03, measured at aeon `origin/master`
 * `ddaab282`. EMPTY it — and only it — the day
 * `test/formats/aeon-ramp-sign-drift.test.ts` reports that the constructor
 * ENCODES; the sentence and the caveat both retire by construction.
 */
export const RAMP_SIGN_FIELDS_AWAITING_AEON: readonly RampSignField[] =
  Object.freeze<RampSignField[]>(['start', 'step']);

/** The date the premise was last measured — printed inside the sentence. */
export const RAMP_SIGN_LAG_MEASURED_ON = '2026-09-03';

/** The aeon revision it was measured at, printed so a reader can re-run it. */
export const RAMP_SIGN_LAG_MEASURED_AT = 'ddaab282';

/**
 * Where the measurement lives, named in the sentence.
 *
 * ⚠ IT NAMES THE ENGINE SOURCE. Not `docs/EDITOR_RASTER_PRESETS.md`, not
 * `tools/effects_gen.py` — both of those are happy with `ramp` and neither can
 * see this. The constructor is the artifact.
 */
export const RAMP_SIGN_LAG_MEASUREMENT =
  'test/formats/aeon-ramp-sign-drift.test.ts against aeon '
  + 'engine/effects/raster.emp (raster_ramp_program) at origin/master';

/** The sentence's leading words — a harness finds the block by them. */
export const RAMP_SIGN_LAG_LEAD = 'A NEGATIVE value here does not reach the game.';

/** The caveat's leading words — a harness finds it inside a refusal by them. */
export const RAMP_SIGN_CAVEAT_LEAD = '⚠ AND A NEGATIVE ONE WILL NOT BUILD TODAY:';

/**
 * Which of a ramp's own values are BOTH negative AND in the lagging set.
 *
 * This is the gate that keeps the sentence off a positive author's screen. An
 * author ramping downward — every ramp that has ever existed in this tier —
 * sees nothing, because nothing is wrong for them.
 *
 * Zero is not negative and is not reported: `0` encodes to `0`, which fits
 * `u32` fine.
 */
export function rampSignLagFields(
  values: Readonly<Record<RampSignField, number>>,
  awaiting: readonly RampSignField[] = RAMP_SIGN_FIELDS_AWAITING_AEON,
): RampSignField[] {
  return RAMP_SIGN_FIELDS.filter((f) => awaiting.includes(f) && values[f] < 0);
}

/** `start` is a position, `step` is a rate — and the units say which. */
function unitsOf(field: RampSignField): string {
  return field === 'step' ? 'px per scanline' : 'px';
}

/**
 * The disclosure the ramp card renders when the document ACTUALLY HOLDS a
 * negative value in a lagging field, or null when it does not.
 *
 * ═══ WHY IT IS DERIVED AND NOT WRITTEN ═══
 *
 * `preset-lag.ts`'s reason, unchanged: a disclosure that stays on screen after
 * it stops being true is worse than none, because it teaches the author to
 * ignore the panel's warnings. Built from the list, an empty list yields no
 * sentence, and the drift row is the only thing that can empty it honestly.
 *
 * ═══ AND WHY IT IS SCOPED TO THE SIGN ═══
 *
 * "ramp does not reach the game" is a DIFFERENT, RETIRED claim, and re-arming it
 * would be a false warning — this very defect wearing the other hat. Positive
 * ramps build and run. The sentence says only what is true: the sign.
 */
export function rampSignLagDisclosure(
  fields: readonly RampSignField[],
): string | null {
  if (fields.length === 0) return null;
  const one = fields.length === 1;
  const names = fields.map((f) => `\`${f}\` (${unitsOf(f)})`);
  const list = one ? names[0] : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
  return `${RAMP_SIGN_LAG_LEAD} ${list} ${one ? 'is' : 'are'} negative, and a negative 16.16 `
    + 'value is where aeon\'s ramp constructor stops: `raster_ramp_program` declares `rrp_start` '
    + 'and `rrp_step` as `u32` and forwards the signed value RAW, with no two\'s-complement '
    + 'encode, so the assembler refuses the emission — `[emit.out-of-range] ... does not fit u32` '
    + '— and the WHOLE ROM fails to build. The runtime honours the sign; the constructor never '
    + 'did, and nothing noticed because every step ever authored before this editor was positive. '
    + 'A POSITIVE value in the same field builds and runs today — this is about the sign, not '
    + `about \`ramp\`. Measured ${RAMP_SIGN_LAG_MEASURED_ON} at aeon `
    + `${RAMP_SIGN_LAG_MEASURED_AT} by ${RAMP_SIGN_LAG_MEASUREMENT}. `
    + `Expires (${RAMP_SIGN_LAG_MEASURED_ON}): the day that row goes red because the constructor `
    + 'ENCODES instead of forwarding — this sentence retires with the row.';
}

/**
 * The caveat appended to a rate refusal that NAMES A NEGATIVE VALUE as one the
 * author can have, or null when it names none — or when the lag has retired.
 *
 * ⚠ THIS IS THE DEFECT'S OWN SENTENCE. `rampRateRefusal`'s sign-hole branch says
 * "the nearest rates you CAN have are -1 and 0". `-1` is arithmetically correct
 * and, today, unbuildable — so the refusal was RECOMMENDING a value that cannot
 * reach a ROM, with all the authority a named alternative carries. The
 * arithmetic stays; this rides beside it.
 *
 * `named` is whatever the branch actually put on screen. Nothing is filtered out
 * of that list here — the caveat only fires when at least one of them is below
 * zero.
 */
export function rampSignRateCaveat(
  field: RampSignField,
  named: readonly (number | null)[],
  awaiting: readonly RampSignField[] = RAMP_SIGN_FIELDS_AWAITING_AEON,
): string | null {
  if (!awaiting.includes(field)) return null;
  const negatives = named.filter((n): n is number => n !== null && n < 0);
  if (negatives.length === 0) return null;
  const one = negatives.length === 1;
  const list = one ? String(negatives[0]) : negatives.join(' and ');
  return ` ${RAMP_SIGN_CAVEAT_LEAD} ${list} ${one ? 'is' : 'are'} negative, and aeon's `
    + '`raster_ramp_program` declares `rrp_start`/`rrp_step` as `u32` and forwards the signed '
    + 'value raw — no two\'s-complement encode — so the assembler refuses the emission '
    + '(`[emit.out-of-range] ... does not fit u32`) and the ROM does not build. '
    + `${one ? 'It is' : 'They are'} still the nearest value${one ? '' : 's'} this ENCODING can `
    + 'spell, which is what the sentence above is about; the build limitation is downstream and '
    + `${one ? 'it is' : 'they are'} named here so the recommendation is not taken as a fix. `
    + `Measured ${RAMP_SIGN_LAG_MEASURED_ON} at aeon ${RAMP_SIGN_LAG_MEASURED_AT} by `
    + `${RAMP_SIGN_LAG_MEASUREMENT}.`;
}
