/**
 * The constant fold behind `scripts/check-prose-constants.mjs`, and what it says
 * when it cannot fold.
 *
 * WHY THIS FILE EXISTS AT ALL. The gate's scan half fails loudly: break it and
 * it stops printing findings. Its FOLD half fails silently, because a name that
 * stops resolving only shrinks the constant table, and a smaller table matches
 * fewer prose numbers and still prints a clean summary. That is not a
 * hypothetical failure mode here: it is the defect this file was written for.
 * On 2026-09-09, with a hand-typed `12` sitting on disk over an interpolation of
 * `FG_PAGE_FRAMES` in `editor-methods.ts`, the gate exited rc 0 and printed
 * "0 re-typed in author-facing prose". `description:` IS in its key population,
 * so the site looked covered. The table simply never contained the constant,
 * because `FG_PAGE_FRAMES` is DECLARED AS A CALL and the fold understood a
 * numeric literal and `constant('X')` and nothing else. See
 * docs/reviews/2026-09-09-prose-gate-derived-constants.md.
 *
 * EVERY EXPECTATION BELOW IS DERIVED, NOT PINNED. The synthetic rows compute
 * their own arithmetic; the whole-repo rows import the real constants from
 * `src/core/export/vram-coloring` and ask whether the real gate resolved the
 * same value. A row that typed `12` would go stale on the day aeon resizes its
 * art pool, which is the precise failure the constant exists to prevent.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { foldTrees, parseSources } from '../../scripts/prose-constant-fold.mjs';
import { FG_PAGE_FRAMES, FG_PAGE_TILES, FG_TILE_LIMIT } from '../../src/core/export/vram-coloring';

const REPO = resolve(__dirname, '../..');
const GATE = 'scripts/check-prose-constants.mjs';
const FOLD = 'scripts/prose-constant-fold.mjs';

/** The vendored-contract indirection, standing in for the real JSON. */
const CONTRACT = new Map<string, number>([['TILE_BYTES', 32], ['BGANIM_PHASE_BANKS', 8]]);

const fold = (sources: Record<string, string>) => foldTrees(parseSources(sources), CONTRACT);

