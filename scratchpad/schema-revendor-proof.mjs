#!/usr/bin/env node
/**
 * SCHEMA RE-VENDOR PROOF — "description-only", established HERE rather than relayed.
 * ================================================================================
 *
 * Every amendment to `contract/schema/aurora-effects-preset.schema.json` arrives with a
 * commit message that says what it did. This instrument is what makes that a MEASUREMENT
 * instead of a quotation. It takes the OLD vendored bytes and the NEW bytes and produces
 * the TWO INDEPENDENT READINGS the boundary parcel established on 2026-09-03 and recorded
 * in `src/core/formats/effects/aurora-effects-preset.schema.provenance.json`:
 *
 *   READING 1 — PARSED LEAF DIFF. Both documents walked to their scalar leaves, each leaf
 *     keyed by its RFC-6901 JSON pointer. Reports added / removed / changed-in-place
 *     counts and the pointer of every changed leaf. A structural amendment shows
 *     additions and removals; a description-only one shows changes at `…/description`
 *     pointers and nothing else.
 *
 *   READING 2 — STRIPPED COMPARISON. Both documents parsed, EVERY `description` key
 *     removed at EVERY depth, keys sorted, re-serialised. Byte-identical or not, with the
 *     character count of each side.
 *
 * WHY TWO READINGS AND NOT ONE. They fail differently. The leaf diff is blind to a key
 * whose VALUE is an empty container (no leaf under it, so no pointer to compare); the
 * stripped comparison is blind to any change that lives inside a `description`. Neither
 * alone proves "description-only"; the pair does, and DISAGREEMENT BETWEEN THEM IS THE
 * FINDING — this script exits 2 and says so rather than picking the reading it likes.
 *
 * ⚠ WHAT THIS DOES NOT PROVE. "Description-only" at the STRUCTURE level is not
 * "no code change" in Aurora. `src/core/formats/effects/preset.ts` derives numbers by
 * regex from the schema's own SENTENCES (`schemaNumberFromProse`), and a sentence is
 * exactly what a description-only amendment moves. The provenance sidecar says it
 * plainly: "Any future 'description-only' CR must be checked against every
 * schemaNumberFromProse() derivation in preset.ts before it is called a no-op." A green
 * run here means RE-VENDOR RATHER THAN MIGRATION; it does not mean nothing downstream
 * moved. Run the codec suite too.
 *
 * USAGE
 *   npm run harness:schema-revendor
 *       NO ARGUMENTS — runs the SELF-TEST at the foot of this file, which gates
 *       the instrument itself over fixtures whose answers are known by
 *       construction. This is what a sweep of the registered harnesses runs, and
 *       it is why this script can go red without a re-vendor in hand.
 *
 *   node scratchpad/schema-revendor-proof.mjs --old <path> --new <path> [--key description]
 *       JUDGES AN ACTUAL RE-VENDOR.
 *
 * EXIT CODES
 *   0  the two readings AGREE and the amendment is description-only
 *      (self-test mode: every row passes)
 *   1  the two readings AGREE and the amendment is NOT description-only (structure moved)
 *      (self-test mode: a row failed — this instrument no longer distinguishes
 *      the verdicts it exists to distinguish; do not certify a re-vendor with it)
 *   2  the two readings DISAGREE, or an argument/parse failure — never render this green
 *
 * Both paths are taken from argv on purpose. This script names no repository and no
 * sibling checkout: the caller extracts the bytes at a committed revision
 * (`git -C <EMPYREAN_DIR> show <rev>:<path>`, with EMPYREAN_DIR resolved through
 * `test/support/sibling-root.mjs`) and hands the files here.
 */

import { readFileSync } from 'node:fs';

function usage(msg) {
  process.stderr.write(`schema-revendor-proof: ${msg}\n`);
  process.stderr.write(
    'usage: node scratchpad/schema-revendor-proof.mjs --old <path> --new <path> [--key description]\n',
  );
  process.exit(2);
}

const argv = process.argv.slice(2);
function arg(name, fallback) {
  const i = argv.indexOf(`--${name}`);
  if (i === -1) return fallback;
  const v = argv[i + 1];
  if (v === undefined || v.startsWith('--')) usage(`--${name} needs a value`);
  return v;
}

