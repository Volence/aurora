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

/**
 * The warning a person sees before their first edit to palette line 0, in the
 * owner's spirit ("heyy just sayying this changes everything"): plain, first,
 * and about the blast radius, not the mechanism.
 *
 * Every figure in it is derived: the path is the one the load read, the list
 * and its population come from `scan`, and the live-push range is the push
 * module's own constants.
 */
export function sharedLine0Warning(path: string, scan: EmbedScan): { title: string; body: string } {
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

  parts.push(
    `A running game will not show a line 0 edit until it is rebuilt: Aurora pushes only lines `
    + `${PAL_BASE_FIRST_LINE} to ${PAL_BASE_LAST_LINE} live.`,
    'You will not be asked again while this project stays open.',
  );
  return { title: 'Palette line 0 is Sonic and Tails, in every zone', body: parts.join('\n\n') };
}
