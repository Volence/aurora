// PALETTE ROUND TRIP: pick a colour, save, reopen, get the colour back.
//
// ═══ WHAT THIS PINS, AND WHY IT IS NOT THE GRID-RESIZE BUG AGAIN ══════════
//
// The grid-dimension defect (2026-09-10, __tests__/grid-resize-roundtrip.test.ts)
// was a value that existed in TWO places and was not copied between them. This
// one is different in kind: until this file existed there was nowhere to write
// a palette to and no code that could turn a `Palette` back into bytes.
// `core/formats/palette.ts` had `parsePaletteLine` and `buildPalette` and no
// inverse; `buildAeonSavePlan` planned no palette file at all. Every colour the
// author picked lived in the model until the reopen and then vanished, in
// silence.
//
// IT WAS INVISIBLE FOR A REASON WORTH KEEPING. The editor's live preview pushes
// CRAM straight into a running game, so the colour DID appear in the emulator.
// aeon's own tools/ojz_common.py records the same trap from the other side of
// the same file ("THE LIVE PATH WORKING IS WHAT HID IT"). A check that only
// exercises the live push passes throughout. So every row below goes through
// disk.
//
// ═══ LINE 0, SINCE 2026-09-13 ═════════════════════════════════════════════
//
// Line 0 is Sonic and Tails, read from ONE player palette file the whole game
// shares. Until 2026-09-13 this file pinned the `refuse_line0` build: "never
// plans a write to the shared player palette". The owner ruled the other way
// (decisions.jsonl `PALETTE-LINE0-BLAST-RADIUS-answered`, `write_shared_file`),
// so the rows under "line 0 saves into the shared player palette" now pin the
// write: to the path the load READ, only when line 0's meaning changed, never
// creating or growing the file. The warning a person sees first is renderer
// work and is pinned in providers/__tests__/palette-line0-gate.test.ts.
//
// ═══ EXPECTATIONS ARE DERIVED ═════════════════════════════════════════════
//
// The expected colour after a reopen is computed from the WORD the edit was
// made with, through the same public encode/decode pair any caller would use,
// never from a value someone read out of one run. The fixture's palette bytes
// are generated from a formula, so "the file came back unchanged" is a claim
// about the formula and not about a blob.

import { describe, it, expect } from 'vitest';
import type { FileAccess } from '../../adapter';
import { loadAeonProject } from '../load';
import { buildAeonSavePlan } from '../save';
import {
  PLAYER_PALETTE_CANDIDATES, planPlayerPaletteWrite, sharedPlayerPaletteWhat,
} from '../player-palette';
import { EditHistory } from '../../../editing/history';
import type { S4Level } from '../../../editing/commands';
import { serializeTiles } from '../../../export/tile-dedup';
import { serializeNametable } from '../../../formats/s4-nametable';
import {
  decodeGenesisColor, encodeGenesisColor, sameGenesisColor,
  serializeZonePalette,
  ZONE_PALETTE_BYTES, ZONE_PALETTE_FIRST_LINE, ZONE_PALETTE_LINE_COUNT, ZONE_PALETTE_WORDS,
  CRAM_LINE_ENTRIES, CRAM_WORD_BYTES, GENESIS_WORD_MASK, PLAYER_PALETTE_BYTES, PLAYER_PALETTE_LINE,
} from '../../../formats/palette';
import { SECTION_TILES_WIDE, SECTION_TILES_HIGH } from '../../../model/s4-types';
import type { Color, Tile, Zone } from '../../../model/s4-types';

function tile(fill: number): Tile {
  return { pixels: new Uint8Array(64).fill(fill) };
}

/** In-memory FileAccess over a Map<rel, bytes>. read() throws on a miss, like the IPC bridge. */
function memFa(files: Map<string, Uint8Array>): FileAccess {
  return {
    exists: async (rel) => files.has(rel),
    read: async (rel) => {
      const b = files.get(rel);
      if (!b) throw new Error(`ENOENT: ${rel}`);
      return b;
    },
    list: async () => [],
  };
}

const ZONE_ID = 'ojz';
const ACT_ID = 'act1';
const DATA_PATH = 'data/ojz/act1/';

/**
 * The zone's authored palette, at the path project.json names. Deliberately NOT
 * under an `editor/` directory of Aurora's own choosing: the whole point of this
 * parcel is that the save writes THIS path, the one the repo declared.
 */
const PALETTE_PATH = 'data/editor/ojz/act1/palette.bin';

/**
 * The shared player palette, and its fallback. ONE file for the whole game,
 * loaded into CRAM line 0 of every zone. Read from the module's own candidate
 * list rather than typed, so these rows follow the loader if the names move.
 */
