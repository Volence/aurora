# Aurora UX Overhaul — Stage 2: Shell Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Land the new shell: tab strip, persistent explorer, Home tab, rewired ⌘K, Project Setup tab wired to the mapping layer, and session persistence keyed by project path — with the existing editors living unchanged inside a level-workspace tab until Stages 3–4 re-home them.

**Architecture:** The shell is `Explorer (left, full height) | [TabStrip / tab content]`. Level tabs are per-act (`level:<zone>:<act>`), but their content is the ONE mounted `LegacyWorkspace` (the current App composition, extracted verbatim); activating a level tab points the singleton stores at that act (aeon: free pointer switch; classic: `openAct` behind a dirty-confirm guard, since `openAct` resets doc/dirty/history). Home and tool tabs keep-alive via `display:none`. All shell behavior lives in pure, node-testable modules (the test suite has NO jsdom — components stay thin). Ctrl+S routes through the Stage 1 `SaveCoordinator`, replacing `save-routing.ts`. The two sidecar parsers merge: `core/project/mapping.ts` gains a lenient per-entry-diagnostics parser that `s1/index.ts` adopts, surfacing `ProjectHandle.sidecar` for the Project Setup tab.

**Tech Stack:** TypeScript (strict), React 19 inline-style components themed from `ui/theme.ts` tokens, zustand v5, zod v4, vitest (node env). Spec: `docs/superpowers/specs/2026-08-12-aurora-ux-overhaul-design.md` (§3 shell, §7 mapping/setup, §10 save/sessions, §11 visual language, §12 stage 2). Pre-planning notes: `docs/superpowers/plans/2026-08-12-ux-overhaul-stage2-notes.md`.

**Conventions for every task:**
- Work in the worktree created in Task 0. **MANDATORY TRIPWIRE for every implementer: run `git branch --show-current` and confirm it prints `feature/ux-overhaul-stage2` BEFORE running any other command. If it prints anything else, STOP and report.**
- Run tests with `npx vitest run <file>` from the worktree root.
- Commit style `type(scope): summary`, single line. NEVER add a Co-Authored-By trailer.
- Baseline at branch point: 135 test files / 1179 passed / 2 skipped; `npx tsc --noEmit` clean. Nothing may regress.

