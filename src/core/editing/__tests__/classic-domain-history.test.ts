import { describe, it, expect } from 'vitest';
import {
  ClassicLayoutHistory, ClassicArtHistory,
  LAYOUT_DOMAINS, ART_DOMAINS,
  type ClassicLayoutSnapshot, type ClassicArtSnapshot,
} from '../classic-domain-history';

function layoutSnap(marker: number): ClassicLayoutSnapshot {
  return {
    fg: { width: 2, height: 2, cells: new Uint8Array([marker, 0, 0, 0]) },
    bg: { width: 2, height: 2, cells: new Uint8Array(4) },
    objects: [],
    start: { x: marker, y: 0 },
    dirty: {},
  } as unknown as ClassicLayoutSnapshot;
}

function artSnap(marker: number): ClassicArtSnapshot {
  return {
    chunks: [], blocks: [],
    tiles: new Uint8Array([marker]),
    palettes: [],
    colind: new Uint8Array(0),
    chunkVersions: new Map([[1, marker]]),
    chunkEpoch: marker,
    dirty: {},
  } as unknown as ClassicArtSnapshot;
}

describe('domain partition', () => {
  it('covers all nine DirtyDomains keys with no overlap', () => {
    const all = [...LAYOUT_DOMAINS, ...ART_DOMAINS];
    expect(new Set(all).size).toBe(all.length);
    expect(new Set(all)).toEqual(
      new Set(['fg', 'bg', 'objects', 'start', 'tiles', 'blocks', 'chunks', 'palette', 'colind']),
    );
  });
});

describe('ClassicLayoutHistory', () => {
  it('undoes and redoes through the bound accessors', () => {
    let live = layoutSnap(1);
    const h = new ClassicLayoutHistory(() => live, (s) => { live = s; });

    h.record(live);              // BEFORE the edit
    live = layoutSnap(2);        // the store applies the edit
    expect(h.canUndo).toBe(true);

    h.undo();
    expect(live.start.x).toBe(1);
    expect(h.canRedo).toBe(true);

    h.redo();
    expect(live.start.x).toBe(2);
  });

  it('a new record wipes the redo stack', () => {
    let live = layoutSnap(1);
    const h = new ClassicLayoutHistory(() => live, (s) => { live = s; });
    h.record(live); live = layoutSnap(2);
    h.undo();
    expect(h.canRedo).toBe(true);

    h.record(live); live = layoutSnap(3);
    expect(h.canRedo).toBe(false);
  });

  it('notifies subscribers on record, undo and redo', () => {
    let live = layoutSnap(1);
    const h = new ClassicLayoutHistory(() => live, (s) => { live = s; });
    let fired = 0;
    const off = h.onChange(() => { fired++; });

    h.record(live); live = layoutSnap(2);
    h.undo();
    h.redo();
    expect(fired).toBe(3);

    off();
    h.undo();
    expect(fired).toBe(3);
  });

  it('clear empties both stacks', () => {
    let live = layoutSnap(1);
    const h = new ClassicLayoutHistory(() => live, (s) => { live = s; });
    h.record(live);
    h.clear();
    expect(h.canUndo).toBe(false);
    expect(h.canRedo).toBe(false);
  });
});

describe('ClassicArtHistory', () => {
  it('restores the chunk-version triple together', () => {
    let live = artSnap(1);
    const h = new ClassicArtHistory(() => live, (s) => { live = s; });

    h.record(live);
    live = artSnap(9);

    h.undo();
    expect(live.tiles[0]).toBe(1);
    expect(live.chunkEpoch).toBe(1);
    expect(live.chunkVersions.get(1)).toBe(1);
  });

  it('clones the mutable containers so restore is not aliased', () => {
    let live = artSnap(1);
    const h = new ClassicArtHistory(() => live, (s) => { live = s; });
    const original = live;
    h.record(live);
    live = artSnap(9);
    h.undo();
    expect(live.chunkVersions).not.toBe(original.chunkVersions);
  });
});

describe('document isolation', () => {
  it('an art edit does not touch a layout stack', () => {
    let liveL = layoutSnap(1);
    let liveA = artSnap(1);
    const layout = new ClassicLayoutHistory(() => liveL, (s) => { liveL = s; });
    const art = new ClassicArtHistory(() => liveA, (s) => { liveA = s; });

    layout.record(liveL); liveL = layoutSnap(2);
    layout.undo();
    expect(layout.canRedo).toBe(true);

    art.record(liveA); liveA = artSnap(2);   // a new edit on a DIFFERENT document
    expect(layout.canRedo).toBe(true);        // must NOT invalidate layout's redo
  });
});
