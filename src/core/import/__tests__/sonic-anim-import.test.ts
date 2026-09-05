// `_anim/Sonic.asm` (sonani dialect) parser — integrity tests against the REAL
// s1disasm file (read-only). Nothing here is an invented fixture:
//
//   1. ROUND-TRIP: an INDEPENDENT in-test resolver (its own regexes over the
//      same file: fr_* equ lines, af* constants from _Constants.asm semantics,
//      id_* table order) re-derives every script's byte list, and the parser's
//      bytes must equal it for all entries. Entry count comes from counting the
//      file's own `sonani` rows — never a constant.
//   2. TAMPER: a copy with ONE frame token swapped (fr_Walk13 → fr_Walk14 in
//      SonAni_Walk) must parse to DIFFERENT bytes at that position — proving
//      the round-trip assertion is load-bearing, not vacuous.
//   3. DIALECT HONESTY: the five negative-first-byte scripts are surfaced as
//      special modes ($FF walk/run, $FE roll, $FD push — audit §1.4), never as
//      fake durations; regular scripts keep raw N durations (N ⇒ N+1 ticks per
//      the 2026-08-21 live study).

import { describe, it, expect } from 'vitest';
import { readFileSync, mkdtempSync, writeFileSync, rmSync } from 'fs';
import { describeRequiringFixture, referencePath, S1_PINNED } from '../../../../test/support/fixture-tree';
import { join } from 'path';
import { tmpdir } from 'os';
import {
  parseSonicAnimTable,
  sonicSpecialScripts,
} from '../sonic-anim-import';

const SONIC_ASM = referencePath(S1_PINNED, '_anim/Sonic.asm');
/**
 * `describe`, but a skip here says WHY — read by scripts/skip-report-reporter.mjs.
 * The bare `treePresent ? describe : describe.skip` this replaced produced rows
 * indistinguishable from passes in a suite total.
 *
 * It is NOT `describe(name, { skip }, fn)`, because that form still EXECUTES
 * `fn` at collection: the block below reads SONIC_ASM in its body and derives a
 * whole independent reference resolver from the text, so on a machine without
 * s1disasm the read threw during collection and took this entire file with it —
 * 7 tests, reported as a file-level FAIL rather than as any kind of skip.
 * Measured 2026-08-29, docs/reviews/2026-08-29-fixture-absent-honesty.md.
 */
const guarded = (name: string, fn: () => void): void => {
  describeRequiringFixture(name, SONIC_ASM, 'the real _anim/Sonic.asm sonani table', fn);
};

