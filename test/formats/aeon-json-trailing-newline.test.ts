// Canonical file form — trailing newline — for EVERY JSON file Aurora writes
// into aeon's tree (empyrean docs/AURORA_EFFECTS_SCHEMA.md §8, ruled
// 2026-08-26 and generalised the same day: scene files, `section_N.meta.json`,
// `editor_bg_override.json`, and any later editor-owned sidecar). One rule,
// one writer-side fix — so this file enumerates the writers and holds each to
// the same property rather than letting each discover it on its own diff.
//
// The property is EXACTLY ONE `\n` after the closing bracket: a POSIX text
// file, no "\ No newline at end of file" on every diff, and no blank line
// either. Both halves are asserted — `endsWith('\n')` alone would pass a
// writer that appended twice.
//
// Live-app finding F2 (docs/reviews/2026-08-26-effects-foreground-checks-2.md)
// is the defect this closes: a no-edit Ctrl+S flipped the last byte of aeon's
// `section_4.meta.json`, because aeon's on-disk instance carried the newline
// and Aurora's writer did not.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { referenceFile, skipUnlessPresent } from '../support/fixture-tree';

import type { FileAccess } from '../../src/core/project/adapter';
import { loadAeonProject } from '../../src/core/project/aeon/load';
import { buildAeonSavePlan } from '../../src/core/project/aeon/save';
import { canonicalJsonMinified, canonicalJsonPretty, jsonFileText } from '../../src/core/formats/canonical-json';
import { serializeSectionMeta, parseSectionMeta } from '../../src/core/formats/section-meta';
import { parseEffectsScene, serializeEffectsScene } from '../../src/core/formats/effects/scene';
import { parseBgOverride, serializeBgOverride } from '../../src/core/formats/bg-override/bg-override';
import { serializeBgLibraryIndex } from '../../src/core/formats/bg-library';
import { serializeNametable } from '../../src/core/formats/s4-nametable';
import { serializeBgTiles, BG_WIDTH } from '../../src/core/formats/bg-tiles';
import { serializeTiles } from '../../src/core/export/tile-dedup';
import { SECTION_TILES_WIDE, SECTION_TILES_HIGH } from '../../src/core/model/s4-types';
import type { Tile } from '../../src/core/model/s4-types';

/** The whole rule in one predicate: ends in `\n`, and the byte before is not `\n`. */
function endsInExactlyOneNewline(text: string): boolean {
  return text.endsWith('\n') && !text.endsWith('\n\n');
}

// ── Fixtures (duplicated, not imported: tests must not import each other) ────

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

const enc = (s: string) => new TextEncoder().encode(s);
const dec = (b: Uint8Array) => new TextDecoder().decode(b);

/**
 * A project whose save plan exercises every JSON writer in buildAeonSavePlan:
 * objects.json, rings.json, the meta sidecar (both the ref-carrying write and
 * the explicit-null clear), chunks.json (via a declared chunkLibrary), the BG
 * library index and project.json (retargeted, so it is rewritten).
 *
 * project.json is written WITHOUT a trailing newline on purpose: under the
 * ruling the writer lands on one regardless of what the source carried.
 */
