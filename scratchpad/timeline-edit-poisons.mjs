#!/usr/bin/env node
// RED-FIRST, ONE PLANT AT A TIME, FOR THE RASTER TIMELINE'S EDITING HALF.
//
// ROADMAP §5.1 row 94. Every row in `src/renderer/providers/__tests__/
// effects-preset-timeline.test.ts` and in the editing half of
// `src/renderer/canvas/__tests__/raster-timeline.test.ts` passed the first time
// it was run. That is exactly the state in which a row that measures nothing is
// indistinguishable from a row that measures something, so each plant below
// breaks ONE named rule and this script requires the rows that NAME that rule to
// go red — and, just as hard, requires the OTHER rows to stay green, because a
// plant that reddens everything proves only that the suite runs.
//
// ═══ THE THREE THINGS THIS SCRIPT REFUSES TO GET WRONG ═══
//
// 1. A PLANT THAT NEVER LANDED. Every apply is verified by re-reading the file
//    and by `git diff --stat` naming it. A no-op sed that leaves the tree clean
//    and the suite green reads exactly like a diagnostic gate.
// 2. A RESTORE THAT TAKES OTHER WORK WITH IT. The original bytes are held in
//    memory and written back verbatim — never `git checkout`, which would revert
//    unstaged work in the same file.
// 3. A GREEN POISON READ AS A BAD MATCHER. When a plant comes back green the
//    first suspect is a SECOND CODE PATH, not the assertion; the report says so.
//
// Run: node scratchpad/timeline-edit-poisons.mjs

import { readFileSync, writeFileSync, rmSync } from 'node:fs';
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const PROVIDER = join(ROOT, 'src/renderer/providers/effects-preset.ts');
const CANVAS = join(ROOT, 'src/renderer/canvas/raster-timeline.ts');

const PROVIDER_TEST = 'src/renderer/providers/__tests__/effects-preset-timeline.test.ts';
const CANVAS_TEST = 'src/renderer/canvas/__tests__/raster-timeline.test.ts';

/**
 * Each plant breaks ONE rule and names the rows that must notice.
 *
 * `mustRed` are substrings of test titles that HAVE to fail. `mustStayGreen` is
 * the discriminating half: a row that names a DIFFERENT rule, which this plant
 * must not touch. Where a plant legitimately reddens a neighbour (two rows about
 * one rule), the neighbour is listed in `mustRed` rather than excused.
 */
