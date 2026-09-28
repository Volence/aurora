// ROADMAP row 241, SAVE-CONFIG-STRANDING.
//
// `buildAeonSavePlan` retargets pointers in project.json (the zone tileset, an
// act's grid, its BG layout/tiles) and puts `project.json` in its write list
// only when ITS OWN comparison against the session's `config.raw` saw a
// difference. Until row 241 it made that rewrite IN the session's `config.raw`,
// before it could still throw and before the glue had written anything. A save
// refused after the rewrite therefore left it in memory; the next save compared
// against it, saw nothing to change, left `project.json` out, and wrote the
// tileset to the editor path while `project.json` on disk still named the old
// file. On reopen the tile edits were gone. Found by row 225 (e)'s census
// (docs/reviews/2026-09-28-atomic-save-225e-census.md section 6).
//
// Each row drives the REAL `saveAeonProject` over an in-memory disk (the same
// Map the window.api mock writes to) and judges by what a REOPEN of that disk
// shows, which is the author's loss, not by a flag in the plan.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { saveAeonProject } from '../aeon-save';
import { writeProjectFile } from '../../../main/file-io';
import { unwrapWriteOutcome } from '../../../shared/ipc-types';
import { useProjectStore } from '../projectStore';
import { useEditorStore } from '../editorStore';
import { useToastStore } from '../toastStore';
import { loadAeonProject } from '../../../core/project/aeon/load';
import { buildAeonSavePlan } from '../../../core/project/aeon/save';
import type { FileAccess } from '../../../core/project/adapter';
import { serializeNametable } from '../../../core/formats/s4-nametable';
import { serializeTiles } from '../../../core/export/tile-dedup';
import { EFFECTS_V_FACTOR_LOCK } from '../../../core/formats/effects/scene-ui';
import { SECTION_TILES_WIDE, SECTION_TILES_HIGH } from '../../../core/model/s4-types';
import type { Tile } from '../../../core/model/s4-types';

function tile(fill: number): Tile { return { pixels: new Uint8Array(64).fill(fill) }; }

// The two-act fixture of aeon-save.test.ts (the one the census reproduced B4
// on), plus a broken effects scene file for the collision row. The tileset
// pointer is NOT editor-owned (no `editorTilesetPath`), so the first save
// retargets it from data/ojz_tiles.bin to data/editor/ojz_tiles.bin.
const OLD_TILESET = 'data/ojz_tiles.bin';
const PROJECT_JSON = {
  name: 'Two Acts', engine: 's4', objectLibrary: 'data/objects.json', chunkLibrary: '',
  zones: [{
    id: 'ojz', name: 'OJ Zone', tileset: OLD_TILESET, palette: 'data/ojz_pal.bin',
    acts: ['act1', 'act2'].map((id) => ({
      id, gridWidth: 1, gridHeight: 1, dataPath: `data/ojz/${id}/`,
      bgLayout: '', bgTiles: '', sceneRef: null,
      startPosition: { secX: 0, secY: 0, localX: 64, localY: 64 },
    })),
  }],
};
// dataPath data/ojz/act1/ → dataRoot data/ → the effects scene directory.
const BROKEN_SCENE = 'data/editor/effects/broken.json';

function fixtureFiles(): Map<string, Uint8Array> {
  const files = new Map<string, Uint8Array>();
  files.set('project.json', new TextEncoder().encode(JSON.stringify(PROJECT_JSON, null, 2)));
  files.set(OLD_TILESET, serializeTiles([tile(0), tile(1)]));
  const pal = new Uint8Array(96);
  for (let i = 0; i < 48; i++) { pal[i * 2] = 0x0e; pal[i * 2 + 1] = 0xee; }
  files.set('data/ojz_pal.bin', pal);
  for (const act of ['act1', 'act2']) {
    const nt = new Uint16Array(SECTION_TILES_WIDE * SECTION_TILES_HIGH);
    nt[0] = (2 << 13) | 1;
    files.set(`data/ojz/${act}/section_0.tiles.bin`, serializeNametable(nt));
  }
  files.set('data/objects.json', new TextEncoder().encode('[]'));
  files.set(BROKEN_SCENE, new TextEncoder().encode('{ "schema": 1, "id": "broken"'));
  return files;
}

