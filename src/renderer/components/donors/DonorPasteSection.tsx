// The paste half of the Donors column: which clip act, what id, where, Paste,
// and what aeon said. Plan S3 and S4; the flow is state/donor-paste.ts.
//
// WHAT THE PAGE SAYS A PASTE COPIES, and why it says it at all: collision is
// not in the manifest, and a pasted rectangle LOOKS complete on screen, so the
// assumption most likely to be made silently is "the clip carries its ground".
// It does, but only because aeon's bake takes both collision planes from the
// same rectangle as the art (clip_manifest.collision_grids shares cell_grids'
// loop). The page states exactly that, and the per-clip solid-cell count it
// shows is the bake's own, read from the clipact.json it just wrote.
//
// ROW 213 (aeon 1d9afb25). aeon's loader now answers in JSON, so a refusal
// shows WHICH rule and WHICH clip or corridor as well as aeon's sentence, and a
// loader that crashed is shown as a crash with its stderr, never as a refusal.
// The readout carries each clip's and corridor's pool cost (tiles, and the two
// page counts aeon defines) beside the act's totals. The look call, stated in
// docs/reviews/2026-09-25-donor-clip-asks.md: a compact numeric grid, one row
// per rectangle, column meanings as tooltips read from the file's own
// per_clip_fields; no pages total (a shared page counts for every rectangle
// that touches it), no per-clip camera window (aeon reports the act's only),
// and "unavailable" with the reason when the file carries no rows.

import React from 'react';
import { CollapsibleSection, SectionBody, NumberField } from '../ui';
import { Field, Hint, NOTE, WARN } from '../effects/column-layout';
import { T } from '../ui/theme';
import { useProjectStore } from '../../state/projectStore';
import { useDonorStore } from '../../state/donorStore';
import { usePasteStore, type PasteOutcome } from '../../state/donor-paste';
import { subjectsLabel, type ClipNote } from '../../../core/formats/donors/clip-validate-json';
import { readPoolRows, type PoolRow, type PoolRowField } from '../../../core/formats/donors/clipact-pool';
import { useDonorDraft } from '../../state/donor-draft';
import {
  clipIdProblem, gridToHold, REGION_ID_RE, suggestClipId, suggestDestination,
} from '../../../core/formats/donors/clip-manifest-doc';
import { COLLISION_QUANTUM_PX } from '../../../core/formats/donors/donor-marquee';
import { SECTION_PIXEL_SIZE } from '../../../core/model/s4-types';

const INPUT: React.CSSProperties = {
  font: 'inherit', fontSize: T.tSm, background: T.surface, color: T.textHi, border: `1px solid ${T.border}`,
  borderRadius: T.rSm, padding: `${T.s1} ${T.s2}`, minWidth: 0, flex: 1,
};
const BUTTON: React.CSSProperties = {
  font: 'inherit', fontSize: T.tSm, padding: `${T.s1} ${T.s3}`, borderRadius: T.rSm, cursor: 'pointer',
  border: `1px solid ${T.border}`, background: T.raised, color: T.textHi,
};
const PRE: React.CSSProperties = {
  fontFamily: T.fontMono, fontSize: T.t2xs, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', margin: 0,
  background: T.surface, border: `1px solid ${T.border}`, borderRadius: T.rSm, padding: T.s2, color: T.textBase,
  userSelect: 'text',
};

