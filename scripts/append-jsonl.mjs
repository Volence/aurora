#!/usr/bin/env node
// Append ONE record to a .jsonl file the way empyrean contract/LANE_LOG.md rule 7
// and contract/DECISIONS.md rule 8 require (carrying commit empyrean a7b91b4).
//
// ⚠ WHY THIS EXISTS RATHER THAN A `>>`. An ordinary append is correct ONLY when the
// file already ends in a newline. When it does not, the new record glues onto the
// previous one and BOTH are lost as a single unparseable line — the sigil lane hit
// this live on 2026-08-30. The aurora lane's own appends that day were
// newline-TERMINATED but not newline-HEALING, and survived purely because the
// precondition happened to hold every time. A precondition that holds by luck and a
// method that guarantees it produce the same green, which is why this is a script and
// not a habit.
//
// Three steps, in order, all three required:
//   1. HEAL   — if the file exists, is non-empty, and does not end in \n, add one.
//   2. APPEND — exactly one newline-terminated line.
//   3. PARSE  — re-read the WHOLE file and parse every line. A failure is a STOP, and
//               "stop" is pinned by the contract (empyrean 724ad4a, LANE_LOG rule 7):
//               nothing is committed; a GLUED line is split IN PLACE into its two
//               records, in order, so both texts survive; the file is parsed again;
//               only then may a commit be made, and its entry names the repair.
//               ⚠ It is NOT roll-back-and-retry: rolling back discards the new record
//               too. And with the heal step in front of the append this failure should
//               be UNREACHABLE — so a failure arriving anyway is evidence the heal was
//               skipped, which the log entry must say rather than quietly repairing.
//               A line that is not glued (genuine garbage, a truncated write) cannot be
//               split, so that case stops and surfaces without inventing a repair.
//
// Usage:  node scripts/append-jsonl.mjs <file.jsonl> '<one json object>'
//         node scripts/append-jsonl.mjs <file.jsonl> --stdin   (record on stdin)
import { readFileSync, writeFileSync, appendFileSync, existsSync } from 'node:fs';

const [file, arg] = process.argv.slice(2);
if (!file || !arg) {
  console.error('usage: append-jsonl.mjs <file.jsonl> <json|--stdin>');
  process.exit(2);
}

const raw = arg === '--stdin' ? readFileSync(0, 'utf8').trim() : arg;

// Validate BEFORE touching the file: appending a record we already know is bad would
// corrupt a healthy file and then report the corruption as if it were pre-existing.
let record;
try {
  record = JSON.parse(raw);
} catch (e) {
  console.error(`REFUSED, file untouched: the record is not valid JSON — ${e.message}`);
  process.exit(1);
}
if (record === null || typeof record !== 'object' || Array.isArray(record)) {
  console.error('REFUSED, file untouched: a .jsonl record must be a JSON object.');
  process.exit(1);
}

// 1. HEAL
if (existsSync(file)) {
  const before = readFileSync(file, 'utf8');
  if (before.length > 0 && !before.endsWith('\n')) {
    appendFileSync(file, '\n');
    console.error(`HEALED: ${file} did not end in a newline. Without this the previous record and this one would have merged into one unparseable line.`);
  }
}

// 2. APPEND — one line, serialized from the parsed object so the written bytes are
// canonical rather than whatever whitespace the caller passed in.
appendFileSync(file, JSON.stringify(record) + '\n');

// 3. PARSE the whole file
/**
 * Two JSON objects glued into one line, or null. Finds the boundary by TESTING it
 * rather than by pattern-matching `}{`: a brace pair inside a string value would
 * otherwise be chosen as the split point and silently destroy both records.
 */
function splitGlued(line) {
  for (let k = 1; k < line.length; k++) {
    if (line[k] !== '{') continue;
    const head = line.slice(0, k), tail = line.slice(k);
    try {
      const a = JSON.parse(head), b = JSON.parse(tail);
      if (a && typeof a === 'object' && b && typeof b === 'object') return [head, tail];
    } catch { /* not this boundary */ }
  }
  return null;
}

const lines = readFileSync(file, 'utf8').split('\n');
let n = 0;
for (let i = 0; i < lines.length; i++) {
  if (lines[i] === '') continue;
  try {
    JSON.parse(lines[i]);
    n++;
  } catch (e) {
    // Contract remedy: split a GLUED line in place. Detected by finding a boundary
    // where the head parses AND the tail parses — derived by trying the boundaries the
    // text actually offers, never by assuming one `}{` (a `}{` can appear INSIDE a
    // string value, and a split there would destroy both records while reporting a fix).
    const parts = splitGlued(lines[i]);
    if (parts) {
      lines[i] = parts.join('\n');
      writeFileSync(file, lines.join('\n'));
      console.error(`REPAIRED: ${file} line ${i + 1} was TWO records glued into one; split in place, both kept in order.`);
      console.error('⚠ The heal step should have made this unreachable. Its arrival is evidence the heal was skipped — say so in the log entry that carries this repair.');
      const after = readFileSync(file, 'utf8').split('\n');
      let m = 0;
      for (let j = 0; j < after.length; j++) {
        if (after[j] === '') continue;
        try { JSON.parse(after[j]); m++; } catch (e2) {
          console.error(`STOP: re-parse after the repair still fails at line ${j + 1} — ${e2.message}`);
          process.exit(1);
        }
      }
      console.log(`${file}: appended, repaired one glued line, ${m} records, all parse.`);
      process.exit(0);
    }
    console.error(`STOP: ${file} line ${i + 1} does not parse and is NOT two glued records — ${e.message}`);
    console.error('No repair invented. The append is on disk; do NOT commit. Read the line above.');
    process.exit(1);
  }
}
console.log(`${file}: appended, ${n} records, all parse.`);