function fixtureFiles(opts: { metaOnDisk?: string } = {}): Map<string, Uint8Array> {
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
        dataPath: 'games/sonic4/data/editor/ojz/act1/',
        bgLayout: 'games/sonic4/data/generated/ojz/act1/ojz_bg.bin',
        bgTiles: 'games/sonic4/data/generated/ojz/act1/ojz_bg_tiles.bin',
        startPosition: { secX: 0, secY: 0, localX: 64, localY: 64 },
      }],
    }],
    objectLibrary: 'games/sonic4/data/objdefs/objects.json',
    chunkLibrary: 'games/sonic4/data/editor/ojz/chunks.json',
  };
  const files = new Map<string, Uint8Array>();
  files.set('project.json', enc(JSON.stringify(proj, null, 2)));
  files.set('games/sonic4/data/generated/ojz/act1/ojz_tiles.bin', serializeTiles([tile(0), tile(1)]));
  const pal = new Uint8Array(96);
  for (let i = 0; i < 48; i++) { pal[i * 2] = 0x0E; pal[i * 2 + 1] = 0xEE; }
  files.set('games/sonic4/data/generated/ojz/act1/ojz_palette.bin', pal);
  const bg = new Uint16Array(BG_WIDTH * 2);
  bg[0] = 1; bg[1] = 2;
  files.set('games/sonic4/data/generated/ojz/act1/ojz_bg.bin', serializeNametable(bg));
  files.set('games/sonic4/data/generated/ojz/act1/ojz_bg_tiles.bin', serializeBgTiles([tile(2), tile(3)]));
  const nt = new Uint16Array(SECTION_TILES_WIDE * SECTION_TILES_HIGH);
  nt[0] = (2 << 13) | 1;
  files.set('games/sonic4/data/editor/ojz/act1/section_0.tiles.bin', serializeNametable(nt));
  files.set('games/sonic4/data/editor/ojz/act1/section_0.objects.json',
    enc(JSON.stringify([{ id: 'o1', typeId: 'ring-monitor', x: 8, y: 8 }])));
  files.set('games/sonic4/data/editor/ojz/act1/section_0.rings.json',
    enc(JSON.stringify([{ id: 'r1', x: 16, y: 16 }])));
  if (opts.metaOnDisk !== undefined) {
    files.set('games/sonic4/data/editor/ojz/act1/section_0.meta.json', enc(opts.metaOnDisk));
  }
  files.set('games/sonic4/data/editor/ojz/chunks.json', enc(JSON.stringify([{
    id: 'c1', name: 'chunk one', widthTiles: 1, heightTiles: 1,
    nametable: [1], collisionA: [0], collisionB: [0],
  }])));
  files.set('games/sonic4/data/objdefs/objects.json',
    enc(JSON.stringify([
      { id: 'ring-monitor', name: 'Ring Monitor', codeLabel: 'Obj_Monitor', defaultSubtype: 0, properties: {} },
    ])));
  return files;
}

async function planFor(files: Map<string, Uint8Array>, mutate?: (r: Awaited<ReturnType<typeof loadAeonProject>>) => void) {
  const fa = memFa(files);
  const r = await loadAeonProject(fa, '/proj');
  mutate?.(r);
  return buildAeonSavePlan(fa, r.config, r.project, 'ojz', 'act1', { legacyAtlasMerged: r.legacyAtlasMerged });
}

const BG_GOLDEN = readFileSync(resolve(__dirname, '../fixtures/bg-override/editor_bg_override.b0e5a661.json'), 'utf8');
const SCENE_GOLDEN = readFileSync(resolve(__dirname, '../fixtures/effects/canopy_dusk.json'), 'utf8');

// ── (1) the chokepoint ───────────────────────────────────────────────────────

describe('canonical-json is where the rule lives', () => {
  it('jsonFileText lands on exactly one newline whatever it is handed', () => {
    expect(jsonFileText('{}')).toBe('{}\n');
    expect(jsonFileText('{}\n')).toBe('{}\n');
    expect(jsonFileText('{}\n\n')).toBe('{}\n');
    expect(jsonFileText('{}\r\n')).toBe('{}\n');
  });

  it('both document classes end in exactly one newline', () => {
    const doc = { b: [1, 2], a: { d: 1, c: 2 } };
    expect(canonicalJsonMinified(doc)).toBe('{"a":{"c":2,"d":1},"b":[1,2]}\n');
    const pretty = canonicalJsonPretty(doc);
    expect(endsInExactlyOneNewline(pretty)).toBe(true);
    expect(pretty.endsWith('}\n')).toBe(true);
  });
});

// ── (2) every writer, by name ────────────────────────────────────────────────

