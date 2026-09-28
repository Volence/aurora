/**
 * Reading a PEER repo — at a REVISION, never through its working tree.
 *
 * WHY THIS FILE EXISTS. On this machine every sibling repo (`../aeon`,
 * `../empyrean`, `../s1disasm`, …) is some peer lane's LIVE WORKING TREE. A test
 * that opens one by filesystem path is not comparing against anything a revision
 * names — it is comparing against whatever that peer happens to have typed and
 * not committed yet, so its green and its red are both decided outside this
 * repository. The suite protocol names this as its most upstream rule
 * (`empyrean` `docs/OVERSEER-PROTOCOL.md` at `origin/main` 2fd7b5f0, "Read this
 * file at a COMMITTED revision, never through the filesystem path", and its
 * shared-machine companion: "prefer `git show <rev>:<path>` over reading a
 * sibling's working file, because the first names a revision and the second
 * silently names 'whatever is on disk right now'"). It had been applied to
 * documentation and never swept through test fixtures — see
 * `docs/reviews/2026-08-28-golden-live-tree.md`.
 *
 * Everything here goes through git plumbing, so it reads OBJECTS. It never opens
 * a file inside a peer checkout, and it never writes to one.
 *
 * NO ABSOLUTE PEER PATH IS WRITTEN DOWN HERE either: the sibling root is derived
 * from this repo's own git common dir, so it is correct from a plain clone and
 * from a linked worktree alike, and the suite's variables override it:
 * `<NAME>_DIR` (`AEON_DIR`) first, then `EMPYREAN_SUITE_ROOT`, with
 * `AURORA_<NAME>_REPO` / `AURORA_PEER_ROOT` accepted as transitional aliases
 * (empyrean `contract/SUITE_PATHS.md` @ 82982b7f).
 */

import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';

import { AURORA_DIR, siblingRoot, siblingPath } from './sibling-root.mjs';

/**
 * THE SIBLING-ROOT DERIVATION IS NOT DEFINED HERE ANY MORE, and that is the
 * point rather than tidiness. It used to live in this file, where only tsc-
 * compiled code could reach it — so `scripts/check-peer-path-literals.mjs`,
 * the gate that FORBIDS hand-typed peer paths, carried its own private copy,
 * and that copy silently ignored `AURORA_PEER_ROOT` while its docblock claimed
 * to derive the root "exactly as `peer-repo.ts` derives it". One definition now
 * lives in `sibling-root.mjs`, which node and tsc can both read; re-exported
 * here so this module's existing importers are unaffected.
 */
export { AURORA_DIR, siblingRoot };

/**
 * ⚠ `maxBuffer` IS LOAD-BEARING AND WAS MISSING, WHICH MADE THIS HELPER LIE.
 *
 * Node's default is 1 MiB. `execFileSync` does not truncate past it — it THROWS
 * `ENOBUFS` — and this function's `catch` turned that into `null`, which
 * `readAtRev` reports as `"MEASURED: <path> is ABSENT at <rev>: deleted or
 * renamed"`. So every peer file over a megabyte read as DELETED, with a message
 * asserting the read succeeded. aeon's `docs/DEFERRED_WORK.md` is 2.1 MB and hit
 * it the first time a row read that file (2026-09-06, `parcel/curve-onset`).
 *
 * TWO CHANGES, because the size alone would only move the cliff:
 *   • 64 MiB, matching `grepAtRev`, which had always passed one;
 *   • ENOBUFS is RETHROWN rather than swallowed. A buffer overrun is not "git
 *     said no", and the whole value of this module is that "could not measure"
 *     and "measured, and it is not there" stay different answers.
 */
const GIT_MAX_BUFFER = 64 * 1024 * 1024;

function git(cwd: string, args: string[]): string | null {
  try {
    return execFileSync('git', args, {
      cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], maxBuffer: GIT_MAX_BUFFER,
    });
  } catch (e) {
    if ((e as { code?: string }).code === 'ENOBUFS') {
      throw new Error(
        `peer-repo: git ${args.join(' ')} in ${cwd} exceeded the ${GIT_MAX_BUFFER}-byte read `
        + 'buffer. This is NOT an absent path. Raise GIT_MAX_BUFFER rather than letting the '
        + 'caller report a deletion.',
      );
    }
    return null;
  }
}

