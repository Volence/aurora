// `scripts/revendor.mjs` DERIVES THE SIDECAR FIELDS THE CURRENCY GATE READS.
//
// The script's own header says why it exists: vendoring is the bytes, the blob
// id and the revision, and every time those were retyped by hand a field was
// missed. It handled a sidecar whose vendored-copy block is called `vendored`.
//
// ⚠ IT DID NOT HANDLE THE OTHER SPELLING, AND THAT IS THE POPULATION THE
// CURRENCY GATE ACTUALLY READS. `test/fixtures/regions/ojz_act1.rows.provenance.json`
// and the effects sidecars beside it record the vendored copy under `fixture`,
// and `test/formats/aeon-fixture-currency.test.ts` asserts `fixture.git_blob`
// and `fixture.bytes` on every run. So a re-vendor of those files updated the
// `aeon` block, left `fixture` naming the previous blob, and hit the script's
// own refusal; the only way past it was to retype the three fields, which is
// the failure class the script exists to remove rather than to relocate.
//
// The three rows below are one property each: the fields are derived, the
// refusal still fires on a stale blob anywhere else, and the pin history is the
// one place a previous blob is allowed to remain.
//
// NOTHING HERE READS A PEER REPO. Each row builds a throwaway git repository in
// a temp directory and re-vendors out of it, so the subject is the script and
// not any particular fixture.

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';

const REPO_ROOT = resolve(__dirname, '../..');
const SCRIPT = resolve(REPO_ROOT, 'scripts/revendor.mjs');

/** The source file's contents in the throwaway peer repo, at its one revision. */
const SOURCE_TEXT = '{\n  "hello": "world"\n}\n';
const SOURCE_REL = 'tools/fixtures/thing.json';

let root = '';
let peer = '';
let rev = '';
let blob = '';

beforeAll(() => {
  root = mkdtempSync(join(tmpdir(), 'aurora-revendor-'));
  peer = join(root, 'peer');
  mkdirSync(join(peer, 'tools/fixtures'), { recursive: true });
  writeFileSync(join(peer, SOURCE_REL), SOURCE_TEXT);
  const git = (...a: string[]) => execFileSync('git', ['-C', peer, ...a], { encoding: 'utf8' });
  git('init', '-q');
  git('config', 'user.email', 'revendor@test.invalid');
  git('config', 'user.name', 'revendor test');
  git('add', SOURCE_REL);
  git('commit', '-qm', 'the one revision');
  rev = git('rev-parse', 'HEAD').trim();
  blob = git('rev-parse', `HEAD:${SOURCE_REL}`).trim();
});

afterAll(() => {
  if (root !== '') rmSync(root, { recursive: true, force: true });
});

/** The blob id and byte count the script must arrive at, computed here. */
const expected = () => ({
  blob,
  bytes: Buffer.byteLength(SOURCE_TEXT, 'utf8'),
  sha256: createHash('sha256').update(Buffer.from(SOURCE_TEXT, 'utf8')).digest('hex'),
});

/** The blob id every planted sidecar starts out naming. Not the real one. */
const STALE_BLOB = 'c5d31823b219618ba30a8ef92f5a7653b20aecb9';

/**
 * A sidecar in the `fixture` shape, carrying STALE values everywhere, plus the
 * extra prose fields the caller asks for. Written into its own directory so the
 * rows cannot see each other's edits.
 */
function plant(name: string, extra: Record<string, unknown> = {}) {
  const dir = join(root, name);
  mkdirSync(dir, { recursive: true });
  const doc = join(dir, 'thing.json');
  const sidecar = join(dir, 'thing.provenance.json');
  writeFileSync(doc, 'the previous bytes\n');
  writeFileSync(sidecar, `${JSON.stringify({
    aeon: { path: SOURCE_REL, revision: '0'.repeat(40), blob: STALE_BLOB },
    fixture: { path: 'test/fixtures/thing.json', bytes: 19, sha256: 'staleeeee', git_blob: STALE_BLOB },
    ...extra,
  }, null, 2)}\n`);
  return { doc, sidecar };
}

type Run = { status: number; stdout: string; stderr: string };

function revendor(doc: string, sidecar: string): Run {
  try {
    const stdout = execFileSync(
      process.execPath, [SCRIPT, doc, sidecar, peer, SOURCE_REL, rev],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] },
    );
    return { status: 0, stdout, stderr: '' };
  } catch (e) {
    const err = e as { status?: number; stdout?: string; stderr?: string };
    return { status: err.status ?? -1, stdout: err.stdout ?? '', stderr: err.stderr ?? '' };
  }
}

describe('revendor.mjs and the `fixture` block', () => {
  it('DERIVES all three fixture fields, which is what the currency gate reads', () => {
    const { doc, sidecar } = plant('derives');
    const run = revendor(doc, sidecar);
    expect(run.status, `${run.stdout}${run.stderr}`).toBe(0);
    const after = JSON.parse(readFileSync(sidecar, 'utf8')) as {
      fixture: { git_blob: string; bytes: number; sha256: string };
      aeon: { blob: string; revision: string };
    };
    // Anti-vacuous: the planted values were all wrong, so agreement here is the
    // script having computed each one rather than having left it alone.
    expect(after.fixture.git_blob).toBe(expected().blob);
    expect(after.fixture.bytes).toBe(expected().bytes);
    expect(after.fixture.sha256).toBe(expected().sha256);
    expect(after.aeon.blob).toBe(expected().blob);
    expect(after.aeon.revision).toBe(rev);
    // And the vendored bytes themselves, since a sidecar that describes a file
    // nobody replaced is the other half of the same mistake.
    expect(readFileSync(doc, 'utf8')).toBe(SOURCE_TEXT);
  });

  it('STILL REFUSES a stale blob left in a prose field: the guard is not weakened', () => {
    const { doc, sidecar } = plant('refuses', {
      resolved_by: `git show <rev>:<path>, re-hashed here to ${STALE_BLOB}`,
    });
    const run = revendor(doc, sidecar);
    expect(run.status, 'the script accepted a sidecar whose prose still names the previous blob')
      .toBe(1);
    expect(run.stderr).toContain('still names the previous blob');
    // A refusal that half-wrote the sidecar would be worse than no refusal.
    const after = readFileSync(sidecar, 'utf8');
    expect(after).toContain('"staleeeee"');
  });

  it('ACCEPTS a previous blob that survives ONLY in the pin history, which is its job', () => {
    const { doc, sidecar } = plant('history', {
      pin_history_current_last: [`${STALE_BLOB}, 5713201, the previous pin.`],
    });
    const run = revendor(doc, sidecar);
    expect(run.status, `${run.stdout}${run.stderr}`).toBe(0);
    const after = readFileSync(sidecar, 'utf8');
    // The history is KEPT, not stripped: the scan skips it, it does not edit it.
    expect(after).toContain(`${STALE_BLOB}, 5713201`);
    expect(JSON.parse(after).fixture.git_blob).toBe(expected().blob);
  });
});
