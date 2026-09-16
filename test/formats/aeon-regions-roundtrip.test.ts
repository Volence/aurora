// AN ACT'S PAINTED REGIONS SURVIVE CLOSING AND REOPENING A PROJECT — and, just
// as much, a regions.json Aurora could not read survives a save UNTOUCHED.
//
// The codec is tested in isolation (test/formats/regions-codec.test.ts) and the
// flattening against aeon's golden next door (regions-seam.test.ts). This file
// drives the real `loadAeonProject` -> edit -> `buildAeonSavePlan` -> feed the
// plan back to disk -> `loadAeonProject` cycle, because "the serializer round
// trips" and "the editor's save and load agree about this file" are different
// claims and only the second is one a user experiences.
//
// The pattern — in-memory FileAccess, fixtures duplicated rather than imported,
// nothing read from a peer repo — is `aeon-chunk-links-roundtrip.test.ts`'s,
// which is the same three-way write/clear/refuse shape one document over.
//
// ⚠ THE ONE PLACE THIS DIFFERS FROM CHUNKLINKS, AND IT IS THE CONTRACT'S DOING.
// `regions` is `minItems: 1` in `aurora-regions.schema.json`, so there is no
// "cleared regions document" to overwrite a stale file with. Deleting every
// region therefore plans a REMOVAL, and a removal is the dangerous direction —
// which is why several rows below are about what must NOT be removed.

import { describe, it, expect } from 'vitest';

import type { FileAccess } from '../../src/core/project/adapter';
import { loadAeonProject } from '../../src/core/project/aeon/load';
import { buildAeonSavePlan, type AeonSavePlan } from '../../src/core/project/aeon/save';
import { serializeNametable } from '../../src/core/formats/s4-nametable';
import { serializeTiles } from '../../src/core/export/tile-dedup';
import { SECTION_TILES_WIDE, SECTION_TILES_HIGH } from '../../src/core/model/s4-types';
import type { S4Level } from '../../src/core/editing/commands';
import { EditHistory } from '../../src/core/editing/history';
import type { RegionsDocument } from '../../src/core/formats/regions/document';
import { cloneRegionsDocument } from '../../src/core/formats/regions/act-regions';
import type { Tile } from '../../src/core/model/s4-types';

const DATA = 'games/sonic4/data/editor/ojz/act1/';
const REGIONS_PATH = `${DATA}regions.json`;
const TILES_PATH = `${DATA}section_0.tiles.bin`;

const enc = (s: string) => new TextEncoder().encode(s);
const dec = (b: Uint8Array) => new TextDecoder().decode(b);

function tile(fill: number): Tile {
  return { pixels: new Uint8Array(64).fill(fill) };
}

function memFa(files: Map<string, Uint8Array>): FileAccess {
  return {
    exists: async (rel) => files.has(rel),
    read: async (rel) => {
      const b = files.get(rel);
      if (!b) throw new Error(`ENOENT: ${rel}`);
      return b;
    },
    list: async () => [],
  };
}

/**
 * The act is ONE section, so it is 2048 by 2048 world pixels. Every rectangle
 * below is derived from that rather than from a typed constant, so a fixture
 * that grows the grid cannot leave a rectangle silently outside the act.
 */
const ACT_W = 2048;
const ACT_H = 2048;

