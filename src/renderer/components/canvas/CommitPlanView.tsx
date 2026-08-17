import React, { useMemo, useState } from 'react';
import { useClassicLevelStore, classicCommitCanvas } from '../../state/classicLevelStore';
import { useEditableTileRange } from '../classic/composer-shared';
import { Chip, Select, Divider, T } from '../ui';
import type { PixelBuffer } from '../../../core/art/pixel-ops';
import type { CommitTarget, PaletteResolution, CanvasCommitPlan } from '../../../core/art/classic-commit-plan';
import { withCollision } from '../../../core/art/commit-collision';
import {
  canvasChunkCapacity, defaultTargets, targetOptions, reportLines, refusalView,
  planFromSnapshot, type RefusalView,
} from './canvas-commit-model';

/**
 * Targets, preview and apply — for ANY source of pixels.
 *
 * Two things commit into a level: the origination canvas, and an imported sheet.
 * They differ only in where the pixels came from, so they share this rather than
 * growing two copies of the same panel that drift the first time a refusal's
 * wording changes.
 *
 * IT HOLDS ALMOST NO RULES. Capacity, the target list, the report wording and
 * every refusal's message live in canvas-commit-model.ts, where the node suite
 * can execute them; this collects the choices and renders what those say.
 *
 * PREVIEW BEFORE APPLY, ALWAYS. `planCanvasCommit` is pure and side-effect free,
 * so this plans on every render and shows the outcome — counts or refusal —
 * before anything is committed to. Spec §4 step 5: never a silent partial write.
 */
