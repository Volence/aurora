// Subtype-aware object render rules for the classic (Sonic 1) viewport.
//
// A companion to s1-object-art.ts: where that table gives ONE static default frame
// per (id, zone), this module gives the objects whose DRAWN sprite depends on their
// subtype byte — the pieces to composite (a bridge's N logs, a monitor's shell +
// icon, a spike row's segments, a swinging platform's chain + platform). Each rule
// is a pure `subtype → ObjectPiece[]`; the art/mappings/palette come from the SAME
// `resolveObjectArt(id, zone)` link so there is one source of truth for paths.
//
// GROUND TRUTH — transcribed ONCE, at authoring time, from s1disasm's SonLVL object
// definitions and their C#/XML sources:
//   `s1disasm/Utility Project Files/SonLVL INI Files/_ObjDef/*.{ini,xml,cs}`
// Each rule cites the specific def file + the exact math it ports. Aurora never
// parses those files at runtime.
//
// PIPELINE: `objectHasSubtypeRule(id, zone)` gates the cache-variant + publish-key
// (rule ids key by subtype, static ids do not — see classicObjectArtStore). A null
// from `resolveObjectPieces` means "no rule → keep the single-frame path".

import { resolveObjectArt, type ObjectArtLink } from './s1-object-art';
import type { ObjectPiece } from '../../level-classic/object-sprite';

/** The composited pieces for one placement + the art link they render against. */
export interface ObjectPieceSet {
  pieces: ObjectPiece[];
  link: ObjectArtLink;
}

/**
 * A subtype rule: given the subtype byte and the object's base art link, return the
 * pieces to composite plus the (possibly link-overridden) art to render them with.
 * Most rules only vary the frame(s) and reuse `base`; a few (Spring, Newtron) also
 * swap the art file / palette line per subtype.
 */
type Rule = (subtype: number, base: ObjectArtLink) => ObjectPieceSet;

/** One piece at the composite origin (the common single-frame-by-subtype case). */
const one = (frame: number, base: ObjectArtLink): ObjectPieceSet => ({
  pieces: [{ frame, dx: 0, dy: 0 }], link: base,
});
const withLink = (base: ObjectArtLink, over: Partial<ObjectArtLink>): ObjectArtLink => ({ ...base, ...over });

// Common/Monitor.xml — Contents = subtype bits0-3 → Monitor.asm frame (the shell +
// icon are composited *inside* each frame, so one piece per subtype). Frames:
// 0 static0(shell) · 1 static · 3 eggman · 4 sonic · 5 shoes · 6 shield · 7 invincible
// · 8 rings · 9 s · 10 goggles · 11 broken (Monitor.asm mappingsTable order).
const MONITOR_FRAME: Readonly<Record<number, number>> = {
  0x0: 1, 0x1: 3, 0x2: 4, 0x3: 5, 0x4: 6, 0x5: 7, 0x6: 8, 0x7: 9, 0x8: 10, 0x9: 11,
};

// ---------------------------------------------------------------------------
// Rule bodies. Base rules apply in every zone; a zone rule overrides the base
// (and per-zone objdefs) for that id, mirroring s1-object-art.ts.
// ---------------------------------------------------------------------------

