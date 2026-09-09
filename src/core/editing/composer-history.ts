// ONE ART-COMPOSER DOCUMENT'S undo stack. Bound at construction to that
// document's read/write closures, exactly like `SpriteDocHistory` and
// `CanvasDocHistory` — that pair is the precedent this follows, and the reason
// this file is eleven lines of substance: the snapshot engine, the depth cap and
// the listener fan-out are all `SnapshotHistory`'s.
//
// ⚠ WHICH DOCUMENTS MAY OWN ONE IS NOT A DETAIL — it is the whole ruling this
// class exists under, and it is enforced in `renderer/state/artStore.ts`
// (`isPureDocLocal`) rather than here. Only a PURE DOC-LOCAL composer document
// gets a stack: one where EVERY write lands in `open.doc` and nowhere else. A
// chunk document is deliberately excluded, because a pencil stroke on one of its
// atlas-backed cells records a `set-tileset-tiles` command on the ZONE-ART stack
// while its empty cells and every paste/move/transform are doc-local. Giving the
// doc-local half its own stack would put ONE document's gestures on TWO stacks,
// so a single Ctrl+Z would unwind them in an order that is neither the author's
// nor either stack's — the exact defect a live-app finding closed when it created
// the `bgOverride` branch in `editorStore.focusedDocId()` ("Without this, one
// document had two undo stacks interleaved by facet"). See
// docs/reviews/2026-09-09-art-undo-fix.md for what that leaves open.
//
// WHY `dirty` IS IN THE SNAPSHOT and not derived from a counter the way an act's
// is: the composer's dirty flag is not monotone over document kinds. A New Tile
// opens CLEAN and a map capture opens DIRTY ("copied off the map and not yet in
// the library"), so "undone back to the start" means `false` for one and `true`
// for the other, and only the start state itself knows which. Carrying the flag
// in the snapshot makes the answer the document's own rather than a rule about
// documents, and it costs one boolean per entry.

import type { ComposerDoc } from '../art/composer-buffer';
import { cloneComposerDoc } from '../art/composer-buffer';
import { SnapshotHistory } from './snapshot-history';

/** A full snapshot of one composer document for undo/redo. */
export interface ComposerSnapshot {
  doc: ComposerDoc;
  /** `artStore.open.dirty` at the moment the snapshot was taken — see the header. */
  dirty: boolean;
}

/**
 * Entries kept per stack. A composer document is at most 64×64 TILES
 * (`clampDim` in the art facet's launcher), so a worst-case snapshot is 4096
 * cells plus up to 4096 local 64-byte tiles — a few hundred KB, the same order
 * as a canvas document's, so the same cap. Residency is ~N snapshots, not ~2N
 * (see SnapshotHistory's invariant).
 */
export const COMPOSER_MAX_DEPTH = 40;

export function cloneComposerSnapshot(s: ComposerSnapshot): ComposerSnapshot {
  return { doc: cloneComposerDoc(s.doc), dirty: s.dirty };
}

export class ComposerDocHistory extends SnapshotHistory<ComposerSnapshot> {
  constructor(read: () => ComposerSnapshot, write: (s: ComposerSnapshot) => void) {
    super(read, write, COMPOSER_MAX_DEPTH);
  }

  protected clone(s: ComposerSnapshot): ComposerSnapshot { return cloneComposerSnapshot(s); }
}
