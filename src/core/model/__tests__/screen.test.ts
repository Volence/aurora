// The game screen's size, checked against the ENGINE'S OWN CONSTANT.
//
// Aurora states 320x224 in core/model/screen.ts and this file is why that is
// not a typed pin: it reads aeon's `engine/system/constants.emp` from the
// sibling checkout and asserts the two agree. If aeon ever moves to a different
// frame (a 256-wide H32 mode, a 240-line PAL strip), this goes red rather than
// the overlay quietly lying about what the camera sees.
//
// When the sibling checkout is absent the row SKIPS WITH A MESSAGE — never
// silently green, never a hard failure on a machine without aeon.

import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SCREEN_WIDTH, SCREEN_HEIGHT, SCREEN_CONSTANT_SOURCE } from '../screen';

/**
 * Walk up from this file until a directory holds a sibling `aeon/` checkout.
 * Walking (rather than a fixed `../../aeon`) is what makes the row find aeon
 * from a git worktree under `aurora/.claude/worktrees/<id>/` as well as from
 * the aurora root.
 */
function findAeonConstants(): string | null {
  let dir = dirname(fileURLToPath(import.meta.url));
  for (let i = 0; i < 12; i++) {
    const candidate = join(dir, 'aeon', SCREEN_CONSTANT_SOURCE.file);
    if (existsSync(candidate)) return candidate;
    const parent = resolve(dir, '..');
    if (parent === dir) break;
    dir = parent;
  }
  return null;
}

function readConst(src: string, name: string): number | null {
  const m = src.match(new RegExp(`^\\s*pub\\s+const\\s+${name}\\s*=\\s*(\\d+)`, 'm'));
  return m ? Number(m[1]) : null;
}

const aeonPath = findAeonConstants();
const row = aeonPath ? it : it.skip;
const why = aeonPath ? '' : ' — SKIPPED: no sibling aeon checkout found, aeon\'s constant could not be read';

describe('core/model/screen mirrors aeon engine.constants', () => {
  row(`SCREEN_WIDTH equals aeon's ${SCREEN_CONSTANT_SOURCE.width}${why}`, () => {
    const src = readFileSync(aeonPath!, 'utf8');
    const theirs = readConst(src, SCREEN_CONSTANT_SOURCE.width);
    expect(theirs, `${SCREEN_CONSTANT_SOURCE.width} not found in ${aeonPath}`).not.toBeNull();
    expect(SCREEN_WIDTH).toBe(theirs);
  });

  row(`SCREEN_HEIGHT equals aeon's ${SCREEN_CONSTANT_SOURCE.height}${why}`, () => {
    const src = readFileSync(aeonPath!, 'utf8');
    const theirs = readConst(src, SCREEN_CONSTANT_SOURCE.height);
    expect(theirs, `${SCREEN_CONSTANT_SOURCE.height} not found in ${aeonPath}`).not.toBeNull();
    expect(SCREEN_HEIGHT).toBe(theirs);
  });

  it('names the file and symbols it mirrors, so the docblock cannot drift from the check', () => {
    expect(SCREEN_CONSTANT_SOURCE.file).toBe('engine/system/constants.emp');
    expect(SCREEN_CONSTANT_SOURCE.width).toBe('SCREEN_WIDTH');
    expect(SCREEN_CONSTANT_SOURCE.height).toBe('SCREEN_HEIGHT');
  });
});
