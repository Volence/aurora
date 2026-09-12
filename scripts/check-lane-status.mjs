#!/usr/bin/env node
// docs/lane-status.json invariants the Dominion console does NOT check.
//
// WHY THIS EXISTS: the console validates the `state` ENUM — which is what caught
// three lanes writing `done` — but nothing validates exactly-one-`next`. So a
// queue with zero next rows renders as `ok` and reads to a successor as "this
// lane has nothing to do", which is indistinguishable from a lane that is
// genuinely idle. I hit that twice in one night (2026-09-04/05), the second time
// two hours after banking a note telling myself not to. A note did not hold; this
// does. The cause both times was editing the queue in a script and never
// re-asserting the invariant afterwards.
import { readFileSync } from 'node:fs';

// ═══ THE THREE SIZE BOUNDS, AND WHERE EACH NUMBER COMES FROM ═══
//
// Suite contract `contract/LANE_STATUS.md` rule 7 ("Size bounds, so rule 6 is
// measurable"), read in the empyrean repo at `origin/main` =
// f39482b212397c440c8ee3edcd9a4da55099cd63: "a queue row's `title` is at most
// 240 characters, `queue` holds at most 20 rows, and the whole file is at most
// 12 KB". `docs/OVERSEER.md` restates the three locally and adds the rule THIS
// file exists to obey: assert them in the script, do not read them back
// afterwards.
//
// 12 KB IS 12 * 1024, NOT 12,000. The contract writes "12 KB" in prose, which is
// ambiguous on its own; its own executable reader settles it. empyrean
// `scripts/hub_check.py` at the same revision declares
// `MAX_TITLE, MAX_ROWS, SOFT_BYTES = 240, 20, 12 * 1024`. Two readers of one
// contract that disagree about a bound is worse than either bound.
//
// THE FILE BOUND IS ON BYTES, not characters and not lines. The contract's own
// recipe for it is `wc -c`, which counts bytes; a character count would under
// read every multi byte character in the file, and these files are full of them.
// So the file is read as a Buffer and measured with `Buffer.length`, which is
// bytes. This checker can do that exactly because it holds the file. The hub
// cannot: `hub_check.py` says so in its own docstring, re-serializes the parsed
// document, and REPORTS its byte figure rather than gating on it, because the
// number it has is not the subject. Ours is the subject.
//
// TITLES ARE COUNTED IN CODE POINTS. The reference implementation is Python's
// `len()` on a `str`, which counts code points. JavaScript's `String.length`
// counts UTF-16 units, so one astral character (an emoji) counts 2 here and 1
// in the hub's report, and the same row would be over on one reader and inside
// on the other. `[...title].length` counts code points and the two agree.
const MAX_TITLE_CHARS = 240;
const MAX_QUEUE_ROWS = 20;
const MAX_FILE_BYTES = 12 * 1024;

// THE PATH IS OVERRIDABLE SO THE BOUNDS CAN BE PROVEN WITHOUT VANDALISING LIVE
// STATE. `docs/lane-status.json` is gitignored (`.gitignore` line 11): it has no
// committed baseline to restore a mutation from, it is the file the owner edits
// all session, and it does not exist at all in a worktree. A gate whose only
// red-first proof is "break the owner's live file" is a gate nobody re-proves
// after the parcel that added it. With a path argument the same code can be
// driven over a fixture, which is what `test/config/lane-status-bounds.test.ts`
// does inside `npm test`. `npm run check:lane-status` passes no argument and
// still checks the live file, which is the run `docs/OVERSEER.md` asks for after
// every write.
const PATH = process.argv[2] ?? 'docs/lane-status.json';
const STATES = new Set(['next', 'doing', 'open', 'blocked']);
const problems = [];

// LOUD ON UNMEASURABLE, in two separately named ways. A file that cannot be read
// and a file that cannot be parsed are different repairs, and neither is a pass
// with nothing to check. Exit 2 rather than 1 so a caller can tell "the bounds
// were not measured" from "the bounds were measured and one is broken".
let raw;
try {
  raw = readFileSync(PATH);
} catch (e) {
  console.error(`check-lane-status: COULD NOT READ ${PATH}: ${e.message}`);
  console.error('  Nothing was measured. This is a failure, not a green run over an absent file.');
  process.exit(2);
}

