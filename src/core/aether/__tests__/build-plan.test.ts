import { describe, it, expect } from 'vitest';
import {
  buildPlanFor, summariseBuildOutput,
  DEFAULT_BUILD_COMMAND, DEFAULT_ROM, DEFAULT_SYMBOLS, AEON_REQUIRED_ENV,
} from '../build-plan';

const base = { basePath: '/engine', env: {} as Record<string, string | undefined> };

describe('buildPlanFor', () => {
  it('defaults to the convention every engine repo here follows', () => {
    const p = buildPlanFor(base);
    expect(p.command).toBe(DEFAULT_BUILD_COMMAND);
    expect(p.args).toEqual([]);
    expect(p.cwd).toBe('/engine');
    expect(p.romPath).toBe(DEFAULT_ROM);
    expect(p.symbolsPath).toBe(DEFAULT_SYMBOLS);
  });

  it('takes a project override, flags and all', () => {
    const p = buildPlanFor({ ...base, raw: { buildCommand: './build.sh demo --fast' } });
    expect(p.command).toBe('./build.sh');
    expect(p.args).toEqual(['demo', '--fast']);
  });

  it('takes project-declared artifact paths', () => {
    const p = buildPlanFor({ ...base, raw: { romPath: 'demo.bin', symbolsPath: 'demo.lst' } });
    expect(p.romPath).toBe('demo.bin');
    expect(p.symbolsPath).toBe('demo.lst');
  });

  it('ignores an empty override rather than spawning an empty command', () => {
    const p = buildPlanFor({ ...base, raw: { buildCommand: '', romPath: '' } });
    expect(p.command).toBe(DEFAULT_BUILD_COMMAND);
    expect(p.romPath).toBe(DEFAULT_ROM);
  });
});

describe('buildPlanFor environment', () => {
  /**
   * aeon's build.sh hard-errors without these — sigil IS the assembler, with no
   * fallback. An Electron app launched from a desktop session inherits none of
   * the exports a terminal build relies on, so this failure looks like a build
   * problem while being a shell-environment one.
   */
  it('names the required variables that are missing from the environment', () => {
    const p = buildPlanFor(base);
    expect(p.missingEnv).toEqual([...AEON_REQUIRED_ENV]);
  });

  it('reports nothing missing when the environment already carries them', () => {
    const p = buildPlanFor({ ...base, env: { SIGIL_BUILD: '/s/sigil', SIGIL_EMIT: '/s/emit' } });
    expect(p.missingEnv).toEqual([]);
  });

  it('lets the project supply them, and counts them as present', () => {
    const p = buildPlanFor({
      ...base,
      raw: { buildEnv: { SIGIL_BUILD: '/s/sigil', SIGIL_EMIT: '/s/emit' } },
    });
    // toMatchObject, not toEqual: the plan also carries FAST=1 by default, which
    // this test is not about.
    expect(p.envOverrides).toMatchObject({ SIGIL_BUILD: '/s/sigil', SIGIL_EMIT: '/s/emit' });
    expect(p.missingEnv).toEqual([]);
  });

  it('lets a project override beat an inherited value', () => {
    const p = buildPlanFor({
      ...base,
      env: { SIGIL_BUILD: '/old' },
      raw: { buildEnv: { SIGIL_BUILD: '/new' } },
    });
    expect(p.envOverrides.SIGIL_BUILD).toBe('/new');
  });

  it('ignores non-string buildEnv entries instead of passing junk to spawn', () => {
    const p = buildPlanFor({ ...base, raw: { buildEnv: { SIGIL_BUILD: 42, SIGIL_EMIT: '/e' } } });
    expect(p.envOverrides).toMatchObject({ SIGIL_EMIT: '/e' });
    expect(p.envOverrides.SIGIL_BUILD).toBeUndefined();
    expect(p.missingEnv).toEqual(['SIGIL_BUILD']);
  });
});

describe('summariseBuildOutput', () => {
  it('returns everything when the output is short', () => {
    expect(summariseBuildOutput('a\nb\nc')).toEqual(['a', 'b', 'c']);
  });

  it('drops blank lines rather than padding the panel with them', () => {
    expect(summariseBuildOutput('a\n\n\nb')).toEqual(['a', 'b']);
  });

  /**
   * The reason this is not a plain tail: a build that fails at its FIRST step
   * still emits hundreds of lines of unrelated success afterwards, so tailing
   * blindly shows a green wall for a red build.
   */
  it('keeps an early error even when the tail is long and clean', () => {
    const lines = ['ERROR: collision gate rejected section_3', ...Array.from({ length: 500 }, (_, i) => `ok ${i}`)];
    const out = summariseBuildOutput(lines.join('\n'), 50);
    expect(out[0]).toContain('collision gate rejected');
    expect(out.length).toBeLessThan(lines.length);
  });

  it('keeps a line of context either side of an error', () => {
    const lines = ['before', 'ERROR: boom', 'after', ...Array.from({ length: 300 }, (_, i) => `ok ${i}`)];
    const out = summariseBuildOutput(lines.join('\n'), 20);
    expect(out.slice(0, 3)).toEqual(['before', 'ERROR: boom', 'after']);
  });

  it('preserves original order when stitching kept regions together', () => {
    const lines = ['ERROR: first', ...Array.from({ length: 300 }, (_, i) => `ok ${i}`), 'ERROR: last'];
    const out = summariseBuildOutput(lines.join('\n'), 10);
    expect(out.indexOf('ERROR: first')).toBeLessThan(out.indexOf('ERROR: last'));
  });
});