/**
 * Path to a peer repo's checkout, or null. Only ever handed to `git -C`; nothing
 * in this module opens a file underneath it.
 */
export function peerRepo(name: string): string | null {
  const dir = siblingPath(name);
  if (dir === null || !existsSync(dir)) return null;
  return git(dir, ['rev-parse', '--is-inside-work-tree']) === null ? null : dir;
}

/**
 * Full 40-hex commit SHA for `rev` in `repo`, or null when it does not resolve there.
 *
 * WHEN `rev` IS A REF NAME (`origin/master`, not a pinned SHA) THIS ALSO DECLARES
 * IT, once per module, through `announcePeerRef` below. That is ROADMAP row 187:
 * every currency gate in this repo resolves its peer tip here, so this is the one
 * place the declaration can come from without touching the gates themselves.
 */
export function resolveRev(repo: string, rev: string): string | null {
  const out = git(repo, ['rev-parse', '--verify', '--quiet', `${rev}^{commit}`])?.trim();
  const sha = out && /^[0-9a-f]{40}$/.test(out) ? out : null;
  if (sha !== null) announcePeerRef(repo, rev, sha);
  return sha;
}

/**
 * HOW STALE IS THE PEER REF A GATE JUST COMPARED AGAINST (ROADMAP row 187).
 *
 * Every currency gate here reads a peer's LOCAL remote-tracking ref through git
 * objects and never fetches. That is deliberate and stays so: a fetching gate
 * makes its verdict depend on the network and on when it ran. The price is that
 * its green is only as fresh as whoever last moved that ref, and until this
 * existed nothing in the output said how fresh that was. So the gate now
 * DECLARES what it compared: the ref, the SHA it resolved to, and when the ref
 * last MOVED in the peer's local repo.
 *
 * ⚠ THE QUANTITY IS THE REFLOG ENTRY'S TIME, NOT THE COMMIT'S DATE. They are
 * different things and easy to confuse, because `git log -g --format=%ct` prints
 * the COMMIT date while walking the reflog. The commit date says when somebody
 * made the commit; a fetch today of a commit made last month moves the ref today.
 * What bounds staleness is when this repo last learned the value, which is the
 * reflog entry, read here from `%gd` under `--date=unix` (`origin/master@{<t>}`).
 * It is still only a BOUND: a fetch that found nothing new moves no ref and
 * writes no entry, so the ref may have been confirmed current more recently
 * than the time printed. The printed age is the conservative one.
 *
 * WHEN THE TIME CANNOT BE KNOWN it says UNKNOWN and why, in words, never a zero
 * or an invented date: no reflog at all (logging off, expired, a ref written
 * without logging), or a newest entry naming a different commit from the one
 * the ref resolves to (the ref moved without being logged, so the logged time
 * belongs to another value).
 *
 * Read only: `rev-parse` and `log -g` read refs and logs, fetch nothing and
 * write nothing, because every peer repo is some other lane's live checkout.
 *
 * Returns null when `rev` is not a ref name at all (a SHA pin, which names its
 * bytes forever and has no freshness to declare).
 */
export type PeerRefDeclaration = {
  /** The ref's full name, `refs/remotes/origin/master`. */
  fullRef: string;
  sha: string;
  /** When the ref last moved, or null when that cannot be determined. */
  updatedAt: Date | null;
  /** Why `updatedAt` is null, written to be read; null when it is known. */
  unknownWhy: string | null;
  /** The sentence printed into the run's output. */
  line: string;
};

/** The marker every printed declaration starts with, so a reader can grep a run for it. */
export const PEER_REF_MARKER = '[peer-ref]';

function ago(ms: number): string {
  const future = ms < 0;
  const min = Math.floor(Math.abs(ms) / 60000);
  const span = min < 1 ? 'under 1 min'
    : min < 60 ? `${min} min`
    : min < 48 * 60 ? `${Math.floor(min / 60)} h ${min % 60} min`
    : `${Math.floor(min / 1440)} d ${Math.floor((min % 1440) / 60)} h`;
  return future
    ? `${span} AFTER this run started, so the two clocks disagree`
    : `${span} before this run`;
}

