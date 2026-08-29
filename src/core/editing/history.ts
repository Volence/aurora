import type { AnyCommand, S4Level } from './commands';
import type { EffectsScene, EffectsSceneLibrary } from '../formats/effects/scene';
import type { EffectsPreset, EffectsPresetLibrary } from '../formats/effects/preset';
import { applyWithBand, applyWithoutBand } from '../formats/bg-override/bg-anim-band';
import {
  writeBgOverrideLayoutWord, writeBgOverrideTile, writeBgOverridePhaseBank,
} from '../formats/bg-override/bg-override-view';

const MAX_HISTORY = 200;

export class EditHistory {
  private undoStack: AnyCommand[] = [];
  private redoStack: AnyCommand[] = [];
  private listeners: Array<() => void> = [];

  get canUndo(): boolean { return this.undoStack.length > 0; }
  get canRedo(): boolean { return this.redoStack.length > 0; }

  onChange(listener: () => void): () => void {
    this.listeners.push(listener);
    return () => { this.listeners = this.listeners.filter(l => l !== listener); };
  }

  private notify(): void { for (const l of this.listeners) l(); }

  execute(command: AnyCommand, level: S4Level): void {
    applyCommand(command, level);
    this.undoStack.push(command);
    if (this.undoStack.length > MAX_HISTORY) this.undoStack.shift();
    this.redoStack = [];
    this.notify();
  }

  undo(level: S4Level): AnyCommand | undefined {
    const cmd = this.undoStack.pop();
    if (!cmd) return undefined;
    undoCommand(cmd, level);
    this.redoStack.push(cmd);
    this.notify();
    return cmd;
  }

  redo(level: S4Level): AnyCommand | undefined {
    const cmd = this.redoStack.pop();
    if (!cmd) return undefined;
    applyCommand(cmd, level);
    this.undoStack.push(cmd);
    this.notify();
    return cmd;
  }

  clear(): void {
    this.undoStack = [];
    this.redoStack = [];
    this.notify();
  }
}

/**
 * The nametable a `set-bg-tiles` command edits: a library entry's, or the act's
 * own default plane.
 *
 * Resolved from the command's OWN `bgRef` rather than from whichever section is
 * active now — an undo can land long after the artist moved to a section that
 * displays a different background, and reaching the wrong array would revert
 * tiles nobody painted while leaving the painted ones in place.
 */
function resolveBgLayout(level: S4Level, bgRef: string | null): Uint16Array | null {
  if (bgRef !== null) return level.bgLibrary?.find((b) => b.id === bgRef)?.layout ?? null;
  return level.act?.bgLayout ?? null;
}

/**
 * Put `scene` at `sceneId` in the library, or remove it when null.
 *
 * ONE placement function, called by BOTH apply and undo — they differ only in
 * which half of the command they hand it. Writing the placement twice is exactly
 * how an apply and its undo drift into disagreeing about ordering or copying.
 *
 * Order survives a replace (in place at the existing index) and a new scene
 * appends, so undoing an edit never silently reorders the author's scene list.
 * The stored value is a deep copy: the command has to keep an untouched record of
 * both states however the caller mutates the library afterwards — the rule
 * `set-object` states one switch down.
 */
function placeEffectsScene(
  library: EffectsSceneLibrary, sceneId: string, scene: EffectsScene | null,
): void {
  const at = library.scenes.findIndex((s) => s.id === sceneId);
  if (scene === null) {
    if (at >= 0) library.scenes.splice(at, 1);
    return;
  }
  const copy = structuredClone(scene);
  if (at >= 0) library.scenes[at] = copy;
  else library.scenes.push(copy);
}

/**
 * Place, replace or remove one RASTER PRESET in the library, in place.
 *
 * The rule `placeEffectsScene` states, unchanged and for the same reason: an
 * existing id is REPLACED where it sits and a new one appends, so undoing an
 * edit never silently reorders the author's preset list. The stored value is a
 * deep copy — the command has to keep an untouched record of both states however
 * the caller mutates the library afterwards.
 */
