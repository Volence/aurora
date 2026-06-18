import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { parseSonicAnimScript } from '../../../src/core/import/anim-import';

const txt = (n: string) => readFileSync(new URL(`../../fixtures/mappings/src/${n}`, import.meta.url), 'utf8');

describe('parseSonicAnimScript — classic S2 animation format (raw $FF/$FE bytes)', () => {
  const anims = parseSonicAnimScript(txt('pitcherplant_anim.asm'));

  it('reads all three anims in table order', () => {
    expect(anims.map((a) => a.name)).toEqual(['Plant_Idle', 'Poison_Bullet', 'Plant_Shooting']);
  });

  it('Plant_Idle: dc.b $0F, 00, $FF → speed 15, frame 0, loop', () => {
    expect(anims[0]).toEqual({ name: 'Plant_Idle', duration: 15, frames: [0], control: { kind: 'loop' } });
  });

  it('Poison_Bullet: dc.b $03, $05, $FF → frame 5, loop', () => {
    expect(anims[1]).toMatchObject({ duration: 3, frames: [5], control: { kind: 'loop' } });
  });

  it('Plant_Shooting: dc.b $09, 1,2,3,4,1, $FE,1 → frames + back 1', () => {
    expect(anims[2]).toEqual({ name: 'Plant_Shooting', duration: 9, frames: [1, 2, 3, 4, 1], control: { kind: 'back', count: 1 } });
  });
});
