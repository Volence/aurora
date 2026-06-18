import type { SpriteFrame, SpritePiece } from '../model/sprite-types';
import { groupDPLCRuns } from '../formats/games/dplc-runs';

/**
 * Emit sprite MAPPINGS as Sonic-disassembly macro source (the inverse of
 * parseAsmMappings) — `mappingsTable` / `spriteHeader` / `spritePiece` calls. The
 * macro form is version-agnostic: the same source assembles to S1/S2/S3K bytes
 * depending on the disassembly's `SonicMappingsVer`. Requires the disassembly's
 * MapMacros.asm at assembly time. Lets you save a sprite back into a disasm's
 * native source form.
 */
function hex(n: number): string {
  return n < 0 ? `-$${(-n).toString(16).toUpperCase()}` : `$${n.toString(16).toUpperCase()}`;
}

function pieceLine(p: SpritePiece): string {
  // spritePiece xpos, ypos, width, height, tile, xflip, yflip, pal, pri
  const fields = [
    p.xOffset, p.yOffset, p.widthCells, p.heightCells,
  ].map(String);
  fields.push(hex(p.tile), String(p.xFlip ? 1 : 0), String(p.yFlip ? 1 : 0), String(p.palette), String(p.priority ? 1 : 0));
  return `\tspritePiece\t${fields.join(', ')}`;
}

export function writeAsmMappings(frames: SpriteFrame[], label = 'Map_Sprite'): string {
  const lines: string[] = [`${label}:\tmappingsTable`];
  frames.forEach((_, i) => lines.push(`\tmappingsTableEntry.w\t${label}_F${i}`));
  lines.push('');
  frames.forEach((f, i) => {
    lines.push(`${label}_F${i}:\tspriteHeader`);
    for (const p of f.pieces) lines.push(pieceLine(p));
    lines.push(`${label}_F${i}_End`);
    lines.push('');
  });
  return lines.join('\n');
}

/**
 * Emit per-frame DPLC as macro source (inverse of parseAsmDPLC): `mappingsTable`
 * offset table + `dplcHeader` / `dplcEntry` blocks, grouping each frame's source
 * tiles into maximal ≤16-tile runs.
 */
export function writeAsmDPLC(perFrameTiles: number[][], label = 'DPLC_Sprite'): string {
  const lines: string[] = [`${label}:\tmappingsTable`];
  perFrameTiles.forEach((_, i) => lines.push(`\tmappingsTableEntry.w\t${label}_F${i}`));
  lines.push('');
  perFrameTiles.forEach((tiles, i) => {
    lines.push(`${label}_F${i}:\tdplcHeader`);
    for (const run of groupDPLCRuns(tiles)) lines.push(`\tdplcEntry\t${run.count}, ${hex(run.start)}`);
    lines.push(`${label}_F${i}_End`);
    lines.push('');
  });
  return lines.join('\n');
}
