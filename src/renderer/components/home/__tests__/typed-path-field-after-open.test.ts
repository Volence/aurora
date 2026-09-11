// HOME-PATH-FIELD-KEEPS-OLD-PATH (docs/reviews/2026-09-11-cdp-sweep-2.md, O1).
//
// The finding: Home's "...or type another project directory path" field still
// held the path it had just opened. Home is kept alive (App.tsx keeps every
// non-level tab mounted under display:none), so on an aeon-resident switch the
// same OpenByPath instance survives the open with its useState value intact. A
// click puts the caret at the end, the next typed path is APPENDED, the open
// fails and a red banner appears. The sweep hit exactly that.
//
// The ruling: clear the field after a SUCCESSFUL open; keep it after a failed
// one, so a typo is corrected rather than retyped; change nothing about how a
// focus or a click treats the caret (that trade is the owner's open card
// NUMBERFIELD-TAB-THEN-CLICK, not ours).
//
// This suite is node-only (no jsdom), so:
//   §1 EXECUTES the rule against a MODELLED field: `text` starts as what the
//      person typed, and submitTypedPath's fourth argument is the component's
//      `setText`, called with an updater the way React's setter accepts one.
//   §2 EXECUTES the real opener, useProject.openProjectPath, over the real
//      classic store (its bridge seam), and then drives the modelled field
//      THROUGH it, so the rule and the opener are tested across their seam and
//      not only each in isolation.
//   §3 holds the component's wiring from source, and is the weaker evidence:
//      that `setText` is the fourth argument, that Enter and the Open button are
//      the only two commit roads and share one submit, and that the input still
//      has no focus, click or selection handling of its own.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

// The unsaved-work guard, the aeon loader and the recents IPC are replaced so
// §2 can choose each outcome; each keeps every other export it has. The guard's
// own behaviour is project-open-guard.test.ts's, the aeon loader's is
// aeon-open-over-classic.test.ts's. The CLASSIC store is the real one.
vi.mock('../../../shell/project-open-guard', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../shell/project-open-guard')>()),
  confirmProjectOpen: vi.fn(async () => true),
}));
vi.mock('../../../state/aeon-open', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../state/aeon-open')>()),
  openAeonProject: vi.fn(async () => true),
}));
vi.mock('../../../state/recents', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../state/recents')>()),
  recordRecentProject: vi.fn(async () => []),
}));

import { submitTypedPath, fieldAfterSuccessfulOpen } from '../typed-path-open';
import { openProjectPath } from '../../../hooks/useProject';
import { confirmProjectOpen } from '../../../shell/project-open-guard';
import { openAeonProject } from '../../../state/aeon-open';
import {
  useClassicProjectStore,
  __setClassicBridgeForTest,
  __resetClassicBridgeForTest,
} from '../../../state/classicProjectStore';
import { useClassicLevelStore } from '../../../state/classicLevelStore';
import type { ClassicBridge, ClassicOpenResult } from '../../../state/classic-bridge';
import type { ProjectHandle } from '../../../../core/project/adapter';

// -- the modelled field -------------------------------------------------------

interface Box { text: string; refusal: string | null }
type Opener = (dir: string, box: Box) => Promise<boolean | undefined>;

async function field(raw: string, opener: Opener): Promise<Box> {
  const box: Box = { text: raw, refusal: null };
  await submitTypedPath(
    raw,
    (dir) => opener(dir, box),
    (why) => { box.refusal = why; },
    (update: (current: string) => string) => { box.text = update(box.text); },
  );
  return box;
}

const C2 = '/tmp/cdps2-C2-QFtuP5';

// -- §1, the rule, executed ---------------------------------------------------

