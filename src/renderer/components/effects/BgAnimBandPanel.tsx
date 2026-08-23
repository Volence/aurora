// The BgAnim band editor — the surface that makes items 20/23/27 reachable.
//
// Until this file existed, `grep -rl bg-override src/renderer/` returned zero
// files: the whole band model (codec, plans, the four undoable commands) was
// complete and no human could touch any of it.
//
// EVERY DECISION IS IN providers/bg-anim-aeon, not here — the rule
// EffectsScenePanel states one file over, for the reason bar 1 states: the node
// suite cannot see React, so logic in this file is logic nothing in `vitest run`
// can check. This component reads stores, renders rows, and hands events to pure
// functions. The only thing it decides is layout.
//
// ═══ PROMOTE FIRST. INSERT IS THE SPECIAL CASE. ═══
//
// aeon's live `editor_bg_override.json` carries 448 tiles against a capacity of
// 448. `insertBand` refuses at EVERY band size on that document, so a panel
// whose primary control is "Add band" is a panel that does nothing on the only
// real content there is. PROMOTE is first, is the default, and works on a full
// blob because it MOVES art the document already carries rather than adding
// any. "Add band" is still here — a non-full document is an ordinary thing to
// author against — but it is below, and when it is unavailable it says the
// number of free slots and points at promotion, because a disabled control with
// no number beside it teaches nothing.
//
// ═══ THERE IS NO VERTICAL BAND, AND THE PANEL SAYS SO ═══
//
// Every band shifts HORIZONTALLY. The driver picks the SCALAR SOURCE the step is
// read from (`camera_x` / `camera_y` / `timer`) and never an axis; `camera_y` is
// the name that reads like a vertical instruction and is not one. The dropdown's
// options come from BGANIM_DRIVER_NAMES (read out of the vendored consumer
// contract) and every one of them carries that correction in its title.
//
// NO PREVIEW, DELIBERATELY, and it is not an omission — see
// docs/reviews/2026-08-22-preview-posture-ruling.md. Nothing here starts a
// clock, schedules a frame, or touches MapViewport, so the viewport's measured
// zero-idle-repaint property is left exactly as it was.

import React from 'react';
import { T, SectionBody, CollapsibleSection, Select, NumberField, Chip, IconButton } from '../ui';
import { useProjectStore, getActiveLevel } from '../../state/projectStore';
import { executeCommand } from '../../state/editorStore';
import { useHistoryVersion } from '../../hooks/useHistoryVersion';
import type { AnyCommand } from '../../../core/editing/commands';
import {
  DEFAULT_DRIVER, addBandCommand, bandBudget, bandRows, demoteBandCommand,
  driverOptions, insertUnavailableReason, patternPxFor, promoteBandCommand,
  promoteUnavailableReason, removeBandCommand, rowChoices,
  type BandCommandResult, type BandSpec,
} from '../../providers/bg-anim-aeon';

const row: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: T.s2, marginBottom: T.s2, flexWrap: 'wrap',
};
const label: React.CSSProperties = {
  fontSize: T.tXs, color: T.textLo, minWidth: 68, flexShrink: 0,
};
const note: React.CSSProperties = { fontSize: T.tXs, color: T.textLo, lineHeight: 1.5 };
const warn: React.CSSProperties = { ...note, color: T.warning };

/**
 * A `variant="list"` section's body, with the scroller the model requires.
 *
 * The same constant EffectsScenePanel carries, and for the same measured reason:
 * CollapsibleSection's list variant takes a share of the column and expects the
 * content to scroll inside it, and a panel that does not supply `overflowY`
 * paints its rows straight over the sections beneath. Four bands is the ceiling
 * here so the stack is short, but the rule is about the container, not the
 * count — and `panel-scrollers.test.ts` cannot see either panel's sections,
 * because the facet mounts the components rather than the sections.
 */
const LIST_BODY: React.CSSProperties = { overflowY: 'auto' };

/** Run a command on the focused aeon document. */
function run(command: AnyCommand): void {
  const level = getActiveLevel(useProjectStore.getState());
  if (!level) return;
  executeCommand(command, level);
}

