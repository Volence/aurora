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
 * from a linked worktree alike, and `AURORA_PEER_ROOT` / `AURORA_<NAME>_REPO`
 * override it.
 */

import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/** This repository's own root (the worktree we are running in). */
export const AURORA_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

function git(cwd: string, args: string[]): string | null {
  try {
    return execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
  } catch {
    return null;
  }
}

/**
 * The directory that holds this repo and its siblings.
 *
 * Derived, not typed: `--git-common-dir` is the MAIN checkout's `.git` even when
 * we are running inside a linked worktree (where `--show-toplevel` would answer
 * with the worktree, several levels down), so `dirname(dirname(...))` is the
 * sibling root in both cases.
 */
export function siblingRoot(): string | null {
  const override = process.env.AURORA_PEER_ROOT;
  if (override) return existsSync(override) ? override : null;
  const common = git(AURORA_ROOT, ['rev-parse', '--path-format=absolute', '--git-common-dir'])?.trim();
  if (!common) return null;
  return dirname(dirname(common));
}

/**
 * Path to a peer repo's checkout, or null. Only ever handed to `git -C`; nothing
 * in this module opens a file underneath it.
 */
export function peerRepo(name: string): string | null {
  const override = process.env[`AURORA_${name.toUpperCase()}_REPO`];
  const dir = override ?? (() => { const r = siblingRoot(); return r === null ? null : resolve(r, name); })();
  if (dir === null || !existsSync(dir)) return null;
  return git(dir, ['rev-parse', '--is-inside-work-tree']) === null ? null : dir;
}

/** Full 40-hex commit SHA for `rev` in `repo`, or null when it does not resolve there. */
export function resolveRev(repo: string, rev: string): string | null {
  const sha = git(repo, ['rev-parse', '--verify', '--quiet', `${rev}^{commit}`])?.trim();
  return sha && /^[0-9a-f]{40}$/.test(sha) ? sha : null;
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
  if (text === null) return { ok: false, why: `MEASURED: ${path} is ABSENT at ${rev} (${sha}) — deleted or renamed` };
  const blob = git(repo, ['rev-parse', `${sha}:${path}`])?.trim() ?? '';
  return { ok: true, text, blob };
}

/** True when `ancestor` is reachable from `descendant` — i.e. the pin is PUBLISHED, not local-only. */
export function isAncestor(repo: string, ancestor: string, descendant: string): boolean {
  return git(repo, ['merge-base', '--is-ancestor', ancestor, descendant]) !== null;
}

/** `git hash-object`'s answer for a blob, computed here so no peer repo is needed for it. */
export function gitBlobSha(text: string): string {
  const body = Buffer.from(text, 'utf8');
  const header = Buffer.from(`blob ${body.length}\0`, 'utf8');
  return createHash('sha1').update(Buffer.concat([header, body])).digest('hex');
}
