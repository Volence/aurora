// THE RETIREMENT CONDITION FOR THE NEGATIVE-VALUE DISCLOSURE, as a property of
// an artifact read at a committed revision.
//
// ⚠ IT FIRED. 2026-09-03: aeon merged the two's-complement encode, this row went
// RED with "THE PREMISE HAS CLEARED — and the disclosure has not", and
// `RAMP_SIGN_FIELDS_AWAITING_AEON` was emptied on the strength of THIS ROW and
// nothing else. **The row was not deleted with the sentence.** Its question is
// unchanged; only the answer it demands has flipped. With the premise empty it
// now asserts the constructor still puts BOTH parameters through something, and
// reddens the day a bare forward comes back — telling the next reader to RE-FILL
// and re-date. That inversion is the whole reason the pin changed VALUE rather
// than being removed: a deleted pin retires the coverage along with the claim,
// and then a regression in aeon is invisible here forever.
//
// ═══ WHAT IT MEASURES, AND WHY IT IS THIS FILE AND NOT A PAGE ═══
//
// `src/core/formats/effects/ramp-sign-lag.ts` says a NEGATIVE ramp value cannot
// build, because aeon's `raster_ramp_program` declares `rrp_start`/`rrp_step` as
// `u32` and FORWARDS the signed parameter raw. That claim is about one
// constructor in one engine source file, so this row reads that file — aeon
// `engine/effects/raster.emp` at `origin/master`, through git OBJECTS — and asks
// the one question the sentence depends on:
//
//     does the returned struct literal assign `rrp_start` / `rrp_step` the BARE
//     parameter (`start` / `step`), or does it put them through something?
//
// Bare → the constructor forwards → the lag is OPEN and the premise stands.
// Anything else → an encode has appeared → this row goes RED and names the edit.
//
// ⚠ NOT `docs/EDITOR_RASTER_PRESETS.md`, AND NOT `tools/effects_gen.py`. Both of
// those accept `ramp` and have accepted it since 2026-09-03; neither can see
// this defect, and `effects-preset-schema-drift.test.ts` already measures the
// page for a DIFFERENT fact (the contract-leads-consumer key lag, retired). A
// claim about one of those artifacts is not a claim about this one, and this
// lane came within one step of trading them for each other on a different row.
//
// ⚠ AND NOT A MERGE ANNOUNCEMENT. The preset-lag row's own failure text is the
// precedent: "do NOT empty it on a merge announcement, this row reads TIP." A
// message saying the encode landed is a claim about a conversation. This is a
// claim about a blob.
//
// ⚠ THE ROW IS NOT A CLAIM ABOUT A ROM. It measures aeon's SOURCE. Whether a
// ROM built from an encoded constructor actually ramps upward is aeon's pytest
// lane and sigil's attest chain, and no row here stands in for either.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { peerRepo, resolveRev, readAtRev } from '../support/peer-repo';
import {
  RAMP_SIGN_FIELDS, RAMP_SIGN_FIELDS_AWAITING_AEON, RAMP_SIGN_LAG_MEASUREMENT,
  RAMP_SIGN_LAG_MEASURED_AT, rampSignLagDisclosure, rampSignRateCaveat,
} from '../../src/core/formats/effects/ramp-sign-lag';

const AEON_PATH = 'engine/effects/raster.emp';
const TIP = 'origin/master';

/** The constructor's `u32` fields, and the parameters they are fed. */
const WIRE: ReadonlyArray<{ field: string; param: string }> = [
  { field: 'rrp_start', param: 'start' },
  { field: 'rrp_step', param: 'step' },
];

/**
 * The body of `raster_ramp_program`'s RETURNED STRUCT LITERAL, from `return
 * RasterRampProgram{` to its closing brace.
 *
 * Scoped to the literal rather than grepped over the whole file on purpose: the
 * file also DECLARES `rrp_start: u32,` in the struct, and a whole-file grep for
 * `rrp_start:` would match the declaration and answer a different question.
 */
function returnedLiteral(text: string): string | null {
  const fn = text.indexOf('pub comptime fn raster_ramp_program');
  if (fn < 0) return null;
  const open = text.indexOf('return RasterRampProgram{', fn);
  if (open < 0) return null;
  const close = text.indexOf('\n    }', open);
  if (close < 0) return null;
  return text.slice(open, close);
}

