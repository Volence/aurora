// Folding a Save-All's per-document outcomes into a BOUNDED number of toasts.
//
// ⚠ WHAT IS PROVEN ABOUT THIS, AND WHAT IS NOT — read before citing it as
// verified. Ruled 2026-08-30 after the fix landed, deliberately recorded here
// rather than left for a reader to assume, because "we fixed the toast flood"
// is the kind of sentence that gets quoted as end-to-end when it is not.
//
//   • PROVEN, producer side: the unit rows beside this file assert the COUNT,
//     with each expectation derived from its fixture's own `ids.length` so it
//     moves with N rather than pinning a literal. Poisons: gutting this fold
//     reddens rows on both surfaces; removing only the reason-preservation
//     reddens only the reason row, so the two halves are independently guarded.
//   • PROVEN, painting side, BY AN EXISTING INSTRUMENT AND NOT BY THIS PARCEL:
//     `scratchpad/toast-overflow-harness.mjs` drives the real app under CDP and
//     shows the screen paints fewer than the store holds, that this is a CAP AND
//     NOT A DROP (two numbers from two places), that the overflow row's count is
//     rebuilt from store and screen rather than compared to a literal, and that
//     the state is escapable. So a flood cannot reach the screen even if a
//     producer regresses.
//   • NOT PROVEN: that a real Save-All GESTURE over several dirty documents
//     yields one toast end to end. That spans gesture → coordinator → saver →
//     this fold, and no instrument crosses it. The node suite cannot see a
//     running app at all.
//
// A harness for that last gap was CONSIDERED AND DECLINED, with the reason, so
// nobody rebuilds the argument: the painting side is already covered above, the
// production side is covered by the rows, and what remains is wiring this parcel
// did not change. If a future change moves WHERE the fold is called from, that
// judgement expires with it — the gap would then be over code that had moved.
//
// THE PROPERTY, and it is a PRODUCTION bound rather than a painting one. The
// toast container caps what is DRAWN; it does not stop a producer from building
// a hundred toast objects, and it is the producer that decides how many distinct
// things the user is asked to read. A save path that says exactly one thing per
// document is right when the user saved ONE document — under Save All the loop
// runs over a set whose size is however many tabs the artist has open with
// unsaved edits, and nothing in it bounds the count. A wall of ten-second errors
// is the pressure that makes someone turn the error channel off, which would
// undo the whole point of moving failures onto it.
//
// THE SHAPE IS NOT INVENTED HERE. It is the one core/formats/effects/scene.ts
// already ships for directory listings, kept identical on purpose so there is
// one idiom and not two:
//   • Nothing → nothing.
//   • Exactly one → the message it always had, WORD FOR WORD. One dirty tab is
//     the common case and its specific reason is the thing the user acts on; a
//     fold that made the common case worse to make the rare case better would
//     not be a fix.
//   • More than one → one summary that COUNTS them and names the first few via
//     `nameSome`, so the count can never render "I could not tell" as zero.
//
// GROUPED BY CHANNEL, because coalescing changes the count and NEVER the
// channel (core/project/notice.ts says the same, and severity is the producer's
// to assign). A failed save folded into a green "saved" line would be the same
// defect wearing the other colour. Each severity present gets at most one
// summary, so the ceiling is the number of channels — a constant — however many
// documents there are.
//
// EVERY DOCUMENT'S OWN REASON SURVIVES. The summary names a sample; every
// outcome is `console.warn`ed individually at the moment it is folded, exactly
// as the effects loaders do. A summary that lost which document failed would
// make the user's next step impossible.

import { useToastStore, type ToastType } from './toastStore';
import { nameSome } from '../../core/project/notice';

/**
 * Where ONE document's save outcome goes. Deliberately the same shape as
 * `addToast` — which is what it defaults to on every single-document path — so a
 * caller that wants to COLLECT outcomes rather than paint them substitutes
 * without the save path knowing which mode it is in.
 */
export type SaveReport = (message: string, type?: ToastType) => void;

/** One document's outcome, as collected by a Save-All loop. */
export interface SaveOutcome {
  /** The document the message is about. Named in the summary and the console. */
  docId: string;
  message: string;
  type: ToastType;
}

/**
 * Collect outcomes from a Save-All loop, then fold them with `reportSaveOutcomes`.
 * Returns the sink to hand each per-document save.
 */
export function collectSaveOutcomes(): {
  outcomes: SaveOutcome[];
  reportFor: (docId: string) => SaveReport;
} {
  const outcomes: SaveOutcome[] = [];
  return {
    outcomes,
    // `type` defaults to 'info' to match addToast's own default, so a save path
    // that omits it is folded onto the channel it would have painted on.
    reportFor: (docId) => (message, type = 'info') => { outcomes.push({ docId, message, type }); },
  };
}

/**
 * Fold collected outcomes onto the toast channel. `noun` names what the
 * documents ARE ('sprite document', 'canvas'), singularised — the summary
 * pluralises it.
 */
export function reportSaveOutcomes(outcomes: readonly SaveOutcome[], noun: string): void {
  if (outcomes.length === 0) return;
  const toast = useToastStore.getState().addToast;
  if (outcomes.length === 1) {
    toast(outcomes[0].message, outcomes[0].type);
    return;
  }
  for (const o of outcomes) console.warn(`[save] ${o.docId}: ${o.message}`);
  // Insertion order, so summaries arrive in the order the channels first
  // occurred rather than in a severity ranking this module would have to invent.
  const byChannel = new Map<ToastType, string[]>();
  for (const o of outcomes) {
    const ids = byChannel.get(o.type);
    if (ids) ids.push(o.docId); else byChannel.set(o.type, [o.docId]);
  }
  for (const [type, ids] of byChannel) {
    const what = type === 'error' ? 'could not be fully saved' : 'were saved with something to report';
    toast(
      `${ids.length} ${noun}${ids.length === 1 ? '' : 's'} ${what} — ${nameSome(ids)}. ` +
      'Each one and its own reason is in the developer console.',
      type,
    );
  }
}
