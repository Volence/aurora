// Reading and writing `{dataRoot}editor_bg_override.json` as a PROJECT FILE.
//
// THIS MODULE KNOWS NOTHING ABOUT THE FORMAT. Every byte in and every byte out
// goes through `parseBgOverride` / `serializeBgOverride` next door, which are
// the sole reader and the sole writer of record (aurora
// docs/reviews/2026-08-22-bg-override-ownership-ruling.md §5). What lives here
// is only the three facts a *file* has that a *document* does not: where it is,
// whether it was there, and whether what was there could be read.
//
// ABSENT AND UNREADABLE ARE NOT THE SAME FACT — the rule aeon/load.ts's
// markUnreadable states for section sidecars and scene.ts states again for the
// effects library. Both of them arrive here as `doc: null`, and they are told
// apart by `unreadable`:
//
//   • ABSENT is silent and ordinary. A game with no BG override has no file,
//     and the consumer bakes the disabled stub. Nothing is written back.
//
//   • UNREADABLE is loud AND UNTOUCHABLE. The file exists, holds something, and
//     did not parse — so the one thing that must never happen is Aurora writing
//     a repaired-looking document over it. `saveFileFor` returns null in that
//     state, for the same reason buildAeonSavePlan omits a section's unreadable
//     sidecars.
//
// WRITES ONLY WHAT CHANGED. `loadedText` is the exact text the document came
// from, and `saveFileFor` compares the re-serialization against it. Measured
// 2026-08-22 on aeon's live 88,993-byte document at commit 250ff26: the
// round-trip is BYTE-IDENTICAL, so an untouched project saves with no write at
// all rather than an 89 KB no-op diff in someone else's repo. The comparison is
// against the CONTENT rather than against a dirty flag on purpose — a flag can
// be missed by a write path that forgets to set it, and the content cannot.

import type { FileAccess } from '../../project/adapter';
import {
  BgOverrideError,
  bgOverridePath,
  parseBgOverride,
  serializeBgOverride,
  type BgOverrideDocument,
} from './bg-override';

/** The file that exists and could not be read. Same shape as UnreadableScene. */
export interface UnreadableBgOverride {
  /** Project-relative path of the file that could not be parsed. */
  path: string;
  reason: string;
}

/**
 * The BG override document as a project holds it, with the file facts attached.
 *
 * `doc` IS MUTABLE AND IS REPLACED WHOLE. A band edit produces a new document
 * (the plan appliers are pure), so the undo history writes back through this
 * holder — see projectStore's `getActiveLevel`, which exposes `.doc` to the
 * command layer as `level.bgOverride`. The holder is what makes that write
 * survive: an S4Level is a fresh view object built per gesture, so assigning a
 * new document to the VIEW would be discarded, while assigning it to this
 * object (which the project owns) is the edit.
 */
export interface BgOverrideState {
  /** Project-relative path, `{dataRoot}editor_bg_override.json`. */
  path: string;
  /** The document, or null when the file is absent OR unreadable. */
  doc: BgOverrideDocument | null;
  /** Set only in the UNREADABLE case. Absent files leave this null. */
  unreadable: UnreadableBgOverride | null;
  /**
   * The exact text `doc` was parsed from, or null when there was no file.
   *
   * The save comparison base, and deliberately not re-derived by serializing at
   * load: a file whose on-disk spelling differs from the canonical one must
   * still count as "changed" the first time Aurora writes it, and comparing
   * against a re-serialization would hide exactly that.
   */
  loadedText: string | null;
  notices: string[];
}

/**
 * Read `{dataRoot}editor_bg_override.json`.
 *
 * Never throws. Every failure lands in `unreadable` + `notices`, because a
 * project must still open when one optional editor file is broken — and because
 * the fact that it is broken is what stops the save path writing over it.
 */
export async function loadBgOverride(fa: FileAccess, dataRoot: string): Promise<BgOverrideState> {
  const path = bgOverridePath(dataRoot);
  const state: BgOverrideState = { path, doc: null, unreadable: null, loadedText: null, notices: [] };

  let present = false;
  try { present = await fa.exists(path); } catch { present = false; }
  if (!present) return state;

  let text: string;
  try {
    text = new TextDecoder().decode(await fa.read(path));
  } catch (e) {
    const reason = e instanceof Error ? e.message : String(e);
    state.unreadable = { path, reason };
    state.notices.push(
      `${path} exists but could not be read (${reason}). Aurora is ignoring it and will NOT ` +
      'overwrite the file — fix it by hand and reopen.',
    );
    return state;
  }

  try {
    const result = parseBgOverride(text);
    state.doc = result.doc;
    state.loadedText = text;
    state.notices.push(...result.notices);
  } catch (e) {
    const reason = e instanceof BgOverrideError || e instanceof Error ? e.message : String(e);
    state.unreadable = { path, reason };
    state.notices.push(
      `${path} exists but could not be read as a BG override document (${reason}). Aurora is ` +
      'ignoring it and will NOT overwrite the file — fix it by hand and reopen.',
    );
  }
  return state;
}

/**
 * The one write this file may produce, or null for "write nothing".
 *
 * Null in three separate cases, and they are three separate reasons rather than
 * one lenient guard:
 *   • no document at all — there was no file, and inventing one is not a save;
 *   • the file is UNREADABLE — writing there destroys it;
 *   • the re-serialization equals the text the document was loaded from, so
 *     there is nothing to say.
 *
 * THROWS when the document is invalid, and is not caught by callers. The codec
 * is the sole writer, so a document that will not serialize has nothing
 * downstream to catch it before the bake — and a save that silently omitted the
 * file would present to the author as "my band edit didn't stick". Same posture
 * as buildAeonSavePlan's effects-scene write, one section up.
 */
export function saveFileFor(state: BgOverrideState): { path: string; bytes: Uint8Array } | null {
  if (state.doc === null) return null;
  if (state.unreadable !== null) return null;
  const text = serializeBgOverride(state.doc);
  if (text === state.loadedText) return null;
  return { path: state.path, bytes: new TextEncoder().encode(text) };
}
