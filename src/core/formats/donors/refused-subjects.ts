// Which rectangles on the TARGET pane a refusal names (ROADMAP row 213 (b)).
//
// aeon's `validate --json` and `bake --json` name each refusal's subjects as
// `{kind, index, id}` (clip-validate-json.ts). This module finds each subject's
// rectangle in the manifest the pane shows, so the pane can outline it, and
// names every subject it could NOT place, so none is silently dropped.
//
// A SUBJECT IS PLACED BY (kind, index), CHECKED BY id. The index is the
// subject's position in aeon's `clips`, `corridors` or `shafts` list, which is the order
// the manifest carries them (the pane's doc is that manifest, or for a paste,
// the manifest with the new clip appended, which is exactly what aeon judged).
// The id is not unique in a refused manifest (aeon's K1 refuses a duplicate id,
// naming both), so it cannot be the key; but when aeon gives one and the
// rectangle at that index carries another, the manifest on the pane is not the
// one aeon judged, and the subject is reported "not on this pane" rather than
// outlined on the wrong rectangle. `id: null` (a clip with no id) is placed by
// index alone.
//
// A `shaft` subject (ROADMAP row 232) is placed at its `dst_rect` (row 233 (a),
// ruled), looked up among the act's SHAFTS by the same (index, id) rule; one whose
// rectangle is not on the pane is named "not on this pane". The `fill` subject
// is never placed (`subjectRect` says why). A K9 pair of a clip and a shaft
// outlines both.
//
// The look call (overseer, 2026-09-28, under the owner's 2026-09-18 permission):
// a 2px dashed outline in the page's existing warning colour, labelled with the
// rule tag; a pair rule outlines both; cleared with the refusal. Row 233 (a),
// ruled by the overseer 2026-09-28 under the same permission: a refused shaft
// takes exactly that look.

import { actWorldRect, overlaps, shaftEntries, type ClipManifestDoc, type ClipRect } from './clip-manifest-doc';
import { subjectLabel, type ClipNote, type ClipSubject } from './clip-validate-json';

/** The label a refusal's outline carries: its rule tag, or "untagged" for aeon's `rule: null`. */
export function ruleTag(rule: string | null): string {
  return rule ?? 'untagged';
}

/** The subject's rectangle in `doc`, or null when it is not on the pane. */
export function subjectRect(doc: ClipManifestDoc | null, s: ClipSubject): ClipRect | null {
  if (!doc) return null;
  // Each kind is looked up in ITS OWN list, never another kind's at the same
  // index. Since ROADMAP row 232 the reader also passes aeon's `shaft` (K7/K9,
  // and either side of an R10 or K8 pair) and `fill` (K8) subjects:
  //   * a shaft is placed at its `dst_rect` (row 233 (a), ruled 2026-09-28): an
  //     outline shows WHERE the problem is, and a shaft has a place. It exists
  //     only while the refusal stands, so the pane still draws no standing
  //     shaft. Read from the raw manifest (`shaftEntries`); a shaft whose
  //     rectangle is unreadable, or does not overlap the pane's world (aeon's K9
  //     "runs past the act"), is named "not on this pane";
  //   * the fill is the act's background rectangle, around every clip, corridor
  //     and shaft (aeon's s2_woven fill is the whole act): an outline of it
  //     would frame the pane, not point at anything. Named, never outlined.
  let hit: { id: string | null; dst: ClipRect | null } | null | undefined;
  switch (s.kind) {
    case 'clip': hit = doc.clips[s.index]; break;
    case 'corridor': hit = doc.corridors[s.index]; break;
    case 'shaft': hit = shaftEntries(doc)[s.index]; break;
    case 'fill': return null;
    default: {
      const never: never = s.kind;
      return never;
    }
  }
  if (!hit?.dst) return null;
  if (s.id !== null && hit.id !== s.id) return null;
  if (s.kind === 'shaft' && !overlaps(hit.dst, actWorldRect(doc))) return null;
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
