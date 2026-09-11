// HOME-PATH-FIELD-KEEPS-OLD-PATH (docs/reviews/2026-09-11-cdp-sweep-2.md, O1).
//
// The finding: Home's "...or type another project directory path" field still
// held the path it had just opened. Home is kept alive (App.tsx keeps every
// non-level tab mounted under display:none), so on an aeon-resident switch the
// same OpenByPath instance survives the open with its useState value intact. A
// click puts the caret at the end, the next typed path is APPENDED, the open
// fails and a red banner appears. The sweep hit exactly that.
//
// This suite is node-only (no jsdom), so the field's value is MODELLED here:
// `text` starts as what the person typed, and submitTypedPath's fourth argument
// is the component's `setText`, called with an updater the way React's setter
// accepts one. That the component really passes `setText` there is held from
// source in typed-path-open.test.ts §2.

import { describe, it, expect } from 'vitest';
import { submitTypedPath } from '../typed-path-open';

type Opener = (dir: string) => Promise<boolean | undefined>;

async function field(raw: string, opener: Opener): Promise<{ text: string; refusal: string | null }> {
  const box = { text: raw, refusal: null as string | null };
  await submitTypedPath(
    raw,
    opener,
    (why) => { box.refusal = why; },
    (update: (current: string) => string) => { box.text = update(box.text); },
  );
  return box;
}

const C2 = '/tmp/cdps2-C2-QFtuP5';

describe('HOME-PATH-FIELD-KEEPS-OLD-PATH · the field after an open', () => {
  it('REPRODUCTION: after a SUCCESSFUL open the field is empty, not still holding the path', async () => {
    const opened: string[] = [];
    const box = await field(C2, async (d) => { opened.push(d); return true; });
    // Loud on unmeasurable: if the opener never ran this is not the success road.
    expect(opened, 'the opener ran, so this is the success road').toEqual([C2]);
    expect(box.text, 'the field still holds the path it opened').toBe('');
  });
});
