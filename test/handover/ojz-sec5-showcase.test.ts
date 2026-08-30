// THE OJZ SECTION-5 SHOWCASE — the first raster band this editor authors that
// an author is meant to LOOK at, produced by Aurora's own writer and handed to
// aeon's lane as two files.
//
// ═══════════════════════════════════════════════════════════════════════════
// WHY A TEST AND NOT A HAND-TYPED PAIR OF JSON FILES
// ═══════════════════════════════════════════════════════════════════════════
//
// The deliverable is two documents in aeon's editor-owned tree:
//
//   games/sonic4/data/editor/effects/presets/ojz_sec5_showcase.json
//   games/sonic4/data/editor/ojz/act1/section_5.meta.json
//
// Both could be typed by hand in a minute, and that minute would prove the
// FORMAT while silently skipping the WRITER — the exact shape where an artifact
// that looks right stands in for the process that should have produced it. The
// point of the parcel is the editor-to-engine seam, so this file drives the real
// one end to end:
//
//   loadAeonProject  →  handleAgentRequest('set-effects-preset')
//                    →  handleAgentRequest('assign-section-preset')
//                    →  saveAeonProject  →  buildAeonSavePlan
//                    →  serializeEffectsPreset / serializeSectionMeta
//                    →  loadAeonProject again
//
// Every canonicalisation (§5 key sort, indent 2), the codec's refusals, the
// section-meta ref-set enumeration and the round-trip are therefore EXERCISED
// rather than imitated. The bytes this file asserts are the bytes the writer
// produced; they are quoted here so the handover is reproducible from this repo
// alone, and so a change to any of those layers turns this row red instead of
// quietly authoring a different document.
//
// ═══════════════════════════════════════════════════════════════════════════
// AEON'S TREE IS READ AT A REVISION, NEVER FROM THEIR WORKING COPY
// ═══════════════════════════════════════════════════════════════════════════
//
// `git archive <rev>` writes a fresh tree into a temp dir from the OBJECT
// STORE. Their checkout is another lane's live workspace with an mtime
// staleness gate, a provenance record and a .gitignore blanket a foreign file
// would interact with invisibly, so nothing here opens, reads, or writes inside
// it. The revision is resolved to a full SHA and printed, because "aeon's tree"
// is not a fact without one.
//
// ═══════════════════════════════════════════════════════════════════════════
// WHAT WOULD MAKE THIS GREEN WITHOUT THE PROPERTY HOLDING
// ═══════════════════════════════════════════════════════════════════════════
//
//   • NOTHING IS LOADED. An empty project has no sections, so "section 5's
//     rasterRef is null" is true for the wrong reason and every write row
//     passes over an unopened app. `the floor` below refuses to continue unless
//     the act really opened with nine sections, section 5 is a real section,
//     aeon's OWN preset document reached the library, and section_5.meta.json
//     is ABSENT on disk beforehand.
//   • THE LIBRARY IS EMPTY, so `assign-section-preset` could only ever refuse
//     and a "did not throw" row proves nothing. The floor asserts
//     `authored_probe` — aeon's shipped document — is in the library first.
//   • THE WRITER RAN AND WROTE THE WRONG KEY. `sceneRef` is the sibling this
//     one is most easily confused with and `effectsRef` is a RESERVED name that
//     must stay unspent; the reload row reads the parsed section object and
//     checks all four refs, not just the one it wants.
//   • THE REF SURVIVED AS A NUMBER. Aurora's own parser nulls a non-string
//     SILENTLY (core/formats/section-meta.ts), so an author would see an
//     assignment that did not stick and aeon's build would refuse the file by
//     name. `typeof` is asserted, not just the value.
//   • THE SAVE REWROTE THE WHOLE ACT. buildAeonSavePlan regenerates every file
//     for an act whether or not it was touched; a plan that re-encoded a
//     section's tiles differently would hand aeon a diff nobody asked for and
//     mark their level tree stale. The collateral row hashes the entire
//     extracted tree before and after and names every path that moved.
//
// ⚠ THIS FILE WAS EXPECTED TO GO RED WHEN THE HANDOVER LANDED, AND IT DID.
// `the floor` asserts that neither document exists in aeon's tree at the
// revision it runs against — because a run where they already do is not this
// parcel authoring them, it is this parcel re-authoring over a peer's committed
// work and reporting green for it. The option it offered was "retire or
// re-point, not relax", and it was RE-POINTED:
//
//   • aeon `c9a462be` (2026-08-30, "step 6: section 5 carries an authored
//     band", an ancestor of their origin/master) committed BOTH files, and its
//     message records them byte-identical to what this writer produced. Against
//     origin/master this file's floor then went red on exactly the rows it said
//     it would (`ojz_sec5_showcase` already in the library; `added` empty).
//   • `REV` below therefore defaults to `1cbb6660` — the revision the handover
//     was authored against and the last one where the floor holds — resolved
//     from aeon's OBJECT STORE by the archive step, so this stays a regression
//     test of the WRITER: the same two author actions against the same tree
//     must keep producing the same bytes aeon committed. `AURORA_AEON_REV` still
//     overrides it, and against any revision carrying the files the floor
//     refuses rather than reporting a re-authoring as green.
//   • What this file does NOT prove, and never did: that the committed files
//     render. `RASTER_SECTION_BINDING_LIMIT` (core/formats/raster-binding.ts)
//     owns that sentence. From `c9a462be` it cited aeon's own "nothing has
//     been seen on screen"; since aeon `4a4d3474` (2026-08-30, the same day)
//     it cites their committed measurement instead —
//     `docs/research/reference_captures/2026-08-30-sec5-band/`, CRAM line 2
//     entry 8 `$0EA4` in-band and `$0000` outside and on the control — and
//     still asserts nothing of its own. Nothing in this file changed for that;
//     it never pinned either wording.
//
// ⚠ NO EMULATOR, AND NO CLAIM THAT THIS RENDERS. Nothing in THIS REPO has ever
// looked at a raster band on screen (aeon has, in theirs, see above). This
// file proves the two documents are what Aurora's writer produces and that
// they round-trip; whether the band is visible in the running game was aeon's
// to measure with CRAM samples, they did, and `RASTER_SECTION_BINDING_LIMIT`
// owns the sentence that cites it.

