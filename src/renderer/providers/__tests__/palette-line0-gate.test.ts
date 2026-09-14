// THE WARNING BEFORE A LINE 0 EDIT, executed against the real gate module, the
// real stores and a real loaded project. Only `window.api` is a stand-in, over
// the same in-memory files the project was loaded from.
//
// Owner ruling 2026-09-13 (decisions.jsonl `PALETTE-LINE0-BLAST-RADIUS-answered`,
// `write_shared_file`): the top row saves, "with just a warning". These rows pin
// what that warning is: the in-app confirm (never a native dialog), raised once
// per open project, naming the shared file and what else is DERIVED to embed it,
// honest when it could not look, refusing outright when the file cannot be saved,
// and a decline that changes nothing. What a person SEES is proven on screen by
// `npm run harness:palette-line0-warning`.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { loadAeonProject } from '../../../core/project/aeon/load';
import type { FileAccess } from '../../../core/project/adapter';
import { PLAYER_PALETTE_CANDIDATES } from '../../../core/project/aeon/player-palette';
import { serializeTiles } from '../../../core/export/tile-dedup';
import { serializeNametable } from '../../../core/formats/s4-nametable';
import { CRAM_LINE_ENTRIES, CRAM_WORD_BYTES, PLAYER_PALETTE_LINE } from '../../../core/formats/palette';
import { SECTION_TILES_WIDE, SECTION_TILES_HIGH } from '../../../core/model/s4-types';
import type { Tile } from '../../../core/model/s4-types';
import { useProjectStore } from '../../state/projectStore';
import { useConfirmStore, type ConfirmRequest } from '../../state/confirmStore';
import {
  admitSharedLineEdit, isSharedLineAcknowledged, resetSharedLineAcknowledgementForTests,
  LINE0_ACCEPT_KEY, LINE0_REFUSED_TITLE,
} from '../palette-line0-gate';
import { admitZoneLine, whenZoneLineAdmitted } from '../palette-aeon';
import {
  SPRING_LINE0_GATE_EXTENSION, SPRING_LINE0_GATE_PATH,
} from '../../../core/project/aeon/shared-palette-warning';

const PLAYER = PLAYER_PALETTE_CANDIDATES[0];
const tile = (fill: number): Tile => ({ pixels: new Uint8Array(64).fill(fill) });

/** Two sources: one embeds the shared file on its line 3, one does not. */
const SOURCES: Record<string, string> = {
  'games/g/act_assets.emp': `module g\n\npub data BGND_Palette = embed("${PLAYER}")\n`,
  'games/g/other.emp': 'module h\npub data X = embed("games/g/x.bin")\n',
};

/** The spring check, planted only by the rows that want it. It reads the
 *  shared file and one partner palette in the same folder. */
const PARTNER = `${PLAYER.slice(0, PLAYER.lastIndexOf('/'))}/partner.bin`;
const GATE_SOURCE = `PAL_A = "${PLAYER}"\nPAL_B = "${PARTNER}"\n`;

function fixtureFiles(opts?: { player?: Uint8Array | null; gate?: boolean }): Map<string, Uint8Array> {
  const files = new Map<string, Uint8Array>();
  files.set('project.json', new TextEncoder().encode(JSON.stringify({
    name: 'Gate Fixture', engine: 's4', objectLibrary: 'data/objects.json', chunkLibrary: '',
    zones: [{
      id: 'ojz', name: 'OJ Zone', tileset: 'data/t.bin', palette: 'data/p.bin',
      acts: [{
        id: 'act1', gridWidth: 1, gridHeight: 1, dataPath: 'data/ojz/act1/',
        bgLayout: '', bgTiles: '', sceneRef: null,
        startPosition: { secX: 0, secY: 0, localX: 64, localY: 64 },
      }],
    }],
  })));
  files.set('data/t.bin', serializeTiles([tile(0)]));
  files.set('data/p.bin', new Uint8Array(96));
  const player = opts?.player === undefined ? new Uint8Array(CRAM_LINE_ENTRIES * CRAM_WORD_BYTES).fill(0x02) : opts.player;
  if (player) files.set(PLAYER, player);
  files.set('data/ojz/act1/section_0.tiles.bin',
    serializeNametable(new Uint16Array(SECTION_TILES_WIDE * SECTION_TILES_HIGH)));
  files.set('data/objects.json', new TextEncoder().encode('[]'));
  for (const [p, t] of Object.entries(SOURCES)) files.set(p, new TextEncoder().encode(t));
  if (opts?.gate) files.set(SPRING_LINE0_GATE_PATH, new TextEncoder().encode(GATE_SOURCE));
  return files;
}

function memFa(files: Map<string, Uint8Array>): FileAccess {
  return {
    exists: async (rel) => files.has(rel),
    read: async (rel) => { const b = files.get(rel); if (!b) throw new Error(`ENOENT: ${rel}`); return b; },
    list: async () => [],
  };
}

let files: Map<string, Uint8Array>;