const [PLAYER_PALETTE_PATH, PLAYER_FALLBACK_PATH] = PLAYER_PALETTE_CANDIDATES;

/**
 * A CRAM word for entry `i` of `line`, made of the three 3-bit channels so every
 * entry differs from every other and each is already legal (all `& $F111` bits
 * clear). Used for BOTH palette files, so a row that confuses the zone palette
 * with the player palette gets different numbers rather than a coincidence.
 */
function fixtureWord(line: number, i: number): number {
  const r = (i + line) % 8;
  const g = (i * 3 + line * 2) % 8;
  const b = (i * 5 + line) % 8;
  return (b << 9) | (g << 5) | (r << 1);
}

/** `count` big-endian words from `word(i)`. */
function palBytes(count: number, word: (i: number) => number): Uint8Array {
  const out = new Uint8Array(count * 2);
  for (let i = 0; i < count; i++) {
    out[i * 2] = (word(i) >> 8) & 0xff;
    out[i * 2 + 1] = word(i) & 0xff;
  }
  return out;
}

/** The zone palette file's bytes: 48 words, line 1 entry 0 first. */
function zonePaletteBytes(): Uint8Array {
  return palBytes(ZONE_PALETTE_WORDS, (i) => fixtureWord(
    ZONE_PALETTE_FIRST_LINE + Math.floor(i / CRAM_LINE_ENTRIES), i % CRAM_LINE_ENTRIES));
}

/** The shared player palette's bytes: one line, keyed off a line number no zone
 *  palette file can produce, so its colours are unmistakable. */
const PLAYER_KEY = 7;
function playerPaletteBytes(key: number = PLAYER_KEY): Uint8Array {
  return palBytes(CRAM_LINE_ENTRIES, (i) => fixtureWord(key, i));
}

function projectJson(): string {
  return JSON.stringify({
    name: 'Palette Write Fixture',
    engine: 's4',
    objectLibrary: 'data/objects.json',
    chunkLibrary: '',
    zones: [{
      id: ZONE_ID, name: 'OJ Zone',
      tileset: 'data/ojz_tiles.bin',
      palette: PALETTE_PATH,
      acts: [{
        id: ACT_ID, gridWidth: 1, gridHeight: 1,
        dataPath: DATA_PATH,
        bgLayout: '', bgTiles: '', sceneRef: null,
        startPosition: { secX: 0, secY: 0, localX: 64, localY: 64 },
      }],
    }],
  });
}

/**
 * `player` places the shared player palette: omitted puts the formula's bytes
 * at the first candidate, `null` puts nothing at any candidate, and a list puts
 * exactly those files.
 */
function fixtureFiles(opts?: {
  palette?: Uint8Array;
  player?: { path: string; bytes: Uint8Array }[] | null;
}): Map<string, Uint8Array> {
  const files = new Map<string, Uint8Array>();
  files.set('project.json', new TextEncoder().encode(projectJson()));
  files.set('data/ojz_tiles.bin', serializeTiles([tile(0), tile(1)]));
  files.set(PALETTE_PATH, opts?.palette ?? zonePaletteBytes());
  const player = opts?.player === undefined
    ? [{ path: PLAYER_PALETTE_PATH, bytes: playerPaletteBytes() }]
    : opts.player ?? [];
  for (const p of player) files.set(p.path, p.bytes);
  const nt = new Uint16Array(SECTION_TILES_WIDE * SECTION_TILES_HIGH);
  files.set(`${DATA_PATH}section_0.tiles.bin`, serializeNametable(nt));
  files.set('data/objects.json', new TextEncoder().encode(JSON.stringify([])));
  return files;
}

/**
 * Load, run `edit` over the loaded project through the real command path, build
 * the real save plan, apply it to `files`, and load again.
 */
async function editSaveReopen(
  files: Map<string, Uint8Array>,
  edit: (project: Awaited<ReturnType<typeof loadAeonProject>>['project']) => void,
  fa: FileAccess = memFa(files),
) {
  const before = await loadAeonProject(fa, '');
  edit(before.project);
  const plan = await buildAeonSavePlan(
    fa, before.config, before.project, ZONE_ID, ACT_ID,
    { legacyAtlasMerged: before.legacyAtlasMerged },
  );
  for (const f of plan.files) files.set(f.path, f.bytes);
  for (const r of plan.removals) files.delete(r.path);
  const after = await loadAeonProject(fa, '');
  return { before, after, plan };
}

/** The `set-palette-line` command the palette editor's drag-end raises, run
 *  through the real EditHistory so the round trip goes the way a person's does. */