describe('HOME-PATH-FIELD-KEEPS-OLD-PATH · the field after an open', () => {
  it('REPRODUCTION: after a SUCCESSFUL open the field is empty, not still holding the path', async () => {
    const opened: string[] = [];
    const box = await field(C2, async (d) => { opened.push(d); return true; });
    // Loud on unmeasurable: if the opener never ran this is not the success road.
    expect(opened, 'the opener ran, so this is the success road').toEqual([C2]);
    expect(box.text, 'the field still holds the path it opened').toBe('');
  });

  it('CONTROL: after a FAILED open the text stays, so a typo is corrected in place', async () => {
    const opened: string[] = [];
    const box = await field(C2, async (d) => { opened.push(d); return false; });
    expect(opened, 'the opener ran, so this is the failure road').toEqual([C2]);
    expect(box.text).toBe(C2);
    // The failing store owns the banner; the field adds no sentence of its own.
    expect(box.refusal).toBeNull();
  });

  it('a CANCELLED guard (the opener resolves undefined) keeps the text', async () => {
    const box = await field(C2, async () => undefined);
    expect(box.text).toBe(C2);
  });

  it('an opener that THROWS keeps the text, and the throw is not swallowed', async () => {
    const box: Box = { text: C2, refusal: null };
    await expect(submitTypedPath(
      C2,
      async () => { throw new Error('bridge down'); },
      (why) => { box.refusal = why; },
      (update) => { box.text = update(box.text); },
    )).rejects.toThrow('bridge down');
    expect(box.text).toBe(C2);
  });

  it('a path the parser refuses opens nothing and keeps the text', async () => {
    const opened: string[] = [];
    const box = await field('proj', async (d) => { opened.push(d); return true; });
    expect(opened).toEqual([]);
    expect(box.text).toBe('proj');
    expect(typeof box.refusal, 'the refusal is the parser sentence').toBe('string');
  });

  it('text typed WHILE the open was in flight survives the success', async () => {
    // A project load takes seconds, and the field stays live through it. What
    // the person typed in that window is theirs; only the value that was
    // submitted is spent.
    const box = await field(C2, async (_d, b) => { b.text = '/tmp/next-project'; return true; });
    expect(box.text).toBe('/tmp/next-project');
    // And the rule itself, both ways, so the row above is not passing on an
    // updater that is never called.
    expect(fieldAfterSuccessfulOpen(C2, C2)).toBe('');
    expect(fieldAfterSuccessfulOpen('/tmp/next-project', C2)).toBe('/tmp/next-project');
  });
});

// -- §2, the real opener, executed --------------------------------------------

function classicHandle(): ProjectHandle {
  return {
    type: 's1',
    capabilities: {
      levels: 'chunk-hierarchy', sprites: true, objects: 'objpos', build: false,
      facets: ['layout', 'art', 'objects', 'palette'],
    },
    report: { entries: [], resolved: 0, total: 0 },
    levels: {
      list: () => [],
      read: async () => { throw new Error('not used'); },
      write: async () => { throw new Error('not used'); },
    },
  };
}

const OPENED: ClassicOpenResult = { kind: 'opened', handle: classicHandle(), label: 'Sonic 1 Disassembly' };
const AEON: ClassicOpenResult = { kind: 'not-classic', aeon: true };
const NEITHER: ClassicOpenResult = { kind: 'not-classic', aeon: false };

function bridge(result: ClassicOpenResult): ClassicBridge & { calls: string[] } {
  const calls: string[] = [];
  return { calls, open: async (dir: string) => { calls.push(dir); return result; } };
}

describe('HOME-PATH-FIELD-KEEPS-OLD-PATH · the opener reports what happened', () => {
  beforeEach(() => {
    useClassicProjectStore.getState().reset();
    useClassicLevelStore.getState().reset();
    vi.mocked(confirmProjectOpen).mockReset().mockResolvedValue(true);
    vi.mocked(openAeonProject).mockReset().mockResolvedValue(true);
  });
  afterEach(() => {
    __resetClassicBridgeForTest();
    useClassicProjectStore.getState().reset();
    useClassicLevelStore.getState().reset();
  });

  it('a classic project that OPENS resolves true', async () => {
    __setClassicBridgeForTest(bridge(OPENED));
    await expect(openProjectPath('/p/s1')).resolves.toBe(true);
    // Premise, so `true` is about a real open and not a constant.
    expect(useClassicProjectStore.getState().status).toBe('open');
    expect(useClassicProjectStore.getState().dir).toBe('/p/s1');
  });

  it('a directory that is NEITHER kind resolves false, and the store carries the banner', async () => {
    __setClassicBridgeForTest(bridge(NEITHER));
    await expect(openProjectPath('/p/nothing')).resolves.toBe(false);
    expect(useClassicProjectStore.getState().error).toMatch(/is not a recognized project/);
  });

  it('an aeon directory resolves to whatever the aeon loader answers, both ways', async () => {
    __setClassicBridgeForTest(bridge(AEON));
    vi.mocked(openAeonProject).mockResolvedValueOnce(true);
    await expect(openProjectPath('/p/aeon')).resolves.toBe(true);
    vi.mocked(openAeonProject).mockResolvedValueOnce(false);
    await expect(openProjectPath('/p/aeon')).resolves.toBe(false);
    expect(vi.mocked(openAeonProject).mock.calls).toEqual([['/p/aeon'], ['/p/aeon']]);
  });

  it('a guard that says no resolves undefined and asks the bridge nothing', async () => {
    const b = bridge(OPENED);
    __setClassicBridgeForTest(b);
    vi.mocked(confirmProjectOpen).mockResolvedValueOnce(false);
    await expect(openProjectPath('/p/s1')).resolves.toBeUndefined();
    expect(b.calls).toEqual([]);
  });

  it('THE SEAM: the field, driven by the real opener, empties after a real open', async () => {
    __setClassicBridgeForTest(bridge(OPENED));
    const box = await field('/p/s1', (d) => openProjectPath(d));
    expect(useClassicProjectStore.getState().status, 'premise: it opened').toBe('open');
    expect(box.text).toBe('');
  });

  it('THE SEAM, CONTROL: the field, driven by the real opener, keeps the text after a real failure', async () => {
    __setClassicBridgeForTest(bridge(NEITHER));
    const box = await field('/p/nothing', (d) => openProjectPath(d));
    expect(useClassicProjectStore.getState().error, 'premise: it failed').not.toBeNull();
    expect(box.text).toBe('/p/nothing');
  });
});