let doc;
try {
  doc = JSON.parse(raw.toString('utf8'));
} catch (e) {
  console.error(`check-lane-status: ${PATH} is not readable JSON: ${e.message}`);
  console.error(`  ${raw.length} bytes were read but none of the queue bounds could be measured.`);
  process.exit(2);
}

// A NON-ARRAY `queue` IS UNMEASURABLE, NOT EMPTY. Coercing it to `[]` would make
// the row count and every title length report 0, which is exactly what a lane
// with an empty queue looks like: a silent zero inside the number a reader
// trusts. Say which it was instead.
if (!Array.isArray(doc.queue)) {
  problems.push(
    `queue is ${doc.queue === undefined ? 'MISSING' : `not an array (it is ${typeof doc.queue})`}, `
    + 'so the row count and every title length are UNMEASURABLE. Reported as a failure rather '
    + 'than as zero rows, which is what an empty queue looks like.');
}

const queue = Array.isArray(doc.queue) ? doc.queue : [];
const next = queue.filter((q) => q?.state === 'next');
if (next.length !== 1) {
  problems.push(
    `queue has ${next.length} rows in state "next"; the contract wants exactly ONE. `
    + (next.length === 0
      ? 'Zero renders as `ok` on the console and reads to a successor as a lane with nothing '
        + 'to do. Promote the cheapest startable row, even if it is "when <peer> brings X".'
      : `Rows: ${next.map((q) => q.id).join(', ')}. A list where everything is next helps nobody choose.`));
}

// A `next` ROW THAT NAMES A BLOCKER IS NOT A STARTING POINT. `next` means "the
// thing that starts when `doing` lands"; a row whose own text says it waits on
// the owner or a peer cannot be that, and a successor reading the board at
// 3am starts by discovering it cannot start. Nothing else compares these two
// fields: `next` is a legal state and `blockedBy` is free text, so the console
// says nothing and neither did this file until 2026-09-10.
//
// ⚠ ADDED BECAUSE THIS CHECK CAUSED THE DEFECT IT NOW CATCHES. The
// exactly-one-`next` rule above is satisfiable by promoting a row that cannot
// start, and that is exactly what happened here: a genuinely startable row
// closed, the check went red for zero `next`, and the cheapest way to green it
// was to promote a row blocked on the owner. **A validator that demands a
// field be filled will get it filled.** The rule it needed was not "have a
// next" but "have a next you can actually begin".
const blockedNext = queue.filter((q) => q?.state === 'next' && q?.blockedBy);
if (blockedNext.length) {
  problems.push(
    `row(s) in state "next" that NAME A BLOCKER: `
    + blockedNext.map((q) => `${q.id} (blocked by: ${String(q.blockedBy).slice(0, 60)})`).join('; ')
    + '. `next` is what starts when `doing` lands, so a row waiting on someone else is `blocked`. '
    + 'If that leaves you with no startable row, the honest fix is to FIND one or write one. '
    + 'Relabelling a blocked row is how this rule came to be needed.');
}

const bad = queue.filter((q) => q?.state && !STATES.has(q.state));
if (bad.length) problems.push(`unknown state(s): ${bad.map((q) => `${q.id}=${q.state}`).join(', ')}`);

const ids = queue.map((q) => q?.id);
const dupes = [...new Set(ids.filter((id, i) => ids.indexOf(id) !== i))];
if (dupes.length) problems.push(`duplicate queue id(s): ${dupes.join(', ')}, and a wholesale rewrite can reintroduce a removed row`);

const doing = queue.filter((q) => q?.state === 'doing');
const agents = (doc.inFlight ?? []).filter((f) => f?.agent).length;
if (doing.length && agents === 0 && doc.atBoundary === true) {
  problems.push(`${doing.length} row(s) marked "doing" with no agent in inFlight and atBoundary true, claiming activity the lane does not have`);
}

