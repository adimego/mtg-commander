import { describe, expect, it } from 'vitest';
import { AI_RANDOM, buildAiPool, normalizeAiPicks, resolveAiDecks } from '../src/setup/aiDecks';
import { DECKS, newGame, resolveCommanders, type DeckDef } from '../src/engine/engine';

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

  it('never gives a Random seat the deck the human selected', () => {
    const rng = mulberry32(0xC0FFEE);
    const seen = new Set<string>();
    for (let n = 0; n < 400; n++) {
      const drawn = resolveAiDecks([AI_RANDOM, AI_RANDOM, AI_RANDOM], pool, rng, 'wakanda');
      for (const id of drawn) {
        expect(id).not.toBe('wakanda');
        seen.add(id);
      }
    }
    expect([...seen].sort()).toEqual(['avengers', 'namor', 'zurgo']);
  });

  it('still draws a precon when the human\'s saved deck only shares its name', () => {
    const ids = ['precon-wakanda', 'custom-wakanda', 'avengers'];
    const rng = mulberry32(7);
    const seen = new Set<string>();
    for (let n = 0; n < 200; n++) seen.add(resolveAiDecks([AI_RANDOM], ids, rng, 'custom-wakanda')[0]!);
    expect(seen.has('custom-wakanda')).toBe(false);
    expect([...seen].sort()).toEqual(['avengers', 'precon-wakanda']);
  });

  it('keeps an explicit pick of the human\'s deck', () => {
    expect(resolveAiDecks(['wakanda', AI_RANDOM], pool, () => 0, 'wakanda')).toEqual(['wakanda', 'avengers']);
  });

  it('falls back to the only deck when that is the one the human selected', () => {
    expect(resolveAiDecks([AI_RANDOM, AI_RANDOM, AI_RANDOM], ['only'], () => 0.9, 'only')).toEqual(['only', 'only', 'only']);
  });
});

/** Deterministic [0, 1) source so a long Random sample is repeatable. */
function mulberry32(seed: number) {
  return () => {
    seed = seed + 0x6D2B79F5 | 0;
    let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

describe('starter decks in the AI pool', () => {
  const starters = DECKS.slice(0, 4);
  const pool = buildAiPool([starters, [{ id: 'precon-demo' }]]);

  it('puts every starter deck in the random pool and still skips the player deck', () => {
    expect(pool.slice(0, 4)).toEqual(['isperia', 'judith', 'ruric', 'benton']);
    const rng = mulberry32(99);
    const seen = new Set<string>();
    for (let n = 0; n < 600; n++) seen.add(resolveAiDecks([AI_RANDOM], pool, rng, 'isperia')[0]!);
    expect(seen.has('isperia')).toBe(false);
    for (const id of ['judith', 'ruric', 'benton', 'precon-demo']) expect(seen.has(id)).toBe(true);
  });

  it('keeps an explicit starter pick and remembers it', () => {
    expect(resolveAiDecks(['judith', AI_RANDOM], pool, () => 0, 'isperia')).toEqual(['judith', 'judith']);
    expect(normalizeAiPicks(['benton', 'deleted'], new Set(pool), 2)).toEqual(['benton', AI_RANDOM]);
  });

  it('names the starter deck on that AI seat', () => {
    const g = newGame({ seed: 1, humans: [0], decks: ['isperia', 'judith', 'ruric', 'benton'], skipAiMulligan: true });
    expect(g.players[1].human).toBe(false);
    expect(g.players[1].deckName).toBe('Rakdos Scourge (BR)');
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
