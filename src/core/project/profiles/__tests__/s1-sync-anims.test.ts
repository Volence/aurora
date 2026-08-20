// S1 synced (SynchroAnimate) animation transcription — integrity tests.
//
// Three layers, so a corrupted transcription cannot hide:
//   1. HAND-DERIVED expectations (this file's constants, derivations commented)
//      pin every sync row's channel / frames / rate.
//   2. SOURCE CROSS-CHECK (guarded on the real s1disasm tree): the rates and
//      moduli are re-derived from sonic.asm's SynchroAnimate text and the
//      consumer instructions are grepped from the real _incObj files — a rate
//      that drifts from the engine fails HERE, not just against a copied
//      constant.
//   3. CITATION integrity: the profile source itself must carry a SyncN +
//      sonic.asm citation on every `channel:` row (per-row provenance, the
//      S1_OBJECT_ANIMS house style).

import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { fileURLToPath } from 'url';
import { S1_OBJECT_ANIMS, resolveObjectAnims } from '../s1-object-anims';
import type { SyncAnimEntry } from '../s1-object-anims';

const S1DIR = '/home/volence/sonic_hacks/s1disasm';
const treePresent = existsSync(join(S1DIR, 'sonic.asm'));
const guarded = treePresent ? it : it.skip;

/** Every sync row in the table, flattened with its object id. */
const allSyncRows: { id: number; entry: SyncAnimEntry }[] = Object.entries(S1_OBJECT_ANIMS)
  .flatMap(([id, link]) => (link.sync ?? []).map((entry) => ({ id: Number(id), entry })));

