/**
 * ROADMAP row 235 (a): where the drafted paste lands on an act (`placeDraftOnAct`,
 * `destinationFree`), on aeon's own vendored manifests.
 *
 * EVERY EXPECTATION IS DERIVED from the manifest's raw rectangles, by an oracle
 * written HERE from aeon's R8/R10 wording (inside the act; no overlap with a
 * clip, corridor or shaft dst_rect), never from a typed coordinate and never by
 * calling the predicate under test. So a wrong `destinationFree` disagrees with
 * the oracle instead of agreeing with itself.
 *
 *   * s2_ehz_cpz (the real act row 219 put on the page): a draft carried from
 *     another act at (0,0) sits inside one of its rectangles; it is re-placed to
 *     the oracle's first free section origin, for a census of source sizes;
 *   * a carried draft that is already free stays put (the author's choice is
 *     not undone when nothing is wrong with it);
 *   * no free spot: no destination, 'none-free', never an overlapping one;
 *   * a shaft counts (aeon's R10 is over clips, corridors AND shafts): the woven
 *     act aeon judged in validate-json.cases.json.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  destinationFree, parseClipManifest, placeDraftOnAct, suggestDestination, type ClipRect,
} from '../../src/core/formats/donors/clip-manifest-doc';
import { SECTION_PIXEL_SIZE } from '../../src/core/model/s4-types';

const S = SECTION_PIXEL_SIZE;
const EHZ_CPZ_TEXT = readFileSync(resolve(__dirname, '../fixtures/clips/s2_ehz_cpz.clips.json'), 'utf8');
const CASES = JSON.parse(readFileSync(resolve(__dirname, '../fixtures/clips/aeon-outputs/validate-json.cases.json'), 'utf8')) as
  Record<string, { manifest?: Record<string, unknown> }>;

interface RawAct {
  act: { grid_w: number; grid_h: number };
  clips: Array<{ id: string; dst_rect: ClipRect }>;
  corridors?: Array<{ id: string; dst_rect: ClipRect }>;
  shafts?: Array<{ id: string; dst_rect: ClipRect }>;
}

// ── the oracle, from aeon's words (tools/clip_manifest.py R8, R10) ───────────
const hit = (a: ClipRect, b: ClipRect) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
const rectsOf = (raw: RawAct) => [...raw.clips, ...(raw.corridors ?? []), ...(raw.shafts ?? [])].map((k) => k.dst_rect);
const inside = (raw: RawAct, r: ClipRect) =>
  r.x >= 0 && r.y >= 0 && r.x + r.w <= raw.act.grid_w * S && r.y + r.h <= raw.act.grid_h * S;
const free = (raw: RawAct, r: ClipRect) => inside(raw, r) && !rectsOf(raw).some((p) => hit(p, r));
/** Every section origin, row by row, where a w x h paste is free. */
const freeOrigins = (raw: RawAct, w: number, h: number) => {
  const out: Array<{ x: number; y: number }> = [];
  for (let y = 0; y < raw.act.grid_h * S; y += S) {
    for (let x = 0; x < raw.act.grid_w * S; x += S) if (free(raw, { x, y, w, h })) out.push({ x, y });
  }
  return out;
};

const EHZ_CPZ_RAW = JSON.parse(EHZ_CPZ_TEXT) as RawAct;
const EHZ_CPZ = parseClipManifest(EHZ_CPZ_TEXT);
const GW = EHZ_CPZ.gridW; const GH = EHZ_CPZ.gridH;

/** A census of source rectangles on the 16-px grid: one section, a strip, a sliver, the harness's marquee shape. */
const SOURCES: ClipRect[] = [
  { x: 0, y: 0, w: S, h: S },
  { x: 2048, y: 128, w: 1472, h: 576 },
  { x: 16, y: 32, w: 16, h: 16 },
  { x: 0, y: 0, w: 2 * S, h: S / 2 },
  { x: 0, y: 0, w: S / 2, h: 2 * S },
];

