#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════════════
// check-doc-citations — a REVIEW must not point at evidence a reader cannot open
// ═══════════════════════════════════════════════════════════════════════════
//
//     npm run check:doc-citations        (and inside `npm test`)
//
// WHY THIS EXISTS. `scripts/check-cited-paths.mjs` states the principle this
// file inherits — A CITATION IS A PROMISE THAT SOMETHING IS THERE — and then
// names, as its own exclusion 3, the population it does not read: markdown.
// `docs/reviews/*`, `docs/plans/*` and the ROADMAP are what the owner and every
// peer session actually read as the record, and nothing checked them at all.
//
// The defect that opened this row: a worktree prune on 2026-09-05 destroyed four
// screenshot directories cited by name in LANDED review documents. Each review
// says "the shots are here"; there is no here. The evidence is unrecoverable.
//
// ─── THE MEASUREMENT THAT SHAPED THE RULE, AND THE PREMISE IT KILLED ───────
//
// The row arrived with the claim that those four directories "were NOT
// gitignored, they were committable and simply not committed". THAT IS FALSE,
// and the correction is the whole design. Measured 2026-09-06 in this tree:
//
//     $ git check-ignore -v scratchpad/shots-bg-wrap/
//     .gitignore:10:scratchpad/shots*/    scratchpad/shots-bg-wrap/     (exit 0)
//     $ git check-ignore -v scratchpad/shots-bg-wrap      # no trailing slash
//                                                                       (exit 1)
//
// `scratchpad/shots*/` is a DIRECTORY-ONLY pattern, so git answers "not ignored"
// for a path it cannot see as a directory, and a deleted directory is exactly
// that. The row's exit 1 was a false zero produced by the absence it was
// investigating. The rule was added at c030e167 on 2026-08-15 with the comment
// "CDP harness screenshots — evidence for a run, not artefacts to keep", which
// is FIFTEEN DAYS BEFORE the earliest of the four reviews cited one. So the
// reviews did not fail to commit committable evidence; they cited a location
// this repo had already declared ephemeral, and `docs/captures/` (137 tracked
// files) is the durable half of the same convention.
//
// ⚠ THAT IS WHY EXCLUSION 8 OF check-cited-paths IS NOT PORTED. That gate lets a
// git-ignored citation pass unchecked, on the reasoning that ignored output is
// legitimately absent in a fresh checkout. Ported here it would silence ALL FOUR
// known positives and every one of their 39 siblings, because ignored-ness is
// not this defect's excuse, it IS this defect. See THE TRACKED RULE below.
//
// ─── THE SCALE, MEASURED, NOT ASSUMED ──────────────────────────────────────
//
// 272 tracked `.md` files under `docs/`; 5,086 tokens rooted at one of this
// repo's own top-level directories; 457 of them naming something absent from
// disk (179 distinct). Outside fenced blocks: 379 absent, 170 distinct. The
// dangling-evidence class alone is 43 citations across 30 documents naming a
// `scratchpad/shots*` path, not the four the row named.
//
// ⚠ MY OWN FIRST CENSUS WAS WRONG AND IS SUPERSEDED BY THE NUMBERS ABOVE. It
// omitted the after-token placeholder rule, so `scratchpad/shots-*/` produced
// the truncated token `scratchpad/shots` and 11 citations nobody wrote. Every
// count published before that fix is void, not just the next one.
//
// ─── WHAT IS BOUND: A RATCHET, PER LINE, ON COMMITTER TIME ─────────────────
//
// ~170 distinct pre-existing findings sit in LANDED documents, and "committed
// history is not retro swept" is a standing owner ruling. Switching the
// population on wholesale would make `npm test` red forever, which teaches
// people to ignore the suite. So this follows `scripts/check-ledger-timestamps.mjs`:
// grandfather everything introduced before an in-force instant, bind everything
// after it, AND PRINT THE GRANDFATHERED COUNT ON EVERY RUN.
//
// THE CUTOFF IS ON COMMITTER TIME, NOT ON ANYTHING THE DOCUMENT SAYS ABOUT
// ITSELF. Every review here opens with a `**Date** 2026-08-30` line, and a
// cutoff read off that field would let a document written today under an old
// date header land unjudged. The ledger gate's K4b case makes the identical
// argument about a backfilled `at`; `G5` below is its analogue here, and it is
// the only canary that can tell the two possible cutoffs apart.
//
// PER LINE, AND WHY NOT PER FILE. The unit is the LINE, keyed on the committer
// time of the commit `git blame` attributes it to.
//
//   · PER FILE ("once you touch a document, all of it is bound") is simpler and
//     needs no blame. It costs this: an author fixing one paragraph of a
//     2026-05 plan inherits 84 findings they did not write and cannot fix
//     without rewriting someone else's record. The cheapest way out of that is
//     to DELETE the old citations, which destroys exactly the history this row
//     exists to preserve, and it is the same trap check-cited-paths describes
//     when it explains why it does not tax a self-declared absence.
//   · PER LINE costs precision work — a blame call per file that has a finding,
//     and the understanding that a whole-file reflow (a prose rewrap, a
//     formatter) re-dates every line it moves and pulls the whole document into
//     scope at once. That is the honest failure mode, it is loud rather than
//     silent, and it is the correct answer anyway: a reflow that moves a line
//     IS a rewrite of it.
//
// A line git cannot attribute is IN SCOPE, never grandfathered: an untracked
// file, and a line modified in the working tree ("Not Committed Yet"). A new
// review is fully bound at the moment its author first runs the suite, which is
// the only moment the fix is cheap.
//
// ─── THE TRACKED RULE, AND WHY IT IS NOT "EXISTS ON DISK" ──────────────────
//
// A citation passes only if GIT TRACKS the path (or tracks something under it).
// Existence on disk is NOT enough. Two independent reasons, and the second is
// the load-bearing one:
//
//   1. Ruled by the hub. `docs/reviews/2026-08-30-o21-bg-wrap-visibility.md:5`
//      cites `scratchpad/shots-bg-wrap/` and says `(not committed)` in the same
//      breath. Its author knew. But an honest disclosure beside a path in a
//      permanent record is still a pointer to nothing: a disclosed dangling
//      reference, not an excused one. If the gate exempted that phrasing, every
//      author would learn the phrase and the gate would buy nothing. So there
//      is NO absence-marker exemption here, and check-cited-paths' exclusion 11
//      is deliberately not ported. That disclosure is evidence the convention
//      was already known to be broken, not a licence.
//   2. IT IS THE ONLY MACHINE-INDEPENDENT QUESTION. "Is it on disk" has a
//      different answer in the owner's tree, in an agent worktree and in a
//      fresh clone. Measured: this worktree reports 0 present-but-untracked
//      citations and the owner's tree reports ~307. check-cited-paths learned
//      this the expensive way, when a filesystem walk enumerated 5,821 files
//      where the repository held 1,257, and replaced the walk with a question
//      to git. A gate whose colour depends on which machine you are standing on
//      is not a gate. `docs/captures/` is the answer for anything a review
//      cites as evidence.
//
// ─── WHAT COUNTS AS A CITATION HERE ────────────────────────────────────────
//
// A token rooted at `src/`, `test/`, `scripts/`, `scratchpad/` or `docs/`, on a
// line outside a fenced block. `docs/` IS judged here, unlike in
// check-cited-paths, because in THIS population it is the commonest citation
// root: the reviews cite each other and the ROADMAP constantly.
//
// BACKTICKS ARE NOT REQUIRED, and that was decided by measurement rather than
// taste. 4,176 of the 4,219 non-fenced tokens (99.0%) are already inside an
// inline-code span or a link target, so requiring the markup would buy almost
// nothing; and of the 43 bare ones, 8 are absent and every one of those 8 is a
// real citation a reader would try to follow (`docs/EDITOR_RASTER_PRESETS.md`
// in four separate documents, `docs/AURORA_EFFECTS_SCHEMA.md`,
// `docs/OVERSEER-PROTOCOL.md`). Requiring markup would have cost five real
// findings and bought no precision. The markup is still MEASURED and reported,
// so the day that ratio changes is visible rather than assumed.
//
// ─── WHAT IS NOT JUDGED, COUNTED SO THE DECLINE IS VISIBLE ─────────────────
//
//  N1 A FENCED BLOCK. 867 tokens sit inside ``` or ~~~ fences here, 78 of them
//     absent. A fence in a review is a transcript, a command someone ran, a
//     file listing, or a quoted diff. `$ ls scratchpad/shots-bg-wrap/` inside a
//     fence is an accurate RECORD OF A COMMAND, and failing it would make the
//     gate demand that history be falsified. The extractor is fence-aware line
//     by line and the canary proves the fence closes, because a census earlier
//     today produced a meaningless number with an extractor that spanned one.
//  N2 A LINE THAT NAMES A SUITE PEER. `docs/BUGS.md` is aeon's,
//     `docs/OVERSEER-PROTOCOL.md` is empyrean's, and roughly half the absent
//     `docs/`-rooted tokens here are a peer's file, not ours. The token alone
//     cannot say whose tree it means. check-cited-paths declines the whole
//     `docs/` root for this reason; declining it here would gut the gate, so
//     the reasoning is ported rather than the rule: a citation whose line NAMES
//     ITS TREE (`aeon`, `sigil`, `empyrean`, `seraph`, `oracle`, `s1disasm`) is
//     not judged and is counted. That costs the author one word and is the
//     habit worth teaching.
//     ⚠ MEASURED COST, because a decline this wide has to be priced: 574 of the
//     4,219 non-fenced citations sit on a peer-named line. `aeon` alone accounts
//     for 343 of them and `aeon` in combination for most of the rest. THE HOLE
//     WORTH NAMING IS `oracle`: this repo's own OJZ is Oracle Jungle Zone, so a
//     line about aurora's own level art can decline itself by saying the zone's
//     name. That is 9 citations today, it is counted rather than silent, and it
//     is the price of a whole-line test that cannot parse English.
//  N3 A TOKEN THAT LEAVES THIS REPOSITORY (`../aeon/x.ts`, `/abs/x.ts`, or a
//     local root that climbs out like `src/../../aeon/x.ts`). Same rule and
//     same reason as check-cited-paths rule 1.
//  N4 A PLACEHOLDER: a token containing, or immediately followed by, `<`, `>`,
//     `*`, `?`, `…` or `...`, and a token hyphen-wrapped at end of line.
//  N5 AN ELLIPSIS-PREFIXED ROOTED PATH, `…/scratchpad/x` or `.../src/x.ts`. The
//     lookbehind already refuses these, because the character before the root is
//     a `/`. That refusal was read as a HOLE once (a row was opened on it, with
//     a planted positive proving the gate exits 0 on the shape), so it is now
//     declared and counted rather than left to be rediscovered.
//     ⚠ IT IS NOT A HOLE, and the measurement is the argument. 17 occurrences
//     here; 13 sit inside a fenced stack trace and are N1 anyway; 5 name
//     something absent. In 4 of those 5 the ellipsis elides an ABSOLUTE prefix,
//     not a repo-relative one: `docs/reviews/2026-08-27-guard-surface-gaps.md:76`
//     says a throwaway clone "was placed at `…/scratchpad/aeonwork/aeon`", which
//     is a path under a session temp directory and was never a path in this
//     repository. Resolving the remainder against the repo root would report
//     four findings that are not findings, out of five. The ellipsis is a
//     deliberate statement that the prefix has been withheld, so the gate cannot
//     know what the remainder is relative to, and declines to guess.
//     THE ONE GENUINE CASE, named because a decline with no cost is a decline
//     nobody checked: `docs/superpowers/plans/2026-08-14-plan5-overnight-report.md:142`
//     writes `…/scratchpad/shots-final/NOTES.md` where the ellipsis is decorative
//     and the path IS repo-relative. That line already carries its own marking,
//     EVIDENCE NOT RETAINED AND NO INSTRUMENT REBUILDS IT, so the record is
//     correct on a line this gate never judged.
//     ─ THE NARROW SUB-CASE, RAISED WITH THIS DECLINE AND NOW SETTLED AGAINST
//     IT: judge only an ellipsis path whose remainder resolves to a TRACKED
//     file. Declined, because IT CANNOT PRODUCE A FINDING. Tracked is this
//     gate's single rule AND its passing condition, so a rule gated on tracked
//     judges exactly the set that passes and yields zero by construction.
//     Measured 2026-09-06 in this tree: 12 of the 17 occurrences resolve to a
//     tracked path, all 12 would pass, and all 12 are fenced besides, so under
//     N1 the sub-case would not judge 12 paths and find nothing, it would judge
//     none at all.
//     ⚠ THE ARGUMENT THAT CAME WITH THAT DECLINE IS ONE CASE TOO STRONG, and
//     the correction is the part worth keeping. It continues: the rule only
//     bites the inverse case, an ellipsis path whose remainder is ABSENT, and
//     that is precisely the four false positives. IT IS NOT PRECISELY THOSE
//     FOUR. Five remainders here are absent, not four: the four that elide an
//     absolute prefix, plus the genuine case named above, which is
//     repo-relative and on which an inverse rule would raise a TRUE finding.
//     So the inverse rule is 4 false to 1 true, and 3 to 1 in prose, because
//     one of the four (`docs/reviews/2026-08-27-guard-transcription.md:58`) is
//     fenced and N1 takes it first.
//     ─ THE INVERSE SUB-CASE, which that correction raises and which is NOW
//     SETTLED AGAINST TOO (row CITATIONS-INVERSE-ELLIPSIS-RULE, measured
//     2026-09-06): judge an ellipsis path whose remainder is ABSENT. Shipped
//     today it prints exactly one finding and it is the true one, which is why
//     the idea looks good. IT IS DECLINED ANYWAY, and NOT for the date
//     arithmetic noted at the bottom of this entry. THE RULE IS UNDECIDABLE
//     FROM THE TEXT.
//     Whether the remainder resolves is the answer the rule is trying to
//     compute, so it cannot also be the rule's input, and nothing else in the
//     line supplies it. All five absent remainders begin with the SAME root
//     segment, `scratchpad/`, so the root carries no signal either. Three
//     candidate discriminators were tried against the whole corpus of 104
//     ellipsis paths (17 rooted, 87 not), and each one fails:
//
//       · A PEER NAME ON THE LINE (N2) catches three of the four. It misses on
//         the naming convention this corpus actually uses for aeon-derived
//         throwaway trees: PEER_RE ends on a `(?![\w-])`, so `aeon-fixture`,
//         `aeon-current` and `aeon-build-pin` are not peer names to it.
//       · A WRITTEN ABSOLUTE PREFIX (N3) catches the fourth, which spells its
//         session temp directory out before the ellipsis. It measures how much
//         of the path the author chose to type, not what the path means, and
//         this corpus writes the SAME REFERENT BOTH WAYS: with the prefix at
//         docs/reviews/2026-08-27-screen-frame-guides.md:270, and without it at
//         docs/reviews/2026-08-29-harness-hazards.md:51, which elides an
//         absolute worktree path down to a bare leading ellipsis.
//       · A REMAINDER MATCHING ONE OF THIS REPO'S OWN IGNORE PATTERNS is the
//         strongest of the three and separates all five today, since only
//         `scratchpad/shots-final/NOTES.md` matches .gitignore:10. It is also
//         the one that refutes the whole idea, because AN AGENT WORKTREE OF
//         THIS REPOSITORY HAS THE IDENTICAL INTERNAL LAYOUT, that ignore rule
//         included. "The remainder is shaped like one of ours" is therefore
//         fully consistent with the ellipsis eliding an absolute worktree
//         prefix, and this corpus already elides exactly that: docs/ROADMAP.md
//         and docs/reviews/2026-09-03-loops-say-solid-both.md both write
//         `…/agent-` plus a worktree id, carrying no signal of any kind.
//
//     26 of the 104 carry none of the three signals, and THAT SET HOLDS BOTH
//     CLASSES AT ONCE: absolute elisions (a bare `…/agent-` worktree id) and
//     repo-relative ones (`src/renderer/` then an ellipsis then a test file,
//     five times in docs/reviews/2026-08-30-s1disasm-test-coupling.md). Nothing
//     a reader of the text can see tells the two apart. That is this gate's own
//     load-bearing reason for THE TRACKED RULE, one level up: "is it on disk"
//     has a different answer on every machine, and WHICH TREE AN ELIDED PREFIX
//     NAMES has a different answer on every machine too. The ellipsis is the
//     author's statement that they are not saying which. So the decline is not
//     "not yet", it is NOT EVER FROM THE TEXT, and the way to have an ellipsis
//     path judged is to write the path.
//     ─ SUBORDINATE, and only an explanation of why the idea looks attractive:
//     THE RATCHET FLATTERS IT. `git blame` dates all four absolute-prefix lines
//     to 2026-08-27, before IN_FORCE, so they are grandfathered and print
//     nothing, and the genuine line is dated 2026-09-06T02:05:52Z and is BOUND.
//     That is a property of a cutoff, not of a rule. The four counterexamples
//     are not fixed, they are merely old, and the first absolute-prefix
//     citation written after IN_FORCE walks straight past the cutoff and prints
//     a false finding with nothing to distinguish it from a true one.
//  N6 A BARE BACKTICKED FILENAME, `sibling-root.mjs`, with no directory in it.
//     A filename in prose names no location. `App.tsx` is not a path; this repo
//     has several files by names like it, and a reader who follows the citation
//     is guessing which tree and which directory the sentence meant.
//     ⚠ MEASURED COST OF NOT GATING THEM, and it is the reason: 3,045 of them
//     outside a fenced block, 1,063 distinct. 835 match no basename this
//     repository tracks ANYWHERE, and most of those name a suite peer's file, a
//     Genesis ROM artefact, or a file that has since been renamed. Judging the
//     shape would put a four-figure number of findings into a gate whose whole
//     design is that its red is worth reading. The count is derived every run,
//     so the day someone starts writing rooted paths instead, it moves.
//     The extension set is derived too, from the extensions this repository
//     actually tracks, so `v1.2` in prose is not counted as a file.
//
// N5 AND N6 ARE PRINTED ON EVERY RUN. `scratchpad/check-harness-guards.mjs`
// states the principle they follow: an exemption nobody sees is a hole. A reader
// who cannot tell a declared limit from an undiscovered one will open a row on
// it, measure it, and find out it was correct behaviour all along. That is what
// happened, and it cost a cycle.
//
// ─── WHAT IT STILL CANNOT SEE ──────────────────────────────────────────────
//
//   · A line number or an anchor. `docs/ROADMAP.md:830` passes on the file.
//   · Whether the tracked file SAYS what the citation claims.
//   · A path built out of prose ("the shots directory for O21").
//   · A citation to a path that is tracked but empty, or tracked and wrong.
//   · A peer citation that names its tree and is WRONG about that tree: N2
//     declines to judge it, so a wrong `aeon/docs/…` passes. Counted, not
//     silent.
//
// ─── LOUD ON UNMEASURABLE ──────────────────────────────────────────────────
//
// Anything that would make this run judge an unknown set of files exits 2 with
// COULD NOT MEASURE, never 0: an unreadable document, an empty population, a
// population that yields no citations at all, a `git` that will not answer for
// blame or ls-files, a canary that stopped firing, an in-force instant later
// than this file's own add-commit, and an exemption that no longer matches.

