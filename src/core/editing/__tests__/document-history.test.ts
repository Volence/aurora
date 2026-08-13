import { describe, it, expect, beforeEach } from 'vitest';
import { DocumentHistoryHub } from '../document-history';
import type { UndoStack } from '../undo-stack';

function fakeStack(label: string, log: string[]): UndoStack {
  let listeners: Array<() => void> = [];
  return {
    canUndo: true,
    canRedo: false,
    undo() { log.push(`${label}:undo`); listeners.forEach((l) => l()); },
    redo() { log.push(`${label}:redo`); },
    clear() { log.push(`${label}:clear`); },
    onChange(cb) {
      listeners.push(cb);
      return () => { listeners = listeners.filter((l) => l !== cb); };
    },
  };
}

describe('DocumentHistoryHub', () => {
  let hub: DocumentHistoryHub;
  let log: string[];

  beforeEach(() => {
    hub = new DocumentHistoryHub();
    log = [];
  });

  it('routes a doc id to the factory whose prefix matches', () => {
    hub.registerFactory('level:', (id) => fakeStack(`layout(${id})`, log));
    hub.registerFactory('zoneart:', (id) => fakeStack(`art(${id})`, log));

    hub.historyFor('level:ghz:1').undo();
    hub.historyFor('zoneart:ghz').undo();

    expect(log).toEqual(['layout(level:ghz:1):undo', 'art(zoneart:ghz):undo']);
  });

  it('prefers the longest matching prefix', () => {
    hub.registerFactory('doc:', (id) => fakeStack(`generic(${id})`, log));
    hub.registerFactory('doc:sprite:', (id) => fakeStack(`sprite(${id})`, log));

    hub.historyFor('doc:sprite:s1:18').undo();

    expect(log).toEqual(['sprite(doc:sprite:s1:18):undo']);
  });

  it('returns the same stack instance for the same doc id', () => {
    hub.registerFactory('level:', (id) => fakeStack(id, log));
    expect(hub.historyFor('level:ghz:1')).toBe(hub.historyFor('level:ghz:1'));
  });

  it('throws on an unregistered prefix rather than silently no-oping', () => {
    expect(() => hub.historyFor('mystery:1')).toThrow(/no undo-stack factory/i);
  });

  it('keeps documents isolated', () => {
    hub.registerFactory('level:', (id) => fakeStack(id, log));
    hub.historyFor('level:ghz:1').undo();
    expect(log).toEqual(['level:ghz:1:undo']);
  });

  it('dispose clears and drops one document', () => {
    hub.registerFactory('level:', (id) => fakeStack(id, log));
    hub.historyFor('level:ghz:1');
    expect(hub.has('level:ghz:1')).toBe(true);

    hub.dispose('level:ghz:1');
    expect(log).toEqual(['level:ghz:1:clear']);
    expect(hub.has('level:ghz:1')).toBe(false);
  });

  it('clearAll clears and drops every document', () => {
    hub.registerFactory('level:', (id) => fakeStack(id, log));
    hub.historyFor('level:ghz:1');
    hub.historyFor('level:ghz:2');

    hub.clearAll();
    expect(log).toEqual(['level:ghz:1:clear', 'level:ghz:2:clear']);
    expect(hub.has('level:ghz:1')).toBe(false);
    expect(hub.has('level:ghz:2')).toBe(false);
  });

  it('re-emits any stack change as a hub-level change', () => {
    hub.registerFactory('level:', (id) => fakeStack(id, log));
    let fired = 0;
    hub.onChange(() => { fired++; });

    hub.historyFor('level:ghz:1').undo();
    expect(fired).toBe(1);

    hub.historyFor('level:ghz:2').undo();
    expect(fired).toBe(2);
  });

  it('stops re-emitting from a disposed stack', () => {
    hub.registerFactory('level:', (id) => fakeStack(id, log));
    let fired = 0;
    hub.onChange(() => { fired++; });

    const stack = hub.historyFor('level:ghz:1');
    hub.dispose('level:ghz:1');
    stack.undo();

    expect(fired).toBe(0);
  });
});
