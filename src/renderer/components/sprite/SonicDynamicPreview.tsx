// The Sonic dynamic-animation preview: plays a special sonani script
// (walk/run/roll/push) through the pure Sonic_Animate interpreter
// (core/anim/sonic-animate.ts — semantics per docs/reviews/2026-08-21-
// sonic-animate-live-study.md), driven by the editor's own clock (rAF at 60
// ticks/s × the timeline's speed factor), with scrub controls for the two
// inputs the engine computes cadence and rotation from: inertia (0-$C00) and
// angle (eight octant detents). Sits in the Timeline's preview slot with the
// same visual idiom (BufferView + the shared select/hint styles).

import React, { useEffect, useRef, useState } from 'react';
import type { PixelBuffer } from '../../../core/art/pixel-ops';
import type { Color } from '../../../core/model/s4-types';
import {
  initialSonicAnimState,
  stepSonicAnimate,
  sonicOctant,
} from '../../../core/anim/sonic-animate';
import type { SonicAnimState } from '../../../core/anim/sonic-animate';
import { useSonicPreviewStore, SONIC_PREVIEW_MAX_INERTIA } from '../../state/sonicPreviewStore';
import type { SonicPreviewSample } from '../../state/sonicPreviewStore';
import type { SonicDynamicAnim } from '../../state/spriteStore';
import { BufferView } from './Timeline';
import { T } from '../ui';

const hex = (v: number) => '$' + v.toString(16).toUpperCase();

export default function SonicDynamicPreview({ name, dynamic, frames, colors, speed }: {
  name: string;
  dynamic: SonicDynamicAnim;
  frames: PixelBuffer[];
  colors: Color[];
  speed: number;
}) {
  const inertia = useSonicPreviewStore((s) => s.inertia);
  const angle = useSonicPreviewStore((s) => s.angle);
  const xflip = useSonicPreviewStore((s) => s.xflip);
  const [sample, setSample] = useState<SonicPreviewSample | null>(null);

  // Interpreter state lives in refs: the rAF loop reads the LATEST scrub
  // values each tick (like the engine reads the object fields), so scrubbing
  // never restarts the animation — it bends the cadence mid-flight.
  const stRef = useRef<SonicAnimState>(initialSonicAnimState());
  const tickRef = useRef(0);
  const accRef = useRef(0);
  const inputRef = useRef({ inertia, angle, xflip });
  inputRef.current = { inertia, angle, xflip };
  const speedRef = useRef(speed);
  speedRef.current = speed;

  // Selecting a different anim = an obAnim change: reset position and timer
  // (the engine's obPrevAni branch — advances immediately on the next step).
  useEffect(() => {
    stRef.current = initialSonicAnimState();
    tickRef.current = 0;
    accRef.current = 0;
  }, [name, dynamic]);

  useEffect(() => {
    let raf = 0;
    let last = performance.now();
    const loop = (now: number) => {
      const dt = now - last; last = now;
      accRef.current += (dt / (1000 / 60)) * speedRef.current; // editor clock, 1/60s ticks
      let stepped = false;
      // Cap the catch-up burst (background tab) at one full second of ticks.
      if (accRef.current > 60) accRef.current = 60;
      while (accRef.current >= 1) {
        accRef.current -= 1;
        const inp = inputRef.current;
        stRef.current = stepSonicAnimate(
          stRef.current,
          { mode: dynamic.mode, inertia: inp.inertia, angle: inp.angle, xflip: inp.xflip },
          dynamic.scripts,
        );
        tickRef.current++;
        stepped = true;
      }
      if (stepped) {
        const st = stRef.current;
        const next: SonicPreviewSample = {
          tick: tickRef.current, frame: st.frame, xFlip: st.xFlip, yFlip: st.yFlip,
          variant: st.variant, hold: st.hold,
        };
        setSample((prev) => (
          prev && prev.frame === next.frame && prev.xFlip === next.xFlip && prev.yFlip === next.yFlip
            && prev.variant === next.variant && prev.hold === next.hold
            ? prev : next));
        useSonicPreviewStore.getState().publishSample(next);
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [dynamic]);

  const buffer = sample ? frames[sample.frame] : undefined;
  const oct = sonicOctant(angle, xflip) >> 1; // display as octant index 0-3
  const st = useSonicPreviewStore.getState();

  return (
    <div style={styles.root}>
      <div style={styles.canvasBox}>
        {buffer
          ? <BufferView buffer={buffer} colors={colors} scale={3} xFlip={sample?.xFlip} yFlip={sample?.yFlip} />
          : <div style={styles.hint}>starting…</div>}
      </div>
      <div style={styles.status} title="variant · frame · hold (interpreter output)">
        {sample ? `${sample.variant} · f${hex(sample.frame)} · hold ${sample.hold + 1}t` : '--'}
      </div>
      <label style={styles.row} title="sonic inertia">
        <span style={styles.label}>spd {hex(inertia)}</span>
        <input type="range" min={0} max={SONIC_PREVIEW_MAX_INERTIA} step={0x20} value={inertia}
          style={styles.slider} onChange={(e) => st.setInertia(Number(e.target.value))} />
      </label>
      <label style={styles.row} title="sonic angle">
        <span style={styles.label}>ang {hex(angle)} (oct {oct})</span>
        <input type="range" min={0} max={0xe0} step={0x20} value={angle}
          style={styles.slider} onChange={(e) => st.setAngle(Number(e.target.value))} />
      </label>
      <label style={styles.row} title="sonic facing">
        <input type="checkbox" checked={xflip} onChange={(e) => st.setXflip(e.target.checked)} />
        <span style={styles.label}>face left</span>
      </label>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  root: { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 },
  canvasBox: { minHeight: 48, display: 'flex', alignItems: 'center', justifyContent: 'center' },
  status: { fontSize: T.t2xs, color: T.textBase, fontVariantNumeric: 'tabular-nums' },
  row: { display: 'flex', alignItems: 'center', gap: 6 },
  label: { fontSize: T.t2xs, color: T.textLo, minWidth: 76, fontVariantNumeric: 'tabular-nums' },
  slider: { width: 110 },
  hint: { fontSize: T.tSm, color: T.textLo },
};
