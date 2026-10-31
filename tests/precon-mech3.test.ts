import { describe, it, expect } from 'vitest';
import { compileScry } from '../src/import/classify';
import type { ScryCard } from '../src/import/scryfall';
import { castSpell, checkState, hasKw, layer, findCard, power, toughness, chooseTriggerTargets, dealDamage, enter, matches, condOk, becomeMonarch, declareBlockers, canActivate, planPayment, castZone, def, newGame, startGame, Game, Card, CARDS, registerCards, activate, pass, alive, answerDecision, declareAttackers, ctr, findCard, power, toughness, castSpell, canCast, canBeCommander, emblemsOf, layer, checkState, destroy, isType, hasKw, chooseTriggerTargets, canBeAttackedPw, tapForMana, offBfEff, flushTriggers, prepCopyOf, loseLife, playLand, canPlayLand, foretell, canForetell, addCounters } from '../src/engine/engine';
import type { CardDef } from '../src/engine/types';
import '../src/engine/ai';
let n = 0;
function card(name: string, type_line: string, mana_cost: string, oracle_text: string, o: Partial<ScryCard> = {}): CardDef {
  const cl = compileScry({ name, type_line, mana_cost, oracle_text, colors: [], color_identity: [], keywords: [], ...o });
  const d = { ...cl.def, id: `pm-${++n}-${cl.def.id}` }; registerCards([d]);
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
    if (d && d.kind === 'cast' && o.cast) { const dd = d as unknown as { pid: number; uid: number }; expect(castSpell(g, dd.pid, dd.uid)).toBe(true); continue; }
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
const HERO = () => card('PM Hero', 'Creature — Human Hero', '{G}', '', { power: '2', toughness: '2', colors: ['G'] });


const LAND = () => card('Forest', 'Basic Land — Forest', '', '({T}: Add {G}.)');
const lib = (g: Game, pid: number, ...ds: CardDef[]) => { for (const d of ds) g.players[pid].library.push(mk(g, pid, d)); }; // last = top

import { readFileSync } from 'fs';
const PRE = JSON.parse(readFileSync(new URL('../src/data/precons.json', import.meta.url), 'utf8')) as { cards: Record<string, ScryCard> };
/** Compile a real precon card from its Oracle text; it must be fully supported. */
function pc(name: string): CardDef {
  const sc = PRE.cards[name] ?? Object.values(PRE.cards).find(x => x.name.startsWith(name)); expect(sc, name).toBeTruthy();
  const cl = compileScry({ colors: [], color_identity: [], keywords: [], ...sc! }); const d = { ...cl.def, id: `p3-${++n}-${cl.def.id}` }; registerCards([d]);
  expect(cl.support, `${name}: ${JSON.stringify(cl.unparsed)}`).toBe('auto'); return d;
}
const mana = (g: Game, pid: number, k = 12) => { g.players[pid].pool.push(...Array(k).fill('W|U|B|R|G')); };
/** Cast a card from hand with plenty of mana and resolve everything. */
function cast(g: Game, pid: number, d: CardDef, opt?: object, ro: RunOpt = {}): Card { const c = mk(g, pid, d); g.players[pid].hand.push(c); mana(g, pid); expect(castSpell(g, pid, c.uid, opt as never)).toBe(true); run(g, ro); checkState(g); return c; }
const toAttack = (g: Game) => { let i = 0; while (g.awaiting !== 'attack' && i++ < 50) pass(g, g.priority!); };
const names = (cs: Card[]) => cs.map(c => def(c).name);

describe('precon scripts: quick wins', () => {
  it('Syphon Mind: each other player discards, you draw that many', () => {
    const g = setup(); for (const p of [1, 2, 3]) g.players[p].hand.push(mk(g, p, BEAR())); lib(g, 0, ROCK(), ROCK(), ROCK(), ROCK());
    cast(g, 0, pc('Syphon Mind')); expect(g.players[0].hand.length).toBe(3); for (const p of [1, 2, 3]) expect(g.players[p].hand.length).toBe(0);
  });
  it('Cut a Deal: opponents draw, you draw one per opponent who drew', () => {
    const g = setup(); g.players[3].library = []; lib(g, 0, ROCK(), ROCK(), ROCK()); lib(g, 1, ROCK()); lib(g, 2, ROCK());
    cast(g, 0, pc('Cut a Deal')); expect(g.players[0].hand.length).toBe(2); expect(g.players[1].hand.length).toBe(1); expect(g.players[3].lost).toBeFalsy();
  });
  it('Overwhelming Stampede: trample and +X/+X (X = greatest power, locked in)', () => {
    const g = setup(); const a = put(g, 0, BEAR()); const b = put(g, 0, card('PM Big', 'Creature — Beast', '{4}', '', { power: '5', toughness: '5' }));
    cast(g, 0, pc('Overwhelming Stampede')); expect(power(g, a)).toBe(7); expect(power(g, b)).toBe(10); expect(hasKw(a, 'trample')).toBe(true);
  });
  it('Flame On!: X counters from noncreature nonland cards in graveyard, flying', () => {
    const g = setup(); const b = put(g, 0, BEAR()); g.players[0].graveyard.push(mk(g, 0, ROCK()), mk(g, 0, ZAP()), mk(g, 0, BEAR()), mk(g, 0, LAND()));
    cast(g, 0, pc('Flame On!'), { card: b.uid }); expect(ctr(b, '+1/+1')).toBe(2); expect(hasKw(b, 'flying')).toBe(true);
  });
  it('Royal Talon Fighter Jet: Soldiers equal to its +1/+1 counters', () => {
    const g = setup(); cast(g, 0, pc('Royal Talon Fighter Jet'), { x: 2 });
    expect(g.players[0].battlefield.filter(c => def(c).name === 'Soldier').length).toBe(2);
  });
  it('Ultimate Nullification: exile creatures and graveyards, goes to library bottom', () => {
    const g = setup(); const a = put(g, 1, BEAR()); g.players[2].graveyard.push(mk(g, 2, ROCK())); put(g, 0, card('PM Legend', 'Legendary Creature — Human', '{1}', '', { power: '1', toughness: '1' }));
    const c = cast(g, 0, pc('Ultimate Nullification')); expect(findCard(g, a.uid)).toBeFalsy(); expect(g.players[2].graveyard.length).toBe(0);
    expect(g.players[0].library[0].uid).toBe(c.uid); expect(g.players[0].graveyard.some(x => x.uid === c.uid)).toBe(false);
  });
  it('Scourglass: only during your upkeep; destroys all but artifacts and lands', () => {
    const g = setup(); const s = put(g, 0, pc('Scourglass')); const a = put(g, 1, BEAR()); const r = put(g, 1, ROCK()); const l = put(g, 1, LAND());
    expect(canActivate(g, 0, s, 0)).toBe(false); g.step = 'upkeep'; expect(canActivate(g, 0, s, 0)).toBe(true);
    activate(g, 0, s.uid, 0); run(g); expect(findCard(g, a.uid)).toBeFalsy(); expect(findCard(g, r.uid)).toBeTruthy(); expect(findCard(g, l.uid)).toBeTruthy();
  });
  it('Taunt from the Rampart: goad, and they cannot block', () => {
    const g = setup(); const a = put(g, 1, BEAR()); const mine = put(g, 0, BEAR());
    cast(g, 0, pc('Taunt from the Rampart')); expect(a.goad?.by).toBe(0); expect(findCard(g, mine.uid)!.goad).toBeFalsy(); expect(hasKw(a, '_cantblock')).toBe(true);
  });
  it('Hulkbuster Armor: base 9/9 and flying', () => {
    const g = setup(); const b = put(g, 0, BEAR()); const h = put(g, 0, pc('Hulkbuster Armor')); h.attachedTo = b.uid; b.counters = { '+1/+1': 1 }; layer(g);
    expect(power(g, b)).toBe(10); expect(toughness(g, b)).toBe(10); expect(hasKw(b, 'flying')).toBe(true);
  });
  it('The Wasp: taps a creature the defending player controls', () => {
    const g = setup(); const w = put(g, 0, pc('The Wasp')); w.sick = false; const x = put(g, 1, BEAR()); const y = put(g, 2, BEAR());
    toAttack(g); for (const p of g.players) p.human = true; declareAttackers(g, 0, [{ uid: w.uid, defender: 1 }]);
    expect(g.choice).toBeTruthy(); expect(chooseTriggerTargets(g, [{ card: y.uid }])).toBe(false); run(g, { tgt: () => ({ card: x.uid }) });
    expect(x.tapped).toBe(true); expect(y.tapped).toBe(false);
  });
  it('Everett K. Ross: draws when an opponent attacks you with two or more', () => {
    const g = setup(); put(g, 1, pc('Everett K. Ross')); const a = put(g, 0, BEAR()); const b = put(g, 0, BEAR()); a.sick = b.sick = false; lib(g, 1, ROCK(), ROCK());
    toAttack(g); declareAttackers(g, 0, [{ uid: a.uid, defender: 1 }, { uid: b.uid, defender: 2 }]); run(g); expect(g.players[1].hand.length).toBe(0);
  });
  it('Everett K. Ross: two attackers at him → draw', () => {
    const g = setup(); put(g, 1, pc('Everett K. Ross')); const a = put(g, 0, BEAR()); const b = put(g, 0, BEAR()); a.sick = b.sick = false; lib(g, 1, ROCK(), ROCK());
    toAttack(g); declareAttackers(g, 0, [{ uid: a.uid, defender: 1 }, { uid: b.uid, defender: 1 }]); run(g); expect(g.players[1].hand.length).toBe(1);
  });
  it('Heart-Shaped Herb: sacrifice a creature, it returns with three counters, become monarch', () => {
    const g = setup(); const h = put(g, 0, pc('Heart-Shaped Herb')); const b = put(g, 0, BEAR()); mana(g, 0);
    activate(g, 0, h.uid, 0); run(g, { pick: u => u.slice(0, 1) });
    const nb = g.players[0].battlefield.find(c => c.uid === b.uid); expect(nb).toBeTruthy(); expect(ctr(nb!, '+1/+1')).toBe(3); expect(g.monarch).toBe(0); expect(findCard(g, h.uid)).toBeFalsy();
  });
});
