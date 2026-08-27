/**
 * Where the player's X and Y live inside an S1 object slot — DERIVED, never typed.
 *
 * Play-from-cursor on the classic path needs one address: `v_player + obX`.
 * The base half is easy — `v_player` is a label in `sonic.lst` and resolves
 * through `lookup_symbol` like any other. The displacement half is not:
 *
 *     obX:            equ 8       ; x-axis position (2-4 bytes)
 *     obY:            equ $C      ; y-axis position (2-4 bytes)
 *
 * `equ`s of small integers. They are not addresses, so a symbol lookup cannot
 * answer them in either direction — a name query has nothing to point at, and
 * an address query for `8` lands on whatever label precedes it in ROM. The
 * spike probe (`scratchpad/s1-vplayer-spike-probe.mjs`) hit exactly this and
 * did the only correct thing: read them out of the disassembly's own
 * `_Constants.asm`.
 *
 * Aurora opens s1disasm AS A PROJECT, so that tree is on disk whenever this
 * feature can run at all. Reading the equates from it rather than pinning `8`
 * and `$C` in TypeScript means the editor and the ROM are quoting one file: a
 * disassembly that renumbers its object slots moves this with it, instead of
 * leaving Aurora poking a stale offset that reads back plausible garbage.
 *
 * PURE ON PURPOSE. The fs read belongs to the main process (`aether/s1-warp.ts`);
 * everything decidable about the text is decided here, where it is testable
 * without a filesystem.
 */

/**
 * The file and the two equates this module reads, as a record the test also
 * reads — so the citation in the docblock and the thing being checked cannot
 * drift apart.
 */
export const S1_OFFSET_SOURCE = {
  /** Relative to the classic project's root (the disassembly checkout). */
  file: '_Constants.asm',
  x: 'obX',
  y: 'obY',
} as const;

export interface S1ObjectOffsets {
  /** Byte displacement of the whole-pixel X word within an object slot. */
  obX: number;
  /** Byte displacement of the whole-pixel Y word within an object slot. */
  obY: number;
}

/** Regex-safe form of an assembler identifier. */
function escape(name: string): string {
  return name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Read one `name: equ <literal>` out of AS source, or null.
 *
 * TWO REFUSALS THAT MATTER MORE THAN THE HAPPY PATH:
 *
 *  - **Anchored to column 0.** AS puts labels there and indents instructions,
 *    so `^` plus an explicit `[ \t]*` that cannot cross a newline is what stops
 *    a query for `obY` matching the tail of a longer name — `v_boss_obY: equ
 *    $20` — or an indented line that merely mentions the equate. Unanchored,
 *    both return a plausible small offset, and a plausible wrong offset has no
 *    symptom at this layer at all: it reads back as a clean number.
 *
 *  - **Literals only.** `_Constants.asm` genuinely contains symbolic and
 *    expression equates (`obScreenY: equ obSubpixelX`, `object_size: equ
 *    1<<object_size_bits`). Run through `parseInt` those give `NaN`, and `NaN
 *    >>> 0` is `0` — a poke at the object's ID byte, which is about the worst
 *    place in the slot to write two bytes. So anything that is not a plain
 *    decimal or `$`-hex literal is a null, and the caller gates.
 */
export function parseAsmEquate(source: string, name: string): number | null {
  const m = source.match(new RegExp(`^[ \\t]*${escape(name)}:[ \\t]*equ[ \\t]+(\\S+)`, 'm'));
  if (!m) return null;
  const tok = m[1];
  if (/^\$[0-9A-Fa-f]+$/.test(tok)) return Number.parseInt(tok.slice(1), 16);
  if (/^[0-9]+$/.test(tok)) return Number.parseInt(tok, 10);
  return null;
}

/**
 * Both offsets, or null.
 *
 * NEVER A HALF-DERIVED PAIR: a result carrying a real `obX` and a defaulted
 * `obY` would poke the player's X correctly and his Y into the object's
 * mappings pointer. One missing equate gates the whole feature.
 */
export function parseS1ObjectOffsets(source: string): S1ObjectOffsets | null {
  const obX = parseAsmEquate(source, S1_OFFSET_SOURCE.x);
  const obY = parseAsmEquate(source, S1_OFFSET_SOURCE.y);
  if (obX === null || obY === null) return null;
  return { obX, obY };
}