const RULES_BASE: Readonly<Record<number, Rule>> = {
  // Monitor — icon frame by the low-nibble Contents value (Common/Monitor.xml).
  0x26: (subtype, base) => one(MONITOR_FRAME[subtype & 0x0f] ?? 1, base),
  // Spikes — Type = bits4-6 selects the row/orientation frame (Common/Spikes.xml):
  // 0 upright×3 · 1 sideways×3 · 2 upright×1 · 3 upright×3 wide · 4 upright×6 · 5 sideways×1.
  0x36: (subtype, base) => { const t = (subtype >> 4) & 7; return one(t <= 5 ? t : 0, base); },
  // Egg Prison — Type = bit0: 0 capsule (frame 0) / 1 button (frame 1) (Common/EggPrison.xml).
  0x3e: (subtype, base) => one(subtype & 1, base),
  // Spring — Direction = bits4-5 (0 up / 1 horizontal / 2 down), Color = bit1 (0 red pal0
  // / 1 yellow pal1) (Common/Spring.xml). Up/Down use Spring Horizontal.nem frame 0;
  // horizontal uses Spring Vertical.nem frame 3 (the disasm filenames are swapped).
  0x41: (subtype, base) => {
    const pal = (subtype >> 1) & 1;
    if (((subtype >> 4) & 3) === 1) {
      return { pieces: [{ frame: 3, dx: 0, dy: 0 }], link: withLink(base, { artFile: 'artnem/Spring Vertical.nem', frame: 3, pal }) };
    }
    return { pieces: [{ frame: 0, dx: 0, dy: 0 }], link: withLink(base, { artFile: 'artnem/Spring Horizontal.nem', frame: 0, pal }) };
  },
  // Hidden Point Bonus — subtype 01→10000 (frame 1) / 02→1000 (frame 2) / else 100
  // (frame 3) (Common/PointBonus.xml).
  0x7d: (subtype, base) => one(subtype === 1 ? 1 : subtype === 2 ? 2 : 3, base),
};

const GHZ_RULES: Readonly<Record<number, Rule>> = {
  // Bridge — N = subtype & 0x1F logs (16px each, frame 0), centred on the origin:
  // st = -(N*16)/2, log i at Offset(st + 16i, 0) (GHZ/Bridge.cs GetSprite).
  0x11: (subtype, base) => {
    const n = subtype & 0x1f;
    if (n === 0) return one(0, base);
    const st = -((n * 16) / 2);
    const pieces: ObjectPiece[] = [];
    for (let i = 0; i < n; i++) pieces.push({ frame: 0, dx: st + i * 16, dy: 0 });
    return { pieces, link: base };
  },
  // Swinging Platform (also MZ) — length = subtype & 0x0F chain links (max 15, no
  // clamp: matches SwingingPlatform.cs and the engine's `andi.w #$F,d1` in
  // _incObj/15 Swinging Platforms.asm). Anchor (frame 2) at origin; a chain link
  // (frame 1) every 16px down from y=16; platform (frame 0) at y = 8 + 16*length
  // (GHZ/SwingingPlatform.cs GetSprite).
  // NOTE: SonLVL palettes the chain link on line 0 and the anchor/platform on line 2,
  // and swaps the platform for a wrecking ball when subtype & 0x10; the composer uses
  // ONE palette line, so all pieces render on the platform's line 2 and the
  // wrecking-ball variant is not modelled (documented follow-up).
  0x15: (subtype, base) => {
    const length = subtype & 0x0f;
    const pieces: ObjectPiece[] = [{ frame: 2, dx: 0, dy: 0 }];
    let yoff = 16;
    for (let i = 0; i < length; i++) { pieces.push({ frame: 1, dx: 0, dy: yoff }); yoff += 16; }
    yoff -= 8;
    pieces.push({ frame: 0, dx: 0, dy: yoff });
    return { pieces, link: base };
  },
  // Spiked Pole — N = min(0x16, subtype) helix segments (default 0x10); segment i =
  // frame (i & 7) at Offset(-(N<<3) + 16i, 0), right-anchored, cycling the 8 helix
  // frames (GHZ/SpikedPole.cs GetSprite).
  0x17: (subtype, base) => {
    const n = Math.min(0x16, subtype);
    if (n === 0) return one(0, base);
    const start = n << 3;
    const pieces: ObjectPiece[] = [];
    for (let i = 0; i < n; i++) pieces.push({ frame: i & 7, dx: -start + i * 16, dy: 0 });
    return { pieces, link: base };
  },
  // Breakable Wall — subtype bits0-3: 0 Left / 1 Middle / 2 Right (GHZ/BreakableWall.xml).
  0x3c: (subtype, base) => one(Math.min(2, subtype & 0x0f), base),
  // Newtron — 00 grounded (frame 3, pal 0) / 01 flying (frame 1, pal 1) (GHZ/Newtron.xml).
  0x42: (subtype, base) => (subtype & 1)
    ? { pieces: [{ frame: 1, dx: 0, dy: 0 }], link: withLink(base, { pal: 1 }) }
    : one(3, base),
  // Wall Barrier — Art = bits0-3: 0 Shadow / 1 Light / 2 Dark (GHZ/WallBarrier.xml).
  0x44: (subtype, base) => one(Math.min(2, subtype & 0x0f), base),
};

