/**
 * The three SIZE BOUNDS in `scripts/check-lane-status.mjs`, proven red-first.
 *
 * WHY THIS FILE EXISTS. `check-lane-status.mjs` was written for the invariants
 * the Dominion console does not check. The size bounds of `contract/LANE_STATUS.md`
 * rule 7 are squarely in that category and were absent from it for months. The
 * hub measured the gap before we did: `empyrean/scripts/hub_check.py` records
 * "Aurora's finding, 2026-09-10: its own `npm run check:lane-status` reported OK
 * on a file with 22 rows and four titles over 240 characters." On 2026-09-12 a
 * 245 character title passed the same script again and a person downstream
 * caught it.
 *
 * WHY THE PROOF RUNS OVER A FIXTURE AND NOT OVER THE LIVE FILE. The subject the
 * gate checks by default, `docs/lane-status.json`, is gitignored (`.gitignore`
 * line 11). It therefore has NO COMMITTED BASELINE to restore a mutation from,
 * it is the file the owner edits all session, and it does not exist in a
 * worktree at all. Mutating it to prove a red would be vandalising live state
 * that nothing could put back. So the gate takes an optional path argument, and
 * every row below drives it over a copy in a temp directory built from the
 * committed fixture `test/config/fixtures/lane-status/baseline.json`. The
 * baseline is never mutated in place.
 *
 * THE NUMBERS ARE DERIVED, NOT TYPED. Every expectation below is built from the
 * bounds the gate itself prints on a green run, so a row cannot pass by
 * agreeing with a number somebody remembered. One row cross-checks those printed
 * bounds against `docs/OVERSEER.md`, which is this repo's committed statement of
 * the contract, so weakening a constant in the gate goes red here.
 *
 * ONE PROPERTY PER ROW. Each bound has its own at-the-bound row and its own
 * over-the-bound row, and a final row drives a document that is over on all
 * three at once and demands all three be named in one run. Folding them would
 * let the first violation hide the other two.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const REPO = resolve(__dirname, '../..');
const GATE = 'scripts/check-lane-status.mjs';
const GATE_ABS = resolve(REPO, GATE);
const BASELINE = resolve(REPO, 'test/config/fixtures/lane-status/baseline.json');

type LaneStatus = {
  queue: Array<{ id: string; title: string; state: string; size: string; blockedBy: string | null }>;
  pad?: string;
  [k: string]: unknown;
};

function run(path: string): { status: number | null; out: string } {
  const r = spawnSync(process.execPath, [GATE_ABS, path], { cwd: REPO, encoding: 'utf8' });
  return { status: r.status, out: `${r.stdout ?? ''}${r.stderr ?? ''}` };
}

function baselineDoc(): LaneStatus {
  return JSON.parse(readFileSync(BASELINE, 'utf8')) as LaneStatus;
}

let dir: string;

/** Write a document to a scratch copy and return its path. Never touches the fixture. */
function write(name: string, doc: LaneStatus): string {
  const p = join(dir, name);
  writeFileSync(p, `${JSON.stringify(doc, null, 2)}\n`);
  return p;
}

/**
 * Write a document padded to an EXACT byte size. The padding is a top level
 * ASCII string the gate ignores, so one added character is one added byte and
 * the row count and title lengths are untouched: the only thing that differs
 * between the at-bound and over-bound byte files is one byte.
 */
function writeAtBytes(name: string, doc: LaneStatus, targetBytes: number): string {
  const padded: LaneStatus = { ...doc, pad: '' };
  for (let i = 0; i < 8; i += 1) {
    const text = `${JSON.stringify(padded, null, 2)}\n`;
    const size = Buffer.byteLength(text);
    if (size === targetBytes) {
      const p = join(dir, name);
      writeFileSync(p, text);
      return p;
    }
    if (size > targetBytes) {
      throw new Error(`cannot shrink to ${targetBytes} bytes; already ${size}`);
    }
    padded.pad = 'x'.repeat((padded.pad as string).length + (targetBytes - size));
  }
  throw new Error(`could not land on exactly ${targetBytes} bytes`);
}

/** Grow the queue to exactly `rows` rows, keeping ids unique and exactly one `next`. */
function withRows(doc: LaneStatus, rows: number): LaneStatus {
  const out = { ...doc, queue: doc.queue.slice(0, Math.min(rows, doc.queue.length)) };
  let n = 0;
  while (out.queue.length < rows) {
    n += 1;
    out.queue = [...out.queue, {
      id: `FX-PAD-${n}`,
      title: `A filler open row, number ${n}, well inside the title bound.`,
      state: 'open',
      size: 'S',
      blockedBy: null,
    }];
  }
  return out;
}

