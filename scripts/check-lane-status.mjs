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

const PATH = 'docs/lane-status.json';
const STATES = new Set(['next', 'doing', 'open', 'blocked']);
const problems = [];

let doc;
try {
  doc = JSON.parse(readFileSync(PATH, 'utf8'));
} catch (e) {
  console.error(`check-lane-status: ${PATH} is not readable JSON: ${e.message}`);
  process.exit(2);
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

if (problems.length) {
  console.error('check-lane-status: FAIL');
  for (const p of problems) console.error(`  - ${p}`);
  process.exit(1);
}
console.log(`check-lane-status: OK: ${queue.length} queue rows, exactly one next (${next[0].id}), no duplicate ids, updatedAt sane.`);
