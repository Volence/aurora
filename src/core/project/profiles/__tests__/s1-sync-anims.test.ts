// S1 synced (SynchroAnimate) animation transcription — integrity tests.
//
// Three layers, so a corrupted transcription cannot hide:
//   1. HAND-DERIVED expectations (this file's constants, derivations commented)
//      pin every sync row's channel / frames / rate.
//   2. SOURCE CROSS-CHECK — the rates and moduli are re-derived from sonic.asm's
//      SynchroAnimate text and the consumer instructions are grepped from the
//      real _incObj files, so a rate that drifts from the engine fails HERE, not
//      just against a copied constant. See the block below for WHICH sonic.asm
//      and WHICH _incObj: not the ones on disk in a peer's checkout.
//   3. CITATION integrity: the profile source itself must carry a SyncN +
//      sonic.asm citation on every `channel:` row (per-row provenance, the
//      S1_OBJECT_ANIMS house style).
//
// ────────────────────────────────────────────────────────────────────────────
// ⚠ THESE CROSS-CHECKS ASK A CURRENCY QUESTION, AND A PIN CANNOT ANSWER ONE.
//
// ROADMAP row 78 phase 2 vendored the s1disasm data this suite asserts on into
// `test/fixtures/s1disasm`, so that no row's colour is decided by another lane's
// uncommitted edits. This describe block is the DELIBERATE EXCEPTION, and the
// reason is the whole point of the split:
//
//   `no fifth consumer hides in _incObj (the table is complete)` is not a
//   question about Aurora. It is a question about the DISASSEMBLY: does it still
//   contain exactly the four SynchroAnimate consumers this table transcribes? A
//   vendored copy of `_incObj` would contain exactly four BY CONSTRUCTION. The
//   row would pass forever and could never detect the fifth consumer it exists
//   to catch — a vacuous gate wearing the costume of a strong one. The same
//   holds for the rates read out of `SynchroAnimate`.
//
// So these three rows read `../s1disasm` at a COMMITTED REVISION through git
// objects (`test/support/peer-repo.ts`), never through its working tree, and:
//   · they NAME that revision in every message they print;
//   · they FAIL on drift, prefixed NOT AN AURORA REGRESSION, because drift here
//     means the disassembly moved and this table needs re-deriving;
//   · they compare CONTENT, not commit ids, so the peer's ordinary commits do
//     not turn this repo red;
//   · when they cannot run — no peer checkout, revision unfetched — they SKIP
//     LOUDLY with `ctx.skip`, saying what could not be measured. Never
//     `it.skip`, which discards the reason.
// ────────────────────────────────────────────────────────────────────────────

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { S1_OBJECT_ANIMS, resolveObjectAnims } from '../s1-object-anims';
import type { SyncAnimEntry } from '../s1-object-anims';
import { peerRepo, resolveRev, readAtRev, grepAtRev } from '../../../../../test/support/peer-repo';

/**
 * The branch whose tip answers "what does the disassembly say TODAY".
 * `origin/AS` is s1disasm's own `origin/HEAD` — committed, named, published, and
 * never anybody's working tree.
 */
const S1_TIP = 'origin/AS';
const S1DISASM = peerRepo('s1disasm');

/** Prefix, so nobody triages a drifted disassembly as an Aurora regression. */
const NOT_OURS = 'NOT AN AURORA REGRESSION — the s1disasm source moved under this table.';

/** Resolve the tip once, or the reason it could not be resolved. */
function tipOrSkipReason(): { rev: string } | { why: string } {
  if (S1DISASM === null) {
    return {
      why: 'no s1disasm checkout beside this repo (set S1DISASM_DIR / EMPYREAN_SUITE_ROOT)',
    };
  }
  const rev = resolveRev(S1DISASM, S1_TIP);
  if (rev === null) return { why: `${S1_TIP} does not resolve in ${S1DISASM} (unfetched? shallow?)` };
  return { rev };
}

/**
 * `it`, but one that can only SKIP for a reason it prints, and that names what
 * it could not measure. A bare `it.skip` here would discard the reason and read
 * as a pass to anyone counting a suite total.
 */
