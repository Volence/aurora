/**
 * THE GATE ON `scratchpad/lib/fixture-provenance.mjs`.
 *
 * The row it serves (Aurora's lens ledger, FIXTURE-REVISION-UNSTAMPED): no
 * harness records which revision of a sibling repo it ran against, so a stale
 * fixture is indistinguishable from a fresh one.
 *
 * WHY THESE ROWS DRIVE REAL GIT REPOSITORIES rather than a mocked `git`. The
 * whole value of the module is that its answers come from git and not from an
 * assumption about git, and a suite of stubs would have agreed with any wrong
 * command line I typed. Each row builds its own throwaway repository under
 * `mkdtemp`, commits into it, and dirties it. No sibling checkout is opened by
 * any row here, so nothing in this file can be moved by a peer lane's work.
 * The one injected-git row is the branch real git will not produce on demand:
 * `git status` itself failing.
 *
 * WHAT THE ROWS ARE ACTUALLY FOR, in the order they matter:
 *
 *   1. THE CLAIMS DO NOT FUSE. The same dirty measurement means two different
 *      things depending on how the bytes were obtained, and the module must say
 *      which. This suite was burned by a banner whose `revision:` followed git
 *      refs while its dirty marker followed a build, in one line, with nothing
 *      saying so. So the paired rows below take ONE dirty repository, read it in
 *      both modes, and require the rendered `tracks:` sentences to disagree.
 *
 *   2. UNKNOWN IS LOUD. A directory with no history throws by default; accepted
 *      by name, it renders `UNKNOWN:` and a banner, never a blank or a zero.
 *      A ref that does not resolve throws even with every allowance set, because
 *      that is a question the caller asked and git did not answer.
 *
 *   3. THE REVISION IS NOT A FEATURE CLAIM. `revisionNamesBytes` is false for a
 *      working-tree read even though a HEAD exists, and the rendered sentence
 *      for a committed read refuses the feature reading in words.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  fixtureProvenance,
  describeFixtureProvenance,
  announceFixture,
  claimsAreLabelled,
  FixtureProvenanceError,
  READ_MODES,
  UNKNOWN_BANNER,
} from '../../scratchpad/lib/fixture-provenance.mjs';

let work: string;
/** A real repository with one commit, then an uncommitted edit on top. */
let dirtyRepo: string;
/** The commit SHA in `dirtyRepo`, read out by this file rather than assumed. */
let dirtyHead: string;
/** A real repository with one commit and a clean tree. */
let cleanRepo: string;
/** A directory that is not a checkout at all. */
let notARepo: string;

function git(dir: string, args: string[]): string {
  return execFileSync('git', ['-C', dir, ...args], { encoding: 'utf8' }).trim();
}

function makeRepo(name: string): string {
  const dir = join(work, name);
  mkdirSync(dir);
  git(dir, ['init', '--quiet', '--initial-branch=main']);
  git(dir, ['config', 'user.email', 'gate@example.invalid']);
  git(dir, ['config', 'user.name', 'fixture provenance gate']);
  git(dir, ['config', 'commit.gpgsign', 'false']);
  writeFileSync(join(dir, 'shipped.json'), '{"id":"one"}\n');
  git(dir, ['add', 'shipped.json']);
  git(dir, ['commit', '--quiet', '-m', 'one']);
  return dir;
}

beforeAll(() => {
  work = mkdtempSync(join(tmpdir(), 'aurora-fixprov-'));
  dirtyRepo = makeRepo('dirty');
  writeFileSync(join(dirtyRepo, 'shipped.json'), '{"id":"one","edited":true}\n');
  dirtyHead = git(dirtyRepo, ['rev-parse', 'HEAD']);
  cleanRepo = makeRepo('clean');
  notARepo = join(work, 'plain-extract');
  mkdirSync(notARepo);
  writeFileSync(join(notARepo, 'shipped.json'), '{"id":"one"}\n');
});

afterAll(() => {
  rmSync(work, { recursive: true, force: true });
});

/**
 * ISO timestamps blanked out.
 *
 * ⚠ THIS IS LOAD-BEARING AND WAS MISSING, and the plant that established these
 * rows is what found it. The dirty-state claim renders its own capture time
 * inside its `tracks:` sentence, on purpose, because the claims do not share a
 * clock. Two renderings of the same repository are therefore ALWAYS unequal by
 * a few milliseconds, so a row comparing them raw can never fail: with the mode
 * distinction deleted from the module, "the two renderings actually differ"
 * stayed GREEN while the row beside it went red. A vacuous green next to a real
 * red is the failure this repo pays for most often, so the comparison is made
 * on the text with the clock removed and the timestamp gets its own row.
 */
