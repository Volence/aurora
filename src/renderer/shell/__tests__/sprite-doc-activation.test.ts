// Sprite-doc tabs are DOCUMENTS (spec §4.4): focusing one checks its document
// out and parks the outgoing one, so two sprite tabs keep their own pixels and
// their own undo stacks. Task 7 built the store side of that and left it dormant
// — nothing called openSpriteDoc/activateSpriteDoc, so every sprite shared the
// untitled document and a sprite tab's Ctrl+Z drove an empty stack. These tests
// cover the wiring that woke it up.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  planSpriteDocActivation,
  activateSpriteDocTarget,
  requestCloseTab,
  __setSpriteModuleForTest,
} from '../tab-activation';
import { untitledSpriteTab, UNTITLED_SPRITE_TAB_ID } from '../tabs';
import { useConfirmStore } from '../../state/confirmStore';
import { useSpriteStore, UNTITLED_SPRITE_DOC_ID } from '../../state/spriteStore';
import { documentHistoryHub } from '../../state/history-hub';
import { focusedHistory } from '../../state/editorStore';
import { useSessionStore } from '../../state/sessionStore';
import { createBuffer } from '../../../core/art/pixel-ops';

describe('planSpriteDocActivation', () => {
  it('no-op when the doc is already checked out', () => {
    expect(planSpriteDocActivation({
      tabId: 'doc:sprite:aeon:motobug', activeDocId: 'doc:sprite:aeon:motobug', isOpen: true,
    })).toEqual({ kind: 'none' });
  });
  it('CHECKS OUT an already-open doc instead of reloading it', () => {
    // Reloading would throw away the very edits + history multi-document exists
    // to keep, which is why the old "Discard & open" confirm had to go.
    expect(planSpriteDocActivation({
      tabId: 'doc:sprite:aeon:motobug', activeDocId: UNTITLED_SPRITE_DOC_ID, isOpen: true,
    })).toEqual({ kind: 'checkout' });
  });
  it('opens a doc that has never been opened', () => {
    expect(planSpriteDocActivation({
      tabId: 'doc:sprite:aeon:motobug', activeDocId: UNTITLED_SPRITE_DOC_ID, isOpen: false,
    })).toEqual({ kind: 'open', engine: 'aeon', ref: 'motobug' });
  });
  it('opens regardless of dirtiness — parking the outgoing doc discards nothing', () => {
    expect(planSpriteDocActivation({
      tabId: 'doc:sprite:s1:42', activeDocId: 'doc:sprite:aeon:motobug', isOpen: false,
    })).toEqual({ kind: 'open', engine: 's1', ref: '42' });
  });
  it('rejects malformed ids', () => {
    expect(planSpriteDocActivation({
      tabId: 'doc:sprite:junk', activeDocId: UNTITLED_SPRITE_DOC_ID, isOpen: false,
    })).toEqual({ kind: 'none' });
  });

  it('the untitled tab is its OWN case — never a loader ref', () => {
    // There is nothing on disk called "untitled": routing it down the load path
    // would toast a bogus failure and roll the tab straight back.
    expect(planSpriteDocActivation({
      tabId: UNTITLED_SPRITE_TAB_ID, activeDocId: 'doc:sprite:aeon:motobug', isOpen: false,
    })).toEqual({ kind: 'untitled' });
    // …and it is still a no-op when already checked out.
    expect(planSpriteDocActivation({
      tabId: UNTITLED_SPRITE_TAB_ID, activeDocId: UNTITLED_SPRITE_TAB_ID, isOpen: true,
    })).toEqual({ kind: 'none' });
  });
});

// --- Activation glue -------------------------------------------------------
// The loaders are stubbed through the module seam (the real ones need window.api
// and a canvas). Each stub paints a distinctive pixel so a document's identity is
// visible in its frames.

const AEON_TAB = 'doc:sprite:aeon:motobug';
const S1_TAB = 'doc:sprite:s1:13';

function frameFilledWith(value: number) {
  const buf = createBuffer(8, 8);
  buf.data.fill(value);
  return buf;
}

