// THE SHARED-PALETTE WARNING: what it names, and what it says when it could
// not look.
//
// The owner's card listed two things embedding the shared player palette; at
// aeon ad51e3f0 there were three (Knuckles' character data was the one
// missed). So the warning's list is DERIVED from the open project's sources at
// warning time (core/project/aeon/shared-palette-warning.ts). These rows pin:
//
//   • the matcher: exact path, outside comments, with its line and name;
//   • the scan's blindness: every way it can fail to look is `unmeasurable` or
//     carries what it could not read, and never renders as "nothing else";
//   • the sentence: it names every site it found and its population, says
//     EVERY zone, and never claims line 0 is pushed to a running game;
//   • against aeon's REAL tree when there is one: the scan agrees with an
//     independent search of the same files. Skipped with a reason otherwise.

import { describe, it, expect } from 'vitest';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import {
  EMBED_SOURCE_EXTENSION, SPRING_LINE0_GATE_EXTENSION, SPRING_LINE0_GATE_PATH,
  findEmbedSites, scanEmbeds, scanSpringGate, sharedLine0Warning,
  type EmbedScan, type SourceRead, type SpringGateScan,
} from '../shared-palette-warning';
import { PLAYER_PALETTE_CANDIDATES } from '../player-palette';
import { PAL_BASE_FIRST_LINE, PAL_BASE_LAST_LINE } from '../../../aether/palette-push';
import { listProjectSources } from '../../../../main/file-io';
import type { SourceListing } from '../../../../shared/ipc-types';
import { siblingPathOrUnresolved } from '../../../../../test/support/sibling-root.mjs';

const TARGET = PLAYER_PALETTE_CANDIDATES[0];

/** The embed rows below are about the embed list; a project with no spring
 *  check keeps the gate's paragraph out of them. */
const NO_GATE: SpringGateScan = { kind: 'absent' };
const warn = (scan: EmbedScan, gate: SpringGateScan = NO_GATE) => sharedLine0Warning(TARGET, scan, gate);

const listing = (files: string[], extra?: Partial<SourceListing>): SourceListing => ({
  files, unreadable: [], capped: false, ...extra,
});
const reader = (texts: Record<string, string | null>) =>
  async (paths: string[]): Promise<SourceRead[]> => paths.map((path) => ({
    path, text: texts[path] ?? null, reason: texts[path] === null ? 'EACCES: permission denied' : null,
  }));

describe('findEmbedSites: the exact path, outside comments, with its line and name', () => {
  it('finds each embed of the target with its 1-based line and the name declared there', () => {
    const text = [
      'module games.x',
      '',
      'pub data OJZ_Palette   = embed("games/x/ojz_palette.bin")',
      `pub data BGND_Palette  = embed("${TARGET}")`,
      `const _spring_pal      = embed( "${TARGET}" )`,
    ].join('\n');
    expect(findEmbedSites('a.emp', text, TARGET)).toEqual([
      { path: 'a.emp', line: 4, name: 'BGND_Palette' },
      { path: 'a.emp', line: 5, name: '_spring_pal' },
    ]);
  });

  it('does not count a comment, another path, or a path that merely ends with the target', () => {
    const text = [
      `// const old = embed("${TARGET}")`,
      `/* data A = embed("${TARGET}")`,
      `   data B = embed("${TARGET}") */`,
      `const c = embed("x${TARGET}")`,
      `const d = embed("${PLAYER_PALETTE_CANDIDATES[1]}")`,
      `const e = embed("${TARGET}") // a trailing comment is fine`,
    ].join('\n');
    expect(findEmbedSites('b.emp', text, TARGET)).toEqual([{ path: 'b.emp', line: 6, name: 'e' }]);
  });

  it('keeps a `//` inside a string from being read as a comment', () => {
    const text = `const url = "http://x"; const f = embed("${TARGET}")`;
    expect(findEmbedSites('c.emp', text, TARGET)).toHaveLength(1);
  });
});

