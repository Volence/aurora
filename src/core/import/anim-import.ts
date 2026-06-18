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
  | null;

export interface ParsedAnim {
  name: string;
  /** Per-animation hold, or 'dynamic' for DUR_DYNAMIC (speed-scaled in-game). */
  duration: number | 'dynamic';
  frames: number[]; // mapping-frame indices
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
    const frames: number[] = [];
    let control: ParsedControl = null;
    for (let i = 1; i < tokens.length; i++) {
      const t = tokens[i];
      const n = parseNum(t);
      if (n !== null) { frames.push(n); continue; }
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
  const order: string[] = [];
  for (const l of clean) {
    const m = l.match(/^dc\.w\s+(\w+)\s*-\s*\w+/);
    if (m) order.push(m[1]);
    else if (/^\w+:/.test(l)) break; // first labeled data block ends the table
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
    const frames: number[] = [];
    let control: ParsedControl = null;
    for (let i = 1; i < bytes.length; i++) {
      const b = bytes[i];
      if (b < 0xfa) { frames.push(b); continue; }
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

/** Load either animation-script dialect: classic ($FF/$FE) or S4-engine (AF_*). */
export function parseAnyAnimScript(text: string): ParsedAnim[] {
  const classic = parseSonicAnimScript(text);
  if (classic.length) return classic;
  return parseCharacterAnims(text);
}
