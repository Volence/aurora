// Scrub state for the Sonic dynamic-animation preview (walk/run/roll/push —
// the sonani special scripts). Ephemeral VIEW state, deliberately outside the
// sprite document: which dynamic anim the timeline has selected, the scrubbed
// interpreter inputs (inertia/angle/facing), and the last sample the preview
// loop computed — the debug surface a harness asserts cadence through.
//
// The interpreter itself is pure (core/anim/sonic-animate.ts); the preview
// component owns the running state and PUBLISHES samples here whenever the
// visible result changes.

import { create } from 'zustand';
import type { SonicSpecialMode, SonicSpecialScripts, SonicVariant } from '../../core/anim/sonic-animate';

export interface SonicPreviewActive {
  /** Picker entry name (Walk/Run/Roll/Roll2/Push). */
  name: string;
  mode: SonicSpecialMode;
  scripts: SonicSpecialScripts;
}

/** One published interpreter sample — the preview's currently-drawn state. */
export interface SonicPreviewSample {
  /** Interpreter ticks stepped since the anim was (re)selected. */
  tick: number;
  /** Displayed mapping frame (rotation offset applied). */
  frame: number;
  xFlip: boolean;
  yFlip: boolean;
  /** Script variant the inertia selected (walk/run/roll/roll2/push). */
  variant: SonicVariant;
  /** The current reload — the frame holds reload+1 editor-clock ticks. */
  hold: number;
}

interface SonicPreviewStore {
  active: SonicPreviewActive | null;
  /** Scrubbed |inertia| (the preview scrubs magnitude; facing is `xflip`). */
  inertia: number;
  /** Scrubbed obAngle byte, detented to the eight octants ($00, $20 … $E0). */
  angle: number;
  /** Facing (obStatus X-flip). */
  xflip: boolean;
  sample: SonicPreviewSample | null;
  setActive: (a: SonicPreviewActive | null) => void;
  setInertia: (v: number) => void;
  setAngle: (v: number) => void;
  setXflip: (v: boolean) => void;
  publishSample: (s: SonicPreviewSample) => void;
}

/** Scrub range: 0..$C00 covers stand-still through max-speed cadence 0. */
export const SONIC_PREVIEW_MAX_INERTIA = 0xc00;

const clampByte = (v: number, max: number) => Math.max(0, Math.min(max, Math.round(v)));

export const useSonicPreviewStore = create<SonicPreviewStore>((set) => ({
  active: null,
  inertia: 0x300, // mid-walk default: visible motion at a readable cadence
  angle: 0,
  xflip: false,
  sample: null,
  setActive: (active) => set({ active, sample: null }),
  setInertia: (v) => set({ inertia: clampByte(v, SONIC_PREVIEW_MAX_INERTIA) }),
  setAngle: (v) => set({ angle: clampByte(v, 0xff) & 0xe0 }), // octant detents
  setXflip: (xflip) => set({ xflip }),
  publishSample: (sample) => set({ sample }),
}));
