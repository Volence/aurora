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
import { ConstantSource, definingLine, EMP_PARSES, EmpParseError, PARSER_SOURCE_LINES, readerValues, type EmpReader } from '../support/emp-constants';

const DIR = resolve(__dirname, '../fixtures/clips/aeon-outputs');
const clipact = (name: string) => JSON.parse(readFileSync(resolve(DIR, `${name}.clipact.json`), 'utf8')) as {
  pool: Record<string, unknown> & { per_clip: Record<string, unknown>[]; per_corridor: Record<string, unknown>[]; per_clip_fields: Record<string, string>; tiles: number; pages: number };
  clips: { id: string }[]; corridors: { id: string }[];
};
const CASES = JSON.parse(readFileSync(resolve(DIR, 'validate-json.cases.json'), 'utf8')) as Record<string, { exit: number; stdout: string; stderr: string }>;
/**
 * ROADMAP row 234: a data input pinned by the VALUES the tools read out of it, not by its
 * blob (constants.emp: a blob pin reds on every unrelated constant). `readers` are the
 * reader contexts (the parse, the files it loads in order, name -> value at `revision`);
 * `names_not_read` are constants a loaded module names that no recorded run reads, each
 * group resting on a data file `data_not_opened` records no run opening.
 */
interface ByValue {
  path: string; why: string; readers: EmpReader[];
  names_not_read: { names: string[]; because_not_opened: string; why: string }[];
}
interface Marker {
  aeon: {
    revision: string; tool_path: string; tool_blob: string; re_measure: string; materialised_by: string;
    inputs?: { path: string; blob: string }[]; closure_not_loaded?: string[];
    data_not_opened?: string[]; inputs_excluded?: { path: string; why: string }[];
    inputs_by_value?: ByValue[];
  };
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

