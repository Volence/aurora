// THE SAVE CONTROL, and the thing it says when a save lands.
//
// Owner card `d-38-save-surface-vocabulary`, answered `name_what_is_true`:
// "A level gets the same Save control the sprite surface has. A save says so
// briefly on screen."
//
// ═══ WHY A LEVEL NEEDED ONE AT ALL ════════════════════════════════════════
//
// UX seat B, cold, 2026-09-07 (`docs/reviews/2026-09-07-lens-ux/uxb-audit.md`
// F7): a level tab's header is `FG · BG · View · Undo · Redo` on six of seven
// aeon facets and `Undo · Redo` on Art, with no Save in the status bar either,
// while the SPRITE document one tab over reads `Undo · Redo · Save`. Two
// document kinds in one tab strip; one advertises its save, the other hid it in
// the `title` attribute of a 6 px dot. Seat A, who could not see seat B, never
// found the gesture at all and guessed Ctrl+S three times (uxa-walk.md F2).
//
// So the answer is the app's own precedent one tab over rather than a new
// invention, and it sits in the SAME PLACE as the sprite header's, last after
// Undo and Redo, so switching between a level tab and a sprite tab does not
// move the control.
//
// ═══ WHAT IT SAYS, AND WHY THE FLASH IS NOT LOCAL STATE ═══════════════════
//
// `shell/SpriteDocHeader.tsx` has carried a "Saved!" flash since it was
// written, in a `useState` next to its own onClick — so it fires for a CLICK
// and cannot fire for Ctrl+S, which is the gesture the dirty dot's own tooltip
// tells the reader to use. This one reads `state/save-receipt.ts` instead, which
// `saveActive`/`saveAllDirty` bump when a save actually WROTE something, so all
// three gestures land the same acknowledgement on the control.
//
// The receipt is bumped only for a save that wrote and did not fail. A Ctrl+S
// the routing did not reach gets `unsavedElsewhereMessage` on the toast channel
// instead, and must not also flash "Saved!" — a control claiming a write that
// did not happen is the same defect class the whole d-38 card is about.
//
// ⚠ THE SPRITE HEADER IS DELIBERATELY NOT RE-HOMED ONTO THIS COMPONENT in this
// parcel. It should be, and then its Ctrl+S would flash too; it is left alone
// because `shell/__tests__/sprite-doc-header.test.ts` pins that header's own
// source text (`setSaveFlash`, `'Saved!'`, its two tooltip sentences) and
// rewriting a guard in the same change that moves the code it guards is how a
// green stops meaning anything. Filed as a follow-up in
// `docs/reviews/2026-09-10-save-surface-vocabulary.md`.

import React, { useEffect, useRef, useState } from 'react';
import { useSessionStore } from '../state/sessionStore';
import { useDirtySnapshot } from './dirty-snapshot';
import { tabHasDirtyDot } from './dirty-tabs';
import { canSaveActive, saveActive } from '../state/project-runtime';
import { useSaveReceipt } from '../state/save-receipt';
import { Chip } from '../components/ui';

/** How long "Saved!" stays on the button. The sprite header's own figure, kept
 *  identical so two Save buttons in one tab strip do not behave differently. */
export const SAVE_FLASH_MS = 1500;

/** The three tooltips, exported so a guard reads THESE rather than a copy. */
export const SAVE_TOOLTIP = 'Save this document (Ctrl+S). Save All is Ctrl+Shift+S';
export const NOTHING_TO_SAVE_TOOLTIP = 'Nothing to save in this document';
/**
 * The dirty-but-not-routable case, and on a LEVEL tab there is exactly one way
 * to reach it, which is why this sentence can be specific rather than vague.
 *
 * `tabHasDirtyDot` on a level tab is `levelDocDirty` OR the aeon composer
 * document's own flag (`shell/dirty-tabs.ts`), and the save routing is
 * registered against the first of those alone. On CLASSIC the composer branch
 * does not apply at all, so `dirty && !canSave` is unreachable there; on aeon
 * it means precisely "the unsaved work on this tab is the art composer's", and
 * the composer has its own Save button on the Art facet.
 */
export const COMPOSER_SAVE_HINT =
  'The unsaved work on this tab is in the art composer, which has its own Save '
  + 'button on the Art facet. Ctrl+Shift+S saves everything that has somewhere to go.';

export default function SaveChip({ noDestinationHint = COMPOSER_SAVE_HINT }: {
  /** Override for a surface whose dirty-but-unsavable case means something else. */
  noDestinationHint?: string;
} = {}) {
  const activeId = useSessionStore((s) => s.activeId);
  const activeKind = useSessionStore((s) => s.tabs.find((t) => t.id === s.activeId)?.kind);
  const dirtySnap = useDirtySnapshot();
  const activeDirty = activeKind ? tabHasDirtyDot(activeId, activeKind, dirtySnap) : false;
  // The coordinator's own verdict, so the button and its click cannot disagree
  // about whether Ctrl+S would write anything.
  const canSave = canSaveActive(activeId);

  const seq = useSaveReceipt((s) => s.seq);
  const [flash, setFlash] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    // seq 0 is "no save has happened in this window": flashing on it would
    // greet every mount with a claim that something was written.
    if (seq === 0) return undefined;
    setFlash(true);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setFlash(false), SAVE_FLASH_MS);
    return () => { if (timer.current) clearTimeout(timer.current); };
  }, [seq]);

  return (
    <Chip
      active={flash}
      // Stays pressable during the flash for the sprite header's reason: a
      // button that goes grey at the same instant it says "Saved!" reads as
      // having broken rather than having worked.
      disabled={!canSave && !flash}
      title={
        canSave ? SAVE_TOOLTIP
          : activeDirty ? noDestinationHint
            : NOTHING_TO_SAVE_TOOLTIP
      }
      onClick={() => { void saveActive(); }}
    >
      {flash ? 'Saved!' : 'Save'}
    </Chip>
  );
}
