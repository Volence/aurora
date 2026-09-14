// THE SHARED PLAYER PALETTE: where an aeon zone's CRAM line 0 comes from, and
// how an edit to it goes back.
//
// ═══ THE RULING ═══════════════════════════════════════════════════════════
//
// Line 0 of every aeon zone palette is Sonic and Tails. It is not in the zone's
// own palette file: it is read from ONE file the whole game shares. Owner card
// PALETTE-LINE0-BLAST-RADIUS (docs/decisions.jsonl) asked whether the editor
// may write it, and the owner chose `write_shared_file` on 2026-09-13:
//
//   "we should allow the top row with just a warning I think. like "heyy just
//    sayying this changes everything", although the top row can't be per
//    level? like I can't change sonic's palette for 1 level and it ber normal
//    for another?"
//
// His question is answered NO: per-level character colours need engine support
// first (the `per_zone_copy` option), and nothing here pretends otherwise. The
// warning itself is renderer work (providers/palette-line0-gate.ts); this file
// is the part that touches bytes.
//
// ═══ THE THREE RULES THIS FILE HOLDS ══════════════════════════════════════
//
//   1. WRITE WHERE THE LOAD READ. The load tries PLAYER_PALETTE_CANDIDATES in
//      order and records which one answered (`PlayerPaletteFile.path`); the
//      save writes that path and no other. A candidate that EXISTS but could
//      not be read stops the search for the save's purposes, because falling
//      past it would aim the write at a file the game does not read.
//   2. WRITE ONLY WHEN THE MEANING CHANGED. Line 0 is compared against the
//      words it showed at load, by displayed colour; an untouched project plans
//      no write to a file every zone shares.
//   3. NEVER CREATE, NEVER GROW. An absent file is not created, a short one is
//      not padded, an unreadable one is not overwritten. Each of those is a
//      REFUSAL with a sentence, not a silent skip: `playerPaletteRefusal`.

import type { FileAccess } from '../adapter';
import type { Notice } from '../notice';
import type { PlayerPaletteFile, Zone } from '../../model/s4-types';
import {
  changedPlayerPaletteEntries, patchPlayerPaletteLine,
  CRAM_LINE_ENTRIES, CRAM_WORD_BYTES, PLAYER_PALETTE_BYTES, PLAYER_PALETTE_LINE,
} from '../../formats/palette';

/**
 * Where line 0 is read from, in the order the load tries them. The first is the
 * file aeon's build embeds; the second is the older name the loader has always
 * fallen back to. Project-root-relative.
 */
export const PLAYER_PALETTE_CANDIDATES: readonly string[] = [
  'art/palettes/SonicAndTails.bin',
  'art/palettes/sonic.bin',
];

/** What the load learned about line 0, before any zone palette is built. */
export interface PlayerPaletteRead {
  /** The record the save consults, minus `loadedWords` (a zone fact). */
  file: Omit<PlayerPaletteFile, 'loadedWords'>;
  /** The bytes line 0 is DISPLAYED from: the first candidate that read, or
   *  null for none. Can differ from `file.path` when that one is unreadable. */
  display: Uint8Array | null;
}

type Presence = 'absent' | 'present' | 'unknown';

async function presenceOf(fa: FileAccess, path: string): Promise<Presence> {
  // FileAccess.exists THROWS when it cannot tell, and that answer must not be
  // folded into "absent": absent is the one answer that licenses moving on.
  try { return (await fa.exists(path)) ? 'present' : 'absent'; } catch { return 'unknown'; }
}

/**
 * Read line 0's file, once per project load.
 *
 * DISPLAY keeps the loader's old behaviour exactly: the first candidate that
 * reads supplies the colours. The SAVE record is stricter: it names the first
 * candidate that is not known ABSENT, and if that one did not read it carries
 * the failure instead of bytes, so the save refuses rather than writing the
 * fallback while the game keeps reading the primary.
 */
export async function readPlayerPalette(fa: FileAccess, notices: Notice[]): Promise<PlayerPaletteRead> {
  let display: Uint8Array | null = null;
  let file: PlayerPaletteRead['file'] | null = null;

  for (const path of PLAYER_PALETTE_CANDIDATES) {
    let bytes: Uint8Array | null = null;
    let failure: string | null = null;
    try {
      bytes = await fa.read(path);
    } catch (e) {
      failure = e instanceof Error ? e.message : String(e);
    }
    if (bytes) {
      display ??= bytes;
      file ??= {
        path,
        // slice, not the read buffer: nothing downstream may alias the bytes
        // the save will patch.
        bytes: bytes.slice(),
        complete: bytes.length >= PLAYER_PALETTE_BYTES,
        readFailure: null,
      };
      break;
    }
    const presence = await presenceOf(fa, path);
    if (presence !== 'absent' && file === null) {
      file = {
        path,
        bytes: new Uint8Array(0),
        complete: false,
        readFailure: presence === 'present'
          ? `it exists but could not be read (${failure})`
          : `it could not be read and Aurora could not tell whether it exists (${failure})`,
      };
    }
  }

  file ??= { path: null, bytes: new Uint8Array(0), complete: false, readFailure: null };

  // LOUD at load, on the zone palette's own precedent (load.ts, "holds N of the
  // colours"): the consequence is otherwise silent until someone edits line 0.
  // An ABSENT file is not announced here: every candidate missing is the normal
  // state of a project with no player palette, and the gesture refuses it in
  // words the moment anyone reaches for line 0.
  if (file.path !== null && file.readFailure !== null) {
    notices.push({
      severity: 'warning',
      message: `${file.path}, the shared player palette (palette line 0), ${file.readFailure}. `
        + 'Aurora will not write it, so palette line 0 edits will not save.',
    });
  } else if (file.path !== null && !file.complete) {
    const words = Math.floor(file.bytes.length / CRAM_WORD_BYTES);
    notices.push({
      severity: 'warning',
      message: `${file.path} holds ${words} of the ${CRAM_LINE_ENTRIES} colours palette line 0 `
        + '(Sonic and Tails) needs, so the rest are showing as black. Aurora will not write '
        + `this file back until it is at least ${PLAYER_PALETTE_BYTES} bytes, so palette line 0 `
        + 'edits will not save.',
    });
  }
  return { file, display };
}

