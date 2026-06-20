# Collision Paint Plane (A/B) + View-Follows Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use `- [ ]` syntax.

**Goal:** Choose which collision plane (A or B) you paint, with an editable path-B layer, and the overlay automatically shows the plane you're editing.

**Architecture:** Mirror the Phase-2a path-A editable plane for B: add `Section.collisionEditB`, give `set-collision-edit` a `plane: 'a'|'b'` field, add `editorStore.collisionPaintPlane`, and a CollisionPalette A/B selector that sets the plane AND drives the View overlay (show the active plane, hide the other; the A/B diff stays reachable in the View menu). The path-B overlay + hover read the editable `collisionEditB`. See `docs/specs/2026-06-20-collision-authoring-v2-block-keyed-design.md` §8 (path-B authoring).

**Tech Stack:** TypeScript, React 19, Zustand, Vitest.

## File Structure
- **Modify** `src/core/editing/commands.ts` + `src/core/editing/history.ts` + `test/editing/set-collision-edit.test.ts` (plane field)
- **Modify** `src/core/model/s4-types.ts` (`collisionEditB`), `src/renderer/hooks/useProject.ts` (seed + save B), `src/renderer/state/editorStore.ts` (`collisionPaintPlane`)
- **Modify** `src/renderer/components/MapViewport.tsx` (paint targets the plane; hover shows editable B), `src/renderer/canvas/OverlayRenderer.ts` (path B = editable B), `src/renderer/components/CollisionPalette.tsx` (A/B selector + view-follows)

Gate: `npx tsc --noEmit && npm test && npm run build` green; raw-hex 0.

---

## Task A: `set-collision-edit` gains a `plane` field

**Files:** Modify `src/core/editing/commands.ts`, `src/core/editing/history.ts`, `test/editing/set-collision-edit.test.ts`

