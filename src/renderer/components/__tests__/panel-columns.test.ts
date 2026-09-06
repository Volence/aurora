// EVERY SCROLLING COLUMN IS NAMED, AND THE CENSUS IS EXACTLY THE COLUMNS.
//
// `ui/panel-columns.ts` holds the list a runtime sweep counts against, and it is
// only worth anything if it cannot drift from the call sites. Two halves guard
// that, and this file is the second:
//
//   tsc      `Panel` requires `column: PanelColumnId` whenever `scroll` is set,
//            so a new scrolling column that names nothing, or names an id the
//            census does not carry, fails `npm run typecheck`.
//   here     the other direction, which no type can state: an id in the census
//            that NO call site uses, two call sites sharing one id, and an
//            `owner` pointing at a file the call site is not in.
//
// A source scan, like panel-scrollers.test.ts and panel-headings.test.ts beside
// it: these are .tsx, the suite is node-only, and nothing renders them.
//
// ⚠ WHY THE SCAN IS NOT ALLOWED TO FIND NOTHING. A regex that stops matching
// (someone reformats a call site across two lines) turns every rule below into
// a loop over an empty array, and an empty loop is green. So the scan asserts
// its own population against the census size first, and the census against a
// floor, before any rule runs. That is the failure this whole parcel is about:
// a check that looks at nothing reports exactly like a check that found nothing
// wrong.

import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { PANEL_COLUMNS, PANEL_COLUMN_IDS, PANEL_COLUMN_ATTR } from '../ui/panel-columns';

const RENDERER = join(__dirname, '../..');

/** Every .tsx under src/renderer, tests excluded. */
function tsxFiles(dir: string, out: string[] = []): string[] {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (e.name === '__tests__' || e.name === 'node_modules') continue;
    const p = join(dir, e.name);
    if (e.isDirectory()) tsxFiles(p, out);
    else if (e.name.endsWith('.tsx')) out.push(p);
  }
  return out;
}

interface Site {
  file: string;            // relative to src/renderer, posix separators
  line: number;
  tag: string;
  scroll: boolean;
  column: string | null;
}

/**
 * The opening `<Panel …>` tags. Deliberately NOT a JSX parser: the tag is read
 * up to its first `>`, which is enough because every attribute value in these
 * fifteen sites is a number in braces or a quoted string. If that ever stops
 * being true the population assertion below goes red, which is the intended
 * failure mode.
 */
function panelSites(): Site[] {
  const sites: Site[] = [];
  for (const f of tsxFiles(RENDERER)) {
    const src = readFileSync(f, 'utf8');
    const rel = relative(RENDERER, f).split(sep).join('/');
    const re = /<Panel(\s[^>]*)?>/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(src)) !== null) {
      const attrs = m[1] ?? '';
      sites.push({
        file: rel,
        line: src.slice(0, m.index).split('\n').length,
        tag: m[0],
        scroll: /(^|\s)scroll(\s|=|$)/.test(attrs),
        column: /(^|\s)column="([^"]+)"/.exec(attrs)?.[2] ?? null,
      });
    }
  }
  return sites;
}

const SITES = panelSites();
const SCROLLERS = SITES.filter((s) => s.scroll);

describe('the scan itself found something to check', () => {
  it('reads real call sites, not an empty list', () => {
    // A floor, not a pin: the exact number is asserted against the census
    // below, and pinning it here would just be the same number typed twice.
    expect(SITES.length, 'the <Panel> scan matched nothing; the regex has stopped seeing the call sites')
      .toBeGreaterThan(9);
    expect(PANEL_COLUMN_IDS.length, 'the census is empty').toBeGreaterThan(9);
  });

  it('the regex can tell a scrolling Panel from a plain one', () => {
    // Proving the discriminator works on text it did not come from, so a
    // `scroll` test that always answered true could not hide behind a tree
    // where every Panel happens to scroll (which is the tree we have).
    const probe = (tag: string): boolean => /(^|\s)scroll(\s|=|$)/.test(tag);
    expect(probe(' width={240} scroll column="aeon-art"')).toBe(true);
    expect(probe(' width={240}')).toBe(false);
    expect(probe(' width={240} scrollbarGutter="stable"')).toBe(false);
  });
});

