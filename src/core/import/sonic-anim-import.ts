// `_anim/Sonic.asm` — the sonani dialect parser. Sonic's animation file is a
// DIFFERENT language from the 48 other `_anim/*.asm` scripts (audit
// docs/reviews/2026-08-20-s1-animation-audit.md §1.4), and the general
// s1disasm parser (anim-import.ts parseS1DisasmAnimScript) deliberately
// refuses it. What differs, and what this parser handles:
//
//   1. fr_* FRAME EQUATES (`fr_Walk13: equ 8` … lines 5-93): script frame
//      bytes are symbolic. Sonic's own interpreter writes the byte UNMASKED
//      (no $1F mask, no $20/$40 flip bits — he has up to $57 mapping frames),
//      so frame bytes here resolve to plain indices with no flip channel.
//   2. The OFFSET TABLE is built by the file-local `sonani` macro: each
//      `id_X:  sonani  SonAni_Y` row emits both the `dc.w` entry and an id_*
//      equate (= its table index). Table order IS the animation id; the entry
//      count is derived from the rows, never a constant.
//   3. SPECIAL SCRIPTS: a NEGATIVE first byte is a MODE MARKER, not a hold
//      time — $FF walk/run, $FE roll, $FD push — handled by Sonic_Animate's
//      `.walkrunroll` code path (`_incObj/01 Sonic.asm:2176`). These surface
//      as `special` with `duration: null`; mangling them into fake durations
//      is exactly what this parser exists to avoid.
//   4. Regular scripts use afEnd/afBack/afChange (Sonic's handler implements
//      ONLY $FF/$FE/$FD — audit §1.4 point 4); afChange arguments are id_*
//      labels resolved through the table.
//
// The confirmed runtime semantics for the special scripts live in
// core/anim/sonic-animate.ts (study: docs/reviews/2026-08-21-sonic-animate-
// live-study.md); this module only produces honest bytes for it.

import type { ParsedControl } from './anim-import';
import type { SonicSpecialMode, SonicSpecialScripts } from '../anim/sonic-animate';

export interface SonicAnimEntry {
  /** Table index — the engine's animation id (obAnim value). */
  id: number;
  /** The sonani row's id_* label (e.g. `id_Walk`). */
  idLabel: string;
  /** Display name: the id label minus its `id_` prefix. */
  name: string;
  /** The script block label the row points at (e.g. `SonAni_Walk`). */
  scriptLabel: string;
  /** Every resolved dc.b byte of the script, in file order (marker/duration
   *  first, terminator included) — the round-trip surface. */
  bytes: number[];
  /** Mode for the five negative-first-byte scripts; null for regular ones. */
  special: SonicSpecialMode | null;
  /** Regular scripts: the raw hold byte N (engine holds N+1 ticks). null for
   *  special scripts — their cadence is inertia-computed, not stored. */
  duration: number | null;
  /** Frame ids up to the first control byte (unmasked — no flip channel in
   *  this dialect). For special scripts these are the 6 padded body frames
   *  minus padding afEnds. */
  frames: number[];
  /** Regular scripts: the terminating control. null for special scripts. */
  control: ParsedControl;
}

export interface SonicAnimParse {
  entries: SonicAnimEntry[];
  /** fr_* name → frame index, as equated in the file. */
  equates: Record<string, number>;
  /** id_* label → table index (afChange argument resolution). */
  idIndex: Record<string, number>;
  /** Anything the dialect could not account for, named — never dropped. */
  problems: string[];
}

/** First-byte mode markers (audit §1.4.3 / Sonic_Animate `.walkrunroll`). */
const SPECIAL_MODES: Record<number, SonicSpecialMode> = {
  0xff: 'walkrun', // SonAni_Walk / SonAni_Run — selected by |inertia| at $600
  0xfe: 'roll',    // SonAni_Roll / SonAni_Roll2 — same selection, $400 base
  0xfd: 'push',    // SonAni_Push
};

/** Control codes: symbolic in source; values per _Constants.asm:305-310.
 *  Sonic's handler implements only these three (audit §1.4 point 4). */
const AF: Record<string, number> = { afEnd: 0xff, afBack: 0xfe, afChange: 0xfd };

function parseNum(tok: string): number | null {
  if (/^\$[0-9A-Fa-f]+$/.test(tok)) return parseInt(tok.slice(1), 16);
  if (/^\d+$/.test(tok)) return parseInt(tok, 10);
  return null;
}

/**
 * Parse `_anim/Sonic.asm`. Returns every animation in sonani-table order with
 * fully resolved bytes; anything outside the dialect lands in `problems`.
 */
