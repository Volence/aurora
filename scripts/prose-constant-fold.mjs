// ─────────────────────────────────────────────────────────────────────────────
// THE CONSTANT FOLD BEHIND `check-prose-constants.mjs`.
//
// Split out of that gate on 2026-09-09 for ONE reason: the fold is the half of
// it that can be wrong SILENTLY. The scan half fails loudly when it breaks — it
// stops printing findings — but a fold that quietly stops resolving a name only
// shrinks the table, and a smaller table matches fewer prose numbers and still
// prints a clean summary. That is precisely how a derived constant went
// unwatched for as long as it did; see
// docs/reviews/2026-09-09-prose-gate-derived-constants.md. A unit nobody can
// call is a unit nobody can plant a defect in, so this half lives where a test
// can hold it directly, over source text the test writes itself.
//
// Everything here is PURE: it takes parsed syntax trees and a contract map and
// returns values. It reads no files and knows no repo paths.
// ─────────────────────────────────────────────────────────────────────────────

import ts from 'typescript';

// The old table was a numeric literal or `constant('X')` AND NOTHING ELSE. The
// constants that shape excludes are the DERIVED ones, which are precisely the
// ones whose values move — `FG_PAGE_FRAMES` moves the day aeon resizes its art
// pool, `CRAM_WORD_MAX` moves with the word width — so the blind half of the
// table was the half most worth watching.
//
// WIDENING A CONSTANT TABLE IS NOT FREE. Every value it learns is a value
// matched against every author-facing sentence in every module that can see the
// name, and a gate that fires on an example coordinate or a bit position is
// retired by its readers, which is a worse outcome than the blindness. So each
// arm below was measured over the whole tree before it was kept, and the cost is
// recorded in docs/reviews/2026-09-09-prose-gate-derived-constants.md: the three
// arms together take the table from 135 names to 168 and cost TWO new findings,
// both adjudicated in EXEMPT above and both about the value 12.
//
// THE ARMS:
//   • ARITHMETIC over names already in the table (+ - * / % ** << >> & | ^, and
//     unary - + ~). `+` folds only when both sides are numbers, so string
//     concatenation — 32 exported consts here — falls out on its own.
//   • ALIAS: `export const A = B` where B is known.
//   • ONE CALL SHAPE, deliberately the narrowest that reaches a real derivation:
//     a `function` declaration whose body ends in its ONLY `return`, whose
//     returned expression is arithmetic, and EVERY identifier in which is one of
//     its own parameters. That last clause is what keeps this from being an
//     interpreter: the body cannot reach module scope, so binding arguments to
//     parameters is the whole evaluation. `deriveFgPageFrames(FG_TILE_LIMIT,
//     FG_PAGE_TILES)` is that shape; guard statements ahead of the return are
//     skipped, which is sound because a guard that fired would mean the module
//     never loaded and the constant has no value to be re-typed.
//
// WHAT IS DELIBERATELY OUT: arrow-function consts, methods, property reads,
// object-argument calls (packCollisionCell), IIFEs, and anything reading a
// schema at runtime. Each would need real evaluation, and each is therefore
// named in UNFOLDABLE rather than silently dropped.

/** `function f(a, b) { …guards…; return <arith over a, b only>; }` */
function pureNumericFns(trees) {
  const out = new Map(); // name -> { params, expr }
  for (const sf of trees.values()) {
    if (!sf) continue;
    for (const stmt of sf.statements) {
      if (!ts.isFunctionDeclaration(stmt) || !stmt.name || !stmt.body) continue;
      const rets = stmt.body.statements.filter(ts.isReturnStatement);
      if (rets.length !== 1 || !rets[0].expression) continue;
      if (rets[0] !== stmt.body.statements[stmt.body.statements.length - 1]) continue;
      if (!stmt.parameters.every(p => ts.isIdentifier(p.name) && !p.dotDotDotToken)) continue;
      const params = stmt.parameters.map(p => p.name.text);
      if (!closedArithmetic(rets[0].expression, new Set(params))) continue;
      out.set(stmt.name.text, { params, expr: rets[0].expression });
    }
  }
  return out;
}

