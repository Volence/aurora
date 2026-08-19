// The art line at the agent surface: `commit_canvas` and `import_art_sheet`.
//
// WHAT THIS FILE IS FOR — the fault/refusal split, end to end. `commitPixels`
// answers an art decision with `{ok:false, refusal}` in a SUCCESSFUL result,
// because the Aether adapter turns a throw into -32603 "internal error", which
// tells the caller Aurora broke when in fact it decided. Only a genuine fault —
// no act open, an unusable canvas name, bytes that are not an indexed PNG —
// throws. Both halves are asserted here, on the same two tools, so a future
// edit that promotes a refusal to a throw (or demotes a fault to a result) has
// something to break.
//
// The harness is agent-handler.classic.test.ts's, deliberately: the same
// fixtures, the same `openReady`, the same globalThis.window teardown.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { handleAgentRequest } from '../agent-handler';
import { useClassicProjectStore, __resetClassicBridgeForTest } from '../../state/classicProjectStore';
import { useClassicLevelStore } from '../../state/classicLevelStore';
import { documentHistoryHub } from '../../state/history-hub';
import { CANVAS_DIR } from '../../state/canvas-file';
import { encodeIndexedPngForTest } from '../../../core/art/__tests__/helpers/indexed-png-fixture';
import type { LevelDoc } from '../../../core/level-classic/model';
import type { ProjectHandle, ZoneActRef, WriteResult } from '../../../core/project/adapter';
import type { ResolutionReport } from '../../../core/project/report';
import type { CommitRefusal } from '../../../core/art/classic-commit-plan';
import { explainSheetRefusal, sheetRefusalResolution } from '../../../core/art/sheet-import';

// ---------------------------------------------------------------------------
// Fixtures — mirroring agent-handler.classic.test.ts.
// ---------------------------------------------------------------------------

const TILE_COUNT = 5;

function makeDoc(): LevelDoc {
  const chunkCells = () =>
    Array.from({ length: 256 }, () => ({ block: 0, xf: false, yf: false, solidity: 0 }));
  return {
    game: 's1',
    tiles: new Uint8Array(TILE_COUNT * 32),
    blocks: [
      { cells: Array.from({ length: 4 }, () => ({ tile: 0, xf: false, yf: false, pal: 0, pri: false })) },
      { cells: Array.from({ length: 4 }, () => ({ tile: 1, xf: false, yf: false, pal: 1, pri: false })) },
    ],
    chunks: [{ cells: chunkCells() }, { cells: chunkCells() }],
    fg: { width: 2, height: 2, cells: new Uint8Array([0, 1, 0, 1]) },
    bg: { width: 2, height: 2, cells: new Uint8Array([0, 0, 0, 0]) },
    collision: { colind: new Uint8Array([0, 0]), shapes: { heights: [new Int8Array(16)], angles: new Uint8Array(1) } },
    palettes: [0, 1, 2, 3].map(() => new Uint16Array(16)),
    paletteSources: [],
    objects: [{ x: 100, y: 100, xflip: false, yflip: false, respawn: false, id: 1, subtype: 0 }],
    start: { x: 50, y: 50 },
    sourceRefs: { start: 'startpos/s.bin' },
  };
}

const REF: ZoneActRef = { zone: 'ghz', act: 1, label: 'Green Hill 1', available: true };

const REPORT: ResolutionReport = {
  entries: [{ key: 'fg', path: 'levels/ghz1.bin', status: 'resolved' }],
  resolved: 1,
  total: 1,
};

function fakeHandle(): ProjectHandle {
  return {
    type: 's1',
    capabilities: {
      levels: 'chunk-hierarchy',
      sprites: true,
      objects: 'objpos',
      build: false,
      facets: ['layout', 'art', 'objects', 'palette'],
    },
    report: REPORT,
    levels: {
      list: () => [REF],
      read: async () => makeDoc(),
      write: async (): Promise<WriteResult> => ({ written: [], skipped: [], errors: [] }),
    },
  };
}

/** Project open, NO act loaded — the state both tools must refuse to work in. */
function openProjectOnly(): void {
  useClassicProjectStore.setState({
    status: 'open', dir: '/p', label: 'Sonic 1', type: 's1',
    capabilities: fakeHandle().capabilities, report: REPORT,
    zoneTree: [REF], handle: fakeHandle(), error: null,
  } as never);
}

