import type { AnyCommand, S4Level } from './commands';
import { nextEditSeq } from './edit-seq';

const MAX_HISTORY = 200;

export class EditHistory {
  private undoStack: AnyCommand[] = [];
  private redoStack: AnyCommand[] = [];
  // Edit-sequence stamps, kept index-aligned with undoStack/redoStack, so a
  // consumer can merge this timeline with another (the sprite history) by recency.
  private undoSeq: number[] = [];
  private redoSeq: number[] = [];
  private listeners: Array<() => void> = [];

  get canUndo(): boolean { return this.undoStack.length > 0; }
  get canRedo(): boolean { return this.redoStack.length > 0; }

  /** Edit-seq of the top undo entry (the one a next undo would revert), or -1. */
  topUndoSeq(): number { return this.undoSeq.length ? this.undoSeq[this.undoSeq.length - 1] : -1; }
  /** Edit-seq of the top redo entry (the one a next redo would re-apply), or -1. */
  topRedoSeq(): number { return this.redoSeq.length ? this.redoSeq[this.redoSeq.length - 1] : -1; }
  /** Drop the redo stack (a new edit on a *sibling* history invalidates it). */
  clearRedo(): void { if (this.redoStack.length) { this.redoStack = []; this.redoSeq = []; this.notify(); } }

  onChange(listener: () => void): () => void {
    this.listeners.push(listener);
    return () => { this.listeners = this.listeners.filter(l => l !== listener); };
  }

  private notify(): void { for (const l of this.listeners) l(); }

  execute(command: AnyCommand, level: S4Level): void {
    applyCommand(command, level);
    this.undoStack.push(command);
    this.undoSeq.push(nextEditSeq());
    if (this.undoStack.length > MAX_HISTORY) { this.undoStack.shift(); this.undoSeq.shift(); }
    this.redoStack = [];
    this.redoSeq = [];
    this.notify();
  }

  undo(level: S4Level): AnyCommand | undefined {
    const cmd = this.undoStack.pop();
    if (!cmd) return undefined;
    undoCommand(cmd, level);
    this.redoStack.push(cmd);
    this.redoSeq.push(this.undoSeq.pop()!);
    this.notify();
    return cmd;
  }

  redo(level: S4Level): AnyCommand | undefined {
    const cmd = this.redoStack.pop();
    if (!cmd) return undefined;
    applyCommand(cmd, level);
    this.undoStack.push(cmd);
    this.undoSeq.push(this.redoSeq.pop()!);
    this.notify();
    return cmd;
  }

  clear(): void {
    this.undoStack = [];
    this.redoStack = [];
    this.undoSeq = [];
    this.redoSeq = [];
    this.notify();
  }
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
    chunk.collision = new Uint8Array(cmd.newCollision);
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
        section.tileGrid.collision[e.index] = e.newColl;
      }
      break;
    case 'set-section-bg':
      section.bgLayoutRef = cmd.newRef;
      break;
    case 'set-collision':
      for (const e of cmd.entries) {
        section.tileGrid.collision[e.index] = e.newColl;
      }
      break;
    case 'set-collision-edit':
      if (section.collisionEdit) {
        for (const e of cmd.entries) section.collisionEdit[e.index] = e.newColl;
      }
      break;
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
    chunk.collision = new Uint8Array(cmd.oldCollision);
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
        section.tileGrid.collision[e.index] = e.oldColl;
      }
      break;
    case 'set-section-bg':
      section.bgLayoutRef = cmd.oldRef;
      break;
    case 'set-collision':
      for (const e of cmd.entries) {
        section.tileGrid.collision[e.index] = e.oldColl;
      }
      break;
    case 'set-collision-edit':
      if (section.collisionEdit) {
        for (const e of cmd.entries) section.collisionEdit[e.index] = e.oldColl;
      }
      break;
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