function setPaletteLine(
  project: Awaited<ReturnType<typeof loadAeonProject>>['project'],
  line: number,
  newColors: Color[],
): void {
  const zone = project.zones[0];
  const act = zone.acts[0];
  const level: S4Level = { sections: act.sections, act, palette: zone.palette };
  new EditHistory().execute({
    type: 'set-palette-line',
    description: `art: edit palette line ${line}`,
    sectionIndex: -1,
    line,
    oldColors: zone.palette.lines[line].colors.map((c) => ({ ...c })),
    newColors,
  }, level);
}

/** One entry of line 0 set to `word`, through the command a person's edit raises. */
function editLine0(
  project: Awaited<ReturnType<typeof loadAeonProject>>['project'],
  entry: number,
  word: number,
): void {
  const colors = project.zones[0].palette.lines[PLAYER_PALETTE_LINE].colors.map((c) => ({ ...c }));
  colors[entry] = decodeGenesisColor(word);
  setPaletteLine(project, PLAYER_PALETTE_LINE, colors);
}

/** The big-endian word at entry `i` of a byte buffer. */
function wordAt(bytes: Uint8Array, i: number): number {
  return (bytes[i * CRAM_WORD_BYTES] << 8) | bytes[i * CRAM_WORD_BYTES + 1];
}

describe('a zone palette edit survives save and reopen', () => {
  /**
   * THE ACCEPTANCE CRITERION. One entry, one line, through the command the UI
   * raises, out through the real plan and back through the real loader.
   *
   * The expected colour is DERIVED: `EDIT_WORD` is the word the edit is made
   * with, and what must come back is `decodeGenesisColor(EDIT_WORD)`. Nothing
   * here was read off a run.
   */
  it('the colour picked on line 2 is the colour that comes back', async () => {
    const files = fixtureFiles();
    const LINE = 2;
    const ENTRY = 5;
    // A word no fixture entry holds, so "it came back" cannot be the fixture
    // value surviving a save that wrote nothing.
    const EDIT_WORD = 0x0e2a;
    expect(fixtureWord(LINE, ENTRY)).not.toBe(EDIT_WORD);

    const { before, after } = await editSaveReopen(files, (project) => {
      const colors = project.zones[0].palette.lines[LINE].colors.map((c) => ({ ...c }));
      colors[ENTRY] = decodeGenesisColor(EDIT_WORD);
      setPaletteLine(project, LINE, colors);
    });

    // The command ran. Without this the row below could pass on a project the
    // edit never reached.
    expect(encodeGenesisColor(before.project.zones[0].palette.lines[LINE].colors[ENTRY]))
      .toBe(EDIT_WORD);

    const back = after.project.zones[0].palette.lines[LINE].colors[ENTRY];
    expect(encodeGenesisColor(back), 'the edited colour did not survive the reopen')
      .toBe(EDIT_WORD);
    expect(back).toEqual(decodeGenesisColor(EDIT_WORD));
  });

  /** Every line the zone OWNS round-trips, not just the one line a first fix
   *  happened to reach. Each line gets a different word so a save that wrote one
   *  line over another is a failure and not a pass. */
  it('every line the zone owns round-trips, and they do not swap places', async () => {
    const files = fixtureFiles();
    const ownedLines = Array.from(
      { length: ZONE_PALETTE_LINE_COUNT }, (_, i) => ZONE_PALETTE_FIRST_LINE + i);
    const wordFor = (line: number): number => ((line * 2) << 9) | ((line * 2) << 5) | (line << 1);

    const { after } = await editSaveReopen(files, (project) => {
      for (const line of ownedLines) {
        const colors = project.zones[0].palette.lines[line].colors.map((c) => ({ ...c }));
        colors[9] = decodeGenesisColor(wordFor(line));
        setPaletteLine(project, line, colors);
      }
    });

    for (const line of ownedLines) {
      expect(
        encodeGenesisColor(after.project.zones[0].palette.lines[line].colors[9]),
        `line ${line} entry 9`,
      ).toBe(wordFor(line));
    }
  });

  /** The plan writes the path project.json declared, in place. Not an
   *  Aurora-derived `editor/` path and not a retarget: aeon declares this file
   *  the only authored copy and mirrors it into the generated tree on build. */
  it('writes the zone palette to the path project.json names, and retargets nothing', async () => {
    const files = fixtureFiles();
    const { plan, before } = await editSaveReopen(files, () => {});

    expect(plan.files.map((f) => f.path)).toContain(PALETTE_PATH);
    expect(before.config.raw.zones[0].palette, 'the save moved the palette pointer')
      .toBe(PALETTE_PATH);
    const written = plan.files.filter((f) => f.path === PALETTE_PATH);
    expect(written, 'the palette is planned more than once').toHaveLength(1);
    expect(written[0].bytes.length).toBe(ZONE_PALETTE_BYTES);
  });

  /**
   * OPENING AND SAVING AN UNTOUCHED PROJECT CHANGES NO PALETTE BYTE.
   *
   * A save that rewrote the file with different bytes every time would show up
   * in aeon's `git status` on every Ctrl+S and, worse, would trip its staleness
   * gate into re-baking a palette nobody edited. The fixture's bytes come from a
   * formula, so this compares against the formula.
   *
   * ⚠ TRUE OF WORDS THAT ARE ALREADY LEGAL COLOURS. A word with junk in the
   * bits the VDP does not display (`GENESIS_WORD_MASK`) is normalised by the
   * decode/encode pair, which is why `fixtureWord` builds from channels.
   */
  it('an untouched project re-serializes the palette byte for byte', async () => {
    const files = fixtureFiles();
    const original = files.get(PALETTE_PATH)!;
    const { plan } = await editSaveReopen(files, () => {});
    const written = plan.files.find((f) => f.path === PALETTE_PATH)!;
    expect(written.bytes).toEqual(original);
  });
});