const PLANTS = [
  {
    id: 'P1',
    what: 'THE ORDER RULE — an edge may be dragged onto the other edge',
    file: PROVIDER,
    find: "return { min: EFFECTS_FIRE_LINE_MIN, max: Math.min(EFFECTS_FIRE_LINE_MAX, band.bot - 1) };",
    with: "return { min: EFFECTS_FIRE_LINE_MIN, max: Math.min(EFFECTS_FIRE_LINE_MAX, band.bot) };",
    tests: [PROVIDER_TEST, CANVAS_TEST],
    mustRed: ['top is held UNDER bot', 'a band whose bot is off the bottom',
      'names the ORDER law', 'SWEPT: every legal line',
      'presetDragFor holds the request at the bound'],
    mustStayGreen: ['ABUTTING BANDS ARE REFUSED', 'the floor is the PROVIDER'],
  },
  {
    // ⚠ WHAT THIS PLANT IS AND IS NOT TESTING. It proves the editor still cuts
    // at L and starts the lower half at L+1 — i.e. that the rows watching the
    // gap rule are alive. It does NOT prove the gap rule itself, which is
    // aeon's and is DATED: abutting bands do not build at aeon `2e976223`, but
    // OVERLAP IS DESIGNED, NOT IMPOSSIBLE (their `check_intervals` comment; a
    // swept runtime-resolution design is banked, owner aeon's lane). The claim
    // is stated once, with date/owner/expiry/re-read list, in the GAP RULE block
    // of `src/renderer/providers/effects-preset.ts`. If it ever retires, this
    // plant does not become wrong — it becomes a plant about a choice rather
    // than about a constraint, and its `what` below should say so then.
    id: 'P2',
    what: 'THE GAP RULE (aeon 2e976223, dated) — a split leaves its halves ABUTTING, '
      + 'which does not build today',
    file: PROVIDER,
    find: "      top: cut + 1, bot: b.bot, sh: b.sh, on: structuredClone(b.on),",
    with: "      top: cut, bot: b.bot, sh: b.sh, on: structuredClone(b.on),",
    tests: [PROVIDER_TEST],
    mustRed: ['THE PRODUCT DOES NOT COLLIDE WITH ITSELF', 'cuts at the requested line',
      'and an S/H split does not collide', 'inserts the lower half IMMEDIATELY AFTER'],
    mustStayGreen: ['REFUSES a band with no line to give', 'IS ONE UNDO STEP'],
  },
  {
    id: 'P3',
    what: "THE DE-MIX FIRE — an S/H band forgets the fire it puts at bot-1",
    file: PROVIDER,
    find: "  if (!sh) return [band.top, band.bot];",
    with: "  if (!sh || true) return [band.top, band.bot];",
    tests: [PROVIDER_TEST],
    mustRed: ['an S/H band fires THREE times', "an S/H band's DE-MIX line collides too"],
    mustStayGreen: ['ABUTTING BANDS ARE REFUSED', 'ONE CLEAR LINE IS ENOUGH'],
  },
  {
    id: 'P4',
    what: 'THE OWNERSHIP RULE — overlap is refused even when the CRAM spans are disjoint',
    file: PROVIDER,
    find: "    const spansMeet = mySpan.start < theirSpan.end && theirSpan.start < mySpan.end;",
    with: "    const spansMeet = true;",
    tests: [PROVIDER_TEST],
    mustRed: ['BUT NESTING OVER DISJOINT CRAM IS LEGAL'],
    mustStayGreen: ['OVERLAPPING BANDS OVER SHARED CRAM are refused',
      'ABUTTING BANDS ARE REFUSED', 'THE PRODUCT DOES NOT COLLIDE WITH ITSELF'],
  },
  {
    id: 'P5',
    what: 'THE READ-ONLY LAYER COLUMN — the edge hit test answers over it too',
    file: CANVAS,
    find: "  if (x < RASTER_TIMELINE_PRESET_X - 2\n    || x > RASTER_TIMELINE_PRESET_X + RASTER_TIMELINE_PRESET_W + 2) return null;",
    with: "  if (x < 0 || x > RASTER_TIMELINE_W) return null;",
    tests: [CANVAS_TEST],
    mustRed: ['THE ROW THAT KEEPS THE LAYER COLUMN READ-ONLY'],
    mustStayGreen: ['grabs an edge within the published tolerance',
      "hits a band's interior for the split gesture"],
  },
  {
    id: 'P6',
    what: 'THE INSTRUMENT — a repaint erases the pointer reading it was caused by',
    file: CANVAS,
    find: "  lastReport = { ...r, pointer: lastReport.pointer, paints: lastReport.paints + 1 };",
    with: "  lastReport = { ...r, pointer: null, paints: lastReport.paints + 1 };",
    tests: [CANVAS_TEST],
    mustRed: ['THE POINTER READING SURVIVES THE REPAINT'],
    mustStayGreen: ['`active: false` is a real answer', 'a mouse move is not a draw'],
  },
  {
    id: 'P7',
    what: 'THE GRAMMAR — a palette band is drawn with ONE edge, like a split',
    file: CANVAS,
    find: "    for (const edge of ['top', 'bot'] as const) {\n      const ey = Math.round(edge === 'top' ? b.y : b.y + b.h) + 0.5;",
    with: "    for (const edge of ['top'] as const) {\n      const ey = Math.round(edge === 'top' ? b.y : b.y + b.h) + 0.5;",
    tests: [CANVAS_TEST],
    mustRed: ['strokes TWO handles for each'],
    mustStayGreen: ['fills one rectangle per band with a positive height',
      'draws nothing in the column when there is no preset'],
  },
  {
    id: 'P8',
    what: 'THE HONESTY LINE — it keeps naming palette bands after they are drawn',
    file: CANVAS,
    find: "  return hasPreset ? ['per-line deform'] : ['palette bands', 'per-line deform'];",
    with: "  return ['palette bands', 'per-line deform'];",
    tests: [CANVAS_TEST],
    mustRed: ['with no preset there is no column'],
    mustStayGreen: ['names PALETTE BANDS as not drawn', 'the drawn absence line FITS the strip'],
  },
  {
    id: 'P9',
    what: 'THE RULER, INVERTED — a fractional pointer is truncated instead of carried',
    file: CANVAS,
    find: "  return (y - RASTER_TIMELINE_ORIGIN_Y) / RASTER_TIMELINE_SCALE;",
    with: "  return Math.floor((y - RASTER_TIMELINE_ORIGIN_Y) / RASTER_TIMELINE_SCALE);",
    tests: [CANVAS_TEST],
    mustRed: ['does NOT round'],
    mustStayGreen: ['stripYToLine INVERTS lineToStripY exactly'],
  },
  {
    id: 'P10',
    what: 'THE INSERT — the lower half is appended rather than placed beside its other half',
    file: PROVIDER,
    find: "    p.bands.splice(index + 1, 0, lower);",
    with: "    p.bands.push(lower);",
    tests: [PROVIDER_TEST],
    mustRed: ['inserts the lower half IMMEDIATELY AFTER'],
    mustStayGreen: ['THE PRODUCT DOES NOT COLLIDE WITH ITSELF', 'IS ONE UNDO STEP',
      'cuts at the requested line'],
  },
  // ═══ O49 — four rules whose green had never been tested by poison ═══
  //
  // Each of these rows passed the first time it ran and no plant had ever
  // reddened it. A row nothing has reddened is indistinguishable from a row
  // that measures nothing; these four plants are the measurement, in the RULE
  // (never the test), of a defect that would ship wrong output.
  {
    // The pal_region arm sized ONE byte per word. "Two bytes per word" is the
    // rule both arms share (the schema: count "is also the derived restore's
    // word count"); a span half as wide lets two bands over the SAME CRAM
    // bytes pass the overlap advisory.
    id: 'P11',
    what: 'bandCramSpan\'s pal_region arm — one byte per word instead of two',
    file: PROVIDER,
    find: '    return { start: r.addr, end: r.addr + 2 * r.count };',
    with: '    return { start: r.addr, end: r.addr + r.count };',
    tests: [PROVIDER_TEST],
    mustRed: ['a pal_region band spans two bytes per `count`'],
    mustStayGreen: ['a cram band spans two bytes per colour',
      'carries the ON op and `sh` to BOTH halves'],
  },
  {
    // The gap between two bands answers with the UPPER neighbour: a
    // double-click on the clear line would split the band above it at a line
    // OUTSIDE that band's interval.
    id: 'P12',
    what: 'presetBandAt\'s gap case — a line between two bands hits the neighbour above',
    file: CANVAS,
    find: '    if (y >= r.y && y <= r.y + r.h) return r.index;',
    with: '    if (y >= r.y) return r.index;',
    tests: [CANVAS_TEST],
    mustRed: ['hits a band\'s interior for the split gesture, and nothing outside it'],
    mustStayGreen: ['THE ROW THAT KEEPS THE LAYER COLUMN READ-ONLY',
      'grabs an edge within the published tolerance'],
  },
  {
    // The seed band two lines tall. `bandSplitMinHeight()` is 3, so the band
    // an author gets from "New" could not be split — a default nobody can use.
    id: 'P13',
    what: 'the panel\'s seed band refuses to split — newBand() is 2 lines tall',
    file: PROVIDER,
    find: '  return { top: 112, bot: 128, sh: false, on: { cram: { addr: 74, colours: [0] } } };',
    with: '  return { top: 112, bot: 114, sh: false, on: { cram: { addr: 74, colours: [0] } } };',
    tests: [PROVIDER_TEST],
    mustRed: ['the panel\'s own seed band is splittable'],
    mustStayGreen: ['REFUSES a band with no line to give', 'ONE CLEAR LINE IS ENOUGH'],
  },
  {
    // A cycle figure copied into an exported sentence — the pin the engine's
    // cost-keyed minimum would silently outdate.
    id: 'P14',
    what: 'BAND_SPLIT_LAW gains a cycle figure (op_work_cyc 64) — a copied engine number',
    file: PROVIDER,
    find: "  + 'line shows the base palette, and a band needs at least three lines to have one to give.';",
    with: "  + 'line shows the base palette (op_work_cyc 64), and a band needs at least three lines to have one to give.';",
    tests: [PROVIDER_TEST],
    mustRed: ['no cycle figure, no scanline budget, no band count reaches an exported sentence'],
    mustStayGreen: ['REFUSES a band with no line to give', 'IS ONE UNDO STEP'],
  },
];

