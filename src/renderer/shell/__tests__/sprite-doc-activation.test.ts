// Sprite-doc tabs are DOCUMENTS (spec §4.4): focusing one checks its document
// out and parks the outgoing one, so two sprite tabs keep their own pixels and
// their own undo stacks. Task 7 built the store side of that and left it dormant
// — nothing called openSpriteDoc/activateSpriteDoc, so every sprite shared the
// untitled document and a sprite tab's Ctrl+Z drove an empty stack. These tests
// cover the wiring that woke it up.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  planSpriteDocActivation,
  spriteTabCanResolveWithoutAct,
  activateSpriteDocTarget,
  requestCloseTab,
  __setSpriteModuleForTest,
} from '../tab-activation';
import { useClassicProjectStore } from '../../state/classicProjectStore';
import { useWorkspaceStore } from '../../workspace/workspaceStore';
import { untitledSpriteTab, UNTITLED_SPRITE_TAB_ID } from '../tabs';
import { useConfirmStore } from '../../state/confirmStore';
import { useClassicLevelStore } from '../../state/classicLevelStore';
import { useToastStore } from '../../state/toastStore';
import { useSpriteStore, UNTITLED_SPRITE_DOC_ID } from '../../state/spriteStore';
import { documentHistoryHub } from '../../state/history-hub';
import { focusedHistory } from '../../state/editorStore';
import { useSessionStore } from '../../state/sessionStore';
import { createBuffer } from '../../../core/art/pixel-ops';

describe('planSpriteDocActivation', () => {
  it('no-op when the doc is already checked out', () => {
    expect(planSpriteDocActivation({
      tabId: 'doc:sprite:aeon:motobug', activeDocId: 'doc:sprite:aeon:motobug', isOpen: true, classicActLoaded: true,
    })).toEqual({ kind: 'none' });
  });
  it('CHECKS OUT an already-open doc instead of reloading it', () => {
    // Reloading would throw away the very edits + history multi-document exists
    // to keep, which is why the old "Discard & open" confirm had to go.
    expect(planSpriteDocActivation({
      tabId: 'doc:sprite:aeon:motobug', activeDocId: UNTITLED_SPRITE_DOC_ID, isOpen: true, classicActLoaded: true,
    })).toEqual({ kind: 'checkout' });
  });
  it('opens a doc that has never been opened', () => {
    expect(planSpriteDocActivation({
      tabId: 'doc:sprite:aeon:motobug', activeDocId: UNTITLED_SPRITE_DOC_ID, isOpen: false, classicActLoaded: true,
    })).toEqual({ kind: 'open', engine: 'aeon', ref: 'motobug' });
  });
  it('opens regardless of dirtiness — parking the outgoing doc discards nothing', () => {
    expect(planSpriteDocActivation({
      tabId: 'doc:sprite:s1:42', activeDocId: 'doc:sprite:aeon:motobug', isOpen: false, classicActLoaded: true,
    })).toEqual({ kind: 'open', engine: 's1', ref: '42' });
  });
  it('rejects malformed ids', () => {
    expect(planSpriteDocActivation({
      tabId: 'doc:sprite:junk', activeDocId: UNTITLED_SPRITE_DOC_ID, isOpen: false, classicActLoaded: true,
    })).toEqual({ kind: 'none' });
  });

  it('the untitled tab is its OWN case — never a loader ref', () => {
    // There is nothing on disk called "untitled": routing it down the load path
    // would toast a bogus failure and roll the tab straight back.
    expect(planSpriteDocActivation({
      tabId: UNTITLED_SPRITE_TAB_ID, activeDocId: 'doc:sprite:aeon:motobug', isOpen: false, classicActLoaded: true,
    })).toEqual({ kind: 'untitled' });
    // …and it is still a no-op when already checked out.
    expect(planSpriteDocActivation({
      tabId: UNTITLED_SPRITE_TAB_ID, activeDocId: UNTITLED_SPRITE_TAB_ID, isOpen: true, classicActLoaded: true,
    })).toEqual({ kind: 'none' });
  });
});

// --- Activation glue -------------------------------------------------------
// The loaders are stubbed through the module seam (the real ones need window.api
// and a canvas). Each stub paints a distinctive pixel so a document's identity is
// visible in its frames.

