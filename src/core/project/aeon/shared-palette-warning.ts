// WHAT ELSE TAKES ITS COLOURS FROM THE SHARED PLAYER PALETTE, DERIVED AT
// WARNING TIME, and the warning that says so.
//
// ═══ WHY DERIVED, AND WHY NOT A LIST ══════════════════════════════════════
//
// The owner's card for this ruling named two things that embed the shared
// player palette besides Sonic and Tails: OJZ act 1's background palette and
// the spring object. At aeon ad51e3f0 there were THREE: Knuckles' character
// data embeds it too (knuckles_data.emp:73, the `Pal_SonicTails` Sonic and
// Tails point their `cd_palette` at). A list copied into this repository would
// have been wrong on the day it was written, and would rot on aeon's clock
// rather than ours. So the list is searched for, in the open project's own
// sources, when the warning is about to be shown.
//
// ═══ WHAT IS SEARCHED, SAID OUT LOUD ══════════════════════════════════════
//
// `embed("<path>")` in `.emp` sources, with `<path>` exactly the file the load
// read (so the `sonic.bin` fallback finds what embeds `sonic.bin`, not what
// embeds its sibling). Comments do not count. Python generators that READ the
// file to produce art are not searched: they change nothing until re-run, and
// the warning's sentence names its population so it never implies they were.
//
// ═══ LOUD ON UNMEASURABLE ═════════════════════════════════════════════════
//
// "I could not look" must never render as "I looked and there is nothing". A
// scan that could not list or read the sources is `unmeasurable` and the
// warning says it could NOT check, with no list at all; a scan that looked at
// zero files is unmeasurable too (an aeon project has sources, so zero means
// the search went wrong, not that nothing embeds the file); and a scan that
// could read only some of them says the list may be missing entries.
//
// ═══ THE SPRING'S CHARACTER-SWAP CHECK, NAMED WHEN THE PROJECT HAS IT ═════
//
// Hub ruling 2026-09-14T00:24:36Z (empyrean docs/OVERSEER.md, carried by
// empyrean 8a7476f), verbatim in part: "the top-row save warning ALSO names
// aeon's `tools/spring_line0_gate.py`. That gate checks the spring's seven
// colour slots render the same as Sonic and as Knuckles, deriving from
// `SonicAndTails.bin` and `knuckles.bin`, so an edit there makes the spring
// change colour on a character swap and turns the gate red until the Knuckles
// palette matches. A warning that omits the one consequence that fails a build
// is incomplete." Wording is Aurora's; WHAT is listed is the hub's.
//
// The gate's PATH is the one fixed thing here, because the ruling names that
// file. Everything else is derived the way the embed list is, at warning time,
// from the open project: whether the project HAS the file (the same
// `listProjectSources` listing, asked for the file's own extension), whether
// it reads the file this edit changes (a quoted literal equal to the resolved
// path, so the `sonic.bin` fallback does not name a check that reads its
// sibling, the embed search's own precedent), and which other palette it
// compares against (its other quoted literals in the same folder). The
// spring's colour indices are NOT restated: the gate takes them from a nibble
// histogram of its art file, and Aurora does not repeat that derivation.
// "Could not look" says so, on the embed list's convention, without naming a
// file the project may not have.

import type { SourceListing } from '../../../shared/ipc-types';
import { PAL_BASE_FIRST_LINE, PAL_BASE_LAST_LINE } from '../../aether/palette-push';

/** The source files searched for `embed(...)`: aeon's language. */
export const EMBED_SOURCE_EXTENSION = '.emp';

/** One place a source file embeds the shared player palette. */
export interface EmbedSite {
  /** Project-relative path of the source file. */
  path: string;
  /** 1-based line of the `embed(...)`. */
  line: number;
  /** The name declared on that line (`BGND_Palette`), or null if none is. */
  name: string | null;
}

/** What a scan found. See the file header for why `unmeasurable` exists. */
export type EmbedScan =
  | {
    kind: 'measured';
    /** Source files actually read and searched. Always at least one. */
    searched: number;
    sites: EmbedSite[];
    /** Files or folders the scan could not read, each with its reason. */
    blind: string[];
    /** True when the listing stopped at its limit before seeing everything. */
    capped: boolean;
  }
  | { kind: 'unmeasurable'; reason: string };

/**
 * Blank out comments, keeping every newline so line numbers survive. Handles
 * `//` to end of line and `/* ... *\/` across lines, and ignores both inside a
 * double-quoted string, which is where an embed path lives.
 */
function withoutComments(text: string): string {
  let out = '';
  let inString = false;
  let inBlock = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    const next = text[i + 1];
    if (inBlock) {
      if (c === '*' && next === '/') { inBlock = false; out += '  '; i++; } else out += c === '\n' ? '\n' : ' ';
      continue;
    }
    if (inString) {
      out += c;
      if (c === '\\') { out += next ?? ''; i++; } else if (c === '"' || c === '\n') inString = false;
      continue;
    }
    if (c === '"') { inString = true; out += c; continue; }
    if (c === '/' && next === '/') {
      while (i < text.length && text[i] !== '\n') { out += ' '; i++; }
      if (i < text.length) out += '\n';
      continue;
    }
    if (c === '/' && next === '*') { inBlock = true; out += '  '; i++; continue; }
    out += c;
  }
  return out;
}

