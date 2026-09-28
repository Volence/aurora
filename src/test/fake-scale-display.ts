// A DISPLAY WHOSE SCALE FACTOR CAN BE MOVED, answering `matchMedia('(resolution: Ndppx)')`
// the way a browser does, for the node suite (ROADMAP row 237).
//
// ═══ WHAT IT MODELS ═══
//
// A browser `MediaQueryList` for `(resolution: 1.5dppx)` MATCHES while the display scale
// is 1.5 and fires `change` on its listeners each time that answer flips: when the scale
// arrives at 1.5 and when it leaves it. Nothing else. So a listener armed on the query
// for today's scale hears the NEXT move off it, and is deaf to every move after that
// unless it re-arms on a query for the new scale. That deafness is the whole reason the
// listener in canvas/device-grid.ts re-arms, and this fake reproduces it rather than
// firing every listener on every change (which would make a listener that never
// re-arms pass).
//
// ═══ WHAT IT REFUSES ═══
//
// A query it cannot answer (anything but `(resolution: <number>dppx)`) THROWS: a fake
// that answered `matches: false` to a malformed query would let a listener armed on
// nonsense look armed. The scale itself is read and written through the accessors the
// caller hands in, so the fake and `window.devicePixelRatio` (window-stub.ts) cannot
// disagree about what the scale is.

type ChangeFn = (e: { matches: boolean; media: string }) => void;

export interface FakeMediaQueryList {
  readonly media: string;
  readonly matches: boolean;
  addEventListener(type: string, fn: ChangeFn): void;
  removeEventListener(type: string, fn: ChangeFn): void;
}

export interface FakeScaleDisplay {
  /** Hand this to the code under test as `matchMedia`. */
  matchMedia(query: string): FakeMediaQueryList;
  /**
   * Move the display to `dpr`: write it through the setter, then fire `change` on every
   * list whose answer flipped, as a browser does. Returns how many listeners ran, so a
   * row can assert it was not zero.
   */
  setScale(dpr: number): number;
  /** Every query handed to `matchMedia`, in order. */
  queries(): string[];
  /** The live `change` listeners, per query, over every list ever created. */
  listeners(): { media: string; count: number }[];
  /** The total number of live `change` listeners. */
  totalListeners(): number;
}

const QUERY = /^\(resolution: ([0-9]*\.?[0-9]+(?:e[-+]?[0-9]+)?)dppx\)$/;

export function fakeScaleDisplay(scale: { get(): number; set(v: number): void }): FakeScaleDisplay {
  const lists: { media: string; value: number; was: boolean; fns: ChangeFn[] }[] = [];
  const asked: string[] = [];
  const answer = (value: number): boolean => value === scale.get();
  return {
    matchMedia(query) {
      asked.push(query);
      const m = QUERY.exec(query);
      if (!m) throw new Error(`fakeScaleDisplay cannot answer ${JSON.stringify(query)}: only (resolution: <n>dppx)`);
      const rec = { media: query, value: Number(m[1]), was: answer(Number(m[1])), fns: [] as ChangeFn[] };
      lists.push(rec);
      return {
        media: query,
        get matches() { return answer(rec.value); },
        addEventListener(type, fn) { if (type === 'change' && !rec.fns.includes(fn)) rec.fns.push(fn); },
        removeEventListener(type, fn) {
          if (type !== 'change') return;
          const at = rec.fns.indexOf(fn);
          if (at >= 0) rec.fns.splice(at, 1);
        },
      };
    },
    setScale(dpr) {
      scale.set(dpr);
      let ran = 0;
      for (const rec of lists) {
        const now = answer(rec.value);
        if (now === rec.was) continue;
        rec.was = now;
        // A copy: a listener that removes itself must not shorten the walk.
        for (const fn of [...rec.fns]) { fn({ matches: now, media: rec.media }); ran++; }
      }
      return ran;
    },
    queries: () => [...asked],
    listeners: () => lists.filter((l) => l.fns.length > 0).map((l) => ({ media: l.media, count: l.fns.length })),
    totalListeners: () => lists.reduce((n, l) => n + l.fns.length, 0),
  };
}