/** Set one existing row's title to exactly `chars` ASCII characters. */
function withTitleOf(doc: LaneStatus, chars: number): LaneStatus {
  const queue = doc.queue.map((q, i) => (i === 2 ? { ...q, title: 'a'.repeat(chars) } : q));
  return { ...doc, queue };
}

// Derived once from the gate's own green run over the committed baseline.
let green: { status: number | null; out: string };
let BOUNDS: { title: number; rows: number; bytes: number };

beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), 'lane-status-bounds-'));
  green = run(BASELINE);
  const m = /title<=(\d+) chars \(longest \d+\), queue<=(\d+) rows \(\d+\), file<=(\d+) bytes \(\d+\)/
    .exec(green.out);
  if (!m) {
    throw new Error(
      `the gate printed no parseable bounds line, so every expectation below would be invented. `
      + `Output was:\n${green.out}`);
  }
  BOUNDS = { title: Number(m[1]), rows: Number(m[2]), bytes: Number(m[3]) };
});

afterAll(() => {
  if (dir) rmSync(dir, { recursive: true, force: true });
});

describe('check-lane-status size bounds: the baseline and where the numbers come from', () => {
  it('ANTI-VACUOUS: the committed fixture really is a lane status document with a queue', () => {
    // Without this, a fixture that had been emptied or renamed would make every
    // red below attributable to the wrong thing, and the green above vacuous.
    const doc = baselineDoc();
    expect(Array.isArray(doc.queue), 'the fixture has no queue array').toBe(true);
    expect(doc.queue.length).toBeGreaterThan(3);
    expect(doc.queue.filter((q) => q.state === 'next')).toHaveLength(1);
  });

  it('the gate passes the committed baseline, so a red below is the mutation and not the fixture', () => {
    expect(green.status, `gate output was:\n${green.out}`).toBe(0);
    expect(green.out).toContain('check-lane-status: OK');
  });

  it('the gate PRINTS its three bounds on a green run, which is where this file derives them', () => {
    expect(BOUNDS.title).toBeGreaterThan(0);
    expect(BOUNDS.rows).toBeGreaterThan(0);
    expect(BOUNDS.bytes).toBeGreaterThan(0);
  });

  it('those printed bounds match docs/OVERSEER.md, this repo\'s committed statement of the contract', () => {
    // docs/OVERSEER.md, "This file is bounded": `docs/lane-status.json`: title
    // <=240, <=20 rows, <=12 KB. That sentence is the local copy of
    // contract/LANE_STATUS.md rule 7. If someone widens a constant in the gate
    // to make a fat file green, this row is what goes red.
    const overseer = readFileSync(resolve(REPO, 'docs/OVERSEER.md'), 'utf8');
    const m = /title ≤(\d+), ≤(\d+) rows,\s*≤(\d+) KB/.exec(overseer);
    expect(m, 'docs/OVERSEER.md no longer states the three bounds in a readable form').toBeTruthy();
    expect(BOUNDS.title).toBe(Number(m![1]));
    expect(BOUNDS.rows).toBe(Number(m![2]));
    // KB here is KiB. The contract writes "12 KB" in prose; its own executable
    // reader, `empyrean/scripts/hub_check.py`, declares 12 * 1024. Two readers of
    // one contract disagreeing about a bound is worse than either bound.
    expect(BOUNDS.bytes).toBe(Number(m![3]) * 1024);
  });

  it('the gate still DEFAULTS to the live docs/lane-status.json when given no argument', () => {
    // The path argument exists so the bounds can be proven over a fixture. If it
    // ever becomes the only way the gate is run, the live file stops being
    // checked and nothing else would notice.
    const src = readFileSync(GATE_ABS, 'utf8');
    expect(src).toContain("process.argv[2] ?? 'docs/lane-status.json'");
  });
});

