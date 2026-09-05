import React, { useEffect, useReducer, useRef, useState } from 'react';
import { useProjectStore, getCurrentZone } from '../../state/projectStore';
import { useArtStore } from '../../state/artStore';
import { useSpriteStore, buildPlayOrder } from '../../state/spriteStore';
import type { PlaybackMode } from '../../state/spriteStore';
import type { PixelBuffer } from '../../../core/art/pixel-ops';
import type { Color } from '../../../core/model/s4-types';
import { resolveDisplayPalette } from '../../../core/art/sprite-palette';
import { T } from '../ui';
import { actAndDropFocus } from '../ui/act-and-drop-focus';
import { CHECKER_A, CHECKER_B, OOB_MARKER } from '../../canvas/canvas-colors';
import SonicDynamicPreview from './SonicDynamicPreview';
import { useSonicPreviewStore } from '../../state/sonicPreviewStore';

const MODES: PlaybackMode[] = ['forward', 'reverse', 'pingpong'];

/** Picker wording for a dynamic (Sonic special) entry's interpreter mode. */
const DYN_MODE_LABEL: Record<string, string> = { walkrun: 'walk/run', roll: 'roll', push: 'push' };

/** Renders a frame buffer at an integer scale using the active palette line.
 *  `xFlip`/`yFlip` mirror the DRAW (per-step S1 animation flips, e.g. Crabmeat's
 *  `2|aniXFlip` walk frames) — the checker stays unflipped, matching hardware
 *  where flipping is a sprite attribute, not a background one. */
