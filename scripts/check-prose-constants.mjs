#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────────────────────
// A NUMBER A PERSON READS MUST NOT BE RE-TYPED BESIDE THE CONSTANT THAT RULES IT.
//
// A constant restated in author-facing prose has TWO AUTHORS AND NO ARBITER. The
// code enforces one value, the sentence beside it states another, and the two rot
// on separate clocks — so the sentence is wrong in exactly the moment a person
// reads it, which is the moment they needed it right.
//
// This is not hypothetical here. `scene-ui.ts`'s own header records the same
// defect landing in this repo: "This paragraph used to say 'the layer count is
// 1..8' and was wrong within the day empyrean 277bc15 raised the ceiling to 16 —
// the sentence explaining why numbers must not be typed in had a typed-in number
// inside it." And aeon shipped the worst instance on 2026-09-06: a refusal
// message telling a blocked author "the limit is 12 KiB" while the code enforced
// 20480. Both were fixed by DERIVING the figure. Re-typing today's value goes
// stale on the identical clock, WHICH IS HOW THE WRONG NUMBER GOT THERE.
//
// ═══ THE POPULATION, AND WHY IT IS THIS NARROW ═══
//
// A file is checked for the constants IT CAN ALREADY SEE: names it imports, and
// names it declares. A tooltip in `BgAnimBandPanel.tsx` saying "32" while that
// module imports `TILE_BYTES` (whose value is 32, read from the vendored aeon
// contract) is a re-typing with the arbiter literally in scope — zero-cost to
// fix and no new coupling to introduce. A tooltip saying "32" in a module that
// has never heard of TILE_BYTES is NOT flagged: it might be a coincidence, and a
// gate that fired on every author-facing "3" or "8" in the app would be hostile
// noise that the next lane would rightly disable.
//
// AUTHOR-FACING IS A POSITION, NOT A WORD LIST. A JSX attribute a person reads
// (title/label/placeholder/alt/aria-label/hint), an object property whose key
// says it is shown, or JSX text. Comments are out: a wrong number in a comment
// misleads the next author, but this gate is about text a tool shows a person.
//
// ═══ WHAT IT CANNOT SEE — STATE THE BOUND, IT IS NOT FULL COVERAGE ═══
//
//   • OFFSET restatements. "banks 1 to 7" beside `BGANIM_PHASE_BANKS = 8`, or
//     "a 1025th block" beside `MAX_BLOCK_REF = 0x3ff`, are the same defect and
//     match no value. Both were found by READING and fixed by hand; neither
//     would be caught here if reintroduced.
//   • `.md` guide prose (that is `check-guide-text.mjs`), `.mjs` harnesses,
//     shell scripts, JSON.
//   • Prose assembled through a variable this script cannot fold.
//   • Non-integers, hex in prose, and compound tokens (`8x8`, `4bpp`, `16px`),
//     which are format names rather than restated bounds.
//   • Whether a number is WRONG. It finds re-typing, not staleness.
//
// The wider census that found the population in the first place is
// `scratchpad/numbers-in-prose-sweep.mjs` (`npm run harness:numbers-in-prose`),
// which sweeps every author-facing string against every vendored value and needs
// a human verdict per hit. This gate is the subset that can be enforced.
//
// ═══ SELF VISIBILITY ═══
//
// Registered in package.json's `test` chain, on check-guide-text's argument: an
// instrument nobody runs is an instrument nobody can be wrong in front of.
// ─────────────────────────────────────────────────────────────────────────────

import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import ts from 'typescript';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const rel = (p) => path.relative(ROOT, p).split(path.sep).join('/');

