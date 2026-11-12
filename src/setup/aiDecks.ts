/** A seat is Random, or the id of one deck from the AI pool. */
export const AI_RANDOM = 'random';

/**
 * Resolve each AI seat when the game starts.
 * `random` (and any id that is not in `pool`) draws uniformly from `pool`.
 * A specific id that is in `pool` is used as picked. Draws are independent, so two seats can share a deck.
 */
export function resolveAiDecks(choices: readonly string[], pool: readonly string[], rng: () => number = Math.random): string[] {
  if (!pool.length) throw new Error('No decks available for AI opponents.');
  return choices.map(choice => {
    if (choice && choice !== AI_RANDOM && pool.includes(choice)) return choice;
    const i = Math.floor(rng() * pool.length);
    return pool[Math.min(pool.length - 1, Math.max(0, i))]!;
  });
}

/** Three seats, defaulting to Random. Unknown saved ids (a deleted deck) become Random. */
export function normalizeAiPicks(raw: unknown, valid: ReadonlySet<string>, seats = 3): string[] {
  const arr = Array.isArray(raw) ? raw : [];
  return Array.from({ length: seats }, (_, i) => {
    const v = arr[i];
    return typeof v === 'string' && v !== AI_RANDOM && valid.has(v) ? v : AI_RANDOM;
  });
}
