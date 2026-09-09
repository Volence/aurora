#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────────────────────
// WHAT A SESSION MAY HONESTLY SAY ABOUT ITS OWN CONTEXT
//
// The clear-rule (docs/OVERSEER.md) asks a lane to report a MEASUREMENT rather
// than a feeling, because a session near its limit is the least able to judge
// that it is. This is the measurement, and it is read from an artifact on disk
// rather than from the session's own sense of itself.
//
// ⚠ IT IS NOT THE `<total_tokens>` COUNTER, AND THAT COUNTER MUST NOT BE USED
// FOR THIS. Measured 2026-09-09 in the aurora lane: that counter RESET UPWARD
// mid-session (~13.65M -> 15.0M). A percentage derived from it therefore has a
// confident shape and no meaning. It is a budget, not an occupancy.
//
// WHAT THIS READS INSTEAD: every assistant turn in the session transcript
// carries a `usage` record, and
//
//     input_tokens + cache_read_input_tokens + cache_creation_input_tokens
//
// is exactly the context that was SENT that turn. It is a real number, produced
// by the server rather than by the session, and it is monotonic within a
// context window — so a LARGE DROP in the series is a compaction, which is the
// event the clear-rule exists to stop a lane drifting through unnoticed.
//
// ⚠ THE DENOMINATOR IS NOT IN THIS FILE AND IS NOT GUESSED. This prints the
// numerator, the trend and whether a compaction has happened. If you do not
// know your window size, report the absolute number and say the denominator is
// unknown — "loud on unmeasurable" beats a percentage nobody can check.
//
// USAGE:  node scratchpad/context-usage.mjs [session-id]
// The id is the last path component of the scratchpad directory this session
// was given. With no argument it takes the most recently modified transcript
// for this project, which is the live one — verify the id it prints.
// ─────────────────────────────────────────────────────────────────────────────
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const dir = join(homedir(), '.claude', 'projects', '-home-volence-sonic-hacks-aurora');
const arg = process.argv[2];
let file;
if (arg) {
  file = join(dir, `${arg}.jsonl`);
} else {
  const files = readdirSync(dir).filter((f) => f.endsWith('.jsonl'))
    .map((f) => ({ f, m: statSync(join(dir, f)).mtimeMs }))
    .sort((a, b) => b.m - a.m);
  if (!files.length) { console.error('context-usage: NO TRANSCRIPT FOUND — cannot measure, and that is the answer to report.'); process.exit(2); }
  file = join(dir, files[0].f);
}

let text;
try { text = readFileSync(file, 'utf8'); }
catch (e) { console.error(`context-usage: CANNOT READ ${file} (${e.code}) — report "unmeasurable", never a feeling.`); process.exit(2); }

const series = [];
for (const line of text.split('\n')) {
  if (!line.trim()) continue;
  let r; try { r = JSON.parse(line); } catch { continue; }
  const u = r?.message?.usage;
  if (!u) continue;
  const ctx = (u.input_tokens ?? 0) + (u.cache_read_input_tokens ?? 0) + (u.cache_creation_input_tokens ?? 0);
  if (ctx > 1000) series.push(ctx);
}

if (!series.length) {
  console.error('context-usage: transcript has NO usage records — UNMEASURABLE, and say so.');
  process.exit(2);
}

const DROP = 50_000;
const drops = [];
for (let i = 1; i < series.length; i += 1) {
  if (series[i] < series[i - 1] - DROP) drops.push([i, series[i - 1], series[i]]);
}

console.log(`transcript: ${file}`);
console.log(`assistant turns with usage: ${series.length}`);
console.log(`context sent, first turn: ${series[0].toLocaleString()} tokens`);
console.log(`context sent, LAST turn:  ${series.at(-1).toLocaleString()} tokens   <- report this`);
console.log(`peak: ${Math.max(...series).toLocaleString()}`);
console.log(drops.length
  ? `COMPACTIONS DETECTED: ${drops.length} — ${drops.map(([i, a, b]) => `turn ${i}: ${a.toLocaleString()} -> ${b.toLocaleString()}`).join('; ')}`
  : 'compactions: NONE — the series never dropped, so this session has not been through one.');
console.log('denominator: NOT MEASURED HERE. Report the absolute number unless you know the window size.');
