import { describe, it, expect } from 'vitest';
import { compileScry } from '../src/import/classify';
import type { ScryCard } from '../src/import/scryfall';
import { canBeCommander as importCanBeCommander } from '../src/import/deck';
import { draw, canCast, newGame, startGame, Game, Card, CARDS, registerCards, activate, canActivate, pass, alive, answerDecision, declareAttackers, declareBlockers, ctr, findCard, power, castSpell, validateDeck, canBeCommander, emblemsOf, layer, toughness, checkState } from '../src/engine/engine';
import type { CardDef } from '../src/engine/types';
import { aiAttack } from '../src/engine/ai';

let n = 0;
function card(name: string, type_line: string, mana_cost: string, oracle_text: string, o: Partial<ScryCard> = {}): CardDef {
  const cl = compileScry({ name, type_line, mana_cost, oracle_text, colors: [], color_identity: [], keywords: [], ...o });
  const d = { ...cl.def, id: `pw2-${++n}-${cl.def.id}` }; registerCards([d]);
  expect(cl.support, JSON.stringify(cl.unparsed)).toBe('auto');
  return d;
}
function setup(): Game {
  const g = newGame({ seed: 7, humans: [], skipAiMulligan: true });
  for (const p of g.players) { p.library.push(...p.hand); p.hand = []; }
  startGame(g); let i = 0; while (!(g.step === 'main1' && !g.stack.length && g.active === 0) && i++ < 80) { if (g.decision) answerDecision(g, false); else pass(g, g.priority!); }
  for (const p of g.players) { p.library.push(...p.hand); p.hand = []; p.battlefield = []; }
  return g;
}
function put(g: Game, pid: number, d: CardDef | string): Card {
  const c: Card = { uid: g.nextUid++, id: typeof d === 'string' ? d : d.id, owner: pid, tapped: false, sick: false, damage: 0, pp: 0, pt: 0 };
  const def = CARDS[c.id]; if (def.loyalty) c.counters = { loyalty: def.loyalty }; g.players[pid].battlefield.push(c); layer(g); return c;
}
function resolve(g: Game) { let i = 0; while ((g.stack.length || g.decision) && i++ < 200) { if (g.decision) answerDecision(g, false); else pass(g, g.priority!); } }
function passAll(g: Game) { const k = alive(g).length; for (let i = 0; i < k; i++) pass(g, g.priority!); }
function toAttack(g: Game) { let i = 0; while (g.awaiting !== 'attack' && i++ < 50) pass(g, g.priority!); }
function toEnd(g: Game) { let i = 0; while (g.awaiting === 'block' || (g.step !== 'main2' && i++ < 60)) { if (g.awaiting === 'block') for (const d of [1, 2, 3]) declareBlockers(g, d, []); else pass(g, g.priority!); } }
function resolveWith(g: Game, pick: (cards: number[]) => number[], may: boolean) { let i = 0; for (const p of g.players) p.human = true; while ((g.stack.length || g.decision) && i++ < 200) { const d = g.decision as { kind: string; cards?: Card[] } | undefined; if (d) answerDecision(g, d.kind === 'pick' ? pick((d.cards ?? []).map(c => c.uid)) as never : d.kind === 'may' ? may as never : false as never); else pass(g, g.priority!); } }
const BEAR = () => card('PW2 Bear', 'Creature — Bear', '{1}{G}', '', { power: '2', toughness: '2', colors: ['G'] });
const ROCK = () => card('PW2 Rock', 'Artifact', '{2}', '');
const BOLT = () => card('PW2 Zap', 'Instant', '{R}', 'PW2 Zap deals 1 damage to any target.');