describe('every JSON writer aimed at aeon\'s tree ends in exactly one newline', () => {
  it('serializeSectionMeta', () => {
    const text = serializeSectionMeta(
      { bgLayoutRef: null, paletteRef: null, rasterRef: null, sceneRef: 'ojz_act1_depth' })!;
    expect(text.endsWith('}\n')).toBe(true);
    expect(endsInExactlyOneNewline(text)).toBe(true);
  });

  it('serializeEffectsScene (already compliant at 87c9ea8, and not doubled by the chokepoint)', () => {
    const scene = parseEffectsScene(SCENE_GOLDEN, 'canopy_dusk');
    const text = serializeEffectsScene(scene);
    expect(text.endsWith('}\n')).toBe(true);
    expect(endsInExactlyOneNewline(text)).toBe(true);
    // The golden fixture pinned the one-newline form when scenes were fixed;
    // it must still match byte-for-byte now the rule moved down a layer.
    expect(text).toBe(SCENE_GOLDEN);
  });

  it('serializeBgOverride', () => {
    const text = serializeBgOverride(parseBgOverride(BG_GOLDEN).doc);
    expect(text.endsWith('}\n')).toBe(true);
    expect(endsInExactlyOneNewline(text)).toBe(true);
  });

  it('serializeBgLibraryIndex', () => {
    const text = serializeBgLibraryIndex([{ id: 'a', name: 'A' }]);
    expect(text.endsWith(']\n')).toBe(true);
    expect(endsInExactlyOneNewline(text)).toBe(true);
  });

  it('buildAeonSavePlan: objects.json, rings.json, meta.json, chunks.json, the bglib index and project.json', async () => {
    const plan = await planFor(fixtureFiles(), (r) => {
      const act = r.project.zones[0].acts[0];
      act.sections[0]!.sceneRef = 'ojz_act1_depth';
      r.project.bgLibrary.push({ id: 'deep-forest', name: 'Deep Forest', layout: new Uint16Array(BG_WIDTH * 2), tiles: [tile(4)] } as any);
    });
    const jsonPaths = plan.files.filter(f => f.path.endsWith('.json')).map(f => f.path);
    // Anti-vacuity: the plan really carries every writer this test is about.
    expect(jsonPaths).toEqual(expect.arrayContaining([
      'games/sonic4/data/editor/ojz/act1/section_0.objects.json',
      'games/sonic4/data/editor/ojz/act1/section_0.rings.json',
      'games/sonic4/data/editor/ojz/act1/section_0.meta.json',
      'games/sonic4/data/editor/ojz/chunks.json',
      'games/sonic4/data/editor/ojz_bglib.json',
      'project.json',
    ]));
    for (const f of plan.files) {
      if (!f.path.endsWith('.json')) continue;
      const text = dec(f.bytes);
      expect(endsInExactlyOneNewline(text), `${f.path} must end in exactly one newline`).toBe(true);
      expect(/[}\]]\n$/.test(text), `${f.path} must close its bracket right before the newline`).toBe(true);
      expect(() => JSON.parse(text), `${f.path} must still parse`).not.toThrow();
    }
  });

  it('buildAeonSavePlan: the explicit-null sidecar CLEAR (the bypass writer in save.ts)', async () => {
    const onDisk = serializeSectionMeta(
      { bgLayoutRef: 'bg-cave', paletteRef: null, rasterRef: null, sceneRef: null })!;
    const plan = await planFor(fixtureFiles({ metaOnDisk: onDisk }), (r) => {
      r.project.zones[0].acts[0].sections[0]!.bgLayoutRef = null;
    });
    const meta = plan.files.find(f => f.path === 'games/sonic4/data/editor/ojz/act1/section_0.meta.json');
    expect(meta, 'a cleared sidecar is overwritten with nulls, not left to resurrect').toBeDefined();
    const text = dec(meta!.bytes);
    expect(JSON.parse(text)).toEqual({ bgLayoutRef: null, paletteRef: null, rasterRef: null, sceneRef: null });
    expect(text.endsWith('}\n')).toBe(true);
    expect(endsInExactlyOneNewline(text)).toBe(true);
  });

  it('project.json lands on one newline even when the source file had none (the ruling supersedes the churn rider)', async () => {
    const plan = await planFor(fixtureFiles());
    const text = dec(plan.files.find(f => f.path === 'project.json')!.bytes);
    expect(text.endsWith('}\n')).toBe(true);
    expect(endsInExactlyOneNewline(text)).toBe(true);
  });
});

// ── (3) F2 itself: a no-edit save of aeon's real sidecar is a no-op ──────────