guarded('parseSonicAnimTable: round-trip against the real file', () => {
  const text = readFileSync(SONIC_ASM, 'utf8');
  const parse = parseSonicAnimTable(text);

  // ---- Independent reference resolver (test-local, deliberately separate
  // code from the parser: regex sweep of the same file). --------------------
  const lines = text.split(/\r?\n/).map((l) => l.replace(/;.*$/, ''));
  const equ: Record<string, number> = {};
  for (const l of lines) {
    const m = l.match(/^(\w+):\s*equ\s+(\$?[0-9A-Fa-f]+)\s*$/);
    if (m) equ[m[1]] = m[2].startsWith('$') ? parseInt(m[2].slice(1), 16) : parseInt(m[2], 10);
  }
  // Table rows in order — the ONLY source of the entry count.
  const tableRows = lines
    .map((l) => l.match(/^(id_\w+):\s*sonani\s+(\w+)/))
    .filter((m): m is RegExpMatchArray => !!m)
    .map((m) => ({ idLabel: m[1], scriptLabel: m[2] }));
  const idIndex: Record<string, number> = {};
  tableRows.forEach((r, i) => { idIndex[r.idLabel] = i; });
  // af* control values: _Constants.asm:305-310 semantics (symbolic in source).
  const AF: Record<string, number> = { afEnd: 0xff, afBack: 0xfe, afChange: 0xfd };
  const resolveTok = (tok: string): number => {
    if (/^\$[0-9A-Fa-f]+$/.test(tok)) return parseInt(tok.slice(1), 16);
    if (/^\d+$/.test(tok)) return parseInt(tok, 10);
    if (tok in AF) return AF[tok];
    if (tok in equ) return equ[tok];
    if (tok in idIndex) return idIndex[tok];
    throw new Error(`reference resolver: unknown token "${tok}"`);
  };
  /** All dc.b bytes of one labelled block, resolved. */
  const refBytes = (label: string): number[] => {
    const start = lines.findIndex((l) => l.match(new RegExp(`^${label}:`)));
    expect(start).toBeGreaterThanOrEqual(0);
    const out: number[] = [];
    for (let i = start; i < lines.length; i++) {
      const body = i === start ? lines[i].replace(new RegExp(`^${label}:`), '') : lines[i];
      if (i > start && /^\w+:/.test(lines[i])) break; // next label
      const m = body.trim().match(/^dc\.b\s+(.*)$/);
      if (!m) { if (body.trim() === 'even') break; continue; }
      for (const tok of m[1].split(',').map((s) => s.trim()).filter(Boolean)) out.push(resolveTok(tok));
    }
    return out;
  };

  it('parses cleanly: no problems, entry count == the file\'s own sonani row count', () => {
    expect(parse.problems).toEqual([]);
    expect(tableRows.length).toBeGreaterThan(0); // anti-vacuous: the reference saw the table
    expect(parse.entries.length).toBe(tableRows.length);
  });

  it('every entry round-trips: id order, labels and resolved bytes match the independent resolver', () => {
    parse.entries.forEach((e, i) => {
      expect(e.id).toBe(i);
      expect(e.idLabel).toBe(tableRows[i].idLabel);
      expect(e.scriptLabel).toBe(tableRows[i].scriptLabel);
      expect(e.bytes).toEqual(refBytes(e.scriptLabel));
    });
  });

  it('the five special scripts carry their MODE (never a fake duration)', () => {
    const specials = parse.entries.filter((e) => e.special !== null);
    expect(specials.map((e) => [e.scriptLabel, e.special])).toEqual([
      ['SonAni_Walk', 'walkrun'],   // dc.b $FF
      ['SonAni_Run', 'walkrun'],    // dc.b $FF
      ['SonAni_Roll', 'roll'],      // dc.b $FE
      ['SonAni_Roll2', 'roll'],     // dc.b $FE
      ['SonAni_Push', 'push'],      // dc.b $FD
    ]);
    for (const s of specials) {
      expect(s.duration).toBeNull(); // honesty: the byte is a mode marker
      // Audit §1.4: every special script is padded to exactly 6 body frames +
      // afEnd — the interpreter's switch-without-reset contract.
      expect(s.bytes.length).toBe(8); // marker + 6 + afEnd
      expect(s.bytes[7]).toBe(0xff);
    }
  });

  it('regular scripts keep raw durations and frame ids resolved through fr_* equates', () => {
    const byLabel = new Map(parse.entries.map((e) => [e.scriptLabel, e]));
    const wait = byLabel.get('SonAni_Wait')!;
    // Derived from the file, not invented: first byte of the block, fr_ values
    // from the equ table the test read itself.
    const waitRef = refBytes('SonAni_Wait');
    expect(wait.duration).toBe(waitRef[0]);
    expect(wait.frames).toEqual(waitRef.slice(1, waitRef.length - 2)); // body minus afBack,2
    expect(wait.control).toEqual({ kind: 'back', count: waitRef[waitRef.length - 1] });
    // afChange arguments resolve through the id_* labels the table defined.
    const spring = byLabel.get('SonAni_Spring')!;
    expect(spring.control).toEqual({ kind: 'change', animId: idIndex['id_Walk'] });
  });

  it('sonicSpecialScripts exposes the five bodies by engine label (lea targets)', () => {
    const scripts = sonicSpecialScripts(parse);
    expect(scripts).not.toBeNull();
    expect(scripts!.walk).toEqual(refBytes('SonAni_Walk').slice(1));
    expect(scripts!.run).toEqual(refBytes('SonAni_Run').slice(1));
    expect(scripts!.roll).toEqual(refBytes('SonAni_Roll').slice(1));
    expect(scripts!.roll2).toEqual(refBytes('SonAni_Roll2').slice(1));
    expect(scripts!.push).toEqual(refBytes('SonAni_Push').slice(1));
  });

  it('TAMPER: a planted wrong byte in a temp copy fails the round-trip', () => {
    const dir = mkdtempSync(join(tmpdir(), 'sonic-anim-tamper-'));
    try {
      // Swap ONE token inside SonAni_Walk's frame row. The row is unique:
      // it is the only dc.b line starting with fr_Walk13.
      const tampered = text.replace(/^(\s*dc\.b\s+)fr_Walk13,/m, '$1fr_Walk14,');
      expect(tampered).not.toBe(text); // the plant landed
      const p = join(dir, 'Sonic.asm');
      writeFileSync(p, tampered);
      const evil = parseSonicAnimTable(readFileSync(p, 'utf8'));
      const walk = evil.entries.find((e) => e.scriptLabel === 'SonAni_Walk')!;
      const real = parse.entries.find((e) => e.scriptLabel === 'SonAni_Walk')!;
      // The equality the round-trip test relies on MUST now fail:
      expect(walk.bytes).not.toEqual(real.bytes);
      expect(walk.bytes[1]).toBe(equ['fr_Walk14']);
      expect(real.bytes[1]).toBe(equ['fr_Walk13']);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('refuses noisily on tokens outside the dialect', () => {
    const bad = 'Ani_Sonic:\nid_X:\tsonani\tSonAni_X\t; $00\nSonAni_X:\tdc.b 3\n\tdc.b mystery_frame\n\tdc.b afEnd\n\teven\n';
    const p = parseSonicAnimTable(bad);
    expect(p.problems.some((m) => m.includes('mystery_frame'))).toBe(true);
  });
});