function TargetPicker(): React.ReactElement {
  const root = useProjectStore((s) => s.config?.basePath ?? null);
  const acts = usePasteStore((s) => s.acts);
  const actsError = usePasteStore((s) => s.actsError);
  const target = usePasteStore((s) => s.target);
  const targetError = usePasteStore((s) => s.targetError);
  const marquee = useDonorStore((s) => s.marquee);
  const [newId, setNewId] = React.useState('');
  const [grid, setGrid] = React.useState<{ w: number; h: number } | null>(null);
  const [choosing, setChoosing] = React.useState(false);

  React.useEffect(() => { if (root) void usePasteStore.getState().loadActs(root); }, [root]);

  const hold = marquee ? gridToHold({ x: 0, y: 0, w: marquee.w, h: marquee.h }) : { gridW: 1, gridH: 1 };
  const gw = grid?.w ?? hold.gridW;
  const gh = grid?.h ?? hold.gridH;
  const idBad = newId !== '' && !REGION_ID_RE.test(newId);
  const taken = newId !== '' && (acts ?? []).includes(newId);

  return (
    <div data-donors-target style={{ display: 'flex', flexDirection: 'column', gap: T.s2 }}>
      {actsError && <Hint tone="warning" style={{ marginBottom: 0 }}>Aurora could not list the clip acts: {actsError}</Hint>}
      <div data-donors-acts style={{ display: 'flex', flexWrap: 'wrap', gap: T.s1 }}>
        {(acts ?? []).map((a) => {
          const on = !choosing && target?.actId === a;
          return (
            <button key={a} type="button" data-donors-act={a} style={{ ...BUTTON, borderColor: on ? T.accent : T.border }}
                    onClick={() => { setChoosing(false); void usePasteStore.getState().selectAct(a); }}>{a}</button>
          );
        })}
        {target && !(acts ?? []).includes(target.actId) && !choosing && (
          <button type="button" data-donors-act={target.actId} style={{ ...BUTTON, borderColor: T.accent }}>
            {target.actId} (new)
          </button>
        )}
        <button type="button" data-donors-act-new style={{ ...BUTTON, borderColor: choosing ? T.accent : T.border }}
                onClick={() => setChoosing(true)}>New clip act...</button>
      </div>
      {choosing && (
        <div data-donors-new-act style={{ display: 'flex', flexDirection: 'column', gap: T.s1 }}>
          <Field label="Id">
            <input data-donors-new-act-id value={newId} onChange={(e) => setNewId(e.target.value)}
                   placeholder="s2_my_act" style={INPUT} />
          </Field>
          <Field label="Sections">
            <NumberField value={gw} min={1} max={48} width={44} onChange={(v) => setGrid({ w: Math.max(1, Math.floor(v)), h: gh })} />
            <span style={NOTE}>wide</span>
            <NumberField value={gh} min={1} max={48} width={44} onChange={(v) => setGrid({ w: gw, h: Math.max(1, Math.floor(v)) })} />
            <span style={NOTE}>high</span>
          </Field>
          {idBad && <div style={WARN}>An act id is a region id: {REGION_ID_RE.source}</div>}
          {taken && <div style={WARN}>{newId} already exists; choose it above instead.</div>}
          <button type="button" data-donors-new-act-start style={BUTTON}
                  disabled={newId === '' || idBad || taken}
                  onClick={() => { usePasteStore.getState().newAct(newId, gw, gh); setChoosing(false); }}>
            Start {newId || 'act'} ({gw} x {gh} sections)
          </button>
          <div style={NOTE}>Nothing is written until the first paste: aeon refuses a manifest with no clips.</div>
        </div>
      )}
      {targetError && <Hint tone="warning" style={{ marginBottom: 0 }}>{targetError}</Hint>}
      {target && (
        <div data-donors-target-facts style={NOTE}>
          {target.path}: {target.doc.gridW} x {target.doc.gridH} sections, {target.doc.clips.length} clip(s),
          {' '}{target.doc.corridors.length} corridor(s); {target.onDisk ? 'on disk' : 'not written yet'}.
          {' '}Build it in aeon with S2CLIP={target.actId} ./build.sh.
        </div>
      )}
    </div>
  );
}

const TAG: React.CSSProperties = {
  fontFamily: T.fontMono, fontSize: T.t2xs, border: `1px solid ${T.border}`, borderRadius: T.rSm,
  padding: `0 ${T.s1}`, marginRight: T.s1, color: T.textHi,
};

