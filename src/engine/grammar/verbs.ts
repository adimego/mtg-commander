/** Token-native one-shot verb productions. Prefers the existing `effects()` inventory so leftover
 *  wording that already has an engine op still composes after a newly accepted trigger head. */
import type { Effect, TSlot } from '../types';
import { effects, newCx, type Cx } from '../oracle';
import type { Cursor } from './cursor';

export interface VerbHit {
  effects: Effect[];
  slots?: TSlot[];
}

export interface VerbCtx {
  slots?: TSlot[];
  cx?: Partial<Cx>;
}

/**
 * Parse a simple leftover verb phrase at the cursor (already stripped of you-may / if / until wrappers).
 * Returns null when the phrase is not a known simple one-shot verb.
 */
export function parseNativeVerb(c: Cursor, ctx: VerbCtx = {}): VerbHit | null {
  const text = c.remainingText().replace(/\.+$/, '').trim();
  if (!text) return null;
  const cx = newCx(ctx.cx);
  const fx = effects(text, cx);
  if (!fx) return null;
  c.i = c.tokens.length;
  return { effects: fx, slots: cx.slots };
}
