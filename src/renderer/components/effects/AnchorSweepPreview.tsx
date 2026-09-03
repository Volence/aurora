// THE CLOCK — ROADMAP row 95, and it is SCOPED TO THE ANCHOR MOVER ALONE.
//
// ═══════════════════════════════════════════════════════════════════════════
// WHY THERE IS A CLOCK HERE AND NOWHERE ELSE
// ═══════════════════════════════════════════════════════════════════════════
//
// Row 95 inherits a settled ruling rather than re-opening it: this repo's
// preview is DRIVER-FAITHFUL. A camera band previews CLOCKLESSLY — its position
// is a function of the camera, and the camera already repaints when it moves —
// and only a TIMER-DRIVEN band needs anything to tick. `anchor_sweep()` is the
// one timer-driven thing an author can write in this document, so it is the one
// thing that gets a clock, and the clock lives INSIDE the control that authors
// it. There is no strip-wide, panel-wide or tab-wide clock and this file is not
// a step towards one.
//
// ⚠ `MapViewport` HAS A MEASURED ZERO-IDLE-REPAINT PROPERTY (37/37 rows, no idle
// repaints, ~15.7ms of headroom) AND THIS PARCEL DOES NOT SPEND IT. Three things
// make that structural rather than a promise:
//
//   1. THE LOOP DRAWS TO ITS OWN CANVAS AND CALLS NO setState. Not one React
//      render is scheduled by a frame, so nothing above this component — the
//      panel, the facet, the map — is even asked to re-render. A `useState`
//      here would have re-rendered the panel 60 times a second and the map with
//      it, and it would have looked exactly as correct on screen.
//   2. IT ONLY EXISTS WHILE SOMETHING IS ACTUALLY ANIMATING. This component is
//      mounted only for a channel whose motion is an authored SWEEP, inside a
//      `CollapsibleSection` that renders no children while shut, on a sub-tab
//      whose siblings are UNMOUNTED. Shut the section, switch to Parallax, or
//      set the motion to "no motion" and there is no loop at all — not a paused
//      one, not a no-op one.
//   3. IT STOPS WHEN THE WINDOW IS HIDDEN, and it can be paused by hand.
//
// The measurement that this held is in the parcel's harness and packet; the
// property is not asserted here in prose.
//
// ═══════════════════════════════════════════════════════════════════════════
// WHAT IT DRAWS, AND — LOAD-BEARING — WHAT IT DOES NOT
// ═══════════════════════════════════════════════════════════════════════════
//
// It draws THE EXCURSION: one full cycle of `anchor_sweep()` across the width,
// the seed as the centre line, the ±peak envelope, and a playhead moving along
// the curve in real time at the authored period.
//
// ⚠ IT IS NOT A PICTURE OF A BAND ON A SCREEN, and that limit is structural, not
// a thing left for later. The band's screen line is `anchor - Camera_Y`, and
// THIS DOCUMENT DOES NOT SAY WHICH BAND A CHANNEL DRIVES: a preset `band`
// carries `top`, `bot`, `sh` and `on`, and no channel index (checked against the
// vendored schema's `$defs.band`, which declares those four properties and no
// other). A preview that drew a moving band would have had to invent that link,
// and would have been a picture of a program the file does not describe.
//
// ⚠ AND NOTHING IN AURORA HAS EVER SEEN ONE OF THESE MOVE. `NO_PREVIEW` says so
// for the raster band above it and the same is true here: this is the arithmetic
// the two authored rungs mean, drawn faithfully, and it is not a frame from an
// emulator.
//
// THE AMPLITUDE IS SCALED TO THE LADDER'S TALLEST RUNG (`ANCHOR_MAX_PEAK_PX`),
// not to its own peak. A 1 px sweep therefore looks like a nearly flat line
// beside a 64 px one — which is TRUE, and is the thing an author most needs to
// see. Normalising each sweep to fill the strip would have made all seven rungs
// draw the same picture, which is the amplitude control lying about its own
// value.

