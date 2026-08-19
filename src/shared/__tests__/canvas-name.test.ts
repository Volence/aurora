// The canvas-name rule has to be ONE rule in two places: the renderer's guard,
// which throws, and the `commit_canvas` tool schema, which rejects. This pins
// that they are the same rule — a schema looser than the guard hands the client
// a -32603 INTERNAL ("the server broke") for what is only a mistyped argument,
// which is the exact failure the art surface's fault/refusal split exists to
// avoid; a schema tighter than the guard refuses names the editor can save.

import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import { CANVAS_NAME_PATTERN } from '../canvas-name';
import { canvasNameIsSafe } from '../../renderer/state/canvas-file';
import { EDITOR_METHODS } from '../../main/editor-methods';

const GOOD = ['blob', 'a', 'GHZ_slope-01', '0', 'A'.repeat(64)];
const BAD = ['', '../etc/passwd', 'a/b', 'sub/name', '.hidden', '-lead', 'has space', 'A'.repeat(65), 'name.png'];

describe('CANVAS_NAME_PATTERN', () => {
  it('accepts plain stems and rejects anything that could address another file', () => {
    for (const n of GOOD) expect(CANVAS_NAME_PATTERN.test(n), n).toBe(true);
    for (const n of BAD) expect(CANVAS_NAME_PATTERN.test(n), n).toBe(false);
  });

  // No `g` flag: a shared global-flagged RegExp carries `lastIndex` between
  // calls and answers differently on alternate ones.
  it('is stateless across repeated tests of the same input', () => {
    expect(CANVAS_NAME_PATTERN.test('blob')).toBe(true);
    expect(CANVAS_NAME_PATTERN.test('blob')).toBe(true);
  });

  it('is exactly what the renderer guard enforces', () => {
    for (const n of [...GOOD, ...BAD]) expect(canvasNameIsSafe(n), n).toBe(CANVAS_NAME_PATTERN.test(n));
  });
});

describe("commit_canvas's name schema", () => {
  // The whole params object, the way the Aether adapter validates it —
  // `z.object(m.params).safeParse(...)` at adapter.ts:25/68, whose failure is
  // ERR.INVALID_PARAMS. The MCP server hands the same shape to the SDK as
  // `inputSchema` (mcp-server.ts:35) and the SDK validates it there. Every
  // other param is optional, so this isolates `name`.
  const params = () => {
    const entry = EDITOR_METHODS.find((m) => m.name === 'commit_canvas');
    if (!entry) throw new Error('commit_canvas is not in the registry');
    return z.object(entry.params);
  };

  it('rejects at the protocol edge every name the guard would throw on', () => {
    const schema = params();
    for (const n of BAD) expect(schema.safeParse({ name: n }).success, n).toBe(false);
    for (const n of GOOD) expect(schema.safeParse({ name: n }).success, n).toBe(true);
  });
});
