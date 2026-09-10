// parseTypedProjectPath — the SECOND DOOR's parser (UX seat A, F1).
//
// The finding it answers: Aurora advertises exactly one way in, it is a native
// modal, and the seat that clicked it saw nothing at all and had nowhere else
// to go. The seat refused to attribute the missing dialog (headless X with no
// window manager cannot show a native modal either) and so does this file. What
// is tested here is the door that exists regardless of that attribution.
//
// EVERY REFUSAL IS ASSERTED ON ITS OWN WORDING, not on `ok === false`. Four of
// these rules refuse, and a matcher that only checks the boolean would pass with
// all four wired to one generic sentence — which is precisely the shape this
// repo has been burned by (an assertion matching wording a DIFFERENT rule also
// used, green for the wrong reason its whole life). Each row below names a
// phrase only its own rule produces.

import { describe, it, expect } from 'vitest';
import { parseTypedProjectPath } from '../project-path';

function ok(raw: string): string {
  const r = parseTypedProjectPath(raw);
  if (!r.ok) throw new Error(`expected ${JSON.stringify(raw)} to parse, got refusal: ${r.why}`);
  return r.dir;
}

function why(raw: string): string {
  const r = parseTypedProjectPath(raw);
  if (r.ok) throw new Error(`expected ${JSON.stringify(raw)} to be refused, got dir: ${r.dir}`);
  return r.why;
}

describe('parseTypedProjectPath accepts the spellings a person actually arrives with', () => {
  it('a plain absolute path', () => {
    expect(ok('/home/u/s1disasm')).toBe('/home/u/s1disasm');
  });

  it('surrounding whitespace, which a paste carries', () => {
    expect(ok('  /home/u/s1disasm  ')).toBe('/home/u/s1disasm');
    expect(ok('/home/u/s1disasm\n')).toBe('/home/u/s1disasm');
  });

  it('shell quoting, both spellings, which is how a path with spaces is copied', () => {
    expect(ok('"/home/u/My Projects/s1"')).toBe('/home/u/My Projects/s1');
    expect(ok("'/home/u/My Projects/s1'")).toBe('/home/u/My Projects/s1');
    expect(ok('  "/home/u/s1"  ')).toBe('/home/u/s1');
  });

  it('a file:// URI, percent-decoded, which is what a file manager hands over', () => {
    expect(ok('file:///home/u/s1disasm')).toBe('/home/u/s1disasm');
    expect(ok('file:///home/u/My%20Projects/s1')).toBe('/home/u/My Projects/s1');
  });

  it('a quoted file:// URI, since a paste can carry both', () => {
    expect(ok('"file:///home/u/s1disasm"')).toBe('/home/u/s1disasm');
  });

  // THE POINT OF SHARING normalizeProjectPath rather than writing a second
  // cleanup here: a typed path and a browsed one must mint ONE project
  // identity. Two spellings of one directory is the exact bug that module was
  // written to kill (duplicate recents rows, a session key that never restores).
  it('normalizes to the SAME key a browsed path produces', () => {
    expect(ok('/home/u/proj/')).toBe('/home/u/proj');
    expect(ok('/home//u///proj')).toBe('/home/u/proj');
    expect(ok('/home/u/other/../proj')).toBe('/home/u/proj');
    expect(ok('/home/u/./proj/.')).toBe('/home/u/proj');
  });

  // A lone quote character is a real path character, not a quoting mistake.
  it('does not strip an UNMATCHED quote, which is part of the name', () => {
    expect(ok('/home/u/don\'t')).toBe("/home/u/don't");
  });
});

