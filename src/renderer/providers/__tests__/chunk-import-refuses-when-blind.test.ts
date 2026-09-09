// CASE A REFUSES BEFORE IT WRITES ANYTHING; CASE B STILL PROCEEDS.
//
// Decision `d-36b-air-collision-import-split-closed` in docs/decisions.jsonl,
// answered by the owner as `refuse_a_warn_b`. Two cases, two behaviours, on one
// button:
//
//   A. The project's collision tables never loaded. The editor could not look.
//      Import REFUSES: it stops before writing anything, and says which tables
//      it needs and every directory it looked in.
//   B. The tables loaded fine and the bank genuinely holds no full-block shape.
//      Import PROCEEDS and says plainly that no full-block shape exists in this
//      bank, so every chunk came in empty.
//
// ⚠ THE TWO CASES ARE NEAR SYNONYMS AT THE SURFACE AND THAT IS THE TRAP THIS
// FILE EXISTS TO AVOID. Both end with a chunk library whose every cell is air.
// A fixture producing one while the assertion keys on the other would pass and
// prove nothing. So every row here NAMES THE PREDICATE IT READS in its message,
// and case B is present as the control that separates "the editor was blind"
// from "the import produced no solid cells" -- case B produces no solid cells
// and is NOT refused.
//
// ⚠ AND A MESSAGE IS NOT A REFUSAL. The cost recorded in ledger row
// FULLBLOCK-ZERO-IS-TWO-ANSWERS is that the write is not recoverable by undo
// the way an author expects: the import marked the project dirty and the chunks
// carried the wrong collision from that moment. So asserting the refusal
// sentence would prove the wrong claim. These rows assert the PROJECT STATE and
// the DIRTY FLAGS are untouched, which is a different claim from the sentence
// and is the one the finding was about.
//
// ⚠ WHAT THIS FILE CANNOT SEE. There is no DOM here, so the button reaching
// `importChunkFiles`, ToastContainer painting the sentence and the sentence
// being legible are unproved, exactly as in the sibling file
// chunk-import-collision-answer.test.ts. The button wiring lives in
// AeonChunkActions.tsx.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { importChunkFiles } from '../chunk-library-import';
import { loadCollisionProfilesFa } from '../../../core/project/aeon/load';
import { collisionDataPathCandidates } from '../../../core/config/s4-config';
import type { S4ProjectConfig } from '../../../core/config/s4-config';
import { useProjectStore } from '../../state/projectStore';
import { useEditorStore } from '../../state/editorStore';
import { useToastStore } from '../../state/toastStore';
import type { CollisionProfile, CollisionProfileSet } from '../../../core/collision/collision-model';

const FIXTURES = resolve(__dirname, '../../../../test/fixtures');
const CHUNKS = new Uint8Array(readFileSync(`${FIXTURES}/OJZ_chunks.bin`));
const BLOCKS = new Uint8Array(readFileSync(`${FIXTURES}/OJZ_blocks.bin`));
const ART = new Uint8Array(readFileSync(`${FIXTURES}/OJZ_tiles.kos.bin`));

const profile = (over: Partial<CollisionProfile> = {}): CollisionProfile => ({
  heights: new Int8Array(16), angle: 0, hasAngle: true, solidity: 'all', ...over,
});

/** A REAL bank that simply holds no full block: one column a pixel short, the
 *  near miss rather than a bank of obvious air. This is CASE B. */
const bankWithoutFullBlock = (): CollisionProfileSet => {
  const short = new Int8Array(16).fill(16);
  short[7] = 15;
  return {
    engine: 's4',
    solidCount: 3,
    profiles: [profile(), profile({ heights: new Int8Array(16).fill(8) }), profile({ heights: short })],
  };
};

/** A bank WITH a plain solid block, so a row can show the untouched-state
 *  assertions below going the OTHER way on a real import. */
const bankWithFullBlock = (): CollisionProfileSet => ({
  engine: 's4',
  solidCount: 3,
  profiles: [profile(), profile({ heights: new Int8Array(16).fill(8) }),
    profile({ heights: new Int8Array(16).fill(16) })],
});

