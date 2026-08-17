import React from 'react';
import { T } from '../ui';
import { decodeGenesisColor, fmtGenesisWord } from '../../../core/formats/palette';
import { channelLevel, withChannel } from './palette-grid-model';

// The Genesis palette color-picker CONTROL — three 3-bit R/G/B sliders (0-7 per
// channel) over a single CRAM word. It is pure UI: it holds no state, operates
// only on a `word` (0000BBB0GGG0RRR0), and reports edits through callbacks so
// each host wires its own commit/undo path. BOTH palette panels render it:
// classic's ClassicPalettePanel and aeon's PaletteEditor (whose inlined second
// copy — same to3, same word formatter, same channel table, same six styles —
// this replaced).
//
//   • onChange(word) fires per slider tick — a live PREVIEW (no history).
//   • onCommit(word) fires on release (pointerup / keyup / blur) — the host
//     records exactly one undo step there.
//
// onCommit CAN FIRE MORE THAN ONCE per drag: pointerup commits, and the blur
// when focus later leaves commits again. Hosts must make the second call a
// no-op (both do, by clearing their pre-drag snapshot on the first).

const CHANNELS = ['r', 'g', 'b'] as const;
const CHANNEL_COLORS: Record<string, string> = { r: T.error, g: T.success, b: T.info };

// `channelLevel` (8-bit → the Genesis 3-bit level) and `withChannel` (rebuild a
// CRAM word with one channel replaced) live in palette-grid-model.ts, next to the
// rest of the word arithmetic and where they can be run by a test. This file used
// to declare private copies; they are the same two helpers the grid needs, and two
// copies of a `>> 9 & 7` is how the palette panels drifted the first time.

export default function GenesisColorSliders({
  word, onChange, onCommit, heading,
}: {
  word: number;
  onChange: (word: number) => void;
  onCommit: (word: number) => void;
  heading?: React.ReactNode;
}) {
  const color = decodeGenesisColor(word);
  // Commit on release WITHOUT blurring the slider. PaletteEditor used to blur
  // here so a post-commit Ctrl+Z reached its keydown handler past an INPUT guard.
  // That guard is gone: BOTH surviving level-side undo bindings — LevelWorkspace
  // (via isTypingTarget) and SpriteMode's own keydown — exempt type:'range', so a
  // focused slider never blocks undo. And blurring costs: blur() re-enters this
  // same onBlur handler synchronously → onCommit twice, and it drops focus after
  // one arrow-key press, so a slider cannot be fine-tuned by keyboard.
  const commit = () => { onCommit(word); };
  return (
    <div style={styles.panel}>
      {heading !== undefined && (
        <div style={styles.header}>
          <span>{heading}</span>
          <span style={styles.word}>{fmtGenesisWord(word)}</span>
        </div>
      )}
      {CHANNELS.map((ch) => (
        <div key={ch} style={styles.sliderRow}>
          <span style={{ ...styles.channelLabel, color: CHANNEL_COLORS[ch] }}>{ch.toUpperCase()}</span>
          <input
            type="range" min={0} max={7} step={1} value={channelLevel(color[ch])}
            onChange={(e) => onChange(withChannel(word, ch, Number(e.target.value)))}
            onPointerUp={commit}
            onKeyUp={commit}
            onBlur={commit}
            style={styles.slider}
          />
          <span style={styles.channelValue}>{channelLevel(color[ch])}</span>
        </div>
      ))}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  panel: { display: 'flex', flexDirection: 'column', gap: 4, padding: 6, background: T.void, border: `1px solid ${T.border}`, borderRadius: 4 },
  header: { display: 'flex', justifyContent: 'space-between', fontSize: T.t2xs, color: T.textBase, marginBottom: 2 },
  word: { fontFamily: T.fontMono, color: T.warning },
  sliderRow: { display: 'flex', alignItems: 'center', gap: 6 },
  channelLabel: { fontSize: T.t2xs, fontWeight: T.wSemibold, width: 10 },
  slider: { flex: 1, minWidth: 0 },
  channelValue: { fontSize: T.t2xs, fontFamily: T.fontMono, color: T.textHi, width: 10, textAlign: 'right' },
};
