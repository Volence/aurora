// The BgAnim band agent surface, driven through `handleAgentRequest` — the same
// entry point MCP and Aether both reach.
//
// registry-conformance.test.ts already proves the five methods are advertised on
// both transports and have handler cases. What it cannot prove is that the cases
// DO anything, which is this file:
//
//   • that each mutation reaches the PROJECT's document and lands as exactly one
//     undo step on the act's stack, from a tab that owns no history (these tools
//     are ambient, like the scene tools);
//   • that PROMOTION works on a document at capacity and ADDITION refuses there,
//     which is the whole reason the two are separate methods;
//   • that a refusal is THROWN with the codec's words rather than returned as a
//     cheerful `{changed:false}` — an MCP client cannot tell the second from
//     success;
//   • that `list_bg_anim_bands` reports the file's readability, because an
//     unreadable file is a document nothing may be written to.
//
// THE FIXTURE IS THE REAL b0e5a661 DOCUMENT, and a capacity-padded copy of it.
// A hand-built two-tile stub would let every one of these pass while the tools
// were useless on the only content that exists.

import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { handleAgentRequest } from '../agent-handler';
import { useProjectStore } from '../../state/projectStore';
import { useSessionStore } from '../../state/sessionStore';
import { useWorkspaceStore } from '../../workspace/workspaceStore';
import { documentHistoryHub } from '../../state/history-hub';
import type { AgentRequest } from '../../../shared/agent-protocol';
import type { Color } from '../../../core/model/s4-types';
import {
  BGANIM_MAX_BANDS, BG_TILE_CAPACITY, TILE_PIXELS,
  parseBgOverride, type BgOverrideDocument,
} from '../../../core/formats/bg-override/bg-override';
import type { BgOverrideState } from '../../../core/formats/bg-override/bg-override-io';

const FIXTURE = 'test/fixtures/bg-override/editor_bg_override.b0e5a661.json';
const doc = (): BgOverrideDocument => parseBgOverride(readFileSync(FIXTURE, 'utf8')).doc;

/** The fixture padded to BG_TILE_CAPACITY — the shape aeon's live file ships in. */
function fullDoc(): BgOverrideDocument {
  const d = doc();
  while (d.tiles.length < BG_TILE_CAPACITY) d.tiles.push(new Array<number>(TILE_PIXELS).fill(0));
  return d;
}

const black = (): Color => ({ r: 0, g: 0, b: 0, a: 255 });
const line = () => ({ colors: Array.from({ length: 16 }, black) });

function fakeProject(bgOverride: BgOverrideState): never {
  return {
    zones: [{
      id: 'ojz', name: 'OJZ',
      tileset: { tiles: [] },
      palette: { lines: [line(), line(), line(), line()] },
      acts: [{
        id: 'act1', name: 'act1', gridWidth: 1, gridHeight: 1,
        sections: [{ sceneRef: null, objects: [], rings: [] }],
      }],
    }],
    chunkLibrary: [],
    bgLibrary: [],
    effectsScenes: { scenes: [], unreadable: [], notices: [] },
    bgOverride,
  } as never;
}

const state = (d: BgOverrideDocument | null, unreadable: BgOverrideState['unreadable'] = null):
  BgOverrideState => ({
  path: 'data/editor_bg_override.json', doc: d, unreadable, loadedText: null, notices: [],
});

const ask = (req: AgentRequest) => handleAgentRequest(req as never);
const held = () => useProjectStore.getState().project!.bgOverride.doc;
const bandCount = () => (held()?.anims ?? []).length;
const actHistory = () => documentHistoryHub.historyFor('level:ojz:act1');

function open(s: BgOverrideState): void {
  documentHistoryHub.clearAll();
  useProjectStore.getState().reset();
  useWorkspaceStore.getState().reset();
  useProjectStore.setState({ project: fakeProject(s) });
  useProjectStore.getState().setCurrentAct('ojz', 'act1');
  // Ambient by design: the tools must work from a tab that owns no history.
  useSessionStore.setState({ activeId: 'tool:project-setup' });
}

