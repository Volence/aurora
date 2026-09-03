// A PANEL COLUMN MUST NOT MOVE UNDER A GESTURE THAT IS STILL HAPPENING.
//
// ---------------------------------------------------------------------------
// THE DEFECT THIS EXISTS FOR
// ---------------------------------------------------------------------------
// Double-clicking a background tile in the Layout column's Art strip never
// opened its composer, and armed the band stamp instead. Nothing threw and
// nothing looked broken.
//
// The first press/release of a double click is an ordinary click:
// `ArtBrowser.handleClick` picks the slot and arms `paint-tile`, and
// `layout-facet.tsx` rendered the "Brush" section for exactly that tool
// IMMEDIATELY ABOVE the Art section. The strip was pushed down 144.56px — its
// own height, measured — so the SECOND click of the same gesture landed on the
// band-card row that had slid into its place, armed `stamp-band`, and that
// un-mounted Brush and put the strip back. A before/after reading of the box
// says nothing moved; only a sample taken BETWEEN the halves shows it.
// `dblclick` never reached the strip's container at all.
//
// The fix is an ORDER: every tool-conditional section now sits BELOW the Art
// section, so arming a tool from the strip cannot move the strip. This file is
// what keeps that order, and it is the half of the proof a node suite can hold.
//
// ---------------------------------------------------------------------------
// WHY THIS FILE AND A CDP HARNESS ARE BOTH REQUIRED
// ---------------------------------------------------------------------------
// ~6,500 vitest tests passed the whole time the gesture was broken: the node
// suite cannot see React, a canvas, a layout or a mouse, so nothing here can
// observe a panel moving. `scratchpad/bganim-tile-door-harness.mjs` row [4e]
// does — it drives the real double click under CDP, arms `stamp-band` first so
// the tool-options section provably MOUNTS mid-gesture, and asserts the strip's
// box is unchanged between the halves anyway.
//
// What that harness cannot do is run in CI: it needs a built app, an Electron,
// an xvfb and an aeon checkout. So the two hold different halves. The harness
// holds the BEHAVIOUR; this file holds the STRUCTURE the behaviour depends on,
// and a source reorder is exactly the change that would put the defect back
// while every runtime instrument was elsewhere.
//
// ---------------------------------------------------------------------------
// WHAT IT ASSERTS, AND THE BLIND SPOT IT DOES NOT HIDE
// ---------------------------------------------------------------------------
// Three rows, and the third is the enumeration rather than the rule:
//
//   [1] the layout column's sections, in order, with the guards read off source
//       — the anti-vacuous row, so a scan that stops finding sections fails
//       instead of passing on an empty list;
//   [2] THE RULE: in that column, `aeon.art` precedes every tool-conditional
//       section;
//   [3] THE ENUMERATION: `layout-facet.tsx` is the ONLY facet column with a
//       tool-conditional section, and the files that arm a tool are exactly the
//       known set. Those two facts are what make [2] a complete answer instead
//       of a spot fix — the reachability claim in the review is a claim about
//       every column, not about the one that was broken. A new tool-conditional
//       section anywhere, or a new `.setTool(` call site, fails HERE, by name,
//       with the question attached.
//
// ⚠ IT READS FACET COLUMNS ONLY — the `<Panel>` blocks under `workspace/facets`.
// Sections declared deeper (the effects panel's own, SpriteMode's, Explorer's)
// are outside it. That is a real hole and it is stated rather than implied; what
// closes it in practice is row [3]'s second half, since a section list that
// cannot change without a `.setTool(` somewhere is a section list this defect
// cannot reach.

import { describe, it, expect } from 'vitest';
import { readdirSync, statSync } from 'node:fs';
import { join, sep } from 'node:path';
import { code, RENDERER } from '../../components/__tests__/helpers/section-panels';

const FACETS = join(RENDERER, 'workspace', 'facets');

/** Every source file under `src/renderer`, tests excluded. */
function rendererSources(dir: string = RENDERER): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    if (entry === '__tests__' || entry === 'node_modules') continue;
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) out.push(...rendererSources(path));
    else if (entry.endsWith('.ts') || entry.endsWith('.tsx')) out.push(path);
  }
  return out;
}

/** One section in one column: its id, and the source that decides whether it
 *  renders at all (everything between the previous sibling and this tag). */
