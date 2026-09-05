// planFileNeedsWrite — the meaning test that replaced the byte test.
//
// EW-SAVE-NOISE (docs/reviews/2026-09-02-effects-cold-walkthrough.md d9): one
// Ctrl+S rewrote 25 files, 23 of them byte-different and semantically
// identical. The skip rows below are the 23; the WRITE rows are the far more
// important half — a save that silently drops a file that DID change is worse
// than one that writes too many, so every class of real change has a row that
// fails if the skip swallows it.
//
// The two halves are deliberately asymmetric in what they assert. A skip row
// says "these two spellings mean the same thing"; a write row says "these two
// do NOT", and every write row is a defect if it ever flips.

import { describe, it, expect } from 'vitest';
import { planFileNeedsWrite, jsonValueEqual } from '../save-skip';

const enc = (s: string) => new TextEncoder().encode(s);

describe('planFileNeedsWrite: the noise the byte test let through', () => {
  it('skips a document that differs ONLY by the §8 trailing newline', () => {
    // 22 of the 23. aeon's Python writers use json.dumps, which emits no
    // trailing newline; Aurora's canonical file form ends in exactly one.
    const body = '{\n  "a": 1\n}';
    expect(planFileNeedsWrite('json', enc(body), enc(`${body}\n`))).toBe(false);
    // ...and in the other direction, so the rule is about MEANING and not
    // about which side happens to be longer.
    expect(planFileNeedsWrite('json', enc(`${body}\n`), enc(body))).toBe(false);
  });

  it('skips a document that differs ONLY by key order or indentation', () => {
    expect(planFileNeedsWrite('json', enc('{"b":2,"a":1}'), enc('{\n  "a": 1,\n  "b": 2\n}\n')))
      .toBe(false);
  });

  it('skips a sidecar whose only difference is an ABSENT vs explicit-null ref', () => {
    // The other 2 of the 23: section_0 and section_4 in aeon's tree, written
    // before `rasterRef` existed. Absent and null are the same state — empyrean
    // §3.1, aeon's `meta.get(key)` in tools/effects_gen.py, and Aurora's own
    // parseSectionMeta all agree.
    const onDisk = '{\n  "bgLayoutRef": null,\n  "paletteRef": null,\n  "sceneRef": "ojz_act1_depth"\n}';
    const planned = '{\n  "bgLayoutRef": null,\n  "paletteRef": null,\n  "rasterRef": null,\n'
      + '  "sceneRef": "ojz_act1_depth"\n}\n';
    expect(planFileNeedsWrite('section-meta', enc(onDisk), enc(planned))).toBe(false);
  });

  it('skips a byte-identical file whatever the comparison', () => {
    for (const c of ['bytes', 'json', 'section-meta'] as const) {
      expect(planFileNeedsWrite(c, enc('{"a":1}\n'), enc('{"a":1}\n'))).toBe(false);
    }
  });
});