describe('S1 sync animation table — hand-derived values', () => {
  it('has exactly the four transcribed consumers (17, 25, 37, 4B)', () => {
    // SynchroAnimate has four channels; grepping v_ani*_frame across _incObj
    // found exactly four level-mode consumers (channel 2 is "Used for
    // nothing"). Special Stage reuses the RAM with its own updater — excluded.
    expect(allSyncRows.map((r) => r.id).sort((a, b) => a - b)).toEqual([0x17, 0x25, 0x37, 0x4b]);
  });

  it('Ring (25): spin on channel 1, frames 0-3, exactly 8 frames/step', () => {
    // Sync2 resets its timer with `move.b #8-1,(v_ani1_time).w` — the timer
    // counts 7,6,…,0 then steps on the 8th frame → 8 game frames per step.
    // `addq` + `andi #3` → ascending 0,1,2,3. Ring_Animate copies
    // v_ani1_frame straight into obFrame; mapping frames 0-3 are the four
    // rotation views (.front/.angle1/.edge/.angle2).
    const spin = resolveObjectAnims(0x25)?.sync?.[0];
    expect(spin).toMatchObject({ name: 'spin', channel: 1, framesPerStep: 8 });
    expect(spin?.frames).toEqual([0, 1, 2, 3]);
    expect(spin?.approximate).toBeUndefined(); // constant-rate channel: exact
    // The scripted sparkle must STILL be linked — spin is in addition.
    expect(resolveObjectAnims(0x25)?.animAsm).toBe('_anim/Rings.asm');
  });

  it('Giant Ring (4B): same channel 1, in phase with small rings', () => {
    const spin = resolveObjectAnims(0x4b)?.sync?.[0];
    expect(spin).toMatchObject({ name: 'spin', channel: 1, framesPerStep: 8 });
    expect(spin?.frames).toEqual([0, 1, 2, 3]);
    expect(resolveObjectAnims(0x4b)?.animAsm).toBeUndefined(); // sync-only object
  });

  it('Spiked Pole Helix (17): channel 0 DESCENDS through 8 frames at 12/step', () => {
    // Sync1 resets with `#12-1` → 12 game frames per step, and uses `subq` +
    // `andi #7` — the frame counter counts DOWN mod 8, so the display order
    // descends: 0,7,6,5,4,3,2,1 (one full cycle starting from 0).
    const rot = resolveObjectAnims(0x17)?.sync?.[0];
    expect(rot).toMatchObject({ channel: 0, framesPerStep: 12 });
    expect(rot?.frames).toEqual([0, 7, 6, 5, 4, 3, 2, 1]);
    // The per-instance phase offset (obFrame = (v_ani0_frame + helix_frame) & 7)
    // cannot be shown for a single timeline — it must be DISCLOSED, not dropped.
    expect(rot?.note).toMatch(/helix_frame/);
  });

  it('Scattered rings (37): channel 3 accumulator — average 4, flagged approximate', () => {
    const spin = resolveObjectAnims(0x37)?.sync?.[0];
    expect(spin).toMatchObject({ channel: 3, framesPerStep: 4, approximate: true });
    expect(spin?.frames).toEqual([0, 1, 2, 3]);
    expect(spin?.note).toMatch(/decelerat/i); // the honest shape, disclosed
  });

  it('channel 3 average re-derived by simulating Sync4 from the transcription', () => {
    // Sync4, transcribed (sonic.asm:3165-3176): while the loss timer t runs,
    // each frame does  buf += t; frame = (buf >> 9) & 3; t-- .
    // (`rol.w #7` then `andi #3` keeps source bits 9-10 → buf >> 9.)
    // t is seeded 255 (_incObj/25, 37 Rings.asm:270).
    let t = 255, buf = 0;
    const seen: number[] = [];
    while (t !== 0) {
      buf = (buf + t) & 0xffff;
      seen.push((buf >> 9) & 3);
      t--;
    }
    // Continuous derivation: final buf = 255·256/2 = 32640; 32640/512 = 63.75
    // boundary crossings over 255 game frames → 255/63.75 = 4.0 avg. Discrete
    // count: 63 actual frame changes → 255/63 ≈ 4.05. Both round to 4.
    expect(buf).toBe(32640);
    const changes = seen.filter((f, i) => i > 0 && f !== seen[i - 1]).length;
    expect(changes).toBe(63);
    expect(Math.round(255 / changes)).toBe(resolveObjectAnims(0x37)?.sync?.[0]?.framesPerStep);
    // And it DECELERATES (why `approximate` is mandatory): the first frame
    // hold is far shorter than the last one.
    const changeIdx = seen.flatMap((f, i) => (i > 0 && f !== seen[i - 1] ? [i] : []));
    const firstGap = changeIdx[1] - changeIdx[0];
    const lastGap = changeIdx[changeIdx.length - 1] - changeIdx[changeIdx.length - 2];
    expect(firstGap).toBeLessThan(lastGap);
  });

  it('every sync row is playable data: integer rate ≥ 1, frames within its modulus', () => {
    for (const { id, entry } of allSyncRows) {
      expect(Number.isInteger(entry.framesPerStep), `obj ${id.toString(16)}`).toBe(true);
      expect(entry.framesPerStep).toBeGreaterThanOrEqual(1);
      expect(entry.frames.length).toBeGreaterThan(0);
      // Channel moduli from SynchroAnimate: ch0 `andi #7` → 8, ch1 `andi #3`
      // → 4, ch3 `andi #3` → 4. One full cycle, no repeats.
      const modulus = entry.channel === 0 ? 8 : 4;
      expect(entry.frames.length, `obj ${id.toString(16)}`).toBe(modulus);
      expect(new Set(entry.frames).size).toBe(modulus);
      for (const f of entry.frames) expect(f).toBeLessThan(modulus);
      // A non-constant channel must say so; constant channels must not.
      if (entry.channel === 3) expect(entry.approximate).toBe(true);
      else expect(entry.approximate).toBeUndefined();
      if (entry.approximate) expect(entry.note, `obj ${id.toString(16)} approximate needs a note`).toBeTruthy();
    }
  });
});

