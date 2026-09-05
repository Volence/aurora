// "I PRESS ADD A BAND BANK AND IDK WHERE IT IS" — the follow-up, without React.
//
// The node suite cannot see the scroll (no DOM layout, no canvas) and cannot see
// the section open. What it CAN pin is everything the scroll depends on: which
// index the follow-up reads, that a reveal is a one-way door that notifies, and
// — the property the whole task hangs on — that none of it is an undo step.
// The rendered half is the CDP harness's job and is disclosed as such.

import { describe, it, expect, beforeEach } from 'vitest';
import {
  BANDS_SECTION_ID, bandCardDomId, newBandIndexOf, followBand,
} from '../band-follow';
import {
  loadPanelState, savePanelState, isCollapsed, togglePanel, revealPanel, subscribePanelState,
} from '../../shell/panel-state';
import { useEditorStore } from '../../state/editorStore';
import { focusedHistory } from '../../state/editorStore';
import type { AnyCommand } from '../../../core/editing/commands';
import type { BgOverrideBand } from '../../../core/formats/bg-override/bg-override';

// panel-state IS localStorage, and the node environment has none — its
// load/save swallow the throw and return {}, so without this stub every reveal
// row would pass vacuously by asserting nothing about anything.
const store = new Map<string, string>();
(globalThis as unknown as { localStorage: Storage }).localStorage = {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => { store.set(k, v); },
  removeItem: (k: string) => { store.delete(k); },
  clear: () => { store.clear(); },
  key: (i: number) => [...store.keys()][i] ?? null,
  get length() { return store.size; },
} as Storage;

const BAND = { cols: 1, rows: 1, phases: [] } as unknown as BgOverrideBand;

const addAt = (bandIndex: number): AnyCommand => ({
  type: 'set-bg-override-band', sectionIndex: -1, adding: true, band: BAND,
  plan: { bandIndex, slotBase: 0, tileCount: 1, staticBase: null,
    layout: [], tiles: [] },
} as unknown as AnyCommand);

const removeAt = (bandIndex: number): AnyCommand =>
  ({ ...(addAt(bandIndex) as unknown as Record<string, unknown>), adding: false } as unknown as AnyCommand);

describe('newBandIndexOf: the index the MODEL used, not "it must be the last one"', () => {
  it('reads the plan the command carries', () => {
    // `planBandInsertion` records `bandIndex: at` (bg-anim-band.ts:614) and the
    // command holds the plan (commands.ts:285-291). Re-deriving "bands.length"
    // would be wrong the first time an insertion is not an append.
    expect(newBandIndexOf(addAt(0))).toBe(0);
    expect(newBandIndexOf(addAt(3))).toBe(3);
  });

  it('is null for the REMOVE direction of the same command type', () => {
    // Following a removal would scroll to a card that is about to stop existing.
    expect(newBandIndexOf(removeAt(2))).toBeNull();
  });

  it('is null for a command that is not a band command at all', () => {
    expect(newBandIndexOf({ type: 'set-tiles', sectionIndex: 0, entries: [] } as unknown as AnyCommand))
      .toBeNull();
  });
});

describe('bandCardDomId: a card that can be addressed at all', () => {
  it('is stable, distinct per band, and a legal DOM id', () => {
    expect(bandCardDomId(0)).toBe('aeon-band-card-0');
    expect(bandCardDomId(0)).not.toBe(bandCardDomId(1));
    expect(bandCardDomId(7)).toMatch(/^[A-Za-z][\w-]*$/);
  });
});

describe('revealPanel: a ONE-WAY door that actually notifies', () => {
  beforeEach(() => { savePanelState({}); });

  it('opens a section that persisted state had shut', () => {
    savePanelState(togglePanel({}, BANDS_SECTION_ID, false)); // now collapsed
    expect(isCollapsed(loadPanelState(), BANDS_SECTION_ID, true)).toBe(true);
    revealPanel(BANDS_SECTION_ID);
    expect(isCollapsed(loadPanelState(), BANDS_SECTION_ID, true)).toBe(false);
  });

  it('beats defaultCollapsed, which is the whole case: both band sections default shut', () => {
    expect(isCollapsed(loadPanelState(), BANDS_SECTION_ID, true)).toBe(true);
    revealPanel(BANDS_SECTION_ID);
    expect(isCollapsed(loadPanelState(), BANDS_SECTION_ID, true)).toBe(false);
  });

  it('NOTIFIES, which is the half a plain savePanelState does not do', () => {
    // `CollapsibleSection` snapshots panel state into its own useState at mount,
    // so a write with no notification changes localStorage and re-renders
    // nothing — the reveal would be a silent no-op.
    let woken = 0;
    const off = subscribePanelState(() => { woken++; });
    savePanelState({ ...loadPanelState(), 'aeon.something': false });
    expect(woken).toBe(0);
    revealPanel(BANDS_SECTION_ID);
    expect(woken).toBe(1);
    off();
    revealPanel(BANDS_SECTION_ID);
    expect(woken).toBe(1);
  });

  it("leaves every other section's state alone", () => {
    savePanelState({ 'aeon.other': true });
    revealPanel(BANDS_SECTION_ID);
    expect(loadPanelState()['aeon.other']).toBe(true);
  });
});

describe('followBand: chrome, and PROVABLY not a second undo step', () => {
  beforeEach(() => {
    savePanelState({});
    useEditorStore.setState({ bandLensTarget: null, bandReveal: null });
  });

  it('selects the band, opens the section, and raises a scroll request', () => {
    followBand(4);
    expect(useEditorStore.getState().bandLensTarget).toEqual({ kind: 'band', index: 4 });
    expect(isCollapsed(loadPanelState(), BANDS_SECTION_ID, true)).toBe(false);
    expect(useEditorStore.getState().bandReveal?.index).toBe(4);
  });

  it('a repeat on the SAME index is a NEW request, both after a clear and without one', () => {
    // Add, undo, add again lands on the same index. An effect keyed on a bare
    // number would not fire the second time and the panel would not scroll.
    followBand(2);
    const first = useEditorStore.getState().bandReveal;
    // Without a clear: the nonce advances, so the value is not equal to itself.
    followBand(2);
    const second = useEditorStore.getState().bandReveal;
    expect(second).not.toEqual(first);
    expect(second?.nonce).toBe((first?.nonce as number) + 1);
    // After the panel consumes it: a fresh non-null request for the same index.
    useEditorStore.getState().clearBandReveal();
    expect(useEditorStore.getState().bandReveal).toBeNull();
    followBand(2);
    expect(useEditorStore.getState().bandReveal?.index).toBe(2);
  });

  it('⚠ NONE OF IT IS AN EDIT: no history is created or grown', () => {
    // The requirement is "a single undoable action". Everything followBand
    // touches is outside the document — zustand chrome, localStorage, a toast —
    // and `EditHistory.execute` is the only thing that pushes an undo entry.
    followBand(1);
    followBand(2);
    const h = focusedHistory();
    expect(h === null || !h.canUndo).toBe(true);
  });
});
