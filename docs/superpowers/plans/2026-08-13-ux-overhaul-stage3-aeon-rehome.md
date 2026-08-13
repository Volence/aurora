# Aurora UX Overhaul — Stage 3: Re-home Aeon Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Aeon becomes a full profile (its load/save pipeline moves out of the renderer into `core/project/aeon` behind the `FileAccess` seam) and its Map/Art/Sprite content re-homes into the facet-based level workspace: a renderer facet-module registry, a `LevelWorkspace` with the pill facet bar (Layout · Art · Objects · Rings · Collision · Palette), sprite editing as `sprite-doc` tabs, per-document undo on `DocumentHistoryHub`, and per-tab facet/viewport session persistence. The two Stage-2 deferred data-loss gaps (project-switch dirty guard; aeon→aeon restore sliver) are closed here.

**Architecture:** Phase A promotes aeon: `loadFullProject`/`saveProject` (today ~650 renderer lines in `hooks/useProject.ts` doing IO via `window.api`) are ported into core as `loadAeonProject(fa, dir)` / `buildAeonSavePlan(fa, …)` over the injected `FileAccess`; `aeonAdapter.open()` performs the real load and returns the data on a new optional `ProjectHandle.aeon` field; the renderer keeps two thin glue modules (`state/aeon-open.ts`, `state/aeon-save.ts`) and commits the loaded project to `projectStore` in ONE atomic `set` (which is what closes the aeon→aeon restore sliver). Phase B builds the workspace: `facetModules` registry (spec §9 slot interface: Canvas/ToolDock/ToolOptions/RightPanel/BottomExtra/StatusBar), `LevelWorkspace` owning the single `EditorShell`, per-facet tool sets as a pure module, aeon undo re-keyed per act through `documentHistoryHub`, `SpriteMode` hosted once at App level for `sprite-doc` tabs (the classic edit-art handoff re-routes through a tab, killing `appMode`), and the session payload gaining a per-tab `workspace` record. Classic keeps `LegacyWorkspace` verbatim until Stage 4; after this stage LegacyWorkspace is classic-only.

**Tech Stack:** TypeScript (strict), React 19 inline-style components themed from `ui/theme.ts` tokens, zustand v5, zod v4, vitest (node env — NO jsdom; components stay thin and untested, logic lives in pure modules). Spec: `docs/superpowers/specs/2026-08-12-aurora-ux-overhaul-design.md` (§4 workspace, §5 objects, §7 profiles, §9 facet registry, §10 save/undo/sessions, §12 stage 3). Pre-planning notes: `docs/superpowers/plans/2026-08-12-ux-overhaul-stage3-notes.md`.

**Conventions for every task:**
- Work in the worktree created in Task 0 at `/home/volence/sonic_hacks/aurora/.claude/worktrees/ux-stage3`.
- **MANDATORY TRIPWIRE for every implementer (hardened after a Stage 2 agent committed to live master):**
  1. EVERY Bash command MUST be prefixed with `cd /home/volence/sonic_hacks/aurora/.claude/worktrees/ux-stage3 && ` — subagent shells START in the main tree.
  2. EVERY file tool call (Read/Write/Edit) MUST use absolute paths under `/home/volence/sonic_hacks/aurora/.claude/worktrees/ux-stage3/`.
  3. Before your FIRST command: `git branch --show-current` MUST print `feature/ux-overhaul-stage3`. If not, STOP and report.
  4. At end of work: `cd /home/volence/sonic_hacks/aurora && git log -1 --format=%H master` MUST equal the value recorded in Task 0. If master's HEAD moved, STOP and report — do not push, do not "fix" it.
- Run tests with `npx vitest run <file>` from the worktree root; full suite + `npx tsc --noEmit` before each commit.
- Commit style `type(scope): summary`, single line. NEVER add a Co-Authored-By trailer.
- Baseline at branch point: **144 test files / 1258 passed / 2 skipped; tsc clean.** Nothing may regress.
- File-layout note: paths in this plan are worktree-relative (`src/...`). All line numbers reference the state at the branch point (master `6c3be11`).

