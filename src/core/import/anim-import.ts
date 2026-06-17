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
  const clean = text.split('\n').map((l) => l.replace(/;.*$/, '').trim());

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