import { readFileSync, existsSync, mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, dirname, relative } from 'node:path';
import { tmpdir } from 'node:os';

import { AURORA_DIR, SUITE_PEERS } from '../test/support/sibling-root.mjs';

const PREFIX = 'check-doc-citations';
const ROOT = AURORA_DIR;

/** The documents this gate reads. */
const DOC_ROOT = 'docs';
const DOC_EXT = '.md';

/** Roots a token must start at to be a citation to THIS repo. */
const ROOTS = ['src', 'test', 'scripts', 'scratchpad', 'docs'];

/** Suffixes appended to an extensionless token before calling it untracked. */
const MODULE_EXTS = ['.ts', '.tsx', '.mjs', '.mts', '.js', '.py', '.sh'];

/**
 * THE IN-FORCE INSTANT. Read off `date -u +%Y-%m-%dT%H:%M:%SZ` immediately
 * before the commit that introduced this file, so it sits a few minutes BEFORE
 * that commit and this gate binds its own landing and everything after.
 *
 * A pinned constant rather than a runtime derivation, for check-ledger-timestamps'
 * reason: deriving it from this file's own add-commit would move it LATER under
 * any history rewrite (a squash, a rebase), and a cutoff that drifts later
 * silently grandfathers more. A constant cannot drift. What IS derived is the
 * cross-check below.
 */
