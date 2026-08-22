// Measurement probe (not shipped): find REAL occlusion cases for the
// priority-occlusion work — placed objects whose sprite pixels sit under
// HIGH-priority, non-transparent FG map pixels — from the real s1disasm data
// with Aurora's own decoders. Never guessed coordinates.
//
// Also scans every linked object's mappings for pieces with the priority bit
// SET (attrs bit 15 / spritePiece arg 9), to find a hi-pri sprite piece case.
import * as fs from 'node:fs';
import * as path from 'node:path';
import { s1Adapter } from '../src/core/project/s1/index';
import { renderChunk } from '../src/core/level-classic/render';
import { chunkPriorityMask, CHUNK_TILES } from '../src/core/level-classic/priority-mask';
import { layoutCellAt, ringGroupPositions } from '../src/renderer/components/classic/viewport-math';
import {
  renderResolvedObjectFrame, objectFrameRect,
} from '../src/core/level-classic/object-sprite';
import { resolveObjectArt } from '../src/core/project/profiles/s1-object-art';
import { resolveEffectiveObjectArt, objectArtKey } from '../src/core/project/profiles/object-subtype-rules';
import { s1ObjectName } from '../src/core/project/profiles/s1-objects';
import { parseAsmMappings } from '../src/core/import/asm-mappings';

const S1 = '/home/volence/sonic_hacks/s1disasm';
const CHUNK_PX = 256;

function realFs(root: string) {
  return {
    async exists(rel: string) { return fs.existsSync(path.join(root, rel)); },
    async read(rel: string) { return new Uint8Array(fs.readFileSync(path.join(root, rel))); },
    async list(rel: string) { return fs.readdirSync(path.join(root, rel)); },
  };
}

async function main() {
  const fa = realFs(S1);
  const handle = await s1Adapter.open(fa as never);
  const refs = handle.levels.list().filter((r) => r.available);

  // -- Pass A: mapping pieces with priority bit set, among LINKED objects ----
  console.log('=== hi-pri mapping pieces among linked objects (any zone) ===');
  const seenMaps = new Set<string>();
  for (const ref of refs) {
    const doc = await handle.levels.read(ref);
    for (const obj of doc.objects) {
      const base = resolveObjectArt(obj.id, ref.zone);
      if (!base) continue;
      const { link } = resolveEffectiveObjectArt(obj.id, ref.zone, obj.subtype, base);
      if (seenMaps.has(link.mapAsm)) continue;
      seenMaps.add(link.mapAsm);
      const text = fs.readFileSync(path.join(S1, link.mapAsm), 'utf8');
      const frames = parseAsmMappings(text);
      frames.forEach((f, fi) => {
        const pri = f.pieces.filter((p) => p.priority);
        if (pri.length > 0) {
          console.log(`  ${link.mapAsm} frame ${fi}: ${pri.length}/${f.pieces.length} pri pieces (obj $${obj.id.toString(16)} ${s1ObjectName(obj.id)})`);
        }
      });
    }
  }

  // -- Pass B: per act, objects overlapping hi-pri non-transparent map px ----
  for (const ref of refs) {
    const doc = await handle.levels.read(ref);
    const grid = doc.fg;
    const maskCache = new Map<number, Uint8Array | null>();
    const rgbaCache = new Map<number, Uint8ClampedArray>();
    const maskFor = (id: number) => {
      if (!maskCache.has(id)) maskCache.set(id, chunkPriorityMask(doc, id));
      return maskCache.get(id)!;
    };
    const rgbaFor = (id: number) => {
      let b = rgbaCache.get(id);
      if (!b) { b = renderChunk(doc, id); rgbaCache.set(id, b); }
      return b;
    };
    const frameCache = new Map<string, ReturnType<typeof renderResolvedObjectFrame> | null>();
    const getFrame = (id: number, subtype: number) => {
      const key = objectArtKey(id, ref.zone, subtype);
      if (frameCache.has(key)) return frameCache.get(key)!;
      const base = resolveObjectArt(id, ref.zone);
      let entry: ReturnType<typeof renderResolvedObjectFrame> | null = null;
      if (base) {
        try {
          const { link, pieces } = resolveEffectiveObjectArt(id, ref.zone, subtype, base);
          const isLevelArt = link.artSource === 'levelArt';
          const artBytes = isLevelArt ? null : new Uint8Array(fs.readFileSync(path.join(S1, link.artFile)));
          const mapText = fs.readFileSync(path.join(S1, link.mapAsm), 'utf8');
          entry = renderResolvedObjectFrame(
            { artSource: link.artSource, compression: link.compression, tileIndexOffset: link.tileIndexOffset, frame: link.frame, pieces },
            mapText, artBytes, isLevelArt ? doc.tiles : null,
          );
        } catch { entry = null; }
      }
      frameCache.set(key, entry);
      return entry;
    };

    const found: string[] = [];
    doc.objects.forEach((obj, oi) => {
      const frame = getFrame(obj.id, obj.subtype);
      if (!frame) return;
      const anchors = obj.id === 0x25
        ? ringGroupPositions(obj.subtype, obj.x, obj.y)
        : [{ x: obj.x, y: obj.y }];
      for (const a of anchors) {
        const rect = objectFrameRect(frame, a.x, a.y, obj.xflip, obj.yflip);
        let occluded = 0;
        let sample: string | null = null;
        let freeSample: string | null = null;
        for (let py = 0; py < frame.height; py++) {
          for (let px = 0; px < frame.width; px++) {
            const sx = obj.xflip ? frame.width - 1 - px : px;
            const sy = obj.yflip ? frame.height - 1 - py : py;
            if (frame.indices[sy * frame.width + sx] === 0) continue;
            const wx = Math.round(rect.left) + px;
            const wy = Math.round(rect.top) + py;
            const col = Math.floor(wx / CHUNK_PX), row = Math.floor(wy / CHUNK_PX);
            const cell = layoutCellAt(grid, col, row);
            if (cell === undefined) continue;
            const chunkId = cell & 0x7f;
            const mask = maskFor(chunkId);
            const lx = wx - col * CHUNK_PX, ly = wy - row * CHUNK_PX;
            const hi = mask ? mask[(ly >> 3) * CHUNK_TILES + (lx >> 3)] !== 0 : false;
            if (!hi) { if (!freeSample) freeSample = `(${wx},${wy})`; continue; }
            const rgba = rgbaFor(chunkId);
            if (rgba[(ly * CHUNK_PX + lx) * 4 + 3] === 0) { if (!freeSample) freeSample = `(${wx},${wy})`; continue; }
            occluded++;
            if (!sample) sample = `(${wx},${wy})`;
          }
        }
        if (occluded > 8) {
          found.push(
            `  obj[${oi}] $${obj.id.toString(16)} "${s1ObjectName(obj.id)}" sub=$${obj.subtype.toString(16)} ` +
            `at (${a.x},${a.y}) xf=${obj.xflip} yf=${obj.yflip} rect=(${rect.left},${rect.top},${rect.width}x${rect.height}) ` +
            `occludedPx=${occluded} sampleOccluded=${sample} sampleFree=${freeSample}`,
          );
        }
      }
    });
    if (found.length) {
      console.log(`=== ${ref.zone} act ${ref.act}: ${found.length} occlusion cases ===`);
      console.log(found.slice(0, 8).join('\n'));
    } else {
      console.log(`=== ${ref.zone} act ${ref.act}: none ===`);
    }
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
