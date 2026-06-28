import { create } from 'zustand';
import type { MirrorMode, DitherPattern } from '../../core/art/pixel-ops';

interface ToolState {
  mirror: MirrorMode | null;
  ditherPattern: DitherPattern;
  ditherSecondary: number;
  pixelPerfect: boolean;
  setMirror: (m: MirrorMode | null) => void;
  setDither: (p: DitherPattern, secondary: number) => void;
  setPixelPerfect: (v: boolean) => void;
}

export const useToolStore = create<ToolState>((set) => ({
  mirror: null,
  ditherPattern: 'checker',
  ditherSecondary: 0,
  pixelPerfect: false,
  setMirror: (mirror) => set({ mirror }),
  setDither: (ditherPattern, ditherSecondary) => set({ ditherPattern, ditherSecondary }),
  setPixelPerfect: (pixelPerfect) => set({ pixelPerfect }),
}));