const IN_FORCE = '2026-09-06T00:39:36Z';
const IN_FORCE_MS = Date.parse(IN_FORCE);

function die(msg) {
  console.error(`${PREFIX}: COULD NOT MEASURE, ${msg}`);
  process.exit(2);
}

if (!Number.isFinite(IN_FORCE_MS)) die(`IN_FORCE ${JSON.stringify(IN_FORCE)} is not a parseable instant`);

// ---------------------------------------------------------------------------
// EXTRACTION.
// ---------------------------------------------------------------------------

const BEFORE = String.raw`(?<![\w/.\-<>*?…])`;
const TOKEN_RE = new RegExp(`${BEFORE}((?:${ROOTS.join('|')})/[\\w./@\\-]*[\\w])`, 'g');

/**
 * A token is a SHAPE rather than a path (N4). `PLACEHOLDER_AFTER` is tried
 * against the rest of the line and allows one intervening `-`, because the
 * capture must end on a word character: in a glob like `scratchpad/shots-` plus
 * a star, the token ends at `shots` and the shape character is two positions
 * on. Omitting this rule is what voided my first census: it invented eleven
 * citations spelled `scratchpad/shots` that nobody had written.
 * (The glob cannot be spelled literally here. A star followed by a slash ends a
 * block comment, which is how this file first failed to parse at all.)
 */
const PLACEHOLDER_IN = /[<>*?…]|\.\.\./;
const PLACEHOLDER_AFTER = /^-?[<>*?…]/;

/**
 * N5. A rooted path wearing an elided prefix. This is deliberately a SEPARATE
 * regex from TOKEN_RE rather than a relaxation of it: TOKEN_RE must go on
 * refusing the shape, and this one only counts what it refused. If the two ever
 * merge, the decline stops being a decline.
 */
const ELLIPSIS_RE = new RegExp(`(?:…|\\.\\.\\.)/(?:${ROOTS.join('|')})/[\\w./@\\-]*[\\w]`, 'g');

/**
 * N6. Inline-code spans, with their CONTENT captured. Same pattern as
 * `codeSpans` above, which reports only offsets.
 */
