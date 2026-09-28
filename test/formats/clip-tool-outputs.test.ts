/**
 * The donor page's readers of aeon's two row-213 answers, held against aeon's
 * OWN outputs (test/fixtures/clips/aeon-outputs/, each with its .provenance.json):
 *
 *   * `clipact.json` pool rows (clipact-pool.ts): every expected number and
 *     every expected field name is READ from a clipact.json aeon's bake wrote,
 *     never typed here. Absent rows are `unavailable`, never 0.
 *   * `validate --json` (clip-validate-json.ts): accepted, refused and CRASHED
 *     are three answers, and the crash (exit 1, no JSON) is never a refusal.
 *     The expected rule and subjects are read from aeon's own stdout, and the
 *     crash cases are aeon's real tracebacks.
 *   * `bake --json` (the same reader, row 213 open item (a)): aeon states the
 *     document is validate's shape; these rows hold that claim on aeon's real
 *     bake answers (loader refusals through the bake, the bake's own C4/C3, an
 *     untagged refusal, two acceptances, two crashes), and hold the bake to its
 *     OWN schema constant.
 *
 * Currency rows pin each fixture's bytes to its marker's sha256, and the tool
 * that produced it by blob at aeon origin/master (through git objects, never
 * the working tree), so a change in aeon's contract is named here, not
 * discovered on the page.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { POOL_ROW_FIELDS, readPoolRows } from '../../src/core/formats/donors/clipact-pool';
import { clipToolArgv } from '../../src/main/clip-tool';
import {
  BAKE_JSON_SCHEMA, FILL_SUBJECT_LABEL, readBakeJson, readValidateJson, subjectsLabel, VALIDATE_JSON_SCHEMA,
} from '../../src/core/formats/donors/clip-validate-json';
import { peerRepo, resolveRev, readAtRev } from '../support/peer-repo';

const DIR = resolve(__dirname, '../fixtures/clips/aeon-outputs');
const clipact = (name: string) => JSON.parse(readFileSync(resolve(DIR, `${name}.clipact.json`), 'utf8')) as {
  pool: Record<string, unknown> & { per_clip: Record<string, unknown>[]; per_corridor: Record<string, unknown>[]; per_clip_fields: Record<string, string>; tiles: number; pages: number };
  clips: { id: string }[]; corridors: { id: string }[];
};
const CASES = JSON.parse(readFileSync(resolve(DIR, 'validate-json.cases.json'), 'utf8')) as Record<string, { exit: number; stdout: string; stderr: string }>;
interface Marker {
  aeon: { revision: string; tool_path: string; tool_blob: string; re_measure: string; inputs?: { path: string; blob: string }[] };
  fixture: { path: string; sha256: string; command: string };
  generator?: { path: string };
}
const BAKE_CASES = JSON.parse(readFileSync(resolve(DIR, 'bake-json.cases.json'), 'utf8')) as Record<string, { exit: number; stdout: string; stderr: string; argv: string[] }>;
const MARKERS = ['s2_ehz_cpz.clipact', 's2_two_clip.clipact', 's2_woven.clipact', 'validate-json.cases', 'paste-music.cases', 'bake-json.cases'].map((stem) =>
  JSON.parse(readFileSync(resolve(DIR, `${stem}.provenance.json`), 'utf8')) as Marker);
const REAL = ['s2_ehz_cpz', 's2_two_clip'];

describe('pool rows: read from a clipact.json aeon\'s bake wrote', () => {
  for (const name of REAL) {
    it(`${name}: the rows come back exactly as aeon wrote them, field for field, under the file's own per_clip_fields`, () => {
      const raw = clipact(name);
      const got = readPoolRows(raw as unknown as Record<string, unknown>);
      expect(got.state, got.state === 'unavailable' ? got.why : '').toBe('present');
      if (got.state !== 'present') return;
      // The field set the page reads is the one the FILE defines: every row aeon
      // wrote carries exactly the keys of its per_clip_fields.
      const defined = Object.keys(raw.pool.per_clip_fields).sort();
      for (const r of [...raw.pool.per_clip, ...raw.pool.per_corridor]) expect(Object.keys(r).sort()).toEqual(defined);
      expect([...POOL_ROW_FIELDS].sort()).toEqual(defined);
      expect(got.perClip).toEqual(raw.pool.per_clip);
      expect(got.perCorridor).toEqual(raw.pool.per_corridor);
      expect(got.fields).toEqual(raw.pool.per_clip_fields);
      expect(got.perClip.map((r) => r.id)).toEqual(raw.clips.map((c) => c.id));
      expect(got.perCorridor.map((r) => r.id)).toEqual(raw.corridors.map((c) => c.id));
    });

    it(`${name}: aeon's stated invariants hold on its own file, and the reader reports none broken`, () => {
      const raw = clipact(name);
      const rows = [...raw.pool.per_clip, ...raw.pool.per_corridor] as unknown as { tiles_added: number; pages_exclusive: number }[];
      expect(rows.reduce((a, r) => a + r.tiles_added, 0) + 1).toBe(raw.pool.tiles);
      expect(rows.reduce((a, r) => a + r.pages_exclusive, 0)).toBeLessThanOrEqual(raw.pool.pages);
      const got = readPoolRows(raw as unknown as Record<string, unknown>);
      expect(got.state === 'present' && got.broken).toEqual([]);
    });
  }

  it('s2_ehz_cpz shares a page, so pages_touched sums PAST pool.pages: the reason the page never totals that column', () => {
    const raw = clipact('s2_ehz_cpz');
    const touched = [...raw.pool.per_clip, ...raw.pool.per_corridor].reduce((a, r) => a + (r.pages_touched as number), 0);
    expect(touched).toBeGreaterThan(raw.pool.pages);
  });

  it('s2_two_clip has no corridor: per_corridor is an EMPTY list, which reads as present with no rows, not as unavailable', () => {
    const raw = clipact('s2_two_clip');
    expect(raw.pool.per_corridor).toEqual([]);
    const got = readPoolRows(raw as unknown as Record<string, unknown>);
    expect(got.state).toBe('present');
    expect(got.state === 'present' && got.perCorridor).toEqual([]);
  });
});

/**
 * ROW 229. aeon's bake (tools/clip_act_bake.py since d796ad94) writes
 * `pool.per_shaft` (index-aligned with the file's `shafts`) and `pool.per_fill`
 * (one row for the file's `fill`) when the act has them, and states its tile
 * invariant over per_clip, per_corridor, per_shaft AND per_fill. The woven act is
 * aeon's real output with both; every expected number is read from it.
 */