describe('list_bg_anim_bands', () => {
  it('reports the document\'s bands, its budgets, and that the file was readable', async () => {
    open(state(doc()));
    const r = await ask({ kind: 'list-bg-anim-bands' }) as Record<string, never>;
    expect(r.present).toBe(true);
    expect(r.unreadable).toBeNull();
    const bands = r.bands as unknown as Record<string, unknown>[];
    expect(bands).toHaveLength(2);
    expect(bands.map((b) => `${b.cols}x${b.rows}@${b.slotBase}`)).toEqual(['32x4@0', '16x4@128']);
    // The effective value AND whether the file spells it — an agent that read
    // only the first would write today's default into a file that was tracking
    // the contract's.
    expect(bands.every((b) => b.driverIsExplicit === true)).toBe(true);
    const budget = r.budget as unknown as Record<string, number>;
    expect(budget.tileCapacity).toBe(BG_TILE_CAPACITY);
    expect(budget.maxBands).toBe(BGANIM_MAX_BANDS);
    expect(budget.tileSlotsRemaining).toBe(BG_TILE_CAPACITY - doc().tiles.length);
    // The AXIS, in the same two-part shape the driver has — the effective value
    // and whether the file spells it. An agent that read only the first would
    // drop `axis` off a band that claims vertical (writer obligation 3), and
    // aeon's shimmer guard cannot see a band that no longer claims it.
    expect(bands.every((b) => b.axis === 'horizontal')).toBe(true);
    expect(bands.every((b) => b.axisIsExplicit === false)).toBe(true);
    // The fact that decides which authoring door to reach for, on every reply —
    // and the correction that a driver is not an axis, which is now sharper
    // rather than absent: the `axis` key is what says which way a band moves.
    expect(String(r.note)).toMatch(/NEVER an axis/);
    expect(String(r.note)).toMatch(/`axis` key/);
  });

  it('says so when there is no file, without erroring', async () => {
    open(state(null));
    const r = await ask({ kind: 'list-bg-anim-bands' }) as Record<string, never>;
    expect(r.present).toBe(false);
    expect(r.bands).toEqual([]);
  });

  it('names an UNREADABLE file — a document nothing may be written to', async () => {
    open(state(null, { path: 'data/editor_bg_override.json', reason: 'not valid JSON' }));
    const r = await ask({ kind: 'list-bg-anim-bands' }) as Record<string, never>;
    expect(r.present).toBe(false);
    expect(r.unreadable).toEqual({ path: 'data/editor_bg_override.json', reason: 'not valid JSON' });
  });
});

