#!/usr/bin/env node
// NO EM DASH AND NO EN DASH IN A COMPONENT'S USER-FACING TEXT.
//
// Owner ruling, 2026-09-05, all tools: no U+2014 and no U+2013 in any user
// facing text, labels, panel prose, tooltips, refusals or generated help.
// `src/**/*.tsx` was swept to zero that day; this keeps it there.
//
// ── WHAT IT COUNTS, AND WHY THE POPULATION IS THE HARD PART ────────────────
//
// The sweep's first count of this bucket was 145 and it was WRONG, because it
// scanned STRING LITERALS. In a .tsx file a great deal of the prose a user
// reads is JSX CHILDREN, which are not string literals at all. The real figure
// was 209 literal characters plus one spelled as a `—` escape, which a
// grep for the character cannot see and which renders identically. So this gate
// walks the TypeScript AST and counts every dash inside a StringLiteral, a
// JsxText, or any part of a template literal, in BOTH spellings.
//
// ── WHAT IT DELIBERATELY DOES NOT COUNT ───────────────────────────────────
//
// COMMENTS. This repo's comments are its design record and carry 1,576 dashes
// in this bucket alone. They are not user-facing, the ruling is about text a
// person reads in the app, and a gate that failed on them would be asking for
// the record to be degraded.
//
// THE OTHER BUCKETS. `src/**/*.ts` (providers, core, stores) and the tests were
// separate passes on 2026-09-05 and were NOT this parcel's. Scoping the gate to
// the bucket that is actually clean is what keeps it green today instead of red
// on work nobody has done yet. When those buckets are swept, widen GLOB here
// and say so in this docblock.
//
// Run: node scripts/check-tsx-dashes.mjs   (also in the `npm test` chain)

import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const require = createRequire(path.join(ROOT, 'package.json'));
const ts = require('typescript');

const DASH = /[—–]|\\u201[34]/g;

/** Tracked .tsx under src/, from git rather than a filesystem walk. */
function files() {
  return execFileSync('git', ['-C', ROOT, 'ls-files', '--', 'src/**/*.tsx'], { encoding: 'utf8' })
    .split('\n').filter(Boolean);
}

/** Byte ranges of every comment, found by walking to the leaf tokens. */
function commentRanges(text, sf) {
  const out = [];
  const add = (a) => { if (a) for (const c of a) out.push([c.pos, c.end]); };
  const walk = (node) => {
    const kids = node.getChildren(sf);
    if (kids.length === 0) {
      add(ts.getLeadingCommentRanges(text, node.pos));
      add(ts.getTrailingCommentRanges(text, node.end));
      return;
    }
    for (const k of kids) walk(k);
  };
  walk(sf);
  return out;
}

const findings = [];
for (const rel of files()) {
  const text = readFileSync(path.join(ROOT, rel), 'utf8');
  DASH.lastIndex = 0;
  if (!DASH.test(text)) continue;

  const sf = ts.createSourceFile(rel, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const comments = commentRanges(text, sf);
  const inComment = (off) => comments.some(([a, b]) => off >= a && off < b);

  DASH.lastIndex = 0;
  let m;
  while ((m = DASH.exec(text)) !== null) {
    const off = m.index;
    if (inComment(off)) continue;
    const { line, character } = sf.getLineAndCharacterOfPosition(off);
    const src = text.slice(text.lastIndexOf('\n', off) + 1, text.indexOf('\n', off) < 0 ? undefined : text.indexOf('\n', off));
    findings.push({ rel, line: line + 1, col: character + 1, spelling: m[0].length === 1 ? 'literal' : 'escape', src: src.trim().slice(0, 120) });
  }
}

const n = files().length;
if (findings.length === 0) {
  console.log(`check-tsx-dashes: OK — ${n} component file(s), no U+2014 or U+2013 in any string, `
    + 'template or JSX text (comments are out of scope and say so in this script).');
  process.exit(0);
}

console.error(`check-tsx-dashes: ${findings.length} dash(es) in user-facing component text, `
  + `across ${new Set(findings.map((f) => f.rel)).size} file(s) of ${n}.`);
console.error('An em dash does several different jobs and each wants a different repair: commas or');
console.error('brackets for an aside, a colon for an appositive, a full stop before a consequence,');
console.error('"to" for a range. Read the sentence and repair it; do not substitute blindly.');
for (const f of findings) {
  console.error(`  ${f.rel}:${f.line}:${f.col}  (${f.spelling})\n      ${f.src}`);
}
process.exit(1);
