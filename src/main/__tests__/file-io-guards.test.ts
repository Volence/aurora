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
// FOR THE TOLERANT PRIMITIVES that still answer a bare value (fileMtime's null)
// there is no message at all: an escaping path resolves exactly as a missing file
// does. Those rows are
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
  deleteProjectFile, fileMtime, probeDir, listProjectFiles, probePath,
  readBinaryFile, readManyFiles, writeProjectFile,
} from '../file-io';
import { isRelPathSafe } from '../../shared/rel-path';

/**
 * A real tree, with real targets OUTSIDE the project root, because a `..` path
 * pointing at nothing proves nothing:
 *
 *   <tmp>/outside.bin          3 bytes, the escape target for the file rules
 *   <tmp>/outside_dir/seen.txt a real directory, for the probeDir rule
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

  // ═══ THE FOUR ANSWERS (FABRICATED-ENOENT, lens sweep HIGH, 2026-09-08) ═══════
  //
  // Same seam and same reason as the probePath rows below. `readManyFiles` folded
  // an ENOENT, an EACCES, an EISDIR, an EIO and a REFUSED escaping path into one
  // `bytes: null`, and its two consumers turned that into a hand-typed
  // `ENOENT: no such file or directory` for all of them. The rows above can still
  // only see the null; these say WHICH ANSWER, which is the whole distinction.
  //
  // THE UNREADABLE CASE IS A REAL DIRECTORY, not a chmod: `readFile` on a
  // directory is EISDIR on every platform this runs on, it needs no privileges,
  // and it does not go green when the suite runs as root (which is how a chmod
  // 000 row quietly stops measuring). It is genuinely present, so 'absent' would
  // be a false statement about it, which is what makes the row a proof.
  it('says WHICH of the four: read, absent, unreadable, refused', async () => {
    mkdirSync(join(base, 'a_directory'), { recursive: true });
    const out = await readManyFiles(
      base, ['inside.bin', 'nowhere.bin', 'a_directory', '../outside.bin'],
    );
    const by = (rel: string) => out.find((e) => e.relPath === rel)!;

    expect(by('inside.bin').outcome).toBe('read');
    expect(by('inside.bin').reason).toBeNull();

    // Nothing at the path: the ONE case that licenses the ENOENT sentence.
    expect(by('nowhere.bin').outcome).toBe('absent');
    expect(by('nowhere.bin').reason).toBeNull();

    // Present and unreadable. `absent` here is the defect, verbatim.
    expect(by('a_directory').outcome).toBe('unreadable');
    expect(by('a_directory').reason).toMatch(/EISDIR/);
    expect(existsSync(join(base, 'a_directory'))).toBe(true);

    // Declined to look. Not a statement about the filesystem, and the CONTROL
    // above proves this target reads fine through a base that makes it legal.
    expect(by('../outside.bin').outcome).toBe('refused');
    expect(by('../outside.bin').reason).toMatch(/escapes root/);
  });

  it('CONTROL: absent and unreadable are DIFFERENT answers, so neither row is asserting the other', async () => {
    mkdirSync(join(base, 'a_directory'), { recursive: true });
    const out = await readManyFiles(base, ['nowhere.bin', 'a_directory', '../outside.bin']);
    // Four requests, three distinct no-bytes answers. Before the fix this set was
    // { null }, which is why a consumer could say only one thing about all three.
    expect(new Set(out.map((e) => e.outcome)).size).toBe(3);
    expect(out.every((e) => e.bytes === null)).toBe(true);
  });
});

describe('probePath applies the guard', () => {
  // ⚠ THESE ROWS WERE STRENGTHENED AT A MERGE SEAM, 2026-09-08, and the reason is
  // the whole point of the parcel that renamed this function. They used to assert
  // `pathExists(...) === false` on an escaping path. `false` was the SAME VALUE a
  // genuinely missing file returned, so the old rows could not tell a refusal from
  // an absence, and a guard that answered "not there" about a file it declined to
  // look at was stating a falsehood in the caller's own vocabulary. `probePath`
  // has three answers and a refusal is `unknown`, so these rows now assert WHICH
  // answer, and the last one is the control that separates the two.
  it('answers unknown, not absent, for a `..` path whose target really exists', async () => {
    const probe = await probePath(base, '../outside.bin');
    expect(probe.presence).toBe('unknown');
    expect(probe.reason).toContain('escapes root');
  });

  it('answers unknown for an absolute path to a file that really exists', async () => {
    const probe = await probePath(base, join(tmp, 'outside.bin'));
    expect(probe.presence).toBe('unknown');
    expect(probe.reason).toContain('escapes root');
  });

  // Three controls, each load-bearing. The first proves the target exists and is
  // stattable; the second proves this primitive answers `present` at all; the
  // THIRD is the one the old boolean rows could not express, and it is what makes
  // the two rows above discriminating: a legally-reachable file that is simply not
  // there answers `absent`, so `unknown` above is a refusal and not this.
  it('CONTROL: present for that same target from the outer base, and for an in-project file', async () => {
    expect((await probePath(tmp, 'outside.bin')).presence).toBe('present');
    expect((await probePath(base, 'inside.bin')).presence).toBe('present');
  });

  it('CONTROL: a legal path that is genuinely missing answers absent, never unknown', async () => {
    const probe = await probePath(base, 'no-such-file.bin');
    expect(probe.presence).toBe('absent');
    expect(probe.reason).toBeNull();
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

describe('probeDir applies the guard', () => {
  // ⚠ THESE ROWS WERE STRENGTHENED WITH THE FUNCTION, 2026-09-08
  // (LISTING-SWALLOWS-FAILURE), on exactly the terms the probePath rows above
  // record. They used to assert `listDir(...) === []` for an escaping path.
  // `[]` was the SAME VALUE an empty directory, a missing one and an EACCES all
  // produced, so the old rows could not tell a refusal from an absence, and a
  // listing that answered "there is nothing here" about a directory it had
  // declined to open was stating a falsehood in the caller's own vocabulary.
  // `probeDir` has four answers and a refusal is 'refused', so these rows now
  // assert WHICH answer, and the controls below separate them.
  it('answers refused, not absent, for a `..` path naming a real, non-empty directory', async () => {
    const listing = await probeDir(base, '../outside_dir');
    expect(listing.outcome).toBe('refused');
    expect(listing.entries).toBeNull();
    expect(listing.reason).toContain('escapes root');
  });

  it('answers refused for an absolute path naming a real, non-empty directory', async () => {
    const listing = await probeDir(base, join(tmp, 'outside_dir'));
    expect(listing.outcome).toBe('refused');
    expect(listing.entries).toBeNull();
  });

  it('CONTROL: that same directory lists from the outer base, and the project root lists', async () => {
    const outer = await probeDir(tmp, 'outside_dir');
    expect(outer.outcome).toBe('listed');
    expect(outer.entries).toEqual(['seen.txt']);
    const root = await probeDir(base, '');
    expect(root.entries?.slice().sort()).toEqual(['inside.asm', 'inside.bin']);
  });

  // ═══ THE FOUR ANSWERS (LISTING-SWALLOWS-FAILURE, lens sweep, 2026-09-08) ════
  //
  // The same seam and the same reason as the readManyFiles rows above, one level
  // up: `listDir` folded an ENOENT, an ENOTDIR, an EACCES, an ENOTDIR-on-a-file
  // and a REFUSED escaping path into `[]` — the value a genuinely EMPTY
  // directory also has. Both effects libraries treat an absent directory as the
  // ordinary "nothing authored yet" and say nothing about it, so every one of
  // those failures reached the author as silence.
  //
  // THE UNREADABLE CASE IS A REAL FILE, not a chmod, for the reason the
  // readManyFiles row gives: `readdir` on a plain file is ENOTDIR everywhere
  // this runs, needs no privileges, and does not go green as root. ⚠ AND IT IS
  // CLASSIFIED 'absent', DELIBERATELY: ENOTDIR means a non-directory stands
  // where a directory would have to be, so nothing can be under it — the same
  // cut probePath and readManyFiles make, and this row exists so that agreement
  // is asserted rather than assumed.
  //
  // The EMPTY-vs-ABSENT pair is the one the old `[]` could not express at all,
  // and it is the pair the effects loaders turn on.
  it('says WHICH of the four: listed (empty), listed (full), absent, refused', async () => {
    mkdirSync(join(base, 'empty_dir'), { recursive: true });

    const empty = await probeDir(base, 'empty_dir');
    expect(empty.outcome).toBe('listed');
    expect(empty.entries).toEqual([]);   // A REAL empty directory. Not a failure.
    expect(empty.reason).toBeNull();

    const full = await probeDir(base, '');
    expect(full.outcome).toBe('listed');
    expect(full.entries?.length).toBe(3); // inside.asm, inside.bin, empty_dir

    const gone = await probeDir(base, 'no_such_dir');
    expect(gone.outcome).toBe('absent');
    expect(gone.entries).toBeNull();
    expect(gone.reason).toBeNull();

    // A plain FILE where a directory was asked for: ENOTDIR, and nothing can be
    // under it, so 'absent' is a true statement about its contents.
    const notADir = await probeDir(base, 'inside.bin/sub');
    expect(notADir.outcome).toBe('absent');

    const refused = await probeDir(base, '../outside_dir');
    expect(refused.outcome).toBe('refused');
    expect(refused.reason).toMatch(/escapes root/);
  });

  it('CONTROL: empty, absent and refused are THREE answers, so no row is asserting another', async () => {
    mkdirSync(join(base, 'empty_dir'), { recursive: true });
    const outcomes = await Promise.all(
      ['empty_dir', 'no_such_dir', '../outside_dir'].map(async (d) => (await probeDir(base, d)).outcome),
    );
    // Before the fix this set was { [] } — one value for all three, which is
    // why a consumer could say only one thing about them.
    expect(new Set(outcomes).size).toBe(3);
    expect(outcomes).toEqual(['listed', 'absent', 'refused']);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// READBINARY-NO-PATH-GUARD (lens sweep, closed 2026-09-08). These rows REPLACE
// a deliberate notice row that asserted the opposite — that `readBinaryFile`
// applied no guard and would read outside the project. That row was correct
// about the code and was written to go red the day somebody guarded it; this is
// that day, and the census at the bottom of this file is what proves nothing
// else moved with it.
//
// WHY THE EXCEPTION WAS RETIRED RATHER THAN DOCUMENTED. The reason the guard was
// never added is stated in `deleteProjectFile`'s docblock: `file:read-binary`
// carried an absolute-path exception for legacy callers. Those callers were
// ENUMERATED (all 24 production call sites of `window.api.readBinaryFile`) and
// every one of them either passes a PROJECT-RELATIVE path, or passes the
// absolute path in the BASE slot with `''` as the relative one — the idiom
// `readAbsolute` uses in export-sprite.ts and import-sheet.ts, and which
// survives this guard untouched because `isRelPathSafe('')` is true. Exactly one
// caller still put an absolute path in the RELATIVE slot
// (providers/chunk-library-import.ts, three reads of a file the user picked from
// a dialog); it was moved to the base-slot idiom in the same commit. So the
// exception has no remaining holder.
//
// AND THE GUARD IS NOT COSMETIC. Three of the enumerated callers interpolate a
// string READ OUT OF A PROJECT FILE into the relative path:
// `object-previews.ts` (a sprite name from `object-bindings.json`),
// `export-sprite.ts` (a sprite name from `index.json`), and both of those plus
// several more behind `projectDataRoot(config.raw)`, which derives a path PREFIX
// from `dataPath` in the project's own config — `dataRootOfPath` returns
// everything up to and including a `/data/`, so a config saying
// `../../data/foo` yields the prefix `../../data/`. The WRITE channel already
// refuses every one of those; the read channel did not.
//
// THE WORDING IS THIS RULE'S ALONE. `deleteProjectFile` and `performGuardedWrite`
// share the sentence "unsafe project-relative path (escapes root)", so this rule
// says "refused read of" first, as the write channel says "refused write to" —
// see this file's header. The rows below still lead with BEHAVIOUR (the bytes
// were not returned, and the control proves they were reachable).
// ═══════════════════════════════════════════════════════════════════════════
describe('readBinaryFile applies the guard', () => {
  it('refuses a `..` path whose target really exists, and returns no bytes', async () => {
    await expect(readBinaryFile(base, '../outside.bin')).rejects.toThrow(
      /^refused read of unsafe project-relative path \(escapes root\): '\.\.\/outside\.bin'$/,
    );
  });

  it('refuses an absolute path to a file that really exists', async () => {
    await expect(readBinaryFile(base, join(tmp, 'outside.bin'))).rejects.toThrow(
      /^refused read of unsafe project-relative path \(escapes root\)/,
    );
  });

  /**
   * A REFUSAL MUST NOT WEAR ENOENT'S COSTUME. This is FABRICATED-ENOENT one
   * channel over: `main/ipc-handlers.ts` converts a read failure into the
   * MissingFileMarker — and thence into a thrown "ENOENT: no such file or
   * directory" at the preload — ONLY under `e?.code === 'ENOENT'`. A refusal
   * that carried that code, or that merely said ENOENT in its text, would tell
   * the author their file does not exist when Aurora declined to look at it.
   * So: no errno code, and the word does not appear.
   */
  it('the refusal is not an ENOENT, in code or in wording', async () => {
    const err = await readBinaryFile(base, '../outside.bin').catch((e: unknown) => e);
    expect(err).toBeInstanceOf(Error);
    expect((err as NodeJS.ErrnoException).code).toBeUndefined();
    expect((err as Error).message).not.toMatch(/ENOENT/);
  });

  /**
   * THE CONTROL THAT MAKES THE THREE ABOVE MEAN SOMETHING: the same target file,
   * the same bytes, reached by a safe path from a base that makes it legal. It
   * reads. So the fs was willing the whole time and the refusals above were the
   * guard's decision, not a missing file.
   */
  it('CONTROL: the same real target reads through a base that makes it legal', async () => {
    expect([...(await readBinaryFile(tmp, 'outside.bin'))]).toEqual(OUTSIDE_BYTES);
    expect([...(await readBinaryFile(base, 'inside.bin'))]).toEqual(INSIDE_BYTES);
  });

  /**
   * THE LEGACY IDIOM, KEPT WORKING ON PURPOSE. Every remaining caller that reads
   * a file outside any project — a PNG the user picked from a dialog, an agent
   * request naming an absolute path — passes it as the BASE with `''` for the
   * relative part. `isRelPathSafe('')` is true (the empty string denotes the root
   * itself), so the guard does not touch them. If this row ever goes red, the
   * absolute-path callers listed in the header have lost their road and the fix
   * is NOT to weaken the guard.
   */
  it('CONTROL: the absolute-path idiom (path in the base slot, "" as the rel) still reads', async () => {
    expect([...(await readBinaryFile(join(tmp, 'outside.bin'), ''))]).toEqual(OUTSIDE_BYTES);
  });

  /**
   * A GENUINELY MISSING FILE IS STILL AN ENOENT, and it must be, because that is
   * the one failure `ipc-handlers.ts` converts to the missing-file marker and the
   * preload turns back into the sentence optional-file probes match on. Without
   * this row the guard could satisfy every row above by refusing everything.
   */
  it('CONTROL: a legal path that is genuinely missing still throws ENOENT', async () => {
    const err = await readBinaryFile(base, 'no-such-file.bin').catch((e: unknown) => e);
    expect((err as NodeJS.ErrnoException).code).toBe('ENOENT');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// THE ONE PRIMITIVE THAT APPLIES NO GUARD. It is here so the census above is
// COMPLETE rather than merely long: a reader counting rows can see that every
// export of file-io.ts is accounted for, and that this one is an absence by
// design rather than the same omission the rest of this file exists to close.
// The structural row at the bottom is what keeps that claim true over time.
// ═══════════════════════════════════════════════════════════════════════════
describe('the deliberately unguarded primitives', () => {
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
    probePath: true,
    fileMtime: true,
    probeDir: true,
    readBinaryFile: true,      // guarded 2026-09-08; the retired exception is above
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