const oldPath = arg('old');
const newPath = arg('new');
/** The key whose changes are permitted by "description-only". */
const PROSE_KEY = arg('key', 'description');
/** No paths at all -> SELF-TEST. See the SELF-TEST block at the foot of this file. */
const SELF_TEST = !oldPath && !newPath;
if (!SELF_TEST && (!oldPath || !newPath)) usage('--old and --new must be given together');

function load(path) {
  let text;
  try {
    text = readFileSync(path, 'utf8');
  } catch (err) {
    usage(`cannot read ${path}: ${err.message}`);
  }
  try {
    return { text, doc: JSON.parse(text) };
  } catch (err) {
    usage(`${path} is not valid JSON: ${err.message}`);
  }
  return null;
}

/** RFC 6901 escaping, so a key containing `/` or `~` cannot forge a pointer. */
function ptrToken(key) {
  return String(key).replace(/~/g, '~0').replace(/\//g, '~1');
}

/**
 * Every SCALAR leaf, keyed by JSON pointer.
 *
 * An EMPTY container is recorded as its own leaf with a sentinel value, because
 * otherwise a key whose value is `{}` or `[]` contributes no pointer at all and this
 * reading would be blind to its addition or removal — the exact blindness the second
 * reading is here to cover, made smaller.
 */
function leaves(node, pointer = '', out = new Map()) {
  if (node !== null && typeof node === 'object') {
    const keys = Array.isArray(node) ? node.map((_, i) => i) : Object.keys(node);
    if (keys.length === 0) {
      out.set(pointer, { empty: Array.isArray(node) ? 'array' : 'object' });
      return out;
    }
    for (const k of keys) leaves(node[k], `${pointer}/${ptrToken(k)}`, out);
    return out;
  }
  out.set(pointer, { scalar: node });
  return out;
}

function sameLeaf(a, b) {
  if ('empty' in a || 'empty' in b) return a.empty === b.empty;
  return Object.is(a.scalar, b.scalar);
}

function describe(leaf) {
  if ('empty' in leaf) return `<empty ${leaf.empty}>`;
  return JSON.stringify(leaf.scalar);
}

/** Recursively drop PROSE_KEY at every depth, then sort keys for a stable serialisation. */
function stripAndSort(node, proseKey = 'description') {
  if (Array.isArray(node)) return node.map((n) => stripAndSort(n, proseKey));
  if (node !== null && typeof node === 'object') {
    const out = {};
    for (const k of Object.keys(node).sort()) {
      if (k === proseKey) continue;
      out[k] = stripAndSort(node[k], proseKey);
    }
    return out;
  }
  return node;
}

/**
 * BOTH READINGS OVER TWO PARSED DOCUMENTS. Pure — no I/O, no exit — so the
 * SELF-TEST at the foot drives the SAME code the CLI drives. A self-test that
 * reimplemented the comparison would prove only that the copy works.
 */
function compare(oldDoc, newDoc, proseKey = 'description') {
  const oldLeaves = leaves(oldDoc);
  const newLeaves = leaves(newDoc);

  const added = [];
  const removed = [];
  const changed = [];
  for (const [ptr, leaf] of newLeaves) {
    if (!oldLeaves.has(ptr)) added.push(ptr);
    else if (!sameLeaf(oldLeaves.get(ptr), leaf)) changed.push(ptr);
  }
  for (const ptr of oldLeaves.keys()) if (!newLeaves.has(ptr)) removed.push(ptr);

  const proseSuffix = `/${ptrToken(proseKey)}`;
  const changedNonProse = changed.filter((p) => !p.endsWith(proseSuffix));
  const reading1 = added.length === 0 && removed.length === 0 && changedNonProse.length === 0;

  const oldStripped = JSON.stringify(stripAndSort(oldDoc, proseKey));
  const newStripped = JSON.stringify(stripAndSort(newDoc, proseKey));
  const reading2 = oldStripped === newStripped;

  return {
    oldLeaves, newLeaves, added, removed, changed, changedNonProse,
    reading1, reading2, oldStripped, newStripped,
    /** 0 description-only · 1 structure moved · 2 the readings DISAGREE. */
    verdict: reading1 !== reading2 ? 2 : (reading1 ? 0 : 1),
  };
}

const L = (s = '') => process.stdout.write(`${s}\n`);

if (SELF_TEST) runSelfTest();   // never returns

const before = load(oldPath);
const after = load(newPath);
const R = compare(before.doc, after.doc, PROSE_KEY);
const {
  oldLeaves, newLeaves, added, removed, changed, changedNonProse,
  reading1: reading1DescriptionOnly, reading2: reading2DescriptionOnly,
  oldStripped, newStripped,
} = R;
const proseSuffix = `/${ptrToken(PROSE_KEY)}`;


L('SCHEMA RE-VENDOR PROOF');
L('======================');
L(`old: ${oldPath}  (${before.text.length} bytes, ${oldLeaves.size} leaves)`);
L(`new: ${newPath}  (${after.text.length} bytes, ${newLeaves.size} leaves)`);
L(`prose key treated as description: ${JSON.stringify(PROSE_KEY)}`);
L();
L('READING 1 — parsed leaf diff');
L(`  added:            ${added.length}`);
L(`  removed:          ${removed.length}`);
L(`  changed-in-place: ${changed.length}`);
for (const p of added) L(`    + ${p} = ${describe(newLeaves.get(p))}`);
for (const p of removed) L(`    - ${p} = ${describe(oldLeaves.get(p))}`);
for (const p of changed) {
  L(`    ~ ${p}${p.endsWith(proseSuffix) ? '' : '   <-- NOT a ' + PROSE_KEY}`);
}
L(`  changed leaves that are NOT ${PROSE_KEY}: ${changedNonProse.length}`);
L(`  verdict: ${reading1DescriptionOnly ? 'DESCRIPTION-ONLY' : 'STRUCTURE MOVED'}`);
L();
L(`READING 2 — every "${PROSE_KEY}" stripped at every depth, keys sorted`);
L(`  old: ${oldStripped.length} characters`);
L(`  new: ${newStripped.length} characters`);
L(`  byte-identical: ${reading2DescriptionOnly ? 'YES' : 'NO'}`);
L(`  verdict: ${reading2DescriptionOnly ? 'DESCRIPTION-ONLY' : 'STRUCTURE MOVED'}`);
L();

if (reading1DescriptionOnly !== reading2DescriptionOnly) {
  L('⚠ THE TWO READINGS DISAGREE. That is the finding — do not pick one.');
  L('  A leaf diff blind to an empty container, or a stripped comparison blind to a');
  L('  change inside a description, is exactly the case this pair exists to surface.');
  process.exit(2);
}

if (reading1DescriptionOnly) {
  L('BOTH READINGS AGREE: this amendment is DESCRIPTION-ONLY.');
  L('⚠ That is re-vendor-not-migration. It is NOT "no code change": preset.ts derives');
  L('  numbers from these sentences. Re-run the codec suite before calling it a no-op.');
  process.exit(0);
}

L('BOTH READINGS AGREE: this amendment MOVED STRUCTURE. It is a migration, not a re-vendor.');
process.exit(1);

// ══════════════════════════════════════════════════════════════════════════════
// SELF-TEST — what `npm run harness:schema-revendor` runs with no arguments.
// ══════════════════════════════════════════════════════════════════════════════
//
// ⚠ WHY THIS EXISTS. Run with no arguments this script has no re-vendor to
// judge, and a script that exits 0 whatever it measured is worse than no script
// (`scratchpad/check-harness-guards.mjs`'s G6 rule, which is what put this block
// here). So the no-argument run gates the INSTRUMENT instead: it drives the same
// `compare()` the CLI drives, over fixtures whose right answer is known by
// construction, and refuses if any verdict moves.
//
// ⚠ THE FIXTURES ARE THE CASES PROVEN BY HAND AT THE bfc000e LANDING —
// including the one that matters most, where the two readings DISAGREE. That
// case is why there are two readings at all: a leaf diff cannot see inside a
// stripped subtree, and a stripped comparison cannot see inside a description.
// If this instrument ever collapses to one reading, [st-e] goes red.
//
// ⚠ AND IT IS NOT A RESTATEMENT. Nothing below reimplements the walk or the
// strip; the fixtures go through the same `compare()`, so a bug in `leaves()` or
// `stripAndSort()` reaches these rows.

function runSelfTest() {
  const base = () => ({
    $id: 'x',
    properties: {
      ramp: { type: 'object', description: 'a sentence', minimum: 1 },
      band: { type: 'object', description: 'another sentence' },
    },
    $defs: { empty: {}, list: [] },
  });

  const rows = [];
  const row = (id, name, ok, detail) => {
    L(`${ok ? 'PASS' : 'FAIL'}  [${id}] ${name}${detail === undefined ? '' : `\n        ${detail}`}`);
    rows.push({ id, ok });
  };

  // [st-a] identical documents — description-only by definition, and the floor
  // the other rows are measured against.
  {
    const r = compare(base(), base());
    row('st-a', 'identical documents read DESCRIPTION-ONLY (verdict 0)',
      r.verdict === 0 && r.added.length === 0 && r.removed.length === 0 && r.changed.length === 0,
      `verdict=${r.verdict} added=${r.added.length} removed=${r.removed.length} `
      + `changed=${r.changed.length}`);
  }

  // [st-b] only descriptions differ — the shape a real attribution amendment has.
  {
    const a = base(); const b = base();
    b.properties.ramp.description = 'a DIFFERENT sentence';
    const r = compare(a, b);
    row('st-b', 'a changed description alone reads DESCRIPTION-ONLY (verdict 0)',
      r.verdict === 0 && r.changed.length === 1
      && r.changed[0] === '/properties/ramp/description' && r.changedNonProse.length === 0,
      `verdict=${r.verdict} changed=${JSON.stringify(r.changed)}`);
  }

  // [st-c] a non-prose leaf moves — both readings must SEE it. THE ANTI-VACUOUS
  // ROW: without it every row above passes on a comparison that always answers
  // "description-only".
  {
    const a = base(); const b = base();
    b.properties.ramp.minimum = 999;
    const r = compare(a, b);
    row('st-c', 'a changed NON-description leaf reads STRUCTURE MOVED (verdict 1)',
      r.verdict === 1 && r.reading1 === false && r.reading2 === false
      && r.changedNonProse.includes('/properties/ramp/minimum'),
      `verdict=${r.verdict} reading1=${r.reading1} reading2=${r.reading2} `
      + `changedNonProse=${JSON.stringify(r.changedNonProse)}`);
  }

  // [st-d] an ADDED key whose value is an EMPTY container. Recorded as its own
  // leaf on purpose — without that this addition contributes no pointer, reading
  // 1 is blind to it while reading 2 is not, and a plain structural change would
  // report a spurious DISAGREE.
  {
    const a = base(); const b = base();
    b.properties.newKey = {};
    const r = compare(a, b);
    row('st-d', 'an added EMPTY container is seen by BOTH readings (verdict 1, not 2)',
      r.verdict === 1 && r.added.includes('/properties/newKey'),
      `verdict=${r.verdict} added=${JSON.stringify(r.added)}`);
  }

  // [st-e] ⚠ THE DISAGREEMENT CASE, and the whole reason there are two readings.
  // A non-prose leaf living INSIDE a description's value: reading 1 flags it (its
  // pointer does not end in /description), reading 2 strips the subtree away and
  // calls the documents identical. The script must REFUSE, not choose.
  {
    const a = base(); const b = base();
    a.properties.ramp.description = { note: 'x', n: 1 };
    b.properties.ramp.description = { note: 'x', n: 2 };
    const r = compare(a, b);
    row('st-e', 'a leaf inside a description makes the readings DISAGREE (verdict 2)',
      r.verdict === 2 && r.reading1 === false && r.reading2 === true,
      `verdict=${r.verdict} reading1=${r.reading1} reading2=${r.reading2}`);
  }

  // [st-f] the prose key is a PARAMETER, not a constant — `--key` really steers
  // BOTH readings, so a contract that spells its prose another way is servable.
  {
    const a = { doc: { gloss: 'one', n: 1 } };
    const b = { doc: { gloss: 'two', n: 1 } };
    row('st-f', '--key steers BOTH readings, not just the leaf diff',
      compare(a, b, 'gloss').verdict === 0 && compare(a, b, 'description').verdict === 1,
      `as gloss=${compare(a, b, 'gloss').verdict} as description=`
      + `${compare(a, b, 'description').verdict}`);
  }

  const bad = rows.filter((r) => !r.ok);
  L();
  L(`==== ${rows.length - bad.length} / ${rows.length} self-test row(s) pass ====`);
  if (bad.length) {
    L(`FAILING: ${bad.map((r) => r.id).join(', ')}`);
    L('This instrument no longer distinguishes the three verdicts it exists to');
    L('distinguish. Do NOT use it to certify a re-vendor until this is green.');
    process.exit(1);
  }
  L('The instrument distinguishes description-only, structure-moved and DISAGREE.');
  L('To judge an actual re-vendor, pass --old and --new (see the header).');
  process.exit(0);
}
