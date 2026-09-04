#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════════════
// check-cited-paths — a comment must not point at a file that is not there
// ═══════════════════════════════════════════════════════════════════════════
//
//     npm run check:cited-paths        (and inside `npm test`)
//
// WHY THIS EXISTS. On 2026-09-03 this repo fixed six comments that were worse
// than their own absence — each looked like care, and each would have talked a
// maintainer into a wrong move. One of the six is mechanically checkable and is
// what this file is for: `BandPresetPanel.tsx` and `effects-preset.ts` both
// cited a gate file `effects-preset-wording.test.ts` **that has never existed**
// (the real gate is `band-preset-wording.test.ts`). A reader who went to check
// the claim found nothing and could not tell a wrong filename from an absent
// gate. It survived weeks because nobody re-reads a header that reads as care.
//
// A CITATION IS A PROMISE THAT SOMETHING IS THERE. This gate keeps only that
// promise. It does not read the cited file, and it cannot tell whether the file
// says what the comment claims.
//
// ─── WHY A NEW FILE AND NOT A RULE IN AN EXISTING GATE ─────────────────────
//
// Two gates already scan source for path-shaped strings, and NEITHER can carry
// this rule:
//
//   · `scripts/check-peer-path-literals.mjs` is the closest, and its central
//     thesis is the exact inverse of this one — "comments are records,
//     executable lines are coupling". It calls `stripComments()` before every
//     rule runs, so the text this gate reads is the text that one deletes
//     first. Bolting a comments-only rule into it would also falsify its own
//     summary line ("no EXECUTABLE line …"), which is the one sentence a reader
//     of that gate trusts.
//   · `scratchpad/check-harness-guards.mjs` is scoped to launcher safety in
//     `scratchpad/` and would not reach `src/` at all.
//
// So this is a separate instrument with its own population, its own extraction
// (comments, not code) and its own summary line. It is wired into the same
// `npm test` chain as both of them, next to them, in `package.json`.
//
// ─── WHAT IT COVERS ────────────────────────────────────────────────────────
//
//   R1 `cited-path-missing` — a comment naming a path rooted at one of THIS
//      repo's own top-level source directories (`src/`, `test/`, `scripts/`,
//      `scratchpad/`) that is not on disk.
//   R2 `cited-file-missing` — a comment naming a bare source FILENAME
//      (`…​.ts`/`.tsx`/`.mjs`/`.mts`) that matches no file under those roots.
//      R2 exists because the defect that prompted this gate was spelled that
//      way: `effects-preset-wording.test.ts` — which does not exist — with no
//      directory in front of it at all.
//
// ─── WHAT IT DOES NOT COVER, STATED RATHER THAN LEFT TO BE FOUND ───────────
//
// A gate that hides its own coverage is the same defect it polices, so every
// exclusion below is deliberate, and each one is a hole:
//
//   1. PEER PATHS ARE NEVER FAILED ON. `aeon`, `sigil`, `empyrean`, `seraph`,
//      `oracle` and `s1disasm` are sibling checkouts that MAY NOT BE PRESENT
//      (an agent worktree usually has none of them), so "not on disk" here says
//      nothing about whether the citation is right. They are not silently
//      dropped: every comment line naming one is COUNTED and the count is on
//      the summary line, so a reader can see how much of the file's citation
//      traffic this gate declined to judge.
//   2. `docs/…` IS NOT CHECKED AT ALL, and this is the biggest hole. Every repo
//      in the suite has a `docs/`, and this repo's comments cite the PEERS' by
//      exactly that spelling — `docs/DEFERRED_WORK.md` and `docs/BUGS.md` in
//      four files are aeon's, `docs/LOOP_CROSSOVER_ENCODING.md` is aeon's. The
//      token alone cannot say whose tree it means, so judging it would fail
//      correct citations. These are counted with the peer citations above.
//   3. MARKDOWN IS NOT SCANNED. `docs/plans/*`, `docs/reviews/*` and the
//      ROADMAP are DATED RECORDS — a 2026-05-02 plan naming a file that was
//      renamed in June is accurate about its own moment. (Measured: 387
//      distinct rooted paths in this repo's markdown do not resolve, nearly all
//      of that shape.) The rule this gate enforces is for LIVE instructions to
//      a maintainer, which is what a source comment is.
//   4. ONLY WHOLE-LINE COMMENTS ARE READ — a line whose first non-blank
//      characters are `//`, `/*`, `*`, `*/` (or `#` in `.py`/`.sh`). A trailing
//      comment after code on the same line is NOT read. That is a real loss,
//      taken on purpose: separating a trailing `//` from a division sign or a
//      regex needs the tokenizer whose desync produced two of 2026-09-03's
//      other defects, and a citation gate that can be blinded by an apostrophe
//      is not worth having. Judging each line on its own cannot desync.
//   5. A LINE NUMBER IS NOT CHECKED. `effects-preset.ts:58` passes on the file
//      alone; the `:58` may have drifted years ago.
//   6. A SYMBOL NAME IS NOT CHECKED. `presetLimitsShort()` in a comment is
//      invisible here, and so is a renamed export.
//   7. A PATH BUILT AT RUNTIME is invisible — this reads comments, not code.
//   8. GIT-IGNORED PATHS PASS WITHOUT BEING CHECKED. A cited path git ignores
//      is generated or local output (`scratchpad/shots-*/`, the hardlinked aeon
//      fixtures, the one-off probes named individually in `.gitignore`), and it
//      is legitimately absent in a fresh checkout. Counted on the summary line.
//   9. PLACEHOLDERS ARE SKIPPED: a token containing — or immediately followed
//      by — `<`, `>`, `*`, `?` or `…`, and a token that ends a line whose last
//      character is `-` (a path hyphen-wrapped onto the next line).
//  10. R2 ONLY JUDGES A COMPOUND NAME: the stem must contain `-`, `_` or an
//      uppercase letter. `emit.ts`, `test.ts`, `proof.mjs`, `app.mjs` and
//      `classic.ts` are used in this repo's comments as generic nouns, not
//      citations, and there is no way to tell them apart from a real one-word
//      filename. So a citation to a genuinely one-word module — `guides.ts` —
//      IS NOT CHECKED. R1 still covers it when it is written as a path.
//  11. A LINE MAY DECLARE ITS OWN ABSENCE and is then not judged — see
//      `ABSENCE_MARKERS`. The best repair for a fabricated citation keeps the
//      wrong name and says it is wrong, and a gate that taxed that repair would
//      be paid in deleted history. The hole is that a marker silences EVERY
//      in-repo citation on its line, the accidental one included.
//
// ─── LOUD ON UNMEASURABLE ──────────────────────────────────────────────────
//
// Anything that would make this run judge an unknown set of files exits 2 with
// COULD NOT MEASURE, never 0: an unreadable source, a `git` that will not
// answer, a root that is not a directory, an empty population, a population
// that yields no citations at all (which would mean the comment reader broke),
// a canary that stopped firing, and an EXEMPTION THAT NO LONGER MATCHES
// ANYTHING — a stale exemption is precisely the artifact this file polices.

