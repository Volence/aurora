// RULE 4's CONSTANTS, READ OUT OF AEON'S OWN FILES — ROADMAP row 201.
//
// `region-geometry.ts` has implemented rule 4 since step 5 and has never been
// able to run: `validateRect` takes `REGION_MIN_SPAN` and `CENTRE_{X,Y}_{MIN,MAX}`
// as PARAMETERS and that module's header forbids a default, because "a value
// typed into this file would be a second home for a number aeon owns". This
// module is the thing that was missing: it resolves those numbers from aeon's
// text, so the rule runs on aeon's arithmetic and not on a transcription of it.
//
// ═══ THE ROW SAID "AN ACT DESCRIPTOR" AND THAT IS NOT ENOUGH ═══════════════
//
// Measured at aeon origin/master `e0317db8`. The five constants ARE derived in
// the act descriptor:
//
//   ACT_W           = GRID_W << SECTION_SIZE_SHIFT
//   CENTRE_X_MIN    = CAM_SCREEN_HALF_W
//   CENTRE_X_MAX    = ACT_W - SCREEN_WIDTH + CAM_SCREEN_HALF_W
//   CENTRE_Y_MIN    = CAM_SCREEN_HALF_H
//   CENTRE_Y_MAX    = ACT_H - SCREEN_HEIGHT + CAM_SCREEN_HALF_H
//   REGION_MIN_SPAN = 2 * CAM_MAX_Y_STEP
//
// and EVERY LEAF THEY NAME LEAVES THE FILE. The descriptor's own line 96 is
// `use engine.constants.{SCREEN_WIDTH, SCREEN_HEIGHT, CAM_SCREEN_HALF_W,
// CAM_SCREEN_HALF_H, CAM_MAX_Y_STEP}`, and those five are declared in aeon's
// `engine/system/constants.emp`, a file no act owns. So reading the descriptor
// is NECESSARY AND NOT SUFFICIENT, and a reader built for one file would have
// resolved exactly none of the five. Both halves are vendored together under
// `test/fixtures/regions/act-constants/` for the same reason they are read
// together: a derivation from one aeon commit evaluated over leaves from
// another is a number no build ever computed.
//
// ═══ ACT_W AND ACT_H ARE SEEDED, NOT READ, AND THAT IS DELIBERATE ══════════
//
// The chain's last hop is `GRID_W = OJZ_ACT_GRID_W`, which lives in a THIRD
// file — aeon's generated `act_grid.emp` — and that file is generated from
// project.json's `gridWidth`/`gridHeight`. Aurora already holds that number:
// `Act.gridWidth` is read from the same key, and the regions panel's existing
// extent (`gridWidth * SECTION_PIXEL_SIZE`) is what coverage and the
// `outside-act` rule already use. So the act's extent is supplied by the
// CALLER and the two derivations that mention `ACT_W` are evaluated over it.
//
// One act width in the panel, not two. A rule-4 row free to disagree with the
// unassigned row above it about how wide the act is would be a worse defect
// than the one this module fixes — and the seeded value is not a guess, it is
// the same statement aeon's generator reads.
//
// AND THE DISAGREEMENT IS STILL CHECKED. If a descriptor ever declares an
// `ACT_W` this reader CAN resolve, and it differs from the caller's extent,
// that is reported as unresolvable and named. Silently preferring either one
// would be a panel certifying a rectangle against a width nothing holds.
//
// ═══ A CONSTANT THIS READER CANNOT EVALUATE IS NOT CLASSIFIED ══════════════
//
// aeon writes build-time deltas as `const X = if DEBUG == 1 { … } else { … }`
// and puts declarations inside `if` blocks. This reader NEVER evaluates one:
// it has no DEBUG and no release. Such a constant comes back UNRESOLVED with
// the condition quoted, and the panel says so.
//
// ⚠ THAT IS NOT THE EXCLUDE-AND-REPORT GRANT, and the distinction is a ruling,
// not a nicety. empyrean `docs/AURORA_REGIONS_SCHEMA.md`, amendment
// 2026-09-18T23:47Z: the grant is keyed on PARTICIPATION IN THE DEBUG DELTA and
// never on being build-gated — `OJZ_NIGHT_X1` is not gated and still carves
// `sec2`'s left edge, so "behind a build switch" under-covers and over-covers
// in one breath. `OJZ_SEC2_X1` and `OJZ_SEC5_X1` are granted BY NAME; a gated
// constant that is not part of the delta is UNRULED and comes back as a
// question for a person. This module therefore REFUSES TO CLASSIFY: it reports
// "could not be evaluated, here is the condition" and decides nothing. Nothing
// here turns a conditional constant into an excluded one, and nothing here
// turns one into an error either.
//
// At `e0317db8` no rule-4 constant is conditional — all eight resolutions are
// top-level `const`/`pub const`. The branch is a guard against a day that has
// not come, and it is tested with a synthetic descriptor because aeon has not
// supplied a real one.
//
// ═══ NO PARTIAL CREDIT ═════════════════════════════════════════════════════
//
// Five constants, all of them or none. Four resolved numbers and a default for
// the fifth is a verdict nobody can audit, and the failure this whole family of
// modules is shaped against ("a number with no source quietly producing
// verdicts"). An unresolved resolution carries every name it could not resolve
// AND every file it looked in, because "could not read it" and "read it and the
// name is not there" lead a person to different places.