function unclocked(text: string): string {
  return text.replace(/\d{4}-\d{2}-\d{2}T[\d:.]+Z/g, '<TIME>');
}

/** The `tracks:` sentence rendered for one claim, by label. */
function tracksOf(text: string, label: string): string {
  const lines = text.split('\n');
  const i = lines.findIndex((l) => l.trim().startsWith(`${label} `) || l.trim().startsWith(`${label} :`));
  expect(i, `no claim labelled "${label}" in:\n${text}`).toBeGreaterThanOrEqual(0);
  return lines[i + 1] ?? '';
}

describe('the ref asked for and the revision resolved are two claims, not one', () => {
  it('keeps the moving ref verbatim beside the SHA it resolved to', () => {
    const p = fixtureProvenance({
      peer: 'gatepeer', mode: READ_MODES.COMMITTED, ref: 'main', dir: cleanRepo, dirSource: 'built by this row',
    });
    expect(p.ref).toBe('main');
    expect(p.revision).toMatch(/^[0-9a-f]{40}$/);
    expect(p.revision).toBe(git(cleanRepo, ['rev-parse', 'main']));
    expect(p.revisionNamesBytes).toBe(true);
    // The ref must survive into the OUTPUT too. A record that keeps it and a
    // rendering that drops it are the same artifact to a reader.
    const text = describeFixtureProvenance(p);
    expect(text).toContain('main');
    expect(text).toContain(p.revision!);
    expect(tracksOf(text, 'ref asked for')).toContain('MOVING name');
  });

  it('says a full SHA cannot move, and does not call it a moving name', () => {
    const sha = git(cleanRepo, ['rev-parse', 'main']);
    const p = fixtureProvenance({
      peer: 'gatepeer', mode: READ_MODES.COMMITTED, ref: sha, dir: cleanRepo, dirSource: 'built by this row',
    });
    expect(tracksOf(describeFixtureProvenance(p), 'ref asked for')).not.toContain('MOVING name');
  });
});

describe('ONE dirty repository, read two ways, must not render one sentence', () => {
  it('committed mode says the uncommitted work is NOT in the fixture', () => {
    const p = fixtureProvenance({
      peer: 'gatepeer', mode: READ_MODES.COMMITTED, ref: 'main', dir: dirtyRepo, dirSource: 'built by this row',
    });
    expect(p.worktree).not.toBeNull();
    expect(p.worktree!.dirty).toBe(true);
    expect(p.worktree!.changed).toBe(1);
    expect(p.revision).toBe(dirtyHead);
    expect(p.revisionNamesBytes).toBe(true);
    const tracks = tracksOf(describeFixtureProvenance(p), 'gatepeer working tree');
    expect(tracks).toContain('are NOT in the bytes this run read');
  });

  it('worktree mode says the SAME dirt means no revision describes what was read', () => {
    const p = fixtureProvenance({
      peer: 'gatepeer', mode: READ_MODES.WORKTREE, dir: dirtyRepo, dirSource: 'built by this row',
    });
    expect(p.worktree!.dirty).toBe(true);
    expect(p.worktree!.changed).toBe(1);
    // A HEAD exists and is reported. What must NOT happen is it being read as
    // naming the bytes: that is the tree-identity-is-not-code-identity trap.
    expect(p.revision).toBe(dirtyHead);
    expect(p.revisionNamesBytes).toBe(false);
    const text = describeFixtureProvenance(p);
    expect(tracksOf(text, 'revision')).toContain('does NOT name the bytes this run read');
    expect(tracksOf(text, 'gatepeer working tree')).toContain('THIS FIXTURE');
  });

  it('the two renderings of that one repository actually differ', () => {
    const committed = describeFixtureProvenance(fixtureProvenance({
      peer: 'gatepeer', mode: READ_MODES.COMMITTED, ref: 'main', dir: dirtyRepo, dirSource: 'built by this row',
    }));
    const worktree = describeFixtureProvenance(fixtureProvenance({
      peer: 'gatepeer', mode: READ_MODES.WORKTREE, dir: dirtyRepo, dirSource: 'built by this row',
    }));
    // Same directory, same commit, same dirt. If these ever render alike the
    // module has fused two claims back into one and the reader cannot tell a
    // fixture that a revision names from one it does not.
    expect(unclocked(committed)).not.toBe(unclocked(worktree));
    expect(unclocked(tracksOf(committed, 'revision')))
      .not.toBe(unclocked(tracksOf(worktree, 'revision')));
    expect(unclocked(tracksOf(committed, 'gatepeer working tree')))
      .not.toBe(unclocked(tracksOf(worktree, 'gatepeer working tree')));
    // The one thing that must be IDENTICAL: the measurement itself. The modes
    // differ in what the dirt MEANS, not in what git counted. If these ever come
    // apart the module is deriving the dirty state twice.
    expect(unclocked(tracksOf(committed, 'gatepeer working tree'))).not.toBe('');
    expect(committed).toContain('DIRTY, 1 path(s) uncommitted');
    expect(worktree).toContain('DIRTY, 1 path(s) uncommitted');
  });

  it('a clean tree says so rather than saying nothing', () => {
    const p = fixtureProvenance({
      peer: 'gatepeer', mode: READ_MODES.WORKTREE, dir: cleanRepo, dirSource: 'built by this row',
    });
    expect(p.worktree!.dirty).toBe(false);
    expect(describeFixtureProvenance(p)).toContain('clean, nothing uncommitted');
  });
});