import React from 'react';
import { T, Chip } from '../ui';
import type { EffectsPresetAnchorSweep } from '../../../core/formats/effects/preset';
import {
  anchorOffsetAtTick, anchorPeriodRungOf, anchorAmpRungOf,
  ANCHOR_TICK_HZ, ANCHOR_MAX_PEAK_PX,
} from '../../providers/effects-preset';
// ⚠ EVERY COLOUR DRAWN ONTO A CANVAS LIVES IN `canvas-colors.ts` — this repo's
// ruling, and not a shortcut. `T.raised` is the STRING `var(--raised)`, and
// assigning one to `ctx.fillStyle` is silently IGNORED: the context keeps
// whatever colour it had, so a strip that reached for a token would have drawn
// in one flat wrong colour and looked deliberate.
import {
  ANCHOR_PREVIEW_BG, ANCHOR_PREVIEW_SEED, ANCHOR_PREVIEW_ENVELOPE,
  ANCHOR_PREVIEW_CURVE, ANCHOR_PREVIEW_PLAYHEAD,
} from '../../canvas/canvas-colors';

/** CSS pixels. Integer, and the canvas backing store is this times `dpr`. */
const W = 224;
const H = 56;

/**
 * How many frames the loop has drawn, published as a PLAIN JS PROPERTY on the
 * canvas node.
 *
 * Not a `data-` attribute: an attribute write is a DOM mutation sixty times a
 * second, and the whole point of this component is that a frame costs the rest
 * of the app nothing. Not `window.__dbg` either — that is a debug build's
 * surface and this must be measurable on the build an author runs. It is here
 * so a harness can tell "the clock is running" apart from "the canvas happens to
 * differ", which two screenshots alone cannot.
 */
export interface AnchorPreviewCanvas extends HTMLCanvasElement {
  __anchorFrames?: number;
  __anchorTick?: number;
}