describe('line 0 saves into the shared player palette the load read (owner ruling 2026-09-13)', () => {
  /**
   * WAS `never plans a write to the shared player palette`, the `refuse_line0`
   * build. The owner chose `write_shared_file`, so the property is now the
   * other way round, and it is pinned the same way the line-2 row above is:
   * a derived word through the real command, the real plan and the real loader.
   */
  it('a colour picked on line 0 is the colour that comes back after save and reopen', async () => {
    const files = fixtureFiles();
    const ENTRY = 4;
    const EDIT_WORD = 0x0e2a;
    expect(fixtureWord(PLAYER_KEY, ENTRY), 'the fixture already holds the edit word').not.toBe(EDIT_WORD);

    const { before, after } = await editSaveReopen(files, (p) => editLine0(p, ENTRY, EDIT_WORD));

    expect(encodeGenesisColor(before.project.zones[0].palette.lines[PLAYER_PALETTE_LINE].colors[ENTRY]),
      'the edit never reached the model').toBe(EDIT_WORD);
    expect(encodeGenesisColor(after.project.zones[0].palette.lines[PLAYER_PALETTE_LINE].colors[ENTRY]),
      'the line 0 edit did not survive the reopen').toBe(EDIT_WORD);
  });

  /**
   * WHERE IT LANDS, and what does NOT move with it. The edited plan must be the
   * untouched plan plus exactly one path, the shared file the load read: no
   * retargeted pointer, no second copy, the zone's own palette unchanged.
   */
  it('lands in the file the load read, and nothing else is retargeted', async () => {
    const control = await editSaveReopen(fixtureFiles(), () => {});
    const { plan, before } = await editSaveReopen(fixtureFiles(), (p) => editLine0(p, 4, 0x0e2a));

    expect(before.project.zones[0].playerPaletteFile.path, 'the load recorded a different file')
      .toBe(PLAYER_PALETTE_PATH);
    const paths = plan.files.map((f) => f.path);
    expect(paths.filter((p) => p === PLAYER_PALETTE_PATH), 'planned zero or several times').toHaveLength(1);
    expect(paths.filter((p) => p !== PLAYER_PALETTE_PATH).sort(), 'the line 0 edit moved some other write')
      .toEqual(control.plan.files.map((f) => f.path).sort());
    expect(plan.configChanged, 'a line 0 edit retargeted project.json').toBe(control.plan.configChanged);
    // The zone's own file is still exactly what an untouched save writes.
    expect(plan.files.find((f) => f.path === PALETTE_PATH)!.bytes)
      .toEqual(control.plan.files.find((f) => f.path === PALETTE_PATH)!.bytes);
    expect(PLAYER_PALETTE_CANDIDATES.slice(1).some((p) => paths.includes(p)), 'a fallback was written too')
      .toBe(false);
  });

  /**
   * ONLY THE EDITED ENTRY MOVES. The fixture carries a tail past line 0 and a
   * word with a bit the VDP ignores on an entry nobody touches; both must come
   * through byte for byte, and the file must not change length.
   */
  it('only the edited entry moves: untouched words and the bytes past line 0 ride through', async () => {
    const JUNK_ENTRY = 9;
    const JUNK_BIT = 0x1000;
    expect(JUNK_BIT & GENESIS_WORD_MASK, 'the planted bit is one the VDP displays').toBe(0);
    const tail = Uint8Array.from([0xde, 0xad, 0xbe, 0xef, 0x00, 0x01]);
    const raw = new Uint8Array(PLAYER_PALETTE_BYTES + tail.length);
    raw.set(playerPaletteBytes());
    raw.set(tail, PLAYER_PALETTE_BYTES);
    const junked = fixtureWord(PLAYER_KEY, JUNK_ENTRY) | JUNK_BIT;
    raw[JUNK_ENTRY * CRAM_WORD_BYTES] = junked >> 8;
    const files = fixtureFiles({ player: [{ path: PLAYER_PALETTE_PATH, bytes: raw.slice() }] });

    const ENTRY = 4;
    const EDIT_WORD = 0x0e2a;
    const { plan } = await editSaveReopen(files, (p) => editLine0(p, ENTRY, EDIT_WORD));
    const written = plan.files.find((f) => f.path === PLAYER_PALETTE_PATH)!.bytes;

    expect(written.length, 'the save changed the shared file\'s length').toBe(raw.length);
    const moved = [...written.keys()].filter((i) => written[i] !== raw[i]);
    const editedBytes = new Set([ENTRY * CRAM_WORD_BYTES, ENTRY * CRAM_WORD_BYTES + 1]);
    expect(moved.filter((i) => !editedBytes.has(i)), 'bytes other than the edited entry moved').toEqual([]);
    expect(moved.length, 'nothing moved at all: this row measured no edit').toBeGreaterThan(0);
    expect(wordAt(written, ENTRY)).toBe(EDIT_WORD);
    expect(wordAt(written, JUNK_ENTRY), 'an untouched word lost its undisplayed bit').toBe(junked);
    expect(written.slice(PLAYER_PALETTE_BYTES)).toEqual(tail);
  });

  /**
   * AN UNTOUCHED PROJECT PLANS NO WRITE TO THE SHARED FILE. The repo's rule is
   * that a save writes a file only when its meaning changed; for a file every
   * zone reads, planning it at all would put it in every save's report.
   */
  it('an untouched project plans no write to the shared file', async () => {
    const { plan } = await editSaveReopen(fixtureFiles(), () => {});
    for (const path of PLAYER_PALETTE_CANDIDATES) {
      expect(plan.files.map((f) => f.path), `an untouched save planned ${path}`).not.toContain(path);
    }
    expect(plan.shared).toEqual([]);
    expect(plan.refusals).toEqual([]);
  });

  /** "Meaning", not "was a command run": an edit put back to the loaded colour
   *  is no change, whatever the undo stack says. */
  it('an edit put back to the loaded colour plans no write', async () => {
    const ENTRY = 4;
    const { plan } = await editSaveReopen(fixtureFiles(), (p) => {
      editLine0(p, ENTRY, 0x0e2a);
      editLine0(p, ENTRY, fixtureWord(PLAYER_KEY, ENTRY));
    });
    expect(plan.files.map((f) => f.path)).not.toContain(PLAYER_PALETTE_PATH);
  });

  /** The write that changes every zone is NAMED in the plan, in the words the
   *  save's report uses, so the glue cannot make it in silence. */
  it('names the shared write in the plan, in the words the save report uses', async () => {
    const { plan } = await editSaveReopen(fixtureFiles(), (p) => editLine0(p, 4, 0x0e2a));
    expect(plan.shared).toEqual([{ path: PLAYER_PALETTE_PATH, what: sharedPlayerPaletteWhat(PLAYER_PALETTE_PATH) }]);
    expect(plan.shared[0].what).toContain(PLAYER_PALETTE_PATH);
    expect(plan.shared[0].what).toContain('every zone');
  });

  /**
   * THE FALLBACK. With the first candidate absent the load reads the second, and
   * the save writes the one it read. The first is not created.
   */
  it('with only the fallback present, the edit lands in the fallback and the first is not created', async () => {
    const files = fixtureFiles({ player: [{ path: PLAYER_FALLBACK_PATH, bytes: playerPaletteBytes() }] });
    const ENTRY = 6;
    const EDIT_WORD = 0x0e2a;
    const { before, plan, after } = await editSaveReopen(files, (p) => editLine0(p, ENTRY, EDIT_WORD));

    expect(before.project.zones[0].playerPaletteFile.path).toBe(PLAYER_FALLBACK_PATH);
    expect(plan.files.map((f) => f.path)).toContain(PLAYER_FALLBACK_PATH);
    expect(files.has(PLAYER_PALETTE_PATH), 'the save created the first candidate').toBe(false);
    expect(wordAt(files.get(PLAYER_FALLBACK_PATH)!, ENTRY)).toBe(EDIT_WORD);
    expect(encodeGenesisColor(after.project.zones[0].palette.lines[PLAYER_PALETTE_LINE].colors[ENTRY]))
      .toBe(EDIT_WORD);
  });

  /** Both present: the first is what the game reads and what the load read, so
   *  it is the only one written; the fallback's bytes do not move. */
  it('with both candidates present, only the first is written', async () => {
    const fallback = playerPaletteBytes(3);
    const files = fixtureFiles({
      player: [
        { path: PLAYER_PALETTE_PATH, bytes: playerPaletteBytes() },
        { path: PLAYER_FALLBACK_PATH, bytes: fallback.slice() },
      ],
    });
    const { plan } = await editSaveReopen(files, (p) => editLine0(p, 4, 0x0e2a));
    const paths = plan.files.map((f) => f.path);
    expect(paths).toContain(PLAYER_PALETTE_PATH);
    expect(paths).not.toContain(PLAYER_FALLBACK_PATH);
    expect(files.get(PLAYER_FALLBACK_PATH)).toEqual(fallback);
  });

  /**
   * Every zone holds its own copy of line 0, all read from one file. Two zones
   * that edited it DIFFERENTLY must not have one edit silently discarded: the
   * plan writes neither and says why. Two that agree write once.
   */
  it('two zones holding different line 0 edits save neither, and say so; agreeing zones write once', async () => {
    const loaded = await loadAeonProject(memFa(fixtureFiles()), '');
    const z1 = loaded.project.zones[0];
    const copy = (id: string): Zone => ({
      ...z1, id,
      palette: { lines: z1.palette.lines.map((l) => ({ colors: l.colors.map((c) => ({ ...c })) })) },
    });
    const a = copy('za');
    const b = copy('zb');
    a.palette.lines[PLAYER_PALETTE_LINE].colors[4] = decodeGenesisColor(0x0e2a);
    b.palette.lines[PLAYER_PALETTE_LINE].colors[4] = decodeGenesisColor(0x00ee);

    const clash = planPlayerPaletteWrite([a, b]);
    expect(clash.file, 'one of two disagreeing edits was written').toBeNull();
    expect(clash.refusals).toHaveLength(1);
    expect(clash.refusals[0]).toContain('"za"');
    expect(clash.refusals[0]).toContain('"zb"');

    b.palette.lines[PLAYER_PALETTE_LINE].colors[4] = decodeGenesisColor(0x0e2a);
    const agree = planPlayerPaletteWrite([a, b]);
    expect(agree.refusals).toEqual([]);
    expect(agree.file?.path).toBe(PLAYER_PALETTE_PATH);
  });

  /**
   * And the same fact stated where it cannot be forgotten: the ZONE's
   * serializer has no way to emit line 0. Line 0 has its own file and its own
   * writer; putting it in the zone file would slide every line down by one.
   *
   * Deleting the `ZONE_PALETTE_FIRST_LINE` start of its loop reddens here.
   */
  it('the zone file serializer emits lines 1 to 3 and has no way to emit line 0', () => {
    const line0 = Array.from({ length: CRAM_LINE_ENTRIES }, (_, i) => decodeGenesisColor(0x0eee - i));
    const lines = [
      { colors: line0 },
      ...Array.from({ length: ZONE_PALETTE_LINE_COUNT }, (_, k) => ({
        colors: Array.from({ length: CRAM_LINE_ENTRIES },
          (_, i) => decodeGenesisColor(fixtureWord(ZONE_PALETTE_FIRST_LINE + k, i))),
      })),
    ];
    const bytes = serializeZonePalette({ lines });

    expect(bytes.length).toBe(ZONE_PALETTE_BYTES);
    // The first word out is line 1 entry 0, not line 0 entry 0. Getting this
    // wrong slides every line down by one and paints terrain colours on Sonic.
    expect((bytes[0] << 8) | bytes[1]).toBe(fixtureWord(ZONE_PALETTE_FIRST_LINE, 0));
    // AND THE OUTPUT DOES NOT DEPEND ON LINE 0 AT ALL. Asserted by INVARIANCE
    // rather than by "no line 0 colour appears in the bytes": any 3-bit colour
    // can legitimately occur on lines 1 to 3 too, so a value scan matches by
    // coincidence and reports a leak that is not there. Serialising the same
    // three lines under a completely different line 0 must give the same bytes.
    const otherLine0 = Array.from(
      { length: CRAM_LINE_ENTRIES }, (_, i) => decodeGenesisColor(fixtureWord(5, i)));
    expect(line0.map(encodeGenesisColor), 'the two line 0 fixtures are the same palette')
      .not.toEqual(otherLine0.map(encodeGenesisColor));
    expect(
      serializeZonePalette({ lines: [{ colors: otherLine0 }, ...lines.slice(1)] }),
      'the serialized bytes changed when only line 0 changed',
    ).toEqual(bytes);
  });

  /** The two line constants tile the CRAM: the player's line is exactly the one
   *  below the zone file's first. If either moved alone, one line would be
   *  written by both writers or by neither. */
  it('the player line and the zone file\'s lines tile the CRAM', () => {
    expect(PLAYER_PALETTE_LINE + 1).toBe(ZONE_PALETTE_FIRST_LINE);
    expect(PLAYER_PALETTE_BYTES).toBe(CRAM_LINE_ENTRIES * CRAM_WORD_BYTES);
  });
});

