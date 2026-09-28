/**
 * ROADMAP row 235 (a): the drafted destination belongs to ONE act.
 *
 * The store's `suggest` is what the paste form calls on every act, marquee and
 * zone change (DonorPasteSection's effect, and after a paste). These rows hold
 * the policy that decides whether an author's placement survives it:
 *   * on ANOTHER act it is re-placed unless it is free there;
 *   * on the SAME act it is never moved, even onto a clip (DP.7 places a paste
 *     over a clip on purpose, and aeon's R10 answers);
 *   * no free spot: no destination, and `placement` says why.
 * Expectations are derived from the vendored s2_ehz_cpz manifest's rectangles,
 * never typed.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { useDonorDraft } from '../donor-draft';
import { newClipManifest, parseClipManifest, type ClipRect } from '../../../core/formats/donors/clip-manifest-doc';
import { SECTION_PIXEL_SIZE } from '../../../core/model/s4-types';

const S = SECTION_PIXEL_SIZE;
const TEXT = readFileSync(resolve(__dirname, '../../../../test/fixtures/clips/s2_ehz_cpz.clips.json'), 'utf8');
const RAW = JSON.parse(TEXT) as { act: { grid_w: number; grid_h: number }; clips: Array<{ dst_rect: ClipRect }>; corridors?: Array<{ dst_rect: ClipRect }> };
const EHZ_CPZ = parseClipManifest(TEXT);
const RECTS = [...RAW.clips, ...(RAW.corridors ?? [])].map((k) => k.dst_rect);
const hit = (a: ClipRect, b: ClipRect) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
const freeAt = (r: ClipRect) => r.x >= 0 && r.y >= 0 && r.x + r.w <= RAW.act.grid_w * S && r.y + r.h <= RAW.act.grid_h * S
  && !RECTS.some((p) => hit(p, r));
const origins = (w: number, h: number) => {
  const out: Array<{ x: number; y: number }> = [];
  for (let y = 0; y < RAW.act.grid_h * S; y += S) for (let x = 0; x < RAW.act.grid_w * S; x += S) if (freeAt({ x, y, w, h })) out.push({ x, y });
  return out;
};

/** The harness's shape: a marquee under one section, pasted at (0,0) of a one-section act. */
const SRC = { x: 2048, y: 128, w: 1472, h: 576 };
const SMALL = newClipManifest('hx_small', 1, 1);
const draft = () => useDonorDraft.getState();

describe('an author\'s placement meets another act (row 235 (a))', () => {
  beforeEach(() => draft().reset());

  it('placed at (0,0) on a one-section act, then s2_ehz_cpz is chosen: the draft moves to the first free origin, a suggestion again', () => {
    draft().suggest({ clipId: 'ehz_1', actId: SMALL.id, doc: SMALL, src: SRC });
    draft().setDst({ x: 0, y: 0 }, SMALL.id);
    expect(freeAt({ x: 0, y: 0, w: SRC.w, h: SRC.h })).toBe(false); // the defect is real here
    draft().suggest({ clipId: 'ehz_1', actId: EHZ_CPZ.id, doc: EHZ_CPZ, src: SRC });
    const want = origins(SRC.w, SRC.h)[0];
    expect({ dst: draft().dst, touched: draft().dstTouched, actId: draft().actId, placement: draft().placement })
      .toEqual({ dst: want, touched: false, actId: EHZ_CPZ.id, placement: 'suggested' });
    expect(RECTS.filter((p) => hit(p, { ...want, w: SRC.w, h: SRC.h }))).toEqual([]);
  });

  it('a typed id survives the act switch (only the destination belongs to an act)', () => {
    draft().setClipId('ehz_2x');
    draft().setDst({ x: 0, y: 0 }, SMALL.id);
    draft().suggest({ clipId: 'ehz_1', actId: EHZ_CPZ.id, doc: EHZ_CPZ, src: SRC });
    expect(draft().clipId).toBe('ehz_2x');
  });

  it('an author\'s placement that is FREE on the new act stays put, and stays the author\'s', () => {
    const all = origins(SRC.w, SRC.h);
    const last = all[all.length - 1];
    expect(all.length).toBeGreaterThan(1);
    draft().setDst(last, SMALL.id);
    draft().suggest({ clipId: null, actId: EHZ_CPZ.id, doc: EHZ_CPZ, src: SRC });
    expect({ dst: draft().dst, touched: draft().dstTouched, placement: draft().placement })
      .toEqual({ dst: last, touched: true, placement: 'kept' });
  });

  it('on the SAME act an author\'s placement is never moved, even onto a clip (aeon\'s R10 answers it)', () => {
    draft().suggest({ clipId: null, actId: EHZ_CPZ.id, doc: EHZ_CPZ, src: SRC });
    draft().setDst({ x: 0, y: 0 }, EHZ_CPZ.id);
    draft().suggest({ clipId: null, actId: EHZ_CPZ.id, doc: EHZ_CPZ, src: SRC });
    expect({ dst: draft().dst, touched: draft().dstTouched }).toEqual({ dst: { x: 0, y: 0 }, touched: true });
  });

  it('a suggestion (never touched) follows the act, as before', () => {
    draft().suggest({ clipId: null, actId: SMALL.id, doc: SMALL, src: SRC });
    expect(draft().dst).toEqual({ x: 0, y: 0 });
    draft().suggest({ clipId: null, actId: EHZ_CPZ.id, doc: EHZ_CPZ, src: SRC });
    expect(draft().dst).toEqual(origins(SRC.w, SRC.h)[0]);
  });

  it('no free spot on the new act: no destination and placement \'none-free\' (the page says so), never the carried overlap', () => {
    const big = { x: 0, y: 0, w: RAW.act.grid_w * S, h: RAW.act.grid_h * S };
    expect(origins(big.w, big.h)).toEqual([]);
    draft().setDst({ x: 0, y: 0 }, SMALL.id);
    draft().suggest({ clipId: null, actId: EHZ_CPZ.id, doc: EHZ_CPZ, src: big });
    expect({ dst: draft().dst, placement: draft().placement, actId: draft().actId }).toEqual({ dst: null, placement: 'none-free', actId: EHZ_CPZ.id });
  });

  it('placing by hand clears the placement note', () => {
    const big = { x: 0, y: 0, w: RAW.act.grid_w * S, h: RAW.act.grid_h * S };
    draft().suggest({ clipId: null, actId: EHZ_CPZ.id, doc: EHZ_CPZ, src: big });
    expect(draft().placement).toBe('none-free');
    draft().setDst({ x: 0, y: 4096 }, EHZ_CPZ.id);
    expect(draft().placement).toBeNull();
  });
});
