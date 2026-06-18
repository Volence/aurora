import type { SpriteFrame, SpritePiece } from '../model/sprite-types';

/**
 * Parse a Sonic-disassembly sprite mapping / DPLC `.asm` file by reading its macro
 * CALL-SITES (not by assembling). A frame is a `spriteHeader` block of `spritePiece`
 * calls; the macro arguments ARE the logical model and their order is identical
 * across S1/S2/S3K, so this is version-agnostic — it never touches byte layout.
 * Frame order follows the `mappingsTable` (so duplicate table entries are honored);
 * if there is no table, block-definition order is used.
 *
 * Files that store mappings as raw `dc.b`/`dc.w` (no `spritePiece` macros) have no
 * call-sites to read and parse to an empty list — the caller falls back to the
 * binary path. See docs/specs/2026-06-17-multi-game-sprite-ui-phase6-design.md §3 (6b).
 */

interface ParsedLine { label: string | null; op: string | null; args: string[]; }

function parseLine(raw: string): ParsedLine | null {
  const noComment = raw.split(';')[0];
  if (noComment.trim() === '') return null;
  let label: string | null = null;
  let body = noComment;
  if (/^\S/.test(noComment)) {
    // Column-0 token is a label (possibly followed by a macro on the same line).
    const wsIdx = noComment.search(/\s/);
    const head = wsIdx === -1 ? noComment : noComment.slice(0, wsIdx);
    label = head.replace(/:$/, '');
    body = wsIdx === -1 ? '' : noComment.slice(wsIdx);
  }
  body = body.trim();
  if (body === '') return { label, op: null, args: [] };
  const opIdx = body.search(/\s/);
  const op = opIdx === -1 ? body : body.slice(0, opIdx);
  const argStr = opIdx === -1 ? '' : body.slice(opIdx).trim();
  const args = argStr === '' ? [] : argStr.split(',').map((a) => a.trim());
  return { label, op, args };
}

/** Evaluate a 68k operand literal: optional leading `-`, then `$hex` or decimal. */
function evalOperand(token: string): number {
  let t = token.trim();
  let neg = false;
  if (t.startsWith('-')) { neg = true; t = t.slice(1).trim(); }
  const val = t.startsWith('$') ? parseInt(t.slice(1), 16) : parseInt(t, 10);
  if (!Number.isFinite(val)) throw new Error(`asm operand "${token}" is not a numeric literal`);
  return neg ? -val : val;
}

/** Collect macro blocks keyed by label, plus the mappingsTable's label order. */
function collectBlocks(text: string, headerOp: string, entryOp: string): { order: string[]; blocks: Map<string, string[][]> } {
  const tableLabels: string[] = [];
  const blocks = new Map<string, string[][]>();
  const blockOrder: string[] = [];
  let cur: { label: string | null; entries: string[][] } | null = null;

  for (const raw of text.split(/\r?\n/)) {
    const line = parseLine(raw);
    if (!line) continue;
    const base = line.op ? line.op.split('.')[0] : null;
    if (base === 'mappingsTableEntry') {
      if (line.args[0]) tableLabels.push(line.args[0]);
    } else if (base === headerOp) {
      cur = { label: line.label, entries: [] };
      if (line.label) { blocks.set(line.label, cur.entries); blockOrder.push(line.label); }
    } else if (base === entryOp) {
      if (cur) cur.entries.push(line.args);
    } else if (line.label && cur && line.label === `${cur.label}_End`) {
      cur = null;
    }
  }
  return { order: tableLabels.length ? tableLabels : blockOrder, blocks };
}

export function parseAsmMappings(text: string): SpriteFrame[] {
  const { order, blocks } = collectBlocks(text, 'spriteHeader', 'spritePiece');
  if (blocks.size === 0) return [];
  return order.map((label, i) => {
    const raws = blocks.get(label) ?? [];
    const pieces: SpritePiece[] = raws.map((a) => {
      // spritePiece / spritePiece2P: xpos,ypos,width,height,tile,xflip,yflip,pal,pri[,2P...]
      const [xpos, ypos, width, height, tile, xflip, yflip, pal, pri] = a.map(evalOperand);
      return {
        xOffset: xpos, yOffset: ypos, widthCells: width, heightCells: height,
        tile, palette: pal & 3, priority: !!pri, xFlip: !!xflip, yFlip: !!yflip,
      };
    });
    return { id: `f${i}`, pieces };
  });
}

export function parseAsmDPLC(text: string): number[][] {
  const { order, blocks } = collectBlocks(text, 'dplcHeader', 'dplcEntry');
  if (blocks.size === 0) return [];
  return order.map((label) => {
    const raws = blocks.get(label) ?? [];
    const tiles: number[] = [];
    for (const a of raws) {
      // dplcEntry tiles,offset
      const count = evalOperand(a[0]);
      const offset = evalOperand(a[1]);
      for (let t = 0; t < count; t++) tiles.push(offset + t);
    }
    return tiles;
  });
}