describe('F2: parse → serialize of aeon\'s on-disk files', () => {
  // DERIVED, not a fixed hop. Until 2026-08-29 this read
  // `resolve(__dirname, '../../../../../../aeon')`, which is six levels up —
  // correct from a linked worktree under `.claude/worktrees/<id>/`, and
  // `/aeon` from the main checkout. So on the checkout these tests are
  // normally run from, both rows below took the absent branch and reported
  // PASSED while measuring nothing. Nothing could have made them red.
  const META = referenceFile('aeon', 'games/sonic4/data/editor/ojz/act1/section_4.meta.json');
  const OVERRIDE = referenceFile('aeon', 'games/sonic4/data/editor_bg_override.json');

  /**
   * F2's property is that a no-edit save does not flip a byte GRATUITOUSLY —
   * it was written when the last byte was the newline. It is NOT a promise that
   * the sidecar's key set can never grow: a contracted ref landing legitimately
   * adds an explicit `null` to every sidecar written before it, and this is the
   * SECOND time it has happened (`sceneRef`, 2026-08-22; `rasterRef`, schema
   * §3.1 at empyrean `da91abce`, 2026-08-30). So the row asserts the property
   * F2 owns and DERIVES the permitted delta rather than pinning bytes:
   *
   *   • every key already on disk survives with its value UNCHANGED — that is
   *     the erasure hazard, and it is the half that must never soften;
   *   • any key added is one the parser contributes, and it is `null` — a
   *     non-null addition would be Aurora inventing an assignment;
   *   • removing exactly those added keys returns the file byte-for-byte,
   *     newline included, which is F2 itself.
   *
   * The delta is REPORTED, not repaired — the same shape as the override row
   * below, and for the same reason: the discrepancy is aeon's tree to update on
   * its own next save, not this test's to hide.
   */
  it('section_4.meta.json round-trips with no byte lost: only contracted nulls added', (ctx) => {
    if (skipUnlessPresent(ctx, META, "aeon's on-disk section_4.meta.json")) return;
    const text = readFileSync(META!, 'utf8');
    expect(text.endsWith('\n'), 'the ruling was made on this file carrying the byte').toBe(true);

    const out = serializeSectionMeta(parseSectionMeta(text))!;
    const onDisk = JSON.parse(text) as Record<string, unknown>;
    const written = JSON.parse(out) as Record<string, unknown>;
    // Anti-vacuous: the on-disk file really carries refs to lose.
    expect(Object.keys(onDisk).length).toBeGreaterThan(0);

    // Nothing on disk is dropped or altered.
    for (const k of Object.keys(onDisk)) {
      expect(written, `${k} must survive the round trip`).toHaveProperty(k);
      expect(written[k], `${k} must survive UNCHANGED`).toEqual(onDisk[k]);
    }
    // Anything added is a contracted ref, explicitly null.
    const added = Object.keys(written).filter((k) => !(k in onDisk));
    for (const k of added) expect(written[k], `${k} was added, so it must be null`).toBeNull();
    if (added.length > 0) {
      console.warn(
        `DISCREPANCY: ${META} predates ${added.join(', ')}; Aurora's next write adds `
        + `exactly ${added.length} explicit null(s) and changes nothing else`);
    }
    // ...and F2 proper: for the key set the file actually has, Aurora's own §5
    // chokepoint reproduces those bytes exactly — trailing newline, key order
    // and indent included. Derived through `canonicalJsonPretty`, the writer's
    // own path, rather than compared against a typed string.
    expect(canonicalJsonPretty(onDisk)).toBe(text);
  });

  it('editor_bg_override.json round-trips up to the ruled trailer, and reports the on-disk state', (ctx) => {
    if (skipUnlessPresent(ctx, OVERRIDE, "aeon's on-disk editor_bg_override.json")) return;
    const text = readFileSync(OVERRIDE!, 'utf8');
    const out = serializeBgOverride(parseBgOverride(text).doc);
    // The ruling says aeon changes nothing. If the shipped file does not yet
    // carry the newline, the first Aurora save adds exactly that one byte and
    // nothing else — that is the discrepancy, reported here, not repaired here.
    if (!text.endsWith('\n')) {
      console.warn(`DISCREPANCY: ${OVERRIDE} does not end in "\\n"; Aurora's next write adds exactly that byte`);
    }
    expect(out).toBe(jsonFileText(text));
    expect(out.slice(0, -1)).toBe(text.replace(/\n+$/, ''));
  });
});