describe('a player palette the load did not fully read is neither written nor created', () => {
  /** ABSENT: no candidate on disk. There is no file to write, and Aurora does
   *  not invent one; the edit is refused in words rather than dropped. */
  it('absent: no file is created, and the plan refuses the edit in words', async () => {
    const files = fixtureFiles({ player: null });
    const { before, plan } = await editSaveReopen(files, (p) => editLine0(p, 4, 0x0e2a));

    expect(before.project.zones[0].playerPaletteFile.path).toBeNull();
    for (const path of PLAYER_PALETTE_CANDIDATES) {
      expect(plan.files.map((f) => f.path), `the save planned ${path}`).not.toContain(path);
      expect(files.has(path), `the save created ${path}`).toBe(false);
    }
    expect(plan.refusals, 'an unsavable line 0 edit was dropped in silence').toHaveLength(1);
    expect(plan.refusals[0]).toContain('NOT saved');
    for (const path of PLAYER_PALETTE_CANDIDATES) expect(plan.refusals[0]).toContain(path);
  });

  /** TRUNCATED: the missing entries are this reader's black. Writing them back
   *  would put black on disk, and patching would have to grow the file; the
   *  zone palette's own rule ("neither written nor grown") applies here too. */
  it('truncated: neither written nor grown, and the plan refuses in words', async () => {
    const WORDS = 10;
    const short = playerPaletteBytes().slice(0, WORDS * CRAM_WORD_BYTES);
    const files = fixtureFiles({ player: [{ path: PLAYER_PALETTE_PATH, bytes: short.slice() }] });
    const { before, plan } = await editSaveReopen(files, (p) => editLine0(p, 2, 0x0e2a));

    expect(before.project.zones[0].playerPaletteFile.complete).toBe(false);
    expect(plan.files.map((f) => f.path), 'a partly-read player palette was written').not.toContain(PLAYER_PALETTE_PATH);
    expect(files.get(PLAYER_PALETTE_PATH)).toEqual(short);
    expect(plan.refusals).toHaveLength(1);
    expect(plan.refusals[0]).toContain(PLAYER_PALETTE_PATH);
    expect(plan.refusals[0]).toContain(`${WORDS} of the ${CRAM_LINE_ENTRIES}`);
  });

  /** …and the author is told at load, on the zone palette's precedent, not only
   *  when a save quietly declines. */
  it('truncated: and the load says so, as a warning', async () => {
    const short = playerPaletteBytes().slice(0, 10 * CRAM_WORD_BYTES);
    const loaded = await loadAeonProject(
      memFa(fixtureFiles({ player: [{ path: PLAYER_PALETTE_PATH, bytes: short }] })), '');
    const about = loaded.notices.filter((n) => n.message.includes(PLAYER_PALETTE_PATH));
    expect(about, 'a partly-read player palette produced no notice at all').toHaveLength(1);
    expect(about[0].severity).toBe('warning');
    expect(about[0].message).toContain('will not save');
  });

  /**
   * THERE BUT UNREADABLE. The display still falls back to the next candidate,
   * as the loader always has, but the SAVE must not: writing the fallback while
   * the game keeps reading the first would be an edit that never shows.
   */
  it('exists but unreadable: the save writes neither candidate, and says so at load and at save', async () => {
    const files = fixtureFiles({
      player: [
        { path: PLAYER_PALETTE_PATH, bytes: playerPaletteBytes() },
        { path: PLAYER_FALLBACK_PATH, bytes: playerPaletteBytes(3) },
      ],
    });
    const base = memFa(files);
    const fa: FileAccess = {
      ...base,
      read: async (rel) => {
        if (rel === PLAYER_PALETTE_PATH) throw new Error(`EACCES: permission denied, open '${rel}'`);
        return base.read(rel);
      },
    };
    const { before, plan } = await editSaveReopen(files, (p) => editLine0(p, 4, 0x0e2a), fa);

    const rec = before.project.zones[0].playerPaletteFile;
    expect(rec.path).toBe(PLAYER_PALETTE_PATH);
    expect(rec.readFailure).toContain('EACCES');
    // Display fell back, exactly as before this parcel.
    expect(sameGenesisColor(
      encodeGenesisColor(before.project.zones[0].palette.lines[PLAYER_PALETTE_LINE].colors[1]),
      fixtureWord(3, 1),
    )).toBe(true);
    const paths = plan.files.map((f) => f.path);
    for (const path of PLAYER_PALETTE_CANDIDATES) expect(paths, `the save planned ${path}`).not.toContain(path);
    expect(plan.refusals).toHaveLength(1);
    expect(before.notices.filter((n) => n.message.includes(PLAYER_PALETTE_PATH))[0]?.severity).toBe('warning');
  });
});