/**
 * Stub loaders that load a one-frame sprite whose pixels identify the sprite.
 * `aeonOk: false` reports failure the way the REAL loader does — it toasts and
 * resolves false rather than rejecting; `aeonThrows` is the rarer hard failure.
 */
function stubLoaders(opts: { aeonOk?: boolean; aeonThrows?: boolean; s1Ok?: boolean } = {}) {
  const calls: string[] = [];
  __setSpriteModuleForTest({
    loadSpriteByName: async (name: string) => {
      calls.push(`aeon:${name}`);
      if (opts.aeonThrows) throw new Error('load failed');
      if (opts.aeonOk === false) return false;
      useSpriteStore.getState().loadSprite([frameFilledWith(1)], [], 4, 4);
      return true;
    },
    editObjectArtCheckout: async (id: number) => {
      calls.push(`s1:${id}`);
      if (opts.s1Ok === false) return false;
      useSpriteStore.getState().loadSprite([frameFilledWith(2)], [], 4, 4);
      return true;
    },
  });
  return calls;
}

beforeEach(() => {
  useSpriteStore.getState().closeAll();
  documentHistoryHub.clearAll();
  useSessionStore.getState().reset();
});

afterEach(() => {
  __setSpriteModuleForTest(null);
  useSpriteStore.getState().closeAll();
});