describe('pool rows on a woven act: shafts and fill are read, and the tile sum counts every list shown', () => {
  type Row = { id: string; index: number; tiles: number; tiles_added: number; pages_touched: number; pages_exclusive: number };
  const woven = () => clipact('s2_woven') as unknown as {
    pool: Record<string, unknown> & { per_clip: Row[]; per_corridor: Row[]; per_shaft: Row[]; per_fill: Row[]; tiles: number; pages: number };
    clips: { id: string }[]; corridors: { id: string }[]; shafts: { id: string }[]; fill: Record<string, unknown>;
  };
  const LISTS = ['per_clip', 'per_corridor', 'per_shaft', 'per_fill'] as const;
  const addedPlusBlank = (raw: ReturnType<typeof woven>) =>
    LISTS.reduce((a, k) => a + raw.pool[k].reduce((b, r) => b + r.tiles_added, 0), 0) + 1;

  it('the fixture is not vacuous: it carries shaft and fill rows, and the shafts add tiles the two-list sum would miss', () => {
    const raw = woven();
    expect(raw.pool.per_shaft.length).toBeGreaterThan(0);
    expect(raw.pool.per_fill.length).toBe(1);
    expect(raw.pool.per_shaft.reduce((a, r) => a + r.tiles_added, 0)).toBeGreaterThan(0);
    expect(addedPlusBlank(raw)).toBe(raw.pool.tiles);
  });

  it('s2_woven: all four sections come back exactly as aeon wrote them', () => {
    const raw = woven();
    const got = readPoolRows(raw as unknown as Record<string, unknown>);
    expect(got.state, got.state === 'unavailable' ? got.why : '').toBe('present');
    if (got.state !== 'present') return;
    expect({ perClip: got.perClip, perCorridor: got.perCorridor, perShaft: got.perShaft, perFill: got.perFill })
      .toEqual({ perClip: raw.pool.per_clip, perCorridor: raw.pool.per_corridor, perShaft: raw.pool.per_shaft, perFill: raw.pool.per_fill });
  });

  it('s2_woven: the shaft rows line up with the file\'s own shafts, by id and index', () => {
    const raw = woven();
    const got = readPoolRows(raw as unknown as Record<string, unknown>);
    expect(got.state === 'present' && got.perShaft.map((r) => [r.id, r.index])).toEqual(raw.shafts.map((s, i) => [s.id, i]));
  });

  it('s2_woven: aeon\'s tile sum over all four lists holds, and the reader says so and reports nothing broken', () => {
    const raw = woven();
    const got = readPoolRows(raw as unknown as Record<string, unknown>);
    expect(got.state === 'present' && { tilesSum: got.tilesSum, broken: got.broken, unshown: got.unshown })
      .toEqual({ tilesSum: { state: 'holds', total: raw.pool.tiles }, broken: [], unshown: [] });
  });

  it('a planted pool list the page does not read is NAMED, and the tile sum reads "cannot check", never a mismatch', () => {
    const raw = woven();
    raw.pool.per_zzz = [{ ...raw.pool.per_shaft[0], id: 'zzz', index: 0, tiles_added: 5 }];
    const got = readPoolRows(raw as unknown as Record<string, unknown>);
    expect(got.state === 'present' && { unshown: got.unshown, tilesSum: got.tilesSum.state, broken: got.broken })
      .toEqual({ unshown: ['per_zzz'], tilesSum: 'cannot-check', broken: [] });
  });

  it('a planted change to a shaft row\'s tiles_added is a genuine mismatch, stated over all four lists', () => {
    const raw = woven();
    raw.pool.per_shaft[0].tiles_added += 1;
    const got = readPoolRows(raw as unknown as Record<string, unknown>);
    expect(got.state === 'present' && got.broken)
      .toContain(`the rows' added tiles plus the blank make ${addedPlusBlank(raw)}, but pool.tiles is ${raw.pool.tiles}`);
  });
});

