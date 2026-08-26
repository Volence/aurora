#!/usr/bin/env node
// RED-FIRST FOR THE BAND-LENS CLASSIFIER — ROADMAP item 43 part 2.
//
// A coverage classifier that transposes, is one cell out, or mistakes the
// consumer's blank escape for `tiles[0]` paints a PLAUSIBLE set of cells and
// looks right on screen. So each defect below is planted into the real module,
// the suite is run, and the row it is supposed to turn red is NAMED. A plant
// that comes back green means the matcher is wrong, not the guard.
//
// Run: node scratchpad/band-coverage-plants.mjs
// It restores the file on every exit path, including a crash.

import { readFileSync, writeFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const SRC = `${ROOT}/src/renderer/providers/band-coverage.ts`;
const TEST = 'src/renderer/providers/__tests__/band-coverage.test.ts';

const PLANTS = [
  {
    id: 'transpose',
    what: 'cell -> (col,row) transposed, the shape the marquee measurement is ABOUT',
    from: 'cells.push({ cell, col: cell % planeCols, row: Math.floor(cell / planeCols), slot });',
    to:   'cells.push({ cell, col: Math.floor(cell / planeCols), row: cell % planeCols, slot });',
    expect: /right \(col, row\)/,
  },
  {
    id: 'col-shift',
    what: 'the column is one to the right — the classic silently-plausible lens defect',
    from: 'cells.push({ cell, col: cell % planeCols, row: Math.floor(cell / planeCols), slot });',
    to:   'cells.push({ cell, col: (cell % planeCols) + 1, row: Math.floor(cell / planeCols), slot });',
    expect: /off-by-one in the cell walk/,
  },
  {
    id: 'walk-start',
    what: 'the cell walk starts one cell late, so cell 0 can never be covered',
    from: 'for (let cell = 0; cell < layout.length; cell++) {',
    to:   'for (let cell = 1; cell < layout.length; cell++) {',
    // NOT the off-by-one row above: its fixture cells are at 11 and 12, so a
    // walk that skips cell 0 leaves it green. The rows that DO discriminate are
    // the footprint counts. Named here rather than pretending otherwise.
    expect: /finds EVERY cell that names a slot/,
  },
  {
    id: 'escape',
    what: 'the blank escape dropped — word 0 read as tiles[0]',
    from: '  if (word === 0) return null;\n  return word & LAYOUT_TILE_INDEX_MASK;',
    to:   '  return word & LAYOUT_TILE_INDEX_MASK;',
    expect: /EXACTLY zero is blank/,
  },
  {
    id: 'mask-literal',
    what: 'the contract mask replaced by a hardcoded 0xFF',
    from: '  return word & LAYOUT_TILE_INDEX_MASK;',
    to:   '  return word & 0xFF;',
    expect: /masks with the contract value/,
  },
  {
    id: 'half-open',
    what: 'rangeCovers made inclusive at the top',
    from: 'return range.count > 0 && slot >= range.base && slot < range.base + range.count;',
    to:   'return range.count > 0 && slot >= range.base && slot <= range.base + range.count;',
    expect: /includes the base and excludes/,
  },
  {
    id: 'band-boundary',
    what: "bandOwningSlot's lower bound made exclusive — each band loses its FIRST slot",
    from: 'if (slot >= bases[i] && slot < bases[i] + tileCounts[i]) return i;',
    to:   'if (slot > bases[i] && slot < bases[i] + tileCounts[i]) return i;',
    expect: /finds the band that owns each animated slot/,
  },
  // ⚠ THE PLANT THAT WAS REMOVED, AND WHY. Swapping this walk to run over
  // `bases` (length n+1) instead of `tileCounts` turned NO row red, so it was
  // not a discriminating plant — and re-checking said the swap is genuinely
  // harmless rather than that the guard is weak: the extra iteration reads
  // `tileCounts[n]` as `undefined` and `slot < NaN` is false for every slot. The
  // module's docblock was corrected to say that instead of claiming a hazard
  // this run refuted. Suspect the matcher before the guard — and sometimes the
  // answer is that the hazard was never there.
  {
    id: 'no-clamp',
    what: 'the seed clamp dropped, so a candidate may be seeded below the floor',
    from: "return { kind: 'candidate', staticBase: Math.max(slot, firstPromotableSlot), slot };",
    to:   "return { kind: 'candidate', staticBase: slot, slot };",
    expect: /clamped to firstPromotableSlot/,
  },
  {
    id: 'whole-rows',
    what: 'the partial-row refusal dropped, so (col,row) becomes a guess',
    from: `  if (layout.length % planeCols !== 0) {
    throw new Error(
      \`bandCoverage: a layout of \${layout.length} words is not a whole number of rows at \`
      + \`\${planeCols} words/row, so no cell has a well-defined (col, row)\`,
    );
  }`,
    to: '',
    expect: /not a whole number of rows/,
  },
  {
    id: 'alarm',
    what: 'coverageSummary grows a warning above a threshold — the RULING violated',
    from: "  const parts = [`paints ${n} cell${n === 1 ? '' : 's'}`];",
    to:   "  const parts = [`paints ${n} cell${n === 1 ? '' : 's'}${n > 500 ? ' — careful!' : ''}`];",
    expect: /IS NEUTRAL/,
  },
];

const original = readFileSync(SRC, 'utf8');
let bad = 0;

function runSuite() {
  try {
    const out = execSync(`npx vitest run ${TEST} --reporter=verbose 2>&1`, { cwd: ROOT, encoding: 'utf8' });
    return out;
  } catch (e) {
    return `${e.stdout ?? ''}${e.stderr ?? ''}`;
  }
}

try {
  const base = runSuite();
  const baseLine = /Tests\s+(\d+) passed \((\d+)\)/.exec(base);
  console.log(`BASELINE  ${baseLine ? baseLine[0] : 'COULD NOT READ THE TOTAL'}`);
  if (!baseLine) { console.log(base.slice(-1500)); process.exit(3); }

  for (const p of PLANTS) {
    if (!original.includes(p.from)) {
      console.log(`SKIPPED   [${p.id}] anchor no longer in the source — THE PLANT IS STALE, NOT THE CODE`);
      bad++;
      continue;
    }
    writeFileSync(SRC, original.replace(p.from, p.to));
    const out = runSuite();
    // The failing test NAMES, as vitest prints them after a red run.
    const failed = [...out.matchAll(/^\s*(?:×|✕)\s+(.*)$/gm)].map((m) => m[1].trim());
    const hit = failed.filter((n) => p.expect.test(n));
    const ok = hit.length > 0;
    console.log(`${ok ? 'RED   ' : 'GREEN!'}   [${p.id}] ${p.what}`);
    console.log(`          rows red: ${failed.length ? failed.map((f) => `"${f}"`).join(', ') : 'NONE'}`);
    if (!ok) {
      bad++;
      console.log('          ⚠ THE PLANT DID NOT TURN ITS ROW RED. Suspect the MATCHER before the guard.');
    }
    writeFileSync(SRC, original);
  }
} finally {
  writeFileSync(SRC, original);
}

console.log(bad === 0
  ? `\nALL ${PLANTS.length} PLANTS TURNED THEIR NAMED ROW RED, and the file is restored.`
  : `\n${bad} of ${PLANTS.length} PLANTS DID NOT DISCRIMINATE.`);
process.exit(bad === 0 ? 0 : 1);
