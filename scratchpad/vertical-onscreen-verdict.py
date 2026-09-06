#!/usr/bin/env python3
"""VERDICT for the vertical-band-on-screen rig. Reads captures, never an emulator.

  python3 vertical-onscreen-verdict.py --expect <rig>/expectations.json \
      --capture <capture.json> [--capture <capture2.json> ...]

Each capture is a JSON object this script never produces and never guesses:

  {
    "label":       "frame 700",              # anything; echoed in the report
    "step":         37,                      # the band's step at this capture.
                                             #   read BgAnim_LastStep ($FFFF8F06, u16)
                                             #   -- that IS the committed step -- or
                                             #   derive it: ((Logic_Tick+2) >> 2) & 63
    "band_hex":    "….",                     # 2048 bytes of VRAM at 0x8000, lowercase hex
    "control_hex": "…."                      # >= 32 bytes of VRAM at 0x8800, lowercase hex
  }

WHY A SCRIPT AND NOT A TABLE TO EYEBALL: the band is 64 slots of 32 bytes and the
question is which of two 2,048-byte pictures the machine holds. A human comparing hex
by eye at three captures is the step where a rig stops discriminating.

THE THREE VERDICTS, and the third is the point:
  UP       every slot matches the UP prediction for this step. The composite is phase 0
           rolled toward DECREASING band row -- and the painted plane puts band row r at
           plane row r (mod 8), so decreasing band row IS decreasing screen row.
  DOWN     every slot matches the DOWN prediction. The word in Aurora's panel is wrong.
  NEITHER  the fine phase roll and the coarse rotation disagree: a TEAR, not a direction.
           This is a real outcome and it is not "inconclusive" -- it says the two halves
           of the mechanism carry different signs, which no amount of resampling fixes.

A capture at step 0 or step 32 is reported as NON-DISCRIMINATING by construction
(2s = 0 mod 64 there), and the run needs at least one capture that is not.
"""
import argparse, json, sys


