#!/usr/bin/env python3
"""xvfb_window_census — what is ACTUALLY MAPPED on one X display, as JSON.

    python3 scratchpad/lib/xvfb_window_census.py :91 [/path/to/Xauthority]

WHY THIS EXISTS. The suite's isolation proof asks "is there nothing on :0?".
That question reads CLEAN during the exact escape it is supposed to catch,
because on a Wayland desktop the escape route is not X11 at all. The half that
was missing is the POSITIVE one: *is the window we launched on the display we
started?* An absence somewhere else is not evidence; a presence here is.

⚠ IT TAKES THE DISPLAY AS AN ARGUMENT AND HAS NO DEFAULT. There is no code
path in this file that reaches :0. The caller passes the display number it
read out of the argv of an Xvfb inside its OWN process tree (see
`displayArtifacts` in harness-guard.mjs) — never a DISPLAY environment
variable, which is the owner's.

⚠ AND IT REPORTS ITS OWN BLINDNESS. `{"ok": false, "error": ...}` when it
cannot connect, cannot authenticate, or python-xlib is not installed. A caller
must treat that as UNKNOWN. "I could not look" and "I looked and the display is
empty" are the same JSON shape only if you write it that way, and this repo has
already paid for writing it that way once (`boundSocketPaths` returning an
empty Set for an unreadable table).
"""

import json
import os
import sys


def census(display_name):
    from Xlib import display as xdisplay, X, error as xerror  # noqa: N813

    d = xdisplay.Display(display_name)
    try:
        screen = d.screen()
        out = {
            "ok": True,
            "display": display_name,
            "screen": {
                "width": screen.width_in_pixels,
                "height": screen.height_in_pixels,
                "depth": screen.root_depth,
            },
            "windows": [],
        }

        def visit(win, depth):
            # A dead window between query_tree and the reads is normal, not an
            # error: report it as such rather than aborting the whole census.
            try:
                attrs = win.get_attributes()
                geom = win.get_geometry()
            except (xerror.BadWindow, xerror.BadDrawable):
                return
            name = None
            for getter in ("get_wm_name",):
                try:
                    name = getattr(win, getter)()
                except Exception:  # noqa: BLE001 - any protocol error means "no name"
                    name = None
                if name:
                    break
            if not name:
                try:
                    prop = win.get_full_property(d.intern_atom("_NET_WM_NAME"), 0)
                    if prop and prop.value:
                        raw = prop.value
                        name = raw.decode("utf8", "replace") if isinstance(raw, bytes) else str(raw)
                except Exception:  # noqa: BLE001
                    name = None
            try:
                cls = win.get_wm_class()
            except Exception:  # noqa: BLE001
                cls = None
            out["windows"].append({
                "id": win.id,
                "depth": depth,
                "viewable": attrs.map_state == X.IsViewable,
                "override_redirect": bool(attrs.override_redirect),
                "x": geom.x, "y": geom.y, "w": geom.width, "h": geom.height,
                "name": name,
                "wm_class": list(cls) if cls else None,
            })
            if depth < 2:
                try:
                    for child in win.query_tree().children:
                        visit(child, depth + 1)
                except (xerror.BadWindow, xerror.BadDrawable):
                    return

        for child in screen.root.query_tree().children:
            visit(child, 1)
        return out
    finally:
        try:
            d.close()
        except Exception:  # noqa: BLE001
            pass


def main():
    if len(sys.argv) < 2 or not sys.argv[1].startswith(":"):
        print(json.dumps({"ok": False, "error": "usage: xvfb_window_census.py :N [xauthority]"}))
        return 2
    name = sys.argv[1]
    if len(sys.argv) > 2 and sys.argv[2]:
        os.environ["XAUTHORITY"] = sys.argv[2]
    try:
        print(json.dumps(census(name)))
        return 0
    except ImportError as e:
        print(json.dumps({"ok": False, "error": f"python-xlib is not importable: {e}"}))
        return 3
    except Exception as e:  # noqa: BLE001 - every failure is UNKNOWN, never an empty census
        print(json.dumps({"ok": False, "error": f"{type(e).__name__}: {e}"}))
        return 4


if __name__ == "__main__":
    sys.exit(main())
