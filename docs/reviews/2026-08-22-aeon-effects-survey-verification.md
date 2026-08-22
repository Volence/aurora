# Verification of aeon's Aurora effects-authoring survey — firsthand, against this tree

**Date:** 2026-08-22 · **Status:** VERIFICATION (read-only; no implementation) ·
**Verified at:** aurora `e731214` (branch `docs/verify-aeon-effects-survey`, tree clean at start)
**Survey under review:** `aeon/docs/research/2026-08-22-aurora-effects-authoring-assessment.md`,
read at aeon `5be97277` (574 lines — the survey has grown two ERRATA since its 458-line body;
both errata were read and are accounted for below).
**Survey's Aurora pin:** `4cffe45619192285290aa6d8be33512543ef767c`. Master is six commits past
it (`e731214`), so every non-match is classified as one of two distinct verdicts, never merged:

- **DRIFTED-(a) — survey was wrong when written.** The source at `4cffe456` already contradicted
  it. Actionable; goes across the fence.
- **DRIFTED-(b) — the tree moved after the survey.** Expected, nobody's defect; the moving commit
  is named.

Every verdict below is derived from a line I read in this worktree and quoted. Nothing is copied
from the survey's own citation or inferred from a neighbouring claim.

---

## Headline

**42 claims checked: 26 CONFIRMED, 8 DRIFTED (7 of them type (a) — wrong when written — and 1
type (b)), 2 REFUTED, 6 UNVERIFIABLE.** The suite is green at the verification SHA (323 test
files passed / 1 skipped; 3849 tests passed / 3 skipped / **0 failed**; `npx tsc --noEmit` exit 0;
wall clock 04:32, uptime 4 days 4:55).

**The single most consequential finding is a REFUTATION that no erratum covers: the
"AeonProjectAdapter is still a routing marker" caveat — §(b)'s named load-bearing caveat, and the
entire basis of gap 6 — is false, and was already false at the survey's own pin.**
`aeonAdapter.open()` performs the real full project load (`loadAeonProject`) and returns it on
`handle.aeon` (`src/core/project/aeon/index.ts:105-136`); `useProject.loadFromPath` no longer
exists — the renderer calls `openAeonProject`, which calls `aeonAdapter.open` directly
(`src/renderer/state/aeon-open.ts:22`). This closed on **2026-08-13 in commit `4782e86`**, which
`git merge-base --is-ancestor 4782e86 4cffe45` confirms is an ancestor of the survey's pin. The
survey is not at fault for inventing it: it faithfully quoted Aurora's own `docs/ROADMAP.md:133-136`
and `:638`, which still say "STILL DEFERRED" — **stale Aurora documentation is the defect, and
Aurora handed the stale caveat across the fence itself at `ROADMAP.md:648`.** Gap 6's *conclusion*
survives (nothing in `AeonProjectData` carries scenes, budgets or scene-name resolution) but its
stated *cause* is wrong, and the remediation is therefore different: not "build a core-callable
loader", which exists, but "extend `AeonProjectData` / `S4ActConfig`", which is a much smaller
parcel. Second-most consequential: **the shipped play-clock and overlay-pass machinery §(b) offers
this arc as its riding surface exists only on the classic (S1) viewport** — the aeon `MapViewport`
that renders the OJZ showcase has zero `requestAnimationFrame` calls and is absent from both
animated overlay keys (`viewStore.ts:52-56`).

---

## 1. Verdict table

Line numbers in the "source" column are from this worktree at `e731214`.

### §(b) Aurora architecture map