const CODE_SPAN_TEXT_RE = /(`+)((?:[^`]|[^`][\s\S]*?))\1/g;

/** A filename with no directory in it: one dot-extension, no slash. */
const BARE_FILE_RE = /^[\w][\w.@\-]*\.([A-Za-z0-9]+)$/;

/**
 * Every bare backticked filename on a line (N6). `extOk` is supplied by the
 * caller from the extensions this repository actually tracks, so a version
 * number in prose is not counted as a file.
 */
function bareFilenames(line, extOk) {
  const out = [];
  for (const m of line.matchAll(CODE_SPAN_TEXT_RE)) {
    const b = m[2].match(BARE_FILE_RE);
    if (b && extOk(b[1].toLowerCase())) out.push(m[2]);
  }
  return out;
}

/** Can this token be asked about at all, or does it leave the repository (N3)? */
function judgeable(token) {
  if (token.startsWith('/')) return false;
  return !token.split('/').includes('..');
}

/** A line naming a suite peer is not judged (N2). */
const PEER_RE = new RegExp(`(?<![\\w-])(?:${SUITE_PEERS.join('|')})(?![\\w-])`, 'i');

/**
 * Tag every line of a markdown file with whether it sits inside a fenced block
 * (N1). A fence opens on ``` or ~~~ at up to three columns of indent and closes
 * on the same character. Marker lines themselves carry no citations.
 */
function tagLines(text) {
  const out = [];
  let fence = null;
  for (const raw of text.split('\n')) {
    const m = raw.match(/^\s{0,3}(`{3,}|~{3,})/);
    if (m) {
      if (fence === null) { fence = m[1][0]; out.push({ raw, fenced: true, marker: true }); continue; }
      if (m[1][0] === fence) { fence = null; out.push({ raw, fenced: true, marker: true }); continue; }
    }
    out.push({ raw, fenced: fence !== null, marker: false });
  }
  return out;
}

/** Spans of a line covered by an inline-code run. Reported, never required. */
function codeSpans(line) {
  const spans = [];
  for (const m of line.matchAll(/(`+)(?:[^`]|[^`][\s\S]*?)\1/g)) spans.push([m.index, m.index + m[0].length]);
  return spans;
}

/** Markdown link and image targets: `](target`. Reported, never required. */
function linkSpans(line) {
  const spans = [];
  for (const m of line.matchAll(/\]\(([^)\s]+)/g)) spans.push([m.index + 2, m.index + 2 + m[1].length]);
  return spans;
}

const inAny = (spans, a, b) => spans.some(([x, y]) => a >= x && b <= y);

/** Every citation on one line, as {token, code, link, escaping}. */
function citations(line) {
  const code = codeSpans(line);
  const link = linkSpans(line);
  const out = [];
  for (const m of line.matchAll(TOKEN_RE)) {
    const token = m[1].replace(/[.,;:)\]}]+$/, '');
    if (PLACEHOLDER_IN.test(token)) continue;
    const end = m.index + m[1].length;
    if (PLACEHOLDER_AFTER.test(line.slice(end))) continue;
    if (line[end] === '-' && end === line.length - 1) continue;      // hyphen-wrapped
    out.push({
      token,
      code: inAny(code, m.index, end),
      link: inAny(link, m.index, end),
      escaping: !judgeable(token),
    });
  }
  return out;
}

// ---------------------------------------------------------------------------
// GIT.
// ---------------------------------------------------------------------------

function git(root, args, allowFail = false) {
  try {
    return execFileSync('git', args, {
      cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 64 * 1024 * 1024,
    });
  } catch (e) {
    if (allowFail) return null;
    const why = String(e.stderr ?? '').trim().split('\n')[0];
    die(`git ${args[0]} failed in ${root} (status ${JSON.stringify(e.status)})`
      + `${why ? `\n  git said: ${why}` : ''}`
      + '\n  Without an answer this run judges an unknown set of files.');
    return null;
  }
}

/**
 * Committer time, in ms, for every line of a tracked file. `null` for a file
 * git cannot blame (untracked), and `Infinity` for a line git attributes to no
 * commit ("Not Committed Yet") so it is always IN SCOPE and never grandfathered.
 */
function blameTimes(root, rel) {
  const out = git(root, ['blame', '--line-porcelain', '--', rel], true);
  if (out === null) return null;
  const times = [];
  let pending = null;
  let uncommitted = false;
  for (const line of out.split('\n')) {
    if (/^[0-9a-f]{40} /.test(line)) uncommitted = /^0{40} /.test(line);
    else if (line.startsWith('committer-time ')) pending = Number(line.slice(15)) * 1000;
    else if (line.startsWith('\t')) { times.push(uncommitted ? Infinity : pending); pending = null; }
  }
  return times;
}

// ---------------------------------------------------------------------------
// THE PIPELINE. The canaries go through this identical function against
// throwaway repositories, which is the only reason their green is worth
// anything.
// ---------------------------------------------------------------------------

/**
 * @param root     a git repository to judge
 * @param inForce  ms; findings on lines older than this are grandfathered
 */
function analyze(root, inForce) {
  const listed = git(root, ['ls-files', '--cached', '--others', '--exclude-standard', '-z', '--', DOC_ROOT]);
  const files = listed.split('\0').filter((f) => f && f.endsWith(DOC_EXT)).sort();

  const trackedList = git(root, ['ls-files', '-z']).split('\0').filter(Boolean);
  const tracked = new Set(trackedList);
  const trackedDirs = new Set();
  for (const f of trackedList) {
    let d = dirname(f);
    while (d && d !== '.') { trackedDirs.add(d); d = dirname(d); }
  }
  const isTracked = (tok) => {
    const bare = tok.replace(/\/+$/, '');
    if (tracked.has(bare) || trackedDirs.has(bare)) return true;
    return MODULE_EXTS.some((x) => tracked.has(bare + x));
  };
  const onDisk = (tok) => existsSync(join(root, tok)) || MODULE_EXTS.some((x) => existsSync(join(root, tok + x)));

  // N6's two derived inputs. The extension set decides what SHAPE counts as a
  // filename at all; the basename set is the only resolvability question a bare
  // filename can be asked, and it is a weak one, which is the point.
  const basenames = new Set();
  const trackedExts = new Set();
  for (const f of trackedList) {
    const base = f.slice(f.lastIndexOf('/') + 1);
    basenames.add(base);
    const dot = base.lastIndexOf('.');
    if (dot > 0) trackedExts.add(base.slice(dot + 1).toLowerCase());
  }
  if (trackedExts.size === 0) {
    die(`git lists ${trackedList.length} tracked path(s) and not one has an extension. N6's counter `
      + 'would silently report zero bare filenames, which is indistinguishable from a corpus that has none.');
  }
  const extOk = (x) => trackedExts.has(x);

  const stat = {
    tokens: 0, marked: 0, fenced: 0, peer: 0, escaping: 0,
    ellipsis: 0, ellipsisFenced: 0, bareFile: 0, bareFileUnknown: 0,
  };
  const findings = [];
  const perFile = new Map();

  for (const rel of files) {
    let text;
    try { text = readFileSync(join(root, rel), 'utf8'); } catch (e) { die(`cannot read ${rel}: ${e.message}`); }
    tagLines(text).forEach((L, i) => {
      if (L.marker) return;

      // N5 and N6, counted BEFORE the judged population is touched. These two
      // shapes never become findings; the run only has to be able to say how
      // much it declined and why.
      const ell = L.raw.match(ELLIPSIS_RE);
      if (ell) { stat.ellipsis += ell.length; if (L.fenced) stat.ellipsisFenced += ell.length; }
      if (!L.fenced) {
        for (const name of bareFilenames(L.raw, extOk)) {
          stat.bareFile++;
          if (!basenames.has(name)) stat.bareFileUnknown++;
        }
      }

      const cs = citations(L.raw);
      if (cs.length === 0) return;
      if (L.fenced) { stat.fenced += cs.length; return; }
      if (PEER_RE.test(L.raw)) { stat.peer += cs.length; return; }
      for (const c of cs) {
        if (c.escaping) { stat.escaping++; continue; }
        stat.tokens++;
        if (c.code || c.link) stat.marked++;
        if (isTracked(c.token)) continue;
        const f = { file: rel, line: i + 1, token: c.token, onDisk: onDisk(c.token), text: L.raw.trim().slice(0, 150) };
        findings.push(f);
        if (!perFile.has(rel)) perFile.set(rel, []);
        perFile.get(rel).push(f);
      }
    });
  }

  // Date only the lines that would otherwise be violations. One blame per file
  // that has one, never one per file in the population.
  for (const [rel, list] of perFile) {
    const times = blameTimes(root, rel);
    for (const f of list) {
      const t = times === null ? Infinity : (times[f.line - 1] ?? Infinity);
      f.at = t;
      f.inScope = t >= inForce;
    }
  }

  return {
    files: files.length,
    stat,
    findings,
    inScope: findings.filter((f) => f.inScope),
    grandfathered: findings.filter((f) => !f.inScope),
  };
}

