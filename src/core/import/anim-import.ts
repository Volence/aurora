/**
 * Parse an engine character animation script (e.g. data/animations/sonic_anims.asm)
 * into named animations the editor can play. Handles the per-anim duration form:
 *   <Table>:  dc.w <Anim>-<Table> …            (ordered offset table)
 *   <Anim>:   dc.b <duration>                  (number, $hex, or DUR_DYNAMIC)
 *             dc.b frame, frame, …             (decimal or $hex frame indices)
 *             dc.b AF_END | AF_BACK,n | …      (control)
 * Comments (`;…`) and `align`/assertion lines are ignored. Best-effort: unknown
 * tokens are skipped rather than throwing.
 */

export type ParsedControl =
  | { kind: 'loop' }
  | { kind: 'back'; count: number }
  | { kind: 'change'; animId: number }
  | { kind: 'routine' }
  | { kind: 'delete' }
  | { kind: 'reset' } // S1 afReset $FB: restart script + clear 2nd routine
  | { kind: 'secondRoutine' } // S1 af2ndRoutine $FA: ob2ndRout += 2
  | null;

/**
 * One frame reference in an animation script. `index` is the mapping-frame
 * index; `xFlip`/`yFlip` are the classic per-frame flip flags (S1 frame bytes
 * carry bits 0–4 = frame, $20 = aniXFlip, $40 = aniYFlip — `_Constants.asm`
 * 312-313, applied by `Anim_SetFrameAndFlipFlags` via `andi.b #$1F` + rol/eor
 * into obRender). Dialects without per-frame flips emit false/false.
 */
export interface AnimFrame { index: number; xFlip: boolean; yFlip: boolean; }

const frame = (index: number, xFlip = false, yFlip = false): AnimFrame => ({ index, xFlip, yFlip });

export interface ParsedAnim {
  name: string;
  /** Per-animation hold, or 'dynamic' for DUR_DYNAMIC (speed-scaled in-game). */
  duration: number | 'dynamic';
  frames: AnimFrame[]; // mapping-frame references (index + flips)
  control: ParsedControl;
}

function parseNum(tok: string): number | null {
  if (/^\$[0-9A-Fa-f]+$/.test(tok)) return parseInt(tok.slice(1), 16);
  if (/^\d+$/.test(tok)) return parseInt(tok, 10);
  return null;
}

const CONTROLS = new Set(['AF_END', 'AF_BACK', 'AF_CHANGE', 'AF_ROUTINE', 'AF_DELETE']);

export function parseCharacterAnims(text: string): ParsedAnim[] {
  const clean = text.split(/\r?\n/).map((l) => l.replace(/;.*$/, '').trim());

  // Find the table label: a `Label:` whose next dc.w references itself.
  let table = '';
  for (let i = 0; i < clean.length && !table; i++) {
    const m = clean[i].match(/^(\w+):$/);
    if (!m) continue;
    for (let j = i + 1; j < clean.length && j < i + 3; j++) {
      if (clean[j] === '') continue;
      const w = clean[j].match(/^dc\.w\s+\w+-(\w+)/);
      if (w && w[1] === m[1]) table = m[1];
      break;
    }
  }
  if (!table) return [];

  // Ordered animation labels from the offset table.
  const labels: string[] = [];
  let inTable = false;
  for (const l of clean) {
    if (l === `${table}:`) { inTable = true; continue; }
    if (!inTable) continue;
    const w = l.match(new RegExp(`^dc\\.w\\s+(\\w+)-${table}\\b`));
    if (w) labels.push(w[1]);
    else if (l !== '' && labels.length) break; // table ended
  }

  const anims: ParsedAnim[] = [];
  for (const label of labels) {
    const start = clean.indexOf(`${label}:`);
    if (start < 0) continue;
    const tokens: string[] = [];
    for (let i = start + 1; i < clean.length; i++) {
      const l = clean[i];
      if (l === '') continue;
      if (l.startsWith('dc.b')) tokens.push(...l.slice(4).split(',').map((s) => s.trim()).filter(Boolean));
      else break; // align / next label
    }
    if (tokens.length === 0) continue;

    const duration: number | 'dynamic' = tokens[0] === 'DUR_DYNAMIC' ? 'dynamic' : (parseNum(tokens[0]) ?? 0);
    const frames: AnimFrame[] = [];
    let control: ParsedControl = null;
    for (let i = 1; i < tokens.length; i++) {
      const t = tokens[i];
      const n = parseNum(t);
      if (n !== null) { frames.push(frame(n)); continue; }
      if (!CONTROLS.has(t)) continue; // skip event/unknown tokens (best-effort)
      if (t === 'AF_END') control = { kind: 'loop' };
      else if (t === 'AF_BACK') control = { kind: 'back', count: parseNum(tokens[i + 1] ?? '0') ?? 0 };
      else if (t === 'AF_CHANGE') control = { kind: 'change', animId: parseNum(tokens[i + 1] ?? '0') ?? 0 };
      else if (t === 'AF_ROUTINE') control = { kind: 'routine' };
      else if (t === 'AF_DELETE') control = { kind: 'delete' };
      break;
    }

    const name = label.startsWith(`${table}_`) ? label.slice(table.length + 1) : label;
    anims.push({ name, duration, frames, control });
  }
  return anims;
}

