/**
 * ROW 229: the donor page's pool grid, RENDERED (react-dom/server, in node) from
 * the real `PoolRowsView` over aeon's real woven clipact.json
 * (test/fixtures/clips/aeon-outputs/s2_woven.clipact.json, see its
 * .provenance.json). This holds the look call as ruled: shafts and the fill each
 * get their own section in the same grid, BELOW the corridors, with the same
 * four columns; rows labelled by the file's own ids; the tile sum stated only
 * when every list in the file is shown; an unknown pool list named, and the sum
 * then "cannot check", never an accusation against aeon.
 *
 * What it does NOT hold: that the grid is on screen in the running app (that is
 * the CDP donor-page harness, scratchpad/donor-page-harness.mjs DP.6e, whose
 * paste flow builds a one-clip act and so never reaches shafts or a fill), nor
 * layout or styling. Every expected id, index and number is READ from the
 * fixture, never typed here.
 */
import { describe, it, expect } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { PoolRowsView } from '../../src/renderer/components/donors/DonorPasteSection';

type Row = { id: string; index: number; tiles: number; tiles_added: number; pages_touched: number; pages_exclusive: number };
type Clipact = { pool: Record<string, unknown> & { per_clip: Row[]; per_corridor: Row[]; per_shaft?: Row[]; per_fill?: Row[]; tiles: number } };
const DIR = resolve(__dirname, '../fixtures/clips/aeon-outputs');
const load = (name: string) => JSON.parse(readFileSync(resolve(DIR, `${name}.clipact.json`), 'utf8')) as Clipact;
const render = (c: Clipact) => renderToStaticMarkup(React.createElement(PoolRowsView, { clipact: c as unknown as Record<string, unknown> }));

/** Row keys and section headings in document order, e.g. `clip:0`, `section:shaft`, `shaft:0`. */
function order(html: string): string[] {
  return [...html.matchAll(/data-donors-pool-(row|section)="([^"]+)"/g)].map((m) => (m[1] === 'section' ? `section:${m[2]}` : m[2]));
}
function cells(html: string): Record<string, string> {
  return Object.fromEntries([...html.matchAll(/data-donors-pool-cell="([^"]+)"[^>]*>([^<]*)</g)].map((m) => [m[1], m[2]]));
}
const FIELDS = ['tiles', 'tiles_added', 'pages_touched', 'pages_exclusive'] as const;

describe('the donor pool grid on a woven act (rendered from aeon\'s real clipact.json)', () => {
  it('shafts and the fill each get their own section, below the corridors, in the file\'s own order', () => {
    const raw = load('s2_woven');
    const want = [
      ...raw.pool.per_clip.map((r) => `clip:${r.index}`),
      ...raw.pool.per_corridor.map((r) => `corridor:${r.index}`),
      'section:shaft', ...raw.pool.per_shaft!.map((r) => `shaft:${r.index}`),
      'section:fill', ...raw.pool.per_fill!.map((r) => `fill:${r.index}`),
    ];
    expect(order(render(raw))).toEqual(want);
  });

  it('shaft and fill rows carry aeon\'s four numbers, cell for cell, under the same columns', () => {
    const raw = load('s2_woven');
    const got = cells(render(raw));
    const want: Record<string, string> = {};
    for (const [kind, list] of [['shaft', raw.pool.per_shaft!], ['fill', raw.pool.per_fill!]] as const) {
      for (const r of list) for (const f of FIELDS) want[`${kind}:${r.index}:${f}`] = String(r[f]);
    }
    expect(Object.fromEntries(Object.keys(want).map((k) => [k, got[k]]))).toEqual(want);
  });

  it('rows are labelled by the file\'s own ids', () => {
    const raw = load('s2_woven');
    const ids = [...render(raw).matchAll(/data-donors-pool-row="(shaft|fill):\d+" data-donors-pool-id="([^"]+)"/g)].map((m) => m[2]);
    expect(ids).toEqual([...raw.pool.per_shaft!, ...raw.pool.per_fill!].map((r) => r.id));
  });

  it('aeon\'s own file: the sum is stated as holding and nothing is flagged as aeon\'s sums disagreeing', () => {
    const html = render(load('s2_woven'));
    expect({ sum: /data-donors-pool-sum="([^"]+)"/.exec(html)?.[1], broken: html.includes('data-donors-pool-broken') })
      .toEqual({ sum: 'holds', broken: false });
  });

  it('a pool list the page does not read is named, and the sum reads "cannot check: unshown rows", with no accusation', () => {
    const raw = load('s2_woven');
    raw.pool.per_zzz = [{ ...raw.pool.per_shaft![0], id: 'zzz', index: 0 }];
    const html = render(raw);
    expect({
      named: html.includes('pool.per_zzz is in this file and not shown.'),
      sum: /data-donors-pool-sum="([^"]+)"/.exec(html)?.[1],
      says: html.includes('cannot check: unshown rows'),
      broken: html.includes('data-donors-pool-broken'),
    }).toEqual({ named: true, sum: 'cannot-check', says: true, broken: false });
  });

  // ROW 235 (c): the grid truncated ids ("ehz_a...", "corrid..."), which can print
  // two ids as one text. Held here as markup: every id cell's text contains its
  // id whole and its style does not cut it (no ellipsis, no hidden overflow, no
  // nowrap). That the laid-out cell really shows it is DP.11i in the harness.
  it('every id cell prints its id whole: the text holds the id and nothing in its style cuts it (s2_ehz_cpz)', () => {
    const raw = load('s2_ehz_cpz');
    const cellsById = [...render(raw).matchAll(/data-donors-pool-id="([^"]+)"[^>]*style="([^"]*)"[^>]*>([^<]*)</g)]
      .map((m) => ({ id: m[1], cut: /text-overflow:\s*ellipsis|overflow:\s*hidden|white-space:\s*nowrap/.test(m[2]), whole: m[3].includes(m[1]),
        // Overseer ruling: the id comes FIRST (the cell's leading text), so a wrap
        // drops the muted kind tag, never the id, below the row's numbers.
        first: m[3].trimStart().startsWith(m[1]) }));
    expect(cellsById).toEqual([...raw.pool.per_clip, ...raw.pool.per_corridor].map((r) => ({ id: r.id, cut: false, whole: true, first: true })));
  });

  it('a file without shafts or a fill (s2_ehz_cpz) renders no shaft or fill section', () => {
    expect(order(render(load('s2_ehz_cpz'))).filter((k) => /^(section|shaft|fill)/.test(k))).toEqual([]);
  });
});