export function declarePeerRef(repo: string, rev: string, now: Date = new Date()): PeerRefDeclaration | null {
  const fullRef = git(repo, ['rev-parse', '--symbolic-full-name', rev])?.trim() ?? '';
  if (!fullRef.startsWith('refs/')) return null;
  const sha = resolveShaQuietly(repo, fullRef);
  const peer = `peer ${repo.split(/[\\/]/).filter(Boolean).pop() ?? repo} ${rev}`;
  if (sha === null) {
    // Named a ref, but the ref does not resolve to a commit. The caller's own
    // resolve already said so; this is here so the function never lies.
    const why = `${fullRef} does not resolve to a commit in ${repo}`;
    return { fullRef, sha: '', updatedAt: null, unknownWhy: why, line: `${peer} = (unresolved), ref update time UNKNOWN: ${why}` };
  }
  const head = `${peer} = ${sha.slice(0, 8)}`;
  const unknown = (why: string): PeerRefDeclaration => ({
    fullRef, sha, updatedAt: null, unknownWhy: why, line: `${head}, ref update time UNKNOWN: ${why}`,
  });
  const entry = git(repo, ['log', '-g', '-n1', '--date=unix', '--format=%H%x00%gd%x00%gs', fullRef]);
  if (entry === null) return unknown(`git log -g could not read the reflog of ${fullRef} in ${repo}`);
  if (entry.trim() === '') {
    return unknown(`${fullRef} has NO REFLOG in ${repo} (logging off, entries expired, or the ref was `
      + 'written without logging), so nothing records when it last moved');
  }
  const [logged = '', selector = '', subject = ''] = entry.replace(/\n$/, '').split('\0');
  const t = /@\{(\d+)\}$/.exec(selector);
  if (t === null) return unknown(`the reflog selector "${selector}" for ${fullRef} carries no unix time`);
  if (logged !== sha) {
    return unknown(`the newest reflog entry of ${fullRef} names ${logged.slice(0, 8)}, not the `
      + `${sha.slice(0, 8)} the ref resolves to, so the ref moved without being logged`);
  }
  const updatedAt = new Date(Number(t[1]) * 1000);
  const iso = updatedAt.toISOString().replace(/\.\d{3}Z$/, 'Z');
  return {
    fullRef, sha, updatedAt, unknownWhy: null,
    line: `${head}, ref last updated ${iso} (${ago(now.getTime() - updatedAt.getTime())}; reflog: "${subject}")`,
  };
}

function resolveShaQuietly(repo: string, rev: string): string | null {
  const out = git(repo, ['rev-parse', '--verify', '--quiet', `${rev}^{commit}`])?.trim();
  return out && /^[0-9a-f]{40}$/.test(out) ? out : null;
}

/**
 * Print a ref's declaration into the run's output, once per module and value.
 *
 * `console.log` is the route because it already reaches a human on a PASSING
 * run: vitest.config.ts names its reporters explicitly precisely so a passing
 * test's console output is not swallowed, and
 * `test/config/reporter-visibility.test.ts` guards that. No reporter carries a
 * note for a pass today (the skip reporter reads notes only off skips), so this
 * reuses the one surface that is already proven visible rather than adding one.
 *
 * Keyed on the resolved SHA as well as the ref, so a ref that moves mid-file
 * is declared again rather than hidden behind its first value.
 */
const announced = new Set<string>();

function announcePeerRef(repo: string, rev: string, sha: string): void {
  const key = `${repo}\0${rev}\0${sha}`;
  if (announced.has(key)) return;
  announced.add(key);
  const d = declarePeerRef(repo, rev);
  if (d !== null) console.log(`${PEER_REF_MARKER} ${d.line}`);
}

export type PeerBlob =
  | { ok: true; text: string; blob: string }
  /** `why` is written to be printed verbatim in a skip or a failure message. */
  | { ok: false; why: string };

/**
 * `git -C <repo> show <rev>:<path>` — the whole point of this module.
 *
 * Distinguishes "could not measure" (repo or revision absent → the caller should
 * SKIP, loudly) from "measured, and the path is not there at that revision"
 * (→ the caller should FAIL: a vendored fixture whose source has been deleted or
 * renamed is exactly the drift a currency check exists to catch).
 */