/** What the literal assigns to `<field>:`, trimmed of its trailing comma. */
function assignedTo(literal: string, field: string): string | null {
  const m = new RegExp(`\\n\\s*${field}:\\s*([^\\n]*)`).exec(literal);
  if (!m) return null;
  return m[1].replace(/\/\/.*$/, '').trim().replace(/,$/, '').trim();
}

type Read =
  | { kind: 'skip'; why: string }
  | { kind: 'fail'; why: string }
  | { kind: 'ok'; tip: string; blob: string; literal: string; decl: string };

function readConstructor(): Read {
  const aeon = peerRepo('aeon');
  if (aeon === null) {
    return { kind: 'skip', why: 'SKIPPED, NOT PASSED: no aeon checkout beside this repo (set '
      + 'AEON_DIR) — CANNOT MEASURE whether raster_ramp_program still forwards a signed value '
      + 'into a u32 field, so the negative-value disclosure cannot be retired OR confirmed here' };
  }
  const tip = resolveRev(aeon, TIP);
  if (tip === null) {
    return { kind: 'skip', why: `SKIPPED, NOT PASSED: ${TIP} does not resolve in ${aeon} `
      + '(unfetched? shallow?) — CANNOT MEASURE the ramp constructor' };
  }
  const at = readAtRev(aeon, tip, AEON_PATH);
  // Not a skip: the revision resolved, so this WAS measured, and the engine
  // source vanishing from aeon's tip is a fact worth failing on.
  if (!at.ok) return { kind: 'fail', why: `aeon ${tip}: ${at.why}` };
  const literal = returnedLiteral(at.text);
  if (literal === null) {
    return { kind: 'fail', why: `${AEON_PATH} at aeon ${tip} no longer carries a `
      + '`pub comptime fn raster_ramp_program` returning a `RasterRampProgram{` literal — the '
      + 'shape this row reads has moved, so the negative-value premise is UNMEASURED and the '
      + 'disclosure in src/core/formats/effects/ramp-sign-lag.ts must be re-derived by hand' };
  }
  return { kind: 'ok', tip, blob: at.blob, literal, decl: at.text };
}

const READ = readConstructor();

function onAeon(ctx: { skip: (why: string) => void }, body: (r: Read & { kind: 'ok' }) => void): void {
  if (READ.kind === 'skip') { ctx.skip(READ.why); return; }
  expect(READ.kind, READ.kind === 'fail' ? READ.why : '').toBe('ok');
  if (READ.kind !== 'ok') return;
  body(READ);
}

