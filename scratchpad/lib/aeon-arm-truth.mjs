/**
 * ═══════════════════════════════════════════════════════════════════════════
 * WHICH PRESET EACH SECTION BINDS, AND WHICH SECTIONS ARE BARRED, FROM aeon's
 * OWN FILES, FOR THE HARNESSES THAT CHECK AURORA'S SCREEN AGAINST THEM
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * (2026-09-14, SECTIONS-0-7-UNBARRED-AFTER-REGIONS; packet
 * docs/reviews/2026-09-14-sections-0-7-regions-reader.md.)
 *
 * ⚠ DELIBERATELY NOT AN IMPORT OF src/core/formats/effects/section-wiring.ts.
 * A harness that expects what the app's own module computes can only ever
 * agree with the app. This file reads aeon's act_descriptor.emp and
 * <zone>_effects.emp itself, with its OWN algorithm: one forward pass keeping a
 * stack of open calls, where the module walks backward from each `effects:` to
 * its enclosing paren. The two share the RULE (a row's preset belongs to the
 * `sec:` inside its own call) and nothing else.
 *
 * WHY THE RULE AND NOT THE ORDER. In aeon's region rows (aeon 1a657990, regions
 * step 4) `effects:` is written BEFORE the `sec:` that keys it, inside a nested
 * sidecar call:
 *
 *   ojz_region(x0: 0, …, effects: OJZ_Preset_Sec0, parallax: ojz_act1_sec_scene(sec: 0)),
 *
 * The harnesses' previous parse split the file on `ojz_sec(sec: N` and found
 * nothing after step 4, so every expectation it produced was `undefined`
 * (measured by the controller on master and on this branch alike). Splitting on
 * any `sec: N` and searching forward instead would give every section its
 * NEIGHBOUR's preset. Pairing by the enclosing call reads both the old
 * `ojz_sec(sec: N, …, effects: X)` rows and the region rows.
 *
 * BARRED means the preset a section's own row binds passes a non-zero
 * `patched:` in its own `preset(...)` call (aeon's preset() refuses a raster:
 * beside a patched:). Read from the declarations, never from aeon's prose: its
 * ojz_effects.emp states "THE BARRED SET IS [0, 7]" in a comment and tells the
 * reader in the next sentence not to derive it from there.
 */

/**
 * `//` comments and string-literal contents replaced by spaces, offsets and
 * newlines kept, so parentheses inside prose or an ensure message cannot
 * unbalance a call.
 */
export function maskCommentsAndStrings(src) {
  const out = src.split('');
  let i = 0;
  while (i < src.length) {
    if (src[i] === '/' && src[i + 1] === '/') {
      while (i < src.length && src[i] !== '\n') out[i++] = ' ';
    } else if (src[i] === '"') {
      i++;
      while (i < src.length && src[i] !== '"' && src[i] !== '\n') {
        if (src[i] === '\\' && src[i + 1] !== undefined && src[i + 1] !== '\n') out[i++] = ' ';
        out[i++] = ' ';
      }
      i++;
    } else {
      i++;
    }
  }
  return out.join('');
}

const WORD = /[A-Za-z0-9_]/;

/**
 * Every `<zone>_region(...)` / `<zone>_sec(...)` CALL that names an `effects:`
 * preset, with the numeric `sec:` values anywhere inside its own parentheses.
 * One forward pass: `(` pushes a frame naming its callee, `)` pops it and hands
 * its keys to the frame around it, so a key in a nested sidecar call belongs to
 * the row that encloses it.
 */
