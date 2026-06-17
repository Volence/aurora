import { describe, it, expect } from 'vitest';
import { sizeCode } from '../../src/core/model/sprite-types';

describe('sizeCode', () => {
  // Verified vs s4_engine macros.asm: sprSize w,h = ((((w)-1)<<2)|((h)-1))<<8
  // size byte = sprSize(w,h) >> 8. bits 3-2 = WIDTH-1, bits 1-0 = HEIGHT-1.
  it('encodes width in bits 3-2 and height in bits 1-0', () => {
    expect(sizeCode(1, 1)).toBe(0x00);
    expect(sizeCode(2, 2)).toBe(0x05);
    expect(sizeCode(4, 1)).toBe(0x0c);
    expect(sizeCode(1, 4)).toBe(0x03);
    expect(sizeCode(4, 4)).toBe(0x0f);
    expect(sizeCode(3, 2)).toBe(0x09);
  });
});
