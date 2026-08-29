import React, { useState, useEffect, useRef } from 'react';
import { useEditorStore } from '../state/editorStore';
import { useProjectStore, getCurrentAct, getCurrentZone } from '../state/projectStore';
import { useToastStore } from '../state/toastStore';
import type { PasteLayers, MarqueeGranularity } from '../../core/editing/map-clipboard';
import {
  isBlockAligned, selectionSizeLabel, artOnlyReason, copyFromSection,
  effectiveGranularity,
} from '../../core/editing/map-clipboard';
import { selectionToChunk } from '../../core/editing/selection-to-chunk';
import { regionPreviewCanvas } from '../canvas/region-preview';
import { performMapFlip, resolveFlip } from './map-flip';
import type { FlipAxis } from '../../core/editing/region-flip';
import { T } from './ui';

/**
 * THE FLIP BUTTONS — the owner's *"I think a button on the right panel would be
 * nice too"* (2026-08-28), on top of the `X`/`Y` keys row 83 shipped.
 *
 * ⚠ THE PROSE BELOW IS NOT DELETED AND THE BUTTONS ARE LABELLED WITH THE KEYS.
 * A sentence in a panel is documentation, not an affordance — he found those
 * keys because he was told, not because the UI offered them — but a button that
 * hides the shortcut trades one undiscoverable thing for another. `Ctrl+S` on
 * Save and `Ctrl+Shift+B` on Build & Run (shell/commands.ts) already set that
 * convention here, so the label carries the letter.
 *
 * The glyphs match the collision palette's own `H ⇄` / `V ⇅` pair rather than
 * inventing a control style; the LETTERS are X/Y because that is both the key
 * and the engine's own word for the axis (collision-cell-word.ts bit 10
 * `xFlip`, "mirror horizontally"), which is the vocabulary map-flip.ts defends.
 */
const FLIP_OPTS: ReadonlyArray<{ axis: FlipAxis; label: string; what: string }> = [
  { axis: 'h', label: 'X ⇄', what: 'left↔right' },
  { axis: 'v', label: 'Y ⇅', what: 'top↕bottom' },
];

const LAYER_OPTS: ReadonlyArray<{ value: PasteLayers; label: string; title: string }> = [
  { value: 'both', label: 'Both', title: 'Paste art + collision (default)' },
  { value: 'art', label: 'Art', title: 'Paste art only, leave collision untouched' },
  { value: 'collision', label: 'Collision', title: 'Paste collision only, leave the nametable untouched' },
];

const GRAIN_OPTS: ReadonlyArray<{ value: MarqueeGranularity; label: string; title: string }> = [
  {
    value: 'block', label: 'Block',
    title: 'Drag selects whole 16px blocks (rounded out). Carries art AND collision.',
  },
  {
    value: 'tile', label: 'Tile',
    title: 'Drag selects individual 8px tiles. Collision is stored per 16px block, '
      + 'so a selection that lands off that grid carries art only.',
  },
];

/** How wide the selection preview may draw. Matches the panel's own content
 *  width (240px `Panel` minus the section padding), so the picture fills the
 *  column without forcing it wider. */
const PREVIEW_MAX_W = 208;
/** ...and how tall, so a full-height section selection cannot push everything
 *  below it off the column. */
const PREVIEW_MAX_H = 160;

/**
 * WHAT THE SELECTION ACTUALLY CONTAINS — the owner's item 2.
 *
 * *"The marquee tool, when I select something it doesn't preview what's
 * selected."* Before this, a committed marquee was a dashed rectangle and a
 * toast counting blocks; nothing anywhere showed the ART. This draws the
 * selection's own pixels, live, as the drag moves.
 *
 * It reads the SECTION, live, rather than the clipboard: this is a picture of
 * the current selection, and the author has usually not pressed Ctrl+C yet.
 * (The paste ghost is the one that must show the clipboard — see MapViewport.)
 *
 * It goes through `regionPreviewCanvas` like both ghosts do, which is what
 * keeps it out of the RangeError class that once unmounted the React root: the
 * raster buffer and the ImageData are sized from the same two numbers, at every
 * size a marquee can produce — down to one 8x8 tile, and at odd widths and
 * heights the block-aligned path could never make.
 */