export function parseSonicAnimTable(text: string): SonicAnimParse {
  const problems: string[] = [];
  const raw = text.split(/\r?\n/).map((l) => l.replace(/;.*$/, '').trimEnd());

  // Drop macro DEFINITION bodies (`sonani: macro … endm`) — their `dc.w` /
  // `label` lines are template text, not data.
  const lines: string[] = [];
  let inMacro = false;
  for (const l of raw) {
    const t = l.trim();
    if (/^\w+:?\s+macro\b/.test(t)) { inMacro = true; continue; }
    if (inMacro) { if (/^endm\b/.test(t)) inMacro = false; continue; }
    lines.push(l);
  }

  // fr_* (and any other) equates.
  const equates: Record<string, number> = {};
  for (const l of lines) {
    const m = l.trim().match(/^(\w+):\s*equ\s+(\S+)$/);
    if (!m) continue;
    const v = parseNum(m[2]);
    if (v === null) { problems.push(`equate ${m[1]}: unparseable value "${m[2]}"`); continue; }
    equates[m[1]] = v;
  }

  // sonani table rows, in order. The entry count is DERIVED from these rows.
  const tableRows: { idLabel: string; scriptLabel: string }[] = [];
  const idIndex: Record<string, number> = {};
  for (const l of lines) {
    const m = l.trim().match(/^(\w+):\s*sonani\s+(\w+)\s*$/);
    if (!m) continue;
    idIndex[m[1]] = tableRows.length;
    tableRows.push({ idLabel: m[1], scriptLabel: m[2] });
  }
  if (tableRows.length === 0) {
    problems.push('no sonani table rows found — not the Sonic dialect');
    return { entries: [], equates, idIndex, problems };
  }

  // Script blocks: label → resolved dc.b bytes. Labels may share the line with
  // their first dc.b (`SonAni_Walk:\tdc.b $FF`); `even` is a no-op delimiter.
  const resolveTok = (label: string, tok: string): number | null => {
    const n = parseNum(tok);
    if (n !== null) return n & 0xff;
    if (tok in AF) return AF[tok];
    if (tok in equates) return equates[tok] & 0xff;
    if (tok in idIndex) return idIndex[tok] & 0xff;
    problems.push(`${label}: unrecognized dc.b token "${tok}"`);
    return null;
  };
  const blocks = new Map<string, number[]>();
  let cur: number[] | null = null;
  let curLabel = '';
  for (const l of lines) {
    const t = l.trim();
    if (t === '' || t === 'even') continue;
    let body = t;
    const lm = t.match(/^(\w+):\s*(.*)$/);
    if (lm) {
      if (/^(equ|sonani|label)\b/.test(lm[2])) continue; // equates/table rows, not scripts
      curLabel = lm[1]; cur = []; blocks.set(curLabel, cur); body = lm[2];
    }
    const bm = body.match(/^dc\.b\s+(.*)$/);
    if (!bm || !cur) continue;
    for (const tok of bm[1].split(',').map((s) => s.trim()).filter(Boolean)) {
      const b = resolveTok(curLabel, tok);
      if (b !== null) cur.push(b);
    }
  }

  // Assemble entries in table order.
  const entries: SonicAnimEntry[] = [];
  for (let id = 0; id < tableRows.length; id++) {
    const { idLabel, scriptLabel } = tableRows[id];
    const bytes = blocks.get(scriptLabel);
    if (!bytes || bytes.length === 0) {
      problems.push(`table row ${idLabel} names "${scriptLabel}" but no script block found`);
      continue;
    }
    const name = idLabel.replace(/^id_/, '');
    const first = bytes[0];

    if (first >= 0x80) {
      // Special script: the first byte is a MODE MARKER (never a duration).
      const special = SPECIAL_MODES[first];
      if (!special) {
        problems.push(`${scriptLabel}: first byte $${first.toString(16)} is negative but not a known mode marker ($FF/$FE/$FD)`);
        entries.push({ id, idLabel, name, scriptLabel, bytes, special: null, duration: null, frames: [], control: null });
        continue;
      }
      const body = bytes.slice(1);
      // The padding contract Sonic_Animate relies on when switching variants
      // without resetting the position: exactly 6 body bytes + afEnd, every
      // body byte a frame or a padding afEnd (file's own "Special animations"
      // comment; interpreter safety in core/anim/sonic-animate.ts).
      if (body.length !== 7 || body[6] !== 0xff) {
        problems.push(`${scriptLabel}: special script body is not 6 bytes + afEnd (got ${body.length} bytes)`);
      }
      for (const b of body) {
        if (b >= 0x80 && b !== 0xff) problems.push(`${scriptLabel}: byte $${b.toString(16)} in a special body (only frames and afEnd occur)`);
      }
      const frames: number[] = [];
      for (const b of body) { if (b < 0x80) frames.push(b); else break; }
      entries.push({ id, idLabel, name, scriptLabel, bytes, special, duration: null, frames, control: null });
      continue;
    }

    // Regular script: raw duration byte + frames + control terminator.
    const frames: number[] = [];
    let control: ParsedControl = null;
    for (let i = 1; i < bytes.length; i++) {
      const b = bytes[i];
      if (b < 0x80) { frames.push(b); continue; } // unmasked — no flip bits in this dialect
      if (b === 0xff) control = { kind: 'loop' };
      else if (b === 0xfe) control = { kind: 'back', count: bytes[i + 1] ?? 0 };
      else if (b === 0xfd) control = { kind: 'change', animId: bytes[i + 1] ?? 0 };
      else problems.push(`${scriptLabel}: control byte $${b.toString(16)} — Sonic's handler implements only $FF/$FE/$FD`);
      break;
    }
    if (control === null) problems.push(`${scriptLabel}: no control terminator found`);
    entries.push({ id, idLabel, name, scriptLabel, bytes, special: null, duration: first, frames, control });
  }

  return { entries, equates, idIndex, problems };
}

/** The five special script LABELS the engine hardcodes (`lea (SonAni_*)`). */
const SPECIAL_LABELS = ['SonAni_Walk', 'SonAni_Run', 'SonAni_Roll', 'SonAni_Roll2', 'SonAni_Push'] as const;

/**
 * Pull the interpreter's five script bodies out of a parse, keyed exactly the
 * way Sonic_Animate binds them (by label, not by table position). Returns null
 * — loudly, via the parse's problems — when any is missing or malformed.
 */
export function sonicSpecialScripts(parse: SonicAnimParse): SonicSpecialScripts | null {
  const byLabel = new Map(parse.entries.map((e) => [e.scriptLabel, e]));
  const bodies: number[][] = [];
  for (const label of SPECIAL_LABELS) {
    const e = byLabel.get(label);
    if (!e || e.special === null || e.bytes.length !== 8) return null;
    bodies.push(e.bytes.slice(1));
  }
  const [walk, run, roll, roll2, push] = bodies;
  return { walk, run, roll, roll2, push };
}
