// THE TWO FEATURES HAVE TWO NAMES, AND THE NAMES SHARE NO WORD.
//
// ═══ THE RULING THIS ENFORCES ═══
//
// EFFECTS-W1 defect 2. The word "band" named two unrelated features across six
// controls on one tab, and the cold reader's FIRST click — `Add blank band` —
// built the wrong one and dirtied his project
// (docs/reviews/2026-09-02-effects-cold-walkthrough.md §a4/§a5/§c1). The
// adjudication was that the two get names sharing no word. They are:
//
//     TILE ANIMATION   a cols x rows block of BACKGROUND TILES with 8 phase
//                      banks, DMA'd over the same slots, so a waterfall runs.
//                      Costs tile slots; hard ceiling of four per act.
//                      Wire spelling is still `anims` / `set-bg-override-band`.
//
//     RASTER BAND      a range of SCREEN LINES over which CRAM is repainted.
//                      Costs no tiles. Wire spelling is still `bands`, which is
//                      what aeon's own `band()` and every build error call it —
//                      `band: top 200 must be above bot 100` has to be walkable
//                      back to a control that says "Raster band".
//
// So `band` survives on the raster side ONLY, and the tile-animation side must
// never say it. That asymmetry is deliberate: renaming the raster feature would
// have put Aurora's vocabulary at odds with the engine's error messages, which
// is the failure mode this whole parcel is about.
//
// ═══ WHAT THIS ROW COVERS, SAID EXACTLY ═══
//
// It reads SOURCE, not a render — the node suite has no DOM. It scans the
// enumerated files below, strips comments, extracts every string and template
// literal AND every JSX text child, and refuses one that carries the other
// feature's noun. It therefore covers *authored text in these files* and
// nothing else: a label composed at runtime from two halves, or a string in a
// file not on the list, is outside it. The list is spelled out rather than
// globbed for exactly that reason — a glob that silently stops matching is how
// a gate covers less than it claims.
//
// ═══ THE JSX HALF, AND WHY IT IS HERE (O55, 2026-09-03) ═══
//
// The first version of this row scanned QUOTED LITERALS ONLY. A JSX text child
// is not a literal — `<Chip>Add band</Chip>` is a `JsxText` node — so the
// rename this file exists to enforce was measured STILL BROKEN on screen three
// weeks after it went green:
//
//     <BUTTON>  "Add band"
//     <DIV>     "The band arrives blank and unreferenced; …"
//     <DIV>     "lossless — Demote keeps a band's art, it just stops animating"
//
// measured in the running app by `scratchpad/o55-new-band-door-probe.mjs` row
// 6b, with every section of the Tile anim sub-tab opened first. `Add band` is
// not an incidental miss: it is the exact control EFFECTS-W1 defect 2 was
// booked against — the cold reader's FIRST click, which built a tile animation
// while he read the word as a raster band.
//
// The extraction is the TypeScript parser's, not a regex over `>text<`. A regex
// cannot tell a JSX child from `a > b && c < d` and would have to guess; the
// parser knows, so this row's coverage claim is exact rather than approximate.
//
// ⚠ IT STILL CANNOT SEE THE SCREEN. A label assembled from a variable, or one
// in a file not listed, is outside it either way. The instrument that reads the
// rendered text is `scratchpad/o55-new-band-door-probe.mjs` (rows 6a/6b).
// An earlier version of this docblock pointed at
// `scratchpad/effects-vocabulary-harness.mjs`, which has never existed in this
// repo — the pointer is corrected here rather than left as a second promise.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import ts from 'typescript';
import { AURORA_DIR } from '../../../../../test/support/sibling-root.mjs';

/** The surfaces that author TILE ANIMATIONS. None may say "band". */
const TILE_ANIMATION_SOURCES = [
  'src/renderer/providers/band-verbs.ts',
  'src/renderer/providers/band-follow.ts',
  'src/renderer/providers/band-coverage.ts',
  'src/renderer/providers/band-strip-range.ts',
  'src/renderer/providers/bg-anim-aeon.ts',
  'src/renderer/providers/bg-anim-art.ts',
  'src/renderer/providers/bganim-preview-aeon.ts',
  'src/renderer/components/effects/BgAnimBandPanel.tsx',
  'src/renderer/components/effects/BgAnimPreviewStrip.tsx',
  'src/renderer/components/effects/BandBankStrip.tsx',
  'src/renderer/workspace/tool-meta.ts',
  'src/core/editing/bg-override-band.ts',
];

