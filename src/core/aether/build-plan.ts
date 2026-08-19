/**
 * What "Build & Run" actually runs, resolved from the project rather than
 * assumed.
 *
 * Pure on purpose: spawning is the easy part, and the part that goes wrong is
 * deciding WHAT to spawn, WHERE, with WHICH environment, and which artifacts to
 * hand the emulator afterwards. All of that is decided here and tested, so the
 * runner is a spawn and two calls.
 *
 * THE ENVIRONMENT IS NOT INCIDENTAL. aeon's `build.sh` hard-errors without
 * `SIGIL_BUILD` and `SIGIL_EMIT` pointing at executables — sigil IS the
 * assembler now, with no fallback. An Electron app launched from a desktop
 * session inherits none of the shell exports a terminal build relies on, so a
 * naive spawn fails for a reason that has nothing to do with the level being
 * edited. The plan therefore names the variables a build needs and reports
 * which are missing, so the failure can be explained rather than merely shown.
 */

export interface BuildPlanInput {
  /** Absolute path to the engine repo root (where project.json lives). */
  basePath: string;
  /** The raw project.json, which may carry build fields Aurora does not model. */
  raw?: Record<string, unknown>;
  /** The environment the app is running under. */
  env: Record<string, string | undefined>;
}

export interface BuildPlan {
  command: string;
  args: string[];
  cwd: string;
  /** Extra environment the project asked for, merged over the inherited env. */
  envOverrides: Record<string, string>;
  /** ROM to hand `emulator/reload_rom` on success, relative to `cwd`. */
  romPath: string;
  /** Listing to hand `emulator/load_symbols`, relative to `cwd`. */
  symbolsPath: string;
  /**
   * Variables this build is known to require that are ABSENT from the merged
   * environment. Not fatal here — the build is still attempted, because only
   * the build knows what it truly needs — but it is what turns "exit 1" into a
   * sentence a person can act on.
   */
  missingEnv: string[];
}

export const DEFAULT_BUILD_COMMAND = './build.sh';
export const DEFAULT_ROM = 's4.bin';
export const DEFAULT_SYMBOLS = 's4.lst';

/**
 * Variables aeon's build refuses to run without. Named here rather than
 * detected, because the failure they cause is a shell-environment problem that
 * looks like a build problem, and the fix ("export SIGIL_BUILD") is not
 * discoverable from the build's own output inside a GUI app.
 */
export const AEON_REQUIRED_ENV = ['SIGIL_BUILD', 'SIGIL_EMIT'] as const;

const str = (v: unknown): string | null => (typeof v === 'string' && v.length > 0 ? v : null);

export function buildPlanFor(input: BuildPlanInput): BuildPlan {
  const raw = input.raw ?? {};

  // A project may override the command; the default is the convention every
  // engine repo here follows.
  const commandLine = str(raw.buildCommand) ?? DEFAULT_BUILD_COMMAND;
  // Split on whitespace so `buildCommand` can carry flags ("./build.sh demo")
  // without the caller having to model args separately.
  const [command, ...args] = commandLine.split(/\s+/);

  const envOverrides: Record<string, string> = {};
  const declared = raw.buildEnv;
  if (declared && typeof declared === 'object') {
    for (const [k, v] of Object.entries(declared as Record<string, unknown>)) {
      const s = str(v);
      if (s) envOverrides[k] = s;
    }
  }

  const merged = { ...input.env, ...envOverrides };
  const missingEnv = AEON_REQUIRED_ENV.filter((k) => !str(merged[k]));

  return {
    command,
    args,
    cwd: input.basePath,
    envOverrides,
    romPath: str(raw.romPath) ?? DEFAULT_ROM,
    symbolsPath: str(raw.symbolsPath) ?? DEFAULT_SYMBOLS,
    missingEnv,
  };
}

/**
 * The last `n` lines of build output, which is what a failure panel shows.
 *
 * Kept here rather than in the runner because "which lines survive" is a
 * decision with a wrong answer: a build that fails at its FIRST step still
 * ends with hundreds of lines of unrelated success, so tailing blindly can
 * show a green wall for a red build. Error-ish lines are therefore retained
 * preferentially, in their original order.
 */
export function summariseBuildOutput(output: string, n = 200): string[] {
  const lines = output.split('\n').filter((l) => l.trim().length > 0);
  if (lines.length <= n) return lines;

  const interesting = new Set<number>();
  lines.forEach((l, i) => {
    if (/\b(error|ERROR|failed|FAILED|cannot|refus)/.test(l)) {
      // Keep a line of context either side; an assembler error and its file
      // are usually adjacent.
      for (let j = Math.max(0, i - 1); j <= Math.min(lines.length - 1, i + 1); j++) interesting.add(j);
    }
  });

  const tailStart = lines.length - n;
  for (let i = Math.max(0, tailStart); i < lines.length; i++) interesting.add(i);

  return [...interesting].sort((a, b) => a - b).map((i) => lines[i]);
}
