// THE SECOND DOOR, end to end as far as a node-only suite can take it
// (UX seat A, F1).
//
// §1 EXECUTES the submit rule: a refused path must never reach the opener, and
// an accepted one must arrive NORMALIZED, so a typed path and a browsed one mint
// one project identity.
//
// §2 is the wiring this suite cannot execute, asserted from source instead, and
// LABELLED AS THE WEAKER EVIDENCE IT IS. There is no jsdom here; nothing in this
// file has rendered a pixel. What §2 buys is that the tested rule is the one the
// component calls and that the component's callback is the GUARDED road - the
// two ways this door could be correct in isolation and wired to nothing.
//
// The negative half is already held elsewhere and is not restated here:
// `shell/__tests__/project-open-door-census.test.ts` fails if this door (or any
// other undeclared renderer file) reaches a project-switch primitive directly.
// That was checked by planting exactly such a call in OpenByPath.tsx; it named
// the file and went red.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { submitTypedPath } from '../typed-path-open';

// -- §1, executed ----------------------------------------------------------

function run(raw: string): { opened: string[]; refusals: (string | null)[] } {
  const opened: string[] = [];
  const refusals: (string | null)[] = [];
  submitTypedPath(raw, (d) => opened.push(d), (w) => refusals.push(w));
  return { opened, refusals };
}

describe('F1 §1 · the submit rule, executed', () => {
  it('an accepted path opens exactly once, and NORMALIZED', () => {
    const r = run('  /home/u/proj/  ');
    expect(r.opened).toEqual(['/home/u/proj']);
    // The refusal is cleared, and cleared BEFORE the open: a stale sentence
    // under the field while the open guard raises its own dialog reads as that
    // dialog's reason.
    expect(r.refusals).toEqual([null]);
  });

  it('a shell-quoted path with spaces opens, which is how such a path is copied', () => {
    expect(run('"/home/u/My Projects/s1"').opened).toEqual(['/home/u/My Projects/s1']);
  });

  it('a file:// URI opens, percent-decoded', () => {
    expect(run('file:///home/u/My%20Projects/s1').opened).toEqual(['/home/u/My Projects/s1']);
  });

  // THE PROPERTY THE WHOLE DOOR RESTS ON. A refused string reaching `open`
  // would hand an unvalidated path to the guarded road, and the road would then
  // tear down the resident project to open a directory that cannot exist.
  it('EVERY refusal opens NOTHING, and reports the parser own sentence', () => {
    for (const raw of ['', '   ', '~/proj', 'proj', 'file://nas/share', 'file:///%zz', '/']) {
      const r = run(raw);
      expect(r.opened, `${JSON.stringify(raw)} must not open anything`).toEqual([]);
      expect(r.refusals.length, `${JSON.stringify(raw)} must report one refusal`).toBe(1);
      expect(typeof r.refusals[0], `${JSON.stringify(raw)} refusal must be a sentence`)
        .toBe('string');
      expect((r.refusals[0] as string).length).toBeGreaterThan(20);
    }
  });

  // ANTI-VACUOUS. If `submitTypedPath` refused everything, every row above
  // except the first three would still pass. This states that the two branches
  // are actually different branches.
  it('CONTROL: the accept and refuse branches are both live', () => {
    expect(run('/home/u/proj').opened.length).toBe(1);
    expect(run('proj').opened.length).toBe(0);
  });
});

// -- §2, read from source, and weaker on purpose ---------------------------

const HERE = fileURLToPath(new URL('.', import.meta.url));
const HOME_DIR = join(HERE, '..');
const RENDERER = join(HOME_DIR, '..', '..');

function read(...parts: string[]): string {
  const text = readFileSync(join(...parts), 'utf8');
  // LOUD ON UNMEASURABLE: a moved or emptied file must fail here rather than
  // make every match below vacuously absent.
  expect(text.length, `${parts.join('/')} is empty or unreadable`).toBeGreaterThan(200);
  return text;
}

describe('F1 §2 · the wiring, from source, since this suite has no DOM', () => {
  it('the component delegates to the rule tested above, and holds no copy of it', () => {
    const text = read(HOME_DIR, 'OpenByPath.tsx');
    expect(text).toContain("import { submitTypedPath } from './typed-path-open'");
    expect(text).toMatch(/submitTypedPath\(text,\s*onOpenPath,\s*setRefusal\)/);
    // A second parse in the component would be the rule spelled twice, and the
    // copy that is not under test is the one that drifts.
    expect(text).not.toContain('parseTypedProjectPath');
  });

  it('the field is reachable in BOTH Home states, not only the empty one', () => {
    const text = read(HOME_DIR, 'HomeTab.tsx');
    const uses = text.match(/<OpenByPath\b/g) ?? [];
    // Two render sites: no project (where the seat landed), and the project
    // page's switch section (a person with a project open and a broken portal
    // is just as stuck).
    expect(uses.length, 'OpenByPath must render in both Home states').toBe(2);
    expect(text).toContain('onOpenPath={onOpenPath}');
  });

  it('App hands it the GUARDED road, not a raw store call', () => {
    const text = read(RENDERER, 'App.tsx');
    expect(text).toMatch(/<HomeTab[\s\S]{0,240}?onOpenPath=\{openProjectByPath\}/);
    // `openProjectByPath` is `useProject.openPath`, whose first statement is the
    // guard. That ORDER is asserted by the census file, not restated here.
    expect(text).toContain("from './hooks/useProject'");
  });
});
