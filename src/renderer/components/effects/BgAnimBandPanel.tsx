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
// ═══ TWO SOURCES FOR A BAND, AND THEY ARE PEERS ═══
//
// A band needs geometry, a driver, and ART. The geometry and driver mean the
// same thing either way, so they are asked ONCE, at the top of "New band". What
// differs is where the art comes from, and the two answers sit side by side
// under that one form:
//
//   FROM EXISTING TILES (promote) — the range MOVES to the front of the blob.
//   Costs no tiles, ever, so it is the only door that works on a document with
//   no free slots. The picture is unchanged in both directions.
//
//   FROM NEW ART (insert) — the band's art is added, so the blob GROWS by
//   cols*rows and the operation needs that many free slots.
//
// NEITHER IS THE FALLBACK. An earlier revision of this panel put insertion in a
// collapsed section titled "(needs free tiles)", on the reading that aeon's
// live document ships at 448/448 and therefore insertion never works on real
// content. THE CEILING IS REAL — 448 is `(0xB800-0x8000)/32`, the BG tile region
// below the sprite attribute table — BUT THE SATURATION IS NOT: the owner has
// ruled that background a non-final generator experiment, and the aeon lane is
// adding a band-tile reserve to the generator precisely so this art can carry
// parallax and animation. A document being full today is one import run's
// property, not a fact to shape an interface around.
//
// WHAT THAT DOES NOT CHANGE is the capacity readout. `tileSlotsRemaining` and
// `bandsRemaining` stay on screen beside both actions, and a refused control
// still carries the codec's reason rather than being a dead button — for a
// better reason than the first draft had: capacity is a LIVE quantity the author
// is actively managing, so the number belongs next to the control that spends
// it, in both directions.
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
  DEFAULT_DRIVER, DEFAULT_PHASE_FILL, DEFAULT_RATE_SHIFT, addBandCommand, bandBudget,
  bandRows, clampRateShift, demoteBandCommand, driverOptions, insertUnavailableReason,
  patternPxFor, phaseFillOptions, promoteBandCommand, promoteUnavailableReason,
  rateShiftNote, removeBandCommand, rowChoices,
  type BandCommandResult, type BandPhaseFill, type BandSpec,
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
  // The rate, in the same two-part shape the driver has and for the same reason:
  // "default" is a STATE OF THE DOCUMENT (the key is absent and the file tracks
  // the consumer), not a number to pre-fill the box with. The seed the box takes
  // when an author does switch to a custom rate is the contract's default —
  // derived, never a literal.
  const [rateShift, setRateShift] = React.useState(DEFAULT_RATE_SHIFT);
  const [explicitRateShift, setExplicitRateShift] = React.useState(false);
  const [phaseFill, setPhaseFill] = React.useState<BandPhaseFill>(DEFAULT_PHASE_FILL);
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
    cols, rows: bandRowCount, phaseFill,
    ...(explicitDriver ? { driver } : {}),
    ...(explicitRateShift ? { rateShift } : {}),
  };
  const fillOption = phaseFillOptions().find((o) => o.value === phaseFill)
    ?? phaseFillOptions()[0];
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

  // THE SPEED CONTROL, AND IT RUNS BACKWARDS. `step = driver >> rate_shift`, so
  // a HIGHER rate_shift is a SLOWER band — the opposite of what a field one
  // reads as "speed" implies. Every label, title and note here says so, and
  // `rateShiftNote` prints the exact consequence of the author's own number.
  //
  // TWO CONTROLS, NOT A PRE-FILLED SPINNER, for the reason the driver picker's
  // empty option gives one field up: "default" here means THE KEY IS ABSENT, so
  // the document tracks whatever the consumer's default becomes. A single
  // spinner seeded at today's default would write today's default into every
  // band an author never thought about the rate of — freezing it. The number box
  // only appears once an author has said the rate is theirs.
  const rateShiftField = (
    <>
      <span style={label}
        title="rate_shift — a RIGHT SHIFT on the driver, so HIGHER IS SLOWER.">
        Rate shift
      </span>
      <Select
        title="rate_shift — HIGHER IS SLOWER. The step is the driver scalar shifted RIGHT by this
               many bits (step = driver >> rate_shift), so each +1 halves the band's speed.
               Leave it at (default) to omit the key and track aeon's own default."
        value={explicitRateShift ? 'custom' : ''}
        onChange={(v) => setExplicitRateShift(v === 'custom')}
        style={{ flex: 1, minWidth: 110 }}>
        {/* Same contract as the driver's empty option: this LEAVES THE KEY OUT. */}
        <option value=""
          title="Omit rate_shift. The band moves at whatever aeon's own default is, today and
                 after any change to it.">
          (default — {DEFAULT_RATE_SHIFT})
        </option>
        <option value="custom"
          title="Spell rate_shift out in the document. Remember: higher is SLOWER.">
          custom…
        </option>
      </Select>
      {explicitRateShift && (
        <NumberField
          title={rateShiftNote(rateShift)}
          // `min` styles the spinner and stops NOTHING an author types (ROADMAP
          // item 37) — `clampRateShift` is the actual bound. There is no `max`:
          // the contract has no upper bound and inventing one would refuse a
          // value aeon accepts.
          min={0} width={64} value={rateShift}
          onChange={(n) => setRateShift(clampRateShift(n))} />
      )}
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

      <CollapsibleSection id="aeon.bganim.new" title="New band">
       <SectionBody>
        {/* ONE GEOMETRY, TWO SOURCES. Cols, rows and driver describe the band
            itself and mean the same thing whichever way its art arrives, so
            they are asked once, above both actions. Duplicating them into two
            sections would have been the shape that quietly says one of the two
            is the real one. */}
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
          <span style={note}>
            {tileCount} slot{tileCount === 1 ? '' : 's'} · {patternPxFor(cols)}px pattern
          </span>
        </div>
        <div style={row}>{driverField}</div>
        <div style={{ ...row, marginBottom: T.s1 }}>{rateShiftField}</div>
        <div style={{ ...note, marginBottom: T.s2 }}>
          {rateShiftNote(explicitRateShift ? rateShift : DEFAULT_RATE_SHIFT)}
        </div>
        <div style={row}>
          <span style={label}
            title="How banks 1-7 are filled from phase 0. Phase 0 itself is never a choice: it is
                   the art the band rests at.">
            Banks 1–7
          </span>
          <Select
            title="phase fill — how banks 1-7 (the contract's pre-shifted phases, selected by
                   step & 7) are derived from the band's phase 0"
            value={phaseFill}
            onChange={(v) => setPhaseFill(v as BandPhaseFill)}
            style={{ flex: 1, minWidth: 130 }}>
            {phaseFillOptions().map((o) => (
              <option key={o.value} value={o.value} title={o.title}>{o.label}</option>
            ))}
          </Select>
        </div>

        {/* ── Source 1: art the document already carries ────────────────── */}
        <div style={{ ...row, marginTop: T.s3, marginBottom: T.s1 }}>
          <span style={{ fontSize: T.tSm, color: T.textHi }}>From existing tiles</span>
          <span style={note}>costs no tiles — the range moves, it is not copied</span>
        </div>
        <div style={row}>
          <span style={label} title="First tile of the static range this band takes over">From tile</span>
          <NumberField
            title={`static base — the range is ${staticBase}..${staticBase + tileCount}. `
              + `Slots 0..${budget.animatedSlots} already belong to bands.`}
            min={budget.firstPromotableSlot} width={72} value={staticBase}
            onChange={(n) => setStaticBase(Math.max(0, Math.round(n) || 0))} />
          <span style={note}>→ {staticBase}..{staticBase + tileCount}</span>
          <Chip disabled={promoteOff !== null}
            title={promoteOff ?? 'Declare this static range animated. The blob does not grow.'}
            onClick={() => apply(promoteBandCommand(doc, staticBase, spec))}>
            Promote
          </Chip>
        </div>
        <div style={note}>
          The picture at rest does not change: phase 0 IS this art, and {fillOption.note}
        </div>
        {promoteOff && <div style={warn}>{promoteOff}</div>}

        {/* ── Source 2: new art ─────────────────────────────────────────── */}
        <div style={{ ...row, marginTop: T.s3, marginBottom: T.s1 }}>
          <span style={{ fontSize: T.tSm, color: T.textHi }}>From new art</span>
          <span style={note}>
            costs {tileCount} slot{tileCount === 1 ? '' : 's'} ·{' '}
            <strong>{budget.tileSlotsRemaining}</strong> free
          </span>
        </div>
        <div style={row}>
          <Chip disabled={insertOff !== null}
            title={insertOff ?? `Add a blank ${cols}x${bandRowCount} band (${tileCount} tiles)`}
            onClick={() => apply(addBandCommand(doc, spec))}>
            Add band
          </Chip>
          <span style={note}>
            The band arrives blank and unreferenced; nothing on screen changes until you point
            layout cells at it. (Its phase 0 is blank art, so every fill mode agrees here.)
          </span>
        </div>
        {insertOff && <div style={warn}>{insertOff}</div>}
       </SectionBody>
      </CollapsibleSection>

    </>
  );
}