import type { ActExtentRules, RegionRules } from '../../editing/region-geometry';
import {
  enclosingCondition,
  maskCommentsAndStrings,
} from '../effects/section-wiring';

/**
 * One aeon source file, as the load hands it over: its path always, its text
 * when the read succeeded, and otherwise why it did not.
 *
 * ⚠ THE PATH IS PRESENT EVEN WHEN THE TEXT IS NOT. "Aurora looked in
 * <path> and could not read it" is the sentence an author can act on; "a file
 * could not be read" is not.
 */
export interface EmpSource {
  path: string;
  text: string | null;
  /** Null exactly when `text` is present. */
  unreadReason: string | null;
}

/** An aeon file the load could not read, with the reason it will report. */
export function unreadEmpSource(path: string, reason: string): EmpSource {
  return { path, text: null, unreadReason: reason };
}

/** An aeon file the load read. */
export function readEmpSource(path: string, text: string): EmpSource {
  return { path, text, unreadReason: null };
}

/** A rule-4 constant that resolved, and where its value came from. */
export interface ResolvedRuleConstant {
  name: string;
  value: number;
  /** The initializer exactly as aeon writes it, or a sentence for a seeded value. */
  expr: string;
  /** The file it was read from, or the sentence naming the act's own grid. */
  from: string;
}

/** A rule-4 constant that did not resolve, and everything a person needs to chase it. */
export interface UnresolvedRuleConstant {
  name: string;
  /** Why it did not resolve, as a sentence. Never a guess at what it should be. */
  reason: string;
  /** Every file this reader looked in, in the order it looked. */
  lookedIn: string[];
}

/**
 * Rule 4's constants, resolved or not.
 *
 * ⚠ `resolved` IS CARRIED ON BOTH ARMS. A resolution that failed on one of five
 * still knows four, and a panel that can say "four of five, and here is the one
 * that failed" sends its reader somewhere; "could not resolve" sends them
 * nowhere.
 */
export type RegionRuleResolution =
  | { kind: 'resolved'; rules: RegionRules; resolved: ResolvedRuleConstant[] }
  | {
    kind: 'unresolved';
    unresolved: UnresolvedRuleConstant[];
    resolved: ResolvedRuleConstant[];
  };

/**
 * The five names rule 4 needs, in the order a person reads them.
 *
 * ACT_W and ACT_H are not here: they are the caller's, by the seeding argument
 * in this module's header.
 */
export const RULE_4_CONSTANTS = [
  'REGION_MIN_SPAN',
  'CENTRE_X_MIN',
  'CENTRE_X_MAX',
  'CENTRE_Y_MIN',
  'CENTRE_Y_MAX',
] as const;

/** The resolution for an act whose aeon files were never looked at. */
export function regionRulesNotRead(reason: string): RegionRuleResolution {
  return {
    kind: 'unresolved',
    resolved: [],
    unresolved: RULE_4_CONSTANTS.map((name) => ({
      name, reason, lookedIn: [],
    })),
  };
}

// ---------------------------------------------------------------------------
// The `.emp` const reader
// ---------------------------------------------------------------------------

