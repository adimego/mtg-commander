import { describe, it, expect } from 'vitest';
import { compileScry } from '../src/import/classify';
import type { ScryCard } from '../src/import/scryfall';
import { def, newGame, startGame, Game, Card, CARDS, registerCards, activate, pass, alive, answerDecision, declareAttackers, ctr, findCard, power, toughness, castSpell, canCast, canBeCommander, emblemsOf, layer, checkState, destroy, isType, hasKw, chooseTriggerTargets, canBeAttackedPw, tapForMana, offBfEff, flushTriggers, prepCopyOf, loseLife } from '../src/engine/engine';
import type { CardDef } from '../src/engine/types';
import '../src/engine/ai';
let n = 0;
function card(name: string, type_line: string, mana_cost: string, oracle_text: string, o: Partial<ScryCard> = {}): CardDef {
  const cl = compileScry({ name, type_line, mana_cost, oracle_text, colors: [], color_identity: [], keywords: [], ...o });
  const d = { ...cl.def, id: `s1-${++n}-${cl.def.id}` }; registerCards([d]);
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
const mk = (g: Game, pid: number, d: CardDef): Card => { const c: Card = { uid: g.nextUid++, id: d.id, owner: pid, tapped: false, sick: false, damage: 0, pp: 0, pt: 0 }; offBfEff(c); return c; };
function put(g: Game, pid: number, d: CardDef): Card { const c = mk(g, pid, d); if (d.loyalty) c.counters = { loyalty: d.loyalty }; g.players[pid].battlefield.push(c); layer(g); return c; }
interface RunOpt { pick?: (u: number[]) => number[]; may?: boolean; tgt?: () => object; cast?: boolean; color?: string }
/** Resolve everything with every player human, answering decisions via opts. */
function run(g: Game, o: RunOpt = {}) {
  for (const p of g.players) p.human = true; let i = 0;
  while ((g.stack.length || g.decision || g.choice) && i++ < 300) {
    if (g.choice) { expect(chooseTriggerTargets(g, [o.tgt!() as never])).toBe(true); continue; }
    const d = g.decision as { kind: string; cards?: Card[] } | null;
    if (d) answerDecision(g, (d.kind === 'pick' ? (o.pick ?? (u => u.slice(0, 1)))((d.cards ?? []).map(c => c.uid)) : d.kind === 'may' ? !!o.may : d.kind === 'cast' ? !!o.cast : d.kind === 'color' ? o.color ?? 'R' : false) as never);
    else pass(g, g.priority!);
  }
}
function resolveAI(g: Game) { let i = 0; while ((g.stack.length || g.decision) && i++ < 300) { if (g.decision) answerDecision(g, false); else pass(g, g.priority!); } }
const BEAR = () => card('PW3 Bear', 'Creature — Bear', '{1}{G}', '', { power: '2', toughness: '2', colors: ['G'] });
const FLYER = () => card('PW3 Bird', 'Creature — Bird', '{1}{U}', 'Flying', { power: '1', toughness: '1', colors: ['U'], keywords: ['Flying'] });
const VAMP = () => card('PW3 Vamp', 'Creature — Vampire', '{B}', '', { power: '1', toughness: '1', colors: ['B'] });
const ROCK = () => card('PW3 Rock', 'Artifact', '{2}', '');
const ZAP = () => card('PW3 Zap', 'Instant', '{R}', 'PW3 Zap deals 1 damage to any target.');
const FOREST = () => card('Forest', 'Basic Land — Forest', '', '({T}: Add {G}.)');
const INSECT = () => card('PW3 Beetle', 'Creature — Insect', '{G}', '', { power: '1', toughness: '1', colors: ['G'] });
const top = (g: Game, pid: number, d: CardDef) => { const c = mk(g, pid, d); g.players[pid].library.push(c); return c; };
/** pass priority until pred holds (turns advance; AI players act) */
function until(g: Game, pred: () => boolean, max = 800) { for (const p of g.players) p.human = false; let i = 0; while (!pred() && i++ < max) { if (g.decision) answerDecision(g, false); else pass(g, g.priority!); } return pred(); }

const pool = (g: Game, m: string[]) => { g.players[0].pool = m; g.priority = 0; };
const castFromHand = (g: Game, d: CardDef, m: string[], o = {}) => { const c = mk(g, 0, d); g.players[0].hand.push(c); pool(g, m); expect(castSpell(g, 0, c.uid, o)).toBe(true); resolveAI(g); return c; };
const W1 = () => card('Bygone Colossus', 'Artifact Creature — Robot Giant', '{9}', 'Warp {3} (You may cast this card from your hand for its warp cost. Exile this creature at the beginning of the next end step, then you may cast it from exile on a later turn.)', { power: '9', toughness: '9' });

describe('newest sets: mechanics', () => {
  it('Warp: cast for the warp cost, exiled at end step, castable from exile only on a later turn', () => {
    const g = setup(); const d = W1();
    const c = castFromHand(g, d, ['C', 'C', 'C'], { warp: true });
    expect(g.players[0].battlefield.some(x => x.uid === c.uid)).toBe(true);
    const t0 = g.turn;
    expect(until(g, () => g.players[0].exile.some(x => x.uid === c.uid))).toBe(true);
    const x = g.players[0].exile.find(y => y.uid === c.uid)!;
    expect(g.turn).toBe(t0);
    g.players[0].pool = Array(9).fill('C'); g.priority = 0;
    expect(canCast(g, 0, x)).toBe(false);
    g.step = 'main1'; g.active = 0; expect(canCast(g, 0, x)).toBe(false);
    g.turn++; expect(canCast(g, 0, x)).toBe(true);
    expect(canCast(g, 0, x, { warp: true })).toBe(false);
  });
  it('Warp cost only from hand; void: a nonland permanent left / spell warped this turn', () => {
    const g = setup(); const v = card('S1 Void', 'Creature — Drix', '{1}{B}', 'Void — At the beginning of your end step, if a nonland permanent left the battlefield this turn or a spell was warped this turn, draw a card.', { power: '1', toughness: '1' });
    expect(def(put(g, 0, v)).triggers?.[0].ifc?.k).toBe('void');
    const c = castFromHand(g, W1(), ['C', 'C', 'C'], { warp: true }); expect(g.warpTurn).toBe(g.turn); expect(c).toBeTruthy();
  });
  it('Lander token preset searches for a basic land tapped', () => {
    const g = setup(); const s = card('Seedship Agrarian', 'Creature — Insect Scientist', '{3}{G}', 'When this creature enters, create a Lander token. (It\'s an artifact with "{2}, {T}, Sacrifice this token: Search your library for a basic land card, put it onto the battlefield tapped, then shuffle.")', { power: '3', toughness: '3' });
    castFromHand(g, s, ['G', 'G', 'G', 'G']); const lands0 = g.players[0].battlefield.filter(x => isType(x, 'Land')).length;
    const l = g.players[0].battlefield.find(x => isType(x, 'Artifact'))!; expect(l).toBeTruthy(); pool(g, ['C', 'C']);
    expect(activate(g, 0, l.uid, 0)).toBe(true); run(g, { pick: u => u.slice(0, 1) });
    const nl = g.players[0].battlefield.filter(x => isType(x, 'Land')); expect(nl.length).toBe(lands0 + 1); expect(nl.every(x => x.tapped)).toBe(true); expect(g.players[0].battlefield.includes(l)).toBe(false);
  });
  it('Saddle: taps other creatures at sorcery speed; "attacks while saddled" checks the flag', () => {
    const g = setup(); const m = put(g, 0, card('Brightfield Mustang', 'Creature — Horse Mount', '{3}{W}', 'Whenever this creature attacks while saddled, untap it and put a +1/+1 counter on it.\nSaddle 1 (Tap any number of other creatures you control with total power 1 or more: This Mount becomes saddled until end of turn. Saddle only as a sorcery.)', { power: '3', toughness: '3' }));
    const b = put(g, 0, BEAR()); g.priority = 0;
    expect(def(m).triggers?.[0].ifc?.k).toBe('saddled');
    expect(activate(g, 0, m.uid, 0)).toBe(true); resolveAI(g);
    expect(b.tapped).toBe(true); expect(m.saddled).toBe(g.turn); expect(m.tapped).toBe(false);
  });
  it('Opponents control eight or more lands: enters tapped unless', () => {
    const g = setup(); const l = card('S1 Land', 'Land', '', 'This land enters tapped unless your opponents control eight or more lands.\n{T}: Add {G}.');
    expect(def(put(g, 0, l)).etbTapped || def(put(g, 0, l)).etbTappedUnless).toBeTruthy();
  });
  it('Prepared: enters prepared, a castable copy of its spell appears; casting it unprepares', () => {
    const g = setup(); const cl = compileScry({ name: 'Adventurous Eater // Have a Bite', type_line: 'Creature — Human Warlock // Sorcery', mana_cost: '{2}{B} // {B}', layout: 'prepare', colors: [], color_identity: [], keywords: [], card_faces: [{ name: 'Adventurous Eater', mana_cost: '{2}{B}', type_line: 'Creature — Human Warlock', oracle_text: "This creature enters prepared. (While it's prepared, you may cast a copy of its spell. Doing so unprepares it.)", power: '3', toughness: '2' }, { name: 'Have a Bite', mana_cost: '{B}', type_line: 'Sorcery', oracle_text: 'Put a +1/+1 counter on target creature. You gain 1 life.' }] } as never);
    expect(cl.support).toBe('auto'); registerCards([cl.def, ...(cl.def.prepDef ? [cl.def.prepDef] : [])]);
    const c = castFromHand(g, cl.def, ['B', 'B', 'B']);
    expect(c.prepared).toBe(true); layer(g);
    const cp = prepCopyOf(g, c)!; expect(cp).toBeTruthy();
    pool(g, ['B']); const life = g.players[0].life;
    expect(castSpell(g, 0, cp.uid, { card: c.uid })).toBe(true); resolveAI(g);
    expect(c.prepared).toBeFalsy(); expect(ctr(c, '+1/+1')).toBe(1); expect(g.players[0].life).toBe(life + 1);
  });
  it('Empower Jace N creates a Jace token planeswalker with N loyalty', () => {
    const g = setup(); castFromHand(g, card("Protege's Awakening", 'Sorcery', '{3}{U}', 'Empower Jace 6. (Put six loyalty counters on a Jace token you control. If you don\'t control one, first create a blue Jace planeswalker token with "[−1]: Surveil 1" and "[−3]: Draw a card.")\nDraw a card.'), ['U', 'U', 'U', 'U']);
    const j = g.players[0].battlefield.find(x => isType(x, 'Planeswalker'))!; expect(j).toBeTruthy(); expect(ctr(j, 'loyalty')).toBe(6);
  });
  it('Station: tapping a creature adds charge counters; at the threshold it becomes an artifact creature with the listed keywords', () => {
    const g = setup(); const s = put(g, 0, card('Wedgelight Rammer', 'Artifact — Spacecraft', '{3}{W}', 'When this Spacecraft enters, create a 2/2 colorless Robot artifact creature token.\nStation (Tap another creature you control: Put charge counters equal to its power on this Spacecraft. Station only as a sorcery. It\'s an artifact creature at 9+.)\n9+ | Flying, first strike', { power: '3', toughness: '4' }));
    const big = put(g, 0, card('S1 Giant', 'Creature — Giant', '{5}', '', { power: '9', toughness: '9' })); g.priority = 0;
    expect(isType(s, 'Creature')).toBe(false);
    const i = def(s).abilities!.findIndex(a => a.station); expect(activate(g, 0, s.uid, i)).toBe(true); resolveAI(g); layer(g);
    expect(big.tapped).toBe(true); expect(ctr(s, 'charge')).toBe(9); expect(isType(s, 'Creature')).toBe(true); expect(hasKw(s, 'flying')).toBe(true);
  });
  it('Mobilize: attack creates a tapped attacking Warrior that is sacrificed at end step', () => {
    const g = setup(); const z = put(g, 0, card('Zurgo Stormrender', 'Legendary Creature — Orc Warrior', '{R}{W}{B}', 'Mobilize 1 (Whenever this creature attacks, create a tapped and attacking 1/1 red Warrior creature token. Sacrifice it at the beginning of the next end step.)', { power: '3', toughness: '3' }));
    expect(def(z).triggers?.[0].ev).toBe('attacks'); expect(def(z).triggers?.[0].effects.some(e => e.op === 'delaySac')).toBe(true);
  });
  it('Firebending: compiles to an attack trigger adding {R} that lasts through combat', () => {
    const g = setup(); const f = put(g, 0, card('Fire Sages', 'Creature — Human Cleric', '{1}{R}', 'Firebending 1 (Whenever this creature attacks, add {R}. This mana lasts until end of combat.)\n{1}{R}{R}: Put a +1/+1 counter on this creature.', { power: '2', toughness: '2' }));
    expect(def(f).triggers?.[0].effects.some(e => e.op === 'fireMana')).toBe(true);
  });
  it('Start your engines!: speed starts at 1 and rises once per turn when an opponent loses life (max 4); "your speed" amount', () => {
    const g = setup(); put(g, 0, card('Momentum Breaker', 'Enchantment', '{1}{B}', 'Start your engines! (If you have no speed, it starts at 1. It increases once on each of your turns when an opponent loses life. Max speed is 4.)\n{2}, Sacrifice this enchantment: You gain life equal to your speed.'));
    expect(g.players[0].speed).toBe(1); g.active = 0;
    loseLife(g, 1, 2); loseLife(g, 2, 2); expect(g.players[0].speed).toBe(2);
  });
  it('Job select: an Equipment creates a Hero token and attaches to it', () => {
    const g = setup(); castFromHand(g, card("Monk's Fist", 'Artifact — Equipment', '{2}', 'Job select (When this Equipment enters, create a 1/1 colorless Hero creature token, then attach this to it.)\nEquipped creature gets +1/+0.\nEquip {2} ({2}: Attach to target creature you control. Equip only as a sorcery.)'), ['C', 'C']);
    const h = g.players[0].battlefield.find(x => isType(x, 'Creature'))!; expect(h).toBeTruthy(); expect(power(g, h)).toBe(2);
  });
});
