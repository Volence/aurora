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
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import {
  deleteProjectFile, fileMtime, listDir, listProjectFiles, pathExists,
  readBinaryFile, readManyFiles, writeProjectFile,
} from '../file-io';
import { isRelPathSafe } from '../../shared/rel-path';

/**
 * A real tree, with real targets OUTSIDE the project root, because a `..` path
 * pointing at nothing proves nothing:
 *
 *   <tmp>/outside.bin          3 bytes, the escape target for the file rules
 *   <tmp>/outside_dir/seen.txt a real directory, for the listDir rule
 *   <tmp>/outside.asm          picked up by listProjectFiles' extension filter
 *   <tmp>/project/             the basePath every primitive is given
 *   <tmp>/project/inside.bin   a legitimate in-project file
 *   <tmp>/project/inside.asm   ditto, for listProjectFiles
 */
let tmp: string;
let base: string;
const OUTSIDE_BYTES = [9, 9, 9];
const INSIDE_BYTES = [4, 5];

beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), 'aurora-fileio-guard-'));
  base = join(tmp, 'project');
  mkdirSync(base, { recursive: true });
  mkdirSync(join(tmp, 'outside_dir'), { recursive: true });
  writeFileSync(join(tmp, 'outside.bin'), Buffer.from(OUTSIDE_BYTES));
  writeFileSync(join(tmp, 'outside_dir', 'seen.txt'), 'x');
  writeFileSync(join(tmp, 'outside.asm'), '; outside');
  writeFileSync(join(base, 'inside.bin'), Buffer.from(INSIDE_BYTES));
  writeFileSync(join(base, 'inside.asm'), '; inside');
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

describe('deleteProjectFile applies the guard', () => {
  /**
   * THE SURVIVAL OF THE FILE IS THE ASSERTION, and the message is corroboration
   * only. `performGuardedWrite` throws the SAME sentence ("unsafe
   * project-relative path (escapes root)") for the same hazard, so a row keying
   * on that phrase alone could be satisfied by a different rule's refusal. What
   * cannot be faked is a real file still sitting on disk after a delete aimed at
   * it, with the control below proving that same delete works when the path is
   * legal.
   */
  it('refuses a `..` path whose target really exists, and the file survives', async () => {
    const outcome = await deleteProjectFile(base, '../outside.bin');

    expect(outcome.ok).toBe(false);
    expect(existsSync(join(tmp, 'outside.bin'))).toBe(true);
    expect(outsideBytes()).toEqual(OUTSIDE_BYTES);
    expect(outcome.ok === false && outcome.reason).toMatch(/escapes root/);
  });

  it('refuses an absolute path, and the file survives', async () => {
    const outcome = await deleteProjectFile(base, join(tmp, 'outside.bin'));
    expect(outcome.ok).toBe(false);
    expect(existsSync(join(tmp, 'outside.bin'))).toBe(true);
  });

  it('CONTROL: the same real target IS deleted when the path does not escape', async () => {
    const outcome = await deleteProjectFile(tmp, 'outside.bin');
    expect(outcome).toEqual({ ok: true, deleted: true });
    expect(existsSync(join(tmp, 'outside.bin'))).toBe(false);
  });
});

describe('readManyFiles applies the guard per entry', () => {
  /**
   * ONE CALL, BOTH PATHS, so the discrimination is in a single result: the
   * escaping entry comes back null while the in-project entry beside it comes
   * back with bytes. A null that meant "this primitive is broken" would take the
   * second entry down with it.
   */
  it('nulls an escaping entry while the safe entry beside it reads', async () => {
    const out = await readManyFiles(base, ['../outside.bin', 'inside.bin']);

    expect(out.map((e) => e.relPath)).toEqual(['../outside.bin', 'inside.bin']);
    expect(out[0].bytes).toBeNull();
    expect(out[0].mtimeMs).toBeNull();
    expect(out[1].bytes && [...out[1].bytes]).toEqual(INSIDE_BYTES);
  });

  it('CONTROL: the escape target reads fine through a base that makes it legal', async () => {
    const out = await readManyFiles(tmp, ['outside.bin']);
    expect(out[0].bytes && [...out[0].bytes]).toEqual(OUTSIDE_BYTES);
    expect(out[0].mtimeMs).toBeTypeOf('number');
  });
});

describe('pathExists applies the guard', () => {
  it('reports false for a `..` path whose target really exists', async () => {
    expect(await pathExists(base, '../outside.bin')).toBe(false);
  });

  it('reports false for an absolute path to a file that really exists', async () => {
    expect(await pathExists(base, join(tmp, 'outside.bin'))).toBe(false);
  });

  // Both controls are load-bearing: the first proves the target exists and is
  // stattable, the second proves this primitive answers true at all. Without
  // them, a `pathExists` that always answered false would pass the rows above.
  it('CONTROL: true for that same target from the outer base, and for an in-project file', async () => {
    expect(await pathExists(tmp, 'outside.bin')).toBe(true);
    expect(await pathExists(base, 'inside.bin')).toBe(true);
  });
});

describe('fileMtime applies the guard', () => {
  it('reports null for a `..` path whose target really exists', async () => {
    expect(await fileMtime(base, '../outside.bin')).toBeNull();
  });

  it('reports null for an absolute path to a file that really exists', async () => {
    expect(await fileMtime(base, join(tmp, 'outside.bin'))).toBeNull();
  });

  it('CONTROL: a number for that same target from the outer base, and for an in-project file', async () => {
    expect(await fileMtime(tmp, 'outside.bin')).toBeTypeOf('number');
    expect(await fileMtime(base, 'inside.bin')).toBeTypeOf('number');
  });
});