describe('bound 1 of 3: a queue row title is at most the title bound, in characters', () => {
  it('a title of exactly the bound passes', () => {
    const p = write('title-at-bound.json', withTitleOf(baselineDoc(), BOUNDS.title));
    const r = run(p);
    expect(r.status, `gate output was:\n${r.out}`).toBe(0);
  });

  it('RED FIRST: one character over the bound fails, and the message names the row and the bound', () => {
    const doc = withTitleOf(baselineDoc(), BOUNDS.title + 1);
    const p = write('title-over-bound.json', doc);
    // The mutation is shown applied, from disk, before anything is claimed about
    // the exit code: an unapplied mutation and a restored baseline both print ok.
    const onDisk = JSON.parse(readFileSync(p, 'utf8')) as LaneStatus;
    expect([...onDisk.queue[2].title].length).toBe(BOUNDS.title + 1);

    const r = run(p);
    expect(r.status, `gate output was:\n${r.out}`).toBe(1);
    expect(r.out).toContain('check-lane-status: FAIL');
    expect(r.out).toContain(onDisk.queue[2].id);
    expect(r.out).toContain(String(BOUNDS.title));
    expect(r.out).toContain(`${BOUNDS.title + 1} chars`);
  });

  it('names EVERY over-long title in one run, not just the first', () => {
    const doc = baselineDoc();
    doc.queue = doc.queue.map((q, i) => (i === 0 || i === 2
      ? { ...q, title: 'a'.repeat(BOUNDS.title + 5) }
      : q));
    const p = write('title-over-bound-twice.json', doc);
    const r = run(p);
    expect(r.status).toBe(1);
    expect(r.out).toContain(doc.queue[0].id);
    expect(r.out).toContain(doc.queue[2].id);
    expect(r.out).toContain(`2 queue row title(s) OVER`);
  });

  it('counts CODE POINTS, so an astral character is one character and not two', () => {
    // JavaScript's String.length would count a non BMP character twice and
    // disagree with the hub's Python len(), which is the reference reader.
    const doc = withTitleOf(baselineDoc(), BOUNDS.title - 1);
    doc.queue[2].title = `${'a'.repeat(BOUNDS.title - 1)}\u{1F600}`;
    const p = write('title-astral-at-bound.json', doc);
    expect(readFileSync(p, 'utf8')).toContain('\u{1F600}');
    const r = run(p);
    expect(r.status, `a 240 code point title containing one emoji must pass. Output:\n${r.out}`)
      .toBe(0);
  });
});

describe('bound 2 of 3: the queue holds at most the row bound', () => {
  it('exactly the row bound passes', () => {
    const p = write('rows-at-bound.json', withRows(baselineDoc(), BOUNDS.rows));
    const r = run(p);
    expect(r.status, `gate output was:\n${r.out}`).toBe(0);
  });

  it('RED FIRST: one row over the bound fails, and the message names the count and the bound', () => {
    const p = write('rows-over-bound.json', withRows(baselineDoc(), BOUNDS.rows + 1));
    const onDisk = JSON.parse(readFileSync(p, 'utf8')) as LaneStatus;
    expect(onDisk.queue).toHaveLength(BOUNDS.rows + 1);

    const r = run(p);
    expect(r.status, `gate output was:\n${r.out}`).toBe(1);
    expect(r.out).toContain(`queue holds ${BOUNDS.rows + 1} rows`);
    expect(r.out).toContain(`${BOUNDS.rows} row bound`);
  });
});

describe('bound 3 of 3: the whole file is at most the byte bound, in BYTES', () => {
  it('exactly the byte bound passes', () => {
    const p = writeAtBytes('bytes-at-bound.json', baselineDoc(), BOUNDS.bytes);
    expect(readFileSync(p).length).toBe(BOUNDS.bytes);
    const r = run(p);
    expect(r.status, `gate output was:\n${r.out}`).toBe(0);
  });

  it('RED FIRST: one byte over the bound fails, and the message names the size and the bound', () => {
    const p = writeAtBytes('bytes-over-bound.json', baselineDoc(), BOUNDS.bytes + 1);
    expect(readFileSync(p).length, 'the over-size mutation did not apply').toBe(BOUNDS.bytes + 1);

    const r = run(p);
    expect(r.status, `gate output was:\n${r.out}`).toBe(1);
    expect(r.out).toContain(`${BOUNDS.bytes + 1} BYTES`);
    expect(r.out).toContain(`${BOUNDS.bytes} byte bound`);
  });

  it('measures BYTES and not characters: a file inside the bound in characters can be over in bytes', () => {
    // The distinction this row exists to pin: one multi byte character is one
    // character and three bytes. A file built to sit just inside the bound by
    // character count is over it by byte count, and bytes are what the contract
    // and its wc -c recipe mean.
    const doc = baselineDoc();
    const base = `${JSON.stringify({ ...doc, pad: '' }, null, 2)}\n`;
    const room = BOUNDS.bytes - Buffer.byteLength(base);
    // Fill the remaining room with three byte characters: room characters would
    // fit, room bytes is exactly the bound, so room/2 characters is under the
    // bound in characters and over it in bytes.
    const chars = Math.floor(room / 2);
    const p = write('bytes-over-in-bytes-only.json', { ...doc, pad: '中'.repeat(chars) });
    const text = readFileSync(p, 'utf8');
    const bytes = readFileSync(p).length;
    expect([...text].length, 'this file must be INSIDE the bound counted in characters')
      .toBeLessThanOrEqual(BOUNDS.bytes);
    expect(bytes, 'and OVER it counted in bytes').toBeGreaterThan(BOUNDS.bytes);

    const r = run(p);
    expect(r.status, `a character counting gate would pass this file. Output:\n${r.out}`).toBe(1);
    expect(r.out).toContain(`${bytes} BYTES`);
  });
});