describe('scanEmbeds: every way it can fail to look is said, never rendered as "nothing"', () => {
  it('a listing that throws is unmeasurable, with the reason', async () => {
    const scan = await scanEmbeds(TARGET, async () => { throw new Error('no channel'); }, reader({}));
    expect(scan).toEqual({ kind: 'unmeasurable', reason: expect.stringContaining('no channel') });
  });

  it('a listing that found no sources is unmeasurable, not "searched 0 and found none"', async () => {
    const scan = await scanEmbeds(TARGET, async () => listing([]), reader({}));
    expect(scan.kind).toBe('unmeasurable');
  });

  it('a read that throws is unmeasurable', async () => {
    const scan = await scanEmbeds(TARGET, async () => listing(['a.emp']), async () => { throw new Error('ipc down'); });
    expect(scan).toEqual({ kind: 'unmeasurable', reason: expect.stringContaining('ipc down') });
  });

  it('every file unreadable is unmeasurable', async () => {
    const scan = await scanEmbeds(TARGET, async () => listing(['a.emp']), reader({ 'a.emp': null }));
    expect(scan.kind).toBe('unmeasurable');
  });

  it('a partial read is measured, counts only what it read, and names what it could not', async () => {
    const scan = await scanEmbeds(
      TARGET,
      async () => listing(['a.emp', 'b.emp'], { unreadable: [{ path: 'locked', reason: 'EACCES' }] }),
      reader({ 'a.emp': `data X = embed("${TARGET}")`, 'b.emp': null }),
    );
    expect(scan.kind).toBe('measured');
    if (scan.kind !== 'measured') return;
    expect(scan.searched).toBe(1);
    expect(scan.sites).toEqual([{ path: 'a.emp', line: 1, name: 'X' }]);
    expect(scan.blind).toHaveLength(2);
    expect(scan.blind.join(' ')).toContain('locked');
    expect(scan.blind.join(' ')).toContain('b.emp');
  });

  it('carries the listing\'s cap through', async () => {
    const scan = await scanEmbeds(TARGET, async () => listing(['a.emp'], { capped: true }), reader({ 'a.emp': '' }));
    expect(scan.kind === 'measured' && scan.capped).toBe(true);
  });
});

describe('sharedLine0Warning: the sentence a person reads before the first line 0 edit', () => {
  const measured = (sites: { path: string; line: number; name: string | null }[], extra?: object): EmbedScan => ({
    kind: 'measured', searched: 42, sites, blind: [], capped: false, ...extra,
  });

  it('says the change reaches EVERY zone, names the file, and says there is no per-level copy', () => {
    const w = warn(measured([]));
    expect(w.title).toContain('every zone');
    expect(w.body).toContain(TARGET);
    expect(w.body).toContain('EVERY zone');
    expect(w.body).toMatch(/no per-level copy/);
  });

  it('names EVERY site the scan found, with line and name, and the population it searched', () => {
    const sites = [
      { path: 'games/a/act_assets.emp', line: 13, name: 'BGND_Palette' },
      { path: 'games/a/test_solid.emp', line: 934, name: '_spring_pal_sonic' },
      { path: 'games/a/knuckles_data.emp', line: 73, name: null },
    ];
    const w = warn(measured(sites));
    for (const s of sites) {
      expect(w.body, `the warning dropped ${s.path}`).toContain(`${s.path}:${s.line}`);
      if (s.name) expect(w.body).toContain(s.name);
    }
    expect(w.body).toContain(`42 ${EMBED_SOURCE_EXTENSION} source files`);
    expect(w.body).toContain(`embed("${TARGET}")`);
  });

  it('UNMEASURABLE: says it could NOT check and lists nothing, so silence cannot read as "nothing else"', () => {
    const w = warn({ kind: 'unmeasurable', reason: 'listing failed: EIO' });
    expect(w.body).toContain('could NOT check');
    expect(w.body).toContain('listing failed: EIO');
    expect(w.body).not.toMatch(/Nothing else/);
    expect(w.body).not.toMatch(/^• /m);
  });

  it('MEASURED ZERO: states the population searched, never an empty list', () => {
    const w = warn(measured([]));
    expect(w.body).toContain(`searched 42 ${EMBED_SOURCE_EXTENSION} source files`);
    expect(w.body).toContain('found none');
    expect(w.body).not.toMatch(/^• /m);
  });

  it('PARTIAL: a blind or capped scan says the list may not be everything', () => {
    const blind = warn(measured([], { blind: ['locked (EACCES)'] }));
    expect(blind.body).toContain('may not be everything');
    expect(blind.body).toContain('locked (EACCES)');
    const capped = warn(measured([], { capped: true }));
    expect(capped.body).toContain('file limit');
    expect(warn(measured([])).body, 'a complete scan hedged anyway')
      .not.toContain('may not be everything');
  });

  it('never claims line 0 reaches a running game: it names the live range, from the push module', () => {
    const w = warn(measured([]));
    expect(w.body).toContain(`lines ${PAL_BASE_FIRST_LINE} to ${PAL_BASE_LAST_LINE} live`);
    expect(PAL_BASE_FIRST_LINE, 'line 0 is inside the live range, so the sentence would be false')
      .toBeGreaterThan(0);
  });
});