import { it, expect, beforeAll, afterAll } from 'vitest';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative } from 'node:path';

import { referenceFile, describeRequiringFixture } from '../support/fixture-tree';
import { loadAeonProject } from '../../src/core/project/aeon/load';
import { createIpcFileAccess } from '../../src/renderer/state/classic-file-access';
import { handleAgentRequest } from '../../src/renderer/agent/agent-handler';
import { saveAeonProject } from '../../src/renderer/state/aeon-save';
import { useProjectStore } from '../../src/renderer/state/projectStore';
import { useEditorStore } from '../../src/renderer/state/editorStore';
import { useSessionStore } from '../../src/renderer/state/sessionStore';
import { useToastStore } from '../../src/renderer/state/toastStore';
import { useWorkspaceStore } from '../../src/renderer/workspace/workspaceStore';
import { documentHistoryHub } from '../../src/renderer/state/history-hub';
import type { AgentRequest } from '../../src/shared/agent-protocol';

// ---------------------------------------------------------------------------
// THE DOCUMENT — and every number in it, argued
// ---------------------------------------------------------------------------

/** The preset-document id, which the loader also requires to be the file stem. */
const PRESET_ID = 'ojz_sec5_showcase';

/** The only section aeon's `ojz_effects.emp` threads the chooser into. */
const SECTION = 5;

/**
 * THE CRAM BYTE ADDRESS, DERIVED AND NOT COPIED.
 *
 * A `cram` op's `addr` is a CRAM BYTE address. Genesis CRAM is 4 palette lines
 * x 16 entries x 2 bytes = 128 bytes, laid out line-major, so the address of
 * (line, entry) is `line * 32 + entry * 2`. That is not this file's assertion
 * about the hardware — it is the identity aeon's own engine states twice, as
 * the two agreement rules a `pal_region` op must satisfy:
 *
 *     addr >> 5        == pal_line
 *     (addr >> 1) & 15 == entry
 *
 * (engine/effects/raster_dsl.emp `stream_pal_region`, restated in
 * core/formats/effects/aurora-effects-preset.schema.json). `cramAddr` below is
 * the inverse of that pair and the test asserts the round trip rather than a
 * literal, so a transcription error cannot survive.
 */