**Stage 3 decisions locked here (so implementers don't re-litigate):**
- **`ProjectHandle` gains an optional `aeon` payload field** rather than forcing aeon levels through `ClassicLevelAccess`. Aeon's level model (`S4Project`, all acts resident) is not the classic read/write-per-act model; wedging it in would be a lie. The handle stays the single "opened project" currency.
- **Aeon still loads every act eagerly** (as today). Act switching remains a pure pointer move; nothing in this stage makes aeon acts lazily loaded.
- **The facet-module interface is the spec §9 slot set** (Canvas/ToolDock/ToolOptions/RightPanel/BottomExtra/StatusBar per facet id); `LevelWorkspace` owns the ONE `EditorShell`. Facet registration is idempotent (register-if-absent) — that is the HMR answer; `createRegistry` does NOT grow `unregister` (watch-list #7 resolved: not needed).
- **Layout/Objects/Rings/Collision/Palette facets all mount the same `MapViewport`** (it already renders every overlay and gates behavior on `editorStore.tool`); what differs per facet is the allowed tool set (pure module `facet-tools.ts`), the right-panel content, and the bottom extra. `MapViewport` itself is NOT refactored in this stage.
- **Per-facet tool rule:** switching facets keeps the current tool if the target facet allows it, else selects the facet's default. Canvas pan/zoom is per-act (viewStore), untouched by facet switches — spec §4 "keeps canvas position".
- **Aeon undo goes per-document NOW via `documentHistoryHub`** keyed by the act tab id (`level:<zone>:<act>`). Zone-scoped commands (tileset/palette/chunk edits) land in the history of the act tab they were made in — accepted v1 semantics, documented in code. Sprite/classic histories stay outside the hub until Stage 4 (the hub holds `EditHistory` only).
- **`appMode` is deleted.** Aeon map/art become facets; sprite becomes `sprite-doc` tabs. `SpriteMode` gets exactly ONE mounting point (the App-level sprite-doc pane, mounted only while a sprite-doc tab is active — two mounted instances would double-register its window keydown handler and double-fire undo). The classic edit-art handoff opens a `doc:sprite:s1:<id>` tab. This intentionally touches one classic flow ahead of Stage 4 because the alternative (two SpriteMode hosts) is broken by construction.
- **Sprite-doc dirtiness for guards/dots** = `spriteStore.s1ArtSource !== null || spriteHistory.canUndo`. `canUndo` stays true after a successful save-art (history isn't cleared on save), so the guard can over-ask after a save — fails safe, accepted v1.
- **Per-tab persisted state lives in a separate `workspace` record** in the session payload (`{ tabs, activeId, workspace? }`), NOT as new fields on `TabDescriptor` — the core session reducers stay untouched and tab identity stays pure. The `aurora.session.v1:` storage key is kept (the payload change is additive; old payloads restore fine).
- **Aeon gets no `ResolutionReport`/sidecar in this stage** (spec §7's aeon-vs-classic difference is real: aeon's project.json IS its mapping). `handle.report` stays empty; Project Setup remains classic-only.
- **Explorer aeon groups become Levels / Object Library / Tools.** Aeon Object Library rows come from `project.objectLibrary` (`ObjectDef[]`); rows with a `sprite` binding open a `doc:sprite:aeon:<sprite>` tab, rows without are disabled with reason "no sprite bound".
- **TabStrip a11y (gap #3) stays deferred** — this stage does not touch TabStrip internals. Tab drag-reorder (watch-list #5) stays unbuilt.
- **`FacetCapability`'s canonical home is `core/project/adapter`** (watch-list #6); it also gains a runtime `FACET_CAPABILITIES` const for zod. Renderer code imports the type from `core/project/adapter` (not via `core/shell/facets`).

---

### Task 0: Worktree + branch setup

**Files:** none (git only)

- [ ] **Step 1: Create the worktree and branch off master**

```bash
cd /home/volence/sonic_hacks/aurora
git worktree add .claude/worktrees/ux-stage3 -b feature/ux-overhaul-stage3 master
cd .claude/worktrees/ux-stage3
ln -s /home/volence/sonic_hacks/aurora/node_modules node_modules
git branch --show-current   # MUST print: feature/ux-overhaul-stage3
```

(Do NOT `npm install` in the worktree — pre-existing electron-vite/vite-8 peer conflict; the symlink reuses the main tree's install.)

- [ ] **Step 2: Record master's HEAD for the end-of-task tripwire**

```bash
cd /home/volence/sonic_hacks/aurora && git log -1 --format=%H master
```

Record the hash in the task notes; every implementer compares against it at end of work. Also confirm `.claude/` is in `/home/volence/sonic_hacks/aurora/.git/info/exclude` (it should be, from Stage 2; append if missing).

- [ ] **Step 3: Commit this plan onto the branch**

```bash
cp /home/volence/sonic_hacks/aurora/docs/superpowers/plans/2026-08-13-ux-overhaul-stage3-aeon-rehome.md \
   /home/volence/sonic_hacks/aurora/.claude/worktrees/ux-stage3/docs/superpowers/plans/
cd /home/volence/sonic_hacks/aurora/.claude/worktrees/ux-stage3
git add docs/superpowers/plans/2026-08-13-ux-overhaul-stage3-aeon-rehome.md
git commit -m "docs(ux): stage 3 aeon re-home implementation plan"
```

- [ ] **Step 4: Verify the baseline**

Run: `npx vitest run` then `npx tsc --noEmit` (worktree root).
Expected: 144 files / 1258 passed / 2 skipped; tsc silent.

---

## Phase A — Aeon becomes a full profile

### Task 1: Core contract prep — `FACET_CAPABILITIES` const + `ProjectHandle.aeon`

**Files:**
- Modify: `src/core/project/adapter.ts`
- Test: `src/core/project/__tests__/adapter-contract.test.ts` (create)

- [ ] **Step 1: Write the failing test**

Create `src/core/project/__tests__/adapter-contract.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { FACET_CAPABILITIES, type FacetCapability, type AeonProjectData, type ProjectHandle } from '../adapter';

describe('adapter contract additions (stage 3)', () => {
  it('FACET_CAPABILITIES enumerates the full declared facet vocabulary in order', () => {
    expect(FACET_CAPABILITIES).toEqual([
      'layout', 'art', 'objects', 'rings', 'collision', 'palette',
      'parallax', 'events', 'preview',
    ]);
  });

  it('FacetCapability stays assignable from the const list (type-level check)', () => {
    const f: FacetCapability = FACET_CAPABILITIES[0];
    expect(f).toBe('layout');
  });

  it('ProjectHandle.aeon is optional (marker handles omit it)', () => {
    // Type-only shape check: a handle without `aeon` compiles; one with it carries the payload.
    const h: Pick<ProjectHandle, 'type'> & { aeon?: AeonProjectData } = { type: 'aeon' };
    expect(h.aeon).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run it to make sure it fails**

Run: `npx vitest run src/core/project/__tests__/adapter-contract.test.ts`
Expected: FAIL — `FACET_CAPABILITIES` / `AeonProjectData` not exported.

- [ ] **Step 3: Implement in `adapter.ts`**

Replace the `FacetCapability` type alias (lines 60–62) with:

```typescript
/** Runtime list backing FacetCapability, exported so zod schemas and facet
 *  registries can enumerate/validate without duplicating the union. Canonical
 *  home of the facet vocabulary (import from here, not core/shell/facets). */
export const FACET_CAPABILITIES = [
  'layout', 'art', 'objects', 'rings', 'collision', 'palette',
  'parallax', 'events', 'preview',
] as const;
export type FacetCapability = (typeof FACET_CAPABILITIES)[number];
```

Add imports at the top (below the existing ones):

```typescript
import type { LoadedS4Config } from '../config/s4-config';
import type { S4Project } from '../model/s4-types';
import type { CollisionProfileSet } from '../collision/collision-model';
```

Add above the `ProjectHandle` interface:

```typescript
/**
 * The fully-loaded aeon project an aeon adapter open() returns (spec §7:
 * "loading logic moves out of the renderer"). Aeon's level model is all-acts-
 * resident, so the handle carries the whole project rather than a per-act
 * read/write access like classic's `levels`.
 */
export interface AeonProjectData {
  config: LoadedS4Config;
  project: S4Project;
  collisionProfiles: CollisionProfileSet | null;
  /** Human notices produced during load (e.g. atlas unification), for toasts. */
  notices: string[];
  /** True when the legacy chunk-tiles atlas was merged THIS load — gates the
   *  save-time truncation of chunks_tiles.bin (see buildAeonSavePlan). */
  legacyAtlasMerged: boolean;
}
```

And add to `ProjectHandle` (after `sidecar?`):

```typescript
  /** The loaded aeon project (aeon adapter only; absent on classic handles). */
  aeon?: AeonProjectData;
```

- [ ] **Step 4: Run the test + suite guards**

Run: `npx vitest run src/core/project/__tests__/adapter-contract.test.ts` → PASS.
Run: `npx vitest run && npx tsc --noEmit` → no regressions.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat(core): FACET_CAPABILITIES const and ProjectHandle.aeon payload contract"
```

---

### Task 2: Core aeon loader — port `loadFullProject` behind `FileAccess`

**Files:**
- Create: `src/core/project/aeon/load.ts`
- Create: `src/core/project/aeon/__tests__/aeon-load.test.ts`
- Reference (do not modify): `src/renderer/hooks/useProject.ts` (lines 55–134 + 384–714), `src/renderer/hooks/load-collision.ts`

This is a mechanical port: the ONLY behavioral deltas are (a) IO goes through `fa: FileAccess` instead of `window.api.readBinaryFile`, (b) toasts become returned `notices`, (c) the module-level `legacyAtlasMergedThisLoad` flag becomes a returned field, (d) store writes are removed (the renderer glue commits). Console warns/errors stay.

- [ ] **Step 1: Write the failing test**

Create `src/core/project/aeon/__tests__/aeon-load.test.ts`. It builds a minimal in-memory aeon project using the core serializers, so load is validated against the same byte formats save produces:

```typescript
import { describe, it, expect } from 'vitest';
import type { FileAccess } from '../../adapter';
import { loadAeonProject, dominantPaletteLine } from '../load';
import { serializeNametable } from '../../../formats/s4-nametable';
import { serializeTiles } from '../../../export/tile-dedup';
import { SECTION_TILES_WIDE, SECTION_TILES_HIGH } from '../../../model/s4-types';
import type { Tile } from '../../../model/s4-types';

function tile(fill: number): Tile {
  return { pixels: new Uint8Array(64).fill(fill) };
}

/** In-memory FileAccess over a Map<rel, bytes>. read() throws on a miss, like the IPC bridge. */
function memFa(files: Map<string, Uint8Array>): FileAccess {
  return {
    exists: async (rel) => files.has(rel),
    read: async (rel) => {
      const b = files.get(rel);
      if (!b) throw new Error(`ENOENT: ${rel}`);
      return b;
    },
    list: async () => [],
  };
}

const PROJECT_JSON = {
  name: 'Test Project',
  engine: 's4',
  objectLibrary: 'data/objects.json',
  chunkLibrary: '',
  zones: [{
    id: 'ojz', name: 'OJ Zone',
    tileset: 'data/ojz_tiles.bin',
    palette: 'data/ojz_pal.bin',
    acts: [{
      id: 'act1', gridWidth: 1, gridHeight: 1,
      dataPath: 'data/ojz/act1/',
      bgLayout: '', bgTiles: '', parallax: null,
      startPosition: { secX: 0, secY: 0, localX: 64, localY: 64 },
    }],
  }],
};

function fixtureFiles(): Map<string, Uint8Array> {
  const files = new Map<string, Uint8Array>();
  files.set('project.json', new TextEncoder().encode(JSON.stringify(PROJECT_JSON)));
  files.set('data/ojz_tiles.bin', serializeTiles([tile(0), tile(1)]));
  // Palette: 48 words (3 CRAM lines) of Genesis 0x0EEE-style colors.
  const pal = new Uint8Array(96);
  for (let i = 0; i < 48; i++) { pal[i * 2] = 0x0E; pal[i * 2 + 1] = 0xEE; }
  files.set('data/ojz_pal.bin', pal);
  // One saved section: nametable referencing tile 1 on palette line 2.
  const nt = new Uint16Array(SECTION_TILES_WIDE * SECTION_TILES_HIGH);
  nt[0] = (2 << 13) | 1;
  files.set('data/ojz/act1/section_0.tiles.bin', serializeNametable(nt));
  files.set('data/ojz/act1/section_0.objects.json',
    new TextEncoder().encode(JSON.stringify([{ id: 'o1', typeId: 'ring-monitor', x: 8, y: 8 }])));
  files.set('data/objects.json',
    new TextEncoder().encode(JSON.stringify([
      { id: 'ring-monitor', name: 'Ring Monitor', codeLabel: 'Obj_Monitor', defaultSubtype: 0, properties: {} },
    ])));
  return files;
}

describe('loadAeonProject', () => {
  it('loads config, zones, sections, objects and the object library from FileAccess', async () => {
    const r = await loadAeonProject(memFa(fixtureFiles()), '/proj');
    expect(r.config.name).toBe('Test Project');
    expect(r.config.basePath).toBe('/proj');
    expect(r.project.zones).toHaveLength(1);
    const act = r.project.zones[0].acts[0];
    expect(act.sections).toHaveLength(1);
    expect(act.sections[0]?.tileGrid.nametable[0]).toBe((2 << 13) | 1);
    expect(act.sections[0]?.objects).toEqual([{ id: 'o1', typeId: 'ring-monitor', x: 8, y: 8 }]);
    expect(r.project.objectLibrary).toHaveLength(1);
    expect(r.project.zones[0].tileset.tiles).toHaveLength(2);
    expect(r.collisionProfiles).toBeNull();       // no collision tables in fixture
    expect(r.legacyAtlasMerged).toBe(false);      // no chunk library configured
    expect(r.notices).toEqual([]);
  });

  it('yields a null section for a grid slot with no data files', async () => {
    const files = fixtureFiles();
    files.delete('data/ojz/act1/section_0.tiles.bin');
    const r = await loadAeonProject(memFa(files), '/proj');
    expect(r.project.zones[0].acts[0].sections[0]).toBeNull();
  });

  it('rejects a non-s4 project.json with the loader error (validation is NOT weakened)', async () => {
    const files = fixtureFiles();
    files.set('project.json', new TextEncoder().encode(JSON.stringify({ ...PROJECT_JSON, engine: 'nope' })));
    await expect(loadAeonProject(memFa(files), '/proj')).rejects.toThrow(/expected engine "s4"/i);
  });
});

describe('dominantPaletteLine', () => {
  it('picks the most-used palette line of the first non-null section (ignoring blank tiles)', async () => {
    const r = await loadAeonProject(memFa(fixtureFiles()), '/proj');
    expect(dominantPaletteLine(r.project)).toBe(2);
  });

  it('falls back to 0 with no sections', async () => {
    const files = fixtureFiles();
    files.delete('data/ojz/act1/section_0.tiles.bin');
    const r = await loadAeonProject(memFa(files), '/proj');
    expect(dominantPaletteLine(r.project)).toBe(0);
  });
});
```

- [ ] **Step 2: Run it to make sure it fails**

Run: `npx vitest run src/core/project/aeon/__tests__/aeon-load.test.ts`
Expected: FAIL — `../load` does not exist.

- [ ] **Step 3: Implement `src/core/project/aeon/load.ts`**

Port from `useProject.ts`. Module skeleton (the `…` bodies are VERBATIM moves of the referenced renderer lines — copy them, then apply only the mechanical substitutions listed below):

```typescript
// Aeon project loader — the renderer's loadFullProject (hooks/useProject.ts)
// ported behind the FileAccess seam (spec §7: aeon becomes a full profile;
// loading logic moves out of the renderer). Pure core: no fs/Electron/window.
//
// Behavioral parity is the contract for this port: same probe order, same
// error handling, same migrations. Only the IO primitive and the reporting
// channel changed (window.api → fa; toasts → returned notices).

import type { FileAccess } from '../adapter';
import type { AeonProjectData } from '../adapter';
import { loadS4Config, collisionDataPathCandidates, projectDataRoot, type S4ProjectConfig, type LoadedS4Config } from '../../config/s4-config';
import { s4CollisionAdapter } from '../../collision/adapters/s4-collision-adapter';
import type { CollisionProfileSet } from '../../collision/collision-model';
import { findFullBlockShapeId } from '../../collision/full-block-shape';
import { migrateLegacyChunkCollision } from '../../model/chunk-migrate';
// …plus every core/formats, core/collision, core/art, core/model import that
// useProject.ts lines 20–53 pull in for the load path (parseTiles, buildPalette,
// parseNametable, parseCollAttr, resolvePlaneWords, parseStrips + STRIP_COLS/ROWS,
// parseBgTiles/normalizeBgLayout/BG_TILE_BASE_SLOT/BG_WIDTH, bg-library paths +
// parseBgLibraryIndex, parseSectionMeta, migrateChunkTilesIntoTileset,
// createSection/SECTION_TILES_WIDE/SECTION_TILES_HIGH, s4-types model types).

export type { AeonProjectData };

/** Derive the legacy chunk-tiles atlas path from the chunk-library JSON path.
 *  (Moved verbatim from useProject.ts legacyAtlasPath.) */
export function legacyAtlasPath(chunkLibraryPath: string): string {
  return chunkLibraryPath.replace('.json', '_tiles.bin');
}

/** Port of hooks/load-collision.ts loadCollisionProfiles over FileAccess:
 *  probe `${dir}base/` then `${dir}`; all misses → null (graceful degrade). */
export async function loadCollisionProfilesFa(
  fa: FileAccess, relDir: string,
): Promise<CollisionProfileSet | null> {
  const dir = relDir.endsWith('/') ? relDir : `${relDir}/`;
  for (const sub of [`${dir}base/`, dir]) {
    try {
      const [heightmaps, angles, solidity] = await Promise.all([
        fa.read(`${sub}heightmaps.bin`),
        fa.read(`${sub}angles.bin`),
        fa.read(`${sub}solidity.bin`),
      ]);
      return s4CollisionAdapter.decodeProfiles({ heightmaps, angles, solidity });
    } catch { /* try next location */ }
  }
  return null;
}

/** Auto-detect the dominant CRAM line of the first non-null section — pure
 *  extraction of the loop in useProject.ts loadFromPath lines 107–126. */
export function dominantPaletteLine(project: S4Project): number { /* verbatim loop; return dominant (0 default) */ }

/**
 * Full aeon open: read+validate project.json, load collision profiles, then
 * the whole project. `dir` is the absolute directory the FileAccess is rooted
 * at — recorded as config.basePath (the renderer needs it for writes and as
 * the session key).
 */
export async function loadAeonProject(fa: FileAccess, dir: string): Promise<AeonProjectData> {
  const jsonData = await fa.read('project.json');
  const json = JSON.parse(new TextDecoder().decode(jsonData)) as S4ProjectConfig;
  const config = loadS4Config(json, dir);

  let collisionProfiles: CollisionProfileSet | null = null;
  for (const collPath of collisionDataPathCandidates(config.raw)) {
    collisionProfiles = await loadCollisionProfilesFa(fa, collPath);
    if (collisionProfiles) break;
  }

  const notices: string[] = [];
  const { project, legacyAtlasMerged } = await loadFullProject(fa, config, collisionProfiles, notices);
  return { config, project, collisionProfiles, notices, legacyAtlasMerged };
}

async function loadFullProject(
  fa: FileAccess,
  config: LoadedS4Config,
  collisionProfiles: CollisionProfileSet | null,
  notices: string[],
): Promise<{ project: S4Project; legacyAtlasMerged: boolean }> {
  // VERBATIM move of useProject.ts lines 384–714 with these substitutions:
  //   • `readFile(basePath, p)`            → `fa.read(p)`   (delete the local readFile)
  //   • module flag `legacyAtlasMergedThisLoad` → local `let legacyAtlasMerged = false`
  //     (set true where the migration succeeds; returned, not module state)
  //   • `useToastStore.getState().addToast(msg, 'success')` (atlas-unification
  //     toast, old lines 689–693) → `notices.push(msg)`
  //   • the trailing `return { name, zones, … }` → `return { project: { … }, legacyAtlasMerged }`
  // Everything else — probe order, try/catch shapes, console.warn/error lines,
  // migration gates, single-zone assumptions — is copied unchanged.
}
```

- [ ] **Step 4: Run the test**

Run: `npx vitest run src/core/project/aeon/__tests__/aeon-load.test.ts` → PASS.

- [ ] **Step 5: Suite guards + commit**

Run: `npx vitest run && npx tsc --noEmit` → no regressions.

```bash
git add -A && git commit -m "feat(core): aeon project loader behind FileAccess (loadAeonProject)"
```

---

### Task 3: Core aeon save — `buildAeonSavePlan`

**Files:**
- Create: `src/core/project/aeon/save.ts`
- Create: `src/core/project/aeon/__tests__/aeon-save.test.ts`
- Reference (do not modify): `src/renderer/hooks/useProject.ts` lines 161–379

Same porting discipline as Task 2. The core function does all serialization and the ONE read it needs (the stale-meta-sidecar probe) via `fa`, and returns the writes as data — the renderer performs the actual `window.api.writeBinaryFile` calls (mirrors classic's `WriteResult.files` convention: core produces bytes, renderer persists).

- [ ] **Step 1: Write the failing test**

Create `src/core/project/aeon/__tests__/aeon-save.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import type { FileAccess } from '../../adapter';
import { loadAeonProject } from '../load';
import { buildAeonSavePlan } from '../save';
import { serializeNametable } from '../../../formats/s4-nametable';
import { serializeTiles } from '../../../export/tile-dedup';
import { SECTION_TILES_WIDE, SECTION_TILES_HIGH } from '../../../model/s4-types';
import type { Tile } from '../../../model/s4-types';

// Reuse the Task 2 fixture verbatim (memFa/PROJECT_JSON/fixtureFiles). Copy the
// three helpers here — tests may run in any order and must not import each other.
/* …copy of tile(), memFa(), PROJECT_JSON, fixtureFiles() from aeon-load.test.ts… */

describe('buildAeonSavePlan', () => {
  it('emits the per-section files, the editor-owned tileset, and a retargeted project.json', async () => {
    const fa = memFa(fixtureFiles());
    const r = await loadAeonProject(fa, '/proj');
    const plan = await buildAeonSavePlan(fa, r.config, r.project, 'ojz', 'act1',
      { legacyAtlasMerged: r.legacyAtlasMerged });
    const paths = plan.files.map((f) => f.path);
    expect(paths).toContain('data/ojz/act1/section_0.tiles.bin');
    expect(paths).toContain('data/ojz/act1/section_0.objects.json');
    expect(paths).toContain('data/ojz/act1/section_0.rings.json');
    // Tileset is retargeted to the editor-owned path and project.json rewritten to match.
    expect(paths).toContain('data/editor/ojz_tiles.bin');
    expect(plan.configChanged).toBe(true);
    expect(paths).toContain('project.json');
    const projJson = JSON.parse(new TextDecoder().decode(plan.files.find((f) => f.path === 'project.json')!.bytes));
    expect(projJson.zones[0].tileset).toBe('data/editor/ojz_tiles.bin');
  });

  it('round-trips: loading the planned bytes reproduces the section nametable', async () => {
    const fa = memFa(fixtureFiles());
    const r = await loadAeonProject(fa, '/proj');
    const plan = await buildAeonSavePlan(fa, r.config, r.project, 'ojz', 'act1',
      { legacyAtlasMerged: false });
    // Apply the plan to a fresh in-memory project dir and re-load.
    const files2 = fixtureFiles();
    for (const f of plan.files) files2.set(f.path, f.bytes);
    const r2 = await loadAeonProject(memFa(files2), '/proj');
    expect(Array.from(r2.project.zones[0].acts[0].sections[0]!.tileGrid.nametable))
      .toEqual(Array.from(r.project.zones[0].acts[0].sections[0]!.tileGrid.nametable));
  });

  it('never truncates the legacy atlas when it aliases a live tileset or migration did not run', async () => {
    const fa = memFa(fixtureFiles());
    const r = await loadAeonProject(fa, '/proj');
    const plan = await buildAeonSavePlan(fa, r.config, r.project, 'ojz', 'act1',
      { legacyAtlasMerged: false });
    // No chunkLibraryPath in the fixture AND merge didn't run → no zero-length truncation write.
    expect(plan.files.some((f) => f.bytes.length === 0)).toBe(false);
  });

  it('reports export failure as a non-fatal note instead of throwing', async () => {
    const fa = memFa(fixtureFiles());
    const r = await loadAeonProject(fa, '/proj');
    // An act id that exists is required for the plan; the export step runs on real
    // data here and should succeed, so exportError is null in the healthy case.
    const plan = await buildAeonSavePlan(fa, r.config, r.project, 'ojz', 'act1',
      { legacyAtlasMerged: false });
    expect(plan.exportError).toBeNull();
  });
});
```

- [ ] **Step 2: Run it to make sure it fails**

Run: `npx vitest run src/core/project/aeon/__tests__/aeon-save.test.ts` → FAIL (`../save` missing).

- [ ] **Step 3: Implement `src/core/project/aeon/save.ts`**

```typescript
// Aeon project save — the renderer's saveProject (hooks/useProject.ts 161–379)
// ported to pure core. Serializes everything and returns the writes as data;
// the renderer glue (state/aeon-save.ts) does the actual IPC writes. The one
// read this needs (the stale meta-sidecar probe) goes through fa.
//
// Ordering parity: files[] preserves the original write order exactly
// (sections → chunk library → tilesets → act BG → BG library → project.json →
// legacy-atlas truncation → export outputs) so a partial-failure mid-plan
// leaves the same on-disk shape as a partial failure did before the port.

import type { FileAccess } from '../adapter';
import type { LoadedS4Config } from '../../config/s4-config';
import { projectDataRoot } from '../../config/s4-config';
import { exportAct } from '../../export/index';
import { serializeTiles } from '../../export/tile-dedup';
import { serializeNametable } from '../../formats/s4-nametable';
import { serializeCollAttr } from '../../formats/s4-collattr';
import { serializeSectionMeta } from '../../formats/section-meta';
import { serializeBgTiles } from '../../formats/bg-tiles';
import { bgLibIndexPath, bgLibLayoutPath, bgLibTilesPath, serializeBgLibraryIndex } from '../../formats/bg-library';
import { legacyAtlasPath } from './load';
import type { S4Project } from '../../model/s4-types';

export interface AeonSavePlan {
  /** Every write, in order, keyed by project-relative path. */
  files: { path: string; bytes: Uint8Array }[];
  /** True when project.json was retargeted (it is then also present in files). */
  configChanged: boolean;
  /** Non-fatal export-step failure (parity with the old console.warn path). */
  exportError: string | null;
}

export async function buildAeonSavePlan(
  fa: FileAccess,
  config: LoadedS4Config,
  project: S4Project,
  zoneId: string,
  actId: string,
  opts: { legacyAtlasMerged: boolean },
): Promise<AeonSavePlan> {
  // VERBATIM move of useProject.ts saveProject lines 176–370 with these substitutions:
  //   • every `await window.api.writeBinaryFile(basePath, path, bytes.buffer)` →
  //     `files.push({ path, bytes })` (bytes stay Uint8Array; no ArrayBuffer casts)
  //   • the meta-sidecar read probe (old lines 224–231): `await fa.exists(metaPath)`
  //     decides whether to push the cleared sidecar (same overwrite-with-nulls rule)
  //   • module flag `legacyAtlasMergedThisLoad` → `opts.legacyAtlasMerged`
  //   • the zone/act lookup guards (old 166–172) become: find zoneConfig/actConfig
  //     by zoneId/actId in config; throw Error('act not found: <zone>/<act>') if
  //     absent — the renderer glue never calls this without a current act
  //   • the export try/catch (old 344–370): on success push the export files;
  //     on failure set exportError = message (do not throw)
  //   • store calls (markClean/toasts/loading) are REMOVED — renderer glue owns them
  // config.raw mutation semantics are kept as-is (retargeting writes through to
  // the shared raw object exactly like today).
}
```

- [ ] **Step 4: Run the test** → PASS. Then `npx vitest run && npx tsc --noEmit` → clean.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat(core): aeon save plan builder (buildAeonSavePlan)"
```

---

### Task 4: `aeonAdapter.open()` performs the real load

**Files:**
- Modify: `src/core/project/aeon/index.ts`
- Modify: `src/core/project/aeon/__tests__/aeon-adapter.test.ts`

- [ ] **Step 1: Update the adapter test**

In `aeon-adapter.test.ts`, the existing `open()` expectations pin the marker handle (`levels: null`, empty report, no load). Replace that block with: build the Task 2 in-memory fixture (copy `memFa`/`PROJECT_JSON`/`fixtureFiles` helpers into this file), then:

```typescript
  it('open() loads the full project and returns it on handle.aeon', async () => {
    const handle = await aeonAdapter.open(memFa(fixtureFiles()));
    expect(handle.type).toBe('aeon');
    expect(handle.levels).toBeNull();
    expect(handle.capabilities.facets).toEqual(['layout', 'art', 'objects', 'rings', 'collision', 'palette']);
    expect(handle.aeon).toBeDefined();
    expect(handle.aeon!.project.zones).toHaveLength(1);
    expect(handle.aeon!.config.name).toBe('Test Project');
  });

  it('open() surfaces loader errors (broken-but-s4 project.json still matches detect, then open throws)', async () => {
    const files = fixtureFiles();
    files.set('project.json', new TextEncoder().encode(JSON.stringify({ engine: 's4' }))); // missing name/zones
    await expect(aeonAdapter.open(memFa(files))).rejects.toThrow();
  });
```

**Open question the implementer must resolve while editing:** `open(fa)` has no `dir` argument but `loadAeonProject` needs the absolute base path for `config.basePath`. Extend `FileAccess` in `adapter.ts` with an OPTIONAL, additive root marker:

```typescript
  /** Absolute directory this FileAccess is rooted at, when known. Additive
   *  (aeon open records it as config.basePath); in-memory fakes may omit it,
   *  in which case basePath is '' and renderer-side writes are impossible —
   *  fine for tests. */
  rootDir?: string;
```

`createIpcFileAccess` (Task 5) supplies it. `aeonAdapter.open` passes `fa.rootDir ?? ''`. The Task 2/3 tests keep passing `dir` explicitly to `loadAeonProject` (unchanged). Update the memFa helper in THIS test file to set `rootDir: '/proj'`, and assert `handle.aeon!.config.basePath` is `'/proj'`.

- [ ] **Step 2: Run to see the new expectations fail**

Run: `npx vitest run src/core/project/aeon/__tests__/aeon-adapter.test.ts` → FAIL (open still returns marker).

- [ ] **Step 3: Implement**

In `src/core/project/aeon/index.ts`, replace `open()` (lines 102–122) with:

```typescript
  async open(fa: FileAccess, _overrides?: ProjectOverrides): Promise<ProjectHandle> {
    // Full profile open (spec §7): the load itself now lives in core (load.ts);
    // this returns the loaded project on handle.aeon. Loader errors propagate —
    // detect() deliberately matched on engine:"s4" alone so the loader's own
    // validation errors surface here, identical to the old renderer path.
    const aeon = await loadAeonProject(fa, fa.rootDir ?? '');
    return {
      type: 'aeon',
      capabilities: {
        levels: 'aeon',
        sprites: true,
        objects: 'json',
        build: false,
        facets: ['layout', 'art', 'objects', 'rings', 'collision', 'palette'],
      },
      report: buildReport([]),
      levels: null,
      aeon,
    };
  },
```

Add `import { loadAeonProject } from './load';` and update the header comment (the "marker adapter / renderer loads" note is now false — rewrite it to describe the full-profile open, keeping the detect-fingerprint documentation).

Also apply the Task 4 `FileAccess.rootDir` addition in `src/core/project/adapter.ts` as specced in Step 1.

- [ ] **Step 4: Run tests + suite** → adapter test PASS; `npx vitest run && npx tsc --noEmit` clean. (The registry-routing tests in this file that call `open` on fixtures now need the fixture files present — update any that used a bare `engine:"s4"` marker dir to use `fixtureFiles()`.)

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat(core): aeonAdapter.open performs the full project load"
```

---

### Task 5: Renderer open rewire — atomic commit + glue, delete `loadFromPath`

**Files:**
- Modify: `src/renderer/state/projectStore.ts`
- Create: `src/renderer/state/aeon-open.ts`
- Modify: `src/renderer/state/classic-file-access.ts` (add `rootDir`)
- Modify: `src/renderer/hooks/useProject.ts` (shrink)
- Test: `src/renderer/state/__tests__/projectStore-open.test.ts` (create)

- [ ] **Step 1: Write the failing store test**

Create `src/renderer/state/__tests__/projectStore-open.test.ts`:

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { useProjectStore } from '../projectStore';

const fakeConfig = { name: 'P', engine: 's4', basePath: '/p', zones: [], objectLibraryPath: '', chunkLibraryPath: '', raw: { name: 'P', engine: 's4', zones: [], objectLibrary: '', chunkLibrary: '' } } as never;
const fakeProject = { name: 'P', zones: [], objectLibrary: [], chunkLibrary: [], bgLibrary: [], basePath: '/p' } as never;
const caps = { levels: 'aeon', sprites: true, objects: 'json', build: false, facets: ['layout'] } as never;

describe('projectStore.openLoaded', () => {
  beforeEach(() => useProjectStore.getState().reset());

  it('commits config+project+profiles+capabilities in ONE set (aeon→aeon sliver fix)', () => {
    // Subscribe BEFORE the commit: at no observable point may config be set while
    // project is null — that gap is exactly what let the session restore race the
    // loader (stage-3 notes, deferred gap #2).
    const gaps: boolean[] = [];
    const unsub = useProjectStore.subscribe((s) => gaps.push(s.config !== null && s.project === null));
    useProjectStore.getState().openLoaded({
      config: fakeConfig, project: fakeProject, collisionProfiles: null,
      capabilities: caps, legacyAtlasMerged: true,
    });
    unsub();
    expect(gaps.every((g) => g === false)).toBe(true);
    const s = useProjectStore.getState();
    expect(s.project).toBe(fakeProject);
    expect(s.capabilities).toBe(caps);
    expect(s.legacyAtlasMerged).toBe(true);
    expect(s.loading).toBe(false);
    expect(s.error).toBeNull();
  });

  it('reset clears the new fields', () => {
    useProjectStore.getState().openLoaded({ config: fakeConfig, project: fakeProject, collisionProfiles: null, capabilities: caps, legacyAtlasMerged: true });
    useProjectStore.getState().reset();
    const s = useProjectStore.getState();
    expect(s.capabilities).toBeNull();
    expect(s.legacyAtlasMerged).toBe(false);
  });
});
```

- [ ] **Step 2: Run it** → FAIL (`openLoaded`/`capabilities` missing).

- [ ] **Step 3: Extend `projectStore.ts`**

Add to `ProjectState`: `capabilities: CapabilityManifest | null;`, `legacyAtlasMerged: boolean;`, and

```typescript
  /** Atomic full-project commit (aeon open). ONE set so no subscriber ever
   *  observes config-without-project — the gap behind the aeon→aeon session-
   *  restore sliver (stage-3 notes gap #2). */
  openLoaded: (p: {
    config: LoadedS4Config; project: S4Project;
    collisionProfiles: CollisionProfileSet | null;
    capabilities: CapabilityManifest | null; legacyAtlasMerged: boolean;
  }) => void;
```

Implementation inside `create`:

```typescript
  capabilities: null,
  legacyAtlasMerged: false,
  openLoaded: ({ config, project, collisionProfiles, capabilities, legacyAtlasMerged }) =>
    set({ config, project, collisionProfiles, capabilities, legacyAtlasMerged, loading: false, error: null }),
```

Import `CapabilityManifest` from `'../../core/project/adapter'`. Extend `reset()` with `capabilities: null, legacyAtlasMerged: false`.

- [ ] **Step 4: Run store test** → PASS.

- [ ] **Step 5: Add `rootDir` to the IPC FileAccess**

In `src/renderer/state/classic-file-access.ts`, add `rootDir: dir,` to the object literal `createIpcFileAccess` returns (read the file first; it closes over the chosen directory — expose that exact string).

- [ ] **Step 6: Create `src/renderer/state/aeon-open.ts`**

```typescript
// Aeon open glue — replaces useProject.loadFromPath. Core does the load
// (aeonAdapter.open via FileAccess); this commits the result to the stores
// ATOMICALLY and performs the post-open niceties the old path did (recents,
// dominant palette line, first-act selection, camera reset, toasts).

import { aeonAdapter } from '../../core/project/aeon';
import { dominantPaletteLine } from '../../core/project/aeon/load';
import { createIpcFileAccess } from './classic-file-access';
import { useProjectStore } from './projectStore';
import { useEditorStore } from './editorStore';
import { useViewStore } from './viewStore';
import { useToastStore } from './toastStore';

export async function openAeonProject(dir: string): Promise<boolean> {
  const store = useProjectStore.getState();
  try {
    store.setLoading(true);
    const handle = await aeonAdapter.open(createIpcFileAccess(dir));
    const aeon = handle.aeon!;
    useProjectStore.getState().openLoaded({
      config: aeon.config, project: aeon.project,
      collisionProfiles: aeon.collisionProfiles,
      capabilities: handle.capabilities, legacyAtlasMerged: aeon.legacyAtlasMerged,
    });
    await window.api.addRecentProject(dir, aeon.config.name);
    // First-act selection AFTER the atomic commit (parity with the old loader's
    // ordering: config→project→setCurrentAct). The session restore that runs on
    // the project-key change will re-point this if a stored session exists.
    const zone = aeon.config.zones[0];
    if (zone && zone.acts.length > 0) {
      useProjectStore.getState().setCurrentAct(zone.id, zone.acts[0].id);
    }
    useEditorStore.getState().setSelectedPaletteLine(dominantPaletteLine(aeon.project));
    useViewStore.getState().setPosition(0, 0);
    for (const n of aeon.notices) useToastStore.getState().addToast(n, 'success');
    useToastStore.getState().addToast(`Opened ${aeon.config.name}`, 'success');
    return true;
  } catch (err) {
    store.setError(err instanceof Error ? err.message : String(err));
    return false;
  }
}
```

- [ ] **Step 7: Shrink `useProject.ts`**

Delete: the `readFile` helper, `loadFromPath`, `loadFullProject`, `legacyAtlasMergedThisLoad`, `legacyAtlasPath`, and every import that only those used. `openPath` now calls `openAeonProject(dir)` where it called `loadFromPath(dir)` (import from `../state/aeon-open`). KEEP `saveProject` untouched for now (Task 6 ports it). The hook return shape stays `{ openProject, openProjectByPath: openPath, saveProject }`.

- [ ] **Step 8: Full suite + typecheck + smoke note**

Run: `npx vitest run && npx tsc --noEmit` → clean. This is the highest-regression-risk task of Phase A: the reviewer should diff old-loadFromPath vs new glue line-by-line for dropped side effects (loading flag, error path, toast order).

- [ ] **Step 9: Commit**

```bash
git add -A && git commit -m "feat(aeon): open path through core adapter with atomic store commit"
```

---

### Task 6: Renderer save rewire — `state/aeon-save.ts`, static saver registration

**Files:**
- Create: `src/renderer/state/aeon-save.ts`
- Modify: `src/renderer/state/project-runtime.ts`
- Modify: `src/renderer/App.tsx` (remove the `registerAeonSaver` effect)
- Modify: `src/renderer/hooks/useProject.ts` (delete `saveProject`)
- Test: `src/renderer/state/__tests__/project-runtime.test.ts` (update)

- [ ] **Step 1: Create `src/renderer/state/aeon-save.ts`**

```typescript
// Aeon save glue — replaces useProject.saveProject. Core builds the plan
// (all serialization); this writes the files over IPC and owns the store
// effects (loading flag, markClean, toasts). Result is a VARIANT, not a
// throw (house isSaveSuccess convention — see stage-3 notes item 7).

import { buildAeonSavePlan } from '../../core/project/aeon/save';
import { createIpcFileAccess } from './classic-file-access';
import { useProjectStore } from './projectStore';
import { useEditorStore } from './editorStore';
import { useToastStore } from './toastStore';

export type AeonSaveResult =
  | { kind: 'saved' }
  | { kind: 'nothing' }          // no project / no current act — nothing to write
  | { kind: 'error'; message: string };

export function isAeonSaveSuccess(r: AeonSaveResult): boolean {
  return r.kind === 'saved' || r.kind === 'nothing';
}

export async function saveAeonProject(): Promise<AeonSaveResult> {
  const s = useProjectStore.getState();
  const { config, project, currentZoneId, currentActId } = s;
  if (!config || !project || !currentZoneId || !currentActId) return { kind: 'nothing' };
  try {
    s.setLoading(true);
    const fa = createIpcFileAccess(config.basePath);
    const plan = await buildAeonSavePlan(fa, config, project, currentZoneId, currentActId,
      { legacyAtlasMerged: s.legacyAtlasMerged });
    for (const f of plan.files) {
      await window.api.writeBinaryFile(config.basePath, f.path,
        f.bytes.buffer.slice(f.bytes.byteOffset, f.bytes.byteOffset + f.bytes.byteLength) as ArrayBuffer);
    }
    if (plan.exportError) console.warn('[save] Export step failed (non-fatal):', plan.exportError);
    useEditorStore.getState().markClean();
    s.setLoading(false);
    useToastStore.getState().addToast('Project saved', 'success');
    return { kind: 'saved' };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    useProjectStore.getState().setError(message);
    useToastStore.getState().addToast('Save failed', 'error');
    return { kind: 'error', message };
  }
}
```

- [ ] **Step 2: Rewire `project-runtime.ts`**

- `import { saveAeonProject } from './aeon-save';`
- Replace `let aeonImpl: SaveFn | null = null;` with `let aeonImpl: SaveFn = saveAeonProject;`
- Delete `registerAeonSaver` (and its doc comment). The `aeon-project` saver's `isDirty` drops the `aeonImpl !== null` clause; its `save` becomes `async () => { await aeonImpl(); }`.
- Extend the test seams: `__setRuntimeSaversForTest` accepts `aeon?: SaveFn`; `__resetRuntimeSaversForTest` restores `aeonImpl = saveAeonProject`.
- Update the header comment (aeon saver is now statically registered like the others).

- [ ] **Step 3: Update App + useProject**

- `App.tsx`: delete line 49 (`useEffect(... registerAeonSaver ...)`) and the `registerAeonSaver` import; delete `saveProject` from the `useProject()` destructure.
- `useProject.ts`: delete `saveProject` and now-unused imports; return `{ openProject, openProjectByPath: openPath }`. The hook should now be well under 100 lines.

- [ ] **Step 4: Update `project-runtime.test.ts`**

The existing test that proves "aeon saver fires only when aeon open and classic not" previously relied on `registerAeonSaver`; rewire it through `__setRuntimeSaversForTest({ aeon: spy })`. Add one new case:

```typescript
  it('aeon saver is registered statically (no App-mount registration required)', async () => {
    // With an aeon project resident and classic closed, saveAll must invoke the
    // aeon saver even though nothing ever called a register function.
    /* arrange stores as the existing aeon-fires test does, substitute spy via
       __setRuntimeSaversForTest({ aeon: spy }), run saveAllDirty(), expect spy called */
  });
```

- [ ] **Step 5: Full suite + typecheck; commit**

```bash
git add -A && git commit -m "feat(aeon): save path through core plan builder; static saver registration"
```

---

### Task 7: Project-switch dirty guard (deferred gap #1)

**Files:**
- Create: `src/renderer/shell/project-open-guard.ts`
- Test: `src/renderer/shell/__tests__/project-open-guard.test.ts` (create)
- Modify: `src/renderer/hooks/useProject.ts` (wire the guard into `openPath`)
- Modify: `src/renderer/state/classicProjectStore.ts` (reset the level store inside `openDirectory`)

- [ ] **Step 1: Write the failing planner test**

```typescript
import { describe, it, expect } from 'vitest';
import { planProjectOpen } from '../project-open-guard';

describe('planProjectOpen', () => {
  it('proceeds when nothing is dirty', () => {
    expect(planProjectOpen({ classicDirty: false, aeonDirty: false, spriteArtPending: false }))
      .toEqual({ kind: 'proceed' });
  });
  it.each([
    ['classic level edits', { classicDirty: true, aeonDirty: false, spriteArtPending: false }],
    ['aeon project edits', { classicDirty: false, aeonDirty: true, spriteArtPending: false }],
    ['checked-out sprite art', { classicDirty: false, aeonDirty: false, spriteArtPending: true }],
  ] as const)('asks before opening over %s', (_label, snap) => {
    expect(planProjectOpen(snap)).toEqual({ kind: 'confirm' });
  });
});
```

- [ ] **Step 2: Run it** → FAIL. **Step 3: Implement**

```typescript
// Guard for opening a project (path/dialog/recent) while ANY unsaved work is
// resident (stage-3 notes deferred gap #1: openPath previously reset stores with
// no confirm — silent data loss). Pure decision; the glue in useProject.openPath
// asks via confirmStore and re-checks dirtiness after a chosen save.

export interface OpenDirtySnapshot {
  classicDirty: boolean;      // any classicLevelStore dirty domain
  aeonDirty: boolean;         // editorStore.dirty (aeon project-wide)
  spriteArtPending: boolean;  // spriteStore.s1ArtSource !== null
}

export type ProjectOpenPlan = { kind: 'proceed' } | { kind: 'confirm' };

export function planProjectOpen(s: OpenDirtySnapshot): ProjectOpenPlan {
  return s.classicDirty || s.aeonDirty || s.spriteArtPending
    ? { kind: 'confirm' }
    : { kind: 'proceed' };
}

/** Live snapshot helper (kept beside the planner so the two stay in lockstep). */
export function currentOpenDirtySnapshot(): OpenDirtySnapshot { /* read the three stores */ }
```

`currentOpenDirtySnapshot` reads `useClassicLevelStore` (`Object.values(s.dirty).some(Boolean)`), `useEditorStore` (`s.dirty`), `useSpriteStore` (`s.s1ArtSource !== null`).

- [ ] **Step 4: Wire into `useProject.openPath`**

At the top of `openPath`, before `classic.openDirectory(dir)`:

```typescript
    if (planProjectOpen(currentOpenDirtySnapshot()).kind === 'confirm') {
      const answer = await useConfirmStore.getState().ask({
        title: 'Unsaved changes',
        body: 'Opening a project discards unsaved edits and undo history in the current one.',
        buttons: [
          { key: 'save', label: 'Save & open', tone: 'primary' },
          { key: 'discard', label: 'Discard & open', tone: 'danger' },
          { key: 'cancel', label: 'Cancel' },
        ],
      });
      if (answer === 'save') {
        await saveAllDirty();
        // saveAllDirty's `saved` only means the savers RAN (stage-3 notes item 7):
        // the honest gate is to re-snapshot — if anything is STILL dirty, a saver
        // failed (it already toasted); abort instead of destroying the edits.
        if (planProjectOpen(currentOpenDirtySnapshot()).kind === 'confirm') return;
      } else if (answer !== 'discard') {
        return; // cancel / dismissed
      }
    }
```

Imports: `planProjectOpen, currentOpenDirtySnapshot` from `../shell/project-open-guard`; `useConfirmStore` from `../state/confirmStore`; `saveAllDirty` from `../state/project-runtime`.

**Caveat to verify while editing:** `saveAllDirty`'s classic saver "fires when open" but the sprite/classic savers self-toast failures; the re-snapshot approach above is deliberately independent of `SaveAllResult` — do not "optimize" it back to checking `failed.length`.

- [ ] **Step 5: Close the stale-handle window in `openDirectory`**

In `classicProjectStore.ts` `openDirectory`, immediately after `set({ ...CLOSED, status: 'opening', dir })`, add:

```typescript
      // A project switch invalidates the loaded classic doc NOW — previously the
      // reset lived in ClassicProjectView's handle-identity effect, leaving a
      // window where a stale doc (with a dead handle) was still live if the view
      // was unmounted mid-switch (e.g. switching away from sprite mode).
      useClassicLevelStore.getState().reset();
```

Read `classicLevelStore.ts` first: if its reset action is named differently (e.g. `clear`), use that; if none exists, add a `reset()` that restores the store's initial closed state (doc null, dirty {}, ref null, status idle) — mirror its declared initial object. Then check `ClassicProjectView.tsx`'s dir-keyed reset effect: leave it in place (idempotent double-reset is harmless) but add a comment that `openDirectory` now owns the authoritative reset.

- [ ] **Step 6: Suite + typecheck; commit**

```bash
git add -A && git commit -m "fix(shell): dirty-confirm guard on project open; reset level store in openDirectory"
```

---

## Phase B — Facet workspace

### Task 8: Core session payload — per-tab `workspace` record

**Files:**
- Modify: `src/core/shell/session-persistence.ts`
- Test: `src/core/shell/__tests__/session-persistence.test.ts` (append)

- [ ] **Step 1: Write the failing tests** (append to the existing describe)

```typescript
  it('round-trips the per-tab workspace record (facet + viewport)', () => {
    const s = openTab(initialSession(), { id: 'level:ojz:act1', kind: 'level', title: 'OJZ act1' });
    const ws = { 'level:ojz:act1': { facet: 'collision', view: { x: 128, y: 64, zoom: 2 } } } as const;
    const json = serializeSession(s, ws);
    expect(restoreSession(json).tabs).toHaveLength(2);
    expect(restoreWorkspace(json)).toEqual(ws);
  });

  it('restoreWorkspace is defensive: corrupt entries and unknown facets are dropped', () => {
    const json = JSON.stringify({
      tabs: [], activeId: 'home',
      workspace: {
        ok: { facet: 'layout' },
        badFacet: { facet: 'nonsense' },
        badView: { view: { x: 'NaN' } },
      },
    });
    expect(restoreWorkspace(json)).toEqual({ ok: { facet: 'layout' } });
  });

  it('restoreWorkspace on a legacy payload (no workspace key) is empty, and legacy sessions still restore', () => {
    const legacy = JSON.stringify({ tabs: [], activeId: 'home' });
    expect(restoreWorkspace(legacy)).toEqual({});
    expect(restoreSession(legacy).tabs).toEqual([HOME_TAB]);
  });
```

- [ ] **Step 2: Run** → FAIL. **Step 3: Implement**

In `session-persistence.ts`:

```typescript
import { FACET_CAPABILITIES, type FacetCapability } from '../project/adapter';

/** Per-tab UI state persisted ALONGSIDE the session — deliberately not on
 *  TabDescriptor, so tab identity and the session reducers stay pure. */
export interface PersistedTabWorkspace {
  facet?: FacetCapability;
  view?: { x: number; y: number; zoom: number };
}
export type WorkspaceRecord = Record<string, PersistedTabWorkspace>;

const persistedWorkspaceSchema = z.strictObject({
  facet: z.enum(FACET_CAPABILITIES).optional(),
  view: z.strictObject({ x: z.number(), y: z.number(), zoom: z.number() }).optional(),
});
```

`serializeSession(state, workspace?: WorkspaceRecord)` adds `workspace` to the JSON only when non-empty. New export:

```typescript
/** Defensive per-entry parse: a corrupt entry drops alone (the session itself
 *  is parsed independently by restoreSession — the two never fail together). */
export function restoreWorkspace(json: string): WorkspaceRecord {
  let parsed: unknown;
  try { parsed = JSON.parse(json); } catch { return {}; }
  const ws = (parsed as { workspace?: unknown })?.workspace;
  if (ws === null || typeof ws !== 'object') return {};
  const out: WorkspaceRecord = {};
  for (const [id, entry] of Object.entries(ws as Record<string, unknown>)) {
    const res = persistedWorkspaceSchema.safeParse(entry);
    if (res.success && (res.data.facet !== undefined || res.data.view !== undefined)) out[id] = res.data;
  }
  return out;
}
```

- [ ] **Step 4: Thread through `session-storage.ts`**: `saveStoredSession` gains an optional `workspace?: WorkspaceRecord` arg (passed to `serializeSession`); add `loadStoredWorkspace(storage, projectKey): WorkspaceRecord` (getItem + `restoreWorkspace`, `{}` on absence/throw). Renderer wiring happens in Task 17.

- [ ] **Step 5: Run tests + suite; commit**

```bash
git add -A && git commit -m "feat(core): per-tab workspace record in the persisted session payload"
```

---

### Task 9: `workspaceStore`, `facet-tools`, and the renderer facet-module registry

**Files:**
- Create: `src/renderer/workspace/workspaceStore.ts`
- Create: `src/renderer/workspace/facet-tools.ts`
- Create: `src/renderer/workspace/facet-registry.ts`
- Test: `src/renderer/workspace/__tests__/facet-tools.test.ts` (create)
- Test: `src/renderer/workspace/__tests__/workspaceStore.test.ts` (create)

- [ ] **Step 1: Write the failing tests**

`facet-tools.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { FACET_TOOLS, toolForFacet } from '../facet-tools';

describe('facet tool sets', () => {
  it('every facet lists its tools with the default first', () => {
    expect(FACET_TOOLS.layout[0]).toBe('stamp-chunk');
    expect(FACET_TOOLS.objects[0]).toBe('place-object');
    expect(FACET_TOOLS.rings[0]).toBe('place-ring');
    expect(FACET_TOOLS.collision[0]).toBe('paint-collision');
    expect(FACET_TOOLS.palette[0]).toBe('view');
  });
  it('keeps the current tool when the target facet allows it', () => {
    expect(toolForFacet('objects', 'select')).toBe('select');
    expect(toolForFacet('layout', 'view')).toBe('view');
  });
  it('falls to the facet default when the current tool is foreign', () => {
    expect(toolForFacet('rings', 'stamp-chunk')).toBe('place-ring');
    expect(toolForFacet('collision', 'place-object')).toBe('paint-collision');
  });
});
```

`workspaceStore.test.ts`:

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { useWorkspaceStore } from '../workspaceStore';

describe('workspaceStore', () => {
  beforeEach(() => useWorkspaceStore.getState().reset());

  it('defaults every tab to the layout facet', () => {
    expect(useWorkspaceStore.getState().facetFor('level:ojz:act1')).toBe('layout');
  });
  it('remembers facet and viewport per tab', () => {
    const s = useWorkspaceStore.getState();
    s.setFacet('level:ojz:act1', 'collision');
    s.setView('level:ojz:act1', { x: 10, y: 20, zoom: 2 });
    s.setFacet('level:ojz:act2', 'art');
    expect(useWorkspaceStore.getState().facetFor('level:ojz:act1')).toBe('collision');
    expect(useWorkspaceStore.getState().viewFor('level:ojz:act1')).toEqual({ x: 10, y: 20, zoom: 2 });
    expect(useWorkspaceStore.getState().facetFor('level:ojz:act2')).toBe('art');
  });
  it('seed replaces the whole record (session restore), reset clears it', () => {
    const s = useWorkspaceStore.getState();
    s.setFacet('a', 'art');
    s.seed({ b: { facet: 'rings' } });
    expect(useWorkspaceStore.getState().facetFor('a')).toBe('layout');
    expect(useWorkspaceStore.getState().facetFor('b')).toBe('rings');
    s.reset();
    expect(useWorkspaceStore.getState().facetFor('b')).toBe('layout');
  });
});
```

- [ ] **Step 2: Run** → FAIL. **Step 3: Implement the three modules**

`facet-tools.ts`:

```typescript
// Per-facet allowed tool sets (spec §4: one tool system, facet-scoped docks).
// The facets share one MapViewport + one editorStore.tool; this module is the
// single source of which tools each facet offers. First entry = facet default.

import type { FacetCapability } from '../../core/project/adapter';
import type { EditorTool } from '../state/editorStore';

export const FACET_TOOLS: Partial<Record<FacetCapability, readonly EditorTool[]>> = {
  layout: ['stamp-chunk', 'select', 'view', 'marquee', 'paint-tile', 'paint-block'],
  objects: ['place-object', 'select', 'view'],
  rings: ['place-ring', 'select', 'view'],
  collision: ['paint-collision', 'view'],
  palette: ['view'],
  // 'art' is absent: the Art facet runs the artStore tool system, not EditorTool.
};

/** Facet switch rule: keep the current tool when the target facet allows it,
 *  else the facet default. */
export function toolForFacet(facet: FacetCapability, current: EditorTool): EditorTool {
  const tools = FACET_TOOLS[facet];
  if (!tools || tools.length === 0) return current;
  return tools.includes(current) ? current : tools[0];
}
```

`workspaceStore.ts`:

```typescript
// Per-tab workspace UI state (active facet, viewport snapshot) — the renderer
// half of core/shell/session-persistence's WorkspaceRecord. Keyed by tab id.

import { create } from 'zustand';
import type { FacetCapability } from '../../core/project/adapter';
import type { WorkspaceRecord } from '../../core/shell/session-persistence';

export interface TabView { x: number; y: number; zoom: number }

interface WorkspaceState {
  record: WorkspaceRecord;
  facetFor: (tabId: string) => FacetCapability;
  viewFor: (tabId: string) => TabView | null;
  setFacet: (tabId: string, facet: FacetCapability) => void;
  setView: (tabId: string, view: TabView) => void;
  /** Session restore: replace the whole record. */
  seed: (record: WorkspaceRecord) => void;
  reset: () => void;
}

export const useWorkspaceStore = create<WorkspaceState>((set, get) => ({
  record: {},
  facetFor: (tabId) => get().record[tabId]?.facet ?? 'layout',
  viewFor: (tabId) => get().record[tabId]?.view ?? null,
  setFacet: (tabId, facet) =>
    set((s) => ({ record: { ...s.record, [tabId]: { ...s.record[tabId], facet } } })),
  setView: (tabId, view) =>
    set((s) => ({ record: { ...s.record, [tabId]: { ...s.record[tabId], view } } })),
  seed: (record) => set({ record }),
  reset: () => set({ record: {} }),
}));
```

`facet-registry.ts`:

```typescript
// Renderer facet-module registry (spec §9; stage-2 watch-list #1). A facet
// module supplies the workspace's slot components for one facet id; the
// LevelWorkspace renders registered ∩ profile-granted (core facetsFor rule).

import type { ComponentType } from 'react';
import { createRegistry, type Registry } from '../../core/shell/registry';
import type { FacetCapability } from '../../core/project/adapter';

export interface FacetModule {
  readonly id: FacetCapability;
  readonly Canvas: ComponentType;
  readonly ToolDock?: ComponentType;
  readonly ToolOptions?: ComponentType;
  readonly RightPanel?: ComponentType;
  readonly BottomExtra?: ComponentType;
  readonly StatusBar?: ComponentType;
}

export const facetModules: Registry<FacetModule> = createRegistry<FacetModule>('FacetModule');

/** Idempotent (HMR / repeated boot): register-if-absent, matching the house
 *  pattern used by registerBuiltinFacets and ensureAdaptersRegistered. */
export function registerFacetModule(m: FacetModule): void {
  if (!facetModules.get(m.id)) facetModules.register(m);
}
```

- [ ] **Step 4: Run both tests** → PASS; suite + typecheck clean.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat(workspace): workspaceStore, per-facet tool sets, facet-module registry"
```

---

### Task 10: `LevelWorkspace` + facet bar + Layout facet; App renders it for aeon

This task lands the workspace AND the Layout facet together so the aeon level pane is never an empty shell mid-branch.

**Files:**
- Create: `src/renderer/workspace/LevelWorkspace.tsx`
- Create: `src/renderer/workspace/FacetBar.tsx`
- Create: `src/renderer/workspace/facets/layout-facet.tsx`
- Create: `src/renderer/workspace/register-facets.ts`
- Modify: `src/renderer/App.tsx`
- Test: `src/renderer/workspace/__tests__/facet-visibility.test.ts` (create)

- [ ] **Step 1: Write the failing visibility test** (pure logic: which facets render for a manifest)

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { facetsFor, facetRegistry, registerBuiltinFacets } from '../../../core/shell/facets';
import { facetModules } from '../facet-registry';
import { registerAeonFacetModules } from '../register-facets';

describe('facet visibility (registered descriptors ∩ granted ∩ has module)', () => {
  beforeEach(() => { facetRegistry.clear(); facetModules.clear(); });

  it('aeon manifest shows every facet with a registered module, in order', () => {
    registerBuiltinFacets();
    registerAeonFacetModules();
    const granted = ['layout', 'art', 'objects', 'rings', 'collision', 'palette'] as const;
    const visible = facetsFor([...granted]).filter((f) => facetModules.get(f.id));
    // Grows as facet-module tasks land: Task 10 = ['layout']; Task 11 adds
    // objects/rings/collision/palette; Task 12 adds art (full six).
    expect(visible.map((f) => f.id)).toEqual(['layout']);
  });

  it('a facet without a registered module renders nothing (no dead chrome)', () => {
    registerBuiltinFacets();
    // No modules registered at all:
    expect(facetsFor(['layout']).filter((f) => facetModules.get(f.id))).toEqual([]);
  });
});
```

Note: `register-facets.ts` imports React components; the vitest node env compiles TSX fine as long as nothing renders. Keep the test to registry math only.

- [ ] **Step 2: Run** → FAIL (`register-facets` missing).

- [ ] **Step 3: Create `layout-facet.tsx`** — the Map-branch content of `LegacyWorkspace` (lines 64–120) restructured into slots:

```tsx
// Layout facet — the aeon map editor as a facet module. Canvas/dock/panels are
// the former LegacyWorkspace map-branch content, unchanged in behavior; the
// dock is tool-scoped by FACET_TOOLS.layout.

import React from 'react';
import MapViewport from '../../components/MapViewport';
import SectionGridNav from '../../components/SectionGridNav';
import ChunkLibrary from '../../components/ChunkLibrary';
import MarqueePasteOptions from '../../components/MarqueePasteOptions';
import ArtBrowser from '../../components/ArtBrowser';
import PaletteViewer from '../../components/PaletteViewer';
import PropertiesPanel from '../../components/PropertiesPanel';
import MapStatusBar from '../../shell/MapStatusBar';
import { Panel, CollapsibleSection } from '../../components/ui';
import { useEditorStore } from '../../state/editorStore';
import { MapFacetDock } from '../MapFacetDock';
import type { FacetModule } from '../facet-registry';

function LayoutPanels() {
  const tool = useEditorStore((s) => s.tool);
  const pasting = useEditorStore((s) => s.pasting);
  return (
    <Panel width={240} scroll>
      <CollapsibleSection id="map.sections" title="Sections"><SectionGridNav /></CollapsibleSection>
      {/* Same paste-suppression rule as the old map branch (see LegacyWorkspace
          comment): pasting overrides every tool's options panel. */}
      {!pasting && tool === 'stamp-chunk' && (
        <CollapsibleSection id="map.palette" title="Chunks"><ChunkLibrary /></CollapsibleSection>
      )}
      {(tool === 'marquee' || pasting) && (
        <CollapsibleSection id="map.palette" title={pasting ? 'Paste' : 'Marquee'}>
          <MarqueePasteOptions />
        </CollapsibleSection>
      )}
      <CollapsibleSection id="map.art" title="Art"><ArtBrowser /></CollapsibleSection>
      <CollapsibleSection id="map.props" title="Properties"><PropertiesPanel /></CollapsibleSection>
    </Panel>
  );
}

export const layoutFacet: FacetModule = {
  id: 'layout',
  Canvas: MapViewport,
  ToolDock: () => <MapFacetDock facet="layout" />,
  RightPanel: LayoutPanels,
  BottomExtra: PaletteViewer,
  StatusBar: MapStatusBar,
};
```

Also create `src/renderer/workspace/MapFacetDock.tsx` — `MapToolDock` generalized over `FACET_TOOLS`:

```tsx
import React from 'react';
import { ToolButton, Icons } from '../components/ui';
import { useEditorStore, type EditorTool } from '../state/editorStore';
import { FACET_TOOLS } from './facet-tools';
import type { FacetCapability } from '../../core/project/adapter';

// Glyph/label map — superset of the old MapToolDock TOOLS list (same icons).
const TOOL_META: Record<EditorTool, [string, React.FC<{ size?: number }>]> = {
  view: ['View', Icons.IconView],
  select: ['Select', Icons.IconSelect],
  marquee: ['Marquee', Icons.IconSelect],
  'paint-tile': ['Paint Tile', Icons.IconPencil],
  'paint-block': ['Paint Block', Icons.IconRect],
  'stamp-chunk': ['Stamp Chunk', Icons.IconStamp],
  'paint-collision': ['Paint Collision', Icons.IconCollision],
  'place-object': ['Place Object', Icons.IconObject],
  'place-ring': ['Place Ring', Icons.IconRing],
  eraser: ['Eraser', Icons.IconPencil],
};

export function MapFacetDock({ facet }: { facet: FacetCapability }) {
  const tool = useEditorStore((s) => s.tool);
  const setTool = useEditorStore((s) => s.setTool);
  const tools = FACET_TOOLS[facet] ?? [];
  return (
    <>
      {tools.map((t) => {
        const [label, Icon] = TOOL_META[t];
        return <ToolButton key={t} icon={<Icon size={18} />} label={label} active={tool === t} onClick={() => setTool(t)} />;
      })}
    </>
  );
}
```

- [ ] **Step 4: Create `FacetBar.tsx`** (pill segmented control, spec §11: facets must NOT look like tabs):

```tsx
// The facet bar: a pill segmented control (spec §11 — tabs are page-shaped with
// a top accent; facets are pills; the two rows must never look alike). Renders
// registered-descriptors ∩ granted ∩ has-module, in descriptor order.

import React from 'react';
import { T } from '../components/ui';
import { facetsFor } from '../../core/shell/facets';
import type { FacetCapability } from '../../core/project/adapter';
import { facetModules } from './facet-registry';
import { useWorkspaceStore } from './workspaceStore';
import { useEditorStore } from '../state/editorStore';
import { toolForFacet } from './facet-tools';

export function switchFacet(tabId: string, facet: FacetCapability): void {
  useWorkspaceStore.getState().setFacet(tabId, facet);
  useEditorStore.getState().setTool(toolForFacet(facet, useEditorStore.getState().tool));
}

export default function FacetBar({ tabId, granted }: { tabId: string; granted: readonly FacetCapability[] }) {
  const active = useWorkspaceStore((s) => s.facetFor(tabId));
  const visible = facetsFor(granted).filter((f) => facetModules.get(f.id));
  return (
    <div style={styles.bar} role="group" aria-label="Facets">
      {visible.map((f) => (
        <button key={f.id}
          style={{ ...styles.pill, ...(f.id === active ? styles.pillActive : {}) }}
          onClick={() => switchFacet(tabId, f.id)}>
          {f.label}
        </button>
      ))}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  bar: { display: 'inline-flex', gap: 2, padding: 2, background: T.raised, borderRadius: 7 },
  pill: { padding: '3px 12px', fontSize: 11, border: 'none', borderRadius: 5,
    background: 'transparent', color: T.textBase, cursor: 'pointer' },
  pillActive: { background: T.surface, color: T.textHi, fontWeight: 600 },
};
```

- [ ] **Step 5: Create `LevelWorkspace.tsx`**

```tsx
// The facet-based level workspace (spec §4) — aeon-only until Stage 4 re-homes
// classic. Owns the ONE EditorShell; the active facet module fills its slots.
// The workspace header (EditorShell's appBar slot) carries the facet bar plus
// the workspace controls that used to live on the legacy Toolbar: FG/BG plane
// toggle (layout+collision) and undo/redo for the focused document.

import React from 'react';
import EditorShell from '../shell/EditorShell';
import FacetBar from './FacetBar';
import { facetModules } from './facet-registry';
import { useWorkspaceStore } from './workspaceStore';
import { useSessionStore } from '../state/sessionStore';
import { useProjectStore, getActiveLevel } from '../state/projectStore';
import { useEditorStore, undo, redo, activeHistory } from '../state/editorStore';
import { T } from '../components/ui';
import type { EditingLayer } from '../state/editorStore';

export default function LevelWorkspace() {
  const activeId = useSessionStore((s) => s.activeId);
  const granted = useProjectStore((s) => s.capabilities?.facets ?? []);
  const facetId = useWorkspaceStore((s) => s.facetFor(activeId));
  useEditorStore((s) => s.historyVersion); // repaint undo/redo enabledness
  const editingLayer = useEditorStore((s) => s.editingLayer);
  const mod = facetModules.get(facetId) ?? facetModules.get('layout');
  if (!mod) return null;

  const showPlane = facetId === 'layout' || facetId === 'collision';
  const level = () => getActiveLevel(useProjectStore.getState());
  const header = (
    <div style={styles.header}>
      <FacetBar tabId={activeId} granted={granted} />
      <span style={{ flex: 1 }} />
      {showPlane && (['fg', 'bg'] as EditingLayer[]).map((l) => (
        <button key={l} style={{ ...styles.chip, ...(editingLayer === l ? styles.chipActive : {}) }}
          onClick={() => useEditorStore.getState().setEditingLayer(l)}>{l.toUpperCase()}</button>
      ))}
      <button style={styles.chip} disabled={!activeHistory().canUndo}
        onClick={() => { const lv = level(); if (lv) undo(lv); }}>Undo</button>
      <button style={styles.chip} disabled={!activeHistory().canRedo}
        onClick={() => { const lv = level(); if (lv) redo(lv); }}>Redo</button>
    </div>
  );

  const { Canvas, ToolDock, ToolOptions, RightPanel, BottomExtra, StatusBar } = mod;
  return (
    <EditorShell
      appBar={header}
      toolOptions={ToolOptions ? <ToolOptions /> : undefined}
      toolDock={ToolDock ? <ToolDock /> : <span />}
      panels={RightPanel ? <RightPanel /> : <span />}
      bottomExtra={BottomExtra ? <BottomExtra /> : undefined}
      status={StatusBar ? <StatusBar /> : undefined}
    >
      <Canvas />
    </EditorShell>
  );
}

const styles: Record<string, React.CSSProperties> = {
  header: { display: 'flex', alignItems: 'center', gap: 8, width: '100%' },
  chip: { padding: '3px 10px', fontSize: 11, borderRadius: 5, cursor: 'pointer',
    background: T.raised, color: T.textBase, border: `1px solid ${T.border}` },
  chipActive: { background: T.surface, color: T.textHi, fontWeight: 600 },
};
```

NOTE: `activeHistory` does not exist until Task 14 — for THIS task import `editHistory` and use `editHistory.canUndo/.canRedo`; Task 14 swaps it (this is called out there).

- [ ] **Step 6: Create `register-facets.ts`**

```typescript
// Registers every built facet module (idempotent). App calls this at mount;
// tests call it directly. Grows one line per facet task (12, 13).

import { registerBuiltinFacets } from '../../core/shell/facets';
import { registerFacetModule } from './facet-registry';
import { layoutFacet } from './facets/layout-facet';

export function registerAeonFacetModules(): void {
  registerBuiltinFacets();
  registerFacetModule(layoutFacet);
}
```

- [ ] **Step 7: Wire App.tsx**

- Import `LevelWorkspace` and `registerAeonFacetModules`; call `registerAeonFacetModules()` inside the mount effect (line 48, beside `ensureSaversRegistered`).
- Replace the level-tab pane (lines 143–149): when a classic project is open render `LegacyWorkspace` exactly as before; when an aeon project is open render `LevelWorkspace`:

```tsx
            <div style={{ ...styles.tabPane, display: activeTab?.kind === 'level' ? 'flex' : 'none' }}>
              {classicOpen ? (
                <LegacyWorkspace onOpenProject={openProject} onOpenRecent={openProjectByPath} onSave={saveAllDirty} />
              ) : config ? (
                <LevelWorkspace />
              ) : null}
            </div>
```

`LegacyWorkspace`'s aeon branches are now unreachable (classic-only mount); they are DELETED in Task 18, not here.

- [ ] **Step 8: Run the visibility test + suite + typecheck**; then a manual smoke note for the reviewer: aeon project opens into Layout facet with chunk stamping, sections nav, palette strip, status bar; undo/redo buttons work; FG/BG chips work.

- [ ] **Step 9: Commit**

```bash
git add -A && git commit -m "feat(workspace): LevelWorkspace + facet bar + layout facet; aeon level tabs leave LegacyWorkspace"
```

---

### Task 11: Objects, Rings, Collision, Palette facet modules

**Files:**
- Create: `src/renderer/workspace/facets/objects-facet.tsx`
- Create: `src/renderer/workspace/facets/rings-facet.tsx`
- Create: `src/renderer/workspace/facets/collision-facet.tsx`
- Create: `src/renderer/workspace/facets/palette-facet.tsx`
- Modify: `src/renderer/workspace/register-facets.ts`
- Modify: `src/renderer/components/CollisionPalette.tsx` (appMode → prop)

- [ ] **Step 1: `objects-facet.tsx`**

```tsx
// Objects facet — instance placement (spec §5): same canvas, object tools only,
// object palette + inspector on the right.

import React from 'react';
import MapViewport from '../../components/MapViewport';
import ObjectPalette from '../../components/ObjectPalette';
import PropertiesPanel from '../../components/PropertiesPanel';
import MapStatusBar from '../../shell/MapStatusBar';
import { Panel, CollapsibleSection } from '../../components/ui';
import { useEditorStore } from '../../state/editorStore';
import { MapFacetDock } from '../MapFacetDock';
import type { FacetModule } from '../facet-registry';

function ObjectsPanels() {
  return (
    <Panel width={240} scroll>
      <CollapsibleSection id="map.palette" title="Objects">
        <ObjectPalette
          selectedType={0}
          onSelectType={(type, subtype) => useEditorStore.getState().setSelectedObjectTypeId(String(type), subtype)}
        />
      </CollapsibleSection>
      <CollapsibleSection id="map.props" title="Properties"><PropertiesPanel /></CollapsibleSection>
    </Panel>
  );
}

export const objectsFacet: FacetModule = {
  id: 'objects',
  Canvas: MapViewport,
  ToolDock: () => <MapFacetDock facet="objects" />,
  RightPanel: ObjectsPanels,
  StatusBar: MapStatusBar,
};
```

- [ ] **Step 2: `rings-facet.tsx`** — same shape: panel = `RingPatternPalette` (props exactly as the old map branch passed them: `selectedIndex={useEditorStore.getState().selectedRingPattern}` / `onSelect` setter) in a `map.palette` section plus `PropertiesPanel`; `ToolDock: () => <MapFacetDock facet="rings" />`; Canvas/StatusBar same as objects.

- [ ] **Step 3: `collision-facet.tsx`** — panel = `<CollisionPalette variant="map" />` in a `map.palette` section; dock facet="collision"; Canvas/StatusBar same.

For `CollisionPalette.tsx`: replace the `appMode` subscription (lines 63–64) with a prop:

```tsx
export default function CollisionPalette({ variant = 'map' }: { variant?: 'map' | 'art' }) {
```

and replace every `appMode === 'map'` with `variant === 'map'` (lines 205, 214). Update its other call site (`ArtMode.tsx` — until Task 12's art facet replaces it — passes `variant="art"`). Delete the now-unused `useEditorStore` appMode selector import if nothing else in the file uses it.

- [ ] **Step 4: `palette-facet.tsx`** — the unified palette editor as the right panel over the level canvas:

```tsx
// Palette facet — the level through a palette lens: view-only canvas, the
// single palette editor (spec §4) as the panel content.

import React from 'react';
import MapViewport from '../../components/MapViewport';
import PaletteEditor from '../../components/art/PaletteEditor';
import MapStatusBar from '../../shell/MapStatusBar';
import { Panel, CollapsibleSection } from '../../components/ui';
import { MapFacetDock } from '../MapFacetDock';
import type { FacetModule } from '../facet-registry';

function PalettePanels() {
  return (
    <Panel width={280} scroll>
      <CollapsibleSection id="palette.editor" title="Palette">
        <PaletteEditor />
      </CollapsibleSection>
    </Panel>
  );
}

export const paletteFacet: FacetModule = {
  id: 'palette',
  Canvas: MapViewport,
  ToolDock: () => <MapFacetDock facet="palette" />,
  RightPanel: PalettePanels,
  StatusBar: MapStatusBar,
};
```

- [ ] **Step 5: Register all four in `register-facets.ts`** (one `registerFacetModule(...)` line each).

- [ ] **Step 6: Extend the Task 10 visibility test**: with all modules registered, the aeon manifest now yields all six ids (update the first test's expectation comment — it already expects six once `registerAeonFacetModules` registers them; verify it passes for real now that objects/rings/collision/palette exist; the ART module is Task 12, so if the test asserted all six, mark art's line pending accordingly — simplest: the test from Task 10 asserted six but only layout existed → it was written against `registerAeonFacetModules`, which grows here; re-run and adjust so that after THIS task the expectation is `['layout','objects','rings','collision','palette']` and Task 12 restores the full six with 'art'.)

- [ ] **Step 7: Suite + typecheck; commit**

```bash
git add -A && git commit -m "feat(workspace): objects, rings, collision, palette facet modules"
```

---

### Task 12: Art facet — ArtMode dissolves into slots

**Files:**
- Create: `src/renderer/workspace/facets/art-facet.tsx`
- Modify: `src/renderer/components/art/ArtMode.tsx` → content moves; file DELETED at the end of this task
- Modify: `src/renderer/components/ChunkLibrary.tsx` (line 122), `src/renderer/components/MapViewport.tsx` (lines 560, 1385, 1412) — `setAppMode('art')` → facet switch
- Modify: `src/renderer/workspace/register-facets.ts`

- [ ] **Step 1: Create `art-facet.tsx`** by moving ArtMode's internals into slot components. ArtMode already composes `EditorShell` slots 1:1, so the move is structural, not behavioral:

```tsx
// Art facet — the composer (Chunk › Block › Tile drill-down, spec §4) as a
// facet module. Content moved from components/art/ArtMode.tsx (deleted); the
// mode's EditorShell composition became these slots. All handlers that only
// used getState() are module functions; the W/H inputs' local state lives in
// the launcher (Canvas), and the doc-header save button shares handleSave via
// this module scope.

import React, { useState, useEffect } from 'react';
/* …ArtMode.tsx's imports, minus EditorShell… */

/* module-scope: slug(), handleNewTile(), handleNewBlock(), handleNewChunk(w,h),
   handleSave() — moved VERBATIM from ArtMode (they only touch getState()). */

function ArtCanvas() {
  // Moves from ArtMode: the two useEffects (stale-doc close; Ctrl+Z/Y binding),
  // the chunkW/chunkH useState pair, and the canvasFill JSX (open ? ComposerCanvas
  // : launcher). Styles for the launcher/canvasFill move here too.
}

function ArtOptions() {
  // Moves from ArtMode: the docHeader JSX (name, dirty badge, shared-tiles
  // warning, Save button) — it subscribes to useArtStore (open) itself — wrapped
  // as <ArtToolOptions before={docHeader} />. Styles for the header move here.
}

function ArtPanels() {
  const tool = useArtStore((s) => s.tool);
  const open = useArtStore((s) => s.open);
  const showCollisionPanel = tool === 'collision' && open !== null && open.liveTileIndex === null;
  return (
    <Panel width={240} scroll>
      {showCollisionPanel && (
        <CollapsibleSection id="art.collision" title="Collision"><CollisionPalette variant="art" /></CollapsibleSection>
      )}
      <CollapsibleSection id="art.tileset" title="Tileset"><TilesetPanel /></CollapsibleSection>
      <CollapsibleSection id="art.palette" title="Palette"><PaletteEditor /></CollapsibleSection>
      <CollapsibleSection id="art.chunks" title="Chunks"><ChunkLibrary /></CollapsibleSection>
    </Panel>
  );
}

export const artFacet: FacetModule = {
  id: 'art',
  Canvas: ArtCanvas,
  ToolDock: ArtToolDock,
  ToolOptions: ArtOptions,
  RightPanel: ArtPanels,
  StatusBar: ArtStatusBar,
};
```

Register in `register-facets.ts`. Delete `ArtMode.tsx` once nothing imports it (`grep -rn "ArtMode" src/` must come back empty apart from comments; LegacyWorkspace still imports it — remove that import + branch there ONLY if trivially separable, otherwise leave LegacyWorkspace's dead import for Task 18's deletion, but then do not delete ArtMode.tsx until Task 18 either. Decide by the grep: the file goes when its last import goes.)

- [ ] **Step 2: Rewire the three "jump to art" call sites**

New helper in `src/renderer/workspace/FacetBar.tsx` is already exported (`switchFacet`). In `ChunkLibrary.tsx` line 122 and `MapViewport.tsx` lines 560/1385/1412, replace `useEditorStore.getState().setAppMode('art')` with:

```typescript
switchFacet(useSessionStore.getState().activeId, 'art');
```

(imports: `switchFacet` from `../workspace/FacetBar`, `useSessionStore` from `../state/sessionStore`). These sites open a composer doc then jump; the doc-open call stays exactly as-is.

- [ ] **Step 3: Update the visibility test** to the full six-facet expectation `['layout', 'art', 'objects', 'rings', 'collision', 'palette']` (see Task 11 step 6).

- [ ] **Step 4: Suite + typecheck; manual smoke note** (open chunk from ChunkLibrary → lands in Art facet with doc open; save-to-library round-trip; collision sub-tool panel appears).

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat(workspace): art facet module; ArtMode dissolved into slots"
```

---

### Task 13: Aeon undo re-homes onto DocumentHistoryHub

**Files:**
- Create: `src/renderer/state/history-hub.ts`
- Modify: `src/renderer/state/project-runtime.ts` (hub moves out)
- Modify: `src/renderer/state/editorStore.ts`
- Modify: `src/renderer/state/sprite-undo.ts`, `src/renderer/components/Toolbar.tsx`, `src/renderer/workspace/LevelWorkspace.tsx` (editHistory → activeHistory)
- Test: `src/renderer/state/__tests__/aeon-doc-history.test.ts` (create)

- [ ] **Step 1: Create `history-hub.ts`** (breaks the would-be cycle editorStore → project-runtime → export-sprite → editorStore):

```typescript
// The ONE DocumentHistoryHub instance. Lives in its own import-free module so
// low-level stores (editorStore) and the runtime (project-runtime) can both
// reach it without an import cycle.

import { DocumentHistoryHub } from '../../core/editing/document-history';

export const documentHistoryHub = new DocumentHistoryHub();
```

`project-runtime.ts`: delete its `new DocumentHistoryHub()` line, re-export instead: `export { documentHistoryHub } from './history-hub';` (existing importers keep working).

- [ ] **Step 2: Write the failing test**

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { useProjectStore } from '../projectStore';
import { documentHistoryHub } from '../history-hub';
import { activeHistory, executeCommand, undo } from '../editorStore';
import type { S4Level } from '../../../core/editing/commands';

function levelWithPalette(): S4Level {
  return {
    sections: [],
    tileset: { tiles: [] },
    palette: { lines: [{ colors: [{ r: 0, g: 0, b: 0, a: 255 }] }] },
  } as never;
}
const setPal = (v: number) => ({
  type: 'set-palette-line', description: 't', sectionIndex: -1, line: 0,
  oldColors: [{ r: 0, g: 0, b: 0, a: 255 }], newColors: [{ r: v, g: 0, b: 0, a: 255 }],
}) as never;

describe('per-document aeon undo (hub-keyed by act tab id)', () => {
  beforeEach(() => { documentHistoryHub.clearAll(); useProjectStore.getState().reset(); });

  it('activeHistory keys on the current act', () => {
    useProjectStore.getState().setCurrentAct('ojz', 'act1');
    const h1 = activeHistory();
    expect(documentHistoryHub.has('level:ojz:act1')).toBe(true);
    useProjectStore.getState().setCurrentAct('ojz', 'act2');
    expect(activeHistory()).not.toBe(h1);
  });

  it('edits land in the current act history; switching acts switches the undo target', () => {
    useProjectStore.getState().setCurrentAct('ojz', 'act1');
    const level = levelWithPalette();
    executeCommand(setPal(7), level);
    expect(activeHistory().canUndo).toBe(true);
    useProjectStore.getState().setCurrentAct('ojz', 'act2');
    expect(activeHistory().canUndo).toBe(false);   // act2 has its own empty history
    undo(level);                                    // no-op on empty history, no throw
    useProjectStore.getState().setCurrentAct('ojz', 'act1');
    expect(activeHistory().canUndo).toBe(true);
    undo(level);
    expect(activeHistory().canUndo).toBe(false);
  });
});
```

- [ ] **Step 3: Run** → FAIL (`activeHistory` missing). **Step 4: Rewire `editorStore.ts`**

- Delete `export const editHistory = new EditHistory()` (and the `EditHistory` import if now unused).
- Add:

```typescript
import { documentHistoryHub } from './history-hub';
import { useProjectStore } from './projectStore';

/**
 * The focused aeon document's history — hub-keyed by the current act's tab id
 * (per-document undo, spec §10; stage-2 watch-list #4). Zone-scoped commands
 * (tileset/palette/chunks) land in the history of the act tab they were made
 * in: accepted v1 — undoing them happens from that tab.
 */
export function activeHistory(): EditHistory {
  const s = useProjectStore.getState();
  const id = s.currentZoneId && s.currentActId
    ? `level:${s.currentZoneId}:${s.currentActId}`
    : 'level:aeon:none';
  return documentHistoryHub.historyFor(id);
}
```

- `clearLevelRedo` becomes `const clearLevelRedo = () => activeHistory().clearRedo();` (same registration).
- In `executeCommand`/`undo`/`redo`, replace `editHistory.` with `activeHistory().` (resolve ONCE per call into a local: `const h = activeHistory();`).
- The `appMode === 'sprite'` gate inside `executeCommand` line 271 — LEAVE IT for now; Task 14 replaces it with the sprite-doc-focused check (called out there).

Update remaining `editHistory` importers to `activeHistory()`:
- `sprite-undo.ts` — every `editHistory.` reference becomes `activeHistory().` (read the file; it merges by seq via `topUndoSeq/topRedoSeq`).
- `Toolbar.tsx` — same substitution for its canUndo/canRedo/undo/redo paths.
- `LevelWorkspace.tsx` — swap the Task 10 temporary `editHistory` import for `activeHistory` as the code there already anticipates.
- Any other `grep -rn "editHistory" src/ | grep -v __tests__` hits: substitute the same way, EXCEPT `spriteStore.ts`'s `spriteHistory` (different system, untouched).

- [ ] **Step 5: `resetProjectRuntime` audit** — it already calls `documentHistoryHub.clearAll()` on project switch; that now actually clears aeon histories (previously the hub was empty). Confirm the existing `project-runtime.test.ts` still passes.

- [ ] **Step 6: Run the new test + full suite + typecheck; commit**

```bash
git add -A && git commit -m "feat(aeon): per-document undo via DocumentHistoryHub keyed by act tab"
```

---

### Task 14: Sprite-doc tabs; `appMode` deleted

**Files:**
- Modify: `src/renderer/shell/tabs.ts` (+`spriteDocTab`/`parseSpriteDocTabId`)
- Modify: `src/renderer/shell/tab-activation.ts` (sprite-doc activation guard)
- Modify: `src/renderer/App.tsx` (sprite-doc pane)
- Modify: `src/renderer/components/sprite/export-sprite.ts` (`editObjectArt` opens a tab), `src/renderer/components/sprite/SpriteMode.tsx` (back button → focus level tab), `src/renderer/components/art/PaletteEditor.tsx` (inSprite via prop), `src/renderer/state/sprite-undo.ts` (baseline on tab focus), `src/renderer/agent/agent-handler.ts` (facet instead of mode), `src/renderer/components/Toolbar.tsx` (mode chips → tab actions), `src/renderer/shell/LegacyWorkspace.tsx` (sprite branch removed), `src/renderer/state/editorStore.ts` (appMode fields deleted)
- Test: `src/renderer/shell/__tests__/tabs.test.ts` (append), `src/renderer/shell/__tests__/sprite-doc-activation.test.ts` (create)

- [ ] **Step 1: Failing tests**

Append to `tabs.test.ts`:

```typescript
  it('builds and parses sprite-doc tab ids for both engines', () => {
    expect(spriteDocTab('s1', '42', 'Buzz Bomber')).toEqual(
      { id: 'doc:sprite:s1:42', kind: 'sprite-doc', title: 'Buzz Bomber' });
    expect(parseSpriteDocTabId('doc:sprite:aeon:motobug')).toEqual({ engine: 'aeon', ref: 'motobug' });
    expect(parseSpriteDocTabId('doc:sprite:s1:42')).toEqual({ engine: 's1', ref: '42' });
    expect(parseSpriteDocTabId('level:ojz:act1')).toBeNull();
    expect(parseSpriteDocTabId('doc:sprite:s1:')).toBeNull();
  });
```

Create `sprite-doc-activation.test.ts` (pure planner, mirroring `planLevelActivation`'s test style):

```typescript
import { describe, it, expect } from 'vitest';
import { planSpriteDocActivation } from '../tab-activation';

describe('planSpriteDocActivation', () => {
  it('no-op when the doc is already loaded', () => {
    expect(planSpriteDocActivation({ tabId: 'doc:sprite:aeon:motobug', loadedDocId: 'doc:sprite:aeon:motobug', spriteDirty: true }))
      .toEqual({ kind: 'none' });
  });
  it('opens directly when the editor is clean', () => {
    expect(planSpriteDocActivation({ tabId: 'doc:sprite:aeon:motobug', loadedDocId: null, spriteDirty: false }))
      .toEqual({ kind: 'open', engine: 'aeon', ref: 'motobug' });
  });
  it('asks first when retargeting would discard sprite edits', () => {
    expect(planSpriteDocActivation({ tabId: 'doc:sprite:s1:42', loadedDocId: 'doc:sprite:aeon:motobug', spriteDirty: true }))
      .toEqual({ kind: 'confirm', engine: 's1', ref: '42' });
  });
  it('rejects malformed ids', () => {
    expect(planSpriteDocActivation({ tabId: 'doc:sprite:junk', loadedDocId: null, spriteDirty: false }))
      .toEqual({ kind: 'none' });
  });
});
```

- [ ] **Step 2: Run both** → FAIL. **Step 3: Implement tabs + activation**

`tabs.ts`:

```typescript
export function spriteDocTab(engine: 's1' | 'aeon', ref: string, title: string): TabDescriptor {
  return { id: `doc:sprite:${engine}:${ref}`, kind: 'sprite-doc', title };
}

export function parseSpriteDocTabId(id: string): { engine: 's1' | 'aeon'; ref: string } | null {
  const m = /^doc:sprite:(s1|aeon):(.+)$/.exec(id);
  return m ? { engine: m[1] as 's1' | 'aeon', ref: m[2] } : null;
}
```

`tab-activation.ts` — add beside the level planner:

```typescript
export type SpriteDocPlan =
  | { kind: 'none' }
  | { kind: 'open'; engine: 's1' | 'aeon'; ref: string }
  | { kind: 'confirm'; engine: 's1' | 'aeon'; ref: string };

/** Which sprite doc the singleton sprite editor currently shows. Tracked in
 *  module state, set by the loaders (see loadedSpriteDoc below). */
export function planSpriteDocActivation(input: {
  tabId: string;
  loadedDocId: string | null;
  spriteDirty: boolean;
}): SpriteDocPlan {
  const ref = parseSpriteDocTabId(input.tabId);
  if (!ref) return { kind: 'none' };
  if (input.loadedDocId === input.tabId) return { kind: 'none' };
  return input.spriteDirty
    ? { kind: 'confirm', engine: ref.engine, ref: ref.ref }
    : { kind: 'open', engine: ref.engine, ref: ref.ref };
}
```

Glue (same file): module-level `let loadedSpriteDocId: string | null = null;` with `export function markSpriteDocLoaded(id: string | null): void`; an `activateSpriteDocTarget(tabId)` async that mirrors `activateLevelTarget`'s shape — generation counter shared (`activationGen`), dirty predicate:

```typescript
function spriteEditorDirty(): boolean {
  // s1ArtSource = checked-out classic art (Ctrl+S would write it);
  // spriteHistory.canUndo = any edit since the doc opened. canUndo survives a
  // successful save-art (history isn't cleared) so this can over-ask — fails safe.
  return useSpriteStore.getState().s1ArtSource !== null || spriteHistory.canUndo;
}
```

confirm copy: title `'Unsaved sprite edits'`, body `'Opening another sprite reloads the editor and discards unsaved sprite edits and undo history.'`, buttons Discard & open / Cancel (NO save option v1 — the two save paths (save-art vs export) are context-dependent; the dialog says discard or stay). On 'discard' (or clean open): route by engine —
- `aeon`: `await loadSpriteByName(ref)` (import from `../components/sprite/export-sprite`),
- `s1`: `ref` is the numeric object id; call `await editObjectArtCheckout(Number(ref))` — see Step 4.
Then `markSpriteDocLoaded(tabId)`; return true. On failure/cancel return false.
`requestOpenTab` gains: `if (tab.kind === 'sprite-doc' && !(await activateSpriteDocTarget(tab.id))) return;`

- [ ] **Step 4: Re-route the classic edit-art handoff**

In `export-sprite.ts`, `editObjectArt(id, zone)` (line 427) currently ends with `setAppMode('sprite')`. Split it:
- Rename the body minus the mode switch to `export async function editObjectArtCheckout(id: number): Promise<boolean>` — it must resolve `zone` itself from `useClassicLevelStore.getState().ref?.zone` (read the current signature/usages first; keep a thin `editObjectArt(id, zone)` wrapper that after a successful checkout calls `requestOpenTab(spriteDocTab('s1', String(id), objectName))` — object name via `S1_OBJECT_LIST` lookup, fall back to `Object $hex`).
- `requestOpenTab` will then re-run the activation guard; `activateSpriteDocTarget` must NOT double-load — it sees `loadedDocId === tabId` (set `markSpriteDocLoaded` at the end of the checkout) and plans 'none'. Call sites: `App.tsx` ⌘K `editObjectArt` action, Explorer object rows, `ClassicProjectView`/`S1ObjectSection` (grep `editObjectArt(` and update all).

- [ ] **Step 5: App pane + SpriteMode changes**

`App.tsx` — inside the non-level keep-alive map (line 134), tabs of kind `sprite-doc` render `null` in their pane (they're serviced by the single sprite pane below); after the level pane add:

```tsx
            {activeTab?.kind === 'sprite-doc' && (
              <div style={{ ...styles.tabPane, display: 'flex' }}>
                <SpriteMode appBar={<Toolbar onOpenProject={openProject} onOpenRecent={openProjectByPath} onSave={() => { void saveAllDirty(); }} />} />
              </div>
            )}
```

MOUNTED ONLY WHILE ACTIVE (deliberate — see locked decisions: a hidden second SpriteMode would double-register its keydown handler; sprite state lives in the module stores so remount is lossless).

`SpriteMode.tsx` back bar (line 216): `onClick={() => { const ref = useClassicLevelStore.getState().ref; if (ref) void requestFocusTabId(`level:${ref.zone}:${ref.act}`); }}` (import `requestFocusTabId` from `../../shell/tab-activation`). The button only renders when `classicOpen` — unchanged.

`PaletteEditor.tsx`: replace the `appMode` subscription (lines 71–75) with a prop `context?: 'sprite'` → `const inSprite = context === 'sprite';` `SpriteMode.tsx` line 356 passes `<PaletteEditor context="sprite" />`; art-facet/palette-facet call sites pass nothing.

`sprite-undo.ts` baseline (lines 27–30): replace the appMode subscription with a sessionStore subscription — capture `levelBaselineSeq = peekEditSeq()` when `activeId` moves ONTO a sprite-doc tab (`parseSpriteDocTabId(activeId) !== null && parseSpriteDocTabId(prevActiveId) === null`).

`editorStore.ts` `executeCommand` line 271: the `appMode === 'sprite'` gate becomes "a sprite-doc tab is focused": `parseSpriteDocTabId(useSessionStore.getState().activeId) !== null` (import from `../shell/tabs`; sessionStore import is acyclic — verify with `npx tsc --noEmit`).

`agent-handler.ts` lines 83–84: replace the appMode force with layout-facet force:

```typescript
  const activeId = useSessionStore.getState().activeId;
  if (parseLevelTabId(activeId)) switchFacet(activeId, 'layout');
```

`Toolbar.tsx`: delete the aeon mode-chip row (lines 143–146 area) and the map-only FG/BG chips + divider (154–164) — aeon no longer renders Toolbar at all (LevelWorkspace header owns these); the classic Level/Sprite chips (224–225): `Level` → no-op when already on a level tab (delete the chip row entirely IF SpriteMode's back bar + tabs cover the flow — they do: sprite entry is via tabs now; DELETE both chips and their `setAppMode` handlers). Its `spriteModeUndo/appMode==='sprite'` branches simplify to the non-sprite arm (Toolbar never renders inside SpriteMode's pane… EXCEPT App passes Toolbar as SpriteMode's appBar — keep the sprite-aware undo/redo branches, keyed on `parseSpriteDocTabId(useSessionStore.getState().activeId) !== null` instead of appMode).

`LegacyWorkspace.tsx`: remove the `appMode` selector and the sprite/art/map ternary — it becomes `classicOpen ? <ClassicProjectView appBar={appBar}/> : null` (aeon branches unreachable since Task 10; the file shrinks to the classic wrapper; header comment updated: "classic-only until Stage 4").

FINALLY delete from `editorStore.ts`: `AppMode` type, `appMode` field, `setAppMode` action. Then `grep -rn "appMode\|setAppMode" src/ --include='*.ts*' | grep -v __tests__` MUST return only comments (fix any stragglers this plan missed the same way as their siblings above).

- [ ] **Step 6: Update dirty-tabs for sprite docs** — in `dirty-tabs.ts`, sprite-doc tabs dot when the SPRITE editor is dirty and this tab is the loaded doc: extend `DirtySnapshot` with `loadedSpriteDocId: string | null` and `spriteDirty: boolean`; add before the level branch:

```typescript
  if (kind === 'sprite-doc') return tabId === s.loadedSpriteDocId && s.spriteDirty;
```

AND change the classic-level branch: `spriteArtPending` no longer dots the LEVEL tab (the art checkout now lives on its own tab — this closes deferred gap #4's lingering-dot): `return loaded && s.classicDirty;`. Update `dirty-tabs.test.ts` expectations accordingly (the aeon project-wide rule is unchanged). Update the TabStrip selector that builds the snapshot (grep `tabHasDirtyDot` callers) to supply the two new fields (`loadedSpriteDocId` from the tab-activation module getter — export `export function getLoadedSpriteDocId(): string | null`; `spriteDirty` from the same predicate used by the guard — export `spriteEditorDirty` from tab-activation).

- [ ] **Step 7: Run all shell tests + full suite + typecheck.** Manual smoke notes for the reviewer: classic edit-art opens a sprite tab; back button returns; Ctrl+Z in sprite tab undoes sprite edits; opening a second object asks when dirty; level tab dot no longer lit by a checked-out sprite.

- [ ] **Step 8: Commit**

```bash
git add -A && git commit -m "feat(shell): sprite-doc tabs host the sprite editor; appMode removed"
```

---

### Task 15: Explorer Object Library (aeon) + ⌘K sprite docs

**Files:**
- Modify: `src/renderer/shell/explorer-data.ts` + `__tests__/explorer-data.test.ts`
- Modify: `src/renderer/shell/Explorer.tsx` (route `doc:` ids)
- Modify: `src/renderer/shell/commands.ts` + `__tests__/commands.test.ts`
- Modify: `src/renderer/App.tsx` (feed aeon objects to both)

- [ ] **Step 1: Failing tests**

Append to `explorer-data.test.ts`:

```typescript
  it('aeon groups include an Object Library of sprite-bound definitions', () => {
    const groups = aeonExplorerGroups(
      [{ id: 'ojz', name: 'OJ Zone', acts: [{ id: 'act1' }] }],
      [
        { id: 'motobug', name: 'Moto Bug', sprite: 'motobug' },
        { id: 'spring', name: 'Spring', sprite: undefined },
      ],
    );
    const lib = groups.find((g) => g.id === 'objects')!;
    expect(lib.label).toBe('Object Library');
    expect(lib.items).toEqual([
      { id: 'doc:sprite:aeon:motobug', label: 'Moto Bug' },
      { id: 'doc:sprite:aeon:spring', label: 'Spring', disabled: true, reason: 'no sprite bound' },
    ]);
  });
```

(The disabled row keys on the DEF id — it has no sprite to open and can never activate, so the id only needs uniqueness.) Existing `aeonExplorerGroups` call sites and tests gain the new second argument — pass `[]` where no objects are relevant.

Append to `commands.test.ts`:

```typescript
  it('offers "Edit sprite" commands for aeon library entries', () => {
    const cmds = buildCommands(
      { ...baseSnapshot, engine: 'aeon', aeonSprites: [{ name: 'Moto Bug', sprite: 'motobug' }] },
      actions,
    );
    const c = cmds.find((x) => x.id === 'edit-sprite:motobug')!;
    expect(c.label).toBe('Edit sprite: Moto Bug');
  });
```

(Adapt `baseSnapshot`/`actions` to this file's existing fixtures; `aeonSprites` defaults to `[]` in every other test via the snapshot builder.)

- [ ] **Step 2: Run** → FAIL. **Step 3: Implement**

`explorer-data.ts` — `aeonExplorerGroups` gains a second parameter:

```typescript
export interface AeonObjectRow { id: string; name: string; sprite: string | undefined }

export function aeonExplorerGroups(
  zones: { id: string; name: string; acts: { id: string }[] }[],
  objects: AeonObjectRow[],
): ExplorerGroupModel[] {
  return [
    { /* levels group unchanged */ },
    {
      id: 'objects',
      label: 'Object Library',
      items: objects.map((o) =>
        o.sprite
          ? { id: `doc:sprite:aeon:${o.sprite}`, label: o.name }
          : { id: `doc:sprite:aeon:${o.id}`, label: o.name, disabled: true, reason: 'no sprite bound' },
      ),
    },
    TOOLS_GROUP,
  ];
}
```

`Explorer.tsx`: find the item-id prefix router (it handles `level:` / `obj:` / `recent:` / the setup tool id) and add a `doc:` branch → `void requestOpenTab({ id, kind: 'sprite-doc', title: item.label })` (build via `spriteDocTab` parse — simplest: `const p = parseSpriteDocTabId(id); if (p) void requestOpenTab(spriteDocTab(p.engine, p.ref, label));`). `App`/Explorer feed the new arg: `useProjectStore((s) => s.project?.objectLibrary ?? [])` mapped to `{ id, name, sprite }`.

`commands.ts`: snapshot gains `aeonSprites: { name: string; sprite: string }[]`; after the edit-art block add:

```typescript
  for (const sp of s.aeonSprites) {
    cmds.push({ id: `edit-sprite:${sp.sprite}`, label: `Edit sprite: ${sp.name}`, hint: 'sprite',
      run: () => a.openTab({ id: `doc:sprite:aeon:${sp.sprite}`, kind: 'sprite-doc', title: sp.name }) });
  }
```

`App.tsx` builds `aeonSprites` from `project.objectLibrary` (sprite-bound defs only) inside the existing `commands` memo (dep: `project`).

- [ ] **Step 4: Suite + typecheck; commit**

```bash
git add -A && git commit -m "feat(shell): aeon Object Library in explorer and command palette"
```

---

### Task 16: Session persistence — facet + viewport restore

**Files:**
- Modify: `src/renderer/shell/session-lifecycle.ts`
- Modify: `src/renderer/shell/session-storage.ts` (thread workspace)
- Modify: `src/renderer/shell/tab-activation.ts` (viewport snapshot/restore on aeon act switch)
- Test: `src/renderer/shell/__tests__/session-storage.test.ts` (append)

- [ ] **Step 1: Failing test** (append; this file already fakes storage with a Map):

```typescript
  it('stores and restores the workspace record beside the session', () => {
    const storage = fakeStorage();
    saveStoredSession(storage, '/p', { tabs: [HOME_TAB], activeId: 'home' },
      { 'level:ojz:act1': { facet: 'art', view: { x: 5, y: 6, zoom: 1 } } });
    expect(loadStoredWorkspace(storage, '/p')).toEqual(
      { 'level:ojz:act1': { facet: 'art', view: { x: 5, y: 6, zoom: 1 } } });
    // And a legacy payload (saved without workspace) restores as empty:
    saveStoredSession(storage, '/q', { tabs: [HOME_TAB], activeId: 'home' });
    expect(loadStoredWorkspace(storage, '/q')).toEqual({});
  });
```

- [ ] **Step 2: Run** → FAIL if Task 8's storage threading missed anything; implement `loadStoredWorkspace` per Task 8 step 4 if not already, and:

`session-lifecycle.ts`:
- The save subscription (lines 70–75) also subscribes `useWorkspaceStore` and persists both: extract a `persist()` closure reading `useSessionStore.getState()` + `useWorkspaceStore.getState().record`, call it from BOTH subscriptions (session change or workspace change → same write).
- The restore effect: after `useSessionStore.getState().replace(next)`, add `useWorkspaceStore.getState().seed(loadStoredWorkspace(localStorage, projectKey));` BEFORE the `activateLevelTarget` call (so activation sees the restored facet/view). On project switch, `resetProjectRuntime()` already runs; ALSO call `useWorkspaceStore.getState().reset()` beside it (the seed follows immediately for the new key).

`tab-activation.ts` — aeon viewport per tab: in the `'aeon-switch'` case, BEFORE `setCurrentAct`, snapshot the outgoing view; AFTER, restore the incoming:

```typescript
    case 'aeon-switch': {
      const prev = useProjectStore.getState();
      if (prev.currentZoneId && prev.currentActId) {
        const v = useViewStore.getState();
        useWorkspaceStore.getState().setView(
          `level:${prev.currentZoneId}:${prev.currentActId}`, { x: v.x, y: v.y, zoom: v.zoom });
      }
      useProjectStore.getState().setCurrentAct(plan.zone, plan.act);
      const view = useWorkspaceStore.getState().viewFor(tabId);
      if (view) useViewStore.getState().setViewport(view.x, view.y, view.zoom);
      return true;
    }
```

Read `viewStore.ts` first for the real field/action names (`x/y/zoom` and `setPosition`/`setZoom` or a combined setter — use what exists; add a combined `setViewport(x, y, zoom)` to viewStore ONLY if no combination exists, mirroring its current setters).

- [ ] **Step 3: Suite + typecheck. Manual smoke note:** switch act A → pan → switch act B → back to A → position restored; switch facet on A → reload app → same facet + tabs.

- [ ] **Step 4: Commit**

```bash
git add -A && git commit -m "feat(shell): per-tab facet and viewport persistence + restore"
```

---

### Task 17: Cleanup, dead-code deletion, stage-4 notes

**Files:**
- Modify: `src/renderer/shell/LegacyWorkspace.tsx` (final classic-only form — verify Task 14 left it clean)
- Delete: `src/renderer/components/art/ArtMode.tsx` (if still present), `src/renderer/shell/MapToolDock.tsx`
- Modify: whatever the greps below surface
- Create: `docs/superpowers/plans/2026-08-13-ux-overhaul-stage4-notes.md`

- [ ] **Step 1: Dead-code sweep** (each grep must end empty or comments-only; fix hits by the pattern established in the tasks above):

```bash
grep -rn "appMode\|setAppMode\|AppMode" src/ --include='*.ts*' | grep -v __tests__
grep -rn "ArtMode" src/ --include='*.ts*'
grep -rn "MapToolDock" src/ --include='*.ts*'
grep -rn "registerAeonSaver" src/ --include='*.ts*'
grep -rn "loadFromPath\|loadFullProject" src/renderer --include='*.ts*'
grep -rn "from '../shell/facets'" src/renderer   # facet TYPE must come from core/project/adapter
```

Delete `MapToolDock.tsx` (superseded by `MapFacetDock`) after confirming zero imports; delete `hooks/load-collision.ts` if `grep -rn "load-collision" src/` shows the core port (Task 2) left it orphaned.

- [ ] **Step 2: Comment-accuracy pass** on files whose header comments this stage invalidated: `core/project/aeon/index.ts` (done in Task 4), `state/project-runtime.ts` (hub location + aeon saver), `core/editing/document-history.ts` (it now HAS a production consumer — update the "cannot live here" note to reflect aeon histories being resident, sprite/classic still outside), `shell/session-lifecycle.ts` (the aeon-gap comment block lines 51–62 describes the pre-atomic-commit loader — rewrite to document the openLoaded atomic commit), `classic-bridge.ts` (aeon open path no longer "untouched renderer loader" — it now routes to `aeon-open.ts`).

- [ ] **Step 3: Write `docs/superpowers/plans/2026-08-13-ux-overhaul-stage4-notes.md`** — carry-forward for Stage 4 (re-home classic), covering at minimum: what the facet seam expects from classic (slot components per facet; classic's per-act load model vs aeon's resident model at the activation guard); sprite/classic histories still outside the hub (generalize or unify — spec §10 requires the undo-bus GONE by end of Stage 4); LegacyWorkspace + Toolbar + EditorShell duplication to collapse; TabStrip a11y still deferred (gap #3); tab drag-reorder still unbuilt (watch-list #5); the sprite-doc save-option gap (confirm dialog offers discard-only); whatever review findings this stage's tasks produced. End with the updated test baseline numbers.

- [ ] **Step 4: Full gates**

```bash
npx vitest run          # record the new totals (≥ baseline + this plan's new tests)
npx tsc --noEmit
```

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "chore(shell): stage 3 cleanup — dead code, comment accuracy, stage 4 notes"
```

---

### Task 18: Final whole-branch review + merge readiness

- [ ] **Step 1:** Dispatch the two-stage whole-branch review (superpowers:subagent-driven-development's reviewer flow): spec-compliance pass (walk spec §4/§5/§7/§9/§10 stage-3 claims against the diff) and regression pass (the Phase A ports: diff `loadAeonProject`/`buildAeonSavePlan` against the deleted renderer originals hunk-by-hunk for dropped side effects — this is where a silent behavior change would hide).
- [ ] **Step 2:** Fix findings; re-run full gates.
- [ ] **Step 3:** Report merge-readiness to the user with the smoke-test checklist (open aeon project → facets; edit/save round-trip in each facet; sprite doc flows; project-switch guard; session restore). **Do NOT merge to master without the user's go — Stage 2's precedent is a user smoke-test before merge.**

---

## Self-review checklist (ran at plan-writing time)

- **Spec coverage §12 stage 3:** loading out of renderer (Tasks 2–6), Map→facets (10–11), Art→facet (12), Sprite→Library docs (14–15), full profile (4). Stage-3 notes deferred gaps: #1 Task 7, #2 Task 5, #4 Task 14 step 6; #3/#5 explicitly deferred in locked decisions. Watch-list: #1 Task 9, #2 Tasks 8/16, #4 Task 13, #6 Tasks 1/17, #7 resolved-as-unneeded.
- **Type consistency:** `AeonProjectData` (Tasks 1/2/4), `AeonSavePlan` (3/6), `FacetModule` slots (9/10/11/12), `spriteDocTab`/`parseSpriteDocTabId` (14/15), `WorkspaceRecord` (8/9/16), `activeHistory` (10-note/13/14).
- **Known verbatim-port risk** is concentrated in Tasks 2/3 and gated by round-trip tests + the Task 18 hunk-by-hunk review.