/** One `const NAME = <initializer>` declaration, as written. */
export interface EmpConstDecl {
  name: string;
  /** The initializer text, comment- and string-masked, trimmed. */
  expr: string;
  /** The build condition the declaration sits inside, as aeon writes it, or null. */
  condition: string | null;
  /** 1-based line of the declaration. */
  line: number;
}

/**
 * Every top-level-looking `const NAME[: type] = …` declaration in an `.emp`
 * file, by name, in file order.
 *
 * ⚠ IT READS TO THE END OF THE LINE AND NO FURTHER, which is what makes a
 * multi-line `if DEBUG == 1 { … }` initializer arrive here as the text
 * `if DEBUG == 1 {` and refuse in the evaluator rather than being half-read.
 * A one-line initializer is the only shape aeon writes for the constants this
 * module resolves, checked at `e0317db8`.
 *
 * The text is comment- and string-masked FIRST, with offsets preserved, so a
 * `const` written inside the descriptor's prose (there are several) cannot be
 * read as a declaration and a `{` inside a string cannot move the condition
 * walk.
 *
 * RELATED READER, NAMED SO THE DRIFT IS VISIBLE: `section-wiring.ts` has
 * `resolveIntConst`, which resolves a `const NAME = <integer>` and NOTHING
 * else. This one resolves an expression, which is a strictly wider job, and the
 * two are deliberately not merged: that one's narrowness is a safety property
 * for a reader of region EDGES, where a wrong number is a wrong rectangle.
 * They share `maskCommentsAndStrings` and `enclosingCondition`, which are the
 * parts a second copy of would actually hurt.
 */
export function empConstDecls(text: string): Map<string, EmpConstDecl[]> {
  const code = maskCommentsAndStrings(text);
  const out = new Map<string, EmpConstDecl[]>();
  const re = /^[ \t]*(?:pub[ \t]+)?const[ \t]+([A-Za-z_]\w*)[ \t]*(?::[^=\n]*)?=[ \t]*([^\n]*)$/gm;
  for (const m of code.matchAll(re)) {
    const name = m[1];
    const expr = m[2].trim();
    const at = m.index ?? 0;
    const decl: EmpConstDecl = {
      name,
      expr,
      condition: enclosingCondition(code, at),
      line: code.slice(0, at).split('\n').length,
    };
    const list = out.get(name);
    if (list === undefined) out.set(name, [decl]);
    else list.push(decl);
  }
  return out;
}

/**
 * The module an `.emp` file declares, or null.
 *
 * Used to hold a value read out of the engine file to the module the descriptor
 * actually imported it FROM — see `resolveRegionRules`. A file that declares no
 * module is not refused here; the caller decides what an unnameable module
 * means.
 */
export function empModuleName(text: string): string | null {
  const m = /^module[ \t]+([A-Za-z_][\w.]*)/m.exec(maskCommentsAndStrings(text));
  return m === null ? null : m[1];
}

/**
 * The modules an `.emp` file imports each name from: `use a.b.{X, Y}` gives
 * `X -> a.b` and `Y -> a.b`.
 *
 * A name imported from more than one module maps to the FIRST, and that is
 * fine for the only use this has: a cross-check that fails loudly. aeon writes
 * each name once.
 */
