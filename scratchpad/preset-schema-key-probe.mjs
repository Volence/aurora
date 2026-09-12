// preset-schema-key-probe.mjs — read-only execution evidence for
// docs/reviews/2026-09-12-preset-schema-key.md.
//
// QUESTION: can any Aurora save path write an effects preset file with no
// top-level "schema" key (or with a value aeon refuses)?
//
// It bundles Aurora's OWN modules (the codec, the provider's command factories,
// EditHistory, the save plan's removal rule) with esbuild into a throwaway file
// under $PROBE_OUT_DIR (default: the OS temp dir), imports that bundle, and
// drives each writer path on schema-less / wrong-schema input. It writes nothing
// into any project tree; the "file access" the loader reads is an in-memory fake.
//
// Run from the worktree root:  node scratchpad/preset-schema-key-probe.mjs
// Exit 0 = every assertion held; 1 = one failed (printed as FAIL).

import * as esbuild from 'esbuild';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const root = resolve(new URL('..', import.meta.url).pathname);
const outDir = mkdtempSync(join(process.env.PROBE_OUT_DIR ?? tmpdir(), 'preset-schema-probe-'));
const outfile = join(outDir, 'bundle.mjs');

await esbuild.build({
  stdin: {
    contents: `
      export * from './src/core/formats/effects/preset';
      export {
        newPreset, createPresetCommand, editPresetCommand, replacePresetCommand,
        addBandCommand, setPresetNameCommand, setProgramArmCommand, presetIdRefusal,
      } from './src/renderer/providers/effects-preset';
      export { EditHistory } from './src/core/editing/history';
      export { removalsFor } from './src/core/project/aeon/save';
    `,
    resolveDir: root,
    loader: 'ts',
  },
  bundle: true, platform: 'node', format: 'esm', outfile, logLevel: 'error',
});
const m = await import(pathToFileURL(outfile).href);