function cramAddr(palLine: number, entry: number): number {
  return palLine * 32 + entry * 2;
}

/** OJZ's background owns CRAM line 2 (aeon tools/png_to_bg_override.py). */
const PAL_LINE = 2;

/**
 * ENTRY 8, AND ONLY ENTRY 8.
 *
 * Measured over aeon's built background plane at origin/master by decoding
 * every 4bpp tile of `editor_bg_override.json` through its 64x64 layout,
 * honouring the flip bits and counting only cells whose nametable word selects
 * palette line 2: of 262,144 plane pixels, CRAM line 2 entry 8 is 51.53% —
 * more than the next three together (entry 10 = 14.37%, entry 9 = 11.92%,
 * entry 3 = 7.69%). Section 5's FOREGROUND is flat by comparison, so a
 * foreground-aimed band reads far weaker.
 *
 * Entries 10 and 9 share the line and would add ~26% more, and they are
 * DELIBERATELY NOT TAKEN: repainting half the visible colours starts to read as
 * a global tint, which gives back the very thing a band exists to demonstrate.
 */
const ENTRY = 8;

/**
 * THE REPLACEMENT COLOUR.
 *
 * CRAM line 2 entry 8 is `$0000` today — pure black, read out of aeon's
 * `games/sonic4/data/generated/ojz/act1/ojz_palette.bin` (whose three source
 * lines load starting at CRAM line 1, so file line 1 is CRAM line 2;
 * tools/inject_editor_bg.py states that mapping, and the file is byte-identical
 * to the donor `sonic_hack/art/palettes/OJZ.bin` the build re-copies). It is
 * the void behind the forest, and it is half the backdrop.
 *
 * Genesis colour words are 9-bit, `0000 BBB0 GGG0 RRR0`. `$0EA4` is
 * (R,G,B) = (2,5,7): a bright cyan-azure. Two reasons for that and not a
 * brighter or a redder one:
 *
 *   • AGAINST BLACK IT CANNOT BE MISSED. Nothing subtle survives a photograph
 *     of a 320x224 frame, and this is a demonstration.
 *   • NOTHING ELSE ON THE LINE IS BLUE-DOMINANT. Line 2 is a brown ground ramp
 *     at entries 3-7 and a green foliage ramp at 9-15; every one of them has
 *     B <= G, and B never exceeds 3. So the recoloured region cannot be
 *     mistaken for an existing colour bleeding, which a pure primary
 *     ($000E-style red) would buy at the cost of looking like a diagnostic
 *     stripe rather than art direction — the failure aeon's own band notes
 *     warn against.
 */
const COLOUR = 0x0EA4;

/**
 * THE BAND EDGES, AND WHY BOTH LAND ON SCREEN.
 *
 * The whole point of a band is that the recoloured and un-recoloured regions
 * sit side by side IN ONE FRAME, so a capture is self-evidently a raster band
 * and not a screen-wide colour change. Both edges therefore have to fall where
 * the background is actually visible in section 5, at every camera position.
 *
 * Section 5's foreground, decoded from `section_5.tiles.bin` against
 * `ojz_tiles.bin`, is opaque over only 25-31% of world rows y 0-127, is
 * COMPLETELY EMPTY over y 128-255, and is 61-81% opaque over y 256-383 (the
 * ground). Content stops at y 383, so the camera's top edge is somewhere in
 * y 0..160. At the bottom-clamped extreme (camera top y=160, the grounded
 * case) screen lines 0-95 show world y 160-255 — the empty stripe, background
 * with nothing in front of it. At the top extreme (camera top y=0) the whole
 * frame is at least 70% open. The INTERSECTION of those is screen lines 0-95,
 * so an edge above line 96 is unoccluded in every camera position.
 *
 * On the background plane itself there is no vertical risk to trade against:
 * entry 8 covers between 26% and 87% of every 16-line block of the 512-line
 * plane, so no placement is starved of pixels to recolour.
 *
 * top 32 / bot 80 puts both edges inside that window with margins on both
 * sides: lines 3-31 stay un-recoloured above (the fire floor is 3), lines
 * 80-95 stay un-recoloured below before any foreground can begin. The band
 * covers top..bot-1, i.e. 48 of the frame's 224 lines — a fifth of the screen,
 * comfortably a BAND rather than a tint.
 */