import { readdirSync, readFileSync, existsSync, statSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, relative } from 'node:path';

import { AURORA_DIR, SUITE_PEERS } from '../test/support/sibling-root.mjs';

const PREFIX = 'check-cited-paths';
const ROOT = AURORA_DIR;

/** This repo's own source roots — the only prefixes R1 will judge. */
const ROOTS = ['src', 'test', 'scripts', 'scratchpad'];

/** Files whose comments are read. */
const EXTS = ['.ts', '.tsx', '.mjs', '.mts', '.py', '.sh'];

/** Suffixes R1 will append to an extensionless token before calling it absent. */
const MODULE_EXTS = ['.ts', '.tsx', '.mjs', '.mts', '.js', '.py', '.sh'];

/** Extensions R2 recognises as a bare source filename. */
const BARE_EXTS = ['ts', 'tsx', 'mjs', 'mts'];

function die(msg) {
  console.error(`${PREFIX}: COULD NOT MEASURE — ${msg}`);
  process.exit(2);
}

// ---------------------------------------------------------------------------
// EXTRACTION — whole-line comments only. See exclusion 4 for why this is not a
// tokenizer, and what that costs.
// ---------------------------------------------------------------------------

const HASH_DIALECT = ['.py', '.sh'];

/** Is this trimmed line a comment, in this file's dialect? */
function isCommentLine(trimmed, hash) {
  if (hash) return trimmed.startsWith('#');
  return trimmed.startsWith('//') || trimmed.startsWith('/*') || trimmed.startsWith('*');
}

