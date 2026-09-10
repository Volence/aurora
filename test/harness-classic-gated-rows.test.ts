/**
 * A REFUSING ARM MUST NAME EVERY ROW IT SUPPRESSES.
 *
 * HARNESS-ROWS-VANISH-ON-UNSET-GATE, booked 2026-09-10 by the overseer running
 * `scratchpad/cdp-sweep-panels-harness.mjs` both ways:
 *
 *     "rows disappear entirely when CLASSIC_DIR is unset, and the run reports
 *      13/14 PASS - 1 UNMEASURABLE, so a reader concludes every question was
 *      asked."
 *
 * ═══ WHAT THIS FILE ASSERTS, AND WHY EACH ROW IS NOT THE OTHERS ═══════════
 *
 *   1. THE TWO ARMS AGREE ON WHICH ROWS EXIST. The set of `check('id'` literals
 *      inside the MEASURING branch of the `CLASSIC_DIR` gate is extracted from
 *      the harness's own source and compared against
 *      `scratchpad/lib/classic-gated-rows.mjs`. This is the row that reddens
 *      the day somebody adds an eighth question to the measuring branch and
 *      forgets the refusing one. The enumeration is DERIVED from the file being
 *      guarded, never from a list a second author has to remember.
 *
 *   2. THE REFUSING ARM DOES NOT HAND-ROLL ROWS. It must contain no `check(`
 *      call of its own. A hand-written row there would satisfy row 1 (its id is
 *      in the table) while being free to drift in name and reason, which is the
 *      original defect wearing the fix as a costume.
 *
 *   3. THE NAMES DO NOT DRIFT. Each table `name` must be a prefix of every name
 *      the measuring branch uses for that id. Prefix, not equality, because
 *      `S2b` is measured under a longer name on its live path
 *      ("... (not only on a click)") and that is deliberate.
 *
 *   4. THE BUILDER REFUSES RATHER THAN EMITS FEWER. `classicGatedRefusals`
 *      throws on an unknown id and on an empty reason. A builder that silently
 *      dropped an id it did not recognise would reintroduce the finding inside
 *      the fix.
 *
 *   5. ANTI-VACUOUS: the extractor is shown a MUTATED copy of the source with
 *      an extra row planted in the measuring branch, and must report it. A
 *      scanner that matched nothing would pass rows 1 to 3 forever.
 *
 * ⚠ AND WHAT NONE OF THEM COVER. Every row here is a SOURCE scan plus a pure
 * call. Not one of them has seen the harness run: it launches Electron under
 * `xvfb-run` over CDP, which no agent in this repo may do. So this file cannot
 * say that the totals line reads 20 with `CLASSIC_DIR` unset. It can only say
 * that the rows the totals line would count are enumerated in one place and
 * that both arms read that place. The run itself is tagged for the foreground
 * in `docs/reviews/2026-09-10-harness-suppressed-rows.md`.
 *
 * ⚠ ONE KNOWN HAZARD IN THE EXTRACTOR. It is brace-matching with a scanner that
 * understands strings, template substitutions and comments but NOT regular
 * expression literals. A future regex literal containing an unbalanced brace
 * inside the gate would break it. That failure is LOUD (the block cannot be
 * bracketed and this file goes red) rather than a silent green, which is the
 * only property that matters for a gate.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import {
  CLASSIC_GATED_IDS,
  CLASSIC_GATED_ROWS,
  classicDirClause,
  classicGatedRefusals,
} from '../scratchpad/lib/classic-gated-rows.mjs';

const ROOT = resolve(__dirname, '..');
const HARNESS_REL = 'scratchpad/cdp-sweep-panels-harness.mjs';
const HARNESS = resolve(ROOT, HARNESS_REL);

/** The gate's own condition, spelled exactly as the harness spells it. */
const GATE = 'if (!CLASSICDIR || !existsSync(CLASSICDIR)) {';

type Frame = { kind: string; depth: number };

/**
 * Index of the `}` matching the `{` at `open`. Aware of `'`, `"`, template
 * literals (including nested `${}` code), line comments and block comments.
 * Throws rather than guessing, so a source shape it cannot bracket is a red
 * row and never a quiet pass.
 */
function matchBrace(s: string, open: number): number {
  if (s[open] !== '{') throw new Error(`matchBrace: no brace at index ${open}`);
  const stack: Frame[] = [{ kind: 'code', depth: 0 }];
  for (let i = open; i < s.length; i++) {
    const f = stack[stack.length - 1];
    const c = s[i];
    const n = s[i + 1];
    if (f.kind === 'line') { if (c === '\n') stack.pop(); continue; }
    if (f.kind === 'block') { if (c === '*' && n === '/') { stack.pop(); i++; } continue; }
    if (f.kind === "'" || f.kind === '"') {
      if (c === '\\') { i++; continue; }
      if (c === f.kind) stack.pop();
      continue;
    }
    if (f.kind === '`') {
      if (c === '\\') { i++; continue; }
      if (c === '`') { stack.pop(); continue; }
      if (c === '$' && n === '{') { stack.push({ kind: 'code', depth: 1 }); i++; }
      continue;
    }
    if (c === '/' && n === '/') { stack.push({ kind: 'line', depth: 0 }); i++; continue; }
    if (c === '/' && n === '*') { stack.push({ kind: 'block', depth: 0 }); i++; continue; }
    if (c === "'" || c === '"' || c === '`') { stack.push({ kind: c, depth: 0 }); continue; }
    if (c === '{') { f.depth++; continue; }
    if (c === '}') {
      f.depth--;
      if (f.depth === 0) { if (stack.length === 1) return i; stack.pop(); }
      continue;
    }
  }
  throw new Error('matchBrace: unbalanced from index ' + open);
}

