// src/renderer/shell/__tests__/commands.test.ts
import { describe, it, expect, vi } from 'vitest';
import { buildCommands, type CommandSnapshot, type CommandActions } from '../commands';

function actions(): CommandActions {
  return {
    openProjectDialog: vi.fn(), saveAll: vi.fn(), toggleExplorer: vi.fn(),
    openTab: vi.fn(), editObjectArt: vi.fn(), openRecent: vi.fn(),
  };
}

const emptySnapshot: CommandSnapshot = {
  tabs: [{ id: 'home', kind: 'home', title: 'Home' }],
  activeId: 'home',
  engine: null,
  levelTabs: [],
  objects: [],
  aeonSprites: [],
  recents: [],
};

describe('buildCommands', () => {
  it('always offers the global commands', () => {
    const cmds = buildCommands(emptySnapshot, actions());
    const ids = cmds.map((c) => c.id);
    expect(ids).toContain('open-project');
    expect(ids).toContain('save-all');
    expect(ids).toContain('toggle-explorer');
    expect(ids).toContain('open-setup');
  });

  it('offers "Go to tab" for every open non-active tab', () => {
    const a = actions();
    const cmds = buildCommands({
      ...emptySnapshot,
      tabs: [
        { id: 'home', kind: 'home', title: 'Home' },
        { id: 'level:ghz:1', kind: 'level', title: 'GHZ Act 1' },
        { id: 'tool:project-setup', kind: 'tool', title: 'Project Setup' },
      ],
      activeId: 'level:ghz:1',
    }, a);
    const goto = cmds.filter((c) => c.id.startsWith('goto:'));
    expect(goto.map((c) => c.label)).toEqual(['Go to tab: Home', 'Go to tab: Project Setup']);
    goto[0].run();
    expect(a.openTab).toHaveBeenCalledWith({ id: 'home', kind: 'home', title: 'Home' });
  });

  it('offers "Open level" for project levels not already open as tabs', () => {
    const a = actions();
    const cmds = buildCommands({
      ...emptySnapshot,
      engine: 's1',
      tabs: [
        { id: 'home', kind: 'home', title: 'Home' },
        { id: 'level:ghz:1', kind: 'level', title: 'GHZ Act 1' },
      ],
      levelTabs: [
        { id: 'level:ghz:1', kind: 'level', title: 'GHZ Act 1' },
        { id: 'level:mz:1', kind: 'level', title: 'Marble Act 1' },
      ],
    }, a);
    const open = cmds.filter((c) => c.id.startsWith('open-level:'));
    expect(open.map((c) => c.label)).toEqual(['Open level: Marble Act 1']);
    open[0].run();
    expect(a.openTab).toHaveBeenCalledWith({ id: 'level:mz:1', kind: 'level', title: 'Marble Act 1' });
  });

  it('offers "Edit art" per classic object and routes the numeric id', () => {
    const a = actions();
    const cmds = buildCommands({
      ...emptySnapshot,
      engine: 's1',
      objects: [{ id: 0x4b, name: 'Buzz Bomber', hex: '$4B' }],
    }, a);
    const edit = cmds.find((c) => c.id === 'edit-art:75')!;
    expect(edit.label).toBe('Edit art: Buzz Bomber');
    expect(edit.hint).toBe('$4B');
    edit.run();
    expect(a.editObjectArt).toHaveBeenCalledWith(0x4b);
  });

  it('offers "Edit sprite" commands for aeon library entries', () => {
    const a = actions();
    const cmds = buildCommands({
      ...emptySnapshot,
      engine: 'aeon',
      aeonSprites: [{ name: 'Moto Bug', sprite: 'motobug' }],
    }, a);
    const c = cmds.find((x) => x.id === 'edit-sprite:motobug')!;
    expect(c.label).toBe('Edit sprite: Moto Bug');
    c.run();
    expect(a.openTab).toHaveBeenCalledWith({ id: 'doc:sprite:aeon:motobug', kind: 'sprite-doc', title: 'Moto Bug' });
  });

  it('offers recents only when no project is open', () => {
    const withRecents = {
      ...emptySnapshot,
      recents: [{ path: '/p', name: 'S1', lastOpened: 1 }],
    };
    expect(buildCommands(withRecents, actions()).some((c) => c.id === 'recent:/p')).toBe(true);
    expect(buildCommands({ ...withRecents, engine: 's1' as const }, actions())
      .some((c) => c.id === 'recent:/p')).toBe(false);
  });
});
