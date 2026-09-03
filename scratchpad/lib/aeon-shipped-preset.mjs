// ═══════════════════════════════════════════════════════════════════════════
// aeon-shipped-preset — READ A PEER'S DOCUMENT BY PATH, NOT BY LOOKING IT UP
// ═══════════════════════════════════════════════════════════════════════════
//
// Five harnesses in this repo key off `authored_probe` — a preset id that
// belongs to AEON, not to Aurora. All five read it ON PURPOSE: a round trip
// over a document Aurora itself authored proves that Aurora agrees with Aurora,
// and every one of those files says so in its own words. Reading a peer's
// shipped fixture is the technique, not the defect.
//
// ⚠ THE DEFECT IS HOW THE READ WAS SPELLED. Four of the five looked the id up
// THROUGH THE RUNNING APP — `presets().some((p) => p.id === 'authored_probe')`
// or `[...select.options].includes('authored_probe')`. Under that spelling a
// rename in aeon's tree does not say "aeon renamed a file". It says "the select
// did not offer the option" or "the preset is absent", four hundred lines into
// an Electron run, in a repo whose diff is empty — a failure LATER and SOMEWHERE
// ELSE, pointing at Aurora's code rather than at the rename.
//
// AEON HAS BOOKED THAT RENAME. `aeon docs/DEFERRED_WORK.md`, entry
// "PRESET-ID NAMESPACE COLLISION" (booked 2026-09-03T21:38:24Z, their
// `ddaab282`): `ramp_probe` and `authored_probe` are unqualified ids in a
// namespace any lane's panel harness writes into, and both are RESERVED until
// the rename lands. It is a parcel, not a rename — the two ids are bound into
// their generated `effects_scenes.emp`, two `.raster_table` rows in
// `ojz_scroll_test.emp` and five of their tools. They offered to warn this lane
// before pushing it. THE ANSWER GIVEN WAS: do not let Aurora's harnesses become
// the reason aeon cannot rename aeon's own files. This module is that answer.
//
// SO THE READ IS BY PATH, AT IMPORT, BEFORE AN APP IS LAUNCHED. When the
// document is gone the run refuses immediately, in this repo, NAMING THE
// ABSOLUTE PATH and the booking — which is a sentence that tells the reader
// what happened instead of one that makes them go looking.
//
// AND IT ASSERTS THE IDENTITY, not just the existence. `id` inside the file
// must equal the file's own basename. Aeon's rename touches both halves; a
// rename that moved only one is a half-landed parcel, and a harness that
// silently selected the surviving half would report on a document that no
// longer means what its filename says.
//
// ⚠ THIS IS FOR THE **DELIBERATE READ** HALF ONLY. A harness that AUTHORS its
// own fixture must never route through here: its id has to be one no other repo
// would ship (`aurora_local_*` — see the note in ramp-control-harness.mjs for
// the run this rule was paid for), and it must carry an anti-vacuous row
// asserting the fixture is what it claims BEFORE anything reads it. A panel's
// `New` is a namespace WRITE that reads like a namespace ALLOCATION: every
// other allocation in the world fails loudly on a collision, and this one hands
// you the existing document without a word.
//
// NOTHING HERE WRITES. Every entry point is a read of a path the caller names.

import { existsSync, readFileSync } from 'node:fs';
import { basename, isAbsolute, join } from 'node:path';

/** Where aeon keeps the editor's raster-band preset documents, relative to a
 *  project root. One place, so their rename is one edit here. */
export const AEON_PRESET_DIR_REL = 'games/sonic4/data/editor/effects/presets';

/** The one document this repo's harnesses read on purpose. Reserved in aeon's
 *  shared namespace until their rename parcel lands; see the header. */
export const AEON_SHIPPED_PRESET_FILE = 'authored_probe.json';

/** The booking, quoted once, so five refusals cannot drift from each other. */
const BOOKING =
  "aeon has BOOKED a rename of this id (their docs/DEFERRED_WORK.md, entry\n"
  + '  "PRESET-ID NAMESPACE COLLISION", booked 2026-09-03) and it is RESERVED\n'
  + '  until that parcel lands. If the parcel HAS landed, point this harness at\n'
  + '  the new document — edit AEON_SHIPPED_PRESET_FILE in\n'
  + '  scratchpad/lib/aeon-shipped-preset.mjs, or set PRESET_ID for one run.\n'
  + "  ⚠ DO NOT re-create the old document in aeon's tree to make this green.";

