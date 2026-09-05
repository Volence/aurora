// The BG plane's CEILINGS on the agent surface, driven through
// `handleAgentRequest` — the same entry point MCP and Aether both reach — plus
// the MCP schema that gates it one layer earlier.
//
// WHY THIS FILE EXISTS. Before it, `git grep -l 'set_bg\|get_bg' src/` returned
// exactly two files, both implementations: the validation here was completely
// unguarded. And it was wrong in BOTH directions at once (ROADMAP item 8):
//
//   • `BG_MAX_TILES = 512` accepted blobs the hardware cannot hold. The BG tile
//     region is VRAM $8000..$B7FF — `BG_TILE_CAPACITY` tiles — because the
//     sprite attribute table sits at $B800. This is the dangerous half: a loose
//     ceiling takes a document aeon's own injector asserts against, so the
//     refusal arrives at bake time or, worse, as art in the SAT.
//   • `BG_TILES_HIGH = 32` made the engine's full-height nametable
//     (`BG_LAYOUT_WORDS`, 64x64) literally unrepresentable, while `get_bg`
//     announced `height: 32` for every act regardless of what it held.
//
// EVERY EXPECTATION BELOW IS DERIVED. The ceilings come from
// `core/formats/bg-override/bg-override.ts`, which reads them out of the
// vendored `bganim-consumer-contract.json` — the same import the validator
// uses. A typed-in `448` would let the test and the validator drift to
// different numbers and still agree with each other's prose.
//
// BOUNDARY ROWS RUN BOTH WAYS. At the ceiling must pass; one over must refuse.
// A row that only feeds 10000 tiles cannot tell 448 from 512.

import { describe, it, expect, beforeEach } from 'vitest';
import { z } from 'zod';
import { handleAgentRequest } from '../agent-handler';
import { useProjectStore } from '../../state/projectStore';
import { useSessionStore } from '../../state/sessionStore';
import { useWorkspaceStore } from '../../workspace/workspaceStore';
import { documentHistoryHub } from '../../state/history-hub';
import type { AgentRequest } from '../../../shared/agent-protocol';
import type { Color, Tile } from '../../../core/model/s4-types';
import { BG_WIDTH } from '../../../core/formats/bg-tiles';
import {
  BG_LAYOUT_WORDS, BG_LAYOUT_WORDS_LEGACY, BG_TILE_CAPACITY, TILE_PIXELS,
} from '../../../core/formats/bg-override/bg-override';
import { EDITOR_METHODS } from '../../../main/editor-methods';

const BG_ROWS = BG_LAYOUT_WORDS / BG_WIDTH;
const BG_ROWS_LEGACY = BG_LAYOUT_WORDS_LEGACY / BG_WIDTH;

const black = (): Color => ({ r: 0, g: 0, b: 0, a: 255 });
const line = () => ({ colors: Array.from({ length: 16 }, black) });

/** `n` distinct-enough BG tiles in the wire shape set_bg takes. */
function wireTiles(n: number): number[][] {
  return Array.from({ length: n }, (_, i) =>
    Array.from({ length: TILE_PIXELS }, () => i & 0xF));
}

/** The same, in the model shape an act holds. */
function actTiles(n: number): Tile[] {
  return Array.from({ length: n }, (_, i) =>
    ({ pixels: new Uint8Array(TILE_PIXELS).fill(i & 0xF) }));
}

/** A layout of `words` entries, all referencing blob tile 1 (never the blank escape). */
const wireLayout = (words: number): number[] => Array.from({ length: words }, () => 1);

function fakeProject(bgLayout: Uint16Array | null, bgTiles: Tile[] | null): never {
  return {
    zones: [{
      id: 'ojz', name: 'OJZ',
      tileset: { tiles: [] },
      palette: { lines: [line(), line(), line(), line()] },
      acts: [{
        id: 'act1', name: 'act1', gridWidth: 1, gridHeight: 1,
        sections: [{ sceneRef: null, bgLayoutRef: null, objects: [], rings: [] }],
        bgLayout, bgTiles,
      }],
    }],
    chunkLibrary: [],
    bgLibrary: [],
    effectsScenes: { scenes: [], unreadable: [], notices: [] },
    bgOverride: { path: null, doc: null, unreadable: null, loadedText: null, notices: [] },
  } as never;
}

