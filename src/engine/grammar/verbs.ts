/** Token-native one-shot verb productions. Filled out in P2; the second pass is a no-op until then. */
import type { Effect, TSlot } from '../types';
import type { Cursor } from './cursor';

export interface VerbHit {
  effects: Effect[];
  slots?: TSlot[];
}

export interface VerbCtx {
  slots?: TSlot[];
}

/**
 * Parse a simple leftover verb phrase at the cursor (already stripped of you-may / if / until wrappers).
 * Returns null when the phrase is not a known simple one-shot verb.
 */
export function parseNativeVerb(_c: Cursor, _ctx: VerbCtx = {}): VerbHit | null {
  return null;
}
