// BG library persistence helpers.
//
// The project-level BG library (S4Project.bgLibrary) is a set of named
// backgrounds a section can display instead of the act default
// (Section.bgLayoutRef: null = act default, else a library entry id). It is
// persisted per zone to editor-owned paths (the data/editor convention used
// for the zone tileset and act BG in useProject.saveProject): a JSON index of
// id/name metadata plus per-entry binaries — layout via serializeNametable and
// tiles via serializeBgTiles, both in the LOCAL index convention (tile 0 =
// first blob tile), so load(save(state)) reproduces the in-memory arrays.

import { jsonFileText } from './canonical-json';
// The read layer's verdict vocabulary, imported rather than mirrored: a second
// declaration of the same union is two things that drift, and this one has to mean
// exactly what `readMany` said. Type-only, so nothing about the IPC layer is pulled
// into a codec module.
import type { ReadFailureOutcome } from '../../shared/ipc-types';

// Paths take the project's data root (projectDataRoot — 'games/<game>/data/'
// post-split, 'data/' legacy) so the library lands inside the game's data
// tree, never at the engine repo root.
export function bgLibIndexPath(dataRoot: string, zoneId: string): string {
  return `${dataRoot}editor/${zoneId}_bglib.json`;
}

export function bgLibLayoutPath(dataRoot: string, zoneId: string, id: string): string {
  return `${dataRoot}editor/${zoneId}_bg_${id}.bin`;
}

export function bgLibTilesPath(dataRoot: string, zoneId: string, id: string): string {
  return `${dataRoot}editor/${zoneId}_bg_${id}_tiles.bin`;
}

export interface BgLibraryIndexEntry {
  id: string;
  name: string;
}

/** Serialize the index JSON (metadata only — binaries are written separately). */
export function serializeBgLibraryIndex(entries: BgLibraryIndexEntry[]): string {
  return jsonFileText(JSON.stringify(entries.map(e => ({ id: e.id, name: e.name })), null, 2));
}

/** Parse the index JSON, dropping malformed entries. */
export function parseBgLibraryIndex(text: string): BgLibraryIndexEntry[] {
  const raw: unknown = JSON.parse(text);
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((e): e is { id: string; name: string } =>
      typeof e === 'object' && e !== null &&
      typeof (e as { id?: unknown }).id === 'string' &&
      typeof (e as { name?: unknown }).name === 'string')
    .map(e => ({ id: e.id, name: e.name }));
}

/**
 * Generate a library entry id: name slug + timestamp. Ids appear in file
 * names (bgLibLayoutPath) and, sanitized, in exported asm labels
 * ({zonePrefix}_BG_{id} in the act descriptor's section table).
 */
export function makeBgId(name: string, now: number = Date.now()): string {
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'bg';
  return `${slug}-${now}`;
}

/**
 * The library entries the MANIFEST names but whose bodies this checkout does
 * not have.
 *
 * WHY THIS TYPE EXISTS AT ALL. `{zone}_bglib.json` is one file naming N
 * entries; each entry's pixels live in two SEPARATE binaries beside it
 * (`bgLibLayoutPath`/`bgLibTilesPath`). Aeon tracks the manifest and — by a
 * deliberate `.gitignore` rule aimed at "dead timestamped bg experiments" —
 * tracks none of the bodies. So a clean clone of the engine repo hands Aurora
 * a manifest of 17 backgrounds and zero of their bytes, while the authoring
 * machine resolves all 17 from untracked files. The failure is invisible to
 * exactly the person who could fix it, which is why the fact has to be carried
 * rather than logged.
 *
 * Structurally it WAS a `BgLibraryIndexEntry` — id and name and nothing else,
 * because id and name are all the manifest ever held. The distinction from a
 * loaded `BgLibraryEntry` is precisely the missing `layout`/`tiles`.
 *
 * ⚠ AND WHY IT NO LONGER IS (ABSENT-CAUSE-MISNAMED, lens sweep 2026-09-08). The
 * loader pushes here from more than one place, and they do not mean the same
 * thing: a body that is ABSENT (the clean-clone case, and the reason this type
 * exists) and a body that is PRESENT AND TOO SHORT TO HOLD A ROW took the same
 * road, deliberately, because downstream could not tell them apart anyway. Then
 * the toast on open (renderer/state/aeon-open.ts) went and named a cause for the
 * whole list: "Their layout/tile files are not in this checkout." For the
 * truncated entry that sentence is FALSE, and it sends the author to look in the
 * wrong place — a `git status` for a file that is sitting right there.
 *
 * `cause` is REQUIRED, on the same rule as `ReadOutcome`'s (shared/ipc-types) and
 * `PathProbe`'s: the dangerous default is absence, so absence must not be what a
 * forgetful producer falls into. `reason` is required too, null when there is
 * nothing to add.
 */
export type BgLibraryUnresolvedEntry = BgLibraryIndexEntry & {
  cause: BgUnresolvedCause;
  reason: string | null;
};

