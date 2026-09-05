// The BG override document THROUGH THE AEON PROJECT: loaded by loadAeonProject,
// written by buildAeonSavePlan.
//
// The codec's own tests prove it can read and write the format. Nothing in them
// proves the project CALLS it — and until this parcel, nothing did. These rows
// are about the wiring only, and each one is aimed at a way the wiring can be
// present and still wrong:
//
//   • ABSENT is silent. No file is the ordinary answer, and it must not raise,
//     must not notice, and must not cause a write.
//   • UNREADABLE is loud AND UNTOUCHABLE. A file that exists and will not parse
//     produces a notice, leaves `doc` null, and — the row that matters — is NOT
//     in the save plan. Overwriting it is the destruction this whole surface is
//     built against (docs/BUGS.md TOOL-01, aeon dd93a840).
//   • PRESENT is proven against a document the loader could not have invented:
//     two bands with distinct geometry, drivers and rate shifts.
//   • IDENTITY: `handle.bgOverride` and `project.bgOverride` are ONE object.
//   • UNCHANGED WRITES NOTHING. An open-then-save of an untouched project must
//     not put an 89 KB no-op diff in someone else's repository.
//   • CHANGED WRITES, and what it writes parses back to what was in memory.
//
// The fixture is the REAL b0e5a661 document (340 tiles, 2 bands), not a
// hand-built stub: a stub built to the reader's expectations agrees with the
// reader by construction.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import type { FileAccess } from '../../adapter';
import { loadAeonProject } from '../load';
import { buildAeonSavePlan } from '../save';
import { parseBgOverride, serializeBgOverride } from '../../../formats/bg-override/bg-override';
import { saveFileFor } from '../../../formats/bg-override/bg-override-io';
import { describeBands } from '../../../formats/bg-override/bg-anim-band';
import { makeDemoteBandCommand } from '../../../editing/bg-override-band';
import { EditHistory } from '../../../editing/history';
import { serializeNametable } from '../../../formats/s4-nametable';
import { serializeTiles } from '../../../export/tile-dedup';
import { SECTION_TILES_WIDE, SECTION_TILES_HIGH } from '../../../model/s4-types';
import type { Tile } from '../../../model/s4-types';

const FIXTURE_PATH = 'test/fixtures/bg-override/editor_bg_override.b0e5a661.json';
const FIXTURE_TEXT = readFileSync(FIXTURE_PATH, 'utf8');

/** `dataPath: 'data/ojz/act1/'` → dataRoot `data/` → this path (contract §1.1). */
const OVERRIDE_PATH = 'data/editor_bg_override.json';

function tile(fill: number): Tile {
  return { pixels: new Uint8Array(64).fill(fill) };
}

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
        if (!k.startsWith(dir)) continue;
        out.add(k.slice(dir.length).split('/')[0]);
      }
      return [...out];
    },
  };
}

const PROJECT_JSON = {
  name: 'Test Project',
  engine: 's4',
  objectLibrary: 'data/objects.json',
  chunkLibrary: '',
  zones: [{
    id: 'ojz', name: 'OJ Zone',
    tileset: 'data/ojz_tiles.bin',
    palette: 'data/ojz_pal.bin',
    acts: [{
      id: 'act1', gridWidth: 1, gridHeight: 1,
      dataPath: 'data/ojz/act1/',
      bgLayout: '', bgTiles: '', sceneRef: null,
      startPosition: { secX: 0, secY: 0, localX: 64, localY: 64 },
    }],
  }],
};

function fixtureFiles(): Map<string, Uint8Array> {
  const files = new Map<string, Uint8Array>();
  files.set('project.json', new TextEncoder().encode(JSON.stringify(PROJECT_JSON)));
  files.set('data/ojz_tiles.bin', serializeTiles([tile(0), tile(1)]));
  const pal = new Uint8Array(96);
  for (let i = 0; i < 48; i++) { pal[i * 2] = 0x0E; pal[i * 2 + 1] = 0xEE; }
  files.set('data/ojz_pal.bin', pal);
  const nt = new Uint16Array(SECTION_TILES_WIDE * SECTION_TILES_HIGH);
  nt[0] = (2 << 13) | 1;
  files.set('data/ojz/act1/section_0.tiles.bin', serializeNametable(nt));
  files.set('data/objects.json', new TextEncoder().encode(JSON.stringify([])));
  return files;
}

function withOverride(text: string): Map<string, Uint8Array> {
  const files = fixtureFiles();
  files.set(OVERRIDE_PATH, new TextEncoder().encode(text));
  return files;
}