describe('a palette the load did not understand is not written back', () => {
  /**
   * THE `understood()` RULE, ON THE PALETTE.
   *
   * `buildPalette` pads a short file with BLACK. Those blacks are this reader's
   * invention, not the author's data, and a save that wrote them back would turn
   * a truncated palette into a permanently black one — the same shape as the
   * collision-plane and section-meta losses this directory already guards
   * against.
   */
  it('a truncated palette file is neither written nor grown', async () => {
    const short = zonePaletteBytes().slice(0, ZONE_PALETTE_BYTES - 2 * CRAM_LINE_ENTRIES);
    const files = fixtureFiles({ palette: short });

    const { before, plan } = await editSaveReopen(files, () => {});

    // The fixture is doing what it claims.
    expect(before.project.zones[0].paletteFile.complete).toBe(false);
    // NOT WRITTEN.
    expect(plan.files.map((f) => f.path), 'a partly-read palette was written back')
      .not.toContain(PALETTE_PATH);
    // And still on disk, byte for byte, after the plan was applied.
    expect(files.get(PALETTE_PATH)).toEqual(short);
  });

  /** …and the author is TOLD, on the channel that is not the success dwell. A
   *  save that quietly declines to write is the defect this parcel closes wearing
   *  a different hat. */
  it('and the load says so, as a warning', async () => {
    const short = zonePaletteBytes().slice(0, ZONE_PALETTE_BYTES - 2 * CRAM_LINE_ENTRIES);
    const loaded = await loadAeonProject(memFa(fixtureFiles({ palette: short })), '');
    const about = loaded.notices.filter((n) => n.message.includes(PALETTE_PATH));
    expect(about, 'a partly-read palette produced no notice at all').toHaveLength(1);
    expect(about[0].severity).toBe('warning');
    expect(about[0].message).toContain('will not save');
  });

  /** A palette file LONGER than the three lines holds something this reader did
   *  not model. Re-emitting only the part it understood would truncate it, so the
   *  tail rides through verbatim. */
  it('a longer palette file keeps every byte past the three lines', async () => {
    const tail = Uint8Array.from([0xde, 0xad, 0xbe, 0xef, 0x00, 0x01]);
    const long = new Uint8Array(ZONE_PALETTE_BYTES + tail.length);
    long.set(zonePaletteBytes());
    long.set(tail, ZONE_PALETTE_BYTES);
    const files = fixtureFiles({ palette: long });

    const LINE = ZONE_PALETTE_FIRST_LINE;
    const EDIT_WORD = 0x000e;
    const { before, plan, after } = await editSaveReopen(files, (project) => {
      const colors = project.zones[0].palette.lines[LINE].colors.map((c) => ({ ...c }));
      colors[1] = decodeGenesisColor(EDIT_WORD);
      setPaletteLine(project, LINE, colors);
    });

    expect(before.project.zones[0].paletteFile.complete).toBe(true);
    expect([...before.project.zones[0].paletteFile.tail]).toEqual([...tail]);

    const written = plan.files.find((f) => f.path === PALETTE_PATH)!;
    expect(written.bytes.length, 'the save truncated a palette file it did not fully model')
      .toBe(long.length);
    expect(written.bytes.slice(ZONE_PALETTE_BYTES)).toEqual(tail);
    // …and the edit still landed, so the tail was not preserved by declining to write.
    expect(encodeGenesisColor(after.project.zones[0].palette.lines[LINE].colors[1]))
      .toBe(EDIT_WORD);
  });
});