describe('the fold reaches DERIVED constants, which is the half it used to miss', () => {
  it('ANTI-VACUOUS: it still folds what it always folded', () => {
    // If this row were to fail, every row below would be measuring a fold that
    // resolves nothing, and "absent from the table" would stop being evidence.
    const { exported } = fold({
      'a.ts': "import { constant } from './c';\n"
        + 'export const PLAIN = 768;\nexport const VIA_CONTRACT = constant(\'TILE_BYTES\');\n',
    });
    expect(exported.get('PLAIN')).toBe(768);
    expect(exported.get('VIA_CONTRACT')).toBe(CONTRACT.get('TILE_BYTES'));
  });

  it('folds arithmetic over names it already knows', () => {
    const { exported } = fold({ 'a.ts': 'export const W = 40;\nexport const H = 28;\n'
      + 'export const CELLS = W * H;\nexport const PX = CELLS * 8 + 2;\n' });
    expect(exported.get('CELLS')).toBe(40 * 28);
    expect(exported.get('PX')).toBe(40 * 28 * 8 + 2);
  });

  it('folds a MASK built by shifting, which no literal arm could reach', () => {
    const { exported } = fold({ 'a.ts': 'export const SHIFT = 12;\nexport const VALUE = 3;\n'
      + 'export const BITS = VALUE << SHIFT;\nexport const INVERSE = (~BITS) & 0xFFFF;\n' });
    expect(exported.get('BITS')).toBe(3 << 12);
    expect(exported.get('INVERSE')).toBe((~(3 << 12)) & 0xFFFF);
  });

  it('folds `deriveFgPageFrames`-shaped helper calls, the site that was blind', () => {
    // The shape is the real one: guard statements that throw, then a single
    // trailing return of arithmetic over the parameters alone.
    const { exported } = fold({
      'v.ts': 'export function derive(tiles: number, per: number): number {\n'
        + '  if (tiles % per !== 0) { throw new Error("no"); }\n'
        + '  return tiles / per;\n}\n'
        + 'export const TILES = 768;\nexport const PER = 64;\n'
        + 'export const FRAMES = derive(TILES, PER);\n',
    });
    expect(exported.get('FRAMES')).toBe(768 / 64);
  });

  it('REFUSES a helper whose body reaches beyond its own parameters', () => {
    // The parameter-closure rule is the whole reason this arm is not an
    // interpreter. A body that reads module scope would need the DEFINING
    // module's names, not the calling one's, and getting that wrong invents a
    // value rather than declining to have one.
    const { exported, nearMiss, declaredBlind } = fold({
      'v.ts': 'const RESERVE = 4;\n'
        + 'export function derive(tiles: number): number { return tiles - RESERVE; }\n'
        + 'export const FRAMES = derive(768);\n',
    });
    expect(exported.has('FRAMES')).toBe(false);
    // ...and declining is not the same as saying nothing: it is announced. It
    // lands in the COUNTED tier rather than the adjudicated one, and that is
    // right — the fold never recognised `derive`, so it never attempted the
    // call, and demanding a written verdict for a shape it never claimed is how
    // a ledger fills with rows nobody can act on. `derive` is declared
    // `: number`, so the census still sees it.
    expect(nearMiss.map(r => r.name)).not.toContain('FRAMES');
    expect(declaredBlind.map(r => r.name)).toContain('FRAMES');
  });

  it('resolves in dependency order, not file order', () => {
    // Two files, the consumer enumerated FIRST. A single pass would leave
    // DOUBLE unresolved and shrink the table by exactly the derived entry.
    const consumerFirst = fold({
      'b.ts': "import { BASE } from './a';\nexport const DOUBLE = BASE * 2;\n",
      'a.ts': 'export const BASE = 96;\n',
    });
    expect(consumerFirst.exported.get('DOUBLE')).toBe(96 * 2);
  });

  it('does not mistake string concatenation for arithmetic', () => {
    const { exported, nearMiss, declaredBlind } = fold({
      'a.ts': "export const PROSE = 'the limit is ' + 'high';\n",
    });
    expect(exported.has('PROSE')).toBe(false);
    // And it is not announced as a blind spot either: the fold never claimed it.
    expect([...nearMiss, ...declaredBlind].map(r => r.name)).not.toContain('PROSE');
  });
});

describe('"could not fold" and "folded, and it is not an integer" are different answers', () => {
  it('keeps a non-integer in the table rather than reporting a hole', () => {
    // Dropping non-integers from the fold turned every constant DERIVED from one
    // into a fold failure, which the blind ledger then reported as missing
    // coverage. The integer filter belongs at the prose MATCH, where the gate's
    // stated bound actually is.
    const { exported, nearMiss } = fold({
      'a.ts': 'export const LEN = 6.5;\nexport const MARGIN = LEN / 16;\n',
    });
    expect(exported.get('LEN')).toBe(6.5);
    expect(exported.get('MARGIN')).toBe(6.5 / 16);
    expect(nearMiss.map(r => r.name)).not.toContain('MARGIN');
  });
});

