/**
 * ROW 213 (b): which rectangles a refusal names, placed on the manifest the
 * target pane shows (src/core/formats/donors/refused-subjects.ts).
 *
 * Every refusal here is aeon's REAL output (test/fixtures/clips/aeon-outputs/:
 * validate-json.cases.json, bake-json.cases.json, paste-music.cases.json, each
 * with its .provenance.json and currency rows in clip-tool-outputs.test.ts),
 * and every manifest is one aeon judged or one vendored from aeon. Every
 * expected rectangle, rule and id is READ from them, never typed here.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseClipManifest } from '../../src/core/formats/donors/clip-manifest-doc';
import { FILL_SUBJECT_LABEL, readBakeJson, readValidateJson, type ClipNote } from '../../src/core/formats/donors/clip-validate-json';
import { resolveRefusedSubjects, subjectsLabelOnPane } from '../../src/core/formats/donors/refused-subjects';

const DIR = resolve(__dirname, '../fixtures/clips');
type Case = { exit: number; stdout: string; stderr: string; manifest?: unknown };
const load = (f: string) => JSON.parse(readFileSync(resolve(DIR, 'aeon-outputs', f), 'utf8')) as Record<string, Case>;
const VALIDATE = load('validate-json.cases.json');
const BAKE = load('bake-json.cases.json');
const MUSIC = load('paste-music.cases.json');
const vendored = (n: string) => readFileSync(resolve(DIR, `${n}.clips.json`), 'utf8');
type RawRect = { x: number; y: number; w: number; h: number };
const rawOf = (text: string) => JSON.parse(text) as { clips: Array<{ dst_rect: RawRect }>; corridors?: Array<{ dst_rect: RawRect }> };

function refusalsOf(tool: 'validate' | 'bake', c: Case): ClipNote[] {
  const v = tool === 'validate' ? readValidateJson(c.exit, c.stdout, c.stderr) : readBakeJson(c.exit, c.stdout, c.stderr);
  if (v.kind !== 'refused') throw new Error(`fixture is not a refusal: ${v.kind}`);
  return v.refusals;
}

describe('a refusal\'s subjects, placed on the pane\'s manifest', () => {
  it('one subject (R3 on the pasted clip): placed on the manifest aeon judged, at that clip\'s rectangle, tagged R3', () => {
    const c = MUSIC.refuse_r3_paste_pre222;
    const text = JSON.stringify(c.manifest);
    const r = refusalsOf('validate', c);
    const got = resolveRefusedSubjects(r, parseClipManifest(text));
    expect(got.placed.map((p) => ({ rule: p.rule, rect: p.rect }))).toEqual(
      r[0].subjects.map((s) => ({ rule: r[0].rule, rect: rawOf(text).clips[s.index].dst_rect })));
  });

  it('a pair rule (R10, two clips): BOTH subjects are placed, each at its own clip', () => {
    const r = refusalsOf('validate', VALIDATE.refuse_r10_pair);
    const text = vendored('s2_two_clip');
    const got = resolveRefusedSubjects(r, parseClipManifest(text));
    expect(r[0].subjects.length).toBe(2);
    expect(got.placed.map((p) => p.rect)).toEqual(r[0].subjects.map((s) => rawOf(text).clips[s.index].dst_rect));
  });

  it('a clip and a corridor (R10): the corridor subject is placed at the CORRIDOR\'s rectangle, not a clip\'s', () => {
    const r = refusalsOf('validate', VALIDATE.refuse_r10_clip_corridor);
    const text = vendored('s2_ehz_cpz');
    const corridor = r[0].subjects.find((s) => s.kind === 'corridor')!;
    const got = resolveRefusedSubjects(r, parseClipManifest(text));
    expect(got.placed.find((p) => p.subject.kind === 'corridor')?.rect).toEqual(rawOf(text).corridors![corridor.index].dst_rect);
  });

  it('a subject past the end of the pane\'s list (R3\'s pasted clip, against the act on disk) is OFF the pane, not dropped', () => {
    const r = refusalsOf('validate', MUSIC.refuse_r3_paste_pre222);
    const got = resolveRefusedSubjects(r, parseClipManifest(vendored('s2_ehz_cpz')));
    expect({ placed: got.placed.length, offPane: got.offPane.map((o) => o.subject) }).toEqual({ placed: 0, offPane: r[0].subjects });
  });

  it('a subject whose id names another rectangle at that index (C4 on ehz_cut vs s2_ehz_cpz\'s clip 0) is OFF the pane, never outlined', () => {
    const r = refusalsOf('bake', BAKE.refuse_c4_bake_own);
    const doc = parseClipManifest(vendored('s2_ehz_cpz'));
    // Anti-vacuous: the index IS on the pane, only the id differs.
    expect(doc.clips[r[0].subjects[0].index].id).not.toBe(r[0].subjects[0].id);
    const got = resolveRefusedSubjects(r, doc);
    expect({ placed: got.placed.length, offPane: got.offPane.length }).toEqual({ placed: 0, offPane: 1 });
  });

  it('a subject of a kind the pane does not draw (aeon\'s shaft, K9) is OFF the pane, never placed on a corridor at that index', () => {
    // aeon's real R10 clip+corridor answer with the corridor subject's kind read as aeon's
    // `shaft` (an R10 overlap can name a shaft, clip_manifest.py's `_subject_of`): same
    // index, so a lookup in the wrong list would land on s2_ehz_cpz's corridor 0.
    const r = refusalsOf('validate', VALIDATE.refuse_r10_clip_corridor).map((n) => ({
      ...n, subjects: n.subjects.map((s) => (s.kind === 'corridor' ? { ...s, kind: 'shaft' as const } : s)),
    }));
    const doc = parseClipManifest(vendored('s2_ehz_cpz'));
    const shaft = r[0].subjects.find((s) => s.kind === 'shaft')!;
    expect(doc.corridors[shaft.index]).toBeDefined();
    expect(resolveRefusedSubjects(r, doc).offPane.map((o) => o.subject)).toEqual([shaft]);
  });

  // ROW 232: aeon's REAL K8/K9 refusals on the woven act, placed on the manifest aeon
  // judged (each case's `manifest`, recorded by gen_validate_json.py).
  const judged = (k: string) => parseClipManifest(JSON.stringify(VALIDATE[k].manifest));

  it('a real K9 pair (a clip and a shaft sharing an id): the CLIP is outlined at its own rectangle, the shaft is named off the pane', () => {
    const k = 'refuse_k9_shaft_dup_clip_id';
    const r = refusalsOf('validate', VALIDATE[k]);
    const [clip, shaft] = r[0].subjects;
    expect([clip.kind, shaft.kind]).toEqual(['clip', 'shaft']);
    // Anti-vacuous: the shaft's index is ALSO a clip's index on this manifest, and that clip
    // carries the same id, so a lookup that ignored the kind would outline the clip twice.
    const doc = judged(k);
    expect(doc.clips[shaft.index].id).toBe(shaft.id);
    const got = resolveRefusedSubjects(r, doc);
    const raw = VALIDATE[k].manifest as { clips: Array<{ dst_rect: RawRect }> };
    expect(got.placed.map((p) => ({ rule: p.rule, subject: p.subject, rect: p.rect })))
      .toEqual([{ rule: r[0].rule, subject: clip, rect: raw.clips[clip.index].dst_rect }]);
    expect(got.offPane).toEqual([{ rule: r[0].rule, subject: shaft }]);
    expect(subjectsLabelOnPane(r[0].subjects, doc)).toBe(`clip ${clip.index} ${clip.id} and shaft ${shaft.index} ${shaft.id} (not on this pane)`);
  });

  it('a real K9 (one shaft) and a real K8 (the fill): nothing outlined, each subject named off the pane, none dropped', () => {
    for (const k of ['refuse_k9_shaft_ledge_pitch', 'refuse_k8_fill_no_why']) {
      const r = refusalsOf('validate', VALIDATE[k]);
      expect(r[0].subjects.length, k).toBe(1);
      const got = resolveRefusedSubjects(r, judged(k));
      expect({ placed: got.placed, offPane: got.offPane }, k).toEqual({ placed: [], offPane: [{ rule: r[0].rule, subject: r[0].subjects[0] }] });
    }
    const fill = refusalsOf('validate', VALIDATE.refuse_k8_fill_no_why)[0];
    expect(subjectsLabelOnPane(fill.subjects, judged('refuse_k8_fill_no_why'))).toBe(`${FILL_SUBJECT_LABEL} (not on this pane)`);
  });

  it('an act-level refusal (C3, no subjects) places nothing and names nothing off the pane', () => {
    const r = refusalsOf('bake', BAKE.refuse_c3_act_level);
    expect(r[0].subjects).toEqual([]);
    expect(resolveRefusedSubjects(r, parseClipManifest(vendored('s2_ehz_cpz')))).toEqual({ placed: [], offPane: [] });
  });

  it('the refusal text names an off-pane subject "not on this pane", and a placed one plainly', () => {
    const off = refusalsOf('validate', MUSIC.refuse_r3_paste_pre222)[0];
    const on = refusalsOf('validate', VALIDATE.refuse_r10_pair)[0];
    expect({
      off: subjectsLabelOnPane(off.subjects, parseClipManifest(vendored('s2_ehz_cpz'))),
      on: subjectsLabelOnPane(on.subjects, parseClipManifest(vendored('s2_two_clip'))),
    }).toEqual({
      off: `clip ${off.subjects[0].index} ${off.subjects[0].id} (not on this pane)`,
      on: on.subjects.map((s) => `clip ${s.index} ${s.id}`).join(' and '),
    });
  });
});