describe('parseTypedProjectPath refuses with the rule and the fix, each in its own words', () => {
  it('empty input names what to type AND the browse button beside it', () => {
    const m = why('');
    expect(m).toContain('full path to a project directory');
    expect(m).toContain('Open Project');
    // Whitespace-only and a pair of empty quotes reach the same rule.
    expect(why('   ')).toBe(m);
    expect(why('""')).toBe(m);
  });

  it('a literal ~ explains that the SHELL expands it, which is why the paste failed', () => {
    const m = why('~/sonic_hacks/s1disasm');
    expect(m).toContain('shell expands ~');
    expect(m).toContain('directory named');
    expect(why('~')).toBe(m);
    // ANTI-VACUOUS, and the reason this rule is separate from the relative-path
    // one: `~/x` is also not absolute, so a single generic refusal would cover
    // it and say the wrong thing. The two messages must differ.
    expect(m).not.toBe(why('relative/path'));
  });

  it('a relative path names the missing working directory, not just "invalid"', () => {
    const m = why('s1disasm');
    expect(m).toContain('not an absolute path');
    expect(m).toContain('no working directory');
    // It quotes back what it was given, so the person can see a stray character.
    expect(m).toContain('s1disasm');
  });

  it('a remote file:// URI says local only, rather than silently dropping the host', () => {
    const m = why('file://nas.local/share/s1disasm');
    expect(m).toContain('another host');
    expect(m).toContain('local directories only');
    // THE HAZARD THIS ROW EXISTS FOR, stated as a CONTROL rather than as a
    // phrase check: a naive `slice('file://')` turns the host form into
    // `/share/s1disasm`, which this parser will happily accept when it is
    // actually typed. So the two inputs differ by the host alone, and only one
    // of them opens. Without this control the row above is just "some refusal".
    expect(ok('file:///share/s1disasm')).toBe('/share/s1disasm');
  });

  it('an unreadable percent-escape says so instead of throwing', () => {
    const m = why('file:///home/u/%zz');
    expect(m).toContain('not a readable file:// address');
  });

  it('the filesystem root is refused: it is not a project directory', () => {
    expect(why('/')).toContain('filesystem root');
    expect(why('//')).toContain('filesystem root');
    expect(why('/home/../..')).toContain('filesystem root');
  });

  // SUSPECT THE MATCHER. The first version of this row compared the six
  // MESSAGES, and a real mutation (the ~ rule deleted so `~/p` fell through to
  // the relative-path branch) left it GREEN: both messages quote the input back,
  // so `"~/p" is not an absolute path` and `"rel" is not an absolute path` are
  // distinct strings produced by ONE rule. It was passing on the echo, not on
  // the rules. Two repairs, and both are needed:
  //   • compare `kind`, which the echo cannot forge;
  //   • compare the messages with every quoted span removed, so the prose is
  //     still held to being six sentences rather than one with six inputs in it.
  it('the six refusals come from six DISTINCT rules, echo removed', () => {
    const inputs = ['', '~/p', 'rel', 'file://host/p', 'file:///%zz', '/'];
    const kinds = inputs.map((raw) => {
      const r = parseTypedProjectPath(raw);
      expect(r.ok, `${JSON.stringify(raw)} should be refused`).toBe(false);
      return r.kind;
    });
    expect(new Set(kinds).size, `kinds: ${kinds.join(', ')}`).toBe(inputs.length);
    expect(kinds).not.toContain(undefined);

    const deEchoed = inputs.map((raw) => why(raw).replace(/"[^"]*"/g, '"…"'));
    expect(new Set(deEchoed).size, deEchoed.join(' | ')).toBe(inputs.length);
  });

  // The owner's 2026-09-05 dash ruling covers text a tool shows a person, and
  // every string above is shown verbatim under the field. check:src-dashes holds
  // the whole file; this row states the property at the point of output.
  it('no refusal carries an em or en dash', () => {
    // Written as code points, not as a character class holding the two
    // characters: `check:test-dashes` counts a dash anywhere in this tree,
    // literals in the row that CHECKS for dashes included, and it is right to.
    const EN_DASH = 0x2013;
    const EM_DASH = 0x2014;
    for (const raw of ['', '~/p', 'rel', 'file://host/p', 'file:///%zz', '/']) {
      const offenders = [...why(raw)].filter((c) => {
        const cp = c.codePointAt(0);
        return cp === EN_DASH || cp === EM_DASH;
      });
      expect(offenders, `in refusal for ${JSON.stringify(raw)}`).toEqual([]);
    }
  });
});
