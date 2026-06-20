# Collision Authoring — Phase 2a Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use `- [ ]` checkbox syntax.

**Goal:** Paint real collision profiles onto the map — pick a collision shape from a palette of the level's profiles and paint it per 16px cell, see it live, undo it, persist it.

**Architecture:** A SEPARATE editable plane `Section.collisionEdit` (real attr indices, never `tileGrid.collision` — which carries chunk 2-bit flags), a SEPARATE store field `selectedCollisionProfile` (never `selectedCollisionType` — the 0-15 art nibble), and a new `set-collision-edit` command. Seeded from the strips on load (clone), persisted to `.collattr.bin`. The path-A view renders `collisionEdit`. See `docs/specs/2026-06-20-collision-authoring-design.md`. Verified against the codebase.

**Tech Stack:** TypeScript, React 19, Zustand, Vitest, canvas 2D.

---

## File Structure
- **Create** `src/core/formats/s4-collattr.ts` + `test/formats/s4-collattr.test.ts`
- **Create** `src/core/collision/collision-cell.ts` + `test/collision/collision-cell.test.ts`
- **Modify** `src/core/editing/commands.ts` (+ `SetCollisionEditCommand`), `src/core/editing/history.ts` (apply+undo) + `test/editing/set-collision-edit.test.ts`
- **Modify** `src/core/model/s4-types.ts` (`Section.collisionEdit`)
- **Modify** `src/renderer/hooks/useProject.ts` (load seed + save write)
- **Modify** `src/renderer/state/editorStore.ts` (`selectedCollisionProfile`)
- **Modify** `src/renderer/canvas/OverlayRenderer.ts` + `src/renderer/components/MapViewport.tsx` (view reads collisionEdit; paint handler)
- **Create** `src/renderer/components/CollisionPalette.tsx`; **Modify** `src/renderer/App.tsx` (mount)

Gate every task: `npx tsc --noEmit && npm test && npm run build` green; raw-hex guardrail 0.

---

## Task A: `s4-collattr` format (pure)

**Files:** Create `src/core/formats/s4-collattr.ts`, `test/formats/s4-collattr.test.ts`

- [ ] **Step 1: Failing test**
```ts
// test/formats/s4-collattr.test.ts
import { describe, it, expect } from 'vitest';
import { parseCollAttr, serializeCollAttr } from '../../src/core/formats/s4-collattr';

describe('s4-collattr', () => {
  it('round-trips the editable collision attr plane (identity bytes)', () => {
    const src = new Uint8Array([0, 1, 52, 200, 255, 0]);
    const out = parseCollAttr(serializeCollAttr(src));
    expect(Array.from(out)).toEqual(Array.from(src));
  });
  it('parse/serialize return fresh copies (no aliasing)', () => {
    const src = new Uint8Array([1, 2, 3]);
    const ser = serializeCollAttr(src); ser[0] = 9;
    expect(src[0]).toBe(1);
    const par = parseCollAttr(src); par[0] = 9;
    expect(src[0]).toBe(1);
  });
});
```
- [ ] **Step 2:** `npx vitest run test/formats/s4-collattr.test.ts` → FAIL (module not found).
- [ ] **Step 3: Implement**
```ts
// src/core/formats/s4-collattr.ts
// Editable collision attr-index plane (0-255 per tile) — its own file format so it
// never collides with the legacy crude .coll.bin. Identity bytes (like s4-collision).
export function parseCollAttr(data: Uint8Array): Uint8Array {
  return new Uint8Array(data);
}
export function serializeCollAttr(collisionEdit: Uint8Array): Uint8Array {
  return new Uint8Array(collisionEdit);
}
```
- [ ] **Step 4:** rerun → PASS.
- [ ] **Step 5:** `git add ... && git commit -m "feat(collision): s4-collattr — editable collision attr plane format"`

---

## Task B: `cellTileIndices` (pure)

**Files:** Create `src/core/collision/collision-cell.ts`, `test/collision/collision-cell.test.ts`