function fixtureFiles(extra: Record<string, Uint8Array> = {}): Map<string, Uint8Array> {
  const proj = {
    name: 'Sonic 4',
    engine: 's4',
    zones: [{
      id: 'ojz',
      name: 'Oracle Jungle Zone',
      tileset: 'games/sonic4/data/generated/ojz/act1/ojz_tiles.bin',
      palette: 'games/sonic4/data/generated/ojz/act1/ojz_palette.bin',
      acts: [{
        id: 'act1',
        gridWidth: 1,
        gridHeight: 1,
        dataPath: DATA,
        startPosition: { secX: 0, secY: 0, localX: 64, localY: 64 },
      }],
    }],
    objectLibrary: 'games/sonic4/data/objdefs/objects.json',
    chunkLibrary: '',
  };
  const files = new Map<string, Uint8Array>();
  files.set('project.json', enc(JSON.stringify(proj, null, 2)));
  files.set('games/sonic4/data/generated/ojz/act1/ojz_tiles.bin', serializeTiles([tile(0), tile(1)]));
  const pal = new Uint8Array(96);
  for (let i = 0; i < 48; i++) { pal[i * 2] = 0x0E; pal[i * 2 + 1] = 0xEE; }
  files.set('games/sonic4/data/generated/ojz/act1/ojz_palette.bin', pal);
  files.set(TILES_PATH, serializeNametable(new Uint16Array(SECTION_TILES_WIDE * SECTION_TILES_HIGH)));
  files.set(`${DATA}section_0.objects.json`, enc('[]'));
  files.set(`${DATA}section_0.rings.json`, enc('[]'));
  files.set('games/sonic4/data/objdefs/objects.json', enc('[]'));
  for (const [k, v] of Object.entries(extra)) files.set(k, v);
  return files;
}

/** Two regions that tile the act: a forest and a night strip cut out of it. */
function twoRegions(): RegionsDocument {
  return {
    schema: 1,
    act: 'ojz_act1',
    regions: [
      {
        id: 'forest', name: 'Forest', preset: 'OJZ_Preset_Sec0',
        sceneRef: 'ojz_act1_start',
        rect: { x: 0, y: 0, w: ACT_W - 512, h: ACT_H },
      },
      {
        id: 'night', name: 'Night', preset: 'OJZ_Preset_Night',
        rect: { x: ACT_W - 512, y: 0, w: 512, h: ACT_H },
      },
    ],
  };
}

/** The bytes a previous save would have left — through the real writer. */
function regionsBytes(doc: RegionsDocument): Uint8Array {
  // Built with JSON.stringify and NOT the codec's serializer on purpose: a
  // fixture produced by the thing under test cannot show a writer defect. The
  // key order here is deliberately NOT canonical, so the round-trip row below
  // measures the normalisation instead of a no-op.
  return enc(JSON.stringify({ regions: doc.regions, act: doc.act, schema: doc.schema }, null, 2) + '\n');
}

async function openAndPlan(
  files: Map<string, Uint8Array>,
  mutate?: (r: Awaited<ReturnType<typeof loadAeonProject>>) => void,
) {
  const fa = memFa(files);
  const r = await loadAeonProject(fa, '/proj');
  mutate?.(r);
  const plan = await buildAeonSavePlan(
    fa, r.config, r.project, 'ojz', 'act1', { legacyAtlasMerged: r.legacyAtlasMerged },
  );
  return { loaded: r, act: r.project.zones[0].acts[0], plan };
}

/** Apply a plan the way the renderer's writer does: every write, THEN every removal. */
function applyPlan(files: Map<string, Uint8Array>, plan: AeonSavePlan): Map<string, Uint8Array> {
  const next = new Map(files);
  for (const f of plan.files) next.set(f.path, f.bytes);
  for (const rm of plan.removals) next.delete(rm.path);
  return next;
}

const paths = (plan: AeonSavePlan) => plan.files.map(f => f.path);
const removed = (plan: AeonSavePlan) => plan.removals.map(r => r.path);

