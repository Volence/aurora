#!/usr/bin/env node
// PARTIAL-EXTENSION POISONS for `rasterRef` (empyrean docs/AURORA_EFFECTS_SCHEMA.md
// §3.1 at da91abce; §6 hazard 1 — "a partial extension erases").
//
// WHAT THIS MEASURES, and it is not "the tests pass". Each plant removes
// `rasterRef` from exactly ONE of the sites the audit named, leaving every other
// site correct — the precise shape of the failure that cost this repo the
// sceneRef incident, where two overseers counted eight sites and the answer was
// thirteen. A site whose plant comes back GREEN is UNGUARDED and is reported as
// such rather than quietly dropped.
//
// RUN:  node scratchpad/rasterref-partial-extension-poisons.mjs
// It restores every file from a byte copy IT made, and verifies the restore by
// md5 — never `git checkout`, which would also revert an unrelated edit in the
// working tree and make the restore itself unfalsifiable.
//
// Each plant declares the ROWS IT MUST REDDEN. A plant that reddens nothing
// fails as UNGUARDED; a plant that fails to apply fails as NOT PLANTED (checked
// by asserting the file actually changed, not by trusting the replace call).

import { readFileSync, writeFileSync, mkdtempSync, copyFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join, basename, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const md5 = (p) => createHash('md5').update(readFileSync(p)).digest('hex');

// The test modules that carry every rasterRef row. Scoped deliberately: the
// whole suite would take minutes per plant and would drown the signal.
const SUITE = [
  'test/formats/section-meta.test.ts',
  'test/formats/aeon-json-trailing-newline.test.ts',
  'test/editing/section-ops.test.ts',
  'src/core/project/aeon/__tests__/aeon-save.test.ts',
  'src/core/project/aeon/__tests__/aeon-load.test.ts',
  'src/renderer/components/effects/__tests__/band-preset-wording.test.ts',
];

/**
 * @type {{site: string, file: string, find: string, replace: string, why: string}[]}
 * One entry per site the audit named as carrying the ref SET. Sites that are
 * pure prose in a doc are not plantable here and are listed in the report
 * instead — a comment cannot be measured by a test runner, and pretending
 * otherwise is the "partial coverage beats none at hiding" failure.
 */
const PLANTS = [
  {
    site: 'section-meta.ts — SectionMeta interface',
    file: 'src/core/formats/section-meta.ts',
    find: '  rasterRef: string | null;\n  sceneRef: string | null;\n}',
    replace: '  sceneRef: string | null;\n}',
    why: 'the declaration the compiler agrees with; dropping it should not even typecheck',
  },
  {
    site: 'section-meta.ts — all-null write-suppression check (the WIDENED write condition)',
    file: 'src/core/formats/section-meta.ts',
    find: '    && meta.rasterRef === null && meta.sceneRef === null\n',
    replace: '    && meta.sceneRef === null\n',
    why: 'a rasterRef-only section falls through to "all default, write nothing" — the file never appears',
  },
  {
    site: 'section-meta.ts — serialize emit literal',
    file: 'src/core/formats/section-meta.ts',
    find: '    rasterRef: meta.rasterRef,\n    sceneRef: meta.sceneRef,\n  });',
    replace: '    sceneRef: meta.sceneRef,\n  });',
    why: 'the key is dropped from the bytes on every save',
  },
  {
    site: 'section-meta.ts — parse enumeration',
    file: 'src/core/formats/section-meta.ts',
    find: "    rasterRef: typeof raw?.rasterRef === 'string' ? raw.rasterRef : null,\n",
    replace: '    rasterRef: null,\n',
    why: 'aeon writes the key, Aurora reads null, the next save erases it — the exact incident',
  },
  {
    site: 's4-types.ts — createSection',
    file: 'src/core/model/s4-types.ts',
    find: '    sceneRef: null,\n    rasterRef: null,\n',
    replace: '    sceneRef: null,\n',
    why: 'the model constructor stops declaring the key, so the clone key-set guard has nothing to compare',
  },
  {
    site: 'section-ops.ts — cloneSection',
    file: 'src/core/editing/section-ops.ts',
    find: '    rasterRef: sec.rasterRef,\n',
    replace: '',
    why: 'copy/paste of a section silently drops the binding — UNGUARDED for sceneRef until 61d4b80',
  },
  {
    site: 'section-ops.ts — cloneSection, hardcoded null (key present, value wrong)',
    file: 'src/core/editing/section-ops.ts',
    find: '    rasterRef: sec.rasterRef,\n',
    replace: '    rasterRef: null,\n',
    why: 'the SUBTLER half: the key-set guard cannot see this, only a value assertion can',
  },
  {
    site: 'load.ts — assignment from the parsed sidecar onto the Section',
    file: 'src/core/project/aeon/load.ts',
    find: '            section.rasterRef = meta.rasterRef;\n',
    replace: '',
    why: 'the codec is correct and the value still never reaches the model',
  },
  {
    site: 'save.ts — serializeSectionMeta call literal',
    file: 'src/core/project/aeon/save.ts',
    find: '        rasterRef: section.rasterRef,\n',
    replace: '',
    why: 'the SECOND independent enumeration in the save path, distinct from the cleared body',
  },
  {
    site: 'save.ts — cleared-overwrite literal',
    file: 'src/core/project/aeon/save.ts',
    find: '{ bgLayoutRef: null, paletteRef: null, rasterRef: null, sceneRef: null }, null, 2)));',
    replace: '{ bgLayoutRef: null, paletteRef: null, sceneRef: null }, null, 2)));',
    why: 'a cleared rasterRef resurrects on the next load',
  },
  {
    site: 'effects-preset.ts — PRESET_LIMITS.unbound names the ruled key',
    file: 'src/renderer/providers/effects-preset.ts',
    find: "'rasterRef, and this editor only preserves it: no control here writes one, and ' +",
    replace: "'effectsRef, and it is not implemented in either repo: nothing binds it, and ' +",
    why: 'the author-facing sentence regresses to the key the CR ruled against',
  },
];

/** `npx tsc --noEmit` — vitest strips types without checking them, so a plant
 *  the COMPILER catches would otherwise read as "no test noticed". */
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
    // Even on exit 0, read the summary rather than trusting the code.
  } catch (e) {
    out = (e.stdout || '') + (e.stderr || '');
  }
  const names = [...out.matchAll(/^\s*×\s+(.+?)(?:\s+\d+ms)?$/gm)].map((m) => m[1].trim());
  const m = out.match(/Tests\s+(\d+) failed/);
  return { failed: m ? Number(m[1]) : names.length, names, raw: out };
}