/** A project.json shaped like aeon's post-split layout, so the candidate dirs
 *  the refusal has to name are more than one and are not the legacy default. */
const rawConfig = (): S4ProjectConfig => ({
  name: 'ojz-fixture',
  engine: 's4',
  objectLibrary: '',
  chunkLibrary: '',
  zones: [{
    id: 'ojz', name: 'OJZ', tileset: 't.bin', palette: 'p.bin',
    acts: [{
      id: 'act1', gridWidth: 1, gridHeight: 1,
      dataPath: 'games/sonic4/data/editor/ojz/act1/',
      bgLayout: 'b.bin', bgTiles: 'bt.bin',
      startPosition: { secX: 0, secY: 0, localX: 0, localY: 0 },
    }],
  }],
} as S4ProjectConfig);

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

/** How many times the import asked the author for a file. A refusal that has
 *  written nothing but has still walked them through three dialogs is a worse
 *  refusal, and this is the only way to see it from here. */
let selectFileCalls = 0;

function stubApi(): void {
  selectFileCalls = 0;
  const answers = ['/f/OJZ_chunks.bin', '/f/OJZ_blocks.bin', '/f/OJZ_tiles.kos.bin'];
  const files: Record<string, Uint8Array> = {
    '/f/OJZ_chunks.bin': CHUNKS, '/f/OJZ_blocks.bin': BLOCKS, '/f/OJZ_tiles.kos.bin': ART,
  };
  (globalThis as unknown as { window: unknown }).window = {
    api: {
      selectFile: async () => answers[selectFileCalls++],
      readBinaryFile: async (base: string, rel: string) => {
        const key = rel === '' ? base : `${base}/${rel}`;
        const bytes = files[key];
        if (!bytes) throw new Error(`ENOENT: no such file or directory, open '${key}'`);
        return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
      },
    },
  };
}

function onlyToast(): { message: string; type: string } {
  const toasts = useToastStore.getState().toasts;
  expect(toasts.length, 'the gesture should raise exactly one toast').toBe(1);
  return { message: toasts[0].message, type: toasts[0].type };
}

const library = () => useProjectStore.getState().project!.chunkLibrary;

/** Everything the import mutates when it proceeds, read as one snapshot so a
 *  row can assert "untouched" against the whole set rather than one member. */
function writtenState(): {
  chunks: number; dirty: boolean; dirtyActs: number; selected: string | null; error: string | null;
} {
  const ed = useEditorStore.getState();
  return {
    chunks: library().length,
    dirty: ed.dirty,
    dirtyActs: Object.keys(ed.dirtyActs).length,
    selected: ed.selectedChunkId ?? null,
    error: useProjectStore.getState().error ?? null,
  };
}

beforeEach(() => {
  useProjectStore.getState().reset();
  useToastStore.setState({ toasts: [] });
  useEditorStore.setState({ dirty: false, dirtyActs: {}, selectedChunkId: null });
  useProjectStore.setState({ project: fakeProject() });
  useProjectStore.getState().setCurrentAct('ojz', 'act1');
  stubApi();
});
afterEach(() => {
  delete (globalThis as unknown as { window?: unknown }).window;
});