- [ ] **Step 1: Failing test**
```ts
// test/collision/collision-cell.test.ts
import { describe, it, expect } from 'vitest';
import { cellTileIndices } from '../../src/core/collision/collision-cell';

describe('cellTileIndices', () => {
  it('returns the 4 tile indices of a 16px cell (2x2 tiles), row-major', () => {
    // cell (0,0) in a 256-wide grid -> tiles (0,0),(1,0),(0,1),(1,1)
    expect(cellTileIndices(0, 0, 256)).toEqual([0, 1, 256, 257]);
    // cell (3,5): tileCol=6, tileRow=10 -> 10*256+6=2566, +1, +256, +257
    expect(cellTileIndices(3, 5, 256)).toEqual([2566, 2567, 2822, 2823]);
  });
});
```
- [ ] **Step 2:** run → FAIL.
- [ ] **Step 3: Implement**
```ts
// src/core/collision/collision-cell.ts
// A 16px collision cell = the 2x2 block of 8px tiles. Both tiles of each axis
// carry the same engine attr byte, so painting a cell writes all four indices.
export function cellTileIndices(cellCol: number, cellRow: number, width: number): number[] {
  const tc = cellCol * 2, tr = cellRow * 2;
  return [tr * width + tc, tr * width + tc + 1, (tr + 1) * width + tc, (tr + 1) * width + tc + 1];
}
```
- [ ] **Step 4:** run → PASS.
- [ ] **Step 5:** commit `feat(collision): cellTileIndices helper (16px cell -> 4 tile indices)`

---

## Task C: `set-collision-edit` command

**Files:** Modify `src/core/editing/commands.ts`, `src/core/editing/history.ts`; Create `test/editing/set-collision-edit.test.ts`

- [ ] **Step 1: Failing test**
```ts
// test/editing/set-collision-edit.test.ts
import { describe, it, expect } from 'vitest';
import { EditHistory } from '../../src/core/editing/history';
import { createSection } from '../../src/core/model/s4-types';
import type { S4Level } from '../../src/core/editing/commands';

function level(): S4Level {
  const s = createSection(0, 'S0');
  s.collisionEdit = new Uint8Array(256 * 256);
  return { sections: [s] };
}

describe('set-collision-edit', () => {
  it('applies and undoes attr writes on section.collisionEdit', () => {
    const h = new EditHistory();
    const lv = level();
    h.execute({ type: 'set-collision-edit', description: 'paint', sectionIndex: 0,
      entries: [{ index: 5, oldColl: 0, newColl: 40 }, { index: 6, oldColl: 0, newColl: 40 }] }, lv);
    expect(lv.sections[0]!.collisionEdit![5]).toBe(40);
    expect(lv.sections[0]!.collisionEdit![6]).toBe(40);
    h.undo(lv);
    expect(lv.sections[0]!.collisionEdit![5]).toBe(0);
    expect(lv.sections[0]!.collisionEdit![6]).toBe(0);
  });
  it('no-ops safely when collisionEdit is null', () => {
    const h = new EditHistory();
    const s = createSection(0, 'S0'); // collisionEdit stays null
    const lv: S4Level = { sections: [s] };
    expect(() => h.execute({ type: 'set-collision-edit', description: 'x', sectionIndex: 0,
      entries: [{ index: 0, oldColl: 0, newColl: 1 }] }, lv)).not.toThrow();
  });
});
```
- [ ] **Step 2:** run → FAIL.
- [ ] **Step 3: Implement.** In `commands.ts`, after `SetCollisionCommand` (line 25):
```ts
export interface SetCollisionEditCommand extends EditCommand {
  type: 'set-collision-edit';
  entries: Array<{ index: number; oldColl: number; newColl: number }>;
}
```
Add `| SetCollisionEditCommand` to the `AnyCommand` union (near line 155, beside `| SetCollisionCommand`).
In `history.ts` `applyCommand` switch, after the `set-collision` case (line 131):
```ts
    case 'set-collision-edit':
      if (section.collisionEdit) {
        for (const e of cmd.entries) section.collisionEdit[e.index] = e.newColl;
      }
      break;
```
In `history.ts` `undoCommand` switch, after the `set-collision` case (line 246):
```ts
    case 'set-collision-edit':
      if (section.collisionEdit) {
        for (const e of cmd.entries) section.collisionEdit[e.index] = e.oldColl;
      }
      break;
```
- [ ] **Step 4:** run → PASS.
- [ ] **Step 5:** commit `feat(collision): set-collision-edit command (edits Section.collisionEdit, undoable)`

---

## Task D: model + load seed + save write