/**
 * The failing test TITLES of one run, or null when the run said nothing usable.
 *
 * ⚠ PARSED ON BOTH EXIT PATHS. vitest exits non-zero when a row fails and zero
 * when none does, and an earlier build of this file returned `[]` on the zero
 * path without looking — which reports "nothing went red" identically to
 * "everything passed". A plant is only ever read against a parse.
 */
// ⚠ A REAL FILE, NOT `/dev/stdout`. vitest's json reporter opens its outputFile
// with fs.writeFile, and `/dev/stdout` is ENXIO the moment this script's stdout
// is a PIPE rather than a tty — which is every CI run and every `| tail`. The
// first build of this file did exactly that and reported "could not parse" for a
// suite that was perfectly green.
const REPORT = join(ROOT, 'scratchpad', '.timeline-edit-poisons.report.json');

function failingTitles(files) {
  spawnSync('npx', ['vitest', 'run', '--reporter=json', `--outputFile=${REPORT}`, ...files],
    { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  let json;
  try { json = JSON.parse(readFileSync(REPORT, 'utf8')); } catch { return null; }
  rmSync(REPORT, { force: true });
  const bad = [];
  for (const f of json.testResults ?? []) {
    for (const a of f.assertionResults ?? []) if (a.status === 'failed') bad.push(a.title);
  }
  return bad;
}

function dirty(file) {
  return execFileSync('git', ['diff', '--stat', '--', file], { cwd: ROOT, encoding: 'utf8' }).trim();
}

let pass = 0;
const problems = [];

console.log('BASELINE — the rows must be GREEN before any plant means anything.');
const baseline = failingTitles([PROVIDER_TEST, CANVAS_TEST]);
if (baseline === null) { console.error('could not parse vitest json'); process.exit(2); }
if (baseline.length !== 0) {
  console.error(`BASELINE IS NOT GREEN (${baseline.length} failing). Nothing below can be read.`);
  console.error(baseline.join('\n'));
  process.exit(2);
}
console.log('  baseline clean.\n');

for (const p of PLANTS) {
  const original = readFileSync(p.file, 'utf8');
  if (!original.includes(p.find)) {
    problems.push(`[${p.id}] THE PLANT SITE IS GONE — "${p.find.slice(0, 60)}..." is not in ${p.file}. `
      + 'This plant measured nothing; fix the site before believing any other row.');
    console.log(`FAIL  [${p.id}] plant site not found — ${p.what}`);
    continue;
  }
  writeFileSync(p.file, original.replace(p.find, p.with));
  const landed = dirty(p.file);
  if (landed === '') {
    writeFileSync(p.file, original);
    problems.push(`[${p.id}] the plant left the tree CLEAN — it did not land.`);
    console.log(`FAIL  [${p.id}] plant did not land — ${p.what}`);
    continue;
  }
  const failed = failingTitles(p.tests);
  writeFileSync(p.file, original);      // BYTE RESTORE, never `git checkout`
  if (failed === null) {
    problems.push(`[${p.id}] the plant run produced no parsable result — probably a COMPILE `
      + 'error rather than a red row, which proves nothing about the assertion.');
    console.log(`FAIL  [${p.id}] unparsable run — ${p.what}`);
    continue;
  }

  const missed = p.mustRed.filter((t) => !failed.some((f) => f.includes(t)));
  const collateral = p.mustStayGreen.filter((t) => failed.some((f) => f.includes(t)));
  const ok = missed.length === 0 && collateral.length === 0;
  if (ok) pass++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  [${p.id}] ${p.what}`);
  console.log(`        plant: ${landed}`);
  console.log(`        ${failed.length} row(s) went red`);
  if (missed.length) {
    console.log(`        ⚠ NOT RED, and it names this rule: ${missed.join(' | ')}`);
    console.log('        ⚠ SUSPECT A SECOND CODE PATH BEFORE THE ASSERTION — a rule spelled twice');
    console.log('          survives one plant and reads as a diagnostic gate.');
    problems.push(`[${p.id}] rows that name the rule stayed green: ${missed.join(' | ')}`);
  }
  if (collateral.length) {
    console.log(`        ⚠ COLLATERAL — rows about a DIFFERENT rule went red: ${collateral.join(' | ')}`);
    problems.push(`[${p.id}] collateral damage: ${collateral.join(' | ')}`);
  }
}

const after = execFileSync('git', ['status', '--porcelain', '--', PROVIDER, CANVAS],
  { cwd: ROOT, encoding: 'utf8' }).trim();
console.log(`\nRESTORE CHECK: ${after === '' ? 'both files back to their committed bytes' : `⚠ STILL DIRTY:\n${after}`}`);

console.log(`\n${pass}/${PLANTS.length} plants diagnostic`);
if (problems.length) { console.log('PROBLEMS:\n  ' + problems.join('\n  ')); process.exit(1); }