| # | Claim (survey) | Verdict | `path:line` | Source |
|---|---|---|---|---|
| B1 | Stack: Electron + electron-vite, React 19, zustand, vitest; MCP SDK + express | CONFIRMED | `package.json:17-33` | `"electron": "^41.2.1"`, `"electron-vite": "^5.0.0"`, `"react": "^19.2.5"`, `"zustand": "^5.0.12"`, `"@modelcontextprotocol/sdk": "^1.29.0"`, `"express": "^5.2.1"`, `"vitest": "^4.1.4"`. **Unmentioned by the survey: `"zod": "^4.4.3"` is a runtime dependency** — see §1 note in the missed-facts section. |
| B2 | `src/core` = pure-TS domain (node-tested); `src/renderer` React; `src/main`/`preload` Electron shells | CONFIRMED | `vitest.config.ts:13` | `include: ['test/**/*.test.ts', 'src/**/__tests__/**/*.test.ts']`; `src/core/project/aeon/load.ts:14` — "so core stays fs-free; the main process supplies a real fs-backed FileAccess". |
| B3 | Facet modules keyed by `(engine, facetId)` | CONFIRMED | `src/renderer/workspace/facet-registry.ts:1`, `:47` | `// Facet modules are keyed by (engine, facetId).`; `const key = (engine: OpenEngine, facet: FacetCapability) => \`${engine}:${facet}\`;` |
| B4 | Registered in `register-facets.ts` for `'aeon'` and `'s1'` | CONFIRMED | `src/renderer/workspace/register-facets.ts:14-17`, `:36-39` | `export function registerAeonFacetModules()` → `registerFacetModule(['aeon'], m)`; `export function registerS1FacetModules()` → `registerFacetModule(['s1'], m)`. |
| B5 | `FacetModule` supplies `Canvas / ToolDock / ToolOptions / RightPanel / BottomExtra / StatusBar` + a `mapOverlays` flag | CONFIRMED (exact, all seven) | `facet-registry.ts:29-44` | `readonly Canvas: ComponentType; readonly ToolDock?…; ToolOptions?…; RightPanel?…; BottomExtra?…; StatusBar?…; readonly mapOverlays?: boolean;` |
| B6 | No fallback — an unregistered pair renders null loudly | CONFIRMED | `facet-registry.ts:11-13`, `:70` | "the Canvas-only version fell back to aeon's module for an unregistered pair … There is no fallback now: an unregistered pair resolves to null and the workspace says so."; `return this.modules.get(key(engine, facet)) ?? null;` |
| B7 | Both engines render through one `LevelWorkspace` | CONFIRMED | `src/renderer/App.tsx:249` | `{engine ? <LevelWorkspace /> : null}` — one mount, engine-parameterised. |
| B8 | "Adding an effects view = one more facet module per engine, plus overlay lenses" (INFERRED) | UNVERIFIABLE (design judgment) | — | Not decidable from source. What *is* decidable and materially sharpens it: `'parallax'` is **already** a declared `FacetCapability` — see C1. Would be decided by a design review, not a grep. |
| B9 | `viewStore.overlays` + `ViewMenu` at `viewStore.ts:37-133` | DRIFTED-(a), citation only | `src/renderer/state/viewStore.ts:4-33`, `:50-56`, `:62`, `:79-100` | The cited range holds `OVERLAY_KEYS_BY_ENGINE` (`:50-56`), the `overlays: OverlayOptions` field (`:62`) and the defaults (`:79-100`), but the `OverlayOptions` **type itself is at `:4-33`, outside the range**. File is 135 lines, so `:133` is near EOF. Substance correct, citation clipped. |
| B10 | `ClassicLevelViewport.tsx` + `classic-overlays.ts` composite overlay passes on canvas 2D (`getContext('2d')`), at `:496,629` | CONFIRMED (both lines exact) | `ClassicLevelViewport.tsx:496`, `:629` | `const cctx = c.getContext('2d', { willReadFrequently: true });` / `const ctx = canvas.getContext('2d', { willReadFrequently: true });` — the survey elided the `{ willReadFrequently: true }` options argument, which is present on **every** classic 2D context (also `:714`, `classic-overlays.ts:317,318,385`). Immaterial to the claim; noted because a TS preview lens must pass it too or take the readback penalty. |
| B11 | A shared rAF play-clock drives animated level art and object previews, overlay-only (document untouched) | CONFIRMED, **but classic-only** | `ClassicLevelViewport.tsx:411-429`; `viewStore.ts:52-56` | `const t0 = performance.now(); … const t = Math.floor(((performance.now() - t0) * 60) / 1000); … handle = requestAnimationFrame(tick);` — one timebase for both halves (`artKey`/`objKey`), as claimed. **But it lives inside `ClassicLevelViewport.tsx`, not a shared module**, and `OVERLAY_KEYS_BY_ENGINE.aeon` (`:52-56`) contains neither `playAnimatedArt` nor `occludeSprites`. See §6. |
| B12 | Per-pixel priority-occlusion pass, 0.18 ms avg, harness 30/30 | CONFIRMED-AS-RECORDED; number UNVERIFIABLE-BY-ME | `docs/ROADMAP.md:615` | "…MZ animated hi-pri cells re-patched per play-tick, **0.18ms avg pass. Harness 30/30**". See §6 for what the committed harness actually asserts. |
| B13 | "No Web Workers found in `src/renderer`/`src/core` (grep for `new Worker`)" | CONFIRMED | — | `grep -rn "new Worker\|Worker(\|worker_threads\|OffscreenCanvas" src/` returns **zero** `Worker` constructions. Every hit is `OffscreenCanvas` (e.g. `src/renderer/canvas/SectionRenderer.ts:69` `private tempCanvas = new OffscreenCanvas(8, 8);`), which is same-thread. |
| B14 | Per-frame overlay work runs on the renderer thread "inside measured sub-millisecond budgets (OBSERVED harness numbers 0.18-0.49 ms)" | PARTIALLY CONFIRMED / UNVERIFIABLE-BY-ME | `docs/ROADMAP.md:615`; commit `8cab9e0` | 0.18 is in ROADMAP; 0.49 exists **only in a commit subject** — `8cab9e0 test(classic): layout-anim CDP harness 22/22 … 0.49ms avg pass`. Neither is asserted by committed code. See §6. |
| B15 | `load.ts` reads `project.json` via `s4-config.ts` (zones/acts, per-section `dataPath`, `bgLayout`/`bgTiles`, BG library, `parallax` carried opaquely) | CONFIRMED (`parallax` half underspecified — see §5) | `src/core/project/aeon/load.ts:22-27`, `:370` | imports `loadS4Config, collisionDataPathCandidates, projectDataRoot` from `../../config/s4-config`; `parallaxRef: actConfig.parallax,`. |
| B16 | `save.ts` writes `.tiles.bin` + `.meta.json` sidecars and the editor-owned art blobs | CONFIRMED | `src/core/project/aeon/save.ts:83`, `:118-126`, `:166`, `:192-194`, `:216-221` | `files.push({ path: \`${prefix}.tiles.bin\`, bytes: ntData });` … meta sidecar block … tileset / act BG / BG library writes. |
| B17 | Dest-field ownership invariant (field absent → Aurora owns path+pointer; present → repo owns) at `s4-config.ts:1-16` | CONFIRMED | `src/core/config/s4-config.ts:1-15` | "• field ABSENT → Aurora owns it. It writes to `<dataRoot>editor/<derived>` and rewrites the pointer … • field PRESENT → the repo owns it … and never touches the pointer". Block is `:1-15`; `:16` is blank and `:17` opens `S4ActConfig`. **Note the survey wrote the bare filename `s4-config.ts` inside a paragraph about `src/core/project/aeon/`; the file is at `src/core/config/s4-config.ts`.** |
| **B18** | **"`AeonProjectAdapter` is still a ROUTING MARKER — `open()` returns a capability-marker handle"** | **REFUTED** | `src/core/project/aeon/index.ts:105-136` | See §4 for the full quote and history. |
| **B19** | **"the renderer still runs the legacy `useProject.loadFromPath`"** | **REFUTED** | `src/renderer/state/aeon-open.ts:1`, `:22` | `// Aeon open glue — replaces useProject.loadFromPath.` / `const handle = await aeonAdapter.open(createIpcFileAccess(dir));` — `loadFromPath` does not exist anywhere in `src/`. |
| B20 | "the real core-callable aeon loader is deferred (OBSERVED ROADMAP §2.5 'Deferrals', restated in §5.2)" | CONFIRMED that the doc says it; **the doc is STALE** | `docs/ROADMAP.md:133-136`, `:638`, `:648` | `- **Aeon adapter is a routing marker** — *STILL DEFERRED.* \`AeonProjectAdapter.open()\` returns a capability-marker handle; the renderer still runs the untouched \`useProject.loadFromPath\` (zero behavior change).` The survey quoted Aurora accurately; Aurora's doc contradicts Aurora's source. |
| B21 | P2 (playtest loop) DONE 2026-08-19 — Aether outbound client, `push_palette`, `warp`, `build_and_run`, with agent-surface parity | CONFIRMED | `src/main/editor-methods.ts:242`, `:257`, `:268`; `docs/ROADMAP.md:604`, `:630` | `{ name: 'push_palette', kind: 'aether-push-palette', … }`, `{ name: 'warp', kind: 'aether-warp', … }`, `{ name: 'build_and_run', kind: 'aether-build-run', … }`; ROADMAP `| **P2** | … | ✅ **DONE 2026-08-19** — see §2.7 |`. |
| B22 | P5 "Raster mode + live preview (design #8 Aurora half)" is open, engine-gated on aeon | CONFIRMED | `docs/ROADMAP.md:633` | `| **P5** | Raster mode + live preview (design #8 Aurora half) | aeon #8 tasks 1–4; P2's client | open, engine-gated |` |
| B23 | Precedent tiles flow: `save.ts` writes `section_N.tiles.bin` + meta into `games/sonic4/data/editor/ojz/act1/` | CONFIRMED | `save.ts:64`, `:71`, `:83`, `:119`; aeon `project.json:15` | `const dataPath = actConfig.dataPath;` → `const prefix = \`${dataPath}section_${i}\`;`; aeon's `project.json` declares `"dataPath": "games/sonic4/data/editor/ojz/act1/"`. |
| B24 | ROADMAP §5.2 lane note: Aurora parcels dispatched/landed by the Aurora session against committed aeon briefs with SHAs; cross-tool material to empyrean | CONFIRMED | `docs/ROADMAP.md:648` | "Lane split: Aurora's overseer dispatches and lands all Aurora parcels; aeon ships committed briefs; cross-tool contract material goes to empyrean." |

### §(a) claims that assert something about Aurora source