/** The surfaces that author RASTER BANDS. None may say "tile animation". */
const RASTER_BAND_SOURCES = [
  'src/renderer/components/effects/BandPresetPanel.tsx',
  'src/renderer/components/effects/RasterTimelineStrip.tsx',
  'src/renderer/providers/effects-preset.ts',
];

/**
 * Strings that legitimately carry `band` on the tile-animation side.
 *
 * EVERY ONE IS A WIRE OR DOM NAME, NOT A WORD ON SCREEN, and each is listed
 * with what it is. The predicate below already lets through any literal with no
 * whitespace in it (ids, paths, tool keys), so this list holds only the ones
 * that read like prose and are not.
 */
const ALLOWED_BAND_LITERALS = new Set<string>([
  // The lens target discriminant — a union tag, compared in code, never shown.
  'band',
  'candidate',
]);

/** Comments out, so a docblock explaining the rename cannot fail the rename. */
function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1');
}

/**
 * Every string / template literal in the source, with its `${…}` holes emptied.
 *
 * ⚠ THE HOLES ARE REMOVED, AND THAT IS LOAD-BEARING IN BOTH DIRECTIONS. A
 * template's interpolations are CODE, not words: `${budget.bands}` is a field
 * read and `Tile animations (${budget.bands}/${budget.maxBands})` is a correct
 * label. The first draft of this row scanned the raw text and failed that label
 * for containing "bands" — a gate that refuses the very rename it exists to
 * enforce. Emptying the holes also collapses `aeon-band-card-${index}` to a
 * whitespace-free id, which `isProse` then lets through as the DOM name it is.
 */
function literals(src: string): string[] {
  const out: string[] = [];
  const re = /'((?:[^'\\\n]|\\.)*)'|"((?:[^"\\\n]|\\.)*)"|`((?:[^`\\]|\\.)*)`/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src)) !== null) {
    out.push((m[1] ?? m[2] ?? m[3] ?? '').replace(/\$\{[^}]*\}/g, ''));
  }
  return out;
}

/** A literal that could reach a person: it has whitespace in it. */
function isProse(text: string): boolean {
  return /\s/.test(text.trim()) && text.trim() !== '';
}

/**
 * Every JSX TEXT CHILD in the source — the half a literal scan cannot see.
 *
 * `<Chip>Add band</Chip>` puts its label in a `JsxText` node, not in a string,
 * so a scan over quotes reads a file with that label in it as clean. The
 * parser is used rather than a `>([^<]*)</` regex because that regex cannot
 * distinguish a JSX child from the tail of `n > 0 ? a : b` followed by the next
 * `<`, and a gate that guesses about its own subject cannot state its coverage.
 *
 * ⚠ THE WHITESPACE-ONLY CHILDREN ARE DROPPED, NOT THE MULTI-LINE ONES. JSX
 * folds a wrapped sentence into ONE text child carrying its newlines and
 * indentation, so the run of whitespace is collapsed rather than the child
 * discarded — otherwise a hint written across three lines (which is how every
 * long one in these files is written) would be invisible to this row.
 *
 * `.ts` files have no JSX and yield nothing here; that is not a silent zero,
 * the anti-vacuous row below names which files are expected to yield text.
 */
function jsxText(src: string, rel: string): string[] {
  const sf = ts.createSourceFile(rel, src, ts.ScriptTarget.Latest, false, ts.ScriptKind.TSX);
  const out: string[] = [];
  const walk = (node: ts.Node): void => {
    if (ts.isJsxText(node)) {
      const t = node.text.replace(/\s+/g, ' ').trim();
      if (t !== '') out.push(t);
    }
    node.forEachChild(walk);
  };
  sf.forEachChild(walk);
  return out;
}

/**
 * Everything in this file a person could read: quoted prose plus JSX children.
 * Comments are stripped for the literal half (a docblock explaining the rename
 * must not fail it); the parser drops them from the JSX half by construction.
 */
function readableText(rel: string): string[] {
  const raw = readFileSync(join(AURORA_DIR, rel), 'utf8');
  return [...literals(stripComments(raw)).filter(isProse), ...jsxText(raw, rel)];
}

function offendingLiterals(rel: string, pattern: RegExp, allow: Set<string>): string[] {
  return readableText(rel).filter((t) => pattern.test(t) && !allow.has(t.trim()));
}

