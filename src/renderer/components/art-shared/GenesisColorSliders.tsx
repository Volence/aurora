import React from 'react';
import { T } from '../ui';
import { encodeGenesisColor, decodeGenesisColor } from '../../../core/formats/palette';

// The Genesis palette color-picker CONTROL — three 3-bit R/G/B sliders (0-7 per
// channel) over a single CRAM word — extracted from PaletteEditor's slider panel
// so it can be reused decoupled from the aeon art/sprite stores (Task B4). It is
// pure UI: it holds no state, operates only on a `word` (0000BBB0GGG0RRR0), and
// reports edits through callbacks so each host wires its own commit/undo path.
//
//   • onChange(word) fires per slider tick — a live PREVIEW (no history).
//   • onCommit(word) fires on release (pointerup / keyup / blur) — the host
//     records exactly one undo step there.

const CHANNELS = ['r', 'g', 'b'] as const;
const CHANNEL_COLORS: Record<string, string> = { r: T.error, g: T.success, b: T.info };

/** 8-bit channel → Genesis 3-bit level (0-7). */
function to3(v: number): number {
  return Math.round(Math.min(255, Math.max(0, v)) / 255 * 7);
}

/** Rebuild a CRAM word from `word` with one channel replaced by a 0-7 level. */
function withChannel(word: number, channel: 'r' | 'g' | 'b', level3: number): number {
  const c = decodeGenesisColor(word);
  const levels = { r: to3(c.r), g: to3(c.g), b: to3(c.b), [channel]: level3 };
  return encodeGenesisColor({ r: levels.r * 255 / 7, g: levels.g * 255 / 7, b: levels.b * 255 / 7 });
}

function fmtGenesisWord(word: number): string {
  return '$' + word.toString(16).toUpperCase().padStart(4, '0');
}

export default function GenesisColorSliders({
  word, onChange, onCommit, heading,
}: {
  word: number;
  onChange: (word: number) => void;
  onCommit: (word: number) => void;
  heading?: React.ReactNode;
}) {
  const color = decodeGenesisColor(word);
  // Commit on release WITHOUT blurring the slider. The aeon PaletteEditor blurs
  // here so a post-commit Ctrl+Z reaches its keydown handler past an INPUT guard,
  // but blur() re-enters this same onBlur handler synchronously → onCommit twice,
  // AND drops focus after one arrow-key press (breaking fine-tuning). We skip it:
  // the classic undo guard (ClassicProjectView) already excludes type:'range', so
  // a focused slider never blocks undo — no blur needed.
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
            type="range" min={0} max={7} step={1} value={to3(color[ch])}
            onChange={(e) => onChange(withChannel(word, ch, Number(e.target.value)))}
            onPointerUp={commit}
            onKeyUp={commit}
            onBlur={commit}
            style={styles.slider}
          />
          <span style={styles.channelValue}>{to3(color[ch])}</span>
        </div>
      ))}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  panel: { display: 'flex', flexDirection: 'column', gap: 4, padding: 6, background: T.void, border: `1px solid ${T.border}`, borderRadius: 4 },
  header: { display: 'flex', justifyContent: 'space-between', fontSize: 10, color: T.textBase, marginBottom: 2 },
  word: { fontFamily: T.fontMono, color: T.warning },
  sliderRow: { display: 'flex', alignItems: 'center', gap: 6 },
  channelLabel: { fontSize: 10, fontWeight: 700, width: 10 },
  slider: { flex: 1, minWidth: 0 },
  channelValue: { fontSize: 10, fontFamily: T.fontMono, color: T.textHi, width: 10, textAlign: 'right' },
};
