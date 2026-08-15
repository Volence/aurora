import { describe, it, expect, beforeEach } from 'vitest';
import { levelKeysEnabled } from '../level-keys';
import { useSessionStore } from '../../state/sessionStore';
import { aeonLevelTab, spriteDocTab, untitledSpriteTab } from '../../shell/tabs';

// levelKeysEnabled() gates the (keep-alive, hidden) level editors' window keydown
// handlers: inert whenever a sprite-doc or canvas-doc tab is active, so that
// editor alone owns the keyboard (finding 1 — the double-undo merge blocker).
// Home stays enabled (master's pre-existing Home-tab keep-alive semantics,
// deliberately unchanged).
//
// WHAT THIS FILE PROVES, AND WHAT IT DOES NOT. Everything here is about the
// PREDICATE. That the predicate matters — that a live level handler would
// consume a second undo entry off the focused editor's own stack — is pinned in
// undo-double-consume.test.ts, because the CDP run showed this file could pass
// unchanged while nothing downstream depended on it.

describe('levelKeysEnabled', () => {
  beforeEach(() => {
    useSessionStore.getState().reset(); // Home active
  });

  it('is enabled with a level tab active', () => {
    const level = aeonLevelTab('zone1', 'Zone 1', 'act1');
    useSessionStore.getState().open(level);
    expect(useSessionStore.getState().activeId).toBe(level.id);
    expect(levelKeysEnabled()).toBe(true);
  });

  it('is disabled while a sprite-doc tab is active', () => {
    const sprite = spriteDocTab('aeon', 'MySprite', 'MySprite');
    useSessionStore.getState().open(sprite);
    expect(useSessionStore.getState().activeId).toBe(sprite.id);
    expect(levelKeysEnabled()).toBe(false);
  });

  it('re-enables after switching from the sprite tab back to the level tab', () => {
    const level = aeonLevelTab('zone1', 'Zone 1', 'act1');
    const sprite = spriteDocTab('aeon', 'MySprite', 'MySprite');
    useSessionStore.getState().open(level);
    useSessionStore.getState().open(sprite); // sprite now active → inert
    expect(levelKeysEnabled()).toBe(false);
    useSessionStore.getState().focus(level.id); // back to the level
    expect(levelKeysEnabled()).toBe(true);
  });

  it('is disabled while the UNTITLED sprite tab is active', () => {
    // "New Sprite…" mounts SpriteMode exactly like an engine-bound sprite tab,
    // so the hidden level handlers must be just as inert — otherwise one Ctrl+Z
    // is seen by two handlers that both drive THIS sprite's stack, and two edits
    // vanish per press.
    const untitled = untitledSpriteTab();
    useSessionStore.getState().open(untitled);
    expect(useSessionStore.getState().activeId).toBe(untitled.id);
    expect(levelKeysEnabled()).toBe(false);
  });

  it('stays enabled on the Home tab (keep-alive semantics preserved)', () => {
    expect(useSessionStore.getState().activeId).toBe('home');
    expect(levelKeysEnabled()).toBe(true);
  });
});