// ---------------------------------------------------------------------------
// THE TWO PATTERNS.
//
// The lookbehind is what keeps a peer's tree out of R1: `../aeon/src/foo.ts`
// and `oracle/src/main.rs` both have a `/` immediately before `src`, so neither
// matches. It also excludes `…test.ts` (a vitest banner quoted in two headers)
// and `*-harness.mjs` from R2.
// ---------------------------------------------------------------------------

const BEFORE = String.raw`(?<![\w/.\-<>*?…])`;
const PATH_RE = new RegExp(`${BEFORE}((?:${ROOTS.join('|')})/[\\w./@\\-]*[\\w])`, 'g');
const BARE_RE = new RegExp(`${BEFORE}([\\w][\\w.@\\-]*\\.(?:${BARE_EXTS.join('|')}))(?![\\w/\\-])`, 'g');

/**
 * Characters that make a token a shape rather than a path (exclusion 9).
 * `PLACEHOLDER_AFTER` is tried against the REST OF THE LINE, and allows one
 * intervening `-`, because the capture stops at a word character: in
 * `scratchpad/fill-<mode>.json` and `composer-priority-*.test.ts` the token
 * ends before the hyphen and the shape character is two positions on.
 */
const PLACEHOLDER_IN = /[<>*?…]/;
const PLACEHOLDER_AFTER = /^-?[<>*?…]/;

/**
 * A LINE MAY DECLARE ITS OWN ABSENCE, and then it is not judged (exclusion 11).
 *
 * The best repair for a fabricated citation keeps the wrong name and says it is
 * wrong — that is what O79 wrote into `BandPresetPanel.tsx` and
 * `effects-preset.ts`, and it is why the next reader does not re-fabricate it.
 * Without this the gate would tax exactly the repair it wants, and the cheapest
 * way to satisfy it would be to DELETE the history, which is worse than the
 * defect.
 *
 * ⚠ THE HOLE, stated: a marker silences every in-repo citation ON THAT LINE,
 * including one that is absent by accident. Write the correct name on its own
 * line. The marker must be on the same line as the token — it cannot be
 * smuggled in from the paragraph above.
 */
const ABSENCE_MARKERS = [
  'has never existed', 'have never existed', 'never has been', 'never existed',
  'does not exist', 'do not exist', 'there is no ', 'no such file',
];
function declaresAbsence(trimmed) {
  const low = trimmed.toLowerCase();
  return ABSENCE_MARKERS.some((m) => low.includes(m));
}

/** R2 only judges a compound name (exclusion 10). */
function isCompoundStem(base) {
  const stem = base.slice(0, base.indexOf('.'));
  return /[-_]/.test(stem) || /[A-Z]/.test(stem);
}

/**
 * Citations this gate declines to judge, counted so the decline is visible.
 * A peer name followed by `/`, or a bare `docs/` (exclusions 1 and 2).
 */
const NOT_JUDGED_RE = new RegExp(
  `(?<![\\w/.\\-])(?:${[...SUITE_PEERS, 'docs', 'engine', 'tools', 'games'].join('|')})/`,
);

