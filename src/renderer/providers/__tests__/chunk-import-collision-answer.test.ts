// THE IMPORT GESTURE, DRIVEN END TO END, AGAINST ALL THREE ANSWERS.
//
// Ledger row FULLBLOCK-ZERO-IS-TWO-ANSWERS. `importChunkFiles` used to ask
// `findFullBlockShapeId` for a number, get a 0 that meant EITHER "no collision
// profiles were loaded, so I could not look" OR "a real bank was searched and
// holds no full block", and then write the chunks into the author's project,
// mark it dirty, and raise a plain success toast — "Imported N chunks -- Save to
// keep" — over a library whose every cell had come in as air.
//
// ⚠ WHAT THIS FILE CAN AND CANNOT SEE. It runs the REAL `importChunkFiles`
// against the REAL stores and the REAL OJZ fixtures, with only `window.api`
// stubbed, so it proves the whole path: lookup → importChunks → the chunks
// actually added to the project → the toast the author reads. It cannot prove a
// click reaches the function, that ToastContainer paints the sentence, or that
// the sentence is legible on screen — there is no DOM here. The button wiring
// lives in AeonChunkActions.tsx.
//
// ⚠ AND IT ASSERTS THE REASON, NOT MERELY THAT SOMETHING WAS SAID. Two blind
// answers producing "a warning" would satisfy a test that only checked the
// tone, and would be exactly the defect back again one level up. Each row names
// which blindness the sentence describes, and one row holds the two sentences
// against each other.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import {
  importChunkFiles, chunkImportOutcomeToast, chunkImportBlindRefusal,
} from '../chunk-library-import';
import { useProjectStore } from '../../state/projectStore';
import { useToastStore } from '../../state/toastStore';
import type { CollisionProfile, CollisionProfileSet } from '../../../core/collision/collision-model';

const FIXTURES = resolve(__dirname, '../../../../test/fixtures');
const CHUNKS = new Uint8Array(readFileSync(`${FIXTURES}/OJZ_chunks.bin`));
const BLOCKS = new Uint8Array(readFileSync(`${FIXTURES}/OJZ_blocks.bin`));
const ART = new Uint8Array(readFileSync(`${FIXTURES}/OJZ_tiles.kos.bin`));

const profile = (over: Partial<CollisionProfile> = {}): CollisionProfile => ({
  heights: new Int8Array(16), angle: 0, hasAngle: true, solidity: 'all', ...over,
});
/** A bank WITH a plain solid block at index 2. */
const bankWithFullBlock = (): CollisionProfileSet => ({
  engine: 's4',
  solidCount: 3,
  profiles: [profile(), profile({ heights: new Int8Array(16).fill(8) }),
    profile({ heights: new Int8Array(16).fill(16) })],
});
/** A REAL bank that simply has no full block — one pixel short in one column,
 *  the near-miss shape the unit test's fixtures use, so this is a bank a
 *  loosened search would wrongly accept rather than a bank of obvious air. */
const bankWithoutFullBlock = (): CollisionProfileSet => {
  const short = new Int8Array(16).fill(16);
  short[7] = 15;
  return {
    engine: 's4',
    solidCount: 3,
    profiles: [profile(), profile({ heights: new Int8Array(16).fill(8) }), profile({ heights: short })],
  };
};

function fakeProject(): never {
  return {
    zones: [{
      id: 'ojz',
      name: 'OJZ',
      tileset: { tiles: [{ pixels: new Uint8Array(64) }] },
      palette: { lines: [{ colors: [] }] },
      acts: [{ id: 'act1', name: 'act1', sections: [] }],
    }],
    chunkLibrary: [],
  } as never;
}

/** `window.api` with the three file dialogs answered and the three reads served
 *  from the OJZ fixtures. `selectFile` is called three times in a fixed order. */
function stubApi(): void {
  const answers = ['/f/OJZ_chunks.bin', '/f/OJZ_blocks.bin', '/f/OJZ_tiles.kos.bin'];
  let n = 0;
  const files: Record<string, Uint8Array> = {
    '/f/OJZ_chunks.bin': CHUNKS, '/f/OJZ_blocks.bin': BLOCKS, '/f/OJZ_tiles.kos.bin': ART,
  };
  (globalThis as unknown as { window: unknown }).window = {
    api: {
      selectFile: async () => answers[n++],
      readBinaryFile: async (base: string, rel: string) => {
        const key = rel === '' ? base : `${base}/${rel}`;
        const bytes = files[key];
        if (!bytes) throw new Error(`ENOENT: no such file or directory, open '${key}'`);
        return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
      },
    },
  };
}

/** The one toast the import raised. Asserted to be exactly one so a row cannot
 *  quietly read a leftover from a previous import. */
function onlyToast(): { message: string; type: string } {
  const toasts = useToastStore.getState().toasts;
  expect(toasts.length, 'the import should raise exactly one toast').toBe(1);
  return { message: toasts[0].message, type: toasts[0].type };
}

const library = () => useProjectStore.getState().project!.chunkLibrary;
const anySolidCell = () =>
  library().some((c) => [...c.collisionA].some((w) => w !== 0));