function SelectionPreview({ sectionIndex, col, row, w, h }: {
  sectionIndex: number; col: number; row: number; w: number; h: number;
}) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  // Redraws on any project mutation as well as any rect change: painting a tile
  // inside a standing selection must change the picture, and the project object
  // is mutated in place, so `liveEditVersion` is what moves.
  const liveEditVersion = useEditorStore((s) => s.liveEditVersion);
  const project = useProjectStore((s) => s.project);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    host.replaceChildren();
    const state = useProjectStore.getState();
    const section = getCurrentAct(state)?.sections[sectionIndex];
    const zone = getCurrentZone(state);
    if (!section || !zone) return;
    // copyFromSection is the SAME capture Ctrl+C performs, so the preview cannot
    // show one thing and the clipboard hold another.
    const clip = copyFromSection(section, col, row, w, h);
    const canvas = regionPreviewCanvas(clip, zone.tileset.tiles, zone.palette);
    if (!canvas) return;
    // Integer nearest-neighbour scale so map art stays map art. Down-scaling a
    // large selection is unavoidable (a whole section is 2048px), and there the
    // browser's own filtering is disabled too — a blurred preview would invite
    // the author to read detail that is not there.
    const scale = Math.min(PREVIEW_MAX_W / canvas.width, PREVIEW_MAX_H / canvas.height, 4);
    canvas.style.width = `${Math.max(1, Math.round(canvas.width * scale))}px`;
    canvas.style.height = `${Math.max(1, Math.round(canvas.height * scale))}px`;
    canvas.style.imageRendering = 'pixelated';
    canvas.style.display = 'block';
    canvas.style.background = T.void;
    host.appendChild(canvas);
  }, [sectionIndex, col, row, w, h, liveEditVersion, project]);

  return <div ref={hostRef} style={styles.previewHost} />;
}

/** Mounted for the marquee tool (copy source) and while pasting (paste
 *  target) — same `pasteLayers` store field drives both, since a copy's
 *  layer choice is really "what will paste later" and pasting can override it
 *  per-click with Alt (art)/Shift (collision). */
