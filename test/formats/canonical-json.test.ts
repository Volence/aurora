import { describe, it, expect } from 'vitest';
import {
  canonicalKeyOrder,
  canonicalJsonMinified,
  canonicalJsonPretty,
} from '../../src/core/formats/canonical-json';

/**
 * The §5 canonical-serialization chokepoint.
 *
 * CONTRACT: aeon `tools/EFFECTS_CONSUMER_CONTRACT.md` §5, read at aeon
 * origin/master `768eb2d8e67474b73982859aa17e9ef81e21626b` (the commit that
 * ruled §5's scope; `--stat` shows that file alone, 42 insertions):
 *
 *   • DETERMINISM binds universally, no document classes: keys sorted
 *     alphabetically, RECURSIVELY (Python's `sort_keys=True` is recursive —
 *     nested band and layer objects sort too).
 *   • COMPACTNESS is per document class: tile-array documents minified with
 *     separators `(",", ":")`; scalar documents pretty-printed at indent 2.
 *
 * So aeon's two spellings are `json.dumps(obj, sort_keys=True,
 * separators=(",", ":"))` and `json.dumps(obj, sort_keys=True, indent=2)`, and
 * this module is "the equivalent on the Aurora side" for both.
 *
 * WHY THE GATES BELOW COMPARE OUTPUTS TO EACH OTHER rather than to pinned
 * strings: the property §5 buys is *a diff appears only when something semantic
 * changed*. A hardcoded expected string proves that one input renders one way;
 * it does not prove that two writers of the same content agree. The
 * insertion-order gates are the ones that do.
 */

describe('canonicalKeyOrder — the determinism half, which binds universally', () => {
  it('sorts top-level keys alphabetically', () => {
    const out = canonicalKeyOrder({ zeta: 1, alpha: 2, mid: 3 });
    expect(Object.keys(out)).toEqual(['alpha', 'mid', 'zeta']);
  });

  it('sorts RECURSIVELY — nested objects, and objects inside arrays', () => {
    // The half a top-level-only implementation gets wrong, and the half §5
    // spells out because Python's sort_keys does it silently. A band object
    // inside `anims` and a layer object inside `layers` are both this shape.
    const out = canonicalKeyOrder({
      z: { zz: 1, aa: 2, nested: { y: 1, x: 2 } },
      a: [{ q: 1, b: 2 }, { d: 1, c: 2 }],
    }) as Record<string, Record<string, unknown> | Record<string, unknown>[]>;
    expect(Object.keys(out)).toEqual(['a', 'z']);
    expect(Object.keys(out.z as Record<string, unknown>)).toEqual(['aa', 'nested', 'zz']);
    expect(Object.keys((out.z as Record<string, Record<string, unknown>>).nested)).toEqual(['x', 'y']);
    const arr = out.a as Record<string, unknown>[];
    expect(Object.keys(arr[0])).toEqual(['b', 'q']);
    expect(Object.keys(arr[1])).toEqual(['c', 'd']);
  });

  it('leaves ARRAY order alone — an array is a sequence, not a key set', () => {
    // `layout`, `tiles`, `phases` and `layers` all mean something positional.
    // Sorting them would not be canonicalization, it would be corruption.
    const out = canonicalKeyOrder({ xs: [3, 1, 2], ys: ['c', 'a', 'b'] }) as Record<string, unknown[]>;
    expect(out.xs).toEqual([3, 1, 2]);
    expect(out.ys).toEqual(['c', 'a', 'b']);
  });

  it('reorders without adding or dropping anything, at every depth', () => {
    // Reordering must not become dropping — the failure mode a hand-enumerating
    // canonicalizer has and a loop over Object.keys does not.
    const input = {
      z: 1, a: { deep: { q: [1, { k: 2, j: 3 }] }, other: null },
      m: false, n: 'text', o: [], p: {},
    };
    expect(canonicalKeyOrder(input)).toEqual(input);
  });

  it('does not mutate the value it was handed', () => {
    const input = { z: 1, a: { y: 1, b: 2 } };
    const snapshot = JSON.stringify(input);
    canonicalKeyOrder(input);
    expect(JSON.stringify(input)).toBe(snapshot);
  });

  it('passes scalars and null through unchanged', () => {
    expect(canonicalKeyOrder(3)).toBe(3);
    expect(canonicalKeyOrder('s')).toBe('s');
    expect(canonicalKeyOrder(null)).toBe(null);
    expect(canonicalKeyOrder(true)).toBe(true);
  });

  it('orders by CODE POINT, as Python does, not by UTF-16 code unit', () => {
    // Python: sorted(["￿", "\U00010000"]) == ["￿", "\U00010000"],
    // because U+FFFF < U+10000. JavaScript's default `.sort()` compares UTF-16
    // code units, so it sees the leading surrogate D800 and puts the astral key
    // FIRST — the two implementations would disagree on the same document.
    const astral = '\u{10000}';
    const bmpMax = '￿';
    // Subject check: the default JS comparator really does give the other
    // answer, so this gate is not asserting something that holds for free.
    expect([astral, bmpMax].sort()).toEqual([astral, bmpMax]);
    expect(Object.keys(canonicalKeyOrder({ [astral]: 1, [bmpMax]: 2 }))).toEqual([bmpMax, astral]);
  });
});