interface GateArms { refusing: string; measuring: string }

/** Bracket both arms of the CLASSIC_DIR gate out of a harness source string. */
function gateArms(src: string): GateArms {
  const occurrences = src.split(GATE).length - 1;
  if (occurrences !== 1) {
    throw new Error(`expected exactly 1 CLASSIC_DIR gate, found ${occurrences}. `
      + 'The gate this file is derived from moved or was duplicated; re-derive rather '
      + 'than loosening the match.');
  }
  const ifOpen = src.indexOf(GATE) + GATE.length - 1;
  const ifClose = matchBrace(src, ifOpen);
  const after = src.slice(ifClose + 1);
  const elseM = /^\s*else\s*\{/.exec(after);
  if (!elseM) throw new Error('the CLASSIC_DIR gate has no `else` arm to measure in');
  const elseOpen = ifClose + 1 + elseM[0].length - 1;
  const elseClose = matchBrace(src, elseOpen);
  return {
    refusing: src.slice(ifOpen, ifClose + 1),
    measuring: src.slice(elseOpen, elseClose + 1),
  };
}

const CHECK_ID = /check\('([^']+)'/g;

function idsIn(block: string): string[] {
  return [...new Set([...block.matchAll(CHECK_ID)].map((m) => m[1]))];
}

/** Every name literal the block gives an id, unescaped. */
function namesFor(block: string, id: string): string[] {
  const re = new RegExp(`check\\('${id}',\\s*'((?:\\\\.|[^'\\\\])*)'`, 'g');
  return [...block.matchAll(re)].map((m) => m[1].replace(/\\(.)/g, '$1'));
}

const SRC = readFileSync(HARNESS, 'utf8');

describe('the CLASSIC_DIR gate refuses by name, and both arms read one list', () => {
  it('brackets both arms of the gate out of the harness source', () => {
    const arms = gateArms(SRC);
    expect(arms.refusing.length).toBeGreaterThan(20);
    expect(arms.measuring.length).toBeGreaterThan(1000);
    // Loud on unmeasurable: an empty measuring branch would make every row
    // below vacuously true, so it is asserted non-trivial here rather than
    // discovered as a suspiciously easy green.
    expect(idsIn(arms.measuring).length).toBeGreaterThanOrEqual(7);
  });

  it('the ids the measuring branch emits are exactly the enumerated ones', () => {
    const found = idsIn(gateArms(SRC).measuring).sort();
    expect(found).toEqual([...CLASSIC_GATED_IDS].sort());
  });

  it('the refusing arm hand-rolls no row of its own', () => {
    const { refusing } = gateArms(SRC);
    expect(idsIn(refusing)).toEqual([]);
    expect(refusing).toContain('refuseClassicRows');
  });

  it('every enumerated name is the measuring branch own name for that id', () => {
    const { measuring } = gateArms(SRC);
    const drift: string[] = [];
    for (const row of CLASSIC_GATED_ROWS) {
      const names = namesFor(measuring, row.id);
      if (names.length === 0) {
        drift.push(`${row.id}: no name literal found, so the name could not be compared`);
        continue;
      }
      for (const n of names) {
        if (!n.startsWith(row.name)) drift.push(`${row.id}: source says ${JSON.stringify(n)}, `
          + `table says ${JSON.stringify(row.name)}`);
      }
    }
    expect(drift).toEqual([]);
  });

  it('every CLASSIC_DIR refusal names the variable and what its row could not ask', () => {
    const rows = classicGatedRefusals(classicDirClause(null), { dirTail: true });
    expect(rows.map((r) => r.id)).toEqual(CLASSIC_GATED_IDS);
    for (const r of rows) {
      expect(r.detail).toContain('CLASSIC_DIR');
      expect(r.detail.length).toBeGreaterThan(40);
    }
    // The praised trap sentence survives the refactor, on the row that owns it.
    const s3c = rows.find((r) => r.id === 'S3c');
    expect(s3c?.detail).toContain('Project saved');
    // And it appears on that row ONLY: pasting it onto six siblings would make
    // the reasons interchangeable, which is the thing being fixed.
    expect(rows.filter((r) => r.detail.includes('Project saved'))).toHaveLength(1);
    expect(classicDirClause('/tmp/gone')).toContain('/tmp/gone');
  });

  it('the builder refuses an unknown id and an empty reason rather than emitting fewer rows', () => {
    expect(() => classicGatedRefusals('because', { only: ['S2a1', 'S2zz'] })).toThrow(/S2zz/);
    expect(() => classicGatedRefusals('')).toThrow(/no reason/);
    const some = classicGatedRefusals('the classic project did not open',
      { only: ['S3b', 'S2b'] });
    expect(some.map((r) => r.id)).toEqual(['S3b', 'S2b']);
    expect(some[0].detail.startsWith('the classic project did not open')).toBe(true);
  });

  it('ANTI-VACUOUS: a row planted in the measuring branch is reported', () => {
    const anchor = "check('S3a'";
    expect(SRC).toContain(anchor);
    const planted = SRC.replace(anchor,
      "check('S2c', 'a planted question nobody enumerated', true);\n    " + anchor);
    const found = idsIn(gateArms(planted).measuring);
    expect(found).toContain('S2c');
    expect(found.filter((id) => !CLASSIC_GATED_IDS.includes(id))).toEqual(['S2c']);
    // ... and the unplanted source is clean, so the row above is discriminating
    // rather than always-true.
    expect(idsIn(gateArms(SRC).measuring).filter((id) => !CLASSIC_GATED_IDS.includes(id)))
      .toEqual([]);
  });
});