// ---------------------------------------------------------------------------
// GUARD 1 — THE EXTRACTOR, ON A FIXTURE, BEFORE ANY REAL NUMBER IS PRODUCED.
//
// Every markup shape a `.md` uses and a code comment does not is here: a fence,
// an inline span, a table cell, a historical quotation of someone else's
// output, a link target, and the two placeholder spellings. A count from an
// extractor that has not met a fence is not a count.
// ---------------------------------------------------------------------------

const FIXTURE = [
  'Prose mentions src/renderer/App.tsx bare.',                    // 0  bare, judged
  'Captures `scratchpad/shots-bg-wrap/` (not committed)',         // 1  inline code
  '| col | `test/support/sibling-root.mjs` | note |',             // 2  table cell
  '> quoted: `scripts/gone-forever.mjs` from a run in August',    // 3  historical quotation
  'A link [x](docs/ROADMAP.md) target.',                          // 4  link target
  '```',                                                          // 5  fence opens
  'src/inside-a-fence.ts',                                        // 6  fenced
  '`scratchpad/also-fenced.mjs`',                                 // 7  fenced
  '```',                                                          // 8  fence closes
  'After the fence `src/after.ts` again.',                        // 9  inline code
  'A bare word scratchpad and docs alone must not match.',        // 10 nothing
  'Shots in `scratchpad/shots-*/`.',                              // 11 glob placeholder
  'Also `src/renderer/x-<mode>.ts` here.',                        // 12 angle placeholder
  'Ported from `src/../../aeon/x.ts` upstream.',                  // 13 escaping
  'Trace at …/scratchpad/harness.mjs:12 in the log.',             // 14 N5 ellipsis
  'The helper `sibling-root.mjs` does the work.',                 // 15 N6 bare filename
  'Bumped to `v1.2` and then `1.5` last week.',                   // 16 not filenames
].join('\n');

/** The extension set the FIXTURE is judged against. The real run derives its own. */
const FIXTURE_EXTS = new Set(['ts', 'tsx', 'mjs', 'png', 'md']);
const fixtureExtOk = (x) => FIXTURE_EXTS.has(x);

function proveExtractor() {
  const L = tagLines(FIXTURE);
  const bad = (m) => die(`the extractor failed its own fixture: ${m}. Every count below `
    + 'would be a number from an instrument that does not read markdown.');

  if (L[6].fenced !== true || L[7].fenced !== true) bad('lines inside the fence are not tagged fenced');
  if (L[9].fenced !== false) bad('the fence never closed, so the extractor SPANS fences');
  if (L[0].fenced !== false) bad('a line before the fence is tagged fenced');
  if (!L[5].marker || !L[8].marker) bad('the fence markers are not tagged as markers');

  const c = (i) => citations(L[i].raw);
  if (c(0).length !== 1 || c(0)[0].code !== false || c(0)[0].link !== false) bad('a bare prose path is not seen, or is mis-marked');
  if (c(1).length !== 1 || c(1)[0].code !== true) bad('an inline-code path is not marked as code');
  if (c(2).length !== 1 || c(2)[0].code !== true) bad('a path in a table cell is missed');
  if (c(3).length !== 1 || c(3)[0].code !== true) bad('a path inside a historical quotation is missed');
  if (c(4).length !== 1 || c(4)[0].link !== true) bad('a markdown link target is missed');
  if (c(6).length !== 1) bad('the fenced line yields no token, so N1 would be doing nothing');
  if (c(10).length !== 0) bad(`bare words matched: ${JSON.stringify(c(10))}`);
  if (c(11).length !== 0) bad(`a glob placeholder was truncated into a token: ${JSON.stringify(c(11))}`);
  if (c(12).length !== 0) bad(`an angle placeholder was truncated into a token: ${JSON.stringify(c(12))}`);
  if (c(13).length !== 1 || c(13)[0].escaping !== true) bad('a path that climbs out of the repo is not flagged escaping');
  if (!PEER_RE.test(L[13].raw)) bad('the peer detector does not see a peer name on a line');
  if (PEER_RE.test(L[0].raw)) bad('the peer detector fires on a line naming no peer');

  // N5. Both halves, because a counter that fires everywhere reports nothing and
  // a judged ellipsis path would mean the decline had quietly become a rule.
  const ellCount = (i) => (L[i].raw.match(ELLIPSIS_RE) ?? []).length;
  if (ellCount(14) !== 1) bad(`the N5 detector saw ${ellCount(14)} ellipsis path(s) on a line with exactly one`);
  if (ellCount(0) !== 0) bad('the N5 detector fires on a plain rooted path, so its count would be meaningless');
  if (c(14).length !== 0) bad('an ellipsis-prefixed path became a JUDGED citation. N5 declares a decline, not a rule');

  // N6. The extension gate is what stops a version number being counted as a file.
  const bare = (i) => bareFilenames(L[i].raw, fixtureExtOk);
  if (bare(15).length !== 1 || bare(15)[0] !== 'sibling-root.mjs') bad(`the N6 detector read ${JSON.stringify(bare(15))} where one bare filename sits`);
  if (bare(16).length !== 0) bad(`a version number was counted as a bare filename: ${JSON.stringify(bare(16))}`);
  if (bare(1).length !== 0) bad('a path WITH a directory was counted as a bare filename, so N6 double-counts the judged population');
  if (c(15).length !== 0) bad('a bare filename became a judged citation, so N6 is not a decline at all');

  return 17;
}
const FIXTURE_LINES = proveExtractor();

// ---------------------------------------------------------------------------
// GUARD 2 — THE RATCHET, IN BOTH DIRECTIONS, ON THROWAWAY REPOSITORIES.
//
// A gate that has only ever been shown to catch NEW findings has not been shown
// to spare OLD ones, and the ratchet is then untested: only the citation check,
// which already worked, has been exercised. So every run builds real git
// repositories under `mkdtemp`, with committer times set explicitly, and runs
// `analyze` against them.
// ---------------------------------------------------------------------------

function mkRepo() {
  const dir = mkdtempSync(join(tmpdir(), 'check-doc-citations-'));
  git(dir, ['init', '-q', '-b', 'main']);
  git(dir, ['config', 'user.email', 'canary@example.invalid']);
  git(dir, ['config', 'user.name', 'canary']);
  mkdirSync(join(dir, 'docs'), { recursive: true });
  return dir;
}

function writeDoc(dir, rel, body) {
  mkdirSync(dirname(join(dir, rel)), { recursive: true });
  writeFileSync(join(dir, rel), body);
}

function commitAt(dir, when, msg) {
  git(dir, ['add', '-A']);
  execFileSync('git', ['commit', '-q', '-m', msg], {
    cwd: dir,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, GIT_AUTHOR_DATE: when, GIT_COMMITTER_DATE: when },
  });
}

const CUT = Date.parse('2026-09-06T00:00:00Z');
const OLD = '2026-09-01T12:00:00Z';
const NEW = '2026-09-06T12:00:00Z';

