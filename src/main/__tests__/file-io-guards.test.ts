// DOES EACH MAIN-PROCESS FILESYSTEM PRIMITIVE ACTUALLY APPLY THE PATH GUARD?
//
// Until 2026-09-08 nothing in this repo answered that. `src/main/file-io.ts` had
// ZERO importing tests, and the proof was not a prediction: the rel-path checks
// in it were neutralised on disk and the full suite came back byte-identical to
// the clean baseline, 7648 passed / 3 failed (the 3 an unrelated stale aeon
// contract). `src/shared/__tests__/rel-path.test.ts` tests `isRelPathSafe` in
// ISOLATION, which is the other half and not this one: a predicate can be
// perfectly correct at every call it is never made from.
//
// ═══ HOW A ROW HERE PROVES THE GUARD, AND NOT SOMETHING NEXT TO IT ═══
//
// A refusal is only evidence if the operation would otherwise have SUCCEEDED.
// Every escaping path used below therefore names a file or directory that REALLY
// EXISTS, and every rule has a CONTROL reaching that same real target through a
// safe path, from a base that makes it legal. So:
//
//   • "refused" cannot be an ENOENT wearing the guard's costume, and
//   • the fs was demonstrably willing, so the only thing that said no is the
//     `isRelPathSafe` line inside the primitive under test.
//
// ATTRIBUTION. Each row calls ONE primitive directly. There is no neighbouring
// guard on the path to take the credit, which is the trap a proof in this repo
// walked into once: a gate resting on the gate next door stays green when you
// delete the one you meant to test. Where a refusal carries a MESSAGE, the row
// matches wording only that rule emits. `deleteProjectFile` and
// `performGuardedWrite` share the sentence "unsafe project-relative path
// (escapes root)", so the write channel says "refused write to" first and this
// file's write rows key on that.
//
// FOR THE TOLERANT PRIMITIVES there is no message at all: an escaping path
// resolves to null/false/[] exactly as a missing file does. Those rows are
// therefore SIDE-BY-SIDE TRIPLES: the escaping path (refused), the same real
// target reached safely from the outer base (proves it exists and is readable),
// and a legitimate in-project path (proves the primitive works at all). Any one
// of the three alone is worthless.
//
// RED-FIRST. Every row was proven by neutralising its own guard on disk, one at
// a time, with the mutation shown by `git diff` and the baseline restored from
// the commit each time. Runner: `npx vitest run src/main/__tests__/file-io-guards.test.ts`,
// which is inside the `npm test` chain's `vitest run`.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { writeProjectFile } from '../file-io';

/**
 * A real tree with a real file OUTSIDE the project root, because a `..` path
 * pointing at nothing proves nothing:
 *
 *   <tmp>/outside.bin        3 bytes, the escape target
 *   <tmp>/project/           the basePath every primitive is given
 */
let tmp: string;
let base: string;
const OUTSIDE_BYTES = [9, 9, 9];

beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), 'aurora-fileio-guard-'));
  base = join(tmp, 'project');
  mkdirSync(base, { recursive: true });
  writeFileSync(join(tmp, 'outside.bin'), Buffer.from(OUTSIDE_BYTES));
});
afterEach(() => { rmSync(tmp, { recursive: true, force: true }); });

const outsideBytes = () => [...readFileSync(join(tmp, 'outside.bin'))];

describe('writeProjectFile applies the guard', () => {
  it('refuses a `..` path whose target really exists, and does not touch it', async () => {
    const outcome = await writeProjectFile(base, '../outside.bin', new Uint8Array([1, 2, 3]));

    expect(outcome.ok).toBe(false);
    expect(outcome.ok === false && outcome.reason)
      .toMatch(/^refused write to unsafe project-relative path \(escapes root\): '\.\.\/outside\.bin'$/);
    // The whole point. A refusal that still wrote would satisfy an `ok:false`
    // assertion perfectly well.
    expect(outsideBytes()).toEqual(OUTSIDE_BYTES);
  });

  it('refuses an absolute path', async () => {
    const outcome = await writeProjectFile(base, join(tmp, 'outside.bin'), new Uint8Array([1, 2, 3]));
    expect(outcome.ok).toBe(false);
    expect(outsideBytes()).toEqual(OUTSIDE_BYTES);
  });

  /**
   * THE CONTROL THAT MAKES THE TWO ABOVE MEAN SOMETHING: the same target file,
   * the same bytes, reached by a safe path from a base that makes it legal. It
   * lands. So the fs was willing the whole time and the refusals above were the
   * guard's decision, not the filesystem's.
   */
  it('CONTROL: the same real target is written when the path does not escape', async () => {
    const outcome = await writeProjectFile(tmp, 'outside.bin', new Uint8Array([1, 2, 3]));
    expect(outcome).toEqual({ ok: true });
    expect(outsideBytes()).toEqual([1, 2, 3]);
  });

  it('CONTROL: an ordinary in-project path lands, creating parent directories', async () => {
    const outcome = await writeProjectFile(base, 'data/ojz/act1/section_0.tiles.bin', new Uint8Array([7]));
    expect(outcome).toEqual({ ok: true });
    expect([...readFileSync(join(base, 'data/ojz/act1/section_0.tiles.bin'))]).toEqual([7]);
    // The atomic write leaves no `.tmp` behind on the success path.
    expect(existsSync(join(base, 'data/ojz/act1/section_0.tiles.bin.tmp'))).toBe(false);
  });
});