export function empImportModules(text: string): Map<string, string> {
  const code = maskCommentsAndStrings(text);
  const out = new Map<string, string>();
  // `use a.b.{X, Y,\n   Z}` — aeon wraps long import lists across lines.
  for (const m of code.matchAll(/^use[ \t]+([A-Za-z_][\w.]*)\.\{([^}]*)\}/gm)) {
    for (const raw of m[2].split(',')) {
      const name = raw.trim();
      if (name !== '' && !out.has(name)) out.set(name, m[1]);
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// The integer-expression evaluator
// ---------------------------------------------------------------------------

/**
 * ⚠ IT UNDERSTANDS A DELIBERATELY SMALL GRAMMAR AND REFUSES EVERYTHING ELSE.
 *
 * Integers (decimal, aeon's `$FFFF`, and `0x`), names, parentheses, unary
 * minus, and `+ - * / % << >> & | ^`. That covers every rule-4 derivation at
 * `e0317db8` with room either side.
 *
 * What it must NEVER do is partially understand something. A call, an `if`, an
 * array, a field access, a float: each is a token this returns `null` for, and
 * `null` travels all the way out as "could not be resolved" with the
 * initializer quoted. There is no arm anywhere in this module that turns a
 * refusal into a number.
 */
export type EmpToken =
  | { kind: 'int'; value: number }
  | { kind: 'name'; text: string }
  | { kind: 'op'; text: string };

const OPERATORS = ['<<', '>>', '+', '-', '*', '/', '%', '&', '|', '^', '(', ')'];

/** Tokens, or null when the text contains something this grammar has no token for. */
export function tokenizeEmpExpr(expr: string): EmpToken[] | null {
  const out: EmpToken[] = [];
  let i = 0;
  while (i < expr.length) {
    const c = expr[i];
    if (c === ' ' || c === '\t') { i += 1; continue; }
    if (c === '$') {
      const m = /^\$[0-9A-Fa-f_]+/.exec(expr.slice(i));
      if (m === null) return null;
      const v = Number.parseInt(m[0].slice(1).replace(/_/g, ''), 16);
      if (!Number.isFinite(v)) return null;
      out.push({ kind: 'int', value: v });
      i += m[0].length;
      continue;
    }
    if (c >= '0' && c <= '9') {
      const hex = /^0[xX][0-9A-Fa-f_]+/.exec(expr.slice(i));
      if (hex !== null) {
        out.push({ kind: 'int', value: Number.parseInt(hex[0].slice(2).replace(/_/g, ''), 16) });
        i += hex[0].length;
        continue;
      }
      const dec = /^\d[\d_]*/.exec(expr.slice(i));
      if (dec === null) return null;
      // A trailing `.` or an identifier character welded to the number is a
      // literal shape this grammar does not have: refuse rather than truncate.
      const after = expr[i + dec[0].length];
      if (after !== undefined && /[.\w]/.test(after)) return null;
      out.push({ kind: 'int', value: Number(dec[0].replace(/_/g, '')) });
      i += dec[0].length;
      continue;
    }
    if (/[A-Za-z_]/.test(c)) {
      const m = /^[A-Za-z_]\w*/.exec(expr.slice(i))!;
      // A name followed by `(` is a call and a name followed by `.` or `[` is a
      // path or an index. None of the three is an integer this reader can fold.
      const rest = expr.slice(i + m[0].length).trimStart();
      if (rest.startsWith('(') || rest.startsWith('.') || rest.startsWith('[')) return null;
      out.push({ kind: 'name', text: m[0] });
      i += m[0].length;
      continue;
    }
    const op = OPERATORS.find((o) => expr.startsWith(o, i));
    if (op === undefined) return null;
    out.push({ kind: 'op', text: op });
    i += op.length;
  }
  return out.length === 0 ? null : out;
}

/** Binding power, lowest first — C's order, which is what `.emp` writes. */
const PRECEDENCE: Record<string, number> = {
  '|': 1, '^': 2, '&': 3, '<<': 4, '>>': 4, '+': 5, '-': 5, '*': 6, '/': 6, '%': 6,
};

function applyOp(op: string, a: number, b: number): number | null {
  switch (op) {
    case '+': return a + b;
    case '-': return a - b;
    case '*': return a * b;
    case '/': return b === 0 ? null : Math.trunc(a / b);
    case '%': return b === 0 ? null : a % b;
    case '<<': return a * 2 ** b;
    case '>>': return Math.floor(a / 2 ** b);
    case '&': return a & b;
    case '|': return a | b;
    case '^': return a ^ b;
    default: return null;
  }
}

/**
 * Evaluate a token stream, resolving names through `lookup`.
 *
 * `lookup` returns null for a name it cannot resolve, and that null propagates:
 * an expression with one unresolvable name is unresolvable, whole.
 *
 * `<<` is multiplication by a power of two rather than JavaScript's `<<`, which
 * is a 32-BIT SIGNED operation. `GRID_W << SECTION_SIZE_SHIFT` is small today,
 * but the same reader folds whatever aeon writes next, and a width that
 * silently wrapped negative at 2^31 would be the quietest possible wrong
 * number. `>>` is the matching floor divide.
 */
export function evalEmpTokens(tokens: EmpToken[], lookup: (name: string) => number | null): number | null {
  let at = 0;
  const peek = (): EmpToken | undefined => tokens[at];

  const parsePrimary = (): number | null => {
    const t = peek();
    if (t === undefined) return null;
    if (t.kind === 'op' && t.text === '-') { at += 1; const v = parsePrimary(); return v === null ? null : -v; }
    if (t.kind === 'op' && t.text === '+') { at += 1; return parsePrimary(); }
    if (t.kind === 'op' && t.text === '(') {
      at += 1;
      const v = parseExpr(0);
      const close = peek();
      if (v === null || close === undefined || close.kind !== 'op' || close.text !== ')') return null;
      at += 1;
      return v;
    }
    if (t.kind === 'int') { at += 1; return t.value; }
    if (t.kind === 'name') { at += 1; return lookup(t.text); }
    return null;
  };

  const parseExpr = (minBp: number): number | null => {
    let left = parsePrimary();
    if (left === null) return null;
    for (;;) {
      const t = peek();
      if (t === undefined || t.kind !== 'op') break;
      const bp = PRECEDENCE[t.text];
      if (bp === undefined || bp < minBp) break;
      at += 1;
      const right = parseExpr(bp + 1);
      if (right === null) return null;
      const applied = applyOp(t.text, left, right);
      if (applied === null) return null;
      left = applied;
    }
    return left;
  };

  const value = parseExpr(0);
  if (value === null || at !== tokens.length) return null;
  return Number.isSafeInteger(value) ? value : null;
}

// ---------------------------------------------------------------------------
// The resolution
// ---------------------------------------------------------------------------

/** The act's extent plus the two aeon files rule 4's chain runs through. */
export interface RegionRuleInput {
  /** The act's own size, from its grid. See this module's header on seeding. */
  act: ActExtentRules;
  /** aeon's act descriptor for THIS act: the derivations. */
  descriptor: EmpSource;
  /** aeon's engine constants: the leaves the derivations name. */
  engine: EmpSource;
}

/** How far a name may chase other names before this reader calls it a cycle. */
const MAX_DEPTH = 32;

/**
 * Resolve rule 4's five constants from aeon's two files.
 *
 * PURE: text in, numbers or reasons out. No I/O, no throw, no default.
 */
export function resolveRegionRules(input: RegionRuleInput): RegionRuleResolution {
  const { act, descriptor, engine } = input;
  const lookedIn = [descriptor.path, engine.path];

  const descDecls = descriptor.text === null ? null : empConstDecls(descriptor.text);
  const engineDecls = engine.text === null ? null : empConstDecls(engine.text);
  const imports = descriptor.text === null ? new Map<string, string>() : empImportModules(descriptor.text);
  const engineModule = engine.text === null ? null : empModuleName(engine.text);

  const resolved: ResolvedRuleConstant[] = [];
  const noted = new Set<string>();
  const note = (r: ResolvedRuleConstant): void => {
    if (noted.has(r.name)) return;
    noted.add(r.name);
    resolved.push(r);
  };

  // THE SEED. The act's own extent, under aeon's own names, so the two
  // derivations that mention ACT_W fold over the width the rest of the panel
  // already uses. See this module's header.
  const SEEDED = 'the act\'s own grid (project.json gridWidth x gridHeight)';
  const seeds = new Map<string, number>([['ACT_W', act.actW], ['ACT_H', act.actH]]);

  /** Why one name failed, filled in by `valueOf` on the way out. */
  let failure: string | null = null;

  const declFor = (name: string): { decl: EmpConstDecl; from: string } | 'missing' | null => {
    for (const [decls, src] of [[descDecls, descriptor], [engineDecls, engine]] as const) {
      if (decls === null) continue;
      const hits = decls.get(name);
      if (hits === undefined) continue;
      if (hits.length > 1) {
        failure = `${name} is declared ${hits.length} times in ${src.path} `
          + `(lines ${hits.map((h) => h.line).join(', ')}). Aurora will not pick one.`;
        return null;
      }
      const decl = hits[0];
      if (decl.condition !== null) {
        // ⚠ REPORTED, NEVER CLASSIFIED. See this module's header and the
        // 2026-09-18T23:47Z amendment: whether a build-gated constant is part of
        // the DEBUG delta is not a question this reader is allowed to answer.
        failure = `${name} is declared at ${src.path}:${decl.line} inside a build condition `
          + `\`${decl.condition}\`. Aurora has no DEBUG and no release, so it cannot evaluate `
          + 'one, and whether such a constant belongs to the build-time delta is a question for '
          + 'a person, not a default.';
        return null;
      }
      // The engine's constants are imported BY MODULE. Hold the file we read to
      // the module the descriptor actually named, so the day aeon moves these
      // constants elsewhere fails loudly instead of resolving a same-named
      // constant out of whatever file Aurora happened to open.
      const wantModule = imports.get(name);
      if (src === engine && wantModule !== undefined && engineModule !== wantModule) {
        failure = `${descriptor.path} imports ${name} from module \`${wantModule}\`, but `
          + `${engine.path} declares module \`${engineModule ?? 'none'}\`. Aurora will not read a `
          + 'constant out of a file the descriptor did not name.';
        return null;
      }
      return { decl, from: src.path };
    }
    return 'missing';
  };

  const chasing = new Set<string>();
  const valueOf = (name: string, depth: number): number | null => {
    const seeded = seeds.get(name);
    if (seeded !== undefined) {
      // The caller's extent wins, and a descriptor that can ALSO resolve this
      // name is checked against it rather than ignored.
      const own = declFor(name);
      if (own !== null && own !== 'missing') {
        const v = foldDecl(own.decl, depth + 1);
        if (v !== null && v !== seeded) {
          failure = `${name} is ${own.from}:${own.decl.line} \`${own.decl.expr}\` = ${v}, but this `
            + `act's grid makes it ${seeded}. Aurora will not check a rectangle against a width `
            + 'nothing else in the panel holds.';
          return null;
        }
      }
      failure = null;
      note({ name, value: seeded, expr: `${seeded}`, from: SEEDED });
      return seeded;
    }
    if (depth > MAX_DEPTH || chasing.has(name)) {
      failure = `${name} resolves through itself (a cycle, or a chain deeper than ${MAX_DEPTH}).`;
      return null;
    }
    const found = declFor(name);
    if (found === null) return null;
    if (found === 'missing') {
      failure = `${name} is declared in neither ${descriptor.path} nor ${engine.path}`
        + unreadSuffix();
      return null;
    }
    chasing.add(name);
    const value = foldDecl(found.decl, depth + 1);
    chasing.delete(name);
    if (value === null) {
      if (failure === null) {
        failure = `${name} is ${found.from}:${found.decl.line} \`${found.decl.expr}\`, which is `
          + 'not an integer expression Aurora can fold.';
      }
      return null;
    }
    note({ name, value, expr: found.decl.expr, from: found.from });
    return value;
  };

  const foldDecl = (decl: EmpConstDecl, depth: number): number | null => {
    const tokens = tokenizeEmpExpr(decl.expr);
    if (tokens === null) return null;
    return evalEmpTokens(tokens, (n) => valueOf(n, depth));
  };

  /** Which of the two files could not be read, appended to a "not declared" reason. */
  function unreadSuffix(): string {
    const bad = [descriptor, engine].filter((s) => s.text === null);
    if (bad.length === 0) return '.';
    return `, and ${bad.map((s) => `${s.path} could not be read (${s.unreadReason})`).join('; ')}.`;
  }

  const values = new Map<string, number>();
  const unresolved: UnresolvedRuleConstant[] = [];
  for (const name of RULE_4_CONSTANTS) {
    failure = null;
    chasing.clear();
    const v = valueOf(name, 0);
    if (v === null) {
      unresolved.push({
        name,
        reason: failure ?? `${name} could not be resolved.`,
        lookedIn,
      });
    } else {
      values.set(name, v);
    }
  }

  if (unresolved.length > 0) return { kind: 'unresolved', unresolved, resolved };

  return {
    kind: 'resolved',
    resolved,
    rules: {
      actW: act.actW,
      actH: act.actH,
      minSpan: values.get('REGION_MIN_SPAN')!,
      centreXMin: values.get('CENTRE_X_MIN')!,
      centreXMax: values.get('CENTRE_X_MAX')!,
      centreYMin: values.get('CENTRE_Y_MIN')!,
      centreYMax: values.get('CENTRE_Y_MAX')!,
    },
  };
}
