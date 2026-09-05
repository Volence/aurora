#!/usr/bin/env node
// THE IN-APP GUIDE MUST NOT LIE ABOUT THE APP, AND MUST NOT CARRY A DASH.
//
// `docs/guides/effects-first-run.md` is imported with Vite's `?raw` by
// `src/renderer/components/guide/guides.ts` and rendered VERBATIM into the
// Guide tab. Every backticked span in it is therefore a claim: "you will find
// this string on screen". On 2026-09-05 eight of those claims were false. Three
// were broken hours earlier by the component dash sweep at 83a1d60c, which
// rewrote `Scene - ${id}` to `Scene: ${id}` and did not touch the guide; one
// was a control label deliberately shortened for a 64px column months before;
// and the largest was a whole section teaching that the section strip states
// TWO wiring conditions when it has stated THREE since 600a7c4a, the third
// having been added precisely because the first two were a lie together.
//
// A guide that asserts about itself would have passed every one of those. So
// this gate reads the CONSUMER's text and checks it against the PRODUCER's own
// source: the components, the providers and the preset schema.
//
// ═══ WHY A NEW SCRIPT AND NOT A WIDER GLOB ═══
//
// The two dash gates are `check-tsx-dashes.mjs` (src/**/*.tsx) and
// `check-src-dashes.mjs` (non-test src/**/*.ts plus the generated stylesheet).
// Neither can take this population without its NAME becoming false, which is
// the argument check-src-dashes already makes for its own existence. And the
// population here is not a file extension at all: it is "the markdown the app
// renders as a guide", derived below from the `?raw` imports rather than from a
// glob, so a second guide added to `guides.ts` is covered on the day it is
// added and a `.md` under `docs/` that nothing imports is not. Naming this
// script after the POPULATION rather than after one property is what lets the
// label check, the nesting check and the dash check live in it honestly.
//
// ═══ WHAT IT CHECKS ═══
//
// A. NESTING. `markdown-lite.ts` does not combine marks: `**`X` is here**`
//    emits ONE bold run whose text still contains the backticks, so the Guide
//    tab paints them literally AND no backtick census can see X. 21 spans were
//    in that shape, including most of the page's emphatic label quotations.
//    Single-asterisk emphasis is the same defect (ruled on at 9baf3b18).
//    Derived from the parser's own behaviour, not from a style opinion.
//
// B. DASHES. No U+2014 and no U+2013 in the guide text (owner ruling
//    2026-09-05, all tools, all user facing text). This file is scanned too:
//    see SELF VISIBILITY below.
//
// C. LABELS. Every distinct inline-code span must be classified by exactly one
//    row of `RENDERED` or `NOT_A_LABEL`. A `RENDERED` row names the file whose
//    own strings must be able to produce that label; the check is re-derived
//    from that file on every run. A row that matches no span in the guide is a
//    FAILURE, not a silent pass, for check-src-dashes' reason: a permission
//    with no live subject has outlived its reason.
//
// D. DIAGRAM. The panel schematic is a fenced block, so it contributes no
//    inline spans by construction, and it is exactly where three of the eight
//    stale labels were hiding. `DIAGRAM` rows are verified against source like
//    `RENDERED` rows AND must still appear inside a fenced block.
//
// ═══ HOW A LABEL IS MATCHED, AND WHY THAT IS NOT A GREP ═══
//
// `Scene: ojz_act1_start` exists in no source file: the title is a template,
// `title={`Scene: ${selected.id}`}`. So a source string is read as a PATTERN
// of static chunks separated by holes, and a hole may absorb exactly one
// interpolated value, which is a run with no whitespace. The guide's own
// placeholders (`<id>`, `<n>`, `n`, `…`) become one sentinel character, which
// a hole absorbs. Matching is anchored at both ends, so `SCENE - <id>` cannot
// pass on `Scene: ${id}`.
//
// Case-insensitive, and that is derived, not lax: `ui/primitives.tsx`
// PanelHeader sets `textTransform: 'uppercase'` on every section title, so the
// guide's `RASTER BAND PRESETS` and the source's `Raster band presets` are the
// same pixels. `prefix: true` on a row says the guide quotes the stable leading
// words of a header whose tail is a live count (`LAYERS` for
// `Layers (n/16 per scene)`); it still anchors at the start, so a rename is
// still red.
//
// A source pattern that has holes and NO word character in any static chunk
// vouches for nothing: `${a}/${b}` would otherwise "render" every path in the
// document. That exclusion is structural (a template with no word in it is
// punctuation glue), not a count that happens to be zero today.
//
// The corpus is string literals, template literals, JSX element children, and
// the property NAMES in `src/**/*.schema.json`. The last because
// `BandPresetPanel` renders `<Field label={f}>` over `presetDefFields(...)`, so
// the schema is the producer of `line`, `first`, `count`, `period` and `dir`.
//
// ═══ SELF VISIBILITY ═══
//
// `check-tsx-dashes.mjs` printed an em dash in its own success line and, being
// .tsx scoped, could not see it. This file scans ITSELF, raw and comments
// included, for both characters. It can do that because it never spells either
// one: the character class is built with String.fromCharCode. That is a
// DIFFERENT policy from check-src-dashes, which exempts comments as the design
// record; the difference is deliberate and narrow, and the reason is that a
// gate's own prose is tool text, which the ruling covers, and a dash gate that
// cannot read its own output is the exact defect above.
//
// LOUD ON UNMEASURABLE. Zero guides, an unreadable parser, an empty corpus and
// a missing cited file are each an error with a message. None of them is green.
//
// Run: node scripts/check-guide-text.mjs   (also in the `npm test` chain)

import { readFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const SELF = path.join(HERE, 'check-guide-text.mjs');
const require = createRequire(path.join(ROOT, 'package.json'));
const ts = require('typescript');

const EM = String.fromCharCode(0x2014);
const EN = String.fromCharCode(0x2013);
const DASH = new RegExp('[' + EM + EN + ']', 'g');

const HOLE = String.fromCharCode(0);        // an interpolation, in a source pattern
const FILL = String.fromCharCode(1);        // a placeholder, in a guide label
const PLACEHOLDER = /<[^>]*>|\bn\b|…/g;

const GUIDES_TS = 'src/renderer/components/guide/guides.ts';
const PARSER_TS = 'src/renderer/components/guide/markdown-lite.ts';

// ────────────────────────────────────────────────────────────────────────────
// THE CLASSIFICATION. Every inline-code span in every guide is in exactly one
// of these, or the run is red. `file` is where the label was read from and is
// re-read on every run.
// ────────────────────────────────────────────────────────────────────────────

const EFFECTS = 'src/renderer/components/effects';

const RENDERED = [
  { text: '?', file: `${EFFECTS}/SectionPicker.tsx` },
  { text: '✓', file: `${EFFECTS}/SectionPicker.tsx` },
  { text: '✗', file: `${EFFECTS}/SectionPicker.tsx` },
  { text: 'own preset', file: `${EFFECTS}/SectionPicker.tsx` },
  { text: 'threaded', file: `${EFFECTS}/SectionPicker.tsx` },
  { text: 'its channels', file: `${EFFECTS}/SectionPicker.tsx` },
  { text: 'Editing', file: `${EFFECTS}/SectionPicker.tsx` },
  { text: 'scene <id> · raster <id>', file: `${EFFECTS}/SectionPicker.tsx` },
  { text: 'could not read <file>', file: 'src/core/formats/effects/section-wiring.ts' },

  { text: '? Guide', file: `${EFFECTS}/EffectsToolOptions.tsx` },
  { text: 'Parallax preview', file: `${EFFECTS}/EffectsToolOptions.tsx` },
  { text: 'Compose the background in the frame (parallax)', file: 'src/renderer/shell/ViewMenu.tsx' },

  { text: 'Parallax', file: 'src/renderer/providers/effects-sub-tabs.ts' },
  { text: 'Colour', file: 'src/renderer/providers/effects-sub-tabs.ts' },
  { text: 'Tile anim', file: 'src/renderer/providers/effects-sub-tabs.ts' },

  { text: 'SCENES', file: `${EFFECTS}/EffectsScenePanel.tsx` },
  { text: 'Scene id', file: `${EFFECTS}/EffectsScenePanel.tsx` },
  { text: 'LAYERS', file: `${EFFECTS}/EffectsScenePanel.tsx`, prefix: true },
  { text: 'Add', file: `${EFFECTS}/EffectsScenePanel.tsx` },
  { text: 'SCENE: <id>', file: `${EFFECTS}/EffectsScenePanel.tsx` },
  { text: 'V factor', file: `${EFFECTS}/EffectsScenePanel.tsx` },
  { text: 'V offset', file: `${EFFECTS}/EffectsScenePanel.tsx` },
  { text: 'Deform', file: `${EFFECTS}/EffectsScenePanel.tsx` },
  { text: 'SECTION ASSIGNMENT', file: `${EFFECTS}/EffectsScenePanel.tsx` },

  { text: 'Plane A (fg)', file: 'src/renderer/providers/effects-aeon.ts' },
  { text: 'Plane B (bg)', file: 'src/renderer/providers/effects-aeon.ts' },
  { text: 'B split at', file: 'src/renderer/providers/effects-aeon.ts' },
  { text: 'Drift', file: 'src/renderer/providers/effects-aeon.ts' },
  { text: 'px/frame', file: 'src/renderer/providers/effects-aeon.ts' },
  { text: 'none', file: 'src/renderer/providers/effects-aeon.ts' },
  { text: 'Bob', file: 'src/renderer/providers/effects-aeon.ts' },
  { text: 'Screen line', file: 'src/renderer/providers/effects-aeon.ts' },

  { text: 'FACTOR_1', file: 'src/core/formats/effects/scene.ts' },
  { text: 'FACTOR_1_2', file: 'src/core/formats/effects/scene.ts' },
  { text: 'FACTOR_1_8', file: 'src/core/formats/effects/scene.ts' },
  { text: 'FACTOR_1_16', file: 'src/core/formats/effects/scene.ts' },
  { text: 'FACTOR_LOCKED', file: 'src/core/formats/effects/scene.ts' },

  { text: 'RASTER TIMELINE', file: `${EFFECTS}/RasterTimelineStrip.tsx` },
  { text: 'bands', file: 'src/renderer/canvas/raster-timeline.ts' },
  { text: 'L0 y=0', file: 'src/renderer/canvas/effects-guides.ts' },
  { text: 'L1 y=32', file: 'src/renderer/canvas/effects-guides.ts' },

  { text: 'RASTER BAND PRESETS', file: `${EFFECTS}/BandPresetPanel.tsx` },
  { text: 'Preset id', file: `${EFFECTS}/BandPresetPanel.tsx` },
  { text: 'New', file: `${EFFECTS}/BandPresetPanel.tsx` },
  { text: 'Section <n>', file: `${EFFECTS}/BandPresetPanel.tsx` },
  { text: 'PRESET: <id>', file: `${EFFECTS}/BandPresetPanel.tsx` },
  { text: 'PRESET: <your id>', file: `${EFFECTS}/BandPresetPanel.tsx` },
  { text: 'PRESET: <id> · CYCLES, VARIANTS', file: `${EFFECTS}/BandPresetPanel.tsx` },
  { text: 'Raster band 0', file: `${EFFECTS}/BandPresetPanel.tsx` },
  { text: 'Top', file: `${EFFECTS}/BandPresetPanel.tsx` },
  { text: 'Bot', file: `${EFFECTS}/BandPresetPanel.tsx` },
  { text: 'S/H', file: `${EFFECTS}/BandPresetPanel.tsx` },
  { text: 'ON', file: `${EFFECTS}/BandPresetPanel.tsx` },
  { text: 'off (two-fire band)', file: `${EFFECTS}/BandPresetPanel.tsx` },
  { text: 'addr', file: `${EFFECTS}/BandPresetPanel.tsx` },
  { text: 'colours', file: `${EFFECTS}/BandPresetPanel.tsx` },
  { text: 'cycles', file: `${EFFECTS}/BandPresetPanel.tsx` },
  { text: 'variants', file: `${EFFECTS}/BandPresetPanel.tsx` },
  { text: 'lines', file: `${EFFECTS}/BandPresetPanel.tsx` },
  { text: 'Channel 0', file: `${EFFECTS}/BandPresetPanel.tsx` },
  { text: 'L0', file: `${EFFECTS}/BandPresetPanel.tsx` },
  { text: 'L1', file: `${EFFECTS}/BandPresetPanel.tsx` },
  { text: 'L2', file: `${EFFECTS}/BandPresetPanel.tsx` },
  { text: 'L3', file: `${EFFECTS}/BandPresetPanel.tsx` },

  // §5's moving anchors. The section title and the six control labels are this
  // panel's own JSX; the option labels and the two ladders are the provider's,
  // and the strip's chip and its stopped state are the preview component's.
  { text: 'PRESET: <id> · MOVING ANCHORS', file: `${EFFECTS}/BandPresetPanel.tsx` },
  { text: 'World Y', file: `${EFFECTS}/BandPresetPanel.tsx` },
  { text: 'px, level space', file: `${EFFECTS}/BandPresetPanel.tsx` },
  { text: 'Movement', file: `${EFFECTS}/BandPresetPanel.tsx` },
  { text: 'Travel', file: `${EFFECTS}/BandPresetPanel.tsx` },
  { text: 'Cycle', file: `${EFFECTS}/BandPresetPanel.tsx` },
  { text: 'Start at', file: `${EFFECTS}/BandPresetPanel.tsx` },
  { text: 'absent · set', file: `${EFFECTS}/BandPresetPanel.tsx` },

  { text: 'keep hand-authored anchor', file: 'src/renderer/providers/effects-preset.ts' },
  { text: 'channel unused (null)', file: 'src/renderer/providers/effects-preset.ts' },
  { text: 'follow a world Y', file: 'src/renderer/providers/effects-preset.ts' },
  { text: 'keep hand-authored motion', file: 'src/renderer/providers/effects-preset.ts' },
  { text: 'no motion (null)', file: 'src/renderer/providers/effects-preset.ts' },
  { text: 'sweep up and down', file: 'src/renderer/providers/effects-preset.ts' },
  // The two ladders are GENERATED labels, so these rows check the template that
  // makes them and not a literal anyone typed. `2 * (256 >> amp_shift)` is the
  // travel in the brackets; the ± number beside it is half of that, and the
  // guide says which is which.
  { text: '±1 px (2 px of travel)', file: 'src/renderer/providers/effects-preset.ts' },
  { text: '±16 px (32 px of travel)', file: 'src/renderer/providers/effects-preset.ts' },
  { text: '±64 px (128 px of travel)', file: 'src/renderer/providers/effects-preset.ts' },
  { text: '8.53 s (512 ticks)', file: 'src/renderer/providers/effects-preset.ts' },

  { text: 'Pause', file: `${EFFECTS}/AnchorSweepPreview.tsx` },
  { text: 'preview paused', file: `${EFFECTS}/AnchorSweepPreview.tsx` },

  { text: 'cram (raw colours)', file: 'src/renderer/providers/effects-preset.ts' },
  { text: 'off (null)', file: 'src/renderer/providers/effects-preset.ts' },
  { text: 'authored script (array of channels)', file: 'src/renderer/providers/effects-preset.ts' },
  { text: "keep the section's hand-authored cycle (key absent)", file: 'src/renderer/providers/effects-preset.ts' },
  { text: 'keep hand-authored value (array ends before this slot)', file: 'src/renderer/providers/effects-preset.ts' },
  { text: 'Hand-authored raster', file: 'src/renderer/providers/effects-preset.ts' },

  { text: 'NEW TILE ANIMATION', file: `${EFFECTS}/BgAnimBandPanel.tsx` },
  { text: 'TILE ANIMATIONS (n/4)', file: `${EFFECTS}/BgAnimBandPanel.tsx` },
  { text: 'Add blank tile animation', file: 'src/renderer/providers/band-verbs.ts' },

  { text: 'PROPERTIES', file: 'src/renderer/workspace/facets/effects-facet.tsx' },
  { text: 'SECTIONS', file: 'src/renderer/components/SectionList.tsx' },

  // The cycle-channel form's field labels are the SCHEMA's property names,
  // rendered by `<Field label={f}>` over `presetDefFields('cycle_channel')`.
  { text: 'line', file: 'src/core/formats/effects/aurora-effects-preset.schema.json' },
  { text: 'first', file: 'src/core/formats/effects/aurora-effects-preset.schema.json' },
  { text: 'count', file: 'src/core/formats/effects/aurora-effects-preset.schema.json' },
  { text: 'period', file: 'src/core/formats/effects/aurora-effects-preset.schema.json' },
  { text: 'dir', file: 'src/core/formats/effects/aurora-effects-preset.schema.json' },
];

/**
 * Rows the panel schematic claims. A fenced block contributes no inline spans,
 * so these are checked for PRESENCE IN A FENCE as well as against their source.
 *
 * ⚠ A row here is not a statement that the label appears NOWHERE ELSE. Since
 * §5 was written, `PRESET: <id> · MOVING ANCHORS` is also quoted in prose and so
 * also carries a `RENDERED` row: the two rows assert different things about the
 * same string (the schematic still names it; the prose's copy of it is still
 * what the panel titles that section) and neither makes the other redundant.
 */
const DIAGRAM = [
  { text: 'PRESET: <id> · MOVING ANCHORS', file: `${EFFECTS}/BandPresetPanel.tsx` },
  { text: 'LAYERS (n/16 per scene)', file: `${EFFECTS}/EffectsScenePanel.tsx` },
];

/**
 * Spans that are NOT a string the reader will find on screen. Each says what
 * it is, because "not a label" is a judgement and the next reader has to be
 * able to check it rather than trust it.
 */
const NOT_A_LABEL = [
  { text: './build.sh', kind: 'aeon path' },
  { text: 'FAST=1 ./build.sh', kind: 'aeon shell invocation' },
  { text: 'tools/regenerate-level.sh', kind: 'aeon path' },
  { text: 'tools/level_staleness.py', kind: 'aeon path' },
  { text: 'games/<game>/prebuild.sh', kind: 'aeon path' },
  { text: 'docs/reviews/2026-09-02-effects-cold-walkthrough.md', kind: 'repository path' },
  { text: 'git status', kind: 'shell command' },
  { text: 'rm', kind: 'shell command' },
  { text: 'touch', kind: 'shell command' },
  { text: 'Ctrl+K', kind: 'key chord' },
  { text: 'Ctrl+Z', kind: 'key chord' },
  { text: 'preset()', kind: 'aeon identifier' },
  { text: 'Sec.sec_effects', kind: 'aeon identifier' },
  { text: 'ojz_act1_sec_raster(sec: N)', kind: 'aeon build message, quoted' },
  { text: 'ojz act1', kind: 'project data: an act' },
  { text: 'ojz_water_tint', kind: 'project data: an id the reader invents' },
  { text: 'OJZ_Preset_Plain', kind: 'project data: an aeon preset record' },
  { text: 'Authored probe (red / blue)', kind: 'project data: a shipped preset document' },
  { text: '0x', kind: 'a hex prefix, in prose' },
  { text: '0000 BBB0 GGG0 RRR0', kind: 'a bit layout, in prose' },
  { text: 'red + green×16 + blue×256', kind: 'a formula, in prose' },
  { text: 'Top 200 / Bot 100', kind: 'two field VALUES, in prose' },
  { text: '"rate": 32', kind: 'a JSON fragment from a scene file' },
  { text: 'rasterRef', kind: 'a key in the section sidecar, named in prose' },
];

/** A pure number is a value the author types, never a label. Structural. */
const isNumeric = (s) => /^[0-9]+(\.[0-9]+)?$/.test(s);

// ────────────────────────────────────────────────────────────────────────────

const tracked = (glob) => execFileSync('git', ['-C', ROOT, 'ls-files', '--', glob], { encoding: 'utf8' })
  .split('\n').filter(Boolean);

const fail = (msg) => { console.error(`check-guide-text: ${msg}`); process.exitCode = 1; };

// ── The population, derived from the app's own imports ──────────────────────
function guidePaths() {
  const src = readFileSync(path.join(ROOT, GUIDES_TS), 'utf8');
  const out = [];
  for (const m of src.matchAll(/from\s+'([^']+\.md)\?raw'/g)) {
    out.push(path.normalize(path.join(path.dirname(GUIDES_TS), m[1])));
  }
  return out;
}