- [ ] **Step 1: Update the test** (`test/editing/set-collision-edit.test.ts`) — add `plane` to the existing commands and a path-B case. Replace the existing `describe`'s two `it`s with:
```ts
  it('applies and undoes attr writes on the chosen plane', () => {
    const h = new EditHistory();
    const lv = level();
    lv.sections[0]!.collisionEditB = new Uint8Array(256 * 256);
    h.execute({ type: 'set-collision-edit', plane: 'a', description: 'paint', sectionIndex: 0,
      entries: [{ index: 5, oldColl: 0, newColl: 40 }] }, lv);
    h.execute({ type: 'set-collision-edit', plane: 'b', description: 'paint', sectionIndex: 0,
      entries: [{ index: 7, oldColl: 0, newColl: 12 }] }, lv);
    expect(lv.sections[0]!.collisionEdit![5]).toBe(40);
    expect(lv.sections[0]!.collisionEditB![7]).toBe(12);
    expect(lv.sections[0]!.collisionEditB![5]).toBe(0); // A's write didn't touch B
    h.undo(lv); // undo the B paint
    expect(lv.sections[0]!.collisionEditB![7]).toBe(0);
    expect(lv.sections[0]!.collisionEdit![5]).toBe(40); // A unaffected
  });
  it('no-ops safely when the target plane is null', () => {
    const h = new EditHistory();
    const s = createSection(0, 'S0'); // collisionEdit + collisionEditB null
    const lv: S4Level = { sections: [s] };
    expect(() => h.execute({ type: 'set-collision-edit', plane: 'b', description: 'x', sectionIndex: 0,
      entries: [{ index: 0, oldColl: 0, newColl: 1 }] }, lv)).not.toThrow();
  });
```
- [ ] **Step 2:** `npx vitest run test/editing/set-collision-edit.test.ts` → FAIL (no `plane`).
- [ ] **Step 3: Implement.** In `commands.ts` `SetCollisionEditCommand` (line 27):
```ts
export interface SetCollisionEditCommand extends EditCommand {
  type: 'set-collision-edit';
  plane: 'a' | 'b';
  entries: Array<{ index: number; oldColl: number; newColl: number }>;
}
```
In `history.ts` applyCommand (line 132) and undoCommand (line 252), replace the `set-collision-edit` case (apply uses `newColl`, undo uses `oldColl`):
```ts
    case 'set-collision-edit': {
      const arr = cmd.plane === 'b' ? section.collisionEditB : section.collisionEdit;
      if (arr) for (const e of cmd.entries) arr[e.index] = e.newColl; // undo: e.oldColl
      break;
    }
```
- [ ] **Step 4:** rerun → PASS. (Note: `collisionEditB` is added to `Section` in Task B; if tsc errors in isolation, that's expected — the full gate runs after Task B.)
- [ ] **Step 5:** commit `feat(collision): set-collision-edit targets plane A or B`

---

## Task B: editable path B + plane selector + view-follows

**Files:** Modify `s4-types.ts`, `useProject.ts`, `editorStore.ts`, `MapViewport.tsx`, `OverlayRenderer.ts`, `CollisionPalette.tsx`

- [ ] **Step 1: Model.** In `s4-types.ts` `Section`, after `collisionEdit?: Uint8Array | null;`:
```ts
  /** Editable path-B collision plane (the alternate/loop layer), mirror of
   *  collisionEdit. Seeded from engineCollisionB or a saved .collattrb.bin. */
  collisionEditB?: Uint8Array | null;
```

- [ ] **Step 2: Load seed + save (B).** In `useProject.ts`, right after the `collisionEdit` seed (line 443, the `catch { section.collisionEdit = new Uint8Array(engineColl); }`):
```ts
              try {
                const cbRaw = await readFile(basePath, `${prefix}.collattrb.bin`);
                section.collisionEditB = parseCollAttr(cbRaw);
              } catch {
                section.collisionEditB = new Uint8Array(engineCollB);
              }
```
In `saveProject`, after the `.collattr.bin` write (line 168):
```ts
        if (section.collisionEditB) {
          const cbData = serializeCollAttr(section.collisionEditB);
          await window.api.writeBinaryFile(basePath, `${prefix}.collattrb.bin`, cbData.buffer as ArrayBuffer);
        }
```

- [ ] **Step 3: Store.** In `editorStore.ts`: add `collisionPaintPlane: 'a' | 'b';` to the state interface (after `selectedCollisionProfile`), `setCollisionPaintPlane: (plane: 'a' | 'b') => void;` to the actions, the default `collisionPaintPlane: 'a',`, and the setter `setCollisionPaintPlane: (collisionPaintPlane) => set({ collisionPaintPlane }),`.

- [ ] **Step 4: Paint targets the plane** (`MapViewport.tsx` `paintCollisionCell`). Replace the lazy-seed + `ce` block with plane-aware seeding:
```ts
    const section = getSectionByIndex(info.sectionIndex);
    if (!section) return;
    const plane = useEditorStore.getState().collisionPaintPlane;
    // Lazily seed the target plane (clone its engine baseline) if missing.
    if (plane === 'b') {
      if (!section.collisionEditB) section.collisionEditB = section.engineCollisionB
        ? new Uint8Array(section.engineCollisionB) : new Uint8Array(SECTION_TILES_WIDE * SECTION_TILES_HIGH);
    } else if (!section.collisionEdit) {
      section.collisionEdit = section.engineCollision
        ? new Uint8Array(section.engineCollision) : new Uint8Array(SECTION_TILES_WIDE * SECTION_TILES_HIGH);
    }
    const ce = (plane === 'b' ? section.collisionEditB : section.collisionEdit)!;
```
And add `plane` to the `executeCommand` call:
```ts
    executeCommand({
      type: 'set-collision-edit',
      plane,
      description: justHere ? `Paint collision ${plane.toUpperCase()} (this block)` : `Paint collision ${plane.toUpperCase()} (${targets.length} matching blocks)`,
      sectionIndex: info.sectionIndex,
      entries,
    }, level);
```

- [ ] **Step 5: View shows editable B.** In `OverlayRenderer.ts` line 58, change the path-B source to prefer the editable plane:
```ts
        const b = info.section.collisionEditB ?? info.section.engineCollisionB ?? null;
```
In `MapViewport.tsx` hover (line ~857-859), change the path-B branch:
```ts
            const coll = (pathB
              ? (section.collisionEditB ?? section.engineCollisionB ?? section.engineCollision)
              : (section.collisionEdit ?? section.engineCollision)) ?? section.tileGrid.collision;
```

- [ ] **Step 6: Palette A/B selector + view-follows.** In `CollisionPalette.tsx`: import `useViewStore` (`import { useViewStore } from '../state/viewStore';`); read the plane (`const plane = useEditorStore((s) => s.collisionPaintPlane);`); add a `pickPlane` helper + a mount effect; render the selector above the hint.
```tsx
  function pickPlane(p: 'a' | 'b') {
    useEditorStore.getState().setCollisionPaintPlane(p);
    const v = useViewStore.getState();
    v.setOverlay('showCollision', p === 'a');        // show the plane you're editing,
    v.setOverlay('showCollisionPathB', p === 'b');   // hide the other (diff is in the View menu)
  }
  useEffect(() => { pickPlane(plane); /* show the active plane when the tool opens */ // eslint-disable-next-line
  }, []);
```
Render, just inside the returned `<div>` before the hint:
```tsx
      <div style={styles.planes}>
        <span style={styles.planeLabel}>Plane</span>
        <button onClick={() => pickPlane('a')} style={{ ...styles.planeBtn, ...(plane === 'a' ? styles.planeSel : {}) }}>A</button>
        <button onClick={() => pickPlane('b')} style={{ ...styles.planeBtn, ...(plane === 'b' ? styles.planeSel : {}) }}>B</button>
      </div>
```
Add the styles:
```tsx
  planes: { display: 'flex', alignItems: 'center', gap: 4, padding: `${T.s2} ${T.s2} 0` },
  planeLabel: { fontSize: 10, color: T.textLo, marginRight: 2 },
  planeBtn: { padding: `1px ${T.s2}`, background: T.overlay, color: T.textBase, border: `1px solid ${T.border}`, borderRadius: T.rSm, cursor: 'pointer', fontSize: 11, minWidth: 22 },
  planeSel: { background: T.accent, color: T.onAccent, borderColor: T.accent },
```
(`useEffect` is already imported in this file; confirm before adding.)

- [ ] **Step 7: Verify** `npx tsc --noEmit && npm test && npm run build` green; raw-hex 0 (palette uses `T` tokens only).
- [ ] **Step 8:** commit `feat(collision): paint plane A/B selector, editable path B, view follows the active plane`

---

## Self-review checklist
- **Spec coverage:** paint plane A or B (selector + editable collisionEditB + command plane field) ✓; view auto-shows the active plane (pickPlane sets the overlays; mount effect) ✓; per-plane undo (command targets one plane) ✓; persistence (.collattrb.bin) ✓.
- **No regression:** path-A painting unchanged when plane='a'; the A/B diff (both overlays on) still works via the View menu; engineCollision/B baselines untouched (clone on seed).
- **Type consistency:** `plane: 'a'|'b'` on the command; `collisionEditB`; `collisionPaintPlane` + setter.

## Manual verification (user)
Open the Collision tool → the palette shows a **Plane A / B** selector; A is active and the overlay shows plane A. Click **B** → the overlay switches to plane B; paint → plane B's collision changes (path A untouched). Switch back to **A** → see + edit A. Ctrl+Z undoes within the active plane. The View-menu A/B-diff still works. Save + reload → both planes persist.
