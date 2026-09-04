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
 *   node scratchpad/schema-revendor-proof.mjs --old <path> --new <path> [--key description]
 *
 * EXIT CODES
 *   0  the two readings AGREE and the amendment is description-only
 *   1  the two readings AGREE and the amendment is NOT description-only (structure moved)
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
if (!oldPath || !newPath) usage('both --old and --new are required');

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
function stripAndSort(node) {
  if (Array.isArray(node)) return node.map(stripAndSort);
  if (node !== null && typeof node === 'object') {
    const out = {};
    for (const k of Object.keys(node).sort()) {
      if (k === PROSE_KEY) continue;
      out[k] = stripAndSort(node[k]);
    }
    return out;
  }
  return node;
}

const before = load(oldPath);
const after = load(newPath);

// ── READING 1 ───────────────────────────────────────────────────────────────────────
const oldLeaves = leaves(before.doc);
const newLeaves = leaves(after.doc);

const added = [];
const removed = [];
const changed = [];
for (const [ptr, leaf] of newLeaves) {
  if (!oldLeaves.has(ptr)) added.push(ptr);
  else if (!sameLeaf(oldLeaves.get(ptr), leaf)) changed.push(ptr);
}
for (const ptr of oldLeaves.keys()) if (!newLeaves.has(ptr)) removed.push(ptr);

const proseSuffix = `/${ptrToken(PROSE_KEY)}`;
const changedNonProse = changed.filter((p) => !p.endsWith(proseSuffix));
const reading1DescriptionOnly =
  added.length === 0 && removed.length === 0 && changedNonProse.length === 0;

// ── READING 2 ───────────────────────────────────────────────────────────────────────
const oldStripped = JSON.stringify(stripAndSort(before.doc));
const newStripped = JSON.stringify(stripAndSort(after.doc));
const reading2DescriptionOnly = oldStripped === newStripped;

// ── OUTPUT ──────────────────────────────────────────────────────────────────────────
const L = (s = '') => process.stdout.write(`${s}\n`);

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