describe('pool rows: absent or unreadable is UNAVAILABLE, never 0', () => {
  /** aeon's own before/after proof: the pre-1d9afb25 file is the new one minus exactly these three keys. */
  function older(name: string): Record<string, unknown> {
    const raw = clipact(name) as unknown as { pool: Record<string, unknown> };
    delete raw.pool.per_clip;
    delete raw.pool.per_corridor;
    delete raw.pool.per_clip_fields;
    return raw as unknown as Record<string, unknown>;
  }

  it('a clipact.json from an aeon without per_clip is unavailable, says why, and carries no numbers', () => {
    const got = readPoolRows(older('s2_ehz_cpz'));
    expect(got).toEqual({ state: 'unavailable', why: expect.stringMatching(/no pool\.per_clip/) });
  });

  it('a per_clip_fields that no longer defines a field the page reads is unavailable, naming the field', () => {
    const raw = clipact('s2_ehz_cpz');
    delete raw.pool.per_clip_fields.pages_exclusive;
    const got = readPoolRows(raw as unknown as Record<string, unknown>);
    expect(got.state).toBe('unavailable');
    expect(got.state === 'unavailable' && got.why).toMatch(/pages_exclusive/);
  });

  it('rows that do not line up with the file\'s own clips are unavailable, not shown against the wrong clip', () => {
    const raw = clipact('s2_ehz_cpz');
    raw.pool.per_clip.reverse();
    const got = readPoolRows(raw as unknown as Record<string, unknown>);
    expect(got.state).toBe('unavailable');
    expect(got.state === 'unavailable' && got.why).toMatch(/line up/);
  });

  it('a row missing a count is unavailable, not a 0', () => {
    const raw = clipact('s2_ehz_cpz');
    delete raw.pool.per_clip[0].pages_touched;
    const got = readPoolRows(raw as unknown as Record<string, unknown>);
    expect(got.state).toBe('unavailable');
    expect(got.state === 'unavailable' && got.why).toMatch(/pages_touched/);
  });

  it('a file whose rows break aeon\'s tile sum is still shown, with the broken invariant named', () => {
    const raw = clipact('s2_ehz_cpz');
    (raw.pool.per_clip[1] as { tiles_added: number }).tiles_added -= 1;
    const got = readPoolRows(raw as unknown as Record<string, unknown>);
    expect(got.state).toBe('present');
    expect(got.state === 'present' && got.broken.join('\n')).toMatch(/pool\.tiles is/);
  });
});