/** One refusal or warning as aeon's --json names it: the rule, who it is about, aeon's sentence. */
function NoteHead({ note, kind }: { note: ClipNote; kind: 'refusal' | 'warning' }): React.ReactElement {
  return (
    <div style={{ ...(kind === 'refusal' ? WARN : NOTE), marginBottom: T.s1 }}>
      <span data-donors-note-rule style={{ ...TAG, borderColor: kind === 'refusal' ? T.warning : T.border }}>
        {note.rule ?? 'untagged'}
      </span>
      <span data-donors-note-subjects>{subjectsLabel(note.subjects)}</span>
    </div>
  );
}

function WarningList({ warnings }: { warnings: ClipNote[] }): React.ReactElement | null {
  if (warnings.length === 0) return null;
  return (
    <>
      {warnings.map((w, i) => (
        <div key={i} data-donors-warning={w.rule ?? ''} style={{ marginTop: T.s1 }}>
          <NoteHead note={w} kind="warning" />
          <div style={WARN}>aeon warns: {w.message}</div>
        </div>
      ))}
    </>
  );
}

function outcomeView(o: PasteOutcome): React.ReactElement {
  switch (o.kind) {
    case 'pasted':
      return (
        <div data-donors-outcome="pasted" style={NOTE}>
          Pasted {o.clipId}: {o.created ? 'created' : 'rewrote'} {o.path}. aeon validated it and baked it.
          <WarningList warnings={o.warnings} />
        </div>
      );
    case 'refused':
      if (o.stage === 'validate') {
        return (
          <div data-donors-outcome="refused" data-donors-stage="validate">
            <div style={{ ...WARN, marginBottom: T.s1 }}>
              aeon&apos;s manifest loader refused this paste, so nothing was written:
            </div>
            {o.refusals.map((r, i) => (
              <div key={i} data-donors-refusal-note={r.rule ?? ''}>
                <NoteHead note={r} kind="refusal" />
                <pre data-donors-refusal style={PRE}>{r.message}</pre>
              </div>
            ))}
            <WarningList warnings={o.warnings} />
          </div>
        );
      }
      return (
        <div data-donors-outcome="refused" data-donors-stage="bake">
          <div style={{ ...WARN, marginBottom: T.s1 }}>
            aeon&apos;s bake refused this paste, so nothing was written:
          </div>
          <pre data-donors-refusal style={PRE}>{o.text}</pre>
        </div>
      );
    case 'crashed':
      return (
        <div data-donors-outcome="crashed">
          <div style={{ ...WARN, marginBottom: T.s1 }}>
            aeon&apos;s manifest loader CRASHED ({o.exitCode === null ? 'no exit code' : `exit ${o.exitCode}`}), so this paste
            was not judged and nothing was written. This is not a refusal: {o.why}.
          </div>
          <pre data-donors-crash-stderr style={PRE}>{o.stderr.trim() || '(nothing on stderr)'}</pre>
          {o.stdout.trim() && <pre data-donors-crash-stdout style={{ ...PRE, marginTop: T.s1 }}>{o.stdout.trim()}</pre>}
          <div style={{ ...NOTE, marginTop: T.s1, userSelect: 'text' }}>{o.command}</div>
        </div>
      );
    case 'could-not-run':
      return (
        <div data-donors-outcome="could-not-run">
          <div style={{ ...WARN, marginBottom: T.s1 }}>
            Aurora could not run aeon&apos;s {o.stage === 'validate' ? 'manifest loader' : 'bake'}, so this paste was not
            judged and nothing was written:
          </div>
          <pre style={PRE}>{o.text}</pre>
        </div>
      );
    case 'conflict':
    case 'error':
      return <div data-donors-outcome={o.kind} style={WARN}>{o.text}</div>;
    case 'undone':
      return <div data-donors-outcome="undone" style={NOTE}>Undone: {o.removed ? `removed ${o.path}, which the paste had created` : `put back ${o.path} as it was before the paste`}.</div>;
    case 'redone':
      return <div data-donors-outcome="redone" style={NOTE}>Redone: wrote {o.path} again.</div>;
    default:
      return <span />;
  }
}

