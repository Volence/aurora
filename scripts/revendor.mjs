#!/usr/bin/env node
// Re-vendor a contract document and update EVERY derived field of its provenance
// sidecar, because hand updating them has failed three times in one day.
//
// THE HISTORY, so nobody removes this as ceremony. Vendoring is three edits: the
// bytes, the blob id, and the revision. Each time I did it by hand I updated the
// fields I thought of and missed one:
//   - the schema sidecar: updated vendored.git_blob, missed empyrean.blob, so the
//     file described the new document with one field and the old one with another
//   - the bands sidecar: updated blob and revision, missed vendored.bytes
// Every one was caught by the drift gate, which is the gate working. But the
// defect is that these fields are DERIVABLE and were being retyped. Deriving them
// removes the class rather than asking the next person to be more careful.
//
// It does NOT write the prose. what_changed_at_this_pin is a judgement about the
// diff and belongs to whoever read it.
import { readFileSync, writeFileSync, statSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';

const [doc, sidecar, repo, srcPath, rev] = process.argv.slice(2);
if (!rev) {
  console.error('usage: revendor.mjs <vendored.json> <sidecar.json> <repo> <path-in-repo> <revision>');
  process.exit(2);
}
const git = (...a) => execFileSync('git', ['-C', repo, ...a], { encoding: 'utf8' }).trim();
const full = git('rev-parse', rev);
const bytes = execFileSync('git', ['-C', repo, 'show', `${full}:${srcPath}`], { encoding: 'buffer' });
writeFileSync(doc, bytes);

const onDisk = execFileSync('git', ['hash-object', doc], { encoding: 'utf8' }).trim();
const atRev = git('rev-parse', `${full}:${srcPath}`);
if (onDisk !== atRev) { console.error(`extracted bytes hash ${onDisk}, source says ${atRev}`); process.exit(1); }

const s = JSON.parse(readFileSync(sidecar, 'utf8'));
const before = JSON.stringify(s);
const size = statSync(doc).size;
const sha256 = createHash('sha256').update(readFileSync(doc)).digest('hex');
const set = (o, k, v) => { if (o && k in o) { o[k] = v; return true; } return false; };
const touched = [];
for (const [block, obj, key, val] of [
  ['vendored', s.vendored, 'git_blob', onDisk], ['vendored', s.vendored, 'bytes', size],
  // THE `fixture` BLOCK IS THE SECOND SPELLING OF THE SAME THREE FACTS, and it
  // was missing here until 2026-09-16. test/fixtures/regions/*.provenance.json
  // and the effects sidecars beside them record the vendored copy under
  // `fixture`, not `vendored` -- and `fixture.git_blob` and `fixture.bytes` are
  // exactly what test/formats/aeon-fixture-currency.test.ts reads on every run.
  // With only `vendored` handled, the refusal below fired on every re-vendor of
  // those files and the answer was to retype the three fields by hand, which is
  // the failure class this script exists to remove rather than to relocate.
  ['fixture', s.fixture, 'git_blob', onDisk], ['fixture', s.fixture, 'bytes', size],
  // sha256 is NOT the git blob id (no `blob <len>\0` header) and no gate reads
  // it today, which is exactly why it is derived here: a field nothing checks is
  // the one that goes stale unnoticed.
  ['fixture', s.fixture, 'sha256', sha256],
  ['aeon', s.aeon, 'blob', onDisk], ['aeon', s.aeon, 'revision', full],
  ['empyrean', s.empyrean, 'blob', onDisk], ['empyrean', s.empyrean, 'revision', full],
]) if (set(obj, key, val)) touched.push(`${block}.${key}`);

// Refuse if any field anywhere still names the previous blob.
//
// ⚠ EXCEPT THE PIN HISTORY, WHOSE JOB IS TO NAME PREVIOUS BLOBS. Every sidecar
// that keeps a `pin_history_current_last` records each superseded pin as
// "<blob>, <revision>, <what changed>", so the previous blob is present there BY
// DESIGN and scanning it made the refusal unconditional -- it fired on a sidecar
// where every derived field was already correct, and the only way past it was to
// delete history. The scan below is over the sidecar with the history keys
// removed, so a stale blob left in ANY other field -- prose included -- still
// refuses; the widening is one key wide and it is the key the message already
// told the reader to move things into.
const HISTORY_KEY = /pin_history/;
const prev = JSON.parse(before);
const oldBlob = prev.vendored?.git_blob ?? prev.fixture?.git_blob ?? prev.aeon?.blob ?? prev.empyrean?.blob;
const after = JSON.stringify(s, (k, v) => (HISTORY_KEY.test(k) ? undefined : v));
if (oldBlob && oldBlob !== onDisk && (after.includes(oldBlob) || after.includes(oldBlob.slice(0, 8)))) {
  console.error(`refused: a field still names the previous blob ${oldBlob.slice(0, 8)}; update it or move it into pin history deliberately`);
  process.exit(1);
}
writeFileSync(sidecar, JSON.stringify(s, null, 2) + '\n');
console.log(`re-vendored ${doc} at ${full.slice(0, 8)}, blob ${onDisk.slice(0, 8)}, ${statSync(doc).size} bytes`);
console.log(`sidecar fields derived: ${touched.join(', ')}`);
console.log('prose (what_changed_at_this_pin) is yours to write; it is a judgement about the diff.');
