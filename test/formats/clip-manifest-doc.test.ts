/**
 * The clip manifest AS A DOCUMENT, on aeon's own vendored manifests
 * (test/fixtures/clips/, currency held by aeon-fixture-currency.test.ts).
 *
 * The properties a paste depends on, one row each:
 *   * region_id is READ absent-capable: s2_two_clip_pins carries it on no clip
 *     (the settled packet names that fixture for exactly this row);
 *   * nothing is DROPPED on a rewrite: every key of every vendored manifest
 *     survives parse -> append -> serialise, corridors and opt-outs included;
 *   * a paste writes no field Aurora cannot vouch for (no region_id, no palette);
 *   * the defaults the page offers satisfy aeon's R6/R11/R12 by construction.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  clipIdProblem, gridToHold, newClipManifest, parseClipManifest, serializeClipManifest,
  snapDestination, suggestClipId, suggestDestination, withClip, REGION_ID_RE,
} from '../../src/core/formats/donors/clip-manifest-doc';
import { SECTION_PIXEL_SIZE } from '../../src/core/model/s4-types';

const FIX = (name: string) => readFileSync(resolve(__dirname, `../fixtures/clips/${name}.clips.json`), 'utf8');
const NAMES = ['s2_two_clip', 's2_two_clip_pins', 's2_ehz_cpz'];

const A_CLIP = {
  id: 'fxz_1', donor: 's2disasm', zone: 'EHZ',
  src: { x: 0, y: 0, w: 2048, h: 1024 }, dst: { x: 0, y: 4096, w: 2048, h: 1024 },
};

describe('region_id is read absent-capable', () => {
  it('s2_two_clip_pins: ABSENT on every clip, and read as null, not as a derived name', () => {
    const doc = parseClipManifest(FIX('s2_two_clip_pins'));
    // Anti-vacuous: the fixture really has clips, and really lacks the key.
    expect(doc.clips.length).toBe(2);
    const raw = JSON.parse(FIX('s2_two_clip_pins'));
    expect(raw.clips.every((c: Record<string, unknown>) => !('region_id' in c))).toBe(true);
    expect(doc.clips.map((c) => c.regionId)).toEqual([null, null]);
  });

  it('s2_two_clip: PRESENT on every clip, and read verbatim', () => {
    const doc = parseClipManifest(FIX('s2_two_clip'));
    expect(doc.clips.map((c) => c.regionId)).toEqual(['ehz_s2', 'cpz_s2']);
  });
});

describe('nothing is dropped on a rewrite', () => {
  for (const name of NAMES) {
    it(`${name}: parse -> append -> serialise keeps every key the file had`, () => {
      const before = JSON.parse(FIX(name));
      const doc = parseClipManifest(FIX(name));
      const after = JSON.parse(serializeClipManifest(withClip(doc, { ...A_CLIP, id: 'zz_new' })));
      const { clips: clipsAfter, ...restAfter } = after;
      const { clips: clipsBefore, ...restBefore } = before;
      expect(restAfter).toEqual(restBefore);
      expect(clipsAfter.slice(0, clipsBefore.length)).toEqual(clipsBefore);
      expect(clipsAfter.length).toBe(clipsBefore.length + 1);
    });
  }

  it('s2_ehz_cpz: the corridor and the R11 opt-out survive (the keys a lossy writer would drop)', () => {
    const doc = withClip(parseClipManifest(FIX('s2_ehz_cpz')), { ...A_CLIP, id: 'zz_new' });
    const out = JSON.parse(serializeClipManifest(doc));
    expect(out.corridors).toEqual(JSON.parse(FIX('s2_ehz_cpz')).corridors);
    expect(out.corridors.length).toBeGreaterThan(0);
    expect(out.clips[1].unaligned_dst_reason).toMatch(/lowered 256 px/);
    expect(doc.corridors.map((c) => c.id)).toEqual(['ehz_to_cpz']);
  });

  it('the text is ASCII with \\u escapes, as aeon writes it, and ends in exactly one newline', () => {
    const text = serializeClipManifest(parseClipManifest(FIX('s2_ehz_cpz')));
    // Anti-vacuous: the source DOES carry non-ASCII once decoded.
    expect(/[^\x00-\x7f]/.test(JSON.stringify(JSON.parse(FIX('s2_ehz_cpz'))))).toBe(true);
    expect(/[^\x00-\x7f]/.test(text)).toBe(false);
    expect(text.endsWith('}\n')).toBe(true);
    expect(text.endsWith('\n\n')).toBe(false);
  });
});

describe('a paste writes only what Aurora can vouch for', () => {
  it('the appended clip carries exactly id, donor, zone, src_rect, dst_rect: no region_id, no palette', () => {
    const doc = withClip(newClipManifest('fx_act', 1, 3), A_CLIP);
    const entry = (doc.raw.clips as Record<string, unknown>[])[0];
    expect(Object.keys(entry)).toEqual(['id', 'donor', 'zone', 'src_rect', 'dst_rect']);
  });

  it('an R11 reason is written only when there is one', () => {
    const doc = withClip(newClipManifest('fx_act', 1, 3), { ...A_CLIP, unalignedDstReason: 'meets the floor' });
    const entry = (doc.raw.clips as Record<string, unknown>[])[0];
    expect(entry.unaligned_dst_reason).toBe('meets the floor');
  });

  it('withClip does not touch the document it was given (the undo holds the old one)', () => {
    const doc = parseClipManifest(FIX('s2_two_clip'));
    const snapshot = JSON.stringify(doc.raw);
    withClip(doc, { ...A_CLIP, id: 'zz_new' });
    expect(JSON.stringify(doc.raw)).toBe(snapshot);
  });

  it('a new manifest has the schema, the unit and the declared grid aeon requires', () => {
    const raw = newClipManifest('fx_act', 2, 1).raw;
    expect(raw).toEqual({ schema: 1, units: 'world_px', id: 'fx_act', act: { grid_w: 2, grid_h: 1 }, clips: [] });
  });
});

describe('the defaults the page offers', () => {
  it('a suggested clip id is a region id and is not already taken (clips AND corridors)', () => {
    const doc = parseClipManifest(FIX('s2_ehz_cpz'));
    const id = suggestClipId(doc, 'EHZ');
    expect(id).not.toBeNull();
    expect(REGION_ID_RE.test(id!)).toBe(true);
    expect(clipIdProblem(doc, id!)).toBeNull();
    expect(clipIdProblem(doc, 'ehz_to_cpz')).toMatch(/already/);
    expect(clipIdProblem(doc, 'EHZ')).toMatch(/not a region id/);
  });

  it('section placement lands on a section origin; free placement keeps the shift on the 16-px quantum (census)', () => {
    const bad: string[] = [];
    let n = 0;
    for (const sx of [0, 8, 16, 24, 1000, 1008]) {
      for (const sy of [0, 8, 136]) {
        const src = { x: sx, y: sy, w: 64, h: 64 };
        for (let px = 0; px < 5000; px += 37) {
          for (const py of [0, 5, 333, 2050]) {
            n++;
            const s = snapDestination({ x: px, y: py }, src, 'section');
            if (s.x % SECTION_PIXEL_SIZE || s.y % SECTION_PIXEL_SIZE) bad.push(`section ${JSON.stringify(s)}`);
            const f = snapDestination({ x: px, y: py }, src, 'free');
            if ((f.x - src.x) % 16 || (f.y - src.y) % 16 || f.x % 8 || f.y % 8 || f.x < 0 || f.y < 0) {
              bad.push(`free src ${sx},${sy} click ${px},${py} -> ${JSON.stringify(f)}`);
            }
          }
        }
      }
    }
    expect(n).toBeGreaterThan(1000);
    expect(bad.slice(0, 10), `${bad.length} violation(s)`).toEqual([]);
  });

  it('the suggested destination is the first free section origin, and none for a source off the 16-px grid', () => {
    const doc = withClip(newClipManifest('fx_act', 2, 2), { ...A_CLIP, dst: { x: 0, y: 0, w: 2048, h: 1024 } });
    expect(suggestDestination(doc, 2, 2, { x: 0, y: 0, w: 2048, h: 1024 })).toEqual({ x: 2048, y: 0 });
    expect(suggestDestination(doc, 1, 1, { x: 0, y: 0, w: 2048, h: 1024 })).toBeNull();
    expect(suggestDestination(null, 2, 2, { x: 8, y: 0, w: 64, h: 64 })).toBeNull();
  });

  it('a new act\'s grid holds its first clip', () => {
    expect(gridToHold({ x: 0, y: 0, w: 2049, h: 1024 })).toEqual({ gridW: 2, gridH: 1 });
  });
});
