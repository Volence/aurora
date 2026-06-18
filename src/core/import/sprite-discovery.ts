import type { SpriteFormatId } from '../formats/sprite-format-adapter';

/**
 * A sprite set discovered by scanning a disassembly project: a mapping file plus
 * the best-guess sibling DPLC and art files (any of which may be absent — the user
 * attaches missing pieces manually). Paths are project-relative. See the phase-6
 * design doc §3 (6c). Pairing is a heuristic over the known disassembly layouts:
 *  - skdisasm: per-sprite folder `Map - X.asm` / `DPLC - X.asm` / `X.bin`
 *  - s2disasm: `mappings/sprite/X.asm` ↔ `mappings/spriteDPLC/X.asm` (art via code → manual)
 *  - s1disasm: `_maps/X.asm` (art via code → manual)
 * Discovery is liberal; the actual open re-validates by parsing the macro call-sites.
 */
export interface DiscoveredSpriteSet {
  name: string;
  game: SpriteFormatId;
  mappings: string;
  dplc?: string;
  art?: string;
}

const norm = (p: string) => p.replace(/\\/g, '/');
const basename = (p: string) => p.slice(p.lastIndexOf('/') + 1);
const dirname = (p: string) => (p.includes('/') ? p.slice(0, p.lastIndexOf('/')) : '');

/** A DPLC/dynamic-art script is never itself a mapping candidate. */
const isDplcName = (base: string) => /dplc|dynamic gfx|dynplc/i.test(base);

export function discoverSpriteSets(files: string[]): DiscoveredSpriteSet[] {
  const all = files.map(norm);
  const present = new Set(all);
  const has = (p: string) => (present.has(p) ? p : undefined);

  const sets: DiscoveredSpriteSet[] = [];
  for (const file of all) {
    const base = basename(file);
    const dir = dirname(file);
    if (!base.toLowerCase().endsWith('.asm')) continue;
    if (isDplcName(base)) continue;

    let name: string | null = null;
    let game: SpriteFormatId | null = null;
    let dplc: string | undefined;
    let art: string | undefined;

    const skMatch = base.match(/^Map - (.+)\.asm$/i);
    if (skMatch) {
      name = skMatch[1];
      game = 's3k';
      dplc = has(`${dir}/DPLC - ${name}.asm`);
      art = has(`${dir}/${name}.bin`);
    } else if (/(^|\/)mappings\/sprite$/.test(dir)) {
      name = base.replace(/\.asm$/i, '');
      game = 's2';
      dplc = has(`${dir.replace(/mappings\/sprite$/, 'mappings/spriteDPLC')}/${name}.asm`);
    } else if (/(^|\/)_maps$/.test(dir) && base !== '_MapMacros.asm') {
      name = base.replace(/\.asm$/i, '');
      game = 's1';
    }

    if (name && game) sets.push({ name, game, mappings: file, dplc, art });
  }

  return sets.sort((a, b) => a.name.localeCompare(b.name));
}
