#!/usr/bin/env node
/**
 * check-object-stringify — fail when a type that must never be stringified
 * implicitly reaches a sink that would render it `[object Object]`.
 *
 * WHY THIS EXISTS
 * ---------------
 * On 2026-08-30 (merge 68fc5c84) `Notice` was widened from `string` to
 * `{ severity, message }`. Widening the type was supposed to make `tsc` refuse
 * every call site that had not caught up. It refused most of them and MISSED
 * the one that mattered: `r.notices.join(' ')` kept typechecking, because
 * `Array.prototype.join` is declared
 *
 *     join(separator?: string): string
 *
 * for EVERY element type. Nine sites failed at runtime instead of at compile
 * time, printing `[object Object]` to users.
 *
 * THE GENERAL SHAPE, WHICH IS THE POINT OF THIS FILE
 * --------------------------------------------------
 * When a primitive is widened to an object, the type system covers the sinks
 * that need the primitive's SHAPE (`.trim()`, `.includes()`, `x: string = n`)
 * and does NOT cover the sinks that accept anything and call `toString()`. That
 * asymmetry is invisible: the safety net looks total because it caught so much.
 *
 * MEASURED against this repo's `Notice` on TypeScript 6, `tsc --noEmit` clean:
 *
 *   REFUSED (5)                       NOT REFUSED (14)
 *     n.trim()                          ns.join(' ')          <- the incident
 *     ns.includes('a')                  `${n}`   `${ns}`
 *     ns.indexOf('a')                   String(n)
 *     ns.some(x => x.includes('a'))     n.toString()  ns.toString()
 *     const s: string = n               n + ''   ns + ''
 *                                       [...ns].sort()
 *                                       ns.map(…).join()  ns.filter(…).join()
 *                                       [...new Set(ns)].join()
 *                                       ns.flat().join()
 *                                       console.log(n)  (any-typed sink)
 *
 * `n + ''` being ALLOWED is the one worth staring at: `+` with a string operand
 * accepts an object on the other side, so even hand-rolled concatenation is not
 * a compile error.
 *
 * WHY A NARROW LIST AND NOT A REPO-WIDE RULE
 * ------------------------------------------
 * The general rule — "no object reaches an implicit toString" — already exists
 * as typescript-eslint's `no-base-to-string`, and this repo has no ESLint at
 * all. It was MEASURED here before this file was written: a repo-wide pass over
 * every `.join()`, template span and `String()` call flags 7 sites, and all 7
 * are FALSE POSITIVES — zod's `PropertyKey[]`, `params?.x ?? ''` narrowed to
 * `{}`, and a `Buffer` (which has a real `toString`). Being quiet on this tree
 * therefore requires re-deriving `no-base-to-string`'s precision — custom
 * `toString` detection, `{}`/`unknown` handling, union arithmetic — by hand,
 * with none of that rule's hardening behind it. A 90%-right type matcher that
 * reads as a total check is the failure mode this repo keeps finding.
 *
 * So this gate is deliberately SMALL and EXACT: it watches a named list of
 * types. Zero false positives by construction, because nothing but a listed
 * type can trip it. The cost is that it covers what is on the list and nothing
 * else — which is why the list carries the bar in prose, and why adding the next
 * widened type is one entry.
 *
 * WHEN YOU WIDEN A PRIMITIVE TO AN OBJECT, ADD IT TO `GUARDED` BELOW.
 * That is the whole bar. `tsc` will show you the sites that need the old shape;
 * this shows you the ones that only need *a* shape.
 *
 * ANTI-VACUOUS
 * ------------
 * A checker that silently watched nothing would pass forever. Three guards:
 *   - a `GUARDED` entry whose module or export cannot be resolved is a
 *     COULD-NOT-MEASURE exit, not a skip. Renaming `notice.ts` must scream.
 *   - zero source files in the program is a COULD-NOT-MEASURE exit.
 *   - the number of types resolved and files scanned is printed on every run,
 *     clean or not, so "found nothing" can be told from "looked at nothing".
 *
 * EXIT CODES
 *   0  no guarded type reaches a stringification sink
 *   1  at least one does
 *   2  could not measure
 */