describe('planFileNeedsWrite: every class of real change still reaches disk', () => {
  it('writes when the file is absent on disk', () => {
    expect(planFileNeedsWrite('json', null, enc('{"a":1}\n'))).toBe(true);
    expect(planFileNeedsWrite('section-meta', null, enc('{}\n'))).toBe(true);
    expect(planFileNeedsWrite('bytes', null, new Uint8Array([1]))).toBe(true);
  });

  it('writes a BINARY whose bytes moved by one bit', () => {
    // The default and the conservative one: no tag, no parsing, byte identity.
    expect(planFileNeedsWrite(undefined, new Uint8Array([1, 2, 3]), new Uint8Array([1, 2, 2])))
      .toBe(true);
    expect(planFileNeedsWrite('bytes', new Uint8Array([1, 2, 3]), new Uint8Array([1, 2, 2])))
      .toBe(true);
  });

  it('writes a binary even when both sides happen to be valid JSON', () => {
    // The tag is what licenses parsing. An untagged file is never parsed, so a
    // .bin that coincidentally decodes is still compared byte-for-byte.
    expect(planFileNeedsWrite('bytes', enc('{"a":1}'), enc('{"a":1}\n'))).toBe(true);
  });

  it('writes when a JSON value changed', () => {
    expect(planFileNeedsWrite('json', enc('{"a":1}\n'), enc('{"a":2}\n'))).toBe(true);
    expect(planFileNeedsWrite('json', enc('[1,2]\n'), enc('[1,2,3]\n'))).toBe(true);
    // ARRAYS ARE POSITIONAL — a layout, a band list and a variants array all
    // mean something by index, so a reorder is a change.
    expect(planFileNeedsWrite('json', enc('[1,2]\n'), enc('[2,1]\n'))).toBe(true);
  });

  it('writes when a key is added or dropped with a NON-null value', () => {
    expect(planFileNeedsWrite('json', enc('{"a":1}\n'), enc('{"a":1,"b":2}\n'))).toBe(true);
    expect(planFileNeedsWrite('json', enc('{"a":1,"b":2}\n'), enc('{"a":1}\n'))).toBe(true);
  });

  it('writes when null and absent differ in a NON-sidecar document', () => {
    // ⚠ THE PRESET THREE-STATE RULE. `cycles` absent = keep the section's
    // hand-authored cycle; `cycles: null` = cycling OFF. They lower to
    // different engine values (formats/effects/preset.ts), so the sidecar's
    // relaxation must NOT reach them. Both directions.
    expect(planFileNeedsWrite('json', enc('{"bands":[]}\n'), enc('{"bands":[],"cycles":null}\n')))
      .toBe(true);
    expect(planFileNeedsWrite('json', enc('{"bands":[],"cycles":null}\n'), enc('{"bands":[]}\n')))
      .toBe(true);
  });

  it('writes a sidecar whose ref actually changed: bind, rebind and UNBIND', () => {
    const bound = '{"bgLayoutRef":null,"paletteRef":null,"rasterRef":"ojz_sec5_showcase","sceneRef":null}\n';
    const unbound = '{"bgLayoutRef":null,"paletteRef":null,"rasterRef":null,"sceneRef":null}\n';
    const other = '{"bgLayoutRef":null,"paletteRef":null,"rasterRef":"other","sceneRef":null}\n';
    // bind
    expect(planFileNeedsWrite('section-meta', enc(unbound), enc(bound))).toBe(true);
    // UNBIND — the direction the relaxation could plausibly eat, and the one
    // whose loss would present as "the clear didn't stick".
    expect(planFileNeedsWrite('section-meta', enc(bound), enc(unbound))).toBe(true);
    // rebind
    expect(planFileNeedsWrite('section-meta', enc(bound), enc(other))).toBe(true);
  });

  it('writes a sidecar carrying a NUMERIC ref: the relaxation is null-only', () => {
    // parseSectionMeta nulls a non-string SILENTLY, which is the stated reason
    // aeon's generator refuses `rasterRef: 3` by name. `3` is not `null`, so
    // this is a difference and the save still normalises it.
    const numeric = '{"bgLayoutRef":null,"paletteRef":null,"rasterRef":3,"sceneRef":null}\n';
    const nulled = '{"bgLayoutRef":null,"paletteRef":null,"rasterRef":null,"sceneRef":null}\n';
    expect(planFileNeedsWrite('section-meta', enc(numeric), enc(nulled))).toBe(true);
  });

  it('writes a sidecar that gained a non-null key beside the nulls', () => {
    const a = '{"bgLayoutRef":null,"sceneRef":"x"}';
    const b = '{"bgLayoutRef":null,"paletteRef":null,"rasterRef":null,"sceneRef":"y"}\n';
    expect(planFileNeedsWrite('section-meta', enc(a), enc(b))).toBe(true);
  });

  it('writes when the file on disk does not parse as JSON', () => {
    // A merge-conflict marker, a truncated hand-edit, an empty file: no
    // comparable meaning, so the planned bytes win rather than a silent skip.
    for (const junk of ['', '{', '<<<<<<< HEAD', 'not json at all']) {
      expect(planFileNeedsWrite('json', enc(junk), enc('{"a":1}\n')), junk).toBe(true);
      expect(planFileNeedsWrite('section-meta', enc(junk), enc('{"a":1}\n')), junk).toBe(true);
    }
  });

  it('writes when the file on disk is not valid UTF-8', () => {
    expect(planFileNeedsWrite('json', new Uint8Array([0xff, 0xfe, 0x00]), enc('{"a":1}\n')))
      .toBe(true);
  });
});

describe('jsonValueEqual', () => {
  it('separates null from absent, and from every other falsy value', () => {
    expect(jsonValueEqual({ a: null }, {})).toBe(false);
    expect(jsonValueEqual({ a: null }, { a: 0 })).toBe(false);
    expect(jsonValueEqual({ a: null }, { a: false })).toBe(false);
    expect(jsonValueEqual({ a: null }, { a: '' })).toBe(false);
    expect(jsonValueEqual(null, [])).toBe(false);
    expect(jsonValueEqual([], {})).toBe(false);
  });

  it('is insensitive to key order at every depth', () => {
    expect(jsonValueEqual({ a: { x: 1, y: 2 } }, { a: { y: 2, x: 1 } })).toBe(true);
  });

  it('does not treat a same-length key set as a match when a key is renamed', () => {
    expect(jsonValueEqual({ a: 1 }, { b: 1 })).toBe(false);
  });
});
