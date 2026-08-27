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
// ═══ THE PREVIEW LIVES IN THIS SECTION NOW (ROADMAP item 45) ═══
//
// An earlier revision of this docblock said "NO PREVIEW, DELIBERATELY". That was
// true of item 42's shape, where the preview was an eighth section of its own —
// and it is what produced the defect item 45 fixes: `Band preview` drew a SECOND
// card per band (driver, geometry, resolved rate, verdict) beside the card
// below, in a column that overflowed by 235px at 1680x1050.
//
// So the per-band half is folded into the card: the RESOLVED RATE (what
// `rate_shift` means in the units this band's driver reads) and the VERDICT
// (previewing / licensed-but-undrawn / refused-and-why). Both come from
// `bandStatus`, a pure function in providers/bganim-preview-aeon with its own
// unit tests — the rule this file's docblock states two paragraphs up, applied
// to the one thing this panel gained.
//
// `BgAnimPreviewStrip` renders the rest — the playback chip, the honesty label,
// and the two warnings that were never per band — at the top of this section,
// because a control belongs above the list it governs.
//
// STILL NO CLOCK HERE. `refreshBandPreview` is a pure re-derivation, idempotent
// on an unchanged signature; nothing in this file starts a clock, schedules a
// frame, or touches MapViewport, so the viewport's measured zero-idle-repaint
// property is left exactly as it was. See
// docs/reviews/2026-08-22-preview-posture-ruling.md.
//
// ═══ WHERE THESE TWO SECTIONS SIT IN THE COLUMN (ROADMAP item 41) ═══
//
// Rows, labels, hints and cards come from `column-layout`, shared with
// EffectsScenePanel — the two panels draw ONE column and used to carry two
// private copies of its geometry.
//
//   BG animation bands  CONTENT, not `list`. A band list is bounded at four
//                       rows BY THE CONTRACT (BGANIM_MAX_BANDS), so its natural
//                       height is a known, small quantity and it does not need
//                       a share of the column to be readable. Measured at one
//                       band it was pinned to the 160px list FLOOR and still
//                       overflowed by 65px — a scrollbar on a section whose
//                       content is four rows at its theoretical worst.
//                       IT IS `defaultCollapsed` NOW — see the next block.
//   New band            CONTENT, and now `defaultCollapsed`. It is a CREATION
//                       form, not something an author arriving at this facet is
//                       reading, and it was measured as the single tallest box
//                       in the column: 474px of 1229px, 38% of everything.
//                       Closing it is what gives the column enough height for
//                       the Layers list to stop sitting on its floor — the
//                       whole tidy-up turns on this one attribute.
//
// ═══ THE COLUMN ARRIVES ON THE SCENE; THE BANDS ARE ONE CLICK AWAY ═══
//
// ROADMAP item 45 closed with an explicit refusal: "1280x800 DOES NOT REACH
// ZERO", 214px of the column still needing a scroll at that height. This is
// that parcel, and the arithmetic is what decided it — not taste.
//
// Measured on the merged tree at 1280x800, the column has 702px of client
// height and 954px of content. Its seven section boxes are Scenes 137, Scene
// 207, Layers 160 (its floor), Section assignment 115, BG animation bands 286,
// New band 25 and Properties 25. FOUR of those five open sections are the
// SCENE — pick it, read its parameters, edit its layers, bind it to a section —
// and they total 619px before this one is drawn. There is no arrangement of
// 619 + 286 + 50 that fits in 702, so no amount of tightening reaches zero:
// something has to arrive closed, and only one section in this column is not
// about the scene.
//
// THAT IS THE ARGUMENT, and it is not "delete until it fits". This section is
// the column's SECOND SUBJECT — the background's animated tile blob, which an
// author reaches deliberately, not on the way to tuning parallax. Its creation
// form was already `defaultCollapsed` for exactly that reason; leaving its
// READOUT open while its form was closed split one subject across two arrival
// states. Now the whole subject is one click behind a header that still names
// it and still counts its bands (`BG animation bands (1/4)`), so the facet's
// band capability and the document's band count are both on screen without
// opening anything, and everything inside — the verdicts, the refusal path, the
// honesty label — is one click away. That is the standard: one click, never
// invisible.
//
// WHAT IT BUYS, MEASURED AT BOTH FRAMES: the column reaches ZERO overflow at
// 1280x800 and stays at zero at 1680x1050, with ONE live scrollbar instead of
// two, and all seven headers reachable without scrolling at both. At 1680x1050
// the 292px this releases goes where EffectsScenePanel's docblock says the
// column's leftover height belongs — the Layers list comes off its 160px floor
// and draws the scene's layers instead of one and a third of them.
//
// THE ALTERNATIVE THAT WAS WEIGHED AND REJECTED: keying `defaultCollapsed` on
// window height, so the section stays open on a 1050px screen where there IS
// room for it. It would have preserved more on arrival at the big frame — and
// `defaultCollapsed` is read once, at first mount, so the state would then be
// whatever height the window happened to be the first time an author opened
// this facet, and would not follow a resize. An arrival state nobody can
// predict is worse than one that is the same everywhere, and it would have made
// the harness's [A1] row carry frame-dependent expectations, which is where
// regressions hide.
//
// ⚠ FIVE CDP HARNESSES DRIVE THESE TWO SECTIONS (bganim-band, -rate-shift,
// -insert-roomy, -ui-authored-composition, -motion) and each now opens BOTH
// before touching anything in them. A collapsed section renders no children at
// all, so a harness that reaches straight for a control gets `null` and reports
// the control as missing. Measured when `BG animation bands` joined `New band`
// in arriving collapsed: bganim-motion went 23/23 to 11/23 on that alone, ten
// rows calling a working feature broken.