import ts from 'typescript';
import { dirname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/**
 * Types that must never be rendered by an implicit `toString()`.
 *
 * Each entry is a module path relative to the repo root and an exported type
 * name. Add one whenever a primitive becomes an object; `why` is printed in the
 * failure so the next reader gets the reason, not just the rule.
 */
const GUARDED = [
  {
    module: 'src/core/project/notice.ts',
    name: 'Notice',
    why:
      'Notice was `string` until merge 68fc5c84 and is now { severity, message }. ' +
      'Nine call sites survived that widening because their sinks accept anything, ' +
      'and rendered `[object Object]` to users.',
    fix: 'Reach for the field you meant — `.message` — e.g. `notices.map((n) => n.message).join(\'\\n\')`.',
  },
];

function fail(message) {
  console.error(`check-object-stringify: COULD NOT MEASURE — ${message}`);
  process.exit(2);
}

const configPath = ts.findConfigFile(ROOT, ts.sys.fileExists, 'tsconfig.json');
if (!configPath) fail(`no tsconfig.json found from ${ROOT}`);
const raw = ts.readConfigFile(configPath, ts.sys.readFile);
if (raw.error) fail(`tsconfig.json could not be read: ${raw.error.messageText}`);
const parsed = ts.parseJsonConfigFileContent(raw.config, ts.sys, ROOT);
if (!parsed.fileNames.length) fail('tsconfig.json resolved to no files at all');

const program = ts.createProgram(parsed.fileNames, parsed.options);
const checker = program.getTypeChecker();

/** Resolve every GUARDED entry to a live ts.Type, or refuse to run. */
const guardedTypes = GUARDED.map((entry) => {
  const abs = resolve(ROOT, entry.module);
  const sf = program.getSourceFile(abs);
  if (!sf) fail(`${entry.module} is listed in GUARDED but is not in the TypeScript program`);
  const moduleSymbol = checker.getSymbolAtLocation(sf);
  if (!moduleSymbol) fail(`${entry.module} has no module symbol; it may not be a module`);
  const exported = checker.getExportsOfModule(moduleSymbol).find((s) => s.getName() === entry.name);
  if (!exported) {
    fail(`${entry.module} does not export a type named \`${entry.name}\` any more`);
  }
  const type = checker.getDeclaredTypeOfSymbol(exported);
  if (!type || (type.flags & ts.TypeFlags.Any) !== 0) {
    fail(`\`${entry.name}\` in ${entry.module} did not resolve to a usable type`);
  }
  return { ...entry, type };
});

/** Does this type, or any member of this union, sit on the guarded list? */
function guardedIn(type) {
  if (!type) return undefined;
  if (type.isUnion()) {
    for (const t of type.types) {
      const hit = guardedIn(t);
      if (hit) return hit;
    }
    return undefined;
  }
  return guardedTypes.find((g) => g.type === type);
}

/** The element type of an array/tuple/index-signature, if this type has one. */
function elementOf(type) {
  if (!type) return undefined;
  if (checker.isArrayType?.(type) || checker.isTupleType?.(type)) {
    const args = checker.getTypeArguments(type);
    if (args.length) return args.length === 1 ? args[0] : checker.getUnionType?.(args) ?? args[0];
  }
  return checker.getIndexTypeOfType(type, ts.IndexKind.Number) ?? undefined;
}

/** A guarded type reached either directly or as the element of an array. */
function guardedAtOrInside(node) {
  const type = checker.getTypeAtLocation(node);
  return guardedIn(type) ?? guardedIn(elementOf(type));
}

const violations = [];
let scanned = 0;

function record(node, sink, hit) {
  const sf = node.getSourceFile();
  const { line, character } = sf.getLineAndCharacterOfPosition(node.getStart());
  violations.push({
    where: `${relative(ROOT, sf.fileName)}:${line + 1}:${character + 1}`,
    sink,
    text: node.getText().replace(/\s+/g, ' ').slice(0, 100),
    entry: hit,
  });
}

function isStringType(type) {
  if (!type) return false;
  if (type.isUnion()) return type.types.some(isStringType);
  return (type.flags & (ts.TypeFlags.String | ts.TypeFlags.StringLiteral)) !== 0;
}

for (const sf of program.getSourceFiles()) {
  if (sf.isDeclarationFile || sf.fileName.includes('node_modules')) continue;
  scanned++;
  const visit = (node) => {
    // `xs.join(sep)` / `x.toString()` — the method sinks.
    if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)) {
      const method = node.expression.name.text;
      if (method === 'join' || method === 'toString') {
        const hit = guardedAtOrInside(node.expression.expression);
        if (hit) record(node, `.${method}()`, hit);
      }
    }
    // `String(x)`
    if (
      ts.isCallExpression(node) &&
      ts.isIdentifier(node.expression) &&
      node.expression.text === 'String' &&
      node.arguments.length === 1
    ) {
      const hit = guardedAtOrInside(node.arguments[0]);
      if (hit) record(node, 'String()', hit);
    }
    // `${x}` — template interpolation.
    if (ts.isTemplateSpan(node)) {
      const hit = guardedAtOrInside(node.expression);
      if (hit) record(node.expression, 'template `${…}`', hit);
    }
    // `x + 'str'` / `'str' + x` — string concatenation.
    if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.PlusToken) {
      const left = checker.getTypeAtLocation(node.left);
      const right = checker.getTypeAtLocation(node.right);
      const hit =
        (isStringType(right) ? guardedAtOrInside(node.left) : undefined) ??
        (isStringType(left) ? guardedAtOrInside(node.right) : undefined);
      if (hit) record(node, 'string concatenation (+)', hit);
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
}

if (scanned === 0) {
  fail('the TypeScript program contained no source files to scan');
}

const summary =
  `${guardedTypes.length} guarded type(s) [${guardedTypes.map((g) => g.name).join(', ')}] ` +
  `across ${scanned} source file(s)`;

if (violations.length === 0) {
  console.log(`check-object-stringify: OK — ${summary}; none reaches a stringification sink.`);
  process.exit(0);
}

console.error(
  `\ncheck-object-stringify: FAIL — ${violations.length} site(s) render a guarded type via an ` +
    `implicit toString().\n  Checked ${summary}.\n`,
);
for (const v of violations) {
  console.error(`  ${v.where}`);
  console.error(`    ${v.sink}  ${v.text}`);
  console.error(`    ${v.entry.name}: ${v.entry.why}`);
  console.error(`    FIX: ${v.entry.fix}\n`);
}
console.error(
  '  These do NOT fail `tsc`. The sinks above accept every type and call toString()\n' +
    '  on it, so a widened type reaches them unchanged and renders `[object Object]`\n' +
    '  at runtime. That is the whole reason this gate exists — see the file header.\n',
);
process.exit(1);