    // ROADMAP row 219 (c): the manifests are not all an output reads. The tool imports
    // aeon modules, and the donor trees it reads are the donor conversion's output
    // (gitignored in aeon), so that conversion and ITS modules are inputs too. The
    // closure is derived HERE from aeon's own sources at the marker's revision (git
    // objects), from tool_path and from the conversion tool the marker's
    // materialised_by names; every module in it is pinned, or listed as measured
    // not-loaded. Each pinned blob is also held to the marker's OWN revision, so a
    // blob cannot have been typed or taken from some other tree.
    it(`${m.fixture.path}: every aeon module and data file the tool and the donor conversion read is pinned, measured unread, or a declared exclusion, each at the marker's revision`, (ctx) => {
      const conv = /python3 (tools\/[a-z0-9_]+\.py) convert --all-six/.exec(m.aeon.materialised_by);
      expect(conv, `${m.fixture.path}: materialised_by names no donor conversion`).not.toBeNull();
      const aeon = peerRepo('aeon');
      if (aeon === null) {
        ctx.skip(`SKIPPED, NOT PASSED: no aeon checkout beside this repo (set AEON_DIR); CANNOT MEASURE ${m.fixture.path}'s import closure`);
        return;
      }
      const rev = resolveRev(aeon, m.aeon.revision);
      if (rev === null) {
        ctx.skip(`SKIPPED, NOT PASSED: ${m.aeon.revision} does not resolve in ${aeon} (unfetched?); CANNOT MEASURE ${m.fixture.path}'s import closure`);
        return;
      }
      const closure = new Set<string>();
      /** Modules some module imports at COLUMN 0: loaded whenever that module is, so never "not loaded" beside a pinned importer. */
      const topLevel = new Map<string, Set<string>>();
      const todo = [m.aeon.tool_path, conv![1]];
      while (todo.length > 0) {
        const p = todo.pop()!;
        if (closure.has(p)) continue;
        const at = readAtRev(aeon, rev, p);
        expect(at.ok, at.ok ? '' : at.why).toBe(true);
        if (!at.ok) return;
        closure.add(p);
        const names = new Set<string>();
        for (const x of at.text.matchAll(/^[ \t]*import[ \t]+([^\n#]+)/gm)) {
          for (const part of x[1].split(',')) { const t = part.trim().split(/\s+/)[0]; if (t) names.add(t.split('.')[0]); }
        }
        for (const x of at.text.matchAll(/^[ \t]*from[ \t]+([A-Za-z_]\w*)[ \t]+import\b/gm)) names.add(x[1]);
        const top = new Set<string>();
        for (const x of at.text.matchAll(/^import[ \t]+([^\n#]+)/gm)) {
          for (const part of x[1].split(',')) { const t = part.trim().split(/\s+/)[0]; if (t) top.add(`tools/${t.split('.')[0]}.py`); }
        }
        for (const x of at.text.matchAll(/^from[ \t]+([A-Za-z_]\w*)[ \t]+import\b/gm)) top.add(`tools/${x[1]}.py`);
        topLevel.set(p, top);
        // A name is an aeon module when tools/<name>.py exists at the revision; stdlib and numpy are not there.
        for (const n of names) if (!closure.has(`tools/${n}.py`) && readAtRev(aeon, rev, `tools/${n}.py`).ok) todo.push(`tools/${n}.py`);
      }
      // Anti-vacuous: the conversion and the tool each pull in aeon modules of their own.
      expect(closure.size, `${m.fixture.path}: closure found no module beyond its two roots`).toBeGreaterThan(2);
      const pinned = new Set([m.aeon.tool_path, ...(m.aeon.inputs ?? []).map((i) => i.path)]);
      const notLoaded = m.aeon.closure_not_loaded ?? [];
      expect(notLoaded.filter((p) => pinned.has(p)), `${m.fixture.path}: listed as not loaded AND pinned`).toEqual([]);
      expect([...closure].filter((p) => !pinned.has(p) && !notLoaded.includes(p)).sort(),
        `${m.fixture.path}: imported by the tool or the donor conversion at ${m.aeon.revision}, but neither pinned in aeon.inputs nor measured not loaded`).toEqual([]);
      // "Not loaded" is the trace's word and this row cannot re-trace; what it CAN refute is a
      // module listed not-loaded that a pinned (so loaded) module imports at column 0.
      const contradicted: string[] = [];
      for (const [p, top] of topLevel) if (pinned.has(p)) for (const q of top) if (notLoaded.includes(q)) contradicted.push(`${q} (imported at top level by ${p})`);
      expect(contradicted, `${m.fixture.path}: listed as not loaded, but a loaded module imports it unconditionally`).toEqual([]);

      // DATA FILES. The loaded modules (tool_path and every pinned tools/*.py) name the
      // committed files they read as os.path.join of string literals; derive those here,
      // at the revision. Each must be pinned, measured not opened (data_not_opened), or
      // a DECLARED exclusion (inputs_excluded: read, deliberately unpinned, with its why).
      // An exclusion is its own category: dropping a pin without declaring it still reds.
      const loaded = [...pinned].filter((p) => p.startsWith('tools/') && p.endsWith('.py'));
      const named = new Set<string>();
      for (const p of loaded) {
        const at = readAtRev(aeon, rev, p);
        if (!at.ok) continue;
        for (const call of at.text.matchAll(/os\.path\.join\(([^()]*)\)/g)) {
          const lits = [...call[1].matchAll(/["']([A-Za-z0-9_.-]+)["']/g)].map((x) => x[1]);
          if (lits.length === 0 || !lits[lits.length - 1].includes('.')) continue;
          for (let i = 0; i < lits.length; i++) {
            const q = lits.slice(i).join('/');
            if (!named.has(q) && readAtRev(aeon, rev, q).ok) named.add(q);
          }
        }
      }
      // Anti-vacuous: the clip tools read at least one committed data file this way.
      expect(named.size, `${m.fixture.path}: derived no data file from the loaded modules`).toBeGreaterThan(0);
      const notOpened = m.aeon.data_not_opened ?? [];
      const excluded = m.aeon.inputs_excluded ?? [];
      const excludedPaths = excluded.map((e) => e.path);
      // ROADMAP row 234: a file pinned by the VALUES read out of it (inputs_by_value) is
      // covered too; the row below holds those values. It is one category, not two.
      const byValuePaths = (m.aeon.inputs_by_value ?? []).map((b) => b.path);
      const categories = [...pinned, ...notOpened, ...excludedPaths, ...byValuePaths];
      expect(categories.filter((p, i) => categories.indexOf(p) !== i), `${m.fixture.path}: in two categories at once (pinned by blob, by value, not opened, excluded)`).toEqual([]);
      for (const e of excluded) {
        expect(named.has(e.path), `${m.fixture.path}: excludes ${e.path}, which no loaded module names (an exclusion must be of something the tools read)`).toBe(true);
        expect(e.why.length, `${m.fixture.path}: ${e.path} is excluded with no why`).toBeGreaterThan(0);
      }
      for (const p of byValuePaths) expect(named.has(p), `${m.fixture.path}: pins ${p} by value, which no loaded module names`).toBe(true);
      expect([...named].filter((p) => !pinned.has(p) && !notOpened.includes(p) && !excludedPaths.includes(p) && !byValuePaths.includes(p)).sort(),
        `${m.fixture.path}: a data file a loaded module names at ${m.aeon.revision} is neither pinned (by blob or by value), measured not opened, nor a declared exclusion`).toEqual([]);
      const wrong: string[] = [];
      for (const i of m.aeon.inputs ?? []) {
        const at = readAtRev(aeon, rev, i.path);
        if (!at.ok) wrong.push(`${i.path}: ${at.why}`);
        else if (at.blob !== i.blob) wrong.push(`${i.path}: pinned ${i.blob}, but at the marker's own revision ${rev} it is ${at.blob}`);
      }
      expect(wrong, `${m.fixture.path}: a pinned blob is not the file at the revision the marker names`).toEqual([]);
    });

    // ROADMAP row 234. constants.emp is pinned by the VALUES the tools read, and this row
    // holds that pin to aeon's own source at the marker's revision (git objects):
    //   * the parse is aeon's: every source line test/support/emp-constants.ts transcribes
    //     is still in the parser's file, so the transcription is of THIS revision's parser;
    //   * the names are complete: every constant a loaded module names as a whole string
    //     literal ("NAME" or 'NAME': a get("NAME"), a name list, a dict key) is pinned, or
    //     listed not-read on the strength of a data file the trace saw no run open;
    //   * the values are not typed: each is the parse's answer at the marker's revision.
    it(`${m.fixture.path}: the constants pinned by value are every one its loaded modules name, valued by the tools' own parse at the marker's revision`, (ctx) => {
      const byValue = m.aeon.inputs_by_value ?? [];
      expect(byValue.length, `${m.fixture.path}: no aeon.inputs_by_value (constants.emp is read by every run; row 234 pins it by value)`).toBeGreaterThan(0);
      const aeon = peerRepo('aeon');
      if (aeon === null) {
        ctx.skip(`SKIPPED, NOT PASSED: no aeon checkout beside this repo (set AEON_DIR); CANNOT MEASURE ${m.fixture.path}'s value pin`);
        return;
      }
      const rev = resolveRev(aeon, m.aeon.revision);
      if (rev === null) {
        ctx.skip(`SKIPPED, NOT PASSED: ${m.aeon.revision} does not resolve in ${aeon} (unfetched?); CANNOT MEASURE ${m.fixture.path}'s value pin`);
        return;
      }
      const text = (p: string) => {
        const at = readAtRev(aeon, rev, p);
        if (!at.ok) throw new Error(`${m.fixture.path}: ${at.why}`);
        return at.text;
      };
      const blobPinned = new Set([m.aeon.tool_path, ...(m.aeon.inputs ?? []).map((i) => i.path)]);
      const loaded = [...blobPinned].filter((p) => p.startsWith('tools/') && p.endsWith('.py'));
      const notOpened = m.aeon.data_not_opened ?? [];
      for (const b of byValue) {
        expect(b.why.length, `${b.path}: pinned by value with no why`).toBeGreaterThan(0);
        // The parse: known, its transcribed source lines present at the revision.
        const parserFile: Record<string, string> = { ConstantSource: 'tools/fg_working_set.py', 'layer_lines.engine_constants': 'tools/layer_lines.py' };
        for (const r of b.readers) {
          expect(EMP_PARSES, `${b.path}: parse ${r.parse} is none this suite transcribes`).toContain(r.parse);
          expect(r.loads[0], `${b.path}: a reader's first load must be the file pinned by value`).toBe(b.path);
          // Any other file a reader loads is an input in its own right: pinned by blob.
          for (const p of r.loads.slice(1)) expect(blobPinned.has(p), `${b.path}: reader ${r.parse} also loads ${p}, which is not pinned by blob`).toBe(true);
          const pf = parserFile[r.parse];
          expect(loaded, `${b.path}: parse ${r.parse} is ${pf}'s, which no loaded module is`).toContain(pf);
          const src = text(pf).split('\n').map((l) => l.trim());
          expect(PARSER_SOURCE_LINES[pf].filter((l) => !src.includes(l)),
            `${pf} at ${rev} no longer carries the lines test/support/emp-constants.ts transcribes; the value parse is UNVERIFIED against this revision, re-transcribe it`).toEqual([]);
        }
        // The names: every whole-string-literal constant name in a loaded module.
        const defs = new ConstantSource();
        defs.loadText(text(b.path), b.path);
        const derived = new Set<string>();
        for (const p of loaded) for (const x of text(p).matchAll(/(["'])([A-Za-z_][A-Za-z0-9_]*)\1/g)) if (defs.defines(x[2])) derived.add(x[2]);
        // Anti-vacuous: the clip tools name constants of this file.
        expect(derived.size, `${m.fixture.path}: derived no constant name of ${b.path} from its loaded modules`).toBeGreaterThan(0);
        const pinnedNames = new Set(b.readers.flatMap((r) => Object.keys(r.values)));
        const notRead = b.names_not_read.flatMap((g) => g.names);
        for (const g of b.names_not_read) {
          expect(g.why.length, `${b.path}: a names_not_read group with no why`).toBeGreaterThan(0);
          expect(notOpened, `${b.path}: ${g.names.join(', ')} are "not read" because no run opened ${g.because_not_opened}, which data_not_opened does not record`).toContain(g.because_not_opened);
        }
        expect(notRead.filter((n) => pinnedNames.has(n)), `${b.path}: both pinned by value and listed not read`).toEqual([]);
        expect(notRead.filter((n) => !derived.has(n)), `${b.path}: listed not read, but no loaded module names it at ${rev}`).toEqual([]);
        expect([...derived].filter((n) => !pinnedNames.has(n) && !notRead.includes(n)).sort(),
          `${m.fixture.path}: a constant of ${b.path} a loaded module names at ${rev} is neither pinned by value nor listed not read`).toEqual([]);
        // The values: the parse's answer at the marker's own revision, never typed.
        for (const r of b.readers) {
          expect(Object.keys(r.values).length, `${b.path}: an empty ${r.parse} reader`).toBeGreaterThan(0);
          expect(readerValues(r, text), `${b.path}: a pinned value is not ${r.parse}'s answer at the marker's own revision ${rev}`).toEqual(r.values);
        }
      }
    });

    // ROADMAP row 234's whole point, as a census rather than one plant: over constants.emp
    // at the marker's revision, an edit to ANY constant no reader resolves leaves every
    // pinned value where it was (the file's blob moves, the pin does not), and an edit to
    // any pinned constant's winning line, or an earlier definition of it, moves it.
    it(`${m.fixture.path}: GREEN on every unread constant's edit, RED on every pinned constant's edit or shadowing (census at the marker's revision)`, (ctx) => {
      const byValue = m.aeon.inputs_by_value ?? [];
      expect(byValue.length, `${m.fixture.path}: no aeon.inputs_by_value`).toBeGreaterThan(0);
      const aeon = peerRepo('aeon');
      if (aeon === null) {
        ctx.skip(`SKIPPED, NOT PASSED: no aeon checkout beside this repo (set AEON_DIR); CANNOT MEASURE ${m.fixture.path}'s value-pin census`);
        return;
      }
      const rev = resolveRev(aeon, m.aeon.revision);
      if (rev === null) {
        ctx.skip(`SKIPPED, NOT PASSED: ${m.aeon.revision} does not resolve in ${aeon} (unfetched?); CANNOT MEASURE ${m.fixture.path}'s value-pin census`);
        return;
      }
      const cache = new Map<string, string>();
      const atRev = (p: string) => {
        if (!cache.has(p)) {
          const at = readAtRev(aeon, rev, p);
          if (!at.ok) throw new Error(`${m.fixture.path}: ${at.why}`);
          cache.set(p, at.text);
        }
        return cache.get(p)!;
      };
      for (const b of byValue) {
        const base = atRev(b.path);
        const withText = (t: string) => (p: string) => (p === b.path ? t : atRev(p));
        const all = () => b.readers.map((r) => readerValues(r, withText(current)));
        let current = base;
        const lines = base.split('\n');
        const edit = (i: number, line: string) => [...lines.slice(0, i), line, ...lines.slice(i + 1)].join('\n');
        // What the readers resolve: the pinned names and everything their expressions reach.
        const closure = new Set<string>();
        for (const r of b.readers) {
          if (r.parse === 'ConstantSource') {
            const s = new ConstantSource();
            for (const p of r.loads) s.loadText(atRev(p), p);
            for (const n of Object.keys(r.values)) s.get(n);
            for (const n of s.resolved()) closure.add(n);
          } else for (const n of Object.keys(r.values)) closure.add(n);
        }
        const defs = new ConstantSource();
        defs.loadText(base, b.path);
        const unread = defs.definitions().map((d) => d.name).filter((n) => !closure.has(n));
        // Anti-vacuous: the file defines far more than the tools read.
        expect(unread.length, `${b.path}: no constant outside the readers' closure to edit`).toBeGreaterThan(0);
        const moved: string[] = [];
        for (const n of unread) {
          const i = definingLine(base, n);
          const expr = /=\s*(.+?)\s*$/.exec(lines[i].split('//')[0])![1];
          current = edit(i, `pub const ${n} = (${expr}) + 1`);
          expect(current, `${n}: the edit changed nothing`).not.toBe(base);
          const got = all();
          b.readers.forEach((r, k) => { for (const [name, v] of Object.entries(r.values)) if (got[k][name] !== v) moved.push(`editing unread ${n} moved ${name}: ${v} -> ${got[k][name]}`); });
        }
        expect(moved, `${b.path}: an edit to a constant no reader resolves moved a pinned value (the pin would red on an unrelated edit)`).toEqual([]);
        const still: string[] = [];
        let planted = 0;
        b.readers.forEach((r, k) => {
          for (const [name, v] of Object.entries(r.values)) {
            // (1) its winning line, by the parse's own notion of "winning line".
            const i = r.parse === 'ConstantSource' ? definingLine(base, name)
              : lines.findIndex((l) => new RegExp(`^pub const ${name}\\s*=\\s*(\\$[0-9A-Fa-f]+|\\d+)\\b`).test(l));
            const plants: [string, string][] = [];
            if (i >= 0) plants.push([`edit ${name}'s line`, edit(i, `pub const ${name} = ${v + 1}`)]);
            // (2) an EARLIER definition: first definition wins, in both parses.
            plants.push([`shadow ${name} above its definition`, `pub const ${name} = ${v + 1}\n${base}`]);
            for (const [what, t] of plants) {
              planted++;
              current = t;
              const got = all()[k][name];
              if (got === v) still.push(`${what}: ${r.parse} still reads ${v}`);
            }
          }
        });
        current = base;
        expect(planted, `${b.path}: no pinned constant was planted`).toBeGreaterThan(0);
        expect(still, `${b.path}: an edit to a pinned constant did NOT move its value (the pin would stay green on a real change)`).toEqual([]);
        process.stdout.write(`clip-tool-outputs value-pin census: ${m.fixture.path}: ${unread.length} unread constants edited, 0 pins moved; ${planted} plants on pinned constants, each moved (at ${rev})\n`);
      }
    });

    it(`${m.fixture.path}: each constant pinned by value at aeon origin/master is the value it was captured with`, (ctx) => {
      const byValue = m.aeon.inputs_by_value ?? [];
      expect(byValue.length, `${m.fixture.path}: no aeon.inputs_by_value`).toBeGreaterThan(0);
      const aeon = peerRepo('aeon');
      if (aeon === null) {
        ctx.skip(`SKIPPED, NOT PASSED: no aeon checkout beside this repo (set AEON_DIR); CANNOT MEASURE the currency of ${m.fixture.path}'s constants`);
        return;
      }
      const tip = resolveRev(aeon, 'origin/master');
      if (tip === null) {
        ctx.skip(`SKIPPED, NOT PASSED: origin/master does not resolve in ${aeon}; CANNOT MEASURE ${m.fixture.path}'s constants`);
        return;
      }
      const moved: string[] = [];
      let n = 0;
      for (const b of byValue) {
        for (const r of b.readers) {
          let now: Record<string, number | string>;
          try {
            now = readerValues(r, (p) => {
              const at = readAtRev(aeon, tip, p);
              if (!at.ok) throw new EmpParseError(at.why);
              return at.text;
            });
          } catch (e) {
            if (!(e instanceof EmpParseError)) throw e;
            moved.push(`${b.path} (${r.parse}): ${e.message}`);
            continue;
          }
          for (const [name, v] of Object.entries(r.values)) {
            n++;
            if (now[name] !== v) moved.push(`${name} (${r.parse} over ${r.loads.join(' + ')}): pinned ${v}, origin/master ${tip} has ${now[name]}`);
          }
        }
      }
      process.stdout.write(`clip-tool-outputs currency: ${m.fixture.path}: ${n} constants pinned by value compared at aeon origin/master ${tip}; ${moved.length} moved\n`);
      expect(moved, 'NOT AN AURORA REGRESSION: a constant this output was captured with moved in aeon.\n'
        + `  compared at aeon origin/master ${tip}, pinned at ${m.aeon.revision}\n  Re-measure: ${m.aeon.re_measure}`).toEqual([]);
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