describe('the s2_ehz_cpz fixture is the act the row is about (anti-vacuous, read from the file)', () => {
  it('its grid, clips and corridors are what the document reads, and it has both kinds of rectangle', () => {
    expect([GW, GH]).toEqual([EHZ_CPZ_RAW.act.grid_w, EHZ_CPZ_RAW.act.grid_h]);
    expect(EHZ_CPZ.clips.map((c) => [c.id, c.dst])).toEqual(EHZ_CPZ_RAW.clips.map((c) => [c.id, c.dst_rect]));
    expect(EHZ_CPZ.corridors.map((c) => [c.id, c.dst])).toEqual((EHZ_CPZ_RAW.corridors ?? []).map((c) => [c.id, c.dst_rect]));
    expect(EHZ_CPZ.clips.length).toBeGreaterThanOrEqual(2);
    expect(EHZ_CPZ.corridors.length).toBeGreaterThanOrEqual(1);
  });
});

describe('destinationFree is aeon\'s R8 + R10 (every section origin of s2_ehz_cpz, every source in the census)', () => {
  it('agrees with the oracle at every section origin, and the census holds both answers', () => {
    const seen = { free: 0, taken: 0 }; const bad: string[] = [];
    for (const src of SOURCES) {
      for (let y = 0; y < GH * S; y += S) {
        for (let x = 0; x < GW * S; x += S) {
          const r = { x, y, w: src.w, h: src.h };
          const want = free(EHZ_CPZ_RAW, r);
          seen[want ? 'free' : 'taken']++;
          if (destinationFree(EHZ_CPZ, GW, GH, r) !== want) bad.push(JSON.stringify(r));
        }
      }
    }
    expect(bad).toEqual([]);
    expect(seen.free).toBeGreaterThan(0);
    expect(seen.taken).toBeGreaterThan(0);
  });
});

describe('a draft carried onto s2_ehz_cpz from another act (the row\'s defect)', () => {
  it('the carried (0,0) sits inside one of the act\'s rectangles for every source: the defect is real on this act', () => {
    for (const src of SOURCES) expect(free(EHZ_CPZ_RAW, { x: 0, y: 0, w: src.w, h: src.h })).toBe(false);
  });

  it('is re-placed at the oracle\'s FIRST free section origin, row by row, which overlaps no clip or corridor', () => {
    for (const src of SOURCES) {
      const origins = freeOrigins(EHZ_CPZ_RAW, src.w, src.h);
      expect(origins.length, JSON.stringify(src)).toBeGreaterThan(0);
      const got = placeDraftOnAct(EHZ_CPZ, GW, GH, src, { x: 0, y: 0 });
      expect(got, JSON.stringify(src)).toEqual({ kind: 'suggested', dst: origins[0] });
      const r = { ...origins[0], w: src.w, h: src.h };
      expect(rectsOf(EHZ_CPZ_RAW).filter((p) => hit(p, r))).toEqual([]);
      expect(inside(EHZ_CPZ_RAW, r)).toBe(true);
    }
  });

  it('with no draft carried, the placement is the same first free origin (the page\'s one rule for a new draft)', () => {
    for (const src of SOURCES) {
      expect(placeDraftOnAct(EHZ_CPZ, GW, GH, src, null)).toEqual({ kind: 'suggested', dst: freeOrigins(EHZ_CPZ_RAW, src.w, src.h)[0] });
      expect(suggestDestination(EHZ_CPZ, GW, GH, src)).toEqual(freeOrigins(EHZ_CPZ_RAW, src.w, src.h)[0]);
    }
  });
});