let failures = 0;
const row = (label, ok, detail) => {
  if (!ok) failures++;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}${detail ? `\n       ${detail}` : ''}`);
};
const firstLine = (e) => String(e?.message ?? e).split('\n').slice(0, 2).join(' | ');
const attempt = (fn) => { try { return { value: fn() }; } catch (e) { return { error: e }; } };
/** Serialize and report the "schema" member of what would reach disk. */
const onDisk = (preset) => {
  const r = attempt(() => m.serializeEffectsPreset(preset));
  if (r.error) return { refused: firstLine(r.error) };
  const doc = JSON.parse(r.value);
  return { hasKey: Object.prototype.hasOwnProperty.call(doc, 'schema'), schema: doc.schema, text: r.value };
};
const emptyLibrary = () => ({ presets: [], unreadable: [], notices: [], loadedPaths: [] });
const levelOf = (library) => ({ effectsPresets: library });
const DATA_ROOT = 'games/sonic4/data/';

console.log(`bundle: ${outfile}`);
console.log(`schema.required = ${JSON.stringify(m.EFFECTS_PRESET_SCHEMA.required)}; ` +
  `properties.schema = ${JSON.stringify({ const: m.EFFECTS_PRESET_SCHEMA.properties.schema.const })}`);

// ── (i) a brand-new preset, the panel's Create path ────────────────────────
{
  console.log('\n(i) brand-new preset: createPresetCommand -> EditHistory.execute -> serialize');
  const lib = emptyLibrary();
  const h = new m.EditHistory();
  const res = m.createPresetCommand(lib, 'probe_new');
  row('createPresetCommand accepted a legal id', res.ok === true);
  h.execute(res.command, levelOf(lib));
  const d = onDisk(lib.presets[0]);
  row('new preset serializes WITH "schema": 1', d.hasKey === true && d.schema === 1,
    d.refused ?? `written text: ${JSON.stringify(d.text)}`);
}

// ── (ii) an edited preset re-saved, through every whole-document mutator ───
{
  console.log('\n(ii) edited preset re-saved: add band, rename, switch through all four program arms, undo');
  const lib = emptyLibrary();
  const h = new m.EditHistory();
  h.execute(m.createPresetCommand(lib, 'probe_edit').command, levelOf(lib));
  const steps = [
    ['addBandCommand', () => m.addBandCommand(lib, 'probe_edit')],
    ['setPresetNameCommand', () => m.setPresetNameCommand(lib, 'probe_edit', 'Probe')],
    ...['ramp', 'base_swap', 'boundary', 'bands'].map((arm) =>
      [`setProgramArmCommand -> ${arm}`, () => m.setProgramArmCommand(lib, 'probe_edit', arm)]),
  ];
  for (const [label, make] of steps) {
    const cmd = make();
    if (cmd) h.execute(cmd, levelOf(lib));
    const d = onDisk(lib.presets[0]);
    row(`${label}: re-save keeps "schema": 1`, d.hasKey === true && d.schema === 1,
      d.refused ?? `keys on disk: ${Object.keys(JSON.parse(d.text)).join(',')}`);
  }
  while (h.canUndo) h.undo(levelOf(lib));
  row('undo all the way back empties the library (create undone)', lib.presets.length === 0);
}

// ── (iii) a preset LOADED without a "schema" key, then saved ───────────────
{
  console.log('\n(iii) a schema-less preset on disk: load, then what a save can do with it');
  const dir = `${DATA_ROOT}editor/effects/presets/`;
  const files = new Map([
    [`${dir}legacy_noschema.json`, JSON.stringify({ id: 'legacy_noschema', bands: [
      { top: 112, bot: 128, sh: false, on: { cram: { addr: 74, colours: [0] } } }] })],
    [`${dir}good_one.json`, JSON.stringify({ schema: 1, id: 'good_one', bands: [
      { top: 112, bot: 128, sh: false, on: { cram: { addr: 74, colours: [0] } } }] })],
  ]);
  const fa = {
    exists: async (p) => p === dir || files.has(p),
    list: async (p) => (p === dir ? [...files.keys()].map((k) => k.slice(dir.length)) : []),
    read: async (p) => new TextEncoder().encode(files.get(p)),
  };
  const direct = attempt(() => m.parseEffectsPreset(files.get(`${dir}legacy_noschema.json`), 'legacy_noschema'));
  row('parseEffectsPreset REFUSES the schema-less document', !!direct.error, direct.error && firstLine(direct.error));
  const lib = await m.loadEffectsPresetLibrary(fa, DATA_ROOT);
  row('loader: schema-less file is NOT in presets (so save.ts:598 never serializes it)',
    !lib.presets.some((p) => p.id === 'legacy_noschema'), `presets: ${JSON.stringify(lib.presets.map((p) => p.id))}`);
  row('loader: schema-less file IS in unreadable', lib.unreadable.some((u) => u.path.endsWith('/legacy_noschema.json')),
    `unreadable: ${JSON.stringify(lib.unreadable.map((u) => u.path))}`);
  row('loader: schema-less file is NOT in loadedPaths (no save may remove it)',
    !lib.loadedPaths.some((p) => p.endsWith('/legacy_noschema.json')), `loadedPaths: ${JSON.stringify(lib.loadedPaths)}`);
  const removals = m.removalsFor(lib.loadedPaths, [], lib.unreadable.map((u) => u.path), (p) => p);
  row('removalsFor never lists the schema-less file, even with nothing kept',
    !removals.some((r) => r.path.endsWith('/legacy_noschema.json')), `removals: ${JSON.stringify(removals.map((r) => r.path))}`);
  const refusal = m.presetIdRefusal('legacy_noschema', lib);
  row('create-time id refusal: the schema-less file\'s id cannot be taken', typeof refusal === 'string', refusal);
  console.log('       => the file is never rewritten WITH or WITHOUT a key: Aurora neither fixes nor erases it;');
  console.log('          it stays on disk exactly as the author left it, and aeon will refuse it at build.');
}

// ── (iv) an agent-supplied preset via set_effects_preset ──────────────────
{
  console.log('\n(iv) agent set_effects_preset: agent-handler.ts:1119 parse -> :1129 replace -> save serialize');
  const band = { top: 112, bot: 128, sh: false, on: { cram: { addr: 74, colours: [0] } } };
  const cases = [
    ['no "schema" key', { id: 'agent_p', bands: [band] }],
    ['"schema": 2', { schema: 2, id: 'agent_p', bands: [band] }],
    ['"schema": "1"', { schema: '1', id: 'agent_p', bands: [band] }],
    ['"schema": true (aeon\'s Python would ACCEPT this: True == 1)', { schema: true, id: 'agent_p', bands: [band] }],
    ['"schema": null', { schema: null, id: 'agent_p', bands: [band] }],
  ];
  for (const [label, doc] of cases) {
    const r = attempt(() => m.parseEffectsPreset(JSON.stringify(doc), 'agent_p'));
    row(`agent ${label}: REFUSED at parse, before any command exists`, !!r.error, r.error && firstLine(r.error));
  }
  const lib = emptyLibrary();
  const h = new m.EditHistory();
  const parsed = m.parseEffectsPreset(JSON.stringify({ schema: 1, id: 'agent_p', bands: [band] }), 'agent_p');
  h.execute(m.replacePresetCommand(lib, 'agent_p', parsed), levelOf(lib));
  const d = onDisk(lib.presets[0]);
  row('agent "schema": 1: accepted, and the save text carries "schema": 1', d.hasKey === true && d.schema === 1, d.refused);
  const float = attempt(() => m.parseEffectsPreset('{"schema": 1.0, "id": "agent_p", "bands": ' +
    JSON.stringify([band]) + '}', 'agent_p'));
  const fd = float.error ? { refused: firstLine(float.error) } : onDisk(float.value);
  row('agent "schema": 1.0 (JSON): accepted and re-written as the integer 1',
    fd.hasKey === true && fd.schema === 1 && /"schema": 1,?\n/.test(fd.text), fd.refused ?? JSON.stringify(fd.text?.split('\n').find((l) => l.includes('schema'))));
}

// ── (v) the writer's own gate, fed an in-memory preset that lacks the key ──
{
  console.log('\n(v) serializeEffectsPreset fed a schema-less / wrong-schema object directly (a hypothetical code bug)');
  const band = { top: 112, bot: 128, sh: false, on: { cram: { addr: 74, colours: [0] } } };
  for (const [label, obj] of [
    ['no "schema" key', { id: 'p', bands: [band] }],
    ['"schema": undefined (own property)', { schema: undefined, id: 'p', bands: [band] }],
    ['"schema": 2', { schema: 2, id: 'p', bands: [band] }],
    ['"schema": true', { schema: true, id: 'p', bands: [band] }],
  ]) {
    const d = onDisk(obj);
    row(`serialize ${label}: REFUSED, nothing to write`, !!d.refused, d.refused);
  }
  // A mutator that deletes the key — no shipped mutator does; this is what a
  // future one would meet.
  const lib = emptyLibrary();
  const h = new m.EditHistory();
  h.execute(m.createPresetCommand(lib, 'probe_bug').command, levelOf(lib));
  const cmd = m.editPresetCommand(lib, 'probe_bug', 'hypothetical bad mutator', (p) => { delete p.schema; });
  row('a mutator CAN build such a command (no guard at command time)', cmd !== null);
  h.execute(cmd, levelOf(lib));
  row('...and history places it (the in-memory preset now lacks the key)', !('schema' in lib.presets[0]));
  const d = onDisk(lib.presets[0]);
  row('...but the save-path serializer REFUSES it: the save throws, no file is written', !!d.refused, d.refused);
}

console.log(`\n${failures === 0 ? 'ALL ROWS HELD' : `${failures} ROW(S) FAILED`}`);
process.exit(failures === 0 ? 0 : 1);