const EMBED_RE = /\bembed\(\s*"([^"]*)"\s*\)/g;
const DECL_RE = /\b(?:data|const|let|static)\s+([A-Za-z_][A-Za-z0-9_]*)/;

/** Every `embed("<target>")` in one source file, outside comments. */
export function findEmbedSites(path: string, text: string, target: string): EmbedSite[] {
  const sites: EmbedSite[] = [];
  const lines = withoutComments(text).split('\n');
  for (let i = 0; i < lines.length; i++) {
    for (const m of lines[i].matchAll(EMBED_RE)) {
      if (m[1] !== target) continue;
      sites.push({ path, line: i + 1, name: DECL_RE.exec(lines[i])?.[1] ?? null });
    }
  }
  return sites;
}

/** One file's read, as the scan needs it: its text, or why there is none. */
export interface SourceRead {
  path: string;
  text: string | null;
  reason: string | null;
}

/**
 * Search the project for what embeds `target`. The two I/O steps are injected,
 * so the whole decision (including every way it can be blind) runs in the node
 * suite; the renderer passes the IPC channels.
 */
export async function scanEmbeds(
  target: string,
  list: () => Promise<SourceListing>,
  readMany: (paths: string[]) => Promise<SourceRead[]>,
): Promise<EmbedScan> {
  let listing: SourceListing;
  try {
    listing = await list();
  } catch (e) {
    return { kind: 'unmeasurable', reason: `listing the project's sources failed: ${message(e)}` };
  }
  if (listing.files.length === 0) {
    return {
      kind: 'unmeasurable',
      reason: `no ${EMBED_SOURCE_EXTENSION} source files were found to search`
        + (listing.unreadable.length ? `, and ${listing.unreadable.length} folder(s) could not be read` : ''),
    };
  }
  let reads: SourceRead[];
  try {
    reads = await readMany(listing.files);
  } catch (e) {
    return { kind: 'unmeasurable', reason: `reading the project's sources failed: ${message(e)}` };
  }
  const blind = listing.unreadable.map((u) => `${u.path} (${u.reason})`);
  const sites: EmbedSite[] = [];
  let searched = 0;
  for (const r of reads) {
    if (r.text === null) { blind.push(`${r.path} (${r.reason ?? 'could not be read'})`); continue; }
    searched++;
    sites.push(...findEmbedSites(r.path, r.text, target));
  }
  if (searched === 0) {
    return { kind: 'unmeasurable', reason: `none of the ${listing.files.length} source files could be read` };
  }
  return { kind: 'measured', searched, sites, blind, capped: listing.capped };
}