describe('every scrolling Panel names a column', () => {
  it('no scrolling call site is anonymous', () => {
    const anon = SCROLLERS.filter((s) => s.column === null)
      .map((s) => `${s.file}:${s.line} ${s.tag}`);
    expect(anon, 'a scrolling Panel with no column= is a column nothing can measure').toEqual([]);
  });

  it('and a NON scrolling Panel is asked for nothing', () => {
    const named = SITES.filter((s) => !s.scroll && s.column !== null)
      .map((s) => `${s.file}:${s.line}`);
    expect(named, 'a Panel that clips nothing does not belong in the census').toEqual([]);
  });

  it('no two columns share an id', () => {
    const seen = new Map<string, string[]>();
    for (const s of SCROLLERS) {
      if (!s.column) continue;
      seen.set(s.column, [...(seen.get(s.column) ?? []), `${s.file}:${s.line}`]);
    }
    const dupes = [...seen].filter(([, where]) => where.length > 1)
      .map(([id, where]) => `${id}: ${where.join(', ')}`);
    expect(dupes, 'two Panels stamping one id make the sweep report one of them twice and the other never')
      .toEqual([]);
  });
});

describe('the census is exactly the columns that exist', () => {
  const used = new Set(SCROLLERS.map((s) => s.column).filter((c): c is string => c !== null));

  it('carries no id that no call site uses', () => {
    const orphans = PANEL_COLUMN_IDS.filter((id) => !used.has(id));
    expect(orphans, 'a census entry for a column that is gone makes the sweep print a row for nothing')
      .toEqual([]);
  });

  it('and no call site uses an id it does not carry', () => {
    const unknown = [...used].filter((id) => !(id in PANEL_COLUMNS));
    expect(unknown, 'tsc should already refuse this; if it reaches here the union has been widened')
      .toEqual([]);
  });

  it('and the two counts agree', () => {
    expect(used.size).toBe(PANEL_COLUMN_IDS.length);
  });

  it('each entry points at the file its call site is in', () => {
    const wrong: string[] = [];
    for (const s of SCROLLERS) {
      if (!s.column || !(s.column in PANEL_COLUMNS)) continue;
      const owner = PANEL_COLUMNS[s.column as keyof typeof PANEL_COLUMNS].owner;
      if (owner !== s.file) wrong.push(`${s.column}: census says ${owner}, call site is ${s.file}`);
    }
    expect(wrong, 'an entry describing one column while pointing at another is worse than no entry')
      .toEqual([]);
  });
});

describe('a column that claims nothing mounts it has to prove that', () => {
  // The census carries one `unmounted` entry (EffectsScenePanel's exported
  // `EffectsPanels`, which the Effects facet shadows with a local component of
  // the same name). "Nothing imports it" is a claim about the whole tree, so it
  // is checked against the whole tree rather than believed.
  const unmounted = PANEL_COLUMN_IDS
    .map((id) => [id, PANEL_COLUMNS[id].reach] as const)
    .filter((pair): pair is readonly [typeof pair[0], Extract<typeof pair[1], { kind: 'unmounted' }>] =>
      pair[1].kind === 'unmounted');

  const sources = tsxFiles(RENDERER).map((f) => ({
    rel: relative(RENDERER, f).split(sep).join('/'), text: readFileSync(f, 'utf8'),
  }));

  it('has at least one such entry, or this rule is checking air', () => {
    // If the dead export is ever wired up or deleted, this goes red and whoever
    // did it updates the census instead of leaving a row that lies.
    expect(unmounted.length, 'no census entry claims to be unmounted; delete this rule or fix the census')
      .toBeGreaterThan(0);
  });

  for (const [id, reach] of unmounted) {
    it(`${id}: nothing imports ${reach.symbol}`, () => {
      const owner = PANEL_COLUMNS[id].owner;
      const importers = sources
        .filter((s) => s.rel !== owner)
        .filter((s) => new RegExp(`import[^;]*\\b${reach.symbol}\\b[^;]*from`).test(s.text))
        .map((s) => s.rel);
      expect(importers, `${id} says nothing mounts it, but these files import ${reach.symbol}`)
        .toEqual([]);
    });
  }
});

describe('the id reaches the DOM', () => {
  const primitives = readFileSync(join(RENDERER, 'components/ui/primitives.tsx'), 'utf8');

  it('Panel stamps the attribute when it scrolls', () => {
    const panel = primitives.match(/export function Panel\b[\s\S]*?\}>\{children\}/)?.[0];
    expect(panel, 'Panel is no longer the component this rule describes').toBeTruthy();
    const flat = panel!.replace(/\s+/g, ' ');
    expect(flat, 'Panel no longer stamps its column id, so __dbg.panels() finds nothing')
      .toMatch(/scroll \? \{ \[PANEL_COLUMN_ATTR\]: column \}/);
  });

  it('and the attribute name is the one the harness queries', () => {
    // Spelled once, here and in the harness both reading this constant.
    expect(PANEL_COLUMN_ATTR).toBe('data-panel-column');
  });
});