// ── The app's own parser, so "what is a fence" is not re-decided here ───────
async function loadParser() {
  const src = readFileSync(path.join(ROOT, PARSER_TS), 'utf8');
  const js = ts.transpileModule(src, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  return import('data:text/javascript;base64,' + Buffer.from(js).toString('base64'));
}

function inlineSpans(parse, md) {
  const out = [];
  const take = (runs) => { for (const r of runs) if (r.code) out.push(r.text); };
  for (const b of parse(md)) {
    if (b.kind === 'heading' || b.kind === 'para' || b.kind === 'quote') take(b.runs);
    else if (b.kind === 'list') for (const it of b.items) take(it);
    else if (b.kind === 'table') {
      for (const c of b.head) take(c);
      for (const row of b.rows) for (const c of row) take(c);
    }
  }
  return out;
}

function fencedText(parse, md) {
  return parse(md).filter((b) => b.kind === 'code').map((b) => b.text).join('\n');
}

/** Bold runs that still carry a backtick, and plain runs carrying a `*`. */
function nestingFindings(parse, md) {
  const bad = [];
  const scan = (runs) => {
    for (const r of runs) {
      if (r.strong && r.text.includes('`')) bad.push(['code inside bold', r.text]);
      else if (!r.code && !r.strong && r.text.includes('*')) bad.push(['literal asterisk', r.text.slice(0, 90)]);
    }
  };
  for (const b of parse(md)) {
    if (b.kind === 'heading' || b.kind === 'para' || b.kind === 'quote') scan(b.runs);
    else if (b.kind === 'list') for (const it of b.items) scan(it);
    else if (b.kind === 'table') {
      for (const c of b.head) scan(c);
      for (const row of b.rows) for (const c of row) scan(c);
    }
  }
  return bad;
}

// ── The producer's strings ──────────────────────────────────────────────────

/** React's own JSX text rule: whitespace runs with a newline vanish at the
 *  edges and collapse to one space inside. */
function jsxText(raw) {
  const t = raw.replace(/^[ \t]*\n\s*/, '').replace(/\s*\n[ \t]*$/, '');
  return /^\s*$/.test(t) ? '' : t.replace(/\s*\n\s*/g, ' ');
}

function sourcePatterns(rel) {
  const abs = path.join(ROOT, rel);
  if (!existsSync(abs)) return null;                     // loud, at the call site
  const text = readFileSync(abs, 'utf8');
  const out = [];

  if (rel.endsWith('.json')) {
    // A schema's property NAMES are labels: BandPresetPanel renders
    // `<Field label={f}>` over the names `presetDefFields` returns.
    const walk = (node) => {
      if (node === null || typeof node !== 'object') return;
      if (Array.isArray(node)) { for (const v of node) walk(v); return; }
      if (node.properties && typeof node.properties === 'object' && !Array.isArray(node.properties)) {
        for (const k of Object.keys(node.properties)) out.push(k);
      }
      for (const v of Object.values(node)) walk(v);
    };
    walk(JSON.parse(text));
    return out;
  }

  const sf = ts.createSourceFile(rel, text, ts.ScriptTarget.Latest, true,
    rel.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const visit = (node) => {
    if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
      out.push(node.text);
    } else if (ts.isTemplateExpression(node)) {
      out.push([node.head.text, ...node.templateSpans.map((sp) => sp.literal.text)].join(HOLE));
    } else if (ts.isJsxElement(node) || ts.isJsxFragment(node)) {
      let s = '';
      for (const c of node.children) {
        if (ts.isJsxText(c)) s += jsxText(c.text);
        else if (ts.isJsxExpression(c) && c.expression
                 && (ts.isStringLiteral(c.expression) || ts.isNoSubstitutionTemplateLiteral(c.expression))) {
          s += c.expression.text;
        } else s += HOLE;
      }
      out.push(s.replace(new RegExp(HOLE + '+', 'g'), HOLE));
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return out.filter((s) => s !== '' && s !== HOLE);
}

const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const norm = (s) => s.replace(/[ \t]+/g, ' ').toLowerCase();
const skeletonOf = (label) => norm(label.replace(PLACEHOLDER, FILL));

/** Can this source pattern produce this label? See the docblock. */
function patternRenders(pattern, skeleton, prefix) {
  const chunks = pattern.split(HOLE).map(norm);
  // A pattern with holes and no word character anywhere is punctuation glue.
  if (chunks.length > 1 && !chunks.some((c) => /[a-z0-9]/.test(c))) return false;
  // `prefix` runs the test the other way round: the guide quotes the stable
  // LEADING words of a header whose tail is a live count, so the source's own
  // first chunk must start with them. Still anchored at the start, so a rename
  // is still red.
  if (prefix) return chunks[0].startsWith(skeleton);
  return new RegExp('^' + chunks.map(esc).join('\\S*') + '$').test(skeleton);
}

// ── Run ─────────────────────────────────────────────────────────────────────

const parserMod = await loadParser();
if (typeof parserMod.parseGuide !== 'function') {
  fail(`could not load parseGuide from ${PARSER_TS}. Nothing was checked.`);
  process.exit(1);
}
const parse = parserMod.parseGuide;

const guides = guidePaths();
if (guides.length === 0) {
  fail(`no '?raw' markdown import found in ${GUIDES_TS}. The population is empty, `
    + 'which is "could not measure", not "nothing to check".');
  process.exit(1);
}

const spanCount = new Map();       // span text -> occurrences, across all guides
let fenced = '';
let guideText = '';
for (const rel of guides) {
  const abs = path.join(ROOT, rel);
  if (!existsSync(abs)) { fail(`${GUIDES_TS} imports ${rel}, which does not exist.`); process.exit(1); }
  const md = readFileSync(abs, 'utf8');
  guideText += md;
  fenced += '\n' + fencedText(parse, md);

  for (const s of inlineSpans(parse, md)) spanCount.set(s, (spanCount.get(s) ?? 0) + 1);

  // A. nesting
  const nest = nestingFindings(parse, md);
  if (nest.length > 0) {
    fail(`${nest.length} run(s) in ${rel} that markdown-lite paints as literal punctuation.`);
    console.error('  markdown-lite does not combine marks: a code span inside **bold** keeps its');
    console.error('  backticks on screen, and a *single asterisk* keeps its asterisks. Move the');
    console.error('  code span out of the bold, or use ** for the emphasis.');
    for (const [why, t] of nest) console.error(`    (${why}) ${JSON.stringify(t)}`);
  }

  // B. dashes, in the guide
  DASH.lastIndex = 0;
  const hits = [...md.matchAll(DASH)];
  if (hits.length > 0) {
    fail(`${hits.length} em/en dash(es) in ${rel}, which the app renders verbatim.`);
    for (const h of hits) {
      const line = md.slice(0, h.index).split('\n').length;
      console.error(`    ${rel}:${line}  ${md.slice(0, h.index).split('\n').pop().trim().slice(0, 100)}`);
    }
  }
}

// B. dashes, in this file. See SELF VISIBILITY.
DASH.lastIndex = 0;
const selfText = readFileSync(SELF, 'utf8');
const selfHits = [...selfText.matchAll(DASH)];
if (selfHits.length > 0) {
  fail(`${selfHits.length} em/en dash(es) in this gate's own source. A dash gate that `
    + 'cannot read its own output is the defect it exists to prevent.');
}

// C + D. labels
const patternCache = new Map();
const patternsFor = (file) => {
  if (!patternCache.has(file)) patternCache.set(file, sourcePatterns(file));
  return patternCache.get(file);
};

function verifyRow(row, where) {
  const pats = patternsFor(row.file);
  if (pats === null) {
    fail(`${where} row ${JSON.stringify(row.text)} cites ${row.file}, which does not exist. `
      + 'That is "could not measure", not a pass.');
    return;
  }
  if (pats.length === 0) {
    fail(`${where} row ${JSON.stringify(row.text)} cites ${row.file}, from which no string `
      + 'could be extracted at all.');
    return;
  }
  const sk = skeletonOf(row.text);
  if (!pats.some((p) => patternRenders(p, sk, row.prefix))) {
    fail(`${where} says the app renders ${JSON.stringify(row.text)}, and ${row.file} `
      + 'no longer contains a string that can produce it.');
    console.error('    Read the component and correct the guide to what it renders now.');
    console.error('    Do not delete the row: a label the guide quotes and the app does not');
    console.error('    render is the defect, not the row.');
  }
}

const classified = new Set();
for (const row of RENDERED) {
  if (classified.has(row.text)) fail(`${JSON.stringify(row.text)} is classified twice.`);
  classified.add(row.text);
  if (!spanCount.has(row.text)) {
    fail(`RENDERED row ${JSON.stringify(row.text)} matches no inline-code span in any guide. `
      + 'An entry with no live subject has outlived its reason: delete it.');
    continue;
  }
  verifyRow(row, 'RENDERED');
}
for (const row of NOT_A_LABEL) {
  if (classified.has(row.text)) fail(`${JSON.stringify(row.text)} is classified twice.`);
  classified.add(row.text);
  if (!spanCount.has(row.text)) {
    fail(`NOT_A_LABEL row ${JSON.stringify(row.text)} matches no inline-code span in any guide. Delete it.`);
  }
}
for (const row of DIAGRAM) {
  if (!fenced.includes(row.text)) {
    fail(`DIAGRAM row ${JSON.stringify(row.text)} appears in no fenced block. Delete it, or `
      + 'put the schematic back.');
    continue;
  }
  verifyRow(row, 'DIAGRAM');
}

const unclassified = [...spanCount.keys()].filter((s) => !classified.has(s) && !isNumeric(s));
if (unclassified.length > 0) {
  fail(`${unclassified.length} inline-code span(s) in the guide are classified by nothing.`);
  console.error('  Every backticked span is a claim about what the reader will see. Add each to');
  console.error('  RENDERED (with the file whose strings produce it) or to NOT_A_LABEL (with what');
  console.error('  it is instead: a path, a shell command, a key chord, an aeon identifier, a');
  console.error('  value). Guessing is what this gate exists to stop.');
  for (const s of unclassified.sort()) console.error(`    ${JSON.stringify(s)}`);
}

if (process.exitCode === 1) process.exit(1);

const numeric = [...spanCount.keys()].filter(isNumeric).length;
const total = [...spanCount.values()].reduce((a, b) => a + b, 0);
console.log(`check-guide-text: OK: ${guides.length} guide(s) the app imports with ?raw, `
  + `${total} inline-code span(s), ${spanCount.size} distinct. ${RENDERED.length} asserted `
  + `against the source that renders them, ${DIAGRAM.length} more in the panel schematic, `
  + `${NOT_A_LABEL.length} classified as not a UI label, ${numeric} numeric values by rule. `
  + 'No U+2014 or U+2013 in the guide text or in this file, no code span nested in bold, '
  + 'no single-asterisk emphasis. Out of scope and saying so: prose that is not backticked, '
  + 'fenced-block text outside the DIAGRAM rows, and every markdown file the app does not import.');
