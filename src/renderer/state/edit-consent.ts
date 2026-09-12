// THE CONSENT TOKEN FOR A PROJECT SWITCH (SWITCH-WINDOW-EDIT-DROPPED, remedy c1).
// Measurement: docs/reviews/2026-09-12-switch-window-measure.md. Delivery:
// docs/reviews/2026-09-12-switch-window-fix.md.
//
// WHAT WENT WRONG. The unsaved-work guard runs BEFORE a switch loads, never after.
// While the new project loads (the classic bridge's reads, the aeon loader's
// reads, the recents IPC), the project being left stays fully editable: no
// surface reads any "switch in flight" signal, and an agent's requests are not
// serialized behind a user's open. An edit landing in that window went onto the
// resident project and was then thrown away when the switch committed, with no
// dialog: the level reset, the aeon project replaced, or (aeon to classic) the
// aeon edit stranded behind classic precedence where no saver can reach it.
//
// WHAT THIS MODULE IS. The edit counters as they stood when the switch was
// agreed to, and the one question each commit point asks of them: has anything
// this commit would discard been edited since? If so the open does NOT commit.
// It fails exactly the way a failed open already fails (classicProjectStore's
// `fail`, the aeon loader's `setError`): the resident project stays open with its
// edits, its dirty flag and its undo, and the reason goes out on the error
// channel that already exists. No new dialog and no new on-screen state; that
// was ruled (remedies (a) and (b) stay out).
//
// WHEN THE TOKEN IS TAKEN. At consent: right after the guard answers on the
// user road (hooks/useProject.ts), at the Setup tab's own dialog answer
// (components/setup/ProjectSetupTab.tsx), and, for a door with no dialog at all
// (the agent's `classic-open-project`, the debug hooks), at the door's start,
// which is what the two primitives' default argument does.
//
// WHAT IS IN IT, and why each part. Each field is MONOTONIC in edits and moved by
// nothing else, because a field that moves for a non-edit reason refuses a
// legitimate open (the risk the measurement packet names).
//   classic   classicLevelStore's edit serial. NOT `domainGen`: `openAct` and
//             `reset` put that back to `{}`, and neither is an edit.
//   aeon      editorStore's edit serial, bumped in `markDirty` and `markUndone`.
//             NOT `dirtyActs`, which goes down on an undo and to `{}` on a save
//             or a discard.
//   sprites / canvases / composer
//             the dirty-document sets the unsaved-work guard already reads. They
//             belong here because the documents are lost at a switch just as a
//             level is (resetProjectRuntime closes every one of them when the
//             session key changes, and the aeon commit replaces the composer
//             document outright), and the guard closes all of them at consent, so
//             on a guarded door any dirty one at the commit was opened and edited
//             inside the window. A SET, not a counter: the stores have no
//             monotonic edit counter to read, and on every door where a loss is
//             possible the set is empty at consent (the guard closed them; the
//             agent door refuses on any dirt), so "newly dirty" is exactly "edited
//             since consent" there.
//
// WHAT A COMMIT DISCARDS is the commit point's to say, not this module's: the
// CommitLoses argument. A classic re-validate of the same directory keeps the
// sprite and canvas documents (the session key does not change), so a document
// edited during it must not refuse the re-open; it would lose nothing.

import { classicEditSerial } from './classicLevelStore';
import { aeonEditSerial } from './editorStore';
import { dirtySpriteDocIds } from './spriteStore';
import { dirtyCanvasDocIds } from './canvasStore';
import { useArtStore, type OpenDocument } from './artStore';

export interface EditConsent {
  /** `classicEditSerial()` at consent. */
  readonly classic: number;
  /** `aeonEditSerial()` at consent. */
  readonly aeon: number;
  /** `dirtySpriteDocIds()` at consent. */
  readonly sprites: ReadonlySet<string>;
  /** `dirtyCanvasDocIds()` at consent. */
  readonly canvases: ReadonlySet<string>;
  /**
   * The composer's `open` object at consent, compared by IDENTITY. `markOpenDirty`
   * and `setOpenDirty` replace the object when they change the flag, and
   * `openDocument` installs a new one, so a document that is dirty now and is not
   * this object was dirtied, or opened dirty, since consent.
   */
  readonly composer: OpenDocument | null;
}

/** Read the counters now. Synchronous, so it can sit at the exact instant of consent. */
export function captureEditConsent(): EditConsent {
  return {
    classic: classicEditSerial(),
    aeon: aeonEditSerial(),
    sprites: new Set(dirtySpriteDocIds()),
    canvases: new Set(dirtyCanvasDocIds()),
    composer: useArtStore.getState().open,
  };
}

/**
 * What THIS commit would discard, stated by the commit point. Each `true` is a
 * claim about the code after the check: see the two call sites.
 */
export interface CommitLoses {
  /** The loaded classic act (the level-store reset, or closing the classic project). */
  classicLevel: boolean;
  /** The aeon project in `projectStore`: replaced, or masked behind classic precedence
   *  where the aeon saver cannot reach it. */
  aeonProject: boolean;
  /** Sprite and canvas documents: closed by resetProjectRuntime when the session key changes. */
  documents: boolean;
  /** The aeon composer document: closed at a key change, and replaced by every aeon commit. */
  composer: boolean;
}

/** What was edited since consent, in a fixed order, each named once. */
export type EditedSince = 'level' | 'aeon' | 'document';

export function editedSinceConsent(consent: EditConsent, loses: CommitLoses): EditedSince[] {
  const out: EditedSince[] = [];
  if (loses.classicLevel && classicEditSerial() !== consent.classic) out.push('level');
  if (loses.aeonProject && aeonEditSerial() !== consent.aeon) out.push('aeon');
  const newlyDirty = (now: readonly string[], then: ReadonlySet<string>): boolean =>
    now.some((id) => !then.has(id));
  const open = useArtStore.getState().open;
  const docs = (loses.documents
      && (newlyDirty(dirtySpriteDocIds(), consent.sprites)
        || newlyDirty(dirtyCanvasDocIds(), consent.canvases)))
    || (loses.composer && open?.dirty === true && open !== consent.composer);
  if (docs) out.push('document');
  return out;
}

/**
 * PROVISIONAL WORDING (look-adjacent, flagged for the owner). The single-cause
 * classic sentence is the measurement packet's own example, verbatim.
 */
const NOUN: Record<EditedSince, string> = {
  level: 'the level',
  aeon: 'the aeon project',
  document: 'an open sprite, canvas or art document',
};

export function openCancelledMessage(what: readonly EditedSince[]): string {
  const nouns = what.map((w) => NOUN[w]);
  const list = nouns.length <= 1 ? (nouns[0] ?? '')
    : `${nouns.slice(0, -1).join(', ')} and ${nouns[nouns.length - 1]}`;
  return `Open cancelled: ${list} ${nouns.length > 1 ? 'were' : 'was'} edited while the new `
    + 'project was loading. Save or discard, then open again.';
}

/** The commit points' one call: the cancellation sentence, or null to commit. */
export function editedSinceConsentMessage(consent: EditConsent, loses: CommitLoses): string | null {
  const what = editedSinceConsent(consent, loses);
  return what.length === 0 ? null : openCancelledMessage(what);
}