export function AnchorSweepPreview({ sweep, channel }: {
  sweep: EffectsPresetAnchorSweep;
  channel: number;
}): React.ReactElement {
  const ref = React.useRef<AnchorPreviewCanvas | null>(null);
  const [running, setRunning] = React.useState(true);

  // ⚠ THE SWEEP IS READ THROUGH A REF, NOT CAPTURED BY THE EFFECT. Editing a
  // rung must change what the next frame draws WITHOUT tearing down and
  // restarting the loop — a restart would reset the playhead to the top of the
  // cycle on every keystroke and would make the period control feel like it
  // does nothing. The effect below therefore depends on `running` alone.
  const sweepRef = React.useRef(sweep);
  sweepRef.current = sweep;

  React.useEffect(() => {
    const cv = ref.current;
    if (!cv) return undefined;
    const ctx = cv.getContext('2d');
    if (!ctx) return undefined;

    // dpr VARIES RUN TO RUN ON THIS MACHINE, so the backing store is derived
    // from it at mount and every drawing coordinate below is in CSS pixels.
    const dpr = window.devicePixelRatio || 1;
    cv.width = Math.round(W * dpr);
    cv.height = Math.round(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    let raf = 0;
    let stopped = false;
    const t0 = performance.now();
    cv.__anchorFrames = 0;

    const draw = (now: number) => {
      const s = sweepRef.current;
      const period = anchorPeriodRungOf(s);
      const amp = anchorAmpRungOf(s);
      // Off-ladder shifts cannot reach here through the panel (the selects
      // offer rungs), and a document carrying one is refused at parse. If one
      // ever does, draw the frame EMPTY rather than a plausible wrong curve.
      const tick = period ? ((now - t0) / 1000) * ANCHOR_TICK_HZ : 0;
      cv.__anchorTick = tick;

      ctx.clearRect(0, 0, W, H);
      ctx.fillStyle = ANCHOR_PREVIEW_BG;
      ctx.fillRect(0, 0, W, H);

      if (period && amp) {
        const mid = H / 2;
        const pxPerUnit = (H / 2 - 4) / ANCHOR_MAX_PEAK_PX;

        // The ±peak envelope, so the amplitude has a visible extent even when
        // the playhead is crossing the middle.
        const env = amp.peak_px * pxPerUnit;
        ctx.fillStyle = ANCHOR_PREVIEW_ENVELOPE;
        ctx.fillRect(0, mid - env, W, env * 2);

        // The seed line.
        ctx.strokeStyle = ANCHOR_PREVIEW_SEED;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(0, mid + 0.5);
        ctx.lineTo(W, mid + 0.5);
        ctx.stroke();

        // ONE FULL CYCLE ACROSS THE WIDTH, from the same arithmetic the
        // playhead uses — so the curve and the dot cannot disagree about what
        // the file says. The window slides with the playhead, which is what
        // makes a 1092 s cycle legible at all: without it the dot would take
        // eighteen minutes to cross a 224px strip.
        ctx.strokeStyle = ANCHOR_PREVIEW_CURVE;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        for (let x = 0; x <= W; x++) {
          const t = tick + ((x / W) - 0.5) * period.ticks;
          const y = mid - anchorOffsetAtTick(s, t) * pxPerUnit;
          if (x === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        }
        ctx.stroke();

        // The playhead, at the centre of the sliding window: this is NOW.
        const y = mid - anchorOffsetAtTick(s, tick) * pxPerUnit;
        ctx.fillStyle = ANCHOR_PREVIEW_PLAYHEAD;
        ctx.beginPath();
        ctx.arc(W / 2, y, 3, 0, Math.PI * 2);
        ctx.fill();
      }

      cv.__anchorFrames = (cv.__anchorFrames ?? 0) + 1;
      if (!stopped) raf = requestAnimationFrame(draw);
    };

    raf = requestAnimationFrame(draw);

    // A HIDDEN WINDOW GETS NO FRAMES. `requestAnimationFrame` already throttles
    // hard when the page is not visible, but "already throttles" is the browser's
    // promise and this is one line.
    const onVisibility = () => {
      if (document.hidden) { stopped = true; cancelAnimationFrame(raf); }
      else if (stopped) { stopped = false; raf = requestAnimationFrame(draw); }
    };
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      stopped = true;
      cancelAnimationFrame(raf);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [running]);

  // PAUSED IS A REAL STOP, not a frame that draws the same thing. The effect is
  // keyed on `running`, so pausing tears the loop down and there is nothing left
  // ticking; resuming restarts it from a fresh `t0`.
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: T.s1 }}>
      {running && (
        <canvas
          ref={ref}
          data-anchor-preview={channel}
          aria-label={`Channel ${channel} sweep preview`}
          style={{ width: W, height: H, borderRadius: T.rMd, border: `1px solid ${T.border}` }} />
      )}
      {!running && (
        <div
          data-anchor-preview-paused={channel}
          style={{
            width: W, height: H, borderRadius: T.rMd, border: `1px solid ${T.border}`,
            background: T.raised, color: T.textLo, fontSize: T.tXs,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
          preview paused
        </div>
      )}
      <div style={{ display: 'flex', gap: T.s1, alignItems: 'center' }}>
        <Chip
          active={running}
          title={running
            ? 'Stop the preview. It is the only thing in this editor that runs on a timer, and '
              + 'pausing it removes the loop rather than idling it.'
            : 'Start the preview again, from the top of the cycle.'}
          onClick={() => setRunning((r) => !r)}>
          {running ? 'Pause' : 'Play'}
        </Chip>
        <span style={{ fontSize: T.tXs, color: T.textLo }}>
          real time, {ANCHOR_TICK_HZ} ticks/s
        </span>
      </div>
    </div>
  );
}