describe('buildPlanFor and the FAST shape', () => {
  it('defaults to FAST — this is the iteration loop', () => {
    const p = buildPlanFor(base);
    expect(p.fast).toBe(true);
    expect(p.envOverrides.FAST).toBe('1');
    // FAST re-bakes stale editor data itself, so planning our own step would
    // run the generators twice, and ours would run them unconditionally.
    expect(p.prebuild).toBeNull();
  });

  it('lets a project opt out for a shipping build', () => {
    const p = buildPlanFor({ ...base, raw: { buildFast: false } });
    expect(p.fast).toBe(false);
    expect(p.envOverrides.FAST).toBeUndefined();
  });
});

describe('buildPlanFor for a classic project', () => {
  // Every expectation below is transcribed from s1disasm's own build, not from
  // a design doc: the entry point is `lua build.lua` (build.lua is a shebanged
  // Lua script; build.bat is a Windows shim over the same file); the artifact
  // is `s1built.bin` (build.lua:27 `build_rom_and_handle_failure("sonic",
  // "s1built", …)`, :30 `fix_header("s1built.bin")`); and the listing is
  // `sonic.lst` because AS's `-L` (common.lua:773) names the listing after the
  // SOURCE file (`sonic.asm`), never after the ROM.
  const classic = { ...base, projectType: 'classic' as const };

  it('defaults to the classic toolchain, not aeon.s', () => {
    const p = buildPlanFor(classic);
    expect(p.command).toBe('lua');
    expect(p.args).toEqual(['build.lua']);
    expect(p.romPath).toBe('s1built.bin');
    expect(p.symbolsPath).toBe('sonic.lst');
    expect(p.projectType).toBe('classic');
  });

  it('requires NO environment — lua build.lua reads none', () => {
    // The aeon plan under the same empty env names both SIGIL_* variables as
    // missing (asserted above); the classic plan must name neither, because
    // build.lua invokes its bundled native asl/p2bin directly (common.lua
    // picks the platform binary) and never consults SIGIL_BUILD/SIGIL_EMIT.
    const p = buildPlanFor(classic);
    expect(p.missingEnv).toEqual([]);
  });

  it('never claims the FAST shape — build.lua has no such switch', () => {
    // `fast` drives a "not a ship artifact" caveat downstream; for classic that
    // claim would be false, so even an explicit buildFast:true must not set it.
    for (const raw of [undefined, { buildFast: true }, { buildFast: false }]) {
      const p = buildPlanFor({ ...classic, raw });
      expect(p.fast).toBe(false);
      expect(p.envOverrides.FAST).toBeUndefined();
    }
  });

  it('plans no phantom pre-build — a classic save writes the assembler inputs in place', () => {
    // aeon's default pre-build (tools/regenerate-level.sh) exists only in the
    // aeon tree; `exists` returning true for it must not summon it here.
    const p = buildPlanFor({ ...classic, exists: () => true });
    expect(p.prebuild).toBeNull();
  });

  it('still honours a declared pre-build, declared command and declared paths', () => {
    const p = buildPlanFor({
      ...classic,
      raw: {
        buildCommand: 'lua build.lua', prebuildCommand: './gen.sh',
        romPath: 's1built.bin', symbolsPath: 'sonic.lst',
      },
    });
    expect(p.command).toBe('lua');
    expect(p.prebuild).toEqual({ command: './gen.sh', args: [] });
    expect(p.symbolsDeclared).toBe(true);
  });

  it('marks an undeclared symbolsPath so the runner knows the default is a guess', () => {
    expect(buildPlanFor(classic).symbolsDeclared).toBe(false);
    expect(buildPlanFor(base).symbolsDeclared).toBe(false);
    expect(buildPlanFor({ ...base, raw: { symbolsPath: 's4.lst' } }).symbolsDeclared).toBe(true);
  });

  it('leaves the aeon plan byte-identical when projectType is absent', () => {
    const p = buildPlanFor(base);
    expect(p.projectType).toBe('aeon');
    expect(p.command).toBe(DEFAULT_BUILD_COMMAND);
    expect(p.missingEnv).toEqual([...AEON_REQUIRED_ENV]);
    expect(p.fast).toBe(true);
  });
});
