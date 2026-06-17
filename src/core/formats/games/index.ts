import type { SpriteFormatAdapter, SpriteFormatId } from '../sprite-format-adapter';
import { s1Adapter } from './s1';
import { s2Adapter } from './s2';
import { s3kAdapter } from './s3k';
import { s4Adapter } from './s4';

/** Registry of per-game sprite format adapters, keyed by format id. */
const ADAPTERS: Record<SpriteFormatId, SpriteFormatAdapter> = {
  s1: s1Adapter,
  s2: s2Adapter,
  s3k: s3kAdapter,
  s4: s4Adapter,
};

export const ADAPTER_IDS = Object.keys(ADAPTERS) as SpriteFormatId[];

export function getAdapter(id: SpriteFormatId): SpriteFormatAdapter {
  const adapter = ADAPTERS[id];
  if (!adapter) throw new Error(`no sprite format adapter registered for "${id}"`);
  return adapter;
}
