// Aeon project save — the renderer's saveProject (hooks/useProject.ts 161–379)
// ported to pure core. Serializes everything and returns the writes as data;
// the renderer glue (state/aeon-save.ts, a later task) does the actual IPC
// writes. The one read this needs (the stale meta-sidecar probe) goes through fa.
//
// Ordering parity: files[] preserves the original write order exactly
// (sections → chunk library → tilesets → act BG → BG library → project.json →
// legacy-atlas truncation) so a partial failure mid-plan leaves the same
// on-disk shape as a partial failure did before the port.
//
// THE EXPORT STEP IS GONE (2026-08-19, ROADMAP §4.2 / §5.1 item 2). It used to
// call `exportAct` and append `{dataPath}export/` outputs — act_descriptor.asm,
// entity_data.asm, vram_bases.asm, section_N.{tiles,art}.bin — targeting the
// engine pipeline that the act-pool model retired. Nothing in aeon reads that
// directory: the build's `act_descriptor.emp` is authored under
// `games/*/data/levels/`, and `tools/ojz_entity_gen.py` builds its own
// `data/generated/ojz/act1/entity_data.emp` from the editor JSONs this plan
// writes — same filename, different producer. The editor files ARE the
// interface; the Python generators own baking.
//
// The stale outputs of the last export (2026-08-12) are still on disk at
// `games/sonic4/data/editor/ojz/act1/export/`. They are left alone
// deliberately — deleting another repo's data is not this change's business.

import type { FileAccess } from '../adapter';
import { legacyAtlasPath } from './load';
import {
  projectDataRoot,
  type LoadedS4Config,
} from '../../config/s4-config';
import { serializeBgTiles } from '../../formats/bg-tiles';
import { bgLibIndexPath, bgLibLayoutPath, bgLibTilesPath, serializeBgLibraryIndex } from '../../formats/bg-library';
import { serializeSectionMeta } from '../../formats/section-meta';
import { clearedChunkLinksText, serializeSectionChunkLinks } from '../../formats/section-chunk-links';
import { effectsScenePath, serializeEffectsScene } from '../../formats/effects/scene';
import { effectsPresetPath, serializeEffectsPreset } from '../../formats/effects/preset';
import { saveFileFor } from '../../formats/bg-override/bg-override-io';
import { serializeNametable } from '../../formats/s4-nametable';
import { serializeCollAttr } from '../../formats/s4-collattr';
import { jsonFileText } from '../../formats/canonical-json';
import { serializeTiles } from '../../export/tile-dedup';
import type { S4Project } from '../../model/s4-types';

export interface AeonSavePlan {
  /** Every write, in order, keyed by project-relative path. */
  files: { path: string; bytes: Uint8Array }[];
  /** True when project.json was retargeted (it is then also present in files). */
  configChanged: boolean;
}

