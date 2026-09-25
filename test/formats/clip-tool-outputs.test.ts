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
import { readValidateJson, subjectsLabel, VALIDATE_JSON_SCHEMA } from '../../src/core/formats/donors/clip-validate-json';
import { peerRepo, resolveRev, readAtRev } from '../support/peer-repo';

const DIR = resolve(__dirname, '../fixtures/clips/aeon-outputs');
const clipact = (name: string) => JSON.parse(readFileSync(resolve(DIR, `${name}.clipact.json`), 'utf8')) as {
  pool: Record<string, unknown> & { per_clip: Record<string, unknown>[]; per_corridor: Record<string, unknown>[]; per_clip_fields: Record<string, string>; tiles: number; pages: number };
  clips: { id: string }[]; corridors: { id: string }[];
};
const CASES = JSON.parse(readFileSync(resolve(DIR, 'validate-json.cases.json'), 'utf8')) as Record<string, { exit: number; stdout: string; stderr: string }>;
interface Marker { aeon: { revision: string; tool_path: string; tool_blob: string; re_measure: string }; fixture: { path: string; sha256: string } }
const MARKERS = ['s2_ehz_cpz.clipact', 's2_two_clip.clipact', 'validate-json.cases'].map((stem) =>
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