const ask = (req: AgentRequest) => handleAgentRequest(req as never);
const act = () => useProjectStore.getState().project!.zones[0].acts[0];

function open(bgLayout: Uint16Array | null, bgTiles: Tile[] | null): void {
  documentHistoryHub.clearAll();
  useProjectStore.getState().reset();
  useWorkspaceStore.getState().reset();
  useProjectStore.setState({ project: fakeProject(bgLayout, bgTiles) });
  useProjectStore.getState().setCurrentAct('ojz', 'act1');
  useSessionStore.setState({ activeId: 'tool:project-setup' });
}

/** An act carrying the engine's full-height plane and a small blob. */
const openFullHeight = () =>
  open(Uint16Array.from(wireLayout(BG_LAYOUT_WORDS)), actTiles(4));

// ---------------------------------------------------------------------------
// The tile ceiling — the half that was too LOOSE.
// ---------------------------------------------------------------------------

describe('set_bg tile ceiling', () => {
  beforeEach(openFullHeight);

  it('ACCEPTS a blob of exactly BG_TILE_CAPACITY tiles', async () => {
    const r = await ask({
      kind: 'set-bg', layout: wireLayout(BG_LAYOUT_WORDS), tiles: wireTiles(BG_TILE_CAPACITY),
    }) as { tiles: number };
    expect(r.tiles).toBe(BG_TILE_CAPACITY);
    // The STORE, not the reply — a reply is not evidence the act took it.
    expect(act().bgTiles).toHaveLength(BG_TILE_CAPACITY);
  });

  it('REFUSES a blob one tile over BG_TILE_CAPACITY, and writes nothing', async () => {
    expect(act().bgTiles).toHaveLength(4);            // anti-vacuous: a subject exists
    await expect(ask({
      kind: 'set-bg', layout: wireLayout(BG_LAYOUT_WORDS), tiles: wireTiles(BG_TILE_CAPACITY + 1),
    })).rejects.toThrow(new RegExp(
      `BG tile blob holds 1-${BG_TILE_CAPACITY} tiles, got ${BG_TILE_CAPACITY + 1}`));
    expect(act().bgTiles).toHaveLength(4);            // and the act is untouched
  });

  it('refuses for the RIGHT REASON: the hardware region, named', async () => {
    // (c): the row above proves it fires; this one proves the guard that fired
    // is the VRAM-capacity guard and not some other arity check that happens to
    // mention a count. $8000..$B7FF appears in no other refusal on this path.
    await expect(ask({
      kind: 'set-bg', layout: wireLayout(BG_LAYOUT_WORDS), tiles: wireTiles(BG_TILE_CAPACITY + 1),
    })).rejects.toThrow(/\$8000\.\.\$B7FF/);
  });

  it('measures TILE COUNT, not pixels: 512 tiles is the old ceiling and must now refuse', async () => {
    // The literal the surface used to carry. If this passes, the old constant
    // is still in force somewhere on the path.
    await expect(ask({
      kind: 'set-bg', layout: wireLayout(BG_LAYOUT_WORDS), tiles: wireTiles(512),
    })).rejects.toThrow(new RegExp(`BG tile blob holds 1-${BG_TILE_CAPACITY} tiles, got 512`));
  });

  it('still refuses an empty blob', async () => {
    await expect(ask({ kind: 'set-bg', layout: wireLayout(BG_LAYOUT_WORDS), tiles: [] }))
      .rejects.toThrow(new RegExp(`BG tile blob holds 1-${BG_TILE_CAPACITY} tiles, got 0`));
  });
});