/** Arithmetic whose only identifiers are `allowed`, with at least one operator. */
function closedArithmetic(n, allowed, depth = 0) {
  if (depth > 12) return false;
  const leaf = (x, d) => {
    if (ts.isNumericLiteral(x)) return true;
    if (ts.isIdentifier(x)) return allowed.has(x.text);
    return closedArithmetic(x, allowed, d);
  };
  if (ts.isParenthesizedExpression(n)) return closedArithmetic(n.expression, allowed, depth + 1);
  if (ts.isPrefixUnaryExpression(n)) {
    return UNARY[n.operator] !== undefined && leaf(n.operand, depth + 1);
  }
  if (ts.isBinaryExpression(n)) {
    return BINARY[n.operatorToken.kind] !== undefined
      && leaf(n.left, depth + 1) && leaf(n.right, depth + 1);
  }
  return false;
}

const BINARY = {
  [ts.SyntaxKind.PlusToken]: (a, b) => a + b,
  [ts.SyntaxKind.MinusToken]: (a, b) => a - b,
  [ts.SyntaxKind.AsteriskToken]: (a, b) => a * b,
  [ts.SyntaxKind.SlashToken]: (a, b) => a / b,
  [ts.SyntaxKind.PercentToken]: (a, b) => a % b,
  [ts.SyntaxKind.AsteriskAsteriskToken]: (a, b) => a ** b,
  [ts.SyntaxKind.LessThanLessThanToken]: (a, b) => a << b,
  [ts.SyntaxKind.GreaterThanGreaterThanToken]: (a, b) => a >> b,
  [ts.SyntaxKind.GreaterThanGreaterThanGreaterThanToken]: (a, b) => a >>> b,
  [ts.SyntaxKind.AmpersandToken]: (a, b) => a & b,
  [ts.SyntaxKind.BarToken]: (a, b) => a | b,
  [ts.SyntaxKind.CaretToken]: (a, b) => a ^ b,
};
const UNARY = {
  [ts.SyntaxKind.MinusToken]: (a) => -a,
  [ts.SyntaxKind.PlusToken]: (a) => a,
  [ts.SyntaxKind.TildeToken]: (a) => ~a,
};

/**
 * `export const NAME = <foldable>`, repo-wide, to a FIXPOINT.
 *
 * A single pass is order-dependent: `TILE_RGBA_BYTES = TILE_PIXELS * 4` folds
 * only once `TILE_PIXELS` is known, and `git ls-files` order is not dependency
 * order. Iterating until the table stops growing removes the ordering from the
 * answer entirely — with a hard cap, so a cycle ends the loop rather than the
 * process.
 */
function exportedNumbers(trees, contract, fns) {
  const out = new Map(); // exported name -> value
  for (let pass = 0; pass < 8; pass++) {
    let grew = false;
    for (const sf of trees.values()) {
      if (!sf) continue;
      const local = new Map(out); // module-local consts can feed an exported one
      for (const stmt of sf.statements) {
        if (!ts.isVariableStatement(stmt)) continue;
        const exported = stmt.modifiers?.some(m => m.kind === ts.SyntaxKind.ExportKeyword);
        for (const d of stmt.declarationList.declarations) {
          if (!ts.isIdentifier(d.name) || !d.initializer) continue;
          const v = numericInit(d.initializer, contract, local, fns);
          if (v === null) continue;
          local.set(d.name.text, v);
          if (!exported) continue;
          if (!out.has(d.name.text)) grew = true;
          out.set(d.name.text, v);
        }
      }
    }
    if (!grew) break;
  }
  return out;
}

/**
 * The value an initialiser denotes, or null.
 *
 * `names` is what the SITE can see (repo-wide exports plus module-local consts).
 * Non-finite results are refused, because NaN and Infinity would poison the
 * value index; NON-INTEGERS ARE KEPT. That is deliberate and it is a fix, not
 * laxity: `NORMAL_LEN = 6.5` is a value this fold KNOWS, and dropping it from
 * the table turned every constant derived from it — `MARK_BOX_MARGIN =
 * NORMAL_LEN / 16` — into a fold FAILURE, which the blind ledger below then
 * reported as a coverage hole. "I could not evaluate it" and "I evaluated it and
 * it has no digit-run twin to look for" are different answers, and merging them
 * is the very defect this parcel exists to remove. The integer filter therefore
 * belongs at the MATCH, not in the table.
 */
