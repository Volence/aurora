import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useEditorStore, executeCommand } from '../state/editorStore';
import { useProjectStore, getActiveLevel } from '../state/projectStore';
import { useViewStore } from '../state/viewStore';
import { angleDegrees } from '../../core/collision/collision-model';
import type { CollisionProfile } from '../../core/collision/collision-model';
import { resolvePlaneWords, SECTION_PLANE_WORDS } from '../../core/collision/collision-cell-resolve';
import { flipProfile } from '../../core/collision/collision-flip';
import { organizePalette, effectiveXFlip } from '../../core/collision/collision-palette-organize';
import type { Solidity } from '../../core/collision/collision-model';
import { classifyProfile, COLLISION_KINDS } from '../../core/collision/collision-classify';
import type { CollisionKind } from '../../core/collision/collision-classify';
import { drawCollisionShape } from '../../core/collision/collision-shape-draw';
import type { ShapeDrawOpts, ShapeDrawCtx } from '../../core/collision/collision-shape-draw';
import { claimCollisionOverlay } from './collision-overlay-scope';
import { T } from './ui';
import {
  COLLISION_SHAPE_FILL, COLLISION_SHAPE_LINE, COLLISION_SOLID_EDGE,
  COLLISION_ANGLE_TICK, COLLISION_ANGLE_CASING,
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

/**
 * The picker's boxes are UNSCALED canvases — one unit is one screen pixel — so
 * the widths are proportional to the box, and a 120px preview reads as a
 * scaled-up 22px thumbnail. The paint ghost, which draws the same shapes into a
 * zoom-scaled context, states its own widths for exactly the opposite reason;
 * see `ShapeDrawOpts`.
 */
function shapeOpts(size: number): ShapeDrawOpts {
  return {
    fill: COLLISION_SHAPE_FILL,
    line: COLLISION_SHAPE_LINE,
    solidEdge: COLLISION_SOLID_EDGE,
    needle: COLLISION_ANGLE_TICK,
    needleCasing: COLLISION_ANGLE_CASING,
    lineWidth: Math.max(1, (size / 16) * 1.0),
    solidEdgeWidth: Math.max(1, (size / 16) * 1.5),
    markCoreWidth: Math.max(1, (size / 16) * 1.25),
    markCasingWidth: Math.max(2.5, (size / 16) * 3),
    showSolidEdges: true,
    showNeedle: true,
  };
}

/**
 * Room around the shape box for the angle mark's outward barb.
 *
 * The barb points OUT of the solid, so on a full-height cell — surface at y=0 —
 * it leaves the box entirely. ON THE MAP that is correct and wanted: the barb
 * reaches into the air cell above, which is exactly what "the open side is up
 * there" looks like. In a THUMBNAIL the box edge is a hard clip, and the first
 * render of this showed every full-height shape with its barb sliced off at the
 * border, which reads as a rendering fault rather than as a direction.
 *
 * So the canvas is bigger than the shape and the shape is drawn inset. The
 * geometry is untouched — this is padding, not a clamp. Clamping the anchor to
 * keep the barb inside would have moved the mark OFF the surface, which is the
 * defect this whole parcel is about.
 */
const MARK_PAD = 5;

/** Paint a single profile into a square canvas via drawCollisionShape. */
function ShapeCanvas({ profile, size }: { profile: CollisionProfile; size: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const box = size + MARK_PAD * 2;
  useEffect(() => {
    const ctx = ref.current?.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, box, box);
    // CanvasRenderingContext2D structurally satisfies ShapeDrawCtx; its fillStyle/
    // strokeStyle are a wider union, so narrow via the minimal shape we draw with.
    drawCollisionShape(ctx as unknown as ShapeDrawCtx, MARK_PAD, MARK_PAD, size, profile, shapeOpts(size));
  }, [profile, size, box]);
  return <canvas ref={ref} width={box} height={box}
    style={{ display: 'block', margin: -MARK_PAD }} />;
}

export default function CollisionPalette({ variant = 'map' }: { variant?: 'map' | 'art' }) {
  // Shared by the map facet's collision tool and Art mode's chunk collision
  // tool (ComposerCanvas). The Sec N / Reset / Clear row below acts on the
  // active MAP SECTION's collisionEdit(B) plane — meaningless (and dangerous:
  // it would touch the wrong data) when painting a chunk doc in Art mode, so
  // it's gated on the variant prop rather than forking the component.
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
    const N = SECTION_PLANE_WORDS;
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
    // Sized by the section geometry, never by `engine.length`: a short baseline
    // would otherwise yield short `engineWords`, and the comparison below would
    // read `undefined` past its end and push `newColl: undefined` into the
    // command (ROADMAP §5.1 item 10).
    const engineWords = resolvePlaneWords(null, engine, SECTION_PLANE_WORDS);
    if (p === 'b') {
      if (!section.collisionEditB) section.collisionEditB = resolvePlaneWords(null, engine, SECTION_PLANE_WORDS);
    } else if (!section.collisionEdit) {
      section.collisionEdit = resolvePlaneWords(null, engine, SECTION_PLANE_WORDS);
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
  // Show the active plane when the collision tool opens, and PUT IT BACK on the
  // way out. The whole rule — including why the art variant claims nothing, and
  // why a view the user set up in the View menu is neither overridden on entry
  // nor cleared on exit — is collision-overlay-scope.ts, which the node-only
  // suite can actually run. Without the cleanup this overlay leaked to every
  // other map facet for the rest of the session (the COLLISION legend drawn over
  // the Palette facet's map is what caught it).
  useEffect(() => {
    const v = useViewStore.getState();
    return claimCollisionOverlay({
      anyOn: () => {
        const ov = useViewStore.getState().overlays;
        return ov.showCollision || ov.showCollisionPathB;
      },
      show: (p) => pickPlane(p),
      hideAll: () => {
        v.setOverlay('showCollision', false);
        v.setOverlay('showCollisionPathB', false);
      },
    }, plane, variant) ?? undefined;
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
          <button key={n} onClick={() => setBrush(n)} title={n === 1 ? 'Single block (hold Alt to propagate to blocks with the same tiles)' : `${n}×${n} block area`}
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
      {variant === 'map' && (
        <div style={styles.planes}>
          <span style={styles.planeLabel}>Sec {activeSection}</span>
          <button onClick={resetToEngine} title={`Reset section ${activeSection} collision (this plane) to the engine baseline — undoable`}
            style={styles.subtleBtn}>Reset</button>
          <button onClick={clearSection} title={`Erase ALL collision in section ${activeSection} (this plane) — undoable`}
            style={styles.subtleBtn}>Clear</button>
        </div>
      )}
      <div style={styles.hint}>{variant === 'map'
        ? (brush > 1
          ? `Pick a shape, then paint on the map. Paints the ${brush}×${brush} block area under the cursor.`
          : 'Pick a shape, then paint on the map. Paints just this block; hold Alt to paint every block with the same tiles.')
        : 'Pick a shape, then paint on the canvas (tile-space collision tool).'}</div>

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
  hint: { fontSize: T.t2xs, color: T.textLo, padding: `0 ${T.s2} ${T.s2}` },
  note: { fontSize: T.tXs, color: T.textLo, padding: T.s2 },
  tabs: { display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 4, padding: `0 ${T.s2} ${T.s2}` },
  preview: { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, padding: `0 ${T.s2} ${T.s2}` },
  previewBox: {
    width: PREVIEW, height: PREVIEW, background: T.overlay,
    border: `1px solid ${T.border}`, borderRadius: T.rSm,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
  },
  previewText: { fontSize: T.t2xs, color: T.textBase, fontFamily: T.fontMono, textAlign: 'center' },
  grid: { display: 'flex', flexWrap: 'wrap', gap: 4, padding: `0 ${T.s2} ${T.s2}` },
  cellWrap: {
    width: PX + 6, padding: 2, background: T.overlay,
    border: `1px solid ${T.border}`, borderRadius: T.rSm, cursor: 'pointer',
    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 1,
  },
  sel: { outline: `2px solid ${T.accent}`, outlineOffset: -1 },
  eraseCell: {
    width: PX, height: PX, color: T.textLo, fontSize: T.tMd,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
  },
  erase: { color: T.textLo, fontSize: 36 }, // big-preview empty (air) state

  degLabel: { fontSize: 8, lineHeight: '8px', color: T.textLo },
  planes: { display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 4, padding: `${T.s2} ${T.s2} 0` },
  planeLabel: { fontSize: T.t2xs, color: T.textLo, marginRight: 2, minWidth: 38, flexShrink: 0 },
  planeBtn: { padding: `2px ${T.s2}`, background: T.overlay, color: T.textBase, borderWidth: 1, borderStyle: 'solid', borderColor: T.border, borderRadius: T.rSm, cursor: 'pointer', fontSize: T.tXs, minWidth: 26, textAlign: 'center' },
  planeSel: { background: T.accent, color: T.onAccent, borderColor: T.accent },
  subtleBtn: { padding: `2px ${T.s2}`, background: 'transparent', color: T.textLo, border: `1px solid ${T.border}`, borderRadius: T.rSm, cursor: 'pointer', fontSize: T.t2xs },
};