/** Every citation on one comment line, as {rule, token}. */
function citations(trimmed) {
  const out = [];
  // A path hyphen-wrapped onto the next line: the token is followed by a `-`
  // that is the LAST character of the line. The capture stops at a word
  // character, so the hyphen is `after`, not part of the token.
  const wrapped = (end) => trimmed[end] === '-' && end === trimmed.length - 1;
  for (const m of trimmed.matchAll(PATH_RE)) {
    const tok = m[1].replace(/[.,;:)\]}]+$/, '');
    const end = m.index + m[1].length;
    const after = trimmed.slice(end);
    if (PLACEHOLDER_IN.test(tok) || PLACEHOLDER_AFTER.test(after)) continue;
    if (wrapped(end)) continue;
    out.push({ rule: 'cited-path-missing', token: tok });
  }
  for (const m of trimmed.matchAll(BARE_RE)) {
    const tok = m[1];
    const end = m.index + tok.length;
    const after = trimmed.slice(end);
    if (PLACEHOLDER_IN.test(tok) || PLACEHOLDER_AFTER.test(after)) continue;
    if (wrapped(end)) continue;
    if (!isCompoundStem(tok)) continue;
    out.push({ rule: 'cited-file-missing', token: tok });
  }
  return out;
}

// ---------------------------------------------------------------------------
// EXEMPTIONS — deliberate citations to something that is not there.
//
// Every entry is `{file, token, why}` and every entry MUST STILL FIRE: an
// exemption whose citation has been repaired or deleted fails this run, with
// the line to remove. That is not tidiness. An exemption list is itself a
// helpful-looking artifact, and one describing a citation nobody writes any
// more is exactly the class of thing this gate exists to stop.
//
// The bar for adding a row: the comment is RIGHT to name something absent —
// a worked example, a counterfactual, a quotation of a red run, or a statement
// about where code came from. "I could not find the real name" is not on that
// list; that is a finding, not an exemption.
// ---------------------------------------------------------------------------

const EXEMPT = [
  {
    file: 'scripts/check-peer-path-literals.mjs',
    token: 'test/support/sibling-root-RENAMED.mjs',
    why: 'the sentence\'s own subject is a file that is deliberately NOT readable — '
      + 'it is the worked example of what that gate does when its resolver is renamed',
  },
  {
    file: 'scripts/check-test-collection.mjs',
    token: 'src/renderer/foo.test.ts',
    why: 'a worked example of a path the collection pattern would miss, not a citation',
  },
  {
    file: 'scripts/check-test-collection.mjs',
    token: 'scratchpad/x.test.ts',
    why: 'a worked example of a path outside src/ and test/, not a citation',
  },
  {
    file: 'scratchpad/check-harness-guards.mjs',
    token: 'scratchpad/x.mjs',
    why: 'a worked example of the three spellings a shell dispatch can use for the '
      + 'same file, quoted beside two more that are also not files',
  },
  {
    file: 'src/renderer/components/shared/map-status-model.ts',
    token: 'ClassicProjectView.tsx',
    why: 'the pre-re-home classic bar, deleted from this repo; the sentence is about '
      + 'what the LEGACY bar drew, so the name is the point',
  },
  {
    file: 'src/renderer/providers/__tests__/map-status-classic.test.ts',
    token: 'ClassicProjectView.tsx',
    why: 'same deleted legacy bar, same reason',
  },
  {
    file: 'src/core/project/aeon/load.ts',
    token: 'src/renderer/hooks/load-collision.ts',
    why: 'the file this module was ported FROM, deleted by that port; the sentence '
      + 'is a provenance record, not a pointer',
  },
  {
    file: 'src/core/project/aeon/load.ts',
    token: 'load-collision.ts',
    why: 'the same provenance record, spelled without its directory',
  },
];