describe('the three bounds report INDEPENDENTLY: no violation hides another', () => {
  it('a document over on all three names all three in one run', () => {
    const doc = writeAllThreeOver();
    const r = run(doc.path);
    expect(r.status, `gate output was:\n${r.out}`).toBe(1);

    // One line per bound, each naming its own measurement. This is the row that
    // would go red if the three were ever folded into one assertion.
    expect(r.out, 'the title bound did not report').toContain('title(s) OVER');
    expect(r.out, 'the row bound did not report').toContain(`queue holds ${doc.rows} rows`);
    expect(r.out, 'the byte bound did not report').toContain('BYTES, OVER');

    const bullets = r.out.split('\n').filter((l) => l.startsWith('  - '));
    expect(bullets.length, `expected at least three problem lines, got:\n${r.out}`)
      .toBeGreaterThanOrEqual(3);
  });

  function writeAllThreeOver(): { path: string; rows: number } {
    const rows = BOUNDS.rows + 1;
    const doc = withTitleOf(withRows(baselineDoc(), rows), BOUNDS.title + 1);
    const p = writeAtBytes('all-three-over.json', doc, BOUNDS.bytes + 1);
    const onDisk = JSON.parse(readFileSync(p, 'utf8')) as LaneStatus;
    expect(onDisk.queue).toHaveLength(rows);
    expect([...onDisk.queue[2].title].length).toBe(BOUNDS.title + 1);
    expect(readFileSync(p).length).toBe(BOUNDS.bytes + 1);
    return { path: p, rows };
  }
});

describe('LOUD ON UNMEASURABLE: nothing here may report a green or a zero', () => {
  it('a file that is not there exits 2 and says nothing was measured', () => {
    const r = run(join(dir, 'does-not-exist.json'));
    expect(r.status, `gate output was:\n${r.out}`).toBe(2);
    expect(r.out).toContain('COULD NOT READ');
    expect(r.out).toContain('Nothing was measured');
  });

  it('a file that is not JSON exits 2 rather than measuring a zero row queue', () => {
    const p = join(dir, 'not-json.json');
    writeFileSync(p, '{ this is not json');
    const r = run(p);
    expect(r.status, `gate output was:\n${r.out}`).toBe(2);
    expect(r.out).toContain('is not readable JSON');
    expect(r.out).not.toContain('check-lane-status: OK');
  });

  it('a queue that is not an array is reported UNMEASURABLE, not as zero rows', () => {
    const doc = baselineDoc();
    const p = write('queue-not-an-array.json', { ...doc, queue: { FX: 'oops' } } as unknown as LaneStatus);
    const r = run(p);
    expect(r.status, `gate output was:\n${r.out}`).toBe(1);
    expect(r.out).toContain('UNMEASURABLE');
    expect(r.out).not.toContain('check-lane-status: OK');
  });

  it('a MISSING queue is reported as missing rather than as an empty one', () => {
    const doc = baselineDoc();
    delete (doc as Record<string, unknown>).queue;
    const p = write('queue-missing.json', doc);
    const r = run(p);
    expect(r.status).toBe(1);
    expect(r.out).toContain('MISSING');
  });
});

describe('the gate is registered as a runnable script', () => {
  const pkg = JSON.parse(readFileSync(resolve(REPO, 'package.json'), 'utf8')) as {
    scripts?: Record<string, string>;
  };

  it('ANTI-VACUOUS: package.json declares scripts at all', () => {
    expect(pkg.scripts, 'package.json declares no scripts').toBeTruthy();
  });

  it('npm run check:lane-status runs this gate, which is the run OVERSEER.md asks for after every write', () => {
    expect(pkg.scripts!['check:lane-status']).toContain(GATE);
  });
});
