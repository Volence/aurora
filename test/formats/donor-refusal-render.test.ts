/**
 * ROW 213 (b), RENDERED (react-dom/server, in node): a paste refusal whose
 * subject the target pane cannot place names it "not on this pane" in the
 * refusal text, and a placed subject is named plainly. The refusals are aeon's
 * real answers (test/fixtures/clips/aeon-outputs/), the acts aeon's vendored
 * manifests; every id and index is READ from them.
 *
 * What it does NOT hold: the outline on the canvas (store rows in
 * src/renderer/state/__tests__/donor-paste.test.ts hold the outline data, and
 * the CDP donor-page harness the picture).
 */
import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { outcomeView } from '../../src/renderer/components/donors/DonorPasteSection';
import { parseClipManifest, withClip } from '../../src/core/formats/donors/clip-manifest-doc';
import { readBakeJson, readValidateJson } from '../../src/core/formats/donors/clip-validate-json';

const DIR = resolve(__dirname, '../fixtures/clips');
type Case = { exit: number; stdout: string; stderr: string };
const load = (f: string) => JSON.parse(readFileSync(resolve(DIR, 'aeon-outputs', f), 'utf8')) as Record<string, Case>;
const vendored = (n: string) => parseClipManifest(readFileSync(resolve(DIR, `${n}.clips.json`), 'utf8'));
const CLIP = { id: 'ehz_x', donor: 's2disasm', zone: 'EHZ', src: { x: 0, y: 0, w: 2048, h: 1024 }, dst: { x: 0, y: 2048, w: 2048, h: 1024 } };

function refusedView(tool: 'validate' | 'bake', c: Case, act: string): string {
  const v = tool === 'validate' ? readValidateJson(c.exit, c.stdout, c.stderr) : readBakeJson(c.exit, c.stdout, c.stderr);
  if (v.kind !== 'refused') throw new Error(`fixture is not a refusal: ${v.kind}`);
  return renderToStaticMarkup(outcomeView({
    kind: 'refused', stage: tool, refusals: v.refusals, warnings: v.warnings, text: '', command: '',
    judged: withClip(vendored(act), CLIP),
  }));
}
const subjectsText = (html: string) => [...html.matchAll(/data-donors-note-subjects[^>]*>([^<]*)</g)].map((m) => m[1]);

describe('the paste refusal names a subject the pane cannot place (row 213 (b))', () => {
  it('C4 names clip 0 ehz_cut, and the act judged has another clip 0: the text says "not on this pane"', () => {
    const c = load('bake-json.cases.json').refuse_c4_bake_own;
    const s = JSON.parse(c.stdout).refusals[0].subjects[0] as { index: number; id: string };
    expect(subjectsText(refusedView('bake', c, 's2_two_clip_pins'))).toEqual([`clip ${s.index} ${s.id} (not on this pane)`]);
  });

  it('R10 names two clips the act judged carries: both are named plainly, neither as off the pane', () => {
    const c = load('validate-json.cases.json').refuse_r10_pair;
    const ss = JSON.parse(c.stdout).refusals[0].subjects as Array<{ index: number; id: string }>;
    expect(subjectsText(refusedView('validate', c, 's2_two_clip'))).toEqual([ss.map((s) => `clip ${s.index} ${s.id}`).join(' and ')]);
  });
});