/**
 * Parse a CLASSIC Sonic 1/2/3K animation script (raw control bytes, not AF_* macros):
 *   <table>:  dc.w <Anim> - <Base> …          (ordered offset table)
 *   <Anim>:   dc.b <speed>, frame, frame, …, <control>[, arg]
 * Control bytes are $FA-$FF: $FF restart (loop), $FE n go back n frames, $FD n switch
 * to anim n, $FC next routine, $FB reset (treated as delete). Frame bytes are < $FA.
 * `duration` is the single per-anim speed. Best-effort; unknown tokens are skipped.
 */
export function parseSonicAnimScript(text: string): ParsedAnim[] {
  const clean = text.split(/\r?\n/).map((l) => l.replace(/;.*$/, '').trim());

  // Ordered anim labels from the `dc.w Label - Base` offset table (Base ignored).
  // The table may be preceded by its own label (e.g. `Ani_Foo:` then the dc.w rows),
  // so collect every offset-table entry and stop at the first dc.b data block — a
  // leading table label must NOT end the scan. (dc.w appears only in the table.)
  const order: string[] = [];
  for (const l of clean) {
    const m = l.match(/^dc\.w\s+(\w+)\s*-\s*\w+/);
    if (m) { order.push(m[1]); continue; }
    if (/(^|:\s*)dc\.b\b/.test(l)) break; // first data block ends the table
  }

  // Collect each label's dc.b byte list (label + dc.b may share a line).
  const blocks = new Map<string, number[]>();
  let cur: number[] | null = null;
  for (const l of clean) {
    if (l === '') continue;
    let body = l;
    const lm = l.match(/^(\w+):\s*(.*)$/);
    if (lm) { cur = []; blocks.set(lm[1], cur); body = lm[2]; }
    const dm = body.match(/^dc\.b\s+(.*)$/);
    if (dm && cur) {
      for (const tok of dm[1].split(',').map((s) => s.trim()).filter(Boolean)) {
        const n = parseNum(tok);
        if (n !== null) cur.push(n & 0xff);
      }
    }
  }

  const anims: ParsedAnim[] = [];
  for (const label of order) {
    const bytes = blocks.get(label);
    if (!bytes || bytes.length === 0) continue;
    const duration = bytes[0];
    const frames: AnimFrame[] = [];
    let control: ParsedControl = null;
    for (let i = 1; i < bytes.length; i++) {
      const b = bytes[i];
      if (b < 0xfa) { frames.push(frame(b)); continue; }
      if (b === 0xff) control = { kind: 'loop' };
      else if (b === 0xfe) control = { kind: 'back', count: bytes[i + 1] ?? 0 };
      else if (b === 0xfd) control = { kind: 'change', animId: bytes[i + 1] ?? 0 };
      else if (b === 0xfc) control = { kind: 'routine' };
      else control = { kind: 'delete' }; // $FB / $FA
      break;
    }
    anims.push({ name: label, duration, frames, control });
  }
  return anims;
}