/** Put both stores into a clean, open + ready editing session. */
function openReady(doc = makeDoc()): void {
  openProjectOnly();
  documentHistoryHub.clearAll();
  useClassicLevelStore.setState({
    ref: REF, doc, status: 'ready', error: null,
    dirty: {}, chunkVersions: new Map(), chunkEpoch: 1,
  });
}

// ---------------------------------------------------------------------------
// PNG fixtures. The act's four palette lines are all-zero words (= black), so a
// sheet whose PLTE is one black entry maps cleanly onto it and nothing here
// trips the palette refusals — those belong to sheet-import's own suite.
// ---------------------------------------------------------------------------

const BLACK = { r: 0, g: 0, b: 0 };
const RED = { r: 0xee, g: 0, b: 0 };
const GREEN = { r: 0, g: 0xee, b: 0 };
const RED_WORD = 0x000e;
const GREEN_WORD = 0x00e0;

/** The fixture act, but holding red on line 0 and green on line 1 — two colours
 *  that exist, in lines the hardware cannot combine inside one 8x8 cell. */
function docWithSplitColours(): LevelDoc {
  const doc = makeDoc();
  doc.palettes[0][1] = RED_WORD;
  doc.palettes[1][1] = GREEN_WORD;
  return doc;
}

/** An all-black indexed PNG of the given size. */
function blackPng(width: number, height: number): Uint8Array {
  return encodeIndexedPngForTest({
    width, height, palette: [BLACK], indices: new Uint8Array(width * height),
  });
}

/** Stub `window.api` with a fixed file table, keyed `${base}/${rel}` (rel '' =
 *  base, which is how an absolute path reaches readBinaryFile — see
 *  import-sheet.ts:36). A miss reads as ENOENT, which is what
 *  `loadCanvasFile` treats as "no sidecar". */
function stubFiles(files: Record<string, Uint8Array>): void {
  (globalThis as unknown as { window: unknown }).window = {
    api: {
      readBinaryFile: async (base: string, rel: string) => {
        const key = rel === '' ? base : `${base}/${rel}`;
        const bytes = files[key];
        if (!bytes) throw new Error(`ENOENT: no such file or directory, open '${key}'`);
        return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
      },
      fileMtime: async () => 1000,
    },
  };
}

/** A saved canvas of `name` under the project dir, with no sidecar. */
function canvasFile(name: string, png: Uint8Array): Record<string, Uint8Array> {
  return { [`/p/${CANVAS_DIR}/${name}.png`]: png };
}

const SHEET_PATH = '/tmp/sheet.png';

beforeEach(() => {
  useClassicProjectStore.getState().reset();
  useClassicLevelStore.getState().reset();
  documentHistoryHub.clearAll();
});
afterEach(() => {
  __resetClassicBridgeForTest();
  delete (globalThis as unknown as { window?: unknown }).window;
});

// ---------------------------------------------------------------------------
// commit_canvas
// ---------------------------------------------------------------------------