describe('the two effects features have two names, and they share no word', () => {
  // ⚠ AGGREGATED, WITH EVERY OFFENDER NAMED. A per-file `it` would report the
  // first file that breaks and say nothing about the other eleven; this repo's
  // rule is a total plus the failing names, never a tail.
  it('no tile-animation surface says "band" in a string a person could read', () => {
    const found: string[] = [];
    for (const rel of TILE_ANIMATION_SOURCES) {
      for (const t of offendingLiterals(rel, /\bbands?\b/i, ALLOWED_BAND_LITERALS)) {
        found.push(`${rel}: ${JSON.stringify(t.slice(0, 110))}`);
      }
    }
    expect(found, `${found.length} tile-animation string(s) still say "band":\n  `
      + found.join('\n  ')).toEqual([]);
  });

  it('no raster-band surface says "tile animation"', () => {
    const found: string[] = [];
    for (const rel of RASTER_BAND_SOURCES) {
      for (const t of offendingLiterals(rel, /tile[ -]animation/i, new Set())) {
        found.push(`${rel}: ${JSON.stringify(t.slice(0, 110))}`);
      }
    }
    expect(found, `${found.length} raster-band string(s) say "tile animation":\n  `
      + found.join('\n  ')).toEqual([]);
  });

  // THE INSTRUMENT IS NOT VACUOUS. Both rows above pass trivially if `literals`
  // returns nothing — a regex that stopped matching, a file that moved. This
  // asserts the scanner actually reads prose out of the two biggest files, so a
  // silent zero cannot read as a clean bill.
  it('ANTI-VACUOUS: the scanner really finds prose in the files it checks', () => {
    const counts = [...TILE_ANIMATION_SOURCES, ...RASTER_BAND_SOURCES].map((rel) => ({
      rel,
      prose: literals(stripComments(readFileSync(join(AURORA_DIR, rel), 'utf8'))).filter(isProse).length,
    }));
    const empty = counts.filter((c) => c.prose === 0).map((c) => c.rel);
    expect(empty, `these files yielded NO prose literals at all, so their rows above measured `
      + `nothing: ${empty.join(', ')}`).toEqual([]);
  });

  // AND THE JSX HALF SEPARATELY, because it is the half that was missing and a
  // parser that silently returned `[]` — a `ScriptKind` typo, a TypeScript
  // upgrade renaming `isJsxText` — would put this row's coverage back exactly
  // where it was while every assertion above stayed green.
  //
  // ⚠ NOT "every .tsx yields text". That was this row's first shape and it was
  // WRONG, not merely strict: `BandBankStrip.tsx` renders a canvas, a row of
  // thumbnails and an `IconButton` whose label is a constant — every child of
  // every element is an element or a `{…}` expression, so it has NO JSX text
  // and correctly yields zero. A row asserting otherwise fails on a file with
  // nothing wrong with it. So the extractor is proved on a FIXTURE it cannot
  // be right about by accident, and the real files are asserted in aggregate.
  it('ANTI-VACUOUS: the JSX extractor really extracts JSX text', () => {
    // A positive control, including the multi-line child that is how every long
    // hint in these files is written — the case a naive extractor drops.
    const fixture = `
      const A = () => (<Chip title="not this">Add band</Chip>);
      const B = () => (<Hint under>
        The band arrives blank
        and unreferenced.
      </Hint>);
      const C = (n: number) => n > 0 ? 1 : 2;   // NOT a JSX child
    `;
    expect(jsxText(fixture, 'fixture.tsx')).toEqual([
      'Add band', 'The band arrives blank and unreferenced.',
    ]);

    const counts = [...TILE_ANIMATION_SOURCES, ...RASTER_BAND_SOURCES].map((rel) => ({
      rel, jsx: jsxText(readFileSync(join(AURORA_DIR, rel), 'utf8'), rel).length,
    }));
    const tsxTotal = counts.filter((c) => c.rel.endsWith('.tsx')).reduce((a, c) => a + c.jsx, 0);
    expect(tsxTotal, `the listed .tsx files yielded NO JSX text at all, so the JSX half of the `
      + `rows above measured nothing: ${JSON.stringify(counts)}`).toBeGreaterThan(0);
    const tsWithSome = counts.filter((c) => c.rel.endsWith('.ts') && c.jsx > 0).map((c) => c.rel);
    expect(tsWithSome, `these non-JSX files yielded JSX text, so the parser is misreading them: `
      + `${tsWithSome.join(', ')}`).toEqual([]);
  });

  // AND THE NAMES THEMSELVES. The ruling is a property, so it is asserted as
  // one rather than left implicit in the two scans.
  it('the two names have no word in common', () => {
    const words = (s: string): Set<string> => new Set(s.toLowerCase().split(/[\s-]+/));
    const a = words('tile animation');
    const b = words('raster band');
    expect([...a].filter((w) => b.has(w))).toEqual([]);
  });
});