const TOP = 32;
const BOT = 80;

/** The document, exactly as the agent tool receives it. */
const SHOWCASE = {
  schema: 1,
  id: PRESET_ID,
  name: 'OJZ act 1 section 5 - moonlit canopy void',
  bands: [
    {
      top: TOP,
      bot: BOT,
      sh: false,
      on: { cram: { addr: cramAddr(PAL_LINE, ENTRY), colours: [COLOUR] } },
    },
  ],
};

// The two deliverables, at their paths in aeon's tree.
const PRESET_PATH = `games/sonic4/data/editor/effects/presets/${PRESET_ID}.json`;
const META_PATH = 'games/sonic4/data/editor/ojz/act1/section_5.meta.json';

/**
 * THE BYTES, QUOTED. Not a template built from the constants above — a template
 * would re-derive whatever the writer did and could never disagree with it.
 * These are what the writer emitted, pasted back, so a change in
 * canonicalisation, key order, indentation or trailing newline is a red row.
 */
const EXPECTED_PRESET = `{
  "bands": [
    {
      "bot": 80,
      "on": {
        "cram": {
          "addr": 80,
          "colours": [
            3748
          ]
        }
      },
      "sh": false,
      "top": 32
    }
  ],
  "id": "ojz_sec5_showcase",
  "name": "OJZ act 1 section 5 - moonlit canopy void",
  "schema": 1
}
`;

const EXPECTED_META = `{
  "bgLayoutRef": null,
  "paletteRef": null,
  "rasterRef": "ojz_sec5_showcase",
  "sceneRef": null
}
`;

// ---------------------------------------------------------------------------
// The rig
// ---------------------------------------------------------------------------

const AEON = referenceFile('aeon');
/**
 * The revision the handover was authored against — the parent of aeon
 * `c9a462be`, which committed the two files. Pinned (see the header) because
 * this file's floor requires a tree WITHOUT them; at origin/master it correctly
 * refuses. Full SHA so the archive step cannot resolve it against a moving ref.
 */
const HANDOVER_BASE = '1cbb66603c0ffecab6b41a9a6e517dc17674f6a8';
const REV = process.env.AURORA_AEON_REV ?? HANDOVER_BASE;

/** `window.api`, backed by node fs — the same surface main/ipc-handlers.ts
 *  serves over IPC (file-io.ts is readFile/writeFile underneath), so this
 *  substitutes the transport and nothing above it. */
function installFsWindowApi(written: string[]): void {
  (globalThis as { window?: unknown }).window = {
    api: {
      pathExists: async (dir: string, rel: string) => existsSync(join(dir, rel)),
      readBinaryFile: async (dir: string, rel: string) => {
        const b = readFileSync(join(dir, rel));
        return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength);
      },
      listDir: async (dir: string, rel: string) => {
        try { return readdirSync(join(dir, rel)); } catch { return []; }
      },
      fileMtime: async (dir: string, rel: string) => {
        try { return statSync(join(dir, rel)).mtimeMs; } catch { return null; }
      },
      readManyFiles: async (dir: string, rels: string[]) => rels.map((rel) => {
        const p = join(dir, rel);
        if (!existsSync(p)) return { relPath: rel, bytes: null, mtimeMs: null };
        return { relPath: rel, bytes: new Uint8Array(readFileSync(p)), mtimeMs: statSync(p).mtimeMs };
      }),
      writeBinaryFile: async (dir: string, rel: string, data: ArrayBuffer) => {
        const p = join(dir, rel);
        mkdirSync(dirname(p), { recursive: true });
        writeFileSync(p, Buffer.from(data));
        written.push(rel);
        return true;
      },
    },
  };
}

/** relPath -> sha256, over the whole extracted tree. */
function treeHashes(rootDir: string): Map<string, string> {
  const out = new Map<string, string>();
  const walk = (dir: string): void => {
    for (const name of readdirSync(dir)) {
      const p = join(dir, name);
      if (statSync(p).isDirectory()) walk(p);
      else out.set(relative(rootDir, p), createHash('sha256').update(readFileSync(p)).digest('hex'));
    }
  };
  walk(rootDir);
  return out;
}