describe('validate --json: accepted, refused and CRASHED are three answers', () => {
  const refusalCases = Object.keys(CASES).filter((k) => k.startsWith('refuse_'));
  const acceptCases = Object.keys(CASES).filter((k) => k.startsWith('accept_'));
  const crashCases = Object.keys(CASES).filter((k) => k.startsWith('crash_'));

  it('the vendored set holds every kind (so no row below is vacuous)', () => {
    expect(refusalCases.length).toBeGreaterThanOrEqual(5);
    expect(acceptCases.length).toBeGreaterThanOrEqual(2);
    expect(crashCases.length).toBe(2);
  });

  for (const k of refusalCases) {
    it(`${k}: a REFUSAL, carrying aeon's rule, subjects, message and warnings as aeon printed them`, () => {
      const c = CASES[k];
      const doc = JSON.parse(c.stdout);
      expect(c.exit).toBe(1);
      expect(doc.schema).toBe(VALIDATE_JSON_SCHEMA);
      const v = readValidateJson(c.exit, c.stdout, c.stderr);
      expect(v.kind).toBe('refused');
      if (v.kind !== 'refused') return;
      expect(v.refusals).toEqual(doc.refusals);
      expect(v.warnings).toEqual(doc.warnings);
    });
  }

  for (const k of acceptCases) {
    it(`${k}: ACCEPTED, with aeon's warnings as aeon printed them`, () => {
      const c = CASES[k];
      const doc = JSON.parse(c.stdout);
      expect(c.exit).toBe(0);
      const v = readValidateJson(c.exit, c.stdout, c.stderr);
      expect(v).toEqual({ kind: 'accepted', warnings: doc.warnings });
    });
  }

  // ROADMAP row 219 (b): until then both acceptances carried W3, so "accepted with
  // nothing to say" was never aeon's answer here. Which cases are warning-free is read
  // from aeon's own stdout, never from a case name.
  it('an acceptance aeon answers with NO warning reads as accepted with an empty warning list, not as a crash or a refusal', () => {
    const quiet = acceptCases.filter((k) => (JSON.parse(CASES[k].stdout) as { warnings: unknown[] }).warnings.length === 0);
    const noisy = acceptCases.filter((k) => !quiet.includes(k));
    expect(quiet, 'the vendored set holds no warning-free acceptance').not.toEqual([]);
    expect(noisy, 'the vendored set holds no acceptance WITH a warning, so this row would not tell the two apart').not.toEqual([]);
    for (const k of quiet) {
      expect(CASES[k].exit, k).toBe(0);
      expect(readValidateJson(CASES[k].exit, CASES[k].stdout, CASES[k].stderr), k).toEqual({ kind: 'accepted', warnings: [] });
    }
  });

  for (const k of crashCases) {
    it(`${k}: exit 1 with NO JSON is a CRASH carrying aeon's traceback, never a refusal`, () => {
      const c = CASES[k];
      expect(c.exit).toBe(1);
      expect(c.stdout.trim()).toBe('');
      expect(c.stderr).toMatch(/Traceback/);
      const v = readValidateJson(c.exit, c.stdout, c.stderr);
      expect(v.kind).toBe('crashed');
      expect(v.kind === 'crashed' && v.stderr).toBe(c.stderr);
      expect(v.kind === 'crashed' && v.why).toMatch(/NOT judged/);
    });
  }

  it('the pair rules name BOTH subjects, first claimant first, clip and corridor kinds kept apart', () => {
    for (const k of ['refuse_r10_pair', 'refuse_r10_clip_corridor']) {
      const c = CASES[k];
      const doc = JSON.parse(c.stdout);
      const v = readValidateJson(c.exit, c.stdout, c.stderr);
      expect(v.kind === 'refused' && v.refusals[0].subjects).toEqual(doc.refusals[0].subjects);
      expect(doc.refusals[0].subjects.length).toBe(2);
    }
    const cc = JSON.parse(CASES.refuse_r10_clip_corridor.stdout).refusals[0].subjects as { kind: string }[];
    expect(cc.map((s) => s.kind)).toEqual(['clip', 'corridor']);
  });

  it('an untagged refusal (rule null, no subjects) reads as about the act as a whole', () => {
    const c = CASES.refuse_untagged_top_list;
    const v = readValidateJson(c.exit, c.stdout, c.stderr);
    expect(v.kind).toBe('refused');
    if (v.kind !== 'refused') return;
    expect(v.refusals[0].rule).toBeNull();
    expect(subjectsLabel(v.refusals[0].subjects)).toBe('the act as a whole');
  });

  it('what the reader cannot hold to aeon\'s contract is a crash, not a verdict', () => {
    const ok = CASES.accept_s2_ehz_cpz;
    const no = CASES.refuse_r7;
    // An exit code that disagrees with `ok`, in both directions.
    expect(readValidateJson(1, ok.stdout, '').kind).toBe('crashed');
    expect(readValidateJson(0, no.stdout, '').kind).toBe('crashed');
    // A schema this reader does not know.
    const bumped = JSON.stringify({ ...JSON.parse(ok.stdout), schema: VALIDATE_JSON_SCHEMA + 1 });
    expect(readValidateJson(0, bumped, '').kind).toBe('crashed');
    // Exit 0 with no JSON (an aeon without --json would not get here, but a human-mode line would).
    expect(readValidateJson(0, 'clips.json OK', '').kind).toBe('crashed');
    // Killed or timed out.
    expect(readValidateJson(null, '', '').kind).toBe('crashed');
    // An aeon that predates --json: exit 1 and its usage text, not JSON.
    expect(readValidateJson(1, "ERROR: unknown argument '--json'\nUsage: ...\n", '').kind).toBe('crashed');
  });
});

