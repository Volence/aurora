import { describe, it, expect } from 'vitest';
import { CLASSIC_TILE_TOOLS, isPixelTool, toolConfigFrom } from '../tool-config';
import type { ArtTool as CtlArtTool } from '../pixel-edit-controller';

describe('CLASSIC_TILE_TOOLS', () => {
  it('is exactly the pixel tools the controller implements', () => {
    expect([...CLASSIC_TILE_TOOLS].sort()).toEqual(
      ['dither', 'eraser', 'eyedropper', 'fill', 'line', 'pencil', 'rect', 'select'],
    );
  });

  it('excludes every tile-space tool', () => {
    for (const t of ['tile-stamp', 'collision', 'palette-apply']) {
      expect(CLASSIC_TILE_TOOLS).not.toContain(t);
      expect(isPixelTool(t)).toBe(false);
    }
  });

  // Drift guard. Chosen as a pair of TYPE-level assertions rather than a runtime
  // comparison because the controller exports `ArtTool` as a type only — there is
  // no runtime value of the union to compare against, and inventing one in the
  // controller purely to be compared here would be a second list that can itself
  // drift. tsconfig.json includes `src/**/*`, so `npx tsc --noEmit` (the project's
  // verification gate) typechecks this file and both assertions below genuinely
  // fail the build on drift, in either direction. The runtime loop then pins the
  // third party to the agreement: the coercion in `toolConfigFrom`.
  it('cannot drift from the controller ArtTool union', () => {
    // Forward: every member of the list is a tool the controller implements.
    // Adding e.g. 'tile-stamp' to CLASSIC_TILE_TOOLS stops compiling here.
    const assignable: readonly CtlArtTool[] = CLASSIC_TILE_TOOLS;

    // Reverse: the controller gaining a tool the list has not been told about
    // makes `Missing` non-never, and this initializer stops compiling.
    type Missing = Exclude<CtlArtTool, (typeof CLASSIC_TILE_TOOLS)[number]>;
    const noneMissing: [Missing] extends [never] ? true : never = true;
    expect(noneMissing).toBe(true);

    // And the coercion agrees with the list: every listed tool passes through.
    for (const t of assignable) {
      expect(isPixelTool(t)).toBe(true);
      expect(toolConfigFrom({
        tool: t, selectedColor: 0, mirror: null,
        ditherPattern: 'checker', ditherSecondary: 0, pixelPerfect: false,
      }).tool).toBe(t);
    }
  });
});

describe('toolConfigFrom', () => {
  it('carries the drawing modifiers through verbatim', () => {
    const cfg = toolConfigFrom({
      tool: 'line', selectedColor: 7, mirror: 'both',
      ditherPattern: 'sparse25', ditherSecondary: 3, pixelPerfect: true,
    });
    expect(cfg).toEqual({
      tool: 'line', color: 7, mirror: 'both',
      ditherPattern: 'sparse25', ditherSecondary: 3, pixelPerfect: true,
    });
  });

  it('falls back to pencil for a tile-space tool, so a classic host never gets one', () => {
    const cfg = toolConfigFrom({
      tool: 'tile-stamp', selectedColor: 1, mirror: null,
      ditherPattern: 'checker', ditherSecondary: 0, pixelPerfect: false,
    });
    expect(cfg.tool).toBe('pencil');
  });
});