const AEON_TAB = 'doc:sprite:aeon:motobug';
const S1_TAB = 'doc:sprite:s1:13';
const OTHER_S1_TAB = 'doc:sprite:s1:28';
// An s1 sprite doc resolves its art against the OPEN act's zone, so "an act is
// loaded" is the baseline fixture for these tests; the boot-order case that
// clears it has its own describe near the bottom.
const LOADED_ACT = { zone: 'ghz', act: 1, label: 'GHZ 1', available: true };
const spriteTab = (id: string, title: string) =>
  ({ id, kind: 'sprite-doc' as const, title });

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
  useClassicLevelStore.setState({ ref: LOADED_ACT });
});

afterEach(() => {
  __setSpriteModuleForTest(null);
  useSpriteStore.getState().closeAll();
  useClassicLevelStore.setState({ ref: null });
  useConfirmStore.getState().answer('cancel');
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

// --- A sprite tab with no document behind it -------------------------------
//
// The blocking bug: session restore reopened two s1 sprite tabs in a classic
// project with no act loaded yet, their checkouts failed, and the tabs then
// could not be closed — closing one PROMOTED the other, whose activation failed
// again and vetoed the close, re-toasting every time. A tab must be closable
// whatever state its document is in.

describe('closing a sprite-doc tab whose load failed', () => {
  it('closes it, even with no document open for it at all', async () => {
    stubLoaders({ s1Ok: false });
    useSessionStore.setState({ tabs: [HOME, spriteTab(S1_TAB, 'Signpost')], activeId: S1_TAB });
    expect(await activateSpriteDocTarget(S1_TAB)).toBe(false);
    expect(useSpriteStore.getState().isOpen(S1_TAB)).toBe(false);

    await requestCloseTab(S1_TAB);

    expect(useSessionStore.getState().tabs.map((t) => t.id)).toEqual([HOME.id]);
  });

  it('closes even when the PROMOTED neighbour is another sprite tab that cannot load', async () => {
    // The reported blocker exactly: "Signpost" and "Bridge" side by side, neither
    // loadable. Promotion runs the same activation, and its failure used to
    // `return` out of requestCloseTab with the tab still there.
    stubLoaders({ s1Ok: false });
    useSessionStore.setState({
      tabs: [HOME, spriteTab(S1_TAB, 'Signpost'), spriteTab(OTHER_S1_TAB, 'Bridge')],
      activeId: S1_TAB,
    });

    await requestCloseTab(S1_TAB);

    expect(useSessionStore.getState().tabs.map((t) => t.id)).toEqual([HOME.id, OTHER_S1_TAB]);

    // …and the survivor is closable too, so the strip can always be emptied.
    await requestCloseTab(OTHER_S1_TAB);
    expect(useSessionStore.getState().tabs.map((t) => t.id)).toEqual([HOME.id]);
  });
});

// --- s1 sprite tabs restored before any act is loaded ----------------------
//
// An s1 object's art is resolved against the OPEN act's zone, so a restored
// `doc:sprite:s1:<id>` tab genuinely cannot load until one is open. That is the
// EXPECTED boot order, not an error: defer the checkout (silently) and let the
// next focus — after the user opens a level — do it for real.

describe('an s1 sprite tab activated with no classic act loaded', () => {
  beforeEach(() => { useClassicLevelStore.setState({ ref: null }); });
  afterEach(() => { useClassicLevelStore.setState({ ref: null }); });

  it('defers: no loader call, no toast, no half-open document', async () => {
    const calls = stubLoaders({ s1Ok: false });
    useToastStore.setState({ toasts: [] });

    // True: the tab may take focus. It just has no document yet, and App renders
    // it inert rather than showing whatever else is checked out.
    expect(await activateSpriteDocTarget(S1_TAB)).toBe(true);

    expect(calls).toEqual([]);                            // the loader was never reached…
    expect(useToastStore.getState().toasts).toEqual([]);  // …so it could not toast
    expect(useSpriteStore.getState().isOpen(S1_TAB)).toBe(false);
    expect(useSpriteStore.getState().activeDocId).toBe(UNTITLED_SPRITE_DOC_ID);
  });

  it('loads for real on the next focus, once an act IS open', async () => {
    const calls = stubLoaders();
    await activateSpriteDocTarget(S1_TAB);
    expect(calls).toEqual([]);

    useClassicLevelStore.setState({ ref: LOADED_ACT });

    expect(await activateSpriteDocTarget(S1_TAB)).toBe(true);
    expect(calls).toEqual(['s1:13']);
    expect(useSpriteStore.getState().activeDocId).toBe(S1_TAB);
  });

  it('does not defer AEON sprite tabs — library sprites need no act', async () => {
    const calls = stubLoaders();

    expect(await activateSpriteDocTarget(AEON_TAB)).toBe(true);

    expect(calls).toEqual(['aeon:motobug']);
    expect(useSpriteStore.getState().activeDocId).toBe(AEON_TAB);
  });

  it('still CHECKS OUT an s1 document that is already open', async () => {
    // Deferral is about the first load only: a document already in memory needs
    // nothing from the act, so losing the act must not make its tab go inert.
    const calls = stubLoaders();
    useClassicLevelStore.setState({ ref: LOADED_ACT });
    await activateSpriteDocTarget(S1_TAB);
    await activateSpriteDocTarget(AEON_TAB);        // park it
    useClassicLevelStore.setState({ ref: null });
    calls.length = 0;

    expect(await activateSpriteDocTarget(S1_TAB)).toBe(true);

    expect(calls).toEqual([]);
    expect(useSpriteStore.getState().activeDocId).toBe(S1_TAB);
  });

  it('leaves the deferred tab closable', async () => {
    stubLoaders();
    useSessionStore.setState({
      tabs: [HOME, spriteTab(S1_TAB, 'Signpost'), spriteTab(OTHER_S1_TAB, 'Bridge')],
      activeId: S1_TAB,
    });
    await activateSpriteDocTarget(S1_TAB);

    await requestCloseTab(S1_TAB);

    expect(useSessionStore.getState().tabs.map((t) => t.id)).toEqual([HOME.id, OTHER_S1_TAB]);
    expect(useConfirmStore.getState().request).toBeNull(); // nothing to lose, nothing asked
  });
});

// --- Session-restored s1 tabs self-serve their zone context ----------------
//
// The owner bug: reopen the app with an s1 sprite tab active and it landed on
// the "stored per zone … open one of the level tabs" pane until a level tab was
// clicked. The tab now persists the zone/act its checkout resolved against
// (S1ZoneKey in the workspace record), and activation threads that key into
// editObjectArtCheckout — so a restored tab loads with NO act open. Zone-free
// ids (objectArtIsZoneFree — Ring $25, Signpost $0d: one shared art file, no
// per-zone override) never needed a zone, so they self-serve even without a
// persisted key. The deferral remains only for a zone-scoped id with no key
// (a legacy session) — the pane's copy is honest there.

const ZONAL_TAB = 'doc:sprite:s1:28';   // 28 = $1C — GHZ Bridge stump / SLZ Fireball Thrower
const ZONE_FREE_TAB = 'doc:sprite:s1:37'; // 37 = $25 Ring — shared artnem/Rings.nem

describe('spriteTabCanResolveWithoutAct', () => {
  beforeEach(() => {
    useWorkspaceStore.getState().reset();
    useClassicProjectStore.setState({ status: 'open' });
  });
  afterEach(() => {
    useWorkspaceStore.getState().reset();
    useClassicProjectStore.setState({ status: 'closed' });
  });

  it('true for a tab with a persisted zone key (zone-scoped id)', () => {
    useWorkspaceStore.getState().setS1Zone(ZONAL_TAB, { zone: 'slz', act: 1 });
    expect(spriteTabCanResolveWithoutAct(ZONAL_TAB)).toBe(true);
  });

  it('false for a zone-scoped id with no key — the legacy-session deferral survives', () => {
    expect(spriteTabCanResolveWithoutAct(ZONAL_TAB)).toBe(false);
  });

  it('true for a zone-free id even with no key (Ring: one shared art file)', () => {
    expect(spriteTabCanResolveWithoutAct(ZONE_FREE_TAB)).toBe(true);
  });

  it('false whenever the classic project is closed — the checkout needs the dir', () => {
    useClassicProjectStore.setState({ status: 'closed' });
    useWorkspaceStore.getState().setS1Zone(ZONAL_TAB, { zone: 'slz', act: 1 });
    expect(spriteTabCanResolveWithoutAct(ZONAL_TAB)).toBe(false);
    expect(spriteTabCanResolveWithoutAct(ZONE_FREE_TAB)).toBe(false);
  });

  it('false for aeon tabs and non-sprite ids — this is an s1-only question', () => {
    expect(spriteTabCanResolveWithoutAct(AEON_TAB)).toBe(false);
    expect(spriteTabCanResolveWithoutAct('level:ghz:1')).toBe(false);
  });
});

describe('planSpriteDocActivation with canResolveWithoutAct', () => {
  it('opens instead of deferring when the tab can self-serve', () => {
    expect(planSpriteDocActivation({
      tabId: ZONAL_TAB, activeDocId: UNTITLED_SPRITE_DOC_ID,
      isOpen: false, classicActLoaded: false, canResolveWithoutAct: true,
    })).toEqual({ kind: 'open', engine: 's1', ref: '28' });
  });

  it('still defers when it cannot (and when the flag is absent — old callers)', () => {
    expect(planSpriteDocActivation({
      tabId: ZONAL_TAB, activeDocId: UNTITLED_SPRITE_DOC_ID,
      isOpen: false, classicActLoaded: false, canResolveWithoutAct: false,
    })).toEqual({ kind: 'deferred' });
    expect(planSpriteDocActivation({
      tabId: ZONAL_TAB, activeDocId: UNTITLED_SPRITE_DOC_ID,
      isOpen: false, classicActLoaded: false,
    })).toEqual({ kind: 'deferred' });
  });
});

describe('restored-tab activation (no act loaded, classic project open)', () => {
  /** Stub that captures the zone key the runner threads into the s1 checkout. */
  function stubS1Capture(keys: (unknown)[]) {
    __setSpriteModuleForTest({
      loadSpriteByName: async () => true,
      editObjectArtCheckout: async (_id: number, zoneKey?: unknown) => {
        keys.push(zoneKey ?? null);
        useSpriteStore.getState().loadSprite([frameFilledWith(3)], [], 4, 4);
        return true;
      },
    });
  }

  beforeEach(() => {
    useWorkspaceStore.getState().reset();
    useClassicProjectStore.setState({ status: 'open' });
    useClassicLevelStore.setState({ ref: null });
  });
  afterEach(() => {
    useWorkspaceStore.getState().reset();
    useClassicProjectStore.setState({ status: 'closed' });
  });

  it('threads the persisted zone key into the checkout and loads the document', async () => {
    const keys: unknown[] = [];
    stubS1Capture(keys);
    useWorkspaceStore.getState().setS1Zone(ZONAL_TAB, { zone: 'slz', act: 1 });

    expect(await activateSpriteDocTarget(ZONAL_TAB)).toBe(true);

    expect(keys).toEqual([{ zone: 'slz', act: 1 }]);
    expect(useSpriteStore.getState().activeDocId).toBe(ZONAL_TAB);
  });

  it('opens a zone-free tab level-free with NO key, and records none', async () => {
    const keys: unknown[] = [];
    stubS1Capture(keys);

    expect(await activateSpriteDocTarget(ZONE_FREE_TAB)).toBe(true);

    expect(keys).toEqual([null]);
    expect(useSpriteStore.getState().activeDocId).toBe(ZONE_FREE_TAB);
    // "No zone needed" IS the identity — recording a zone here would pin Ring
    // to whatever act happened to serve its representative palette.
    expect(useWorkspaceStore.getState().s1ZoneFor(ZONE_FREE_TAB)).toBeNull();
  });

  it('a successful act-derived checkout RECORDS the zone key (what restore reads)', async () => {
    const keys: unknown[] = [];
    stubS1Capture(keys);
    useClassicLevelStore.setState({ ref: LOADED_ACT });

    expect(await activateSpriteDocTarget(ZONAL_TAB)).toBe(true);

    expect(keys).toEqual([null]); // act-derived: the checkout used the open ref itself
    expect(useWorkspaceStore.getState().s1ZoneFor(ZONAL_TAB)).toEqual({ zone: 'ghz', act: 1 });
  });

  it('a FAILED checkout records nothing and rolls the tab back', async () => {
    __setSpriteModuleForTest({
      loadSpriteByName: async () => true,
      editObjectArtCheckout: async () => false,
    });
    useWorkspaceStore.getState().setS1Zone(ZONAL_TAB, { zone: 'slz', act: 1 });
    const before = useWorkspaceStore.getState().s1ZoneFor(ZONAL_TAB);

    expect(await activateSpriteDocTarget(ZONAL_TAB)).toBe(false);

    expect(useSpriteStore.getState().isOpen(ZONAL_TAB)).toBe(false);
    expect(useWorkspaceStore.getState().s1ZoneFor(ZONAL_TAB)).toEqual(before);
  });
});