function numericInit(init, contract, names = new Map(), fns = new Map(), depth = 0) {
  if (depth > 12) return null;
  const v = evaluate(init, contract, names, fns, depth);
  return v !== null && Number.isFinite(v) ? v : null;
}

function evaluate(init, contract, names, fns, depth) {
  if (depth > 12) return null;
  if (ts.isNumericLiteral(init)) return Number(init.text);
  if (ts.isParenthesizedExpression(init)) return evaluate(init.expression, contract, names, fns, depth + 1);
  if (ts.isAsExpression(init)) return evaluate(init.expression, contract, names, fns, depth + 1);
  if (ts.isIdentifier(init)) {
    const v = names.get(init.text);
    return v === undefined ? null : v;
  }
  if (ts.isPrefixUnaryExpression(init)) {
    const op = UNARY[init.operator];
    if (!op) return null;
    const a = evaluate(init.operand, contract, names, fns, depth + 1);
    return a === null ? null : op(a);
  }
  if (ts.isBinaryExpression(init)) {
    const op = BINARY[init.operatorToken.kind];
    if (!op) return null;
    const a = evaluate(init.left, contract, names, fns, depth + 1);
    if (a === null) return null;
    const b = evaluate(init.right, contract, names, fns, depth + 1);
    return b === null ? null : op(a, b);
  }
  if (ts.isCallExpression(init) && ts.isIdentifier(init.expression)) {
    if (init.expression.text === 'constant'
        && init.arguments.length === 1 && ts.isStringLiteral(init.arguments[0])) {
      const v = contract.get(init.arguments[0].text);
      return v === undefined ? null : v;
    }
    const fn = fns.get(init.expression.text);
    if (!fn || fn.params.length !== init.arguments.length) return null;
    const bound = new Map();
    for (let i = 0; i < fn.params.length; i++) {
      const a = evaluate(init.arguments[i], contract, names, fns, depth + 1);
      if (a === null) return null;
      bound.set(fn.params[i], a);
    }
    return evaluate(fn.expr, contract, bound, fns, depth + 1);
  }
  return null;
}

/**
 * Is this initialiser one the fold OUGHT to have managed?
 *
 * The refusal is only as good as this predicate: too wide and every string
 * constant is announced as a blind spot (measured: a first cut that accepted any
 * single-return call named 118 constants, most of them returning objects and
 * strings — noise); too narrow and the blindness it is supposed to surface stays
 * hidden. So it accepts exactly the shapes the fold ATTEMPTS: an arithmetic
 * operator, a `constant('X')` lookup, or a call to a function the fold already
 * recognised as pure arithmetic. Anything else was never claimed.
 */
/**
 * The WIDER blind signal: the author has DECLARED this value is a number, by an
 * explicit `: number` annotation or by calling a function declared `: number`.
 * No syntax tells us what such a value is — most are read out of the vendored
 * effects JSON schema at module load — so this tier is COUNTED AND NAMED rather
 * than adjudicated. Making it a hard gate would redden the build every time the
 * effects lane derives one more figure from its schema, which is the behaviour
 * that gets a gate switched off; making it invisible is how FG_PAGE_FRAMES hid.
 */
function numericReturningFns(trees) {
  const out = new Set();
  for (const sf of trees.values()) {
    if (!sf) continue;
    for (const stmt of sf.statements) {
      if (ts.isFunctionDeclaration(stmt) && stmt.name
          && stmt.type?.kind === ts.SyntaxKind.NumberKeyword) out.add(stmt.name.text);
    }
  }
  return out;
}

function declaredNumeric(decl, numFns) {
  if (decl.type?.kind === ts.SyntaxKind.NumberKeyword) return true;
  let i = decl.initializer;
  while (i && (ts.isParenthesizedExpression(i) || ts.isAsExpression(i))) i = i.expression;
  return Boolean(i && ts.isCallExpression(i) && ts.isIdentifier(i.expression)
    && numFns.has(i.expression.text));
}