**Files:** Modify `src/core/model/s4-types.ts`, `src/renderer/hooks/useProject.ts`

- [ ] **Step 1: Add the model field.** In `s4-types.ts` `Section`, after `engineCollisionB?: Uint8Array | null;`:
```ts
  /** Editable real-attr (0-255) collision plane — the authored path-A collision.
   *  Seeded from the strips (clone) or a saved .collattr.bin; rendered by the view
   *  and written by set-collision-edit. Separate from tileGrid.collision (legacy
   *  chunk/nibble) and engineCollision (read-only strip reference). */
  collisionEdit?: Uint8Array | null;
```
(No change to `createSection`; the field is optional and seeded at load.)

- [ ] **Step 2: Load seed.** In `useProject.ts`, in the strip block, after `section.engineCollisionB = engineCollB;` (line 427):
```ts
              // Editable collision plane: a saved .collattr.bin if present, else a
              // CLONE of the strip path-A (so paints don't mutate the diff baseline).
              try {
                const caRaw = await readFile(basePath, `${prefix}.collattr.bin`);
                section.collisionEdit = parseCollAttr(caRaw);
              } catch {
                section.collisionEdit = new Uint8Array(engineColl);
              }
```
Add the import near the other format imports at the top of `useProject.ts`:
```ts
import { parseCollAttr, serializeCollAttr } from '../../core/formats/s4-collattr';
```

- [ ] **Step 3: Save write.** In `useProject.ts` `saveProject`, after the `.coll.bin` write (line 161):
```ts
        // Write editable collision attr plane (.collattr.bin) — the real authored
        // collision, separate from the legacy .coll.bin.
        if (section.collisionEdit) {
          const caData = serializeCollAttr(section.collisionEdit);
          await window.api.writeBinaryFile(basePath, `${prefix}.collattr.bin`, caData.buffer as ArrayBuffer);
        }
```

- [ ] **Step 4: Verify** `npx tsc --noEmit && npm test && npm run build` → green.
- [ ] **Step 5:** commit `feat(collision): collisionEdit model field + load seed + .collattr.bin save`

---

## Task E: `selectedCollisionProfile` store field

**Files:** Modify `src/renderer/state/editorStore.ts`

- [ ] **Step 1.** Add to the state interface (after `selectedCollisionType: number;`, line 85):
```ts
  selectedCollisionProfile: number; // 0-255 attr index for the map collision palette
```
Add to the actions interface (after `setSelectedCollisionType`, line 98):
```ts
  setSelectedCollisionProfile: (index: number) => void;
```
Add the default (after `selectedCollisionType: 0,`, line 128): `selectedCollisionProfile: 0,`
Add the setter (after `setSelectedCollisionType`, line 141):
```ts
  setSelectedCollisionProfile: (index) => set({ selectedCollisionProfile: Math.max(0, Math.min(255, index | 0)) }),
```
- [ ] **Step 2: Verify** tsc+test+build green.
- [ ] **Step 3:** commit `feat(collision): selectedCollisionProfile store field (0-255, separate from art nibble)`

---

## Task F: view renders collisionEdit (path A)

**Files:** Modify `src/renderer/canvas/OverlayRenderer.ts`, `src/renderer/components/MapViewport.tsx`

- [ ] **Step 1: Overlay.** In `OverlayRenderer.render`, the collision block currently starts `const a = info.section.engineCollision ?? info.section.tileGrid.collision;` (the path-A source). Change it to prefer the editable plane:
```ts
        const a = info.section.collisionEdit ?? info.section.engineCollision ?? info.section.tileGrid.collision;
```
(The `b` path-B source stays `info.section.engineCollisionB ?? null`. Everything else unchanged.)

- [ ] **Step 2: Hover.** In `MapViewport.tsx` hover (the line `const coll = (pathB ? (section.engineCollisionB ?? section.engineCollision) : section.engineCollision) ?? section.tileGrid.collision;`), change the non-pathB branch to prefer collisionEdit:
```ts
            const coll = (pathB
              ? (section.engineCollisionB ?? section.engineCollision)
              : (section.collisionEdit ?? section.engineCollision)) ?? section.tileGrid.collision;
```
- [ ] **Step 3: Verify** green.
- [ ] **Step 4:** commit `feat(collision): render the editable collisionEdit plane for path A`