describe('the blindness announces itself, in the tier that fits it', () => {
  it('NEAR MISS: an attempted-and-abandoned arithmetic constant is named', () => {
    const { nearMiss } = fold({
      'a.ts': 'export const MASK = packCell({ shape: 0xFFFF }) & 0xFF;\n',
    });
    expect(nearMiss.map(r => r.name)).toContain('MASK');
    expect(nearMiss.find(r => r.name === 'MASK')?.src).toContain('packCell');
  });

  it('DECLARED NUMERIC: a `: number` the fold cannot evaluate is named too', () => {
    const { exported, nearMiss, declaredBlind } = fold({
      'a.ts': 'export const FROM_SCHEMA: number = schemaNode(["a"]).maximum as number;\n',
    });
    expect(exported.has('FROM_SCHEMA')).toBe(false);
    // Not a near miss: the fold never attempted a property read, so asking an
    // author to fold it or justify it would be asking for the impossible.
    expect(nearMiss.map(r => r.name)).not.toContain('FROM_SCHEMA');
    expect(declaredBlind.map(r => r.name)).toContain('FROM_SCHEMA');
  });

  it('DECLARED NUMERIC: so is a call to a function declared `: number`', () => {
    const { declaredBlind } = fold({
      'a.ts': 'export function widthOf(node: Node): number { return read(node).width; }\n'
        + 'export const WIDTH = widthOf(SOME_NODE);\n',
    });
    expect(declaredBlind.map(r => r.name)).toContain('WIDTH');
  });

  it('a constant that FOLDS is in neither tier', () => {
    // The ledger overstating what the gate cannot do is its own defect: it
    // would train a reader to discount the count that is the whole point.
    const { nearMiss, declaredBlind } = fold({
      'a.ts': 'export const BASE = 64;\nexport const TWICE: number = BASE * 2;\n',
    });
    expect([...nearMiss, ...declaredBlind].map(r => r.name)).not.toContain('TWICE');
  });
});