describe('an act\'s regions survive close-and-reopen', () => {
  it('a regions.json on disk is READ, PLANNED and reopens to the same document', async () => {
    const doc = twoRegions();
    const first = await openAndPlan(fixtureFiles({ [REGIONS_PATH]: regionsBytes(doc) }));

    expect(first.act.regions.document, 'the load must accept the document').toEqual(doc);
    expect(first.act.regions.loadedPath).toBe(REGIONS_PATH);
    expect(first.act.regions.unreadable).toBeNull();

    // The plan really carries the file — without this the round trip below could
    // "pass" by both sides having read the same untouched bytes off disk.
    expect(paths(first.plan), 'the save plan must contain regions.json').toContain(REGIONS_PATH);

    const reopened = await openAndPlan(applyPlan(fixtureFiles(), first.plan));
    expect(reopened.act.regions.document).toEqual(doc);
  });

  it('an act with NO regions.json creates no file and removes nothing', async () => {
    const { act, plan } = await openAndPlan(fixtureFiles());

    expect(act.regions.document).toBeNull();
    expect(act.regions.loadedPath).toBeNull();
    expect(act.regions.unreadable).toBeNull();
    expect(paths(plan)).not.toContain(REGIONS_PATH);
    expect(removed(plan)).not.toContain(REGIONS_PATH);

    // ANTI-VACUOUS, and this row is the reason the assertion above is worth
    // anything: "the plan does not contain X" passes for an empty plan, a broken
    // fixture, an act that failed to load. It is a real plan with this act's
    // other files in it.
    expect(paths(plan)).toContain(TILES_PATH);
    expect(plan.files.length).toBeGreaterThan(1);
  });

  it('EDITING the regions reaches disk, and reopening shows the edit', async () => {
    const doc = twoRegions();
    const files = fixtureFiles({ [REGIONS_PATH]: regionsBytes(doc) });

    const edited = await openAndPlan(files, (r) => {
      const act = r.project.zones[0].acts[0];
      const before = cloneRegionsDocument(act.regions.document!);
      const after = cloneRegionsDocument(before);
      // One carve: night takes 256 more pixels from forest.
      after.regions[0].rect.w -= 256;
      after.regions[1].rect.x -= 256;
      after.regions[1].rect.w += 256;
      new EditHistory().execute({
        type: 'set-regions', description: 'Carve night', sectionIndex: -1,
        oldDocument: before, newDocument: after,
      }, { sections: act.sections, act } as unknown as S4Level);
    });

    const reopened = await openAndPlan(applyPlan(files, edited.plan));
    const rects = reopened.act.regions.document!.regions.map(r => r.rect);
    expect(rects[0]).toEqual({ x: 0, y: 0, w: ACT_W - 768, h: ACT_H });
    expect(rects[1]).toEqual({ x: ACT_W - 768, y: 0, w: 768, h: ACT_H });
  });

  it('DELETING every region REMOVES the file, and the deletion does not come back', async () => {
    const doc = twoRegions();
    const files = fixtureFiles({ [REGIONS_PATH]: regionsBytes(doc) });

    const cleared = await openAndPlan(files, (r) => {
      const act = r.project.zones[0].acts[0];
      new EditHistory().execute({
        type: 'set-regions', description: 'Delete all regions', sectionIndex: -1,
        oldDocument: cloneRegionsDocument(act.regions.document!), newDocument: null,
      }, { sections: act.sections, act } as unknown as S4Level);
      expect(act.regions.document).toBeNull();
    });

    // Not written, and REMOVED — skipping the file would leave the old regions
    // on disk and the next open would undo the author's deletion.
    expect(paths(cleared.plan)).not.toContain(REGIONS_PATH);
    expect(removed(cleared.plan), 'clearing must unlink the stale file').toContain(REGIONS_PATH);
    expect(cleared.plan.removals.find(r => r.path === REGIONS_PATH)!.what)
      .toContain('ojz/act1');

    const onDisk = applyPlan(files, cleared.plan);
    expect(onDisk.has(REGIONS_PATH)).toBe(false);
    const reopened = await openAndPlan(onDisk);
    expect(reopened.act.regions.document).toBeNull();
  });

  it('a regions.json Aurora CANNOT READ is reported, and is neither written NOR removed', async () => {
    // Shape-refused by the closed schema: `effectsRef` is the key ruling Q8
    // keeps reserved and unspent, so this is the disagreement the contract
    // actually forbids rather than an invented one.
    const broken = enc(JSON.stringify({
      schema: 1, act: 'ojz_act1',
      regions: [{
        id: 'forest', name: 'Forest', preset: 'OJZ_Preset_Sec0',
        effectsRef: 'ojz_act1_start',
        rect: { x: 0, y: 0, w: ACT_W, h: ACT_H },
      }],
    }, null, 2) + '\n');
    const { loaded, act, plan } = await openAndPlan(fixtureFiles({ [REGIONS_PATH]: broken }));

    expect(act.regions.unreadable?.path).toBe(REGIONS_PATH);
    expect(act.regions.unreadable?.reason).toContain('effectsRef');
    expect(act.regions.document).toBeNull();
    expect(act.regions.loadedPath, 'a refused path must never authorise a removal').toBeNull();

    // SAID SO, on the error channel.
    const said = loaded.notices.filter(n => n.message.includes('regions.json'));
    expect(said, 'the refusal must reach the author').toHaveLength(1);
    expect(said[0].severity).toBe('error');

    // The file Aurora did not understand is left exactly as the author left it,
    // in BOTH directions.
    expect(paths(plan)).not.toContain(REGIONS_PATH);
    expect(removed(plan)).not.toContain(REGIONS_PATH);
    // And the author is told their regions are not being saved.
    expect(plan.refusals.some(r => r.includes(REGIONS_PATH))).toBe(true);

    // The refusal is scoped to the one document and did not quietly disable the
    // rest of the act.
    expect(paths(plan)).toContain(TILES_PATH);
  });

  it('a regions.json whose probe CANNOT ANSWER is treated as present, not absent', async () => {
    // A parent directory without execute permission: the read and the stat go
    // down together, so there is no "no" to be had — only "I could not look".
    // Guessing 'absent' would leave the save free to overwrite or unlink it.
    const files = fixtureFiles({ [REGIONS_PATH]: regionsBytes(twoRegions()) });
    const base = memFa(files);
    const blindFa: FileAccess = {
      ...base,
      exists: async (rel) => {
        if (rel === REGIONS_PATH) throw new Error(`EACCES: stat '${rel}'`);
        return base.exists(rel);
      },
      read: async (rel) => {
        if (rel === REGIONS_PATH) throw new Error(`EACCES: open '${rel}'`);
        return base.read(rel);
      },
    };
    const r = await loadAeonProject(blindFa, '/proj');
    const act = r.project.zones[0].acts[0];
    expect(act.regions.unreadable?.path).toBe(REGIONS_PATH);

    const plan = await buildAeonSavePlan(
      blindFa, r.config, r.project, 'ojz', 'act1', { legacyAtlasMerged: r.legacyAtlasMerged },
    );
    expect(paths(plan)).not.toContain(REGIONS_PATH);
    expect(removed(plan)).not.toContain(REGIONS_PATH);
  });

  it('regions.json NEVER enters the section-file ledger that authorises deletions', async () => {
    // `Act.sectionFiles.loadedPaths` is the stranded-`section_N` sweep's
    // permission: a path in it that the section loop does not re-write is a path
    // the save DELETES. regions.json is not a section file and is never written
    // by that loop, so admitting it there would unlink the act's regions on
    // every save.
    const { act, plan } = await openAndPlan(
      fixtureFiles({ [REGIONS_PATH]: regionsBytes(twoRegions()) }));

    expect(act.sectionFiles.loadedPaths).not.toContain(REGIONS_PATH);
    expect(act.sectionFiles.unreadablePaths).not.toContain(REGIONS_PATH);
    // ANTI-VACUOUS: the ledger is a real ledger with this act's section files in
    // it, so "not contained" is a measurement and not an empty list.
    expect(act.sectionFiles.loadedPaths).toContain(TILES_PATH);
    expect(removed(plan)).toEqual([]);
  });

  it('the saved bytes are the contract\'s canonical form', async () => {
    const { plan } = await openAndPlan(
      fixtureFiles({ [REGIONS_PATH]: regionsBytes(twoRegions()) }));
    const text = dec(plan.files.find(f => f.path === REGIONS_PATH)!.bytes);

    // aeon EFFECTS_CONSUMER_CONTRACT.md §5: alphabetical keys, indent 2, exactly
    // one trailing newline. The fixture was written with `regions` first, so
    // this measures the normalisation and not the input.
    expect(text.endsWith('\n')).toBe(true);
    expect(text.endsWith('\n\n')).toBe(false);
    expect(text.indexOf('"act"')).toBeLessThan(text.indexOf('"regions"'));
    expect(text.indexOf('"act"')).toBeGreaterThan(-1);
    expect(text).toContain('\n  "act"');
  });
});