| # | Claim | Verdict | `path:line` | Source |
|---|---|---|---|---|
| A1 | `bg-library.ts:16` builds `<dataRoot>editor/<zone>_bglib.json` | CONFIRMED (exact line) | `src/core/formats/bg-library.ts:16` | `return \`${dataRoot}editor/${zoneId}_bglib.json\`;` |
| A2 | "the loader accumulates entries at `load.ts:385-399`" | DRIFTED-(a), citation only | `src/core/project/aeon/load.ts:386-408` | The try block opens at `:386` (`const dataRoot = projectDataRoot(config.raw);`), index read `:389`, loop `:391`, and the accumulate is `bgLibrary.push({` at **`:397`**, closing `:402`. The cited window ends before the push completes. |
| A3 | `project.json:22` declares `"parallax": "games/sonic4/data/parallax/ojz_default.asm"` | DRIFTED (line number); value CONFIRMED | aeon `project.json:20` | `"parallax": "games/sonic4/data/parallax/ojz_default.asm",` — at line **20**, not 22. **Caveat: I read aeon at its current HEAD `5be97277`, not the survey's pin `77cbf7c0`, so I cannot classify this as (a) or (b).** Directory absence re-confirmed: `ls games/sonic4/data/parallax` → "No such file or directory". |
| A4 | `actConfig.parallax` → `parallaxRef` at `load.ts:370` | CONFIRMED (exact line) | `src/core/project/aeon/load.ts:370` | `parallaxRef: actConfig.parallax,` |
| A5 | "model at `src/core/model/s4-types.ts:121`" | DRIFTED-(a), **and the drift is material** | `s4-types.ts:121` vs `:227` | `:121` is `parallaxRef: string | null;` on the **`Section`** interface. The field `load.ts:370` actually populates is `Act.parallaxRef` at **`:227`**. There are TWO `parallaxRef` fields and the survey cited the wrong one — see §5. |
| A6 | "nothing on either side reads through it" (the parallax path) | CONFIRMED for Aurora | — | `grep -rn parallaxRef src/` yields five non-test hits (`load.ts:370`, `section-ops.ts:29`, `s4-types.ts:121,136,227`). No `fa.read`, no path join, no consumer. |
| A7 | `editor_bg_override.json` contains only `layout` + `tiles` (no `anims`) | CONFIRMED | aeon `games/sonic4/data/editor_bg_override.json` | `json.load(...).keys()` → `['layout', 'tiles']`. |

### §(c) The gap list

| # | Gap | Verdict | `path:line` | Source |
|---|---|---|---|---|
| C1 | Gap 1: no effects surface; "nothing under `src/` mentions scenes, rasters, variants or BgAnim bands" | CONFIRMED **as literally worded**; REFUTED in spirit | `src/core/project/adapter.ts:76-79` | See §3. The four named words are clean; **`'parallax'` is not, and it is a first-class declared facet capability pinned by two tests.** |
| C2 | Gap 2: `games/sonic4/data/editor/effects/` does not exist; no schema anywhere; `parallax` dangles | CONFIRMED | aeon tree + `src/` | `ls games/sonic4/data/editor/effects` → "No such file or directory". No Zod schema, no TS type, no fixture for any effects document in Aurora (`grep -rn "from 'zod'" src/` → 6 files: `mapping.ts`, `session-persistence.ts`, `aether/adapter.ts`, `editor-methods.ts` + 2 tests; none touches effects). |
| C3 | Gap 3: `tools/effects_gen.py` does not exist | CONFIRMED (aeon-side, checked read-only) | aeon `tools/` | `ls tools/effects_gen.py` → "No such file or directory". Also absent: `parallax_gen.py`, `raster_gen.py` — which matters, see §7.2. |
| C4 | Gap 4: "no Aurora UI reads or writes the `anims` key even though that half of the neutral contract already exists" | CONFIRMED for code; **survey MISSED a committed Aurora design for it** | `src/` (zero hits) vs `docs/superpowers/specs/2026-08-13-ux-overhaul-stage4-design.md:302-359` | See §7.1. |
| C5 | Gap 5: renderers draw planes flat; no per-line HScroll/VSRAM/vsplit, no variant/cycling preview, no BgAnim playback; "the play-clock + overlay-pass machinery to hang these on now exists" | First half CONFIRMED; last clause DRIFTED-(a) | `src/` greps; `MapViewport.tsx` | `grep -rin "hscroll|vsram|vscroll|deform|vsplit" src/` → **zero hits**. `SectionRenderer.ts` composes a flat nametable (`:1-5` imports `composeNametable`; no scroll concept). But "the machinery now exists" is true only of the classic viewport — see §6. |
| C6 | Gap 6: scenes / budget ledgers / scene-name→section resolution are unreachable through the current adapter | Conclusion CONFIRMED; **stated cause REFUTED** | `src/core/project/adapter.ts:177-187` | See §4. |
| C7 | Gap 7: budget visibility in-tool | UNVERIFIABLE-BY-ME (asserts nothing about Aurora source) | — | Entirely an aeon-side claim about `scene_budget_enforce` and a not-yet-built ledger artifact. Decidable only in the aeon tree. |
| C8 | Gap 8: no editor-owned representation of "section N uses preset/scene X" | CONFIRMED, with a material nuance | `src/core/formats/section-meta.ts:11-14`; `s4-types.ts:121` | The sidecar carries exactly `bgLayoutRef` and `paletteRef`. **Nuance: `Section.parallaxRef` already exists in the model and is exactly this shape — and it never round-trips.** See §5. |

### The §(f) rulings, insofar as they cite Aurora source

| # | Ruling | Verdict on its Aurora citation | Source |
|---|---|---|---|
| F2 | Ruling 2: assignments → the section sidecar, "which already carries exactly this shape — scalar refs with explicit-null semantics (OBSERVED `save.ts:112-115`)" | DRIFTED-(a), citation; substance superseded by the survey's own ERRATUM 1, which I independently CONFIRM and extend | `save.ts:112-126` — the comment runs `:112-117`, the serialize call is `:118`, the write is `:120-126`. `:112-115` catches only the first four comment lines and none of the mechanism. See §2. |
| F4 | Ruling 4: re-point `project.json` `parallax`, "carried opaquely" | CONFIRMED-BUT-UNDERSPECIFIED | See §5 — "opaquely" is accurate but hides three distinct behaviours, one of which (`raw` verbatim re-serialization) is what makes the re-point safe, and one of which (no validation at all) is what makes it silent if it goes wrong. |
| F1/F3/F5/F6 | Rulings 1, 3, 5, 6 | UNVERIFIABLE-BY-ME | None cites Aurora source; they cite aeon docs, aeon `DEFERRED_WORK.md`, and design positions. Ruling 5's premise ("the lane note in aurora's ROADMAP §5.2") is CONFIRMED at `docs/ROADMAP.md:648` (row B24). |

---

## 2. Weighted item 1 — the section sidecar, answered concretely

The survey's ERRATUM 1 (added after the body, at aeon `5be97277`) already establishes the
four executable sites and the unknown-key-drop. **I re-derived all of it independently from source
and confirm every point**, including the addendum's non-string claim. What follows is only what is
*additional* to the errata.

