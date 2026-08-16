import React, { useMemo, useState } from 'react';
import { useCanvasStore } from '../../state/canvasStore';
import { useClassicLevelStore, classicCommitCanvas } from '../../state/classicLevelStore';
import { useEditableTileRange } from '../classic/composer-shared';
import { Chip, Select, Divider, T } from '../ui';
import type { CommitTarget, PaletteResolution, CanvasCommitPlan } from '../../../core/art/classic-commit-plan';
import {
  canvasChunkCapacity, defaultTargets, targetOptions, reportLines, refusalView,
  planFromSnapshot, type RefusalView,
} from './canvas-commit-model';

/**
 * The commit panel — turning a drawing into real tiles, blocks and chunks.
 *
 * IT HOLDS ALMOST NO RULES. Capacity, the target list, the report wording and
 * every refusal's message live in canvas-commit-model.ts, where the node suite
 * can execute them; this file collects four values and renders what those
 * functions say. The same split new-canvas.ts uses.
 *
 * PREVIEW BEFORE APPLY, ALWAYS. `planCanvasCommit` is pure and side-effect free,
 * so the panel plans on every render and shows the outcome — counts or refusal —
 * before the artist commits to anything. Spec §4 step 5: never a silent partial
 * write, and never a surprise.
 */
export default function CanvasCommitSection({ docId }: { docId: string }) {
  const doc = useCanvasStore((s) => s.docs.get(docId)?.doc);
  const levelDoc = useClassicLevelStore((s) => s.doc);
  const ref = useClassicLevelStore((s) => s.ref);
  const reservedTiles = useClassicLevelStore((s) => s.reservedTiles);
  const range = useEditableTileRange();

  const [targets, setTargets] = useState<CommitTarget[] | null>(null);
  const [resolution, setResolution] = useState<PaletteResolution>('none');
  const [applied, setApplied] = useState<string | null>(null);

  const cap = useMemo(
    () => (doc ? canvasChunkCapacity(doc.pixels.width, doc.pixels.height) : null),
    [doc],
  );

  // The target list is sized by capacity, so it must follow a resize rather than
  // persist at a stale length — a target array shorter than the region refuses
  // with 'target-count', which would read as a bug rather than as a stale panel.
  const effectiveTargets = useMemo(() => {
    if (!cap) return [];
    if (targets && targets.length === cap.total) return targets;
    return defaultTargets(cap.total);
  }, [cap, targets]);

  const result = useMemo(() => {
    if (!doc || !levelDoc || !cap || cap.total === 0) return null;
    return planFromSnapshot({
      doc: levelDoc,
      reservedTiles: reservedTiles ?? null,
      range,
      pixels: doc.pixels,
      canvasPalette: doc.palette,
      targets: effectiveTargets,
      paletteResolution: resolution,
    });
  }, [doc, levelDoc, cap, reservedTiles, range, effectiveTargets, resolution]);

  if (!doc) return null;

  if (!levelDoc || !ref) {
    return <div style={styles.note}>Open a level act to commit this canvas into.</div>;
  }
  if (!cap || cap.total === 0) {
    return (
      <div style={styles.note}>
        This canvas is smaller than one 256×256 chunk, so there is nothing to commit yet.
      </div>
    );
  }

  const view: RefusalView | null = result && !result.ok ? refusalView(result.refusal) : null;
  const plan: CanvasCommitPlan | null = result && result.ok ? result.plan : null;

  const setTarget = (i: number, value: number | null) => {
    const next = effectiveTargets.map((t, j) => (j === i ? { chunkFileIndex: value } : t));
    setTargets(next);
    setApplied(null);
  };

  const apply = () => {
    if (!plan) return;
    const r = classicCommitCanvas(plan);
    setApplied(r.ok
      ? `Committed to ${ref.zone.toUpperCase()} ${ref.act}.`
      : `Refused: ${'error' in r ? r.error : 'unknown'}`);
  };

  const options = targetOptions(levelDoc.chunks.length);

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
            title="Where this part of the canvas lands"
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
          <div style={styles.report}>
            {reportLines(plan.report).map((l) => <div key={l}>{l}</div>)}
          </div>
          {plan.report.warnings.map((w) => (
            <div key={w} style={styles.warning}>{w}</div>
          ))}
          {resolution !== 'none' && (
            <div style={styles.note}>
              Colour resolution: {resolution === 'adopt-into-zone'
                ? 'adopting the canvas palette into the zone'
                : 'using the act’s existing colours'}
            </div>
          )}
          {/* Wrapped: a Chip is an inline-ish span, but a flex COLUMN stretches
              its children to full width, which made the commit button read as a
              full-bleed bar rather than a button. */}
          <div style={styles.actions}>
            <Chip onClick={apply} title="Apply this commit as one undoable step">
              Commit {plan.report.chunksReplaced + plan.report.chunksAppended} chunk
              {plan.report.chunksReplaced + plan.report.chunksAppended === 1 ? '' : 's'}
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
  meta: { fontSize: 11, color: T.textLo },
  note: { fontSize: 11, color: T.textLo, lineHeight: 1.4 },
  row: { display: 'flex', alignItems: 'center', gap: 6 },
  rowLabel: { fontSize: 11, color: T.textLo, minWidth: 52 },
  report: { fontSize: 11, color: T.textBase, lineHeight: 1.5, fontVariantNumeric: 'tabular-nums' },
  warning: { fontSize: 11, color: T.warning, lineHeight: 1.4 },
  refusal: { display: 'flex', flexDirection: 'column', gap: 4 },
  refusalMsg: { fontSize: 11, color: T.textHi, lineHeight: 1.4 },
  refusalFix: { fontSize: 11, color: T.textLo, lineHeight: 1.4 },
  offers: { display: 'flex', gap: 4, flexWrap: 'wrap' },
  actions: { display: 'flex' },
  applied: { fontSize: 11, color: T.textLo },
};
