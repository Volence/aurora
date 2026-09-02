#!/usr/bin/env node
// RED-FIRST FOR THE BAND-LENS CDP HARNESS — ROADMAP item 43 part 2.
//
// A green CDP run proves nothing until the rows have been shown to go red for
// the right reason. Each poison below breaks ONE property of the running
// feature, rebuilds, runs `bganim-band-lens-harness.mjs`, and NAMES the rows
// that went red. A poison whose intended row stays green is reported as such —
// suspect the MATCHER before the guard.
//
// Every poison is restored and the tree rebuilt on every exit path.
//
// Run: node scratchpad/band-lens-poisons.mjs        (~1 min per poison)
//      POISON=<id> node scratchpad/band-lens-poisons.mjs   for one

import { AURORA_DIR } from '../test/support/sibling-root.mjs';
import { readFileSync, writeFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = AURORA_DIR;
const F = {
  cov: `${ROOT}/src/renderer/providers/band-coverage.ts`,
  lens: `${ROOT}/src/renderer/canvas/band-lens.ts`,
  map: `${ROOT}/src/renderer/components/MapViewport.tsx`,
  store: `${ROOT}/src/renderer/state/editorStore.ts`,
  panel: `${ROOT}/src/renderer/components/effects/BgAnimBandPanel.tsx`,
};

const POISONS = [
  {
    id: 'no-stroke',
    what: 'the lens computes its cells and never strokes them (the classic "wired but invisible")',
    file: 'lens',
    from: '  ctx.fillStyle = BAND_LENS_FILL;\n  ctx.fill();',
    to: '  ctx.fillStyle = BAND_LENS_FILL;',
    expect: ['8b'],
  },
  {
    id: 'transpose',
    what: 'the coverage scan transposes (col, row) — the SAME axis swap that killed the marquee',
    file: 'cov',
    from: 'cells.push({ cell, col: cell % planeCols, row: Math.floor(cell / planeCols), slot });',
    to: 'cells.push({ cell, col: Math.floor(cell / planeCols), row: cell % planeCols, slot });',
    // The COUNT is unchanged by a transpose, so only the pixel row can see it.
    // That is exactly why the pixel row is worth its cost.
    expect: ['8b'],
  },
  {
    id: 'takes-press',
    what: 'the mark branch TAKES the press instead of falling through — panning dies',
    file: 'map',
    from: '          bandMark.current = {\n            cell: hit.cell, word: ctxt.layout[hit.cell], witness: ctxt.witness,\n          };',
    to: '          bandMark.current = {\n            cell: hit.cell, word: ctxt.layout[hit.cell], witness: ctxt.witness,\n          };\n          e.preventDefault();\n          return;',
    // ⚠ EXPECTATION CORRECTED AFTER MEASURING. [9a] was the row this was aimed
    // at, and [9a] is never REACHED: taking the press also skips the `view`
    // branch that records `downPos`, so `handleMouseUp`'s click test never runs
    // and NO mark is ever committed — sections 4 and 5 collapse first and the
    // run aborts at [5a]'s `owner` lookup. The rows below are what actually go
    // red, named rather than a tidier claim. The narrow "a pan re-marks" half of
    // [9a] has its own poison, `commit-on-drag`.
    expect: ['4c', '4d', '5a'],
  },
  {
    id: 'commit-on-drag',
    what: 'the mark commits on ANY release, not only on a click — every pan re-marks',
    file: 'map',
    from: '        commitBandMark();\n      }\n    }',
    to: '      }\n      commitBandMark();\n    }',
    expect: ['9a'],
  },
  {
    id: 'no-witness',
    what: 'the witness check dropped — a mark writes through a stale layout word',
    file: 'map',
    from: 'const stale = !ctxt || ctxt.witness !== mark.witness || ctxt.layout[mark.cell] !== mark.word;',
    to: 'const stale = !ctxt;',
    expect: ['10b'],
  },
  {
    id: 'lit-on-arrival',
    what: 'the lens arrives already pointed at the candidate — a tint for a range nobody chose',
    file: 'store',
    from: '  bandLensTarget: null,',
    to: "  bandLensTarget: { kind: 'candidate' as const },",
    expect: ['3a'],
  },
  {
    id: 'no-repaint-dep',
    what: 'neither lens field is a repaint dependency — the panel moves and the map does not',
    file: 'map',
    from: '    bandLensTarget, bandCandidate,\n    redraw]);',
    to: '    redraw]);',
    // ⚠ MEASURED: dropping `bandCandidate` ALONE turns nothing red, and that is a
    // fact about the store rather than a weak guard — `setBandCandidate` also
    // writes a FRESH `{kind:'candidate'}` into `bandLensTarget`, so that dep's
    // identity changes on every candidate edit and carries the repaint on its
    // own. Both are listed because the second is belt-and-braces against a
    // future setter that preserves the target's identity; the poison drops BOTH
    // so it discriminates the property rather than one redundant spelling of it.
    expect: ['7b'],
  },
  {
    id: 'alarm',
    what: 'the panel renders the footprint as a WARNING — the ruling violated on the surface',
    file: 'panel',
    from: '                <LensSwatch />highlighted on the map · {coverageSummary(lens.coverage)}',
    to: '                <LensSwatch />highlighted on the map · careful! {coverageSummary(lens.coverage)}',
    // The CARD's line, which [7g] reads. Its twin below poisons the CANDIDATE's,
    // which [7e] reads — two surfaces, two rows, because one row covering both
    // would have let either half grow an alarm unnoticed.
    expect: ['7g'],
  },
  {
    id: 'alarm-candidate',
    what: "the CANDIDATE's footprint line grows a warning — the ruling violated where [7e] reads",
    file: 'panel',
    // ⚠ THE ANCHOR CARRIES ITS PREDICATE LINE, because the two footprint lines
    // are the same text at different indents and the shorter indent is a
    // SUBSTRING of the longer one — a bare-line anchor matched the CARD's line
    // and this poison reddened [7g] instead of [7e]. Caught by the expectation,
    // not by luck.
    from: "          {lensTarget?.kind === 'candidate' && lens.coverage !== null && (\n"
      + '            <Hint under>\n'
      + '              <LensSwatch />highlighted on the map · {coverageSummary(lens.coverage)}',
    to: "          {lensTarget?.kind === 'candidate' && lens.coverage !== null && (\n"
      + '            <Hint under>\n'
      + '              <LensSwatch />highlighted on the map · careful! {coverageSummary(lens.coverage)}',
    expect: ['7e'],
  },
  {
    id: 'no-swatch',
    what: "the footprint line loses its colour swatch — the words stop naming the wash",
    file: 'panel',
    from: '      background: BAND_LENS_FILL, border: `1px solid ${BAND_LENS_EDGE}`,',
    to: '      background: \'transparent\', border: \'none\',',
    expect: ['7h'],
  },
];

const originals = Object.fromEntries(
  Object.entries(F).map(([k, p]) => [k, readFileSync(p, 'utf8')]));

function restore() {
  for (const [k, p] of Object.entries(F)) writeFileSync(p, originals[k]);
}
function build() {
  execSync('VITE_AURORA_DEBUG=1 npx electron-vite build', { cwd: ROOT, stdio: 'pipe' });
}
function runHarness(port) {
  try {
    return execSync(`PORT=${port} node scratchpad/bganim-band-lens-harness.mjs 2>&1`,
      { cwd: ROOT, encoding: 'utf8', timeout: 300000 });
  } catch (e) {
    return `${e.stdout ?? ''}${e.stderr ?? ''}`;
  }
}

const only = process.env.POISON ?? null;
let port = 9500;
let bad = 0;
const run = [];

try {
  for (const p of POISONS) {
    if (only && p.id !== only) continue;
    const src = originals[p.file];
    if (!src.includes(p.from)) {
      console.log(`SKIPPED   [${p.id}] anchor no longer in ${p.file} — THE POISON IS STALE, NOT THE CODE`);
      bad++;
      continue;
    }
    writeFileSync(F[p.file], src.replace(p.from, p.to));
    build();
    const out = runHarness(port++);
    restore();
    const red = [...out.matchAll(/^FAIL\s+\[([^\]]+)\]/gm)].map((m) => m[1]);
    const nm = [...out.matchAll(/^NOT-MEASURABLE\s+\[([^\]]+)\]/gm)].map((m) => m[1]);
    const tally = /^(\d+)\/(\d+) rows passed.*$/m.exec(out)?.[0] ?? 'NO TALLY — the run died';
    const hit = p.expect.every((id) => red.includes(id));
    const extra = red.filter((id) => !p.expect.includes(id));
    run.push({ id: p.id, red, tally });
    console.log(`${hit ? 'RED   ' : 'MISS  '}   [${p.id}] ${p.what}`);
    console.log(`          ${tally}`);
    console.log(`          expected red: [${p.expect.join('] [') || '—'}]   actually red: [${red.join('] [') || 'NONE'}]`
      + (nm.length ? `   not-measurable: [${nm.join('] [')}]` : ''));
    if (extra.length) console.log(`          ALSO red (collateral, named rather than hidden): [${extra.join('] [')}]`);
    if (p.note) console.log(`          NOTE: ${p.note}`);
    if (!hit) {
      bad++;
      console.log('          ⚠ THE POISON DID NOT TURN ITS ROW RED. Suspect the MATCHER before the guard.');
    }
  }
} finally {
  restore();
  build();
  console.log('\nrestored and rebuilt.');
}

console.log(bad === 0
  ? `\nALL ${run.length} POISONS TURNED THEIR NAMED ROWS RED.`
  : `\n${bad} POISON(S) DID NOT DISCRIMINATE.`);
process.exit(bad === 0 ? 0 : 1);