describe('activateSpriteDocTarget', () => {
  it('opens a document for the tab and checks it out', async () => {
    const calls = stubLoaders();

    expect(await activateSpriteDocTarget(AEON_TAB)).toBe(true);

    expect(calls).toEqual(['aeon:motobug']);
    expect(useSpriteStore.getState().activeDocId).toBe(AEON_TAB);
    expect(useSpriteStore.getState().frames[0].data[0]).toBe(1);
  });

  it('re-focusing an OPEN document checks it out without reloading', async () => {
    const calls = stubLoaders();
    await activateSpriteDocTarget(AEON_TAB);
    await activateSpriteDocTarget(S1_TAB);
    calls.length = 0;

    expect(await activateSpriteDocTarget(AEON_TAB)).toBe(true);

    expect(calls).toEqual([]);                                   // no reload
    expect(useSpriteStore.getState().activeDocId).toBe(AEON_TAB);
    expect(useSpriteStore.getState().frames[0].data[0]).toBe(1); // its own pixels are back
  });

  it('keeps each tab\'s pixels and edits when switching between them', async () => {
    stubLoaders();
    await activateSpriteDocTarget(AEON_TAB);
    useSpriteStore.getState().setBuffer(frameFilledWith(7)); // edit the aeon sprite

    await activateSpriteDocTarget(S1_TAB);
    expect(useSpriteStore.getState().frames[0].data[0]).toBe(2); // the S1 sprite, untouched

    await activateSpriteDocTarget(AEON_TAB);
    expect(useSpriteStore.getState().frames[0].data[0]).toBe(7); // the edit survived the round trip
  });

  it('gives each sprite tab its OWN undo stack across a tab switch', async () => {
    stubLoaders();
    await activateSpriteDocTarget(AEON_TAB);
    useSpriteStore.getState().setBuffer(frameFilledWith(7));   // one edit on the aeon doc
    await activateSpriteDocTarget(S1_TAB);                      // switch away

    // The S1 tab has its own (empty) stack — Ctrl+Z here must do nothing.
    useSessionStore.setState({ activeId: S1_TAB });
    expect(focusedHistory()!.canUndo).toBe(false);

    // Back on the aeon tab, its edit is still undoable — and undoing it restores
    // the loaded pixels rather than the other document's.
    await activateSpriteDocTarget(AEON_TAB);
    useSessionStore.setState({ activeId: AEON_TAB });
    expect(focusedHistory()!.canUndo).toBe(true);
    focusedHistory()!.undo();
    expect(useSpriteStore.getState().frames[0].data[0]).toBe(1);
  });

  it('dirtiness is per document — a parked doc stays dirty, a fresh one is clean', async () => {
    stubLoaders();
    await activateSpriteDocTarget(AEON_TAB);
    useSpriteStore.getState().setBuffer(frameFilledWith(7)); // dirties the aeon doc
    await activateSpriteDocTarget(S1_TAB);

    const s = useSpriteStore.getState();
    expect(s.isDirty(AEON_TAB)).toBe(true);   // parked, still unsaved
    expect(s.isDirty(S1_TAB)).toBe(false);
  });

  it('a failed load leaves the previous document checked out, with no empty doc behind', async () => {
    stubLoaders({ s1Ok: false });
    await activateSpriteDocTarget(AEON_TAB);

    expect(await activateSpriteDocTarget(S1_TAB)).toBe(false);

    const s = useSpriteStore.getState();
    expect(s.activeDocId).toBe(AEON_TAB);          // back where the user was
    expect(s.frames[0].data[0]).toBe(1);           // showing its content, not a blank canvas
    expect(s.isOpen(S1_TAB)).toBe(false);          // the half-opened doc is gone
    expect(documentHistoryHub.has(S1_TAB)).toBe(false);
  });

  it('a rejecting loader rolls back the same way', async () => {
    stubLoaders({ aeonThrows: true });

    expect(await activateSpriteDocTarget(AEON_TAB)).toBe(false);

    expect(useSpriteStore.getState().activeDocId).toBe(UNTITLED_SPRITE_DOC_ID);
    expect(useSpriteStore.getState().isOpen(AEON_TAB)).toBe(false);
  });

  it('a FAILED aeon sprite load rolls back instead of opening a blank document', async () => {
    // loadSpriteByName toasts its failures and resolves — it never rejects — so
    // the aeon branch used to set loaded = true regardless and strand the user on
    // the blank 32x32 placeholder document this flow creates before loading.
    stubLoaders({ aeonOk: false });

    expect(await activateSpriteDocTarget(AEON_TAB)).toBe(false);

    const s = useSpriteStore.getState();
    expect(s.isOpen(AEON_TAB)).toBe(false);                  // no empty doc left behind
    expect(s.activeDocId).toBe(UNTITLED_SPRITE_DOC_ID);
    expect(documentHistoryHub.has(AEON_TAB)).toBe(false);
  });

  it('a failed aeon load from a live document puts that document back', async () => {
    stubLoaders({ s1Ok: true });
    await activateSpriteDocTarget(S1_TAB);          // a real document in front
    __setSpriteModuleForTest({
      loadSpriteByName: async () => false,          // …and an aeon sprite that won't load
      editObjectArtCheckout: async () => true,
    });

    expect(await activateSpriteDocTarget(AEON_TAB)).toBe(false);

    const s = useSpriteStore.getState();
    expect(s.activeDocId).toBe(S1_TAB);
    expect(s.frames[0].data[0]).toBe(2);            // showing its content, not a blank canvas
    expect(s.isOpen(AEON_TAB)).toBe(false);
  });

  it('serializes overlapping activations so a load can never land in the other document', async () => {
    // Both loaders write into whatever is CHECKED OUT when they resolve; running
    // them concurrently used to splice one sprite's pixels (and its save-back
    // target) into the other's document.
    stubLoaders();
    const [a, b] = await Promise.all([
      activateSpriteDocTarget(AEON_TAB),
      activateSpriteDocTarget(S1_TAB),
    ]);

    expect([a, b]).toEqual([true, true]);
    const s = useSpriteStore.getState();
    expect(s.activeDocId).toBe(S1_TAB);
    expect(s.frames[0].data[0]).toBe(2);                       // S1 content
    expect(s.docs.get(AEON_TAB)!.frames[0].data[0]).toBe(1);   // aeon content, uncorrupted
  });
});

// --- The untitled "New Sprite…" tab ----------------------------------------
//
// Without it a pure-aeon project with no bindings yet can never reach the sprite
// editor at all: SpriteMode mounts only for an active sprite-doc tab, and every
// creator of one is gated on an object already bound to a saved sprite — which
// only Export, inside that editor, can produce.

const HOME = { id: 'home', kind: 'home' as const, title: 'Home' };