interface ColumnSection { id: string; guard: string }
/** One `<Panel>…</Panel>` block, with its sections in the order they render. */
interface Column { owner: string; sections: ColumnSection[] }

/**
 * The facet panel columns, read out of source.
 *
 * A column is a `<Panel …>` block; a section's GUARD is the text between the
 * previous section's closing tag (or the panel's opening tag) and this one's
 * opening tag — which is where a `{cond && (` lives. Read from `code()`, whose
 * comments are blanked, so this docblock's own words cannot be counted as one.
 */
function facetColumns(): Column[] {
  const out: Column[] = [];
  for (const entry of readdirSync(FACETS)) {
    if (!entry.endsWith('.tsx')) continue;
    const file = join(FACETS, entry);
    const src = code(file);
    let from = 0;
    for (;;) {
      const open = src.indexOf('<Panel', from);
      if (open === -1) break;
      const bodyStart = src.indexOf('>', open);
      const close = src.indexOf('</Panel>', bodyStart);
      if (bodyStart === -1 || close === -1) break;
      from = close + 1;
      const body = src.slice(bodyStart + 1, close);
      const sections: ColumnSection[] = [];
      let cursor = 0;
      for (;;) {
        const at = body.indexOf('<CollapsibleSection', cursor);
        if (at === -1) break;
        const tagEnd = body.indexOf('>', at);
        const id = /\bid="([^"]*)"/.exec(body.slice(at, tagEnd === -1 ? undefined : tagEnd))?.[1] ?? '(no id)';
        sections.push({ id, guard: body.slice(cursor, at) });
        const end = body.indexOf('</CollapsibleSection>', at);
        cursor = end === -1 ? (tagEnd === -1 ? at + 1 : tagEnd + 1) : end + '</CollapsibleSection>'.length;
      }
      if (sections.length > 0) out.push({ owner: entry, sections });
    }
  }
  return out;
}

/**
 * Does this section's guard depend on the armed tool?
 *
 * Directly (`tool === 'paint-tile' && (`), or through a local the guard names
 * that is itself derived from it — `art-facet.tsx` writes
 * `const showCollisionPanel = tool === 'collision' && …` and then guards on the
 * name. A rule that only read the literal form would call that section
 * unconditional and be wrong about the one other facet that has one.
 */
function toolConditional(section: ColumnSection, fileSource: string): boolean {
  if (/\btool\b/.test(section.guard)) return true;
  for (const m of section.guard.matchAll(/\b([a-z][A-Za-z0-9_]*)\b/g)) {
    const decl = new RegExp(`\\bconst ${m[1]}\\b[^;]*;`).exec(fileSource);
    if (decl && /\btool\b/.test(decl[0])) return true;
  }
  return false;
}

const COLUMNS = facetColumns();
const LAYOUT = COLUMNS.find((c) => c.owner === 'layout-facet.tsx');

/**
 * EVERY CALL SITE THAT ARMS A MAP TOOL, and why each one is not this defect.
 *
 * Hand-declared on purpose, and safe in the way a hand-maintained list of
 * PANELS was not: a site missing from this list is a FAILING row that names the
 * file, not a silent pass. `.setTool(` is the call form — the store's own
 * `setTool: (tool) => …` definition is a property and does not match, which is
 * what keeps every consumer of editorStore out of the list.
 */
const TOOL_ARMING_SITES: Record<string, string> = {
  'components/ArtBrowser.tsx':
    'THE ONE INSIDE A PANEL SECTION. A strip click arms paint-tile; a band card '
    + 'arms stamp-band. This is the site the ordering rule below exists for.',
  'components/MapViewport.tsx':
    'Keyboard hotkeys only (setToolScoped). No pointer path arms a tool, and the '
    + 'map is not inside the panel column.',
  'components/classic/ClassicLevelViewport.tsx':
    'The classic map canvas, not a panel section.',
  'components/canvas/CanvasMode.tsx':
    'The canvas editor\'s OWN tool store (useCanvasStore), a different surface '
    + 'with no CollapsibleSection above its gesture.',
  'providers/object-list-classic.ts':
    'The classic object palette arms place-object. Classic\'s columns have no '
    + 'conditional section at all — row [3] asserts that.',
  'state/classicLevelStore.ts':
    'selectChunkForStamp arms stamp-chunk when the classic chunk picker selects. '
    + 'Same reason as above: nothing conditional sits above it.',
  'workspace/facet-tools.ts':
    'Re-arms a legal tool on a FACET SWITCH, which is not a pointer gesture '
    + 'inside a column.',
};

