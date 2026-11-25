import { describe, expect, it } from 'vitest';
import { Card, Game, CARDS, def } from '../src/engine/engine';
import { groupTiles, pickFromStack, stackCaption, stackIdentity, crowdedCardWidth } from '../src/stacks';

const gob: Card = {
  id: 'x-goblin', uid: 1, owner: 0, token: true, tapped: false, sick: false, damage: 0,
} as Card;

function fakeGame(cards: Card[]): Game {
  return { turn: 1, players: [{ id: 0, battlefield: cards } as never] } as unknown as Game;
}

function goblin(uid: number, o: Partial<Card> = {}): Card {
  return { ...gob, uid, ...o };
}

// The grouping helpers only read def() for name/keywords via CARDS[id].
CARDS['x-goblin'] = { id: 'x-goblin', name: 'Goblin', types: ['Creature'], sub: ['Goblin'], colors: ['R'], cost: { generic: 0 }, text: '', power: 1, toughness: 1, token: true, keywords: [] } as never;

describe('token stacks', () => {
  it('stacks 30 identical goblins and reports tapped/untapped', () => {
    const cards = [
      ...Array.from({ length: 21 }, (_, i) => goblin(i + 1, { tapped: false })),
      ...Array.from({ length: 9 }, (_, i) => goblin(100 + i, { tapped: true })),
    ];
    const g = fakeGame(cards);
    const tiles = groupTiles(g, cards);
    expect(tiles).toHaveLength(1);
    expect(tiles[0].kind).toBe('stack');
    if (tiles[0].kind !== 'stack') return;
    expect(tiles[0].cards).toHaveLength(30);
    expect(stackCaption(g, tiles[0].cards)).toBe('Goblin ×30 · 21 untapped');
    const atk = pickFromStack(tiles[0].cards, 7);
    expect(atk).toHaveLength(7);
    expect(atk.every(c => !c.tapped)).toBe(true);
  });

  it('keeps non-identical creatures as separate tiles', () => {
    const a = goblin(1);
    const b = goblin(2, { damage: 1 });
    const c = goblin(3);
    const tiles = groupTiles(fakeGame([a, b, c]), [a, b, c]);
    expect(tiles.filter(t => t.kind === 'stack')).toHaveLength(1);
    expect(tiles.filter(t => t.kind === 'one')).toHaveLength(1);
  });

  it('does not stack nontoken creatures', () => {
    const a = goblin(1, { token: false });
    const b = goblin(2, { token: false });
    const tiles = groupTiles(fakeGame([a, b]), [a, b]);
    expect(tiles.every(t => t.kind === 'one')).toBe(true);
  });

  it('picks N of a stack preferring untapped', () => {
    const cards = [goblin(1, { tapped: true }), goblin(2), goblin(3), goblin(4, { tapped: true })];
    const picked = pickFromStack(cards, 2);
    expect(picked.map(c => c.uid).sort()).toEqual([2, 3]);
  });

  it('shrinks card width as the board gets crowded but stays at a minimum', () => {
    expect(crowdedCardWidth('10.5vh', 4, false)).toBe('10.5vh');
    const crowded = parseInt(crowdedCardWidth('10.5vh', 30, false), 10);
    expect(crowded).toBeGreaterThanOrEqual(52);
    expect(crowded).toBeLessThan(96);
    const phone = parseInt(crowdedCardWidth('72px', 40, true), 10);
    expect(phone).toBeGreaterThanOrEqual(40);
  });

  it('gives different identities when P/T or counters differ', () => {
    const a = goblin(1);
    const b = goblin(2, { counters: { '+1/+1': 1 } });
    const g = fakeGame([a, b]);
    expect(stackIdentity(g, a)).not.toBe(stackIdentity(g, b));
  });
});
