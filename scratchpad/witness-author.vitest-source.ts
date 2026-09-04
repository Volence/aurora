// AUTHORS THE TWO WITNESS DOCUMENTS THROUGH AURORA'S OWN READER AND WRITER.
// Not hand-typed JSON: every byte written here comes out of serializeEffectsPreset
// / serializeEffectsScene, which is the whole point of the witness.
import { describe, it, expect } from 'vitest';
import { writeFileSync, readFileSync } from 'node:fs';
import { parseEffectsPreset, serializeEffectsPreset } from '../src/core/formats/effects/preset';
import { parseEffectsScene, serializeEffectsScene } from '../src/core/formats/effects/scene';
import { newBoundary } from '../src/renderer/providers/effects-preset';

const AEON = process.env.WITNESS_AEON!;
const EFFECTS = `${AEON}/games/sonic4/data/editor/effects`;
// Distinctly Aurora's, and distinct from aeon's own [3,-5,2,-4,6] so the
// emitted table cannot be theirs by coincidence. Five pairwise-distinct i8.
const AURORA_RATES = [7, -6, 4, -2, 1];

describe('author the witness documents', () => {
  it('writes an Aurora-authored boundary preset', () => {
    const src = readFileSync(`${EFFECTS}/presets/authored_probe.json`, 'utf8');
    const base = parseEffectsPreset(src, 'authored_probe');
    const { bands, ...rest } = base as Record<string, unknown>;
    const preset = { ...rest, id: 'aurora_boundary_witness',
      name: 'Aurora boundary witness', boundary: newBoundary() } as never;
    const bytes = serializeEffectsPreset(preset);
    // Round-trip through Aurora's own reader before it leaves: if the writer
    // emits something the reader rejects, that is a defect, not a witness.
    expect(serializeEffectsPreset(parseEffectsPreset(bytes, 'aurora_boundary_witness'))).toBe(bytes);
    writeFileSync(`${EFFECTS}/presets/aurora_boundary_witness.json`, bytes);
    console.log('BOUNDARY PRESET WRITTEN:\n' + bytes);
  });

  it('writes an Aurora-authored reels scene', () => {
    const src = readFileSync(`${EFFECTS}/ojz_act1_depth.json`, 'utf8');
    const scene = parseEffectsScene(src, 'ojz_act1_depth');
    const authored = { ...scene, reels: { rates: AURORA_RATES } } as never;
    const bytes = serializeEffectsScene(authored);
    expect(serializeEffectsScene(parseEffectsScene(bytes, 'ojz_act1_depth'))).toBe(bytes);
    writeFileSync(`${EFFECTS}/ojz_act1_depth.json`, bytes);
    console.log('REELS RATES WRITTEN:', JSON.stringify(AURORA_RATES));
  });
});
