import React, { useEffect } from 'react';
import { useClassicLevelStore } from '../../state/classicLevelStore';
import { probeCollision, LOOP_ALIAS, type CollisionProbe } from '../../../core/level-classic/collision-probe';
import { claimCollisionOverlay } from '../collision-overlay-scope';
import { classicCollisionOverlayPort } from '../../providers/collision-overlay-classic';
import { SOLIDITY, hex } from './composer-shared';
import { T } from '../ui';

/**
 * COLLISION's right-hand column, over the pure `probeCollision`.
 *
 * TWO HEADINGS, NOT ONE READOUT, because the tier a value belongs to has to be
 * STATED — the same lesson that removed a bare "Diverge:" label in `17783ae`.
 * "This cell" is what the layout stamped HERE, in THIS act; "This block" is
 * what the chunk pool defines everywhere, and neither number substitutes for
 * the other:
 *
 *  - `chunkPlacements` scans this act's FG plane alone. Solidity is a property
 *    of the CHUNK, and the same chunk id is shared zone-wide across all three
 *    acts — one `LevelDoc` holds one act and cannot see the other two — so the
 *    count is qualified "in this act" everywhere it is shown, or it reads as
 *    the chunk's whole reach when it is a third of it at most.
 *  - `blockCells` counts chunk-DEFINITION cells (how many cells across every
 *    chunk in the pool name this block id), not on-map positions. The true
 *    on-map reach is each of those cells times its own chunk's placements,
 *    summed across all three acts — a number this panel cannot compute either,
 *    for the same one-act reason. So it says "chunk cells", never bare "cells".
 *
 * READ-ONLY, on purpose, in this stage: solidity is edited on the Chunk tab
 * (ChunkTab.tsx), not here — see the footer note.
 *
 * SHADING: mounting this facet claims the map's collision overlay through
 * `claimCollisionOverlay` (collision-overlay-scope.ts) via a classic port
 * (providers/collision-overlay-classic.ts) — a panel that describes shading
 * nobody switched on would be describing an unshaded map. The claim follows
 * the shared "implicit enable, implicit revert" rule: if the user already had
 * a collision overlay on (View menu), this mount declines ownership and
 * leaves it exactly as found, on the way in and the way out.
 *
 * THE COLOUR KEY IS `CollisionLegend`, mounted in `ClassicLevelViewport`
 * itself (beside the canvas), not duplicated here. It turned out NOT to be
 * aeon-only despite being aeon's alone to mount before this facet: it reads
 * only `viewStore.overlays` and the same `COLLISION_FILL_*` / `COLLISION_
 * ANGLE_TICK` constants `classic-overlays.ts#drawCollision` already paints
 * classic's own shading with, so classic needed no adapter — just the mount
 * aeon already had. Reinventing an inline key here would have been a second,
 * driftable copy of a key that already matches the shading exactly.
 *
 * `collision.rotated` is enumerated in the S1 format but never loaded
 * (`s1-io.ts:371-372`), so every shape this panel or the map can show is a
 * floor HEIGHTMAP only. That is the whole story for stock data — Rotated never
 * diverges from Regular there — but a hack whose Rotated array has drifted
 * will not show it: the panel would be reading the same array the map paints,
 * confidently, and both would be wrong the same way. Said once, in the footer,
 * rather than re-argued at every solidity readout above it.
 */