### 2a. The actual semantics, read in full

**Which refs exist today — exactly two:**

```ts
// src/core/formats/section-meta.ts:11-14
export interface SectionMeta {
  bgLayoutRef: string | null;
  paletteRef: string | null;
}
```

**How null is represented — three different ways, and this is the subtle part:**

1. *Absent file* = all-null. `load.ts:320-329` wraps the read in `try { … } catch { // no meta
   sidecar — defaults from createSection stand }` and `createSection` (`s4-types.ts:135-137`) seeds
   both refs `null`.
2. *Explicit JSON `null`* = null, round-tripped (`section-meta.test.ts:13-15`).
3. *Any non-string value, including a number* = null, silently
   (`section-meta.ts:29-30`: `typeof raw?.bgLayoutRef === 'string' ? raw.bgLayoutRef : null`).

**When the file is written vs. overwritten-with-nulls vs. not created** — `save.ts:118-126`, quoted
in full because the three-way branch is the contract:

```ts
const metaJson = serializeSectionMeta({ bgLayoutRef: section.bgLayoutRef, paletteRef: section.paletteRef });
const metaPath = `${prefix}.meta.json`;
if (metaJson !== null) {
  const metaBytes = new TextEncoder().encode(metaJson);
  files.push({ path: metaPath, bytes: metaBytes });
} else if (await fa.exists(metaPath)) {
  const clearedBytes = new TextEncoder().encode(JSON.stringify({ bgLayoutRef: null, paletteRef: null }, null, 2));
  files.push({ path: metaPath, bytes: clearedBytes });
}
```

- **written** iff `serializeSectionMeta` returns non-null, i.e. iff at least one of the *two known*
  refs is a non-null string (`section-meta.ts:21`);
- **overwritten with a hardcoded two-field all-nulls literal** iff both known refs are null AND the
  file already exists (the `fa.exists` probe);
- **not created** otherwise — the common case.

**What the loader does with an unknown key: it drops it, and then the save erases it.**
`parseSectionMeta` (`:26-32`) builds a **fresh object literal** from `JSON.parse`'s output; it
never spreads. Any key it does not name is gone before the value reaches memory.

### 2b. Demonstrated, red-first

I wrote a four-case vitest file, ran it green, then **planted a violation** (making
`parseSectionMeta` spread `...(raw as object)`) and re-ran to prove the assertions bite. Result:
**2 of 4 failed under the plant** (cases A and D), diffing on `+ "sceneRef": "OJZ_Scene_Sec0"`.
Source restored from a byte copy; suite re-run green. The test file was deliberately **not
committed** (this is a read-only measurement task), so it is reproduced here verbatim for anyone
who wants to re-run it — drop it at `test/formats/sectionmeta-erasure.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { serializeSectionMeta, parseSectionMeta } from '../../src/core/formats/section-meta';

describe('SectionMeta vs a hypothetical third ref', () => {
  it('A: an unknown key on disk is ERASED by a load/save round-trip', () => {
    const onDisk = JSON.stringify({ bgLayoutRef: 'forest-1', paletteRef: null, sceneRef: 'OJZ_Scene_Sec0' }, null, 2);
    const parsed = parseSectionMeta(onDisk) as Record<string, unknown>;
    expect(parsed.sceneRef).toBeUndefined();          // parse drops it
    const rewritten = serializeSectionMeta(parsed as never)!;
    expect(rewritten).not.toContain('sceneRef');       // serialize never re-emits it
    expect(JSON.parse(rewritten)).toEqual({ bgLayoutRef: 'forest-1', paletteRef: null });
  });
  it('B: a KNOWN key with a non-string value is silently null-ified, no error path', () => {
    expect(parseSectionMeta('{"bgLayoutRef": 3, "paletteRef": true}'))
      .toEqual({ bgLayoutRef: null, paletteRef: null });
    expect(() => parseSectionMeta('{"paletteRef": []}')).not.toThrow();
  });
  it('C: the all-null gate enumerates only the two known fields', () => {
    expect(serializeSectionMeta({ bgLayoutRef: null, paletteRef: null } as never)).toBeNull();
  });
  it('D: a sidecar that is ONLY a third ref round-trips to nothing', () => {
    const onDisk = JSON.stringify({ sceneRef: 'OJZ_Scene_Sec0', effectsRef: 'OJZ_Preset_Sec0' });
    const parsed = parseSectionMeta(onDisk);
    expect(parsed).toEqual({ bgLayoutRef: null, paletteRef: null });
    expect(serializeSectionMeta(parsed)).toBeNull(); // → save.ts:123 clears the file
  });
});
```

**On the controller's claim (b) — CONFIRMED.** Case B passes as written: `{"bgLayoutRef": 3,
"paletteRef": true}` parses to `{bgLayoutRef: null, paletteRef: null}` with **no throw, no notice,
no `unreadable` marker**. The `typeof … === 'string'` guard is the only validation, and its failure
mode is indistinguishable from absence. The existing committed test already covers half of this
(`test/formats/section-meta.test.ts:24`: `parseSectionMeta('{"bgLayoutRef": 7, "other": true}')`) —
but it asserts only the *parse result*, framed as "forward compatible", never the *erasure*. That
framing is itself a hazard: the file's own test suite calls the destructive behaviour a feature.

**New, from the plant — the erasure has TWO independent points, and patching one is insufficient.**
Under the planted permissive parser, case A's `expect(rewritten).not.toContain('sceneRef')` **still
passed**. The serializer at `:22` re-emits a two-field literal regardless of what it was handed:

```ts
return JSON.stringify({ bgLayoutRef: meta.bgLayoutRef, paletteRef: meta.paletteRef }, null, 2);
```

So a contract that only hardens `parseSectionMeta` would still lose the third ref on save. Both
`:22` and `:29-30` must change together.

### 2c. Answer: what would adding a third scalar ref break or require?

**Executable sites that must change in lockstep — EIGHT, not four or six.** The errata name four
executable (`section-meta.ts:21`, `:22`, `:29-30`, `save.ts:124`) plus two non-executable (the
header prose, the TS interface). I confirm all six and add two more, neither previously named:

7. **`test/formats/section-meta.test.ts:9, 15, 19, 23, 24, 25`** — five `toEqual` assertions pin the
   **exact object shape** `{ bgLayoutRef, paletteRef }`. `toEqual` is not a subset match, so every
   one fails the moment `parseSectionMeta` returns a third key. This is the round-trip test the
   contract's writer-side golden would sit beside, and it must be rewritten, not extended.
8. **`src/core/editing/section-ops.ts:16-34`, `cloneSection`** — a hand-enumerated deep clone
   (`paletteRef: sec.paletteRef, parallaxRef: sec.parallaxRef, bgLayoutRef: sec.bgLayoutRef,` at
   `:28-30`), **no spread**. A new `Section.sceneRef` omitted here is dropped on every add /
   duplicate / move-section op. *Mitigating:* the function's return type is annotated `: Section`,
   so TypeScript errors on the omission — this site is compile-gated, unlike the disk erasure. Worth
   naming anyway, because it is where "sidecars hold pointers" meets the section-grid commands.

Plus a ninth, structural rather than breaking: `src/renderer/providers/properties-aeon.ts:37` types
its input as `Pick<Section, 'objects' | 'rings' | 'bgLayoutRef'>` — a scene selector in the
properties panel widens that `Pick`, and `:247` (`aeonBackgroundCommand(index, section.bgLayoutRef,
value)`) is the shape a `sceneRef` command would copy.

**What is NOT in the way:**

- **No Zod schema, no MCP tool schema, and no fixture for `SectionMeta` exists.** `grep -rn "from
  'zod'" src/` returns six files (`core/project/mapping.ts`, `core/shell/session-persistence.ts`,
  `main/aether/adapter.ts`, `main/editor-methods.ts`, and two tests) — none references section meta.
  There is therefore no validation layer to extend and, equally, **no validation layer that would
  have caught the silent null-ification.**