describe('a panel column does not move under a live gesture', () => {
  it('[1] ANTI-VACUOUS: the scan reads the layout column and its guards off source', () => {
    expect(COLUMNS.length, 'no facet <Panel> column was read at all').toBeGreaterThanOrEqual(5);
    expect(LAYOUT, 'layout-facet.tsx declares no <Panel> column').toBeDefined();
    const ids = LAYOUT!.sections.map((s) => s.id);
    // Named, not counted: a scan that silently found four of six would pass a
    // count and hide exactly the section this rule is about.
    expect(ids).toContain('aeon.sections');
    expect(ids).toContain('aeon.art');
    expect(ids).toContain('aeon.layoutOptions');
    expect(ids).toContain('aeon.props');
    // And the guards really were read: this column HAS tool-conditional
    // sections, so a `toolConditional` that answered false for everything (a
    // comment-stripping change, a JSX reformat) would make row [2] vacuous.
    const src = code(join(FACETS, 'layout-facet.tsx'));
    const conditional = LAYOUT!.sections.filter((s) => toolConditional(s, src));
    expect(conditional.map((s) => s.id),
      'no section in the layout column reads as tool-conditional — row [2] would pass on nothing')
      .toContain('aeon.layoutOptions');
  });

  it('[2] THE RULE: in the layout column, the Art section precedes every tool-conditional section', () => {
    const src = code(join(FACETS, 'layout-facet.tsx'));
    const art = LAYOUT!.sections.findIndex((s) => s.id === 'aeon.art');
    expect(art, 'aeon.art is not in the layout column').toBeGreaterThanOrEqual(0);
    const above = LAYOUT!.sections
      .slice(0, art)
      .filter((s) => toolConditional(s, src))
      .map((s) => `${s.id} — guard: ${s.guard.trim().replace(/\s+/g, ' ').slice(-90)}`);
    expect(above,
      'A tool-conditional section renders ABOVE the Art strip. The strip hosts a double click '
      + '(open a background slot) and a drag (aim a band range), and its own first click arms '
      + 'paint-tile — so this section mounts BETWEEN the two halves of the gesture and the strip '
      + 'moves out from under the second one. Put it below aeon.art. See layout-facet.tsx and '
      + 'docs/reviews/2026-09-03-art-strip-doubleclick.md.')
      .toEqual([]);
  });

  it('[3] THE ENUMERATION: only the layout column is tool-conditional, and the tool-arming sites are the known set', () => {
    const offenders: string[] = [];
    for (const col of COLUMNS) {
      if (col.owner === 'layout-facet.tsx') continue;
      const src = code(join(FACETS, col.owner));
      for (const s of col.sections) {
        if (toolConditional(s, src)) offenders.push(`${col.owner}:${s.id}`);
      }
    }
    // art-facet's `art.collision` IS tool-conditional and IS above two
    // double-click hosts — it is listed here rather than exempted silently.
    // It is not the defect because no panel in that column arms a tool: the
    // tileset's click sets `brushTile`, the chunk grid's sets `selectedChunkId`,
    // and neither touches `tool`. Row [3]'s second half is what holds that.
    expect(offenders.sort(), 'a facet column outside Layout grew a tool-conditional section. '
      + 'Check whether any panel in THAT column arms a tool from a pointer handler; if it does, '
      + 'the section must go below every gesture-hosting section, and this list must say so.')
      .toEqual(['art-facet.tsx:art.collision']);

    const arming = rendererSources()
      .filter((f) => code(f).includes('.setTool('))
      .map((f) => f.slice(RENDERER.length + 1).split(sep).join('/'))
      .sort();
    expect(arming, 'the set of files that ARM a tool changed. Each one has to be checked against '
      + 'the ordering rule: if it is reachable from a panel section that sits below a conditional '
      + 'section, this defect is back. Add it to TOOL_ARMING_SITES with the reason it is safe.')
      .toEqual(Object.keys(TOOL_ARMING_SITES).sort());
  });
});