/** Absolute path of a shipped preset document inside an aeon project root. */
export function shippedPresetPath(aeonDir, file) {
  const f = file ?? AEON_SHIPPED_PRESET_FILE;
  if (typeof aeonDir !== 'string' || aeonDir.length === 0) {
    throw new Error('shippedPresetPath: no aeon project root was given '
      + `(got ${JSON.stringify(aeonDir)}) — AEON_DIR must name a writable copy of an aeon project`);
  }
  if (!isAbsolute(aeonDir)) {
    throw new Error(`shippedPresetPath: aeon project root must be ABSOLUTE, got ${JSON.stringify(aeonDir)}`);
  }
  return join(aeonDir, AEON_PRESET_DIR_REL, f);
}

/**
 * Read aeon's shipped preset document BY PATH and prove it is the document it
 * claims to be. Throws — naming the absolute path — when it is absent,
 * unreadable, not JSON, carries no `id`, or carries an `id` that disagrees with
 * its own filename.
 *
 * @returns {{path: string, file: string, id: string, name: string|undefined,
 *            bands: number, text: string, doc: object}}
 */
export function readAeonShippedPreset(aeonDir, file) {
  const f = file ?? AEON_SHIPPED_PRESET_FILE;
  const path = shippedPresetPath(aeonDir, f);
  const expectedId = basename(f, '.json');

  if (!existsSync(path)) {
    throw new Error(
      `AEON'S SHIPPED PRESET IS GONE — nothing at\n  ${path}\n`
      + '  This harness reads AEON\'s own document on purpose, so that a green here is not\n'
      + '  Aurora agreeing with itself. There is no subject, so nothing below can be measured.\n'
      + `  ${BOOKING}`);
  }

  let text;
  try {
    text = readFileSync(path, 'utf8');
  } catch (e) {
    throw new Error(`AEON'S SHIPPED PRESET IS UNREADABLE at\n  ${path}\n  ${e.message}`);
  }

  let doc;
  try {
    doc = JSON.parse(text);
  } catch (e) {
    throw new Error(`AEON'S SHIPPED PRESET IS NOT JSON at\n  ${path}\n  ${e.message}\n`
      + `  ${text.length}B read; the harness will not guess what it meant.`);
  }
  if (doc === null || typeof doc !== 'object' || Array.isArray(doc)) {
    throw new Error(`AEON'S SHIPPED PRESET IS NOT AN OBJECT at\n  ${path}\n`
      + `  parsed as ${Array.isArray(doc) ? 'an array' : typeof doc}`);
  }

  if (typeof doc.id !== 'string' || doc.id.length === 0) {
    throw new Error(`AEON'S SHIPPED PRESET CARRIES NO id at\n  ${path}\n`
      + `  keys: ${JSON.stringify(Object.keys(doc))}`);
  }
  // THE HALF-LANDED RENAME. Aeon's parcel moves the filename AND the `id`
  // inside; a tree where only one moved is a document that no longer means what
  // its name says, and a harness that read either half alone would report on it
  // without noticing.
  if (doc.id !== expectedId) {
    throw new Error(
      `AEON'S SHIPPED PRESET DISAGREES WITH ITS OWN FILENAME at\n  ${path}\n`
      + `  the file is named ${JSON.stringify(expectedId)} and the document says id `
      + `${JSON.stringify(doc.id)}.\n`
      + '  That is a HALF-LANDED RENAME, not a preset — refusing rather than picking a half.\n'
      + `  ${BOOKING}`);
  }

  const bands = Array.isArray(doc.bands) ? doc.bands.length : 0;
  return { path, file: f, id: doc.id, name: doc.name, bands, text, doc };
}

/** The id, read out of the document on disk. The one-line form for a harness
 *  that needs the name and not the bytes. */
export function shippedPresetId(aeonDir, file) {
  return readAeonShippedPreset(aeonDir, file).id;
}

/** Escape an id for embedding in a RegExp source string. Harnesses match panel
 *  text against the id they read; a literal typed into a pattern is the thing
 *  this module exists to remove. */
export function reQuote(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
