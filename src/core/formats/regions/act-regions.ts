// WHAT ONE ACT'S `regions.json` LOAD LEARNED, and the value the save reads back.
//
// The codec next door (`document.ts`) turns bytes into a `RegionsDocument` or
// refuses. This file is the part that has to survive the trip from the load to
// the save: not the document, but the LOAD'S VERDICT about the file it came
// from.
//
// ═══ WHY A VERDICT AND NOT JUST `RegionsDocument | null` ═══════════════════
//
// Because `null` would be two different facts wearing one value, which is this
// repository's sharpest recorded defect class (`ActSectionFileLedger` in
// core/model/s4-types.ts carries the long version, and `save.ts`'s
// `understood()` gate is the same guard one directory over):
//
//   • "this act has no regions" — nothing on disk, nothing to save, and a save
//     that creates no file is exactly right;
//   • "this act HAS a regions.json and Aurora refused it" — a truncated
//     hand-edit, a merge-conflict marker, a schema the contract does not know.
//     The model then holds no regions THROUGH NO FAULT OF THE AUTHOR'S, and a
//     save that reads that as "no regions" would delete or overwrite the very
//     file the refusal was protecting.
//
// The three states are therefore spelled out, and a reader can tell them apart:
//
//   | on disk                      | document | loadedPath | unreadable |
//   |------------------------------|----------|------------|------------|
//   | absent (the ordinary case)   | null     | null       | null       |
//   | present and understood       | set      | set        | null       |
//   | present and REFUSED          | null     | null       | set        |
//
// ═══ WHY `loadedPath` IS NOT DERIVED FROM `dataPath` AT SAVE TIME ══════════
//
// It is the ONLY thing that may authorise a deletion, on exactly the terms
// `EffectsSceneLibrary.loadedPaths` states: the removable set comes from what
// this session actually READ, never from what is on disk and never from a path
// the save computed for itself. A save that derived the path and probed for it
// would find — and delete — a file that no load had ever opened.
//
// Deletion matters here in a way it does not for the section sidecars, and the
// reason is the contract, not a preference: `regions` is `minItems: 1` in
// `aurora-regions.schema.json`, so there IS no "cleared regions document" to
// overwrite a stale file with. The meta and chunklinks sidecars answer "the
// author emptied this" by writing an empty body; regions cannot, so the honest
// answer to "the author deleted every region" is to remove the file, gated on
// the load having read it.

import type { RegionsDocument } from './document';
import type { UnreadableItem } from '../../project/notice';

/**
 * One act's regions file, as the LOAD found it. See the header: the three
 * states are distinguishable on purpose and no consumer may collapse them.
 */
export interface ActRegionsState {
  /**
   * The document the load read and the codec accepted, or null when there is
   * none to have. ⚠ NULL IS NOT "this act has no regions" on its own — read
   * `unreadable` first.
   */
  document: RegionsDocument | null;
  /**
   * The project-relative path this load READ a regions document from, or null.
   *
   * The only thing that ever authorises removing the file. Never set for a path
   * that was refused, and never computed by the save.
   */
  loadedPath: string | null;
  /**
   * Set when `{dataPath}regions.json` EXISTS (or the probe could not tell) and
   * the read or the codec refused it. The save must then write nothing and
   * remove nothing for this act.
   */
  unreadable: UnreadableItem | null;
}

/**
 * "Nothing was looked at" — the state a hand-built `Act` fixture carries, and
 * the state an act whose file is absent carries.
 *
 * THEY ARE DELIBERATELY THE SAME VALUE, on the rule `ActSectionFileLedger`
 * states: it yields no writes and no removals, which is the fail-safe direction.
 * A fixture that has never seen a disk cannot make a save destructive.
 */
export function noRegionsLoaded(): ActRegionsState {
  return { document: null, loadedPath: null, unreadable: null };
}

/** The one place `{dataPath}regions.json` is spelled (spec §2.2). */
export function regionsPathFor(dataPath: string): string {
  return `${dataPath}regions.json`;
}

/**
 * A deep copy of a regions document, for the old/new halves of a
 * `set-regions` command.
 *
 * THROUGH JSON, and that is the point rather than a shortcut. The codec's whole
 * design is "hand back the object `JSON.parse` produced, never a rebuild from a
 * field list" — so the clone must not enumerate fields either, or the first key
 * the contract adds is a key undo silently drops. A JSON round trip carries
 * every value a regions document can hold, because the document IS a JSON
 * document; `structuredClone` would too, but it also carries things JSON cannot
 * (a `Date`, a `Map`), and a clone that preserves a value the file cannot is a
 * clone that lets one into the model.
 */
export function cloneRegionsDocument(doc: RegionsDocument): RegionsDocument {
  return JSON.parse(JSON.stringify(doc)) as RegionsDocument;
}

/** The subset of `Act` this writer touches — so a caller needs no whole act. */
export interface HasRegions {
  regions: ActRegionsState;
}

/**
 * THE ONE WRITER of an act's regions document. `set-regions`'s apply and undo
 * both come through here, so the two directions cannot drift apart.
 *
 * ⚠ IT MOVES `document` AND NOTHING ELSE. `loadedPath` and `unreadable` are the
 * LOAD's verdict about a file on disk; an author's edit does not change what the
 * load found, and clearing `unreadable` here would turn "Aurora refused this
 * file" into "there is nothing here" — the collapse `save.ts`'s gate exists to
 * prevent, reintroduced from the other side.
 *
 * It CLONES on the way in. The command's halves are already deep copies the
 * caller owns, so this is the second belt: the act and the command can never end
 * up sharing one object, whatever a future call site forgets, and a command's
 * `oldDocument` therefore still restores after any number of undo/redo cycles.
 */
export function writeActRegionsDocument(act: HasRegions, doc: RegionsDocument | null): void {
  act.regions = {
    ...act.regions,
    document: doc === null ? null : cloneRegionsDocument(doc),
  };
}