// ═══ THE SPRING CHECK (hub ruling 2026-09-14T00:24:36Z) ═══════════════════
// Synthetic, in memory. The gate's text is planted here, and every expected
// value is read back off that planted text, never typed a second time.
const FOLDER = TARGET.slice(0, TARGET.lastIndexOf('/'));
const PARTNER = `${FOLDER}/partner.bin`;
const GATE_TEXT = [
  '"""The spring\'s colours, and each character\'s palette: prose, not a path."""',
  `# PAL_OLD = "${FOLDER}/retired.bin"   (a comment: never a partner)`,
  `PAL_SONIC = "${TARGET}"`,
  `PAL_OTHER = '${PARTNER}'`,
  'SPRING_ART = "games/x/generated/art_spring.bin"   # another folder: never a partner',
].join('\n');

describe('scanSpringGate: found by the listing, read, and tied to the file being edited', () => {
  const pyListing = (extra?: Partial<SourceListing>) =>
    async () => listing(['tools/other_tool.py', SPRING_LINE0_GATE_PATH], extra);

  it('PRESENT: the project lists the check and it reads this file; the partner is its other literal in the same folder', async () => {
    const gate = await scanSpringGate(TARGET, pyListing(), reader({ [SPRING_LINE0_GATE_PATH]: GATE_TEXT }));
    expect(gate).toEqual({ kind: 'present', path: SPRING_LINE0_GATE_PATH, partners: [PARTNER] });
  });

  it('ABSENT: a complete listing without the file is a finding, and nothing is read', async () => {
    let reads = 0;
    const gate = await scanSpringGate(
      TARGET,
      // An unreadable folder that is NOT above the gate cannot hide it.
      async () => listing(['tools/other_tool.py'], { unreadable: [{ path: 'games/locked', reason: 'EACCES' }] }),
      async (paths) => { reads++; return reader({})(paths); },
    );
    expect(gate).toEqual({ kind: 'absent' });
    expect(reads, 'an absent check was read anyway').toBe(0);
  });

  it('UNMEASURABLE: a listing that throws says why', async () => {
    const gate = await scanSpringGate(TARGET, async () => { throw new Error('no channel'); }, reader({}));
    expect(gate).toEqual({ kind: 'unmeasurable', reason: expect.stringContaining('no channel') });
    expect(gate.kind === 'unmeasurable' && gate.reason).toContain(SPRING_LINE0_GATE_EXTENSION);
  });

  it('UNMEASURABLE: an unreadable folder ABOVE the check, or a capped listing, cannot say it is absent', async () => {
    const folders = SPRING_LINE0_GATE_PATH.split('/').slice(0, -1);
    const above = ['.', ...folders.map((_, i) => folders.slice(0, i + 1).join('/'))];
    expect(above.length, 'the gate path has no folder above it: this row tests only the root').toBeGreaterThan(1);
    for (const path of above) {
      const gate = await scanSpringGate(TARGET, async () => listing([], { unreadable: [{ path, reason: 'EACCES' }] }), reader({}));
      expect(gate, `unreadable ${path}`).toEqual({ kind: 'unmeasurable', reason: expect.stringContaining(path) });
    }
    const capped = await scanSpringGate(TARGET, async () => listing(['tools/other_tool.py'], { capped: true }), reader({}));
    expect(capped.kind).toBe('unmeasurable');
  });

  it('UNMEASURABLE: the check is listed but cannot be read', async () => {
    const gate = await scanSpringGate(TARGET, pyListing(), reader({ [SPRING_LINE0_GATE_PATH]: null }));
    expect(gate).toEqual({ kind: 'unmeasurable', reason: expect.stringContaining('EACCES') });
  });

  it('READS ANOTHER FILE: under the fallback, a check that reads only the primary is not this edit\'s', async () => {
    const fallback = PLAYER_PALETTE_CANDIDATES[1];
    expect(fallback, 'there is no fallback candidate to test').toBeTruthy();
    const gate = await scanSpringGate(fallback, pyListing(), reader({ [SPRING_LINE0_GATE_PATH]: GATE_TEXT }));
    expect(gate).toEqual({ kind: 'reads-other-file', path: SPRING_LINE0_GATE_PATH });
  });
});