function attemptedNumeric(init, fns, depth = 0) {
  if (depth > 6) return false;
  if (ts.isParenthesizedExpression(init) || ts.isAsExpression(init)) {
    return attemptedNumeric(init.expression, fns, depth + 1);
  }
  if (ts.isPrefixUnaryExpression(init)) {
    return init.operator === ts.SyntaxKind.TildeToken
      || (UNARY[init.operator] !== undefined && !ts.isNumericLiteral(init.operand));
  }
  if (ts.isBinaryExpression(init)) {
    if (BINARY[init.operatorToken.kind] === undefined) return false;
    // `+` is the ambiguous one: it is also this repo's main prose-assembly
    // operator. Claim it only when a side is unambiguously a number.
    if (init.operatorToken.kind !== ts.SyntaxKind.PlusToken) return true;
    return [init.left, init.right].some(s => ts.isNumericLiteral(s)
      || (ts.isBinaryExpression(s) && BINARY[s.operatorToken.kind] !== undefined
          && s.operatorToken.kind !== ts.SyntaxKind.PlusToken));
  }
  if (ts.isCallExpression(init) && ts.isIdentifier(init.expression)) {
    return init.expression.text === 'constant' || fns.has(init.expression.text);
  }
  return false;
}

/** Names a file can see: every import binding, plus its own const declarations. */
function namesInScope(sf, exported, contract, fns) {
  const scope = new Map();
  for (const stmt of sf.statements) {
    if (ts.isImportDeclaration(stmt) && stmt.importClause?.namedBindings
        && ts.isNamedImports(stmt.importClause.namedBindings)) {
      for (const el of stmt.importClause.namedBindings.elements) {
        // A type-only binding names no value.
        if (el.isTypeOnly || stmt.importClause.isTypeOnly) continue;
        const source = (el.propertyName ?? el.name).text;
        if (exported.has(source)) scope.set(el.name.text, exported.get(source));
      }
    }
    if (ts.isVariableStatement(stmt)) {
      for (const d of stmt.declarationList.declarations) {
        if (!ts.isIdentifier(d.name) || !d.initializer) continue;
        // A module-local const derived from what this file imports is as much a
        // name the site can see as an imported one, so the fold gets both.
        const v = numericInit(d.initializer, contract, new Map([...exported, ...scope]), fns);
        if (v !== null) scope.set(d.name.text, v);
      }
    }
  }
  return scope;
}

// ── The whole table, over a set of parsed modules ────────────────────────────
/**
 * Everything the fold knows about a set of trees, in one call.
 *
 * `trees` maps a file path to its `ts.SourceFile`. Returns the repo-wide
 * exported table, the two helper populations, and the two BLIND TIERS: the
 * `nearMiss` rows the fold attempted and abandoned, and the `declaredBlind`
 * rows whose author declared them numeric but which nothing static evaluates.
 * Both tiers exist so a caller can REPORT what it could not do; a caller that
 * ignores them is back to the defect this module was split out to make testable.
 */
export function foldTrees(trees, contract) {
  const fns = pureNumericFns(trees);
  const numFns = numericReturningFns(trees);
  const exported = exportedNumbers(trees, contract, fns);
  const nearMiss = [];
  const declaredBlind = [];
  for (const [file, sf] of trees) {
    if (!sf) continue;
    const local = new Map(exported);
    for (const stmt of sf.statements) {
      if (!ts.isVariableStatement(stmt)) continue;
      const isExported = stmt.modifiers?.some(m => m.kind === ts.SyntaxKind.ExportKeyword);
      for (const d of stmt.declarationList.declarations) {
        if (!ts.isIdentifier(d.name) || !d.initializer) continue;
        const v = numericInit(d.initializer, contract, local, fns);
        if (v !== null) local.set(d.name.text, v);
        if (!isExported || v !== null) continue;
        const row = {
          file,
          name: d.name.text,
          line: sf.getLineAndCharacterOfPosition(d.getStart(sf)).line + 1,
          src: d.initializer.getText(sf).replace(/\s+/g, ' ').slice(0, 120),
        };
        if (attemptedNumeric(d.initializer, fns)) nearMiss.push(row);
        else if (declaredNumeric(d, numFns)) declaredBlind.push(row);
      }
    }
  }
  return { fns, numFns, exported, nearMiss, declaredBlind };
}

/** Parse a `{ path: sourceText }` record into the tree map `foldTrees` wants. */
export function parseSources(sources) {
  const trees = new Map();
  for (const [file, text] of Object.entries(sources)) {
    trees.set(file, ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true,
      file.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS));
  }
  return trees;
}

export {
  BINARY, UNARY, closedArithmetic, pureNumericFns, numericReturningFns,
  exportedNumbers, numericInit, attemptedNumeric, declaredNumeric, namesInScope,
};