describe('the untitled sprite tab', () => {
  it('checks out the untitled document without touching any loader', async () => {
    const calls = stubLoaders();
    await activateSpriteDocTarget(AEON_TAB);          // something else in front

    expect(await activateSpriteDocTarget(UNTITLED_SPRITE_TAB_ID)).toBe(true);

    expect(calls).toEqual(['aeon:motobug']);          // nothing new was loaded
    expect(useSpriteStore.getState().activeDocId).toBe(UNTITLED_SPRITE_DOC_ID);
  });

  it('keeps its pixels while parked behind another sprite tab', async () => {
    stubLoaders();
    useSpriteStore.getState().setBuffer(frameFilledWith(9)); // draw on the untitled doc
    await activateSpriteDocTarget(AEON_TAB);
    expect(useSpriteStore.getState().frames[0].data[0]).toBe(1);

    await activateSpriteDocTarget(UNTITLED_SPRITE_TAB_ID);
    expect(useSpriteStore.getState().frames[0].data[0]).toBe(9);
  });

  it('does not collide with a real sprite tab — both stay open, each with its own pixels', async () => {
    stubLoaders();
    useSpriteStore.getState().setBuffer(frameFilledWith(9));
    await activateSpriteDocTarget(AEON_TAB);

    const s = useSpriteStore.getState();
    expect(s.isOpen(UNTITLED_SPRITE_TAB_ID)).toBe(true);
    expect(s.isOpen(AEON_TAB)).toBe(true);
    expect(s.docs.get(UNTITLED_SPRITE_TAB_ID)!.frames[0].data[0]).toBe(9);
  });

  it('closing it confirms (no save-back target), and Cancel keeps the tab', async () => {
    useSessionStore.setState({ tabs: [HOME, untitledSpriteTab()], activeId: UNTITLED_SPRITE_TAB_ID });
    useSpriteStore.getState().setBuffer(frameFilledWith(9)); // dirty, unsaveable

    const p = requestCloseTab(UNTITLED_SPRITE_TAB_ID);
    useConfirmStore.getState().answer('cancel');
    await p;

    expect(useSessionStore.getState().tabs.map((t) => t.id))
      .toEqual([HOME.id, UNTITLED_SPRITE_TAB_ID]);
    expect(useSpriteStore.getState().frames[0].data[0]).toBe(9); // work intact
  });

  it('Discard closes it and drops the document + its undo stack', async () => {
    useSessionStore.setState({ tabs: [HOME, untitledSpriteTab()], activeId: UNTITLED_SPRITE_TAB_ID });
    useSpriteStore.getState().setBuffer(frameFilledWith(9));

    const p = requestCloseTab(UNTITLED_SPRITE_TAB_ID);
    useConfirmStore.getState().answer('discard');
    await p;

    expect(useSessionStore.getState().tabs.map((t) => t.id)).toEqual([HOME.id]);
    expect(documentHistoryHub.has(UNTITLED_SPRITE_TAB_ID)).toBe(false);
    // The store always holds SOME untitled document (it is the fallback for a
    // closed checkout) — but a blank one, not the discarded drawing.
    expect(useSpriteStore.getState().frames[0].data[0]).toBe(0);
  });

  it('reopening after a discard gives a fresh blank document, not a dead checkout', async () => {
    useSessionStore.setState({ tabs: [HOME, untitledSpriteTab()], activeId: UNTITLED_SPRITE_TAB_ID });
    stubLoaders();
    await activateSpriteDocTarget(AEON_TAB);  // park the untitled doc…
    await requestCloseTab(UNTITLED_SPRITE_TAB_ID);   // …clean, so no confirm; drops it from the map

    expect(useSpriteStore.getState().isOpen(UNTITLED_SPRITE_TAB_ID)).toBe(false);

    // A plain activateSpriteDoc would silently no-op here and leave the AEON doc
    // checked out under an "Untitled Sprite" tab.
    expect(await activateSpriteDocTarget(UNTITLED_SPRITE_TAB_ID)).toBe(true);
    expect(useSpriteStore.getState().activeDocId).toBe(UNTITLED_SPRITE_DOC_ID);
    expect(useSpriteStore.getState().frames[0].data[0]).toBe(0);
  });
});