function proveRatchet() {
  const dirs = [];
  const fail = (m) => {
    for (const d of dirs) rmSync(d, { recursive: true, force: true });
    die(`a ratchet canary failed: ${m}. The grandfathering below cannot be trusted.`);
  };
  const has = (r, tok) => r.findings.some((f) => f.token === tok);
  const scoped = (r, tok) => r.inScope.some((f) => f.token === tok);
  const old = (r, tok) => r.grandfathered.some((f) => f.token === tok);

  // G1  a dangling citation committed BEFORE the cutoff is GRANDFATHERED.
  //     The direction nobody tests, and the one that keeps the suite usable.
  {
    const d = mkRepo(); dirs.push(d);
    writeDoc(d, 'docs/reviews/old.md', 'Captures `scratchpad/shots-gone/` (not committed)\n');
    writeDoc(d, 'src/real.ts', 'export const a = 1;\n');
    commitAt(d, OLD, 'old review');
    const r = analyze(d, CUT);
    if (!has(r, 'scratchpad/shots-gone')) fail('G1: the dangling citation was not found at all');
    if (!old(r, 'scratchpad/shots-gone')) fail('G1: a pre-cutoff finding was placed IN SCOPE, so the suite would be red forever');
    if (r.inScope.length !== 0) fail(`G1: expected nothing in scope, got ${JSON.stringify(r.inScope.map((f) => f.token))}`);
    if (!has(r, 'src/real.ts') === false) { /* a tracked path must not be a finding at all */ }
    if (r.findings.some((f) => f.token === 'src/real.ts')) fail('G1: a TRACKED path was reported as a finding');
    // The negative control for G8. A count that is never zero measures nothing.
    if (r.stat.ellipsis !== 0 || r.stat.bareFile !== 0) {
      fail(`G1: the N5/N6 counters report ${r.stat.ellipsis}/${r.stat.bareFile} on a corpus containing `
        + 'neither shape, so a nonzero count in G8 would prove nothing');
    }
  }

  // G2  THE SAME LINE, edited after the cutoff, is IN SCOPE. Per-line binding:
  //     the edited line is bound and its untouched neighbour is not.
  {
    const d = mkRepo(); dirs.push(d);
    writeDoc(d, 'docs/reviews/old.md', 'Old line cites `scratchpad/shots-a/`.\nSecond line cites `scratchpad/shots-b/`.\n');
    commitAt(d, OLD, 'old review');
    writeDoc(d, 'docs/reviews/old.md', 'Old line cites `scratchpad/shots-a/` and now says more.\nSecond line cites `scratchpad/shots-b/`.\n');
    commitAt(d, NEW, 'touch one line');
    const r = analyze(d, CUT);
    if (!scoped(r, 'scratchpad/shots-a')) fail('G2: the EDITED line was not brought into scope');
    if (!old(r, 'scratchpad/shots-b')) fail('G2: an untouched neighbour was dragged into scope, which is per-FILE binding, not per-line');
  }

  // G3  a brand-new UNTRACKED document is fully in scope. This is the moment
  //     the fix is cheap, and blame cannot answer for it at all.
  {
    const d = mkRepo(); dirs.push(d);
    writeDoc(d, 'docs/reviews/seed.md', 'seed\n');
    commitAt(d, OLD, 'seed');
    writeDoc(d, 'docs/reviews/brand-new.md', 'Captures `scratchpad/shots-new/`.\n');
    const r = analyze(d, CUT);
    if (!scoped(r, 'scratchpad/shots-new')) fail('G3: an untracked new document was not bound');
  }

  // G4  A GIT-IGNORED path is STILL a violation. check-cited-paths' exclusion 8
  //     inverted, and the single most important row here: ported blindly it
  //     would silence every known positive this gate exists for.
  {
    const d = mkRepo(); dirs.push(d);
    writeDoc(d, '.gitignore', 'scratchpad/shots*/\n');
    writeDoc(d, 'docs/reviews/new.md', 'Captures `scratchpad/shots-ignored/`.\n');
    mkdirSync(join(d, 'scratchpad/shots-ignored'), { recursive: true });
    writeFileSync(join(d, 'scratchpad/shots-ignored/a.png'), 'x');
    commitAt(d, NEW, 'new review citing ignored output');
    const r = analyze(d, CUT);
    const f = r.inScope.find((x) => x.token === 'scratchpad/shots-ignored');
    if (!f) fail('G4: a citation to git-ignored output PASSED. Every one of this row\'s known positives is that shape');
    if (f.onDisk !== true) fail('G4: the finding is not marked as present-on-disk, so its message would tell the author the wrong thing');
  }

  // G5  THE BACKDATING CASE, and the ONLY canary that can tell the two possible
  //     cutoffs apart. A document whose own header claims an old date, committed
  //     after the cutoff. Every other case here behaves identically whether the
  //     cutoff reads the commit or the document's own `**Date**` line.
  {
    const d = mkRepo(); dirs.push(d);
    writeDoc(d, 'docs/reviews/backdated.md', '**Date** 2026-05-02\n\nCaptures `scratchpad/shots-backdated/`.\n');
    commitAt(d, NEW, 'a review that says it is from May');
    const r = analyze(d, CUT);
    if (!scoped(r, 'scratchpad/shots-backdated')) {
      fail('G5: a document backdated in its own text was grandfathered. The cutoff has moved off '
        + 'committer time and onto content, which reopens the hole this ratchet exists to close');
    }
  }

  // G6  N1 and N2 do not silently swallow a real finding: the same dangling
  //     token, in a fence and on a peer-named line, in a NEW commit.
  {
    const d = mkRepo(); dirs.push(d);
    writeDoc(d, 'docs/reviews/declines.md',
      '```\nCaptures scratchpad/shots-fenced/\n```\n\nSee aeon\'s `scratchpad/shots-peer/`.\n\nPlain `scratchpad/shots-plain/`.\n');
    commitAt(d, NEW, 'a new review exercising both declines');
    const r = analyze(d, CUT);
    if (has(r, 'scratchpad/shots-fenced')) fail('G6: a fenced token became a finding, so N1 is not applied');
    if (has(r, 'scratchpad/shots-peer')) fail('G6: a peer-named line became a finding, so N2 is not applied');
    if (!scoped(r, 'scratchpad/shots-plain')) fail('G6: the plain citation beside them was lost, so the declines are eating real findings');
    if (r.stat.fenced !== 1) fail(`G6: the fenced counter says ${r.stat.fenced}, not 1, so the summary cannot report what it declined`);
    if (r.stat.peer !== 1) fail(`G6: the peer counter says ${r.stat.peer}, not 1`);
  }

  // G7  a citation that RESOLVES against a tracked directory passes, including
  //     one naming a directory rather than a file. Without this the gate could
  //     be green by failing everything and exempting the rest.
  {
    const d = mkRepo(); dirs.push(d);
    writeDoc(d, 'docs/captures/run/a.png', 'x');
    writeDoc(d, 'docs/reviews/good.md', 'Captures `docs/captures/run/` and `docs/captures/run/a.png`.\n');
    commitAt(d, NEW, 'a review citing tracked evidence');
    const r = analyze(d, CUT);
    if (r.findings.length !== 0) fail(`G7: a tracked directory and file were reported as findings: ${JSON.stringify(r.findings.map((f) => f.token))}`);
    if (r.stat.tokens !== 2) fail(`G7: expected 2 judged tokens, saw ${r.stat.tokens}`);
  }

  // G8  N5 AND N6 ARE COUNTED, AND STILL DECLINED. The two shapes this gate
  //     declares it does not judge. A declaration whose number cannot move is
  //     the defect being fixed, so this plants one of each and reads the
  //     counters back; G1 above is the zero control on the same counters.
  {
    const d = mkRepo(); dirs.push(d);
    writeDoc(d, 'scratchpad/known-harness.mjs', '// tracked\n');
    writeDoc(d, 'docs/reviews/shapes.md', [
      'Threw at …/scratchpad/known-harness.mjs:12 during the run.',
      'The clone sat at `…/scratchpad/gone-forever/` when it broke.',
      '',
      '```',
      'at .../src/renderer/App.tsx:3:1',
      '```',
      '',
      'The helper `known-harness.mjs` is the instrument.',
      'Nothing tracks `never-existed.mjs` anywhere.',
      'Bumped to `v1.2` in the same commit.',
      '',
      'And a plain `scratchpad/shots-shapes/` beside them.',
      '',
    ].join('\n'));
    commitAt(d, NEW, 'a new review carrying both declared shapes');
    const r = analyze(d, CUT);
    if (r.stat.ellipsis !== 3) fail(`G8: the N5 counter says ${r.stat.ellipsis}, not 3, so it cannot report what it declined`);
    if (r.stat.ellipsisFenced !== 1) fail(`G8: the N5 fence split says ${r.stat.ellipsisFenced}, not 1`);
    if (r.findings.some((f) => f.token.includes('gone-forever'))) fail('G8: an ellipsis-prefixed path became a FINDING. N5 declares a decline, and widening it is a separate row');
    if (r.stat.bareFile !== 2) fail(`G8: the N6 counter says ${r.stat.bareFile}, not 2 (a version number is not a filename, and a rooted path is not a bare one)`);
    if (r.stat.bareFileUnknown !== 1) fail(`G8: the N6 unknown-basename counter says ${r.stat.bareFileUnknown}, not 1`);
    if (!scoped(r, 'scratchpad/shots-shapes')) fail('G8: the ordinary citation beside them was lost, so the two new declines are eating real findings');
  }

  const summary = {
    G1: 'grandfathered', G2: 'per-line', G3: 'untracked-new', G4: 'ignored-still-fails',
    G5: 'backdating', G6: 'declines', G7: 'tracked-passes', G8: 'shapes-counted-not-judged',
  };
  for (const d of dirs) rmSync(d, { recursive: true, force: true });
  return summary;
}
const RATCHET_ARMS = proveRatchet();

