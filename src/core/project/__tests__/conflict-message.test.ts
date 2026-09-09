// FOUR CAUSES, FOUR SENTENCES, AND A REMEDY THAT IS NOT UNIVERSAL.
//
// ONE-MESSAGE-FOUR-CAUSES (lens sweep HIGH, fixed 2026-09-08): five author-facing
// surfaces said "N file(s) changed on disk since open ... Reload project to pick up
// external changes" for all four outcomes `planGuardedWrite` distinguishes. The
// cause half was wrong for three of them; the REMEDY half was worse, because it
// sent someone to an action that recovers nothing (a deleted file) or that trades
// their unsaved work for a file they have never seen (an appeared one).
//
// ⚠ WHY THE MATCHERS ARE WHAT THEY ARE. In a parcel about messages, the trap is a
// matcher a DIFFERENT rule satisfies, and here the specific trap is
// `/changed on disk/`: it was emitted for every cause before the fix, so a row
// keying on it proves nothing and in two places in this repo it actively PINNED the
// wrong sentence (see the notes in classic-save.test.ts and canvas-file.test.ts).
// Every row below therefore asserts both its own cause's wording AND the absence of
// the other causes' wording, and the reload rows assert presence and absence of the
// imperative rather than of the whole message.
//
// RED-FIRST: proven by (a) making `clauseFor` return the 'changed' clause for every
// cause and (b) making `adviceFor` always return the reload sentence. Both
// mutations are in the parcel's report; each takes a distinct subset of these rows
// red, which is itself the evidence that the cause half and the remedy half are
// separately guarded. Runner:
// `npx vitest run src/core/project/__tests__/conflict-message.test.ts`, inside
// `npm test`'s `vitest run`.
import { describe, it, expect } from 'vitest';
import {
  saveConflictAdvice, saveConflictCauses, saveConflictMessage,
} from '../conflict-message';
import type { ConflictCause, GuardConflict } from '../save-guard';

const c = (relPath: string, cause: ConflictCause, reason: string | null = null): GuardConflict =>
  ({ relPath, cause, reason });

const RELOAD = { imperative: 'Reload the project' };
const OPTS = { lead: 'Save aborted;', reload: RELOAD };

describe('the cause half', () => {
  it("'changed' says changed, which is the one case the old single sentence got right", () => {
    const m = saveConflictCauses([c('a.bin', 'changed')], { lead: 'Save aborted;' });
    expect(m).toContain('Save aborted; nothing was written.');
    expect(m).toContain('This changed on disk after Aurora read it: a.bin');
  });

  it("'deleted' says deleted, and never that the file changed", () => {
    const m = saveConflictCauses([c('a.bin', 'deleted')], { lead: 'Save aborted;' });
    expect(m).toContain('This was deleted on disk after Aurora read it: a.bin');
    expect(m).not.toMatch(/changed on disk/);
  });

  it("'appeared' says appeared, and says Aurora had never seen it", () => {
    const m = saveConflictCauses([c('new.png', 'appeared')], { lead: 'Save aborted;' });
    expect(m).toContain('This appeared on disk');
    expect(m).toContain('Aurora had never seen it');
    expect(m).toContain('new.png');
    expect(m).not.toMatch(/changed on disk/);
    expect(m).not.toMatch(/deleted/);
  });

  it("'unknown' says Aurora could not read the state, and quotes the probe's reason", () => {
    const m = saveConflictCauses(
      [c('a.bin', 'unknown', "EACCES: permission denied, stat 'a.bin'")],
      { lead: 'Save aborted;' },
    );
    expect(m).toContain('Aurora could not read the current state of this');
    expect(m).toContain("EACCES: permission denied, stat 'a.bin'");
    // The two false statements this cause used to produce.
    expect(m).not.toMatch(/changed on disk/);
    expect(m).not.toMatch(/deleted/);
  });

  it('CONTROL: the four causes give four pairwise-distinct clause sets for one path', () => {
    const causes: ConflictCause[] = ['changed', 'deleted', 'appeared', 'unknown'];
    const msgs = causes.map((cause) => saveConflictCauses([c('a.bin', cause, 'why')], { lead: 'X;' }));
    // Before the fix this set had size 1, for every surface.
    expect(new Set(msgs).size).toBe(4);
    for (const m of msgs) expect(m).toContain('a.bin');
  });

  it('groups by cause, worst first, and lists every path', () => {
    const m = saveConflictCauses([
      c('changed1.bin', 'changed'), c('gone.bin', 'deleted'),
      c('changed2.bin', 'changed'), c('blind.bin', 'unknown', 'EIO'),
    ], { lead: 'Save aborted;' });
    // deleted, then unknown, then changed: the author's worst news first.
    expect(m.indexOf('gone.bin')).toBeLessThan(m.indexOf('blind.bin'));
    expect(m.indexOf('blind.bin')).toBeLessThan(m.indexOf('changed1.bin'));
    // The two changed files share ONE clause rather than repeating the sentence.
    expect(m).toContain('These changed on disk after Aurora read them: changed1.bin, changed2.bin');
  });

  it('caps the path list when a surface asks it to, and says how many it dropped', () => {
    const many = ['a', 'b', 'c', 'd', 'e'].map((n) => c(`${n}.bin`, 'changed'));
    const m = saveConflictCauses(many, { lead: 'Save aborted:', maxPaths: 3 });
    expect(m).toContain('a.bin, b.bin, c.bin and 2 more');
    expect(m).not.toContain('d.bin');
  });

  it('an empty list is reported as an Aurora bug, not as a plausible sentence', () => {
    const m = saveConflictCauses([], { lead: 'Save aborted;' });
    expect(m).toContain('Aurora recorded no reason');
    expect(m).toContain('This is an Aurora bug');
  });
});