export function BufferView({ buffer, colors, scale, xFlip, yFlip }: {
  buffer: PixelBuffer; colors: Color[]; scale: number; xFlip?: boolean; yFlip?: boolean;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const ctx = ref.current?.getContext('2d');
    if (!ctx) return;
    const { width, height, data } = buffer;
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const sx = xFlip ? width - 1 - x : x;
        const sy = yFlip ? height - 1 - y : y;
        const idx = data[sy * width + sx];
        if (idx === 0) { ctx.fillStyle = (x + y) % 2 === 0 ? CHECKER_A : CHECKER_B; }
        else { const c = colors[idx]; ctx.fillStyle = c ? `rgb(${c.r},${c.g},${c.b})` : OOB_MARKER; }
        ctx.fillRect(x, y, 1, 1);
      }
    }
  }, [buffer, colors, xFlip, yFlip]);
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
  const paletteMode = useSpriteStore((s) => s.paletteMode);
  const zoneLine = useSpriteStore((s) => s.zoneLine);
  const standalonePalette = useSpriteStore((s) => s.standalonePalette);
  useArtStore((s) => s.paletteVersion);
  const zone = getCurrentZone(useProjectStore.getState());
  const colors = resolveDisplayPalette(paletteMode, zoneLine, standalonePalette, zone?.palette.lines ?? []);

  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);
  // Controlled picker selection — needed so a DYNAMIC (Sonic special) entry
  // can swap the preview for the interpreter panel. Resets with the doc's anims.
  const [animIdx, setAnimIdx] = useState(0);
  useEffect(() => { setAnimIdx(0); }, [characterAnims]);
  const activeAnim = characterAnims[animIdx];
  const dyn = activeAnim?.dynamic;
  // Mirror the selection into the sonic preview store (the debug/harness
  // surface); cleared when a non-dynamic anim — or no anim — is active.
  useEffect(() => {
    const st = useSonicPreviewStore.getState();
    if (dyn && activeAnim) st.setActive({ name: activeAnim.name, mode: dyn.mode, scripts: dyn.scripts });
    else st.setActive(null);
    return () => useSonicPreviewStore.getState().setActive(null);
  }, [dyn, activeAnim]);
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
  const previewStep = playing && liveStepIdx >= 0 ? steps[liveStepIdx] : steps[0];
  const previewFrameIdx = previewStep?.frameIndex ?? currentIndex;
  const previewBuffer = frames[previewFrameIdx] ?? frames[0];

  return (
    <div style={styles.root}>
      <div style={styles.preview}>
        {dyn && activeAnim
          // A dynamic (Sonic special) anim: the interpreter panel replaces the
          // step preview — frames + cadence come from the scrubbed inputs.
          ? <SonicDynamicPreview name={activeAnim.name} dynamic={dyn} frames={frames} colors={colors} speed={speed} />
          : <BufferView buffer={previewBuffer} colors={colors} scale={3}
              xFlip={previewStep?.xFlip} yFlip={previewStep?.yFlip} />}
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
          <select style={styles.select} value={animIdx}
            onChange={(e) => {
              const i = Number(e.target.value);
              const a = characterAnims[i];
              if (!a) return;
              setAnimIdx(i);
              useSpriteStore.getState().setSteps(a.steps);
            }}>
            {characterAnims.map((a, i) => (
              // Synced entries are transcribed SynchroAnimate cycles (global
              // engine counters), labeled so, with their honest caveat (e.g.
              // the accumulator channel's average rate) as the tooltip.
              // Dynamic entries are Sonic's special scripts, labeled with
              // their Sonic_Animate mode instead of a fake step count.
              <option key={a.name} value={i} title={a.note}>
                {a.dynamic
                  ? `${a.name} (dynamic ${DYN_MODE_LABEL[a.dynamic.mode]})`
                  : `${a.name} (${a.steps.length}f${a.synced ? ', synced' : ''})`}
              </option>
            ))}
          </select>
        )}
      </div>

      <div style={styles.steps}>
        {dyn && (
          <div style={styles.hint}>
            Dynamic {DYN_MODE_LABEL[dyn.mode]} script: Sonic_Animate picks frames and cadence from the
            scrubbed inertia/angle; there are no editable steps.
          </div>
        )}
        {!dyn && steps.length === 0 && <div style={styles.hint}>No steps. Add the current frame to start an animation →</div>}
        {steps.map((st, i) => (
          <div key={i} style={{ ...styles.stepCell, ...(playing && i === liveStepIdx ? styles.stepLive : {}) }}>
            <BufferView buffer={frames[st.frameIndex] ?? frames[0]} colors={colors} scale={1}
              xFlip={st.xFlip} yFlip={st.yFlip} />
            <div style={styles.stepMeta}>
              <span style={styles.stepLabel} title={st.xFlip || st.yFlip ? 'animation flip flags' : undefined}>
                f{st.frameIndex}{st.xFlip ? '↔' : ''}{st.yFlip ? '↕' : ''}</span>
              <input type="number" min={1} max={127} value={st.duration} style={styles.dur}
                onChange={(e) => useSpriteStore.getState().setStepDuration(i, Number(e.target.value))}
                title="hold (1/60s)" />
              {/* ⚠ ACTS AND THEN DROPS FOCUS (d-27) — and this is the
                  `key={i}` LIST-REMOVAL shape, which is worse than a repeat
                  fire. The row this button lives in is keyed by INDEX, so
                  after it removes step `i` it does not unmount with the step it
                  deleted: React re-uses the same DOM button for the step that
                  slid down into slot `i`. Before the ruling it kept focus, and
                  a bare Space did not repeat the action — it RETARGETED it at
                  the neighbour, walking down the timeline one keystroke per
                  step. See `ui/act-and-drop-focus.ts`.
                  It has no no-op path of its own: the button only exists while
                  a step exists at `i`, and `removeStep` has no early return.
                  What makes the blur unconditional here is the shared helper,
                  which blurs before `act()` and cannot be reached past a
                  return that has not run yet. */}
              <button style={styles.del} title="remove step"
                onClick={(e) => actAndDropFocus(e, () => useSpriteStore.getState().removeStep(i))}>×</button>
            </div>
          </div>
        ))}
        {!dyn && (
          <button style={styles.addStep} onClick={() => useSpriteStore.getState().addStep(currentIndex)}>
            + Frame {currentIndex}
          </button>
        )}
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  root: { display: 'flex', gap: 12, padding: '8px 10px', background: T.void, borderTop: `1px solid ${T.border}`, alignItems: 'flex-start' },
  preview: { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, flexShrink: 0 },
  controls: { display: 'flex', gap: 6, alignItems: 'center' },
  playBtn: { padding: '4px 10px', background: T.success, color: T.onAccent, border: 'none', borderRadius: 4, cursor: 'pointer', fontSize: T.tSm, fontWeight: T.wSemibold },
  select: { background: T.raised, color: T.textHi, border: `1px solid ${T.borderStrong}`, borderRadius: 4, fontSize: T.tXs, padding: '3px 4px' },
  steps: { display: 'flex', gap: 6, overflowX: 'auto', alignItems: 'flex-start', flex: 1 },
  hint: { fontSize: T.tSm, color: T.textLo, alignSelf: 'center' },
  stepCell: { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3, padding: 3, background: T.void, borderWidth: 1, borderStyle: 'solid', borderColor: T.borderStrong, borderRadius: 4 },
  stepLive: { borderColor: T.success, boxShadow: `0 0 0 1px ${T.success}` },
  stepMeta: { display: 'flex', alignItems: 'center', gap: 2 },
  stepLabel: { fontSize: T.t2xs, color: T.textBase },
  dur: { width: 34, background: T.raised, color: T.textHi, border: `1px solid ${T.borderStrong}`, borderRadius: T.rMd, fontSize: T.t2xs, padding: '1px 2px' },
  del: { background: 'none', border: 'none', color: T.error, cursor: 'pointer', fontSize: T.tBase, lineHeight: 1, padding: 0 },
  addStep: { alignSelf: 'center', padding: '4px 10px', background: T.raised, color: T.textHi, border: `1px dashed ${T.borderStrong}`, borderRadius: 4, cursor: 'pointer', fontSize: T.tSm, whiteSpace: 'nowrap' },
};