/**
 * Why a manifest entry has no bytes in memory. Three of the four are the read
 * layer's own verdicts, carried through unchanged rather than re-derived, because
 * the read is the only thing that knows which of them it was.
 *
 *   'absent'      nothing at the path. The clean-clone case, and the ONLY one for
 *                 which "not in this checkout" is a true sentence.
 *   'unreadable'  it is (or may be) there and the read failed: EACCES, EIO, ...
 *   'refused'     Aurora declined to resolve the path at all.
 *   'unusable'    the bytes were READ and could not be made into a background: a
 *                 layout too short to hold one row, or a body that did not parse.
 *                 Distinct from the three above because the file is not the
 *                 problem's location, its CONTENT is.
 */
export type BgUnresolvedCause = ReadFailureOutcome | 'unusable';

/**
 * THE ONE PLACE A CAUSE BECOMES WORDS FOR A PERSON — a short clause meant to sit
 * after a background's name in the open toast (renderer/state/aeon-open.ts):
 * "In-game forest (not in this checkout)".
 *
 * Here, beside the union, because a `switch` with no default is what makes a FIFTH
 * cause a compile error rather than a name rendered with no explanation. And short,
 * deliberately: the toast names up to a few entries and the per-file reason is on
 * the console (`readFailureMessage`, via the loader's warn), which is where a long
 * errno belongs.
 *
 * 'not in this checkout' survives, unchanged, for 'absent' alone. That was always
 * the right sentence for the clean-clone case the toast was written for; the defect
 * was applying it to the whole list.
 */
export function bgUnresolvedCauseText(cause: BgUnresolvedCause): string {
  switch (cause) {
    case 'absent': return 'not in this checkout';
    // IT IS (OR MAY BE) THERE. Never the checkout sentence: this is the case that
    // sent an author looking for a file that had not moved.
    case 'unreadable': return 'on disk, could not be read';
    case 'refused': return 'Aurora refused to read the path';
    // Read fine, and not a background: too short to hold a row, or would not
    // decode. The repair is in the file, not in the checkout.
    case 'unusable': return 'on disk, not usable as a background';
  }
}

/**
 * The index to WRITE, given what loaded and what did not.
 *
 * A SAVE MUST NOT NARROW THE MANIFEST TO WHAT IT COULD READ. The save path used
 * to emit `serializeBgLibraryIndex(project.bgLibrary)` — the entries that
 * resolved — which on a checkout missing every body means the next save
 * rewrites a 17-name manifest as the one background the author just made, and
 * sixteen names are gone from the tracked file while their (untracked, present
 * on SOMEONE's disk) bodies survive as orphans nothing points at. That is the
 * same erasure shape as the section-meta sidecars: a reader that could not
 * understand a file must never become a writer that replaces it.
 *
 * ORDER: unresolved first, in manifest order, then the loaded entries not
 * already named. On a checkout where nothing resolved this reproduces the
 * manifest byte for byte (no spurious diff); on one where everything resolved
 * `unresolved` is empty and this is the old behaviour exactly. A MIXED
 * checkout does reorder the file — the two groups separate — which is a
 * cosmetic diff and strictly better than the name loss it replaces.
 *
 * An id present in BOTH wins as the loaded entry: an entry that was unresolved
 * and has since been re-authored under the same id has real bytes now, and its
 * name is the newer fact.
 */
export function mergeBgLibraryIndex(
  library: readonly BgLibraryIndexEntry[],
  // The INDEX shape, not `BgLibraryUnresolvedEntry`: this function re-emits names,
  // and WHY an entry did not resolve is none of the manifest's business. Asking for
  // less than the caller has is what keeps `cause` out of the written file — and
  // keeps a caller that only has id and name (this module's own tests) able to ask.
  unresolved: readonly BgLibraryIndexEntry[],
): BgLibraryIndexEntry[] {
  const loaded = new Map(library.map((e) => [e.id, e]));
  const out: BgLibraryIndexEntry[] = [];
  const seen = new Set<string>();
  for (const u of unresolved) {
    if (seen.has(u.id)) continue;
    seen.add(u.id);
    out.push(loaded.get(u.id) ?? { id: u.id, name: u.name });
  }
  for (const e of library) {
    if (seen.has(e.id)) continue;
    seen.add(e.id);
    out.push({ id: e.id, name: e.name });
  }
  return out;
}

/**
 * The ref a section carries that NOTHING IN THE LIBRARY ANSWERS, or null.
 *
 * `null` in, `null` out — a section on the act default is not dangling, it is
 * deliberately unbound, and the two must never render the same way. What this
 * separates is the third state the editor used to collapse into the second:
 * a section that DOES name a background, whose entry is absent. Every surface
 * that resolves a ref falls back to the act default when the lookup misses,
 * and the fallback is correct — the author must keep working — but silent, so
 * the picture on screen and the sidecar on disk disagree with nothing saying so.
 */
export function danglingBgRef(
  ref: string | null,
  library: readonly { readonly id: string }[],
): string | null {
  if (ref === null) return null;
  return library.some((b) => b.id === ref) ? null : ref;
}