export default function BgAnimBandPanel(): React.ReactElement {
  // Re-read after any execute/undo/redo. A band edit REPLACES the document
  // inside the project's holder, so there is no store identity change to
  // subscribe to — exactly the situation this hook exists for.
  useHistoryVersion();
  const project = useProjectStore((s) => s.project);

  const state = project?.bgOverride ?? null;
  const doc = state?.doc ?? null;
  const budget = bandBudget(doc);
  const rows = bandRows(doc);

  // The promotion form. `cols`/`rows` seed at 1x1 — the smallest legal band, and
  // the one most likely to fit whatever range an author points at; the static
  // base seeds at the first slot no band already owns, which is where a
  // promotion is legal by construction.
  const [cols, setCols] = React.useState(1);
  const [bandRowCount, setBandRowCount] = React.useState(1);
  const [staticBase, setStaticBase] = React.useState(0);
  const [driver, setDriver] = React.useState<string>(DEFAULT_DRIVER);
  const [explicitDriver, setExplicitDriver] = React.useState(false);
  const [refusalText, setRefusalText] = React.useState<string | null>(null);
  const [pendingRemoval, setPendingRemoval] = React.useState<number | null>(null);

  // Keep the static base at or past the animated prefix as bands come and go.
  // Not a clamp on the author's typing — this only moves the seed when the
  // document moved under it, so a base the author chose is never rewritten
  // while it is still legal.
  React.useEffect(() => {
    setStaticBase((b) => (b < budget.firstPromotableSlot ? budget.firstPromotableSlot : b));
  }, [budget.firstPromotableSlot]);

  const spec: BandSpec = {
    cols, rows: bandRowCount,
    ...(explicitDriver ? { driver } : {}),
  };
  const tileCount = cols * bandRowCount;

  function apply(result: BandCommandResult): void {
    if (!result.ok) { setRefusalText(result.reason); return; }
    setRefusalText(null);
    run(result.command);
  }

  const promoteOff = promoteUnavailableReason(doc);
  const insertOff = insertUnavailableReason(doc, cols, bandRowCount);

  const driverField = (
    <>
      <span style={label} title="The SCALAR the step is read from. Never an axis.">Driver</span>
      <Select
        title="Which scalar drives this band's step. Every band shifts HORIZONTALLY whichever
               driver it uses — camera_y does NOT mean vertical motion."
        value={explicitDriver ? driver : ''}
        onChange={(v) => {
          if (v === '') { setExplicitDriver(false); return; }
          setExplicitDriver(true); setDriver(v);
        }}
        style={{ flex: 1, minWidth: 110 }}>
        {/* The empty option LEAVES THE KEY OUT, which is the shape the codec
            prefers: a document that does not spell `driver` tracks whatever the
            consumer's default becomes, and writing today's default into it
            would freeze it. */}
        <option value="">(default — {DEFAULT_DRIVER})</option>
        {driverOptions().map((o) => (
          <option key={o.value} value={o.value} title={o.title}>{o.label}</option>
        ))}
      </Select>
    </>
  );

  return (
    <>
      <CollapsibleSection
        id="aeon.bganim.bands"
        title={`BG animation bands (${budget.bands}/${budget.maxBands})`}
        variant="list">
       <SectionBody style={LIST_BODY}>
        {state === null && (
          <div style={note}>No aeon project is open.</div>
        )}
        {state !== null && state.unreadable !== null && (
          <div style={warn}>
            <code>{state.unreadable.path}</code> exists and could not be read, so no band can be
            edited. Aurora will NOT overwrite it. Reason: {state.unreadable.reason}
          </div>
        )}
        {state !== null && state.unreadable === null && doc === null && (
          <div style={note}>
            This project has no <code>editor_bg_override.json</code>. Bands live in that document,
            which also carries the Plane B layout and its tile blob — there is nothing to animate
            until it exists.
          </div>
        )}

        {doc !== null && rows.length === 0 && (
          <div style={note}>
            No bands yet. A band declares a contiguous range of the background&apos;s tile blob
            animated: its slots become a prefix of <code>tiles</code> and the runtime shifts them
            horizontally. Promote a static range below.
          </div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: T.s1 }}>
          {rows.map((b) => (
            <div key={b.index} style={{
              border: `1px solid ${T.border}`, borderRadius: T.rMd,
              padding: T.s2, background: T.raised,
            }}>
              <div style={{ ...row, marginBottom: T.s1 }}>
                <span style={{ fontSize: T.tSm, color: T.textHi }}>
                  #{b.index} &nbsp;{b.geometry}
                </span>
                <span style={{ ...note, opacity: 0.85 }}>
                  slots {b.slotRange} · {b.tileCount} tile{b.tileCount === 1 ? '' : 's'} ·{' '}
                  {b.patternPx}px pattern · {b.columnBytes}B/col · {b.phaseBanks} banks
                </span>
              </div>
              <div style={{ ...row, marginBottom: T.s1 }}>
                <span style={note}
                  title="The scalar source. The band shifts HORIZONTALLY whichever driver it uses.">
                  driver <strong>{b.driver}</strong>
                  {b.driverIsExplicit ? '' : ' (default — the key is absent)'}
                </span>
                <span style={note}>
                  · rate_shift <strong>{b.rateShift}</strong>
                  {b.rateShiftIsExplicit ? '' : ' (default)'}
                </span>
              </div>
              <div style={{ ...row, marginBottom: 0 }}>
                <IconButton icon={<span>Demote</span>}
                  label={`Demote band ${b.index} to static tiles`}
                  onClick={() => { setPendingRemoval(null); apply(demoteBandCommand(doc, b.index)); }} />
                <span style={note}>lossless — the art stays, it just stops animating</span>
                <div style={{ flex: 1 }} />
                <IconButton icon={<span>Remove</span>}
                  label={`Remove band ${b.index}`}
                  onClick={() => {
                    // First press asks the COMMAND, which refuses when cells draw
                    // the band and says how many. That refusal IS the prompt —
                    // the panel never invents its own count.
                    const r = removeBandCommand(doc, b.index, false);
                    if (r.ok) { setPendingRemoval(null); apply(r); return; }
                    setRefusalText(r.reason);
                    setPendingRemoval(b.index);
                  }} />
              </div>
              {pendingRemoval === b.index && (
                <div style={{ ...row, marginTop: T.s2, marginBottom: 0 }}>
                  <Chip tone="warning"
                    onClick={() => {
                      setPendingRemoval(null);
                      apply(removeBandCommand(doc, b.index, true));
                    }}>
                    Remove and blank those cells
                  </Chip>
                  <Chip onClick={() => { setPendingRemoval(null); setRefusalText(null); }}>
                    Cancel
                  </Chip>
                </div>
              )}
            </div>
          ))}
        </div>

        {doc !== null && (
          <div style={{ ...note, marginTop: T.s3 }}>
            Blob {budget.tiles}/{budget.tileCapacity} tiles ·{' '}
            <strong>{budget.tileSlotsRemaining}</strong> free ·{' '}
            {budget.animatedSlots} animated (slots 0..{budget.animatedSlots}) ·{' '}
            {budget.bandsRemaining} band slot{budget.bandsRemaining === 1 ? '' : 's'} left
          </div>
        )}
        {refusalText && <div style={{ ...warn, marginTop: T.s2 }}>{refusalText}</div>}
       </SectionBody>
      </CollapsibleSection>

      <CollapsibleSection id="aeon.bganim.promote" title="Promote static tiles to a band">
       <SectionBody>
        <div style={row}>
          <span style={label} title="Pattern width in tiles">Cols</span>
          <NumberField title={`cols — pattern_px will be ${patternPxFor(cols)}`}
            min={1} width={56} value={cols}
            onChange={(n) => setCols(Math.max(1, Math.round(n) || 1))} />
          <span style={label} title="Rows must make rows*32 a power of two — the runtime shifts a whole column">
            Rows
          </span>
          <Select title="rows — constrained so that rows * 32 bytes per column is an exact power of two,
                         because the runtime rotates a column by shifting it"
            value={String(bandRowCount)}
            onChange={(v) => setBandRowCount(Number(v))}
            style={{ width: 80 }}>
            {rowChoices().map((r) => <option key={r} value={String(r)}>{r}</option>)}
          </Select>
        </div>
        <div style={row}>
          <span style={label} title="First tile of the static range this band takes over">From tile</span>
          <NumberField
            title={`static base — the range is ${staticBase}..${staticBase + tileCount}. `
              + `Slots 0..${budget.animatedSlots} already belong to bands.`}
            min={budget.firstPromotableSlot} width={72} value={staticBase}
            onChange={(n) => setStaticBase(Math.max(0, Math.round(n) || 0))} />
          <span style={note}>
            takes {tileCount} tile{tileCount === 1 ? '' : 's'} → {staticBase}..{staticBase + tileCount}
          </span>
        </div>
        <div style={row}>{driverField}</div>
        <div style={row}>
          <Chip disabled={promoteOff !== null}
            title={promoteOff ?? 'Declare this static range animated. The blob does not grow.'}
            onClick={() => apply(promoteBandCommand(doc, staticBase, spec))}>
            Promote
          </Chip>
          <span style={note}>
            The picture does not change: phase 0 IS this art, and banks 1–7 arrive as copies of it,
            so the band is inert until you draw its frames.
          </span>
        </div>
        {promoteOff && <div style={warn}>{promoteOff}</div>}
       </SectionBody>
      </CollapsibleSection>

      <CollapsibleSection id="aeon.bganim.add" title="Add a band (needs free tiles)" defaultCollapsed>
       <SectionBody>
        <div style={note}>
          Adding a band puts NEW art into the blob, so it needs {tileCount} free
          slot{tileCount === 1 ? '' : 's'}. On a full document use Promote instead — it moves art the
          document already carries. The band arrives blank and unreferenced; nothing on screen
          changes until you point layout cells at it.
        </div>
        <div style={{ ...row, marginTop: T.s2 }}>
          <Chip disabled={insertOff !== null}
            title={insertOff ?? `Add a blank ${cols}x${bandRowCount} band (${tileCount} tiles)`}
            onClick={() => apply(addBandCommand(doc, spec))}>
            Add {cols}x{bandRowCount} band
          </Chip>
          <span style={note}>{budget.tileSlotsRemaining} free slot(s)</span>
        </div>
        {insertOff && <div style={warn}>{insertOff}</div>}
       </SectionBody>
      </CollapsibleSection>
    </>
  );
}
