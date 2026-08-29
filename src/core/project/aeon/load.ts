// Aeon project loader, ported behind the FileAccess seam (spec §7).
//
// This is the renderer's loadFullProject (src/renderer/hooks/useProject.ts) and
// its collision-table probe (src/renderer/hooks/load-collision.ts) moved into
// pure core. Behavioral parity is the contract: probe order, try/catch shapes,
// migration gates, single-zone assumptions and every console line are copied
// unchanged. Only two things changed:
//   • the IO primitive — all reads go through `fa: FileAccess` instead of
//     `window.api.readBinaryFile` (so core stays fs-free; the main process
//     supplies a real fs-backed FileAccess);
//   • the reporting channel — the atlas-unification toast becomes a pushed
//     `notices: string[]`, and the module-level `legacyAtlasMergedThisLoad`
//     flag becomes a returned field. Store writes are the renderer glue's job.

import type { FileAccess, AeonProjectData } from '../adapter';
import type { CollisionProfileSet } from '../../collision/collision-model';
import { s4CollisionAdapter } from '../../collision/adapters/s4-collision-adapter';
import { findFullBlockShapeId } from '../../collision/full-block-shape';
import { resolvePlaneWords } from '../../collision/collision-cell-resolve';
import { migrateLegacyChunkCollision } from '../../model/chunk-migrate';
import {
  loadS4Config,
  collisionDataPathCandidates,
  projectDataRoot,
  type S4ProjectConfig,
  type LoadedS4Config,
} from '../../config/s4-config';
import { parseTiles } from '../../formats/tiles';
import { parseBgTiles, normalizeBgLayout, BG_TILE_BASE_SLOT, BG_WIDTH } from '../../formats/bg-tiles';
import { bgLibIndexPath, bgLibLayoutPath, bgLibTilesPath, parseBgLibraryIndex } from '../../formats/bg-library';
import { parseSectionMeta } from '../../formats/section-meta';
import { loadEffectsSceneLibrary } from '../../formats/effects/scene';
import { loadEffectsPresetLibrary } from '../../formats/effects/preset';
import { loadBgOverride } from '../../formats/bg-override/bg-override-io';
import { buildPalette } from '../../formats/palette';
import { parseNametable } from '../../formats/s4-nametable';
import { parseCollAttr } from '../../formats/s4-collattr';
import { parseStrips, STRIP_COLS, STRIP_ROWS } from '../../formats/s4-strips';
import { createSection, SECTION_TILES_WIDE, SECTION_TILES_HIGH } from '../../model/s4-types';
import { migrateChunkTilesIntoTileset } from '../../art/atlas-migration';
import type {
  S4Project,
  Zone,
  Act,
  Section,
  Tile,
  Tileset,
  ObjectDef,
  ChunkDef,
  ObjectPlacement,
  RingPlacement,
  BgLibraryEntry,
} from '../../model/s4-types';

/** Derive the legacy chunk-tiles atlas path from the chunk-library JSON path. */
export function legacyAtlasPath(chunkLibraryPath: string): string {
  return chunkLibraryPath.replace('.json', '_tiles.bin');
}

/**
 * Load the engine's four collision tables from `relDir` and decode them via the
 * s4 adapter. Returns null on any missing/unreadable table so the overlay
 * degrades gracefully (the view falls back to flat cell fills) rather than
 * crashing. Ported from load-collision.ts's loadCollisionProfiles behind
 * FileAccess (reads go through `fa.read` instead of window.api.readBinaryFile).
 */