export function readAtRev(repo: string, rev: string, path: string): PeerBlob {
  const sha = resolveRev(repo, rev);
  if (sha === null) return { ok: false, why: `revision ${rev} does not resolve in ${repo} (unfetched? shallow?)` };
  const text = git(repo, ['show', `${sha}:${path}`]);
  if (text === null) return { ok: false, why: `MEASURED: ${path} is ABSENT at ${rev} (${sha}): deleted or renamed` };
  const blob = git(repo, ['rev-parse', `${sha}:${path}`])?.trim() ?? '';
  return { ok: true, text, blob };
}

/**
 * `git -C <repo> grep -l <pattern> <rev> -- <paths>` — which files AT A REVISION
 * match, as repo-relative paths.
 *
 * The committed-revision answer to a question that is otherwise asked with a
 * shell `grep -rl` over a peer's working directory, which measures whatever that
 * lane has typed and not committed — and which, on a machine without the peer,
 * either throws or answers with the exit status of a failed command.
 *
 * ⚠ IT DISTINGUISHES "NO MATCHES" FROM "COULD NOT RUN", because `git grep`
 * spells both as a non-zero exit. Exit 1 is the honest empty answer (and for a
 * completeness row, an empty answer is a FAILURE, not a skip); anything else is
 * a repo or revision problem, which the caller must report as unmeasured.
 */
export type PeerGrep =
  | { ok: true; files: string[] }
  | { ok: false; why: string };

export function grepAtRev(repo: string, rev: string, pattern: string, paths: string[]): PeerGrep {
  const sha = resolveRev(repo, rev);
  if (sha === null) return { ok: false, why: `revision ${rev} does not resolve in ${repo} (unfetched? shallow?)` };
  try {
    const out = execFileSync(
      'git',
      ['-C', repo, 'grep', '--extended-regexp', '--files-with-matches', pattern, sha, '--', ...paths],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 64 * 1024 * 1024 },
    );
    // Each line is `<sha>:<path>`; the revision prefix is noise to the caller.
    return { ok: true, files: out.split('\n').filter((l) => l.length > 0).map((l) => l.slice(sha.length + 1)) };
  } catch (e) {
    const status = (e as { status?: number }).status;
    if (status === 1) return { ok: true, files: [] };
    return { ok: false, why: `git grep exited ${status ?? '?'} in ${repo} at ${rev} (${sha})` };
  }
}

/** True when `ancestor` is reachable from `descendant` — i.e. the pin is PUBLISHED, not local-only. */
export function isAncestor(repo: string, ancestor: string, descendant: string): boolean {
  return git(repo, ['merge-base', '--is-ancestor', ancestor, descendant]) !== null;
}

/**
 * THE BRANCH THAT ANSWERS CURRENCY, read as an ASSERTION and not as a property.
 *
 * Every currency gate in this repo steers by one field in a provenance sidecar,
 * `<repo>.branch_that_answers_currency`: the published branch whose tip answers
 * "is the vendored copy still what the peer ships". Four gates read it with a
 * bare property access off an unchecked `JSON.parse`
 * (effects-schema-drift, effects-preset-schema-drift, effects-channel-bands-drift
 * and effects-preset-vectors), and the sweep at the bottom of
 * aeon-fixture-currency reads it with a typeof check and a repo default.
 *
 * ⚠ WHAT LOSING IT LOOKED LIKE, measured on 2026-09-09 rather than reasoned
 * about. Delete the line from
 * `src/core/formats/effects/aurora-effects-scene.schema.provenance.json` and the
 * whole `npm test` chain stays GREEN: the drift file reports 14 passed, 2
 * skipped, and the two skips say `undefined does not resolve in <empyrean>` --
 * a message shaped exactly like an unfetched peer. Every integrity row beside
 * them passes, because the field is not payload to any of them. So the currency
 * question stops being asked and the suite says nothing is wrong.
 *
 * BE HONEST ABOUT REACH. The re-vendor script updates this field in place and
 * cannot drop it, so the reachable path to the loss is a HAND AUTHORED sidecar,
 * which is how all three under `src/core/formats/effects/` were written. That is
 * why this is a medium row and not a fire.
 *
 * SO THE READ IS SPLIT IN TWO. `tip` is what a caller steers by, and it is never
 * `undefined`: an unusable field yields a placeholder that cannot resolve as a
 * revision and that says so wherever it is printed. `defect` is the sentence a
 * gate asserts on, in a row that needs no peer repo, so the loss is a NAMED
 * failure rather than a degradation into a peer shaped excuse.
 *
 * `present` exists because the sweep legitimately falls back to a repo default
 * for a sidecar that names no branch, and must NOT fall back for one that names
 * a malformed branch. Absent and malformed are different answers.
 */
