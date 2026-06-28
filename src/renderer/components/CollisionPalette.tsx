import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useEditorStore, executeCommand } from '../state/editorStore';
import { useProjectStore, getActiveLevel } from '../state/projectStore';
import { useViewStore } from '../state/viewStore';
import { SECTION_TILES_WIDE, SECTION_TILES_HIGH } from '../../core/model/s4-types';
import { angleDegrees } from '../../core/collision/collision-model';
import type { CollisionProfile } from '../../core/collision/collision-model';
import { resolvePlaneWords } from '../../core/collision/collision-cell-resolve';
import { flipProfile } from '../../core/collision/collision-flip';
import { organizePalette, effectiveXFlip } from '../../core/collision/collision-palette-organize';
import type { Solidity } from '../../core/collision/collision-model';
import { classifyProfile, COLLISION_KINDS } from '../../core/collision/collision-classify';
import type { CollisionKind } from '../../core/collision/collision-classify';
import { drawCollisionShape } from '../../core/collision/collision-shape-draw';
import type { ShapeDrawOpts, ShapeDrawCtx } from '../../core/collision/collision-shape-draw';
import { T } from './ui';
import {
  COLLISION_SHAPE_FILL, COLLISION_SHAPE_LINE, COLLISION_SOLID_EDGE, COLLISION_ANGLE_NEEDLE,
} from '../canvas/canvas-colors';

const PX = 22;        // thumbnail size
const PREVIEW = 120;  // big preview canvas size

/** Floor-type picker → the cell's solidity (which sensor directions it stops). */
const FLOOR_TYPES: ReadonlyArray<{ value: Solidity; label: string; title: string }> = [
  { value: 'all', label: 'Solid', title: 'Solid from every direction (normal ground/wall)' },
  { value: 'top', label: 'Jump-thru', title: 'One-way platform: only the top stops you; jump up through it' },
  { value: 'sides-bottom', label: 'L/R/B', title: 'Solid on left/right/bottom but NOT the top' },
  { value: 'none', label: 'None', title: 'No collision (bakes to air; keeps the shape for reference)' },
];
const FLOOR_LABEL: Record<Solidity, string> = {
  all: 'solid', top: 'jump-thru', 'sides-bottom': 'L/R/B', none: 'none',
};

const SHAPE_OPTS: ShapeDrawOpts = {
  fill: COLLISION_SHAPE_FILL,
  line: COLLISION_SHAPE_LINE,
  solidEdge: COLLISION_SOLID_EDGE,
  needle: COLLISION_ANGLE_NEEDLE,
  showSolidEdges: true,
  showNeedle: true,
};

/** Paint a single profile into a square canvas via drawCollisionShape. */
function ShapeCanvas({ profile, size }: { profile: CollisionProfile; size: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const ctx = ref.current?.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, size, size);
    // CanvasRenderingContext2D structurally satisfies ShapeDrawCtx; its fillStyle/
    // strokeStyle are a wider union, so narrow via the minimal shape we draw with.
    drawCollisionShape(ctx as unknown as ShapeDrawCtx, 0, 0, size, profile, SHAPE_OPTS);
  }, [profile, size]);
  return <canvas ref={ref} width={size} height={size} style={{ display: 'block' }} />;
}