describe('a ref beside working-tree bytes is refused, not printed', () => {
  it('refuses worktree mode with a ref, naming the misreading', () => {
    expect(() => fixtureProvenance({
      peer: 'gatepeer', mode: READ_MODES.WORKTREE, ref: 'main', dir: cleanRepo, dirSource: 'built by this row',
    })).toThrow(/reads as a claim that the bytes came from that revision/);
  });

  it('refuses committed mode with no ref, because a resolved SHA loses the question', () => {
    expect(() => fixtureProvenance({
      peer: 'gatepeer', mode: READ_MODES.COMMITTED, dir: cleanRepo, dirSource: 'built by this row',
    })).toThrow(/needs the ref the caller asked for/);
  });

  it('refuses a mode it was not given, because the mode decides what the revision means', () => {
    expect(() => fixtureProvenance({
      peer: 'gatepeer', dir: cleanRepo, dirSource: 'built by this row',
    } as never)).toThrow(/mode must be one of/);
  });

  it('refuses an explicit dir with no stated origin', () => {
    expect(() => fixtureProvenance({
      peer: 'gatepeer', mode: READ_MODES.WORKTREE, dir: cleanRepo,
    })).toThrow(/must come with dirSource/);
  });
});

describe('unknown is loud, and never a blank, a zero or an omitted field', () => {
  it('a directory with no history THROWS by default', () => {
    expect(() => fixtureProvenance({
      peer: 'gatepeer', mode: READ_MODES.WORKTREE, dir: notARepo, dirSource: 'built by this row',
    })).toThrow(/could not be measured, and none of them was allowed by name/);
  });

  it('accepted by name, it renders UNKNOWN with the reason and a banner', () => {
    const p = fixtureProvenance({
      peer: 'gatepeer',
      mode: READ_MODES.WORKTREE,
      dir: notARepo,
      dirSource: 'built by this row',
      allowUnrevisioned: true,
    });
    expect(p.revision).toBeNull();
    expect(p.revisionNamesBytes).toBe(false);
    expect(p.unknown.map((u) => u.claim).sort()).toEqual(['revision', 'worktree']);
    const text = describeFixtureProvenance(p);
    expect(text).toContain(UNKNOWN_BANNER);
    expect(text).toContain('is not a git checkout');
    expect(text).toContain('CANNOT BE COMPARED WITH ANY OTHER RUN');
    // The failure mode this row exists for: a field rendered empty. Every claim
    // line must carry a value after its colon.
    for (const line of text.split('\n')) {
      if (!line.includes(' : ')) continue;
      expect(line.split(' : ').slice(1).join(' : ').trim().length,
        `claim line rendered with an empty value: ${JSON.stringify(line)}`).toBeGreaterThan(0);
    }
  });

  it('a ref that does not resolve throws even with EVERY allowance set', () => {
    // Deliberately not an allowance. `allowUnrevisioned` accepts a directory
    // that never had history; it must not also swallow a named revision that
    // git could not find, which is a question asked and unanswered.
    expect(() => fixtureProvenance({
      peer: 'gatepeer',
      mode: READ_MODES.COMMITTED,
      ref: 'origin/does-not-exist',
      dir: cleanRepo,
      dirSource: 'built by this row',
      allowUnrevisioned: true,
      allowUnknownWorktreeState: true,
    })).toThrow(/does not resolve to a commit/);
  });

  it('an unreadable dirty state is loud, and it is a SEPARATE allowance', () => {
    // The one injected-git row: real git will not fail `status` on demand.
    const brokenStatus = (dir: string, args: string[]) => {
      if (args.includes('status')) return { ok: false, why: 'git status exited 128 (simulated)' };
      return { ok: true, out: execFileSync('git', ['-C', dir, ...args], { encoding: 'utf8' }) };
    };
    expect(() => fixtureProvenance({
      peer: 'gatepeer',
      mode: READ_MODES.WORKTREE,
      dir: cleanRepo,
      dirSource: 'built by this row',
      git: brokenStatus,
      allowUnrevisioned: true,
    })).toThrow(/allowUnknownWorktreeState/);

    const p = fixtureProvenance({
      peer: 'gatepeer',
      mode: READ_MODES.WORKTREE,
      dir: cleanRepo,
      dirSource: 'built by this row',
      git: brokenStatus,
      allowUnknownWorktreeState: true,
    });
    expect(p.worktree).toBeNull();
    const text = describeFixtureProvenance(p);
    expect(text).toContain('simulated');
    expect(text).toContain(UNKNOWN_BANNER);
  });

  it('a checkout that is not there is a hard error and not a skip', () => {
    expect(() => fixtureProvenance({
      peer: 'gatepeer',
      mode: READ_MODES.WORKTREE,
      dir: join(work, 'absent-on-purpose'),
      dirSource: 'built by this row',
    })).toThrow(FixtureProvenanceError);
    expect(() => fixtureProvenance({
      peer: 'gatepeer',
      mode: READ_MODES.WORKTREE,
      dir: join(work, 'absent-on-purpose'),
      dirSource: 'built by this row',
    })).toThrow(/hard error and not a skip/);
  });
});