describe('S1 sync animation table — source cross-check (real s1disasm)', () => {
  guarded('rates and moduli match SynchroAnimate in sonic.asm, not a copied constant', () => {
    const src = readFileSync(join(S1DIR, 'sonic.asm'), 'utf8');
    const start = src.indexOf('SynchroAnimate:');
    expect(start).toBeGreaterThan(0);
    const body = src.slice(start, src.indexOf('End of function SynchroAnimate'));

    // Re-derive each channel's rate from its timer-reset constant `#N-1` and
    // its modulus from the andi mask, straight out of the routine text.
    const rate = (ch: number): number => {
      const m = body.match(new RegExp(`move\\.b\\t#(\\d+)-1,\\(v_ani${ch}_time\\)`));
      expect(m, `v_ani${ch}_time reset`).toBeTruthy();
      return Number(m![1]);
    };
    const mask = (ch: number): number => {
      const m = body.match(new RegExp(`andi\\.b\\t#(\\d+),\\(v_ani${ch}_frame\\)`));
      expect(m, `v_ani${ch}_frame mask`).toBeTruthy();
      return Number(m![1]);
    };
    // Channel 0 counts DOWN (subq), channel 1 UP (addq) — direction is what
    // makes the helix frame list descend and the ring list ascend.
    expect(body).toMatch(/subq\.b\t#1,\(v_ani0_frame\)/);
    expect(body).toMatch(/addq\.b\t#1,\(v_ani1_frame\)/);
    // Channel 3 is the accumulator: rol.w #7 + andi.w #3 → (buf >> 9) & 3.
    expect(body).toMatch(/rol\.w\t#7,d0/);
    expect(body).toMatch(/andi\.w\t#3,d0/);

    for (const { id, entry } of allSyncRows) {
      if (entry.channel === 3) continue; // accumulator: no fixed rate to read
      expect(entry.framesPerStep, `obj ${id.toString(16)} rate vs sonic.asm`).toBe(rate(entry.channel));
      expect(entry.frames.length, `obj ${id.toString(16)} modulus vs sonic.asm`).toBe(mask(entry.channel) + 1);
    }
  });

  guarded('each consumer instruction exists where the table says it does', () => {
    const rings = readFileSync(join(S1DIR, '_incObj/25, 37 Rings.asm'), 'utf8');
    const giant = readFileSync(join(S1DIR, '_incObj/4B, 7C Giant Ring and Flash.asm'), 'utf8');
    const helix = readFileSync(join(S1DIR, '_incObj/17 GHZ Spiked Pole Helix.asm'), 'utf8');
    // Obj25 + Obj4B copy the shared channel-1 frame straight into obFrame.
    expect(rings).toMatch(/move\.b\t\(v_ani1_frame\)\.w,obFrame\(a0\)/);
    expect(giant).toMatch(/move\.b\t\(v_ani1_frame\)\.w,obFrame\(a0\)/);
    // Obj37 reads the channel-3 accumulator frame; its timer is seeded 255.
    expect(rings).toMatch(/move\.b\t\(v_ani3_frame\)\.w,obFrame\(a0\)/);
    expect(rings).toMatch(/move\.b\t#255,\(v_ani3_time\)\.w/);
    // Obj17 ADDS a per-instance base before masking — the disclosed offset.
    expect(helix).toMatch(/move\.b\t\(v_ani0_frame\)\.w,d0/);
    expect(helix).toMatch(/add\.b\thelix_frame\(a0\),d0/);
    expect(helix).toMatch(/andi\.b\t#7,d0/);
  });

  guarded('no fifth consumer hides in _incObj (the table is complete)', () => {
    // The completeness claim: v_ani*_frame is read by exactly the transcribed
    // files. (sonic.asm holds only the updater; Special Stage Loading &
    // Drawing is the SS-only reuse, out of level scope by design.)
    const { execSync } = require('node:child_process') as typeof import('node:child_process');
    const out = execSync(
      `grep -rln "v_ani[0-9]_frame" ${JSON.stringify(join(S1DIR, '_incObj'))}`,
      { encoding: 'utf8' });
    expect(out.trim().split('\n').map((p) => p.split('/').pop()).sort()).toEqual([
      '17 GHZ Spiked Pole Helix.asm',
      '25, 37 Rings.asm',
      '4B, 7C Giant Ring and Flash.asm',
    ]);
  });
});

describe('S1 sync animation table — per-row citations', () => {
  const profileSrc = readFileSync(fileURLToPath(new URL('../s1-object-anims.ts', import.meta.url)), 'utf8');

  it('every channel row carries a SyncN + sonic.asm line citation', () => {
    // `channel: N,` — the trailing comma excludes the interface's type line.
    const channelLines = profileSrc.split('\n').filter((l) => /^\s*channel: \d,/.test(l));
    expect(channelLines.length).toBe(allSyncRows.length); // one literal per row
    for (const line of channelLines) {
      expect(line, `uncited: "${line.trim()}"`).toMatch(/\/\/ Sync\d: sonic\.asm:\d+-\d+/);
    }
  });

  it('every consumer file is cited next to its row', () => {
    for (const needle of [
      '_incObj/25, 37 Rings.asm:134', // Ring_Animate → obFrame
      '_incObj/25, 37 Rings.asm:315', // RLoss_Bounce → obFrame
      '_incObj/25, 37 Rings.asm:270', // loss timer seeded 255
      'Flash.asm:43', // GRing_Animate → obFrame
      '_incObj/17 GHZ Spiked Pole Helix.asm:107-111', // Hel_RotateSpikes
    ]) {
      expect(profileSrc, `missing citation ${needle}`).toContain(needle);
    }
  });
});
