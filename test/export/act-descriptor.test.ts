import { describe, it, expect } from 'vitest';
import { generateActDescriptorAsm } from '../../src/core/export/act-descriptor';
import type { Section } from '../../src/core/model/s4-types';
import { createSection } from '../../src/core/model/s4-types';

describe('act-descriptor asm export', () => {
  it('generates act descriptor with section table', () => {
    const sections: (Section | null)[] = [
      createSection(0, 'Sec0'),
      createSection(1, 'Sec1'),
      null,
      createSection(3, 'Sec3'),
    ];
    const result = generateActDescriptorAsm('OJZ', 'Act1', {
      gridWidth: 2,
      gridHeight: 2,
      sections,
      startPosition: { secX: 0, secY: 0, localX: 256, localY: 256 },
      parallaxRef: 'ParallaxConfig_OJZ_Default',
    });

    expect(result).toContain('OJZ_Act1_Descriptor:');
    expect(result).toContain('dc.l    OJZ_Act1_Sections');
    expect(result).toContain('dc.w    2                       ; grid_w');
    expect(result).toContain('dc.w    2                       ; grid_h');
    expect(result).toContain('dc.w    $0100                   ; start_local_x');
    expect(result).toContain('OJZ_Act1_Sections:');
    expect(result).toContain('; --- Section 2 (null) ---');
  });

  it('null section exports as 72 zero bytes', () => {
    const sections: (Section | null)[] = [null];
    const result = generateActDescriptorAsm('OJZ', 'Act1', {
      gridWidth: 1,
      gridHeight: 1,
      sections,
      startPosition: { secX: 0, secY: 0, localX: 0, localY: 0 },
      parallaxRef: null,
    });
    expect(result).toContain('dcb.b 72, 0');
  });
});