describe('every claim says what it tracks, and carries its own clock', () => {
  it('a real record is fully labelled', () => {
    const p = fixtureProvenance({
      peer: 'gatepeer', mode: READ_MODES.COMMITTED, ref: 'main', dir: dirtyRepo, dirSource: 'built by this row',
    });
    expect(claimsAreLabelled(p)).toBe(true);
    expect(p.claims.length).toBe(5);
    for (const c of p.claims) expect(c.tracks.length).toBeGreaterThan(0);
  });

  it('EVERY claim line in the rendering is followed by its own tracks line', () => {
    // Derived from the record rather than from a count typed here, so a claim
    // added later without a referent fails instead of slipping through.
    const p = fixtureProvenance({
      peer: 'gatepeer', mode: READ_MODES.COMMITTED, ref: 'main', dir: dirtyRepo, dirSource: 'built by this row',
    });
    const lines = describeFixtureProvenance(p).split('\n');
    for (const c of p.claims) {
      const i = lines.findIndex((l) => l.includes(` : ${c.value}`));
      expect(i, `claim ${c.label} did not render`).toBeGreaterThanOrEqual(0);
      expect(lines[i + 1]).toContain('tracks:');
      expect(lines[i + 1]).toContain(c.tracks);
    }
  });

  it('REFUSES to render a record whose claim lost its tracks sentence', () => {
    const p = fixtureProvenance({
      peer: 'gatepeer', mode: READ_MODES.COMMITTED, ref: 'main', dir: dirtyRepo, dirSource: 'built by this row',
    });
    const stripped = { ...p, claims: p.claims.map((c, i) => (i === 3 ? { ...c, tracks: '' } : c)) };
    expect(claimsAreLabelled(stripped)).toBe(false);
    expect(() => describeFixtureProvenance(stripped)).toThrow(/refuses to render/);
  });

  it('the dirty-state claim carries the timestamp of ITS read, not the record\'s', () => {
    const p = fixtureProvenance({
      peer: 'gatepeer', mode: READ_MODES.COMMITTED, ref: 'main', dir: dirtyRepo, dirSource: 'built by this row',
    });
    const claim = p.claims.find((c) => c.label === 'gatepeer working tree')!;
    expect(claim.at).toBe(p.worktree!.at);
    expect(claim.tracks).toContain(p.worktree!.at);
  });

  it('the revision sentence refuses the feature reading in words', () => {
    const p = fixtureProvenance({
      peer: 'gatepeer', mode: READ_MODES.COMMITTED, ref: 'main', dir: cleanRepo, dirSource: 'built by this row',
    });
    const claim = p.claims.find((c) => c.label === 'revision')!;
    expect(claim.tracks).toContain('is NOT evidence that any feature is present');
  });
});

describe('announceFixture prints the block a reader sees', () => {
  it('writes the same text describe renders, and returns the record', () => {
    let seen = '';
    const p = announceFixture({
      peer: 'gatepeer', mode: READ_MODES.COMMITTED, ref: 'main', dir: cleanRepo, dirSource: 'built by this row',
    }, (s: string) => { seen += s; });
    expect(seen).toBe(`${describeFixtureProvenance(p)}\n`);
    expect(seen).toContain(p.revision!);
  });
});