/**
 * ROW 232. aeon names a K9 refusal's subject `shaft` and a K8 refusal's `fill`
 * (clip_manifest.py's `subject()`; census in clip-validate-json.ts's header).
 * Before row 232 the reader took only clip/corridor, so these REAL refusals on
 * the woven act read as "aeon crashed". Every expectation is read from aeon's
 * own stdout in validate-json.cases.json (the three s2_woven cases).
 */
describe('validate --json on a woven act: shaft and fill refusals are REFUSALS, not crashes', () => {
  type Doc = { refusals: { rule: string | null; subjects: { kind: string; index: number; id: string | null }[]; message: string }[] };
  const doc = (k: string) => JSON.parse(CASES[k].stdout) as Doc;
  const K8 = 'refuse_k8_fill_no_why';
  const K9 = 'refuse_k9_shaft_ledge_pitch';
  const K9_PAIR = 'refuse_k9_shaft_dup_clip_id';

  it('the vendored cases are what they claim: aeon tagged them K8 and K9, and named a fill and a shaft (so no row below is vacuous)', () => {
    expect(doc(K8).refusals.map((r) => [r.rule, r.subjects.map((s) => s.kind)])).toEqual([['K8', ['fill']]]);
    expect(doc(K9).refusals.map((r) => [r.rule, r.subjects.map((s) => s.kind)])).toEqual([['K9', ['shaft']]]);
    expect(doc(K9_PAIR).refusals.map((r) => [r.rule, r.subjects.map((s) => s.kind)])).toEqual([['K9', ['clip', 'shaft']]]);
  });

  for (const k of [K8, K9, K9_PAIR]) {
    it(`${k}: REFUSED under aeon's rule, with aeon's subjects, never "crashed"`, () => {
      const c = CASES[k];
      const v = readValidateJson(c.exit, c.stdout, c.stderr);
      expect(v.kind === 'crashed' ? v.why : v.kind).toBe('refused');
      if (v.kind !== 'refused') return;
      expect(v.refusals.map((r) => r.rule)).toEqual(doc(k).refusals.map((r) => r.rule));
      expect(v.refusals[0].subjects).toEqual(doc(k).refusals[0].subjects);
    });
  }

  it('a person reads the shaft by kind, index and id, the clip beside it the same way, and the fill as the act\'s fill', () => {
    const label = (k: string) => {
      const v = readValidateJson(CASES[k].exit, CASES[k].stdout, CASES[k].stderr);
      return v.kind === 'refused' ? subjectsLabel(v.refusals[0].subjects) : `(${v.kind})`;
    };
    const plain = (s: { kind: string; index: number; id: string | null }) => `${s.kind} ${s.index} ${s.id}`;
    expect(label(K9)).toBe(plain(doc(K9).refusals[0].subjects[0]));
    expect(label(K9_PAIR)).toBe(doc(K9_PAIR).refusals[0].subjects.map(plain).join(' and '));
    // aeon's fill subject is always index 0, id null; its label carries neither.
    expect(doc(K8).refusals[0].subjects).toEqual([{ kind: 'fill', index: 0, id: null }]);
    expect(label(K8)).toBe(FILL_SUBJECT_LABEL);
  });

  it('a subject kind aeon does not emit is still a CRASH, and the crash names the kind', () => {
    const planted = CASES[K9].stdout.replace('"kind": "shaft"', '"kind": "tunnel"');
    expect(planted).not.toBe(CASES[K9].stdout);
    const v = readValidateJson(1, planted, '');
    expect(v.kind).toBe('crashed');
    expect(v.kind === 'crashed' && v.why).toMatch(/kind is "tunnel"/);
  });

  it('a fill subject that is not aeon\'s one fill (index 0, id null) is a CRASH, not a second fill', () => {
    for (const [from, to] of [['"index": 0', '"index": 1'], ['"id": null', '"id": "fill_b"']]) {
      const planted = CASES[K8].stdout.replace(/"refusals": \[[\s\S]*?\]\s*\}\s*\]/, (m) => m.replace(from, to));
      expect(planted).not.toBe(CASES[K8].stdout);
      const v = readValidateJson(1, planted, '');
      expect(v.kind === 'crashed' && v.why, `${from} -> ${to}`).toMatch(/fill subject is/);
    }
  });
});