const RULES_ZONE: Readonly<Record<string, Readonly<Record<number, Rule>>>> = {
  ghz: GHZ_RULES,
  // $15 Swinging Platform / Swinging Spikeball reuses the same GetSprite geometry in
  // every zone (SwingingPlatform.cs / SBZ SwingingSpikeball.cs); only the art link
  // (zone-scoped in s1-object-art) differs. Each map has the 3 frames the rule needs.
  mz: { 0x15: GHZ_RULES[0x15] },
  slz: { 0x15: GHZ_RULES[0x15] },
  sbz: { 0x15: GHZ_RULES[0x15] },
  // SYZ Spikeball chain — length = (subtype & 0x0F) + 1 balls stacked straight up
  // (frame 0, 16px pitch) (SYZ/SpikeballChain.cs GetSprite).
  syz: {
    0x57: (subtype, base) => {
      const length = (subtype & 0x0f) + 1;
      const pieces: ObjectPiece[] = [];
      let dy = 0;
      for (let i = 0; i < length; i++) { pieces.push({ frame: 0, dx: 0, dy }); dy -= 16; }
      return { pieces, link: base };
    },
  },
};

// ---------------------------------------------------------------------------
// Resolution
// ---------------------------------------------------------------------------

function ruleFor(id: number, zone?: string): Rule | undefined {
  if (zone) {
    const z = RULES_ZONE[zone];
    if (z && z[id]) return z[id];
  }
  return RULES_BASE[id];
}

/** Whether (id, zone) has a subtype-dependent composite rule. */
export function objectHasSubtypeRule(id: number, zone?: string): boolean {
  return ruleFor(id, zone) !== undefined;
}

/**
 * The published-map / cache key for a placement: `${id}:${subtype}` for a
 * subtype-rule object (so distinct subtypes get distinct composed sprites) and the
 * bare `${id}` for a static object (so its cache entry is reused by every placement
 * and the cache does not balloon).
 */
export function objectArtKey(id: number, zone: string, subtype: number): string {
  return objectHasSubtypeRule(id, zone) ? `${id}:${subtype}` : `${id}`;
}

/**
 * Resolve the composited pieces for (id, zone, subtype), or `null` when the id has
 * no rule (the caller keeps the single-frame path) or its art is unlinked. The
 * `link` carries the art/mappings/palette every piece renders against.
 */
export function resolveObjectPieces(id: number, zone: string, subtype: number): ObjectPieceSet | null {
  const fn = ruleFor(id, zone);
  if (!fn) return null;
  const base = resolveObjectArt(id, zone);
  if (!base) return null; // a rule needs art; without it fall back to the hex box
  const set = fn(subtype, base);
  if (set.pieces.length === 0) return null;
  return set;
}

/** Every id that has a subtype rule in the given zone (base ∪ zone), ascending. */
export function ruleObjectIds(zone?: string): number[] {
  const ids = new Set<number>(Object.keys(RULES_BASE).map(Number));
  if (zone && RULES_ZONE[zone]) for (const k of Object.keys(RULES_ZONE[zone])) ids.add(Number(k));
  return [...ids].sort((a, b) => a - b);
}

/** Whether an id has a subtype rule in ANY zone (for the golden/link tests). */
export function ruleObjectIdsAnyZone(): number[] {
  const ids = new Set<number>(Object.keys(RULES_BASE).map(Number));
  for (const zone of Object.keys(RULES_ZONE)) for (const k of Object.keys(RULES_ZONE[zone])) ids.add(Number(k));
  return [...ids].sort((a, b) => a - b);
}