---

## Task G: collision profile palette

**Files:** Create `src/renderer/components/CollisionPalette.tsx`; Modify `src/renderer/App.tsx`

- [ ] **Step 1: Implement the palette.** Thumbnails of profiles `1..solidCount-1` (each drawn via `columnSolidRun` tinted by solidity) + an Erase (air) swatch; click sets `selectedCollisionProfile`.
```tsx
// src/renderer/components/CollisionPalette.tsx
import React, { useEffect, useRef } from 'react';
import { useEditorStore } from '../state/editorStore';
import { useProjectStore } from '../state/projectStore';
import { columnSolidRun } from '../../core/collision/collision-render';
import type { CollisionProfile, Solidity } from '../../core/collision/collision-model';
import { T } from './ui';
import {
  COLLISION_FILL_ALL, COLLISION_FILL_TOP, COLLISION_FILL_SIDES, COLLISION_FILL_NONE, COLLISION_SURFACE_LINE,
} from '../canvas/canvas-colors';

const PX = 22; // thumbnail size

function solidityFill(s: Solidity): string {
  return s === 'all' ? COLLISION_FILL_ALL : s === 'top' ? COLLISION_FILL_TOP
    : s === 'sides-bottom' ? COLLISION_FILL_SIDES : COLLISION_FILL_NONE;
}

function Thumb({ profile }: { profile: CollisionProfile }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const ctx = ref.current?.getContext('2d');
    if (!ctx) return;
    const s = PX / 16;
    ctx.clearRect(0, 0, PX, PX);
    ctx.fillStyle = solidityFill(profile.solidity);
    for (let c = 0; c < 16; c++) {
      const run = columnSolidRun(profile.heights[c]);
      if (run) ctx.fillRect(c * s, run.y * s, s, run.h * s);
    }
    ctx.strokeStyle = COLLISION_SURFACE_LINE; ctx.lineWidth = 1;
    for (let c = 0; c < 16; c++) {
      const h = profile.heights[c]; const run = columnSolidRun(h);
      if (!run) continue;
      const y = (h >= 0 ? run.y : run.y + run.h) * s;
      ctx.beginPath(); ctx.moveTo(c * s, y); ctx.lineTo((c + 1) * s, y); ctx.stroke();
    }
  }, [profile]);
  return <canvas ref={ref} width={PX} height={PX} style={{ display: 'block' }} />;
}

export default function CollisionPalette() {
  const profiles = useProjectStore((s) => s.collisionProfiles);
  const selected = useEditorStore((s) => s.selectedCollisionProfile);
  const set = useEditorStore((s) => s.setSelectedCollisionProfile);

  if (!profiles) return <div style={styles.note}>Collision tables not found — open a project with collision data.</div>;

  const indices = [];
  for (let i = 1; i < profiles.solidCount; i++) indices.push(i);

  return (
    <div>
      <div style={styles.hint}>Pick a shape, then paint cells on the map. These are the level's profiles.</div>
      <div style={styles.grid}>
        <button title="Erase (air)" onClick={() => set(0)} style={{ ...styles.cell, ...(selected === 0 ? styles.sel : {}) }}>
          <span style={styles.erase}>∅</span>
        </button>
        {indices.map((i) => (
          <button key={i} title={`#${i} · ${profiles.profiles[i].solidity}`} onClick={() => set(i)}
            style={{ ...styles.cell, ...(selected === i ? styles.sel : {}) }}>
            <Thumb profile={profiles.profiles[i]} />
          </button>
        ))}
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  hint: { fontSize: 10, color: T.textLo, padding: `0 ${T.s2} ${T.s2}` },
  note: { fontSize: 11, color: T.textLo, padding: T.s2 },
  grid: { display: 'flex', flexWrap: 'wrap', gap: 4, padding: `0 ${T.s2} ${T.s2}` },
  cell: {
    width: PX + 6, height: PX + 6, padding: 2, background: T.overlay,
    border: `1px solid ${T.border}`, borderRadius: T.rSm, cursor: 'pointer',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
  },
  sel: { outline: `2px solid ${T.accent}`, outlineOffset: -1 },
  erase: { color: T.textLo, fontSize: 14 },
};
```

- [ ] **Step 2: Mount it.** In `App.tsx`, after the `place-ring` panel block (line 117), add:
```tsx
              {tool === 'paint-collision' && (
                <CollapsibleSection id="map.palette" title="Collision">
                  <CollisionPalette />
                </CollapsibleSection>
              )}