import React from 'react';
import { T, SectionBody, CollapsibleSection, Select, NumberField, Chip, IconButton } from '../ui';
import { Field, Row, Hint, Group, Card, CONTROL_INSET } from './column-layout';
import BgAnimPreviewStrip from './BgAnimPreviewStrip';
import { useProjectStore, getActiveLevel } from '../../state/projectStore';
import { executeCommand, useEditorStore } from '../../state/editorStore';
import { useHistoryVersion } from '../../hooks/useHistoryVersion';
import {
  bandStatus, refreshBandPreview, resolveBandLens, BAND_MECHANISM_HINT,
} from '../../providers/bganim-preview-aeon';
import { coverageSummary } from '../../providers/band-coverage';
import { BAND_LENS_FILL, BAND_LENS_EDGE } from '../../canvas/canvas-colors';

/**
 * THE SAME WASH THE MAP DRAWS, as a chip in the column.
 *
 * The defect it exists for is the owner's own sentence about the first
 * revision: the tint "read as 'something/information' — just didn't know what it
 * was". A footprint line that says "highlighted on the map" beside a square of
 * the ACTUAL highlight colour makes the link at the moment the author selects
 * the band, which is the moment they are asking the question. Two canvas
 * constants imported rather than restated, so the chip cannot drift from the
 * wash it stands for.
 */
/**
 * The way OUT of the lens. Any left-click on the Plane-B rectangle seeds it
 * (`commitBandMark`), and until parcel A nothing wrote `bandLensTarget = null`
 * back — the owner lit it and could not get out. Sits beside every
 * "highlighted on the map" line, because that line is where the eye is when the
 * question is "how do I make this go away". Escape on the map does the same.
 *
 * The click must not reach the band card behind it: the card's own `onClick`
 * re-lights the lens it just put out.
 */
function HideLensChip({ onHide }: { onHide: () => void }): React.ReactElement {
  return (
    <span onClick={(e) => e.stopPropagation()}>
      <Chip onClick={onHide} title="Stop tinting the map. The candidate keeps its values; Escape on the map does the same.">
        Hide
      </Chip>
    </span>
  );
}