describe('the two document classes render as §5 says', () => {
  const doc = { b: [1, 2], a: { d: 1, c: 2 } };

  it('minified: separators (",", ":"), one line', () => {
    const text = canonicalJsonMinified(doc);
    // One line, plus the canonical trailing newline (§8, ruled 2026-08-26 —
    // every JSON file Aurora writes into aeon's tree ends in exactly one).
    expect(text).toBe('{"a":{"c":2,"d":1},"b":[1,2]}\n');
    expect(text.slice(0, -1)).not.toContain('\n');
    expect(text).not.toContain(', ');
    expect(text).not.toContain(': ');
  });

  it('pretty: indent 2, the same key order', () => {
    const text = canonicalJsonPretty(doc);
    expect(text.split('\n')[1]).toBe('  "a": {');
    // Same ordering decision, different rendering — determinism does not split.
    expect(JSON.parse(text)).toEqual(JSON.parse(canonicalJsonMinified(doc)));
    expect(Object.keys(JSON.parse(text))).toEqual(Object.keys(JSON.parse(canonicalJsonMinified(doc))));
  });
});

/**
 * THE POINT OF THE WHOLE CLAUSE. Nothing here compares against a literal: the
 * expectation is that two renderings agree with each other.
 */
describe('determinism — the property §5 exists to buy', () => {
  /** The same content, built by two writers who happened to insert differently. */
  function twoInsertionOrders(): [Record<string, unknown>, Record<string, unknown>] {
    const first: Record<string, unknown> = {};
    first.zulu = { inner_z: 1, inner_a: [{ y: 1, x: 2 }] };
    first.alpha = [1, 2, 3];
    first.mike = 'm';

    const second: Record<string, unknown> = {};
    second.mike = 'm';
    second.alpha = [1, 2, 3];
    second.zulu = { inner_a: [{ x: 2, y: 1 }], inner_z: 1 };

    return [first, second];
  }

  it('the two documents really do differ before canonicalization (anti-vacuity)', () => {
    const [a, b] = twoInsertionOrders();
    // Without this the gates below could be comparing a document to itself.
    expect(JSON.stringify(a)).not.toBe(JSON.stringify(b));
    expect(a).toEqual(b);
  });

  it('different insertion orders, identical content -> identical bytes (minified)', () => {
    const [a, b] = twoInsertionOrders();
    expect(canonicalJsonMinified(a)).toBe(canonicalJsonMinified(b));
  });

  it('different insertion orders, identical content -> identical bytes (pretty)', () => {
    const [a, b] = twoInsertionOrders();
    expect(canonicalJsonPretty(a)).toBe(canonicalJsonPretty(b));
  });

  it('serializing the same document twice is byte-identical', () => {
    const [a] = twoInsertionOrders();
    expect(canonicalJsonMinified(a)).toBe(canonicalJsonMinified(a));
    expect(canonicalJsonPretty(a)).toBe(canonicalJsonPretty(a));
  });

  it('is a FIXED POINT — reading back what we wrote and rewriting it changes nothing', () => {
    const [a] = twoInsertionOrders();
    const once = canonicalJsonMinified(a);
    expect(canonicalJsonMinified(JSON.parse(once))).toBe(once);
    const prettyOnce = canonicalJsonPretty(a);
    expect(canonicalJsonPretty(JSON.parse(prettyOnce))).toBe(prettyOnce);
  });
});