export function regionBindings(descText, zone = 'ojz') {
  const code = maskCommentsAndStrings(descText);
  const constructors = new Set([`${zone}_region`, `${zone}_sec`]);
  const stack = [];
  const rows = [];
  let line = 1;
  for (let i = 0; i < code.length; i++) {
    const ch = code[i];
    if (ch === '\n') { line++; continue; }
    if (ch === '(') {
      let j = i - 1;
      while (j >= 0 && /\s/.test(code[j])) j--;
      let k = j;
      while (k >= 0 && WORD.test(code[k])) k--;
      const callee = code.slice(k + 1, j + 1);
      const decl = /\bfn\s+$/.test(code.slice(Math.max(0, k - 40), k + 1));
      stack.push({ callee, decl, line, effects: [], secs: new Set() });
      continue;
    }
    if (ch === ')') {
      const f = stack.pop();
      if (f === undefined) continue;
      if (stack.length > 0) for (const s of f.secs) stack[stack.length - 1].secs.add(s);
      if (!f.decl && constructors.has(f.callee) && f.effects.length > 0) {
        rows.push({ callee: f.callee, line: f.line, effects: f.effects,
          secs: [...f.secs].sort((a, b) => a - b) });
      }
      continue;
    }
    if (stack.length === 0 || (i > 0 && WORD.test(code[i - 1]))) continue;
    const top = stack[stack.length - 1];
    const eff = /^effects\s*:\s*([A-Za-z_][A-Za-z0-9_]*)/.exec(code.slice(i, i + 200));
    if (eff) { top.effects.push(eff[1]); i += eff[0].length - 1; continue; }
    const sec = /^sec\s*:\s*(\d+)(?![A-Za-z0-9_])/.exec(code.slice(i, i + 40));
    if (sec) { top.secs.add(Number(sec[1])); i += sec[0].length - 1; }
  }
  const keyed = {};
  const unkeyed = [];
  for (const r of rows) {
    for (const preset of r.effects) {
      if (r.secs.length === 1) (keyed[r.secs[0]] ??= []).push({ preset, line: r.line });
      else unkeyed.push({ preset, line: r.line, secs: r.secs, callee: r.callee });
    }
  }
  const bind = {};
  const contested = [];
  for (const [s, list] of Object.entries(keyed)) {
    if (new Set(list.map((x) => x.preset)).size === 1) bind[Number(s)] = list[0].preset;
    else contested.push({ section: Number(s), rows: list });
  }
  return { bind, rows: rows.length, unkeyed, contested };
}

/**
 * `{preset record: the non-zero program its OWN preset(...) call passes as
 * patched:}`, reading only the call's TOP-LEVEL arguments.
 */
export function presetsBindingPatched(libText) {
  const code = maskCommentsAndStrings(libText);
  const out = {};
  let declared = 0;
  for (const m of code.matchAll(/\bdata\s+([A-Za-z_][A-Za-z0-9_]*)\s*:\s*EffectsPreset\s*=\s*preset\s*\(/g)) {
    declared++;
    let depth = 0;
    let arg = '';
    for (let j = m.index + m[0].length - 1; j < code.length; j++) {
      const ch = code[j];
      if (ch === '(' || ch === '[' || ch === '{') { depth++; if (depth === 1) continue; }
      if (ch === ')' || ch === ']' || ch === '}') { depth--; if (depth === 0) break; }
      if (depth === 1 && ch === ',') {
        const p = /^\s*patched\s*:\s*([A-Za-z_][A-Za-z0-9_]*|\d+)\s*$/.exec(arg);
        if (p && p[1] !== '0') out[m[1]] = p[1];
        arg = '';
        continue;
      }
      if (depth >= 1) arg += ch;
    }
    const last = /^\s*patched\s*:\s*([A-Za-z_][A-Za-z0-9_]*|\d+)\s*$/.exec(arg);
    if (last && last[1] !== '0') out[m[1]] = last[1];
  }
  return { patched: out, declared };
}

/**
 * The sections some preset THREADS the raster chooser on:
 * `raster: <zone>_<act>_sec_raster(sec: N, …)`, comments and strings masked.
 * aeon binds a rasterRef on exactly these (its own content tests pin the bound
 * set to the threaded one), so a harness that needs a section aeon ships
 * UNBOUND takes one outside this set, never one it merely finds unbound on the
 * copy's disk, which a prior run's leftover could have changed.
 */
export function threadedSections(libText, zone = 'ojz', act = 'act1') {
  const code = maskCommentsAndStrings(libText);
  const re = new RegExp(`\\braster\\s*:\\s*${zone}_${act}_sec_raster\\s*\\(\\s*sec\\s*:\\s*(\\d+)`, 'g');
  return [...new Set([...code.matchAll(re)].map((m) => Number(m[1])))].sort((a, b) => a - b);
}

/**
 * The whole reading a harness needs: bindings, the patched arms, the barred
 * sections and the threaded ones, each derived from the two files' text.
 */
export function aeonArmTruth(descText, libText, zone = 'ojz', act = 'act1') {
  const b = regionBindings(descText, zone);
  const p = presetsBindingPatched(libText);
  const barred = Object.keys(b.bind).map(Number)
    .filter((s) => p.patched[b.bind[s]] !== undefined).sort((a, c) => a - c);
  return { ...b, patched: p.patched, presetsDeclared: p.declared, barred,
    threaded: threadedSections(libText, zone, act) };
}