describe('promote_bg_anim_band', () => {
  beforeEach(() => open(state(doc())));

  it('reaches the PROJECT document and records ONE undo step on the act stack', async () => {
    const before = bandCount();
    const base = (await ask({ kind: 'list-bg-anim-bands' }) as Record<string, never>)
      .budget as unknown as { firstPromotableSlot: number };
    const r = await ask({
      kind: 'promote-bg-anim-band', cols: 2, rows: 1, staticBase: base.firstPromotableSlot,
    }) as Record<string, unknown>;

    expect(r.promoted).toBe(true);
    // The store, not the reply — a reply built from a stale reference would say
    // the right thing about a document the project never received.
    expect(bandCount()).toBe(before + 1);
    expect(actHistory().canUndo).toBe(true);

    actHistory().undo();
    expect(bandCount()).toBe(before);
    expect(actHistory().canUndo).toBe(false);   // ONE step, not two
  });

  it('does not grow the tile blob — that is what makes it work on a full document', async () => {
    const tilesBefore = held()!.tiles.length;
    await ask({ kind: 'promote-bg-anim-band', cols: 2, rows: 1, staticBase: 192 });
    expect(held()!.tiles).toHaveLength(tilesBefore);
  });

  it('WORKS at capacity, where add refuses', async () => {
    open(state(fullDoc()));
    expect(held()!.tiles).toHaveLength(BG_TILE_CAPACITY);      // anti-vacuous
    await ask({ kind: 'promote-bg-anim-band', cols: 2, rows: 1, staticBase: 192 });
    expect(bandCount()).toBe(3);
  });

  it('THROWS the codec\'s refusal for a range inside an existing band', async () => {
    await expect(ask({ kind: 'promote-bg-anim-band', cols: 1, rows: 1, staticBase: 0 }))
      .rejects.toThrow(/already belong/);
    expect(bandCount()).toBe(2);     // and nothing was written
  });

  it("carries `phaseFill` through: 'shift' banks are the range rolled 1px per bank", async () => {
    // Deterministic, x-asymmetric art in the promoted range, planted so the
    // roll cannot be an identity by accident — and DERIVED here independently,
    // through a whole-pixel-grid roll rather than the module's per-tile math.
    const d = doc();
    d.tiles[192] = Array.from({ length: TILE_PIXELS }, (_, i) => ((i % 8) * 3 + (i >> 3)) & 0xF);
    d.tiles[193] = Array.from({ length: TILE_PIXELS }, (_, i) => ((i % 8) * 7 + (i >> 3) + 5) & 0xF);
    open(state(d));

    await ask({ kind: 'promote-bg-anim-band', cols: 2, rows: 1, staticBase: 192, phaseFill: 'shift' });
    const band = held()!.anims!.at(-1)!;
    // cols=2, rows=1: the band's pixel grid is 16x8, column-major tiles.
    const grid = (tiles: number[][]): number[][] => Array.from({ length: 8 }, (_, y) =>
      Array.from({ length: 16 }, (_, x) => tiles[x >> 3][y * 8 + (x & 7)]));
    const g0 = grid(band.phases![0]);
    expect(band.phases![0]).toEqual([d.tiles[192], d.tiles[193]]);   // bank 0 untouched
    for (let k = 1; k < band.phases!.length; k++) {
      const expected = g0.map((line) => line.map((_, x) => line[(x + k) % 16]));
      expect(grid(band.phases![k])).toEqual(expected);
      expect(band.phases![k]).not.toEqual(band.phases![0]);          // anti-vacuous
    }
  });

  it('leaves `driver` out unless asked, and writes it when asked', async () => {
    await ask({ kind: 'promote-bg-anim-band', cols: 1, rows: 1, staticBase: 192 });
    let bands = (await ask({ kind: 'list-bg-anim-bands' }) as { bands: Record<string, unknown>[] }).bands;
    expect(bands.at(-1)!.driverIsExplicit).toBe(false);

    await ask({
      kind: 'promote-bg-anim-band', cols: 1, rows: 1, staticBase: 193, driver: 'timer',
    });
    bands = (await ask({ kind: 'list-bg-anim-bands' }) as { bands: Record<string, unknown>[] }).bands;
    expect(bands.at(-1)!.driverIsExplicit).toBe(true);
    expect(bands.at(-1)!.driver).toBe('timer');
  });
});

describe('add_bg_anim_band', () => {
  it('works where there ARE free slots, and grows the blob by exactly the band', async () => {
    open(state(doc()));
    const tilesBefore = held()!.tiles.length;
    await ask({ kind: 'add-bg-anim-band', cols: 2, rows: 1 });
    expect(bandCount()).toBe(3);
    expect(held()!.tiles).toHaveLength(tilesBefore + 2);
  });

  it('REFUSES at capacity, naming the ceiling — the reason promote exists', async () => {
    open(state(fullDoc()));
    // MATCHED ON THE INSERTION RULE'S OWN WORDS, not on "over the BG tile
    // capacity" — which the codec's document-level `tiles.length` validator ALSO
    // says. A matcher loose enough to catch a neighbouring rule's error reports
    // coverage it does not have (bar 2c). "at the front of a N-tile blob" is
    // said by planBandInsertion and by nothing else in the tree.
    await expect(ask({ kind: 'add-bg-anim-band', cols: 1, rows: 1 }))
      .rejects.toThrow(/slot\(s\) at the front of a \d+-tile blob/);
    expect(bandCount()).toBe(2);
  });
});

