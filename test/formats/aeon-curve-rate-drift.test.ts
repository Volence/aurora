// THE CURVE ADVISORY'S PREMISE, AS A PROPERTY OF AEON'S ARTIFACT.
//
// ⚠ THIS ROW EXISTS BECAUSE THE PREVIOUS PREMISE WAS RETRACTED AND NOTHING
// NOTICED. Aurora shipped `curveDescendingAdvisory` on 2026-09-05 quoting aeon's
// `df3b8810` bisect — "a DESCENDING parallax curve garbles the background and an
// ascending one does not" — and on 2026-09-06 aeon refuted it (`92663a53`). For
// a day the editor told authors a thing the source of the claim had withdrawn,
// and the only way anyone found out was a person reading two repos. That is the
// gap this file closes: the premise is now READ, at a committed revision, on
// every run.
//
// FIVE SEPARATE QUESTIONS, and they stay separate:
//
//   1. Is the refutation still in aeon's published history?  (the direction rule
//      must not come back without this row going red)
//   2. Are the two arms Aurora transcribed still what aeon's table says?
//   3. Does Aurora's rate arithmetic reproduce aeon's OWN published rates, read
//      out of aeon's table rather than out of a fixture here?
//   4. Is the HEDGE still current — does aeon still say the span-versus-rate
//      discriminator is open, and that severity tracks rate?
//   5. Does the artifact Aurora CITES for that hedge still resolve, is it still
//      published, and does it still hold the numbers and the caveat together?
//      (`CURVE_RATE_WITNESS`, read at a pinned revision — see that row's own
//      docblock for why it is not a second copy of (4).)
//
// (4) is the one that would go red on GOOD news: if aeon builds the fixture and
// closes the confound, this row fails and tells the next reader to STRENGTHEN
// the sentence. A retirement condition, not a regression alarm.
//
// Everything here reads aeon through git OBJECTS at a named revision — never
// through the sibling working tree, which on this machine is a live lane
// checkout — and SKIPS WITH A MESSAGE when it cannot run, never silently green.
// A failure is NOT an Aurora regression: it means aeon's record moved and the
// advisory's words need re-pointing again.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { peerRepo, resolveRev, readAtRev, isAncestor } from '../support/peer-repo';
import {
  CURVE_RATE_ARMS, CURVE_RATE_ARM_SPAN_LINES, CURVE_RATE_WITNESS, curveShearRate,
} from '../../src/core/formats/effects/curve-rate';

const TIP = 'origin/master';
/** aeon's merge of `parcel/curve-desc`; the commit that refuted the direction. */
const REFUTATION = '92663a53';
const DEFERRED = 'docs/DEFERRED_WORK.md';
const PROBE = 'tools/depth_onset_probe.py';

const NOT_OURS = 'NOT AN AURORA REGRESSION: aeon\'s curve record moved. '
  + 'Re-read docs/witness/curve-desc-2026-09-06.md and depth-onset-2026-09-06.md, '
  + 'then re-point src/core/formats/effects/curve-rate.ts and the advisory\'s words.';

const AEON = peerRepo('aeon');

/** One markdown table row, split into trimmed cells. */
function cells(row: string): string[] {
  return row.split('|').map((c) => c.trim()).filter((c) => c.length > 0);
}

function rowFor(text: string, needle: string): string[] | null {
  const line = text.split('\n').find((l) => l.startsWith('|') && l.includes(needle));
  return line === undefined ? null : cells(line);
}

/** `176 px` -> 176. Null when no cell in the row is a pixel count. */
function pxCell(row: string[]): number | null {
  for (const c of row) {
    const m = /^(\d+) px$/.exec(c);
    if (m !== null) return Number(m[1]);
  }
  return null;
}

/** `0.79 px/line` -> 0.79. */
function rateCell(row: string[]): number | null {
  for (const c of row) {
    const m = /^([\d.]+) px\/line$/.exec(c);
    if (m !== null) return Number(m[1]);
  }
  return null;
}

