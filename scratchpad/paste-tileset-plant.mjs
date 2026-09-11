#!/usr/bin/env node
// PASTE-ACROSS-TILESETS plant script. Applies ONE named mutation by exact-anchor
// replacement, refused unless the anchor occurs exactly once, reads the file
// back from disk and prints the mutated lines. `--restore` puts every planted
// file back from the COMMITTED tip (`git show HEAD:<path>`), never from a
// working copy.
//
//   node scratchpad/paste-tileset-plant.mjs P1
//   node scratchpad/paste-tileset-plant.mjs --restore
import { readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

const MV = 'src/renderer/components/MapViewport.tsx';
const MC = 'src/core/editing/map-clipboard.ts';
const RF = 'src/core/editing/region-flip.ts';
const ES = 'src/renderer/state/editorStore.ts';

const PLANTS = {
  P1: { what: 'Ctrl+V arms without checking the tile set', file: MV,
    from: '          if (!clipboardFitsTileset(clip, getCurrentZone(state)?.tileset)) {',
    to: '          if (false && !clipboardFitsTileset(clip, getCurrentZone(state)?.tileset)) {' },
  P2: { what: 'the commit click writes without checking the tile set', file: MV,
    from: '        if (!clipboardFitsTileset(clip, getCurrentZone(useProjectStore.getState())?.tileset)) {',
    to: '        if (false && !clipboardFitsTileset(clip, getCurrentZone(useProjectStore.getState())?.tileset)) {' },
  P3: { what: 'flipClipboard lists its fields instead of spreading, dropping the tile set', file: RF,
    from: '    ...clip,\n    nametable: flipPlane(',
    to: '    widthTiles: clip.widthTiles, heightTiles: clip.heightTiles, artOnly: clip.artOnly,\n    nametable: flipPlane(' },
  P4: { what: 'copyChunkToClipboard drops the tile set it was handed', file: MC,
    from: '    artOnly: !aligned,\n    tileset,\n',
    to: '    artOnly: !aligned,\n' },
  P5: { what: 'the predicate trusts a tile set whose pixels merely match', file: MC,
    from: '  return target != null && clip.tileset === target;',
    to: '  return target != null && (clip.tileset === target || JSON.stringify(clip.tileset.tiles.map((t) => [...t.pixels])) === JSON.stringify(target.tiles.map((t) => [...t.pixels])));' },
  P6: { what: 'the ruled-out design: an act, zone or project change CLEARS the clipboard', file: ES,
    from: '  if (ed.marquee === null && !ed.pasting) return;\n  useEditorStore.setState({ marquee: null, pasting: false });',
    to: '  useEditorStore.setState({ marquee: null, pasting: false, mapClipboard: null });' },
  P7: { what: 'Ctrl+C captures a NEW tile set wrapper, so nothing ever matches (identity too narrow)', file: MV,
    from: '              tileset: zone.tileset,',
    to: '              tileset: { ...zone.tileset },' },
  P8: { what: 'Ctrl+C captures the FIRST zone\'s tile set, not the open zone\'s', file: MV,
    from: '          const zone = getCurrentZone(state);\n          if (section && zone) {',
    to: '          const zone = state.project?.zones[0] ?? null;\n          if (section && zone) {' },
};

const arg = process.argv[2];
if (arg === '--restore') {
  const files = [...new Set(Object.values(PLANTS).map((p) => p.file))];
  for (const f of files) writeFileSync(f, execFileSync('git', ['show', `HEAD:${f}`]));
  console.log(`restored from HEAD: ${files.join(', ')}`);
  console.log(execFileSync('git', ['status', '--short', '--', ...files]).toString() || '(those files are clean against HEAD)');
  process.exit(0);
}
const p = PLANTS[arg];
if (!p) { console.error(`unknown plant ${arg}; known: ${Object.keys(PLANTS).join(' ')}`); process.exit(2); }
const src = readFileSync(p.file, 'utf8');
const count = src.split(p.from).length - 1;
if (count !== 1) { console.error(`REFUSED ${arg}: the anchor occurs ${count} times in ${p.file}, not once`); process.exit(3); }
writeFileSync(p.file, src.replace(p.from, p.to));
const back = readFileSync(p.file, 'utf8');
if (!back.includes(p.to)) { console.error(`REFUSED ${arg}: the mutation is not on disk after the write`); process.exit(4); }
console.log(`${arg} planted: ${p.what}`);
console.log(execFileSync('git', ['diff', '--stat', '--', p.file]).toString().trim());
console.log(execFileSync('git', ['diff', '-U0', '--', p.file]).toString().split('\n').filter((l) => /^[-+][^-+]/.test(l)).join('\n'));
