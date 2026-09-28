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
import { SECTION_PIXEL_SIZE } from '../../src/core/model/s4-types';

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

  it('a shaft subject is looked up among the act\'s SHAFTS, never on a corridor at that index (s2_ehz_cpz has corridors and no shafts)', () => {
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

  // ROWS 232/233: aeon's REAL K8/K9 refusals on the woven act, placed on the manifest aeon
  // judged (each case's `manifest`, recorded by gen_validate_json.py). Row 233 (a), RULED:
  // a refused shaft is outlined at its dst_rect like a clip or corridor; one whose dst_rect
  // is not on the pane keeps "(not on this pane)"; the fill is never outlined.
  const judged = (k: string) => parseClipManifest(JSON.stringify(VALIDATE[k].manifest));
  type WovenRaw = { act: { grid_w: number; grid_h: number }; clips: Array<{ id: string; dst_rect: RawRect }>; shafts: Array<{ id: string; dst_rect: RawRect }> };
  const rawJudged = (k: string) => VALIDATE[k].manifest as WovenRaw;

  it('a real K9 pair (a clip and a shaft sharing an id): BOTH are outlined, the clip at its rectangle and the shaft at ITS dst_rect', () => {
    const k = 'refuse_k9_shaft_dup_clip_id';
    const r = refusalsOf('validate', VALIDATE[k]);
    const [clip, shaft] = r[0].subjects;
    expect([clip.kind, shaft.kind]).toEqual(['clip', 'shaft']);
    // Anti-vacuous: the shaft's index is ALSO a clip's index on this manifest, and that clip
    // carries the same id, so a lookup that ignored the kind would outline the clip twice;
    // and the two rectangles differ, so two outlines at one place cannot pass for this.
    const doc = judged(k);
    const raw = rawJudged(k);
    expect(doc.clips[shaft.index].id).toBe(shaft.id);
    expect(raw.shafts[shaft.index].dst_rect).not.toEqual(raw.clips[clip.index].dst_rect);
    const got = resolveRefusedSubjects(r, doc);
    expect(got.placed.map((p) => ({ rule: p.rule, subject: p.subject, rect: p.rect }))).toEqual([
      { rule: r[0].rule, subject: clip, rect: raw.clips[clip.index].dst_rect },
      { rule: r[0].rule, subject: shaft, rect: raw.shafts[shaft.index].dst_rect },
    ]);
    expect(got.offPane).toEqual([]);
    expect(subjectsLabelOnPane(r[0].subjects, doc)).toBe(`clip ${clip.index} ${clip.id} and shaft ${shaft.index} ${shaft.id}`);
  });

  it('a real K9 on one shaft (ledge pitch): the shaft is outlined at its dst_rect, tagged K9, and named plainly', () => {
    const k = 'refuse_k9_shaft_ledge_pitch';
    const r = refusalsOf('validate', VALIDATE[k]);
    const [shaft] = r[0].subjects;
    expect(r[0].subjects.map((s) => s.kind)).toEqual(['shaft']);
    const got = resolveRefusedSubjects(r, judged(k));
    expect({ placed: got.placed, offPane: got.offPane }).toEqual({
      placed: [{ rule: r[0].rule, subject: shaft, rect: rawJudged(k).shafts[shaft.index].dst_rect }], offPane: [],
    });
    expect(subjectsLabelOnPane(r[0].subjects, judged(k))).toBe(`shaft ${shaft.index} ${shaft.id}`);
  });

  it('a malformed shaft BEFORE the refused one does not shift it: shafts are indexed as aeon counts them', () => {
    // A plant on the manifest aeon judged: shafts[0] made a non-object (aeon would refuse it
    // first, but the pane must still read the file). The refused shaft keeps its own index.
    const k = 'refuse_k9_shaft_ledge_pitch';
    const r = refusalsOf('validate', VALIDATE[k]);
    const [shaft] = r[0].subjects;
    expect(shaft.index).toBeGreaterThan(0);
    const raw = structuredClone(rawJudged(k)) as unknown as { shafts: unknown[] };
    raw.shafts[0] = 'not a shaft';
    const got = resolveRefusedSubjects(r, parseClipManifest(JSON.stringify(raw)));
    expect(got.placed.map((p) => p.rect)).toEqual([rawJudged(k).shafts[shaft.index].dst_rect]);
  });

  it('a shaft whose dst_rect the pane cannot read is named off the pane, and the manifest still opens', () => {
    // A plant: the refused shaft's dst_rect removed (aeon's K9 "is missing 'dst_rect'").
    // A clip or corridor with no rectangle makes the manifest unreadable; a shaft never
    // did before row 233, and reading shafts must not start refusing such a file.
    const k = 'refuse_k9_shaft_ledge_pitch';
    const r = refusalsOf('validate', VALIDATE[k]);
    const raw = structuredClone(rawJudged(k)) as unknown as { shafts: Array<Record<string, unknown>> };
    delete raw.shafts[r[0].subjects[0].index].dst_rect;
    const doc = parseClipManifest(JSON.stringify(raw));
    expect(resolveRefusedSubjects(r, doc)).toEqual({ placed: [], offPane: [{ rule: r[0].rule, subject: r[0].subjects[0] }] });
  });

  it('a real K9 on a shaft wholly past the act: NOT outlined, named "(not on this pane)"', () => {
    const k = 'refuse_k9_shaft_past_act';
    const r = refusalsOf('validate', VALIDATE[k]);
    const [shaft] = r[0].subjects;
    expect(r[0].subjects.map((s) => s.kind)).toEqual(['shaft']);
    // Anti-vacuous: the shaft IS in the judged manifest at that index with that id (so a
    // lookup finds it), and its rectangle lies wholly outside the pane's world, which is
    // the act's grid in sections (DonorTargetPane's worldW x worldH).
    const doc = judged(k);
    const raw = rawJudged(k);
    const dst = raw.shafts[shaft.index].dst_rect;
    expect(raw.shafts[shaft.index].id).toBe(shaft.id);
    const paneW = raw.act.grid_w * SECTION_PIXEL_SIZE;
    const paneH = raw.act.grid_h * SECTION_PIXEL_SIZE;
    expect(dst.x >= paneW || dst.y >= paneH || dst.x + dst.w <= 0 || dst.y + dst.h <= 0).toBe(true);
    const got = resolveRefusedSubjects(r, doc);
    expect({ placed: got.placed, offPane: got.offPane }).toEqual({ placed: [], offPane: [{ rule: r[0].rule, subject: shaft }] });
    expect(subjectsLabelOnPane(r[0].subjects, doc)).toBe(`shaft ${shaft.index} ${shaft.id} (not on this pane)`);
  });

  // ROW 236 (b): every placed kind takes the shaft's overlap test. No vendored aeon case puts
  // a CLIP or CORRIDOR past the act (aeon's R8 / K2 "runs past the declared ... act"), so
  // these are PLANTS on the woven manifest aeon judged: one rectangle moved to x = grid_w x
  // SECTION_PIXEL_SIZE (the same move gen_validate_json.py's mut_k9_shaft_past_act makes for
  // shafts[2]), and the subject is the one aeon's `_subject_of` would name, read from that
  // manifest. Neither is claimed to be aeon output.
  type Placeable = { id: string; dst_rect: RawRect };
  function pastTheAct(kind: 'clips' | 'corridors', index: number, x: (paneW: number, r: RawRect) => number) {
    const raw = structuredClone(rawJudged('refuse_k9_shaft_past_act')) as WovenRaw & { corridors: Placeable[] };
    const entry = (raw[kind] as Placeable[])[index];
    const paneW = raw.act.grid_w * SECTION_PIXEL_SIZE;
    entry.dst_rect = { ...entry.dst_rect, x: x(paneW, entry.dst_rect) };
    const subject = { kind: kind === 'clips' ? 'clip' as const : 'corridor' as const, index, id: entry.id };
    return { doc: parseClipManifest(JSON.stringify(raw)), subject, dst: entry.dst_rect, paneW };
  }
  const refusalNaming = (subject: ClipNote['subjects'][number]): ClipNote[] =>
    [{ rule: subject.kind === 'clip' ? 'R8' : 'K2', subjects: [subject], message: '' } as ClipNote];

  for (const [kind, index] of [['clips', 3], ['corridors', 1]] as const) {
    it(`row 236 (b): a ${kind.slice(0, -1)} wholly past the act (a plant) is NOT outlined, named "(not on this pane)"`, () => {
      const { doc, subject, dst, paneW } = pastTheAct(kind, index, (w) => w);
      // Anti-vacuous: the manifest still opens, the rectangle is there at that index with
      // that id (so the lookup finds it), and it lies wholly outside the pane's world.
      expect((kind === 'clips' ? doc.clips : doc.corridors)[index]).toMatchObject({ id: subject.id, dst });
      expect(dst.x >= paneW).toBe(true);
      const r = refusalNaming(subject);
      expect(resolveRefusedSubjects(r, doc)).toEqual({ placed: [], offPane: [{ rule: r[0].rule, subject }] });
      expect(subjectsLabelOnPane([subject], doc)).toBe(`${subject.kind} ${index} ${subject.id} (not on this pane)`);
    });

    it(`row 236 (b): a ${kind.slice(0, -1)} only PARTLY past the act (a plant) is still outlined, where it is`, () => {
      // The test is overlap, not containment: the part on the pane is visible, so it is drawn.
      const { doc, subject, dst, paneW } = pastTheAct(kind, index, (w, r) => w - Math.min(r.w, SECTION_PIXEL_SIZE) / 2);
      expect(dst.x < paneW && dst.x + dst.w > paneW).toBe(true);
      const r = refusalNaming(subject);
      expect(resolveRefusedSubjects(r, doc)).toEqual({ placed: [{ rule: r[0].rule, subject, rect: dst }], offPane: [] });
    });
  }

  it('a real K8 (the fill) is still never outlined: named off the pane, not dropped', () => {
    const k = 'refuse_k8_fill_no_why';
    const r = refusalsOf('validate', VALIDATE[k]);
    expect(r[0].subjects.length).toBe(1);
    const got = resolveRefusedSubjects(r, judged(k));
    expect({ placed: got.placed, offPane: got.offPane }).toEqual({ placed: [], offPane: [{ rule: r[0].rule, subject: r[0].subjects[0] }] });
    expect(subjectsLabelOnPane(r[0].subjects, judged(k))).toBe(`${FILL_SUBJECT_LABEL} (not on this pane)`);
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