**Stage 2 decisions locked here (so implementers don't re-litigate):**
- Level tabs are per-act. Activating one retargets the singleton editor; per-document state ("everything as you left it") arrives in Stages 3–4 when the stores go per-document. Switching classic acts still reloads from disk exactly as today's zone/act Select does — the new part is the dirty-confirm guard, which today's Select lacks.
- Closing a level tab never discards edits (the singleton keeps them); closing the tab of the *loaded, dirty* classic act asks first anyway, so dirtiness never silently loses its indicator.
- Aeon dirty dots appear on every aeon level tab (aeon dirtiness is project-wide; spec §10 says aggregate honestly).
- SaveCoordinator savers mirror the retired `save-routing.ts` semantics (classic saver fires whenever a classic project is open; aeon saver whenever an aeon project is open and no classic one; sprite-art saver whenever `s1ArtSource` is set) — save-behavior parity first, honest per-surface dirtiness lives only in the tab-dot selector.
- The legacy Toolbar keeps rendering inside the level workspace (undo/redo/mode chips/zone select). Its act switches are synced back into tabs by a store subscription. It disappears in Stages 3–4, not now.
- Explorer groups with no Stage 2 data source (Level Art, Palettes, UI & Screens) are NOT rendered — no dead chrome. Groups now: Levels / Object Library (classic only) / Tools; with no project: Recent Projects.
- `persistedTabSchema` is unchanged this stage; versioning is decided in Stage 3 when per-tab state (facet, viewport) lands. The storage key carries `v1` so a future format bump can re-key.

---

### Task 0: Worktree + branch setup

**Files:** none (git only)

- [ ] **Step 1: Create the worktree and branch off master**

```bash
cd /home/volence/sonic_hacks/aurora
git worktree add .claude/worktrees/ux-stage2 -b feature/ux-overhaul-stage2 master
cd .claude/worktrees/ux-stage2
ln -s /home/volence/sonic_hacks/aurora/node_modules node_modules
git branch --show-current   # MUST print: feature/ux-overhaul-stage2
```

(Do NOT `npm install` in the worktree — it hits a pre-existing electron-vite/vite-8 peer conflict; the symlink reuses the main tree's install.)

- [ ] **Step 2: Keep the worktree out of git status**

Run `git status --short` from the MAIN tree (`/home/volence/sonic_hacks/aurora`). If `.claude/` appears untracked, append `.claude/` to `/home/volence/sonic_hacks/aurora/.git/info/exclude`.

- [ ] **Step 3: Commit this plan onto the branch**

```bash
cp /home/volence/sonic_hacks/aurora/docs/superpowers/plans/2026-08-12-ux-overhaul-stage2-shell.md \
   /home/volence/sonic_hacks/aurora/.claude/worktrees/ux-stage2/docs/superpowers/plans/
cd /home/volence/sonic_hacks/aurora/.claude/worktrees/ux-stage2
git add docs/superpowers/plans/2026-08-12-ux-overhaul-stage2-shell.md
git commit -m "docs(ux): stage 2 shell implementation plan"
```

- [ ] **Step 4: Verify the baseline**

Run: `npx vitest run` then `npx tsc --noEmit` (both from the worktree root).
Expected: 135 test files, 1179 passed / 2 skipped; tsc silent. Record the numbers if they differ (they shouldn't — branch point is the Stage 1 merge).

---

### Task 1: Session model — pruneSession + store replace

Session restore needs to (a) drop persisted tabs whose targets no longer exist in the opened project and (b) atomically swap the whole session when the project changes. Both are pure-core session concerns.

**Files:**
- Modify: `src/core/shell/session.ts` (append)
- Modify: `src/renderer/state/sessionStore.ts`
- Test: `src/core/shell/__tests__/session.test.ts` (append)
- Test: `src/renderer/state/__tests__/sessionStore.test.ts` (append)

- [ ] **Step 1: Write the failing tests**

Append inside the top-level `describe` of `src/core/shell/__tests__/session.test.ts`:

```typescript
  it('pruneSession drops invalid tabs, keeps Home, and repairs a dangling activeId', () => {
    let s = openTab(initialSession(), level('level:ghz:1', 'GHZ Act 1'));
    s = openTab(s, level('level:mz:2', 'MZ Act 2'));
    const pruned = pruneSession(s, (t) => t.id !== 'level:mz:2');
    expect(pruned.tabs.map((t) => t.id)).toEqual(['home', 'level:ghz:1']);
    expect(pruned.activeId).toBe('home'); // active was level:mz:2 → falls back to Home
  });

  it('pruneSession never asks the predicate about Home', () => {
    const pruned = pruneSession(initialSession(), () => false);
    expect(pruned.tabs).toEqual([HOME_TAB]);
    expect(pruned.activeId).toBe('home');
  });

  it('pruneSession keeps activeId when the active tab survives', () => {
    const s = openTab(initialSession(), level('level:ghz:1', 'GHZ Act 1'));
    const pruned = pruneSession(s, () => true);
    expect(pruned).toEqual(s);
  });
```

Add `pruneSession` to the existing import from `'../session'` at the top of the file.

Append inside the top-level `describe` of `src/renderer/state/__tests__/sessionStore.test.ts`:

```typescript
  it('replace swaps the whole session atomically (project switch / restore)', () => {
    const s = useSessionStore.getState();
    s.open({ id: 'level:ghz:1', kind: 'level', title: 'GHZ Act 1' });
    s.replace({
      tabs: [
        { id: 'home', kind: 'home', title: 'Home' },
        { id: 'level:lz:3', kind: 'level', title: 'LZ Act 3' },
      ],
      activeId: 'level:lz:3',
    });
    const after = useSessionStore.getState();
    expect(after.tabs.map((t) => t.id)).toEqual(['home', 'level:lz:3']);
    expect(after.activeId).toBe('level:lz:3');
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/core/shell/__tests__/session.test.ts src/renderer/state/__tests__/sessionStore.test.ts`
Expected: FAIL — `pruneSession` not exported / `replace` is not a function.

- [ ] **Step 3: Implement**

Append to `src/core/shell/session.ts`:

```typescript
/**
 * Drop tabs whose targets no longer exist (project switch / stale persisted
 * session). Home is always kept and never offered to the predicate; a pruned
 * activeId falls back to Home.
 */
export function pruneSession(
  state: SessionState,
  isValid: (tab: TabDescriptor) => boolean,
): SessionState {
  const tabs = state.tabs.filter((t) => t.id === HOME_TAB.id || isValid(t));
  const activeId = tabs.some((t) => t.id === state.activeId) ? state.activeId : HOME_TAB.id;
  return { tabs, activeId };
}
```

In `src/renderer/state/sessionStore.ts`, add to the `SessionStore` interface:

```typescript
  /** Swap the whole session atomically (project switch / session restore). */
  replace: (next: SessionState) => void;
```

and to the store body (next to `reset`):

```typescript
  replace: (next) => set({ tabs: next.tabs, activeId: next.activeId }),
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/core/shell/__tests__/session.test.ts src/renderer/state/__tests__/sessionStore.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/core/shell/session.ts src/renderer/state/sessionStore.ts \
        src/core/shell/__tests__/session.test.ts src/renderer/state/__tests__/sessionStore.test.ts
git commit -m "feat(shell): pruneSession reducer + session store replace"
```

---

### Task 2: Level tab id helpers

One place that builds and parses `level:<zone>:<act>` tab ids and the fixed tool-tab descriptors, so the explorer, tab strip, ⌘K, activation, and session restore never hand-roll id strings.

**Files:**
- Create: `src/renderer/shell/tabs.ts`
- Test: `src/renderer/shell/__tests__/tabs.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// src/renderer/shell/__tests__/tabs.test.ts
import { describe, it, expect } from 'vitest';
import { classicLevelTab, aeonLevelTab, parseLevelTabId, PROJECT_SETUP_TAB } from '../tabs';

describe('level tab helpers', () => {
  it('classicLevelTab builds id from zone + act number and titles from the ref label', () => {
    expect(classicLevelTab({ zone: 'ghz', act: 1, label: 'Green Hill Act 1', available: true }))
      .toEqual({ id: 'level:ghz:1', kind: 'level', title: 'Green Hill Act 1' });
  });

  it('aeonLevelTab builds id from zone + act ids and titles from zone name + act id', () => {
    expect(aeonLevelTab('ehz', 'Emerald Hill', 'act1'))
      .toEqual({ id: 'level:ehz:act1', kind: 'level', title: 'Emerald Hill · act1' });
  });

  it('parseLevelTabId round-trips both id shapes', () => {
    expect(parseLevelTabId('level:ghz:1')).toEqual({ zone: 'ghz', act: '1' });
    expect(parseLevelTabId('level:ehz:act1')).toEqual({ zone: 'ehz', act: 'act1' });
  });

  it('parseLevelTabId rejects non-level and malformed ids', () => {
    expect(parseLevelTabId('home')).toBeNull();
    expect(parseLevelTabId('tool:project-setup')).toBeNull();
    expect(parseLevelTabId('level:ghz')).toBeNull();
    expect(parseLevelTabId('level::1')).toBeNull();
    expect(parseLevelTabId('level:ghz:')).toBeNull();
  });

  it('exposes the Project Setup tool tab descriptor', () => {
    expect(PROJECT_SETUP_TAB).toEqual({ id: 'tool:project-setup', kind: 'tool', title: 'Project Setup' });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/renderer/shell/__tests__/tabs.test.ts`
Expected: FAIL — cannot resolve `../tabs`.

- [ ] **Step 3: Implement**

```typescript
// src/renderer/shell/tabs.ts
// The one place that builds/parses tab ids for the shell. Level tab ids are
// 'level:<zone>:<act>' — the same doc-id convention core/shell/session.ts
// documents — where <act> is a classic act NUMBER ('1') or an aeon act id
// ('act1'). Consumers parse with parseLevelTabId and then interpret <act>
// against whichever project kind is open (a window holds one project).

import type { ZoneActRef } from '../../core/project/adapter';
import type { TabDescriptor } from '../../core/shell/session';

export const PROJECT_SETUP_TAB: TabDescriptor = {
  id: 'tool:project-setup',
  kind: 'tool',
  title: 'Project Setup',
};

export function classicLevelTab(ref: ZoneActRef): TabDescriptor {
  return { id: `level:${ref.zone}:${ref.act}`, kind: 'level', title: ref.label };
}

export function aeonLevelTab(zoneId: string, zoneName: string, actId: string): TabDescriptor {
  return { id: `level:${zoneId}:${actId}`, kind: 'level', title: `${zoneName} · ${actId}` };
}

export function parseLevelTabId(id: string): { zone: string; act: string } | null {
  if (!id.startsWith('level:')) return null;
  const rest = id.slice('level:'.length);
  const sep = rest.indexOf(':');
  if (sep <= 0 || sep === rest.length - 1) return null;
  return { zone: rest.slice(0, sep), act: rest.slice(sep + 1) };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/renderer/shell/__tests__/tabs.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/renderer/shell/tabs.ts src/renderer/shell/__tests__/tabs.test.ts
git commit -m "feat(shell): level/tool tab id helpers"
```

---

### Task 3: Lenient mapping parser with per-entry diagnostics

The Stage 1 `parseProjectConfig` fails all-or-nothing (null), so one bad entry silently discards the whole sidecar. The Setup UI needs to know *which* entry failed (watch-list #3). Replace it with `readProjectConfig`, which always returns a usable config plus a list of `ConfigIssue`s for everything it had to drop.

**Files:**
- Modify: `src/core/project/mapping.ts`
- Test: `src/core/project/__tests__/mapping.test.ts` (rewrite the parse cases; keep serialize cases)

- [ ] **Step 1: Rewrite the test file**

Replace the whole of `src/core/project/__tests__/mapping.test.ts` with:

```typescript
// src/core/project/__tests__/mapping.test.ts
import { describe, it, expect } from 'vitest';
import { readProjectConfig, serializeProjectConfig, type ProjectConfig } from '../mapping';

const enc = (s: string) => new TextEncoder().encode(s);

describe('project mapping config', () => {
  it('parses a full v2 config with no issues', () => {
    const { config, issues } = readProjectConfig(enc(JSON.stringify({
      base: 's2-github',
      paths: { 'level/layout': 'custom/layouts' },
      assets: {
        'level-art': { path: 'art/zx0', compression: 'zx0' },
        'sprites': { format: 's2', compression: 'kosinski' },
      },
    })));
    expect(issues).toEqual([]);
    expect(config.base).toBe('s2-github');
    expect(config.assets!['level-art'].compression).toBe('zx0');
  });

  it('null bytes (no sidecar file) → empty config, no issues', () => {
    expect(readProjectConfig(null)).toEqual({ config: {}, issues: [] });
  });

  it('malformed JSON → empty config + a root issue', () => {
    const { config, issues } = readProjectConfig(enc('not json'));
    expect(config).toEqual({});
    expect(issues).toHaveLength(1);
    expect(issues[0].where).toBe('$');
  });

  it('non-object top level → empty config + a root issue', () => {
    expect(readProjectConfig(enc('[1,2]')).issues[0].where).toBe('$');
    expect(readProjectConfig(enc('"hi"')).issues[0].where).toBe('$');
  });

  it('drops a non-string base with an issue, keeps the rest', () => {
    const { config, issues } = readProjectConfig(enc(JSON.stringify({ base: 42, paths: { a: 'b' } })));
    expect(config.base).toBeUndefined();
    expect(config.paths).toEqual({ a: 'b' });
    expect(issues).toEqual([{ where: 'base', message: expect.stringContaining('string') }]);
  });

  it('drops individual bad paths entries, keeping good ones (per-entry diagnostics)', () => {
    const { config, issues } = readProjectConfig(enc(JSON.stringify({
      paths: { good: 'levels/ghz1.bin', bad: 42, worse: null },
    })));
    expect(config.paths).toEqual({ good: 'levels/ghz1.bin' });
    expect(issues.map((i) => i.where).sort()).toEqual(['paths.bad', 'paths.worse']);
  });

  it('drops a wholly-wrong paths shape with one issue', () => {
    const { config, issues } = readProjectConfig(enc(JSON.stringify({ paths: 'nope' })));
    expect(config.paths).toBeUndefined();
    expect(issues).toEqual([{ where: 'paths', message: expect.any(String) }]);
  });

  it('drops individual bad asset entries, keeping good ones', () => {
    const { config, issues } = readProjectConfig(enc(JSON.stringify({
      assets: {
        ok: { path: 'a', compression: 'zx0' },
        bad: { path: 3 },
        typo: { pth: 'a' },
      },
    })));
    expect(Object.keys(config.assets!)).toEqual(['ok']);
    expect(issues.map((i) => i.where).sort()).toEqual(['assets.bad', 'assets.typo']);
  });

  it('preserves unknown top-level fields through a round-trip', () => {
    const { config } = readProjectConfig(enc(JSON.stringify({ base: 'aeon', futureField: 42 })));
    const rt = readProjectConfig(serializeProjectConfig(config));
    expect(rt.issues).toEqual([]);
    expect((rt.config as Record<string, unknown>).futureField).toBe(42);
  });

  it('serializes with trailing newline and 2-space indent (diff-friendly in repos)', () => {
    const cfg: ProjectConfig = { base: 'aeon' };
    const text = new TextDecoder().decode(serializeProjectConfig(cfg));
    expect(text.endsWith('\n')).toBe(true);
    expect(text).toContain('  "base": "aeon"');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/core/project/__tests__/mapping.test.ts`
Expected: FAIL — `readProjectConfig` not exported.

- [ ] **Step 3: Implement**

Replace the whole of `src/core/project/mapping.ts` with:

```typescript
// The per-project mapping layer (spec §7): `.aurora/project.json` carries the
// nearest-base profile id plus per-asset-class overrides (path / format /
// compression) for hacks that diverge from stock.
//
// Parsing is LENIENT with per-entry diagnostics: a bad entry is dropped and
// reported as a ConfigIssue, never allowed to discard the rest of the file —
// the Project Setup tab renders these issues so the user can see exactly which
// entry is wrong (Stage 2; replaces the Stage 1 all-or-nothing null parse and
// s1/index.ts's private readSidecar()). Unknown top-level fields are preserved
// so configs written by newer Auroras survive a round-trip through older ones.

import { z } from 'zod';

const assetOverrideSchema = z.strictObject({
  path: z.string().optional(),
  format: z.string().optional(),
  compression: z.string().optional(),
});

export const projectConfigSchema = z.looseObject({
  /** Base profile id, e.g. 's1-github', 's1-hivebrain-2005', 'aeon'. */
  base: z.string().optional(),
  /** v1 channel: resolution path overrides, keyed by resolver key. */
  paths: z.record(z.string(), z.string()).optional(),
  /** v2 channel: per-asset-class overrides. */
  assets: z.record(z.string(), assetOverrideSchema).optional(),
});

export type ProjectConfig = z.infer<typeof projectConfigSchema>;

/** One dropped/ignored entry. `where` is a dotted path: '$', 'base', 'paths.foo'. */
export interface ConfigIssue {
  where: string;
  message: string;
}

/** Parsed sidecar + everything that had to be dropped to parse it. */
export interface SidecarState {
  config: ProjectConfig;
  issues: ConfigIssue[];
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

/**
 * Lenient parse. `bytes: null` means "no sidecar file" (empty config, no
 * issues). Malformed input degrades entry-by-entry; the returned config is
 * always safe to use and to serialize back.
 */
export function readProjectConfig(bytes: Uint8Array | null): SidecarState {
  if (bytes === null) return { config: {}, issues: [] };

  let json: unknown;
  try {
    json = JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    return { config: {}, issues: [{ where: '$', message: 'invalid JSON — ignoring the sidecar' }] };
  }
  if (!isPlainObject(json)) {
    return { config: {}, issues: [{ where: '$', message: 'expected a JSON object — ignoring the sidecar' }] };
  }

  const issues: ConfigIssue[] = [];
  const out: Record<string, unknown> = { ...json };

  if ('base' in json && typeof json.base !== 'string') {
    delete out.base;
    issues.push({ where: 'base', message: `expected a string profile id, got ${typeof json.base} — entry ignored` });
  }

  if ('paths' in json) {
    if (!isPlainObject(json.paths)) {
      delete out.paths;
      issues.push({ where: 'paths', message: 'expected an object of key → path — channel ignored' });
    } else {
      const paths: Record<string, string> = {};
      for (const [k, v] of Object.entries(json.paths)) {
        if (typeof v === 'string') paths[k] = v;
        else issues.push({ where: `paths.${k}`, message: `expected a string path, got ${v === null ? 'null' : typeof v} — entry ignored` });
      }
      out.paths = paths;
    }
  }

  if ('assets' in json) {
    if (!isPlainObject(json.assets)) {
      delete out.assets;
      issues.push({ where: 'assets', message: 'expected an object of asset-class → override — channel ignored' });
    } else {
      const assets: Record<string, z.infer<typeof assetOverrideSchema>> = {};
      for (const [k, v] of Object.entries(json.assets)) {
        const res = assetOverrideSchema.safeParse(v);
        if (res.success) assets[k] = res.data;
        else issues.push({ where: `assets.${k}`, message: `invalid override shape — entry ignored` });
      }
      out.assets = assets;
    }
  }

  return { config: out as ProjectConfig, issues };
}

export function serializeProjectConfig(cfg: ProjectConfig): Uint8Array {
  return new TextEncoder().encode(JSON.stringify(cfg, null, 2) + '\n');
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/core/project/__tests__/mapping.test.ts`
Expected: PASS (10 tests). Also run `npx tsc --noEmit` — `parseProjectConfig` had no non-test importers (verified at planning time), so removing it breaks nothing.

- [ ] **Step 5: Commit**

```bash
git add src/core/project/mapping.ts src/core/project/__tests__/mapping.test.ts
git commit -m "feat(project): lenient sidecar parse with per-entry diagnostics"
```

---

### Task 4: s1 adapter adopts the mapping parser; ProjectHandle.sidecar

Retire `s1/index.ts`'s private `readSidecar()` (watch-list #3): the s1 adapter now reads `.aurora/project.json` through `readProjectConfig` and surfaces the parsed config + issues on the handle, where the Project Setup tab and the classic store can reach them.

**Files:**
- Modify: `src/core/project/adapter.ts` (ProjectHandle)
- Modify: `src/core/project/s1/index.ts` (readSidecar → mapping)
- Modify: `src/renderer/state/classicProjectStore.ts` (expose sidecar)
- Test: `src/core/project/__tests__/s1-adapter.test.ts` (append)
- Test: `src/renderer/state/__tests__/classicProjectStore.test.ts` (check for handle-shape fixtures; extend only if compilation demands)

- [ ] **Step 1: Write the failing tests**

Open `src/core/project/__tests__/s1-adapter.test.ts` and find its existing fake-FileAccess helper and sidecar tests (it already covers "tolerate-and-filter" sidecar behavior — those tests must keep passing unchanged). Append inside the top-level describe, reusing the file's existing helpers for building a complete fake tree (the helper that inserts a file at every `enumerateProfileEntries` path — read the file first and reuse its exact helper names):

```typescript
  it('surfaces the parsed sidecar config + per-entry issues on the handle', async () => {
    // Build the standard complete tree with the file's existing helper, then
    // add a sidecar with one good and one bad paths entry.
    const fa = /* file's helper for a fully-resolved tree */;
    addFile(fa, '.aurora/project.json', JSON.stringify({
      base: 's1-github',
      paths: { 'ghz.act1.fgLayout': 'levels/custom-ghz1.bin', broken: 42 },
    }));
    addFile(fa, 'levels/custom-ghz1.bin', '');
    const handle = await s1Adapter.open(fa);
    expect(handle.sidecar).toBeDefined();
    expect(handle.sidecar!.config.base).toBe('s1-github');
    expect(handle.sidecar!.config.paths).toEqual({ 'ghz.act1.fgLayout': 'levels/custom-ghz1.bin' });
    expect(handle.sidecar!.issues).toEqual([
      { where: 'paths.broken', message: expect.any(String) },
    ]);
  });

  it('a missing sidecar yields an empty sidecar state, not undefined', async () => {
    const fa = /* file's helper for a fully-resolved tree, no sidecar */;
    const handle = await s1Adapter.open(fa);
    expect(handle.sidecar).toEqual({ config: {}, issues: [] });
  });
```

(Adapt the two `/* file's helper */` placeholders to the test file's real helper functions — e.g. if it builds trees via a `fakeTree()`/`addFile()` pair, use those; the assertion bodies stay exactly as written.)

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/core/project/__tests__/s1-adapter.test.ts`
Expected: the two new tests FAIL (`handle.sidecar` is undefined); all pre-existing tests still PASS.

- [ ] **Step 3: Implement**

In `src/core/project/adapter.ts`, add the import at the top:

```typescript
import type { SidecarState } from './mapping';
```

extend `ProjectHandle`:

```typescript
export interface ProjectHandle {
  type: ProjectType;
  capabilities: CapabilityManifest;
  report: ResolutionReport;
  levels: ClassicLevelAccess | null;
  /** Parsed `.aurora/project.json` + per-entry diagnostics (spec §7), for the
   *  Project Setup tab. Absent on adapters that read no sidecar (aeon v1). */
  sidecar?: SidecarState;
}
```

and re-export the types for downstream consumers:

```typescript
export type { SidecarState, ConfigIssue, ProjectConfig } from './mapping';
```

In `src/core/project/s1/index.ts`:

1. Add to the imports: `import { readProjectConfig, type SidecarState } from '../mapping';`
2. Delete the entire `readSidecar` function (and its doc comment, including the "Sibling parser" note — the merge it promised is this change).
3. Replace it with:

```typescript
/**
 * Read `.aurora/project.json` through the shared mapping parser (spec §7).
 * Never fails an open: a missing file is an empty config; malformed content
 * degrades per entry, with the drops reported as issues on the handle.
 */
async function readSidecarState(fa: FileAccess): Promise<SidecarState> {
  try {
    if (!(await fa.exists(SIDECAR))) return readProjectConfig(null);
    return readProjectConfig(await fa.read(SIDECAR));
  } catch {
    return { config: {}, issues: [{ where: '$', message: 'sidecar unreadable — ignoring it' }] };
  }
}
```

4. In `open()`, replace:

```typescript
    const sidecar = await readSidecar(fa);
    const effective = mergeOverrides(sidecar, overrides);
```

with:

```typescript
    const sidecar = await readSidecarState(fa);
    const effective = mergeOverrides({ paths: sidecar.config.paths }, overrides);
```

5. In the returned handle literal, add `sidecar,` after `report,`.

In `src/renderer/state/classicProjectStore.ts`:

1. Add `SidecarState` to the type-import from `'../../core/project/adapter'`.
2. Add to `ClassicProjectState`: `sidecar: SidecarState | null;` (document: `/** Parsed .aurora/project.json + issues, from the opened handle (null when closed/aeon). */`)
3. Add `sidecar: null,` to the `CLOSED` constant.
4. In the `'opened'` branch of `openDirectory`, add `sidecar: h.sidecar ?? null,` to the `set({...})`.

- [ ] **Step 4: Run the full suite**

Run: `npx vitest run` and `npx tsc --noEmit`
Expected: PASS. `mergeOverrides` still typechecks (its first parameter is `ProjectOverrides`; `{ paths: sidecar.config.paths }` matches). If any test constructs a `ProjectHandle` literal, the new field is optional — no fixture edits should be needed.

- [ ] **Step 5: Commit**

```bash
git add src/core/project/adapter.ts src/core/project/s1/index.ts \
        src/renderer/state/classicProjectStore.ts src/core/project/__tests__/s1-adapter.test.ts
git commit -m "feat(project): s1 sidecar reads through mapping parser; handle surfaces config + issues"
```

### Task 5: Project runtime — SaveCoordinator + DocumentHistoryHub get a home

Watch-list #4: the Stage 1 hub/coordinator singletons need an owner. `project-runtime.ts` holds one app-lifetime instance of each, registers the three savers that reproduce `save-routing.ts` semantics (routing itself is deleted in Task 16), and exposes `saveAllDirty()` as the one Ctrl+S entry point. Unlike routing (first match wins), the coordinator saves EVERY dirty surface — that is spec §10 behavior and strictly safer.

**Files:**
- Create: `src/renderer/state/project-runtime.ts`
- Test: `src/renderer/state/__tests__/project-runtime.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// src/renderer/state/__tests__/project-runtime.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  saveCoordinator, documentHistoryHub, ensureSaversRegistered, saveAllDirty,
  registerAeonSaver, resetProjectRuntime,
  __setRuntimeSaversForTest, __resetRuntimeSaversForTest,
} from '../project-runtime';
import { useClassicProjectStore } from '../classicProjectStore';
import { useProjectStore } from '../projectStore';
import { useSpriteStore } from '../spriteStore';

describe('project runtime', () => {
  beforeEach(() => {
    ensureSaversRegistered();
    useClassicProjectStore.getState().reset();
    useProjectStore.getState().reset();
    useSpriteStore.setState({ s1ArtSource: null });
    registerAeonSaver(null);
  });
  afterEach(() => {
    __resetRuntimeSaversForTest();
  });

  it('registers exactly the three savers, idempotently', () => {
    ensureSaversRegistered();
    ensureSaversRegistered();
    // No throw on repeat registration, and all three ids answer via saveAll skip-list.
    return saveAllDirty().then((r) => {
      expect([...r.saved, ...r.skipped, ...r.failed.map((f) => f.id)].sort())
        .toEqual(['aeon-project', 'classic-level', 'sprite-art']);
    });
  });

  it('with nothing open, every saver skips', async () => {
    const r = await saveAllDirty();
    expect(r.saved).toEqual([]);
    expect(r.failed).toEqual([]);
  });

  it('classic open → classic saver fires (mirrors retired save-routing)', async () => {
    const log: string[] = [];
    __setRuntimeSaversForTest({ classic: async () => { log.push('classic'); } });
    useClassicProjectStore.setState({ status: 'open' });
    const r = await saveAllDirty();
    expect(log).toEqual(['classic']);
    expect(r.saved).toEqual(['classic-level']);
  });

  it('sprite-art saver fires whenever s1ArtSource is set, alongside classic', async () => {
    const log: string[] = [];
    __setRuntimeSaversForTest({
      classic: async () => { log.push('classic'); },
      spriteArt: async () => { log.push('sprite'); },
    });
    useClassicProjectStore.setState({ status: 'open' });
    useSpriteStore.setState({ s1ArtSource: {} as never });
    const r = await saveAllDirty();
    // Registration order: sprite-art first (art must never be lost to a level save race).
    expect(log).toEqual(['sprite', 'classic']);
    expect(r.saved).toEqual(['sprite-art', 'classic-level']);
  });

  it('aeon saver fires only when an aeon project is open and classic is NOT', async () => {
    const log: string[] = [];
    registerAeonSaver(async () => { log.push('aeon'); });
    useProjectStore.setState({ project: {} as never });
    await saveAllDirty();
    expect(log).toEqual(['aeon']);

    log.length = 0;
    useClassicProjectStore.setState({ status: 'open' });
    __setRuntimeSaversForTest({ classic: async () => {} });
    await saveAllDirty();
    expect(log).toEqual([]); // classic open → the resident aeon project is stale
  });

  it('a failing saver is reported but does not block the others', async () => {
    __setRuntimeSaversForTest({
      classic: async () => { throw new Error('disk on fire'); },
      spriteArt: async () => {},
    });
    useClassicProjectStore.setState({ status: 'open' });
    useSpriteStore.setState({ s1ArtSource: {} as never });
    const r = await saveAllDirty();
    expect(r.saved).toEqual(['sprite-art']);
    expect(r.failed).toEqual([{ id: 'classic-level', message: 'disk on fire' }]);
  });

  it('resetProjectRuntime clears the history hub', () => {
    documentHistoryHub.historyFor('level:ghz:1');
    resetProjectRuntime();
    expect(documentHistoryHub.has('level:ghz:1')).toBe(false);
  });

  it('coordinator and hub are stable singletons', () => {
    expect(saveCoordinator).toBe(saveCoordinator);
    expect(documentHistoryHub).toBe(documentHistoryHub);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/renderer/state/__tests__/project-runtime.test.ts`
Expected: FAIL — cannot resolve `../project-runtime`.

- [ ] **Step 3: Implement**

```typescript
// src/renderer/state/project-runtime.ts
// Project-scoped runtime singletons (watch-list #4 / spec §10): the ONE
// SaveCoordinator behind Ctrl+S and the ONE DocumentHistoryHub the per-document
// undo rewiring (Stages 3–4) will hang off. The three savers reproduce the
// retired save-routing.ts semantics — fire-when-context-open, not
// fire-when-strictly-dirty — so save behavior cannot regress in this stage:
//   • sprite-art: whenever an S1 object's art is checked out (s1ArtSource set);
//     registered FIRST so pixel edits are never lost behind a level-save error.
//   • classic-level: whenever a classic project is open (its own writer skips
//     clean domains internally).
//   • aeon-project: whenever an aeon project is resident AND no classic project
//     is open — a classic open means projectStore holds a STALE aeon project
//     (see App's routing comment history) and must not be written.
// Honest per-surface dirtiness (for tab dots) lives in dirty-tabs.ts, not here.

import { SaveCoordinator, type SaveAllResult } from '../../core/editing/save-coordinator';
import { DocumentHistoryHub } from '../../core/editing/document-history';
import { useClassicProjectStore } from './classicProjectStore';
import { useProjectStore } from './projectStore';
import { useSpriteStore } from './spriteStore';
import { useToastStore } from './toastStore';
import { saveClassicProject } from './classic-save';
import { saveSpriteArt } from '../components/sprite/export-sprite';

export const saveCoordinator = new SaveCoordinator();
export const documentHistoryHub = new DocumentHistoryHub();

// -- Injectable savers (test seam, mirroring save-routing's convention) ------
type SaveFn = () => Promise<unknown> | unknown;
let spriteArtImpl: SaveFn = saveSpriteArt;
let classicImpl: SaveFn = saveClassicProject;
let aeonImpl: SaveFn | null = null;

export function __setRuntimeSaversForTest(over: { spriteArt?: SaveFn; classic?: SaveFn }): void {
  if (over.spriteArt) spriteArtImpl = over.spriteArt;
  if (over.classic) classicImpl = over.classic;
}
export function __resetRuntimeSaversForTest(): void {
  spriteArtImpl = saveSpriteArt;
  classicImpl = saveClassicProject;
}

/** The aeon save lives in the useProject hook; App registers it on mount. */
export function registerAeonSaver(fn: SaveFn | null): void {
  aeonImpl = fn;
}

let registered = false;

/** Idempotent (App mount, HMR, tests may all call it). */
export function ensureSaversRegistered(): void {
  if (registered) return;
  registered = true;
  saveCoordinator.register({
    id: 'sprite-art',
    isDirty: () => useSpriteStore.getState().s1ArtSource !== null,
    save: async () => { await spriteArtImpl(); },
  });
  saveCoordinator.register({
    id: 'classic-level',
    isDirty: () => useClassicProjectStore.getState().status === 'open',
    save: async () => { await classicImpl(); },
  });
  saveCoordinator.register({
    id: 'aeon-project',
    isDirty: () =>
      useClassicProjectStore.getState().status !== 'open' &&
      useProjectStore.getState().project !== null &&
      aeonImpl !== null,
    save: async () => { if (aeonImpl) await aeonImpl(); },
  });
}

/** Ctrl+S / app-bar Save entry point. Failures surface as toasts. */
export async function saveAllDirty(): Promise<SaveAllResult> {
  const result = await saveCoordinator.saveAll();
  for (const f of result.failed) {
    useToastStore.getState().addToast(`Save failed (${f.id}): ${f.message}`, 'error');
  }
  return result;
}

/** Project switch/close: drop all per-document histories. */
export function resetProjectRuntime(): void {
  documentHistoryHub.clearAll();
}
```

(If `useToastStore.addToast`'s signature differs — check `src/renderer/state/toastStore.ts` — match it exactly.)

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/renderer/state/__tests__/project-runtime.test.ts`
Expected: PASS (8 tests). Note the test uses `useSpriteStore.setState`/`useProjectStore.setState` partial patches — zustand v5 supports this; if `useProjectStore.getState().reset()` complains about missing fields, use the store's real reset action names.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/state/project-runtime.ts src/renderer/state/__tests__/project-runtime.test.ts
git commit -m "feat(shell): project runtime owns SaveCoordinator + DocumentHistoryHub"
```

---

### Task 6: Dirty-dot selector

Pure rule for which tabs show the emerald unsaved dot (spec §3/§10). Dirtiness stays owned by the documents/stores; the tab strip reads it through this one function.

**Files:**
- Create: `src/renderer/shell/dirty-tabs.ts`
- Test: `src/renderer/shell/__tests__/dirty-tabs.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// src/renderer/shell/__tests__/dirty-tabs.test.ts
import { describe, it, expect } from 'vitest';
import { tabHasDirtyDot, type DirtySnapshot } from '../dirty-tabs';

const base: DirtySnapshot = {
  classicOpen: false, classicRef: null, classicDirty: false,
  aeonOpen: false, aeonDirty: false, spriteArtPending: false,
};

describe('tabHasDirtyDot', () => {
  it('home and tool tabs never dot', () => {
    const s = { ...base, classicOpen: true, classicDirty: true, classicRef: { zone: 'ghz', act: 1 } };
    expect(tabHasDirtyDot('home', 'home', s)).toBe(false);
    expect(tabHasDirtyDot('tool:project-setup', 'tool', s)).toBe(false);
  });

  it('classic: only the LOADED act tab dots, and only when dirty', () => {
    const s = { ...base, classicOpen: true, classicDirty: true, classicRef: { zone: 'ghz', act: 1 } };
    expect(tabHasDirtyDot('level:ghz:1', 'level', s)).toBe(true);
    expect(tabHasDirtyDot('level:mz:2', 'level', s)).toBe(false);
    expect(tabHasDirtyDot('level:ghz:1', 'level', { ...s, classicDirty: false })).toBe(false);
  });

  it('classic: pending sprite-art edits dot the loaded act tab too', () => {
    const s = {
      ...base, classicOpen: true, classicRef: { zone: 'ghz', act: 1 },
      spriteArtPending: true,
    };
    expect(tabHasDirtyDot('level:ghz:1', 'level', s)).toBe(true);
  });

  it('aeon: project-wide dirtiness dots every level tab (honest aggregate, spec §10)', () => {
    const s = { ...base, aeonOpen: true, aeonDirty: true };
    expect(tabHasDirtyDot('level:ehz:act1', 'level', s)).toBe(true);
    expect(tabHasDirtyDot('level:cpz:act2', 'level', s)).toBe(true);
    expect(tabHasDirtyDot('level:ehz:act1', 'level', { ...s, aeonDirty: false })).toBe(false);
  });

  it('no project → no dots', () => {
    expect(tabHasDirtyDot('level:ghz:1', 'level', base)).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/renderer/shell/__tests__/dirty-tabs.test.ts`
Expected: FAIL — cannot resolve `../dirty-tabs`.

- [ ] **Step 3: Implement**

```typescript
// src/renderer/shell/dirty-tabs.ts
// Which tabs show the emerald unsaved dot (spec §3). Pure rule over a snapshot
// of store dirtiness — the stores own dirty state; the tab strip only reads.
// Stage 2 granularity matches the stores: classic dirtiness belongs to the ONE
// loaded act (the singleton doc); aeon dirtiness is project-wide, so every aeon
// level tab dots (spec §10: aggregate honestly). Per-document dots arrive with
// the per-document stores in Stages 3–4.

import type { TabKind } from '../../core/shell/session';
import { parseLevelTabId } from './tabs';

export interface DirtySnapshot {
  classicOpen: boolean;
  classicRef: { zone: string; act: number } | null;
  classicDirty: boolean;
  aeonOpen: boolean;
  aeonDirty: boolean;
  /** An S1 object's art is checked out with edits that Ctrl+S would write. */
  spriteArtPending: boolean;
}

export function tabHasDirtyDot(tabId: string, kind: TabKind, s: DirtySnapshot): boolean {
  if (kind !== 'level') return false;
  const ref = parseLevelTabId(tabId);
  if (!ref) return false;
  if (s.classicOpen) {
    const loaded =
      s.classicRef !== null && ref.zone === s.classicRef.zone && ref.act === String(s.classicRef.act);
    return loaded && (s.classicDirty || s.spriteArtPending);
  }
  if (s.aeonOpen) return s.aeonDirty;
  return false;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/renderer/shell/__tests__/dirty-tabs.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/renderer/shell/dirty-tabs.ts src/renderer/shell/__tests__/dirty-tabs.test.ts
git commit -m "feat(shell): pure dirty-dot rule for tabs"
```

---

### Task 7: Confirm store + activation controller

All tab focusing/opening flows through one controller so the classic dirty-switch guard cannot be bypassed. The decision is a pure function; the confirm dialog is a promise-based zustand store plus a thin modal component; the executor is glue.

**Files:**
- Create: `src/renderer/state/confirmStore.ts`
- Create: `src/renderer/shell/ConfirmDialog.tsx`
- Create: `src/renderer/shell/tab-activation.ts`
- Test: `src/renderer/state/__tests__/confirmStore.test.ts`
- Test: `src/renderer/shell/__tests__/tab-activation.test.ts`

- [ ] **Step 1: Write the failing tests**

```typescript
// src/renderer/state/__tests__/confirmStore.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { useConfirmStore } from '../confirmStore';

describe('confirmStore', () => {
  beforeEach(() => useConfirmStore.getState().answer('cancel'));

  it('ask exposes the request and resolves with the answered key', async () => {
    const p = useConfirmStore.getState().ask({
      title: 'Unsaved changes',
      buttons: [{ key: 'save', label: 'Save & switch' }, { key: 'cancel', label: 'Cancel' }],
    });
    expect(useConfirmStore.getState().request?.title).toBe('Unsaved changes');
    useConfirmStore.getState().answer('save');
    await expect(p).resolves.toBe('save');
    expect(useConfirmStore.getState().request).toBeNull();
  });

  it('a second ask cancels the first', async () => {
    const first = useConfirmStore.getState().ask({ title: 'a', buttons: [{ key: 'x', label: 'X' }] });
    const second = useConfirmStore.getState().ask({ title: 'b', buttons: [{ key: 'y', label: 'Y' }] });
    await expect(first).resolves.toBe('cancel');
    useConfirmStore.getState().answer('y');
    await expect(second).resolves.toBe('y');
  });

  it('answer with no pending request is a no-op', () => {
    expect(() => useConfirmStore.getState().answer('whatever')).not.toThrow();
  });
});
```

```typescript
// src/renderer/shell/__tests__/tab-activation.test.ts
import { describe, it, expect } from 'vitest';
import { planLevelActivation } from '../tab-activation';

describe('planLevelActivation', () => {
  it('non-level ids and no-project plans are none', () => {
    expect(planLevelActivation({ tabId: 'home', engine: null, classicLoadedRef: null, classicDirty: false }))
      .toEqual({ kind: 'none' });
    expect(planLevelActivation({ tabId: 'level:ghz:1', engine: null, classicLoadedRef: null, classicDirty: false }))
      .toEqual({ kind: 'none' });
  });

  it('aeon level tabs always switch (all acts resident in memory — no loss possible)', () => {
    expect(planLevelActivation({ tabId: 'level:ehz:act1', engine: 'aeon', classicLoadedRef: null, classicDirty: false }))
      .toEqual({ kind: 'aeon-switch', zone: 'ehz', act: 'act1' });
  });

  it('classic: activating the already-loaded act is none', () => {
    expect(planLevelActivation({
      tabId: 'level:ghz:1', engine: 's1',
      classicLoadedRef: { zone: 'ghz', act: 1 }, classicDirty: true,
    })).toEqual({ kind: 'none' });
  });

  it('classic: switching acts while clean opens directly', () => {
    expect(planLevelActivation({
      tabId: 'level:mz:2', engine: 's1',
      classicLoadedRef: { zone: 'ghz', act: 1 }, classicDirty: false,
    })).toEqual({ kind: 'classic-open', zone: 'mz', act: 2 });
  });

  it('classic: switching acts while dirty requires confirmation (openAct discards edits)', () => {
    expect(planLevelActivation({
      tabId: 'level:mz:2', engine: 's1',
      classicLoadedRef: { zone: 'ghz', act: 1 }, classicDirty: true,
    })).toEqual({ kind: 'classic-confirm', zone: 'mz', act: 2 });
  });

  it('classic: first open (nothing loaded) opens directly even if dirty flag is somehow set', () => {
    expect(planLevelActivation({
      tabId: 'level:ghz:1', engine: 's1', classicLoadedRef: null, classicDirty: true,
    })).toEqual({ kind: 'classic-open', zone: 'ghz', act: 1 });
  });

  it('classic: a non-numeric act id is none (malformed / foreign id)', () => {
    expect(planLevelActivation({
      tabId: 'level:ghz:actX', engine: 's1', classicLoadedRef: null, classicDirty: false,
    })).toEqual({ kind: 'none' });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/renderer/state/__tests__/confirmStore.test.ts src/renderer/shell/__tests__/tab-activation.test.ts`
Expected: FAIL — modules unresolved.

- [ ] **Step 3: Implement confirmStore**

```typescript
// src/renderer/state/confirmStore.ts
// Promise-based confirm dialog state. ask() parks a resolver in the store;
// ConfirmDialog renders the request and calls answer(key). 'cancel' is the
// reserved key returned for Esc/backdrop and for a superseded request, so
// callers can always treat unknown outcomes as cancel.

import { create } from 'zustand';

export interface ConfirmButton {
  key: string;
  label: string;
  /** 'danger' renders warning-toned (discard actions); 'primary' emerald. */
  tone?: 'primary' | 'danger';
}

export interface ConfirmRequest {
  title: string;
  body?: string;
  buttons: ConfirmButton[];
}

interface ConfirmState {
  request: ConfirmRequest | null;
  resolver: ((key: string) => void) | null;
  ask: (request: ConfirmRequest) => Promise<string>;
  answer: (key: string) => void;
}

export const useConfirmStore = create<ConfirmState>((set, get) => ({
  request: null,
  resolver: null,
  ask: (request) => {
    get().resolver?.('cancel'); // supersede any pending request
    return new Promise<string>((resolve) => set({ request, resolver: resolve }));
  },
  answer: (key) => {
    const { resolver } = get();
    if (!resolver) return;
    set({ request: null, resolver: null });
    resolver(key);
  },
}));
```

- [ ] **Step 4: Implement ConfirmDialog**

```tsx
// src/renderer/shell/ConfirmDialog.tsx
import React, { useEffect } from 'react';
import { T } from '../components/ui';
import { useConfirmStore } from '../state/confirmStore';

/** Modal for confirmStore requests. Esc / backdrop click answer 'cancel'. */
export default function ConfirmDialog() {
  const request = useConfirmStore((s) => s.request);
  const answer = useConfirmStore((s) => s.answer);

  useEffect(() => {
    if (!request) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.stopPropagation(); answer('cancel'); }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [request, answer]);

  if (!request) return null;

  return (
    <div style={styles.backdrop} onMouseDown={() => answer('cancel')}>
      <div style={styles.panel} onMouseDown={(e) => e.stopPropagation()} role="alertdialog" aria-label={request.title}>
        <div style={styles.title}>{request.title}</div>
        {request.body && <div style={styles.body}>{request.body}</div>}
        <div style={styles.buttons}>
          {request.buttons.map((b) => (
            <button
              key={b.key}
              onClick={() => answer(b.key)}
              style={{
                ...styles.button,
                ...(b.tone === 'primary' ? styles.primary : {}),
                ...(b.tone === 'danger' ? styles.danger : {}),
              }}
            >
              {b.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  backdrop: {
    position: 'fixed', inset: 0, background: 'rgba(10,12,18,0.6)', backdropFilter: 'blur(2px)',
    display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1100,
  },
  panel: {
    width: 420, maxWidth: '90vw', background: T.surface, border: `1px solid ${T.borderStrong}`,
    borderRadius: T.rXl, boxShadow: '0 16px 48px rgba(0,0,0,0.5)', padding: 16,
  },
  title: { fontSize: 13, fontWeight: 600, color: T.textHi },
  body: { fontSize: 12, color: T.textBase, marginTop: 8, whiteSpace: 'pre-line' },
  buttons: { display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 16 },
  button: {
    padding: '4px 12px', fontSize: 12, background: T.raised, color: T.textBase,
    border: `1px solid ${T.border}`, borderRadius: T.rMd, cursor: 'pointer',
  },
  primary: { background: T.accent, borderColor: T.accent, color: T.onAccent, fontWeight: 600 },
  danger: { color: T.warning, borderColor: T.warning },
};
```

- [ ] **Step 5: Implement tab-activation**

```typescript
// src/renderer/shell/tab-activation.ts
// EVERY tab open/focus flows through requestOpenTab/requestFocusTabId so the
// classic dirty-switch guard cannot be bypassed: classicLevelStore.openAct
// resets doc + dirty + undo history, so switching away from a dirty classic act
// must confirm first (Save & switch / Discard / Cancel). Aeon act switches are
// pointer moves over the resident S4Project — always safe. planLevelActivation
// is the pure, tested decision; the exported request* functions are glue.

import { useSessionStore } from '../state/sessionStore';
import { useClassicProjectStore } from '../state/classicProjectStore';
import { useClassicLevelStore } from '../state/classicLevelStore';
import { useProjectStore } from '../state/projectStore';
import { useConfirmStore } from '../state/confirmStore';
import { useToastStore } from '../state/toastStore';
import { saveClassicProject, type SaveClassicProjectResult } from '../state/classic-save';
import { parseLevelTabId } from './tabs';
import type { TabDescriptor } from '../../core/shell/session';

// The save call is behind a seam (mirrors save-routing.ts's convention) so the
// save-failure path is unit-testable without driving a real guarded write.
type Saver = () => Promise<SaveClassicProjectResult>;
let saveImpl: Saver = saveClassicProject;

/** Substitute the classic save call (tests only). */
export function __setActivationSaveForTest(fn: Saver): void { saveImpl = fn; }
/** Restore the real save call (tests only). */
export function __resetActivationSaveForTest(): void { saveImpl = saveClassicProject; }

// saveClassicProject NEVER rejects — every failure mode (conflict/partial/error)
// is encoded in the returned variant (see classic-save.ts). Only 'saved' and
// 'nothing' (nothing was dirty) mean it's safe to proceed to openAct, which
// resets doc+dirty+undo — a failed save must NOT fall through to that, or the
// edits the user clicked "Save & switch" to protect are destroyed.
function isSaveSuccess(r: SaveClassicProjectResult): boolean {
  return r.kind === 'saved' || r.kind === 'nothing';
}

// One activation flow completes at a time: a newer call bumps this counter, so
// an older flow that was awaiting a confirm answer or a save aborts instead of
// racing its openAct in after the user's newer choice already landed.
let activationGen = 0;

export type ActivationPlan =
  | { kind: 'none' }
  | { kind: 'aeon-switch'; zone: string; act: string }
  | { kind: 'classic-open'; zone: string; act: number }
  | { kind: 'classic-confirm'; zone: string; act: number };

export function planLevelActivation(input: {
  tabId: string;
  engine: 's1' | 'aeon' | null;
  classicLoadedRef: { zone: string; act: number } | null;
  classicDirty: boolean;
}): ActivationPlan {
  const ref = parseLevelTabId(input.tabId);
  if (!ref || input.engine === null) return { kind: 'none' };
  if (input.engine === 'aeon') return { kind: 'aeon-switch', zone: ref.zone, act: ref.act };
  const act = Number(ref.act);
  if (!Number.isInteger(act)) return { kind: 'none' };
  const loaded = input.classicLoadedRef;
  if (loaded && loaded.zone === ref.zone && loaded.act === act) return { kind: 'none' };
  if (loaded && input.classicDirty) return { kind: 'classic-confirm', zone: ref.zone, act };
  return { kind: 'classic-open', zone: ref.zone, act };
}

function currentEngine(): 's1' | 'aeon' | null {
  if (useClassicProjectStore.getState().status === 'open') return 's1';
  if (useProjectStore.getState().project !== null) return 'aeon';
  return null;
}

function classicOpenAct(zone: string, act: number): boolean {
  const target = useClassicProjectStore.getState().zoneTree
    .find((r) => r.zone === zone && r.act === act);
  if (!target) {
    useToastStore.getState().addToast(`Level not found in this project (${zone} act ${act})`, 'error');
    return false;
  }
  if (!target.available) {
    useToastStore.getState().addToast(
      `${target.label} is unavailable: ${target.reason ?? 'missing files'}`, 'error');
    return false;
  }
  void useClassicLevelStore.getState().openAct(target);
  return true;
}

/**
 * Point the singleton editor at a level tab's target. Resolves true when the
 * tab may take focus (false = user cancelled / target unavailable).
 */
export async function activateLevelTarget(tabId: string): Promise<boolean> {
  const myGen = ++activationGen;
  const classic = useClassicLevelStore.getState();
  const plan = planLevelActivation({
    tabId,
    engine: currentEngine(),
    classicLoadedRef: classic.ref ? { zone: classic.ref.zone, act: classic.ref.act } : null,
    classicDirty: Object.values(classic.dirty).some(Boolean),
  });
  switch (plan.kind) {
    case 'none':
      return true;
    case 'aeon-switch': {
      useProjectStore.getState().setCurrentAct(plan.zone, plan.act);
      return true;
    }
    case 'classic-open':
      return classicOpenAct(plan.zone, plan.act);
    case 'classic-confirm': {
      const loadedLabel = classic.ref?.label ?? 'the current act';
      const answer = await useConfirmStore.getState().ask({
        title: `Unsaved changes in ${loadedLabel}`,
        body: 'Switching acts reloads from disk and discards unsaved edits and undo history.',
        buttons: [
          { key: 'save', label: 'Save & switch', tone: 'primary' },
          { key: 'discard', label: 'Discard & switch', tone: 'danger' },
          { key: 'cancel', label: 'Cancel' },
        ],
      });
      if (myGen !== activationGen) return false; // superseded while the dialog was open
      if (answer === 'save') {
        const result = await saveImpl();
        if (myGen !== activationGen) return false; // superseded while the save was in flight
        // The save layer already toasted the failure — don't duplicate it here,
        // just stop before openAct discards the edits it was trying to protect.
        if (!isSaveSuccess(result)) return false;
      } else if (answer !== 'discard') {
        return false; // 'cancel' (or any unrecognized key, treated as cancel)
      }
      return classicOpenAct(plan.zone, plan.act);
    }
  }
}

/** Open (or focus) a tab, running the level-activation guard first. */
export async function requestOpenTab(tab: TabDescriptor): Promise<void> {
  if (tab.kind === 'level' && !(await activateLevelTarget(tab.id))) return;
  useSessionStore.getState().open(tab);
}

/** Focus an already-open tab by id (tab strip click, ⌘K "go to tab"). */
export async function requestFocusTabId(id: string): Promise<void> {
  const tab = useSessionStore.getState().tabs.find((t) => t.id === id);
  if (tab) await requestOpenTab(tab);
}

/** Ctrl+1..9 — 1-based over the whole strip (1 = Home). */
export async function requestFocusIndex(oneBased: number): Promise<void> {
  const tab = useSessionStore.getState().tabs[oneBased - 1];
  if (tab) await requestOpenTab(tab);
}
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `npx vitest run src/renderer/state/__tests__/confirmStore.test.ts src/renderer/shell/__tests__/tab-activation.test.ts`
Expected: PASS (3 + 7 tests). Also `npx tsc --noEmit` clean.

- [ ] **Step 7: Commit**

```bash
git add src/renderer/state/confirmStore.ts src/renderer/shell/ConfirmDialog.tsx \
        src/renderer/shell/tab-activation.ts \
        src/renderer/state/__tests__/confirmStore.test.ts src/renderer/shell/__tests__/tab-activation.test.ts
git commit -m "feat(shell): guarded tab activation with confirm dialog"
```

---

### Task 8: Session storage keyed by project path

Spec §10: open tabs + active tab persist per project and restore on reopen. Pure load/save over an injectable `StorageLike` (node tests have no localStorage), composing the Stage 1 `restoreSession` with Task 1's `pruneSession`.

**Files:**
- Create: `src/renderer/shell/session-storage.ts`
- Test: `src/renderer/shell/__tests__/session-storage.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// src/renderer/shell/__tests__/session-storage.test.ts
import { describe, it, expect } from 'vitest';
import { sessionKeyFor, loadStoredSession, saveStoredSession, defaultProjectSession, type StorageLike } from '../session-storage';
import { initialSession, openTab, type SessionState } from '../../../core/shell/session';

function memStorage(): StorageLike & { map: Map<string, string> } {
  const map = new Map<string, string>();
  return { map, getItem: (k) => map.get(k) ?? null, setItem: (k, v) => { map.set(k, v); } };
}

describe('session storage', () => {
  it('keys by project path, with a no-project bucket', () => {
    expect(sessionKeyFor('/home/u/s1disasm')).toBe('aurora.session.v1:/home/u/s1disasm');
    expect(sessionKeyFor(null)).toBe('aurora.session.v1:no-project');
  });

  it('round-trips a session under its project key', () => {
    const storage = memStorage();
    const s = openTab(initialSession(), { id: 'level:ghz:1', kind: 'level', title: 'GHZ Act 1' });
    saveStoredSession(storage, '/p', s);
    expect(loadStoredSession(storage, '/p', () => true)).toEqual(s);
  });

  it('returns null when nothing is stored (caller builds the default)', () => {
    expect(loadStoredSession(memStorage(), '/p', () => true)).toBeNull();
  });

  it('prunes restored tabs through the validity predicate', () => {
    const storage = memStorage();
    let s = openTab(initialSession(), { id: 'level:ghz:1', kind: 'level', title: 'GHZ Act 1' });
    s = openTab(s, { id: 'level:gone:9', kind: 'level', title: 'Deleted' });
    saveStoredSession(storage, '/p', s);
    const restored = loadStoredSession(storage, '/p', (t) => t.id !== 'level:gone:9')!;
    expect(restored.tabs.map((t) => t.id)).toEqual(['home', 'level:ghz:1']);
    expect(restored.activeId).toBe('home');
  });

  it('restores garbage to the initial session (defensive restore underneath)', () => {
    const storage = memStorage();
    storage.map.set(sessionKeyFor('/p'), 'not json');
    expect(loadStoredSession(storage, '/p', () => true)).toEqual(initialSession());
  });

  it('a throwing storage never breaks save (quota, privacy mode)', () => {
    const bad: StorageLike = { getItem: () => null, setItem: () => { throw new Error('quota'); } };
    expect(() => saveStoredSession(bad, '/p', initialSession())).not.toThrow();
  });

  it('defaultProjectSession opens and focuses the first level tab when given one', () => {
    const tab = { id: 'level:ghz:1', kind: 'level' as const, title: 'GHZ Act 1' };
    const s: SessionState = defaultProjectSession(tab);
    expect(s.tabs.map((t) => t.id)).toEqual(['home', 'level:ghz:1']);
    expect(s.activeId).toBe('level:ghz:1');
    expect(defaultProjectSession(null)).toEqual(initialSession());
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/renderer/shell/__tests__/session-storage.test.ts`
Expected: FAIL — cannot resolve `../session-storage`.

- [ ] **Step 3: Implement**

```typescript
// src/renderer/shell/session-storage.ts
// Session persistence keyed by project path (spec §10). Storage is injected
// (localStorage in the app; a Map in tests — the vitest env has no DOM).
// The stored payload format is owned by core/shell/session-persistence; this
// module owns only WHERE it lives and the restore-time pruning against the
// currently-open project. Key carries v1 so a future per-tab-state format
// (Stage 3: facet + viewport) can re-key without misparsing old payloads.

import {
  initialSession, openTab, pruneSession,
  type SessionState, type TabDescriptor,
} from '../../core/shell/session';
import { serializeSession, restoreSession } from '../../core/shell/session-persistence';

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export function sessionKeyFor(projectKey: string | null): string {
  return `aurora.session.v1:${projectKey ?? 'no-project'}`;
}

/** null = nothing stored for this project (caller builds the default). */
export function loadStoredSession(
  storage: StorageLike,
  projectKey: string | null,
  isValid: (tab: TabDescriptor) => boolean,
): SessionState | null {
  let raw: string | null;
  try {
    raw = storage.getItem(sessionKeyFor(projectKey));
  } catch {
    return null;
  }
  if (raw === null) return null;
  return pruneSession(restoreSession(raw), isValid);
}

export function saveStoredSession(
  storage: StorageLike,
  projectKey: string | null,
  state: SessionState,
): void {
  try {
    storage.setItem(sessionKeyFor(projectKey), serializeSession(state));
  } catch {
    // Storage unavailable (quota/privacy) — session just won't restore.
  }
}

/** First open of a project with no stored session: Home + its first level, focused. */
export function defaultProjectSession(firstLevel: TabDescriptor | null): SessionState {
  const s = initialSession();
  return firstLevel ? openTab(s, firstLevel) : s;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/renderer/shell/__tests__/session-storage.test.ts`
Expected: PASS (7 tests).

- [ ] **Step 5: Commit**

```bash
git add src/renderer/shell/session-storage.ts src/renderer/shell/__tests__/session-storage.test.ts
git commit -m "feat(shell): session storage keyed by project path"
```

### Task 9: Explorer model + filter (core)

The explorer tree's shape and its filter rule are pure core (spec §3: filter box narrows the whole tree — '"buzz" → one row').

**Files:**
- Create: `src/core/shell/explorer.ts`
- Test: `src/core/shell/__tests__/explorer.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// src/core/shell/__tests__/explorer.test.ts
import { describe, it, expect } from 'vitest';
import { filterExplorer, type ExplorerGroupModel } from '../explorer';

const groups: ExplorerGroupModel[] = [
  {
    id: 'levels', label: 'Levels',
    items: [
      { id: 'level:ghz:1', label: 'Green Hill Act 1' },
      { id: 'level:lz:2', label: 'Labyrinth Act 2' },
    ],
  },
  {
    id: 'objects', label: 'Object Library',
    items: [
      { id: 'obj:75', label: 'Buzz Bomber', hint: '$4B' },
      { id: 'obj:68', label: 'Chopper', hint: '$44' },
    ],
  },
];

describe('filterExplorer', () => {
  it('empty / whitespace query returns groups untouched', () => {
    expect(filterExplorer(groups, '')).toBe(groups);
    expect(filterExplorer(groups, '   ')).toBe(groups);
  });

  it('narrows to matching rows, case-insensitive, dropping empty groups', () => {
    const out = filterExplorer(groups, 'buzz');
    expect(out).toHaveLength(1);
    expect(out[0].id).toBe('objects');
    expect(out[0].items.map((i) => i.label)).toEqual(['Buzz Bomber']);
  });

  it('matches on hint too (hex ids)', () => {
    const out = filterExplorer(groups, '$44');
    expect(out[0].items.map((i) => i.label)).toEqual(['Chopper']);
  });

  it('keeps multiple groups when both match', () => {
    const out = filterExplorer(groups, 'b');       // laByrinth, Buzz BomBer …
    expect(out.map((g) => g.id)).toEqual(['levels', 'objects']);
  });

  it('no matches → empty list', () => {
    expect(filterExplorer(groups, 'zzz')).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/core/shell/__tests__/explorer.test.ts`
Expected: FAIL — cannot resolve `../explorer`.

- [ ] **Step 3: Implement**

```typescript
// src/core/shell/explorer.ts
// Explorer tree model + filter rule (spec §3). Pure data — what the groups
// contain and how a query narrows them. The renderer builds group models from
// project state (renderer/shell/explorer-data.ts) and maps item ids to open
// actions; nothing here knows about stores, engines, or React.

export interface ExplorerItemModel {
  /** Routable id — the renderer switches on its prefix ('level:', 'obj:', 'tool:', 'recent:'). */
  id: string;
  label: string;
  /** Secondary text (hex id, path) — rendered monospace, also searchable. */
  hint?: string;
  disabled?: boolean;
  /** Tooltip when disabled (e.g. an act's missing-files reason). */
  reason?: string;
}

export interface ExplorerGroupModel {
  id: string;
  label: string;
  items: ExplorerItemModel[];
}

/** Case-insensitive substring over label + hint; empty groups drop out.
 *  An empty/whitespace query returns the input array identity (no re-render churn). */
export function filterExplorer(groups: ExplorerGroupModel[], query: string): ExplorerGroupModel[] {
  const q = query.trim().toLowerCase();
  if (!q) return groups;
  const out: ExplorerGroupModel[] = [];
  for (const g of groups) {
    const items = g.items.filter(
      (i) => i.label.toLowerCase().includes(q) || i.hint?.toLowerCase().includes(q),
    );
    if (items.length > 0) out.push({ ...g, items });
  }
  return out;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/core/shell/__tests__/explorer.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/core/shell/explorer.ts src/core/shell/__tests__/explorer.test.ts
git commit -m "feat(shell): explorer tree model + filter rule"
```

---

### Task 10: Explorer data builders

Pure builders turning project snapshots into `ExplorerGroupModel[]` — one per shell state (classic / aeon / no project). Spec §3 groups come from the profile catalog; Stage 2 renders only groups with real data sources (Levels, Object Library [classic], Tools; Recents when no project). No dead chrome.

**Files:**
- Create: `src/renderer/shell/explorer-data.ts`
- Test: `src/renderer/shell/__tests__/explorer-data.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// src/renderer/shell/__tests__/explorer-data.test.ts
import { describe, it, expect } from 'vitest';
import { classicExplorerGroups, aeonExplorerGroups, noProjectExplorerGroups } from '../explorer-data';

describe('classicExplorerGroups', () => {
  const zoneTree = [
    { zone: 'ghz', act: 1, label: 'Green Hill Act 1', available: true },
    { zone: 'lz', act: 2, label: 'Labyrinth Act 2', available: false, reason: 'missing 2 required file(s): x, y' },
  ];
  const objects = [
    { id: 0x4b, name: 'Buzz Bomber', hex: '$4B', linked: true },
    { id: 0x40, name: 'Moto Bug', hex: '$40', linked: false },
  ];

  it('builds Levels / Object Library / Tools', () => {
    const groups = classicExplorerGroups(zoneTree, objects, true);
    expect(groups.map((g) => g.id)).toEqual(['levels', 'objects', 'tools']);
  });

  it('level items carry tab ids; unavailable acts disable with the reason', () => {
    const levels = classicExplorerGroups(zoneTree, objects, true)[0];
    expect(levels.items[0]).toEqual({ id: 'level:ghz:1', label: 'Green Hill Act 1' });
    expect(levels.items[1]).toMatchObject({
      id: 'level:lz:2', disabled: true, reason: expect.stringContaining('missing'),
    });
  });

  it('object library lists only art-linked objects, hint = hex id', () => {
    const objectsGroup = classicExplorerGroups(zoneTree, objects, true)[1];
    expect(objectsGroup.items).toEqual([
      { id: 'obj:75', label: 'Buzz Bomber', hint: '$4B' },
    ]);
  });

  it('object rows disable with a reason until a level doc is loaded (art edit needs its palette)', () => {
    const objectsGroup = classicExplorerGroups(zoneTree, objects, false)[1];
    expect(objectsGroup.items[0]).toMatchObject({ disabled: true, reason: expect.any(String) });
  });

  it('tools group contains Project Setup', () => {
    const tools = classicExplorerGroups(zoneTree, objects, true)[2];
    expect(tools.items).toEqual([{ id: 'tool:project-setup', label: 'Project Setup' }]);
  });
});

describe('aeonExplorerGroups', () => {
  it('builds Levels (zone-name · act) and Tools', () => {
    const groups = aeonExplorerGroups([
      { id: 'ehz', name: 'Emerald Hill', acts: [{ id: 'act1' }, { id: 'act2' }] },
    ]);
    expect(groups.map((g) => g.id)).toEqual(['levels', 'tools']);
    expect(groups[0].items).toEqual([
      { id: 'level:ehz:act1', label: 'Emerald Hill · act1' },
      { id: 'level:ehz:act2', label: 'Emerald Hill · act2' },
    ]);
  });
});

describe('noProjectExplorerGroups', () => {
  it('builds a Recents group from recent projects, hint = path', () => {
    const groups = noProjectExplorerGroups([
      { path: '/p/s1disasm', name: 'Sonic 1 Disassembly (GitHub)', lastOpened: 1 },
    ]);
    expect(groups).toEqual([
      {
        id: 'recents', label: 'Recent Projects',
        items: [{ id: 'recent:/p/s1disasm', label: 'Sonic 1 Disassembly (GitHub)', hint: '/p/s1disasm' }],
      },
    ]);
  });

  it('no recents → no groups (the empty state lives in the component)', () => {
    expect(noProjectExplorerGroups([])).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/renderer/shell/__tests__/explorer-data.test.ts`
Expected: FAIL — cannot resolve `../explorer-data`.

- [ ] **Step 3: Implement**

```typescript
// src/renderer/shell/explorer-data.ts
// Builders: project snapshots → ExplorerGroupModel[]. Pure functions over
// plain inputs so the group shapes are unit-testable; the Explorer component
// supplies store data and routes item-id prefixes to actions. Stage 2 renders
// only groups with live data sources (spec §3, no dead chrome): Level Art /
// Palettes / UI & Screens arrive with Stages 3–4.

import type { ZoneActRef } from '../../core/project/adapter';
import type { RecentProject } from '../../shared/ipc-types';
import type { ExplorerGroupModel } from '../../core/shell/explorer';
import { PROJECT_SETUP_TAB } from './tabs';

export interface ClassicObjectRow {
  id: number;
  name: string;
  hex: string;
  /** Has resolvable sprite art (only linked objects are listed — Stage 2's
   *  library is the art-editable catalog; the full definition view is Stage 4). */
  linked: boolean;
}

const TOOLS_GROUP: ExplorerGroupModel = {
  id: 'tools',
  label: 'Tools',
  items: [{ id: PROJECT_SETUP_TAB.id, label: PROJECT_SETUP_TAB.title }],
};

export function classicExplorerGroups(
  zoneTree: ZoneActRef[],
  objects: ClassicObjectRow[],
  levelDocReady: boolean,
): ExplorerGroupModel[] {
  return [
    {
      id: 'levels',
      label: 'Levels',
      items: zoneTree.map((r) =>
        r.available
          ? { id: `level:${r.zone}:${r.act}`, label: r.label }
          : { id: `level:${r.zone}:${r.act}`, label: r.label, disabled: true, reason: r.reason ?? 'unavailable' },
      ),
    },
    {
      id: 'objects',
      label: 'Object Library',
      items: objects
        .filter((o) => o.linked)
        .map((o) =>
          levelDocReady
            ? { id: `obj:${o.id}`, label: o.name, hint: o.hex }
            : {
                id: `obj:${o.id}`, label: o.name, hint: o.hex,
                disabled: true, reason: 'Open a level first (art preview needs its palette)',
              },
        ),
    },
    TOOLS_GROUP,
  ];
}

export function aeonExplorerGroups(
  zones: { id: string; name: string; acts: { id: string }[] }[],
): ExplorerGroupModel[] {
  return [
    {
      id: 'levels',
      label: 'Levels',
      items: zones.flatMap((z) =>
        z.acts.map((a) => ({ id: `level:${z.id}:${a.id}`, label: `${z.name} · ${a.id}` })),
      ),
    },
    TOOLS_GROUP,
  ];
}

export function noProjectExplorerGroups(recents: RecentProject[]): ExplorerGroupModel[] {
  if (recents.length === 0) return [];
  return [
    {
      id: 'recents',
      label: 'Recent Projects',
      items: recents.map((r) => ({ id: `recent:${r.path}`, label: r.name, hint: r.path })),
    },
  ];
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/renderer/shell/__tests__/explorer-data.test.ts`
Expected: PASS (8 tests).

- [ ] **Step 5: Commit**

```bash
git add src/renderer/shell/explorer-data.ts src/renderer/shell/__tests__/explorer-data.test.ts
git commit -m "feat(shell): explorer group builders for classic/aeon/no-project"
```

---

### Task 11: ⌘K command builder

Spec §3: the palette searches everything — commands, open tabs, levels, objects, tools. One pure builder produces the `Command[]` the existing `CommandPalette` component already renders; the shell wires actions in.

**Files:**
- Create: `src/renderer/shell/commands.ts`
- Test: `src/renderer/shell/__tests__/commands.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// src/renderer/shell/__tests__/commands.test.ts
import { describe, it, expect, vi } from 'vitest';
import { buildCommands, type CommandSnapshot, type CommandActions } from '../commands';

function actions(): CommandActions {
  return {
    openProjectDialog: vi.fn(), saveAll: vi.fn(), toggleExplorer: vi.fn(),
    openTab: vi.fn(), editObjectArt: vi.fn(), openRecent: vi.fn(),
  };
}

const emptySnapshot: CommandSnapshot = {
  tabs: [{ id: 'home', kind: 'home', title: 'Home' }],
  activeId: 'home',
  engine: null,
  levelTabs: [],
  objects: [],
  recents: [],
};

describe('buildCommands', () => {
  it('always offers the global commands', () => {
    const cmds = buildCommands(emptySnapshot, actions());
    const ids = cmds.map((c) => c.id);
    expect(ids).toContain('open-project');
    expect(ids).toContain('save-all');
    expect(ids).toContain('toggle-explorer');
    expect(ids).toContain('open-setup');
  });

  it('offers "Go to tab" for every open non-active tab', () => {
    const a = actions();
    const cmds = buildCommands({
      ...emptySnapshot,
      tabs: [
        { id: 'home', kind: 'home', title: 'Home' },
        { id: 'level:ghz:1', kind: 'level', title: 'GHZ Act 1' },
        { id: 'tool:project-setup', kind: 'tool', title: 'Project Setup' },
      ],
      activeId: 'level:ghz:1',
    }, a);
    const goto = cmds.filter((c) => c.id.startsWith('goto:'));
    expect(goto.map((c) => c.label)).toEqual(['Go to tab: Home', 'Go to tab: Project Setup']);
    goto[0].run();
    expect(a.openTab).toHaveBeenCalledWith({ id: 'home', kind: 'home', title: 'Home' });
  });

  it('offers "Open level" for project levels not already open as tabs', () => {
    const a = actions();
    const cmds = buildCommands({
      ...emptySnapshot,
      engine: 's1',
      tabs: [
        { id: 'home', kind: 'home', title: 'Home' },
        { id: 'level:ghz:1', kind: 'level', title: 'GHZ Act 1' },
      ],
      levelTabs: [
        { id: 'level:ghz:1', kind: 'level', title: 'GHZ Act 1' },
        { id: 'level:mz:1', kind: 'level', title: 'Marble Act 1' },
      ],
    }, a);
    const open = cmds.filter((c) => c.id.startsWith('open-level:'));
    expect(open.map((c) => c.label)).toEqual(['Open level: Marble Act 1']);
    open[0].run();
    expect(a.openTab).toHaveBeenCalledWith({ id: 'level:mz:1', kind: 'level', title: 'Marble Act 1' });
  });

  it('offers "Edit art" per classic object and routes the numeric id', () => {
    const a = actions();
    const cmds = buildCommands({
      ...emptySnapshot,
      engine: 's1',
      objects: [{ id: 0x4b, name: 'Buzz Bomber', hex: '$4B' }],
    }, a);
    const edit = cmds.find((c) => c.id === 'edit-art:75')!;
    expect(edit.label).toBe('Edit art: Buzz Bomber');
    expect(edit.hint).toBe('$4B');
    edit.run();
    expect(a.editObjectArt).toHaveBeenCalledWith(0x4b);
  });

  it('offers recents only when no project is open', () => {
    const withRecents = {
      ...emptySnapshot,
      recents: [{ path: '/p', name: 'S1', lastOpened: 1 }],
    };
    expect(buildCommands(withRecents, actions()).some((c) => c.id === 'recent:/p')).toBe(true);
    expect(buildCommands({ ...withRecents, engine: 's1' as const }, actions())
      .some((c) => c.id === 'recent:/p')).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/renderer/shell/__tests__/commands.test.ts`
Expected: FAIL — cannot resolve `../commands`.

- [ ] **Step 3: Implement**

```typescript
// src/renderer/shell/commands.ts
// ⌘K content (spec §3: search everything — commands, tabs, levels, objects,
// tools). Pure builder: snapshot + injected actions → the Command[] the
// existing CommandPalette renders. Ordering: global commands, then go-to-tab,
// then open-level, then edit-art, then recents — cheapest wayfinding first.

import type { Command } from '../components/CommandPalette';
import type { TabDescriptor } from '../../core/shell/session';
import type { RecentProject } from '../../shared/ipc-types';
import { PROJECT_SETUP_TAB } from './tabs';

export interface CommandSnapshot {
  tabs: TabDescriptor[];
  activeId: string;
  engine: 's1' | 'aeon' | null;
  /** Every openable level in the project, as ready-to-open tab descriptors. */
  levelTabs: TabDescriptor[];
  /** Classic art-linked objects (empty for aeon / no project / doc not ready). */
  objects: { id: number; name: string; hex: string }[];
  /** Recent projects (only offered when no project is open). */
  recents: RecentProject[];
}

export interface CommandActions {
  openProjectDialog: () => void;
  saveAll: () => void;
  toggleExplorer: () => void;
  openTab: (tab: TabDescriptor) => void;
  editObjectArt: (id: number) => void;
  openRecent: (path: string) => void;
}

export function buildCommands(s: CommandSnapshot, a: CommandActions): Command[] {
  const cmds: Command[] = [
    { id: 'open-project', label: 'Open Project…', hint: 'project', run: a.openProjectDialog },
    { id: 'save-all', label: 'Save All', hint: 'Ctrl+S', run: a.saveAll },
    { id: 'toggle-explorer', label: 'Toggle Explorer', hint: 'Ctrl+B', run: a.toggleExplorer },
    { id: 'open-setup', label: 'Project Setup', hint: 'tool', run: () => a.openTab(PROJECT_SETUP_TAB) },
  ];

  for (const tab of s.tabs) {
    if (tab.id === s.activeId) continue;
    cmds.push({ id: `goto:${tab.id}`, label: `Go to tab: ${tab.title}`, hint: 'tab', run: () => a.openTab(tab) });
  }

  const openIds = new Set(s.tabs.map((t) => t.id));
  for (const tab of s.levelTabs) {
    if (openIds.has(tab.id)) continue;
    cmds.push({ id: `open-level:${tab.id}`, label: `Open level: ${tab.title}`, hint: 'level', run: () => a.openTab(tab) });
  }

  for (const o of s.objects) {
    cmds.push({ id: `edit-art:${o.id}`, label: `Edit art: ${o.name}`, hint: o.hex, run: () => a.editObjectArt(o.id) });
  }

  if (s.engine === null) {
    for (const r of s.recents) {
      cmds.push({ id: `recent:${r.path}`, label: `Open recent: ${r.name}`, hint: r.path, run: () => a.openRecent(r.path) });
    }
  }

  return cmds;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/renderer/shell/__tests__/commands.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/renderer/shell/commands.ts src/renderer/shell/__tests__/commands.test.ts
git commit -m "feat(shell): command palette content builder"
```

---

### Task 12: Project Setup model

Pure derivation for the Setup tab (spec §7: every asset class as a row — path, status light, live re-validation; the Resolution Report promoted from readout to editor). Rows come from the ResolutionReport joined with the sidecar's `paths` overrides; edits produce a new `ProjectConfig` ready to serialize.

**Files:**
- Create: `src/renderer/components/setup/setup-model.ts`
- Test: `src/renderer/components/setup/__tests__/setup-model.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// src/renderer/components/setup/__tests__/setup-model.test.ts
import { describe, it, expect } from 'vitest';
import { buildSetupRows, applyPathEdits } from '../setup-model';
import { buildReport } from '../../../../core/project/report';
import type { ProjectConfig } from '../../../../core/project/mapping';

const report = buildReport([
  { key: 'ghz.act1.fgLayout', path: 'levels/ghz1.bin', status: 'resolved' },
  { key: 'ghz.act1.blocks', path: 'map16/ghz-custom.bin', status: 'resolved', detail: 'override' },
  { key: 'lz.act2.chunks', path: 'map256/lz.bin', status: 'missing' },
  { key: 'collision.normal', path: 'collide/norm.bin', status: 'resolved' },
]);

describe('buildSetupRows', () => {
  it('groups rows by zone (globals last) with resolved counts', () => {
    const { groups } = buildSetupRows(report, {}, ['ghz', 'lz']);
    expect(groups.map((g) => g.id)).toEqual(['ghz', 'lz', 'global']);
    expect(groups[0].resolved).toBe(2);
    expect(groups[0].total).toBe(2);
    expect(groups[1].resolved).toBe(0);
  });

  it('rows carry key/path/status/detail and the active override (null when stock)', () => {
    const config: ProjectConfig = { paths: { 'ghz.act1.blocks': 'map16/ghz-custom.bin' } };
    const { groups } = buildSetupRows(report, config, ['ghz', 'lz']);
    const rows = groups[0].rows;
    expect(rows[0]).toEqual({
      key: 'ghz.act1.fgLayout', path: 'levels/ghz1.bin', status: 'resolved', override: null,
    });
    expect(rows[1]).toEqual({
      key: 'ghz.act1.blocks', path: 'map16/ghz-custom.bin', status: 'resolved',
      detail: 'override', override: 'map16/ghz-custom.bin',
    });
  });

  it('reports sidecar overrides that match no profile entry (typo detection)', () => {
    const config: ProjectConfig = { paths: { 'ghz.act1.blcoks': 'oops.bin' } };
    const { unknownOverrides } = buildSetupRows(report, config, ['ghz', 'lz']);
    expect(unknownOverrides).toEqual([{ key: 'ghz.act1.blcoks', path: 'oops.bin' }]);
  });
});

describe('applyPathEdits', () => {
  it('sets, replaces, and clears overrides; empty string clears too', () => {
    const config: ProjectConfig = { base: 's1-github', paths: { a: '1', b: '2' } };
    const next = applyPathEdits(config, { a: 'new', b: null, c: '3', d: '' });
    expect(next.paths).toEqual({ a: 'new', c: '3' });
    expect(next.base).toBe('s1-github');
    expect(config.paths).toEqual({ a: '1', b: '2' }); // input untouched
  });

  it('drops the paths channel entirely when the last override clears', () => {
    const next = applyPathEdits({ paths: { a: '1' } }, { a: null });
    expect('paths' in next).toBe(false);
  });

  it('preserves unknown fields and the assets channel untouched', () => {
    const config = { assets: { x: { path: 'p' } }, future: 1 } as ProjectConfig;
    const next = applyPathEdits(config, { k: 'v' });
    expect(next.assets).toEqual({ x: { path: 'p' } });
    expect((next as Record<string, unknown>).future).toBe(1);
    expect(next.paths).toEqual({ k: 'v' });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/renderer/components/setup/__tests__/setup-model.test.ts`
Expected: FAIL — cannot resolve `../setup-model`.

- [ ] **Step 3: Implement**

```typescript
// src/renderer/components/setup/setup-model.ts
// Pure model for the Project Setup tab (spec §7): ResolutionReport entries
// joined with the sidecar's path overrides → editable rows grouped by zone,
// plus the sidecar overrides that match no profile entry (typos — the report
// can't show them because resolution never asked about those keys). Edits are
// applied immutably onto the ProjectConfig, preserving every other channel.
// Zone grouping reuses the classic report-grouping helper (same key scheme).

import type { ResolutionReport, EntryStatus } from '../../../core/project/report';
import type { ProjectConfig } from '../../../core/project/mapping';
import { groupEntriesByZone } from '../classic/report-grouping';

export interface SetupRow {
  key: string;
  /** The path resolution used (or expected, when missing). */
  path: string;
  status: EntryStatus;
  detail?: string;
  /** The sidecar override currently applied to this key, null when stock. */
  override: string | null;
}

export interface SetupGroup {
  id: string;
  rows: SetupRow[];
  resolved: number;
  total: number;
}

export function buildSetupRows(
  report: ResolutionReport,
  config: ProjectConfig,
  zoneOrder: string[],
): { groups: SetupGroup[]; unknownOverrides: { key: string; path: string }[] } {
  const overrides = config.paths ?? {};
  const known = new Set(report.entries.map((e) => e.key));

  const groups: SetupGroup[] = groupEntriesByZone(report.entries, zoneOrder).map((g) => ({
    id: g.id,
    resolved: g.resolved,
    total: g.total,
    rows: g.entries.map((e) => ({
      key: e.key,
      path: e.path,
      status: e.status,
      ...(e.detail !== undefined ? { detail: e.detail } : {}),
      override: overrides[e.key] ?? null,
    })),
  }));

  const unknownOverrides = Object.entries(overrides)
    .filter(([key]) => !known.has(key))
    .map(([key, path]) => ({ key, path }));

  return { groups, unknownOverrides };
}

/**
 * Apply row edits onto the config: string sets an override, null / empty
 * string clears it. Returns a new config; every other field passes through.
 */
export function applyPathEdits(
  config: ProjectConfig,
  edits: Record<string, string | null>,
): ProjectConfig {
  const paths: Record<string, string> = { ...(config.paths ?? {}) };
  for (const [key, value] of Object.entries(edits)) {
    if (value === null || value === '') delete paths[key];
    else paths[key] = value;
  }
  const next: ProjectConfig = { ...config };
  if (Object.keys(paths).length > 0) next.paths = paths;
  else delete next.paths;
  return next;
}
```

Check `groupEntriesByZone`'s exact export shape in `src/renderer/components/classic/report-grouping.ts` before writing — the code above assumes `{ id, entries, resolved, total }[]` (that is what `ResolutionReportPanel` consumes); adapt property names to the real ones if they differ.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/renderer/components/setup/__tests__/setup-model.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add src/renderer/components/setup/setup-model.ts src/renderer/components/setup/__tests__/setup-model.test.ts
git commit -m "feat(setup): pure row/edit model for the Project Setup tab"
```

### Task 13: Shell chrome — shellStore, icons, TabStrip, Explorer

The visible shell frame. All decision logic already lives in tested modules (Tasks 6–10); these components are thin renderers, so per house style (no jsdom) they ship without component tests. Visual language per spec §11: tabs are page-shaped with an emerald top accent; the explorer is a fifth-step-darker column; emerald appears ONLY on active-tab accent, selection, dirty dots, and OK status.

**Files:**
- Create: `src/renderer/state/shellStore.ts`
- Modify: `src/renderer/components/ui/icons.tsx` (append glyphs)
- Create: `src/renderer/shell/TabStrip.tsx`
- Create: `src/renderer/shell/Explorer.tsx`

- [ ] **Step 1: shellStore (explorer collapse state, persisted)**

```typescript
// src/renderer/state/shellStore.ts
// Shell-chrome state that isn't session state: the explorer's rail/full
// toggle (Ctrl+B, spec §3). Persisted like panel collapse state.

import { create } from 'zustand';

const KEY = 'aurora.shell.explorer-collapsed';

function loadCollapsed(): boolean {
  try { return localStorage.getItem(KEY) === '1'; } catch { return false; }
}

interface ShellState {
  explorerCollapsed: boolean;
  toggleExplorer: () => void;
}

export const useShellStore = create<ShellState>((set) => ({
  explorerCollapsed: typeof localStorage !== 'undefined' ? loadCollapsed() : false,
  toggleExplorer: () =>
    set((s) => {
      const next = !s.explorerCollapsed;
      try { localStorage.setItem(KEY, next ? '1' : '0'); } catch { /* storage unavailable */ }
      return { explorerCollapsed: next };
    }),
}));
```

- [ ] **Step 2: New icons**

Append to `src/renderer/components/ui/icons.tsx` (same `svg()` helper):

```tsx
export const IconHome    = svg(<path d="M3 8l5-5 5 5v5h-3.5v-3h-3v3H3z" />);
export const IconLayers  = svg(<><path d="M8 2l6 3-6 3-6-3z" /><path d="M2 8.5l6 3 6-3" /><path d="M2 11.5l6 3 6-3" /></>);
export const IconTools   = svg(<path d="M10 2a3.5 3.5 0 00-3.3 4.7L2 11.4V14h2.6l4.7-4.7A3.5 3.5 0 0014 6l-2 2-2-2 2-2a3.5 3.5 0 00-2-2z" />);
export const IconClock   = svg(<><circle cx="8" cy="8" r="6" /><path d="M8 4.5V8l2.5 1.5" /></>);
export const IconClose   = svg(<path d="M4 4l8 8M12 4l-8 8" />);
export const IconSearch  = svg(<><circle cx="7" cy="7" r="4" /><path d="M10 10l4 4" /></>);
export const IconPanelToggle = svg(<><rect x="2" y="3" width="12" height="10" rx="1" /><path d="M6 3v10" /></>);
```

- [ ] **Step 3: TabStrip**

```tsx
// src/renderer/shell/TabStrip.tsx
// The everything-is-a-tab strip (spec §3). Visual language (§11): tabs are
// PAGE-shaped — squared top corners with a 2px emerald top accent on the
// active tab — so they can never be confused with the pill-shaped facet
// control that arrives in Stage 3. Dirty tabs show the emerald dot; Home is
// pinned first and uncloseable. Clicks route through the activation guard.

import React from 'react';
import { T, Icons } from '../components/ui';
import { useSessionStore } from '../state/sessionStore';
import { useClassicProjectStore } from '../state/classicProjectStore';
import { useClassicLevelStore } from '../state/classicLevelStore';
import { useProjectStore } from '../state/projectStore';
import { useEditorStore } from '../state/editorStore';
import { useSpriteStore } from '../state/spriteStore';
import { tabHasDirtyDot, type DirtySnapshot } from './dirty-tabs';
import { requestFocusTabId } from './tab-activation';
import type { TabDescriptor } from '../../core/shell/session';

function useDirtySnapshot(): DirtySnapshot {
  const classicOpen = useClassicProjectStore((s) => s.status) === 'open';
  const classicRefState = useClassicLevelStore((s) => s.ref);
  const classicDirty = useClassicLevelStore((s) => Object.values(s.dirty).some(Boolean));
  const aeonOpen = useProjectStore((s) => s.project) !== null;
  const aeonDirty = useEditorStore((s) => s.dirty);
  const spriteArtPending = useSpriteStore((s) => s.s1ArtSource) !== null;
  return {
    classicOpen,
    classicRef: classicRefState ? { zone: classicRefState.zone, act: classicRefState.act } : null,
    classicDirty,
    aeonOpen,
    aeonDirty,
    spriteArtPending,
  };
}

function Tab({ tab, active, dirty }: { tab: TabDescriptor; active: boolean; dirty: boolean }) {
  const close = useSessionStore((s) => s.close);
  const [hover, setHover] = React.useState(false);
  const closeable = tab.kind !== 'home';
  return (
    <div
      onMouseDown={(e) => { if (e.button === 0) void requestFocusTabId(tab.id); }}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      title={tab.title}
      style={{
        ...styles.tab,
        ...(active ? styles.tabActive : {}),
        ...(!active && hover ? styles.tabHover : {}),
      }}
    >
      {tab.kind === 'home' && <Icons.IconHome size={13} />}
      <span style={styles.tabTitle}>{tab.title}</span>
      {dirty && <span style={styles.dot} title="Unsaved changes — Ctrl+S to save" />}
      {closeable && (
        <span
          onMouseDown={(e) => { e.stopPropagation(); close(tab.id); }}
          title="Close tab"
          style={{ ...styles.close, opacity: hover || active ? 1 : 0 }}
        >
          <Icons.IconClose size={11} />
        </span>
      )}
    </div>
  );
}

export default function TabStrip() {
  const tabs = useSessionStore((s) => s.tabs);
  const activeId = useSessionStore((s) => s.activeId);
  const dirtySnap = useDirtySnapshot();
  return (
    <div style={styles.strip} role="tablist">
      {tabs.map((tab) => (
        <Tab
          key={tab.id}
          tab={tab}
          active={tab.id === activeId}
          dirty={tabHasDirtyDot(tab.id, tab.kind, dirtySnap)}
        />
      ))}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  strip: {
    display: 'flex', alignItems: 'stretch', height: 34, flexShrink: 0,
    background: T.void, borderBottom: `1px solid ${T.border}`,
    overflowX: 'auto', scrollbarWidth: 'none' as const,
  },
  tab: {
    display: 'flex', alignItems: 'center', gap: 6, padding: '0 10px 0 12px',
    maxWidth: 180, minWidth: 0, cursor: 'pointer', userSelect: 'none' as const,
    color: T.textLo, fontSize: 12, borderRight: `1px solid ${T.border}`,
    boxShadow: 'inset 0 2px 0 transparent',
  },
  tabHover: { background: T.raised, color: T.textBase },
  tabActive: {
    background: T.surface, color: T.textHi,
    boxShadow: `inset 0 2px 0 ${T.accent}`,
  },
  tabTitle: { overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const },
  dot: {
    width: 6, height: 6, borderRadius: '50%', background: T.accent, flexShrink: 0,
  },
  close: {
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    width: 16, height: 16, borderRadius: T.rSm, color: T.textLo, flexShrink: 0,
  },
};
```

- [ ] **Step 4: Explorer**

```tsx
// src/renderer/shell/Explorer.tsx
// The persistent left explorer (spec §3): grouped, filterable tree present in
// every tab; groups collapsed by default with counts; Ctrl+B (wired in App)
// toggles full width ↔ a 44px icon rail. Group models come from the tested
// builders in explorer-data.ts; this component only renders and routes clicks
// by item-id prefix: 'level:' → guarded tab open, 'obj:' → edit-art handoff,
// 'tool:' → tool tab, 'recent:' → open recent project.

import React, { useEffect, useMemo, useState } from 'react';
import { T, Icons, CollapsibleSection } from '../components/ui';
import AuroraMark from '../components/AuroraMark';
import { useShellStore } from '../state/shellStore';
import { useClassicProjectStore } from '../state/classicProjectStore';
import { useClassicLevelStore } from '../state/classicLevelStore';
import { useProjectStore } from '../state/projectStore';
import { filterExplorer, type ExplorerGroupModel, type ExplorerItemModel } from '../../core/shell/explorer';
import { classicExplorerGroups, aeonExplorerGroups, noProjectExplorerGroups, type ClassicObjectRow } from './explorer-data';
import { requestOpenTab } from './tab-activation';
import { classicLevelTab, aeonLevelTab, parseLevelTabId, PROJECT_SETUP_TAB } from './tabs';
import { S1_OBJECT_LIST, s1ObjectHex } from '../../core/project/profiles/s1-objects';
import { resolveObjectArt } from '../../core/project/profiles/s1-object-art';
import { editObjectArt } from '../components/sprite/export-sprite';
import type { RecentProject } from '../../shared/ipc-types';

const GROUP_ICONS: Record<string, React.ComponentType<{ size?: number }>> = {
  levels: Icons.IconLayers,
  objects: Icons.IconObject,
  tools: Icons.IconTools,
  recents: Icons.IconClock,
};

export interface ExplorerProps {
  onOpenProject: () => void;
  onOpenRecent: (path: string) => void;
}

export default function Explorer({ onOpenProject, onOpenRecent }: ExplorerProps) {
  const collapsed = useShellStore((s) => s.explorerCollapsed);
  const toggle = useShellStore((s) => s.toggleExplorer);
  const [query, setQuery] = useState('');

  const classicOpen = useClassicProjectStore((s) => s.status) === 'open';
  const zoneTree = useClassicProjectStore((s) => s.zoneTree);
  const classicLabel = useClassicProjectStore((s) => s.label);
  const classicZone = useClassicLevelStore((s) => s.ref?.zone ?? null);
  const docReady = useClassicLevelStore((s) => s.status) === 'ready';
  const config = useProjectStore((s) => s.config);

  const [recents, setRecents] = useState<RecentProject[]>([]);
  const noProject = !classicOpen && !config;
  useEffect(() => {
    if (noProject) window.api.getRecentProjects().then(setRecents).catch(() => setRecents([]));
  }, [noProject]);

  const groups: ExplorerGroupModel[] = useMemo(() => {
    if (classicOpen) {
      // The object list keys art off the LOADED zone; before a doc is ready we
      // pass zone '' so linked-ness still computes for zone-independent art.
      const objects: ClassicObjectRow[] = S1_OBJECT_LIST.map(({ id, name }) => ({
        id, name, hex: s1ObjectHex(id),
        linked: resolveObjectArt(id, classicZone ?? '') !== undefined,
      }));
      return classicExplorerGroups(zoneTree, objects, docReady);
    }
    if (config) {
      return aeonExplorerGroups(config.zones.map((z) => ({
        id: z.id, name: z.name, acts: z.acts.map((a) => ({ id: a.id })),
      })));
    }
    return noProjectExplorerGroups(recents);
  }, [classicOpen, zoneTree, classicZone, docReady, config, recents]);

  const filtered = useMemo(() => filterExplorer(groups, query), [groups, query]);

  const activate = (item: ExplorerItemModel) => {
    if (item.disabled) return;
    if (item.id.startsWith('level:')) {
      const ref = parseLevelTabId(item.id)!;
      if (classicOpen) {
        const target = zoneTree.find((r) => r.zone === ref.zone && String(r.act) === ref.act);
        if (target) void requestOpenTab(classicLevelTab(target));
      } else if (config) {
        const zone = config.zones.find((z) => z.id === ref.zone);
        if (zone) void requestOpenTab(aeonLevelTab(zone.id, zone.name, ref.act));
      }
    } else if (item.id.startsWith('obj:')) {
      const id = Number(item.id.slice('obj:'.length));
      if (classicZone) void editObjectArt(id, classicZone);
    } else if (item.id === PROJECT_SETUP_TAB.id) {
      void requestOpenTab(PROJECT_SETUP_TAB);
    } else if (item.id.startsWith('recent:')) {
      onOpenRecent(item.id.slice('recent:'.length));
    }
  };

  const projectName = classicOpen ? (classicLabel ?? 'Project') : config ? config.name : 'No project';

  if (collapsed) {
    return (
      <div style={styles.rail}>
        <div style={styles.railBrand} title="Aurora"><AuroraMark size={20} /></div>
        {groups.map((g) => {
          const Icon = GROUP_ICONS[g.id] ?? Icons.IconLayers;
          return (
            <button
              key={g.id}
              title={`${g.label} (${g.items.length})`}
              onClick={toggle}
              style={styles.railButton}
            >
              <Icon size={16} />
            </button>
          );
        })}
        <div style={{ flex: 1 }} />
        <button title="Expand explorer (Ctrl+B)" onClick={toggle} style={styles.railButton}>
          <Icons.IconPanelToggle size={16} />
        </button>
      </div>
    );
  }

  return (
    <div style={styles.root}>
      <div style={styles.header}>
        <AuroraMark size={18} />
        <span style={styles.projectName} title={projectName}>{projectName}</span>
        <button title="Collapse explorer (Ctrl+B)" onClick={toggle} style={styles.headerButton}>
          <Icons.IconPanelToggle size={14} />
        </button>
      </div>
      <div style={styles.filterWrap}>
        <Icons.IconSearch size={12} />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Filter…"
          style={styles.filter}
          spellCheck={false}
        />
      </div>
      <div style={styles.treeScroll}>
        {filtered.length === 0 && query.trim() !== '' && (
          <div style={styles.empty}>No matches</div>
        )}
        {filtered.length === 0 && query.trim() === '' && noProject && (
          <div style={styles.empty}>
            <button onClick={onOpenProject} style={styles.openButton}>Open Project…</button>
          </div>
        )}
        {filtered.map((g) => (
          <CollapsibleSection
            key={g.id}
            id={`explorer.${g.id}`}
            title={g.label}
            defaultCollapsed={query.trim() === ''}
            right={<span style={styles.count}>{g.items.length}</span>}
          >
            <div style={styles.items}>
              {g.items.map((item) => (
                <button
                  key={item.id}
                  onClick={() => activate(item)}
                  disabled={item.disabled}
                  title={item.disabled ? item.reason : item.hint ?? item.label}
                  style={{ ...styles.item, ...(item.disabled ? styles.itemDisabled : {}) }}
                >
                  <span style={styles.itemLabel}>{item.label}</span>
                  {item.hint && <span style={styles.itemHint}>{item.hint}</span>}
                </button>
              ))}
            </div>
          </CollapsibleSection>
        ))}
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  root: {
    width: 240, flexShrink: 0, display: 'flex', flexDirection: 'column',
    background: T.void, borderRight: `1px solid ${T.border}`, overflow: 'hidden',
  },
  rail: {
    width: 44, flexShrink: 0, display: 'flex', flexDirection: 'column', alignItems: 'center',
    gap: 4, padding: '6px 0', background: T.void, borderRight: `1px solid ${T.border}`,
  },
  railBrand: { padding: '2px 0 8px' },
  railButton: {
    width: 30, height: 30, display: 'flex', alignItems: 'center', justifyContent: 'center',
    background: 'transparent', color: T.textLo, border: 'none', borderRadius: T.rMd, cursor: 'pointer',
  },
  header: {
    display: 'flex', alignItems: 'center', gap: 8, height: 34, padding: '0 10px',
    borderBottom: `1px solid ${T.border}`, flexShrink: 0,
  },
  projectName: {
    flex: 1, minWidth: 0, fontSize: 12, fontWeight: 600, color: T.textHi,
    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const,
  },
  headerButton: {
    display: 'flex', alignItems: 'center', background: 'transparent', color: T.textLo,
    border: 'none', cursor: 'pointer', padding: 2, borderRadius: T.rSm,
  },
  filterWrap: {
    display: 'flex', alignItems: 'center', gap: 6, margin: 8, padding: '4px 8px',
    background: T.surface, border: `1px solid ${T.border}`, borderRadius: T.rMd,
    color: T.textLo, flexShrink: 0,
  },
  filter: {
    flex: 1, minWidth: 0, background: 'transparent', border: 'none', outline: 'none',
    color: T.textHi, fontSize: 12, fontFamily: T.fontUi,
  },
  treeScroll: { flex: 1, overflowY: 'auto' },
  count: { fontSize: 10, color: T.textFaint, fontFamily: T.fontMono },
  items: { display: 'flex', flexDirection: 'column', padding: '2px 4px 6px' },
  item: {
    display: 'flex', alignItems: 'center', gap: 8, padding: '3px 8px', width: '100%',
    background: 'transparent', border: 'none', borderRadius: T.rMd, cursor: 'pointer',
    color: T.textBase, fontSize: 12, textAlign: 'left' as const,
  },
  itemDisabled: { color: T.textFaint, cursor: 'default' },
  itemLabel: { flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const },
  itemHint: { fontSize: 10, color: T.textFaint, fontFamily: T.fontMono, flexShrink: 0 },
  empty: { padding: 16, textAlign: 'center' as const, color: T.textLo, fontSize: 12 },
  openButton: {
    padding: '6px 14px', background: T.accent, color: T.onAccent, fontWeight: 600,
    border: 'none', borderRadius: T.rMd, cursor: 'pointer', fontSize: 12,
  },
};
```

Note: item rows use plain hover-free buttons here; if the file-level lint or visual pass wants hover states, add them the way `Tab` does (local hover state) — do not add a CSS file.

- [ ] **Step 5: Typecheck and commit**

Run: `npx tsc --noEmit` — expected clean (`S1_OBJECT_LIST`, `s1ObjectHex`, `resolveObjectArt`, `editObjectArt`, `AuroraMark` all exist with these signatures; `config.zones[].acts[].id` per `LoadedS4Config`). Nothing imports these components yet — that's Task 16.

```bash
git add src/renderer/state/shellStore.ts src/renderer/components/ui/icons.tsx \
        src/renderer/shell/TabStrip.tsx src/renderer/shell/Explorer.tsx
git commit -m "feat(shell): tab strip + explorer chrome"
```

---

### Task 14: Home tab

Spec §3: a landing page, never a required hallway. No project → open/recents are the star; with a project → level cards and project health. Only actions that exist in Stage 2 are shown (no New Sprite / Convert until Stage 5 — no dead chrome).

**Files:**
- Create: `src/renderer/components/home/HomeTab.tsx`

- [ ] **Step 1: Implement**

```tsx
// src/renderer/components/home/HomeTab.tsx
// The Home tab (spec §3): with no project, opening things is the star (open
// project + recents); with a project, its levels and health are. Every card
// routes through the same guarded tab-open path as the explorer. Stage 5 adds
// the standalone-document actions (New Sprite, Convert) — deliberately absent
// until they exist.

import React, { useEffect, useState } from 'react';
import { T, Icons } from '../ui';
import AuroraMark from '../AuroraMark';
import { useClassicProjectStore } from '../../state/classicProjectStore';
import { useProjectStore } from '../../state/projectStore';
import { requestOpenTab } from '../../shell/tab-activation';
import { classicLevelTab, aeonLevelTab, PROJECT_SETUP_TAB } from '../../shell/tabs';
import type { RecentProject } from '../../../shared/ipc-types';

export interface HomeTabProps {
  onOpenProject: () => void;
  onOpenRecent: (path: string) => void;
}

export default function HomeTab({ onOpenProject, onOpenRecent }: HomeTabProps) {
  const classicOpen = useClassicProjectStore((s) => s.status) === 'open';
  const classicLabel = useClassicProjectStore((s) => s.label);
  const dir = useClassicProjectStore((s) => s.dir);
  const zoneTree = useClassicProjectStore((s) => s.zoneTree);
  const report = useClassicProjectStore((s) => s.report);
  const sidecar = useClassicProjectStore((s) => s.sidecar);
  const config = useProjectStore((s) => s.config);

  const [recents, setRecents] = useState<RecentProject[]>([]);
  const noProject = !classicOpen && !config;
  useEffect(() => {
    if (noProject) window.api.getRecentProjects().then(setRecents).catch(() => setRecents([]));
  }, [noProject]);

  if (noProject) {
    return (
      <div style={styles.scroll}>
        <div style={styles.column}>
          <div style={styles.hero}>
            <AuroraMark size={44} />
            <div>
              <div style={styles.heroTitle}>Aurora</div>
              <div style={styles.heroSub}>Visual authoring for the Empyrean suite</div>
            </div>
          </div>
          <button onClick={onOpenProject} style={styles.primaryButton}>Open Project…</button>
          {recents.length > 0 && (
            <>
              <div style={styles.sectionTitle}>Recent projects</div>
              <div style={styles.recentList}>
                {recents.map((r) => (
                  <button key={r.path} onClick={() => onOpenRecent(r.path)} style={styles.recentRow} title={r.path}>
                    <span style={styles.recentName}>{r.name}</span>
                    <span style={styles.recentPath}>{r.path}</span>
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      </div>
    );
  }

  // ---- project home ----
  const projectName = classicOpen ? (classicLabel ?? 'Project') : config!.name;
  const engineChip = classicOpen ? 'S1' : 'AEON';
  const levels = classicOpen
    ? zoneTree.map((r) => ({
        tab: classicLevelTab(r), label: r.label,
        disabled: !r.available, reason: r.reason,
      }))
    : config!.zones.flatMap((z) =>
        z.acts.map((a) => ({
          tab: aeonLevelTab(z.id, z.name, a.id), label: `${z.name} · ${a.id}`,
          disabled: false, reason: undefined as string | undefined,
        })),
      );
  const health = report
    ? { resolved: report.resolved, total: report.total, issues: sidecar?.issues.length ?? 0 }
    : null;

  return (
    <div style={styles.scroll}>
      <div style={styles.column}>
        <div style={styles.projectHeader}>
          <span style={styles.chip}>{engineChip}</span>
          <span style={styles.heroTitle}>{projectName}</span>
          {dir && <span style={styles.recentPath}>{dir}</span>}
        </div>

        <div style={styles.sectionTitle}>Levels</div>
        <div style={styles.cards}>
          {levels.map((l) => (
            <button
              key={l.tab.id}
              onClick={() => { if (!l.disabled) void requestOpenTab(l.tab); }}
              disabled={l.disabled}
              title={l.disabled ? l.reason : `Open ${l.label}`}
              style={{ ...styles.card, ...(l.disabled ? styles.cardDisabled : {}) }}
            >
              <Icons.IconLayers size={16} />
              <span style={styles.cardLabel}>{l.label}</span>
              {l.disabled && <span style={styles.cardBadge}>missing files</span>}
            </button>
          ))}
        </div>

        <div style={styles.sectionTitle}>Project</div>
        <div style={styles.cards}>
          <button onClick={() => void requestOpenTab(PROJECT_SETUP_TAB)} style={styles.card}>
            <Icons.IconTools size={16} />
            <span style={styles.cardLabel}>Project Setup</span>
            {health && (
              <span style={{
                ...styles.cardBadge,
                color: health.resolved === health.total && health.issues === 0 ? T.success : T.warning,
              }}>
                {health.resolved}/{health.total} resolved{health.issues > 0 ? ` · ${health.issues} config issue${health.issues === 1 ? '' : 's'}` : ''}
              </span>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  scroll: { flex: 1, overflowY: 'auto', background: T.surface },
  column: {
    maxWidth: 760, margin: '0 auto', padding: '48px 32px',
    display: 'flex', flexDirection: 'column', gap: 12,
  },
  hero: { display: 'flex', alignItems: 'center', gap: 14, marginBottom: 12 },
  heroTitle: { fontSize: 20, fontWeight: 600, color: T.textHi, letterSpacing: '0.02em' },
  heroSub: { fontSize: 12, color: T.textLo, marginTop: 2 },
  primaryButton: {
    alignSelf: 'flex-start', padding: '8px 18px', background: T.accent, color: T.onAccent,
    fontWeight: 600, fontSize: 13, border: 'none', borderRadius: T.rMd, cursor: 'pointer',
  },
  sectionTitle: {
    marginTop: 20, fontSize: 10, fontWeight: 600, color: T.textLo,
    textTransform: 'uppercase' as const, letterSpacing: 1,
  },
  recentList: { display: 'flex', flexDirection: 'column', gap: 2 },
  recentRow: {
    display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 2,
    padding: '8px 12px', background: T.void, border: `1px solid ${T.border}`,
    borderRadius: T.rMd, cursor: 'pointer', textAlign: 'left' as const,
  },
  recentName: { fontSize: 13, color: T.textHi, fontWeight: 500 },
  recentPath: {
    fontSize: 10, color: T.textFaint, fontFamily: T.fontMono,
    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const, maxWidth: '100%',
  },
  projectHeader: { display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' as const },
  chip: {
    padding: '1px 8px', background: T.raised, border: `1px solid ${T.borderStrong}`,
    borderRadius: T.rPill, fontSize: 10, fontWeight: 700, color: T.accent, fontFamily: T.fontMono,
  },
  cards: {
    display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 8,
  },
  card: {
    display: 'flex', alignItems: 'center', gap: 10, padding: '12px 14px',
    background: T.void, border: `1px solid ${T.border}`, borderRadius: T.rLg,
    cursor: 'pointer', color: T.textBase, textAlign: 'left' as const,
  },
  cardDisabled: { opacity: 0.45, cursor: 'default' },
  cardLabel: { flex: 1, minWidth: 0, fontSize: 12, fontWeight: 500, color: T.textHi },
  cardBadge: { fontSize: 10, color: T.textLo, fontFamily: T.fontMono, flexShrink: 0 },
};
```

- [ ] **Step 2: Typecheck and commit**

Run: `npx tsc --noEmit` — clean (component is unused until Task 16; that's expected).

```bash
git add src/renderer/components/home/HomeTab.tsx
git commit -m "feat(shell): Home tab (landing for project and no-project states)"
```

---

### Task 15: Project Setup tab

Spec §7: every asset class as a row — path, status light, live re-validation; "the current Resolution Report promoted from readout to editor." Rows edit the sidecar's `paths` channel; Apply writes `.aurora/project.json` and re-opens the project through the normal open path so resolution is re-run for real. (Format/compression columns become editable when a reader consumes the `assets` channel — Stage 3+; the schema already carries it.)

**Files:**
- Create: `src/renderer/components/setup/ProjectSetupTab.tsx`

- [ ] **Step 1: Implement**

```tsx
// src/renderer/components/setup/ProjectSetupTab.tsx
// The Project Setup tab (spec §7): the Resolution Report promoted from readout
// to editor. Each report entry is a row: status light, key, editable path
// override. Edits live-validate via pathExists (debounced); Apply writes the
// merged .aurora/project.json and re-opens the project so resolution re-runs
// for real. Sidecar parse issues (per-entry diagnostics from mapping.ts) and
// overrides matching no profile entry render above the rows. Aeon shows an
// info card until it becomes a full profile (Stage 3).

import React, { useMemo, useRef, useState } from 'react';
import { T, CollapsibleSection } from '../ui';
import { useClassicProjectStore } from '../../state/classicProjectStore';
import { useClassicLevelStore } from '../../state/classicLevelStore';
import { useProjectStore } from '../../state/projectStore';
import { useConfirmStore } from '../../state/confirmStore';
import { useToastStore } from '../../state/toastStore';
import { buildSetupRows, applyPathEdits, type SetupRow } from './setup-model';
import { serializeProjectConfig } from '../../../core/project/mapping';
import type { EntryStatus } from '../../../core/project/report';

const STATUS_COLOR: Record<EntryStatus, string> = {
  resolved: T.success,
  missing: T.error,
  ambiguous: T.warning,
};

/** Debounced existence probe for a candidate override path. */
function useLiveCheck(dir: string | null) {
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const [checks, setChecks] = useState<Record<string, boolean | 'pending'>>({});
  const check = (key: string, rel: string) => {
    if (!dir) return;
    if (rel === '') {
      setChecks((c) => { const { [key]: _, ...rest } = c; return rest; });
      return;
    }
    setChecks((c) => ({ ...c, [key]: 'pending' }));
    clearTimeout(timers.current.get(key));
    timers.current.set(key, setTimeout(() => {
      window.api.pathExists(dir, rel)
        .then((ok) => setChecks((c) => ({ ...c, [key]: ok })))
        .catch(() => setChecks((c) => ({ ...c, [key]: false })));
    }, 300));
  };
  return { checks, check };
}

function Row({ row, edit, live, onEdit }: {
  row: SetupRow;
  edit: string | null | undefined;          // undefined = untouched this session
  live: boolean | 'pending' | undefined;
  onEdit: (key: string, value: string) => void;
}) {
  const value = edit !== undefined ? (edit ?? '') : (row.override ?? '');
  const lightColor =
    live === 'pending' ? T.textFaint
    : live === true ? T.success
    : live === false ? T.error
    : STATUS_COLOR[row.status];
  return (
    <div style={styles.row}>
      <span style={{ ...styles.light, background: lightColor }} title={row.detail ?? row.status} />
      <span style={styles.key}>{row.key}</span>
      <input
        value={value}
        placeholder={row.path}
        onChange={(e) => onEdit(row.key, e.target.value)}
        spellCheck={false}
        style={styles.pathInput}
        title={value === '' ? `stock: ${row.path}` : value}
      />
    </div>
  );
}

export default function ProjectSetupTab() {
  const classicOpen = useClassicProjectStore((s) => s.status) === 'open';
  const dir = useClassicProjectStore((s) => s.dir);
  const label = useClassicProjectStore((s) => s.label);
  const report = useClassicProjectStore((s) => s.report);
  const sidecar = useClassicProjectStore((s) => s.sidecar);
  const zoneTree = useClassicProjectStore((s) => s.zoneTree);
  const classicDirty = useClassicLevelStore((s) => Object.values(s.dirty).some(Boolean));
  const config = useProjectStore((s) => s.config);

  // key → edited value ('' = clear the override). Cleared on Apply/re-open.
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [applying, setApplying] = useState(false);
  const { checks, check } = useLiveCheck(dir);

  const model = useMemo(() => {
    if (!report || !sidecar) return null;
    const zoneOrder = [...new Set(zoneTree.map((r) => r.zone))];
    return buildSetupRows(report, sidecar.config, zoneOrder);
  }, [report, sidecar, zoneTree]);

  if (!classicOpen || !dir || !model || !sidecar) {
    if (config) {
      return (
        <div style={styles.scroll}><div style={styles.column}>
          <div style={styles.title}>Project Setup</div>
          <div style={styles.infoCard}>
            <div style={styles.infoLine}><span style={styles.infoKey}>engine</span><span style={styles.mono}>s4 (aeon)</span></div>
            <div style={styles.infoLine}><span style={styles.infoKey}>project</span><span style={styles.mono}>{config.name}</span></div>
            <div style={styles.infoLine}><span style={styles.infoKey}>config</span><span style={styles.mono}>{config.basePath}/project.json</span></div>
            <div style={styles.infoLine}><span style={styles.infoKey}>zones</span><span style={styles.mono}>{config.zones.length}</span></div>
          </div>
          <div style={styles.note}>
            Aeon projects configure through their own project.json today; the full
            mapping-layer editor arrives when aeon becomes a profile (Stage 3).
          </div>
        </div></div>
      );
    }
    return (
      <div style={styles.scroll}><div style={styles.column}>
        <div style={styles.title}>Project Setup</div>
        <div style={styles.note}>Open a project to configure it.</div>
      </div></div>
    );
  }

  const onEdit = (key: string, value: string) => {
    setEdits((e) => ({ ...e, [key]: value }));
    check(key, value);
  };

  const pendingCount = Object.keys(edits).filter((k) => {
    const row = model.groups.flatMap((g) => g.rows).find((r) => r.key === k);
    return (row?.override ?? '') !== edits[k];
  }).length;

  const apply = async () => {
    if (classicDirty) {
      const a = await useConfirmStore.getState().ask({
        title: 'Unsaved level changes',
        body: 'Applying setup changes re-opens the project, which reloads the level from disk.',
        buttons: [
          { key: 'save', label: 'Save & apply', tone: 'primary' },
          { key: 'discard', label: 'Discard & apply', tone: 'danger' },
          { key: 'cancel', label: 'Cancel' },
        ],
      });
      if (a === 'cancel') return;
      if (a === 'save') {
        const { saveClassicProject } = await import('../../state/classic-save');
        await saveClassicProject();
      }
    }
    setApplying(true);
    try {
      const editMap: Record<string, string | null> = {};
      for (const [k, v] of Object.entries(edits)) editMap[k] = v === '' ? null : v;
      const next = applyPathEdits(sidecar.config, editMap);
      const bytes = serializeProjectConfig(next);
      await window.api.writeBinaryFile(dir, '.aurora/project.json', bytes.buffer as ArrayBuffer);
      setEdits({});
      const outcome = await useClassicProjectStore.getState().openDirectory(dir);
      useToastStore.getState().addToast(
        outcome === 'opened' ? 'Setup applied — project re-validated' : 'Setup written, but re-open failed',
        outcome === 'opened' ? 'success' : 'error',
      );
    } catch (e) {
      useToastStore.getState().addToast(`Apply failed: ${e instanceof Error ? e.message : String(e)}`, 'error');
    } finally {
      setApplying(false);
    }
  };

  const full = report!.resolved === report!.total;

  return (
    <div style={styles.rootWithFooter}>
      <div style={styles.scroll}>
        <div style={styles.column}>
          <div style={styles.title}>Project Setup</div>
          <div style={styles.infoCard}>
            <div style={styles.infoLine}><span style={styles.infoKey}>base profile</span><span style={styles.mono}>{label}</span></div>
            <div style={styles.infoLine}><span style={styles.infoKey}>directory</span><span style={styles.mono}>{dir}</span></div>
            <div style={styles.infoLine}>
              <span style={styles.infoKey}>resolution</span>
              <span style={{ ...styles.mono, color: full ? T.success : T.warning }}>
                {report!.resolved}/{report!.total} files resolved
              </span>
            </div>
          </div>

          {sidecar.issues.length > 0 && (
            <div style={styles.issueCard}>
              <div style={styles.issueTitle}>Sidecar issues (.aurora/project.json)</div>
              {sidecar.issues.map((i) => (
                <div key={i.where} style={styles.issueLine}>
                  <span style={styles.mono}>{i.where}</span> — {i.message}
                </div>
              ))}
            </div>
          )}

          {model.unknownOverrides.length > 0 && (
            <div style={styles.issueCard}>
              <div style={styles.issueTitle}>Overrides matching no known entry</div>
              {model.unknownOverrides.map((o) => (
                <div key={o.key} style={styles.issueLine}>
                  <span style={styles.mono}>{o.key}</span> → <span style={styles.mono}>{o.path}</span>
                  <button style={styles.removeButton} onClick={() => onEdit(o.key, '')}>remove</button>
                </div>
              ))}
            </div>
          )}

          {model.groups.map((g) => (
            <CollapsibleSection
              key={g.id}
              id={`setup.${g.id}`}
              title={g.id.toUpperCase()}
              defaultCollapsed={g.resolved === g.total}
              right={
                <span style={{ color: g.resolved === g.total ? T.success : T.warning, fontSize: 10 }}>
                  {g.resolved}/{g.total}
                </span>
              }
            >
              <div style={styles.rows}>
                {g.rows.map((row) => (
                  <Row key={row.key} row={row} edit={edits[row.key]} live={checks[row.key]} onEdit={onEdit} />
                ))}
              </div>
            </CollapsibleSection>
          ))}
        </div>
      </div>
      <div style={styles.footer}>
        <span style={styles.footerHint}>
          {pendingCount > 0 ? `${pendingCount} change${pendingCount === 1 ? '' : 's'} pending` : 'Edit a path to override the base profile'}
        </span>
        <button onClick={() => void apply()} disabled={pendingCount === 0 || applying} style={{
          ...styles.applyButton, ...(pendingCount === 0 || applying ? styles.applyDisabled : {}),
        }}>
          {applying ? 'Applying…' : 'Apply & re-validate'}
        </button>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  rootWithFooter: { flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', background: T.surface },
  scroll: { flex: 1, overflowY: 'auto', background: T.surface },
  column: { maxWidth: 860, margin: '0 auto', padding: '32px 32px 24px', display: 'flex', flexDirection: 'column', gap: 12 },
  title: { fontSize: 16, fontWeight: 600, color: T.textHi },
  infoCard: {
    display: 'flex', flexDirection: 'column', gap: 4, padding: '10px 14px',
    background: T.void, border: `1px solid ${T.border}`, borderRadius: T.rLg,
  },
  infoLine: { display: 'flex', gap: 12, fontSize: 12 },
  infoKey: { width: 90, flexShrink: 0, color: T.textLo, fontSize: 10, textTransform: 'uppercase' as const, letterSpacing: 1, paddingTop: 1 },
  mono: { fontFamily: T.fontMono, fontSize: 11, color: T.textBase, overflowWrap: 'anywhere' as const },
  issueCard: {
    padding: '10px 14px', background: T.void, border: `1px solid ${T.warning}`,
    borderRadius: T.rLg, display: 'flex', flexDirection: 'column', gap: 4,
  },
  issueTitle: { fontSize: 11, fontWeight: 600, color: T.warning },
  issueLine: { fontSize: 11, color: T.textBase, display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' as const },
  removeButton: {
    padding: '0 6px', background: 'transparent', border: `1px solid ${T.border}`,
    borderRadius: T.rSm, color: T.textLo, cursor: 'pointer', fontSize: 10,
  },
  rows: { display: 'flex', flexDirection: 'column', gap: 2, padding: '4px 0 8px' },
  row: { display: 'flex', alignItems: 'center', gap: 8, padding: '1px 8px' },
  light: { width: 7, height: 7, borderRadius: '50%', flexShrink: 0 },
  key: { fontFamily: T.fontMono, fontSize: 11, color: T.textBase, width: 220, flexShrink: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const },
  pathInput: {
    flex: 1, minWidth: 0, padding: '2px 8px', background: T.surface,
    border: `1px solid ${T.border}`, borderRadius: T.rSm, outline: 'none',
    color: T.textHi, fontSize: 11, fontFamily: T.fontMono,
  },
  footer: {
    display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 12,
    padding: '8px 16px', borderTop: `1px solid ${T.border}`, background: T.void, flexShrink: 0,
  },
  footerHint: { fontSize: 11, color: T.textLo },
  applyButton: {
    padding: '5px 16px', background: T.accent, color: T.onAccent, fontWeight: 600,
    border: 'none', borderRadius: T.rMd, cursor: 'pointer', fontSize: 12,
  },
  applyDisabled: { opacity: 0.4, cursor: 'default' },
};
```

Note the unknown-override "remove" button funnels through `onEdit(key, '')` — empty string means "clear this override" in `applyPathEdits`, so removals and edits share one pending-changes path.

- [ ] **Step 2: Typecheck and commit**

Run: `npx tsc --noEmit` — clean.

```bash
git add src/renderer/components/setup/ProjectSetupTab.tsx
git commit -m "feat(setup): Project Setup tab — report rows as editable overrides"
```

### Task 16: Shell assembly — LegacyWorkspace, lifecycle hooks, new App

The integration task: extract today's App composition into `LegacyWorkspace` (unchanged behavior, always mounted), add the session-lifecycle and act-tab-sync hooks, rewrite `App.tsx` around the shell, and retire `save-routing.ts`.

**Files:**
- Create: `src/renderer/shell/LegacyWorkspace.tsx`
- Create: `src/renderer/shell/session-lifecycle.ts`
- Modify: `src/renderer/App.tsx` (rewrite)
- Delete: `src/renderer/state/save-routing.ts`
- Delete: `src/renderer/state/__tests__/save-routing.test.ts`

- [ ] **Step 1: Extract LegacyWorkspace**

Create `src/renderer/shell/LegacyWorkspace.tsx` by MOVING the entire current render branch out of `App.tsx` — the `classicOpen && appMode !== 'sprite' ? <ClassicProjectView…> : appMode === 'art' ? … : appMode === 'sprite' ? … : <EditorShell…>` ternary plus every import and inline sub-tree it needs (`Toolbar`, `MapViewport`, `SectionGridNav`, `ChunkLibrary`, `ObjectPalette`, `RingPatternPalette`, `CollisionPalette`, `MarqueePasteOptions`, `ArtBrowser`, `PaletteViewer`, `PropertiesPanel`, `ArtMode`, `SpriteMode`, `ClassicProjectView`, `EditorShell`, `MapToolDock`, `MapStatusBar`, `Panel`, `CollapsibleSection`, and the store hooks the branch reads). Copy the code VERBATIM — including the explanatory comments — changing only:

- Wrap it in a component:

```tsx
// src/renderer/shell/LegacyWorkspace.tsx
// The pre-overhaul editor composition, extracted VERBATIM from App.tsx as the
// Stage 2 content of every level tab. It is a singleton: one instance stays
// mounted for the whole app lifetime (hidden when a non-level tab is active)
// so canvas/pan/zoom/undo state survives tab switches. Stages 3–4 dissolve it
// into facet modules; do not refactor it here.

export interface LegacyWorkspaceProps {
  onOpenProject: () => void;
  onOpenRecent: (path: string) => void;
  onSave: () => Promise<unknown> | void;
}

export default function LegacyWorkspace({ onOpenProject, onOpenRecent, onSave }: LegacyWorkspaceProps) {
  const classicOpen = useClassicProjectStore((s) => s.status) === 'open';
  const tool = useEditorStore((s) => s.tool);
  const pasting = useEditorStore((s) => s.pasting);
  const appMode = useEditorStore((s) => s.appMode);
  const appBar = <Toolbar onOpenProject={onOpenProject} onOpenRecent={onOpenRecent} onSave={onSave} />;
  return (
    /* …the moved ternary, with every `appBar={<Toolbar …/>}` occurrence replaced
       by `appBar={appBar}` and every `onSave`/`guardedSave`/`saveProject`
       reference replaced by the single `onSave` prop… */
  );
}
```

(The old code passed `saveProject` to ArtMode's toolbar and `guardedSave` elsewhere; with the SaveCoordinator every surface saves through the same `onSave` — that distinction is exactly what Task 5 retired.)

- [ ] **Step 2: Session lifecycle + act-tab sync hooks**

```typescript
// src/renderer/shell/session-lifecycle.ts
// Two App-level effects gluing the session model to the stores:
//
// useSessionLifecycle — persists the tab session under the current project's
// key on every change, and on project switch saves nothing extra (continuous
// save already covered it), loads the new project's stored session (pruned to
// tabs that still exist), or builds the default (Home + first level, focused),
// then re-points the singleton editor at the restored active level tab.
//
// useActTabSync — the legacy Toolbar's zone/act selectors switch acts without
// touching the session; these subscriptions reflect any act switch back into
// an open+focused tab so the strip never lies about what the editor shows.
// They call sessionStore.open directly (NOT requestOpenTab): the act is
// already loaded, so the activation guard would be a no-op self-recursion.

import { useEffect, useRef } from 'react';
import { useSessionStore } from '../state/sessionStore';
import { useClassicProjectStore } from '../state/classicProjectStore';
import { useClassicLevelStore } from '../state/classicLevelStore';
import { useProjectStore } from '../state/projectStore';
import { resetProjectRuntime } from '../state/project-runtime';
import { loadStoredSession, saveStoredSession, defaultProjectSession } from './session-storage';
import { classicLevelTab, aeonLevelTab, PROJECT_SETUP_TAB } from './tabs';
import { activateLevelTarget } from './tab-activation';
import type { TabDescriptor } from '../../core/shell/session';

function projectLevelTabs(): TabDescriptor[] {
  const classic = useClassicProjectStore.getState();
  if (classic.status === 'open') return classic.zoneTree.map(classicLevelTab);
  const config = useProjectStore.getState().config;
  if (config) {
    return config.zones.flatMap((z) => z.acts.map((a) => aeonLevelTab(z.id, z.name, a.id)));
  }
  return [];
}

function firstOpenableLevelTab(): TabDescriptor | null {
  const classic = useClassicProjectStore.getState();
  if (classic.status === 'open') {
    const ref = classic.zoneTree.find((r) => r.available);
    return ref ? classicLevelTab(ref) : null;
  }
  return projectLevelTabs()[0] ?? null;
}

export function useSessionLifecycle(): void {
  const classicDir = useClassicProjectStore((s) => (s.status === 'open' ? s.dir : null));
  const aeonBase = useProjectStore((s) => s.config?.basePath ?? null);
  const projectKey = classicDir ?? aeonBase;
  // undefined = "no project key adopted yet" — the save subscription stays
  // quiet until the first restore has run, so a default session can never
  // clobber a stored one during boot.
  const keyRef = useRef<string | null | undefined>(undefined);

  useEffect(() => {
    return useSessionStore.subscribe((s) => {
      if (keyRef.current === undefined) return;
      saveStoredSession(localStorage, keyRef.current, { tabs: s.tabs, activeId: s.activeId });
    });
  }, []);

  useEffect(() => {
    if (keyRef.current === projectKey) return;
    const isProjectSwitch = keyRef.current !== undefined;
    keyRef.current = projectKey;
    if (isProjectSwitch) resetProjectRuntime();

    const validIds = new Set<string>([
      PROJECT_SETUP_TAB.id,
      ...projectLevelTabs().map((t) => t.id),
    ]);
    const stored = loadStoredSession(localStorage, projectKey, (t) => validIds.has(t.id));
    const next =
      stored ?? (projectKey !== null ? defaultProjectSession(firstOpenableLevelTab()) : undefined) ??
      { tabs: useSessionStore.getState().tabs.slice(0, 1), activeId: 'home' };
    useSessionStore.getState().replace(next);
    if (next.activeId.startsWith('level:')) void activateLevelTarget(next.activeId);
  }, [projectKey]);
}

export function useActTabSync(): void {
  useEffect(() => {
    return useClassicLevelStore.subscribe((s, prev) => {
      if (s.ref && s.ref !== prev.ref) {
        useSessionStore.getState().open(classicLevelTab(s.ref));
      }
    });
  }, []);
  useEffect(() => {
    return useProjectStore.subscribe((s, prev) => {
      if (!s.currentZoneId || !s.currentActId) return;
      if (s.currentZoneId === prev.currentZoneId && s.currentActId === prev.currentActId) return;
      const zone = s.config?.zones.find((z) => z.id === s.currentZoneId);
      if (zone) useSessionStore.getState().open(aeonLevelTab(zone.id, zone.name, s.currentActId));
    });
  }, []);
}
```

- [ ] **Step 3: Rewrite App.tsx**

Replace `src/renderer/App.tsx` with:

```tsx
import React, { useEffect, useMemo, useState } from 'react';
import ToastContainer from './components/ToastContainer';
import CommandPalette from './components/CommandPalette';
import TabStrip from './shell/TabStrip';
import Explorer from './shell/Explorer';
import ConfirmDialog from './shell/ConfirmDialog';
import LegacyWorkspace from './shell/LegacyWorkspace';
import HomeTab from './components/home/HomeTab';
import ProjectSetupTab from './components/setup/ProjectSetupTab';
import { T } from './components/ui';
import { useProject } from './hooks/useProject';
import { useProjectStore } from './state/projectStore';
import { useClassicProjectStore } from './state/classicProjectStore';
import { useClassicLevelStore } from './state/classicLevelStore';
import { useSessionStore } from './state/sessionStore';
import { useShellStore } from './state/shellStore';
import { ensureSaversRegistered, registerAeonSaver, saveAllDirty } from './state/project-runtime';
import { useSessionLifecycle, useActTabSync } from './shell/session-lifecycle';
import { requestOpenTab, requestFocusIndex } from './shell/tab-activation';
import { buildCommands } from './shell/commands';
import { classicLevelTab, aeonLevelTab, PROJECT_SETUP_TAB } from './shell/tabs';
import { S1_OBJECT_LIST, s1ObjectHex } from '../core/project/profiles/s1-objects';
import { resolveObjectArt } from '../core/project/profiles/s1-object-art';
import { editObjectArt } from './components/sprite/export-sprite';
import { registerAgentHandler } from './agent/agent-handler';
import { refreshObjectPreviews } from './object-previews';
import type { RecentProject } from '../shared/ipc-types';

export default function App() {
  const { openProject, openProjectByPath, saveProject } = useProject();
  const error = useProjectStore((s) => s.error);
  const classicError = useClassicProjectStore((s) => s.error);
  const project = useProjectStore((s) => s.project);
  const config = useProjectStore((s) => s.config);
  const currentZoneId = useProjectStore((s) => s.currentZoneId);
  const classicOpen = useClassicProjectStore((s) => s.status) === 'open';
  const classicLabel = useClassicProjectStore((s) => s.label);
  const zoneTree = useClassicProjectStore((s) => s.zoneTree);
  const classicZone = useClassicLevelStore((s) => s.ref?.zone ?? null);
  const docReady = useClassicLevelStore((s) => s.status) === 'ready';
  const tabs = useSessionStore((s) => s.tabs);
  const activeId = useSessionStore((s) => s.activeId);
  const toggleExplorer = useShellStore((s) => s.toggleExplorer);

  const activeTab = tabs.find((t) => t.id === activeId);

  // -- runtime wiring ------------------------------------------------------
  useEffect(() => { registerAgentHandler(); ensureSaversRegistered(); }, []);
  useEffect(() => { registerAeonSaver(saveProject); return () => registerAeonSaver(null); }, [saveProject]);
  useSessionLifecycle();
  useActTabSync();

  // Build object preview images (from sprite bindings) when a project/zone loads.
  useEffect(() => { if (project && currentZoneId) refreshObjectPreviews().catch(() => {}); }, [project, currentZoneId]);

  // -- global keys: Ctrl+S save-all, Ctrl+B explorer, Ctrl+1..9 tab jump ---
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      if (e.key === 's' || e.key === 'S') { e.preventDefault(); void saveAllDirty(); }
      else if (e.key === 'b' || e.key === 'B') { e.preventDefault(); toggleExplorer(); }
      else if (e.key >= '1' && e.key <= '9' && !e.shiftKey && !e.altKey) {
        e.preventDefault();
        void requestFocusIndex(Number(e.key));
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [toggleExplorer]);

  // -- window title: Aurora — <project> — <tab> ----------------------------
  useEffect(() => {
    const projectName = classicOpen ? classicLabel : config?.name;
    const parts = ['Aurora', projectName, activeTab && activeTab.kind !== 'home' ? activeTab.title : null];
    document.title = parts.filter(Boolean).join(' — ');
  }, [classicOpen, classicLabel, config, activeTab]);

  // -- ⌘K ------------------------------------------------------------------
  const engine = classicOpen ? ('s1' as const) : config ? ('aeon' as const) : null;
  const [recents, setRecents] = useState<RecentProject[]>([]);
  useEffect(() => {
    if (engine === null) window.api.getRecentProjects().then(setRecents).catch(() => setRecents([]));
  }, [engine]);
  const commands = useMemo(() => {
    const levelTabs = classicOpen
      ? zoneTree.filter((r) => r.available).map(classicLevelTab)
      : config
        ? config.zones.flatMap((z) => z.acts.map((a) => aeonLevelTab(z.id, z.name, a.id)))
        : [];
    const objects = classicOpen && docReady && classicZone
      ? S1_OBJECT_LIST
          .filter(({ id }) => resolveObjectArt(id, classicZone) !== undefined)
          .map(({ id, name }) => ({ id, name, hex: s1ObjectHex(id) }))
      : [];
    return buildCommands(
      { tabs, activeId, engine, levelTabs, objects, recents },
      {
        openProjectDialog: () => void openProject(),
        saveAll: () => void saveAllDirty(),
        toggleExplorer,
        openTab: (tab) => void requestOpenTab(tab),
        editObjectArt: (id) => { if (classicZone) void editObjectArt(id, classicZone); },
        openRecent: (path) => void openProjectByPath(path),
      },
    );
  }, [tabs, activeId, engine, classicOpen, zoneTree, config, docReady, classicZone, recents,
      openProject, openProjectByPath, toggleExplorer]);

  return (
    <div style={styles.root}>
      {(error || classicError) && (
        <div style={styles.error}>
          <span style={{ whiteSpace: 'pre-line' }}>{error || classicError}</span>
          <button
            onClick={() => {
              if (error) useProjectStore.getState().setError(null);
              if (classicError) useClassicProjectStore.getState().clearError();
            }}
            style={styles.dismissButton}
          >
            Dismiss
          </button>
        </div>
      )}

      <div style={styles.body}>
        <Explorer onOpenProject={openProject} onOpenRecent={openProjectByPath} />
        <div style={styles.main}>
          <TabStrip />
          <div style={styles.content}>
            {/* Keep-alive: every non-level tab stays mounted; hidden via display:none
                so its state survives (spec §3). Level tabs all share the ONE
                LegacyWorkspace singleton below until Stages 3–4. */}
            {tabs.filter((t) => t.kind !== 'level').map((tab) => (
              <div key={tab.id} style={{ ...styles.tabPane, display: tab.id === activeId ? 'flex' : 'none' }}>
                {tab.kind === 'home' ? (
                  <HomeTab onOpenProject={openProject} onOpenRecent={openProjectByPath} />
                ) : tab.id === PROJECT_SETUP_TAB.id ? (
                  <ProjectSetupTab />
                ) : null}
              </div>
            ))}
            <div style={{ ...styles.tabPane, display: activeTab?.kind === 'level' ? 'flex' : 'none' }}>
              <LegacyWorkspace
                onOpenProject={openProject}
                onOpenRecent={openProjectByPath}
                onSave={saveAllDirty}
              />
            </div>
          </div>
        </div>
      </div>

      <ToastContainer />
      <CommandPalette commands={commands} />
      <ConfirmDialog />
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  root: {
    display: 'flex', flexDirection: 'column', height: '100vh',
    background: T.surface, color: T.textHi,
  },
  body: { flex: 1, display: 'flex', overflow: 'hidden' },
  main: { flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' },
  content: { flex: 1, display: 'flex', overflow: 'hidden', position: 'relative' },
  tabPane: { flex: 1, minWidth: 0, overflow: 'hidden' },
  error: {
    padding: '6px 12px', background: T.error, color: T.void,
    fontSize: 13, display: 'flex', alignItems: 'center', gap: 8,
  },
  dismissButton: {
    padding: '2px 8px', background: 'rgba(0,0,0,0.2)', border: 'none',
    color: T.void, borderRadius: 4, cursor: 'pointer', fontSize: 12,
  },
};
```

- [ ] **Step 4: Delete save-routing**

```bash
git rm src/renderer/state/save-routing.ts src/renderer/state/__tests__/save-routing.test.ts
grep -rn "save-routing\|routeClassicSave" src   # MUST print nothing
```

- [ ] **Step 5: Full suite + typecheck**

Run: `npx vitest run` and `npx tsc --noEmit`
Expected: all suites pass (save-routing's 1 file removed; every new suite present); tsc clean. Fix any import drift (e.g. `LoadedS4Config` zone/act property names) against the real types — behavior decisions are already locked above.

- [ ] **Step 6: Manual smoke (dev run)**

Run `npm run dev` from the worktree and verify, for BOTH an S1 disassembly and an aeon project:
1. Boot with no project → Home with Open/recents; explorer shows Recent Projects; ⌘K offers recents.
2. Open a project → first level tab opens focused and renders the old editor; explorer shows Levels/(Object Library)/Tools; tab strip shows Home + act.
3. Open more level tabs; classic: edit → switch act tab → confirm dialog appears; Cancel keeps everything.
4. Ctrl+S saves (toast on failure only); dirty dots track edits.
5. Project Setup: rows render grouped with status lights; edit a path → live light; Apply → project re-opens, report updates.
6. Ctrl+B collapses the explorer to the rail; Ctrl+1..9 jumps tabs; ⌘K "Go to tab", "Open level", "Edit art" work.
7. Quit and relaunch → session restores (same tabs, same active act).

If the GUI can't be driven in this environment, run the app long enough to confirm it boots without console errors and defer the click-through to the user's review checklist.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat(shell): assemble the tabbed shell — explorer, home, setup, session restore"
```

---

### Task 17: Whole-stage verification

**Files:** none

- [ ] **Step 1: Full suite, typecheck, hygiene**

From the worktree root:

```bash
npx vitest run          # every suite green; count > 1179 baseline
npx tsc --noEmit        # silent
git status --short      # nothing unexpected
git log --oneline master..HEAD   # every commit type(scope): summary, no trailers
```

- [ ] **Step 2: Cross-check against the stage 2 scope**

Confirm each item has landed: tab strip ✓ (Task 13/16) · explorer grouped/filterable/collapsible + Ctrl+B rail ✓ (9/10/13) · Home ✓ (14) · ⌘K rewired ✓ (11/16) · Project Setup + mapping layer wiring ✓ (3/4/12/15) · session persistence keyed by project path ✓ (1/8/16) · hub/coordinator ownership ✓ (5) · sidecar parsers merged ✓ (3/4) · save-routing retired ✓ (16).

- [ ] **Step 3: Mark the stage**

```bash
git commit --allow-empty -m "chore(shell): stage 2 shell complete (tabs, explorer, home, setup, sessions)"
```

Then request the whole-stage code review (superpowers:requesting-code-review) before any merge; merging to master is the user's call (superpowers:finishing-a-development-branch).

---

## Self-review (performed at authoring time)

- **Spec coverage (stage 2 scope, §12.2 + notes):** tab strip §3 → Tasks 13/16; explorer §3 (groups, counts, filter, Ctrl+B rail, no-project groups) → 9/10/13; Home §3 → 14; ⌘K §3 → 11/16; Project Setup + mapping §7 → 3/4/12/15; session persistence §10 → 1/8/16; watch-list #3 (merge sidecar parsers, per-entry diagnostics) → 3/4; #4 (hub/coordinator ownership) → 5; #5 (tab focus-by-index; reorder explicitly deferred) → 7 (`requestFocusIndex`); #2 (schema growth) → deferred by locked decision, storage key versioned; #6 — renderer code imports `FacetCapability` nowhere this stage (facet rendering is Stage 3); #7 — no new behavioral registries added, `createRegistry` untouched.
- **Not in scope, on purpose:** watch-list #1 (renderer facet registry) is Stage 3 — nothing here renders facets; Converter/Import tool tabs (Stage 5); drag-reorder of tabs; per-tab viewport persistence.
- **Placeholders:** two intentional adapt-to-file spots remain — Task 4 Step 1 (`s1-adapter.test.ts` fake-tree helper names) and Task 16 Step 1 (LegacyWorkspace moves existing code verbatim rather than reprinting all ~70 lines); both instruct the implementer to read the source file first and change nothing behavioral. Task 12 flags `groupEntriesByZone`'s shape for the same reason. All other steps carry complete code.
- **Type consistency spot-checks:** `SidecarState`/`ConfigIssue` defined in Task 3, consumed in 4/14/15; `ExplorerGroupModel` (9) consumed by 10/13; `DirtySnapshot` (6) consumed by 13; `TabDescriptor` flows session → tabs.ts → activation/commands/lifecycle; `requestOpenTab`/`activateLevelTarget` (7) consumed by 13/14/16; `applyPathEdits`/`buildSetupRows` (12) consumed by 15; `saveAllDirty`/`ensureSaversRegistered`/`registerAeonSaver` (5) consumed by 16. `pruneSession` exported from `core/shell/session.ts` and imported by `session-storage.ts` via the same module.
- **Behavior parity risks called out in-code:** aeon saver stale-project guard (Task 5), classic act-switch data loss guard (Task 7), sprite-art dot lingering after save (Task 6 comment), boot-time session-save quiescence (Task 16 `keyRef` sentinel).

