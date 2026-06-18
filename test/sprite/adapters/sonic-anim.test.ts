import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { parseSonicAnimScript, parseAnyAnimScript } from '../../../src/core/import/anim-import';

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

describe('parseSonicAnimScript — real skdisasm Anim file with a LEADING table label', () => {
  // Anim - Mushroom Cap.asm starts with `Ani_MHZMushroomCap_:` then the dc.w table.
  const anims = parseSonicAnimScript(txt('skdisasm_mushroomcap_anim.asm'));

  it('recovers both animations despite the leading table label', () => {
    expect(anims.map((a) => a.name)).toEqual(['byte_3E1DE', 'byte_3E1E1']);
  });

  it('byte_3E1DE: dc.b 7, 0, $FF → duration 7, frame 0, loop', () => {
    expect(anims[0]).toEqual({ name: 'byte_3E1DE', duration: 7, frames: [0], control: { kind: 'loop' } });
  });

  it('byte_3E1E1: multi-line dc.b, frames until $FC routine', () => {
    expect(anims[1].frames).toEqual([1, 1, 1, 1, 1, 3, 0, 3, 0, 3, 0, 3, 0, 3, 0, 2, 0, 2, 0, 2, 0, 2, 0]);
    expect(anims[1].control).toEqual({ kind: 'routine' });
  });

  it('parseAnyAnimScript also resolves it', () => {
    expect(parseAnyAnimScript(txt('skdisasm_mushroomcap_anim.asm')).map((a) => a.name)).toEqual(['byte_3E1DE', 'byte_3E1E1']);
  });
});