- **The dest-field ownership invariant (`s4-config.ts:1-15`) does not apply.** It governs the three
  *art blob* pointers (`tileset`/`bgLayout`/`bgTiles`), where "bytes and the pointer that names
  them" must be fixed by one party. The meta sidecar is not a pointer-into-project.json at all —
  its path is derived (`${dataPath}section_${i}.meta.json`, `save.ts:71`/`:119`), never declared. A
  third ref inherits no ownership question from that invariant.

**The strongest single argument for the sidecar venue, which the survey did not make:** the sidecar
**already carries a write-only ref with no UI**. `grep -rn paletteRef src/` shows `paletteRef` is
read/written by exactly `save.ts:118`, `load.ts:326`, `section-ops.ts:28` and the model — **no
renderer component, no command, no agent tool touches it.** So the precedent for "a scalar ref that
persists through the sidecar ahead of the UI that edits it" is already established and shipping.
`sceneRef` would be the second such field, not the first.

**The counter-precedent, and it is the one that should worry the contract:** `Section.parallaxRef`
(`s4-types.ts:121`) is *also* a per-section scalar ref of exactly this shape — and it is **not in
the sidecar**. It is never written by `save.ts` and never populated by `load.ts`. It is initialised
`null` at `s4-types.ts:136`, faithfully carried by `cloneSection` at `:29`, and **round-trips to
nothing**: a per-section parallax assignment made in memory today is silently discarded on save.
A field with the exact name and exact shape of what ruling 2 proposes already exists and is already
broken in the quiet way. That is a design input, not a nitpick.

---

## 3. Weighted item 3 — Gap 1's absolute

**Verdict: CONFIRMED as literally worded, REFUTED in spirit.**

Case-insensitive sweeps over all of `src/`:

| term | hits | assessment |
|---|---|---|
| `bganim`, `bg_anim` | **0** | clean |
| `hscroll`, `vsram`, `vscroll`, `deform`, `vsplit` | **0** | clean |
| `scene` | 3, all in test *comments* | `facet-modules.test.ts:165` "the ONLY facet whose pill changes the scene"; `:266`; `facet-visibility.test.ts:30`. Metaphorical UI usage. Unrelated. |
| `raster` | 6 | all `rasterizeClassicChunk` / `rasterize` (`src/renderer/providers/chunk-grid-classic.ts:80`, `:167-169` + its tests). Chunk-to-RGBA blitting. Unrelated. |
| `variant` | ~20 | generic: `CollapsibleSection variant="list"`, `CollisionPalette({ variant = 'map' })`, discriminated-union payloads, object-sprite-cache keying. **No palette-variant concept.** Unrelated. |
| `anims` | ~30 | **all sprite animation**: `sprite-anim-export.ts`, `s1-object-anims`, `spriteStore.setCharacterAnims`, `object-anim-strips.ts`. **Zero relate to BgAnim bands.** Unrelated but worth flagging: the word `anims` is *already taken* in Aurora's vocabulary by sprite animation, so a BgAnim contract reusing the key inside Aurora's own types will collide semantically. |
| **`parallax`** | **not in the survey's list, and it is the interesting one** | see below |

**The pre-existing surface the absolute does not cover.** `'parallax'` is a **declared, first-class
facet capability**:

```ts
// src/core/project/adapter.ts:67-79
/** Capability keys a profile may grant (spec §7): which level-workspace facets
 *  its levels get. Superset of the facets built so far — parallax/events/preview
 *  are declared now so profiles can be authored against them before those
 *  facets exist (the shell renders registered-facets ∩ granted, so an
 *  unbuilt capability simply renders nothing). */
export const FACET_CAPABILITIES = [
  'layout', 'art', 'objects', 'rings', 'collision', 'palette',
  'parallax', 'events', 'preview',
] as const;
```

It is pinned by a contract test (`src/core/project/__tests__/adapter-contract.test.ts:11-16`,
`expect(FACET_CAPABILITIES).toEqual([… 'parallax', 'events', 'preview'])`) and by an ordering test
that literally registers a parallax facet (`src/core/shell/__tests__/facets.test.ts:57`
`expect(facetsFor(['parallax'])).toEqual([])`; `:63` `facetRegistry.register({ id: 'parallax',
label: 'Parallax', order: 15 })`). `src/core/shell/facets.ts:15-16` even reserves its slot number:
*"Built-ins use gaps of 10 so future facets (parallax 15, events 35, …) slot between without
renumbering."*

**Why this changes the arc's scope, not just its trivia:** ruling B8's INFERRED "adding an effects
view = one more facet module per engine" is *more* true than the survey knew — the capability key,
its ordering slot, its gating rule and its contract test all ship today. What an effects facet needs
is a `FacetModule` registration and a grant (`aeon`'s grant is
`facets: ['layout','art','objects','rings','collision','palette']`, `src/core/project/aeon/index.ts:123`
— `'parallax'` is *not* granted). That is two edits, both already shaped. Conversely: if the arc
names the facet anything other than `parallax`, it must amend `FACET_CAPABILITIES` and both pinning
tests, which the survey's gap list does not anticipate.

---

## 4. Weighted item 2 — the routing-marker claim

**Verdict: REFUTED. DRIFTED-(a) in the strongest sense — false at the survey's own pin.**

### What the adapter actually returns today

```ts
// src/core/project/aeon/index.ts:105-136
async open(fa: FileAccess, _overrides?: ProjectOverrides): Promise<ProjectHandle> {
    // Full profile open (spec §7): the load itself now lives in core (load.ts);
    // this returns the loaded project on handle.aeon. …
    const aeon = await loadAeonProject(fa, fa.rootDir ?? '');
    return {
      type: 'aeon',
      capabilities: { levels: 'aeon', sprites: true, objects: 'json', build: false,
        facets: ['layout', 'art', 'objects', 'rings', 'collision', 'palette'], artTiers: [ … ] },
      report: buildReport([]),
      levels: null,
      aeon,
    };
}
```

The file header states it outright (`:4-7`): *"Task 4 of the Stage 3 plan (spec §7): open() now
performs the real project load — the load itself lives in core (./load.ts …) — and returns the
loaded project on `handle.aeon`."*

### What the renderer actually calls

`useProject.loadFromPath` **does not exist**. `src/renderer/hooks/useProject.ts` is 38 lines and
contains one function, `useProject()`, whose only aeon branch is `:26-27`:

```ts
} else if (outcome === 'not-classic') {
  await openAeonProject(dir);
}
```

and `openAeonProject` is the adapter path:

```ts
// src/renderer/state/aeon-open.ts:1-2, :22
// Aeon open glue — replaces useProject.loadFromPath. Core does the load
// (aeonAdapter.open via FileAccess); this commits the result to the stores ATOMICALLY …
const handle = await aeonAdapter.open(createIpcFileAccess(dir));
```

### When it closed

`git log --diff-filter=A -1 -- src/renderer/state/aeon-open.ts` → **`4782e86 feat(aeon): open path
through core adapter with atomic store commit`, dated 2026-08-13**.
`git merge-base --is-ancestor 4782e86 4cffe45` → exit 0. **Nine days before the survey, and an
ancestor of its pin.** The survey inherited the error from `docs/ROADMAP.md:133-136` (still marked
"*STILL DEFERRED*") and `:638`; Aurora then handed the same stale caveat across the fence at
`:648`. **Aurora owns this defect end to end.**

### What an effects view can and cannot reach through the adapter today

`handle.aeon` is typed `AeonProjectData` (`src/core/project/adapter.ts:177-187`):

```ts
export interface AeonProjectData {
  config: LoadedS4Config;
  project: S4Project;
  collisionProfiles: CollisionProfileSet | null;
  notices: string[];
  legacyAtlasMerged: boolean;
}
```

**Reachable today, through a real load, no new adapter work:**
- the entire raw `project.json` — `LoadedS4Config.raw` is the parsed JSON object verbatim
  (`s4-config.ts`, `raw: json`), so **any** new top-level or per-act field is already in memory,
  including a re-pointed `parallax`;
- `Act.parallaxRef` (`s4-types.ts:227`), already populated from `actConfig.parallax`
  (`load.ts:370`);
- every section's `bgLayoutRef` / `paletteRef` from the sidecars (`load.ts:325-326`);
- the act BG (`bgLayout`/`bgTiles`) and the whole per-zone BG library (`load.ts:386-408`) — i.e.
  the exact pixels a BgAnim band editor needs to visualise;
- `dataPath`, so `editor/effects/*.json` sits one string-join from a reachable directory.

**NOT reachable, and this is gap 6's surviving substance:** nothing in `AeonProjectData` names a
scene, a preset, a band, a budget or a raster program; `loadAeonProject` reads no file under
`data/effects/` or `data/generated/`; and there is no scene-name→section resolution because no
scene name exists in the model.

**So the fix is a different, smaller parcel than gap 6 implies.** Gap 6 says the blocker is the
missing core-callable loader; the loader exists and is well-factored behind `FileAccess`. The
blocker is that `AeonProjectData` / `S4ActConfig` / `Section` carry no effects fields. Extending a
working loader is materially cheaper than building one, and the survey's effort estimate for this
gap should be revised down.

---

## 5. Weighted item 5 — what `s4-config.ts` actually does with `parallax`

**Verdict: "carried opaquely" is CONFIRMED-BUT-UNDERSPECIFIED.** Three distinct behaviours hide
behind the word, and ruling 4 ("re-point it, one change, no interim fossil") depends on all three.

**1. It is type-asserted, NOT validated or parsed.** `loadS4Config` validates exactly six things —
`name`, `engine === 's4'`, `zones` is an array, and per-act `id`, `gridWidth`/`gridHeight`,
`dataPath`:

```ts
for (const act of zone.acts) {
  if (!act.id) throw new Error(`Act missing "id" in zone "${zone.id}"`);
  if (!act.gridWidth || !act.gridHeight) throw new Error(`Act "${act.id}" missing grid dimensions`);
  if (!act.dataPath) throw new Error(`Act "${act.id}" missing "dataPath"`);
}
```

`parallax` is not checked. The function then returns `zones: json.zones` — **the raw array,
untransformed**. `S4ActConfig.parallax: string | null` (`:30`) is declared *required*, so TS forces
it in fixtures, but at runtime a `project.json` omitting the key yields `undefined`, which flows
straight into `Act.parallaxRef` (`load.ts:370`) despite the `string | null` type. A re-pointed
field with a typo, a wrong type, or a stale value produces **no error anywhere** — same failure
class as the sidecar's `typeof` guard (§2b).

**2. It IS round-tripped, byte-identically, and this is what makes ruling 4 safe.** `LoadedS4Config`
retains `raw: json`, and `save.ts:225-235` re-serializes that object whenever a pointer rewrite
fires, deliberately preserving formatting:

```ts
const trailer = config.rawTrailingNewline ? '\n' : '';
const projectJsonBytes = new TextEncoder().encode(JSON.stringify(config.raw, null, 2) + trailer);
```

with the comment (`:226-231`) explaining the 2-space indent and trailing-newline carry so *"every
untouched line re-serializes byte-identically"*. **So `parallax` — and any field aeon adds — is
neither dropped nor mangled by an Aurora save.** Unlike the meta sidecar, `project.json` is
spread-safe by construction. Ruling 4 can re-point it in one parcel without an Aurora-side write
path at all.