describe('the remedy half: reload is advised only when reloading is the fix', () => {
  it("advises the reload for 'changed', in the surface's own words", () => {
    expect(saveConflictAdvice([c('a.bin', 'changed')], RELOAD))
      .toBe('Reload the project to pick up the external changes.');
  });

  it("carries a surface's caveat into that sentence", () => {
    expect(saveConflictAdvice([c('a.png', 'changed')], {
      imperative: 'Reopen the canvas', caveat: 'your unsaved edits in this tab will be lost',
    })).toBe('Reopen the canvas to pick up the external changes (your unsaved edits in this tab will be lost).');
  });

  it("does NOT advise a reload for 'deleted', and says why reloading is not the answer", () => {
    const a = saveConflictAdvice([c('a.bin', 'deleted')], RELOAD);
    expect(a).toBe('Reloading will not bring back a file that was deleted.');
    // The defect: this cause used to end with "Reload project to pick up external
    // changes", an instruction that cannot do anything for it.
    expect(a).not.toMatch(/Reload the project/);
  });

  it("does NOT advise a reload for 'appeared', and says the unseen file is untouched", () => {
    const a = saveConflictAdvice([c('new.png', 'appeared')], RELOAD);
    expect(a).toBe('The file Aurora had not seen is untouched.');
    expect(a).not.toMatch(/Reload the project/);
  });

  it("does NOT advise a reload for 'unknown'", () => {
    const a = saveConflictAdvice([c('a.bin', 'unknown', 'EIO')], RELOAD);
    expect(a).toBe('A file Aurora cannot read the state of is left alone.');
    expect(a).not.toMatch(/Reload the project/);
  });

  it('MIXED: one changed and one deleted does not turn into a bare reload instruction', () => {
    // The case that most needs getting right: the old message would have told the
    // author to reload and said nothing about the file that had gone.
    const a = saveConflictAdvice([c('a.bin', 'changed'), c('gone.bin', 'deleted')], RELOAD);
    expect(a).toContain('Reloading will not bring back a file that was deleted');
    // The changed half is still addressed, as a scoped statement rather than as an
    // instruction that would read as covering both.
    expect(a).toContain('A reload would pick up the changed files only');
    expect(a).not.toMatch(/^Reload the project to pick up/);
  });

  it('CONTROL: the advice differs across the four causes, so no row is asserting a constant', () => {
    const causes: ConflictCause[] = ['changed', 'deleted', 'appeared', 'unknown'];
    const advices = causes.map((cause) => saveConflictAdvice([c('a.bin', cause, 'why')], RELOAD));
    expect(new Set(advices).size).toBe(4);
    // Exactly ONE of the four is the reload instruction.
    expect(advices.filter((a) => a?.startsWith('Reload the project to pick up'))).toHaveLength(1);
  });

  it('agrees in number: two deleted files get the plural sentence', () => {
    // A count-sensitive sentence with only a singular row behind it is how "1
    // file(s)" prose survives. Both forms are pinned.
    const a = saveConflictAdvice([c('a.bin', 'deleted'), c('b.bin', 'deleted')], RELOAD);
    expect(a).toBe('Reloading will not bring back files that were deleted.');
    expect(a).not.toBe(saveConflictAdvice([c('a.bin', 'deleted')], RELOAD));
  });

  it('an empty list has no advice at all', () => {
    expect(saveConflictAdvice([], RELOAD)).toBeNull();
  });
});

describe('saveConflictMessage joins the two halves', () => {
  it("a changed file gets cause and remedy in one string", () => {
    const m = saveConflictMessage([c('a.bin', 'changed')], OPTS);
    expect(m).toBe(
      'Save aborted; nothing was written. This changed on disk after Aurora read it: a.bin. '
      + 'Reload the project to pick up the external changes.',
    );
  });

  it('a deleted file gets the cause and the true negative, and no reload instruction', () => {
    const m = saveConflictMessage([c('gone.bin', 'deleted')], OPTS);
    expect(m).toBe(
      'Save aborted; nothing was written. This was deleted on disk after Aurora read it: gone.bin. '
      + 'Reloading will not bring back a file that was deleted.',
    );
  });
});