function exemptionFor(rel, token) {
  return EXEMPT.find((e) => e.file === rel && e.token === token);
}

// ---------------------------------------------------------------------------
// RESOLUTION.
// ---------------------------------------------------------------------------

/** Does a rooted token name something on disk (file, directory, or module)? */
function pathResolves(token) {
  if (existsSync(join(ROOT, token))) return true;
  return MODULE_EXTS.some((x) => existsSync(join(ROOT, token + x)));
}

// ---------------------------------------------------------------------------
// THE PIPELINE, run over a set of {rel, src} — the canaries go through the
// identical function, which is the only reason their green is worth anything.
// ---------------------------------------------------------------------------

/**
 * @param sources   [{rel, text}]
 * @param resolveP  (token) => boolean   — R1
 * @param resolveB  (base)  => boolean   — R2
 * @returns {hits, notJudged, tokens}
 */
function scan(sources, resolveP, resolveB) {
  const hits = [];
  let notJudged = 0;
  let tokens = 0;
  let declared = 0;
  for (const { rel, text } of sources) {
    const hash = HASH_DIALECT.some((x) => rel.endsWith(x));
    text.split('\n').forEach((raw, i) => {
      const trimmed = raw.trim();
      if (!isCommentLine(trimmed, hash)) return;
      if (NOT_JUDGED_RE.test(trimmed)) notJudged++;
      if (declaresAbsence(trimmed)) { declared += citations(trimmed).length; return; }
      for (const c of citations(trimmed)) {
        tokens++;
        const ok = c.rule === 'cited-path-missing' ? resolveP(c.token) : resolveB(c.token);
        if (!ok) hits.push({ file: rel, line: i + 1, ...c, text: trimmed.slice(0, 150) });
      }
    });
  }
  return { hits, notJudged, tokens, declared };
}

// ---------------------------------------------------------------------------
// GUARD 1 — the canaries, through the identical pipeline, in both dialects.
//
// Every token below is DERIVED, and the absent ones are asserted absent before
// they are used: a canary that accidentally names a real file would make this
// guard pass while proving nothing.
// ---------------------------------------------------------------------------

const CANARY_ABSENT_PATH = `${ROOTS[0]}/__check-cited-paths-canary__/absent.ts`;
const CANARY_ABSENT_HASH = `${ROOTS[3]}/__check-cited-paths-canary__/absent.py`;
const CANARY_ABSENT_BASE = '__check-cited-paths-canary__.test.ts';
for (const t of [CANARY_ABSENT_PATH, CANARY_ABSENT_HASH]) {
  if (existsSync(join(ROOT, t))) die(`the canary path ${t} EXISTS on disk, so it cannot prove a rule fires`);
}

/** A path that really is there, taken from the population rather than typed. */
function canarySources(present, presentBase) {
  return [
    { rel: 'canary/positive.ts', text: `// the gate is ${CANARY_ABSENT_PATH}, honest\n` },
    { rel: 'canary/positive.py', text: `# see ${CANARY_ABSENT_HASH} for the rule\n` },
    { rel: 'canary/positive-bare.ts', text: ` * checked by \`${CANARY_ABSENT_BASE}\`\n` },
    // Negatives. Each is a way this gate could go loud on something correct.
    { rel: 'canary/negative-present.ts', text: `// see ${present} for the rule\n` },
    { rel: 'canary/negative-present-bare.ts', text: `// see \`${presentBase}\` for the rule\n` },
    { rel: 'canary/negative-code.ts', text: `const p = '${CANARY_ABSENT_PATH}';\n` },
    { rel: 'canary/negative-docs.ts', text: '// see docs/DEFERRED_WORK.md, which is aeon\'s\n' },
    { rel: 'canary/negative-peer.ts', text: '// see ../aeon/src/absent-canary.ts and engine/absent-canary.ts\n' },
    { rel: 'canary/negative-placeholder.ts', text: `// see ${ROOTS[3]}/<name>-harness.mjs and x-*.test.ts\n` },
    { rel: 'canary/negative-generic.ts', text: '// the probe writes its own emit.ts beside proof.mjs\n' },
    { rel: 'canary/negative-wrapped.ts', text: `// see ${ROOTS[0]}/renderer/some-very-long-\n// name.ts\n` },
  ];
}