// ---------------------------------------------------------------------------
// GUARD 3 — THE IN-FORCE INSTANT HAS NOT BEEN EDITED FORWARD.
//
// The one way to make this gate ignore a bad citation without touching a rule
// is to move IN_FORCE later. That edit lands exactly here: the pinned instant
// must sit BEFORE the committer time of the commit that first added this file.
// Before that commit exists (this file's own first run) the cross-check is
// deferred and says so, rather than passing silently.
// ---------------------------------------------------------------------------

const SELF = relative(ROOT, new URL(import.meta.url).pathname);
let inForceNote;
{
  const out = git(ROOT, ['log', '--diff-filter=A', '--format=%cI', '--', SELF], true);
  const added = String(out ?? '').trim().split('\n').filter(Boolean).pop();
  if (!added) {
    inForceNote = `no add-commit for ${SELF} yet, so the cross-check is DEFERRED to the next run`;
  } else if (Date.parse(added) < IN_FORCE_MS) {
    die(`IN_FORCE (${IN_FORCE}) is LATER than this file's own add-commit (${added}). An instant `
      + 'edited forward is how this gate would be made to ignore a finding without touching a rule.');
  } else {
    inForceNote = `cross-checked against this file's add-commit ${added}`;
  }
}

// ---------------------------------------------------------------------------
// EXEMPTIONS — a citation that is RIGHT to name something no reader can open.
//
// Every entry is `{file, token, why}` and every entry MUST STILL FIRE: an
// exemption whose citation has been repaired or deleted fails this run. An
// exemption list is itself a helpful-looking artifact, and one describing a
// citation nobody writes any more is the class of thing this gate polices.
//
// THE BAR. The document is right to name something absent: it is recording what
// was LOST, quoting a run, or stating provenance. "The evidence is on my
// machine" is not on that list, and neither is "(not committed)". Anything a
// review offers as EVIDENCE belongs in `docs/captures/`, tracked.
// ---------------------------------------------------------------------------

const EVIDENCE_LOST = 'the sentence records evidence that was DESTROYED (a worktree prune on '
  + '2026-09-05) and is marked in place as not retained; deleting the path would erase the '
  + 'record of what was lost, which is the opposite of the repair. It is not a licence: '
  + 'docs/captures/ is where evidence goes.';

// A SECOND REASON, because the first one names a CAUSE I cannot verify for these.
// The 2026-09-05 prune is a known event with a known blast radius; the three below
// are simply absent from every checkout reachable from here, and I did not find out
// what removed them. Saying "a prune took it" about a file I did not watch die would
// be a remedy written rather than measured, which is this row's own defect.
const EVIDENCE_GONE = 'the sentence records evidence that is ABSENT from every checkout reachable '
  + 'here and that no commit ever touched (.gitignore:10 has matched scratchpad/shots*/ since '
  + '2026-08-15), marked in place with what a reader can do instead. What removed it is NOT '
  + 'known and the marking does not claim to know. Deleting the path would erase the record of '
  + 'what was lost. It is not a licence: docs/captures/ is where evidence goes.';

const EXEMPT = [
  { file: 'docs/reviews/2026-08-30-o31-dangling-bg-refs.md', token: 'scratchpad/shots-bg-dangling', why: EVIDENCE_LOST },
  { file: 'docs/reviews/2026-08-30-o21-bg-wrap-visibility.md', token: 'scratchpad/shots-bg-wrap', why: EVIDENCE_LOST },
  { file: 'docs/reviews/2026-09-02-effects-usability-w1.md', token: 'scratchpad/shots-effects-section-picker/effects-section-picker.png', why: EVIDENCE_LOST },
  { file: 'docs/reviews/2026-09-03-o56-loop-authoring-door.md', token: 'scratchpad/shots-o56-loop-authoring-door/collision-facet-arrival.png', why: EVIDENCE_LOST },
  { file: 'docs/reviews/2026-09-03-o56-loop-authoring-door.md', token: 'scratchpad/shots-o56-loop-authoring-door/collision-facet-armed.png', why: EVIDENCE_LOST },

  // Marked by row DOCS-SHOTS-RETRO on 2026-09-06. The first is the sharpest case
  // in this list: the instrument that took it is TRACKED AND STILL RUNS, and it
  // still cannot reproduce the shot, because the harness writes that filename only
  // while the disclosure is live and the disclosure was retired. A remedy of
  // "re-run the harness" would have been wrong in a way that reads as right.
  { file: 'docs/reviews/2026-09-02-variant-cycle-controls.md', token: 'scratchpad/shots-variant-cycle/disclosure.png', why: EVIDENCE_GONE },
  { file: 'docs/reviews/2026-09-03-o51-artmode-defects.md', token: 'scratchpad/shots-canvas/repro-assign.png', why: EVIDENCE_GONE },
  { file: 'docs/superpowers/plans/2026-08-15-paint-through-cdp-report.md', token: 'scratchpad/shots-paint', why: EVIDENCE_GONE },

  // Added 2026-09-10. This one is not lost evidence -- it is PROVENANCE, the third
  // reason on the bar, and the citation is load-bearing rather than incidental: the
  // sentence exists to tell a reader that the board file is UNTRACKED and that the
  // change it describes therefore lives on one machine and in no commit. Naming the
  // path is how that sentence does its job; removing it would leave "the removal is
  // on disk only" pointing at nothing. The file is untracked BY CONTRACT
  // (empyrean contract/LANE_STATUS.md), so it can never become openable and no
  // repair is available or wanted. NOT a licence: a review offering EVIDENCE still
  // puts it in docs/captures/, tracked.
  { file: 'docs/2026-09-09-audit-briefing.md', token: 'docs/lane-status.json',
    why: 'the sentence STATES PROVENANCE -- that the board file is untracked, so the change '
       + 'it describes exists on disk and in no commit. The path is what the sentence is about; '
       + 'deleting it would leave the claim pointing at nothing. Untracked by contract '
       + '(empyrean contract/LANE_STATUS.md), so it cannot be made openable.' },

  // Added 2026-09-12, same token and the same third reason on the bar as the row
  // above, and this one is the purest instance of it in the list: the packet's
  // §4 is a finding ABOUT that file being unopenable. It records that the gate
  // `scripts/check-lane-status.mjs` could only ever check one hard-coded,
  // gitignored path, that this left its three new size bounds with no committed
  // baseline to prove a red against, and that the only remaining proof would
  // have been vandalising the file the owner writes live. Every one of those
  // sentences has to name the path to say anything at all. Repairing the
  // citation is not available: the file is untracked BY CONTRACT (empyrean
  // contract/LANE_STATUS.md), which is the premise of the finding rather than an
  // accident of this checkout. NOT a licence: the packet's actual evidence is
  // quoted runs and `git diff --stat` in the document itself, not a path.
  { file: 'docs/reviews/2026-09-12-lane-status-bounds.md', token: 'docs/lane-status.json',
    why: 'the packet STATES PROVENANCE and its central finding is that this exact file is '
       + 'gitignored, so a gate whose only subject is that path cannot be proven red-first '
       + 'from a committed baseline. The unopenability is the subject; deleting the path '
       + 'would delete the finding. Untracked by contract (empyrean contract/LANE_STATUS.md), '
       + 'so it cannot be made openable.' },
];