describe('classic-commit-canvas', () => {
  // A FAULT. There is no act to commit into; the canvas on disk is beside the
  // point, so this must be the message the caller sees even when the file reads
  // fine (it does here — the stub serves it).
  it('throws when no classic level is open', async () => {
    openProjectOnly();
    stubFiles(canvasFile('blob', blackPng(256, 256)));
    await expect(handleAgentRequest({ kind: 'classic-commit-canvas', name: 'blob' }))
      .rejects.toThrow(/no classic level is open/);
  });

  // A FAULT, and loadCanvasFile's own guard (canvas-file.ts:120). A name that
  // escapes `.aurora/canvas` is not an art decision the caller can retry from
  // with different options — it is a bad argument.
  it('throws for a canvas name that escapes the canvas directory', async () => {
    openReady();
    stubFiles({});
    await expect(handleAgentRequest({ kind: 'classic-commit-canvas', name: '../etc/passwd' }))
      .rejects.toThrow(/not a valid canvas name/);
  });

  it('throws when no project directory is open', async () => {
    stubFiles({});
    await expect(handleAgentRequest({ kind: 'classic-commit-canvas', name: 'blob' }))
      .rejects.toThrow(/no project directory is open/);
  });

  // A canvas name that has no file is a fault too — nothing about it is an art
  // decision — and it must not be mistaken for the no-act-open case above.
  it('throws when the named canvas is not on disk', async () => {
    openReady();
    stubFiles({});
    await expect(handleAgentRequest({ kind: 'classic-commit-canvas', name: 'missing' }))
      .rejects.toThrow(/ENOENT/);
  });

  it('plans without applying under dryRun, naming the appended chunk by ENGINE id', async () => {
    openReady();
    stubFiles(canvasFile('blob', blackPng(256, 256)));
    const res = await handleAgentRequest({ kind: 'classic-commit-canvas', name: 'blob', dryRun: true }) as {
      ok: boolean; applied: boolean; appendedChunkIds: number[];
    };
    expect(res.ok).toBe(true);
    expect(res.applied).toBe(false);
    // Two chunks in the fixture doc, so the appended one is file index 2 = engine id 3.
    expect(res.appendedChunkIds).toEqual([3]);
    expect(useClassicLevelStore.getState().doc!.chunks).toHaveLength(2);
  });

  // A FIELD NAMED `warnings` MUST NOT BE DROPPED. `loadCanvasFile` reports, among
  // others, "the sidecar could not be read … the canvas is unconstrained until
  // this is fixed" — the one thing an unattended caller most needs told, since
  // the commit proceeds anyway.
  it('carries loadCanvasFile\'s warnings into the reply', async () => {
    openReady();
    // A 1-colour PLTE: the decoder warns that the other 63 canvas slots default
    // to black. Any warning does — the assertion is that they SURVIVE.
    stubFiles(canvasFile('blob', blackPng(256, 256)));
    const res = await handleAgentRequest({ kind: 'classic-commit-canvas', name: 'blob', dryRun: true }) as {
      ok: boolean; warnings: string[];
    };
    expect(res.ok).toBe(true);
    expect(res.warnings.length).toBeGreaterThan(0);
    expect(res.warnings.join(' ')).toMatch(/palette has only 1 colours/);
  });

  it('applies by default, growing the act\'s chunk pool', async () => {
    openReady();
    stubFiles(canvasFile('blob', blackPng(256, 256)));
    const res = await handleAgentRequest({ kind: 'classic-commit-canvas', name: 'blob' }) as {
      ok: boolean; applied: boolean; appendedChunkIds: number[];
    };
    expect(res.ok).toBe(true);
    expect(res.applied).toBe(true);
    expect(res.appendedChunkIds).toEqual([3]);
    expect(useClassicLevelStore.getState().doc!.chunks).toHaveLength(3);
  });
});

// ---------------------------------------------------------------------------
// import_art_sheet
// ---------------------------------------------------------------------------

