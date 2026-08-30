#!/usr/bin/env node
// POISONS for the per-section raster select (ROADMAP row 93's remaining half).
//
// WHAT THIS MEASURES, and it is not "the tests pass". Every row in
// `section-raster-select.test.ts` is a claim about a control the node suite
// cannot see, so each one is exposed to the failure this repo names most often:
// a check that goes green over the defect it was written for. Each plant below
// breaks exactly ONE thing and declares the rows it MUST redden and the rows it
// MUST NOT — a plant that reddens everything is as uninformative as one that
// reddens nothing, because it cannot tell you which row did the work.
//
// RUN:  node scratchpad/section-raster-select-poisons.mjs
//
// It restores every file from a byte copy IT made and verifies the restore by
// md5 — never `git checkout`, which would revert unrelated working-tree edits
// and make the restore itself unfalsifiable. Shape borrowed from
// `rasterref-partial-extension-poisons.mjs`, including its two failure verdicts:
// NOT PLANTED (the anchor text moved) and UNGUARDED (the plant went green).
//
// This file launches nothing: no Electron, no X display, no emulator. It runs
// `tsc` and `vitest` in-process-tree only, which is why it carries no
// spawnGuarded (check-harness-guards classifies it "spawns something else").

import { readFileSync, writeFileSync, mkdtempSync, copyFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join, basename, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const md5 = (p) => createHash('md5').update(readFileSync(p)).digest('hex');

const PANEL = 'src/renderer/components/effects/BandPresetPanel.tsx';
const PROVIDER = 'src/renderer/providers/effects-preset.ts';
const LIMIT = 'src/core/formats/raster-binding.ts';

/** Scoped: the whole suite is minutes per plant and drowns the signal. */
const SUITE = [
  'src/renderer/components/effects/__tests__/section-raster-select.test.ts',
  'src/renderer/components/effects/__tests__/band-preset-wording.test.ts',
  'src/renderer/agent/__tests__/agent-handler.assign-section-preset.test.ts',
];

/**
 * @type {{name: string, file: string, find: string, replace: string,
 *         why: string, mustRedden: RegExp[], mustStayGreen?: RegExp[]}[]}
 */
const PLANTS = [
  {
    name: 'P1 the select ASSIGNS rasterRef instead of calling the provider',
    file: PANEL,
    find: `onChange={(v) => run(sectionPresetCommand(
                    activeSectionIndex, section.rasterRef, v))}`,
    replace: 'onChange={(v) => { section.rasterRef = v === \'\' ? null : v; }}',
    why: 'THE defect the four recorded instructions exist to prevent: two doors, '
      + 'two notions of an unbind, and no undo step at all',
    mustRedden: [/onChange runs sectionPresetCommand/, /nothing in the panel ASSIGNS rasterRef/],
  },
  {
    name: 'P2 the unbind option is dropped from the option list',
    file: PROVIDER,
    find: "    { value: '', label: RASTER_REF_ROW.unbound },\n",
    replace: '',
    why: 'a section can be bound and never unbound from the UI, while the agent '
      + 'tool can still send null — the two doors disagree about an unbind',
    mustRedden: [/leads with the unbind option/, /an empty or entirely-unreadable library/,
      /offers one option per LOADED preset/],
    mustStayGreen: [/does NOT offer a preset file that could not be read/],
  },
  {
    name: 'P3 unreadable preset files are offered as options',
    file: PROVIDER,
    find: '    ...presetListEntries(library).map((e) => ({ value: e.id, label: e.label })),',
    replace: '    ...presetListEntries(library).map((e) => ({ value: e.id, label: e.label })),\n'
      + "    ...library.unreadable.map((u) => ({ value: u.path.split('/').pop().replace('.json', ''),"
      + " label: u.path })),",
    why: 'the select offers a binding aeon\'s generator refuses BY NAME at build time',
    mustRedden: [/does NOT offer a preset file that could not be read/],
    mustStayGreen: [/leads with the unbind option/],
  },
  {
    name: 'P4 the dangling-ref advisory always returns null',
    file: PROVIDER,
    find: '  if (rasterRef === null) return null;\n  if (library.presets.some((p) => p.id === rasterRef)) return null;',
    replace: '  if (rasterRef === null) return null;\n  return null;',
    why: 'a section bound to a deleted preset is drawn as "Hand-authored raster" — '
      + 'the select quietly contradicts the file, and the author meets it as a build failure',
    mustRedden: [/an id naming no preset is named/, /an id whose FILE exists but will not parse/],
    mustStayGreen: [/null and a live id are both quiet/],
  },
  {
    name: 'P5 the select shows the EDITED preset instead of the section\'s binding',
    file: PANEL,
    find: "value={section.rasterRef ?? ''} style={{ flex: 1, minWidth: 0 }}",
    replace: "value={selected?.id ?? ''} style={{ flex: 1, minWidth: 0 }}",
    why: 'the most plausible wrong wiring on this surface: two ids in scope, and '
      + 'the wrong one draws a binding the section does not have',
    mustRedden: [/renders the SECTION's binding/],
  },
  {
    name: 'P6 the panel keeps its own copy of "the active section"',
    file: PANEL,
    find: '  const activeSectionIndex = useEditorStore((s) => s.activeSectionIndex);',
    replace: '  const [activeSectionIndex] = React.useState(0);',
    why: 'a second source of truth for which section is being looked at — the '
      + 'scene panel would bind one section and this panel another',
    mustRedden: [/the active section comes from the editor store/],
  },
  {
    name: 'P7 the limit is FORKED into a hand-written sentence beside the select',
    file: PANEL,
    find: '              <Hint under style={{ marginBottom: 0 }}>\n'
      + '                Saved to <code>section_{activeSectionIndex}.meta.json</code> as',
    replace: '              <Hint under>Binding a preset changes nothing on screen.</Hint>\n'
      + '              <Hint under style={{ marginBottom: 0 }}>\n'
      + '                Saved to <code>section_{activeSectionIndex}.meta.json</code> as',
    why: 'the one thing this parcel was forbidden to do — a second near-identical '
      + 'wording of a limit that has one owner and four audiences',
    mustRedden: [/no distinctive phrase of the shared limit is retyped/],
    mustStayGreen: [/the panel says where the value is saved/],
  },
  {
    name: 'P8 the row title grows a second limit of its own',
    file: PROVIDER,
    find: "    + 'already names for it.',",
    replace: "    + 'already names for it. Binding one still does not make anything happen.',",
    why: 'the drift starts in the control affordance, where it reads as helpful',
    mustRedden: [/the row label and title come from RASTER_REF_ROW/],
  },
  {
    name: "P9 sectionPresetCommand stops treating '' as an unbind",
    file: PROVIDER,
    find: "  const newRef = value === '' ? null : value;\n  if (newRef === currentRef) return null;\n  return {\n    type: 'set-section-raster',",
    replace: "  const newRef = value;\n  if (newRef === currentRef) return null;\n  return {\n    type: 'set-section-raster',",
    why: 'the sentinel the select depends on. `rasterRef: ""` is what the sidecar '
      + 'parser reads back as null and erases, so this is a silent data loss, not a typo',
    mustRedden: [/leads with the unbind option/],
  },
  {
    name: 'P10 the panel drops the section guard and draws over undefined',
    file: PANEL,
    find: '  const section = act?.sections[activeSectionIndex] ?? null;',
    replace: '  const section = act?.sections[activeSectionIndex] ?? ({ rasterRef: null } as never);',
    why: 'an empty section list renders a control that cannot be bound and says nothing',
    mustRedden: [/the panel guards on the section existing/],
  },
];

function typecheck() {
  try {
    execFileSync('npx', ['tsc', '--noEmit'],
      { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'], encoding: 'utf8' });
    return 0;
  } catch (e) {
    const out = (e.stdout || '') + (e.stderr || '');
    return [...out.matchAll(/error TS\d+/g)].length || 1;
  }
}

function runSuite() {
  let out;
  try {
    out = execFileSync('npx', ['vitest', 'run', ...SUITE],
      { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'], encoding: 'utf8' });
  } catch (e) {
    out = (e.stdout || '') + (e.stderr || '');
  }
  const names = [...out.matchAll(/^\s*×\s+(.+?)(?:\s+\d+ms)?$/gm)].map((m) => m[1].trim());
  const m = out.match(/Tests\s+(\d+) failed/);
  return { failed: m ? Number(m[1]) : names.length, names };
}

// ── the baseline. Without it a plant "reddening" a row that was ALREADY red
// would read as evidence, which is the before/after laundering this repo has
// booked. Every plant is scored against this.
const base = runSuite();
if (base.failed !== 0) {
  console.error(`REFUSING TO MEASURE: ${base.failed} row(s) are red before any plant:`);
  for (const n of base.names) console.error(`   ${n}`);
  process.exit(2);
}
const baseTs = typecheck();
if (baseTs !== 0) {
  console.error(`REFUSING TO MEASURE: ${baseTs} typecheck error(s) before any plant`);
  process.exit(2);
}
console.log(`baseline: 0 red rows, 0 typecheck errors across ${SUITE.length} module(s)\n`);

const tmp = mkdtempSync(join(tmpdir(), 'raster-select-poison-'));
const results = [];

for (const plant of PLANTS) {
  const abs = join(ROOT, plant.file);
  const backup = join(tmp, `${basename(plant.file)}.${results.length}`);
  copyFileSync(abs, backup);
  const before = md5(abs);

  const src = readFileSync(abs, 'utf8');
  if (!src.includes(plant.find)) {
    results.push({ ...plant, verdict: 'NOT PLANTED', detail: 'anchor text not found' });
    continue;
  }
  writeFileSync(abs, src.replace(plant.find, plant.replace));
  if (md5(abs) === before) {
    results.push({ ...plant, verdict: 'NOT PLANTED', detail: 'file unchanged after write' });
    copyFileSync(backup, abs);
    continue;
  }

  const ts = typecheck();
  const r = runSuite();
  const red = r.names;
  const missed = plant.mustRedden.filter((re) => !red.some((n) => re.test(n)));
  const leaked = (plant.mustStayGreen ?? []).filter((re) => red.some((n) => re.test(n)));

  let verdict;
  if (ts > 0 && plant.mustRedden.length && missed.length) {
    // A plant the COMPILER catches is still caught — vitest strips types
    // without checking them, so this is a real gate and is reported as one.
    verdict = 'CAUGHT (typecheck)';
  } else if (missed.length) verdict = 'UNGUARDED — a row that should have gone red did not';
  else if (leaked.length) verdict = 'INDISCRIMINATE — it reddened a row it should not have';
  else verdict = 'DIAGNOSTIC';

  results.push({
    ...plant,
    verdict,
    detail: `${ts} typecheck error(s), ${r.failed} row(s) red`,
    red: red.slice(0, 6),
    missed: missed.map(String),
    leaked: leaked.map(String),
  });

  copyFileSync(backup, abs);
  if (md5(abs) !== before) {
    console.error(`FATAL: restore of ${plant.file} did not match its pre-plant md5`);
    process.exit(2);
  }
}

console.log('=== per-section raster select poisons ===\n');
let bad = 0;
for (const r of results) {
  const ok = r.verdict === 'DIAGNOSTIC' || r.verdict.startsWith('CAUGHT');
  if (!ok) bad++;
  console.log(`${ok ? '  OK ' : ' BAD '} ${r.verdict.padEnd(52)} ${r.name}`);
  console.log(`        why: ${r.why}`);
  if (r.detail) console.log(`        ${r.detail}`);
  if (r.red?.length) console.log(`        red: ${r.red.join(' | ')}`);
  if (r.missed?.length) console.log(`        DID NOT REDDEN: ${r.missed.join(' ')}`);
  if (r.leaked?.length) console.log(`        LEAKED ONTO: ${r.leaked.join(' ')}`);
  console.log('');
}
console.log(`════ ${results.length - bad}/${results.length} plants diagnostic ════`);
process.exit(bad ? 1 : 0);