const currency = (
  name: string,
  fn: (rev: string, repo: string) => void,
): void => it(`${name} — at s1disasm ${S1_TIP}`, (ctx) => {
  const t = tipOrSkipReason();
  if ('why' in t) {
    ctx.skip(`SKIPPED, NOT PASSED: ${t.why} — CANNOT MEASURE whether the S1 sync animation `
      + `table still matches the disassembly. This row reads the peer at a COMMITTED revision `
      + 'on purpose: it asks whether the SOURCE has moved, which no vendored copy of the source '
      + 'could ever answer (test/fixtures/s1disasm is a pin, and a pin equals itself).');
    return;
  }
  fn(t.rev, S1DISASM!);
});

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

describe('S1 sync animation table — CURRENCY cross-check (s1disasm at a committed revision)', () => {
  currency('rates and moduli match SynchroAnimate in sonic.asm, not a copied constant', (rev, repo) => {
    const at = readAtRev(repo, rev, 'sonic.asm');
    expect(at.ok, at.ok ? '' : `${NOT_OURS} ${at.why}`).toBe(true);
    if (!at.ok) return;
    const src = at.text;
    // PRINT THE ARTIFACT THIS ROW JUDGES: which revision, which blob, how big.
    process.stdout.write(`  [currency] sonic.asm @ ${rev} blob ${at.blob} (${src.length} chars)\n`);
    const start = src.indexOf('SynchroAnimate:');
    expect(start, `${NOT_OURS} SynchroAnimate: is gone from sonic.asm at ${rev}`).toBeGreaterThan(0);
    const body = src.slice(start, src.indexOf('End of function SynchroAnimate'));

    // Re-derive each channel's rate from its timer-reset constant `#N-1` and
    // its modulus from the andi mask, straight out of the routine text.
    // Every complaint below is about ANOTHER repository and says so — see the
    // `cites` block in the next row for why a bare matcher is not enough here.
    const where = `SynchroAnimate in sonic.asm at ${S1_TIP} (${rev})`;
    const rate = (ch: number): number => {
      const m = body.match(new RegExp(`move\\.b\\t#(\\d+)-1,\\(v_ani${ch}_time\\)`));
      expect(m, `${NOT_OURS} ${where} has no v_ani${ch}_time reset`).toBeTruthy();
      return Number(m![1]);
    };
    const mask = (ch: number): number => {
      const m = body.match(new RegExp(`andi\\.b\\t#(\\d+),\\(v_ani${ch}_frame\\)`));
      expect(m, `${NOT_OURS} ${where} has no v_ani${ch}_frame mask`).toBeTruthy();
      return Number(m![1]);
    };
    const shape = (pattern: RegExp, what: string): void => {
      expect(pattern.test(body), `${NOT_OURS} ${where} no longer has ${what} (${pattern.source})`).toBe(true);
    };
    // Channel 0 counts DOWN (subq), channel 1 UP (addq) — direction is what
    // makes the helix frame list descend and the ring list ascend.
    shape(/subq\.b\t#1,\(v_ani0_frame\)/, 'channel 0 counting DOWN');
    shape(/addq\.b\t#1,\(v_ani1_frame\)/, 'channel 1 counting UP');
    // Channel 3 is the accumulator: rol.w #7 + andi.w #3 → (buf >> 9) & 3.
    shape(/rol\.w\t#7,d0/, "channel 3's rol.w #7 accumulator shift");
    shape(/andi\.w\t#3,d0/, "channel 3's mod-4 mask");

    for (const { id, entry } of allSyncRows) {
      if (entry.channel === 3) continue; // accumulator: no fixed rate to read
      expect(entry.framesPerStep, `${NOT_OURS} obj ${id.toString(16)} rate vs ${where}`)
        .toBe(rate(entry.channel));
      expect(entry.frames.length, `${NOT_OURS} obj ${id.toString(16)} modulus vs ${where}`)
        .toBe(mask(entry.channel) + 1);
    }
  });

  currency('each consumer instruction exists where the table says it does', (rev, repo) => {
    const read = (path: string): string => {
      const at = readAtRev(repo, rev, path);
      // Not a skip: the revision RESOLVED, so this was measured, and "the file
      // is gone at the tip" is drift of the loudest kind.
      expect(at.ok, at.ok ? '' : `${NOT_OURS} ${at.why}`).toBe(true);
      if (!at.ok) throw new Error(at.why);
      process.stdout.write(`  [currency] ${path} @ ${rev} blob ${at.blob} (${at.text.length} chars)\n`);
      return at.text;
    };
    const rings = read('_incObj/25, 37 Rings.asm');
    const giant = read('_incObj/4B, 7C Giant Ring and Flash.asm');
    const helix = read('_incObj/17 GHZ Spiked Pole Helix.asm');

    /**
     * ⚠ EVERY FAILURE HERE IS ABOUT ANOTHER REPOSITORY, so every failure has to
     * SAY SO. A bare `expect(giant).toMatch(/…/)` reports "expected '; ====…'
     * to match /move\.b…/" — an unreadable 16 KB haystack, no file name, no
     * revision, and nothing telling the reader this is not an Aurora bug.
     * Measured 2026-09-02 while proving this row red: that is exactly what the
     * first poisoned run printed.
     */
    const cites = (text: string, file: string, pattern: RegExp, what: string): void => {
      expect(
        pattern.test(text),
        `${NOT_OURS}\n`
        + `  ${file} at ${S1_TIP} (${rev}) no longer contains ${what}\n`
        + `  looked for:  ${pattern.source}\n`
        + '  S1_OBJECT_ANIMS cites this instruction as the consumer of its sync channel;\n'
        + '  if the engine changed, the table and its per-row citations need re-deriving.\n'
        + `  Re-read with:  git -C ${repo} show ${rev}:'${file}'`,
      ).toBe(true);
    };
    // Obj25 + Obj4B copy the shared channel-1 frame straight into obFrame.
    cites(rings, '_incObj/25, 37 Rings.asm', /move\.b\t\(v_ani1_frame\)\.w,obFrame\(a0\)/, 'the channel-1 frame copy');
    cites(giant, '_incObj/4B, 7C Giant Ring and Flash.asm', /move\.b\t\(v_ani1_frame\)\.w,obFrame\(a0\)/, 'the channel-1 frame copy');
    // Obj37 reads the channel-3 accumulator frame; its timer is seeded 255.
    cites(rings, '_incObj/25, 37 Rings.asm', /move\.b\t\(v_ani3_frame\)\.w,obFrame\(a0\)/, 'the channel-3 frame copy');
    cites(rings, '_incObj/25, 37 Rings.asm', /move\.b\t#255,\(v_ani3_time\)\.w/, 'the 255-frame loss-timer seed');
    // Obj17 ADDS a per-instance base before masking — the disclosed offset.
    cites(helix, '_incObj/17 GHZ Spiked Pole Helix.asm', /move\.b\t\(v_ani0_frame\)\.w,d0/, 'the channel-0 frame read');
    cites(helix, '_incObj/17 GHZ Spiked Pole Helix.asm', /add\.b\thelix_frame\(a0\),d0/, 'the per-instance helix_frame offset');
    cites(helix, '_incObj/17 GHZ Spiked Pole Helix.asm', /andi\.b\t#7,d0/, 'the mod-8 mask');
  });

  currency('no fifth consumer hides in _incObj (the table is complete)', (rev, repo) => {
    // The completeness claim: v_ani*_frame is read by exactly the transcribed
    // files. (sonic.asm holds only the updater; Special Stage Loading &
    // Drawing is the SS-only reuse, out of level scope by design.)
    //
    // ⚠ THIS IS THE ROW THE WHOLE SPLIT EXISTS FOR. Pointed at a vendored copy
    // of `_incObj` it would be answering its own question with its own input:
    // the copy holds three matches because it was made from a tree that held
    // three, so it could not go red if a fifth consumer landed tomorrow.
    const hits = grepAtRev(repo, rev, 'v_ani[0-9]_frame', ['_incObj']);
    expect(hits.ok, hits.ok ? '' : `${NOT_OURS} ${(hits as { why: string }).why}`).toBe(true);
    if (!hits.ok) return;
    const names = hits.files.map((p) => p.split('/').pop()).sort();
    // PRINT THE ARTIFACT THIS ROW JUDGES — the actual match list, at a named
    // revision, so a reader of the run output can see what was searched.
    process.stdout.write(`  [currency] v_ani[0-9]_frame in _incObj @ s1disasm ${rev}: `
      + `${hits.files.length} file(s): ${names.join(' | ')}\n`);
    expect(
      names,
      `${NOT_OURS}\n`
      + `  searched _incObj/ at ${S1_TIP} (${rev}) for v_ani[0-9]_frame\n`
      + '  The SynchroAnimate consumer set has changed. S1_OBJECT_ANIMS transcribes four\n'
      + '  consumers (17, 25, 37, 4B); re-derive the table from the new set, then update\n'
      + `  the per-row citations. Re-read with:  git -C ${repo} grep -lE 'v_ani[0-9]_frame' ${rev} -- _incObj`,
    ).toEqual([
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