function installApi(opts?: { noListing?: boolean; rootUnreadableFor?: string }): void {
  (globalThis as { window?: unknown }).window = {
    api: {
      ...(opts?.noListing ? {} : {
        // `rootUnreadableFor`: the listing for that one extension could not
        // read the project folder at all, the way file-io reports it.
        listProjectSources: async (_base: string, ext: string) => (ext === opts?.rootUnreadableFor
          ? { files: [], unreadable: [{ path: '.', reason: 'EACCES: permission denied' }], capped: false }
          : { files: [...files.keys()].filter((p) => p.endsWith(ext)), unreadable: [], capped: false }),
      }),
      readManyFiles: async (_base: string, rels: string[]) => rels.map((rel) => {
        const b = files.get(rel);
        return b
          ? { relPath: rel, bytes: b, mtimeMs: 1, outcome: 'read', reason: null }
          : { relPath: rel, bytes: null, mtimeMs: null, outcome: 'absent', reason: null };
      }),
    },
  };
}

async function openProject(): Promise<void> {
  const r = await loadAeonProject(memFa(files), '/proj');
  useProjectStore.setState({
    config: r.config, project: r.project, currentZoneId: 'ojz', currentActId: 'act1',
  } as never);
}

/** The dialog the gate raised. The scan is async, so wait for it rather than
 *  reading the store once and mistaking "not yet" for "never". */
async function raised(): Promise<ConfirmRequest> {
  for (let i = 0; i < 200; i++) {
    const r = useConfirmStore.getState().request;
    if (r) return r;
    await new Promise((res) => setTimeout(res, 0));
  }
  throw new Error('the gate raised no dialog');
}

const answer = (key: string): void => useConfirmStore.getState().answer(key);

beforeEach(async () => {
  resetSharedLineAcknowledgementForTests();
  useConfirmStore.setState({ request: null, resolver: null });
  files = fixtureFiles();
  installApi();
  await openProject();
});

afterEach(() => {
  resetSharedLineAcknowledgementForTests();
  useConfirmStore.setState({ request: null, resolver: null });
  delete (globalThis as { window?: unknown }).window;
});

describe('the warning is asked, in the in-app confirm, before the first line 0 edit', () => {
  it('raises the in-app dialog naming the shared file, EVERY zone, and the DERIVED embedder', async () => {
    const gate = admitSharedLineEdit();
    expect(gate, 'the first line 0 edit went ahead without asking').not.toBe(true);
    const req = await raised();
    expect(req.title).toContain('every zone');
    expect(req.body).toContain(PLAYER);
    expect(req.body).toContain('EVERY zone');
    // Derived from SOURCES above, not typed: the one file that embeds it, at
    // the line it does so, and never the one that embeds something else.
    const embedder = Object.entries(SOURCES).find(([, t]) => t.includes(`embed("${PLAYER}")`))!;
    const line = embedder[1].split('\n').findIndex((l) => l.includes(`embed("${PLAYER}")`)) + 1;
    expect(req.body).toContain(`${embedder[0]}:${line}`);
    expect(req.body).not.toContain('games/g/other.emp');
    expect(req.buttons.find((b) => b.key === LINE0_ACCEPT_KEY)?.tone, 'accepting is not marked destructive')
      .toBe('danger');
    answer('cancel');
    expect(await gate).toBe(false);
  });

  it('declining acknowledges nothing, and the next attempt asks again', async () => {
    const first = admitSharedLineEdit();
    await raised();
    answer('cancel');
    expect(await first).toBe(false);
    expect(isSharedLineAcknowledged()).toBe(false);
    expect(admitZoneLine(PLAYER_PALETTE_LINE), 'a declined warning admitted the line anyway').not.toBe(true);
    await raised();
    answer('cancel');
  });

  it('accepting admits line 0 for this project, and asks nothing more while it stays open', async () => {
    const gate = admitSharedLineEdit();
    await raised();
    answer(LINE0_ACCEPT_KEY);
    expect(await gate).toBe(true);
    expect(isSharedLineAcknowledged()).toBe(true);
    expect(admitSharedLineEdit()).toBe(true);
    expect(admitZoneLine(PLAYER_PALETTE_LINE)).toBe(true);
    expect(useConfirmStore.getState().request, 'it asked a second time').toBeNull();
  });

  it('a newly opened project asks again', async () => {
    const gate = admitSharedLineEdit();
    await raised();
    answer(LINE0_ACCEPT_KEY);
    await gate;
    await openProject();   // a fresh load: a new project, possibly a new file on disk
    expect(isSharedLineAcknowledged()).toBe(false);
    const again = admitSharedLineEdit();
    expect(again).not.toBe(true);
    await raised();
    answer('cancel');
    await again;
  });

  it('never asks for the zone\'s own lines', () => {
    for (let line = PLAYER_PALETTE_LINE + 1; line < 4; line++) {
      expect(admitZoneLine(line), `line ${line}`).toBe(true);
    }
    expect(useConfirmStore.getState().request).toBeNull();
  });

  it('a second request while the dialog is up joins it instead of stacking another', async () => {
    const a = admitSharedLineEdit();
    const b = admitSharedLineEdit();
    expect(b).toBe(a);
    await raised();
    answer('cancel');
    expect(await a).toBe(false);
  });
});