function message(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

/** The project-relative path of aeon's spring character-swap check, as the
 *  hub's ruling names it (see the file header). The only fixed input. */
export const SPRING_LINE0_GATE_PATH = 'tools/spring_line0_gate.py';

/** The listing asked for the gate: its own extension, read off its path. */
export const SPRING_LINE0_GATE_EXTENSION = SPRING_LINE0_GATE_PATH.slice(SPRING_LINE0_GATE_PATH.lastIndexOf('.'));

/** What the search for the spring check found. See the file header. */
export type SpringGateScan =
  /** The project has the check and it reads the file being edited. */
  | { kind: 'present'; path: string; partners: string[] }
  /** A complete look, and the project has no such file. Nothing is said. */
  | { kind: 'absent' }
  /** The project has the file, but it never reads the file being edited. */
  | { kind: 'reads-other-file'; path: string }
  | { kind: 'unmeasurable'; reason: string };

const folderOf = (p: string): string => (p.includes('/') ? p.slice(0, p.lastIndexOf('/')) : '');

/**
 * The quoted path-like literals in a Python source, full-line `#` comments
 * skipped. A literal must be one token of path characters, so prose between
 * two apostrophes in a docstring ("the spring's ... character's") never reads
 * as a path.
 */
function quotedPathLiterals(text: string): Set<string> {
  const out = new Set<string>();
  for (const line of text.split('\n')) {
    if (line.trimStart().startsWith('#')) continue;
    for (const m of line.matchAll(/(["'])([A-Za-z0-9_./-]+)\1/g)) out.add(m[2]);
  }
  return out;
}

/**
 * Does the open project hold the spring check, and does it read `target`?
 * The same two injected I/O steps as `scanEmbeds`; the renderer passes the
 * same IPC channels, listing by the gate's own extension.
 */
export async function scanSpringGate(
  target: string,
  list: () => Promise<SourceListing>,
  readMany: (paths: string[]) => Promise<SourceRead[]>,
): Promise<SpringGateScan> {
  const path = SPRING_LINE0_GATE_PATH;
  let listing: SourceListing;
  try {
    listing = await list();
  } catch (e) {
    return { kind: 'unmeasurable', reason: `listing the project's ${SPRING_LINE0_GATE_EXTENSION} files failed: ${message(e)}` };
  }
  if (!listing.files.includes(path)) {
    // Absent is only a finding if nothing that could hold it went unread: an
    // unreadable folder ABOVE it, or a listing that stopped early, can hide it.
    // An unreadable folder elsewhere cannot, so it does not hedge the answer.
    const hiding = listing.unreadable.find((u) => u.path === '.' || path.startsWith(`${u.path}/`));
    if (hiding) return { kind: 'unmeasurable', reason: `the folder ${hiding.path} could not be read (${hiding.reason})` };
    if (listing.capped) return { kind: 'unmeasurable', reason: 'the file listing stopped at its limit' };
    return { kind: 'absent' };
  }
  let read: SourceRead | undefined;
  try {
    [read] = await readMany([path]);
  } catch (e) {
    return { kind: 'unmeasurable', reason: `${path} is in this project but could not be read: ${message(e)}` };
  }
  if (!read || read.text === null) {
    return { kind: 'unmeasurable', reason: `${path} is in this project but could not be read: ${read?.reason ?? 'no answer'}` };
  }
  const literals = quotedPathLiterals(read.text);
  if (!literals.has(target)) return { kind: 'reads-other-file', path };
  const partners = [...literals].filter((l) => l !== target && folderOf(l) === folderOf(target)).sort();
  return { kind: 'present', path, partners };
}

/** The gate's paragraph, or null when there is nothing to say. */
function springGateParagraph(gate: SpringGateScan): string | null {
  if (gate.kind === 'present') {
    const [first, ...rest] = gate.partners;
    const other = first === undefined
      ? 'another character\'s palette file'
      : rest.length === 0 ? first : `each of ${gate.partners.join(', ')}`;
    const matches = rest.length === 0 ? 'is changed to match' : 'are changed to match';
    return `This project's check ${gate.path} also reads this file. It makes sure the spring looks the `
      + 'same whichever character you play, so the colours the spring uses on this row must match the '
      + `same colours in ${other}. If you change one of the spring's colours here, the spring will `
      + `change colour when you switch character, and that check will fail until ${other} ${matches}.`;
  }
  if (gate.kind === 'unmeasurable') {
    return 'Aurora could NOT check whether one of this project\'s own checks compares this row with '
      + `another character's palette (${gate.reason}). Assume an edit here may make such a check fail.`;
  }
  return null;
}

/**
 * The warning a person sees before their first edit to palette line 0, in the
 * owner's spirit ("heyy just sayying this changes everything"): plain, first,
 * and about the blast radius, not the mechanism.
 *
 * Every figure in it is derived: the path is the one the load read, the list
 * and its population come from `scan`, the spring check's paragraph from
 * `gate` (required, so no caller can forget to look), and the live-push range
 * is the push module's own constants.
 */
export function sharedLine0Warning(
  path: string, scan: EmbedScan, gate: SpringGateScan,
): { title: string; body: string } {
  const parts: string[] = [];
  parts.push(
    'Heads up: this row is not this level\'s. Palette line 0 is Sonic and Tails, and it is read '
    + 'from one file the whole game shares:',
    path,
    'Saving an edit here rewrites that file, so the change reaches Sonic and Tails in EVERY zone, '
    + 'not just this one. There is no per-level copy of these colours; that needs engine support first.',
  );

  const embedded = `embed("${path}")`;
  if (scan.kind === 'unmeasurable') {
    parts.push(
      `Aurora could NOT check what else is built from this file (${scan.reason}), so it cannot `
      + 'list it. Assume more than Sonic and Tails may change.',
    );
  } else {
    const population = `${scan.searched} ${EMBED_SOURCE_EXTENSION} source file${scan.searched === 1 ? '' : 's'}`;
    if (scan.sites.length === 0) {
      parts.push(`Nothing else in this project embeds it: searched ${population} for ${embedded} and found none.`);
    } else {
      parts.push([
        `Also built from this file (searched ${population} for ${embedded}):`,
        // The name in parentheses: the dialog wraps long paths, and a bare name
        // pushed onto its own line reads as a separate item (seen in the capture).
        ...scan.sites.map((s) => `• ${s.path}:${s.line}${s.name ? ` (${s.name})` : ''}`),
      ].join('\n'));
    }
    if (scan.blind.length > 0 || scan.capped) {
      const why = [
        scan.blind.length > 0
          ? `could not read ${scan.blind.length} place${scan.blind.length === 1 ? '' : 's'} (first: ${scan.blind[0]})`
          : null,
        scan.capped ? 'stopped at its file limit' : null,
      ].filter((x): x is string => x !== null).join(' and ');
      parts.push(`The search ${why}, so this may not be everything.`);
    }
  }

  const gateParagraph = springGateParagraph(gate);
  if (gateParagraph !== null) parts.push(gateParagraph);

  parts.push(
    `A running game will not show a line 0 edit until it is rebuilt: Aurora pushes only lines `
    + `${PAL_BASE_FIRST_LINE} to ${PAL_BASE_LAST_LINE} live.`,
    'You will not be asked again while this project stays open.',
  );
  return { title: 'Palette line 0 is Sonic and Tails, in every zone', body: parts.join('\n\n') };
}