describe('the real gate, over the real repo', () => {
  /*
   * THE GATE RUNS ONCE PER INVOCATION, IN A HOOK, AND BOTH LIMITS ARE DERIVED.
   * docs/reviews/2026-09-11-suite-timeout-rows.md has the measurements.
   *
   * WHAT THE TIME IS. Every row here used to spawn the real gate itself, four
   * spawns for three rows (the coverage row spawns twice), each on vitest's 5s
   * default. The gate is a synchronous parse of every tracked source file: no
   * timer, no poll, no watcher, no await anywhere in it or in the fold it
   * imports. Measured, its child uses MORE CPU than wall time on a quiet box
   * (user+sys ~1.2s against ~0.6s wall, V8's helper threads), so nothing in it
   * waits, and under load wall grows while CPU stays flat. That is starvation of
   * real work, not a window: these rows timed out at 5246ms and 6498ms (the
   * ledger row, load 14.80) and 5902ms (a landing on 2026-09-11) and pass in
   * ~0.6s alone, with one tight mode at every load measured.
   *
   * WHY A HOOK. The plain run is shared by the exit row and the coverage row, so
   * three spawns do the work four did. The row bodies are UNCHANGED: `run()`
   * returns exactly what `execFileSync` returned, or re-throws exactly what it
   * threw, so "exits 0" still means a spawn that did not throw.
   *
   * THE NUMBERS. One spawn's idle median is 553ms (nine spawns inside vitest,
   * load 7.9 to 8.3). The worst stretch MEASURED here is 5.8x (3143ms, load 44
   * to 50 under 16 busy loops). The worst REPORTED is at least 7.8x: the
   * facet-modules import row, 645ms idle, timed out at 5000ms in the
   * 2026-09-11 landings at load 33 to 36, a lower bound because the timeout cut
   * it off. Headroom x20 is about 2.5 times that: 553ms x 20 = 11.1s, rounded
   * up to 15s per spawn. The spawn
   * carries its OWN kill bound so a hung gate fails as ETIMEDOUT naming the
   * spawn, which the failure-class reporter files as would-block. Without it a
   * hang blocks this worker for good, because vitest cannot interrupt a
   * synchronous call. The hook's bound is the sum of its three spawns' bounds,
   * so the per-spawn kill always fires first.
   *
   * IF A SPAWN EVER HITS 15s, DO NOT RAISE IT. The gate has grown or something
   * in it has become slow, and the answer is to measure what changed.
   */
  const SPAWN_MS = 15_000;
  type Captured = { out: string } | { err: unknown };
  const captured = new Map<string, Captured>();
  /** What the old per-row call returned, or the error it threw, re-thrown. */
  const run = (...args: string[]): string => {
    const got = captured.get(args.join(' '));
    if (!got) throw new Error(`no captured gate run for [${args.join(' ')}]: the hook never ran it`);
    if ('err' in got) throw got.err;
    return got.out;
  };
  beforeAll(() => {
    for (const args of [[], ['--table'], ['--blind']]) {
      try {
        captured.set(args.join(' '), { out: execFileSync('node', [resolve(REPO, GATE), ...args],
          { cwd: REPO, encoding: 'utf8', timeout: SPAWN_MS }) });
      } catch (err) {
        captured.set(args.join(' '), { err });
      }
    }
  }, 3 * SPAWN_MS);

  it('exits 0 today, so the rows below read a passing run', () => {
    expect(() => run()).not.toThrow();
  });

  it('has the DERIVED FG_PAGE_FRAMES in its table, at the value the source derives', () => {
    // The expectation comes from the module under the gate, never from a typed
    // number: `FG_PAGE_FRAMES` moves the day aeon resizes its FG art pool, and a
    // pinned twin here would be the very defect the gate polices.
    const table = new Map(run('--table').split('\n').filter(Boolean)
      .filter(l => l.includes('='))
      .map(l => [l.slice(0, l.indexOf('=')), Number(l.slice(l.indexOf('=') + 1))] as const));
    expect(table.get('FG_TILE_LIMIT')).toBe(FG_TILE_LIMIT);
    expect(table.get('FG_PAGE_TILES')).toBe(FG_PAGE_TILES);
    expect(table.get('FG_PAGE_FRAMES'), 'the derived constant is absent from the gate\'s table, '
      + 'so a typed twin of it in author-facing prose would match nothing').toBe(FG_PAGE_FRAMES);
  });

  it('says on its PASSING line that it is not full coverage, with both counts', () => {
    // A summary reporting only what it found reads as full coverage. This gate
    // has never had full coverage, and the run that printed "0 re-typed" over a
    // planted defect is what that reads like from the outside.
    const line = run().trim();
    expect(line).toContain('NOT FULL COVERAGE');
    const near = /(\d+) adjudicated near miss/.exec(line);
    const declared = /(\d+) declared-numeric constant/.exec(line);
    expect(near, `no near-miss count on the summary line: ${line}`).toBeTruthy();
    expect(declared, `no declared-numeric count on the summary line: ${line}`).toBeTruthy();

    // ...and the counts are the ones `--blind` can actually enumerate, so the
    // summary cannot report a number nothing backs.
    const blind = run('--blind').trim().split('\n');
    const tallyLine = blind.find(l => l.includes('near miss(es)'));
    const tally = /(\d+) near miss\(es\), (\d+) declared-numeric/.exec(tallyLine ?? '');
    expect(tally, `--blind printed no tally: ${blind.join(' | ')}`).toBeTruthy();
    expect(tally![1]).toBe(near![1]);
    expect(tally![2]).toBe(declared![1]);
    // One printed row per counted constant, so the tally is not a number typed
    // beside a list that says something else.
    const rows = blind.filter(l => /^\S+\.tsx?:\d+ \w+ = /.test(l));
    expect(rows.length).toBe(Number(tally![1]) + Number(tally![2]));
  });
});

describe('both halves are wired into `npm test`', () => {
  const pkg = JSON.parse(readFileSync(resolve(REPO, 'package.json'), 'utf8')) as {
    scripts?: Record<string, string>;
  };

  it('ANTI-VACUOUS: package.json really declares a `test` script to look inside', () => {
    expect(pkg.scripts, 'package.json declares no scripts at all').toBeTruthy();
    expect(typeof pkg.scripts!.test, 'package.json declares no `test` script').toBe('string');
  });

  it('`npm test` runs the gate, before vitest', () => {
    const script = pkg.scripts!.test;
    expect(script).toContain(GATE);
    expect(script.indexOf(GATE)).toBeLessThan(script.indexOf('vitest'));
  });

  it('the fold the gate imports is on disk', () => {
    // The gate is a static pass: a missing sibling module makes it crash rather
    // than mis-measure, but it crashes in the middle of `npm test` output where
    // a reader is least likely to read it as "the gate did not run".
    expect(existsSync(resolve(REPO, FOLD)), `${FOLD} is imported by ${GATE} but is not on disk`)
      .toBe(true);
    expect(readFileSync(resolve(REPO, GATE), 'utf8')).toContain('prose-constant-fold.mjs');
  });
});