function placeEffectsPreset(
  library: EffectsPresetLibrary, presetId: string, preset: EffectsPreset | null,
): void {
  const at = library.presets.findIndex((p) => p.id === presetId);
  if (preset === null) {
    if (at >= 0) library.presets.splice(at, 1);
    return;
  }
  const copy = structuredClone(preset);
  if (at >= 0) library.presets[at] = copy;
  else library.presets.push(copy);
}

function applyCommand(cmd: AnyCommand, level: S4Level): void {
  if (cmd.type === 'batch') {
    for (const c of cmd.commands) applyCommand(c, level);
    return;
  }
  if (cmd.type === 'set-palette-line') {
    // Throw, don't skip: a silent no-op here corrupts history (the command
    // consumes an undo slot without doing anything).
    if (!level.palette) throw new Error('set-palette-line requires level.palette');
    level.palette.lines[cmd.line].colors = cmd.newColors.map(c => ({ ...c }));
    return;
  }
  if (cmd.type === 'set-tileset-tiles') {
    if (!level.tileset) throw new Error('set-tileset-tiles requires level.tileset');
    for (let i = 0; i < cmd.newTiles.length; i++) {
      level.tileset.tiles[cmd.at + i] = { pixels: new Uint8Array(cmd.newTiles[i].pixels) };
    }
    return;
  }
  if (cmd.type === 'set-chunk') {
    if (!level.chunkLibrary) throw new Error('set-chunk requires level.chunkLibrary');
    const chunk = level.chunkLibrary.find(c => c.id === cmd.chunkId);
    if (!chunk) throw new Error(`set-chunk: unknown chunk ${cmd.chunkId}`);
    chunk.nametable = new Uint16Array(cmd.newNametable);
    chunk.collisionA = new Uint16Array(cmd.newCollisionA);
    chunk.collisionB = new Uint16Array(cmd.newCollisionB);
    return;
  }
  if (cmd.type === 'set-bg') {
    if (!level.act) throw new Error('set-bg requires level.act');
    level.act.bgLayout = cmd.newLayout ? new Uint16Array(cmd.newLayout) : null;
    level.act.bgTiles = cmd.newTiles
      ? cmd.newTiles.map(t => ({ pixels: new Uint8Array(t.pixels) }))
      : null;
    return;
  }
  if (cmd.type === 'set-bg-tiles') {
    const layout = resolveBgLayout(level, cmd.bgRef);
    if (layout) for (const e of cmd.entries) layout[e.index] = e.newNt;
    return;
  }
  if (cmd.type === 'set-bg-override-layout') {
    // Throw, don't skip — the rule set-palette-line states above.
    if (!level.bgOverride) throw new Error('set-bg-override-layout requires level.bgOverride');
    // Through the ONE writer: the document and the canvas's mirror of it are two
    // representations of one fact, and only this function writes both.
    for (const e of cmd.entries) {
      writeBgOverrideLayoutWord(level.bgOverride, e.index, e.newWord);
    }
    return;
  }
  if (cmd.type === 'set-effects-scene') {
    // Throw rather than skip — the rule set-palette-line states above. A silent
    // no-op consumes an undo slot without doing anything, and here it would also
    // leave the author's scene edit unrecorded and therefore unsaved.
    if (!level.effectsScenes) throw new Error('set-effects-scene requires level.effectsScenes');
    placeEffectsScene(level.effectsScenes, cmd.sceneId, cmd.newScene);
    return;
  }
  if (cmd.type === 'set-effects-preset') {
    // Throw rather than skip, the rule set-palette-line states above: a silent
    // no-op consumes an undo slot without doing anything, and here it would also
    // leave the author's band edit unrecorded and therefore unsaved.
    if (!level.effectsPresets) throw new Error('set-effects-preset requires level.effectsPresets');
    placeEffectsPreset(level.effectsPresets, cmd.presetId, cmd.newPreset);
    return;
  }
  if (cmd.type === 'set-bg-override-band') {
    // Throw, don't skip — the rule set-palette-line states above, and here a
    // silent no-op would also leave `anims`, `tiles` and `layout` out of step
    // with each other, which is the one corruption this command exists to
    // prevent.
    if (!level.bgOverride) throw new Error('set-bg-override-band requires level.bgOverride');
    // ONE dispatch for BOTH band operations. `adding` says which direction the
    // command's forward step points; `cmd.plan.staticBase` says whether the
    // band's slots are created/destroyed (insert/remove) or moved to and from
    // the static blob (promote/demote), and the appliers read it. A second
    // branch here would be a third place slot arithmetic could disagree.
    level.bgOverride = cmd.adding
      ? applyWithBand(level.bgOverride, cmd.plan, cmd.band)
      : applyWithoutBand(level.bgOverride, cmd.plan);
    return;
  }
  if (cmd.type === 'set-bg-override-tiles') {
    // Throw, don't skip — the rule set-palette-line states above. Through the
    // ONE tile writer, which lands each pixel array in the tile AND in the
    // owning band's phases[0]: the prefix identity holds after this by
    // construction, not by a second loop here.
    if (!level.bgOverride) throw new Error('set-bg-override-tiles requires level.bgOverride');
    for (const t of cmd.tiles) writeBgOverrideTile(level.bgOverride, t.index, t.newPixels);
    return;
  }
  if (cmd.type === 'set-bg-override-phases') {
    if (!level.bgOverride) throw new Error('set-bg-override-phases requires level.bgOverride');
    for (const b of cmd.banks) writeBgOverridePhaseBank(level.bgOverride, cmd.bandIndex, b.bank, b.newTiles);
    return;
  }
  if (cmd.type === 'set-sections') {
    if (!level.act) throw new Error('set-sections requires level.act');
    level.act.gridWidth = cmd.newGridWidth;
    level.act.gridHeight = cmd.newGridHeight;
    level.act.sections = cmd.newSections.slice();
    return;
  }

  const section = level.sections[cmd.sectionIndex];
  if (!section) return;

  switch (cmd.type) {
    case 'set-tiles':
      for (const e of cmd.entries) {
        section.tileGrid.nametable[e.index] = e.newNt;
      }
      break;
    case 'set-section-bg':
      section.bgLayoutRef = cmd.newRef;
      break;
    case 'set-section-scene':
      section.sceneRef = cmd.newRef;
      break;
    case 'set-collision-edit': {
      const arr = cmd.plane === 'b' ? section.collisionEditB : section.collisionEdit;
      if (arr) for (const e of cmd.entries) arr[e.index] = e.newColl;
      // The "Both planes" stroke's other half. APPLIER, not decider: these
      // words were already merged against their own plane's cells by
      // both-planes-paint.ts, so replaying them verbatim is correct and
      // re-merging here would put the rule in two places.
      if (cmd.otherPlaneEntries?.length) {
        const other = cmd.plane === 'b' ? section.collisionEdit : section.collisionEditB;
        if (other) for (const e of cmd.otherPlaneEntries) other[e.index] = e.newColl;
      }
      break;
    }
    case 'move-object': {
      const obj = section.objects[cmd.objectIndex];
      if (obj) { obj.x = cmd.newX; obj.y = cmd.newY; }
      break;
    }
    case 'add-object':
      section.objects.push({ ...cmd.object });
      break;
    case 'delete-object':
      section.objects.splice(cmd.objectIndex, 1);
      break;
    case 'set-object':
      // Assign a COPY, never the command's own object: the command must keep an
      // untouched record of both states or a later drag (which mutates the
      // placement in place) would rewrite its own undo entry.
      if (section.objects[cmd.objectIndex]) section.objects[cmd.objectIndex] = { ...cmd.newObject };
      break;
    case 'move-ring': {
      const ring = section.rings[cmd.ringIndex];
      if (ring) { ring.x = cmd.newX; ring.y = cmd.newY; }
      break;
    }
    case 'add-ring':
      section.rings.push({ ...cmd.ring });
      break;
    case 'add-rings':
      for (const r of cmd.rings) section.rings.push({ ...r });
      break;
    case 'delete-ring':
      section.rings.splice(cmd.ringIndex, 1);
      break;
    case 'move-objects':
      for (const m of cmd.moves) {
        const obj = section.objects[m.objectIndex];
        if (obj) { obj.x = m.newX; obj.y = m.newY; }
      }
      break;
    case 'move-rings':
      for (const m of cmd.moves) {
        const ring = section.rings[m.ringIndex];
        if (ring) { ring.x = m.newX; ring.y = m.newY; }
      }
      break;
    case 'delete-objects': {
      const indices = cmd.items.map(i => i.objectIndex).sort((a, b) => b - a);
      for (const idx of indices) section.objects.splice(idx, 1);
      break;
    }
    case 'delete-rings': {
      const indices = cmd.items.map(i => i.ringIndex).sort((a, b) => b - a);
      for (const idx of indices) section.rings.splice(idx, 1);
      break;
    }
  }
}