describe('planeswalkers batch 2', () => {
  it("Narset: each opponent can't draw more than one card each turn", () => {
    const g = setup(); put(g, 0, card('Narset, Parter of Veils', 'Legendary Planeswalker — Narset', '{1}{U}{U}', "Each opponent can't draw more than one card each turn.\n−2: Look at the top four cards of your library. You may reveal a noncreature, nonland card from among them and put it into your hand. Put the rest on the bottom of your library in a random order.", { loyalty: '5' }));
    draw(g, 1, 3); expect(g.players[1].hand.length).toBe(1);
    draw(g, 0, 2); expect(g.players[0].hand.length).toBe(2); // controller unaffected
  });
  it('Teferi, Time Raveler: opponents cast only at sorcery speed; +1 lets you cast sorceries at instant speed', () => {
    const g = setup(); const t = put(g, 0, card('Teferi, Time Raveler', 'Legendary Planeswalker — Teferi', '{1}{W}{U}', "Each opponent can cast spells only any time they could cast a sorcery.\n+1: Until your next turn, you may cast sorcery spells as though they had flash.\n−3: Return up to one target artifact, creature, or enchantment to its owner's hand. Draw a card.", { loyalty: '4' }));
    const z = BOLT(); const c: Card = { uid: g.nextUid++, id: z.id, owner: 1, tapped: false, sick: false, damage: 0, pp: 0, pt: 0 }; g.players[1].hand.push(c);
    g.players[1].pool = ['R', 'R', 'R']; g.priority = 1; g.active = 0;
    expect(canCast(g, 1, c)).toBe(false); g.players[0].battlefield = g.players[0].battlefield.filter(x => x !== t); layer(g); expect(canCast(g, 1, c)).toBe(true); g.players[0].battlefield.push(t); layer(g);
    g.priority = 0; expect(activate(g, 0, t.uid, 0)).toBe(true); resolve(g); expect(g.players[0].flashSorc).toBeTruthy();
  });
  it("Liliana of the Veil −6: target player sacrifices one of two piles", () => {
    const g = setup(); const l = put(g, 0, card('Liliana of the Veil', 'Legendary Planeswalker — Liliana', '{1}{B}{B}', "+1: Each player discards a card.\n−2: Target player sacrifices a creature.\n−6: Separate all permanents target player controls into two piles. That player sacrifices all permanents in the pile of their choice.", { loyalty: '6' }));
    for (let i = 0; i < 4; i++) put(g, 1, BEAR());
    for (const p of g.players) p.human = true; expect(activate(g, 0, l.uid, 2, { targets: [{ player: 1 }] })).toBe(true); resolveWith(g, u => u.slice(0, 1), true);
    expect(g.players[1].battlefield.length).toBe(3); expect(g.players[1].graveyard.length).toBe(1);
  });
  it('Elspeth, Storm Slayer doubles tokens you create', () => {
    const g = setup(); const e = put(g, 0, card('Elspeth, Storm Slayer', 'Legendary Planeswalker — Elspeth', '{3}{W}{W}', "If one or more tokens would be created under your control, twice that many of those tokens are created instead.\n+1: Create a 1/1 white Soldier creature token.", { loyalty: '5' }));
    expect(activate(g, 0, e.uid, 0)).toBe(true); resolve(g);
    expect(g.players[0].battlefield.filter(c => c.token).length).toBe(2);
  });
  it('The Wandering Emperor: loyalty abilities at instant speed only the turn she entered', () => {
    const g = setup(); const w = put(g, 0, card('The Wandering Emperor', 'Legendary Planeswalker', '{2}{W}{W}', "Flash\nAs long as The Wandering Emperor entered this turn, you may activate her loyalty abilities any time you could cast an instant.\n+1: Put a +1/+1 counter on up to one target creature. It gains first strike until end of turn.", { loyalty: '3' }));
    g.players[0].battlefield = g.players[0].battlefield.filter(c => c !== w); w.enteredTurn = g.turn; g.players[0].battlefield.push(w);
    g.active = 1; g.priority = 0; expect(canActivate(g, 0, w, 0)).toBe(true);
    w.enteredTurn = g.turn - 1; expect(canActivate(g, 0, w, 0)).toBe(false);
  });
  it('Jace, Wielder of Mysteries: drawing from an empty library wins', () => {
    const g = setup(); put(g, 0, card('Jace, Wielder of Mysteries', 'Legendary Planeswalker — Jace', '{1}{U}{U}{U}', "If you would draw a card while your library has no cards in it, you win the game instead.\n+1: Target player mills two cards. Draw a card.", { loyalty: '4' }));
    g.players[0].library = []; draw(g, 0, 1);
    expect(alive(g).map(p => p.id)).toEqual([0]);
  });
  it('Ugin, the Spirit Dragon −X exiles colored permanents with mana value X or less only', () => {
    const g = setup(); const u = put(g, 0, card('Ugin, the Spirit Dragon', 'Legendary Planeswalker — Ugin', '{8}', "+2: Ugin, the Spirit Dragon deals 3 damage to any target.\n−X: Exile each permanent with mana value X or less that's one or more colors.\n−10: You gain 7 life, draw seven cards, then put up to seven permanent cards from your hand onto the battlefield.", { loyalty: '7' }));
    const b = put(g, 1, BEAR()); const r = put(g, 1, ROCK());
    expect(activate(g, 0, u.uid, 1, { x: 2 })).toBe(true); resolve(g);
    expect(findCard(g, b.uid)).toBeFalsy(); expect(findCard(g, r.uid)).toBeTruthy(); expect(ctr(u, 'loyalty')).toBe(5);
  });
  it('Tezzeret the Seeker −X searches for an artifact with mana value X or less', () => {
    const g = setup(); const t = put(g, 0, card('Tezzeret the Seeker', 'Legendary Planeswalker — Tezzeret', '{3}{U}{U}', "+1: Untap up to two target artifacts.\n−X: Search your library for an artifact card with mana value X or less, put it onto the battlefield, then shuffle.\n−5: Artifacts you control become artifact creatures with base power and toughness 5/5 until end of turn.", { loyalty: '4' }));
    const r = ROCK(); const ru = g.nextUid; g.players[0].library.push({ uid: g.nextUid++, id: r.id, owner: 0, tapped: false, sick: false, damage: 0, pp: 0, pt: 0 });
    for (const p of g.players) p.human = true; expect(activate(g, 0, t.uid, 1, { x: 2 })).toBe(true); resolveWith(g, u => { expect(u).toContain(ru); return [ru]; }, true);
    const rk = g.players[0].battlefield.find(c => c.id === r.id); expect(rk).toBeTruthy();
  });
  it("Liliana, Death's Majesty −3 reanimates as a black Zombie in addition", () => {
    const g = setup(); const l = put(g, 0, card("Liliana, Death's Majesty", 'Legendary Planeswalker — Liliana', '{3}{B}{B}', "+1: Create a 2/2 black Zombie creature token. Mill two cards.\n−3: Return target creature card from your graveyard to the battlefield. That creature is a black Zombie in addition to its other colors and types.\n−7: Destroy all non-Zombie creatures.", { loyalty: '5' }));
    const b = BEAR(); const bc: Card = { uid: g.nextUid++, id: b.id, owner: 0, tapped: false, sick: false, damage: 0, pp: 0, pt: 0 }; g.players[0].graveyard.push(bc);
    expect(activate(g, 0, l.uid, 1, { targets: [{ card: bc.uid }] })).toBe(true); resolve(g);
    const back = findCard(g, bc.uid)!; expect(back).toBeTruthy(); expect(back.addSub).toContain('Zombie'); expect(back.addColors).toContain('B');
  });
  it('Teferi, Hero of Dominaria −3 puts a permanent third from the top', () => {
    const g = setup(); const b = put(g, 1, BEAR());
    const t = put(g, 0, card('Teferi, Hero −3 test', 'Legendary Planeswalker — Teferi', '{3}{W}{U}', "−3: Put target nonland permanent into its owner's library third from the top.", { loyalty: '4' }));
    expect(activate(g, 0, t.uid, 0, { targets: [{ card: b.uid }] })).toBe(true); resolve(g);
    const L = g.players[1].library; expect(L[L.length - 3].uid).toBe(b.uid);
  });
  it('Amass creates an Army and grows it', () => {
    const g = setup(); const w = put(g, 0, card('Testamass, Walker', 'Legendary Planeswalker — Test', '{2}{B}', '−1: Amass Zombies 2.', { loyalty: '5' }));
    expect(activate(g, 0, w.uid, 0)).toBe(true); resolve(g);
    let army = g.players[0].battlefield.filter(c => c.token); expect(army.length).toBe(1); expect(ctr(army[0], '+1/+1')).toBe(2);
  });
  it('Player hexproof: opponents cannot target you', () => {
    const g = setup(); put(g, 0, card('Teyo Hexproof Test', 'Legendary Planeswalker — Teyo', '{2}{W}', 'You have hexproof.\n+1: You gain 1 life.', { loyalty: '5' }));
    const z = BOLT(); const c: Card = { uid: g.nextUid++, id: z.id, owner: 1, tapped: false, sick: false, damage: 0, pp: 0, pt: 0 }; g.players[1].hand.push(c);
    g.players[1].pool = ['R', 'R', 'R']; g.priority = 1; expect(castSpell(g, 1, c.uid, { targets: [{ player: 0 }] })).toBe(false);
    expect(castSpell(g, 1, c.uid, { targets: [{ player: 1 }] })).toBe(true);
  });
  it('Tokens with a quoted mana ability get that ability', () => {
    const g = setup(); const w = put(g, 0, card('Tokenmaker Walker', 'Legendary Planeswalker — Test', '{2}{G}', '+1: Create a 0/1 green Plant creature token with "{T}: Add {G}."', { loyalty: '3' }));
    expect(activate(g, 0, w.uid, 0)).toBe(true); resolve(g);
    const t = g.players[0].battlefield.find(c => c.token)!; expect(CARDS[t.id].mana?.length ?? CARDS[t.id].abilities?.length).toBeGreaterThan(0);
  });
});