// --- s1disasm dialect -------------------------------------------------------
//
// Grammar transcribed from the real `_anim/*.asm` files (48 non-Sonic files;
// `_anim/Sonic.asm` is a DIFFERENT language — `sonani` macro table, fr_* frame
// equates, negative duration mode markers, code-driven walk/run rotation — and
// is deliberately NOT handled here; see docs/reviews/2026-08-20-s1-animation-audit.md §1.4):
//
//   Ani_Hog:    dc.w .hog-Ani_Hog       ; word offset table — one entry per anim,
//               dc.w .fly1-Ani_Hog      ;   dot-LOCAL script labels, no spaces
//   .hog:       dc.b 9                  ; first byte: hold duration
//               dc.b 0, 0, 2|aniXFlip   ; frame bytes: bits 0-4 index, $20/$40 flips
//               dc.b afEnd              ; symbolic control terminator
//               even
//
// Control codes are ALWAYS symbolic in source; their values come from
// `_Constants.asm:305-310` ($FF afEnd … $FA af2ndRoutine) and $20/$40 flips
// from `_Constants.asm:312-313` — hardcoded here, verified against the tree.
// Flip expressions are exactly `N`, `$N`, `N|aniXFlip`, `N|aniYFlip`,
// `N|aniXFlip|aniYFlip` (the only forms in the 48 files) — no general
// expression evaluator.

const S1_CONTROLS: Record<string, number> = {
  afEnd: 0xff, // restart script (loop)
  afBack: 0xfe, // + count arg: step back N script bytes
  afChange: 0xfd, // + anim-id arg
  afRoutine: 0xfc, // obRoutine += 2
  afReset: 0xfb, // restart + clear ob2ndRout
  af2ndRoutine: 0xfa, // ob2ndRout += 2
};
const S1_FLIPS: Record<string, number> = { aniXFlip: 0x20, aniYFlip: 0x40 };

/** Evaluate one s1disasm dc.b token to a byte, or null if it isn't this dialect. */
function parseS1Token(tok: string): number | null {
  const direct = parseNum(tok);
  if (direct !== null) return direct & 0xff;
  if (tok in S1_CONTROLS) return S1_CONTROLS[tok];
  // N|aniXFlip[|aniYFlip] — numeric head, flip-name tail, any order of flips.
  const parts = tok.split('|').map((s) => s.trim());
  if (parts.length < 2) return null;
  const head = parseNum(parts[0]);
  if (head === null) return null;
  let b = head;
  for (const p of parts.slice(1)) {
    if (!(p in S1_FLIPS)) return null;
    b |= S1_FLIPS[p];
  }
  return b & 0xff;
}

export interface S1AnimParseResult {
  anims: ParsedAnim[];
  /**
   * Anything the grammar could not account for, named. NEVER silently dropped:
   * the shipped bug this parser replaces was symbolic bytes (afEnd, 2|aniXFlip)
   * parsing to null and vanishing, which truncated or emptied every script.
   * Callers that care about fidelity (the sweep test) assert this is empty.
   */
  problems: string[];
}

/**
 * Parse an s1disasm `_anim/*.asm` animation script file. Returns every
 * animation in offset-table order (anim id = array index, duplicates kept —
 * the engine indexes the table, so two entries to one script are two anims).
 */