describe('CASE A: the collision tables never loaded, so Import refuses', () => {
  beforeEach(() => {
    useProjectStore.setState({
      collisionProfiles: null,
      config: { raw: rawConfig() } as never,
    });
  });

  it('PREDICATE READ: collisionProfiles === null. Nothing is written and nothing is dirty', async () => {
    const before = writtenState();
    expect(before, 'the fixture must start clean or "untouched" proves nothing')
      .toEqual({ chunks: 0, dirty: false, dirtyActs: 0, selected: null, error: null });

    await expect(importChunkFiles(), 'a refusal resolves false, like a cancel').resolves.toBe(false);

    expect(writtenState(),
      'PREDICATE: collisionProfiles === null must leave the project and both dirty flags exactly as found')
      .toEqual(before);
  });

  it('PREDICATE READ: collisionProfiles === null. It does not even ask for the three files', async () => {
    await importChunkFiles();
    expect(selectFileCalls,
      'PREDICATE: nothing the author picks can change a null profile set, so refuse before the dialogs')
      .toBe(0);
  });

  it('PREDICATE READ: collisionProfiles === null. The message names the tables and where it looked', async () => {
    await importChunkFiles();
    const toast = onlyToast();

    expect(toast.type, 'a refusal is not a warning about something that happened').toBe('error');
    expect(toast.message, 'PREDICATE: names the blindness -- the tables did not load')
      .toMatch(/did not load/i);

    // The three tables, named because a person has to go find them.
    for (const table of ['heightmaps.bin', 'angles.bin', 'solidity.bin']) {
      expect(toast.message, `PREDICATE: the refusal must name the table ${table}`).toContain(table);
    }

    // ⚠ WHERE IT LOOKED IS MEASURED, NOT RESTATED. The directories are read out
    // of the loader itself: `loadCollisionProfilesFa` is driven against a
    // FileAccess that records every read and serves nothing, so the dirs below
    // are the ones it ACTUALLY probes. A message written from a second opinion
    // about the loader's layout would pass a prose assertion and fail this one.
    const probed = new Set<string>();
    const recordingFa = {
      rootDir: '/p',
      read: async (p: string) => {
        probed.add(p.slice(0, p.lastIndexOf('/') + 1));
        throw new Error(`ENOENT: ${p}`);
      },
    };
    for (const candidate of collisionDataPathCandidates(rawConfig())) {
      const got = await loadCollisionProfilesFa(recordingFa as never, candidate);
      expect(got, 'the recording FileAccess serves nothing, so every probe must miss').toBeNull();
    }
    expect(probed.size, 'the loader must have probed something, or this row is vacuous')
      .toBeGreaterThan(1);
    for (const dir of probed) {
      expect(toast.message, `PREDICATE: the loader really reads ${dir}, so the refusal must name it`)
        .toContain(dir);
    }
  });
});

describe('CASE B: the bank loaded and holds no full block, so Import proceeds', () => {
  // THE CONTROL FOR CASE A. Case B ends with the SAME all-air library, so if
  // the refusal keyed on "no solid cells came out" instead of "the tables did
  // not load" this row would go red -- which is the confusion the whole
  // decision card is about.
  it('PREDICATE READ: status === no-full-block. The chunks ARRIVE and the project goes dirty', async () => {
    useProjectStore.setState({
      collisionProfiles: bankWithoutFullBlock(),
      config: { raw: rawConfig() } as never,
    });

    await expect(importChunkFiles()).resolves.toBe(true);

    const after = writtenState();
    expect(after.chunks, 'PREDICATE: a real bank with no full block must NOT be refused')
      .toBeGreaterThan(0);
    expect(after.dirty, 'PREDICATE: case B writes, so it marks dirty').toBe(true);
    expect(selectFileCalls, 'PREDICATE: case B asks for all three files').toBe(3);

    // And every cell is air, which is what makes this a control rather than a
    // second case A: the outcomes agree, only the cause differs.
    expect(library().some((c) => [...c.collisionA].some((w) => w !== 0)),
      'PREDICATE: no full block means no solid cell, the same visible outcome as case A')
      .toBe(false);

    const toast = onlyToast();
    expect(toast.type, 'case B warns, it does not refuse').toBe('warning');
    expect(toast.message, 'PREDICATE: names the bank, not the loader')
      .toMatch(/no full-block shape/i);
    expect(toast.message, 'PREDICATE: must NOT claim the tables failed to load')
      .not.toMatch(/did not load/i);
  });

  it('CONTROL: a bank WITH a full block imports and writes, so "untouched" above is not vacuous', async () => {
    useProjectStore.setState({
      collisionProfiles: bankWithFullBlock(),
      config: { raw: rawConfig() } as never,
    });

    await expect(importChunkFiles()).resolves.toBe(true);

    const after = writtenState();
    expect(after.chunks).toBeGreaterThan(0);
    expect(after.dirty, 'the same dirty flag case A asserts unchanged does get set here').toBe(true);
    expect(after.selected, 'and the same selection field does get written here').not.toBeNull();
    expect(onlyToast().type).toBe('success');
  });
});