export async function loadCollisionProfilesFa(fa: FileAccess, relDir: string): Promise<CollisionProfileSet | null> {
  const dir = relDir.endsWith('/') ? relDir : `${relDir}/`;
  // The palette shows the fixed BASE BANK (the imported S&K vocabulary), not the
  // sparse interned runtime tables the bake writes to `${dir}*.bin`. Prefer the
  // base bank; fall back to the flat tables (pre-flag builds / if base absent).
  for (const sub of [`${dir}base/`, dir]) {
    try {
      const [heightmaps, angles, solidity] = await Promise.all([
        fa.read(`${sub}heightmaps.bin`),
        fa.read(`${sub}angles.bin`),
        fa.read(`${sub}solidity.bin`),
      ]);
      return s4CollisionAdapter.decodeProfiles({ heightmaps, angles, solidity });
    } catch {
      // try the next location
    }
  }
  return null;
}

/**
 * Auto-detect the dominant palette line from the first non-null section's
 * nametable: count `(word >> 13) & 0x3` for words whose tile index is non-zero,
 * and return the argmax (0 on ties per the original `>` comparison; 0 when there
 * is no zone/act/section). Pure extraction of useProject.ts loadFromPath's loop.
 */
export function dominantPaletteLine(project: S4Project): number {
  if (project.zones.length > 0) {
    const firstZone = project.zones[0];
    const firstAct = firstZone.acts[0];
    if (firstAct) {
      const firstSection = firstAct.sections.find(s => s !== null);
      if (firstSection) {
        const lineCounts = [0, 0, 0, 0];
        for (let i = 0; i < firstSection.tileGrid.nametable.length; i++) {
          const word = firstSection.tileGrid.nametable[i];
          if ((word & 0x7FF) === 0) continue;
          const pal = (word >> 13) & 0x3;
          lineCounts[pal]++;
        }
        let dominant = 0;
        for (let i = 1; i < 4; i++) {
          if (lineCounts[i] > lineCounts[dominant]) dominant = i;
        }
        return dominant;
      }
    }
  }
  return 0;
}

/**
 * Load an aeon project directory into an in-memory S4Project. Reads project.json
 * via FileAccess, validates it through loadS4Config, probes the collision-table
 * candidate dirs (first hit wins), then runs the full load. Returns the config,
 * project, collision profiles, human notices, and the atlas-merged flag.
 */
export async function loadAeonProject(fa: FileAccess, dir: string): Promise<AeonProjectData> {
  const jsonData = await fa.read('project.json');
  const jsonText = new TextDecoder().decode(jsonData);
  const json = JSON.parse(jsonText) as S4ProjectConfig;
  const config = loadS4Config(json, dir);

  // Load the engine's collision tables (read-only view) BEFORE the full
  // project: chunk-library load needs the profile set to migrate legacy
  // collision into word planes. Probe the candidate dirs (explicit config
  // → derived from the act dataPath → legacy root-relative) so post-split
  // engine layouts (games/<game>/data/collision/) resolve. All misses →
  // null → the overlay falls back to flat fills (no crash) and migration
  // is skipped.
  let collisionProfiles: CollisionProfileSet | null = null;
  for (const collPath of collisionDataPathCandidates(config.raw)) {
    collisionProfiles = await loadCollisionProfilesFa(fa, collPath);
    if (collisionProfiles) break;
  }

  const notices: string[] = [];
  const { project, legacyAtlasMerged } = await loadFullProject(fa, config, collisionProfiles, notices);

  // `scenes` is the SAME object as `project.effectsScenes`, deliberately — see
  // AeonProjectData.scenes. Naming it at the handle level is what closes the
  // model gap hazard 2 records; aliasing rather than copying is what keeps the
  // two names from ever disagreeing.
  return {
    config, project, collisionProfiles, notices, legacyAtlasMerged,
    scenes: project.effectsScenes,
    // Same aliasing rule, same object — see AeonProjectData.presets.
    presets: project.effectsPresets,
    // Same aliasing rule, same object — see AeonProjectData.bgOverride. Hazard 2
    // named "nothing in `AeonProjectData` names a scene, preset, band or budget";
    // `scenes` closed the first, this closes the third.
    bgOverride: project.bgOverride,
  };
}