beforeEach(() => {
  useProjectStore.getState().reset();
  useToastStore.setState({ toasts: [] });
  useProjectStore.setState({ project: fakeProject() });
  useProjectStore.getState().setCurrentAct('ojz', 'act1');
  stubApi();
});
afterEach(() => {
  delete (globalThis as unknown as { window?: unknown }).window;
});

describe('chunk import: the author is told WHICH answer the collision lookup gave', () => {
  // THE CONTROL FOR EVERY OTHER ROW IN THIS FILE. The OJZ fixture really does
  // carry solidity bits, so "no solid cell" below is the lookup's doing rather
  // than a donor file with nothing solid in it. Without this row the two blind
  // rows would pass over an empty fixture and prove nothing — the single
  // assertion over two operands that share an upstream and agree with
  // themselves.
  it('a bank WITH a full block imports solid collision and says plain success', async () => {
    useProjectStore.setState({ collisionProfiles: bankWithFullBlock() });

    await expect(importChunkFiles()).resolves.toBe(true);

    expect(library().length).toBeGreaterThan(0);
    expect(anySolidCell(), 'the OJZ fixture carries solidity bits; if this is false the fixture, not the lookup, is empty')
      .toBe(true);
    const toast = onlyToast();
    expect(toast.type).toBe('success');
    expect(toast.message).toMatch(/^Imported \d+ chunks -- Save to keep$/);
  });

  it('NO PROFILES LOADED: the import is REFUSED, and no chunk arrives at all', async () => {
    // The reachable case. An aeon project opens with `collisionProfiles` null
    // whenever its collision tables are missing, renamed, or in the other of the
    // two well-known locations — `loadCollisionProfilesFa` returns null on any
    // such miss BY DESIGN, so the overlay can degrade, and the open succeeds.
    //
    // ⚠ THIS ROW CHANGED ON 2026-09-09 and the change is the answer to
    // `d-36b-air-collision-import-split-closed`, not a drift. It used to assert
    // that the chunks still arrived with a warning. The owner ruled
    // `refuse_a_warn_b`: case A refuses. The full proof that NOTHING is written
    // and NO dirty flag is set lives in the sibling file
    // chunk-import-refuses-when-blind.test.ts, because a refusal message and an
    // unmutated project are two different claims and that file asserts the
    // second one. What stays here is this file's own subject: which of the
    // answers the author is told about.
    useProjectStore.setState({ collisionProfiles: null });

    await expect(importChunkFiles(), 'a refusal resolves false').resolves.toBe(false);

    expect(library().length, 'a refusal writes no chunks').toBe(0);

    const toast = onlyToast();
    expect(toast.type).toBe('error');
    expect(toast.message, 'must name the blindness: the tables did not load')
      .toMatch(/tables did not load/i);
    // ⚠ AND IT MUST NOT STILL BE THE OLD SENTENCE. The original defect was a
    // plain success claim; a message that merely gained words in front of it
    // would still read as one.
    expect(toast.message).not.toMatch(/^Imported \d+ chunks -- Save to keep$/);
  });

  it('BANK WITH NO FULL BLOCK: same air, a DIFFERENT sentence naming the bank', async () => {
    useProjectStore.setState({ collisionProfiles: bankWithoutFullBlock() });

    await expect(importChunkFiles()).resolves.toBe(true);

    expect(library().length).toBeGreaterThan(0);
    expect(anySolidCell()).toBe(false);

    const toast = onlyToast();
    expect(toast.type).toBe('warning');
    expect(toast.message).toMatch(/NO COLLISION/);
    expect(toast.message, 'must name the OTHER blindness: a bank loaded, and it has no full block')
      .toMatch(/no full-block shape/i);
    expect(toast.message).not.toMatch(/tables did not load/i);
  });

  it('⚠ the two blind sentences are DIFFERENT: the conflation, at the surface the author reads', () => {
    // Held against each other directly, through the pure deciders, because the
    // failure this file exists to prevent is precisely two different facts
    // arriving as one message. Operands asserted non-empty first: two undefined
    // messages would satisfy `not.toBe` between themselves.
    //
    // The two now come from DIFFERENT functions, which is the shape of the
    // owner's ruling: "could not look" is a refusal and never reaches
    // `chunkImportOutcomeToast` at all — the type says so, and this row would
    // not compile if it did.
    const couldNotLook = chunkImportBlindRefusal(['data/collision/base/', 'data/collision/']);
    const bankHasNone = chunkImportOutcomeToast(7, { status: 'no-full-block' });
    const found = chunkImportOutcomeToast(7, { status: 'found', shapeId: 2 });

    expect(couldNotLook.message.length).toBeGreaterThan(0);
    expect(bankHasNone.message.length).toBeGreaterThan(0);
    expect(couldNotLook.message).not.toBe(bankHasNone.message);
    // Neither blind answer may wear the success tone, which is the tone the
    // original defect wore.
    expect(couldNotLook.type).not.toBe('success');
    expect(bankHasNone.type).not.toBe('success');
    expect(found.type).toBe('success');
    // The two that describe an import that HAPPENED still name the count, so the
    // truthful sentence does not cost the author the fact they came for. The
    // refusal cannot: nothing was imported, so there is no count to name.
    for (const o of [bankHasNone, found]) expect(o.message).toMatch(/\b7\b/);
    expect(couldNotLook.message, 'a refusal must not claim a number of imported chunks')
      .not.toMatch(/Imported \d+ chunks/);
  });
});