function undoCommand(cmd: AnyCommand, level: S4Level): void {
  if (cmd.type === 'batch') {
    for (let i = cmd.commands.length - 1; i >= 0; i--) undoCommand(cmd.commands[i], level);
    return;
  }
  if (cmd.type === 'set-palette-line') {
    if (!level.palette) throw new Error('set-palette-line requires level.palette');
    level.palette.lines[cmd.line].colors = cmd.oldColors.map(c => ({ ...c }));
    return;
  }
  if (cmd.type === 'set-tileset-tiles') {
    if (!level.tileset) throw new Error('set-tileset-tiles requires level.tileset');
    // Walk backwards so appended-slot truncation is safe
    for (let i = cmd.oldTiles.length - 1; i >= 0; i--) {
      const old = cmd.oldTiles[i];
      if (old === null) {
        level.tileset.tiles.splice(cmd.at + i, 1);   // was appended: remove
      } else {
        level.tileset.tiles[cmd.at + i] = { pixels: new Uint8Array(old.pixels) };
      }
    }
    return;
  }
  if (cmd.type === 'set-chunk') {
    if (!level.chunkLibrary) throw new Error('set-chunk requires level.chunkLibrary');
    const chunk = level.chunkLibrary.find(c => c.id === cmd.chunkId);
    if (!chunk) throw new Error(`set-chunk: unknown chunk ${cmd.chunkId}`);
    chunk.nametable = new Uint16Array(cmd.oldNametable);
    chunk.collisionA = new Uint16Array(cmd.oldCollisionA);
    chunk.collisionB = new Uint16Array(cmd.oldCollisionB);
    return;
  }
  if (cmd.type === 'set-bg') {
    if (!level.act) throw new Error('set-bg requires level.act');
    level.act.bgLayout = cmd.oldLayout ? new Uint16Array(cmd.oldLayout) : null;
    level.act.bgTiles = cmd.oldTiles
      ? cmd.oldTiles.map(t => ({ pixels: new Uint8Array(t.pixels) }))
      : null;
    return;
  }
  if (cmd.type === 'set-bg-tiles') {
    const layout = resolveBgLayout(level, cmd.bgRef);
    if (layout) for (const e of cmd.entries) layout[e.index] = e.oldNt;
    return;
  }
  if (cmd.type === 'set-bg-override-layout') {
    if (!level.bgOverride) throw new Error('set-bg-override-layout requires level.bgOverride');
    // The SAME writer as apply, with the other half of each entry.
    for (const e of cmd.entries) {
      writeBgOverrideLayoutWord(level.bgOverride, e.index, e.oldWord);
    }
    return;
  }
  if (cmd.type === 'set-effects-scene') {
    if (!level.effectsScenes) throw new Error('set-effects-scene requires level.effectsScenes');
    placeEffectsScene(level.effectsScenes, cmd.sceneId, cmd.oldScene);
    return;
  }
  if (cmd.type === 'set-effects-preset') {
    if (!level.effectsPresets) throw new Error('set-effects-preset requires level.effectsPresets');
    placeEffectsPreset(level.effectsPresets, cmd.presetId, cmd.oldPreset);
    return;
  }
  if (cmd.type === 'set-bg-override-band') {
    // The SAME two functions as apply, with the direction flipped — not a
    // second implementation. An apply and an undo written separately are
    // exactly how the two drift into disagreeing about slot arithmetic.
    if (!level.bgOverride) throw new Error('set-bg-override-band requires level.bgOverride');
    level.bgOverride = cmd.adding
      ? applyWithoutBand(level.bgOverride, cmd.plan)
      : applyWithBand(level.bgOverride, cmd.plan, cmd.band);
    return;
  }
  if (cmd.type === 'set-bg-override-tiles') {
    // The SAME writer as apply, with the other half of each entry.
    if (!level.bgOverride) throw new Error('set-bg-override-tiles requires level.bgOverride');
    for (const t of cmd.tiles) writeBgOverrideTile(level.bgOverride, t.index, t.oldPixels);
    return;
  }
  if (cmd.type === 'set-bg-override-phases') {
    if (!level.bgOverride) throw new Error('set-bg-override-phases requires level.bgOverride');
    for (const b of cmd.banks) writeBgOverridePhaseBank(level.bgOverride, cmd.bandIndex, b.bank, b.oldTiles);
    return;
  }
  if (cmd.type === 'set-sections') {
    if (!level.act) throw new Error('set-sections requires level.act');
    level.act.gridWidth = cmd.oldGridWidth;
    level.act.gridHeight = cmd.oldGridHeight;
    level.act.sections = cmd.oldSections.slice();
    return;
  }

  const section = level.sections[cmd.sectionIndex];
  if (!section) return;

  switch (cmd.type) {
    case 'set-tiles':
      for (const e of cmd.entries) {
        section.tileGrid.nametable[e.index] = e.oldNt;
      }
      break;
    case 'set-section-bg':
      section.bgLayoutRef = cmd.oldRef;
      break;
    case 'set-section-scene':
      section.sceneRef = cmd.oldRef;
      break;
    case 'set-collision-edit': {
      const arr = cmd.plane === 'b' ? section.collisionEditB : section.collisionEdit;
      if (arr) for (const e of cmd.entries) arr[e.index] = e.oldColl;
      // Both halves of a "Both planes" stroke undo together, in one step. Each
      // `oldColl` was captured WHOLE from its own plane, so this restores all
      // sixteen bits of both cells — including bits no Aurora field owns.
      if (cmd.otherPlaneEntries?.length) {
        const other = cmd.plane === 'b' ? section.collisionEdit : section.collisionEditB;
        if (other) for (const e of cmd.otherPlaneEntries) other[e.index] = e.oldColl;
      }
      break;
    }
    case 'move-object': {
      const obj = section.objects[cmd.objectIndex];
      if (obj) { obj.x = cmd.oldX; obj.y = cmd.oldY; }
      break;
    }
    case 'add-object':
      section.objects.pop();
      break;
    case 'delete-object':
      section.objects.splice(cmd.objectIndex, 0, { ...cmd.object });
      break;
    case 'set-object':
      if (section.objects[cmd.objectIndex]) section.objects[cmd.objectIndex] = { ...cmd.oldObject };
      break;
    case 'move-ring': {
      const ring = section.rings[cmd.ringIndex];
      if (ring) { ring.x = cmd.oldX; ring.y = cmd.oldY; }
      break;
    }
    case 'add-ring':
      section.rings.pop();
      break;
    case 'add-rings':
      section.rings.splice(section.rings.length - cmd.rings.length, cmd.rings.length);
      break;
    case 'delete-ring':
      section.rings.splice(cmd.ringIndex, 0, { ...cmd.ring });
      break;
    case 'move-objects':
      for (const m of cmd.moves) {
        const obj = section.objects[m.objectIndex];
        if (obj) { obj.x = m.oldX; obj.y = m.oldY; }
      }
      break;
    case 'move-rings':
      for (const m of cmd.moves) {
        const ring = section.rings[m.ringIndex];
        if (ring) { ring.x = m.oldX; ring.y = m.oldY; }
      }
      break;
    case 'delete-objects': {
      const sorted = [...cmd.items].sort((a, b) => a.objectIndex - b.objectIndex);
      for (const item of sorted) section.objects.splice(item.objectIndex, 0, { ...item.object });
      break;
    }
    case 'delete-rings': {
      const sorted = [...cmd.items].sort((a, b) => a.ringIndex - b.ringIndex);
      for (const item of sorted) section.rings.splice(item.ringIndex, 0, { ...item.ring });
      break;
    }
  }
}