describe('listDir applies the guard', () => {
  it('reports [] for a `..` path naming a real, non-empty directory', async () => {
    expect(await listDir(base, '../outside_dir')).toEqual([]);
  });

  it('reports [] for an absolute path naming a real, non-empty directory', async () => {
    expect(await listDir(base, join(tmp, 'outside_dir'))).toEqual([]);
  });

  it('CONTROL: that same directory lists from the outer base, and the project root lists', async () => {
    expect(await listDir(tmp, 'outside_dir')).toEqual(['seen.txt']);
    expect((await listDir(base, '')).sort()).toEqual(['inside.asm', 'inside.bin']);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// THE TWO PRIMITIVES THAT APPLY NO GUARD. They are here so the census above is
// COMPLETE rather than merely long: a reader counting rows can see that every
// export of file-io.ts is accounted for, and that these two are absences by
// design rather than the same omission the rest of this file exists to close.
// The structural row at the bottom is what keeps that claim true over time.
// ═══════════════════════════════════════════════════════════════════════════
describe('the deliberately unguarded primitives', () => {
  /**
   * NOTICE, NOT ENDORSEMENT. `readBinaryFile` applies no rel-path guard, and
   * deleteProjectFile's own docblock says why in passing: `file:read-binary`
   * still carries an absolute-path exception for legacy callers, which is why
   * the newer channels "start closed" and this one did not.
   *
   * What stands between it and an escaping path today is the RENDERER side:
   * `state/classic-file-access.ts` checks isRelPathSafe before it invokes. That
   * is a guard on one caller, not on the channel, so this row states the channel's
   * real behaviour rather than the behaviour a reader would assume.
   *
   * If somebody guards it, THIS ROW GOING RED IS THE NOTICE: check the legacy
   * absolute-path callers first, then delete the row.
   */
  it('readBinaryFile is NOT guarded and will read outside the project', async () => {
    const bytes = await readBinaryFile(base, '../outside.bin');
    expect([...bytes]).toEqual(OUTSIDE_BYTES);
  });

  /**
   * `listProjectFiles` takes no project-relative path, so there is no argument
   * to guard. What it must do instead is CONTAIN: it composes its own relative
   * paths while walking, so every result has to be inside the base and safe by
   * the same predicate the other primitives apply.
   */
  it('listProjectFiles has no path argument, and every path it returns is contained', async () => {
    const out = await listProjectFiles(base);
    // Both in-project files: its KEEP_EXT set is .asm/.bin/.nem, so inside.bin
    // is kept too. Read from the module, not guessed from the fixture's names.
    expect(out.sort()).toEqual(['inside.asm', 'inside.bin']);
    expect(out.every((p) => isRelPathSafe(p))).toBe(true);
    // The .asm one level up is a file it would have kept had it walked upward.
    expect(out.some((p) => p.includes('outside'))).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// IS THE CENSUS ABOVE STILL THE WHOLE MODULE?
//
// Rows go stale by ADDITION, not by breaking: a ninth primitive lands next month
// with no guard and no row, and every row above stays green. So this row derives
// the population from file-io.ts's own text and refuses to agree with a stale
// list. It fails three ways: a new export nobody classified, a primitive that
// GAINED a guard while classified unguarded (add rows), and a primitive that
// LOST one while classified guarded (the defect this file exists for).
//
// WHAT IT IS NOT. It is not the guard proof, and it must not be mistaken for
// one: it reads for the presence of the `isRelPathSafe` call, so a guard
// neutralised in place (`if (false && ...)`) still satisfies it. The behavioural
// rows above are what catch that, one red row per primitive, each proven by
// exactly that mutation.
// ═══════════════════════════════════════════════════════════════════════════
describe('the census of primitives is derived from the module, not from this list', () => {
  /** Every export of file-io.ts, and whether this file says it guards its path. */
  const CLASSIFIED: Record<string, boolean> = {
    writeProjectFile: true,
    deleteProjectFile: true,
    readManyFiles: true,
    pathExists: true,
    fileMtime: true,
    listDir: true,
    readBinaryFile: false,     // legacy absolute-path exception; see the row above
    listProjectFiles: false,   // no project-relative argument to guard
  };

  const source = readFileSync(
    join(dirname(fileURLToPath(import.meta.url)), '..', 'file-io.ts'), 'utf8',
  );

  /** name -> body text, for each `export async function` in the module. */
  function exportedBodies(text: string): Map<string, string> {
    const out = new Map<string, string>();
    const starts = [...text.matchAll(/^export async function (\w+)/gm)];
    for (let i = 0; i < starts.length; i++) {
      const from = starts[i].index!;
      const to = i + 1 < starts.length ? starts[i + 1].index! : text.length;
      out.set(starts[i][1], text.slice(from, to));
    }
    return out;
  }

  it('names every exported primitive, and agrees with each one about the guard', () => {
    const bodies = exportedBodies(source);
    // Loud rather than quietly green if the parse found nothing to measure.
    expect(bodies.size).toBeGreaterThanOrEqual(8);
    expect(Object.keys(CLASSIFIED).sort()).toEqual([...bodies.keys()].sort());
    for (const [name, body] of bodies) {
      expect(body.includes('isRelPathSafe('), `${name}: guard presence`)
        .toBe(CLASSIFIED[name]);
    }
  });
});