describe('classic-import-art-sheet', () => {
  it('throws when no classic level is open', async () => {
    openProjectOnly();
    stubFiles({ [SHEET_PATH]: blackPng(256, 256) });
    await expect(handleAgentRequest({ kind: 'classic-import-art-sheet', path: SHEET_PATH }))
      .rejects.toThrow(/no classic level is open/);
  });

  // A FAULT: bytes that are not an indexed PNG are broken input, not a decision
  // about the art (sheet-import.ts says so and throws).
  it('throws for bytes that are not an indexed PNG', async () => {
    openReady();
    stubFiles({ [SHEET_PATH]: new Uint8Array([1, 2, 3, 4]) });
    await expect(handleAgentRequest({ kind: 'classic-import-art-sheet', path: SHEET_PATH }))
      .rejects.toThrow(/INDEXED/);
  });

  // A REFUSAL, in the same shape a commit refusal arrives in, so one caller
  // branch handles both.
  it('returns a colour the act does not have as ok:false with the artist\'s sentence', async () => {
    openReady();
    const png = encodeIndexedPngForTest({
      width: 8, height: 8, palette: [BLACK, RED], indices: new Uint8Array(64).fill(1),
    });
    stubFiles({ [SHEET_PATH]: png });
    const res = await handleAgentRequest({ kind: 'classic-import-art-sheet', path: SHEET_PATH }) as {
      ok: boolean; refusal: { kind: string }; message: string; resolution: string; offers: string[];
    };
    expect(res.ok).toBe(false);
    expect(res.refusal.kind).toBe('colour-not-in-act');
    // BOTH SENTENCES, BY IDENTITY WITH CORE. `resolution.length > 0` passes for
    // any string at all, including one written a second time for the agent —
    // which is exactly what sheet-import.ts's header forbids, because the
    // artist's copy and the agent's copy drift the first time either is
    // reworded. Comparing against core's own output is what makes that
    // impossible rather than merely discouraged.
    expect(res.message).toBe(explainSheetRefusal({ kind: 'colour-not-in-act', colours: [RED_WORD] }));
    expect(res.message).toMatch(/colours the act does not have/);
    expect(res.resolution).toBe(sheetRefusalResolution({ kind: 'colour-not-in-act', colours: [RED_WORD] }));
    expect(res.resolution).toMatch(/Recolour it to the act's palette/);
    expect(res.offers).toEqual([]);
  });

  // THE OTHER HALF OF WHAT THE REGISTRY ADVERTISES. `import_art_sheet`'s
  // description names two import-only refusals; this is the second, and until
  // now it had never made the trip to this surface at all — only png-import's
  // and sheet-import's own suites ever raised it.
  it('returns an 8x8 cell that needs two palette lines as ok:false, with the same-line advice', async () => {
    openReady(docWithSplitColours());
    // One cell, one pixel of line-1 green among line-0 red: both colours exist,
    // no single line holds both.
    const indices = new Uint8Array(64).fill(1);
    indices[0] = 2;
    stubFiles({ [SHEET_PATH]: encodeIndexedPngForTest({
      width: 8, height: 8, palette: [BLACK, RED, GREEN], indices,
    }) });
    const res = await handleAgentRequest({ kind: 'classic-import-art-sheet', path: SHEET_PATH }) as {
      ok: boolean; refusal: { kind: string }; message: string; resolution: string; offers: string[];
    };
    expect(res.ok).toBe(false);
    expect(res.refusal.kind).toBe('cell-needs-two-lines');
    expect(res.message).toMatch(/no single palette line holds/);
    // Not the OTHER kind's remedy, and it carries the clause that stops the
    // retry loop: widening the palette works only on the cell's own line.
    expect(res.resolution).toMatch(/^Redraw those cells/);
    expect(res.resolution).toMatch(/LINE the cell's other colours already use/);
    expect(res.resolution).not.toBe(sheetRefusalResolution({ kind: 'colour-not-in-act', colours: [RED_WORD] }));
    expect(res.offers).toEqual([]);
  });

  it('commits an indexed sheet that maps onto the act palette', async () => {
    openReady();
    stubFiles({ [SHEET_PATH]: blackPng(256, 256) });
    const res = await handleAgentRequest({ kind: 'classic-import-art-sheet', path: SHEET_PATH }) as {
      ok: boolean; applied: boolean; appendedChunkIds: number[];
    };
    expect(res.ok).toBe(true);
    expect(res.applied).toBe(true);
    expect(res.appendedChunkIds).toEqual([3]);
  });
});

// ---------------------------------------------------------------------------
// commitPixels' two REFUSALS — carried over from Task 4's review.
//
// Both of these used to THROW, and a throw reaches the client as -32603
// "internal error". They are asserted HERE rather than in art-commit.test.ts
// because `commitPixels` reads the level store (art-commit.test.ts is
// deliberately store-free — it only exercises `replyFromPlanResult`, which was
// made store-free precisely so it needed no harness). This file already has the
// store harness, and driving them through the real tool proves the extra half
// that matters: the refusal survives the handler as a RESULT.
// ---------------------------------------------------------------------------

describe('commitPixels refuses rather than throwing', () => {
  it('answers pixels too small for one whole chunk with region-out-of-bounds', async () => {
    openReady();
    stubFiles({ [SHEET_PATH]: blackPng(100, 100) });
    const res = await handleAgentRequest({ kind: 'classic-import-art-sheet', path: SHEET_PATH }) as {
      ok: boolean; refusal: CommitRefusal; message: string;
    };
    expect(res.ok).toBe(false);
    expect(res.refusal.kind).toBe('region-out-of-bounds');
    // The 256px floor the caller has to clear must be IN the answer — that is
    // why commitPixels states this case itself instead of leaving it to the
    // planner, whose detail never mentions it.
    expect(res.message).toMatch(/256/);
  });

  it('answers a wrong-length targets array with target-count', async () => {
    openReady();
    stubFiles({ [SHEET_PATH]: blackPng(256, 256) });
    const res = await handleAgentRequest({
      kind: 'classic-import-art-sheet', path: SHEET_PATH,
      targets: [{ chunkFileIndex: null }, { chunkFileIndex: null }],
    }) as { ok: boolean; refusal: CommitRefusal };
    expect(res.ok).toBe(false);
    expect(res.refusal.kind).toBe('target-count');
    if (res.refusal.kind !== 'target-count') return;
    expect(res.refusal.expected).toBe(1);
    expect(res.refusal.got).toBe(2);
  });
});
