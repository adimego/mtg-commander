import { describe, expect, it } from 'vitest';
import { CARDS, answerDecision, cmc, def, maxHandSize, newGame, pass, registerCards, type Game } from '../src/engine/engine';
import type { CardDef } from '../src/engine/types';

function reachCleanup(g: Game) {
  g.started = true;
  g.step = 'end';
  g.stack = [];
  g.pending = [];
  g.choice = null;
  g.decision = null;
  g.res = null;
  g.awaiting = null;
  g.priority = g.active;
  g.passes = 0;
  const seats = g.players.filter(p => !p.lost).length;
  for (let i = 0; i < seats && g.step === 'end' && !g.decision; i++) pass(g, g.priority!);
}

function grip(g: Game, pid: number, n: number) {
  const p = g.players[pid];
  while (p.hand.length < n) {
    const c = p.library.pop();
    if (!c) break;
    p.hand.push(c);
  }
}

describe('cleanup hand-size discard', () => {
  it('asks the human to discard exactly the extra cards', () => {
    const g = newGame({ seed: 3, humans: [0], skipAiMulligan: true });
    grip(g, 0, 9);
    const before = g.players[0].hand.map(c => c.uid);
    reachCleanup(g);
    expect(g.step).toBe('cleanup');
    expect(g.decision?.key).toBe('cleanupDiscard');
    expect(g.decision?.kind).toBe('pick');
    if (g.decision?.kind !== 'pick') throw new Error('expected a pick');
    expect(g.decision.min).toBe(2);
    expect(g.decision.max).toBe(2);
    expect(g.decision.text).toBe('Discard 2 cards (hand size 7).');
    expect(g.players[0].hand.map(c => c.uid)).toEqual(before);
  });

  it('discards only the cards the human confirms, through the normal discard', () => {
    const g = newGame({ seed: 4, humans: [0], skipAiMulligan: true });
    const watcher: CardDef = {
      id: 'cleanup-discard-watch', name: 'Discard Watcher', types: ['Creature'], cost: { generic: 1 }, colors: [], text: 'Whenever you discard a card, you draw a card.', power: 1, toughness: 1,
      triggers: [{ on: 'x', ev: 'discard', subj: 'any', pl: 'you', label: 'you draw a card', effects: [{ op: 'draw', n: 1 }] }],
    };
    registerCards([watcher]);
    g.players[0].battlefield.push({ uid: g.nextUid++, id: watcher.id, owner: 0, tapped: false, sick: false, damage: 0, pp: 0, pt: 0 });
    grip(g, 0, 9);
    const [a, b] = g.players[0].hand;
    reachCleanup(g);
    expect(answerDecision(g, [a.uid])).toBe(false);
    expect(g.decision?.key).toBe('cleanupDiscard');
    expect(g.players[0].hand).toContain(a);
    expect(answerDecision(g, [a.uid, b.uid])).toBe(true);
    expect(g.players[0].graveyard).toEqual(expect.arrayContaining([a, b]));
    expect(g.players[0].hand).not.toContain(a);
    expect(g.players[0].hand).not.toContain(b);
    expect(a.discarded).toBe(g.turn);
    expect(g.players[0].discN).toBeGreaterThanOrEqual(2);
    expect(g.log.some(l => l.includes(`discards ${CARDS[a.id].name}`))).toBe(true);
    expect(g.stack.some(s => s.label.includes('you draw a card')) || g.pending.some(p => p.trig.label.includes('you draw a card'))).toBe(true);
  });

  it('lets an AI discard the highest mana value cards on its own', () => {
    const g = newGame({ seed: 5, humans: [], skipAiMulligan: true });
    const p = g.players[0];
    p.library.push(...p.hand);
    p.hand = [];
    grip(g, 0, 9);
    const extra = [...p.hand].sort((a, b) => cmc(def(b)) - cmc(def(a))).slice(0, p.hand.length - 7);
    reachCleanup(g);
    expect(g.decision).toBeNull();
    expect(p.hand.length).toBeLessThanOrEqual(7);
    for (const c of extra) expect(p.graveyard).toContain(c);
  });

  it('does not discard when a permanent or emblem removes the maximum', () => {
    const tower: CardDef = { id: 'cleanup-tower', name: 'Reliquary Tower', types: ['Land'], cost: { generic: 0 }, colors: [], text: 'You have no maximum hand size.', statics: [{ k: 'noMaxHand', who: 'self' }] };
    const book: CardDef = { id: 'cleanup-spellbook', name: 'Spellbook', types: ['Emblem'], cost: { generic: 0 }, colors: [], text: 'You have no maximum hand size.', statics: [{ k: 'noMaxHand', who: 'self' }] };
    const land: CardDef = { id: 'cleanup-extra-land', name: 'Extra Land', types: ['Enchantment'], cost: { generic: 0 }, colors: [], text: 'You may play an additional land.', statics: [{ k: 'noMaxHand', who: 'self', n: -1 }] };
    registerCards([tower, book, land]);
    const g = newGame({ seed: 6, humans: [0], skipAiMulligan: true });
    grip(g, 0, 9);
    g.players[0].battlefield.push({ uid: g.nextUid++, id: tower.id, owner: 0, tapped: false, sick: false, damage: 0, pp: 0, pt: 0 });
    expect(maxHandSize(g.players[0])).toBe(99);
    reachCleanup(g);
    expect(g.decision).toBeNull();
    expect(g.players[0].hand.length).toBe(9);

    const h = newGame({ seed: 7, humans: [0], skipAiMulligan: true });
    grip(h, 0, 10);
    h.players[0].emblems = [{ uid: h.nextUid++, id: book.id, owner: 0, tapped: false, sick: false, damage: 0, pp: 0, pt: 0 }];
    expect(maxHandSize(h.players[0])).toBe(99);
    reachCleanup(h);
    expect(h.decision).toBeNull();
    expect(h.players[0].hand.length).toBe(10);

    const extra = newGame({ seed: 8, humans: [0], skipAiMulligan: true });
    grip(extra, 0, 9);
    extra.players[0].battlefield.push({ uid: extra.nextUid++, id: land.id, owner: 0, tapped: false, sick: false, damage: 0, pp: 0, pt: 0 });
    expect(maxHandSize(extra.players[0])).toBe(7);
    reachCleanup(extra);
    expect(extra.decision?.text).toBe('Discard 2 cards (hand size 7).');
  });
});