// ── ADJUDICATED EXEMPTIONS ───────────────────────────────────────────────────
// A row here is a VERDICT, not a mute. It names the site, the number, and why
// the number is not a restatement of the constant that shares its value. A row
// matching nothing is a failure, on check-guide-text's rule: a permission with
// no live subject has outlived its reason.
const EXEMPT = [
  {
    file: 'src/renderer/providers/effects-preset.ts', value: 16,
    match: /is not a CRAM word/,
    why: '"ONE 16-bit word" is a WIDTH IN BITS, not CRAM_LINE_ENTRIES (entries per palette line, '
      + 'also 16). Two different quantities that happen to share a value, and the sentence '
      + 'already derives the figure that IS its bound, `${CRAM_WORD_MAX}`.',
  },
  {
    file: 'src/main/editor-methods.ts', value: 255,
    match: /block-cell edits: cell index 0-255/,
    why: 'a CHUNK-CELL INDEX range (256 cells per chunk), not FLAT_SHAPE (the flat collision '
      + 'shape id, also 255). Nothing in the block/chunk path derives from the shape table.',
  },
  {
    file: 'src/main/editor-methods.ts', value: 255,
    match: /optional sparse seed: block-cell edits \(index 0-255/,
    why: 'same chunk-cell index range as the row above, on add_chunk rather than set_chunk.',
  },
  {
    file: 'src/main/editor-methods.ts', value: 8,
    match: /optional zoom \(0\.125-8\)/,
    why: 'a MAXIMUM ZOOM FACTOR, not BGANIM_PHASE_BANKS. The two share a value and nothing else; '
      + 'this module only has the bank count in scope at all because `promote_bg_anim_band`\'s '
      + 'description derives it.',
  },
  {
    file: 'src/main/editor-methods.ts', value: 15,
    match: /bits 15:14/,
    why: '"bits 15:14" is a BIT POSITION in the packed collision word, not TILE_PIXEL_MAX '
      + '(the largest 4bpp pixel value). Deriving it would name the wrong quantity.',
  },
  {
    file: 'src/main/editor-methods.ts', value: 4096,
    match: /Max 4096 cells per call/,
    why: 'NOT BG_LAYOUT_WORDS. Nothing in this module enforces 4096 cells, so this figure has '
      + 'no code-side author at all to derive from. Interpolating BG_LAYOUT_WORDS would invent a '
      + 'coupling and make a coincidence look like a derivation. Recorded as an open item in '
      + 'docs/reviews/2026-09-06-numbers-in-prose.md: a documented cap with no enforcement.',
  },
  {
    file: 'src/main/editor-methods.ts', value: 64,
    match: /Read raw 8x8 tiles as 64 palette indices/,
    why: 'CLASSIC-PATH tile geometry, a different lineage from aeon\'s bganim consumer contract '
      + 'that TILE_PIXELS is vendored from (this repo keeps its own in core/formats/tiles.ts). '
      + 'Reading the aeon contract here would make an amendment for aeon\'s BG region silently '
      + 'rewrite what a classic-project description says. Same hardware fact, two authorities.',
  },
  {
    file: 'src/main/editor-methods.ts', value: 64,
    match: /Each tile is 64 pixel values/,
    why: 'Same classic-path lineage as get_tiles above. Note the enforcement beside it is the zod '
      + '`.length(64)`/`.max(15)`, itself typed, so deriving only the PROSE from the aeon contract '
      + 'would create a fresh two-author split rather than close one.',
  },
  {
    file: 'src/main/editor-methods.ts', value: 15,
    match: /Each tile is 64 pixel values 0-15/,
    why: 'Companion to the row above: 0-15 is the classic 4bpp pixel range, enforced two lines up '
      + 'by a typed `.max(15)`. Closing this properly means giving the classic tile format its own '
      + 'named bound and pointing both at it: a change to enforcement, out of this parcel.',
  },
];

// ── The values a name carries ────────────────────────────────────────────────
// Read from the source that DEFINES each name, including the `constant('X')`
// indirection into the vendored aeon contract. So this gate cannot itself be the
// thing that holds a stale number: nothing below is typed.
function contractValues() {
  const c = JSON.parse(readFileSync(
    path.join(ROOT, 'src/core/formats/bg-override/bganim-consumer-contract.json'), 'utf8'));
  const out = new Map();
  for (const [k, v] of Object.entries(c.constants ?? {})) {
    if (Number.isInteger(v?.value)) out.set(k, v.value);
  }
  return out;
}

/** `export const NAME = <int>` and `export const NAME = constant('X')`, repo-wide. */
function exportedNumbers(files, contract) {
  const out = new Map(); // exported name -> value
  for (const f of files) {
    const sf = parse(f);
    if (!sf) continue;
    for (const stmt of sf.statements) {
      if (!ts.isVariableStatement(stmt)) continue;
      const exported = stmt.modifiers?.some(m => m.kind === ts.SyntaxKind.ExportKeyword);
      if (!exported) continue;
      for (const d of stmt.declarationList.declarations) {
        if (!ts.isIdentifier(d.name) || !d.initializer) continue;
        const v = numericInit(d.initializer, contract);
        if (v !== null) out.set(d.name.text, v);
      }
    }
  }
  return out;
}

function numericInit(init, contract) {
  if (ts.isNumericLiteral(init)) return Number(init.text);
  if (ts.isPrefixUnaryExpression(init) && init.operator === ts.SyntaxKind.MinusToken
      && ts.isNumericLiteral(init.operand)) return -Number(init.operand.text);
  if (ts.isCallExpression(init) && ts.isIdentifier(init.expression)
      && init.expression.text === 'constant'
      && init.arguments.length === 1 && ts.isStringLiteral(init.arguments[0])) {
    const v = contract.get(init.arguments[0].text);
    return v === undefined ? null : v;
  }
  return null;
}

const parsed = new Map();
function parse(f) {
  if (parsed.has(f)) return parsed.get(f);
  let sf = null;
  try {
    const text = readFileSync(path.join(ROOT, f), 'utf8');
    sf = ts.createSourceFile(f, text, ts.ScriptTarget.Latest, true,
      f.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  } catch { sf = null; }
  parsed.set(f, sf);
  return sf;
}

/** Names a file can see: every import binding, plus its own const declarations. */
function namesInScope(sf, exported, contract) {
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
        const v = numericInit(d.initializer, contract);
        if (v !== null) scope.set(d.name.text, v);
      }
    }
  }
  return scope;
}

