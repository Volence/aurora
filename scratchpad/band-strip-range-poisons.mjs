#!/usr/bin/env node
// RED-FIRST FOR THE STRIP-RANGE CDP HARNESS — ROADMAP item 43 wave 2.
//
// A green CDP run proves nothing until its rows have been shown to go red for
// the right reason. Each poison below breaks ONE property of the RUNNING
// feature — a wire, a layout, a store write — rebuilds, runs
// `bganim-strip-range-harness.mjs`, and NAMES the rows that went red.
//
// THESE ARE THE DEFECTS THE NODE SUITE CANNOT SEE. The rule module is covered
// by `band-strip-range-plants.mjs` (20 plants, all red); everything here lives
// in the `.tsx` — an unbound handler, a press that decides, a drag that re-arms
// the brush, a readout that reflows the panel it sits in. `vitest run` is blind
// to every one of them.
//
// A POISON WHOSE ROW STAYS GREEN HAS THREE CAUSES AND ONLY ONE IS A BAD GUARD:
// a matcher catching a neighbour's wording, two paths producing one observable,
// or a row measuring the wrong quantity. Suspect the matcher first, and when the
// answer really is "the row does not discriminate", say so.
//
// Every poison is restored and the tree rebuilt on every exit path.
//
// Run: node scratchpad/band-strip-range-poisons.mjs        (~1 min per poison)
//      POISON=<id> node scratchpad/band-strip-range-poisons.mjs   for one