describe(`the negative ramp value — measured at aeon ${AEON_PATH} @ ${TIP}`, () => {
  it('the two fields are still `u32` — the half of the defect that is a TYPE', (ctx) => {
    onAeon(ctx, ({ tip, decl }) => {
      // Anti-vacuous: we read a real struct, not an empty string.
      expect(decl.length, `${AEON_PATH} at aeon ${tip} is suspiciously short`)
        .toBeGreaterThan(2000);
      for (const { field } of WIRE) {
        expect(
          new RegExp(`\\n\\s*${field}:\\s+u32`).test(decl),
          `${field} is no longer declared \`u32\` in ${AEON_PATH} at aeon ${tip}. If it is now a `
          + 'SIGNED type the negative-value defect may be gone by a different route than an '
          + 'encode — re-derive the premise by hand and, if it has cleared, EMPTY '
          + '`RAMP_SIGN_FIELDS_AWAITING_AEON` in src/core/formats/effects/ramp-sign-lag.ts.',
        ).toBe(true);
      }
    });
  });

  /**
   * ═══ THE RETIREMENT CONDITION ═══
   *
   * One row, one question, and its failure message is the whole handover.
   */
  it('⚠ THE PREMISE: `raster_ramp_program` FORWARDS the signed parameter raw, with no encode',
    (ctx) => {
      onAeon(ctx, ({ tip, blob, literal }) => {
        // Anti-vacuous: the literal we sliced really is the constructor's, and
        // really does carry the rest of the program's fields.
        expect(literal, 'the sliced literal is not raster_ramp_program\'s return')
          .toContain('rrp_op:');
        expect(literal).toContain('OP_RUN_RAMP');

        const forwarded = WIRE.filter(({ field, param }) => assignedTo(literal, field) === param);
        const spelled = WIRE.map(({ field }) => `${field}: ${assignedTo(literal, field)}`).join(', ');

        if (RAMP_SIGN_FIELDS_AWAITING_AEON.length > 0) {
          expect(
            forwarded.map((w) => w.param).sort(),
            'THE PREMISE HAS CLEARED — and the disclosure has not. `raster_ramp_program` at aeon '
            + `${tip} (${AEON_PATH}, blob ${blob}) no longer forwards both parameters raw; it now `
            + `spells them \`${spelled}\`. A negative ramp value may build today, so the sentence `
            + 'on the ramp card and the caveat inside the rate refusal are a FALSE WARNING — '
            + 'which is the very defect they were written against, wearing the other hat. '
            + 'FIX: re-read the constructor, confirm the encode is a two\'s-complement of the '
            + 'signed value, and EMPTY `RAMP_SIGN_FIELDS_AWAITING_AEON` in '
            + 'src/core/formats/effects/ramp-sign-lag.ts (that one edit retires both surfaces). '
            + 'DO NOT empty it on a merge announcement — this row reads TIP, and only this row '
            + 'may retire the sentence.',
          ).toEqual([...RAMP_SIGN_FIELDS].sort());
        } else {
          expect(
            forwarded,
            'THE PREMISE IS BACK AND THE DISCLOSURE IS EMPTY. `raster_ramp_program` at aeon '
            + `${tip} forwards a signed parameter into a \`u32\` field again (${spelled}), so a `
            + 'negative ramp value fails at emission and NOTHING ON SCREEN SAYS SO. Re-fill '
            + '`RAMP_SIGN_FIELDS_AWAITING_AEON` in src/core/formats/effects/ramp-sign-lag.ts '
            + 'and re-date it.',
          ).toEqual([]);
        }
      });
    });

  /**
   * ⚠ THE DETECTOR MUST BE ABLE TO SEE AN ENCODE, or the row above is a
   * green-forever claim that "the premise still holds" — the partial-coverage
   * shape. aeon's tree cannot be mutated from here, so the READER is exercised
   * on a synthetic literal of the shape their fix will have, plus the shape it
   * has today. Both directions, on the same parser the row above uses.
   */
  it('⚠ the reader can DISTINGUISH a forward from an encode — proved on both shapes', () => {
    const shell = (starts: string, steps: string) => `x
pub comptime fn raster_ramp_program(top: int, lines: int, cmd: int,
                                    start: int, step: int) -> RasterRampProgram {
    return RasterRampProgram{
        rrp_op:         OP_RUN_RAMP,
        rrp_start:      ${starts},
        rrp_step:       ${steps},
    }
}
`;
    const raw = returnedLiteral(shell('start', 'step'))!;
    expect(raw).not.toBeNull();
    expect(assignedTo(raw, 'rrp_start')).toBe('start');
    expect(assignedTo(raw, 'rrp_step')).toBe('step');

    // The shape an encode takes: the parameter goes through something.
    const encoded = returnedLiteral(shell('u32_bits(start)', 'u32_bits(step)  // two\'s complement'))!;
    expect(assignedTo(encoded, 'rrp_start')).toBe('u32_bits(start)');
    expect(assignedTo(encoded, 'rrp_step')).toBe('u32_bits(step)');
    expect(assignedTo(encoded, 'rrp_start')).not.toBe('start');

    // And it does NOT read the struct DECLARATION, which spells the same field
    // names with a type — the question that looks identical and is not.
    const declOnly = `struct RasterRampProgram {\n    rrp_start: u32,\n    rrp_step: u32,\n}\n`;
    expect(returnedLiteral(declOnly)).toBeNull();
  });

  it('the sentence names the ENGINE SOURCE at origin/master as its measurement, not a page', () => {
    expect(RAMP_SIGN_LAG_MEASUREMENT).toContain(AEON_PATH);
    expect(RAMP_SIGN_LAG_MEASUREMENT).toContain('raster_ramp_program');
    expect(RAMP_SIGN_LAG_MEASUREMENT).toContain(TIP);
    // The two artifacts this claim must NOT be traded for.
    expect(RAMP_SIGN_LAG_MEASUREMENT).not.toContain('EDITOR_RASTER_PRESETS');
    expect(RAMP_SIGN_LAG_MEASUREMENT).not.toContain('effects_gen.py');
    // ...and the file it names is the file this row actually opens.
    const self = readFileSync(resolve(__dirname, 'aeon-ramp-sign-drift.test.ts'), 'utf8');
    expect(self).toContain(`const AEON_PATH = '${AEON_PATH}'`);
  });

  /**
   * ⚠ THE RECORDED REVISION MUST REPRODUCE THE MEASUREMENT IT IS CITED FOR.
   *
   * `RAMP_SIGN_LAG_MEASURED_AT` is printed inside the sentence as the evidence a
   * reader is invited to re-run, and `ramp-sign-lag.ts` quotes the four lines of
   * the encode beside it. A citation nobody checks is the same instrument as a
   * disclosure nobody checks: it survives the fact it was written about. This
   * pins it at the RECORDED revision, not at TIP — a commit is immutable, so the
   * row is stable while aeon's master moves, and it reddens only if the citation
   * is edited to name a revision that does not say what the file claims it says.
   *
   * TIP is the row above's job; this row is about the RECORD.
   */
  it('the RECORDED revision really carries what this file says it carries', (ctx) => {
    onAeon(ctx, () => {
      const aeon = peerRepo('aeon')!;
      const rec = resolveRev(aeon, RAMP_SIGN_LAG_MEASURED_AT);
      expect(rec, `the recorded revision ${RAMP_SIGN_LAG_MEASURED_AT} does not resolve in ${aeon} `
        + '— the sentence cites evidence a reader cannot open').not.toBeNull();
      const at = readAtRev(aeon, rec!, AEON_PATH);
      expect(at.ok, at.ok ? '' : `aeon ${rec}: ${at.why}`).toBe(true);
      if (!at.ok) return;
      const literal = returnedLiteral(at.text)!;
      expect(literal).not.toBeNull();
      const spelled = WIRE.map(({ field }) => `${field}: ${assignedTo(literal, field)}`).join(', ');
      // Whatever state the record claims, the record must SHOW it.
      if (RAMP_SIGN_FIELDS_AWAITING_AEON.length === 0) {
        expect(
          WIRE.filter(({ field, param }) => assignedTo(literal, field) === param),
          `ramp-sign-lag.ts records the premise as CLEARED at aeon ${RAMP_SIGN_LAG_MEASURED_AT}, `
          + `but at that revision the constructor spells \`${spelled}\` — a bare forward. The `
          + 'retirement is dated to a revision that does not support it. Re-measure and re-date.',
        ).toEqual([]);
      } else {
        expect(
          WIRE.filter(({ field, param }) => assignedTo(literal, field) === param).map((w) => w.param),
          `ramp-sign-lag.ts records the premise as OPEN at aeon ${RAMP_SIGN_LAG_MEASURED_AT}, but `
          + `at that revision the constructor spells \`${spelled}\` — it already encodes.`,
        ).toEqual([...RAMP_SIGN_FIELDS].sort());
      }
    });
  });

  it('the measured revision is recorded where a reader will find it', () => {
    expect(RAMP_SIGN_LAG_MEASURED_AT).toMatch(/^[0-9a-f]{8,40}$/);
    // And the derivations really are gated on the premise, both ways — the node
    // half of the poison, so this file cannot go green on a dead disclosure.
    expect(rampSignLagDisclosure([])).toBeNull();
    expect(rampSignLagDisclosure(['step'])).toContain('does not reach the game');
    expect(rampSignRateCaveat('step', [-1, 0], [])).toBeNull();
    expect(rampSignRateCaveat('step', [-1, 0], ['step'])).toContain('WILL NOT BUILD TODAY');
    expect(rampSignRateCaveat('step', [0, 1], ['step'])).toBeNull();
  });
});
