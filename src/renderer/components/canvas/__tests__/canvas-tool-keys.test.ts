// THE CANVAS TOOL KEYS (UX-A3).
//
// The origination canvas is measured against "an artist should not leave for
// Aseprite", and it shipped with no keyboard route to its tool bar at all —
// every tool change was a mouse trip to the dock, mid-stroke, forever. This is
// the model behind the keys; CanvasMode wires it to one window keydown.
//
// The bindings are Aseprite's where Aseprite has one, because that is the muscle
// memory the artist arrives with. `dither` has no Aseprite counterpart and takes
// its own initial.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { TOOL_KEYS, toolForKey } from '../canvas-tool-keys';
import type { CanvasTool } from '../../../state/canvasStore';

const ev = (init: Partial<KeyboardEvent> & { key: string }) => ({
  ctrlKey: false, metaKey: false, altKey: false, shiftKey: false, ...init,
}) as KeyboardEvent;

describe('canvas tool keys', () => {
  it('binds every tool the dock offers, and nothing it does not', () => {
    // The dock renders CanvasTool[]; a tool added there with no key here is the
    // regression this asserts — the bar goes half-keyboard-reachable in silence.
    const bound = Object.values(TOOL_KEYS).sort();
    const tools: CanvasTool[] = ['pencil', 'eraser', 'fill', 'eyedropper', 'line', 'rect', 'select', 'dither'];
    expect(Object.keys(TOOL_KEYS).sort()).toEqual([...tools].sort());
    // No two tools may claim the same key; the later one would be unreachable.
    expect(new Set(bound).size).toBe(bound.length);
  });

  it('uses the Aseprite letters', () => {
    expect(TOOL_KEYS).toMatchObject({
      pencil: 'b', eraser: 'e', fill: 'g', eyedropper: 'i',
      line: 'l', rect: 'u', select: 'm',
    });
  });

  it('resolves a bare letter, in either case', () => {
    expect(toolForKey(ev({ key: 'b' }))).toBe('pencil');
    expect(toolForKey(ev({ key: 'B' }))).toBe('pencil');
    expect(toolForKey(ev({ key: 'm' }))).toBe('select');
  });

  it('resolves nothing for an unbound key', () => {
    expect(toolForKey(ev({ key: 'q' }))).toBeNull();
    expect(toolForKey(ev({ key: 'Enter' }))).toBeNull();
    expect(toolForKey(ev({ key: ' ' }))).toBeNull();  // hand-pan owns Space
  });

  it('declines every modified key', () => {
    // Ctrl+E / Cmd+E and friends belong to the app and the OS. A tool key that
    // fired through a modifier would silently change the tool under every
    // shortcut that shares its letter — Ctrl+B, Alt+I, Cmd+L.
    for (const mod of ['ctrlKey', 'metaKey', 'altKey', 'shiftKey'] as const) {
      expect(toolForKey(ev({ key: 'b', [mod]: true })), mod).toBeNull();
    }
  });
});

// The wiring, by source scan: CanvasMode.tsx is a .tsx and this suite is
// node-only, so nothing above proves the handler is actually attached.
const CANVAS_MODE = readFileSync(join(__dirname, '..', 'CanvasMode.tsx'), 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/(^|[^:])\/\/.*$/gm, '$1');

describe('CanvasMode wiring', () => {
  it('resolves tool keys through the shared table', () => {
    expect(CANVAS_MODE).toMatch(/import\s*\{[^}]*toolForKey[^}]*\}\s*from\s*'\.\/canvas-tool-keys'/);
    expect(CANVAS_MODE).toMatch(/toolForKey\(e\)/);
    expect(CANVAS_MODE).toMatch(/setTool\(tool\)/);
  });

  it('keeps the typing guard ahead of the tool keys', () => {
    // Without this ordering, typing a canvas name or a grid origin would arm the
    // eraser on every "e" — the loudest possible version of this bug.
    const guard = CANVAS_MODE.indexOf('isTypingTarget(e.target)');
    const tool = CANVAS_MODE.indexOf('toolForKey(e)');
    expect(guard).toBeGreaterThanOrEqual(0);
    expect(tool).toBeGreaterThan(guard);
  });

  it('prints each shortcut in the dock tooltip from the same table', () => {
    // A shortcut nobody can discover is not a shortcut, and a hand-typed one
    // drifts from the binding it advertises.
    expect(CANVAS_MODE).toMatch(/TOOL_KEYS\[t\]/);
  });
});