export default function MarqueePasteOptions() {
  const pasteLayers = useEditorStore((s) => s.pasteLayers);
  const setPasteLayers = useEditorStore((s) => s.setPasteLayers);
  const granularity = useEditorStore((s) => s.marqueeGranularity);
  const setGranularity = useEditorStore((s) => s.setMarqueeGranularity);
  const snapInvert = useEditorStore((s) => s.marqueeSnapInvert);
  const pasting = useEditorStore((s) => s.pasting);
  const marquee = useEditorStore((s) => s.marquee);
  const clipboard = useEditorStore((s) => s.mapClipboard);
  // The flip buttons' enablement is `resolveFlip`'s verdict, NOT a second
  // reading of the same state: the button must be dead in exactly the cases the
  // key is a no-op, or the panel starts teaching a rule the map does not keep.
  // `tool` is subscribed for this alone — flip-in-place is narrower than
  // Ctrl+C on purpose (see map-flip.ts), so the marquee tool has to be armed.
  const tool = useEditorStore((s) => s.tool);
  const flipTarget = resolveFlip({ pasting, mapClipboard: clipboard, tool, marquee });
  const [nameInput, setNameInput] = useState('');

  // WHICH RULE IS IN FORCE, derived from the RECT rather than the armed mode —
  // a Tile-mode drag that lands on even bounds is block-aligned and carries
  // collision like any other, so the mode is never what is reported.
  // WHAT THE NEXT DRAG WILL ACTUALLY SNAP TO. Not `granularity` — that is the
  // armed setting, and while Ctrl/Cmd is down it is NOT what a drag would do.
  // The same `effectiveGranularity` MapViewport computes the rect from, so the
  // control cannot come to describe a mode the drag is not in.
  const effective = effectiveGranularity(granularity, snapInvert);

  const aligned = marquee ? isBlockAligned(marquee.col, marquee.row, marquee.w, marquee.h) : true;
  const sizeLabel = marquee ? selectionSizeLabel(marquee.col, marquee.row, marquee.w, marquee.h) : '';
  const reason = marquee ? artOnlyReason(marquee.col, marquee.row, marquee.w, marquee.h) : '';

  // While PASTING the constraint belongs to the clipboard, not to whatever
  // selection may still be lying around: you are placing what you copied.
  const layersLocked = pasting ? (clipboard?.artOnly ?? false) : !aligned;

  // Default name uses the selection's own units — `selectionSizeLabel` prints
  // blocks for an aligned rect and tiles for one that has no block size.
  const autoName = marquee ? `Selection ${sizeLabel}` : '';

  function saveAsChunk() {
    const m = useEditorStore.getState().marquee;
    if (!m) return;
    const act = getCurrentAct(useProjectStore.getState());
    const section = act?.sections[m.sectionIndex];
    if (!section) return;
    const name = nameInput.trim() || `Selection ${selectionSizeLabel(m.col, m.row, m.w, m.h)}`;
    const def = selectionToChunk(section, m.col, m.row, m.w, m.h, name);
    // Refused for a non-block-aligned rect (see selectionToChunk). The button is
    // disabled in that case, so reaching here means something else changed the
    // selection under the click — say so rather than failing silently.
    if (!def) {
      useToastStore.getState().addToast(
        `Can't save a ${m.w}×${m.h}-tile selection as a chunk — chunks are whole 16px `
        + 'blocks. Select on even tile bounds, or switch the marquee to Block.', 'warning');
      return;
    }
    useProjectStore.getState().addChunks([def]);
    // Select the chunk you just made: the obvious next act is stamping it, and
    // without this the user saves into a wall of 70+ thumbnails and has to
    // find their own selection by eye before the stamp tool does anything
    // (owner report, 2026-08-19 — this was the path that ended in the ghost
    // crash). With it, K -> click stamps the saved selection immediately.
    useEditorStore.getState().setSelectedChunkId(def.id);
    useEditorStore.getState().markDirty();
    useToastStore.getState().addToast(
      `Added "${name}" to chunk library — Save project to keep`, 'success');
    setNameInput('');
  }

  return (
    <div>
      {/* Granularity: the marquee's counterpart to the facet's two paint tools.
          `paint-block` writes a 2x2 tile run and `paint-tile` writes one 8x8
          tile, so "block or tile" is already this facet's vocabulary for
          exactly this question — restated here rather than invented. Hidden
          while pasting, where it would be a control over a drag you are not
          doing. */}
      {!pasting && (
        <div style={styles.planes}>
          <span style={styles.planeLabel}>Snap</span>
          {GRAIN_OPTS.map(({ value, label, title }) => (
            <button key={value} onClick={() => setGranularity(value)}
              title={snapInvert
                ? `${title}  (Ctrl/Cmd is held, so a drag right now snaps to `
                  + `${effective} — release it to go back to ${granularity}.)`
                : `${title}  Hold Ctrl/Cmd while dragging to snap the other way.`}
              style={{ ...styles.planeBtn, ...(effective === value ? styles.planeSel : {}) }}>{label}</button>
          ))}
        </div>
      )}
      {/* THE MODIFIER, SAID OUT LOUD. Without this the highlight above would
          simply MOVE while a key is held and nothing would explain it — and if
          the highlight stayed put instead, the control would be claiming a mode
          the drag is not in. The armed setting is named too, so the author can
          see what he returns to on release. */}
      {!pasting && snapInvert && (
        <div style={styles.overrideLine}>
          {`Ctrl held — snapping to ${effective === 'block' ? 'blocks (16px, carries collision)' : 'tiles (8px, art only unless it lands even)'}. `}
          {`Release for ${granularity}.`}
        </div>
      )}

      <div style={styles.planes}>
        <span style={styles.planeLabel}>Layers</span>
        {LAYER_OPTS.map(({ value, label, title }) => {
          // A layer this selection/clipboard CANNOT deliver is disabled, not
          // silently downgraded at paste time. `Both` stays enabled and means
          // "everything there is" — for an art-only source that is the art —
          // while `Collision` is the one that would write nothing at all.
          const dead = layersLocked && value === 'collision';
          return (
            <button key={value} onClick={() => !dead && setPasteLayers(value)} disabled={dead}
              title={dead
                ? 'No collision to paste — this selection is not block-aligned, and collision '
                  + 'is stored per 16px block.'
                : title}
              style={{
                ...styles.planeBtn,
                ...(pasteLayers === value && !dead ? styles.planeSel : {}),
                ...(dead ? styles.planeDead : {}),
              }}>{label}</button>
          );
        })}
      </div>

      {/* THE RULE IN FORCE, at the moment it matters — beside the control it
          constrains, not buried in a tooltip. */}
      {layersLocked && (
        <div style={styles.warnLine}>
          {pasting
            ? 'Clipboard is art only — it was copied from a selection that is not block-aligned.'
            : reason}
        </div>
      )}

      {/* THE SELECTION ITSELF (owner item 2). Not shown while pasting: there the
          question is "where does this land", and the answer is the ghost under
          the cursor on the map. */}
      {!pasting && marquee && (
        <>
          <div style={styles.sizeLine}>
            <span style={{ color: aligned ? T.textBase : T.warning }}>{sizeLabel}</span>
            <span style={styles.dim}>{` at (${marquee.col}, ${marquee.row}) · section ${marquee.sectionIndex}`}</span>
          </div>
          <SelectionPreview
            sectionIndex={marquee.sectionIndex}
            col={marquee.col} row={marquee.row} w={marquee.w} h={marquee.h}
          />
        </>
      )}

      {/* FLIP — always MOUNTED, disabled when nothing is eligible. A control
          that vanishes teaches nothing about when it applies, and "when does
          flip apply" is the whole subtlety here: mirroring the pending paste
          works from any tool, mirroring a committed selection IN PLACE needs
          the marquee tool armed, because that one rewrites the map. The
          disabled title says which of those is missing. */}
      <div style={styles.planes}>
        <span style={styles.planeLabel}>Flip</span>
        {FLIP_OPTS.map(({ axis, label, what }) => (
          <button key={axis}
            onClick={() => performMapFlip(axis)}
            disabled={flipTarget === null}
            title={flipTarget === 'clipboard'
              ? `Mirror what you are about to paste, ${what}. Shortcut: ${label[0]}`
              : flipTarget === 'selection'
                ? `Mirror the selected region in place, ${what} — one undo step. `
                  + `Shortcut: ${label[0]}`
                : marquee
                  ? 'Flipping a selection in place rewrites the map, so it needs the marquee '
                    + 'tool armed. Pick the marquee tool, or press Ctrl+V to paste and flip that.'
                  : 'Nothing to flip yet — drag a selection with the marquee tool, or press '
                    + 'Ctrl+V to start a paste and mirror that.'}
            style={{ ...styles.planeBtn, ...(flipTarget === null ? styles.planeDead : {}) }}>
            {label}
          </button>
        ))}
      </div>

      {/* AN UNLISTED KEY IS AN UNDISCOVERABLE FEATURE. Both states name the
          flip, because the same two letters mean the same mirror at both
          moments — the pending paste while pasting, the selection itself
          otherwise (map-flip.ts `resolveFlip`). Spelled with the axis AND the
          direction: "X" alone is read both ways by different people, and the
          engine's own word (collision-cell-word.ts bit 10, "mirror
          horizontally") is the one this follows. */}
      <div style={styles.hint}>
        {pasting
          ? 'Click to paste · hold Alt for art only, Shift for collision only · '
            + 'X flips it left↔right, Y top↕bottom · Esc to stop'
          : 'Drag to select (hold Ctrl to snap the other way) · Ctrl+C copy · Ctrl+V paste · '
            + 'X flips the selection left↔right, Y top↕bottom'}
      </div>
      {/* Save-as-chunk: only meaningful with a committed selection and not while
          pasting. Captures the same FG nametable + collision the map clipboard
          does (selectionToChunk → copyFromSection) into a stampable ChunkDef. */}
      {!pasting && marquee && (
        <div style={styles.saveRow}>
          <input
            value={nameInput}
            onChange={(e) => setNameInput(e.target.value)}
            placeholder={autoName}
            title="Chunk name (blank = auto)"
            style={styles.nameInput}
          />
          <button onClick={saveAsChunk} disabled={!aligned}
            title={aligned
              ? 'Save this selection as a stampable chunk'
              : `A ${marquee.w}×${marquee.h}-tile selection is not a whole number of 16px `
                + 'blocks, and a chunk must be. Select on even tile bounds, or switch the '
                + 'marquee to Block.'}
            style={{ ...styles.saveBtn, ...(aligned ? {} : styles.saveBtnDead) }}>Save as chunk</button>
        </div>
      )}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  planes: { display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 4, padding: `${T.s2} ${T.s2} 0` },
  planeLabel: { fontSize: T.t2xs, color: T.textLo, marginRight: 2, minWidth: 38, flexShrink: 0 },
  planeBtn: { padding: `2px ${T.s2}`, background: T.overlay, color: T.textBase, borderWidth: 1, borderStyle: 'solid', borderColor: T.border, borderRadius: T.rSm, cursor: 'pointer', fontSize: T.tXs, minWidth: 26, textAlign: 'center' },
  planeSel: { background: T.accent, color: T.onAccent, borderColor: T.accent },
  planeDead: { opacity: 0.4, cursor: 'not-allowed', color: T.textLo },
  overrideLine: { fontSize: T.t2xs, color: T.accent, padding: `${T.s2} ${T.s2} 0`, lineHeight: 1.35 },
  warnLine: { fontSize: T.t2xs, color: T.warning, padding: `${T.s2} ${T.s2} 0`, lineHeight: 1.35 },
  sizeLine: { fontSize: T.tXs, padding: `${T.s2} ${T.s2} 2px` },
  dim: { color: T.textLo },
  previewHost: { padding: `0 ${T.s2} ${T.s2}`, overflow: 'hidden' },
  hint: { fontSize: T.t2xs, color: T.textLo, padding: `${T.s2} ${T.s2} ${T.s2}` },
  saveRow: { display: 'flex', alignItems: 'center', gap: 4, padding: `0 ${T.s2} ${T.s2}` },
  nameInput: { flex: 1, minWidth: 0, padding: `2px ${T.s2}`, background: T.overlay, color: T.textBase, border: `1px solid ${T.border}`, borderRadius: T.rSm, fontSize: T.tXs },
  saveBtn: { padding: `2px ${T.s2}`, background: T.accent, color: T.onAccent, border: `1px solid ${T.accent}`, borderRadius: T.rSm, cursor: 'pointer', fontSize: T.tXs, flexShrink: 0, whiteSpace: 'nowrap' },
  saveBtnDead: { opacity: 0.4, cursor: 'not-allowed', background: T.overlay, color: T.textLo, borderColor: T.border },
};