export async function buildAeonSavePlan(
  fa: FileAccess,
  config: LoadedS4Config,
  project: S4Project,
  zoneId: string,
  actId: string,
  opts: { legacyAtlasMerged: boolean },
): Promise<AeonSavePlan> {
  const files: { path: string; bytes: Uint8Array }[] = [];

  const zone = project.zones.find(z => z.id === zoneId);
  const act = zone?.acts.find(a => a.id === actId);
  const zoneConfig = config.zones.find(z => z.id === zoneId);
  const actConfig = zoneConfig?.acts.find(a => a.id === actId);
  if (!zone || !act || !zoneConfig || !actConfig) {
    throw new Error(`act not found: ${zoneId}/${actId}`);
  }

  const dataPath = actConfig.dataPath;

  // Write per-section data files
  for (let i = 0; i < act.sections.length; i++) {
    const section = act.sections[i];
    if (!section) continue;

    const prefix = `${dataPath}section_${i}`;

    // A file the LOAD could not read holds a placeholder in memory, not the
    // user's data — writing it back is how a truncated hand-edit or a
    // merge-conflict marker turns into a permanent loss of every placement in
    // the section. Same rule as the legacy-atlas guard below: a load-time parse
    // failure must not lead to destroying data.
    const understood = (suffix: string): boolean => !section.unreadable?.includes(suffix);

    // Write nametable (.tiles.bin)
    if (understood('tiles.bin')) {
      const ntData = serializeNametable(section.tileGrid.nametable);
      files.push({ path: `${prefix}.tiles.bin`, bytes: ntData });
    }

    // Write editable collision attr plane (.collattr.bin) — the authored
    // collision. (Legacy .coll.bin is no longer written; stray files from
    // older saves are ignored on load.)
    //
    // The null checks alone were no gate at all: the load's fallback assigns a
    // real Uint16Array of the strip baseline, so both refs are ALWAYS set by the
    // time a save runs, and a plane Aurora could not read was overwritten with
    // the baked baseline — every authored cell in the section, gone.
    if (understood('collattr.bin') && section.collisionEdit) {
      const caData = serializeCollAttr(section.collisionEdit);
      files.push({ path: `${prefix}.collattr.bin`, bytes: caData });
    }
    if (understood('collattrb.bin') && section.collisionEditB) {
      const cbData = serializeCollAttr(section.collisionEditB);
      files.push({ path: `${prefix}.collattrb.bin`, bytes: cbData });
    }

    // Write objects (.objects.json)
    if (understood('objects.json')) {
      // Trailing newline: the §8 canonical-file rule, via the chokepoint —
      // see canonical-json.ts jsonFileText. Same for every JSON write below.
      const objectsJson = jsonFileText(JSON.stringify(section.objects, null, 2));
      const objectsBytes = new TextEncoder().encode(objectsJson);
      files.push({ path: `${prefix}.objects.json`, bytes: objectsBytes });
    }

    // Write rings (.rings.json)
    if (understood('rings.json')) {
      const ringsJson = jsonFileText(JSON.stringify(section.rings, null, 2));
      const ringsBytes = new TextEncoder().encode(ringsJson);
      files.push({ path: `${prefix}.rings.json`, bytes: ringsBytes });
    }

    // Write meta sidecar (.meta.json) — scalar refs (bgLayoutRef,
    // paletteRef, sceneRef). Written only when at least one ref is non-null; when
    // all refs are null we still OVERWRITE an existing sidecar (with
    // nulls) so a previously-saved ref that was cleared in-session cannot
    // resurrect on the next load. An exists probe gates that overwrite so
    // the common all-default case creates no files.
    //
    // The clearing branch needs the understood() gate as much as the write
    // does — more, in fact: a sidecar the load could not parse leaves both
    // refs at their defaults, which is indistinguishable here from refs the
    // user cleared, and the exists probe then finds the very file that was
    // never read.
    if (understood('meta.json')) {
      const metaJson = serializeSectionMeta({
        bgLayoutRef: section.bgLayoutRef,
        paletteRef: section.paletteRef,
        sceneRef: section.sceneRef,
      });
      const metaPath = `${prefix}.meta.json`;
      if (metaJson !== null) {
        const metaBytes = new TextEncoder().encode(metaJson);
        files.push({ path: metaPath, bytes: metaBytes });
      } else if (await fa.exists(metaPath)) {
        // Every ref the sidecar can hold must be named here, not just the ones
        // this branch happened to know about when it was written: a ref missing
        // from the cleared body is a ref that resurrects on the next load.
        const clearedBytes = new TextEncoder().encode(
          jsonFileText(JSON.stringify({ bgLayoutRef: null, paletteRef: null, sceneRef: null }, null, 2)));
        files.push({ path: metaPath, bytes: clearedBytes });
      }
    }

    // Write the chunk-identity sidecar (.chunklinks.json) — which library chunk
    // each stamped tile still remembers (owner ruling d-18c).
    //
    // Same three-way shape as the meta sidecar above, and for the same reasons:
    // write when there is something to say, OVERWRITE WITH AN EMPTY DOCUMENT
    // when there is not but a file exists (or detaching every placement would
    // come back on the next load), and create nothing in the common case. The
    // `understood()` gate matters more here than anywhere: a links document
    // Aurora refused reads as "no identity layer", which is indistinguishable
    // from an author who detached everything — and the exists probe would then
    // find the very file that was never read and clear it.
    if (understood('chunklinks.json')) {
      const linksText = serializeSectionChunkLinks(section.chunkLinks);
      const linksPath = `${prefix}.chunklinks.json`;
      if (linksText !== null) {
        files.push({ path: linksPath, bytes: new TextEncoder().encode(jsonFileText(linksText)) });
      } else if (await fa.exists(linksPath)) {
        files.push({ path: linksPath, bytes: new TextEncoder().encode(jsonFileText(clearedChunkLinksText())) });
      }
    }
  }

  // Save chunk library
  if (config.chunkLibraryPath && project.chunkLibrary.length > 0) {
    const serializedChunks = project.chunkLibrary.map(chunk => ({
      id: chunk.id,
      name: chunk.name,
      widthTiles: chunk.widthTiles,
      heightTiles: chunk.heightTiles,
      nametable: Array.from(chunk.nametable),
      collisionA: Array.from(chunk.collisionA),
      collisionB: Array.from(chunk.collisionB),
    }));
    const chunksJson = jsonFileText(JSON.stringify(serializedChunks));
    const chunksBytes = new TextEncoder().encode(chunksJson);
    files.push({ path: config.chunkLibraryPath, bytes: chunksBytes });
  }

  // Persist each zone's tileset to an editor-owned path.
  //
  // INVARIANT (see the editor-destination note in config/s4-config.ts): the
  // bytes and the pointer that names them are the same file, and exactly one
  // party fixes it.
  //   • `editorTilesetPath` declared → the REPO owns the destination. Write
  //     there and leave `tileset` alone, so a pointer the repo maintains (a
  //     bake regenerates zones[0].tileset) is not clobbered on every save.
  //   • absent → AURORA owns it: write to <dataRoot>editor/ and retarget
  //     `tileset` to match. The configured tileset may point into the engine's
  //     regenerated data/generated tree (or even alias the legacy
  //     chunks_tiles.bin); without the retarget, MCP write_tiles and
  //     imported/merged art vanish on reload.
  // The root is derived from the project layout (projectDataRoot) so post-split
  // engine repos get games/<game>/data/editor/, never a repo-root data/ dir.
  const dataRoot = projectDataRoot(config.raw);
  let configChanged = false;
  for (const projZone of project.zones) {
    const rawZone = config.raw.zones.find(rz => rz.id === projZone.id);
    const tilesetDest = rawZone?.editorTilesetPath || `${dataRoot}editor/${projZone.id}_tiles.bin`;
    const tileBytes = serializeTiles(projZone.tileset.tiles);
    files.push({ path: tilesetDest, bytes: tileBytes });

    if (rawZone && !rawZone.editorTilesetPath && rawZone.tileset !== tilesetDest) {
      rawZone.tileset = tilesetDest;
      configChanged = true;
    }
  }

  // Persist the current act's background (Plane B) to editor-owned paths,
  // mirroring the tileset rule above, per field: a declared `editorBgLayout` /
  // `editorBgTiles` is the repo's destination and suppresses that pointer's
  // rewrite; absent, Aurora derives the path and retargets. Without the
  // retarget in the Aurora-owned case, edits (set-bg commands, BG-layer
  // painting) vanish on reload, because the configured bgLayout/bgTiles may
  // point into the engine's regenerated data/generated tree.
  if (act.bgLayout && act.bgTiles) {
    const rawAct = config.raw.zones.find(rz => rz.id === zone.id)
      ?.acts.find(ra => ra.id === act.id);
    const editorBgLayoutPath = rawAct?.editorBgLayout || `${dataRoot}editor/${zone.id}_${act.id}_bg.bin`;
    const editorBgTilesPath = rawAct?.editorBgTiles || `${dataRoot}editor/${zone.id}_${act.id}_bg_tiles.bin`;
    // Editor-owned BG files stay in the LOCAL index convention (in-memory
    // arrays serialized verbatim) — the engine build pipeline regenerates
    // its own VRAM-absolute files. On reload, normalizeBgLayout detects
    // local indices and passes them through, so load(save(state))
    // reproduces the in-memory arrays exactly.
    const bgLayoutBytes = serializeNametable(act.bgLayout);
    files.push({ path: editorBgLayoutPath, bytes: bgLayoutBytes });
    const bgTileBytes = serializeBgTiles(act.bgTiles);
    files.push({ path: editorBgTilesPath, bytes: bgTileBytes });

    if (rawAct) {
      if (!rawAct.editorBgLayout && rawAct.bgLayout !== editorBgLayoutPath) {
        rawAct.bgLayout = editorBgLayoutPath;
        configChanged = true;
      }
      if (!rawAct.editorBgTiles && rawAct.bgTiles !== editorBgTilesPath) {
        rawAct.bgTiles = editorBgTilesPath;
        configChanged = true;
      }
    }
  }

  // Persist the BG library (named alternate backgrounds sections can
  // reference) to editor-owned paths: an id/name index JSON plus
  // per-entry layout/tile binaries in the LOCAL index convention (same
  // round-trip guarantee as the act BG above). Single-zone assumption:
  // like the chunk library, the data model has ONE library per project,
  // keyed here under the current zone's id.
  if (project.bgLibrary.length > 0) {
    const indexBytes = new TextEncoder().encode(serializeBgLibraryIndex(project.bgLibrary));
    files.push({ path: bgLibIndexPath(dataRoot, zone.id), bytes: indexBytes });
    for (const entry of project.bgLibrary) {
      const layoutBytes = serializeNametable(entry.layout);
      files.push({ path: bgLibLayoutPath(dataRoot, zone.id, entry.id), bytes: layoutBytes });
      const tileBytes = serializeBgTiles(entry.tiles);
      files.push({ path: bgLibTilesPath(dataRoot, zone.id, entry.id), bytes: tileBytes });
    }
  }

  // Persist the effects-scene library — one JSON per scene under
  // `{dataRoot}editor/effects/` (empyrean AURORA_EFFECTS_SCHEMA.md §2). Written
  // beside the BG library and for the same reason: the model holds ONE library
  // per project, and the plan is built per act, so both land in every act's plan.
  // That is not a duplicate write — the bytes are identical, and aeon-save.ts
  // compares before writing, so only the first act's plan touches disk.
  //
  // THE PATH IS ACT-INDEPENDENT (no zone.id in it, unlike the BG library's): the
  // contract fixes it at `<dataRoot>editor/effects/<scene_id>.json` and the scene
  // id is globally unique by the schema's own identity rule.
  //
  // TWO REFUSALS, both deliberate and both LOUD:
  //
  //   • serializeEffectsScene VALIDATES on the way out and throws. It is not
  //     caught here: the writer path is the one the schema is closed for (§8),
  //     and a save that silently omitted an invalid scene would present to the
  //     author as "my edit didn't stick".
  //
  //   • a scene whose id would land on a file the LOAD could not parse is
  //     refused, with that file's name in the message.
  //
  // THE SECOND ONE IS NOT THE `understood()` RULE THE SECTION LOOP USES, and the
  // difference is worth stating because the first version of it was a skip that
  // asserted nothing. An unparsable scene file never enters `scenes` at all (the
  // library puts it in `unreadable` and returns no id for it), so a by-path skip
  // over `scenes` can never fire on a straight load→save. The ONE reachable way
  // to aim a write at a broken file is for the session to CREATE a scene whose id
  // happens to be that file's stem — which an author can easily do, precisely
  // because the broken scene is invisible in the UI's list.
  //
  // Skipping there would be the worst of both: the author's new scene silently
  // never saved AND their broken file still on disk. So it throws, the file is
  // untouched, and the message names the collision. The UI refuses the id at
  // CREATE time (see effects-scene-ui's takenSceneIds) so this is a backstop, not
  // the user-facing path.
  const unreadableScenePaths = new Set(project.effectsScenes.unreadable.map(u => u.path));
  for (const scene of project.effectsScenes.scenes) {
    const path = effectsScenePath(dataRoot, scene.id);
    if (unreadableScenePaths.has(path)) {
      throw new Error(
        `refusing to save scene "${scene.id}": ${path} exists and could not be read as an ` +
        'effects scene, so writing there would destroy it. Fix or remove that file by hand, ' +
        'or rename the scene.',
      );
    }
    files.push({ path, bytes: new TextEncoder().encode(serializeEffectsScene(scene)) });
  }

  // The RASTER PRESET documents, on the identical rule and for the identical
  // reason: an unreadable file at the path a preset would be written to is a
  // THROW, not a skip, because skipping is the worst of both — the author's
  // preset silently never saved AND their broken file still on disk.
  const unreadablePresetPaths = new Set(project.effectsPresets.unreadable.map(u => u.path));
  for (const preset of project.effectsPresets.presets) {
    const path = effectsPresetPath(dataRoot, preset.id);
    if (unreadablePresetPaths.has(path)) {
      throw new Error(
        `refusing to save preset "${preset.id}": ${path} exists and could not be read as a ` +
        'raster preset, so writing there would destroy it. Fix or remove that file by hand, ' +
        'or rename the preset.',
      );
    }
    files.push({ path, bytes: new TextEncoder().encode(serializeEffectsPreset(preset)) });
  }

  // The BG override document. `saveFileFor` owns all three "write nothing"
  // cases — no file on disk, a file that would not parse, and a document that
  // re-serializes to exactly the text it was loaded from — and it THROWS rather
  // than skipping on an invalid document, on the same rule the scene write
  // above states: Aurora is the sole writer of this file, so a refusal here is
  // the last place anything can catch it before the bake.
  //
  // Measured 2026-08-22 against aeon's live 88,993-byte document: parse →
  // serialize is byte-identical, so opening and saving an untouched project
  // adds no write at all. ONE exception since 2026-08-26: aeon's shipped file
  // does not yet end in the canonical newline (§8), so the first save after
  // the rule landed writes the document once with exactly that byte added,
  // and every save after it is the no-op again. Aeon changes nothing.
  const bgOverrideFile = saveFileFor(project.bgOverride);
  if (bgOverrideFile) files.push(bgOverrideFile);

  if (configChanged) {
    // A pointer rewrite should read as a pointer rewrite in review, nothing
    // else: 2-space indent (what the committed project.json already uses, so
    // every untouched line re-serializes byte-identically) plus the canonical
    // trailer. Until 2026-08-26 the source file's own trailing-newline state
    // was carried across the parse and reproduced (the "churn rider"); the §8
    // ruling supersedes that — every JSON file Aurora writes into aeon's tree
    // ends in exactly one newline, this one included — so a source without
    // the byte gains it on its first pointer rewrite, once.
    const projectJsonBytes = new TextEncoder().encode(jsonFileText(JSON.stringify(config.raw, null, 2)));
    files.push({ path: 'project.json', bytes: projectJsonBytes });
  }

  // RE-ENTRY HAZARD closure: the load-time atlas migration re-runs any
  // time chunks_tiles.bin parses non-empty, and it is not idempotent in
  // general. Now that the unified tileset is saved to the editor-owned
  // path and project.json points there, truncate the legacy atlas so the
  // migration can never re-enter on the merged data.
  // Guards (both must pass — belt-and-braces):
  //   1. opts.legacyAtlasMerged — the migration actually ran and
  //      succeeded during the current load. If chunks.json failed to parse
  //      on load (swallowed in the catch block), the migration was skipped
  //      and we must NOT truncate — doing so would permanently destroy
  //      tile art that was never merged into the zone tileset.
  //   2. aliasesLiveTileset check — skip if that path holds live zone art.
  //      In the OJZ project the configured tileset literally aliases
  //      chunks_tiles.bin; zeroing the live tileset file destroys zone art.
  //
  //      INVARIANT: a path holds live zone art if, for any zone, it is either
  //      the pointer a reader follows (`tileset`, as project.json will be
  //      written out — the retarget above may just have moved it) or the
  //      destination this plan writes the zone's tile bytes to. Under the
  //      editor-destination rule those are the same path in each case, but
  //      which field names it differs: Aurora-owned zones have it in the
  //      (rewritten) `tileset`, repo-owned zones in `editorTilesetPath` with
  //      `tileset` left pointing wherever the repo put it. Both must count, so
  //      the guard reads both fields and never only the one that happens to be
  //      authoritative today.
  if (config.chunkLibraryPath && opts.legacyAtlasMerged) {
    const atlasTruncatePath = legacyAtlasPath(config.chunkLibraryPath);
    const liveTilesetPaths = new Set<string>();
    for (const rz of config.raw.zones) {
      liveTilesetPaths.add(rz.tileset);
      if (rz.editorTilesetPath) liveTilesetPaths.add(rz.editorTilesetPath);
    }
    if (!liveTilesetPaths.has(atlasTruncatePath)) {
      files.push({ path: atlasTruncatePath, bytes: new Uint8Array(0) });
    }
  }

  return { files, configChanged };
}
