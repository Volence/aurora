// THE GUIDE'S QUOTATIONS OF aeon, HELD AGAINST aeon'S PUBLISHED TREE.
//
// ROADMAP row 212 (EXPIRY-LISTS-WITH-NO-READER). `docs/guides/effects-first-run.md`
// §6 quoted aeon's refusal for an unthreaded binding as "no preset threads
// `ojz_act1_sec_raster(sec: N)`". aeon bcd844aa re-keyed that chooser on the
// RECORD for every act, so aeon's seam gate has said
// "no preset threads {fn}(preset: {rec}_KEY)" since, and the guide went on
// teaching a message the build no longer prints. Its only automated reader was
// a `NOT_A_LABEL` row in `scripts/check-guide-text.mjs` that EXEMPTED the span
// ("aeon build message, quoted") from every check: an exemption list is a
// reader of nothing.
//
// THE POPULATION: every span the guide quotes as aeon's refusal
// (`no preset threads \`...\``) and every `tools/`, `build.sh` or
// `games/<game>/` path it backticks. The first is derived against the chooser
// name THIS REPO derives (`rasterChooserName`, which the panel strip uses) and
// against the f-string in aeon's `tools/effects_seam_gate.py`; the second
// against aeon's tree listing. Both at aeon `origin/master`, through git objects.
//
// WHAT IT DOES NOT READ, stated so silence is not taken for coverage: the
// guide's prose claims about what aeon's build DOES (the §7 build loop, the §6
// section-mode framing). Those are listed as open in
// docs/reviews/2026-09-25-expiry-lists-census.md.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { rasterChooserName } from '../../../../core/formats/effects/section-wiring';
import { peerRepo, resolveRev, readAtRev } from '../../../../../test/support/peer-repo';

const GUIDE = readFileSync(join(__dirname, '..', '..', '..', '..', '..', 'docs', 'guides', 'effects-first-run.md'), 'utf8');
const TIP = 'origin/master';
const SEAM_GATE = 'tools/effects_seam_gate.py';

/** Every chooser call the guide quotes as the body of aeon's unthreaded-binding refusal. */
function quotedThreadRefusals(md: string): string[] {
  return [...md.replace(/\s+/g, ' ').matchAll(/no preset threads `([^`]+)`/g)].map((m) => m[1]);
}

/** Every aeon repository path the guide backticks. `<game>` is a placeholder the reader fills. */
function quotedAeonPaths(md: string): string[] {
  const spans = [...md.matchAll(/`([^`\n]+)`/g)].map((m) => m[1].replace(/^FAST=1 /, ''));
  return [...new Set(spans.filter((s) => /^(\.\/)?(tools\/\S+|build\.sh|games\/\S+)$/.test(s))
    .map((s) => s.replace(/^\.\//, '')))];
}

describe('effects-first-run.md: what it quotes of aeon exists in aeon', () => {
  it('quotes aeon\'s unthreaded-binding refusal with the chooser aeon mints and the argument shape aeon prints', (ctx) => {
    const quotes = quotedThreadRefusals(GUIDE);
    expect(quotes.length, 'the guide no longer quotes the refusal, so this row measures nothing').toBeGreaterThan(0);
    const repo = peerRepo('aeon');
    if (repo === null) { ctx.skip('SKIPPED, NOT PASSED: no aeon checkout beside this repo'); return; }
    if (resolveRev(repo, TIP) === null) { ctx.skip(`SKIPPED, NOT PASSED: ${TIP} does not resolve in aeon`); return; }
    const gate = readAtRev(repo, TIP, SEAM_GATE);
    expect(gate.ok, gate.ok ? '' : gate.why).toBe(true);
    const src = (gate as { ok: true; text: string }).text;
    // aeon's own f-string for the raster arm. If aeon rewords it, this is red
    // and the guide's quotation is the thing to re-read.
    // Adjacent f-string literals are joined first: aeon splits this sentence
    // across two source lines ("... but no " / f"preset threads ...").
    const joined = src.replace(/"\s*\n\s*f"/g, '');
    expect(joined, `${SEAM_GATE} at aeon ${TIP} no longer prints "no preset threads {fn}(preset: {rec}_KEY)"`)
      .toMatch(/no preset threads \{fn\}\(preset: \{rec\}_KEY\)/);
    const fn = rasterChooserName('ojz', 'act1');
    for (const q of quotes) {
      expect(q, `the guide quotes "${q}", but aeon's refusal names ${fn}(preset: <Record>_KEY)`)
        .toBe(`${fn}(preset: <Record>_KEY)`);
    }
  });

  it('every aeon path it backticks exists at aeon origin/master', (ctx) => {
    const paths = quotedAeonPaths(GUIDE);
    expect(paths.length, 'the guide backticks no aeon path, so this row measures nothing').toBeGreaterThan(0);
    const repo = peerRepo('aeon');
    if (repo === null) { ctx.skip('SKIPPED, NOT PASSED: no aeon checkout beside this repo'); return; }
    if (resolveRev(repo, TIP) === null) { ctx.skip(`SKIPPED, NOT PASSED: ${TIP} does not resolve in aeon`); return; }
    for (const p of paths) {
      const concrete = p.replace('<game>', 'sonic4');
      const b = readAtRev(repo, TIP, concrete);
      expect(b.ok, `the guide cites ${p}; ${b.ok ? '' : b.why}`).toBe(true);
    }
  });
});