// ---------------------------------------------------------------------------
// GUARD 2 — a population to judge.
// ---------------------------------------------------------------------------

const files = [];
for (const r of ROOTS) {
  const p = join(ROOT, r);
  try {
    if (!statSync(p).isDirectory()) throw new Error(`${p} is not a directory`);
  } catch (e) {
    die(`cannot read ${p}: ${e.message}`);
  }
  const walk = (dir) => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      if (e.name === 'node_modules' || e.name === 'dist') continue;
      const q = join(dir, e.name);
      if (e.isDirectory()) walk(q);
      else if (EXTS.some((x) => e.name.endsWith(x))) files.push(q);
    }
  };
  walk(p);
}
if (files.length === 0) die(`no ${EXTS.join('/')} file under ${ROOTS.join(', ')}. Nothing was examined.`);

/**
 * Drop the files git IGNORES — same rule and same reason as
 * check-peer-path-literals: a harness that has materialised a vendored copy of
 * a peer repo must not be able to change this gate's colour. Untracked-but-not-
 * ignored files ARE scanned; a brand-new comment is exactly what this catches.
 */
function ignoredSet(paths) {
  if (paths.length === 0) return new Set();
  try {
    const listed = execFileSync('git', ['check-ignore', '--stdin'], {
      cwd: ROOT,
      input: paths.join('\n'),
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'ignore'],
      maxBuffer: 64 * 1024 * 1024,
    });
    return new Set(listed.split('\n').filter(Boolean));
  } catch (e) {
    if (e.status === 1) return new Set();
    die(`git check-ignore failed (${e.message}) — this run cannot tell generated output `
      + 'from source, so it judges an unknown set of files');
    return new Set();
  }
}

const relFiles = files.map((f) => relative(ROOT, f));
const ignoredFiles = ignoredSet(relFiles);
const sources = [];
for (const rel of relFiles.sort()) {
  if (ignoredFiles.has(rel)) continue;
  try {
    sources.push({ rel, text: readFileSync(join(ROOT, rel), 'utf8') });
  } catch (e) {
    die(`cannot read ${rel}: ${e.message}`);
  }
}
if (sources.length === 0) die(`every ${EXTS.join('/')} file under ${ROOTS.join(', ')} is git-ignored.`);

/** Basenames present under the four roots — the filesystem, not `git ls-files`. */
const presentBases = new Set(relFiles.map((f) => f.split('/').pop()));

// Two derived, definitely-present canary tokens.
const presentPath = relFiles.find((f) => f.endsWith('.ts')) ?? relFiles[0];
const presentBase = relFiles.map((f) => f.split('/').pop())
  .find((b) => b.endsWith('.ts') && isCompoundStem(b));
if (!presentPath || !presentBase) die('found no present .ts path/name to build a negative canary from');

// ---- run the canaries first: a broken reader must not be able to print OK ---
const canaryRun = scan(canarySources(presentPath, presentBase), pathResolves, (b) => presentBases.has(b));
const canaryFired = new Set(canaryRun.hits.map((h) => h.rule));
for (const id of ['cited-path-missing', 'cited-file-missing']) {
  if (!canaryFired.has(id)) die(`rule \`${id}\` did not fire on its canary — it matches nothing any more, `
    + 'so a green run below would be evidence of nothing');
}
const falsePositives = canaryRun.hits.filter((h) => h.file.startsWith('canary/negative'));
if (falsePositives.length) {
  die(`${falsePositives.length} negative canary/canaries fired — this gate would now fail correct comments:\n`
    + falsePositives.map((h) => `      ${h.file}:${h.line} ${h.rule} ${h.token}`).join('\n'));
}
if (canaryRun.notJudged !== 2) {
  die(`the not-judged counter saw ${canaryRun.notJudged} of the 2 peer/docs canary lines — `
    + 'the summary line\'s coverage figure cannot be trusted');
}

