import json
import sys

# PREDICTION written BEFORE the deform harness ran (ROADMAP row 60, commit B).
# Commit A's file is the base; the delta must be confined to deform keys.
BASE = json.load(open('scratchpad/PREDICTED-commitA.json'))

N = 16          # R3: the app's own layer ceiling
TABLE_MAX = 256  # what the `period` spinner advertises as its max = the table length

# The tableRef form select's own option list, in schema `oneOf` order.
FORMS = ['sine', 'triangle', 'zero', 'v_column_perspective', 'v_column_floor', 'bin']


def deform_int(key, lo, hi):
    """R14. N clamped by the control's own bounds, with the two forced exceptions."""
    if key == 'period':
        return TABLE_MAX // N            # must divide the table; max/N is exact
    if key in ('shift_a', 'shift_b'):
        return max(lo, hi - N)           # their schema DEFAULT is `max`
    if hi is None:
        return N
    return min(hi, max(lo if lo is not None else 0, N))


AMP = deform_int('amplitude', 1, 127)
PER = deform_int('period', 1, TABLE_MAX)
SPD = deform_int('speed', None, None)

BASE['deform_fg'] = {'shared': {                       # R13 k=0 -> FORMS[0]
    'table': {'generator': FORMS[0], 'amplitude': AMP, 'period': PER}, 'speed': SPD}}
BASE['deform_bg'] = {'shared': {                       # R13 k=1 -> FORMS[1]
    'table': {'generator': FORMS[1], 'amplitude': AMP, 'period': PER}, 'speed': SPD}}
BASE['v_deform'] = {'columns': {                       # R13 k=2 -> FORMS[2] (no params)
    'table': {'generator': FORMS[2]},
    'speed': SPD,
    'amp_shift': deform_int('amp_shift', 0, 15)}}
BASE['left_column_mask'] = 'accept'                    # R15: the LAST option offered

BASE['layers'][N - 1]['deform'] = {'own': {            # R16: the LAST strip; R13 k=3
    'table': {'generator': FORMS[3],
              'focal': deform_int('focal', None, None),
              'max_offset': deform_int('max_offset', None, None)},
    'shift_a': deform_int('shift_a', 0, 15),
    'shift_b': deform_int('shift_b', 0, 15),
    'phase': deform_int('phase', 0, 255),
    'speed': SPD}}

sys.stdout.write(json.dumps(BASE, sort_keys=True, indent=2, ensure_ascii=False) + '\n')