// ── Author-facing strings (folded) ───────────────────────────────────────────
// Folding `+` chains, template chunks and multi-line JSX whitespace is the whole
// reason this parses instead of grepping: Aurora's prose routinely splits a
// sentence's NUMBER from the words that qualify it across separate literals, so
// a literal-at-a-time predicate sees neither half.
const FACING_JSX_ATTRS = new Set([
  'title', 'label', 'placeholder', 'alt', 'aria-label', 'aria-description',
  'hint', 'help', 'tooltip', 'summary', 'caption', 'legend', 'noneLabel',
]);
const FACING_KEYS = new Set([
  'title', 'label', 'hint', 'help', 'message', 'description', 'placeholder',
  'summary', 'caption', 'text', 'note', 'detail', 'details', 'reason',
  'advisory', 'tooltip', 'noneLabel', 'shiftATitle', 'shiftBTitle', 'phaseTitle',
]);

function foldString(node) {
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) return node.text;
  if (ts.isJsxExpression(node) && node.expression) return foldString(node.expression);
  if (ts.isParenthesizedExpression(node)) return foldString(node.expression);
  if (ts.isTemplateExpression(node)) {
    // A `${}` hole is replaced by a space: whatever it interpolates is DERIVED,
    // and must never be read as a typed number.
    return node.templateSpans.reduce((acc, s) => `${acc} ${s.literal.text}`, node.head.text);
  }
  if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.PlusToken) {
    const l = foldString(node.left), r = foldString(node.right);
    return l === null || r === null ? null : l + r;
  }
  if (ts.isConditionalExpression(node)) {
    const a = foldString(node.whenTrue), b = foldString(node.whenFalse);
    if (a === null && b === null) return null;
    return [a, b].filter(s => s !== null).join(' ‖ ');
  }
  return null;
}

// ISO DATES ARE NOT BOUNDS, and they are the single biggest source of false
// positives measured on this tree: `2026-08-29` inside one collision-tool
// description yielded a bare "8" that matched BGANIM_PHASE_BANKS. aeon measured
// the same thing on their tree (23 of 82 candidates were dates). Masked before
// any digit test, alongside the `${…}` holes.
const maskDates = (s) => s.replace(/\d{4}-\d{2}-\d{2}/g, '<date>');
const normalise = (s) => maskDates(s.replace(/\s+/g, ' ').trim());
// A STANDALONE integer. `8x8`, `4bpp` and `16px` are compound format tokens, not
// restated bounds, so a digit glued to a letter or a dot never counts.
const INT_RE = /(?<![\w.$])(\d+)(?![\w.])/g;

