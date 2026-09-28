// Which rectangles on the TARGET pane a refusal names (ROADMAP row 213 (b)).
//
// aeon's `validate --json` and `bake --json` name each refusal's subjects as
// `{kind, index, id}` (clip-validate-json.ts). This module finds each subject's
// rectangle in the manifest the pane shows, so the pane can outline it, and
// names every subject it could NOT place, so none is silently dropped.
//
// A SUBJECT IS PLACED BY (kind, index), CHECKED BY id. The index is the
// subject's position in aeon's `clips` or `corridors` list, which is the order
// the manifest carries them (the pane's doc is that manifest, or for a paste,
// the manifest with the new clip appended, which is exactly what aeon judged).
// The id is not unique in a refused manifest (aeon's K1 refuses a duplicate id,
// naming both), so it cannot be the key; but when aeon gives one and the
// rectangle at that index carries another, the manifest on the pane is not the
// one aeon judged, and the subject is reported "not on this pane" rather than
// outlined on the wrong rectangle. `id: null` (a clip with no id) is placed by
// index alone.
//
// The look call (overseer, 2026-09-28, under the owner's 2026-09-18 permission):
// a 2px dashed outline in the page's existing warning colour, labelled with the
// rule tag; a pair rule outlines both; cleared with the refusal.

import type { ClipManifestDoc, ClipRect } from './clip-manifest-doc';
import { subjectLabel, type ClipNote, type ClipSubject } from './clip-validate-json';

/** The label a refusal's outline carries: its rule tag, or "untagged" for aeon's `rule: null`. */
export function ruleTag(rule: string | null): string {
  return rule ?? 'untagged';
}

/** The subject's rectangle in `doc`, or null when it is not on the pane. */
export function subjectRect(doc: ClipManifestDoc | null, s: ClipSubject): ClipRect | null {
  if (!doc) return null;
  // Only the two kinds the pane draws are placed. aeon also names `shaft` (K9)
  // and `fill` (K8) subjects, which the reader does not pass yet (ROADMAP row
  // 232) and the pane does not draw; read as a string so such a subject, if it
  // ever arrives, is named "not on this pane" and never looked up in another
  // kind's list.
  const kind: string = s.kind;
  const hit = kind === 'clip' ? doc.clips[s.index] : kind === 'corridor' ? doc.corridors[s.index] : undefined;
  if (!hit) return null;
  if (s.id !== null && hit.id !== s.id) return null;
  return hit.dst;
}

export interface RefusedRect { rule: string; subject: ClipSubject; rect: ClipRect }

export interface RefusedSubjects {
  /** One per subject that is on the pane, in aeon's order (a pair rule gives two). */
  placed: RefusedRect[];
  /** Every subject that is NOT on the pane, which the refusal text names as such. */
  offPane: Array<{ rule: string; subject: ClipSubject }>;
}

/** Every subject of every refusal, placed on `doc` or named as off the pane. */
export function resolveRefusedSubjects(refusals: readonly ClipNote[], doc: ClipManifestDoc | null): RefusedSubjects {
  const out: RefusedSubjects = { placed: [], offPane: [] };
  for (const n of refusals) {
    const rule = ruleTag(n.rule);
    for (const subject of n.subjects) {
      const rect = subjectRect(doc, subject);
      if (rect) out.placed.push({ rule, subject, rect: { ...rect } });
      else out.offPane.push({ rule, subject });
    }
  }
  return out;
}

/** The words a refusal on this pane marks a subject it could not place with. */
export const NOT_ON_THIS_PANE = 'not on this pane';

/**
 * Who a refusal is about, for a person, with each subject the pane could not
 * place named as such: "clip 1 cpz_s2 (not on this pane)". The act as a whole
 * when it names none, as `subjectsLabel`.
 */
export function subjectsLabelOnPane(subjects: readonly ClipSubject[], doc: ClipManifestDoc | null): string {
  if (subjects.length === 0) return 'the act as a whole';
  return subjects.map((s) => (subjectRect(doc, s) ? subjectLabel(s) : `${subjectLabel(s)} (${NOT_ON_THIS_PANE})`)).join(' and ');
}