function LensSwatch(): React.ReactElement {
  return (
    <span aria-hidden style={{
      display: 'inline-block', width: 9, height: 9, marginRight: 5,
      verticalAlign: 'baseline',
      background: BAND_LENS_FILL, border: `1px solid ${BAND_LENS_EDGE}`,
    }} />
  );
}
import type { AnyCommand } from '../../../core/editing/commands';
import {
  DEFAULT_DRIVER, DEFAULT_PHASE_FILL, DEFAULT_RATE_SHIFT, bandBudget,
  bandRows, clampRateShift, demoteBandCommand, driverOptions,
  patternPxFor, phaseFillOptions,
  rateShiftNote, removeBandCommand, rowChoices, slotSpanPhrase,
  type BandCommandResult, type BandPhaseFill,
} from '../../providers/bg-anim-aeon';
// The two creation verbs — label, disabled reason, command — derived ONCE and
// shared with the Effects facet's tool-options bar (parcel B). This panel no
// longer calls `promoteBandCommand` / `addBandCommand` itself, so the two
// surfaces cannot run different specs or disagree about why a chip is off.
import { bandVerbs } from '../../providers/band-verbs';
// Parcel I: the bank strip and its two verbs (open bank k in the Art facet;
// Shift = regenerate banks 1..7 from phase 0), decided in one provider.
import BandBankStrip from './BandBankStrip';
import { openBandBankDocument, regenerateShiftCommand } from '../../providers/bg-anim-art';
import { useArtStore } from '../../state/artStore';
import { useSessionStore } from '../../state/sessionStore';
import { openDocumentGuarded } from '../art/open-document';
import { switchFacet } from '../../workspace/facet-tools';
import { getCurrentZone } from '../../state/projectStore';

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
  const historyVersion = useHistoryVersion();
  const project = useProjectStore((s) => s.project);
  // THE SAME SUBSCRIPTIONS THE STRIP TAKES, and for the same reason: a band's
  // verdict is a claim about the blob ON SCREEN, and the act and the active
  // section each re-resolve which blob that is without moving an edit clock.
  const liveEditVersion = useEditorStore((s) => s.liveEditVersion);
  useProjectStore((s) => s.currentActId);
  useEditorStore((s) => s.activeSectionIndex);
  // Derived at render, never stored. Idempotent on an unchanged signature, so
  // this costs a map lookup on every frame the document did not move.
  const preview = refreshBandPreview(`${historyVersion}:${liveEditVersion}`);

  const state = project?.bgOverride ?? null;
  const doc = state?.doc ?? null;
  const budget = bandBudget(doc);
  const rows = bandRows(doc);

  // THE PROMOTION FORM'S GEOMETRY LIVES IN THE STORE (ROADMAP item 43 part 2).
  //
  // It was `React.useState` here, and `MapViewport` — a SIBLING, not a child —
  // cannot read that. The map now tints every background cell the candidate
  // range would animate, so the form and the canvas have to agree on what the
  // candidate IS; one store field is the only way they can. Exactly the lift
  // `selectedEffectsSceneId` took for part 1, for exactly the same reason.
  //
  // `cols`/`rows` still seed at 1x1 — the smallest legal band, and the one most
  // likely to fit whatever range an author points at; the static base still
  // seeds at the first slot no band already owns, which is where a promotion is
  // legal by construction.
  const candidate = useEditorStore((s) => s.bandCandidate);
  const setCandidate = useEditorStore((s) => s.setBandCandidate);
  const lensTarget = useEditorStore((s) => s.bandLensTarget);
  const setLensTarget = useEditorStore((s) => s.setBandLensTarget);
  // Which band bank the Art facet has open, so its thumbnail reads selected.
  const openBgArt = useArtStore((s) => s.open?.bgOverride ?? null);
  const { cols, rows: bandRowCount, staticBase } = candidate;
  const setCols = (n: number): void => setCandidate({ cols: n });
  const setBandRowCount = (n: number): void => setCandidate({ rows: n });
  const setStaticBase = (n: number): void => setCandidate({ staticBase: n });
  // WHAT THE MAP IS LIGHTING, resolved through the SAME function the canvas
  // calls (`resolveBandLens`) so the sentence in this column and the tint on the
  // map cannot describe different sets of cells.
  const lens = resolveBandLens();
  // THE REST OF THE FORM IS ON THE CANDIDATE TOO (parcel B). Driver, rate and
  // phase fill were `React.useState` here, and the Effects facet's tool-options
  // bar — a sibling — now runs the same two commands, so it has to see the
  // same spec: the lift `cols`/`rows`/`staticBase` took, for the same reason.
  // ABSENT IS THE DEFAULT, exactly as before: an omitted `driver` / `rateShift`
  // leaves the key out of the document so it tracks the consumer, and the
  // `(default)` options below write `undefined` rather than today's number.
  const driver = candidate.driver ?? DEFAULT_DRIVER;
  const explicitDriver = candidate.driver !== undefined;
  // The rate, in the same two-part shape the driver has and for the same reason:
  // "default" is a STATE OF THE DOCUMENT (the key is absent and the file tracks
  // the consumer), not a number to pre-fill the box with. The seed the box takes
  // when an author does switch to a custom rate is the contract's default —
  // derived, never a literal.
  const rateShift = candidate.rateShift ?? DEFAULT_RATE_SHIFT;
  const explicitRateShift = candidate.rateShift !== undefined;
  const phaseFill: BandPhaseFill = candidate.phaseFill ?? DEFAULT_PHASE_FILL;
  const [refusalText, setRefusalText] = React.useState<string | null>(null);
  const [pendingRemoval, setPendingRemoval] = React.useState<number | null>(null);

  // Keep the static base at or past the animated prefix as bands come and go.
  // Not a clamp on the author's typing — this only moves the seed when the
  // document moved under it, so a base the author chose is never rewritten
  // while it is still legal.
  //
  // ⚠ IT MUST NOT LIGHT THE LENS. `setBandCandidate` points the lens at the
  // candidate — that is right for an author's keystroke and wrong for a
  // document that moved on its own, which would make an undo of somebody else's
  // promote silently take over the map. So this writes the field directly.
  const firstPromotableSlot = budget.firstPromotableSlot;
  React.useEffect(() => {
    const b = useEditorStore.getState().bandCandidate;
    if (b.staticBase < firstPromotableSlot) {
      useEditorStore.setState({ bandCandidate: { ...b, staticBase: firstPromotableSlot } });
    }
  }, [firstPromotableSlot]);

  const fillOption = phaseFillOptions().find((o) => o.value === phaseFill)
    ?? phaseFillOptions()[0];
  const tileCount = cols * bandRowCount;

  function apply(result: BandCommandResult): void {
    if (!result.ok) { setRefusalText(result.reason); return; }
    setRefusalText(null);
    run(result.command);
  }

  // The spec, the two reasons and the two commands, from the one derivation the
  // tool-options bar also reads.
  const verbs = bandVerbs(doc, candidate);
  const promoteOff = verbs.promote.reason;
  const insertOff = verbs.add.reason;

  return (
    <>
      {/* DEFAULT-COLLAPSED — the column's second subject, and the only section
          in it that is not about the scene. See the file docblock: at 1280x800
          the four scene sections and the seven headers leave no room for it,
          and the header keeps its name and its band count on screen. */}
      <CollapsibleSection
        id="aeon.bganim.bands"
        defaultCollapsed
        title={`BG animation bands (${budget.bands}/${budget.maxBands})`}>
       <SectionBody>
        {state === null && (
          <Hint style={{ marginBottom: 0 }}>No aeon project is open.</Hint>
        )}
        {state !== null && state.unreadable !== null && (
          <Hint tone="warning" style={{ marginBottom: 0 }}>
            <code>{state.unreadable.path}</code> exists and could not be read, so no band can be
            edited. Aurora will NOT overwrite it. Reason: {state.unreadable.reason}
          </Hint>
        )}
        {state !== null && state.unreadable === null && doc === null && (
          <Hint style={{ marginBottom: 0 }}>
            This project has no <code>editor_bg_override.json</code>. Bands live in that document,
            which also carries the Plane B layout and its tile blob — there is nothing to animate
            until it exists.
          </Hint>
        )}

        {/* WHAT A BAND IS, said once at the top and never per card (parcel D).
            The owner looked at the lens and asked "draw left to right? rotate?";
            the per-band sentence (`bandMotion`, on the card and the caption)
            says what THIS band does, and this line says what a band is at all. */}
        {doc !== null && <Hint>{BAND_MECHANISM_HINT}</Hint>}

        {doc !== null && rows.length === 0 && (
          <Hint>
            No bands yet. A band declares a contiguous range of the background&apos;s tile blob
            animated: its slots become a prefix of <code>tiles</code> and the runtime shifts them
            horizontally. Promote a static range below.
          </Hint>
        )}

        {/* THE PREVIEW'S NON-PER-BAND HALF, above the list it governs. It draws
            nothing at all when there are no bands. ROADMAP item 45. */}
        <BgAnimPreviewStrip />

        {/* SAID ONCE, NOT PER BAND. This sentence explains what the Demote
            BUTTON does, and every card carries the same button — so it was the
            same 37px of text repeated for every band in the list, measured, and
            the contract allows four. It governs the list, so it sits above the
            list, which is the rule the strip one line up already follows. The
            per-band lines below it are the ones whose CONTENT differs per band:
            geometry, slots, driver, resolved rate, verdict. */}
        {doc !== null && rows.length > 0 && (
          <Hint>lossless — Demote keeps a band&apos;s art, it just stops animating</Hint>
        )}

        {rows.map((b) => {
          // THE PREVIEW'S PER-BAND HALF, folded in (ROADMAP item 45). Composed
          // by a provider, never here: what `rate_shift` means in the units this
          // band's driver reads, and whether the blob on screen lets it preview.
          const status = bandStatus(b, preview.verdicts[b.index]);
          // THE CARD IS THE LENS'S OTHER END. Clicking an ANIMATED cell on the
          // map selects this card; clicking this card lights those same cells.
          // One target, two doors — which is what makes the map band NAVIGATION
          // rather than a one-way readout.
          const lit = lensTarget?.kind === 'band' && lensTarget.index === b.index;
          return (
          // THE INDEX TITLES THE CARD and the geometry is its value, so a band
          // row reads in the same label column as every form row above it.
          // Everything under it hangs off the control column (`under`), which
          // is what makes the readout a block rather than four ragged lines.
          <Card key={b.index} raised selected={lit}
            title={lit
              ? 'The map is tinting every background cell this band paints. Click a card or a '
                + 'cell to move the lens.'
              : 'Show this band on the map — every background cell its slots paint.'}
            onClick={() => setLensTarget({ kind: 'band', index: b.index })}>
            <Field label={`Band ${b.index}`}>
              <span style={{ fontSize: T.tSm, color: T.textHi }}>{b.geometry}</span>
            </Field>
            <Hint under>
              {/* `slotRange` already says "slots 0..127" — FIRST..LAST, from
                  `slotSpanPhrase`, so the range and the tile count beside it
                  cannot disagree about how many slots this band owns. */}
              {b.slotRange} · {b.tileCount} tile{b.tileCount === 1 ? '' : 's'} ·{' '}
              {b.patternPx}px pattern · {b.columnBytes}B/col · {b.phaseBanks} banks
            </Hint>
            <Hint under>
              <span title="The scalar source. The band shifts HORIZONTALLY whichever driver it uses.">
                driver <strong>{b.driver}</strong>
                {b.driverIsExplicit ? '' : ' (default — the key is absent)'}
              </span>
              {' · '}
              rate_shift <strong>{b.rateShift}</strong>
              {b.rateShiftIsExplicit ? '' : ' (default)'}
            </Hint>
            {/* WHAT THAT NUMBER DOES. The line above is the DOCUMENT's value;
                this is the consequence, and it depends on the driver — a timer
                band has a px/s and a camera band cannot have one. */}
            <Hint under>{status.rate}</Hint>
            {/* A refusal and an undrawn licence are both warnings; a band that
                previews is not. `unresolved` prints nothing here, because the
                strip above already carries that one column-wide warning. */}
            {status.verdict !== null && (
              <Hint under tone={status.kind === 'previewing' ? undefined : 'warning'}>
                {status.verdict}
              </Hint>
            )}
            {/* THE FOOTPRINT, and it is NEUTRAL INFORMATION. A band animates
                whichever tiles its slots name WHEREVER THE PICTURE USES THEM —
                aeon's live 8x4 band has one slot painting 964 cells of sky, and
                that is what promotion MEANS, not corruption. So this states the
                shape and stops: no threshold, no alarm colour, no "only" and no
                "but". Whether a large footprint is the look wanted is the
                owner's call. The warning tone below is for the one case that is
                a genuine COULD-NOT-MEASURE — a background on screen that is not
                this document's — never for a number. */}
            {lit && lens.reason !== null && (
              <Hint under tone="warning">on the map: cannot say — {lens.reason}</Hint>
            )}
            {lit && lens.coverage !== null && (
              <Hint under>
                <LensSwatch />highlighted on the map · {coverageSummary(lens.coverage)}
                {' '}<HideLensChip onHide={() => setLensTarget(null)} />
              </Hint>
            )}
            <Row style={{ marginLeft: CONTROL_INSET }}>
              <IconButton icon={<span>Demote</span>}
                label={`Demote band ${b.index} to static tiles`}
                onClick={() => { setPendingRemoval(null); apply(demoteBandCommand(doc, b.index)); }} />
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
            </Row>
            {/* THE BANK STRIP (parcel I): phase 0..7 as thumbnails, click to
                draw one in the Art facet; Shift regenerates 1..7 from phase 0.
                The band object is read fresh from the document each render —
                the writers mutate it in place, and the clock key repaints. */}
            {doc !== null && doc.anims?.[b.index] !== undefined && (
              <BandBankStrip
                doc={doc}
                band={doc.anims[b.index]}
                bandIndex={b.index}
                palette={getCurrentZone(useProjectStore.getState())?.palette ?? null}
                version={`${historyVersion}:${liveEditVersion}`}
                selectedBank={openBgArt?.kind === 'bank' && openBgArt.bandIndex === b.index
                  ? openBgArt.bank : null}
                openBank={(k) => {
                  const od = openBandBankDocument(doc, b.index, k);
                  if (!od || !openDocumentGuarded(od)) return;
                  switchFacet(useSessionStore.getState().activeId, 'art');
                }}
                onShift={() => { setPendingRemoval(null); apply(regenerateShiftCommand(doc, b.index)); }} />
            )}
            {pendingRemoval === b.index && (
              <Row style={{ marginLeft: CONTROL_INSET }}>
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
              </Row>
            )}
          </Card>
          );
        })}

        {doc !== null && (
          <Hint style={{ marginTop: T.s2, marginBottom: 0 }}>
            Blob {budget.tiles}/{budget.tileCapacity} tiles ·{' '}
            <strong>{budget.tileSlotsRemaining}</strong> free ·{' '}
            {/* `animatedSlots` is a COUNT: the animated prefix is 0..count-1,
                and an empty document says so in words rather than `0..-1`. */}
            {budget.animatedSlots} animated ({slotSpanPhrase(0, budget.animatedSlots)}) ·{' '}
            {budget.bandsRemaining} band slot{budget.bandsRemaining === 1 ? '' : 's'} left
          </Hint>
        )}
        {refusalText && (
          <Hint tone="warning" style={{ marginTop: T.s2, marginBottom: 0 }}>{refusalText}</Hint>
        )}
       </SectionBody>
      </CollapsibleSection>

      {/* DEFAULT-COLLAPSED — a creation form, and the tallest box in the column.
          See the file docblock; the four CDP harnesses that drive it open it. */}
      <CollapsibleSection id="aeon.bganim.new" title="New band" defaultCollapsed>
       <SectionBody>
        {/* ONE GEOMETRY, TWO SOURCES. Cols, rows and driver describe the band
            itself and mean the same thing whichever way its art arrives, so
            they are asked once, above both actions. Duplicating them into two
            sections would have been the shape that quietly says one of the two
            is the real one. */}
        <Field label="Cols" title="Pattern width in tiles">
          <NumberField title={`cols — pattern_px will be ${patternPxFor(cols)}`}
            min={1} width={56} value={cols}
            onChange={(n) => setCols(Math.max(1, Math.round(n) || 1))} />
        </Field>
        <Field label="Rows"
          title="Rows must make rows*32 a power of two — the runtime shifts a whole column">
          <Select title="rows — constrained so that rows * 32 bytes per column is an exact power of two,
                         because the runtime rotates a column by shifting it"
            value={String(bandRowCount)}
            onChange={(v) => setBandRowCount(Number(v))}
            style={{ width: 80 }}>
            {rowChoices().map((r) => <option key={r} value={String(r)}>{r}</option>)}
          </Select>
        </Field>
        <Hint under>
          {tileCount} slot{tileCount === 1 ? '' : 's'} · {patternPxFor(cols)}px pattern
        </Hint>

        <Field label="Driver" title="The SCALAR the step is read from. Never an axis.">
          <Select
            title="Which scalar drives this band's step. Every band shifts HORIZONTALLY whichever
                   driver it uses — camera_y does NOT mean vertical motion."
            value={explicitDriver ? driver : ''}
            onChange={(v) => setCandidate({ driver: v === '' ? undefined : v })}
            style={{ flex: 1, minWidth: 0 }}>
            {/* The empty option LEAVES THE KEY OUT, which is the shape the codec
                prefers: a document that does not spell `driver` tracks whatever the
                consumer's default becomes, and writing today's default into it
                would freeze it. */}
            <option value="">(default — {DEFAULT_DRIVER})</option>
            {driverOptions().map((o) => (
              <option key={o.value} value={o.value} title={o.title}>{o.label}</option>
            ))}
          </Select>
        </Field>

        {/* THE SPEED CONTROL, AND IT RUNS BACKWARDS. `step = driver >> rate_shift`,
            so a HIGHER rate_shift is a SLOWER band — the opposite of what a field
            one reads as "speed" implies. Every label, title and note here says so,
            and `rateShiftNote` prints the exact consequence of the author's own
            number, in the hint slot every other field's explanation uses.

            TWO CONTROLS, NOT A PRE-FILLED SPINNER, for the reason the driver
            picker's empty option gives one field up: "default" here means THE KEY
            IS ABSENT, so the document tracks whatever the consumer's default
            becomes. A single spinner seeded at today's default would write today's
            default into every band an author never thought about the rate of —
            freezing it. The number box only appears once an author has said the
            rate is theirs. */}
        <Field label="Rate shift"
          title="rate_shift — a RIGHT SHIFT on the driver, so HIGHER IS SLOWER.">
          <Select
            title="rate_shift — HIGHER IS SLOWER. The step is the driver scalar shifted RIGHT by this
                   many bits (step = driver >> rate_shift), so each +1 halves the band's speed.
                   Leave it at (default) to omit the key and track aeon's own default."
            value={explicitRateShift ? 'custom' : ''}
            onChange={(v) => setCandidate({ rateShift: v === 'custom' ? DEFAULT_RATE_SHIFT : undefined })}
            style={{ flex: 1, minWidth: 0 }}>
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
              onChange={(n) => setCandidate({ rateShift: clampRateShift(n) })} />
          )}
        </Field>
        <Hint under>
          {rateShiftNote(explicitRateShift ? rateShift : DEFAULT_RATE_SHIFT)}
        </Hint>

        <Field label="Banks 1–7"
          title="How banks 1-7 are filled from phase 0. Phase 0 itself is never a choice: it is
                 the art the band rests at.">
          <Select
            title="phase fill — how banks 1-7 (the contract's pre-shifted phases, selected by
                   step & 7) are derived from the band's phase 0"
            value={phaseFill}
            onChange={(v) => setCandidate({ phaseFill: v as BandPhaseFill })}
            style={{ flex: 1, minWidth: 0 }}>
            {phaseFillOptions().map((o) => (
              <option key={o.value} value={o.value} title={o.title}>{o.label}</option>
            ))}
          </Select>
        </Field>

        {/* ── Source 1: art the document already carries ────────────────── */}
        <Group label="From existing tiles" note="costs no tiles — the range moves, it is not copied">
          <Field label="From tile" title="First tile of the static range this band takes over">
            <NumberField
              // Both halves through `slotSpanPhrase`: FIRST..LAST, never one
              // past the end. The second sentence is the same fact `min` below
              // enforces, and it named the first FREE slot as taken.
              title={`static base — the range is ${slotSpanPhrase(staticBase, tileCount)}. `
                + `Bands already own ${slotSpanPhrase(0, budget.animatedSlots)}.`}
              min={budget.firstPromotableSlot} width={72} value={staticBase}
              onChange={(n) => setStaticBase(Math.max(0, Math.round(n) || 0))} />
            <Chip disabled={promoteOff !== null}
              title={promoteOff ?? 'Declare this static range animated. The blob does not grow.'}
              onClick={() => apply(verbs.promote.run())}>
              Promote
            </Chip>
          </Field>
          <Hint under>
            {/* The slots this promotion would TAKE, FIRST..LAST — the author
                reads this line to aim the drag, so one slot too many is one
                slot they are told they own and do not. */}
            → {slotSpanPhrase(staticBase, tileCount)}. The picture at rest does not
            change: phase 0 IS this art, and {fillOption.note}
          </Hint>
          {/* WHAT THIS RANGE WOULD ACTUALLY TAKE OVER — the one fact no amount
              of reading the form can give you, and the reason the lens exists.
              Promotion animates the range's tiles wherever the picture uses
              them, and the blob is de-duplicated, so a 4-slot candidate can own
              a thousand cells. Stated neutrally: see the band card above. */}
          {lensTarget?.kind === 'candidate' && lens.reason !== null && (
            <Hint under tone="warning">on the map: cannot say — {lens.reason}</Hint>
          )}
          {lensTarget?.kind === 'candidate' && lens.coverage !== null && (
            <Hint under>
              <LensSwatch />highlighted on the map · {coverageSummary(lens.coverage)}
              {' '}<HideLensChip onHide={() => setLensTarget(null)} />
            </Hint>
          )}
          {lensTarget?.kind !== 'candidate' && (
            <Hint under>
              Click a background cell on the map to point this at the art you can see — the map
              then <LensSwatch />highlights every cell the range would take over.
            </Hint>
          )}
          {promoteOff && <Hint under tone="warning">{promoteOff}</Hint>}
        </Group>

        {/* ── Source 2: new art ─────────────────────────────────────────── */}
        <Group label="From new art"
          note={<>costs {tileCount} slot{tileCount === 1 ? '' : 's'} ·{' '}
            <strong>{budget.tileSlotsRemaining}</strong> free</>}>
          <Field label="Blank band">
            <Chip disabled={insertOff !== null}
              title={insertOff ?? `Add a blank ${cols}x${bandRowCount} band (${tileCount} tiles)`}
              onClick={() => apply(verbs.add.run())}>
              Add band
            </Chip>
          </Field>
          <Hint under style={{ marginBottom: 0 }}>
            The band arrives blank and unreferenced; nothing on screen changes until you point
            layout cells at it. (Its phase 0 is blank art, so every fill mode agrees here.)
          </Hint>
          {insertOff && <Hint under tone="warning" style={{ marginTop: T.s2, marginBottom: 0 }}>{insertOff}</Hint>}
        </Group>
       </SectionBody>
      </CollapsibleSection>

    </>
  );
}