describe('bake --json: the same three answers, from aeon\'s real bake', () => {
  const refusalCases = Object.keys(BAKE_CASES).filter((k) => k.startsWith('refuse_'));
  const acceptCases = Object.keys(BAKE_CASES).filter((k) => k.startsWith('accept_'));
  const crashCases = Object.keys(BAKE_CASES).filter((k) => k.startsWith('crash_'));
  const doc = (k: string) => JSON.parse(BAKE_CASES[k].stdout) as {
    schema: number; ok: boolean; refusals: { rule: string | null; subjects: { kind: string; index: number; id: string | null }[]; message: string }[]; warnings: unknown[];
  };

  it('the vendored set holds every kind, incl. a refusal the BAKE raises itself and an untagged one (so no row below is vacuous)', () => {
    expect(refusalCases.length).toBeGreaterThanOrEqual(5);
    expect(acceptCases.length).toBeGreaterThanOrEqual(2);
    expect(crashCases.length).toBe(2);
    const rules = refusalCases.map((k) => doc(k).refusals[0].rule);
    expect(rules.some((r) => r !== null && /^C\d$/.test(r))).toBe(true);
    expect(rules).toContain(null);
  });

  it('every case ran with Aurora\'s own bake argv (src/main/clip-tool.ts), bar the one that adds aeon\'s --expect-worst', () => {
    const aurora = clipToolArgv('bake', '/p', '<path>', '<dir>').slice(2);
    for (const [k, c] of Object.entries(BAKE_CASES)) {
      if (k === 'refuse_untagged_expect_worst') {
        expect(c.argv.filter((a) => !aurora.includes(a))).toEqual(['--expect-worst', expect.stringMatching(/^\d+$/)]);
      } else expect(c.argv, k).toEqual(aurora);
    }
  });

  for (const k of refusalCases) {
    it(`${k}: a REFUSAL, carrying aeon's rule, subjects, message and warnings as the bake printed them`, () => {
      const c = BAKE_CASES[k];
      expect(c.exit).toBe(1);
      expect(doc(k).schema).toBe(BAKE_JSON_SCHEMA);
      const v = readBakeJson(c.exit, c.stdout, c.stderr);
      expect(v.kind).toBe('refused');
      if (v.kind !== 'refused') return;
      expect(v.refusals).toEqual(doc(k).refusals);
      expect(v.warnings).toEqual(doc(k).warnings);
    });
  }

  for (const k of acceptCases) {
    it(`${k}: ACCEPTED, with the bake's warnings as it printed them`, () => {
      const c = BAKE_CASES[k];
      expect(c.exit).toBe(0);
      expect(doc(k).warnings.length).toBeGreaterThan(0);
      expect(readBakeJson(c.exit, c.stdout, c.stderr)).toEqual({ kind: 'accepted', warnings: doc(k).warnings });
    });
  }

  for (const k of crashCases) {
    it(`${k}: exit 1 with NO JSON is a CRASH of the bake carrying aeon's traceback, never a refusal`, () => {
      const c = BAKE_CASES[k];
      expect(c.exit).toBe(1);
      expect(c.stdout.trim()).toBe('');
      expect(c.stderr).toMatch(/Traceback/);
      const v = readBakeJson(c.exit, c.stdout, c.stderr);
      expect(v.kind).toBe('crashed');
      expect(v.kind === 'crashed' && v.stderr).toBe(c.stderr);
      expect(v.kind === 'crashed' && v.why).toMatch(/aeon's bake exited 1 and printed no JSON.*NOT judged/);
    });
  }

  // C4, not C1: aeon retired C1 ("the clip severs a crossover") with the painted marks
  // (a974bc2e, LINES-EVERYWHERE); C4 (a clip carrying reserved bits 15:14) is the bake's
  // own clip-naming refusal now. ROADMAP rows 223+224.
  it('the bake\'s own refusals: C4 names the clip carrying a retired mark, C3 and the untagged one are about the act as a whole', () => {
    const c4 = readBakeJson(1, BAKE_CASES.refuse_c4_bake_own.stdout, '');
    const d4 = doc('refuse_c4_bake_own').refusals[0];
    expect(d4.rule).toBe('C4');
    expect(d4.subjects.length).toBe(1);
    expect(c4.kind === 'refused' && subjectsLabel(c4.refusals[0].subjects)).toBe(`clip ${d4.subjects[0].index} ${d4.subjects[0].id}`);
    for (const k of ['refuse_c3_act_level', 'refuse_untagged_expect_worst']) {
      const v = readBakeJson(1, BAKE_CASES[k].stdout, '');
      expect(doc(k).refusals[0].subjects).toEqual([]);
      expect(v.kind === 'refused' && subjectsLabel(v.refusals[0].subjects)).toBe('the act as a whole');
    }
  });

  it('a loader refusal through the bake is the loader\'s own record (the shared refusal_record)', () => {
    // R7 on s2_two_clip is what validate-json.cases.json's refuse_r7 also trips; the
    // two mutations halve and set w to 1024, the same value on this fixture.
    expect(doc('refuse_r7').refusals).toEqual(JSON.parse(CASES.refuse_r7.stdout).refusals);
  });

  it('what the reader cannot hold to the bake\'s contract is a crash, not a verdict', () => {
    const ok = BAKE_CASES.accept_s2_ehz_cpz;
    const no = BAKE_CASES.refuse_c4_bake_own;
    expect(readBakeJson(1, ok.stdout, '').kind).toBe('crashed');
    expect(readBakeJson(0, no.stdout, '').kind).toBe('crashed');
    const bumped = JSON.stringify({ ...JSON.parse(ok.stdout), schema: BAKE_JSON_SCHEMA + 1 });
    expect(readBakeJson(0, bumped, '').kind).toBe('crashed');
    // The human mode's last line, with exit 0: an aeon without bake --json would not say this, but it is not JSON.
    expect(readBakeJson(0, 'clip act baked: 872 pool tiles in 14 pages', '').kind).toBe('crashed');
    expect(readBakeJson(null, '', '').kind).toBe('crashed');
    // An aeon that predates bake --json (71ae3433): exit 1 and its usage text.
    expect(readBakeJson(1, "ERROR: unknown argument '--json'\nUsage: ...\n", '').kind).toBe('crashed');
    // A refusal entry without subjects: malformed, so a crash.
    const noSubjects = JSON.parse(no.stdout);
    delete noSubjects.refusals[0].subjects;
    expect(readBakeJson(1, JSON.stringify(noSubjects), '').kind).toBe('crashed');
  });
});

describe('CURRENCY: the tools that produced these fixtures, at aeon origin/master', () => {
  for (const m of MARKERS) {
    it(`${m.fixture.path}: its bytes are the ones the marker hashed`, () => {
      const got = createHash('sha256').update(readFileSync(resolve(__dirname, '../..', m.fixture.path))).digest('hex');
      expect(got).toBe(m.fixture.sha256);
    });

    it(`${m.fixture.path}: ${m.aeon.tool_path} at aeon origin/master is the blob it was captured from`, (ctx) => {
      expect(m.aeon.tool_blob).toMatch(/^[0-9a-f]{40}$/);
      const aeon = peerRepo('aeon');
      if (aeon === null) {
        ctx.skip(`SKIPPED, NOT PASSED: no aeon checkout beside this repo (set AEON_DIR); CANNOT MEASURE whether ${m.aeon.tool_path} is still blob ${m.aeon.tool_blob}`);
        return;
      }
      const tip = resolveRev(aeon, 'origin/master');
      if (tip === null) {
        ctx.skip(`SKIPPED, NOT PASSED: origin/master does not resolve in ${aeon}; CANNOT MEASURE ${m.aeon.tool_path}'s currency`);
        return;
      }
      const at = readAtRev(aeon, tip, m.aeon.tool_path);
      expect(at.ok, at.ok ? '' : at.why).toBe(true);
      if (!at.ok) return;
      process.stdout.write(`clip-tool-outputs currency: ${m.aeon.tool_path} at aeon origin/master ${tip} is blob ${at.blob}; pinned ${m.aeon.tool_blob}\n`);
      expect(at.blob, 'NOT AN AURORA REGRESSION: aeon\'s clip tool moved since this output was captured.\n'
        + `  pinned ${m.aeon.tool_blob} (aeon ${m.aeon.revision}); origin/master ${tip} has ${at.blob}\n  Re-measure: ${m.aeon.re_measure}`)
        .toBe(m.aeon.tool_blob);
    });
  }
});

/**
 * ⚠ THE TOOL IS NOT THE ONLY THING AN OUTPUT DEPENDS ON. Until ROADMAP row 218
 * the row above pinned tool_path alone, so when aeon changed the clips.json a
 * bake reads and left clip_act_bake.py alone, s2_ehz_cpz.clipact.json went
 * semantically stale (a 7-section act vendored against an 8-section one) with
 * every row here green. So each marker also names its INPUTS, and two rows hold
 * them: the documents the recorded command reads must all be pinned (derived
 * from the command and the generator's own source, never typed here), and each
 * pinned input must still be that blob at aeon origin/master.
 */
describe('CURRENCY: the INPUTS those tools read, at aeon origin/master', () => {
  /** Every aeon clip manifest a marker's recorded run reads, derived from its command and its generator's source. */
  function namedInputs(m: Marker): string[] {
    const found = new Set<string>();
    for (const p of m.fixture.command.match(/games\/sonic4\/data\/clips\/[a-z0-9_]+\/clips\.json/g) ?? []) found.add(p);
    if (m.generator) {
      const src = readFileSync(resolve(__dirname, '../..', m.generator.path), 'utf8');
      const tmpl = /open\(f"([^"{]+)\{n\}\/clips\.json"\)/.exec(src);
      expect(tmpl, `${m.generator.path}: cannot find the manifest path its fx() reads`).not.toBeNull();
      const plan = /^plan = \[([\s\S]*?)\]$/m.exec(src);
      expect(plan, `${m.generator.path}: cannot find its plan`).not.toBeNull();
      for (const b of plan![1].matchAll(/\("[a-z0-9_]+", "([a-z0-9_]+)"/g)) found.add(`${tmpl![1]}${b[1]}/clips.json`);
    }
    return [...found].sort();
  }

  for (const m of MARKERS) {
    it(`${m.fixture.path}: every manifest its recorded run reads is pinned in aeon.inputs`, () => {
      const named = namedInputs(m);
      // Anti-vacuous: every marker here bakes or validates at least one manifest.
      expect(named.length, `${m.fixture.path}: derived no input from its command or generator`).toBeGreaterThan(0);
      const pinned = (m.aeon.inputs ?? []).map((i) => i.path);
      expect(named.filter((p) => !pinned.includes(p)), `${m.fixture.path}: read by the recorded run but NOT pinned`).toEqual([]);
      for (const i of m.aeon.inputs ?? []) expect(i.blob, `${i.path}`).toMatch(/^[0-9a-f]{40}$/);
    });

    it(`${m.fixture.path}: each pinned input at aeon origin/master is the blob it was captured from`, (ctx) => {
      const inputs = m.aeon.inputs ?? [];
      expect(inputs.length, `${m.fixture.path}: no aeon.inputs`).toBeGreaterThan(0);
      const aeon = peerRepo('aeon');
      if (aeon === null) {
        ctx.skip(`SKIPPED, NOT PASSED: no aeon checkout beside this repo (set AEON_DIR); CANNOT MEASURE the currency of ${m.fixture.path}'s ${inputs.length} inputs`);
        return;
      }
      const tip = resolveRev(aeon, 'origin/master');
      if (tip === null) {
        ctx.skip(`SKIPPED, NOT PASSED: origin/master does not resolve in ${aeon}; CANNOT MEASURE ${m.fixture.path}'s inputs`);
        return;
      }
      const moved: string[] = [];
      for (const i of inputs) {
        const at = readAtRev(aeon, tip, i.path);
        if (!at.ok) moved.push(`${i.path}: ${at.why}`);
        else if (at.blob !== i.blob) moved.push(`${i.path}: pinned ${i.blob}, origin/master ${tip} has ${at.blob}`);
      }
      expect(moved, 'NOT AN AURORA REGRESSION: an input this output was captured from moved in aeon.\n'
        + `  Re-measure: ${m.aeon.re_measure}`).toEqual([]);
    });
  }
});