function PasteForm(): React.ReactElement {
  const zone = useDonorStore((s) => s.zone);
  const marquee = useDonorStore((s) => s.marquee);
  const target = usePasteStore((s) => s.target);
  const busy = usePasteStore((s) => s.busy);
  const outcome = usePasteStore((s) => s.outcome);
  const undoN = usePasteStore((s) => s.undoStack.length);
  const redoN = usePasteStore((s) => s.redoStack.length);
  const draft = useDonorDraft();

  // Suggestions follow the marquee and the target until the author overrides them.
  React.useEffect(() => {
    if (!zone || !marquee || !target) return;
    useDonorDraft.getState().suggest({
      clipId: suggestClipId(target.doc, zone.manifest.zone),
      dst: suggestDestination(target.doc, target.doc.gridW, target.doc.gridH, marquee),
    });
  }, [zone, marquee, target]);

  const idProblem = target && draft.clipId ? clipIdProblem(target.doc, draft.clipId) : null;
  const unaligned = draft.dst !== null && (draft.dst.x % SECTION_PIXEL_SIZE !== 0 || draft.dst.y % SECTION_PIXEL_SIZE !== 0);
  const missing = !zone ? 'Open a donor zone.' : !marquee ? 'Mark a rectangle on the donor zone.'
    : !target ? 'Choose or start a clip act.' : !draft.clipId ? 'Give the clip an id.'
      : idProblem ? idProblem : !draft.dst ? 'Click the act below to place the clip, or type where.'
        : unaligned && draft.reason.trim() === '' ? 'Off the section grid: say why (aeon R11 needs the reason in the file).'
          : null;

  const onPaste = () => {
    if (!zone || !marquee || !target || !draft.dst || missing) return;
    void usePasteStore.getState().paste({
      id: draft.clipId, donor: zone.manifest.donor, zone: zone.manifest.zone,
      src: marquee, dst: { x: draft.dst.x, y: draft.dst.y, w: marquee.w, h: marquee.h },
      unalignedDstReason: unaligned ? draft.reason.trim() : null,
    }).then((o) => {
      if (o.kind !== 'pasted') return;
      // A fresh draft for the NEXT paste, suggested against the act as it now
      // stands. Resetting alone left the id empty: the suggestion effect below
      // had already run for this target and does not run again for a reset.
      const t = usePasteStore.getState().target;
      const z = useDonorStore.getState().zone;
      const m = useDonorStore.getState().marquee;
      useDonorDraft.getState().reset();
      if (t && z && m) {
        useDonorDraft.getState().suggest({
          clipId: suggestClipId(t.doc, z.manifest.zone),
          dst: suggestDestination(t.doc, t.doc.gridW, t.doc.gridH, m),
        });
      }
    });
  };

  return (
    <div data-donors-paste style={{ display: 'flex', flexDirection: 'column', gap: T.s2 }}>
      <Field label="Clip id">
        <input data-donors-clip-id value={draft.clipId} onChange={(e) => useDonorDraft.getState().setClipId(e.target.value)}
               style={INPUT} />
      </Field>
      <Field label="Place at">
        <NumberField value={draft.dst?.x ?? 0} step={8} width={60}
                     onChange={(v) => useDonorDraft.getState().setDst({ x: Math.floor(v), y: draft.dst?.y ?? 0 })} />
        <NumberField value={draft.dst?.y ?? 0} step={8} width={60}
                     onChange={(v) => useDonorDraft.getState().setDst({ x: draft.dst?.x ?? 0, y: Math.floor(v) })} />
        <span style={NOTE}>px</span>
      </Field>
      <Field label="Snap">
        {(['section', 'free'] as const).map((m) => (
          <button key={m} type="button" data-donors-snap={m}
                  style={{ ...BUTTON, fontSize: T.tXs, borderColor: draft.mode === m ? T.accent : T.border }}
                  onClick={() => useDonorDraft.getState().setMode(m)}>
            {m === 'section' ? `to a section (${SECTION_PIXEL_SIZE} px)` : `off the grid, ${COLLISION_QUANTUM_PX} px steps`}
          </button>
        ))}
      </Field>
      {(draft.mode === 'free' || unaligned) && (
        <Field label="Why">
          <input data-donors-reason value={draft.reason} onChange={(e) => useDonorDraft.getState().setReason(e.target.value)}
                 placeholder="the argument for leaving the section grid" style={INPUT} />
        </Field>
      )}
      <div style={NOTE} data-donors-copies>
        A paste writes one clip into {target ? target.path : 'the clip act’s clips.json'} and nothing else. aeon&apos;s bake
        takes the art (every nametable word) and BOTH collision planes from this rectangle; objects and rings are not
        carried. The act&apos;s region rows and palettes are built by aeon&apos;s ROM bake, one per donor zone.
      </div>
      <div style={{ display: 'flex', gap: T.s2, alignItems: 'center' }}>
        <button type="button" data-donors-paste-button style={{ ...BUTTON, borderColor: missing ? T.border : T.accent }}
                disabled={busy || missing !== null} onClick={onPaste}>
          {busy ? 'Asking aeon...' : 'Paste'}
        </button>
        <button type="button" data-donors-undo style={BUTTON} disabled={busy || undoN === 0}
                onClick={() => void usePasteStore.getState().undo()}>Undo paste</button>
        <button type="button" data-donors-redo style={BUTTON} disabled={busy || redoN === 0}
                onClick={() => void usePasteStore.getState().redo()}>Redo</button>
      </div>
      {missing && <div data-donors-missing style={NOTE}>{missing}</div>}
      {outcome && outcomeView(outcome)}
    </div>
  );
}