/** A FileAccess over the Map that really lists (the scene library walks it). */
function memFa(files: Map<string, Uint8Array>): FileAccess {
  return {
    exists: async (rel) => files.has(rel)
      || (rel.endsWith('/') && [...files.keys()].some((k) => k.startsWith(rel))),
    read: async (rel) => {
      const b = files.get(rel);
      if (!b) throw new Error(`ENOENT: ${rel}`);
      return b;
    },
    list: async (relDir) => {
      const dir = relDir.endsWith('/') ? relDir : `${relDir}/`;
      const out = new Set<string>();
      for (const k of files.keys()) {
        if (k.startsWith(dir)) out.add(k.slice(dir.length).split('/')[0]);
      }
      return [...out];
    },
  };
}

type WriteFn = (dir: string, rel: string, data: ArrayBuffer) => Promise<void>;

function installWindowApi(files: Map<string, Uint8Array>, written: string[]): { api: Record<string, unknown>; write: WriteFn } {
  const write: WriteFn = async (_dir, rel, data) => {
    files.set(rel, new Uint8Array(data));
    written.push(rel);
  };
  // The surface of aeon-save.test.ts's mock: what the plan's IPC FileAccess
  // (probes, reads) and the glue's batched read and write touch.
  const api: Record<string, unknown> = {
    probePath: async (_dir: string, rel: string) => (
      files.has(rel) ? { presence: 'present', reason: null } : { presence: 'absent', reason: null }
    ),
    readBinaryFile: async (_dir: string, rel: string) => {
      const b = files.get(rel);
      if (!b) throw new Error(`ENOENT: ${rel}`);
      return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength);
    },
    probeDir: async () => ({ outcome: 'absent', entries: null, reason: null }),
    fileMtime: async () => null,
    readManyFiles: async (_dir: string, rels: string[]) =>
      rels.map((rel) => {
        const b = files.get(rel);
        return { relPath: rel, bytes: b ?? null, mtimeMs: b ? 1 : null };
      }),
    writeBinaryFile: write,
  };
  (globalThis as { window?: unknown }).window = { api };
  return { api, write };
}