if (!doc.updatedAt || Number.isNaN(Date.parse(doc.updatedAt))) {
  problems.push('updatedAt is missing or unparseable');
} else if (Date.parse(doc.updatedAt) > Date.now() + 60_000) {
  problems.push(`updatedAt ${doc.updatedAt} is in the FUTURE, so the reader rejects the whole file, losing every true thing in it`);
}

// ═══ THE THREE SIZE BOUNDS (contract rule 7) ═══
//
// ONE PROPERTY PER CHECK, THREE INDEPENDENT `if`s. Folding them into one
// assertion would let the first violation hide the other two, and a file that is
// over on all three is the normal case, not the exotic one: the rows and the
// titles are what make the bytes. Every violation this run finds goes into
// `problems`, and the epilogue below prints all of them. This repo has paid for
// first-failure-hides-the-rest more than once.
//
// WHY THESE WERE MISSING UNTIL NOW, which is the finding worth keeping: this
// script was written for the invariants the Dominion console does not check, and
// the size bounds are in that same category, but they were never added. The hub
// measured the gap first: `hub_check.py`'s own docstring records "Aurora's
// finding, 2026-09-10: its own `npm run check:lane-status` reported OK on a file
// with 22 rows and four titles over 240 characters." A 245 character title
// passed this script again on 2026-09-12 and a human downstream caught it.

// BOUND 1 of 3: a queue row's `title` is at most MAX_TITLE_CHARS code points.
const longTitles = queue
  .map((q, i) => ({ id: q?.id ?? `(row ${i}, no id)`, len: [...String(q?.title ?? '')].length }))
  .filter((r) => r.len > MAX_TITLE_CHARS);
if (longTitles.length) {
  problems.push(
    `${longTitles.length} queue row title(s) OVER the ${MAX_TITLE_CHARS} character bound: `
    + longTitles.map((r) => `${r.id} (${r.len} chars, ${r.len - MAX_TITLE_CHARS} over)`).join(', ')
    + '. A title states what the row gets him and its current state in one or two sentences; the '
    + 'history of how it got there (dispatch times, agent deaths, what was verified, who said '
    + "what) goes in this repo's queue doc or docs/OVERSEER-LOG.md, and the row points there by "
    + 'its id.');
}

// BOUND 2 of 3: `queue` holds at most MAX_QUEUE_ROWS rows.
if (queue.length > MAX_QUEUE_ROWS) {
  problems.push(
    `queue holds ${queue.length} rows, OVER the ${MAX_QUEUE_ROWS} row bound by `
    + `${queue.length - MAX_QUEUE_ROWS}. Keep it to the items a fresh session could actually pick `
    + "up and point at this repo's own queue doc for the rest. Dropping a row here is not losing "
    + 'it: a landed row goes to docs/lane-log.jsonl and a parked one to the queue doc.');
}

// BOUND 3 of 3: the whole file is at most MAX_FILE_BYTES BYTES.
if (raw.length > MAX_FILE_BYTES) {
  problems.push(
    `${PATH} is ${raw.length} BYTES, OVER the ${MAX_FILE_BYTES} byte bound by `
    + `${raw.length - MAX_FILE_BYTES}. Measured in bytes on disk, the unit the contract's own `
    + 'recipe (wc -c) uses, not characters and not lines. Dominion reads all six lanes into one '
    + 'payload on every hub check and a fresh session in this lane reads this file at boot, so '
    + 'every reader pays for every night of history left in it.');
}

if (problems.length) {
  console.error('check-lane-status: FAIL');
  for (const p of problems) console.error(`  - ${p}`);
  process.exit(1);
}
const longestTitle = queue.reduce((m, q) => Math.max(m, [...String(q?.title ?? '')].length), 0);
console.log(`check-lane-status: OK: ${queue.length} queue rows, exactly one next (${next[0].id}), no duplicate ids, updatedAt sane.`);
// The measurements are printed on a green run too, so the bounds are visible
// approaching them rather than only once one is broken.
console.log(
  `check-lane-status: bounds: title<=${MAX_TITLE_CHARS} chars (longest ${longestTitle}), `
  + `queue<=${MAX_QUEUE_ROWS} rows (${queue.length}), `
  + `file<=${MAX_FILE_BYTES} bytes (${raw.length}).`);
