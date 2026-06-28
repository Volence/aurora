import type { CollisionProfile } from './collision-model';
import { angleDegrees } from './collision-model';

export type CollisionKind = 'floor' | 'slope' | 'wall' | 'ceiling' | 'solid';

export const COLLISION_KINDS: CollisionKind[] = ['floor', 'slope', 'wall', 'ceiling', 'solid'];

export function classifyProfile(p: CollisionProfile): CollisionKind {
  const deg = angleDegrees(p);
  if (deg === null || deg <= 8 || deg >= 352) return p.solidity === 'all' ? 'solid' : 'floor';
  if (deg < 80 || deg > 280) return 'slope';
  if (deg <= 100 || deg >= 260) return 'wall';
  return 'ceiling';
}
