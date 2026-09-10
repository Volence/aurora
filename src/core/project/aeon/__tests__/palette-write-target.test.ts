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
import { EditHistory } from '../../../editing/history';
import type { S4Level } from '../../../editing/commands';
import { serializeTiles } from '../../../export/tile-dedup';
import { serializeNametable } from '../../../formats/s4-nametable';
import {
  decodeGenesisColor, encodeGenesisColor, sameGenesisColor,
  serializeZonePalette,
  ZONE_PALETTE_BYTES, ZONE_PALETTE_FIRST_LINE, ZONE_PALETTE_LINE_COUNT, ZONE_PALETTE_WORDS,
  CRAM_LINE_ENTRIES,
} from '../../../formats/palette';
import { SECTION_TILES_WIDE, SECTION_TILES_HIGH } from '../../../model/s4-types';
import type { Color, Tile } from '../../../model/s4-types';

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
 * The shared player palette. ONE file for the whole game, loaded into CRAM line
 * 0 of every zone, and the file this parcel must never write.
 */
const PLAYER_PALETTE_PATH = 'art/palettes/SonicAndTails.bin';

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
function playerPaletteBytes(): Uint8Array {
  return palBytes(CRAM_LINE_ENTRIES, (i) => fixtureWord(7, i));
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

function fixtureFiles(opts?: { palette?: Uint8Array }): Map<string, Uint8Array> {
  const files = new Map<string, Uint8Array>();
  files.set('project.json', new TextEncoder().encode(projectJson()));
  files.set('data/ojz_tiles.bin', serializeTiles([tile(0), tile(1)]));
  files.set(PALETTE_PATH, opts?.palette ?? zonePaletteBytes());
  files.set(PLAYER_PALETTE_PATH, playerPaletteBytes());
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
) {
  const before = await loadAeonProject(memFa(files), '');
  edit(before.project);
  const plan = await buildAeonSavePlan(
    memFa(files), before.config, before.project, ZONE_ID, ACT_ID,
    { legacyAtlasMerged: before.legacyAtlasMerged },
  );
  for (const f of plan.files) files.set(f.path, f.bytes);
  for (const r of plan.removals) files.delete(r.path);
  const after = await loadAeonProject(memFa(files), '');
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

describe('line 0 belongs to Sonic and Tails, and this save does not touch it', () => {
  /**
   * THE ONE THING THIS PARCEL WAS FORBIDDEN TO DECIDE.
   *
   * `Zone.palette` line 0 comes from `art/palettes/SonicAndTails.bin` — one file
   * for the entire game — so writing an edit there recolours the characters in
   * every zone. Owner card PALETTE-LINE0-BLAST-RADIUS is unanswered; this is the
   * recommended `refuse_line0` build, and the refusal is what gets replaced if
   * the ruling changes.
   *
   * The UI half of the refusal (the lock, and the sentence a person reads) is in
   * providers/__tests__/palette-aeon.test.ts. This half is the one that would
   * cause the damage: the plan must not name that file whatever is in the model.
   */
  it('never plans a write to the shared player palette', async () => {
    const files = fixtureFiles();
    const shared = files.get(PLAYER_PALETTE_PATH)!;

    // Plant the edit the UI now refuses, straight into the model, so this row
    // measures the SAVE and not the lock: if a future change re-opened line 0
    // for editing, the plan must still not write the shared file.
    const { plan, after } = await editSaveReopen(files, (project) => {
      const colors = project.zones[0].palette.lines[0].colors.map((c) => ({ ...c }));
      colors[3] = decodeGenesisColor(0x0eee);
      setPaletteLine(project, 0, colors);
    });

    expect(plan.files.map((f) => f.path), 'the save plans a write to the SHARED player palette')
      .not.toContain(PLAYER_PALETTE_PATH);
    expect(plan.removals.map((r) => r.path)).not.toContain(PLAYER_PALETTE_PATH);
    // On disk, byte for byte, after the plan was applied.
    expect(files.get(PLAYER_PALETTE_PATH)).toEqual(shared);

    // And the reopened line 0 is the SHARED file's colours, not the edit: the
    // edit was refused, which is the point. Derived from the fixture formula.
    for (let i = 0; i < CRAM_LINE_ENTRIES; i++) {
      const back = encodeGenesisColor(after.project.zones[0].palette.lines[0].colors[i]);
      expect(sameGenesisColor(back, fixtureWord(7, i)), `line 0 entry ${i}`).toBe(true);
    }
  });

  /**
   * And the same fact stated where it cannot be forgotten: the serializer has no
   * way to emit line 0. This is the structural half of the refusal — not a check
   * anyone can skip, but the shape of the function.
   *
   * Deleting the `ZONE_PALETTE_FIRST_LINE` start of its loop reddens here.
   */
  it('the serializer emits lines 1 to 3 and has no way to emit line 0', () => {
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
