/** A seat is Random, or the id of one deck from the AI pool. */
export const AI_RANDOM = 'random';

/**
 * Resolve each AI seat when the game starts.
 * `random` (and any id that is not in `pool`) draws uniformly from `pool`,
 * skipping `avoid` when that deck id is one of several choices. `avoid` is the
 * human's deck id, so a custom list and a precon that share a name stay distinct.
 * A seat the player picked by id is used as picked, even when it is `avoid`.
 * If skipping `avoid` would leave nothing to draw, Random uses the full pool.
 * Draws are independent, so two Random seats can still share a deck.
 */
export function resolveAiDecks(choices: readonly string[], pool: readonly string[], rng: () => number = Math.random, avoid?: string): string[] {
  if (!pool.length) throw new Error('No decks available for AI opponents.');
  const open = avoid ? pool.filter(id => id !== avoid) : pool;
  const drawFrom = open.length ? open : pool;
  return choices.map(choice => {
    if (choice && choice !== AI_RANDOM && pool.includes(choice)) return choice;
    const i = Math.floor(rng() * drawFrom.length);
    return drawFrom[Math.min(drawFrom.length - 1, Math.max(0, i))]!;
  });
}

/** Deck ids an AI may play: starter decks, then precons and custom lists. Later groups do not repeat an id. */
export function buildAiPool(groups: readonly (readonly { id: string }[])[]): string[] {
  const ids: string[] = [];
  const seen = new Set<string>();
  for (const group of groups) for (const d of group) if (d?.id && !seen.has(d.id)) { seen.add(d.id); ids.push(d.id); }
  return ids;
}

/** Three seats, defaulting to Random. Unknown saved ids (a deleted deck) become Random. */
export function normalizeAiPicks(raw: unknown, valid: ReadonlySet<string>, seats = 3): string[] {
  const arr = Array.isArray(raw) ? raw : [];
  return Array.from({ length: seats }, (_, i) => {
    const v = arr[i];
    return typeof v === 'string' && v !== AI_RANDOM && valid.has(v) ? v : AI_RANDOM;
  });
}