describe('a carried draft that is already free stays put', () => {
  it('the LAST free origin (so kept and suggested cannot coincide) is kept, for every source', () => {
    for (const src of SOURCES) {
      const origins = freeOrigins(EHZ_CPZ_RAW, src.w, src.h);
      expect(origins.length, JSON.stringify(src)).toBeGreaterThan(1);
      const last = origins[origins.length - 1];
      expect(placeDraftOnAct(EHZ_CPZ, GW, GH, src, last)).toEqual({ kind: 'kept', dst: last });
    }
  });

  it('an off-grid carried spot that is free is kept too (an author\'s free placement, R11 with a reason)', () => {
    const src = { x: 16, y: 32, w: 16, h: 16 };
    const at = { x: freeOrigins(EHZ_CPZ_RAW, 16, 16)[0].x + 48, y: freeOrigins(EHZ_CPZ_RAW, 16, 16)[0].y + 80 };
    expect(free(EHZ_CPZ_RAW, { ...at, w: 16, h: 16 })).toBe(true);
    expect(placeDraftOnAct(EHZ_CPZ, GW, GH, src, at)).toEqual({ kind: 'kept', dst: at });
  });

  it('a carried spot that runs past the act\'s edge is not free (R8): it is re-placed', () => {
    const src = { x: 0, y: 0, w: S, h: S };
    const past = { x: GW * S - S / 2, y: 0 };
    expect(inside(EHZ_CPZ_RAW, { ...past, w: S, h: S })).toBe(false);
    expect(placeDraftOnAct(EHZ_CPZ, GW, GH, src, past).kind).toBe('suggested');
  });
});

describe('no free spot on the act', () => {
  it('a source as big as the act: no destination and \'none-free\', never an overlapping draft', () => {
    const src = { x: 0, y: 0, w: GW * S, h: GH * S };
    expect(freeOrigins(EHZ_CPZ_RAW, src.w, src.h)).toEqual([]);
    expect(placeDraftOnAct(EHZ_CPZ, GW, GH, src, { x: 0, y: 0 })).toEqual({ kind: 'none-free', dst: null });
    expect(placeDraftOnAct(EHZ_CPZ, GW, GH, src, null)).toEqual({ kind: 'none-free', dst: null });
  });

  it('a full-height column: every section column of the act crosses a clip or corridor (the oracle finds none free)', () => {
    const src = { x: 0, y: 0, w: S, h: GH * S };
    expect(freeOrigins(EHZ_CPZ_RAW, src.w, src.h)).toEqual([]);
    expect(placeDraftOnAct(EHZ_CPZ, GW, GH, src, null).kind).toBe('none-free');
  });

  it('a source off the 16-px grid with an occupied carried spot: no destination, \'off-grid\' (the page asks for a hand placement)', () => {
    expect(placeDraftOnAct(EHZ_CPZ, GW, GH, { x: 8, y: 0, w: 64, h: 64 }, { x: 0, y: 0 })).toEqual({ kind: 'off-grid', dst: null });
  });
});

describe('a shaft is a placed rectangle (aeon\'s R10 is over clips, corridors AND shafts)', () => {
  const k = 'refuse_k9_shaft_dup_clip_id';
  const raw = CASES[k].manifest as unknown as RawAct;
  const doc = parseClipManifest(JSON.stringify(raw));
  const gw = raw.act.grid_w; const gh = raw.act.grid_h;
  // A shaft whose rectangle no clip or corridor touches, so ONLY the shaft can make it taken.
  const lone = (raw.shafts ?? []).find((s) => ![...raw.clips, ...(raw.corridors ?? [])].some((c) => hit(c.dst_rect, s.dst_rect))
    && inside(raw, s.dst_rect));

  it('the woven act has such a shaft (anti-vacuous)', () => {
    expect((raw.shafts ?? []).length).toBeGreaterThan(0);
    expect(lone, 'no shaft clear of every clip and corridor').toBeDefined();
  });

  it('a draft exactly on that shaft is not free, and is re-placed off every shaft', () => {
    const s = lone!.dst_rect;
    expect(destinationFree(doc, gw, gh, s)).toBe(false);
    const src = { x: 0, y: 0, w: s.w, h: s.h };
    const got = placeDraftOnAct(doc, gw, gh, src, { x: s.x, y: s.y });
    expect(got).toEqual({ kind: 'suggested', dst: freeOrigins(raw, s.w, s.h)[0] });
    const r = { ...got.dst!, w: s.w, h: s.h };
    expect((raw.shafts ?? []).filter((q) => hit(q.dst_rect, r))).toEqual([]);
  });
});