function facingStrings(sf) {
  const out = [];
  const push = (node, where) => {
    const folded = foldString(node);
    if (folded === null) return;
    const text = normalise(folded);
    if (text.length < 20) return;
    out.push({ line: sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1, where, text });
  };
  (function visit(node) {
    if (ts.isJsxAttribute(node) && node.initializer
        && FACING_JSX_ATTRS.has(node.name.getText(sf))) {
      push(node.initializer, `${node.name.getText(sf)}=`);
    } else if (ts.isPropertyAssignment(node)) {
      const key = ts.isIdentifier(node.name) || ts.isStringLiteral(node.name) ? node.name.text : null;
      if (key && FACING_KEYS.has(key)) push(node.initializer, `${key}:`);
    } else if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)
               && node.expression.name.text === 'describe' && node.arguments.length === 1) {
      // `z.number().describe('…')` IS author-facing: it is the parameter
      // documentation an agent reads on the MCP surface, and it is where the
      // band geometry rule was typed out in full while the sibling `description`
      // keys were being derived. A key-name population misses it entirely.
      push(node.arguments[0], 'describe()');
    } else if (ts.isJsxText(node)) {
      const text = normalise(node.text);
      if (text.length >= 20) {
        out.push({ line: sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1, where: 'jsx text', text });
      }
    }
    ts.forEachChild(node, visit);
  })(sf);
  return out;
}

// ── Run ──────────────────────────────────────────────────────────────────────
const files = execFileSync('git', ['ls-files', '--', 'src'], { cwd: ROOT, encoding: 'utf8' })
  .split('\n').filter(Boolean)
  .filter(f => f.endsWith('.ts') || f.endsWith('.tsx'))
  .filter(f => !f.includes('__tests__') && !f.endsWith('.d.ts'));

const contract = contractValues();
if (contract.size === 0) {
  console.error('check-prose-constants: the vendored bganim contract yielded no constants, so '
    + 'the gate cannot run. An empty run is NOT a pass.');
  process.exit(2);
}
const exported = exportedNumbers(files, contract);

const findings = [];
const usedExemptions = new Set();
for (const f of files) {
  const sf = parse(f);
  if (!sf) continue;
  const scope = namesInScope(sf, exported, contract);
  if (scope.size === 0) continue;
  const byValue = new Map();
  for (const [name, value] of scope) {
    if (!byValue.has(value)) byValue.set(value, []);
    byValue.get(value).push(name);
  }
  for (const s of facingStrings(sf)) {
    for (const m of s.text.matchAll(INT_RE)) {
      const v = Number(m[1]);
      if (v < 2 || !byValue.has(v)) continue;
      const exemption = EXEMPT.findIndex(e => e.file === f && e.value === v && e.match.test(s.text));
      if (exemption >= 0) { usedExemptions.add(exemption); continue; }
      findings.push({ file: f, line: s.line, where: s.where, value: v,
        names: byValue.get(v), text: s.text });
    }
  }
}

// Dedupe: one row per (site, value), however many times the digit repeats.
const seen = new Set();
const rows = findings.filter(r => {
  const k = `${r.file}:${r.line}:${r.value}`;
  if (seen.has(k)) return false;
  seen.add(k);
  return true;
});

const staleExemptions = EXEMPT.map((e, i) => [e, i]).filter(([, i]) => !usedExemptions.has(i));

if (rows.length === 0 && staleExemptions.length === 0) {
  console.log(`check-prose-constants: ${files.length} source files, `
    + `${exported.size} named numeric constants, 0 re-typed in author-facing prose.`);
  process.exit(0);
}

for (const r of rows) {
  console.error(`${rel(path.join(ROOT, r.file))}:${r.line}  [${r.where}]`);
  console.error(`  ${JSON.stringify(r.text.length > 200 ? `${r.text.slice(0, 200)}…` : r.text)}`);
  console.error(`  types ${r.value}, which this module already has as ${r.names.join(' / ')}.`);
  console.error('  Interpolate the constant, or add an EXEMPT row saying why the number is not that one.');
  console.error('');
}
for (const [e] of staleExemptions) {
  console.error(`STALE EXEMPTION: ${e.file} ${e.value} ${e.match} matches nothing. `
    + 'A permission with no live subject has outlived its reason; delete the row.');
}
console.error(`check-prose-constants FAILED: ${rows.length} re-typed constant(s) in author-facing prose`
  + `${staleExemptions.length ? `, ${staleExemptions.length} stale exemption(s)` : ''}.`);
process.exit(1);