describe('demote_bg_anim_band and remove_bg_anim_band', () => {
  beforeEach(() => open(state(doc())));

  it('demotion is lossless: the band goes, the blob does not shrink', async () => {
    const tilesBefore = held()!.tiles.length;
    await ask({ kind: 'demote-bg-anim-band', band: 1 });
    expect(bandCount()).toBe(1);
    expect(held()!.tiles).toHaveLength(tilesBefore);
  });

  it('removal REFUSES by default when cells draw the band, and names how many', async () => {
    await expect(ask({ kind: 'remove-bg-anim-band', band: 0 }))
      .rejects.toThrow(/cell\(s\)/);
    expect(bandCount()).toBe(2);
  });

  it('…and goes through, shrinking the blob, once the caller says it meant to', async () => {
    const tilesBefore = held()!.tiles.length;
    const removedTiles = (held()!.anims![0].cols as number) * (held()!.anims![0].rows as number);
    await ask({ kind: 'remove-bg-anim-band', band: 0, blankReferencingCells: true });
    expect(bandCount()).toBe(1);
    expect(held()!.tiles).toHaveLength(tilesBefore - removedTiles);
  });

  it('every mutation refuses when the project has no override document', async () => {
    open(state(null));
    for (const req of [
      { kind: 'promote-bg-anim-band', cols: 1, rows: 1, staticBase: 0 },
      { kind: 'demote-bg-anim-band', band: 0 },
      { kind: 'add-bg-anim-band', cols: 1, rows: 1 },
      { kind: 'remove-bg-anim-band', band: 0 },
    ] as AgentRequest[]) {
      await expect(ask(req)).rejects.toThrow(/no BG override document/);
    }
  });
});

// ---- Band ART (parcel I): the two agent verbs mirror the panel's commands ----
describe('set_bg_override_tiles and regenerate_bg_anim_band_shift', () => {
  beforeEach(() => open(state(doc())));

  const phase0Of = (band: number, offset: number) => held()!.anims![band].phases[0][offset];

  it('a prefix-slot write reaches the band\'s phases[0] in the SAME undo step, on the act stack', async () => {
    const px = new Array<number>(TILE_PIXELS).fill(0xA);
    // Slot 0 is band 0's first slot (the list row above pins 32x4@0).
    expect(held()!.tiles[0]).not.toEqual(px);
    const r = await ask({ kind: 'set-bg-override-tiles', tiles: [{ index: 0, pixels: px }] }) as Record<string, unknown>;
    expect(r.written).toEqual([0]);
    expect(held()!.tiles[0]).toEqual(px);
    expect(phase0Of(0, 0)).toEqual(px);
    expect(actHistory().canUndo).toBe(true);
    actHistory().undo();
    expect(held()!.tiles[0]).not.toEqual(px);
    expect(phase0Of(0, 0)).toEqual(held()!.tiles[0]);
    expect(actHistory().canUndo).toBe(false);
  });

  it('THROWS the codec\'s words on a bad slot rather than returning a cheerful reply', async () => {
    const n = held()!.tiles.length;
    await expect(ask({
      kind: 'set-bg-override-tiles', tiles: [{ index: n, pixels: new Array<number>(TILE_PIXELS).fill(0) }],
    })).rejects.toThrow(/cannot write tile/);
    expect(actHistory().canUndo).toBe(false);
  });

  it('regenerates banks 1..7 from phase 0 as one undo step, and refuses a missing band', async () => {
    const before = JSON.stringify(held()!.anims![0].phases[7]);
    await ask({ kind: 'set-bg-override-tiles', tiles: [{ index: 0, pixels: new Array<number>(TILE_PIXELS).fill(0x9) }] });
    const r = await ask({ kind: 'regenerate-bg-anim-band-shift', band: 0 }) as Record<string, unknown>;
    expect(r.regenerated).toBe(true);
    expect(JSON.stringify(held()!.anims![0].phases[7])).not.toBe(before);
    actHistory().undo();
    actHistory().undo();
    expect(JSON.stringify(held()!.anims![0].phases[7])).toBe(before);
    await expect(ask({ kind: 'regenerate-bg-anim-band-shift', band: 99 })).rejects.toThrow(/band 99/);
  });
});