/**
 * Decide which kind of failure a section-file read was, and record it.
 *
 * ABSENT AND UNREADABLE ARE NOT THE SAME FACT. One bare catch conflated them:
 * ENOENT, EACCES and a JSON SyntaxError all yielded an empty in-memory value
 * with no notice anywhere — so a truncated hand-edit or a merge-conflict marker
 * in objects.json opened the project with zero objects in that section, and the
 * next save wrote `[]` over every placement, permanently.
 *
 * Absence is normal and silent (a section with no objects has no file). Any
 * other failure marks the file not-understood, which `buildAeonSavePlan` reads
 * and omits — the rule save.ts already states one guard down: "a load-time
 * parse failure must not lead to destroying data".
 *
 * Existence is asked of the file adapter rather than sniffed out of the error
 * message, because the message is whatever the host's fs layer chose to say.
 */
async function markUnreadable(
  fa: FileAccess,
  section: Section,
  path: string,
  suffix: string,
  error: unknown,
  notices: string[],
): Promise<void> {
  let present = false;
  try { present = await fa.exists(path); } catch { present = false; }
  if (!present) return; // simply not there — the ordinary case

  (section.unreadable ??= []).push(suffix);
  notices.push(
    `${path} exists but could not be read (${error instanceof Error ? error.message : String(error)}). ` +
    'Aurora is showing empty data for it and will NOT overwrite the file — fix it by hand and reopen.',
  );
}