interface PerClip {
  clip: string; zone: string; attr_entries_alone: number; attr_entries_added: number; solid_cells: number;
  marks_inside_src: number; marks_outside_src: number;
}

const POOL_COLUMNS: Array<{ field: PoolRowField; label: string }> = [
  { field: 'tiles', label: 'tiles' },
  { field: 'tiles_added', label: 'added' },
  { field: 'pages_touched', label: 'pages touched' },
  { field: 'pages_exclusive', label: 'own pages' },
];

const NUM: React.CSSProperties = { textAlign: 'right', fontVariantNumeric: 'tabular-nums' };

/**
 * Each clip's and corridor's pool cost, as aeon's bake counted it. The column
 * tooltips are the file's own per_clip_fields. Nothing is totalled but the one
 * sum aeon states (added tiles plus the blank make the act's tiles).
 */
function PoolRowsView({ clipact }: { clipact: Record<string, unknown> }): React.ReactElement {
  const pr = readPoolRows(clipact);
  if (pr.state === 'unavailable') {
    return (
      <div data-donors-pool-rows="unavailable" style={NOTE}>
        Per-clip tiles and pages: unavailable. {pr.why}.
      </div>
    );
  }
  const rows: Array<{ kind: 'clip' | 'corridor'; row: PoolRow }> = [
    ...pr.perClip.map((row) => ({ kind: 'clip' as const, row })),
    ...pr.perCorridor.map((row) => ({ kind: 'corridor' as const, row })),
  ];
  const cell: React.CSSProperties = { ...NOTE, padding: `0 ${T.s1}` };
  return (
    <div data-donors-pool-rows="present" style={{ display: 'flex', flexDirection: 'column', gap: T.s1 }}>
      <div role="table" aria-label="Pool cost per clip and corridor" style={{
        display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) repeat(4, auto)', columnGap: T.s2,
        border: `1px solid ${T.border}`, borderRadius: T.rSm, padding: T.s1,
      }}>
        <div role="columnheader" style={{ ...cell, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>pool cost</div>
        {POOL_COLUMNS.map((c) => (
          <div key={c.field} role="columnheader" title={pr.fields[c.field]} data-donors-pool-head={c.field}
               style={{ ...cell, ...NUM, textDecoration: 'underline dotted', cursor: 'help' }}>{c.label}</div>
        ))}
        {rows.map(({ kind, row }) => (
          <React.Fragment key={`${kind}:${row.index}`}>
            <div role="cell" data-donors-pool-row={`${kind}:${row.index}`} data-donors-pool-id={row.id}
                 style={{ ...cell, color: T.textHi, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {kind === 'corridor' ? `corridor ${row.id}` : row.id}
            </div>
            {POOL_COLUMNS.map((c) => (
              <div key={c.field} role="cell" data-donors-pool-cell={`${kind}:${row.index}:${c.field}`} style={{ ...cell, ...NUM }}>
                {row[c.field]}
              </div>
            ))}
          </React.Fragment>
        ))}
      </div>
      <div data-donors-pool-note style={NOTE}>
        Tiles leave out the blank tile every act carries: the added column plus 1 makes the act&apos;s {pr.poolTiles}.
        Pages touched counts a shared page once for EACH rectangle that touches it, so that column is not a share
        of the act&apos;s {pr.poolPages} pages and is not totalled. The worst camera window is counted for the act only.
      </div>
      {pr.broken.length > 0 && (
        <div data-donors-pool-broken style={WARN}>aeon&apos;s own sums disagree in this file: {pr.broken.join('; ')}.</div>
      )}
    </div>
  );
}

function BakeReadout(): React.ReactElement | null {
  const baked = usePasteStore((s) => s.baked);
  const bakeNote = usePasteStore((s) => s.bakeNote);
  if (bakeNote) return <div data-donors-bake-note style={{ ...WARN, whiteSpace: 'pre-wrap' }}>{bakeNote}</div>;
  if (!baked) return <Hint style={{ marginBottom: 0 }}>aeon&apos;s per-clip readout appears here once the act has a clip.</Hint>;
  const c = baked.clipact as {
    collision?: { attr_entries?: number; cap?: number; per_clip?: PerClip[] };
    pool?: { tiles?: number; pages?: number };
    verdict_at_placement?: { worst?: number; frames?: number; over?: number };
  };
  const per = c.collision?.per_clip ?? [];
  return (
    <div data-donors-readout style={{ display: 'flex', flexDirection: 'column', gap: T.s1 }}>
      <div data-donors-readout-act style={NOTE}>
        The act, as aeon&apos;s bake counts it: {c.pool?.tiles ?? '?'} pool tiles in {c.pool?.pages ?? '?'} pages; worst
        camera window {c.verdict_at_placement?.worst ?? '?'} of {c.verdict_at_placement?.frames ?? '?'} frames
        ({c.verdict_at_placement?.over ?? '?'} over budget); {c.collision?.attr_entries ?? '?'} of {c.collision?.cap ?? '?'} collision
        attr entries.
      </div>
      <PoolRowsView clipact={baked.clipact} />
      {per.map((p) => (
        <div key={p.clip} data-donors-readout-clip={p.clip} style={NOTE}>
          <strong style={{ color: T.textHi }}>{p.clip}</strong> ({p.zone}): {p.attr_entries_alone} attr entries alone,
          {' '}{p.attr_entries_added} added to the clips before it; {p.solid_cells} solid collision cells;
          {' '}crossover marks {p.marks_inside_src} inside the source, {p.marks_outside_src} cut off outside it.
        </div>
      ))}
    </div>
  );
}

export default function DonorPasteSection(): React.ReactElement {
  return (
    <>
      <CollapsibleSection id="aeon.donors.paste" title="Paste">
        <SectionBody>
          <div style={{ display: 'flex', flexDirection: 'column', gap: T.s3 }}>
            <TargetPicker />
            <PasteForm />
          </div>
        </SectionBody>
      </CollapsibleSection>
      <CollapsibleSection id="aeon.donors.readout" title="aeon's readout">
        <SectionBody><BakeReadout /></SectionBody>
      </CollapsibleSection>
    </>
  );
}
