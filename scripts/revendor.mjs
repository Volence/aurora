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
const set = (o, k, v) => { if (o && k in o) { o[k] = v; return true; } return false; };
const touched = [];
for (const [obj, key, val] of [
  [s.vendored, 'git_blob', onDisk], [s.vendored, 'bytes', statSync(doc).size],
  [s.aeon, 'blob', onDisk], [s.aeon, 'revision', full],
  [s.empyrean, 'blob', onDisk], [s.empyrean, 'revision', full],
]) if (set(obj, key, val)) touched.push(key);

// Refuse if any field anywhere still names the previous blob.
const prev = JSON.parse(before);
const oldBlob = prev.vendored?.git_blob ?? prev.aeon?.blob ?? prev.empyrean?.blob;
const after = JSON.stringify(s);
if (oldBlob && oldBlob !== onDisk && (after.includes(oldBlob) || after.includes(oldBlob.slice(0, 8)))) {
  console.error(`refused: a field still names the previous blob ${oldBlob.slice(0, 8)}; update it or move it into pin history deliberately`);
  process.exit(1);
}
writeFileSync(sidecar, JSON.stringify(s, null, 2) + '\n');
console.log(`re-vendored ${doc} at ${full.slice(0, 8)}, blob ${onDisk.slice(0, 8)}, ${statSync(doc).size} bytes`);
console.log(`sidecar fields derived: ${touched.join(', ')}`);
console.log('prose (what_changed_at_this_pin) is yours to write; it is a judgement about the diff.');
