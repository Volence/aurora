/**
 * THE VENDORED s1disasm PIN — is it intact, and is its revision real?
 *
 * ROADMAP row 78 phase 2. `test/fixtures/s1disasm` holds 595 files of Sonic 1
 * disassembly data, vendored at the revision named in its `.provenance.json`, so
 * that the 28 test files which ASSERT on those bytes are decided by this repo's
 * commits and not by whatever another lane has typed into `../s1disasm` and not
 * committed (`docs/reviews/2026-09-02-row78-s1disasm-live-tree.md` measured the
 * exposure; `docs/reviews/2026-09-02-row78-vendor.md` records the conversion).
 *
 * WHAT THIS FILE ASSERTS, AND WHAT IT DELIBERATELY DOES NOT
 * --------------------------------------------------------
 * It asserts INTEGRITY: every vendored byte still hashes to the git object id
 * the sidecar records, nothing has been added, nothing has been deleted. That
 * catches a fixture quietly edited to make some other row pass, a bad merge, a
 * half-applied re-vendor — and it needs no peer checkout, so it runs everywhere.
 *
 * ⚠ IT IS NOT A TAUTOLOGY, and the reason is worth stating because a
 * "file matches its own manifest" check usually is one. The ids in the sidecar
 * are S1DISASM'S OWN OBJECT IDS, produced by that repository's history. This
 * file recomputes `sha1("blob <len>\0" + bytes)` from the fixture on disk — the
 * same function git uses — so the comparison is against the peer's identifier,
 * not against something this repo derived from the same bytes a moment earlier.
 * A vendoring script that mangled line endings, or a fixture edited by hand,
 * fails here even though the file would still "match itself".
 *
 * It does NOT assert CURRENCY of the vendored bytes — whether s1disasm has since
 * changed them — and that omission is deliberate rather than an oversight:
 *
 *   · These rows ask *"does OUR code handle this document?"*. That is a property
 *     of Aurora, and the document must not move underneath it, or the row
 *     measures two things at once and a peer's art edit reads as our regression.
 *   · A whole-tree currency check against a live disassembly would go red on
 *     every ordinary upstream commit, which is noise, not signal — and noise on
 *     a gate is how a gate stops being read.
 *   · The one place where currency IS the question — whether the disassembly
 *     still holds exactly four SynchroAnimate consumers — gets its own
 *     committed-revision check, in
 *     `src/core/project/profiles/__tests__/s1-sync-anims.test.ts`. `_incObj` is
 *     NOT vendored precisely so that check cannot answer itself.
 *
 * The sidecar's `revision` is separately proven PUBLISHED (reachable from the
 * peer's `origin/AS`) by the sweep in `aeon-fixture-currency.test.ts`, which
 * walks every `.provenance.json` under `test/fixtures`.
 */

import { describe, it, expect } from 'vitest';
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { resolve, relative } from 'node:path';

import { AURORA_DIR } from '../support/sibling-root.mjs';
import { referencePath, referenceCheckout, S1_PINNED } from '../support/fixture-tree';

const ROOT = referencePath(S1_PINNED);
const SIDECAR = resolve(ROOT, '.provenance.json');

/** Files that describe the pin rather than being part of it. */
const META = new Set(['.provenance.json', '.gitattributes']);

interface Provenance {
  s1disasm: {
    repo: string;
    branch_that_answers_currency: string;
    revision: string;
    subtrees: string[];
    not_vendored: Record<string, string>;
  };
  fixture: { files: number; bytes: number };
  re_vendor: string;
  files: Record<string, string>;
}

/** `git hash-object`'s answer for these exact bytes — git's own algorithm. */
function blobSha(buf: Buffer): string {
  return createHash('sha1')
    .update(Buffer.concat([Buffer.from(`blob ${buf.length}\0`, 'utf8'), buf]))
    .digest('hex');
}

function walk(dir: string, rel = '', acc: string[] = []): string[] {
  for (const e of readdirSync(resolve(dir, rel), { withFileTypes: true })) {
    const r = rel === '' ? e.name : `${rel}/${e.name}`;
    if (e.isDirectory()) walk(dir, r, acc);
    else if (e.isFile() && !META.has(r)) acc.push(r);
  }
  return acc;
}