// ---------------------------------------------------------------------------
// THE REAL RUN.
// ---------------------------------------------------------------------------

const run = analyze(ROOT, IN_FORCE_MS);

if (run.files === 0) die(`git lists no ${DOC_EXT} file under ${DOC_ROOT}/. Nothing was examined.`);
if (run.stat.tokens === 0) {
  die(`not one citation was found in ${run.files} document(s). The markdown reader is broken; a run `
    + 'that reads no citations cannot say that no citation is dangling.');
}

const usedExemptions = new Set();
const violations = [];
for (const f of run.inScope) {
  const e = EXEMPT.find((x) => x.file === f.file && x.token === f.token);
  if (e) { usedExemptions.add(e); continue; }
  violations.push(f);
}
// A grandfathered finding also keeps its exemption alive: the four marked
// citations sit on lines this gate will re-date the moment anyone edits them,
// and an exemption that goes stale between those two moments would fail a run
// nobody changed.
for (const f of run.grandfathered) {
  const e = EXEMPT.find((x) => x.file === f.file && x.token === f.token);
  if (e) usedExemptions.add(e);
}
const deadExemptions = EXEMPT.filter((e) => !usedExemptions.has(e));

const pct = (n, d) => (d === 0 ? '0' : ((n / d) * 100).toFixed(1));

console.log(
  `${PREFIX}: read ${run.files} tracked-or-new ${DOC_EXT} document(s) under ${DOC_ROOT}/ (the population `
  + 'git reports, `ls-files --cached --others --exclude-standard`, so a brand-new review is judged the '
  + `first time its author runs the suite) and judged ${run.stat.tokens} citation(s) rooted at `
  + `${ROOTS.join(', ')} against 1 rule: a cited path must be TRACKED, not merely on disk, because `
  + '"is it on disk" has a different answer on every machine.\n'
  + `${PREFIX}: aurora ${ROOT}\n`
  + `${PREFIX}: GRANDFATHERED, ${run.grandfathered.length} finding(s) on line(s) git dates before `
  + `IN_FORCE ${IN_FORCE} (${inForceNote}). They are NOT fixed and NOT hidden: committed history is `
  + 'not retro swept, and the cutoff exists so that nothing NEW joins them. Edit one of those lines '
  + 'and it is judged at its new commit.\n'
  + `${PREFIX}: IN SCOPE, ${run.inScope.length} finding(s) on line(s) dated at or after IN_FORCE; `
  + `${usedExemptions.size} of ${EXEMPT.length} written exemption(s) applied.\n`
  + `${PREFIX}: NOT JUDGED, ${run.stat.fenced} citation(s) inside a fenced block (transcripts, `
  + `commands and quoted listings); ${run.stat.peer} on a line that names a suite peer `
  + `(${SUITE_PEERS.join('/')}), which this gate cannot resolve to a tree; ${run.stat.escaping} `
  + 'naming a path that leaves this repository.\n'
  + `${PREFIX}: NOT JUDGED, TWO DECLARED SHAPES, counted here because an exclusion nobody sees `
  + `reads as a hole. ${run.stat.ellipsis} ellipsis-prefixed path(s) of the form `
  + '`…/scratchpad/x`' + ` (${run.stat.ellipsisFenced} of them inside a fenced stack `
  + 'trace): the ellipsis says the prefix has been WITHHELD, and here it elides an absolute path '
  + 'far more often than a repo-relative one, so resolving the remainder against the repo root '
  + `would invent findings out of paths that were never in this tree. ${run.stat.bareFile} bare `
  + 'backticked filename(s) with no directory in them, judged against the extensions this repo '
  + `actually tracks, of which ${run.stat.bareFileUnknown} match no tracked basename anywhere: a `
  + 'filename in prose names no location, and gating the shape would bury this run under a '
  + 'four-figure count. Both numbers are derived every run, so either one moves the day the '
  + 'corpus does. THE ELLIPSIS HALF IS SETTLED, not pending: a rule that judged it would be '
  + 'undecidable from the text, and N5 in this file carries the measurement. Widening the gate '
  + 'to bare filenames is still a separate row.\n'
  + `${PREFIX}: ${run.stat.marked} of ${run.stat.tokens} judged citation(s) `
  + `(${pct(run.stat.marked, run.stat.tokens)}%) sit in an inline-code span or a link target. `
  + 'Backticks are NOT required, measured rather than assumed: the eight bare dangling ones are all '
  + 'real citations, so requiring the markup would have cost findings and bought no precision.\n'
  + `${PREFIX}: the extractor met a ${FIXTURE_LINES}-line markdown fixture before any of this, and `
  + 'the ratchet ran in both directions against throwaway git repositories this run: '
  + `${Object.entries(RATCHET_ARMS).map(([k, v]) => `${k} ${v}`).join(', ')}.`,
);

if (deadExemptions.length) {
  console.error(`\n${PREFIX}: FAIL, ${deadExemptions.length} exemption(s) no longer describe any citation `
    + `in the tree. A stale exemption is the artifact this gate exists to stop; delete the entry from `
    + `EXEMPT in ${SELF}:\n`
    + deadExemptions.map((e) => `    ${e.file}  ->  ${e.token}`).join('\n'));
}

if (violations.length === 0 && deadExemptions.length === 0) {
  console.log(`${PREFIX}: OK, every path cited by a document line written since ${IN_FORCE} is tracked.`);
  process.exit(0);
}

if (violations.length) {
  console.error(
    `\n${PREFIX}: FAIL, ${violations.length} citation(s) on line(s) written since ${IN_FORCE} point at `
    + 'something no reader can open:\n'
    + violations.map((v) => `    ${v.file}:${v.line}  ${v.token}`
      + `  [${v.onDisk ? 'ON DISK BUT UNTRACKED, so it exists only on the machine that made it'
        : 'ABSENT'}]\n        ${v.text}`).join('\n')
    + '\n\n  A review that offers something as evidence must put it where a reader can open it:\n'
    + '  docs/captures/<date>-<topic>/, tracked. `scratchpad/shots*/` is git-ignored by\n'
    + '  .gitignore:10 and has been since 2026-08-15, so a citation to one is dangling the\n'
    + '  moment the worktree is pruned. Saying "(not committed)" beside it is a disclosed\n'
    + '  dangling reference, not an excused one, and is deliberately not an exemption.\n'
    + '  If the document is RIGHT to name something no reader can open (it records what was\n'
    + '  lost, quotes a run, or states provenance), add a row to EXEMPT with the reason.',
  );
}
process.exit(1);