const tmp = mkdtempSync(join(tmpdir(), 'rasterref-poison-'));
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
  const after = md5(abs);
  if (after === before) {
    results.push({ ...plant, verdict: 'NOT PLANTED', detail: 'file unchanged after write' });
    copyFileSync(backup, abs);
    continue;
  }

  const ts = typecheck();
  const r = runSuite();
  const caught = ts > 0 || r.failed > 0;
  const bits = [];
  if (ts > 0) bits.push(`${ts} typecheck error(s)`);
  bits.push(`${r.failed} test row(s) red`);
  results.push({
    ...plant,
    verdict: caught ? 'CAUGHT' : 'UNGUARDED (GREEN)',
    detail: bits.join(', '),
    names: (r.names || []).slice(0, 4),
  });

  copyFileSync(backup, abs);
  if (md5(abs) !== before) {
    console.error(`FATAL: restore of ${plant.file} did not match its pre-plant md5`);
    process.exit(2);
  }
}

console.log('\n=== rasterRef partial-extension poisons ===');
let unguarded = 0, notPlanted = 0;
for (const r of results) {
  if (r.verdict.startsWith('UNGUARDED')) unguarded++;
  if (r.verdict === 'NOT PLANTED') notPlanted++;
  console.log(`\n[${r.verdict}] ${r.site}`);
  console.log(`   ${r.detail}`);
  console.log(`   why it matters: ${r.why}`);
  for (const n of r.names || []) console.log(`     red: ${n}`);
}
console.log(`\nTOTAL ${results.length} plants — ${results.length - unguarded - notPlanted} caught, `
  + `${unguarded} UNGUARDED, ${notPlanted} NOT PLANTED`);
process.exit(unguarded > 0 || notPlanted > 0 ? 1 : 0);