const savePlan = (fa: FileAccess, r: Awaited<ReturnType<typeof loadAeonProject>>) =>
  buildAeonSavePlan(fa, r.config, r.project, 'ojz', 'act1', { legacyAtlasMerged: false });

describe('the BG override document through loadAeonProject', () => {
  it('an ABSENT file loads as no document, with no error and no notice', async () => {
    const fa = memFa(fixtureFiles());
    const r = await loadAeonProject(fa, '/p');
    expect(r.project.bgOverride.doc).toBeNull();
    expect(r.project.bgOverride.unreadable).toBeNull();
    expect(r.project.bgOverride.notices).toEqual([]);
    // The path is still known — a UI has to be able to say where it WOULD be.
    expect(r.project.bgOverride.path).toBe(OVERRIDE_PATH);
  });

  it('a PRESENT file is parsed, with its bands as the document actually spells them', async () => {
    const fa = memFa(withOverride(FIXTURE_TEXT));
    const r = await loadAeonProject(fa, '/p');
    const doc = r.project.bgOverride.doc;
    expect(doc).not.toBeNull();
    // Anti-vacuous, and derived from the file rather than typed in: the same
    // numbers, read independently by JSON.parse.
    const raw = JSON.parse(FIXTURE_TEXT) as { tiles: unknown[]; anims: unknown[] };
    expect(doc!.tiles).toHaveLength(raw.tiles.length);
    const bands = describeBands(doc!);
    expect(bands).toHaveLength(raw.anims.length);
    // Two bands the loader could not have invented: different geometry, different
    // driver, different rate shift, and slot bases that only come out right if
    // the list order survived the read.
    expect(bands.map((b) => `${b.cols}x${b.rows}/${b.driver}/${b.rateShift}@${b.slotBase}`))
      .toEqual(['32x4/camera_x/2@0', '16x4/timer/3@128']);
  });

  it('an UNREADABLE file is loud, leaves no document, and is NEVER a write', async () => {
    const files = withOverride('{ "layout": [1,2,3], "tiles": ');   // truncated JSON
    const fa = memFa(files);
    const r = await loadAeonProject(fa, '/p');

    expect(r.project.bgOverride.doc).toBeNull();
    expect(r.project.bgOverride.unreadable?.path).toBe(OVERRIDE_PATH);
    expect(r.notices.some((n) => n.message.includes(OVERRIDE_PATH) && n.message.includes('will NOT overwrite')))
      .toBe(true);

    const plan = await savePlan(fa, r);
    expect(plan.files.map((f) => f.path)).not.toContain(OVERRIDE_PATH);
  });

  it('the handle name and the model name are ONE object, not a copy', async () => {
    const fa = memFa(withOverride(FIXTURE_TEXT));
    const r = await loadAeonProject(fa, '/p');
    expect(r.bgOverride).toBe(r.project.bgOverride);
  });
});