def verdict_for(exp, cap):
    s = cap['step']
    row = exp['steps'][s]
    n = exp['band']['tile_count']
    tb = exp['band']['total_bytes'] // n            # 32
    band = cap['band_hex'].lower()
    if len(band) != exp['band']['total_bytes'] * 2:
        return None, (f"band_hex is {len(band)//2} bytes; the band is "
                      f"{exp['band']['total_bytes']} bytes at {exp['band']['vram_dest_hex']}")
    got = [band[j * tb * 2:(j + 1) * tb * 2] for j in range(n)]
    up = sum(1 for j in range(n) if got[j] == row['up'][j])
    dn = sum(1 for j in range(n) if got[j] == row['down'][j])
    if up == n:
        v = 'UP'
    elif dn == n:
        v = 'DOWN'
    else:
        v = 'NEITHER'
    return {
        'label': cap.get('label', f'step {s}'), 'step': s,
        'coarse': row['coarse'], 'bank': row['bank'],
        'discriminating': row['discriminating'],
        'fully': row['fullySeparating'],
        'sep_coarse': row['separatesCoarseSign'], 'sep_bank': row['separatesBankIndex'],
        'slots_matching_up': up, 'slots_matching_down': dn, 'slots': n,
        'verdict': v,
        'first_mismatch': next((j for j in range(n) if got[j] != row['up'][j]), None),
    }, None


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--expect', required=True)
    ap.add_argument('--capture', action='append', required=True)
    a = ap.parse_args()
    exp = json.load(open(a.expect))
    caps = [json.load(open(p)) for p in a.capture]

    rows, fails = [], []
    for cap in caps:
        r, err = verdict_for(exp, cap)
        if err:
            fails.append(f"{cap.get('label', '?')}: {err}")
            continue
        rows.append(r)

    # THE CONTROL. Byte-stability across captures is what separates "the band stepped"
    # from "the BG art was reloaded". One capture cannot test it and says so.
    ctls = {c.get('label', '?'): c['control_hex'].lower() for c in caps if 'control_hex' in c}
    if len(ctls) < 2:
        control = 'NOT TESTED — a control needs at least two captures to be stable ACROSS'
    elif len(set(ctls.values())) == 1:
        control = f'STABLE across {len(ctls)} captures ({len(next(iter(ctls.values())))//2} bytes)'
    else:
        control = f'CHANGED — {len(set(ctls.values()))} distinct values: {sorted(ctls)}'
        fails.append('the control slots changed; the band\'s change is not attributable')

    print(f"band {exp['band']['cols']}x{exp['band']['rows']} {exp['band']['axis']} at "
          f"{exp['band']['vram_dest_hex']}, {exp['band']['tile_count']} slots, "
          f"pattern_px {exp['band']['pattern_px']}")
    print(f"control {exp['control']['vramFirstStatic']}: {control}\n")
    print(f"{'label':<18}{'step':>5}{'crs':>5}{'bnk':>5}{'up':>7}{'down':>7}  sep  verdict")
    for r in rows:
        sep = ('UD' if r['discriminating'] else '--') + \
              ('C' if r['sep_coarse'] else '-') + ('B' if r['sep_bank'] else '-')
        mark = '' if r['fully'] else '   <- does NOT separate everything'
        print(f"{r['label'][:17]:<18}{r['step']:>5}{r['coarse']:>5}{r['bank']:>5}"
              f"{r['slots_matching_up']:>4}/{r['slots']:<2}{r['slots_matching_down']:>4}/{r['slots']:<2}"
              f"  {sep}  {r['verdict']}{mark}")

    # THE SAMPLING BAR, and it is stricter than "UP != DOWN". A step whose coarse part is
    # 0 or rows/2 is byte-identical on a machine whose coarse rotation runs the WRONG WAY,
    # because c = -c there; likewise the bank index. Found by running this script against a
    # synthetic reversed-coarse machine at step 37 and watching it report UP.
    full = [r for r in rows if r['fully']]
    disc = [r for r in rows if r['discriminating']]
    if not disc:
        fails.append('NO DISCRIMINATING CAPTURE: every sample is at step 0 or 32, where UP '
                     'and DOWN are the same bytes. The run proves nothing about direction.')
    if not full:
        fails.append('NO FULLY SEPARATING CAPTURE: every sample sits at a fixed point of the '
                     'coarse rotation or of the bank index, where a REVERSED machine is '
                     'byte-identical to an honest one. Re-sample at a step listed in '
                     "expectations.json `sampling.fullySeparating`.")
    if disc:
        vs = {r['verdict'] for r in disc}
        print(f"\n{len(disc)} discriminating capture(s) ({len(full)} fully separating), "
              f"verdicts {sorted(vs)}")
        if len(vs) > 1:
            fails.append(f'discriminating captures DISAGREE: {sorted(vs)}')
        # A NEITHER or a DOWN is a RESULT, not a green. Both exit non-zero so neither can
        # be skimmed past: the script's rc means "UP, cleanly", nothing else.
        if 'NEITHER' in vs:
            fails.append('TEAR: a discriminating capture matched NEITHER prediction. The '
                         'fine phase roll and the coarse rotation carry different signs; '
                         'the composite is not a translation in either direction, so the '
                         'panel\'s word is not merely wrong, the mechanism is broken.')
        if 'DOWN' in vs:
            fails.append('DOWN: the composite runs the OTHER WAY. Aurora\'s panel says a '
                         'vertical band scrolls UP; on this ROM, at a step that separates '
                         'the two, it does not. BAND_SCROLL_DIRECTIONS.vertical is wrong.')

    if fails:
        print('\nFAILURES:')
        for f in fails:
            print('  -', f)
        return 1
    print('\nOK — all captures agree, the control held, and at least one sample separated '
          'UP from DOWN *and* pinned the coarse sign and the bank index.')
    return 0


if __name__ == '__main__':
    sys.exit(main())
