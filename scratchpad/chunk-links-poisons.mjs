#!/usr/bin/env node
// RED-FIRST FOR chunk-links-harness.mjs — OVERSEER bars 2, 2b, 2c, 2d.
//
// Each poison edits ONE source site, rebuilds, runs the harness, restores, and
// reports which rows went red. The `expectRed` / `expectGreen` pair is the part
// that matters: bar 2 warns that a defect planted in the wrong one of two
// near-identical dispatch lines survives a full cycle looking convincing, and
// THIS PARCEL HAS THREE near-identical `set-tiles` dispatches. So poisons A and
// B are deliberately a matched pair — A must redden row 6 and LEAVE ROW 7
// GREEN, B the other way round. A poison that reddens both would mean the two
// rows are not actually aimed at different sites.
//
// Usage: node scratchpad/chunk-links-poisons.mjs [id ...]

import { AURORA_DIR } from '../test/support/sibling-root.mjs';
import { execSync, spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = AURORA_DIR;
const f = (p) => join(ROOT, p);

const POISONS = [
  {
    id: 'A', file: 'src/renderer/components/MapViewport.tsx',
    what: 'endPaintStroke stops breaking links (the paint-tile stroke site)',
    from: 'executeCommand(strokeSection ? withLinkBreaks(strokeSection, cmd) : cmd, level);',
    to: 'executeCommand(cmd, level);',
    expectRed: ['6'], expectGreen: ['7'],
  },
  {
    id: 'B', file: 'src/renderer/components/MapViewport.tsx',
    what: 'paint-block stops breaking links (the OTHER near-identical set-tiles site)',
    from: `        executeCommand(withLinkBreaks(section, {
          type: 'set-tiles',
          description: \`Paint block at (\${baseCol}, \${baseRow})\`,
          sectionIndex: info.sectionIndex,
          entries,
        }), level);`,
    to: `        executeCommand(({
          type: 'set-tiles',
          description: \`Paint block at (\${baseCol}, \${baseRow})\`,
          sectionIndex: info.sectionIndex,
          entries,
        }), level);`,
    expectRed: ['7'], expectGreen: ['6'],
  },
  {
    id: 'C', file: 'src/renderer/state/editorStore.ts',
    what: 'the checkbox defaults to DETACH — the ruling says remember',
    from: '  stampDetached: false,\n  linkHover: null,',
    to: '  stampDetached: true,\n  linkHover: null,',
    // MY FIRST PREDICTION HERE WAS WRONG AND THE CORRECTION IS THE INTERESTING
    // PART. I expected rows 2 and 8. What actually happens is that row 2 goes
    // red AND SO DOES ROW 3: with the default inverted, the very first stamp is
    // detached, records no placement, and the harness aborts at its own
    // "rows 4..9 cannot run" guard. So this poison is a STRONGER diagnostic
    // than predicted (it takes the whole chain down) and reaches fewer rows.
    // Stated as observed, not as hoped.
    expectRed: ['2', '3'], expectGreen: [], allowAbort: true,
  },
  {
    id: 'D', file: 'src/renderer/components/MapViewport.tsx',
    what: 'the stamp ignores the checkbox (detached never reaches buildStampCommand)',
    from: 'baseCol, baseRow, artOnly: e.altKey, detached,',
    to: 'baseCol, baseRow, artOnly: e.altKey, detached: false,',
    expectRed: ['8'], expectGreen: ['2', '3'],
  },
  {
    id: 'E', file: 'src/renderer/components/ChunkLinkOptions.tsx',
    what: 'the Detach button dispatches nothing',
    from: '  if (cmd) executeCommand(cmd, level);\n  useEditorStore.getState().setLinkHover(null);\n}\n\nfunction runDetachAll',
    to: '  if (cmd) void cmd;\n  useEditorStore.getState().setLinkHover(null);\n}\n\nfunction runDetachAll',
    expectRed: ['5'], expectGreen: ['3', '4'],
  },
  {
    id: 'F', file: 'src/renderer/workspace/facets/art-facet.tsx',
    what: 'the chunk editor stops calling buildActPropagationCommand',
    from: '    executeCommand(propagation\n      ? {',
    to: '    executeCommand(false\n      ? {',
    // ⚠ ROW 10 IS EXPECTED TO STAY GREEN HERE AND THAT IS THE POINT, not a
    // pass: with nothing propagating at all, "it did not touch the hand-painted
    // tiles" is VACUOUSLY true. Row 10 can only fail to an OVER-EAGER
    // propagation, which is what poison G plants. Naming that here is the
    // difference between a row that discriminates and one that just agrees.
    expectRed: ['9'], expectGreen: ['3', '5', '6', '7', '8', '10'],
  },
  {
    id: 'G', file: 'src/core/editing/chunk-links.ts',
    what: 'propagation stops honouring the plane — every tile in the footprint window is rewritten',
    from: '    const p = byId.get(links.plane[index]);\n    if (!p) continue;',
    to: '    const p = byId.get(links.plane[index]) ?? placements[0];\n    if (!p) continue;',
    // The discriminating poison for row 10: hand-painted tiles INSIDE the
    // footprint get overwritten. The detached copy at target2 is outside the
    // placement's dx/dy window and is still refused, so this reddens row 10 by
    // its first half only — stated because a reader would otherwise assume the
    // row proved both halves red.
    expectRed: ['10'], expectGreen: ['9'],
  },
];

const want = process.argv.slice(2);
const list = want.length ? POISONS.filter((p) => want.includes(p.id)) : POISONS;

function build() {
  execSync('npm run build', { cwd: ROOT, env: { ...process.env, VITE_AURORA_DEBUG: '1' }, stdio: 'ignore' });
}
function runHarness() {
  const r = spawnSync('node', [join(ROOT, 'scratchpad/chunk-links-harness.mjs')],
    { cwd: ROOT, encoding: 'utf8', timeout: 300000, env: { ...process.env, PORT: '9413' } });
  const out = `${r.stdout ?? ''}${r.stderr ?? ''}`;
  const red = [...out.matchAll(/^FAIL\s+\[(\w+)\]/gm)].map((m) => m[1]);
  const green = [...out.matchAll(/^PASS\s+\[(\w+)\]/gm)].map((m) => m[1]);
  const line = out.split('\n').find((l) => /rows passed/.test(l)) ?? '(no summary)';
  const err = out.split('\n').find((l) => /^HARNESS ERROR/.test(l));
  return { red, green, line, err, out };
}

let bad = 0;
for (const p of list) {
  const path = f(p.file);
  const orig = readFileSync(path, 'utf8');
  if (orig.split(p.from).length - 1 !== 1) {
    console.log(`POISON ${p.id}: SITE NOT UNIQUE (${orig.split(p.from).length - 1} matches) — not planted`);
    bad++; continue;
  }
  writeFileSync(path, orig.replace(p.from, p.to));
  try {
    build();
    const r = runHarness();
    const missingRed = p.expectRed.filter((id) => !r.red.includes(id));
    const brokeGreen = p.expectGreen.filter((id) => !r.green.includes(id));
    const ok = missingRed.length === 0 && brokeGreen.length === 0 && (!r.err || p.allowAbort === true);
    console.log(`POISON ${p.id} — ${p.what}`);
    console.log(`  ${r.line}`);
    console.log(`  red=${JSON.stringify(r.red)} expectedRed=${JSON.stringify(p.expectRed)}`);
    console.log(`  expectedStillGreen=${JSON.stringify(p.expectGreen)} brokenOfThose=${JSON.stringify(brokeGreen)}`);
    if (r.err) console.log(`  ${r.err}`);
    console.log(`  => ${ok ? 'DIAGNOSTIC' : 'PROBLEM'}\n`);
    if (!ok) {
      bad++;
      for (const l of r.out.split('\n')) if (/^FAIL/.test(l)) console.log(`     ${l}`);
    }
  } finally {
    writeFileSync(path, orig);
  }
}
build();
console.log(bad === 0 ? 'all poisons diagnostic' : `${bad} poison(s) did not behave as stated`);
process.exit(bad === 0 ? 0 : 1);