export const CURRENCY_BRANCH_KEY = 'branch_that_answers_currency';

/**
 * A remote-tracking ref, `<remote>/<name>`. The shape is the design rule, not a
 * spelling preference: currency is answered by a ref that no local edit can
 * move (this module's whole premise), and every value on disk today is one
 * (`origin/main`, `origin/master`, `origin/AS`). A bare local branch name would
 * pass a "non-empty string" check and reintroduce exactly what the PUBLISHED,
 * not local-only rows exist to refuse.
 */
export const CURRENCY_BRANCH_SHAPE = /^[A-Za-z0-9._-]+\/[A-Za-z0-9._/-]+$/;

/** Printed in titles and messages when the sidecar cannot say. Never resolves. */
export const NO_CURRENCY_BRANCH = '(NO BRANCH: the provenance sidecar names none)';

export type CurrencyBranch = {
  /** The branch to steer by, or `NO_CURRENCY_BRANCH`. Never undefined. */
  tip: string;
  /** Whether the key was there at all, however malformed its value. */
  present: boolean;
  /** A sentence naming what is wrong, or null. Assert `toBeNull()` on it. */
  defect: string | null;
};

/**
 * Read `<block>.branch_that_answers_currency`, asserting rather than assuming.
 * `sidecar` is an absolute path, shortened here so the caller does not restate
 * the repo root; `repo` is the block's own key, so the message names the block
 * that is wrong when a sidecar carries several.
 */
export function currencyBranch(block: unknown, sidecar: string, repo: string): CurrencyBranch {
  const short = sidecar.startsWith(AURORA_DIR) ? sidecar.slice(AURORA_DIR.length + 1) : sidecar;
  const where = `${short}: the "${repo}" block`;
  const fix = `Every currency gate steers by "${CURRENCY_BRANCH_KEY}". Restore it as a `
    + 'remote-tracking ref, for example "origin/main", or the currency question stops '
    + 'being asked and the suite goes quiet about it.';
  if (typeof block !== 'object' || block === null || Array.isArray(block)) {
    return { tip: NO_CURRENCY_BRANCH, present: false, defect: `${where} is not an object. ${fix}` };
  }
  const raw = (block as Record<string, unknown>)[CURRENCY_BRANCH_KEY];
  if (raw === undefined) {
    return { tip: NO_CURRENCY_BRANCH, present: false, defect: `${where} has no "${CURRENCY_BRANCH_KEY}". ${fix}` };
  }
  if (typeof raw !== 'string') {
    return {
      tip: NO_CURRENCY_BRANCH,
      present: true,
      defect: `${where} spells "${CURRENCY_BRANCH_KEY}" as ${typeof raw}, not a string. ${fix}`,
    };
  }
  if (!CURRENCY_BRANCH_SHAPE.test(raw)) {
    return {
      tip: NO_CURRENCY_BRANCH,
      present: true,
      defect: `${where} names "${raw}" as its ${CURRENCY_BRANCH_KEY}, which is not a `
        + `remote-tracking ref of the form remote/name. ${fix}`,
    };
  }
  return { tip: raw, present: true, defect: null };
}

/** `git hash-object`'s answer for a blob, computed here so no peer repo is needed for it. */
export function gitBlobSha(text: string): string {
  const body = Buffer.from(text, 'utf8');
  const header = Buffer.from(`blob ${body.length}\0`, 'utf8');
  return createHash('sha1').update(Buffer.concat([header, body])).digest('hex');
}
