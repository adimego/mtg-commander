import { describe, expect, it } from 'vitest';
import { AI_RANDOM, normalizeAiPicks, resolveAiDecks } from '../src/setup/aiDecks';
import { resolveCommanders, type DeckDef } from '../src/engine/engine';

const pool = ['avengers', 'wakanda', 'namor', 'zurgo'];

describe('resolveAiDecks', () => {
  it('keeps a specific deck and draws Random uniformly from the pool', () => {
    const seq = [0, 0.5, 0.999];
    let n = 0;
    const rng = () => seq[n++]!;
    // index floor(0 * 4) = 0, floor(0.5 * 4) = 2. The picked seat does not draw.
    expect(resolveAiDecks(['wakanda', AI_RANDOM, AI_RANDOM], pool, rng)).toEqual(['wakanda', 'avengers', 'namor']);
    expect(rng()).toBeCloseTo(0.999);
  });

  it('treats a missing, empty, or deleted id as Random', () => {
    expect(resolveAiDecks(['', 'gone', AI_RANDOM], ['only'], () => 0)).toEqual(['only', 'only', 'only']);
  });

  it('allows two seats to roll the same deck', () => {
    expect(resolveAiDecks([AI_RANDOM, AI_RANDOM], ['a', 'b'], () => 0)).toEqual(['a', 'a']);
  });

  it('refuses to start when the pool is empty', () => {
    expect(() => resolveAiDecks([AI_RANDOM], [], () => 0)).toThrow(/No decks/);
  });
});

describe('normalizeAiPicks', () => {
  const valid = new Set(['avengers', 'namor']);
  it('defaults each seat to Random and drops ids that are not in the pool', () => {
    expect(normalizeAiPicks(null, valid)).toEqual([AI_RANDOM, AI_RANDOM, AI_RANDOM]);
    expect(normalizeAiPicks(['avengers', 'deleted', 3], valid)).toEqual(['avengers', AI_RANDOM, AI_RANDOM]);
  });
});

describe('AI commander when the deck lists several', () => {
  const deck: DeckDef = { id: 'ff', name: 'Fantastic Four', commander: 'invisible-woman', extra: ['mister-fantastic', 'human-torch', 'the-thing'], cards: [] };
  it('uses the deck main commander when the seat did not pick one', () => {
    expect(resolveCommanders(deck).commanders).toEqual(['invisible-woman']);
    expect(resolveCommanders(deck, 'human-torch').commanders).toEqual(['human-torch']);
  });
});
