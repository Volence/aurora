// THE THIRD DOOR ON THE UNSAVED-WORK PERIMETER: the agent's `classic-open-project`.
//
// ═══ THE DEFECT (AGENT-DOOR-UNACTIONABLE-ADVICE, lens sweep) ═════════════════
//
// The two DIALOG doors were fixed to drop Save when nothing dirty has a writer and
// to name the reason (project-open-guard.ts / close-guard.ts). This one still said
// "Save first (Ctrl+S / save tools) or have the user discard, then retry."
// unconditionally, from the same snapshot that already knew Save could not help.
// An agent that obeys it saves, sees the same dirt, and retries forever; and the
// sentence named three dirty domains when the snapshot covers five, so a caller
// looking for what blocked it looked in the wrong stores.
//
// ═══ WHAT MAKES THESE ROWS NON-VACUOUS ══════════════════════════════════════
//
// In a parcel about messages the live hazard is a matcher a DIFFERENT rule
// satisfies, and this perimeter has three doors emitting similar sentences:
// `unsavedDialogBody` ("Nothing here can be saved, so Discard & open or Cancel are
// the only ways out."), `unsavedBlockedMessage` ("unsaved changes remain (save or
// discard them first)"), and this one. So:
//
//   • the no-Save row keys on 'saving will not clear this', which only
//     `unsavedAgentRefusal` emits, and asserts the two dialog tails are ABSENT;
//   • the shared-sentence row does not type the sentence at all. It reads the
//     `unsavable` entry out of the live snapshot and requires the SAME string in
//     the dialog body and in the agent refusal, so a copy that drifted in either
//     place fails here rather than being re-typed into agreement;
//   • the wiring row drives the REAL door (`handleAgentRequest`) rather than the
//     message function, because a correct message the call site does not use is
//     exactly the shape of the defect.
//
// RED-FIRST: proven by restoring the old literal throw in agent-handler.ts (the
// mutation is in the parcel report). Runner:
// `npx vitest run src/renderer/shell/__tests__/agent-open-refusal.test.ts`, inside
// `npm test`'s `vitest run`.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  currentOpenDirtySnapshot, planProjectOpen, unsavedAgentRefusal, unsavedDialogBody,
  unsavedBlockedMessage,
} from '../project-open-guard';
import { handleAgentRequest } from '../../agent/agent-handler';
import { useArtStore } from '../../state/artStore';
import { useEditorStore } from '../../state/editorStore';
import type { ComposerDoc } from '../../../core/art/composer-buffer';

/**
 * The cheapest state in which the perimeter is blocked AND nothing can be saved:
 * a dirty LIVE-TILE composer document. `composerSaveState` returns `blocked` for
 * it (a tile document writes straight to the tileset, so its document-local
 * changes have no writer), which is `anySavable: false` with one `unsavable`
 * sentence. Not invented for the test: it is the first branch of that function.
 */
function openDirtyLiveTileDoc(): void {
  useArtStore.getState().openDocument({
    doc: { width: 8, height: 8, pixels: new Uint8Array(64) } as unknown as ComposerDoc,
    liveTileIndex: 0,
    chunkId: null,
    name: 'tile 0',
    dirty: true,
  });
}

beforeEach(() => {
  useArtStore.getState().closeDocument();
  useEditorStore.getState().markClean();
});

afterEach(() => {
  useArtStore.getState().closeDocument();
  useEditorStore.getState().markClean();
});

describe('the agent open door refuses with advice that can be followed', () => {
  it('does NOT say to save when nothing dirty has a writer', () => {
    openDirtyLiveTileDoc();
    const plan = planProjectOpen(currentOpenDirtySnapshot());
    expect(plan.kind, 'a dirty composer document must block this door').toBe('confirm');
    if (plan.kind !== 'confirm') return;
    expect(plan.offerSave, 'a live-tile document is blocked, so nothing is savable').toBe(false);

    const msg = unsavedAgentRefusal(plan);
    // The instruction that cannot be followed, which is the whole finding.
    expect(msg, 'the door still tells the caller to save work no saver will write')
      .not.toContain('Save first');
    expect(msg, 'and it must say why saving is not the way out')
      .toContain('saving will not clear this');
    // ...and it is not one of the OTHER two doors' sentences, which would make
    // this row satisfiable by a rule it is not about.
    expect(msg).not.toContain('are the only ways out');
    expect(msg).not.toContain('save or discard them first');
  });

  it('DOES say to save when a saver can reach the dirty work', () => {
    // The control on the row above: the same function must keep the old advice
    // where the old advice is correct, or "dropped Save" would just be "dropped".
    const msg = unsavedAgentRefusal({ offerSave: true, unsavable: [] });
    expect(msg).toContain('Save first (Ctrl+S / save tools)');
    expect(msg).not.toContain('saving will not clear this');
  });

  it('names the reason with the SAME sentence the dialog door shows', () => {
    openDirtyLiveTileDoc();
    const snap = currentOpenDirtySnapshot();
    const plan = planProjectOpen(snap);
    if (plan.kind !== 'confirm') throw new Error('the snapshot did not block: this row measured nothing');
    // Derived from the snapshot, not typed here: the point is that all three doors
    // hand the user the same words for the same blocked document.
    expect(snap.unsavable.length, 'the blocked composer document must produce a sentence')
      .toBeGreaterThan(0);
    const sentence = snap.unsavable[0];
    expect(unsavedAgentRefusal(plan)).toContain(sentence);
    expect(unsavedDialogBody('open', plan)).toContain(sentence);
    expect(unsavedBlockedMessage('open', snap)).toContain(sentence);
  });

  it('names every dirty domain the snapshot actually covers', () => {
    // The old sentence said "(classic/aeon/sprite)". Canvas documents and the
    // composer document join this perimeter too and were unlisted, so the two the
    // finding is about were invisible to the caller. Derived from the snapshot's
    // own field names rather than a typed list.
    const msg = unsavedAgentRefusal({ offerSave: true, unsavable: [] });
    const snap = currentOpenDirtySnapshot();
    const domains = Object.keys(snap)
      .filter((k) => k.endsWith('Dirty'))
      .map((k) => k.replace(/Dirty$/, ''));
    expect(domains.length, 'the snapshot must still carry per-domain flags').toBeGreaterThan(3);
    for (const d of domains) {
      // canvas → 'canvas', art → 'composer' (the name the user sees for that
      // document). Everything else is named as the field is.
      const shown = d === 'art' ? 'composer' : d;
      expect(msg, `the refusal does not mention the ${d} domain`).toContain(shown);
    }
  });

  it('the REAL agent door throws that message, not its own literal', async () => {
    openDirtyLiveTileDoc();
    const err = await handleAgentRequest({ kind: 'classic-open-project', dir: '/nowhere' })
      .then(() => null, (e: unknown) => e);
    expect(err, 'the door let an open through over unsaved work').toBeInstanceOf(Error);
    const msg = (err as Error).message;
    expect(msg, 'the call site still carries its own hard-coded advice')
      .not.toContain('Save first');
    expect(msg).toContain('saving will not clear this');
    // And it is the guard's message verbatim, so the two cannot drift apart.
    const plan = planProjectOpen(currentOpenDirtySnapshot());
    if (plan.kind !== 'confirm') throw new Error('the snapshot went clean mid-row');
    expect(msg).toBe(unsavedAgentRefusal(plan));
  });
});