describe('sharedLine0Warning: the spring check, named only when the project has it', () => {
  const measured: EmbedScan = { kind: 'measured', searched: 42, sites: [], blind: [], capped: false };
  // Phrases only the gate's paragraphs say. The embed list's own unmeasurable
  // sentence also says "could NOT check", so that phrase alone proves nothing.
  const NAMED = 'whichever character you play';
  const UNCHECKED = 'could NOT check whether one of this project\'s own checks';

  it('NAMED: the file, what it checks, the partner palette, and that the check fails until it matches', () => {
    const w = warn(measured, { kind: 'present', path: SPRING_LINE0_GATE_PATH, partners: [PARTNER] });
    expect(w.body).toContain(`check ${SPRING_LINE0_GATE_PATH} also reads this file`);
    expect(w.body).toContain(NAMED);
    expect(w.body).toContain(`same colours in ${PARTNER}`);
    expect(w.body).toContain(`that check will fail until ${PARTNER} is changed to match`);
    expect(w.body).not.toContain(UNCHECKED);
  });

  it('NAMED with no partner it could read: it says "another character\'s palette file", never an empty name', () => {
    const w = warn(measured, { kind: 'present', path: SPRING_LINE0_GATE_PATH, partners: [] });
    expect(w.body).toContain(SPRING_LINE0_GATE_PATH);
    expect(w.body).toContain('fail until another character\'s palette file is changed to match');
  });

  it('NOT NAMED when the project has no such check, or it reads another file: not a word of it', () => {
    for (const gate of [{ kind: 'absent' }, { kind: 'reads-other-file', path: SPRING_LINE0_GATE_PATH }] as SpringGateScan[]) {
      const w = warn(measured, gate);
      expect(w.body, gate.kind).not.toContain(SPRING_LINE0_GATE_PATH);
      expect(w.body, gate.kind).not.toContain(NAMED);
      expect(w.body, gate.kind).not.toContain(UNCHECKED);
      expect(w.body, `${gate.kind}: ANTI-VACUOUS, this is the real warning`).toContain('found none');
    }
  });

  it('COULD NOT CHECK: says so in its own sentence, with the reason, and names no file it did not find', () => {
    const w = warn(measured, { kind: 'unmeasurable', reason: 'the folder tools could not be read (EACCES)' });
    expect(w.body).toContain(UNCHECKED);
    expect(w.body).toContain('the folder tools could not be read (EACCES)');
    expect(w.body).not.toContain(SPRING_LINE0_GATE_PATH);
    expect(w.body.split('could NOT check').length - 1, 'the embed list was measured: exactly one "could NOT check"').toBe(1);
  });
});

describe('against aeon\'s real tree: the scan agrees with an independent search', () => {
  const AEON = siblingPathOrUnresolved('aeon');
  const haveTree = existsSync(join(AEON, 'project.json'));

  /** An independent walk and a line-by-line substring search, sharing no code
   *  with the module under test beyond the target string. */
  function independent(root: string, target: string): string[] {
    const hits: string[] = [];
    const walk = (dir: string, rel: string): void => {
      for (const name of readdirSync(dir)) {
        if (name.startsWith('.') || name === 'node_modules') continue;
        const full = join(dir, name);
        const r = rel ? `${rel}/${name}` : name;
        const st = statSync(full);
        if (st.isDirectory()) walk(full, r);
        else if (name.endsWith(EMBED_SOURCE_EXTENSION)) {
          readFileSync(full, 'utf8').split('\n').forEach((line, i) => {
            if (!line.trimStart().startsWith('//') && line.includes(`embed("${target}")`)) hits.push(`${r}:${i + 1}`);
          });
        }
      }
    };
    walk(root, '');
    return hits.sort();
  }

  it('finds every embed of the file the loader resolves there, and at least one', async (ctx) => {
    if (!haveTree) {
      ctx.skip(`SKIPPED, NOT PASSED: no aeon checkout at ${AEON}: this row reads their real .emp `
        + 'sources and could not. The synthetic rows above still ran; what is unmeasured here is '
        + 'whether the scan finds what aeon actually embeds today.');
      return;
    }
    const target = PLAYER_PALETTE_CANDIDATES.find((p) => existsSync(join(AEON, p)));
    expect(target, 'no player palette candidate exists in aeon: the loader would resolve nothing').toBeTruthy();
    const scan = await scanEmbeds(
      target!,
      () => listProjectSources(AEON, EMBED_SOURCE_EXTENSION),
      async (paths) => paths.map((path) => ({ path, text: readFileSync(join(AEON, path), 'utf8'), reason: null })),
    );
    expect(scan.kind).toBe('measured');
    if (scan.kind !== 'measured') return;
    const found = scan.sites.map((s) => `${s.path}:${s.line}`).sort();
    expect(found.length, 'the scan found nothing in aeon: this row measured nothing').toBeGreaterThan(0);
    expect(found).toEqual(independent(AEON, target!));
    expect(scan.blind).toEqual([]);
    expect(scan.capped).toBe(false);
  });
});
