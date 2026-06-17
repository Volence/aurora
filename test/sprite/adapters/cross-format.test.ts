import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { getAdapter, ADAPTER_IDS } from '../../../src/core/formats/games';

const fx = (n: string) => new Uint8Array(readFileSync(new URL(`../../fixtures/mappings/${n}`, import.meta.url)));

describe('cross-format consistency', () => {
  it('registers all four adapters', () => {
    expect([...ADAPTER_IDS].sort()).toEqual(['s1', 's2', 's3k', 's4']);
  });

  it('s1/s2/s3k decode the same obj0B source to identical logical frames', () => {
    // All three fixtures were assembled from one mapping source, so the
    // game-independent logical frames must be byte-for-byte equal.
    const s1 = getAdapter('s1').readMappings(fx('s1_obj0B_map.bin'));
    const s2 = getAdapter('s2').readMappings(fx('s2_obj0B_map.bin'));
    const s3k = getAdapter('s3k').readMappings(fx('s3k_obj0B_map.bin'));
    expect(s2).toEqual(s1);
    expect(s3k).toEqual(s1);
  });

  it('s1/s2/s3k decode the same obj08 DPLC source to identical tile lists', () => {
    const s1 = getAdapter('s1').readDPLC!(fx('s1_obj08_dplc.bin'));
    const s2 = getAdapter('s2').readDPLC!(fx('s2_obj08_dplc.bin'));
    const s3k = getAdapter('s3k').readDPLC!(fx('s3k_obj08_dplc.bin'));
    expect(s2).toEqual(s1);
    expect(s3k).toEqual(s1);
  });

  it('converts S2 → S4 mappings and back through the logical model', () => {
    const s2 = getAdapter('s2');
    const s4 = getAdapter('s4');
    const frames = s2.readMappings(fx('s2_obj0B_map.bin'));
    // Round-trip the logical frames through the S4 binary format.
    const s4back = s4.readMappings(s4.writeMappings(frames));
    expect(s4back).toEqual(frames);
    // And back out to S2 reproduces the original S2 bytes.
    expect(Array.from(s2.writeMappings(s4back))).toEqual(Array.from(fx('s2_obj0B_map.bin')));
  });
});