// ---------------------------------------------------------------------------
// The height — the half that was too NARROW. Widening, so the legacy shape has
// to keep working: aeon's injector ZERO-PADS a 2048-word layout rather than
// refusing it, so a legacy file is legal input and refusing it here would make
// the agent path unable to write a document the engine bakes fine.
// ---------------------------------------------------------------------------

describe('set_bg layout height', () => {
  beforeEach(openFullHeight);

  it('ACCEPTS the engine\'s full-height BG_LAYOUT_WORDS layout, and it lands at that length', async () => {
    open(Uint16Array.from(wireLayout(BG_LAYOUT_WORDS_LEGACY)), actTiles(4));
    expect(act().bgLayout).toHaveLength(BG_LAYOUT_WORDS_LEGACY);   // starts legacy
    await ask({ kind: 'set-bg', layout: wireLayout(BG_LAYOUT_WORDS), tiles: wireTiles(2) });
    expect(act().bgLayout).toHaveLength(BG_LAYOUT_WORDS);           // and grew
  });

  it('ACCEPTS the legacy BG_LAYOUT_WORDS_LEGACY layout unchanged: the engine zero-pads it', async () => {
    await ask({ kind: 'set-bg', layout: wireLayout(BG_LAYOUT_WORDS_LEGACY), tiles: wireTiles(2) });
    // NOT re-lengthened here: the pad is the consumer's business, and silently
    // rewriting an author's layout is the unrequested edit this arc exists over.
    expect(act().bgLayout).toHaveLength(BG_LAYOUT_WORDS_LEGACY);
  });

  it('REFUSES a length between the two legal ones', async () => {
    // The row that catches "accept anything >= 2048". Halfway is 3072 words —
    // 48 rows, a shape neither the engine nor the injector has any meaning for.
    const between = (BG_LAYOUT_WORDS + BG_LAYOUT_WORDS_LEGACY) / 2;
    await expect(ask({ kind: 'set-bg', layout: wireLayout(between), tiles: wireTiles(2) }))
      .rejects.toThrow(new RegExp(
        `layout must have ${BG_LAYOUT_WORDS} words \\(${BG_WIDTH}x${BG_ROWS}\\)[^]*got ${between}`));
    expect(act().bgLayout).toHaveLength(BG_LAYOUT_WORDS);
  });

  it('REFUSES one word over and one word under each legal length', async () => {
    for (const n of [BG_LAYOUT_WORDS - 1, BG_LAYOUT_WORDS + 1,
      BG_LAYOUT_WORDS_LEGACY - 1, BG_LAYOUT_WORDS_LEGACY + 1]) {
      await expect(ask({ kind: 'set-bg', layout: wireLayout(n), tiles: wireTiles(2) }),
        `layout of ${n} words was accepted`)
        .rejects.toThrow(/the engine's injector zero-pads/);
    }
  });
});

// ---------------------------------------------------------------------------
// get_bg's reported height. The old code announced a constant; the plane has
// two legal heights, so a constant misdescribes one of them by construction.
// ---------------------------------------------------------------------------

describe('get_bg height', () => {
  it('MEASURES the full-height plane rather than announcing a number', async () => {
    openFullHeight();
    const r = await ask({ kind: 'get-bg' }) as { width: number; height: number | null; layout: number[] | null };
    expect(r.layout).toHaveLength(BG_LAYOUT_WORDS);   // anti-vacuous: it saw a plane
    expect(r.width).toBe(BG_WIDTH);
    expect(r.height).toBe(BG_ROWS);
  });

  it('reports the LEGACY height for a legacy act: the same code, a different act', async () => {
    open(Uint16Array.from(wireLayout(BG_LAYOUT_WORDS_LEGACY)), actTiles(4));
    const r = await ask({ kind: 'get-bg' }) as { height: number | null; layout: number[] | null };
    expect(r.layout).toHaveLength(BG_LAYOUT_WORDS_LEGACY);
    expect(r.height).toBe(BG_ROWS_LEGACY);
  });

  it('reports null height when the act has no background, like layout and tiles', async () => {
    open(null, null);
    const r = await ask({ kind: 'get-bg' }) as { height: number | null; layout: number[] | null };
    expect(r.layout).toBeNull();
    expect(r.height).toBeNull();
  });

  it('ROUND-TRIPS: a get_bg result feeds straight back into set_bg', async () => {
    openFullHeight();
    const r = await ask({ kind: 'get-bg' }) as { layout: number[]; tiles: number[][] };
    await ask({ kind: 'set-bg', layout: r.layout, tiles: r.tiles });
    expect(act().bgLayout).toHaveLength(BG_LAYOUT_WORDS);
    expect(act().bgTiles).toHaveLength(4);
  });
});

// ---------------------------------------------------------------------------
// The MCP/Aether schema — the gate with teeth. It runs in the MAIN process,
// BEFORE the handler, so a wrong bound here refuses a legal document with
// INVALID_PARAMS and the handler above never sees it. It is also the text an
// agent reads to decide what to send.
// ---------------------------------------------------------------------------

describe('set_bg MCP schema', () => {
  const method = () => EDITOR_METHODS.find((m) => m.name === 'set_bg')!;
  const schema = () => z.object(method().params as Record<string, z.ZodTypeAny>);

  it('is registered at all', () => {
    expect(method()).toBeTruthy();                  // anti-vacuous
  });

  it('accepts BG_LAYOUT_WORDS words and a BG_TILE_CAPACITY blob', () => {
    const r = schema().safeParse({
      layout: wireLayout(BG_LAYOUT_WORDS), tiles: wireTiles(BG_TILE_CAPACITY),
    });
    expect(r.success, r.success ? '' : JSON.stringify(r.error.issues[0])).toBe(true);
  });

  it('accepts the legacy BG_LAYOUT_WORDS_LEGACY shape', () => {
    expect(schema().safeParse({
      layout: wireLayout(BG_LAYOUT_WORDS_LEGACY), tiles: wireTiles(2),
    }).success).toBe(true);
  });

  it('REFUSES one tile over BG_TILE_CAPACITY', () => {
    const r = schema().safeParse({
      layout: wireLayout(BG_LAYOUT_WORDS), tiles: wireTiles(BG_TILE_CAPACITY + 1),
    });
    expect(r.success).toBe(false);
    // Point the matcher at the FIELD and the BOUND, not at zod's generic prose:
    // `layout` in the same object has its own max, and both produce "too_big".
    expect(r.error!.issues.some((i) =>
      i.path[0] === 'tiles' && JSON.stringify(i).includes(String(BG_TILE_CAPACITY)))).toBe(true);
  });

  it('REFUSES a layout length between the two legal ones', () => {
    const between = (BG_LAYOUT_WORDS + BG_LAYOUT_WORDS_LEGACY) / 2;
    const r = schema().safeParse({ layout: wireLayout(between), tiles: wireTiles(2) });
    expect(r.success).toBe(false);
    expect(r.error!.issues.some((i) => i.path[0] === 'layout')).toBe(true);
  });

  it('PUBLISHES the derived ceilings: the description is the whole spec an agent sees', () => {
    const set = method().description;
    const get = EDITOR_METHODS.find((m) => m.name === 'get_bg')!.description;
    for (const d of [set, get]) {
      expect(d).toContain(String(BG_TILE_CAPACITY));
      expect(d).toContain(`${BG_WIDTH}x${BG_ROWS}`);
      expect(d).toContain(`${BG_WIDTH}x${BG_ROWS_LEGACY}`);
      // The two wrong numbers it used to publish. `max 512 tiles` and a bare
      // `64x32` as THE shape were what an agent budgeted against.
      expect(d).not.toContain('max 512');
    }
    expect(set).toContain(String(BG_LAYOUT_WORDS));
  });
});