describe('a decline changes nothing; an acceptance lets exactly the asked write through', () => {
  it('a gated write does not run on decline, and runs once on acceptance', async () => {
    let writes = 0;
    whenZoneLineAdmitted(PLAYER_PALETTE_LINE, () => { writes++; });
    await raised();
    answer('cancel');
    await new Promise((r) => setTimeout(r, 0));
    expect(writes, 'a declined write ran').toBe(0);

    whenZoneLineAdmitted(PLAYER_PALETTE_LINE, () => { writes++; });
    await raised();
    answer(LINE0_ACCEPT_KEY);
    await new Promise((r) => setTimeout(r, 0));
    expect(writes).toBe(1);
  });
});

// Hub ruling 2026-09-14T00:24:36Z: the warning ALSO names the project's spring
// check when the project has it. Through the real gate, over in-memory listings.
describe('the spring check: named when the project has it, silent when not, honest when it cannot look', () => {
  /** The warning's own embedder line, so a row can prove it read the real warning. */
  const embedderLine = (): string => {
    const [path, text] = Object.entries(SOURCES).find(([, t]) => t.includes(`embed("${PLAYER}")`))!;
    return `${path}:${text.split('\n').findIndex((l) => l.includes(`embed("${PLAYER}")`)) + 1}`;
  };

  it('NAMED: a project that lists the check gets it named, with the partner palette read off the check', async () => {
    files = fixtureFiles({ gate: true });
    installApi();
    await openProject();
    const gate = admitSharedLineEdit();
    const req = await raised();
    expect(req.body).toContain(SPRING_LINE0_GATE_PATH);
    expect(req.body).toContain('whichever character you play');
    expect(req.body).toContain(`that check will fail until ${PARTNER} is changed to match`);
    expect(req.body).toContain(embedderLine());
    answer('cancel');
    await gate;
  });

  it('NOT NAMED: a project without the check hears nothing about it', async () => {
    const gate = admitSharedLineEdit();
    const req = await raised();
    expect(req.body, 'ANTI-VACUOUS: this is the real warning, with its embed list').toContain(embedderLine());
    expect(req.body).not.toContain(SPRING_LINE0_GATE_PATH);
    expect(req.body).not.toContain('whichever character you play');
    expect(req.body).not.toContain('could NOT check');
    answer('cancel');
    await gate;
  });

  it('COULD NOT CHECK: when the listing cannot read the project, it says so, and names nothing it did not find', async () => {
    // The check IS on disk; only the listing is blind. So a name in the warning
    // could only have come from somewhere other than the listing.
    files = fixtureFiles({ gate: true });
    installApi({ rootUnreadableFor: SPRING_LINE0_GATE_EXTENSION });
    await openProject();
    const gate = admitSharedLineEdit();
    const req = await raised();
    expect(req.body).toContain('could NOT check whether one of this project\'s own checks');
    expect(req.body).toContain('EACCES');
    expect(req.body).not.toContain(SPRING_LINE0_GATE_PATH);
    expect(req.body, 'the embed list must have been measured, so the "could NOT check" is the gate\'s')
      .toContain(embedderLine());
    expect((req.body ?? '').split('could NOT check').length - 1).toBe(1);
    answer('cancel');
    await gate;
  });
});

describe('when it cannot look, or cannot save, it says so', () => {
  it('UNMEASURABLE: with no way to list the sources, the warning says it could NOT check', async () => {
    installApi({ noListing: true });
    const gate = admitSharedLineEdit();
    const req = await raised();
    expect(req.body).toContain('could NOT check');
    expect(req.body).not.toMatch(/Nothing else/);
    answer('cancel');
    await gate;
  });

  it('an unsavable shared file is refused in the same dialog, with no way on', async () => {
    files = fixtureFiles({ player: new Uint8Array(10) });   // truncated
    installApi();
    await openProject();
    const gate = admitSharedLineEdit();
    const req = await raised();
    expect(req.title).toBe(LINE0_REFUSED_TITLE);
    expect(req.buttons.map((b) => b.key), 'the refusal offers a way to edit anyway').toEqual(['cancel']);
    expect(req.body).toContain(PLAYER);
    answer(LINE0_ACCEPT_KEY);   // not offered; must not work even if sent
    expect(await gate).toBe(false);
    expect(isSharedLineAcknowledged()).toBe(false);
  });

  it('no shared file at all is refused too, and nothing is created to hold the edit', async () => {
    files = fixtureFiles({ player: null });
    installApi();
    await openProject();
    const gate = admitSharedLineEdit();
    const req = await raised();
    expect(req.title).toBe(LINE0_REFUSED_TITLE);
    answer('cancel');
    expect(await gate).toBe(false);
    for (const p of PLAYER_PALETTE_CANDIDATES) expect(files.has(p)).toBe(false);
  });
});