/**
 * Why line 0 of a zone cannot be saved, in a sentence a person reads, or null
 * when it can. ONE sentence for the gesture (which refuses before any edit is
 * made) and for the save (the backstop), so the two cannot come to mean
 * different things.
 */
export function playerPaletteRefusal(file: PlayerPaletteFile): string | null {
  if (file.path === null) {
    return `neither ${PLAYER_PALETTE_CANDIDATES.join(' nor ')} is in this project, so there is no `
      + 'shared player palette to save palette line 0 into, and Aurora will not create one.';
  }
  if (file.readFailure !== null) {
    return `${file.path}, the shared player palette, ${file.readFailure}, so Aurora will not write it.`;
  }
  if (!file.complete) {
    const words = Math.floor(file.bytes.length / CRAM_WORD_BYTES);
    return `${file.path} held ${words} of the ${CRAM_LINE_ENTRIES} colours palette line 0 needs `
      + 'when the project opened, so Aurora will not write it back or grow it.';
  }
  return null;
}

/** How a planned write to the shared file is named wherever a save reports. */
export function sharedPlayerPaletteWhat(path: string): string {
  return `the shared player palette ${path} (Sonic and Tails, every zone)`;
}

export interface PlayerPalettePlan {
  /** The one write to the shared file, or null when none is needed or allowed. */
  file: { path: string; bytes: Uint8Array } | null;
  /** How that write is named in the save's report. Null iff `file` is. */
  what: string | null;
  /** Edits that exist and will NOT be saved, each in a sentence. */
  refusals: string[];
}

/**
 * Plan line 0's write for a whole project.
 *
 * EVERY ZONE CARRIES ITS OWN COPY of line 0 in memory, all read from one file.
 * So the question is asked per zone (did THIS copy change?) and answered once:
 *   • no zone changed it  → no write (rule 2);
 *   • a zone changed it but the file is not writable → a refusal, no write
 *     (rule 3);
 *   • zones changed it and agree → one patch of the file (rule 1);
 *   • zones changed it and DISAGREE → a refusal, no write. Picking one would
 *     silently discard the other's edit to a file they both show.
 *
 * The baseline is never refreshed after a save, on purpose: a zone that did not
 * see the edit still holds the load-time colours, and comparing it against a
 * refreshed baseline would read its stale copy as a new edit and write the old
 * colours back over the new ones.
 */
export function planPlayerPaletteWrite(zones: readonly Zone[]): PlayerPalettePlan {
  const refusals: string[] = [];
  const edits: { zoneId: string; path: string; bytes: Uint8Array }[] = [];
  for (const zone of zones) {
    const rec = zone.playerPaletteFile;
    const colors = zone.palette.lines[PLAYER_PALETTE_LINE]?.colors ?? [];
    const changed = changedPlayerPaletteEntries(rec.loadedWords, colors);
    if (changed.length === 0) continue;
    const refusal = playerPaletteRefusal(rec);
    if (refusal !== null) {
      refusals.push(`Palette line 0 in zone "${zone.id}" was edited and NOT saved: ${refusal}`);
      continue;
    }
    edits.push({ zoneId: zone.id, path: rec.path!, bytes: patchPlayerPaletteLine(rec.bytes, colors, changed) });
  }
  if (edits.length === 0) return { file: null, what: null, refusals };

  const first = edits[0];
  const disagree = edits.find((e) => e.path !== first.path
    || e.bytes.length !== first.bytes.length
    || e.bytes.some((b, i) => b !== first.bytes[i]));
  if (disagree) {
    refusals.push(
      `Palette line 0 is one file shared by every zone (${first.path}), and zones "${first.zoneId}" `
      + `and "${disagree.zoneId}" hold different edits to it, so Aurora saved neither. `
      + 'Make the two match and save again.',
    );
    return { file: null, what: null, refusals };
  }
  return { file: { path: first.path, bytes: first.bytes }, what: sharedPlayerPaletteWhat(first.path), refusals };
}