export function parseS1DisasmAnimScript(text: string): S1AnimParseResult {
  const problems: string[] = [];
  const clean = text.split(/\r?\n/).map((l) => l.replace(/;.*$/, '').trim());

  // Offset table: collect every `dc.w <label>-<base>` operand. The table label
  // shares its line with the first entry (`Ani_Hog:\tdc.w .hog-Ani_Hog`), and
  // dc.w appears nowhere else in these files. Labels may be dot-local.
  const LABEL = /^([A-Za-z_.][A-Za-z0-9_.]*):\s*(.*)$/;
  let base = '';
  const order: string[] = [];
  for (const raw of clean) {
    const lm = raw.match(LABEL);
    const body = lm ? lm[2] : raw;
    const wm = body.match(/^dc\.w\s+(.*)$/);
    if (!wm) continue;
    for (const tok of wm[1].split(',').map((s) => s.trim()).filter(Boolean)) {
      const em = tok.match(/^([A-Za-z_.][A-Za-z0-9_.]*)\s*-\s*([A-Za-z_][A-Za-z0-9_]*)$/);
      if (!em) { problems.push(`offset-table entry not <label>-<base>: "${tok}"`); continue; }
      if (!base) base = em[2];
      else if (em[2] !== base) problems.push(`offset entry "${tok}" subtracts ${em[2]}, table base is ${base}`);
      order.push(em[1]);
    }
  }
  if (order.length === 0) { problems.push('no dc.w offset table found'); return { anims: [], problems }; }

  // Script blocks: label → evaluated byte list. `even` ends nothing (blocks are
  // delimited by the next label); unknown tokens are recorded, never dropped.
  const blocks = new Map<string, number[]>();
  let cur: number[] | null = null;
  let curLabel = '';
  for (const raw of clean) {
    if (raw === '' || raw === 'even') continue;
    const lm = raw.match(LABEL);
    let body = raw;
    if (lm) { curLabel = lm[1]; cur = []; blocks.set(curLabel, cur); body = lm[2]; }
    const bm = body.match(/^dc\.b\s+(.*)$/);
    if (!bm || !cur) continue;
    for (const tok of bm[1].split(',').map((s) => s.trim()).filter(Boolean)) {
      const b = parseS1Token(tok);
      if (b === null) { problems.push(`${curLabel}: unrecognized dc.b token "${tok}"`); continue; }
      cur.push(b);
    }
  }

  const anims: ParsedAnim[] = [];
  for (const label of order) {
    const bytes = blocks.get(label);
    if (!bytes || bytes.length === 0) { problems.push(`offset table names "${label}" but no script block found`); continue; }
    const duration = bytes[0];
    if (duration >= 0x80) problems.push(`${label}: duration byte $${duration.toString(16)} is negative (Sonic-dialect mode marker?)`);
    const frames: AnimFrame[] = [];
    let control: ParsedControl = null;
    for (let i = 1; i < bytes.length; i++) {
      const b = bytes[i];
      if (b < 0x80) { // frame byte: bits 0-4 index, $20/$40 flips (Anim_SetFrameAndFlipFlags)
        frames.push(frame(b & 0x1f, (b & 0x20) !== 0, (b & 0x40) !== 0));
        continue;
      }
      if (b === 0xff) control = { kind: 'loop' };
      else if (b === 0xfe) control = { kind: 'back', count: bytes[i + 1] ?? 0 };
      else if (b === 0xfd) control = { kind: 'change', animId: bytes[i + 1] ?? 0 };
      else if (b === 0xfc) control = { kind: 'routine' };
      else if (b === 0xfb) control = { kind: 'reset' };
      else if (b === 0xfa) control = { kind: 'secondRoutine' };
      else { // $80–$F9: engine-silent no-op (falls through to Anim_End rts) — surface it
        problems.push(`${label}: byte $${b.toString(16)} in frame position is an engine no-op`);
        continue;
      }
      break; // control terminates the script
    }
    anims.push({ name: label.replace(/^\./, ''), duration, frames, control });
  }
  return { anims, problems };
}

/** Load any animation-script dialect: classic ($FF/$FE raw bytes), s1disasm
 *  (dot-local labels + symbolic af-constant / aniXFlip tokens), or S4 (AF_*). */
export function parseAnyAnimScript(text: string): ParsedAnim[] {
  const classic = parseSonicAnimScript(text);
  if (classic.length) return classic;
  const s1 = parseS1DisasmAnimScript(text);
  if (s1.anims.length) return s1.anims;
  return parseCharacterAnims(text);
}