const ask = (req: AgentRequest) => handleAgentRequest(req as never);

describeRequiringFixture(
  'OJZ section 5 showcase — authored through Aurora\'s writer',
  AEON,
  'the aeon checkout (git archive of its object store; its working tree is never read)',
  () => {
    let root = '';
    let sha = '';
    let written: string[] = [];
    let before = new Map<string, string>();
    let after = new Map<string, string>();
    /** The act's sections as loaded the FIRST time, before any write. */
    let sectionsBefore: Array<Record<string, unknown> | null> = [];
    /** ...and as re-loaded from disk after the save. */
    let sectionsAfter: Array<Record<string, unknown> | null> = [];
    let presetIdsBefore: string[] = [];
    let saveKind = '';
    let metaExistedBefore = true;

    beforeAll(async () => {
      sha = execFileSync('git', ['-C', AEON!, 'rev-parse', REV], { encoding: 'utf8' }).trim();
      root = mkdtempSync(join(tmpdir(), 'aurora-sec5-'));
      // Object store only, never their working tree: `git archive` reads
      // committed objects and tar unpacks them somewhere else entirely.
      const tarball = execFileSync(
        'git',
        ['-C', AEON!, 'archive', sha, 'games/sonic4/data', 'project.json'],
        { maxBuffer: 512 * 1024 * 1024, encoding: 'buffer' },
      );
      execFileSync('tar', ['-x', '-C', root], { input: tarball, maxBuffer: 512 * 1024 * 1024 });
      console.log(`[sec5-showcase] aeon ${sha} archived to ${root}`);

      metaExistedBefore = existsSync(join(root, META_PATH));
      before = treeHashes(root);

      written = [];
      installFsWindowApi(written);
      documentHistoryHub.clearAll();
      useProjectStore.getState().reset();
      useWorkspaceStore.getState().reset();
      useToastStore.setState({ toasts: [] });

      const loaded = await loadAeonProject(createIpcFileAccess(root), root);
      useProjectStore.setState({
        config: loaded.config,
        project: loaded.project,
        legacyAtlasMerged: loaded.legacyAtlasMerged,
      } as never);
      useProjectStore.getState().setCurrentAct('ojz', 'act1');
      useSessionStore.setState({ activeId: 'tool:project-setup' });
      useEditorStore.getState().markClean();

      const act = useProjectStore.getState().project!.zones[0].acts[0];
      sectionsBefore = act.sections.map(
        (s) => (s ? { ...(s as unknown as Record<string, unknown>) } : null),
      );
      presetIdsBefore = useProjectStore.getState().project!.effectsPresets.presets.map((p) => p.id);

      // THE TWO AUTHOR ACTIONS, through the published agent surface.
      await ask({ kind: 'set-effects-preset', id: PRESET_ID, preset: SHOWCASE });
      await ask({ kind: 'assign-section-preset', section: SECTION, presetId: PRESET_ID });

      saveKind = (await saveAeonProject()).kind;
      after = treeHashes(root);

      // ROUND TRIP: a fresh load, from the bytes on disk, through the real parser.
      const reloaded = await loadAeonProject(createIpcFileAccess(root), root);
      sectionsAfter = reloaded.project.zones[0].acts[0].sections
        .map((s) => (s ? (s as unknown as Record<string, unknown>) : null));

      const out = process.env.AURORA_SEC5_OUT;
      if (out) {
        for (const rel of [PRESET_PATH, META_PATH]) {
          const dst = join(out, rel);
          mkdirSync(dirname(dst), { recursive: true });
          writeFileSync(dst, readFileSync(join(root, rel)));
        }
        console.log(`[sec5-showcase] handover copies written under ${out}`);
      }
    }, 180_000);

    afterAll(() => {
      delete (globalThis as { window?: unknown }).window;
      useEditorStore.getState().markClean();
      if (root && !process.env.AURORA_SEC5_KEEP) rmSync(root, { recursive: true, force: true });
    });

    /**
     * THE FLOOR. Everything below is meaningless if the project did not really
     * open, if the library was empty, or if section 5 was already bound — so
     * this row asserts the instrument saw the world before it changed it.
     */
    it('the floor — the act opened, aeon\'s own preset is in the library, section 5 is unbound', () => {
      expect(sha, 'no aeon revision resolved').toMatch(/^[0-9a-f]{40}$/);
      expect(sectionsBefore.length, 'the act did not open with its nine sections').toBe(9);
      expect(sectionsBefore[SECTION], 'section 5 is an empty slot — nothing to bind').not.toBeNull();
      expect(presetIdsBefore, 'the preset library was empty; every row below would be vacuous')
        .toContain('authored_probe');
      expect(presetIdsBefore, 'this id already existed upstream — the parcel is not authoring it')
        .not.toContain(PRESET_ID);
      expect(sectionsBefore[SECTION]!.rasterRef, 'section 5 arrived already bound').toBeNull();
      expect(metaExistedBefore, 'section_5.meta.json already exists upstream').toBe(false);
      expect(saveKind).toBe('saved');
    });

    it('the preset document is what Aurora\'s writer emits', () => {
      expect(readFileSync(join(root, PRESET_PATH), 'utf8')).toBe(EXPECTED_PRESET);
    });

    it('the sidecar is what Aurora\'s writer emits', () => {
      expect(readFileSync(join(root, META_PATH), 'utf8')).toBe(EXPECTED_META);
    });

    /**
     * ONLY WITNESS FOR: the ref surviving a full round trip AS A STRING. A
     * numeric rasterRef is nulled SILENTLY by parseSectionMeta, so an author
     * would see an assignment that did not stick; aeon's build refuses one by
     * name for exactly that reason.
     */
    it('reloads with rasterRef a STRING, and spends no other ref', () => {
      const s = sectionsAfter[SECTION]!;
      expect(typeof s.rasterRef, 'the ref came back as something other than a string').toBe('string');
      expect(s.rasterRef).toBe(PRESET_ID);
      expect(Object.keys(s), 'the writer invented an effectsRef — the reserved name is spent')
        .not.toContain('effectsRef');
      expect(s.sceneRef, 'wrote the scene binding instead of the raster one').toBeNull();
      expect(s.bgLayoutRef).toBeNull();
      expect(s.paletteRef).toBeNull();
      // ...and no OTHER section picked one up.
      for (let i = 0; i < sectionsAfter.length; i++) {
        if (i === SECTION) continue;
        expect(sectionsAfter[i]?.rasterRef ?? null, `section ${i} was bound too`).toBeNull();
      }
    });

    /**
     * ONLY WITNESS FOR: what a whole-act save costs BESIDES the two documents.
     *
     * `buildAeonSavePlan` regenerates every file of the act whether or not it
     * was touched, so "did it rewrite anything else" is a real question and the
     * answer is not zero. MEASURED at aeon `1cbb6660`, and the row asserts the
     * measurement rather than being relaxed to fit it:
     *
     *   • NO BINARY FILE MOVES. Every `.bin` — nine sections of nametable,
     *     collision, collattr, the tile blobs, the BG layout — re-encodes
     *     byte-identically. That is the one that would be a defect, and it is
     *     the one this row is really for.
     *   • 22 JSON DOCUMENTS GAIN A TRAILING NEWLINE, and nothing else: their
     *     parsed value is unchanged. Aurora's canonical file form ends every
     *     editor-owned JSON in exactly one `\n` (AURORA_EFFECTS_SCHEMA.md §8,
     *     ruled 2026-08-26); Python's `json.dumps` emits none, so aeon's
     *     committed bytes predate that rule and a save brings them into it.
     *   • 2 SIDECARS GAIN `"rasterRef": null` — `section_0` and `section_4`,
     *     written before the key existed. Absent and explicit-null are the SAME
     *     state (core/formats/section-meta.ts), so this adds no binding.
     *
     * ⚠ AND IT IS WHY THE HANDOVER IS TWO FILES AND NOT A TREE. None of the 24
     * belongs in this parcel's diff: they are Aurora's writer catching aeon's
     * older bytes up, which is aeon's call to take and not ours to smuggle in
     * beside a band.
     */
    it('adds exactly the two deliverables, moves no binary, and only reformats JSON', () => {
      const added = [...after.keys()].filter((k) => !before.has(k)).sort();
      const changed = [...after.keys()]
        .filter((k) => before.has(k) && before.get(k) !== after.get(k)).sort();
      const removed = [...before.keys()].filter((k) => !after.has(k)).sort();

      expect(added).toEqual([META_PATH, PRESET_PATH].sort());
      expect(removed).toEqual([]);
      expect(written.length, 'nothing was written at all').toBeGreaterThan(0);

      // THE ONE THAT WOULD BE A DEFECT.
      expect(changed.filter((k) => !k.endsWith('.json')),
        'a non-JSON file re-encoded differently — level data moved').toEqual([]);

      // Every JSON rewrite is either a pure trailing-newline addition or the
      // rasterRef widening, and NOTHING ELSE. Classified per file rather than
      // counted, so a genuine content change cannot hide inside a total.
      const semantic: string[] = [];
      for (const k of changed) {
        const old = execFileSync('git', ['-C', AEON!, 'show', `${sha}:${k}`], { encoding: 'utf8' });
        const now = readFileSync(join(root, k), 'utf8');
        if (now === `${old}\n`) continue;                       // §8 trailing newline only
        const a = JSON.parse(old) as Record<string, unknown>;
        const b = JSON.parse(now) as Record<string, unknown>;
        const widened = k.endsWith('.meta.json')
          && b.rasterRef === null
          && JSON.stringify({ ...b, rasterRef: undefined }) === JSON.stringify({ ...a, rasterRef: undefined });
        if (!widened) semantic.push(k);
      }
      expect(semantic, 'a save rewrote a document\'s CONTENT, not just its form').toEqual([]);
      // The COUNT is reported, never asserted: it is a property of aeon's tree
      // at whatever revision this ran against, and a number copied out of one
      // measurement is a number that has stopped measuring. The classification
      // above is the guard and it does not depend on how many files there are.
      console.log(`[sec5-showcase] whole-act save also reformatted ${changed.length} JSON `
        + `document(s) at ${sha.slice(0, 8)}; none changed value, no binary moved`);
    });

    /**
     * ONLY WITNESS FOR: the CRAM address being DERIVED. The band aims at CRAM
     * line 2 entry 8; the engine states the inverse identity as two agreement
     * rules, and this asserts the round trip rather than the literal 80.
     */
    it('the CRAM address decodes back to palette line 2, entry 8', () => {
      const addr = SHOWCASE.bands[0].on.cram.addr;
      expect(addr).toBe(cramAddr(PAL_LINE, ENTRY));
      expect(addr >> 5, 'addr does not name palette line 2').toBe(PAL_LINE);
      expect((addr >> 1) & 15, 'addr does not name entry 8').toBe(ENTRY);
      expect(addr % 2, 'an odd CRAM address — colours are words').toBe(0);
      expect(addr >> 5, 'palette line 0 is the character line and is refused').not.toBe(0);
      expect(addr, 'outside the 128-byte CRAM the engine bounds at 126').toBeLessThanOrEqual(126);
    });

    /**
     * ONLY WITNESS FOR: both edges being ON SCREEN with un-recoloured margins.
     * A band that reached the top of the frame or ran off the bottom would
     * photograph as a screen-wide tint, which is the one thing this document
     * exists to disprove.
     */
    it('both band edges land inside the frame, leaving background un-recoloured on both sides', () => {
      const FIRE_MIN = 3;      // engine/effects/raster_dsl.emp RASTER_MIN_FIRE_LINE
      const FIRE_MAX = 223;    // ...and RASTER_MAX_FIRE_LINE
      const UNOCCLUDED = 96;   // section 5's guaranteed-open window, every camera position
      expect(TOP).toBeGreaterThan(FIRE_MIN);
      expect(BOT).toBeLessThan(FIRE_MAX);
      expect(TOP).toBeLessThan(BOT);
      expect(BOT).toBeLessThanOrEqual(UNOCCLUDED);
      // Real margins, not a single-pixel technicality, on BOTH sides.
      expect(TOP - FIRE_MIN, 'no un-recoloured band above').toBeGreaterThanOrEqual(16);
      expect(UNOCCLUDED - BOT, 'no un-recoloured band below inside the open window')
        .toBeGreaterThanOrEqual(16);
      // A band, not a tint.
      expect(BOT - TOP).toBeLessThan(224 / 2);
    });
  },
);
