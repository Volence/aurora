# Can any Aurora save path write an effects preset with no top-level `"schema"`?

**ANSWER: NO.** At aurora `d704950594e704c18c34bc30268240ba601497ea`, exactly one Aurora call site can put bytes at `{dataRoot}editor/effects/presets/<id>.json`: `src/renderer/state/aeon-save.ts:99`, fed by `src/core/project/aeon/save.ts:607`. That site writes only the output of `serializeEffectsPreset`, and `serializeEffectsPreset` refuses by throwing, so the save writes nothing, whenever a document lacks `schema`, or carries any `schema` value other than `1`. I proved this by execution on planted violations; see the execution section below. Every constructor, copier, loader and agent tool reaches disk only through that one serializer. A preset loaded without the key is refused on load. After that Aurora never rewrites it, never removes it, and never lets its id be reused, so the file stays on disk as the author left it. Aurora never writes it, but aeon will still refuse it at build time.

## Pinned revisions

| repo | ref | SHA |
|---|---|---|
| aurora | `origin/master` (this worktree's HEAD at start, identical) | `d704950594e704c18c34bc30268240ba601497ea` |
| aeon | `origin/master`, read only through `git -C … grep/ls-tree` | `f512e228de00fd4c84396e47b5062e5a046d7227` |
| empyrean | `origin/main`, read only through `rev-parse` | `db47b94db744a266c3f570ee18f2d3357fa80611` |

Vendored schema currency: `git hash-object src/core/formats/effects/aurora-effects-preset.schema.json` = `b4cec60553929ac32330e3c33b0af6ee4012efe2` = `git rev-parse origin/main:contract/schema/aurora-effects-preset.schema.json` in empyrean. The vendored copy is byte-identical to the contract at tip.

I did not read any of aeon's or empyrean's working trees by path, check anything out there, or write anything there.

## The refusal side: aeon

`tools/effects_gen.py` at aeon `f512e228`, `load_preset` (def at :1192):

```python
# :66
SCHEMA_VERSION = 1
# :1074-1075
def _refuse(path: str, msg: str):
    raise SceneShapeError(f"{path}: {msg}")
# :1208-1214
    if "schema" not in preset:
        _refuse(path, "no `schema` key. Every preset document declares its schema "
                      f"version; this generator accepts {SCHEMA_VERSION}.")
    if preset["schema"] != SCHEMA_VERSION:
        _refuse(path, f"`schema` is {preset['schema']!r}, this generator implements "
                      f"{SCHEMA_VERSION}. Refusing rather than guessing at a version it "
                      f"was not built against.")
```

**What it refuses.** It refuses an ABSENT key (:1208). It also refuses ANY PRESENT value that is not Python-equal to `1` (:1211): `2`, `"1"`, `null` and `0` are all refused.

**What it accepts.** It accepts values that Python compares equal to `1`: the integer `1`, the JSON float `1.0`, and **JSON `true`** (Python `True == 1`). That last one is Python semantics that I read, not a case I ran. It is looser than the contract (`const: 1` refuses `true`) and looser than Aurora, which refuses `true` on load and on write (see (iv) and (v) below). No Aurora writer can emit `true`, so it is not a writer outage. The one consequence is that a hand-written `"schema": true` file builds in aeon while Aurora lists it as unreadable.

**Scope of the refusal.** `load_all_presets` (:2315-2326) calls `load_preset` on every path `discover_preset_files` returns (:1177-1189): *every* `*.json` in the preset directory, bound to a section or not. `generate()` (:4775-4786) calls `load_all_presets("sonic4", repo)`. So one schema-less file anywhere in the directory fails the generate.

**Today's tree.** `git grep -L '"schema"' origin/master -- 'games/*/data/editor/effects/presets/*.json'` printed nothing (exit 1). The positive control `git grep -l '"schema": 1'` over the same pathspec listed all six committed presets (`aurora_ramp_witness`, `authored_probe`, `ojz_sec3_shimmer`, `ojz_sec5_showcase`, `ojz_sec6_baseswap`, `ramp_probe`). No schema-less preset is committed at `f512e228`.

Aside (aeon's business, stated cautiously): `tools/test_effects_gen.py` has an absent-`schema` test for the **scene** loader (:102-108, `del body["schema"]` then `load_scene`) and a wrong-version test for the **preset** loader (:1600-1601). I found no test that deletes `schema` from a **preset**. That is a grep over the literal `schema`, so a test building a key-less dict without naming the key would not show up.

## Aurora's vendored schema, and who enforces it

`src/core/formats/effects/aurora-effects-preset.schema.json` states the rule twice:
- `:7-10`: `"required": ["schema", "id"]`
- `:34-37`: `"schema": {"const": 1, …}`

It is enforced on BOTH read and write, not only declared:
- **Read.** `parseEffectsPreset` (`src/core/formats/effects/preset.ts:2070-2076`) checks `if (obj.schema !== 1) throw` before it runs schema validation. That one test covers absent (`undefined`), `2`, `"1"`, `true` and `null`. Schema validation then follows at :2078.
- **Write.** `serializeEffectsPreset` (`preset.ts:2165-2176`) runs `validateAgainstSchema` against the vendored schema and throws on any issue before producing text. The evaluator implements `required` (`json-schema-subset.ts:435-439`, `missing required property`) and `const` (`:352-353`). The probe below shows both refusals firing on the write path.
- After validation, `canonicalizeBySchema` (`json-schema-subset.ts:575-664`) only reorders and refuses undeclared keys; it adds and drops nothing. `canonicalJsonPretty` (`canonical-json.ts:132-134`) sorts keys. Neither step can remove `schema`.

## The two enumerations and their parameters

- **(A) By file write.** Parameter: every primitive that puts bytes on disk, and every caller of those primitives, filtered to call sites whose path can land under `{dataRoot}editor/effects/presets/`.
  - I found the primitives with `git grep -E "writeFile|writeFileSync|fs\.promises\.write|createWriteStream|\.rename\(|renameSync|copyFile|fsp\.write|appendFile"` over `src/main src/preload* src/shared electron scripts` (exit 0), plus `spawn(|execFile(|execSync(` over `src/main`.
  - I found the renderer callers with `git grep -E "writeBinaryFile|writeTextFile|guardedWrite|writeGuarded|…"` and `window.api.saveFile`.
  - I found where the preset location is spelled with `git grep -E "effects/presets|presets/"` and `effectsPresetPath|effectsPresetDir`.
- **(B) By construction.** Parameter: every expression that produces, copies or replaces an `EffectsPreset` object that can reach `library.presets`, plus the three agent tools.
  - I found them with `git grep -E "serializeEffectsPreset|parseEffectsPreset|effectsPresetPath|…"` and `grep -E "EffectsPreset =|\.\.\.preset|structuredClone|…Command"` over the provider.
  - Other searches in this enumeration: `grep -E "schema: *1|\"schema\"|'schema'"` over `src`; `grep -E "\.presets\.(push|splice|unshift)\(|\.presets *= |presets\[…\] *= |effectsPresets *= "` over `src`, which is the only way to put an object into the library; every `\bdelete ` in `src/renderer/providers/effects-preset.ts`; `'set-effects-preset'` command constructors; and the debug hooks.

The two parameters differ in kind. (A) starts from the disk and walks back to the object. (B) starts from the object and never mentions a file.

## Writer table

| # | site | path:line @ d7049505 | enum | can it emit a preset with no top-level `schema` (or ≠ 1)? | reason |
|---|---|---|---|---|---|
| W1 | **The one disk write**: Ctrl+S, Save All, and **Build & Run's pre-build save** (`build-and-run.ts:65` `saveAllDirty` → `project-runtime.ts:228/233` → `aeonImpl` = `saveAeonProject`, `:101`) | `src/renderer/state/aeon-save.ts:99` (`window.api.writeBinaryFile`, main side `ipc-handlers.ts:96` → `file-io.ts:46-47` tmp+rename) | A | **NO** | Its bytes are `plan.files[i]`. Every preset file in the plan is `serializeEffectsPreset(preset)` (`save.ts:607`) at `effectsPresetPath(dataRoot, preset.id)` (`save.ts:599`), inside the loop over `project.effectsPresets.presets` (`save.ts:598`). Each act's plan is built in full before its writes (`aeon-save.ts:64` then `:95-101`), and every act's plan contains that preset loop, so a refusing serializer throws in the FIRST plan, before any write of that save. `planFileNeedsWrite` (`save-skip.ts:162-187`) can only skip a write whose parsed JSON is equal to what is on disk; it never alters bytes. |
| W2 | Serializer, the gate | `src/core/formats/effects/preset.ts:2165-2176` | both | **NO** | Validates `required: ["schema","id"]` and `const: 1` before writing. Planted violations refused: absent, own-`undefined`, `2`, `true` (probe (v)). |
| W3 | Brand-new preset: panel **Create** (`BandPresetPanel.tsx:363`) → `createPresetCommand` → `newPreset` | `src/renderer/providers/effects-preset.ts:781-787`, `:771-775` | B | **NO** | The literal `{ schema: 1, id, bands: [newBand()] }` (:772), typed `schema: 1` (`preset.ts:576`). This is the ONLY brand-new constructor that reaches the library: `newPreset(` has one caller (:786), and `createPresetCommand` has one caller (the panel). Probe (i). |
| W4 | Edited preset re-saved: `editPresetCommand` (clone + mutate) and every mutator built on it | `effects-preset.ts:1108-1118` | B | **NO** (no shipped mutator removes the key) | All 11 `delete` statements in the provider remove other keys (the grep's other three hits, :904, :5429 and :5752, are comments). They are at :1505 `name`, :1599 `cycles`, :1644/:1780 a channel/slot field, :1720 `variants`, :2896 a patch key, :2997 `phase`, :4506/:4760 `restore_line`, :5346 `offscreen_ship`, :5861 the program arms, where the key set is `EFFECTS_PRESET_PROGRAM_ARMS` (the four `oneOf` arms). No mutator assigns `.schema` (grep `\.schema *=[^=]`: no hit in the provider, panel or codec). There is no guard at command time: probe (v) shows a hypothetical `delete p.schema` mutator IS placed in memory. The save still refuses, via W2. Probe (ii) covers add band, rename and all four arm switches, and each re-save carries `"schema": 1`. |
| W5 | Arm-switch seeds `PROGRAM_ARM_SEEDS` | `effects-preset.ts:5530-5542`, used at :5869 | B | **NO** | Each seed assigns only its own arm key. |
| W6 | Copier `clonePreset` → `presetCommand` (old/new halves) | `effects-preset.ts:732-734`, `:736-749` | B | **NO** | `structuredClone` preserves every own key. |
| W7 | History apply/undo `placeEffectsPreset` | `src/core/editing/history.ts:111-122` (apply :183-189, undo :404-407) | B | **NO** | `structuredClone` of the command's half. With the loader, it is the only writer of `library.presets` (the grep found only :116/:120/:121). Probe (ii) undoes all the way back. |
| W8 | Loader `loadEffectsPresetLibrary` → `parseEffectsPreset` | `preset.ts:2228-2311` (parse at :2278), `:2052-2123`; called from `src/core/project/aeon/load.ts:1083` | B | **NO**, and case **(iii)** | A document with no `schema` throws at :2070-2076. The per-file catch (:2280-2285) puts it in `unreadable`, and it is in neither `presets` nor `loadedPaths`. So the save's preset loop never serializes it. `removalsFor` (`save.ts:136-148`, used :610-613) subtracts it. A new preset with its id is refused at create time (`presetIdRefusal`, `effects-preset.ts:715-718`) and again at save (`save.ts:600-605`). **The codec REFUSES it on load. It does NOT add the key on save, and it does NOT keep the absence by rewriting it: the file is never touched.** Probe (iii). |
| W9 | Agent `set_effects_preset` (tool def `src/main/editor-methods.ts:441-455`, where `preset: z.unknown().nullable()` at :451 means arbitrary JSON) | `src/renderer/agent/agent-handler.ts:1097-1133`: `parseEffectsPreset(JSON.stringify(req.preset), req.id)` :1119, `replacePresetCommand` :1129 (`effects-preset.ts:938-944`) | both | **NO**, case **(iv)** | Arbitrary agent JSON goes through the same parse as a file, so absent, `2`, `"1"`, `true` and `null` are all refused before any command exists. `1.0` is accepted and re-written as the integer `1`. Probe (iv). The `null` branch (:1101-1105) deletes and writes nothing. |
| W10 | Agent `get_effects_preset` | `agent-handler.ts:1083-1095`, tool def `editor-methods.ts:437-439` | B | not a writer | Returns the library object as it is. If the result is fed back to `set_effects_preset`, it goes through W9. |
| W11 | Agent `list_effects_presets` | `agent-handler.ts:1032-1081`, tool def `editor-methods.ts:427` | B | not a writer | Read-only summary. |
| W12 | Module-load probe literals in the provider | `effects-preset.ts:5149` (`{ schema: 1, id: 'seed_guard', … }`), `:5599` (`{ schema: 1, id: 'seed-guard' }`) | B | not a writer | Only arguments to guard computations at module load; they never enter the library. Both carry `schema: 1` anyway. |
| W13 | Debug hooks `presets` / `presetsJson` / `unreadablePresets` | `src/renderer/debug-hooks.ts:1510-1528` | B | not a writer | Read-only. `grep "PresetCommand|executeAmbientCommand|parseEffectsPreset|serializeEffectsPreset"` over the file found nothing (exit 1). |
| W14 | Other disk writers, which cannot target the preset directory by construction: project-setup sidecar (`ProjectSetupTab.tsx:218`, `classic-bridge.ts:70`, `SIDECAR_REL_PATH`); sprite export (`export-sprite.ts:105-115`, `:341`); object bindings (`object-previews.ts:35`, `bindingsPath()`); art canvas (`canvas-file.ts:319`, `pngPath`/`sidecarPath`); classic save (`classic-save.ts:177`, the classic plan); app-state files (`discovery-file.ts:80`, `recent-projects.ts:127/133`) | as listed | A | **NO** (not preset writers) | None of them receives an `EffectsPreset`, and none derives its path from `effectsPresetPath`/`effectsPresetDir`. I did not trace the canvas paths back to their origin; their bytes are a PNG and a canvas sidecar, never a preset serialization. |
| W15 | Native **Save As** dialog `SAVE_FILE` | `src/main/ipc-handlers.ts:114-126`; only caller `export-sprite.ts:149` | A | **NO** (not a preset writer) | Writes a sprite mapping `.asm` text to an absolute path the user picks (PNG filter). It could put a non-preset file in the preset directory only if the user deliberately navigated there and typed a `.json` name. That is a hand-placed file, not an Aurora preset save. |
| W16 | Build & Run's spawns | `src/main/aether/build-run.ts:246` (`runOne`, the prebuild), `:419` (the build) | A | not an Aurora serialization | These run aeon's own commands in aeon's tree. Anything they write is aeon's code; I did not examine it as a writer. Aurora's contribution to Build & Run is W1, which runs first. |

**Cases (i) to (v), as asked:** (i) brand-new: W3 → W2 → W1, NO. (ii) edited and re-saved: W4/W5/W6/W7 → W2 → W1, NO. (iii) loaded without the key: W8, refused on load and never rewritten, so NO Aurora write; the pre-existing file still blocks aeon. (iv) agent-supplied: W9 → W2 → W1, NO. (v) anything else: W10 to W16, none writes a preset.

## Reconciling A against B

- **A found exactly one call site that can put bytes at a preset path: W1.** Every B site converges on it. B's producers (W3, W8, W9) put objects into `library.presets`, and only W6/W7 move those objects; the only reader that turns them into bytes is `save.ts:598-607`, via W2, into W1. B and A meet at `serializeEffectsPreset` and nowhere else.
- **In B but not in A: W3 to W13.** Expected and not a gap. They construct, copy or expose preset objects but own no file write; each reaches disk only through W1. W10, W11, W12 and W13 never reach the library at all.
- **In A but not in B: W14, W15, W16.** Also expected. They are file writes that construct no `EffectsPreset`. They appear in A only because A's parameter (every byte-writing primitive) is taken before filtering by path. W15 is the only A site with a user-chosen path, and the reason it cannot write a preset is stated in its row.
- **Site in both: W2** (it defines the bytes W1 writes, and it is a serializer). **W9** appears in both only through its path: B found it as a constructor, and A reaches it via W1 once its command is placed.
- **No site is in one enumeration and unexplained by the other.**

## Execution evidence

`scratchpad/preset-schema-key-probe.mjs`, committed with this packet. It bundles Aurora's own modules with esbuild and drives them with no project tree:
- the codec: `parseEffectsPreset`, `serializeEffectsPreset`, `loadEffectsPresetLibrary`;
- the provider's command factories;
- `EditHistory` (so commands go through the real `placeEffectsPreset`);
- `removalsFor` from the save plan.

The loader reads an in-memory fake `FileAccess`. The bundle goes to `$PROBE_OUT_DIR` (default: the OS temp dir), and the probe writes nothing into any project. Run from the worktree root with `node scratchpad/preset-schema-key-probe.mjs`. Output at `d7049505`, verbatim except for three omissions: the `bundle:` path line, the one long serialized-text line under (i), and the detail lines under four of the (iv) refusal rows (the note after the block says which):

```
schema.required = ["schema","id"]; properties.schema = {"const":1}

(i) brand-new preset: createPresetCommand -> EditHistory.execute -> serialize
ok   createPresetCommand accepted a legal id
ok   new preset serializes WITH "schema": 1

(ii) edited preset re-saved: add band, rename, switch through all four program arms, undo
ok   addBandCommand: re-save keeps "schema": 1
       keys on disk: bands,id,schema
ok   setPresetNameCommand: re-save keeps "schema": 1
       keys on disk: bands,id,name,schema
ok   setProgramArmCommand -> ramp: re-save keeps "schema": 1
       keys on disk: id,name,ramp,schema
ok   setProgramArmCommand -> base_swap: re-save keeps "schema": 1
       keys on disk: base_swap,id,name,schema
ok   setProgramArmCommand -> boundary: re-save keeps "schema": 1
       keys on disk: boundary,id,name,schema
ok   setProgramArmCommand -> bands: re-save keeps "schema": 1
       keys on disk: bands,id,name,schema
ok   undo all the way back empties the library (create undone)

(iii) a schema-less preset on disk: load, then what a save can do with it
ok   parseEffectsPreset REFUSES the schema-less document
       legacy_noschema.json declares "schema": undefined; wave 2 refuses anything but 1. A new schema version is a contract change to both halves, not a file the reader upgrades.
[effects] games/sonic4/data/editor/effects/presets/legacy_noschema.json could not be read as a raster preset: legacy_noschema.json declares "schema": undefined; wave 2 refuses anything but 1. A new schema version is a contract change to both halves, not a file the reader upgrades.
ok   loader: schema-less file is NOT in presets (so save.ts:598 never serializes it)
       presets: ["good_one"]
ok   loader: schema-less file IS in unreadable
       unreadable: ["games/sonic4/data/editor/effects/presets/legacy_noschema.json"]
ok   loader: schema-less file is NOT in loadedPaths (no save may remove it)
       loadedPaths: ["games/sonic4/data/editor/effects/presets/good_one.json"]
ok   removalsFor never lists the schema-less file, even with nothing kept
       removals: ["games/sonic4/data/editor/effects/presets/good_one.json"]
ok   create-time id refusal: the schema-less file's id cannot be taken
       "legacy_noschema" is taken by games/sonic4/data/editor/effects/presets/legacy_noschema.json, which exists but could not be read. Saving over it would destroy it. Fix or remove that file by hand, or pick another id.
       => the file is never rewritten WITH or WITHOUT a key: Aurora neither fixes nor erases it;
          it stays on disk exactly as the author left it, and aeon will refuse it at build.

(iv) agent set_effects_preset: agent-handler.ts:1119 parse -> :1129 replace -> save serialize
ok   agent no "schema" key: REFUSED at parse, before any command exists
       agent_p.json declares "schema": undefined; wave 2 refuses anything but 1. […]
ok   agent "schema": 2: REFUSED at parse, before any command exists
ok   agent "schema": "1": REFUSED at parse, before any command exists
ok   agent "schema": true (aeon's Python would ACCEPT this: True == 1): REFUSED at parse, before any command exists
ok   agent "schema": null: REFUSED at parse, before any command exists
ok   agent "schema": 1: accepted, and the save text carries "schema": 1
ok   agent "schema": 1.0 (JSON): accepted and re-written as the integer 1
       "  \"schema\": 1"

(v) serializeEffectsPreset fed a schema-less / wrong-schema object directly (a hypothetical code bug)
ok   serialize no "schema" key: REFUSED, nothing to write
       refusing to write preset "p": it does not match the raster preset schema |   - <document>: missing required property "schema"
ok   serialize "schema": undefined (own property): REFUSED, nothing to write
       refusing to write preset "p": it does not match the raster preset schema |   - /schema: expected the constant 1, got undefined
ok   serialize "schema": 2: REFUSED, nothing to write
       refusing to write preset "p": it does not match the raster preset schema |   - /schema: expected the constant 1, got 2
ok   serialize "schema": true: REFUSED, nothing to write
       refusing to write preset "p": it does not match the raster preset schema |   - /schema: expected the constant 1, got true
ok   a mutator CAN build such a command (no guard at command time)
ok   ...and history places it (the in-memory preset now lacks the key)
ok   ...but the save-path serializer REFUSES it: the save throws, no file is written
       refusing to write preset "probe_bug": it does not match the raster preset schema |   - <document>: missing required property "schema"

ALL ROWS HELD
probe exit=0
```

(In (iv), the first refusal's message is abbreviated with `[…]`. The detail lines under the `2`, `"1"`, `true` and `null` rows are dropped here; each reads `agent_p.json declares "schema": <value>; wave 2 refuses anything but 1. …`, exactly as in (iii). The full text is in a probe run.)

Controls: the (i) and (iv) `"schema": 1` rows are the positive controls, showing the serializer does produce files and does carry the key. The (v) rows are planted violations fed straight to the writer's gate, not inferred from reading it.

## CANNOT TELL, and what would settle it

1. **Aeon's refusal is READ, not executed.** The sandbox refused to redirect `git -C <aeon> show origin/master:tools/effects_gen.py` into a file, and executing `load_preset` would need the module extracted. The code is unambiguous (:1208-1214). It would be settled by an aeon session running `load_preset` on a temporary schema-less file, or by a preset twin of `test_missing_schema_is_refused`. The same applies to the `"schema": true` acceptance, which I read from Python semantics.
2. **The full plan is not executed end to end.** I ran the loader and the serializer (the two ends) and `removalsFor`. The loop between them (`save.ts:597-608`) and the IPC write (`aeon-save.ts:95-101`) I only read. Running `buildAeonSavePlan` needs a whole aeon project, and reading aeon's working tree is forbidden here. It would be settled by a vitest over `buildAeonSavePlan` with a fixture project whose preset library holds a key-less object: expect a throw and zero `files`.
3. **The panel was not driven at runtime.** The Create button's handler calls `createPresetCommand` (`BandPresetPanel.tsx:363`), which I read; the probe drove the same function headless. A CDP run of the app clicking Create and then Save, then reading the written file, would settle it.
4. **Canvas write paths not traced to their origin** (W14). This is low relevance, since their bytes are never a preset serialization.

## Proposed remedy

No Aurora writer needs fixing: the answer is NO, and the single gate fires on every planted violation. The gap I found is that **no Aurora test pins the absent-`schema` refusal for presets.** By the patterns `delete ….schema`, `schema: undefined`, `missing required property "schema"`, `declares "schema"`, `schema: 2` and `'schema'` over `test/formats/effects-preset*` and `src/**/__tests__/*preset*`, the only hits are three key-list equality rows. Also, all 41 of the vendored contract vectors in `test/fixtures/effects/effects-preset-vectors.json` carry `"schema": 1`, and none omits it. So the refusal holds today because of the vendored schema's `required` list and the explicit check at `preset.ts:2070`; a test does not hold it.

The proposed hardening is two rows in `test/formats/effects-preset.test.ts`, one property each:
- `parseEffectsPreset` refuses a document with no `schema`;
- `serializeEffectsPreset` refuses an in-memory preset with no `schema`, which is row (v) of the probe;

plus a third row asking empyrean to add a key-less case to the contract vectors, so that both halves and aeon meet the same document. This should be a separate, owner-approved parcel. I changed nothing here.
