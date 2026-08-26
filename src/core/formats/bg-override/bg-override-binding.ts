// WHICH ACT DOES THE BG OVERRIDE GOVERN?
//
// `editor_bg_override.json` is ONE FILE PER GAME (the consumer hardcodes its
// path) but it does NOT describe every act. aeon's `inject_editor_bg.py` reads
// that one file and writes `zone_bg.bin` / `bg_tiles.bin` / `bg_anim.emp` /
// `bg_anim_banks.bin` into ONE hardcoded output directory. So the override is
// the truth about exactly one act — the act whose generated data lives in that
// directory — and is the truth about no other act at all.
//
// THE BINDING IS DERIVED, NOT NAMED. Nothing inside the document names a zone or
// an act, and nothing in project.json points at the document. The two ends are
// joined only by a path that both repos happen to spell:
//
//   aeon  tools/inject_editor_bg.py  OUT_DIR   = games/sonic4/data/generated/ojz/act1
//   game  project.json  zones[].acts[].stripPath = games/sonic4/data/generated/ojz/act1/
//
// This module joins them at that path and NOWHERE ELSE. It does not know the
// strings "ojz" or "act1"; it compares the act's own declared generated
// directory against the one vendored consumer literal. That matters for how it
// FAILS: a project whose acts point somewhere else — a second zone, a renamed
// act, another game, a future aeon that moves its output — binds NO act, every
// act keeps its library / act-default background, and nothing silently claims to
// be showing what ships.
//
// ⚠ SEAM, for aeon. The pairing above is a coincidence of two hardcodes, one per
// repo, and this module can only observe one of them. Closing it means aeon
// deriving OUT_DIR from project.json, or naming the act inside the document.
// Until then the vendored `outputDir` in bganim-consumer-contract.json is the
// single place Aurora holds aeon's half, and the drift ritual that covers every
// other constant in that file covers this one too.

import type { Act } from '../../model/s4-types';
import { BG_OVERRIDE_CONSUMER_OUT_DIR } from './bg-override';

/**
 * Compare two project-root-relative directory paths for identity.
 *
 * Trailing slashes only: project.json writes `…/act1/` and the consumer's
 * `os.path.join` produces `…/act1`, and that difference is spelling, not
 * meaning. Nothing else is normalised — no `..` resolution, no case folding, no
 * separator translation. A path that differs by anything more than a trailing
 * slash is a DIFFERENT directory as far as this repo is concerned, because the
 * only safe error here is "not bound".
 */
function sameDir(a: string, b: string): boolean {
  return a.replace(/\/+$/, '') === b.replace(/\/+$/, '');
}

/**
 * True when `editor_bg_override.json` is what the ROM bakes for THIS act.
 *
 * False for an act with no `stripPath`, and false for an act whose `stripPath`
 * is any other directory — those acts' backgrounds come from the act default or
 * a BG-library entry, and the override says nothing about them.
 */
export function actBindsBgOverride(act: Pick<Act, 'stripPath'>): boolean {
  if (act.stripPath === null || act.stripPath === '') return false;
  return sameDir(act.stripPath, BG_OVERRIDE_CONSUMER_OUT_DIR);
}