export default function ClassicCollisionPanel(): React.ReactElement {
  const doc = useClassicLevelStore((s) => s.doc);
  const point = useClassicLevelStore((s) => s.collisionProbe);

  // Claim the overlay for the lifetime of this panel, and only this panel —
  // see the docblock above and collision-overlay-scope.ts for the rule. 'a' is
  // the only plane S1 has (the loop-behind substitution LOOP_ALIAS names is
  // runtime object state, not a second collision plane); 'map' because this
  // shades the level, never a chunk document in the composer.
  useEffect(() => {
    return claimCollisionOverlay(classicCollisionOverlayPort(), 'a', 'map') ?? undefined;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const probe = doc && point ? probeCollision(doc, point.x, point.y) : null;

  return (
    <div style={styles.root}>
      {!probe ? (
        <div style={styles.empty}>
          {point
            ? 'That point falls outside the layout.'
            : 'Click a cell on the map to probe its collision.'}
        </div>
      ) : (
        <>
          <CellSection probe={probe} />
          <BlockSection probe={probe} />
        </>
      )}
      <div style={styles.footer}>
        Read-only for now — solidity is edited on the Chunk tab.
        <br />
        Shading is a floor heightmap only: the Rotated array is enumerated but
        never loaded, so a hack whose Rotated data has drifted from Regular
        will not show it here.
      </div>
    </div>
  );
}

function CellSection({ probe }: { probe: CollisionProbe }): React.ReactElement {
  const solidity = SOLIDITY[probe.solidity] ?? SOLIDITY[0];
  return (
    <div style={styles.section}>
      <div style={styles.heading}>This cell</div>
      <Row label="Solidity" value={solidity.label} />
      <Row
        label="Chunk"
        value={probe.chunkId === 0 ? 'air ($00)' : hex(probe.chunkId)}
      />
      <Row label="Stamped" value={`${probe.chunkPlacements}× in this act`} />
      {probe.reason && <div style={styles.reason}>{reasonText(probe.reason)}</div>}
      {probe.loopAmbiguous && (
        <div style={styles.warn}>
          This cell loops. While the player is behind the loop, FindNearestTile
          substitutes chunk {hex(LOOP_ALIAS.to)} for {hex(LOOP_ALIAS.from)} — a
          runtime fact no editor can see, so the reading above is one of two
          possible answers, and {hex(LOOP_ALIAS.to)} is the other.
        </div>
      )}
    </div>
  );
}

function BlockSection({ probe }: { probe: CollisionProbe }): React.ReactElement {
  if (probe.reason === 'air') {
    return (
      <div style={styles.section}>
        <div style={styles.heading}>This block</div>
        <div style={styles.dim}>No chunk here — no block to look up.</div>
      </div>
    );
  }
  return (
    <div style={styles.section}>
      <div style={styles.heading}>This block</div>
      <Row label="Block" value={hex(probe.blockId)} />
      <Row label="Shape" value={String(probe.shapeIndex)} />
      <Row label="Named by" value={`${probe.blockCells} chunk cells`} />
    </div>
  );
}

/** Why the cell does NOT collide, in the vocabulary CollisionProbe's own
 *  docblock uses — the fix differs for each of the three, so the words do too. */
function reasonText(reason: NonNullable<CollisionProbe['reason']>): string {
  switch (reason) {
    case 'air':
      return 'Does not collide — no chunk here.';
    case 'block0':
      return 'Does not collide — blank block ($00): the engine skips it before checking anything else.';
    case 'solidity':
      return 'Does not collide — solidity None: the shape is ignored.';
    default:
      return '';
  }
}

function Row({ label, value }: { label: string; value: string }): React.ReactElement {
  return (
    <div style={styles.row}>
      <span style={styles.rowLabel}>{label}</span>
      <span style={styles.rowValue}>{value}</span>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  root: { display: 'flex', flexDirection: 'column', gap: T.s4, fontFamily: T.fontUi },
  empty: { color: T.textLo, fontSize: T.tSm, padding: `${T.s2} 0` },
  section: { display: 'flex', flexDirection: 'column', gap: 3 },
  heading: {
    color: T.textLo, fontSize: T.t2xs, textTransform: 'uppercase', letterSpacing: 0.5,
    fontWeight: T.wSemibold, marginBottom: 2,
  },
  row: { display: 'flex', justifyContent: 'space-between', gap: T.s2, fontSize: T.tSm },
  rowLabel: { color: T.textLo },
  rowValue: { color: T.textBase, fontFamily: T.fontMono },
  reason: { color: T.warning, fontSize: T.tXs, marginTop: 2 },
  warn: { color: T.warning, fontSize: T.tXs, marginTop: 4, lineHeight: 1.4 },
  dim: { color: T.textLo, fontSize: T.tSm },
  footer: {
    color: T.textFaint, fontSize: T.t2xs, lineHeight: 1.4, borderTop: `1px solid ${T.border}`,
    paddingTop: T.s2, marginTop: T.s2,
  },
};