describe('row 241: a refused save does not strand a project.json rewrite in memory', () => {
  let files: Map<string, Uint8Array>;
  let written: string[];
  let api: Record<string, unknown>;
  let realWrite: WriteFn;

  beforeEach(async () => {
    files = fixtureFiles();
    written = [];
    ({ api, write: realWrite } = installWindowApi(files, written));
    const r = await loadAeonProject(memFa(files), '/proj');
    // The fixture really is in the state the collision row needs: the broken
    // file is refused by the load and is not visible as a scene.
    expect(r.project.effectsScenes.unreadable.map((u) => u.path)).toEqual([BROKEN_SCENE]);
    useProjectStore.setState({
      config: r.config, project: r.project,
      currentZoneId: 'ojz', currentActId: 'act1', legacyAtlasMerged: false,
    } as never);
    useEditorStore.getState().markClean();
    useToastStore.setState({ toasts: [] });
  });

  afterEach(() => {
    useEditorStore.getState().markClean();
    delete (globalThis as { window?: unknown }).window;
  });

  /** The author's tile edit: tile 1's first pixel, to a value the fixture never holds. */
  const EDITED_PIXEL = 7;
  const editTile = () => {
    const project = useProjectStore.getState().project!;
    project.zones[0].tileset.tiles[1].pixels[0] = EDITED_PIXEL;
    useEditorStore.getState().markDirty();
  };
  /** What a reopen of the disk shows for that pixel. */
  const reopenedPixel = async (): Promise<number> => {
    const r = await loadAeonProject(memFa(files), '/proj');
    return r.project.zones[0].tileset.tiles[1].pixels[0];
  };

  it('a save refused by a scene-id collision, then a clean save: the tile edit survives a reopen', async () => {
    editTile();
    // A scene authored under the broken file's stem: the plan throws AFTER the
    // tileset retarget (save.ts, the scene loop comes after the zone loop).
    const project = useProjectStore.getState().project!;
    project.effectsScenes.scenes.push({
      schema: 1, id: 'broken', layers: [{ world_y: 0, fa: 'FACTOR_1', fb: 'FACTOR_1' }],
      v_factor: EFFECTS_V_FACTOR_LOCK,
    });
    const refused = await saveAeonProject();
    expect(refused.kind).toBe('error');
    expect(refused.kind === 'error' && refused.message).toMatch(/refusing to save scene "broken"/);
    expect(written, 'the refused plan wrote nothing').toEqual([]);

    // The author renames the scene away (here: removes it) and saves again.
    project.effectsScenes.scenes.pop();
    expect((await saveAeonProject()).kind).toBe('saved');

    expect(await reopenedPixel()).toBe(EDITED_PIXEL);
  });

  describe('a write the main process refuses before project.json', () => {
    let tmp: string;
    beforeEach(() => {
      tmp = mkdtempSync(join(tmpdir(), 'aurora-241-'));
      mkdirSync(join(tmp, 'project'), { recursive: true });
    });
    afterEach(() => { rmSync(tmp, { recursive: true, force: true }); });

    it('then a clean save: the tile edit survives a reopen', async () => {
      editTile();
      // The first save's tileset write (planned before project.json) goes to
      // the REAL main-side guard on an escaping path, which refuses it; the
      // refusal is converted by the real preload helper. Every later write lands.
      const base = join(tmp, 'project');
      let refusedOnce = false;
      api.writeBinaryFile = async (d: string, rel: string, data: ArrayBuffer) => {
        if (!refusedOnce && rel.endsWith('_tiles.bin')) {
          refusedOnce = true;
          unwrapWriteOutcome(await writeProjectFile(base, `../${rel}`, data));
          throw new Error('unreachable: the guard did not refuse the escaping path');
        }
        return realWrite(d, rel, data);
      };
      const refused = await saveAeonProject();
      expect(refused.kind).toBe('error');
      expect(refused.kind === 'error' && refused.message).toMatch(/write refused by the main process/);
      expect(written, 'project.json was not reached').not.toContain('project.json');

      expect((await saveAeonProject()).kind).toBe('saved');

      expect(await reopenedPixel()).toBe(EDITED_PIXEL);
    });
  });

  it('a clean first save writes project.json exactly once', async () => {
    editTile();
    expect((await saveAeonProject()).kind).toBe('saved');
    expect(written.filter((p) => p === 'project.json')).toHaveLength(1);
  });

  it('after a clean save, the next plan with no change leaves project.json out (no churn)', async () => {
    // Both acts dirty, so the second act's plan runs after the first act's
    // retarget was written: it must see it as current, not plan it again.
    useProjectStore.setState({ currentActId: 'act2' } as never);
    useEditorStore.getState().markDirty();
    editTile();
    expect((await saveAeonProject()).kind).toBe('saved');
    // Measured on the PLAN, not the disk: the glue's skip compares project.json
    // by meaning, so a re-planned identical project.json would never show up in
    // `written` and a disk assertion here could not go red. What the next save
    // plans is what the session's config says, which is the thing under test.
    const { config, project } = useProjectStore.getState();
    for (const actId of ['act1', 'act2']) {
      const plan = await buildAeonSavePlan(memFa(files), config!, project!, 'ojz', actId,
        { legacyAtlasMerged: false });
      expect(plan.configChanged, actId).toBe(false);
      expect(plan.files.map((f) => f.path), actId).not.toContain('project.json');
    }
  });
});