// ---- the real run ---------------------------------------------------------
const run = scan(sources, pathResolves, (b) => presentBases.has(b));
if (run.tokens === 0) {
  die(`not one citation was found in ${sources.length} files. The comment reader is broken; `
    + 'a run that reads no comments cannot say that no comment is wrong.');
}

// A cited path git ignores is generated or local output (exclusion 8).
const ignoredCites = ignoredSet([
  ...new Set(run.hits.flatMap((h) => (h.rule === 'cited-path-missing'
    ? [h.token, `${h.token}/`]
    : ROOTS.map((r) => `${r}/${h.token}`)))),
]);
const isIgnoredCite = (h) => (h.rule === 'cited-path-missing'
  ? ignoredCites.has(h.token) || ignoredCites.has(`${h.token}/`)
  : ROOTS.some((r) => ignoredCites.has(`${r}/${h.token}`)));

const generated = run.hits.filter(isIgnoredCite);
const judged = run.hits.filter((h) => !isIgnoredCite(h));
const usedExemptions = new Set();
const violations = [];
for (const h of judged) {
  const e = exemptionFor(h.file, h.token);
  if (e) { usedExemptions.add(e); continue; }
  violations.push(h);
}

const deadExemptions = EXEMPT.filter((e) => !usedExemptions.has(e));

console.log(
  `${PREFIX}: read the whole-line comments of ${sources.length} ${EXTS.join('/')} file(s) under `
  + `${ROOTS.join(', ')} (${ignoredFiles.size} git-ignored file(s) excluded) and found `
  + `${run.tokens} in-repo citation(s) against 2 rule(s) — cited-path-missing, cited-file-missing `
  + '(both fired on their canaries; 8 negative canaries silent).\n'
  + `${PREFIX}: aurora ${ROOT}\n`
  + `${PREFIX}: NOT JUDGED — ${run.notJudged} comment line(s) cite a peer checkout `
  + `(${SUITE_PEERS.join('/')}) or a bare docs/ path, which this gate cannot resolve and never `
  + `fails on; ${generated.length} citation(s) resolved to git-ignored output; `
  + `${run.declared} citation(s) sat on a line declaring its own absence `
  + `(${ABSENCE_MARKERS.map((m) => `"${m.trim()}"`).join(', ')}); `
  + `${EXEMPT.length} written exemption(s) applied.`,
);

if (deadExemptions.length) {
  console.error(`\n${PREFIX}: FAIL — ${deadExemptions.length} exemption(s) no longer describe any `
    + 'citation in the tree. A stale exemption is the artifact this gate exists to stop; delete '
    + `the entry from EXEMPT in ${relative(ROOT, new URL(import.meta.url).pathname)}:\n`
    + deadExemptions.map((e) => `    ${e.file}  →  ${e.token}`).join('\n'));
}

if (violations.length === 0 && deadExemptions.length === 0) {
  console.log(`${PREFIX}: OK — every in-repo path and source filename named in a comment is on disk.`);
  process.exit(0);
}

if (violations.length) {
  console.error(
    `\n${PREFIX}: FAIL — ${violations.length} comment(s) cite something that is not there:\n`
    + violations.map((v) => `    ${v.file}:${v.line}  [${v.rule}]  ${v.token}\n        ${v.text}`).join('\n')
    + '\n\n  Each is a promise a reader cannot keep. Repair the name against the tree, or — if the\n'
    + '  comment is RIGHT to name something absent (a worked example, a counterfactual, a quoted\n'
    + `  red run, a provenance record) — add a row to EXEMPT with the reason.`,
  );
}
process.exit(1);
