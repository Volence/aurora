#!/usr/bin/env node
// Append one entry to docs/lane-log.jsonl, refusing dashes the owner ruled out.
//
// WHY THIS EXISTS RATHER THAN A HABIT. The owner ruled out U+2014 and U+2013 in
// tool text on 2026-09-05. I checked my own compliance by counting those
// CHARACTERS in the raw file, and that check was VACUOUS: JSON.stringify and
// python's json.dumps both escape non-ASCII by default, so a dash written into an
// entry is stored as — and a character count of the file text reports zero
// whether or not one is there. 151 historical entries carry escaped dashes that
// my check never saw. It reported the truth by luck.
//
// So this writes with the escape OFF, which makes a dash visible in the file, and
// refuses on the DECODED string, which makes the check independent of how the
// file happens to spell it. Both halves are needed: writing plainly without
// checking would leave them visible and present; checking without writing plainly
// would keep the blind spot.
import { appendFileSync, readFileSync } from 'node:fs';

const DASHES = /[—–]/g;
const path = 'docs/lane-log.jsonl';
const raw = process.argv[2];
if (!raw) { console.error('usage: append-lane-log.mjs \'<json object>\''); process.exit(2); }

let entry;
try { entry = JSON.parse(raw); } catch (e) { console.error(`not JSON: ${e.message}`); process.exit(2); }
for (const k of ['at', 'headline', 'matters']) {
  if (typeof entry[k] !== 'string' || !entry[k]) { console.error(`missing or empty "${k}"`); process.exit(2); }
}
// Refuse on the DECODED value, so the spelling in the file cannot hide one.
const found = Object.entries(entry).flatMap(([k, v]) =>
  typeof v === 'string' && v.match(DASHES) ? [`${k}: ${v.match(DASHES).length}`] : []);
if (found.length) {
  console.error(`refused, the owner ruled out em and en dashes in tool text: ${found.join(', ')}`);
  process.exit(1);
}
const line = JSON.stringify(entry) + '\n';
if (/\\u201[34]/.test(line)) { console.error('refused: an escaped dash survived the check'); process.exit(1); }
appendFileSync(path, line);
const n = readFileSync(path, 'utf8').trimEnd().split('\n').length;
console.log(`appended, ${n} entries, dash free by decoded check`);