describe('the BG override document through buildAeonSavePlan', () => {
  it('an UNTOUCHED document whose on-disk spelling is already canonical is not written at all',
    async () => {
      // THE SPELLING MATTERS AND THE FIXTURE HAS THE OTHER ONE. The b0e5a661
      // fixture was captured with `json.dumps` defaults (`", "` separators);
      // aeon's LIVE `editor_bg_override.json` is minified, which is what this
      // codec emits — verified 2026-08-22 by parsing and re-serializing that
      // 88,993-byte file and getting the same bytes back. So the canonical
      // spelling used here is what a real project actually holds, and the row
      // below is about the file the fixture happens to be.
      const canonical = serializeBgOverride(parseBgOverride(FIXTURE_TEXT).doc);
      const fa = memFa(withOverride(canonical));
      const r = await loadAeonProject(fa, '/p');
      expect(r.project.bgOverride.doc).not.toBeNull();     // anti-vacuous
      const plan = await savePlan(fa, r);
      // Not "the bytes match" — no write AT ALL, because a no-op write is still
      // a touched mtime and a diff in a repository Aurora does not own.
      expect(plan.files.map((f) => f.path)).not.toContain(OVERRIDE_PATH);
    });

  it('an untouched document spelled DIFFERENTLY is rewritten, and the rewrite is whitespace only',
    async () => {
      // The honest other half. A hand-formatted or `json.dumps`-defaulted file
      // does get normalized the first time Aurora saves the project — Aurora is
      // the sole writer of record and has one spelling. That is a real diff an
      // author will see once, so it is stated as a row rather than left for them
      // to discover, and the row proves the normalization changes NOTHING but
      // the bytes' layout.
      const fa = memFa(withOverride(FIXTURE_TEXT));
      const r = await loadAeonProject(fa, '/p');
      const plan = await savePlan(fa, r);
      const written = plan.files.find((f) => f.path === OVERRIDE_PATH);
      expect(written).toBeDefined();
      expect(new TextDecoder().decode(written!.bytes)).not.toBe(FIXTURE_TEXT);
      // Deep equality against JSON.parse of the ORIGINAL, not against the
      // loader's document: a comparison against what the reader produced could
      // not tell a faithful rewrite from a reader and writer sharing a mistake.
      expect(JSON.parse(new TextDecoder().decode(written!.bytes)))
        .toEqual(JSON.parse(FIXTURE_TEXT));
    });

  it('an EDITED document is written, and what is written parses back to what was in memory',
    async () => {
      const fa = memFa(withOverride(FIXTURE_TEXT));
      const r = await loadAeonProject(fa, '/p');
      const holder = r.project.bgOverride;

      // Edit through the real command, on a level view that writes back — the
      // holder is what save reads, so an edit that did not reach it would make
      // the row below pass for the wrong reason.
      const level = { sections: [], bgOverride: holder.doc! };
      new EditHistory().execute(makeDemoteBandCommand(holder.doc!, 1), level);
      holder.doc = level.bgOverride;
      expect(describeBands(holder.doc)).toHaveLength(1);

      const plan = await savePlan(fa, r);
      const written = plan.files.find((f) => f.path === OVERRIDE_PATH);
      expect(written).toBeDefined();

      const reread = parseBgOverride(new TextDecoder().decode(written!.bytes)).doc;
      expect(describeBands(reread)).toHaveLength(1);
      // The demotion is LOSSLESS, so the blob is the same size it was — which is
      // the property that separates a demotion from a removal on disk.
      expect(reread.tiles).toHaveLength((JSON.parse(FIXTURE_TEXT) as { tiles: unknown[] }).tiles.length);
    });
});

// ---------------------------------------------------------------------------
// `saveFileFor`'s three refusals, asked of it DIRECTLY.
//
// WHY SEPARATELY, AND THIS IS THE BAR-2b POINT. The project-level row above —
// "an UNREADABLE file … is NEVER a write" — passes, and does NOT discriminate
// the unreadable check: `loadBgOverride` leaves `doc` null in that case, so
// `saveFileFor` returns on its FIRST branch and the unreadable branch is never
// reached. Deleting that branch leaves the project row green. Confirmed by
// planting it, 2026-08-22.
//
// That does not make the branch pointless — it is the belt to the load path's
// braces, and the state it guards (a document in memory beside a file that would
// not parse) is one any future second writer of this holder could produce. It
// means the branch needs a test that can actually reach it, which is these rows:
// they hand `saveFileFor` the state directly, so each refusal is measured by
// itself instead of behind another one.
// ---------------------------------------------------------------------------
describe('saveFileFor refuses for three separate reasons', () => {
  const doc = () => parseBgOverride(FIXTURE_TEXT).doc;

  it('no document: nothing to write', () => {
    expect(saveFileFor({
      path: OVERRIDE_PATH, doc: null, unreadable: null, loadedText: null, notices: [],
    })).toBeNull();
  });

  it('a document beside an UNREADABLE file is never written over it', () => {
    // The state the project-level row cannot reach. Without the unreadable
    // branch this returns a WRITE aimed at the file that would not parse.
    expect(saveFileFor({
      path: OVERRIDE_PATH,
      doc: doc(),
      unreadable: { path: OVERRIDE_PATH, reason: 'truncated' },
      loadedText: null,
      notices: [],
    })).toBeNull();
  });

  it('a document that re-serializes to the text it was loaded from is not written', () => {
    const d = doc();
    expect(saveFileFor({
      path: OVERRIDE_PATH, doc: d, unreadable: null,
      loadedText: serializeBgOverride(d), notices: [],
    })).toBeNull();
  });

  it('…and IS written the moment those bytes differ', () => {
    // The anti-vacuous companion: the three nulls above would all be produced by
    // a `saveFileFor` that returned null unconditionally.
    const d = doc();
    const file = saveFileFor({
      path: OVERRIDE_PATH, doc: d, unreadable: null,
      loadedText: `${serializeBgOverride(d)} `, notices: [],
    });
    expect(file?.path).toBe(OVERRIDE_PATH);
    expect(new TextDecoder().decode(file!.bytes)).toBe(serializeBgOverride(d));
  });
});
