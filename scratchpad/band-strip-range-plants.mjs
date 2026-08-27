#!/usr/bin/env node
// RED-FIRST FOR THE BLOB-STRIP RANGE DRAG — ROADMAP item 43 wave 2.
//
// Guards that assert nothing are the dominant defect class in this repo, so no
// row below is believed until a defect planted in the REAL module turns the row
// it NAMES red. Each plant is a mistake this gesture could plausibly make and
// that would look entirely correct on screen: an exclusive run (a band one
// column narrower than the drag), the prefix clamp applied after the run is
// measured (art selected past the drag), the gate falling open on a library
// background (a candidate aimed through the wrong blob), or a drag quietly
// re-arming paint-tile.
//
// A PLANT THAT COMES BACK GREEN HAS THREE CAUSES AND ONLY ONE IS A BAD GUARD:
// the matcher may be catching a NEIGHBOURING row's wording; two code paths may
// produce one observable; or the row may be measuring the wrong quantity. When
// one comes back green, suspect the matcher first — and if the guard really is
// absent, say so rather than deleting the plant.
//
// Run: node scratchpad/band-strip-range-plants.mjs
// It restores the file on every exit path, including a crash.

import { readFileSync, writeFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const SRC = `${ROOT}/src/renderer/providers/band-strip-range.ts`;
const TEST = 'src/renderer/providers/__tests__/band-strip-range.test.ts';

const PLANTS = [
  {
    id: 'exclusive-run',
    what: 'the run made EXCLUSIVE — every band one column narrower than the drag',
    from: '  const runLength = runEnd - staticBase + 1;',
    to:   '  const runLength = runEnd - staticBase;',
    expect: /THE RUN IS INCLUSIVE/,
  },
  {
    id: 'clamp-last',
    what: 'the prefix clamp applied AFTER the run is measured — length kept, start moved',
    from: '  const runLength = runEnd - staticBase + 1;',
    to:   '  const runLength = runEnd - Math.min(anchorSlot, releaseSlot) + 1;',
    expect: /THE CLAMP COMES FIRST/,
  },
  {
    id: 'no-clamp',
    what: 'the base clamp dropped, so a drag may aim a candidate INTO the animated prefix',
    from: '  const staticBase = Math.max(lo, firstPromotableSlot);',
    to:   '  const staticBase = lo;',
    expect: /starts at firstPromotableSlot instead/,
  },
  {
    id: 'round-up',
    what: 'the run rounds UP to whole columns — the band takes art past the drag',
    from: '  const wanted = Math.max(1, Math.floor(runLength / rows));',
    to:   '  const wanted = Math.max(1, Math.ceil(runLength / rows));',
    expect: /rounds DOWN/,
  },
  {
    id: 'zero-cols',
    what: 'a sub-column run resolves to ZERO columns — a dead-looking strip',
    from: '  const wanted = Math.max(1, Math.floor(runLength / rows));',
    to:   '  const wanted = Math.floor(runLength / rows);',
    expect: /still one column, never zero/,
  },
  {
    id: 'gate-open',
    what: 'the override gate falls open — a library/act blob drags a candidate',
    from: "  if (layer !== 'bg' || origin !== 'override') return { kind: 'pick', why: 'not-the-override-blob' };",
    to:   "  if (layer !== 'bg') return { kind: 'pick', why: 'not-the-override-blob' };",
    expect: /LIBRARY background is a plain pick/,
  },
  {
    id: 'gate-fg',
    what: 'the FG half of the gate dropped — a tileset index aims a BG band',
    from: "  if (layer !== 'bg' || origin !== 'override') return { kind: 'pick', why: 'not-the-override-blob' };",
    to:   "  if (origin !== 'override') return { kind: 'pick', why: 'not-the-override-blob' };",
    // MEASURED: the FG rows pass `origin: 'tileset'`, so dropping the LAYER
    // half alone leaves every one of them green — `resolveTilePickerSource`
    // never produces `origin: 'override'` in FG, and the layer check is
    // redundant against that resolver. The row that discriminates had to be
    // ADDED for the INCONSISTENT PAIR; the module's docblock now says the half
    // is defence against two independently-defaulted fields rather than
    // claiming a hazard today's resolver can produce.
    expect: /INCONSISTENT source/,
  },
  {
    id: 'no-pick',
    what: 'a same-slot press+release resolves as a RANGE — today\'s click behaviour lost',
    from: "  if (anchorSlot === releaseSlot) return { kind: 'pick', why: 'same-slot' };",
    to:   '',
    expect: /press and release on ONE slot is the pick/,
  },
  {
    id: 'prefix-silent',
    what: 'a run entirely inside the prefix silently resolves instead of refusing',
    from: '  if (staticBase > runEnd) {',
    to:   '  if (false && staticBase > runEnd) {',
    expect: /entirely inside the animated prefix is refused/,
  },
  {
    id: 'blob-overrun',
    what: 'the blob bound dropped — a band may run off the end of the tile array',
    from: '  if (maxCols < 1) {',
    to:   '  if (false && maxCols < 1) {',
    expect: /no room for even one column|boundary is exact/,
  },
  {
    id: 'no-trim',
    what: 'the Math.min dropped but the refusal kept — the bound stops reducing',
    from: '  const cols = Math.min(wanted, maxCols);',
    to:   '  const cols = wanted;',
    expect: /reduces cols rather than overrunning/,
  },
  {
    id: 'rows-unchecked',
    what: 'an illegal rows value is accepted — the runtime cannot shift that column',
    from: `  if (!rowChoices().includes(rows)) {`,
    to:   `  if (false && !rowChoices().includes(rows)) {`,
    expect: /the runtime cannot shift is refused|cannot divide by zero/,
  },
  {
    id: 'silent-refusal',
    what: 'a refusal renders as an EMPTY label — the gesture goes quiet',
    from: "  if (outcome.kind === 'refused') return `no range — ${outcome.reason}`;",
    to:   "  if (outcome.kind === 'refused') return '';",
    expect: /stated on the line, never swallowed/,
  },
  {
    id: 'pick-label',
    what: 'a pick writes to the hover line, clobbering the strip\'s own readout',
    from: "  if (outcome.kind === 'pick') return '';",
    to:   "  if (outcome.kind === 'pick') return `picked ${outcome.why}`;",
    expect: /writes NOTHING to the line/,
  },
  {
    id: 'alarm',
    what: 'the range label grows a warning — the NEUTRAL ruling violated',
    from: '  return `band ${outcome.staticBase}..${end} · ${outcome.cols}x${outcome.rows}`;',
    to:   '  return `band ${outcome.staticBase}..${end} · ${outcome.cols}x${outcome.rows} — careful`;',
    expect: /NEUTRAL about the footprint/,
  },
  {
    id: 'paragraph-on-the-line',
    what: 'THE DEFECT THE CDP HARNESS FOUND: the whole refusal paragraph put back on the '
      + 'one line, which wrapped the header row and moved the tile grid under the cursor',
    from: "  if (outcome.kind === 'refused') return `no range — ${outcome.reason}`;",
    to:   "  if (outcome.kind === 'refused') return `no range — ${outcome.hint}`;",
    expect: /EVERY line is ONE line/,
  },
  {
    id: 'hint-on-the-line',
    what: 'the range line grows the hint\'s detail back onto it',
    from: '  return `band ${outcome.staticBase}..${end} · ${outcome.cols}x${outcome.rows}`;',
    to:   '  return stripDragHint(outcome);',
    expect: /EVERY line is ONE line/,
  },
  {
    id: 'hint-empty',
    what: 'the hint drops the reasoning, so the ellipsised line is all there is',
    from: "  if (outcome.kind === 'refused') return outcome.hint;",
    to:   "  if (outcome.kind === 'refused') return outcome.reason;",
    expect: /reasoning on the hint|run and the clamp are on the HINT/,
  },
  {
    id: 'report-frozen',
    what: 'the gesture counter stops advancing — a harness can no longer prove the release ran',
    from: '    gestures: lastReport.gestures + 1,',
    to:   '    gestures: lastReport.gestures,',
    expect: /gestures advances on every release/,
  },
  {
    id: 'report-kindless',
    what: 'the report always says "range" — WHICH branch ran becomes unassertable',
    from: '    kind: outcome.kind,',
    to:   "    kind: 'range',",
    expect: /gestures advances on every release/,
  },
];

const original = readFileSync(SRC, 'utf8');
let bad = 0;

function runSuite() {
  try {
    return execSync(`npx vitest run ${TEST} --reporter=verbose 2>&1`, { cwd: ROOT, encoding: 'utf8' });
  } catch (e) {
    return `${e.stdout ?? ''}${e.stderr ?? ''}`;
  }
}

try {
  const base = runSuite();
  const baseLine = /Tests\s+(\d+) passed \((\d+)\)/.exec(base);
  console.log(`BASELINE  ${baseLine ? baseLine[0] : 'COULD NOT READ THE TOTAL'}`);
  if (!baseLine) { console.log(base.slice(-2000)); process.exit(3); }

  for (const p of PLANTS) {
    if (!original.includes(p.from)) {
      console.log(`SKIPPED   [${p.id}] anchor no longer in the source — THE PLANT IS STALE, NOT THE CODE`);
      bad++;
      continue;
    }
    writeFileSync(SRC, original.replace(p.from, p.to));
    const out = runSuite();
    const failed = [...out.matchAll(/^\s*(?:×|✕)\s+(.*)$/gm)].map((m) => m[1].trim());
    const hit = failed.filter((n) => p.expect.test(n));
    const ok = hit.length > 0;
    console.log(`${ok ? 'RED   ' : 'GREEN!'}   [${p.id}] ${p.what}`);
    console.log(`          rows red: ${failed.length ? failed.map((f) => `"${f}"`).join(', ') : 'NONE'}`);
    if (!ok) {
      bad++;
      console.log('          ⚠ THE PLANT DID NOT TURN ITS NAMED ROW RED. Suspect the MATCHER before the guard.');
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