```
Add the import with the other map component imports: `import CollisionPalette from './components/CollisionPalette';`

- [ ] **Step 3: Verify** green; raw-hex guardrail 0 (palette uses `T` + `canvas-colors` rgba tokens only).
- [ ] **Step 4:** commit `feat(collision): profile palette panel (paint-collision tool)`

---

## Task H: paint the cell

**Files:** Modify `src/renderer/components/MapViewport.tsx`

- [ ] **Step 1: Add a last-painted-cell ref** near the other refs (e.g. beside `isPaintDragging`):
```ts
  const lastPaintedCell = useRef<string | null>(null);
```
Add the import: `import { cellTileIndices } from '../../core/collision/collision-cell';`

- [ ] **Step 2: A shared paint helper** (inside the component, near the other paint helpers). It paints the 16px cell containing `info` with the selected profile via `set-collision-edit`, deduped by cell:
```ts
  function paintCollisionCell(info: { sectionIndex: number; col: number; row: number }) {
    const section = getSectionByIndex(info.sectionIndex);
    if (!section || !section.collisionEdit) return;
    const cellKey = `${info.sectionIndex}:${info.col >> 1}:${info.row >> 1}`;
    if (lastPaintedCell.current === cellKey) return;
    lastPaintedCell.current = cellKey;
    const profile = useEditorStore.getState().selectedCollisionProfile;
    const indices = cellTileIndices(info.col >> 1, info.row >> 1, SECTION_TILES_WIDE);
    const entries = indices
      .map((index) => ({ index, oldColl: section.collisionEdit![index], newColl: profile }))
      .filter((e) => e.oldColl !== e.newColl);
    if (entries.length === 0) return;
    executeCommand({
      type: 'set-collision-edit',
      description: `Paint collision at cell (${info.col >> 1}, ${info.row >> 1})`,
      sectionIndex: info.sectionIndex,
      entries,
    }, level);
    useEditorStore.getState().setActiveSectionIndex(info.sectionIndex);
  }
```

- [ ] **Step 3: Replace the click handler** (the `if (tool === 'paint-collision') { ... }` block at lines 627-646):
```ts
    if (tool === 'paint-collision') {
      const info = worldToSectionTile(world.x, world.y);
      if (!info) return;
      lastPaintedCell.current = null;
      paintCollisionCell(info);
      isPaintDragging.current = true;
      e.preventDefault();
      return;
    }
```

- [ ] **Step 4: Replace the drag branch** (the `else { ... set-collision ... }` block at lines 742-753) with:
```ts
      } else {
        paintCollisionCell(info);
      }
```

- [ ] **Step 5: Verify** `npx tsc --noEmit && npm test && npm run build` green.
- [ ] **Step 6:** commit `feat(collision): paint real profiles per 16px cell (set-collision-edit), undoable`

---

## Self-review checklist
- **Spec coverage:** §3 collisionEdit + load seed (clone) + .collattr.bin save (D) ✓; §4 view renders collisionEdit (F) ✓; §5 palette (G) ✓; §6 per-cell paint + dedupe + new command (B,C,H) ✓; §7 separate `selectedCollisionProfile` (E) ✓.
- **No collision with legacy:** `tileGrid.collision` and `selectedCollisionType` are untouched; chunk stamping + art stepper unaffected.
- **Type consistency:** `set-collision-edit`/`SetCollisionEditCommand`, `collisionEdit`, `selectedCollisionProfile`, `cellTileIndices`, `parseCollAttr`/`serializeCollAttr` match across tasks.
- **Diff baseline:** `collisionEdit` is seeded as a clone of `engineColl`, so unedited sections show no false A/B diffs.

## Manual verification (user, morning)
Load OJZ → View ▸ Collision shows real surfaces. Switch to the paint-collision tool → the Collision palette appears in the side panel. Pick a slope → paint cells → they change live to that shape/color. Pick Erase → cells go to air. Ctrl+Z reverts. Save, reopen → edits persist (`.collattr.bin`). Path B + A/B diff still work. Art-mode chunk collision stepper still behaves (0-15).
