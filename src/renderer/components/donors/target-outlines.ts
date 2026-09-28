// What the TARGET pane outlines, as data (no canvas), so node rows can hold it.
//
//   * every clip and corridor already in the act: faint, labelled by id;
//   * the pending paste (marquee at the drafted destination): accent;
//   * ROW 213 (b): every subject a standing refusal names, dashed, in the
//     warning tone the donor page already uses for refusals (DONOR_MARK_WARN,
//     the canvas mirror of --warning; no new colour), tagged with the rule. A
//     paste refusal's subjects are placed on the manifest aeon judged (the act
//     plus the pasted clip), a re-bake refusal's on the act on disk. A pair rule
//     gives two outlines. A refused SHAFT is outlined at its dst_rect the same
//     way (row 233 (a), ruled); the pane draws no standing shaft, so it shows
//     one only while a refusal names it. A subject not on the pane (the fill, a
//     clip, corridor or shaft wholly past the act) draws nothing here and is
//     named "not on this pane" in the refusal text (refused-subjects.ts).
//     ROW 236 (a), ruled: each
//     refused outline names itself on the pane's hover as its rule tag and
//     subject label ("K9: shaft 0 wfz_to_ehz", `refusalHoverName`), so one whose
//     tag the layout hid (whole-act scale) is still named on the pane.
//
// Cleared with the refusal: a paste refusal by the next paste, an edit of the
// draft or marquee, or leaving the page (donor-paste.ts `clearRefusal`); a
// re-bake refusal by the next bake run.

import type { ClipManifestDoc } from '../../../core/formats/donors/clip-manifest-doc';
import type { ClipNote } from '../../../core/formats/donors/clip-validate-json';
import { refusalHoverName, resolveRefusedSubjects } from '../../../core/formats/donors/refused-subjects';
import type { PasteOutcome } from '../../state/donor-paste';
import type { PaneOutline } from './ZonePane';

export interface TargetOutlineInput {
  doc: ClipManifestDoc | null;
  marquee: { w: number; h: number } | null;
  draft: { dst: { x: number; y: number } | null; clipId: string };
  outcome: PasteOutcome | null;
  bakeRefused: { refusals: ClipNote[]; doc: ClipManifestDoc } | null;
}

/**
 * The refused-subject outlines alone: dashed, warning, tagged with the rule,
 * named on hover as "<rule tag>: <subject label>". One
 * per (rule, subject): a pair rule whose two subjects sit on the SAME rectangle
 * (a paste placed exactly over a clip, aeon's R10) still gives two, so the
 * count says both were named. The same subject named by the same rule twice
 * (the paste refusal and the re-bake note agreeing) gives one.
 */
export function refusedOutlines(input: Pick<TargetOutlineInput, 'outcome' | 'bakeRefused'>): PaneOutline[] {
  const out: PaneOutline[] = [];
  const seen = new Set<string>();
  const add = (refusals: readonly ClipNote[], doc: ClipManifestDoc) => {
    for (const p of resolveRefusedSubjects(refusals, doc).placed) {
      const key = `${p.rule}|${p.subject.kind}|${p.subject.index}|${p.rect.x},${p.rect.y},${p.rect.w},${p.rect.h}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ rect: p.rect, tone: 'warning', dashed: true, tag: p.rule, hover: refusalHoverName(p.rule, p.subject) });
    }
  };
  const o = input.outcome;
  if (o?.kind === 'refused') add(o.refusals, o.judged);
  if (input.bakeRefused) add(input.bakeRefused.refusals, input.bakeRefused.doc);
  return out;
}

/** Everything the target pane outlines, in paint order (refusals last, so they draw on top). */
export function targetPaneOutlines(input: TargetOutlineInput): PaneOutline[] {
  const o: PaneOutline[] = [];
  for (const c of input.doc?.clips ?? []) o.push({ rect: c.dst, label: c.id, tone: 'faint' });
  for (const c of input.doc?.corridors ?? []) o.push({ rect: c.dst, label: c.id, tone: 'faint' });
  if (input.marquee && input.draft.dst) {
    o.push({
      rect: { x: input.draft.dst.x, y: input.draft.dst.y, w: input.marquee.w, h: input.marquee.h },
      label: input.draft.clipId || undefined, tone: 'accent',
    });
  }
  o.push(...refusedOutlines(input));
  return o;
}
