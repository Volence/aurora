import React, { useEffect, useReducer, useRef, useState } from 'react';
import { useProjectStore, getCurrentZone } from '../../state/projectStore';
import { useArtStore } from '../../state/artStore';
import { useSpriteStore, buildPlayOrder } from '../../state/spriteStore';
import type { PlaybackMode } from '../../state/spriteStore';
import type { PixelBuffer } from '../../../core/art/pixel-ops';
import type { Color } from '../../../core/model/s4-types';

const MODES: PlaybackMode[] = ['forward', 'reverse', 'pingpong'];

/** Renders a frame buffer at an integer scale using the active palette line. */
function BufferView({ buffer, colors, scale }: { buffer: PixelBuffer; colors: Color[]; scale: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const ctx = ref.current?.getContext('2d');
    if (!ctx) return;
    const { width, height, data } = buffer;
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const idx = data[y * width + x];
        if (idx === 0) { ctx.fillStyle = (x + y) % 2 === 0 ? '#2a2a3a' : '#33334a'; }
        else { const c = colors[idx]; ctx.fillStyle = c ? `rgb(${c.r},${c.g},${c.b})` : '#ff00ff'; }
        ctx.fillRect(x, y, 1, 1);
      }
    }
  }, [buffer, colors]);
  return (
    <canvas ref={ref} width={buffer.width} height={buffer.height}
      style={{ width: buffer.width * scale, height: buffer.height * scale, imageRendering: 'pixelated' }} />
  );
}

/**
 * Animation timeline (chunk 3): sequence frames into steps with per-frame
 * durations (1/60s ticks), pick a playback mode, and play it in a live preview.
 * Maps onto Plan 3's per-anim animation model; event-tag markers come next.
 */