async function loadFullProject(
  fa: FileAccess,
  config: LoadedS4Config,
  collisionProfiles: CollisionProfileSet | null,
  notices: string[],
): Promise<{ project: S4Project; legacyAtlasMerged: boolean }> {
  // Tracks whether migrateChunkTilesIntoTileset ran successfully during this
  // load call (returned so the save glue can gate the legacy-atlas truncation).
  let legacyAtlasMerged = false;

  const basePath = config.basePath;
  const zones: Zone[] = [];
  const bgLibrary: BgLibraryEntry[] = [];

  for (const zoneConfig of config.zones) {
    // Load tileset
    const tileData = await fa.read(zoneConfig.tileset);
    const tiles = parseTiles(tileData);
    const tileset: Tileset = { tiles };

    // Load palette — level art at CRAM lines 1–3 (destOffset 16), and the shared
    // player palette (Sonic/Tails) into line 0, which every zone carries in-game.
    const palData = await fa.read(zoneConfig.palette);
    const sources = [{ data: palData, srcOffset: 0, destOffset: 16, length: Math.min(48, Math.floor(palData.length / 2)) }];
    try {
      const playerPal = await fa.read('art/palettes/SonicAndTails.bin');
      sources.unshift({ data: playerPal, srcOffset: 0, destOffset: 0, length: 16 });
    } catch {
      try {
        const playerPal = await fa.read('art/palettes/sonic.bin');
        sources.unshift({ data: playerPal, srcOffset: 0, destOffset: 0, length: 16 });
      } catch { /* no player palette — line 0 stays empty */ }
    }
    const palette = buildPalette(sources);

    // Load acts
    const acts: Act[] = [];
    for (const actConfig of zoneConfig.acts) {
      const totalSections = actConfig.gridWidth * actConfig.gridHeight;
      const sections: (Section | null)[] = [];

      for (let i = 0; i < totalSections; i++) {
        const prefix = `${actConfig.dataPath}section_${i}`;

        try {
          const section = createSection(i, `Section ${i}`);

          // Try the editor-saved nametable first (user-saved data takes
          // priority), then strip source. Nametable load stands alone —
          // stray legacy .coll.bin files (no longer written) are ignored.
          let loaded = false;
          try {
            const ntRaw = await fa.read(`${prefix}.tiles.bin`);
            section.tileGrid.nametable = parseNametable(ntRaw, SECTION_TILES_WIDE, SECTION_TILES_HIGH);
            loaded = true;
          } catch (e) {
            // No editor nametable — try strip source. But a nametable that is
            // THERE and unreadable is not that: reseeding from the baked strips
            // silently replaces the artist's layout, and the next save writes
            // the reseed over it.
            await markUnreadable(fa, section, `${prefix}.tiles.bin`, 'tiles.bin', e, notices);
          }

          // The engine's real per-cell collision attr indices come from the baked
          // strips. Load them into a read-only layer for the collision VIEW —
          // ALWAYS, independent of the editor nametable above. Also seed the
          // nametable from strips when no editor file exists.
          if (actConfig.stripPath) {
            try {
              const stripPrefix = actConfig.stripPrefix || 'sec';
              const stripFile = `${actConfig.stripPath}${stripPrefix}${i}_strips_source.bin`;
              const stripRaw = await fa.read(stripFile);
              const stripData = parseStrips(stripRaw);

              const engineColl = new Uint8Array(SECTION_TILES_WIDE * SECTION_TILES_HIGH);
              const engineCollB = new Uint8Array(SECTION_TILES_WIDE * SECTION_TILES_HIGH);
              for (let row = 0; row < STRIP_ROWS; row++) {
                for (let col = 0; col < STRIP_COLS; col++) {
                  const srcIdx = row * STRIP_COLS + col;
                  const dstIdx = row * SECTION_TILES_WIDE + col;
                  engineColl[dstIdx] = stripData.collision[srcIdx];
                  engineCollB[dstIdx] = stripData.collisionB[srcIdx];
                  if (!loaded) {
                    section.tileGrid.nametable[dstIdx] = stripData.nametable[srcIdx];
                  }
                }
              }
              section.engineCollision = engineColl;
              section.engineCollisionB = engineCollB;
              // Editable collision plane: a saved .collattr.bin (16-bit packed cell
              // words) if present, else seed by packing that plane's strip
              // baseline into cell words (so paints don't mutate the diff
              // baseline). ABSENT is that ordinary case and stays silent;
              // anything else marks the file not-understood, so the save omits
              // it — the baseline below is only ever something to DRAW.
              //
              // The length check has to live here rather than in parseCollAttr:
              // the authoritative plane length is the section's cell count, which
              // the codec has no way to know (it is a pure byte codec, and its
              // unit tests parse buffers of arbitrary length). The loader has
              // that figure in hand — it is the same `engineColl.length` the
              // fallback packs. Without the check a truncated file never reaches
              // the catch at all: parseCollAttr never throws, so it yields a SHORT
              // plane that serializeCollAttr then writes back short, and an
              // odd-length file loses its trailing byte to `>> 1`. Short, long and
              // odd are all "not this section's plane", so one equality covers them.
              const readPlane = async (
                suffix: string,
                baseline: Uint8Array,
              ): Promise<Uint16Array> => {
                const path = `${prefix}.${suffix}`;
                try {
                  const raw = await fa.read(path);
                  if (raw.length !== baseline.length * 2) {
                    throw new Error(
                      `collision plane is ${raw.length} bytes; this section needs ${baseline.length * 2}`,
                    );
                  }
                  return parseCollAttr(raw);
                } catch (e) {
                  await markUnreadable(fa, section, path, suffix, e, notices);
                  return resolvePlaneWords(null, baseline, baseline.length);
                }
              };
              section.collisionEdit = await readPlane('collattr.bin', engineColl);
              section.collisionEditB = await readPlane('collattrb.bin', engineCollB);
              loaded = true;
            } catch (stripErr) {
              const msg = stripErr instanceof Error ? stripErr.message : String(stripErr);
              console.error(`[STRIP_LOAD_FAIL] Section ${i}: ${msg}`);
            }
          }

          if (!loaded) {
            sections.push(null);
            continue;
          }

          // Load objects
          try {
            const objRaw = await fa.read(`${prefix}.objects.json`);
            const objText = new TextDecoder().decode(objRaw);
            section.objects = JSON.parse(objText) as ObjectPlacement[];
          } catch (e) {
            section.objects = [];
            await markUnreadable(fa, section, `${prefix}.objects.json`, 'objects.json', e, notices);
          }

          // Load rings
          try {
            const ringRaw = await fa.read(`${prefix}.rings.json`);
            const ringText = new TextDecoder().decode(ringRaw);
            section.rings = JSON.parse(ringText) as RingPlacement[];
          } catch (e) {
            section.rings = [];
            await markUnreadable(fa, section, `${prefix}.rings.json`, 'rings.json', e, notices);
          }

          // Load meta sidecar (bgLayoutRef/paletteRef/sceneRef) — optional, only
          // written when a section carries non-default refs. Absent, the
          // defaults from createSection stand; present but unparseable is a
          // different fact, and the loudest one here: all-null refs are exactly
          // what makes the save side overwrite the sidecar with nulls.
          try {
            const metaRaw = await fa.read(`${prefix}.meta.json`);
            const meta = parseSectionMeta(new TextDecoder().decode(metaRaw));
            section.bgLayoutRef = meta.bgLayoutRef;
            section.paletteRef = meta.paletteRef;
            section.sceneRef = meta.sceneRef;
          } catch (e) {
            await markUnreadable(fa, section, `${prefix}.meta.json`, 'meta.json', e, notices);
          }

          sections.push(section);
        } catch {
          // Section doesn't exist yet
          sections.push(null);
        }
      }

      // Load bg layout if present
      let bgLayout: Uint16Array | null = null;
      let bgTiles: Tile[] | null = null;
      try {
        if (actConfig.bgLayout) {
          const bgRaw = await fa.read(actConfig.bgLayout);
          const bgHeight = Math.floor(bgRaw.length / (BG_WIDTH * 2));
          // Normalize ONCE at load: engine-emitted layouts use VRAM-absolute
          // tile indices (BG_TILE_BASE_SLOT + n); the in-memory convention is
          // ALWAYS local to the BG blob (tile 0 = first blob tile). Editor-
          // saved files are already local and pass through unchanged.
          bgLayout = normalizeBgLayout(parseNametable(bgRaw, BG_WIDTH, bgHeight), BG_TILE_BASE_SLOT);
        }
        if (actConfig.bgTiles) {
          // parseBgTiles detects the engine blob's 2-byte byte-length header
          // (and accepts headerless dumps). The blob is used as-is — no blank
          // padding — because the layout above is normalized to local indices.
          const bgTileRaw = await fa.read(actConfig.bgTiles);
          bgTiles = parseBgTiles(bgTileRaw);
        }
      } catch {
        // optional bg data
      }

      acts.push({
        id: actConfig.id,
        gridWidth: actConfig.gridWidth,
        gridHeight: actConfig.gridHeight,
        sections,
        startPosition: actConfig.startPosition,
        bgLayout,
        bgTiles,
        // Act-level effects scene (AURORA_EFFECTS_SCHEMA.md §4). null and absent
        // are the same fact — "no editor assignment, the engine's hand-authored
        // act_parallax_config stands" — so they collapse to null here rather
        // than reaching the model as null vs undefined.
        sceneRef: actConfig.sceneRef ?? null,
        // project.json's `stripPath` verbatim (absent -> null). Carried onto the
        // model because it is what BINDS the per-game BG override document to an
        // act — see Act.stripPath and bg-override-binding.ts.
        stripPath: actConfig.stripPath ?? null,
      });
    }

    zones.push({
      id: zoneConfig.id,
      name: zoneConfig.name,
      acts,
      tileset,
      palette,
    });

    // Load the zone's BG library (editor-owned, optional): index JSON of
    // id/name plus per-entry layout/tile binaries. Editor-saved layouts are
    // already in the LOCAL index convention, so no normalization is needed
    // (parseBgTiles still detects the blob header shape). Entries accumulate
    // into the project-level library (single-zone assumption, like chunks).
    try {
      const dataRoot = projectDataRoot(config.raw);
      const idxRaw = await fa.read(bgLibIndexPath(dataRoot, zoneConfig.id));
      const indexEntries = parseBgLibraryIndex(new TextDecoder().decode(idxRaw));
      for (const meta of indexEntries) {
        try {
          const layoutRaw = await fa.read(bgLibLayoutPath(dataRoot, zoneConfig.id, meta.id));
          const tilesRaw = await fa.read(bgLibTilesPath(dataRoot, zoneConfig.id, meta.id));
          const height = Math.floor(layoutRaw.length / (BG_WIDTH * 2));
          if (height < 1) continue;
          bgLibrary.push({
            id: meta.id,
            name: meta.name,
            layout: parseNametable(layoutRaw, BG_WIDTH, height),
            tiles: parseBgTiles(tilesRaw),
          });
        } catch (entryErr) {
          console.warn(`[load] BG library entry ${meta.id} failed to load:`, entryErr);
        }
      }
    } catch {
      // no BG library for this zone
    }
  }

  // Load object library
  let objectLibrary: ObjectDef[] = [];
  if (config.objectLibraryPath) {
    try {
      const objLibRaw = await fa.read(config.objectLibraryPath);
      const objLibText = new TextDecoder().decode(objLibRaw);
      objectLibrary = JSON.parse(objLibText) as ObjectDef[];
    } catch {
      // no object library
    }
  }

  // Load chunk library
  let chunkLibrary: ChunkDef[] = [];
  let chunkTiles: Tile[] = [];
  if (config.chunkLibraryPath) {
    try {
      const chunkLibRaw = await fa.read(config.chunkLibraryPath);
      const chunkLibText = new TextDecoder().decode(chunkLibRaw);
      const parsed = JSON.parse(chunkLibText) as Array<{
        id: string; name: string; widthTiles: number; heightTiles: number;
        nametable: number[]; collision?: number[];
        collisionA?: number[]; collisionB?: number[];
      }>;
      chunkLibrary = parsed.map(c => {
        const cellCount = (c.widthTiles >> 1) * (c.heightTiles >> 1);
        return {
          id: c.id,
          name: c.name,
          widthTiles: c.widthTiles,
          heightTiles: c.heightTiles,
          nametable: new Uint16Array(c.nametable),
          collisionA: c.collisionA ? new Uint16Array(c.collisionA) : new Uint16Array(cellCount),
          collisionB: c.collisionB ? new Uint16Array(c.collisionB) : new Uint16Array(cellCount),
        };
      });

      // Legacy chunks (saved before word planes existed) migrate their nibble
      // plane into word planes here, once, at load time. The legacy `collision`
      // array is read straight from the parsed JSON (ChunkDef no longer carries
      // it, and saves no longer write it). No-op per-chunk when the word planes
      // are already populated (see migrateLegacyChunkCollision).
      const fullBlock = findFullBlockShapeId(collisionProfiles);
      for (let ci = 0; ci < chunkLibrary.length; ci++) {
        if (migrateLegacyChunkCollision(chunkLibrary[ci], parsed[ci].collision, fullBlock)) {
          console.log(`[load] chunk ${chunkLibrary[ci].id}: legacy collision migrated to word planes`);
        }
      }
    } catch {
      // no chunk library
    }

    // Load the legacy chunk-tiles atlas (chunks_tiles.bin) — used only as
    // migration input below; it is never put on the project object.
    try {
      const tilesRaw = await fa.read(legacyAtlasPath(config.chunkLibraryPath));
      chunkTiles = parseTiles(tilesRaw);
    } catch {
      // no chunk tiles
    }
  }

  // Atlas unification: merge the legacy chunkTiles atlas into the zone tileset
  // and remap chunk-library/pinned-section nametables to zone-tileset indices.
  // At-most-once gate: only runs when chunks_tiles.bin parsed non-empty (the
  // migration is not idempotent in general — see its RE-ENTRY HAZARD note).
  // Single-zone assumption: the data model has ONE chunk library per project,
  // so we migrate into zones[0]'s tileset (the OJZ project has one zone).
  // Pointless-merge guard: with zero chunks there are no nametable entries to
  // remap, so merging the atlas would only bloat the tileset with orphan tiles.
  if (chunkTiles.length > 0 && chunkLibrary.length === 0) {
    console.warn(
      '[load] chunks_tiles.bin is non-empty but the chunk library is empty — skipping atlas migration (nothing references those tiles)',
    );
  }
  // TODO(art-suite follow-up): make chunks.json self-describing (tileSpace marker) so migration is idempotent without truncation ordering.
  if (chunkTiles.length > 0 && chunkLibrary.length > 0 && zones.length > 0) {
    try {
      const allSections = zones.flatMap(z => z.acts.flatMap(a => a.sections));
      const result = migrateChunkTilesIntoTileset(
        zones[0].tileset.tiles, chunkTiles, chunkLibrary, allSections,
      );
      // "checked" not "remapped": the count includes identity rewrites (on
      // projects where chunkTiles already equals the zone tileset, every
      // entry maps to itself).
      notices.push(
        `Tile atlases unified — ${result.appended} tiles merged, ${result.remapped} entries checked`,
      );
      // Mark that migration ran successfully this load — the save glue uses this
      // to gate truncation of the legacy atlas (belt-and-braces with the alias
      // guard: BOTH must pass before we zero chunks_tiles.bin).
      legacyAtlasMerged = true;
    } catch (err) {
      // Abort the load: post-migration code paths cannot render chunkTiles,
      // so a half-loaded project would reference the wrong atlas.
      throw new Error(
        `Atlas unification failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  // The effects-scene library (empyrean AURORA_EFFECTS_SCHEMA.md §2). Loaded
  // LAST and unconditionally: it depends on nothing above it, and an absent
  // `{dataRoot}editor/effects/` is the ordinary "no editor scenes yet" answer
  // rather than a failure — which today is the only answer any real aeon tree
  // gives, because the directory does not exist there yet.
  //
  // Its notices join the project's, so an unreadable scene file surfaces as a
  // toast on the same channel a truncated section sidecar does.
  const effectsScenes = await loadEffectsSceneLibrary(fa, projectDataRoot(config.raw));
  notices.push(...effectsScenes.notices);

  // The RASTER PRESET library, `{dataRoot}editor/effects/presets/`, on exactly
  // the same terms: absent is the ordinary "no authored presets yet" and is
  // silent, a file that will not parse is loud and is never written back over.
  //
  // A SUBDIRECTORY of the scene directory, which is safe in both directions:
  // the scene loader skips any entry that does not end in `.json`, so the
  // `presets` directory entry is never mistaken for a scene.
  const effectsPresets = await loadEffectsPresetLibrary(fa, projectDataRoot(config.raw));
  notices.push(...effectsPresets.notices);

  // The BG override document (aeon EFFECTS_CONSUMER_CONTRACT.md §1.1), loaded
  // on exactly the same terms and for the same reason: it depends on nothing
  // above it, an absent file is the ordinary "this game has no BG override"
  // rather than a failure, and a file that exists and will not parse is loud AND
  // is never written back over. Unlike the scene directory, this file DOES exist
  // in the live aeon tree.
  const bgOverride = await loadBgOverride(fa, projectDataRoot(config.raw));
  notices.push(...bgOverride.notices);

  return {
    project: {
      name: config.name,
      zones,
      objectLibrary,
      chunkLibrary,
      bgLibrary,
      basePath,
      effectsScenes,
      effectsPresets,
      bgOverride,
    },
    legacyAtlasMerged,
  };
}
