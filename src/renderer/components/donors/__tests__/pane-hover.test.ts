/**
 * ROW 236 (a), RULED by the overseer 2026-09-28 under the owner's 2026-09-18
 * permission: every refusal outline, of any kind, names itself on hover as its
 * rule tag and its subject label, e.g. "K9: shaft 0 wfz_to_ehz", built from the
 * existing `ruleTag` and `subjectLabel` (no new wording). The on-canvas tag is
 * unchanged. The canvas half (the real hover on the app) is the donor-page
 * harness, DP.12h.
 *
 * Every refusal here is aeon's REAL output (test/fixtures/clips/aeon-outputs/)
 * placed on the manifest aeon judged (the case's `manifest`) or the vendored
 * act it judged; no rectangle, rule or id is typed here.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseClipManifest, type ClipManifestDoc } from '../../../../core/formats/donors/clip-manifest-doc';
import { readValidateJson, subjectLabel, type ClipNote, type ClipSubject } from '../../../../core/formats/donors/clip-validate-json';
import { ruleTag } from '../../../../core/formats/donors/refused-subjects';
import { refusedOutlines, targetPaneOutlines } from '../target-outlines';
import { outlineNamesAt } from '../pane-hover';

const DIR = resolve(__dirname, '../../../../../test/fixtures/clips');
type Case = { exit: number; stdout: string; stderr: string; manifest?: unknown };
const load = (f: string) => JSON.parse(readFileSync(resolve(DIR, 'aeon-outputs', f), 'utf8')) as Record<string, Case>;
const VALIDATE = load('validate-json.cases.json');
const MUSIC = load('paste-music.cases.json');
const vendored = (n: string) => readFileSync(resolve(DIR, `${n}.clips.json`), 'utf8');

function refusalsOf(c: Case): ClipNote[] {
  const v = readValidateJson(c.exit, c.stdout, c.stderr);
  if (v.kind !== 'refused') throw new Error(`fixture is not a refusal: ${v.kind}`);
  return v.refusals;
}
const refusedOn = (refusals: ClipNote[], judged: ClipManifestDoc) =>
  refusedOutlines({ outcome: { kind: 'refused', stage: 'validate', refusals, warnings: [], text: '', command: '', judged }, bakeRefused: null });
const centre = (r: { x: number; y: number; w: number; h: number }) => ({ x: r.x + Math.floor(r.w / 2), y: r.y + Math.floor(r.h / 2) });

// Every real refusal whose subjects the pane places, with the manifest aeon judged. Between
// them: clips, a corridor and shafts, single subjects and pairs.
const REAL: Array<[string, Case, () => ClipManifestDoc]> = [
  ['R3 (paste-music refuse_r3_paste_pre222)', MUSIC.refuse_r3_paste_pre222, () => parseClipManifest(JSON.stringify(MUSIC.refuse_r3_paste_pre222.manifest))],
  ['R10 clip pair (refuse_r10_pair on s2_two_clip)', VALIDATE.refuse_r10_pair, () => parseClipManifest(vendored('s2_two_clip'))],
  ['R10 clip + corridor (refuse_r10_clip_corridor on s2_ehz_cpz)', VALIDATE.refuse_r10_clip_corridor, () => parseClipManifest(vendored('s2_ehz_cpz'))],
  ['K9 clip + shaft (refuse_k9_shaft_dup_clip_id)', VALIDATE.refuse_k9_shaft_dup_clip_id, () => parseClipManifest(JSON.stringify(VALIDATE.refuse_k9_shaft_dup_clip_id.manifest))],
  ['K9 one shaft (refuse_k9_shaft_ledge_pitch)', VALIDATE.refuse_k9_shaft_ledge_pitch, () => parseClipManifest(JSON.stringify(VALIDATE.refuse_k9_shaft_ledge_pitch.manifest))],
];

describe('row 236 (a): a refusal outline names itself on hover as its rule tag and its subject label', () => {
  it('census: every refusal outline of every real placing refusal (clip, corridor, shaft) is named on hover at its centre as "<rule tag>: <subject label>"', () => {
    const kinds = new Set<string>();
    for (const [what, c, judged] of REAL) {
      const refusals = refusalsOf(c);
      const doc = judged();
      const outlines = refusedOn(refusals, doc);
      const subjects = refusals.flatMap((n) => n.subjects.map((s) => ({ rule: n.rule, s })));
      // Anti-vacuous: each case places every subject it names (one outline each).
      expect(outlines.length, what).toBe(subjects.length);
      subjects.forEach(({ rule, s }, i) => {
        kinds.add(s.kind);
        expect(outlineNamesAt(outlines, centre(outlines[i].rect)), `${what}, subject ${i}`)
          .toContain(`${ruleTag(rule)}: ${subjectLabel(s)}`);
      });
    }
    expect([...kinds].sort()).toEqual(['clip', 'corridor', 'shaft']);
  });

  it('the ruled shape, spelled out once: aeon\'s K9 on a shaft reads "K9: shaft <index> <id>" and nothing else is under its centre', () => {
    const c = VALIDATE.refuse_k9_shaft_ledge_pitch;
    const r = refusalsOf(c);
    const [shaft] = r[0].subjects as [ClipSubject];
    const doc = parseClipManifest(JSON.stringify(c.manifest));
    const all = targetPaneOutlines({ doc, marquee: null, draft: { dst: null, clipId: '' }, outcome: { kind: 'refused', stage: 'validate', refusals: r, warnings: [], text: '', command: '', judged: doc }, bakeRefused: null });
    const shaftRect = (c.manifest as { shafts: Array<{ dst_rect: { x: number; y: number; w: number; h: number } }> }).shafts[shaft.index].dst_rect;
    expect(outlineNamesAt(all, centre(shaftRect))).toEqual([`${r[0].rule}: shaft ${shaft.index} ${shaft.id}`]);
  });

  it('a pair on ONE rectangle (aeon\'s R10 pair with clip 1 moved onto clip 0, a plant) names BOTH subjects on hover, one line each', () => {
    const raw = JSON.parse(vendored('s2_two_clip')) as { clips: Array<{ id: string; dst_rect: { x: number; y: number; w: number; h: number } }> };
    raw.clips[1].dst_rect = raw.clips[0].dst_rect;
    const r = refusalsOf(VALIDATE.refuse_r10_pair);
    const outlines = refusedOn(r, parseClipManifest(JSON.stringify(raw)));
    expect(outlineNamesAt(outlines, centre(raw.clips[0].dst_rect)))
      .toEqual(r[0].subjects.map((s) => `${r[0].rule}: clip ${s.index} ${s.id}`));
  });

  it('a standing clip outline still names itself by its id alone (unchanged)', () => {
    const doc = parseClipManifest(vendored('s2_two_clip'));
    const all = targetPaneOutlines({ doc, marquee: null, draft: { dst: null, clipId: '' }, outcome: null, bakeRefused: null });
    expect(outlineNamesAt(all, centre(doc.clips[0].dst))).toEqual([doc.clips[0].id]);
  });
});
