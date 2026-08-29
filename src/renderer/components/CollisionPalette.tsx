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
import { fitCellSizeToBox } from '../../core/collision/collision-angle-mark';
import { clearCollisionEntries, resetToEngineEntries } from '../../core/editing/collision-word';
import { useToastStore } from '../state/toastStore';
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
    // An unscaled canvas: one unit IS one screen pixel, so the box the cell
    // occupies is the cell's screen size. This is what tells the mark module
    // that a thumbnail and the big preview are different budgets.
    cellScreenPx: size,
    showSolidEdges: true,
    showNeedle: true,
  };
}

/**
 * How much bigger than the shape the thumbnail CANVAS is, so the mark's outward
 * stem is not clipped.
 *
 * The stem points OUT of the solid, so on a full-height cell — surface at y=0 —
 * it leaves the box entirely. ON THE MAP that is correct and wanted: it reaches
 * into the air cell above, which is exactly what "the open side is up there"
 * looks like. In a THUMBNAIL the box edge is a hard clip, and a clipped stem
 * loses its far end — the end that carries the direction, and the only thing
 * the owner was looking for.
 *
 * ⚠ THE PREVIOUS VALUE (5) WAS NEVER ENOUGH, AND THE BIG PREVIEW WAS WORSE.
 * The reach is proportional to the cell, so a 120px preview needed ~30px of
 * room and had 5: it has been drawing a barb sliced at the border this whole
 * time. Nobody noticed because the barb was the quiet element — the same reason
 * this parcel exists. So the SHAPE now sizes itself to the canvas
 * (`fitCellSizeToBox`) instead of the canvas guessing a fixed pad, and both
 * surfaces get an uncut mark.
 *
 * Padding, not a clamp: clamping the anchor to keep the stem inside would move
 * the mark OFF the surface, which is the defect the first parcel removed.
 */
const MARK_PAD = 8;

/**
 * Paint a single profile into a square `box`-px canvas via drawCollisionShape,
 * with the cell sized so the whole mark fits inside the canvas.
 *
 * `box` is fixed by the layout; the CELL is whatever is left after the mark's
 * outward reach, which is `collision-angle-mark`'s rule and not this file's.
 */
function ShapeCanvas({ profile, box, bleed = 0 }: {
  profile: CollisionProfile; box: number; bleed?: number;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  const size = fitCellSizeToBox(box);
  const off = (box - size) / 2;
  useEffect(() => {
    const ctx = ref.current?.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, box, box);
    // CanvasRenderingContext2D structurally satisfies ShapeDrawCtx; its fillStyle/
    // strokeStyle are a wider union, so narrow via the minimal shape we draw with.
    drawCollisionShape(ctx as unknown as ShapeDrawCtx, off, off, size, profile, shapeOpts(size));
  }, [profile, box, size, off]);
  return <canvas ref={ref} width={box} height={box}
    style={{ display: 'block', margin: -bleed }} />;
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
    // DECIDED, not inherited: Clear is the ONE writer that may wipe bits the
    // collision fields do not own, because it is the one gesture whose stated
    // intent is the whole cell. clearCollisionEntries carries the argument.
    const entries = clearCollisionEntries(ce);
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
    // The baked baseline is a per-cell BYTE — aeon's bake_plane_cell interns on
    // (heights, angle, solidity) and nothing else — so a revert CANNOT carry
    // bits the collision fields do not own. There is nothing to revert them TO,
    // and discarding them here is unavoidable. Being SILENT about it is not:
    // the count goes in the command description, which is the text the undo
    // stack shows, so the discard is named where it is recorded and is undoable
    // from that same list.
    const { entries, discardedUnownedCells } = resetToEngineEntries(ce, engineWords);
    if (!entries.length) return;
    const discardNote = discardedUnownedCells > 0
      ? ` — discards reserved bits on ${discardedUnownedCells} cell${discardedUnownedCells === 1 ? '' : 's'}`
      : '';
    if (discardedUnownedCells > 0) {
      useToastStore.getState().addToast(
        `Reset collision ${p.toUpperCase()}: the engine baseline cannot carry the reserved bits on `
        + `${discardedUnownedCells} cell${discardedUnownedCells === 1 ? '' : 's'}, so they were discarded. Undo restores them.`,
        'info');
    }
    executeCommand({
      type: 'set-collision-edit', plane: p,
      description: `Reset collision ${p.toUpperCase()} to engine (section ${ed.activeSectionIndex})${discardNote}`,
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
            <ShapeCanvas profile={previewProfile} box={PREVIEW} />
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
              <ShapeCanvas profile={e.profile} box={PX + MARK_PAD * 2} bleed={MARK_PAD} />
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
  // GAP >= MARK_PAD, on purpose. Each thumbnail's canvas bleeds MARK_PAD px
  // past its layout box so the outward stem is not clipped; a gap narrower than
  // the bleed lets one tile's mark paint over the tile beside it, which in a
  // PICKER reads as the neighbour having a direction it does not have.
  grid: { display: 'flex', flexWrap: 'wrap', gap: MARK_PAD + 2, padding: `0 ${T.s2} ${T.s2}` },
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
