import { describe, it, expect } from 'vitest';
import { compileScry } from '../src/import/classify';
import type { ScryCard } from '../src/import/scryfall';
import { canBeCommander as importCanBeCommander } from '../src/import/deck';
import { newGame, startGame, Game, Card, CARDS, registerCards, activate, canActivate, pass, alive, answerDecision, declareAttackers, declareBlockers, ctr, findCard, power, castSpell, validateDeck, canBeCommander, emblemsOf, layer, toughness, checkState } from '../src/engine/engine';
import type { CardDef } from '../src/engine/types';
import { aiAttack } from '../src/engine/ai';

let n = 0;
function card(name: string, type_line: string, mana_cost: string, oracle_text: string, o: Partial<ScryCard> = {}): CardDef {
  const cl = compileScry({ name, type_line, mana_cost, oracle_text, colors: [], color_identity: [], keywords: [], ...o });
  const d = { ...cl.def, id: `pw-${++n}-${cl.def.id}` }; registerCards([d]);
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
const BEAR = () => card('PW Bear', 'Creature — Bear', '{1}{G}', '', { power: '2', toughness: '2' });
const TRAMPLE = () => card('PW Trampler', 'Creature — Beast', '{4}{G}', 'Trample', { power: '5', toughness: '5', keywords: ['Trample'] });
const WALKER = () => card('Testa, Planeswalker', 'Legendary Planeswalker — Testa', '{2}{R}{R}', '+1: Testa, Planeswalker deals 1 damage to each opponent.\n-2: Testa, Planeswalker deals 3 damage to any target.\n-7: You get an emblem with "Creatures you control get +2/+2 and have flying."', { loyalty: '3' });

describe('planeswalkers', () => {
  it('enters with printed loyalty and +1 adds loyalty, once per turn', () => {
    const g = setup(); const d = WALKER(); expect(d.loyalty).toBe(3);
    const w = put(g, 0, d); expect(ctr(w, 'loyalty')).toBe(3);
    expect(activate(g, 0, w.uid, 0)).toBe(true); expect(ctr(w, 'loyalty')).toBe(4); resolve(g);
    expect(canActivate(g, 0, w, 1)).toBe(false); // one loyalty ability per turn
  });
  it("minus can't exceed loyalty; -7 needs 7", () => {
    const g = setup(); const w = put(g, 0, WALKER());
    expect(canActivate(g, 0, w, 2)).toBe(false); expect(canActivate(g, 0, w, 1)).toBe(true);
  });
  it('loyalty abilities are sorcery speed', () => {
    const g = setup(); const w = put(g, 0, WALKER()); const b = put(g, 0, BEAR());
    toAttack(g); declareAttackers(g, 0, [{ uid: b.uid, defender: 1 }]); expect(canActivate(g, 0, w, 0)).toBe(false);
  });
  it('0 loyalty -> graveyard (SBA); damage removes loyalty; any target can hit walkers', () => {
    const g = setup(); const w = put(g, 1, WALKER()); const mine = put(g, 0, WALKER());
    expect(activate(g, 0, mine.uid, 1, { targets: [{ card: w.uid }] })).toBe(true); resolve(g);
    expect(findCard(g, w.uid)).toBeUndefined(); expect(g.players[1].graveyard.some(c => c.uid === w.uid)).toBe(true);
    expect(ctr(mine, 'loyalty')).toBe(1);
  });
  it('legend rule applies to planeswalkers', () => {
    const g = setup(); const d = WALKER(); put(g, 0, d); put(g, 0, d); checkState(g);
    expect(g.players[0].battlefield.filter(c => c.id === d.id).length).toBe(1);
  });
  it('creatures can attack a planeswalker; unblocked damage removes loyalty, not life', () => {
    const g = setup(); const w = put(g, 1, WALKER()); const b = put(g, 0, BEAR()); const life = g.players[1].life;
    toAttack(g); declareAttackers(g, 0, [{ uid: b.uid, defender: 1, pw: w.uid }]); expect(b.atkPw).toBe(w.uid);
    toEnd(g); expect(ctr(w, 'loyalty')).toBe(1); expect(g.players[1].life).toBe(life);
  });
  it('trample over a blocker carries onto the planeswalker', () => {
    const g = setup(); const w = put(g, 1, card('Big Walker', 'Legendary Planeswalker — Big', '{4}', '+1: You gain 1 life.', { loyalty: '6' })); const t = put(g, 0, TRAMPLE()); const blk = put(g, 1, BEAR());
    toAttack(g); declareAttackers(g, 0, [{ uid: t.uid, defender: 1, pw: w.uid }]);
    let i = 0; while (g.awaiting !== 'block' && i++ < 20) pass(g, g.priority!);
    declareBlockers(g, 1, [{ blocker: blk.uid, attacker: t.uid }]); toEnd(g);
    expect(ctr(w, 'loyalty')).toBe(3); // 5 power - 2 lethal to the bear = 3 to the walker
  });
  it('emblems: static anthem from an ultimate', () => {
    const g = setup(); const w = put(g, 0, WALKER()); w.counters!.loyalty = 8; const b = put(g, 0, BEAR());
    expect(activate(g, 0, w.uid, 2)).toBe(true); resolve(g);
    expect(emblemsOf(g.players[0]).length).toBe(1); layer(g); expect(power(g, b)).toBe(4); expect(toughness(g, b)).toBe(4);
  });
  it('emblems: triggered ability', () => {
    const g = setup(); const d = card('Trig Walker', 'Legendary Planeswalker — Trig', '{3}', '-1: You get an emblem with "At the beginning of your upkeep, you gain 5 life."', { loyalty: '3' });
    const w = put(g, 0, d); activate(g, 0, w.uid, 0); resolve(g); expect(emblemsOf(g.players[0]).length).toBe(1);
    const life = g.players[0].life; let i = 0; while (!(g.active === 0 && g.step === 'main1' && g.turn > 1) && i++ < 400) { if (g.awaiting === 'attack') declareAttackers(g, g.active, []); else if (g.awaiting === 'block') for (const p of [0, 1, 2, 3]) declareBlockers(g, p, []); else if (g.decision) answerDecision(g, false); else pass(g, g.priority!); }
    expect(g.players[0].life).toBeGreaterThanOrEqual(life + 5);
  });
  it('gain control of target creature', () => {
    const g = setup(); const d = card('Thief Walker', 'Legendary Planeswalker — Thief', '{3}', '-3: Gain control of target creature.', { loyalty: '4' });
    const w = put(g, 0, d); const b = put(g, 1, BEAR()); expect(activate(g, 0, w.uid, 0, { targets: [{ card: b.uid }] })).toBe(true); resolve(g);
    expect(g.players[0].battlefield.includes(b)).toBe(true); expect(b.realOwner).toBe(1);
  });
  it('becomes a creature until end of turn with damage prevented', () => {
    const g = setup(); const d = card('Gideon Testo', 'Legendary Planeswalker — Gideon', '{2}{W}{W}', '0: Until end of turn, Gideon Testo becomes a 5/5 Human Soldier creature with indestructible that\'s still a planeswalker. Prevent all damage that would be dealt to him this turn.', { loyalty: '4' });
    const w = put(g, 0, d); activate(g, 0, w.uid, 0); resolve(g); expect(power(g, w)).toBe(5);
  });
  it('"can be your commander" walkers are legal commanders', () => {
    const d = card('Cmdr Walker', 'Legendary Planeswalker — Cmdr', '{2}{G}', '+1: You gain 1 life.\nCmdr Walker can be your commander.', { loyalty: '3' });
    expect(canBeCommander(d)).toBe(true);
    expect(validateDeck({ name: 'x', commander: d.id, cards: [] } as never).some(e => /commander must/.test(e))).toBe(false);
    expect(importCanBeCommander({ name: 'Cmdr Walker', type_line: 'Legendary Planeswalker — Cmdr', oracle_text: 'Cmdr Walker can be your commander.' } as ScryCard)).toBe(true);
    const plain = card('Plain Walker', 'Legendary Planeswalker — Plain', '{2}', '+1: You gain 1 life.', { loyalty: '3' }); expect(canBeCommander(plain)).toBe(false);
  });
  it('AI attacks a planeswalker it can kill', () => {
    const g = setup(); const w = put(g, 1, WALKER()); w.counters!.loyalty = 2; const b = put(g, 0, BEAR());
    for (const p of g.players.slice(1)) p.life = 40;
    toAttack(g); aiAttack(g, 0); expect(b.atkPw).toBe(w.uid);
  });
});
void castSpell;