**3. It is surfaced to the model and never dereferenced.** `Act.parallaxRef` (`s4-types.ts:227`) is
set at `load.ts:370` and read by nothing. No `fa.read`, no path join, no UI. `docs/ROADMAP.md:377`
records the same status in Aurora's own words: `| Parallax/raster | Config path in project.json
only | ★ Raster mode + live preview (design #8) | aeon spec #8 | P5 |`.

**The citation error that matters.** The survey cites the model as `s4-types.ts:121`. That line is
`parallaxRef` on **`Section`**, a different field from the `Act.parallaxRef` at `:227` that
`load.ts:370` populates. Both exist; only the Act one is wired. Anyone implementing ruling 4 from
the survey's citation would wire the scene-id string into the dead per-section field (§2c) rather
than the live per-act one.

---

## 6. Weighted item 6 — Web Workers and the performance numbers

**"No Web Workers": CONFIRMED, unqualified.** `grep -rn "new Worker\|Worker(\|worker_threads"
src/` returns **zero** `Worker` constructions across the whole tree. Every canvas is same-thread;
`OffscreenCanvas` appears (e.g. `SectionRenderer.ts:69`, `:114`, `:256-262`) but that is a
same-thread scratch surface, not a thread boundary. The survey's reframing — *"'View/worker' in
practice = facet + play-clock overlay passes, not thread workers"* — is correct.

**The numbers: UNVERIFIABLE-BY-ME**, per the standing constraint (CDP harnesses need
`VITE_AURORA_DEBUG=1 npm run build` and a foreground display). What I *can* establish:

**The harnesses exist and are committed.** `git ls-files scratchpad` tracks **124 files**;
`.gitignore` excludes only `scratchpad/shots*/` (*"CDP harness screenshots — evidence for a run,
not artefacts to keep"*). The two relevant ones:

- `scratchpad/s1-priority-occlusion-harness.mjs` — the 30/30 occlusion harness (0.18 ms);
- `scratchpad/s1-layout-anim-harness.mjs` — the 22/22 layout-anim harness (0.49 ms).

**What the committed harness source actually asserts — and it is NOT 0.18 ms.** The occlusion
harness's perf check is `s1-priority-occlusion-harness.mjs:620-622`:

```js
check('11', 'occlusion pass runs per repaint under playback and holds budget (avg < 5ms)',
  …,
  `avg ${(dSum / Math.max(1, dDraws)).toFixed(3)}ms over ${dDraws} draws`);
```

The threshold is **`avg < 5ms`**; `0.18` is the *observed value printed in the evidence string* on
one run, not an asserted constant. Its only durable homes are prose:
`docs/ROADMAP.md:615` (*"0.18ms avg pass. Harness 30/30"*) and, for the other figure, the commit
subject `8cab9e0 test(classic): layout-anim CDP harness 22/22 — … 0.49ms avg pass`. **`0.49` appears
nowhere in the committed working tree — only in git history.**

**Consequence for the arc, and it is not pedantry.** §(e) leans on these numbers to infer that a
224-row per-line HScroll blit is *"INFERRED affordable: the shipped per-pixel occlusion pass
measures 0.18 ms"*. Those two figures are single-run observations under a `< 5ms` guard, on
**classic** canvases, at whatever zoom and viewport the harness happened to set. They are a
reasonable prior; they are not a measured budget for a different pass on a different viewport. If
the arc wants a budget it can hold a design to, the honest move is a fresh measurement — see §9.

**And the machinery is on the wrong viewport.** This qualifies both B11 and gap 5's closing clause
(*"The play-clock + overlay-pass machinery to hang these on now exists"*):

- The play clock is **not a shared module**. It is a `useEffect` body inside
  `ClassicLevelViewport.tsx:411-429`.
- `src/renderer/components/MapViewport.tsx` — the **aeon** viewport, the one that renders the OJZ
  showcase this arc exists for — contains **zero** `requestAnimationFrame` calls and no
  `playAnimatedArt` reference (grep returns nothing).
- `viewStore.ts:52-56` proves it by declaration:

```ts
export const OVERLAY_KEYS_BY_ENGINE: Record<OpenEngine, readonly (keyof OverlayOptions)[]> = {
  s1: ['showObjects', 'showStart', 'showCollision', 'showCollisionAngles', 'showPriority', 'occludeSprites', 'playAnimatedArt'],
  aeon: ['showObjects', 'showRings', 'showTileGrid', 'showBlockGrid', 'showChunkGrid',
    'showCollision', 'showCollisionAngles', 'showCollisionPathB', 'showBgPlane'],
};
```

`playAnimatedArt` and `occludeSprites` are **s1-only**. The overlay *store* is shared; the animated
overlay *machinery* is not. The arc's preview work on the aeon side starts from a static canvas,
and ROADMAP `:615` says as much in Aurora's own words: *"**Still open: the aeon viewport half** — no
priority-mask derivation exists there yet."*

---

## 7. What the survey missed (cited facts only)

### 7.1 Aurora already has a committed BgAnim band-editor design — gap 4 is not greenfield

Gap 4 says only that no Aurora UI touches `anims`. True for code. But
`docs/superpowers/specs/2026-08-13-ux-overhaul-stage4-design.md` **§7 "Aeon BG bridge and band
editor (piece D)"** (`:302-359`) already designs exactly the wave-1 piece ruling 1 sequences first,
and several of its rulings differ from or pre-empt the survey's:

- **Direction already ruled** (`:44`): *"The notes assumed the export must invert
  `inject_editor_bg.py` … **It must not. Aurora writes the JSON override, not the binaries**;
  `inject_editor_bg.py` still performs that transform downstream. Aurora's in-memory BG is already
  row-major with blob-local indices — the exact convention `editor_bg_override.json` uses — so the
  export is effectively identity"*, with `:50` recording it verified byte-identical against a
  shipped library entry.
- **The save contract** (`:311`): *"**Save** writes `editor_bg_override.json` from the act's active
  BG using the identity transform (§2.2), preserving `palette` / `palette_line` when present and
  emitting `anims` from the band model (§7.2)."*
- **Aurora as third author of the 44-byte record** (`:358`): *"The 44-byte `bganim_band` record has
  two authors — `aeon/tools/inject_editor_bg.py` and `aeon/engine/level/bg_anim.emp` — and Aurora
  becomes a third. Any format change edits all three."* The survey's A3 says the record is a
  "LOCKSTEP twin" with **two** authorities plus the emitter; Aurora's design already books itself as
  the fourth site.
- **The main correctness risk, already identified** (`:344-345`): *"Band patterns must occupy local
  slots `[0, Σn)`, contiguously, before any static tile. Adding or removing a band therefore
  renumbers the entire static tile blob and rewrites the layout. This must be **one automatic,
  single-undo command**. It is the main correctness risk in piece D."*
- **The live invariant list** (`:349-357`): ≤4 bands, `rows ∈ {1,2,4,8,16}`, `pattern_px == cols*8`,
  contiguous from slot 0, `Σ(band tiles) + static ≤ 448`, ROM cost `8·cols·rows·32` per band.
- **The round-trip golden already specified** (`:428`): *"**BG round-trip:** golden test — Aurora's
  exported override, run through a TS mirror of `inject_editor_bg.py`'s forward transform,
  byte-matches the checked-in `zone_bg.bin` / `bg_tiles.bin`."*

And `docs/superpowers/plans/2026-08-14-plan6-handoff.md:172-179` records piece D as **not started**
plus three corrections that the arc must carry:

> **Piece D** — greenfield. Only step 1 of the load chain exists; nothing writes
> `editor_bg_override.json`; no `BgBand` model at all. Key findings that correct the spec … :
> **every band driver shifts HORIZONTALLY** (`driver` picks the scalar source, never the axis);
> **§7.5's "import 448 from `vram_map.py`" describes machinery that does not exist** (separate
> repos, no codegen either way) so Aurora must grow a generator or restate with a guard; and
> **`paintBgTile` already mutates outside undo**.

The horizontal-driver correction in particular contradicts the natural reading of the survey's A3
(*"driver = Camera_X / Camera_Y / Logic_Tick"* reads as an axis choice). **Wave 1's BgAnim half
should be cut against this design plus its corrections, not designed from scratch.**

### 7.2 Aurora's ROADMAP books a *different* contract path and *different* generator names

`docs/ROADMAP.md:503-505`, §4.6 "Parallax/raster — execute design #8 (Aurora half)":

> documents at `data/editor/{parallax,raster}/*.json`; shared packer `core/formats/parallax-pack.ts`
> golden-tested against `parallax_gen.py`; live preview = pack → debounce 50ms →
> `emulator/write_memory` payload-then-flag into the engine's DEBUG override blocks

This is a booked Aurora-side contract naming **two directories** (`editor/parallax/`,
`editor/raster/`), a **named TS packer module**, and **two generators** (`parallax_gen.py`,
`raster_gen.py`, also named in the §2.4 design table at `:87`). Option B and ruling 5 specify **one**
directory (`editor/effects/`) and **one** generator (`effects_gen.py`). Neither generator exists in
aeon (`ls tools/parallax_gen.py tools/raster_gen.py` → both absent), so nothing is built against
either naming — but the arc must explicitly supersede ROADMAP §4.6, or Aurora will carry two
contradictory contracts in its plan of record. The survey read §2.5/§2.6/§5.1/§5.2 (its stated
required-reading set) and did not reach §4.6.

### 7.3 Aurora's ROADMAP overclaims `editor_bg_override.json` as an Aurora-owned input

`docs/ROADMAP.md:74-76` lists it under *"Editor-owned inputs the build already consumes"*:
`section_{N}.tiles.bin`, `.collattr.bin`/`.collattrb.bin`, `objects.json`, `rings.json`,
`meta.json`, `data/editor/{zone}_tiles.bin`, **BG library + `editor_bg_override.json`**. Nothing in
`src/` reads or writes it (§C4). Corroborates gap 4 while adding that Aurora's own roadmap is
already wrong about it — the same staleness class as the routing marker (§4). Both lines should be
corrected in the same pass.

### 7.4 The stale BG ceilings §7.6 said were "Fixed here" are still stale

`2026-08-13-ux-overhaul-stage4-design.md:362-365` records: *"`src/renderer/agent/agent-handler.ts`
has `BG_TILES_HIGH = 32` and `BG_MAX_TILES = 512`; both are wrong (all 64 rows are live; the ceiling
is 448). `get-bg` reports `height: 32` unconditionally and `set-bg` rejects any layout that is not
2048 words — so the agent path **cannot author the 64-row BG the library already contains**. Fixed
here."* It was not fixed — piece D never started:

```ts
// src/renderer/agent/agent-handler.ts:51-52
const BG_TILES_HIGH = 32;
const BG_MAX_TILES = 512;
```

still gating `height: BG_TILES_HIGH` (`:481`), the tile-count check (`:489-490`) and
`layout.length !== BG_WIDTH * BG_TILES_HIGH` (`:498-499`). `src/core/formats/bg-tiles.ts:37` carries
the matching stale comment (*"the engine's fixed 64x32 Plane B"*). **Any BgAnim band work reaching
the BG through the agent surface hits a hard 32-row / 512-tile wall today**, and the 448 ceiling the
band invariants depend on is not represented anywhere in Aurora.

### 7.5 `zod` is available but unused for any project-data schema

The survey's stack list omits `"zod": "^4.4.3"` (`package.json:26`), a **runtime** dependency
already used for session persistence, Aether adapter methods and MCP method params
(`src/main/editor-methods.ts:1`, `src/main/aether/adapter.ts:1`,
`src/core/shell/session-persistence.ts:12`, `src/core/project/mapping.ts:12`). No project-data
format uses it — not `SectionMeta`, not `s4-config`, not the BG library. The validation layer the
effects schema needs already ships and is already the house idiom on the IPC boundary; it has simply
never been pointed at on-disk formats. That is a cheap answer to both silent-null failure modes
(§2b, §5).

### 7.6 The survey's two errata are independently CONFIRMED

Read at aeon `5be97277` and re-derived from source, not accepted:

- **ERRATUM 1's four executable sites**: confirmed at `section-meta.ts:21`, `:22`, `:29-30`,
  `save.ts:124`. Its addendum's non-string claim: confirmed and demonstrated (§2b, case B). Its site
  count of six: confirmed, and raised to **eight** (§2c).
- **ERRATUM 2's silent-destroy mechanism**: confirmed exactly. `load.ts:320-329` is a bare catch —
  `} catch { // no meta sidecar — defaults from createSection stand }` — while the rings loader
  seven lines above (`:310-318`) routes through `markUnreadable`, and `save.ts:78`'s `understood()`
  gate covers `tiles.bin` (`:81`), `objects.json` (`:99`) and `rings.json` (`:106`) but **not**
  `meta.json`. The `save.ts:73-77` comment states the rule the meta path breaks: *"A file the LOAD
  could not read holds a placeholder in memory, not the user's data — writing it back is how a
  truncated hand-edit or a merge-conflict marker turns into a permanent loss."*

---

## 8. Verification hygiene

- Branch `docs/verify-aeon-effects-survey`, cut from `e731214`. **Never on master**; confirmed with
  `git branch --show-current` before committing.
- The aeon tree was read **read-only** throughout (`sed`, `ls`, `python3 -c json.load`, and one
  `git log -1`). Nothing written, nothing committed there.
- **No emulator MCP tool was called.** No CDP harness was run.
- One temporary source plant (`parseSectionMeta` spread, §2b) was made to falsify the demonstration
  test, then **restored from a byte copy** — not `git checkout`/`stash`/`restore`, per the recorded
  hazard in `plan6-handoff.md:186-188`. `git status --short` empty afterwards; scratch test files
  deleted.
- Post-restore state: `npx tsc --noEmit` **exit 0**; `npx vitest run` → **Test Files 323 passed |
  1 skipped (324); Tests 3849 passed | 3 skipped (3852); 0 failed**, duration 7.59 s, at wall clock
  04:32 (uptime 4 days, 4:55).

---

## 9. Tagged for foreground / runtime follow-up

Things only the controller can settle. None was attempted.

1. **TAG-PERF-1 — re-measure the overlay budget before §(e) leans on it.** 0.18 ms and 0.49 ms are
   single-run observations under a `avg < 5ms` guard (§6). If a per-line HScroll preview is to be
   scoped against them, run `scratchpad/s1-priority-occlusion-harness.mjs` and
   `scratchpad/s1-layout-anim-harness.mjs` in the foreground (`VITE_AURORA_DEBUG=1 npm run build`)
   and record fresh figures with the zoom/viewport they were taken at.
2. **TAG-PERF-2 — there is no aeon-viewport perf datum at all.** Every committed figure is from
   `ClassicLevelViewport`. `MapViewport` has never been measured under an animated overlay because
   it has never had one (§6). The showcase runs on `MapViewport`. A foreground baseline there is the
   prerequisite for any preview effort estimate.
3. **TAG-DOC-1 — correct the stale ROADMAP lines before they mislead anyone else.**
   `docs/ROADMAP.md:133-136` and `:638` (routing marker, §4) and `:74-76`
   (`editor_bg_override.json` as an Aurora-owned input, §7.3). `:648` should also drop the caveat it
   hands across the fence. This is an Aurora-owned edit and is not in scope for a verification pass.
4. **TAG-XREF-1 — the two-contract conflict needs an owner ruling.** ROADMAP §4.6's
   `editor/{parallax,raster}/` + `parallax_gen.py`/`raster_gen.py` vs the arc's `editor/effects/` +
   `effects_gen.py` (§7.2). Whichever wins, the losing text must be superseded explicitly.
5. **TAG-XREF-2 — hand §7.1 back to aeon.** Aurora's Stage 4 §7 design + the plan6-handoff
   corrections are direct input to wave 1's BgAnim half and to aeon's consumer field list
   (especially the horizontal-driver correction and the "448 is not importable across repos"
   finding). The aeon session has not seen them.
6. **TAG-RUNTIME-1 — the `Section.parallaxRef` dead field (§2c/§5) has never been exercised at
   runtime**, because nothing writes it. Whether a real project has ever had a per-section parallax
   assignment silently discarded is a question for the owner's data, not for source.
