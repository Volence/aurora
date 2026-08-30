#!/usr/bin/env node
// O17 RED-FIRST PLANTER — throwaway, not a deliverable.
//
// Each entry undoes exactly one half of the O17 change so the gate that claims
// to guard it can be watched go red, then puts the file back byte-for-byte from
// a snapshot (never `git checkout`, which would also revert unstaged work in
// the same file).
//
//   node scratchpad/o17-plant.mjs p1 plant   # then run the suite
//   node scratchpad/o17-plant.mjs p1 restore
import { readFileSync, writeFileSync, copyFileSync, unlinkSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const SPEC = {
  p1: ['src/renderer/components/art/ComposerCanvas.tsx',
    'pri: s.stampPriority,', "pri: 'keep',"],
  p2: ['src/renderer/components/art/ComposerCanvas.tsx',
    '      const drawn = drawComposerPriority(ctx, doc, z);',
    '      const drawn = { veils: 0, segments: 0 };'],
  p3: ['src/renderer/canvas/composer-priority-lens.ts',
    'tilePx: COMPOSER_LENS_TILE_PX * zoom,', 'tilePx: COMPOSER_LENS_TILE_PX,'],
  p4: ['src/renderer/state/artStore.ts',
    '    surfacePriorityLens(stampPriority);\n', ''],
  p5: ['src/renderer/shell/ArtToolOptions.tsx',
    '<span style={{ fontSize: T.tXs, color: T.textLo }}>Priority</span>',
    '<span style={{ fontSize: T.tXs, color: T.textLo }} title="Priority: keep — leave each cell\'s existing priority bit alone (default)">Priority</span>'],
};

const [mode, action] = process.argv.slice(2);
const entry = SPEC[mode];
if (!entry) throw new Error(`unknown plant ${mode}; have ${Object.keys(SPEC).join(' ')}`);
const [rel, oldText, newText] = entry;
const file = join(ROOT, rel);
const bak = `${file}.o17bak`;

if (action === 'plant') {
  copyFileSync(file, bak);
  const s = readFileSync(file, 'utf8');
  if (!s.includes(oldText)) throw new Error(`plant ${mode}: anchor not found in ${rel}`);
  writeFileSync(file, s.replace(oldText, newText));
  console.log('PLANTED', mode, rel);
} else if (action === 'restore') {
  copyFileSync(bak, file);
  unlinkSync(bak);
  console.log('RESTORED', mode, rel);
} else {
  throw new Error('action must be plant|restore');
}