export default function Timeline() {
  const frames = useSpriteStore((s) => s.frames);
  const currentIndex = useSpriteStore((s) => s.currentIndex);
  const steps = useSpriteStore((s) => s.steps);
  const playbackMode = useSpriteStore((s) => s.playbackMode);
  const characterAnims = useSpriteStore((s) => s.characterAnims);
  const paletteLine = useArtStore((s) => s.paletteLine);
  useArtStore((s) => s.paletteVersion);
  const override = useSpriteStore((s) => s.paletteOverride);
  const zone = getCurrentZone(useProjectStore.getState());
  const colors = override ?? zone?.palette.lines[paletteLine]?.colors ?? [];

  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);
  const posRef = useRef(0);
  const accRef = useRef(0);
  const speedRef = useRef(1);
  speedRef.current = speed;
  const [, force] = useReducer((x) => x + 1, 0);

  useEffect(() => {
    if (!playing) return;
    const order = buildPlayOrder(steps.length, playbackMode);
    if (order.length === 0) { setPlaying(false); return; }
    posRef.current %= order.length;
    accRef.current = 0;
    let raf = 0;
    let last = performance.now();
    const loop = (now: number) => {
      const dt = now - last; last = now;
      accRef.current += (dt / (1000 / 60)) * speedRef.current; // elapsed in 1/60s ticks
      // Engine holds each frame for (duration + 1) ticks (timer counts D..0 then advances).
      const dur = (steps[order[posRef.current]]?.duration ?? 6) + 1;
      if (accRef.current >= dur) {
        accRef.current = 0;
        posRef.current = (posRef.current + 1) % order.length;
        force();
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [playing, steps, playbackMode]);

  const order = buildPlayOrder(steps.length, playbackMode);
  const liveStepIdx = order.length ? order[posRef.current % order.length] : -1;
  const previewFrameIdx = playing && liveStepIdx >= 0
    ? steps[liveStepIdx].frameIndex
    : (steps[0]?.frameIndex ?? currentIndex);
  const previewBuffer = frames[previewFrameIdx] ?? frames[0];

  return (
    <div style={styles.root}>
      <div style={styles.preview}>
        <BufferView buffer={previewBuffer} colors={colors} scale={3} />
        <div style={styles.controls}>
          <button style={styles.playBtn} onClick={() => setPlaying((p) => !p)} disabled={steps.length === 0}>
            {playing ? '❚❚ Pause' : '▶ Play'}
          </button>
          <select value={playbackMode} style={styles.select}
            onChange={(e) => useSpriteStore.getState().setPlaybackMode(e.target.value as PlaybackMode)}>
            {MODES.map((m) => <option key={m} value={m}>{m}</option>)}
          </select>
          <select value={speed} style={styles.select} title="preview speed" onChange={(e) => setSpeed(Number(e.target.value))}>
            {[0.25, 0.5, 1, 2, 4].map((s) => <option key={s} value={s}>{s}×</option>)}
          </select>
        </div>
        {characterAnims.length > 0 && (
          <select style={styles.select} defaultValue="0"
            onChange={(e) => { const a = characterAnims[Number(e.target.value)]; if (a) useSpriteStore.getState().setSteps(a.steps); }}>
            {characterAnims.map((a, i) => <option key={a.name} value={i}>{a.name} ({a.steps.length}f)</option>)}
          </select>
        )}
      </div>

      <div style={styles.steps}>
        {steps.length === 0 && <div style={styles.hint}>No steps. Add the current frame to start an animation →</div>}
        {steps.map((st, i) => (
          <div key={i} style={{ ...styles.stepCell, ...(playing && i === liveStepIdx ? styles.stepLive : {}) }}>
            <BufferView buffer={frames[st.frameIndex] ?? frames[0]} colors={colors} scale={1} />
            <div style={styles.stepMeta}>
              <span style={styles.stepLabel}>f{st.frameIndex}</span>
              <input type="number" min={1} max={127} value={st.duration} style={styles.dur}
                onChange={(e) => useSpriteStore.getState().setStepDuration(i, Number(e.target.value))}
                title="hold (1/60s)" />
              <button style={styles.del} title="remove step" onClick={() => useSpriteStore.getState().removeStep(i)}>×</button>
            </div>
          </div>
        ))}
        <button style={styles.addStep} onClick={() => useSpriteStore.getState().addStep(currentIndex)}>
          + Frame {currentIndex}
        </button>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  root: { display: 'flex', gap: 12, padding: '8px 10px', background: '#181825', borderTop: '1px solid #313244', alignItems: 'flex-start' },
  preview: { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, flexShrink: 0 },
  controls: { display: 'flex', gap: 6, alignItems: 'center' },
  playBtn: { padding: '4px 10px', background: '#a6e3a1', color: '#1e1e2e', border: 'none', borderRadius: 4, cursor: 'pointer', fontSize: 12, fontWeight: 600 },
  select: { background: '#313244', color: '#cdd6f4', border: '1px solid #45475a', borderRadius: 4, fontSize: 11, padding: '3px 4px' },
  steps: { display: 'flex', gap: 6, overflowX: 'auto', alignItems: 'flex-start', flex: 1 },
  hint: { fontSize: 12, color: '#6c7086', alignSelf: 'center' },
  stepCell: { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3, padding: 3, background: '#1e1e2e', border: '1px solid #45475a', borderRadius: 4 },
  stepLive: { borderColor: '#a6e3a1', boxShadow: '0 0 0 1px #a6e3a1' },
  stepMeta: { display: 'flex', alignItems: 'center', gap: 2 },
  stepLabel: { fontSize: 10, color: '#a6adc8' },
  dur: { width: 34, background: '#313244', color: '#cdd6f4', border: '1px solid #45475a', borderRadius: 3, fontSize: 10, padding: '1px 2px' },
  del: { background: 'none', border: 'none', color: '#f38ba8', cursor: 'pointer', fontSize: 13, lineHeight: 1, padding: 0 },
  addStep: { alignSelf: 'center', padding: '4px 10px', background: '#313244', color: '#cdd6f4', border: '1px dashed #585b70', borderRadius: 4, cursor: 'pointer', fontSize: 12, whiteSpace: 'nowrap' },
};