describe('the vendored s1disasm pin', () => {
  it('is present and is a checkout: the markers other rows guard on', () => {
    expect(existsSync(ROOT), `${ROOT} is absent: run \`node scripts/vendor-s1-fixtures.mjs\``).toBe(true);
    expect(existsSync(SIDECAR), `${SIDECAR} is absent: a pin with no provenance is not a pin`).toBe(true);
    // The same predicate `whenS1Files` and friends use, asserted ONCE here as a
    // failure. Those guards can no longer fire on a machine that has this repo,
    // so the property they used to carry has to live somewhere that goes red.
    expect(referenceCheckout(S1_PINNED), `${ROOT} exists but is missing sonic.asm / _maps / levels`).toBe(true);
  });

  it('holds exactly the files its provenance records, byte for byte', () => {
    const prov = JSON.parse(readFileSync(SIDECAR, 'utf8')) as Provenance;
    expect(prov.s1disasm.revision, 'provenance has no 40-hex s1disasm revision').toMatch(/^[0-9a-f]{40}$/);

    const onDisk = walk(ROOT).sort();
    const recorded = Object.keys(prov.files).sort();

    // Anti-vacuous: an empty manifest would make every comparison below pass.
    expect(recorded.length, 'the provenance records NO files: nothing would be checked').toBeGreaterThan(400);
    expect(prov.fixture.files, 'provenance file count disagrees with its own manifest')
      .toBe(recorded.length);

    const extra = onDisk.filter((f) => !(f in prov.files));
    const gone = recorded.filter((f) => !onDisk.includes(f));
    expect(extra, `these files are in ${relative(AURORA_DIR, ROOT)} but NOT in its provenance: `
      + 'something was added to the pin without recording where it came from').toEqual([]);
    expect(gone, `these files are in the provenance but NOT on disk: the pin is incomplete; `
      + `re-run \`${prov.re_vendor}\``).toEqual([]);

    // The bytes. Compared against s1disasm's OWN object ids, recomputed here.
    const drifted: string[] = [];
    let bytes = 0;
    for (const rel of onDisk) {
      const body = readFileSync(resolve(ROOT, rel));
      bytes += body.length;
      const got = blobSha(body);
      if (got !== prov.files[rel]) drifted.push(`${rel}: provenance ${prov.files[rel]}, on disk ${got}`);
    }
    // PRINT THE ARTIFACT THIS ROW JUDGES.
    process.stdout.write(
      `  [pin] ${relative(AURORA_DIR, ROOT)} @ s1disasm ${prov.s1disasm.revision}: `
      + `${onDisk.length} file(s), ${(bytes / 1048576).toFixed(3)} MB, `
      + `${drifted.length} drifted; subtrees: ${prov.s1disasm.subtrees.join(' ')}\n`,
    );
    expect(drifted, 'these vendored files no longer hash to the s1disasm blob ids recorded for '
      + 'them: the pin has been edited in place, which silently changes what every row asserting '
      + `on it is measuring. Restore with \`${prov.re_vendor}\``).toEqual([]);
    expect(bytes, 'provenance byte total disagrees with the bytes on disk').toBe(prov.fixture.bytes);
  });

  it('records WHY _incObj is absent, so nobody helpfully vendors it', () => {
    const prov = JSON.parse(readFileSync(SIDECAR, 'utf8')) as Provenance;
    // The exclusion is load-bearing, not an omission: a vendored `_incObj` would
    // make `s1-sync-anims`' completeness row answer itself. If someone adds it,
    // this row is the thing that notices.
    expect(Object.keys(prov.s1disasm.not_vendored)).toContain('_incObj');
    expect(prov.s1disasm.not_vendored._incObj).toMatch(/CURRENCY QUESTION CANNOT BE ANSWERED BY A PIN/);
    expect(existsSync(resolve(ROOT, '_incObj')),
      '_incObj HAS BEEN VENDORED. It must not be: the two rows that read it ask whether the '
      + "disassembly still holds exactly four SynchroAnimate consumers, and a pinned copy holds "
      + 'four by construction: the row would pass forever and detect nothing. See '
      + 'src/core/project/profiles/__tests__/s1-sync-anims.test.ts.').toBe(false);
  });
});