export default function CollisionPalette() {
  const profiles = useProjectStore((s) => s.collisionProfiles);
  const selected = useEditorStore((s) => s.selectedCollisionProfile);
  const entryFlipX = useEditorStore((s) => s.selectedCollisionEntryFlipX);
  const pick = useEditorStore((s) => s.pickCollisionShape);
  const plane = useEditorStore((s) => s.collisionPaintPlane);
  const brush = useEditorStore((s) => s.collisionBrushSize);
  const setBrush = useEditorStore((s) => s.setCollisionBrushSize);
  const activeSection = useEditorStore((s) => s.activeSectionIndex);
  const xFlip = useEditorStore((s) => s.selectedCollisionXFlip);
  const yFlip = useEditorStore((s) => s.selectedCollisionYFlip);
  const solidity = useEditorStore((s) => s.selectedCollisionSolidity);
  const setXFlip = useEditorStore((s) => s.setSelectedCollisionXFlip);
  const setYFlip = useEditorStore((s) => s.setSelectedCollisionYFlip);
  const setSolidity = useEditorStore((s) => s.setSelectedCollisionSolidity);

  const [kind, setKind] = useState<'all' | CollisionKind>('all');

  // Wipe the active section's collision on the active plane (one undoable command).
  function clearSection() {
    const ed = useEditorStore.getState();
    const level = getActiveLevel(useProjectStore.getState());
    if (!level) return;
    const section = level.sections[ed.activeSectionIndex];
    if (!section) return;
    const p = ed.collisionPaintPlane;
    const N = SECTION_TILES_WIDE * SECTION_TILES_HIGH;
    if (p === 'b') {
      if (!section.collisionEditB) section.collisionEditB = resolvePlaneWords(null, section.engineCollisionB, N);
    } else if (!section.collisionEdit) {
      section.collisionEdit = resolvePlaneWords(null, section.engineCollision, N);
    }
    const ce = p === 'b' ? section.collisionEditB : section.collisionEdit;
    if (!ce) return;
    const entries: Array<{ index: number; oldColl: number; newColl: number }> = [];
    for (let i = 0; i < ce.length; i++) if (ce[i] !== 0) entries.push({ index: i, oldColl: ce[i], newColl: 0 });
    if (!entries.length) return;
    executeCommand({
      type: 'set-collision-edit', plane: p,
      description: `Clear collision ${p.toUpperCase()} (section ${ed.activeSectionIndex})`,
      sectionIndex: ed.activeSectionIndex, entries,
    }, level);
  }

  // Reset the active section's editable collision to the real engine baseline
  // (escape hatch for a section that drifted to empty/wrong). Undoable.
  function resetToEngine() {
    const ed = useEditorStore.getState();
    const level = getActiveLevel(useProjectStore.getState());
    if (!level) return;
    const section = level.sections[ed.activeSectionIndex];
    if (!section) return;
    const p = ed.collisionPaintPlane;
    const engine = p === 'b' ? section.engineCollisionB : section.engineCollision;
    if (!engine) return; // no baseline loaded — re-open the project first
    // The engine baseline is raw attr indices; pack it to cell words to compare/assign.
    const engineWords = resolvePlaneWords(null, engine, engine.length);
    if (p === 'b') {
      if (!section.collisionEditB) section.collisionEditB = resolvePlaneWords(null, engine, engine.length);
    } else if (!section.collisionEdit) {
      section.collisionEdit = resolvePlaneWords(null, engine, engine.length);
    }
    const ce = p === 'b' ? section.collisionEditB : section.collisionEdit;
    if (!ce) return;
    const entries: Array<{ index: number; oldColl: number; newColl: number }> = [];
    for (let i = 0; i < ce.length; i++) if (ce[i] !== engineWords[i]) entries.push({ index: i, oldColl: ce[i], newColl: engineWords[i] });
    if (!entries.length) return;
    executeCommand({
      type: 'set-collision-edit', plane: p,
      description: `Reset collision ${p.toUpperCase()} to engine (section ${ed.activeSectionIndex})`,
      sectionIndex: ed.activeSectionIndex, entries,
    }, level);
  }

  function pickPlane(p: 'a' | 'b') {
    useEditorStore.getState().setCollisionPaintPlane(p);
    const v = useViewStore.getState();
    v.setOverlay('showCollision', p === 'a');        // show the plane you're editing,
    v.setOverlay('showCollisionPathB', p === 'b');   // hide the other (diff is in the View menu)
  }
  // Show the active plane when the collision tool opens — but only if no collision
  // overlay is on yet, so an A/B-diff view the user set up in the View menu survives.
  useEffect(() => {
    const ov = useViewStore.getState().overlays;
    if (!ov.showCollision && !ov.showCollisionPathB) pickPlane(plane);
  }, []);

  // Every solid base shape re-oriented to canonical-LEFT, exact mirror-duplicates
  // collapsed, sorted by angle then fullness (least-full → most-full within an
  // angle). Display-only: painting stores the real base-bank shape + the mirror as
  // a flip flag, so the data stays the faithful S&K vocabulary. Filter by kind tab.
  const allEntries = useMemo(() => organizePalette(profiles), [profiles]);
  const entries = useMemo(
    () => (kind === 'all' ? allEntries : allEntries.filter((e) => classifyProfile(e.profile) === kind)),
    [allEntries, kind],
  );

  // Only show kind tabs that actually have shapes (classified on the canonical form).
  const presentKinds = useMemo(() => {
    const s = new Set<CollisionKind>();
    for (const e of allEntries) s.add(classifyProfile(e.profile));
    return s;
  }, [allEntries]);

  if (!profiles) return <div style={styles.note}>Collision tables not found — open a project with collision data.</div>;

  const selProfile = selected > 0 && selected < profiles.solidCount ? profiles.profiles[selected] : null;
  // The big preview shows what actually gets painted + baked: the base shape with
  // the EFFECTIVE flip (entry's canonical mirror XOR the user Flip-H) + solidity.
  const effXFlip = effectiveXFlip(entryFlipX, xFlip);
  const previewProfile = selProfile ? { ...flipProfile(selProfile, effXFlip, yFlip), solidity } : null;
  const selDeg = previewProfile ? angleDegrees(previewProfile) : null;

  return (
    <div>
      <div style={styles.planes}>
        <span style={styles.planeLabel}>Plane</span>
        <button onClick={() => pickPlane('a')} style={{ ...styles.planeBtn, ...(plane === 'a' ? styles.planeSel : {}) }}>A</button>
        <button onClick={() => pickPlane('b')} style={{ ...styles.planeBtn, ...(plane === 'b' ? styles.planeSel : {}) }}>B</button>
      </div>
      <div style={styles.planes}>
        <span style={styles.planeLabel}>Brush</span>
        {[1, 7, 15, 25].map((n) => (
          <button key={n} onClick={() => setBrush(n)} title={n === 1 ? 'Single block (reuses blocks with the same tiles)' : `${n}×${n} block area`}
            style={{ ...styles.planeBtn, ...(brush === n ? styles.planeSel : {}) }}>{n}</button>
        ))}
      </div>
      <div style={styles.planes}>
        <span style={styles.planeLabel}>Flip</span>
        <button onClick={() => setXFlip(!xFlip)} title="Mirror the shape horizontally (the other slope direction)"
          style={{ ...styles.planeBtn, ...(xFlip ? styles.planeSel : {}) }}>H ⇄</button>
        <button onClick={() => setYFlip(!yFlip)} title="Flip the shape vertically (floor ↔ ceiling)"
          style={{ ...styles.planeBtn, ...(yFlip ? styles.planeSel : {}) }}>V ⇅</button>
      </div>
      <div style={styles.planes}>
        <span style={styles.planeLabel}>Floor</span>
        {FLOOR_TYPES.map(({ value, label, title }) => (
          <button key={value} onClick={() => setSolidity(value)} title={title}
            style={{ ...styles.planeBtn, ...(solidity === value ? styles.planeSel : {}) }}>{label}</button>
        ))}
      </div>
      <div style={styles.planes}>
        <span style={styles.planeLabel}>Sec {activeSection}</span>
        <button onClick={resetToEngine} title={`Reset section ${activeSection} collision (this plane) to the engine baseline — undoable`}
          style={styles.subtleBtn}>Reset</button>
        <button onClick={clearSection} title={`Erase ALL collision in section ${activeSection} (this plane) — undoable`}
          style={styles.subtleBtn}>Clear</button>
      </div>
      <div style={styles.hint}>{brush > 1
        ? `Pick a shape, then paint on the map. Paints the ${brush}×${brush} block area under the cursor.`
        : 'Pick a shape, then paint on the map. Paints every block with the same tiles; hold Alt to paint just one.'}</div>

      <div style={styles.tabs}>
        <button onClick={() => setKind('all')} style={{ ...styles.planeBtn, ...(kind === 'all' ? styles.planeSel : {}) }}>All</button>
        {COLLISION_KINDS.filter((k) => presentKinds.has(k)).map((k) => (
          <button key={k} onClick={() => setKind(k)} style={{ ...styles.planeBtn, ...(kind === k ? styles.planeSel : {}) }}>{k}</button>
        ))}
      </div>

      <div style={styles.preview}>
        {selected === 0 || !previewProfile ? (
          <div style={styles.previewBox}>
            <span style={styles.erase}>∅</span>
          </div>
        ) : (
          <div style={styles.previewBox}>
            <ShapeCanvas profile={previewProfile} size={PREVIEW} />
          </div>
        )}
        <div style={styles.previewText}>
          {selected === 0 || !previewProfile
            ? 'Erase (air)'
            : `#${selected}${xFlip ? ' ⇄' : ''}${yFlip ? ' ⇅' : ''} · ${classifyProfile(previewProfile)} · ${selDeg ?? '—'}° · ${FLOOR_LABEL[solidity]}`}
        </div>
      </div>

      <div style={styles.grid}>
        <button title="Erase (air)" onClick={() => pick(0, false)} style={{ ...styles.cellWrap, ...(selected === 0 ? styles.sel : {}) }}>
          <span style={styles.eraseCell}>∅</span>
          <span style={styles.degLabel}>air</span>
        </button>
        {entries.map((e) => {
          const deg = angleDegrees(e.profile);
          const isSel = selected === e.shape && entryFlipX === e.mirrorX;
          return (
            <button key={`${e.shape}:${e.mirrorX ? 'm' : ''}`}
              title={`#${e.shape}${e.mirrorX ? ' (mirrored to face left)' : ''} · ${classifyProfile(e.profile)} · ${e.profile.solidity}`}
              onClick={() => pick(e.shape, e.mirrorX)} style={{ ...styles.cellWrap, ...(isSel ? styles.sel : {}) }}>
              <ShapeCanvas profile={e.profile} size={PX} />
              <span style={styles.degLabel}>{deg === null ? '—' : `${deg}°`}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  hint: { fontSize: 10, color: T.textLo, padding: `0 ${T.s2} ${T.s2}` },
  note: { fontSize: 11, color: T.textLo, padding: T.s2 },
  tabs: { display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 4, padding: `0 ${T.s2} ${T.s2}` },
  preview: { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, padding: `0 ${T.s2} ${T.s2}` },
  previewBox: {
    width: PREVIEW, height: PREVIEW, background: T.overlay,
    border: `1px solid ${T.border}`, borderRadius: T.rSm,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
  },
  previewText: { fontSize: 10, color: T.textBase, fontFamily: T.fontMono, textAlign: 'center' },
  grid: { display: 'flex', flexWrap: 'wrap', gap: 4, padding: `0 ${T.s2} ${T.s2}` },
  cellWrap: {
    width: PX + 6, padding: 2, background: T.overlay,
    border: `1px solid ${T.border}`, borderRadius: T.rSm, cursor: 'pointer',
    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 1,
  },
  sel: { outline: `2px solid ${T.accent}`, outlineOffset: -1 },
  eraseCell: {
    width: PX, height: PX, color: T.textLo, fontSize: 14,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
  },
  erase: { color: T.textLo, fontSize: 36 }, // big-preview empty (air) state

  degLabel: { fontSize: 8, lineHeight: '8px', color: T.textLo },
  planes: { display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 4, padding: `${T.s2} ${T.s2} 0` },
  planeLabel: { fontSize: 10, color: T.textLo, marginRight: 2, minWidth: 38, flexShrink: 0 },
  planeBtn: { padding: `2px ${T.s2}`, background: T.overlay, color: T.textBase, border: `1px solid ${T.border}`, borderRadius: T.rSm, cursor: 'pointer', fontSize: 11, minWidth: 26, textAlign: 'center' },
  planeSel: { background: T.accent, color: T.onAccent, borderColor: T.accent },
  subtleBtn: { padding: `2px ${T.s2}`, background: 'transparent', color: T.textLo, border: `1px solid ${T.border}`, borderRadius: T.rSm, cursor: 'pointer', fontSize: 10 },
};