import { AURORA_DIR } from '../test/support/sibling-root.mjs';
import { readFileSync, writeFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = AURORA_DIR;
const F = {
  art: `${ROOT}/src/renderer/components/ArtBrowser.tsx`,
  rule: `${ROOT}/src/renderer/providers/band-strip-range.ts`,
};

const POISONS = [
  {
    id: 'press-unwired',
    what: 'the press handler is never attached — the drag has no anchor, so every gesture '
      + 'collapses back into a plain click',
    file: 'art',
    from: '        onMouseDown={handleMouseDown}\n',
    to: '',
    // The release then sees anchor -1 and resolves `pick`/`same-slot`, so the
    // candidate never moves and the whole range half is dead.
    expect: ['6b', '6c', '6g'],
  },
  {
    id: 'press-decides',
    what: 'the PRESS commits instead of recording — the far end of the drag is never consulted',
    file: 'art',
    from: '    dragAnchorRef.current = slotAtEvent(e);\n  }, [slotAtEvent]);',
    to: '    const s = slotAtEvent(e);\n    dragAnchorRef.current = s;\n'
      + '    if (s >= 0) useEditorStore.getState().setBandCandidate({ staticBase: s, cols: 1 });\n'
      + '  }, [slotAtEvent]);',
    // ⚠ EXPECTATION CORRECTED AFTER MEASURING. [6c] was the row this was aimed
    // at, and [6c] CANNOT see it: the release still resolves correctly and
    // overwrites whatever the press wrote, so at the end of a RESOLVING drag the
    // candidate is right either way. The rows that DO see it are the ones about
    // gestures that must change NOTHING — a refused drag ([8a]) and a foreground
    // pick ([9b]) — because a press that decides moves the candidate before the
    // release ever gets to refuse. Named rather than a tidier claim.
    expect: ['8a', '9b'],
  },
  {
    id: 'drag-rearms-paint',
    what: 'a drag ALSO picks the tile and arms paint-tile — aiming a band silently loads a brush',
    file: 'art',
    from: "      ed.setBandCandidate({ staticBase: outcome.staticBase, cols: outcome.cols });",
    to: "      ed.setBandCandidate({ staticBase: outcome.staticBase, cols: outcome.cols });\n"
      + '      ed.setSelectedTileIndexForLayer(editingLayer, idx);\n'
      + "      ed.setTool('paint-tile');",
    expect: ['6d'],
  },
  {
    id: 'click-stops-picking',
    what: 'THE CONTROL: a plain click stops picking a tile — today\'s behaviour lost to wave 2',
    file: 'art',
    from: "      ed.setSelectedTileIndexForLayer(editingLayer, idx);\n      ed.setTool('paint-tile');\n      return;",
    to: '      return;',
    expect: ['4c'],
  },
  {
    id: 'origin-forced',
    what: 'the component forces `origin: override` — the ORIGIN half of the gate unwired',
    file: 'art',
    from: "      origin: src?.origin ?? 'none',",
    to: "      origin: 'override',",
    // ⚠ MEASURED: this comes back 33/33 GREEN, and that is the answer rather
    // than a hole. The `layer` half of the gate still holds in the foreground —
    // which is the FIRST direct evidence that the half the node plant could not
    // redden is load-bearing at the call site. `gate-unwired` below breaks BOTH
    // and is the poison that proves [9b] discriminates.
    expect: [],
    expectGreen: true,
    note: 'expected GREEN — the layer half of the gate holds when the origin is forced. '
      + 'This is why `resolveStripDrag` checks both, and why the node docblock calls the '
      + 'redundancy defence rather than dead weight.',
  },
  {
    id: 'gate-unwired',
    what: 'BOTH halves of the gate unwired — a foreground index aims a background band',
    file: 'art',
    from: "      layer: src?.layer ?? 'fg',\n      origin: src?.origin ?? 'none',",
    to: "      layer: 'bg',\n      origin: 'override',",
    expect: ['9b'],
  },
  {
    id: 'stale-source',
    what: 'the source is never published to the ref — the release reads a null source',
    file: 'art',
    from: '  sourceRef.current = source;',
    to: '',
    // ⚠ EXPECTATION CORRECTED AFTER MEASURING: [6b] stays GREEN, because a null
    // source changes the RESOLUTION and not the AIM — the anchor and release
    // slots are still read off the canvas correctly, which is exactly the
    // separation [6b] exists to give. [4b] joins instead: a same-slot click now
    // reports `not-the-override-blob` rather than `same-slot`, so even the pick
    // path takes the wrong branch.
    expect: ['4b', '6c', '6g'],
  },
  {
    id: 'rows-ignored',
    what: 'the drag divides by a hardcoded 1 instead of the candidate\'s rows — the panel\'s '
      + 'Rows control stops reaching the strip',
    file: 'art',
    from: '      rows: ed.bandCandidate.rows,',
    to: '      rows: 1,',
    expect: ['6c'],
  },
  {
    id: 'budget-ignored',
    what: 'firstPromotableSlot hardcoded to 0 — a drag may aim a candidate into the prefix',
    file: 'art',
    from: '      firstPromotableSlot: bandBudget(doc).firstPromotableSlot,',
    to: '      firstPromotableSlot: 0,',
    expect: ['8a'],
  },
  {
    id: 'readout-silent',
    what: 'the component stops writing the readout — the strip\'s only surface goes quiet',
    file: 'art',
    from: '      hoverLabelRef.current.textContent = stripDragLabel(outcome);\n'
      + '      hoverLabelRef.current.title = stripDragHint(outcome);',
    to: '      void stripDragLabel(outcome); void stripDragHint(outcome);',
    expect: ['6f', '8a'],
  },
  {
    id: 'paragraph-on-the-line',
    what: 'THE DEFECT THIS HARNESS FOUND: the whole message back on the one line, which wraps '
      + 'the header row and moves the tile grid out from under the cursor',
    file: 'rule',
    from: "  if (outcome.kind === 'refused') return `no range — ${outcome.reason}`;\n"
      + '  const end = outcome.staticBase + outcome.cols * outcome.rows;\n'
      + '  return `band ${outcome.staticBase}..${end} · ${outcome.cols}x${outcome.rows}`;',
    to: '  return stripDragHint(outcome);',
    // ⚠ MEASURED GREEN ON [6h]/[6i], and that IS the finding: `whiteSpace:
    // nowrap` on the header row holds ANY message to one line, so the long
    // message alone no longer reaches the layout. What it does break is the
    // READOUT — [6f] and [8a] see the gesture's own message go wrong. The CSS
    // half has its own poisons (`header-can-grow`, `ellipsis-gone`).
    expect: ['8a'],
    note: 'measured: [6h]/[6i] stay GREEN because the CSS half holds a long line to one row, '
      + 'and [6f] stays green because the long form still contains the slots and the geometry. '
      + 'The row that sees it is [8a] — the refusal loses its `no range — ` lead.',
  },
  {
    id: 'header-can-grow',
    what: 'the header row is allowed to wrap again — the same defect from the CSS side',
    file: 'art',
    from: "    display: 'flex', alignItems: 'center', gap: 0, whiteSpace: 'nowrap',\n"
      + "    borderBottom: `1px solid ${T.border}`, flexShrink: 0, overflow: 'hidden',",
    to: "    display: 'flex', alignItems: 'center', gap: 0,\n"
      + '    borderBottom: `1px solid ${T.border}`, flexShrink: 0,',
    // ⚠ MEASURED GREEN, and the reason is worth stating: the READOUT SPAN has
    // its own `whiteSpace: nowrap`, so removing the row's does not let anything
    // wrap. Two independent defences of one property — the case where a poison
    // coming back green is about the OTHER path, not about the guard.
    expect: [],
    expectGreen: true,
    note: 'expected GREEN — the readout span carries its own nowrap.',
  },
  {
    id: 'ellipsis-gone',
    what: 'the readout loses its own shrink/ellipsis — the other half of the no-reflow defence',
    file: 'art',
    from: "    minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',\n",
    to: '',
    // ⚠ MEASURED GREEN for the mirror reason: `white-space` INHERITS, so the
    // row's `nowrap` still reaches the span. `nowrap-both-gone` breaks the pair.
    expect: [],
    expectGreen: true,
    note: 'expected GREEN — `white-space: nowrap` on the header row is inherited by the span.',
  },
  {
    id: 'nowrap-both-gone',
    what: 'BOTH nowraps gone — the header row is free to wrap again, which is the layout half '
      + 'of the defect this harness found',
    file: 'art',
    edits: [
      {
        file: 'art',
        from: "    display: 'flex', alignItems: 'center', gap: 0, whiteSpace: 'nowrap',\n"
          + "    borderBottom: `1px solid ${T.border}`, flexShrink: 0, overflow: 'hidden',",
        to: "    display: 'flex', alignItems: 'center', gap: 0,\n"
          + '    borderBottom: `1px solid ${T.border}`, flexShrink: 0,',
      },
      {
        file: 'art',
        from: "    minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',\n",
        to: '',
      },
    ],
    expect: ['6h'],
  },
  {
    id: 'lens-not-lit',
    what: 'the drag writes the candidate WITHOUT pointing the lens at it',
    file: 'art',
    from: '      ed.setBandCandidate({ staticBase: outcome.staticBase, cols: outcome.cols });',
    to: '      useEditorStore.setState({ bandCandidate: {\n'
      + '        ...ed.bandCandidate, staticBase: outcome.staticBase, cols: outcome.cols } });',
    expect: ['6e'],
  },
  {
    id: 'writes-a-document',
    what: 'the gesture is given a document write — the one thing this arc forbids',
    file: 'art',
    from: '      ed.setBandCandidate({ staticBase: outcome.staticBase, cols: outcome.cols });',
    to: '      ed.setBandCandidate({ staticBase: outcome.staticBase, cols: outcome.cols });\n'
      + '      { const d = useProjectStore.getState().project?.bgOverride?.doc;\n'
      + '        if (d) d.layout[0] = ((d.layout[0] ?? 0) + 1) & 0x7FF; }',
    // ⚠ NOT AN XOR. The first spelling toggled one bit, and the run resolves TWO
    // ranges (sections 6 and 7), so it toggled back and [11a] was correctly
    // green on a document that really was unchanged at the end. A monotonic
    // bump is the poison that actually leaves a mark.
    expect: ['11a'],
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
    return execSync(`PORT=${port} node scratchpad/bganim-strip-range-harness.mjs 2>&1`,
      { cwd: ROOT, encoding: 'utf8', timeout: 300000 });
  } catch (e) {
    return `${e.stdout ?? ''}${e.stderr ?? ''}`;
  }
}

const only = process.env.POISON ?? null;
let port = 9560;
let bad = 0;
const run = [];

try {
  for (const p of POISONS) {
    if (only && p.id !== only) continue;
    // One poison may touch more than one file (the two independent halves of
    // the no-reflow property, for instance), so every poison is normalised to a
    // list of edits and each anchor is checked before anything is written.
    const edits = p.edits ?? [{ file: p.file, from: p.from, to: p.to }];
    const staged = new Map();
    let stale = null;
    for (const e of edits) {
      const cur = staged.get(e.file) ?? originals[e.file];
      if (!cur.includes(e.from)) { stale = e.file; break; }
      staged.set(e.file, cur.replace(e.from, e.to));
    }
    if (stale) {
      console.log(`SKIPPED   [${p.id}] anchor no longer in ${stale} — THE POISON IS STALE, NOT THE CODE`);
      bad++;
      continue;
    }
    for (const [k, text] of staged) writeFileSync(F[k], text);
    try { build(); } catch (e) {
      restore();
      console.log(`SKIPPED   [${p.id}] the poisoned tree does not BUILD — the poison is wrong, `
        + 'not the code');
      console.log(`          ${String(e.message).slice(0, 300)}`);
      bad++;
      continue;
    }
    const out = runHarness(port++);
    restore();
    const red = [...out.matchAll(/^FAIL\s+\[([^\]]+)\]/gm)].map((m) => m[1]);
    const nm = [...out.matchAll(/^NOT-MEASURABLE\s+\[([^\]]+)\]/gm)].map((m) => m[1]);
    const tally = /^\d+\/\d+ PASSED.*$/m.exec(out)?.[0]
      ?? (/HARNESS ERROR/.test(out) ? 'THE RUN DIED (harness error)' : 'NO TALLY — the run died');
    // `expectGreen` poisons are the ones whose point is that ANOTHER guard holds
    // — they are evidence for that other guard, not a hole, so they pass when
    // nothing goes red and FAIL if something does.
    const hit = p.expectGreen
      ? red.length === 0
      : p.expect.length > 0 && p.expect.every((id) => red.includes(id));
    const extra = red.filter((id) => !p.expect.includes(id));
    run.push({ id: p.id, red, tally });
    console.log(`${hit ? (p.expectGreen ? 'HELD  ' : 'RED   ') : 'MISS  '}   [${p.id}] ${p.what}`);
    console.log(`          ${tally}`);
    console.log(`          expected red: [${p.expectGreen ? 'NONE (another guard holds)' : (p.expect.join('] [') || '—')}]`
      + `   actually red: [${red.join('] [') || 'NONE'}]`
      + (nm.length ? `   not-measurable: [${nm.join('] [')}]` : ''));
    if (extra.length) console.log(`          ALSO red (collateral, named rather than hidden): [${extra.join('] [')}]`);
    if (p.note) console.log(`          NOTE: ${p.note}`);
    if (!hit) {
      bad++;
      console.log('          ⚠ THE POISON DID NOT TURN ITS NAMED ROW RED. Suspect the MATCHER before the guard.');
    }
  }
} finally {
  restore();
  build();
  console.log('\nrestored and rebuilt.');
}

console.log(bad === 0
  ? `\nALL ${run.length} POISONS TURNED THEIR NAMED ROWS RED.`
  : `\n${bad} POISON(S) DID NOT DISCRIMINATE — each named above.`);
process.exit(bad === 0 ? 0 : 1);