// -- §3, the component's wiring, from source ----------------------------------

const HOME_DIR = join(fileURLToPath(new URL('.', import.meta.url)), '..');

function read(name: string): string {
  const text = readFileSync(join(HOME_DIR, name), 'utf8');
  // LOUD ON UNMEASURABLE: a moved or emptied file must fail here rather than
  // make every absence below vacuously true.
  expect(text.length, `${name} is empty or unreadable`).toBeGreaterThan(200);
  return text;
}

/**
 * The attribute names on OpenByPath's one `<input>`, bare booleans included.
 * Every `{...}` value is dropped by depth, and every string value emptied, so
 * what is left is names only.
 */
function inputAttributeNames(src: string): string[] {
  // `<input` then whitespace: the element. The file's header prose names
  // "`<input>`" too, which a bare `\b` counted as a second element.
  const starts = [...src.matchAll(/<input\s/g)];
  expect(starts.length, 'exactly one <input> in OpenByPath.tsx').toBe(1);
  let depth = 0;
  let body = '';
  let closed = false;
  for (let i = starts[0].index! + '<input'.length; i < src.length; i++) {
    const c = src[i];
    if (c === '{') { depth++; continue; }
    if (c === '}') { depth--; continue; }
    if (depth > 0) continue;
    if (c === '/' && src[i + 1] === '>') { closed = true; break; }
    body += c;
  }
  expect(closed, 'the <input> element was read to its end').toBe(true);
  return (body.replace(/"[^"]*"/g, '""').match(/[A-Za-z][\w-]*/g) ?? []).sort();
}

describe('HOME-PATH-FIELD-KEEPS-OLD-PATH · the wiring, from source', () => {
  it('Enter and the Open button are the only commit roads, and both go through the one submit', () => {
    const src = read('OpenByPath.tsx');
    expect(src.match(/submitTypedPath\(/g)?.length, 'one call site, inside submit').toBe(1);
    expect(src).toMatch(/function submit\(\): void \{ void submitTypedPath\(text, onOpenPath, setRefusal, setText\); \}/);
    expect(src).toMatch(/onKeyDown=\{\(e\) => \{ if \(e\.key === 'Enter'\) \{ e\.preventDefault\(\); submit\(\); \} \}\}/);
    expect(src).toMatch(/<button onClick=\{submit\}/);
    // No third road: no form submit and no commit on blur.
    expect(src).not.toMatch(/<form\b|onSubmit=|onBlur=/);
  });

  it('focusing and clicking the field are unchanged: no handler, no selection, no caret move', () => {
    const src = read('OpenByPath.tsx');
    // What the input carries TODAY. A focus, click, pointer or selection
    // handler, a ref or an autoFocus added here changes how the field treats
    // the caret, which is the owner's NUMBERFIELD-TAB-THEN-CLICK trade.
    expect(inputAttributeNames(src)).toEqual([
      'aria-label', 'autoCapitalize', 'autoCorrect', 'onChange', 'onKeyDown',
      'placeholder', 'spellCheck', 'style', 'value',
    ]);
    for (const text of [src, read('typed-path-open.ts')]) {
      expect(text).not.toMatch(/\.select\(|setSelectionRange|selectionStart|selectionEnd|useRef|\.focus\(/);
    }
  });
});