describe('aeon curve-rate premise: the record the advisory quotes', () => {
  it.skipIf(AEON === null)('the DIRECTION refutation is still published', () => {
    const sha = resolveRev(AEON!, REFUTATION);
    expect(sha, `${NOT_OURS} ${REFUTATION} does not resolve in aeon`).not.toBeNull();
    const tip = resolveRev(AEON!, TIP);
    expect(tip, `aeon has no ${TIP}`).not.toBeNull();
    expect(
      isAncestor(AEON!, sha!, tip!),
      `${NOT_OURS} ${REFUTATION} is no longer an ancestor of aeon ${TIP}. The refutation `
      + 'Aurora rests on may have been rewritten out of history.',
    ).toBe(true);
  });

  it.skipIf(AEON === null)('aeon\'s table still carries the two arms Aurora transcribed', () => {
    const doc = readAtRev(AEON!, TIP, DEFERRED);
    expect(doc.ok, doc.ok ? '' : `${NOT_OURS} ${doc.why}`).toBe(true);
    if (!doc.ok) return;

    for (const arm of CURVE_RATE_ARMS) {
      const row = rowFor(doc.text, `\`${arm.name}\``);
      expect(row, `${NOT_OURS} no CURVE-DESC table row for arm \`${arm.name}\``).not.toBeNull();
      expect(pxCell(row!), `${NOT_OURS} arm \`${arm.name}\` excursion moved`)
        .toBe(arm.excursionPx);
      const verdict = row!.join(' ');
      // The verdict cell is `**CLEAN**` / `GARBLED`, emphasis varying by row.
      expect(/GARBLED/.test(verdict), `${NOT_OURS} arm \`${arm.name}\` verdict moved`)
        .toBe(arm.garbled);
      expect(/CLEAN/.test(verdict), `${NOT_OURS} arm \`${arm.name}\` verdict moved`)
        .toBe(!arm.garbled);
    }
  });

  it.skipIf(AEON === null)('the probe\'s own docblock states the same bracket', () => {
    const doc = readAtRev(AEON!, TIP, PROBE);
    expect(doc.ok, doc.ok ? '' : `${NOT_OURS} ${doc.why}`).toBe(true);
    if (!doc.ok) return;
    const m = /clean at\s+excursion (\d+) \/ rate [\d.]+; garbled at excursion (\d+)/s
      .exec(doc.text.replace(/\n#?\s*/g, ' '));
    expect(m, `${NOT_OURS} ${PROBE}'s bracket sentence is gone or reworded`).not.toBeNull();
    const clean = CURVE_RATE_ARMS.find((a) => !a.garbled)!;
    const garbled = CURVE_RATE_ARMS.find((a) => a.garbled)!;
    expect(Number(m![1])).toBe(clean.excursionPx);
    expect(Number(m![2])).toBe(garbled.excursionPx);
  });

  /**
   * ⚠ THE DIVISOR ROW, and it is the reason this file parses a table instead of
   * grepping for a phrase. `rate = excursion / (span - 1)`; on aeon's 224-line
   * sec7 arms `/223` and `/224` both round to the printed figure, so only the
   * showcase's 48- and 64-line bands can tell them apart. Those two rows carry
   * span, excursion AND rate in one line, so Aurora's arithmetic is checked
   * against aeon's own printed answer with nothing typed here.
   */
  it.skipIf(AEON === null)('Aurora\'s rate reproduces aeon\'s printed rate on the NARROW bands', () => {
    const doc = readAtRev(AEON!, TIP, DEFERRED);
    expect(doc.ok, doc.ok ? '' : `${NOT_OURS} ${doc.why}`).toBe(true);
    if (!doc.ok) return;

    // The d-15 showcase rows: `| 112..159 | 48 | ... | 348 px | 1.81x | 7.40 px/line |`
    const narrow = doc.text.split('\n')
      .filter((l) => /^\|\s*\d+\.\.\d+\s*\|/.test(l))
      .map(cells)
      .map((row) => ({ span: Number(row[1]), px: pxCell(row), rate: rateCell(row) }))
      .filter((r) => Number.isFinite(r.span) && r.px !== null && r.rate !== null);

    expect(
      narrow.length,
      `${NOT_OURS} no per-band rows found in ${DEFERRED}, so the divisor is now unchecked`,
    ).toBeGreaterThan(0);
    // ANTI-VACUOUS: at least one band must be narrower than the screen, or the
    // rows cannot separate `/span` from `/(span-1)` and this check is theatre.
    expect(narrow.some((r) => r.span < CURVE_RATE_ARM_SPAN_LINES)).toBe(true);

    for (const r of narrow) {
      const got = curveShearRate(r.px!, r.span);
      expect(got, `band span ${r.span}`).not.toBeNull();
      expect(Number(got!.toFixed(2)), `${NOT_OURS} band span ${r.span}, excursion ${r.px}`)
        .toBe(r.rate);
    }
  });

  /**
   * THE HEDGE'S RETIREMENT CONDITION. The advisory says rate is the
   * BETTER-SUPPORTED account and that it is NOT separated from the excursion
   * reading. Both halves come from aeon; if either stops being aeon's position
   * this row goes red and the sentence needs rewriting — including on good news.
   */
  it.skipIf(AEON === null)('aeon still says the discriminator is OPEN and severity tracks rate', () => {
    const doc = readAtRev(AEON!, TIP, DEFERRED);
    expect(doc.ok, doc.ok ? '' : `${NOT_OURS} ${doc.why}`).toBe(true);
    if (!doc.ok) return;
    expect(
      /discriminator still does not close/i.test(doc.text),
      `${NOT_OURS} aeon no longer says the span-versus-rate discriminator is open. If they `
      + 'CLOSED it, the advisory\'s "has not been separated" clause is now understating what '
      + 'is known and must be strengthened rather than deleted.',
    ).toBe(true);
    expect(
      /[Ss]everity instead tracks rate monotonically/.test(doc.text),
      `${NOT_OURS} aeon no longer states the monotone rate ladder, which is the whole reason `
      + 'this advisory compares a RATE.',
    ).toBe(true);
  });

  /**
   * (5) THE CITATION'S LIFETIME. `CURVE_RATE_WITNESS` is a claim that a named
   * revision of a named aeon file holds the measures and the caveat TOGETHER.
   * A pointer with nothing checking it rots silently, which is the defect class
   * the pin was added to close, so it does not get to be prose.
   *
   * ⚠ NOTHING HERE DUPLICATES (4), AND THE SPLIT IS DELIBERATE. (4) asks
   * whether aeon STILL holds the hedge, so it reads `DEFERRED_WORK` at the TIP
   * and is allowed to go red on good news. This row reads a DATED WITNESS at a
   * PINNED revision, where the blob is immutable: it therefore cannot report on
   * aeon's current position at all, and does not try to. What it can fail on is
   * ours going wrong — a rev or path edited into something that does not
   * resolve, or a pin moved to a revision where the caveat is not in the file
   * with the numbers — plus aeon rewriting the commit out of published history,
   * after which the object can be collected and no fresh clone can read it.
   * `check-cited-paths` cannot cover this: peer paths are its exclusion 1, on
   * the sound ground that an agent worktree usually has no peer checkout.
   */
  it.skipIf(AEON === null)('the cited witness resolves, is published, and holds numbers WITH caveat', () => {
    const sha = resolveRev(AEON!, CURVE_RATE_WITNESS.rev);
    expect(
      sha,
      `${NOT_OURS} the cited witness revision ${CURVE_RATE_WITNESS.rev} does not resolve in aeon, `
      + 'so CURVE_RATE_WITNESS is a dead pointer.',
    ).not.toBeNull();
    const tip = resolveRev(AEON!, TIP);
    expect(tip, `aeon has no ${TIP}`).not.toBeNull();
    expect(
      isAncestor(AEON!, sha!, tip!),
      `${NOT_OURS} the cited witness revision ${CURVE_RATE_WITNESS.rev} is no longer an ancestor `
      + `of aeon ${TIP}. A commit outside published history can be collected, after which nobody `
      + 'cloning aeon can read the artifact Aurora points at.',
    ).toBe(true);

    const doc = readAtRev(AEON!, CURVE_RATE_WITNESS.rev, CURVE_RATE_WITNESS.path);
    expect(doc.ok, doc.ok ? '' : `${NOT_OURS} ${doc.why}`).toBe(true);
    if (!doc.ok) return;

    // THE CO-LOCATION ITSELF, which is the entire property the pin claims.
    // Pinned on the caveat's own sentence: it is unique to that file and shares
    // no prefix with the DEFERRED_WORK wording matched above, so a new line
    // beginning with a familiar label cannot satisfy it.
    expect(
      /DOES NOT SEPARATE SPAN FROM RATE/.test(doc.text),
      `${NOT_OURS} ${CURVE_RATE_WITNESS.path} at ${CURVE_RATE_WITNESS.rev} does not carry the `
      + 'caveat, so the pin points at figures with no hedge beside them. That is the exact '
      + 'shape it exists to prevent: re-point it, or move the pin back.',
    ).toBe(true);
    const measures = doc.text.split('\n').filter((l) => l.startsWith('|') && /\bpx\b/.test(l));
    expect(
      measures.length,
      `${NOT_OURS} ${CURVE_RATE_WITNESS.path} at ${CURVE_RATE_WITNESS.rev} states no pixel `
      + 'measures, so it is not the numbers-and-caveat artifact this pin claims it is.',
    ).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// AND THE RETRACTED SENTENCE MUST NOT SURVIVE ANYWHERE A PERSON READS IT.
//
// This needs no peer repo and therefore never skips: it is a property of THIS
// tree. The direction claim was shipped in a rendered Hint, so a leftover copy
// in another module would put it back on screen with nothing to catch it.
// ---------------------------------------------------------------------------

describe('the retracted direction claim', () => {
  const SRC = resolve(__dirname, '../../src');
  const files = (): string[] => {
    const out: string[] = [];
    const walk = (dir: string) => {
      for (const e of require('node:fs').readdirSync(dir, { withFileTypes: true })) {
        const p = resolve(dir, e.name);
        if (e.isDirectory()) walk(p);
        else if (/\.(ts|tsx)$/.test(e.name)) out.push(p);
      }
    };
    walk(SRC);
    return out;
  };

  it('is gone from every shipped string under src/', () => {
    const offenders: string[] = [];
    for (const f of files()) {
      const text = readFileSync(f, 'utf8');
      // The exact claim, as it was rendered. Matched on the words a person read,
      // not on the function name, because a rename would not remove the sentence.
      if (/DESCENDING parallax curve\s+garbles/.test(text.replace(/\s+/g, ' '))) {
        offenders.push(f);
      }
      if (/ramps DOWNWARD, from/.test(text)) offenders.push(f);
    }
    expect(offenders, 'the retracted direction claim is still in these files').toEqual([]);
  });

  /**
   * ⚠ THE DECLARATION, NOT THE NAME. Several docblocks name
   * `curveDescendingAdvisory` deliberately, to say what was retracted and why —
   * that history is the most useful thing in those comments and a row banning
   * the string would delete it. What must not come back is the FUNCTION.
   */
  it('and neither is the function that carried it', () => {
    const offenders = files().filter(
      (f) => /(export\s+)?function\s+curveDescendingAdvisory/.test(readFileSync(f, 'utf8')),
    );
    expect(offenders, 'curveDescendingAdvisory is declared again').toEqual([]);
  });
});