export default function CommitPlanView({ pixels, palette, gridOrigin, onApplied }: {
  pixels: PixelBuffer;
  /** 64 CRAM words, line-major — the palette these pixels index. */
  palette: number[];
  /** The source's own cell grid, when it has one. An imported sheet does not. */
  gridOrigin?: { originX: number; originY: number };
  onApplied?: () => void;
}) {
  const levelDoc = useClassicLevelStore((s) => s.doc);
  const ref = useClassicLevelStore((s) => s.ref);
  const reservedTiles = useClassicLevelStore((s) => s.reservedTiles);
  const range = useEditableTileRange();

  const [targets, setTargets] = useState<CommitTarget[] | null>(null);
  const [resolution, setResolution] = useState<PaletteResolution>('none');
  const [applied, setApplied] = useState<string | null>(null);
  // Off by default — a commit is already a big operation over someone's level,
  // and silently assigning collision to art nobody has looked at is a decision
  // the artist did not make. The report already says the art has none; this
  // makes acting on it one click, not zero.
  const [giveCollision, setGiveCollision] = useState(false);

  const cap = useMemo(
    () => canvasChunkCapacity(pixels.width, pixels.height),
    [pixels.width, pixels.height],
  );

  // The target list is sized by capacity, so it must follow a resize rather than
  // persist at a stale length — a target array shorter than the region refuses
  // with 'target-count', which would read as a bug rather than as a stale panel.
  const effectiveTargets = useMemo(
    () => (targets && targets.length === cap.total ? targets : defaultTargets(cap.total)),
    [cap, targets],
  );

  const result = useMemo(() => {
    if (!levelDoc || cap.total === 0) return null;
    return planFromSnapshot({
      doc: levelDoc,
      reservedTiles: reservedTiles ?? null,
      range,
      pixels,
      canvasPalette: palette,
      targets: effectiveTargets,
      paletteResolution: resolution,
      gridOrigin,
    });
  }, [levelDoc, cap, reservedTiles, range, pixels, palette, effectiveTargets, resolution, gridOrigin]);

  if (!levelDoc || !ref) {
    return <div style={styles.note}>Open a level act to commit into.</div>;
  }
  if (cap.total === 0) {
    return (
      <div style={styles.note}>
        This is smaller than one 256×256 chunk, so there is nothing to commit yet.
      </div>
    );
  }

  const view: RefusalView | null = result && !result.ok ? refusalView(result.refusal) : null;
  const plan: CanvasCommitPlan | null = result && result.ok ? result.plan : null;
  // The toggle folds into the SAME plan and the SAME undo step — never a
  // second edit chasing the commit. When off, this is just `plan`.
  const collisionPlan = plan && giveCollision ? withCollision(plan) : null;
  const effectivePlan = collisionPlan ?? plan;

  const setTarget = (i: number, value: number | null) => {
    setTargets(effectiveTargets.map((t, j) => (j === i ? { chunkFileIndex: value } : t)));
    setApplied(null);
  };

  const apply = () => {
    if (!effectivePlan) return;
    const r = classicCommitCanvas(effectivePlan);
    setApplied(r.ok
      ? `Committed to ${ref.zone.toUpperCase()} ${ref.act}.`
      : `Refused: ${'error' in r ? r.error : 'unknown'}`);
    if (r.ok) onApplied?.();
  };

  const options = targetOptions(levelDoc.chunks.length);
  const chunkTotal = plan ? plan.report.chunksReplaced + plan.report.chunksAppended : 0;

  return (
    <div style={styles.wrap}>
      <div style={styles.meta}>
        {cap.total} chunk{cap.total === 1 ? '' : 's'} · into {ref.zone.toUpperCase()} {ref.act}
      </div>
      {(cap.remainderX > 0 || cap.remainderY > 0) && (
        // Stated, never silently included or dropped — the same discipline as the
        // constraint readout's "Npx outside the grid".
        <div style={styles.note}>
          {cap.remainderX}×{cap.remainderY}px fall outside the chunk grid and are not committed.
        </div>
      )}

      {effectiveTargets.map((t, i) => (
        <div key={i} style={styles.row}>
          <span style={styles.rowLabel}>chunk {i + 1}</span>
          <Select
            value={t.chunkFileIndex === null ? '' : String(t.chunkFileIndex)}
            onChange={(v) => setTarget(i, v === '' ? null : Number(v))}
            title="Where this part of the art lands"
            style={{ flex: 1 }}
          >
            {options.map((o) => (
              <option key={String(o.value)} value={o.value === null ? '' : String(o.value)}>
                {o.label}
              </option>
            ))}
          </Select>
        </div>
      ))}

      <Divider />

      {view && (
        <div style={styles.refusal}>
          <div style={styles.refusalMsg}>{view.message}</div>
          <div style={styles.refusalFix}>{view.resolution}</div>
          {view.offers.length > 0 && (
            <div style={styles.offers}>
              {view.offers.includes('use-act-colours') && (
                <Chip onClick={() => setResolution('use-act-colours')}
                      active={resolution === 'use-act-colours'}
                      title="Re-index the art onto the colours this act already has">
                  Use the act’s colours
                </Chip>
              )}
              {view.offers.includes('adopt-into-zone') && (
                <Chip onClick={() => setResolution('adopt-into-zone')}
                      active={resolution === 'adopt-into-zone'}
                      title="Write these colours into the zone palette — every act sharing it changes">
                  Adopt into the zone
                </Chip>
              )}
            </div>
          )}
        </div>
      )}

      {plan && (
        <>
          <div style={styles.reportRow}>
            <div style={styles.report}>
              {reportLines(plan.report, collisionPlan?.applied).map((l) => <div key={l}>{l}</div>)}
            </div>
            <Chip onClick={() => setGiveCollision((v) => !v)} active={giveCollision}
                  title="Give new art solid, flat collision — the artist refines it in the Collision facet afterward">
              Give new art collision
            </Chip>
          </div>
          {plan.report.warnings.map((w) => <div key={w} style={styles.warning}>{w}</div>)}
          {resolution !== 'none' && (
            <div style={styles.note}>
              Colour resolution: {resolution === 'adopt-into-zone'
                ? 'adopting the palette into the zone'
                : 'using the act’s existing colours'}
            </div>
          )}
          {/* Wrapped: a flex COLUMN stretches its children, which made the commit
              button read as a full-bleed bar rather than a button. */}
          <div style={styles.actions}>
            <Chip onClick={apply} title="Apply this commit as one undoable step">
              Commit {chunkTotal} chunk{chunkTotal === 1 ? '' : 's'}
            </Chip>
          </div>
        </>
      )}

      {applied && <div style={styles.applied}>{applied}</div>}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  wrap: { display: 'flex', flexDirection: 'column', gap: 6, padding: '2px 0' },
  meta: { fontSize: T.tXs, color: T.textLo },
  note: { fontSize: T.tXs, color: T.textLo, lineHeight: 1.4 },
  row: { display: 'flex', alignItems: 'center', gap: 6 },
  rowLabel: { fontSize: T.tXs, color: T.textLo, minWidth: 52 },
  reportRow: { display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 6 },
  report: { fontSize: T.tXs, color: T.textBase, lineHeight: 1.5, fontVariantNumeric: 'tabular-nums' },
  warning: { fontSize: T.tXs, color: T.warning, lineHeight: 1.4 },
  refusal: { display: 'flex', flexDirection: 'column', gap: 4 },
  refusalMsg: { fontSize: T.tXs, color: T.textHi, lineHeight: 1.4 },
  refusalFix: { fontSize: T.tXs, color: T.textLo, lineHeight: 1.4 },
  offers: { display: 'flex', gap: 4, flexWrap: 'wrap' },
  actions: { display: 'flex' },
  applied: { fontSize: T.tXs, color: T.textLo },
};
