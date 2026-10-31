import { describe, it, expect } from 'vitest';
import { compileScry } from '../src/import/classify';
import type { ScryCard } from '../src/import/scryfall';
import { dealDamage, enter, matches, condOk, becomeMonarch, declareBlockers, canActivate, planPayment, castZone, def, newGame, startGame, Game, Card, CARDS, registerCards, activate, pass, alive, answerDecision, declareAttackers, ctr, findCard, power, toughness, castSpell, canCast, canBeCommander, emblemsOf, layer, checkState, destroy, isType, hasKw, chooseTriggerTargets, canBeAttackedPw, tapForMana, offBfEff, flushTriggers, prepCopyOf, loseLife, playLand, canPlayLand, foretell, canForetell, addCounters, costOf, createToken, blockReason, atkBlocked } from '../src/engine/engine';
import type { CardDef } from '../src/engine/types';
import { emit, draw } from '../src/engine/engine';
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
interface RunOpt { pick?: (u: number[]) => number[]; may?: boolean; tgt?: () => object | (object | undefined)[]; cast?: boolean; color?: string }
/** Resolve everything with every player human, answering decisions via opts. */
function run(g: Game, o: RunOpt = {}) {
  for (const p of g.players) p.human = true; let i = 0;
  while ((g.stack.length || g.decision || g.choice) && i++ < 300) {
    if (g.choice) { const t = o.tgt!(); expect(chooseTriggerTargets(g, (Array.isArray(t) ? t : [t]) as never)).toBe(true); continue; }
    const d = g.decision as { kind: string; cards?: Card[] } | null;
    if (d && d.kind === 'cast' && o.cast) { const dd = d as unknown as { pid: number; uid: number }; expect(castSpell(g, dd.pid, dd.uid)).toBe(true); continue; }
    if (d) answerDecision(g, (d.kind === 'pick' ? (o.pick ?? (u => u.slice(0, 1)))((d.cards ?? []).map(c => c.uid)) : d.kind === 'may' ? !!o.may : d.kind === 'cast' ? !!o.cast : d.kind === 'color' ? o.color ?? 'R' : d.kind === 'order' ? [] : false) as never);
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

import PREJ from '../src/data/precons.json';
const PRE = PREJ as unknown as { cards: Record<string, ScryCard> };
/** Compile a real precon card from its Oracle text; it must be fully supported. */
function pc(name: string): CardDef {
  const sc = PRE.cards[name] ?? Object.values(PRE.cards).find(x => x.name.startsWith(name)); expect(sc, name).toBeTruthy();
  const cl = compileScry({ colors: [], ...sc! } as ScryCard); const d = { ...cl.def, id: `p3-${++n}-${cl.def.id}` }; registerCards([d]);
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

describe('precon scripts: for each opponent', () => {
  const humans = (g: Game) => { for (const p of g.players) p.human = true; };
  it('Tri-Sentinel: 3 damage to up to one creature per opponent; slots bound to each opponent', () => {
    const g = setup(); humans(g); const a = put(g, 1, BEAR()); const b = put(g, 1, BEAR()); const c = put(g, 2, BEAR());
    cast(g, 0, pc('Tri-Sentinel'), undefined, { tgt: () => [{ card: a.uid }, { card: c.uid }, undefined] });
    expect(findCard(g, a.uid)).toBeFalsy(); expect(findCard(g, c.uid)).toBeFalsy(); expect(findCard(g, b.uid)).toBeTruthy();
  });
  it('Tri-Sentinel: two targets of the same opponent are rejected', () => {
    const g = setup(); humans(g); const a = put(g, 1, BEAR()); const b = put(g, 1, BEAR());
    const c = mk(g, 0, pc('Tri-Sentinel')); g.players[0].hand.push(c); mana(g, 0); castSpell(g, 0, c.uid); let i = 0; while (!g.choice && i++ < 20) pass(g, g.priority!);
    expect(chooseTriggerTargets(g, [{ card: a.uid }, { card: b.uid }, undefined])).toBe(false);
    expect(chooseTriggerTargets(g, [undefined, undefined, undefined])).toBe(true);
  });
  it('Age of Ultron chapters I and III', () => {
    const g = setup(); humans(g); const s = put(g, 0, pc('Age of Ultron')); const x = put(g, 1, BEAR()); const art = put(g, 1, card('PM Golem', 'Artifact Creature — Golem', '{3}', '', { power: '3', toughness: '3' }));
    emit(g, 'chapter', { player: 0, amount: 1 }, s); flushTriggers(g); expect(chooseTriggerTargets(g, [{ card: art.uid }, undefined, undefined])).toBe(false);
    run(g, { tgt: () => [{ card: x.uid }, undefined, undefined] }); expect(findCard(g, x.uid)).toBeFalsy();
    const mine = put(g, 0, card('PM Golem', 'Artifact Creature — Golem', '{3}', '', { power: '3', toughness: '3' }));
    emit(g, 'chapter', { player: 0, amount: 3 }, s); flushTriggers(g); run(g); expect(ctr(mine, '+1/+1')).toBe(1); expect(hasKw(mine, 'deathtouch')).toBe(true); expect(ctr(art, '+1/+1')).toBe(0);
  });
  it('Dismantling Wave: per-opponent targets; cycling destroys all artifacts and enchantments', () => {
    const g = setup(); humans(g); const r1 = put(g, 1, ROCK()); const r2 = put(g, 2, ROCK()); const r3 = put(g, 1, ROCK());
    cast(g, 0, pc('Dismantling Wave'), { targets: [{ card: r1.uid }, { card: r2.uid }, undefined] });
    expect(findCard(g, r1.uid)).toBeFalsy(); expect(findCard(g, r2.uid)).toBeFalsy(); expect(findCard(g, r3.uid)).toBeTruthy();
    const w = mk(g, 0, pc('Dismantling Wave')); g.players[0].hand.push(w); mana(g, 0); lib(g, 0, ROCK());
    const idx = def(w).abilities!.findIndex(a => /ycling/.test(a.label)); expect(activate(g, 0, w.uid, idx)).toBe(true); run(g);
    expect(findCard(g, r3.uid)).toBeFalsy();
  });
  it("King Solomon's Frogs: only if cast; exiled permanents' controllers draw", () => {
    const g = setup(); humans(g); const big = put(g, 1, card('PM Ogre', 'Creature — Ogre', '{3}', '', { power: '3', toughness: '3' })); const small = put(g, 2, BEAR()); lib(g, 1, ROCK());
    cast(g, 0, pc("King Solomon's Frogs"), undefined, { tgt: () => [{ card: big.uid }, undefined, undefined] });
    expect(findCard(g, big.uid)).toBeFalsy(); expect(g.players[1].hand.length).toBe(1); expect(findCard(g, small.uid)).toBeTruthy();
    const f2 = put(g, 0, pc("King Solomon's Frogs")); emit(g, 'etb', { player: 0 }, f2); flushTriggers(g); expect(g.choice).toBeFalsy(); expect(g.stack.length).toBe(0);
  });
  it('Kang Dynasty I: tap and goad; draw when those creatures deal combat damage until your next turn', () => {
    const g = setup(); humans(g); const s = put(g, 0, pc('Kang Dynasty')); const x = put(g, 1, BEAR()); lib(g, 0, ROCK(), ROCK());
    emit(g, 'chapter', { player: 0, amount: 1 }, s); flushTriggers(g); run(g, { tgt: () => [{ card: x.uid }, undefined, undefined] });
    expect(x.tapped).toBe(true); expect(x.goad?.by).toBe(0); const h = g.players[0].hand.length;
    emit(g, 'combatDamagePlayer', { player: 2, amount: 2 }, x); flushTriggers(g); run(g); expect(g.players[0].hand.length).toBe(h + 1);
  });
});

describe('precon scripts: batch 3 (costs, attack triggers, one-offs)', () => {
  it('Avenge: {2} cheaper if attacked last turn; destroy all creatures, gain 1 per destroyed', () => {
    const g = setup(); const av = mk(g, 0, pc('Avenge')); const base = costOf(g, av, {}).generic;
    g.players[1].atkDefs = { turn: g.turn, defs: [0] }; expect(costOf(g, av, {}).generic).toBe(base - 2);
    put(g, 0, BEAR()); put(g, 1, BEAR()); const ind = put(g, 2, BEAR()); ind.kw = ['indestructible']; const l0 = g.players[0].life;
    cast(g, 0, pc('Avenge')); expect(g.players[0].life).toBe(l0 + 2); expect(findCard(g, ind.uid)).toBeTruthy();
  });
  it('Heroic Return: a Hero returns with two extra counters; non-Hero with none', () => {
    const g = setup(); const h = mk(g, 0, HERO()); g.players[0].graveyard.push(h);
    cast(g, 0, pc('Heroic Return'), { targets: [{ card: h.uid }] }); expect(findCard(g, h.uid)).toBeTruthy(); expect(ctr(h, '+1/+1')).toBe(2);
    const b = mk(g, 0, BEAR()); g.players[0].graveyard.push(b); cast(g, 0, pc('Heroic Return'), { targets: [{ card: b.uid }] }); expect(ctr(b, '+1/+1')).toBe(0);
  });
  it('Metalwork Colossus: costs X less (total MV of noncreature artifacts)', () => {
    const g = setup(); const m = mk(g, 0, pc('Metalwork Colossus')); const base = costOf(g, m, {}).generic; put(g, 0, ROCK()); put(g, 0, ROCK());
    expect(costOf(g, m, {}).generic).toBe(base - 4);
  });
  it('Winter Soldier: only creature cards with MV <= its power are legal', () => {
    const g = setup(); const w = put(g, 0, pc('Winter Soldier')); const big = mk(g, 0, card('PM Huge', 'Creature — Giant', '{9}', '', { power: '9', toughness: '9' })); const h = mk(g, 0, HERO());
    g.players[0].graveyard.push(big, h); expect(matches(g, big, { mvLEPow: true }, 0, w.uid)).toBe(false); expect(matches(g, h, { mvLEPow: true }, 0, w.uid)).toBe(true);
  });
  it('Killmonger: +1/+0 per artifact defending player controls', () => {
    const g = setup(); const k = put(g, 0, pc('Killmonger')); put(g, 1, ROCK()); put(g, 1, ROCK()); put(g, 2, ROCK()); const p0 = power(g, k);
    toAttack(g); declareAttackers(g, 0, [{ uid: k.uid, defender: 1 }]); run(g); expect(power(g, k)).toBe(p0 + 2);
  });
  it('Iron Man: only other attacking modified creatures gain flying', () => {
    const g = setup(); const im = put(g, 0, pc('Iron Man')); const a = put(g, 0, BEAR()); a.counters = { '+1/+1': 1 }; const b = put(g, 0, BEAR());
    toAttack(g); declareAttackers(g, 0, [{ uid: im.uid, defender: 1 }, { uid: a.uid, defender: 1 }, { uid: b.uid, defender: 1 }]); run(g);
    expect(hasKw(a, 'flying')).toBe(true); expect(hasKw(b, 'flying')).toBe(false);
  });
  it('Shang-Chi: triggers only when the tenth +1/+1 counter is put on it', () => {
    const g = setup(); for (let i = 0; i < 6; i++) lib(g, 0, ROCK()); const s = put(g, 0, pc('Shang-Chi')); for (const p of g.players) p.human = true;
    addCounters(g, s, '+1/+1', 8); flushTriggers(g); run(g); expect(g.players[0].hand.length).toBe(0);
    addCounters(g, s, '+1/+1', 3); flushTriggers(g); run(g); expect(g.players[0].hand.length).toBe(5);
    addCounters(g, s, '+1/+1', 1); flushTriggers(g); run(g); expect(g.players[0].hand.length).toBe(5);
  });
  it('Hercules: counters equal to damage only the first time each turn', () => {
    const g = setup(); const h = put(g, 0, pc('Hercules')); for (const p of g.players) p.human = true; const z = put(g, 1, BEAR());
    dealDamage(g, z.id, z, { card: h }, 2); flushTriggers(g); run(g); expect(ctr(h, '+1/+1')).toBe(2); dealDamage(g, z.id, z, { card: h }, 1); flushTriggers(g); run(g); expect(ctr(h, '+1/+1')).toBe(2);
  });
  it('Hawkeye: draws only for opposing creatures it damaged this turn', () => {
    const g = setup(); lib(g, 0, ROCK(), ROCK()); const hk = put(g, 0, pc('Hawkeye')); for (const p of g.players) p.human = true; const a = put(g, 1, BEAR()); const b = put(g, 1, BEAR());
    dealDamage(g, hk.id, hk, { card: a }, 2); checkState(g); flushTriggers(g); run(g); expect(g.players[0].hand.length).toBe(1);
    destroy(g, b); flushTriggers(g); run(g); expect(g.players[0].hand.length).toBe(1);
  });
  it('Divine Visitation: creature tokens become 4/4 Angels; noncreature tokens unchanged', () => {
    const g = setup(); put(g, 0, pc('Divine Visitation')); const t = createToken(g, 0, { name: 'Soldier', p: 1, t: 1, colors: ['W'], types: ['Creature'], sub: ['Soldier'] }); layer(g);
    expect(def(t).name).toBe('Angel'); expect(power(g, t)).toBe(4); expect(hasKw(t, 'flying')).toBe(true);
    const tr = createToken(g, 0, { name: 'Treasure', preset: 'Treasure', colors: [], types: ['Artifact'] }); expect(def(tr).name).toBe('Treasure');
    const o = createToken(g, 1, { name: 'Soldier', p: 1, t: 1, colors: ['W'], types: ['Creature'], sub: ['Soldier'] }); expect(def(o).name).toBe('Soldier');
  });
  it('Council of Reeds: legend rule ignored for your creatures only', () => {
    const g = setup(); put(g, 0, pc('Council of Reeds')); const L = card('PM Legend', 'Legendary Creature — Human', '{1}', '', { power: '1', toughness: '1' });
    put(g, 0, L); put(g, 0, L); put(g, 1, L); put(g, 1, L); checkState(g);
    expect(g.players[0].battlefield.filter(c => def(c).name === 'PM Legend').length).toBe(2); expect(g.players[1].battlefield.filter(c => def(c).name === 'PM Legend').length).toBe(1);
  });
  it("Shuri's Fabricator: returned artifact has a finality counter and is exiled instead of dying", () => {
    const g = setup(); const f = put(g, 0, pc("Shuri's Fabricator")); const r = mk(g, 0, ROCK()); g.players[0].graveyard.push(r); mana(g, 0);
    expect(activate(g, 0, f.uid, 0, { targets: [{ card: r.uid }] } as never)).toBe(true); run(g); expect(ctr(r, 'finality')).toBe(1);
    destroy(g, r); expect(g.players[0].exile.includes(r)).toBe(true);
  });
  it('Chaos Warp: shuffled into library; top permanent card enters', () => {
    const g = setup(); const v = put(g, 1, BEAR()); g.players[1].library = []; cast(g, 0, pc('Chaos Warp'), { targets: [{ card: v.uid }] });
    expect(findCard(g, v.uid)).toBeTruthy(); // only card in library → revealed and returned
    const z = put(g, 2, BEAR()); g.players[2].library = [mk(g, 2, ZAP()), mk(g, 2, ZAP())]; cast(g, 0, pc('Chaos Warp'), { targets: [{ card: z.uid }] });
    expect(findCard(g, z.uid)).toBeFalsy(); expect(g.players[2].library.length).toBe(3);
  });
  it('Wakanda Forever!: one permanent with an indestructible counter, one to hand, rest to graveyard', () => {
    const g = setup(); lib(g, 0, ZAP(), ZAP(), ROCK(), ZAP(), BEAR(), ROCK());
    cast(g, 0, pc('Wakanda Forever!'), undefined, { pick: u => u.slice(0, 1) });
    const onb = g.players[0].battlefield.filter(c => !isType(c, 'Land')); expect(onb.length).toBe(1); expect(hasKw(onb[0], 'indestructible')).toBe(true);
    expect(g.players[0].hand.length).toBe(1); expect(g.players[0].graveyard.length).toBe(5); // 4 rest + the spell
  });
  it('Expressive Iteration: hand / bottom / exile with play permission this turn', () => {
    const g = setup(); g.players[0].library = []; lib(g, 0, ROCK(), BEAR(), ZAP()); cast(g, 0, pc('Expressive Iteration'));
    expect(g.players[0].hand.length).toBe(1); const ex = g.players[0].exile[g.players[0].exile.length - 1]; expect(ex.mayPlay).toBe(g.turn); expect(g.players[0].library.length).toBe(1);
  });
  it('Genesis Ultimatum: chosen permanents enter, the rest to hand, spell exiled', () => {
    const g = setup(); lib(g, 0, ZAP(), BEAR(), ROCK(), ZAP(), BEAR()); cast(g, 0, pc('Genesis Ultimatum'), undefined, { pick: u => u });
    expect(g.players[0].battlefield.length).toBe(3); expect(g.players[0].hand.length).toBe(2); expect(names(g.players[0].exile)).toContain('Genesis Ultimatum');
  });
  it('Damocles Base: villainous choice — sacrifice, or lose 2 and you draw two', () => {
    const g = setup(); lib(g, 0, ROCK(), ROCK()); const dmb = put(g, 0, pc('Damocles Base')); const b = put(g, 1, BEAR()); for (const p of g.players) p.human = true;
    emit(g, 'combatDamagePlayer', { player: 1, amount: 3 }, dmb); flushTriggers(g); run(g, { may: true }); expect(findCard(g, b.uid)).toBeFalsy();
    const l = g.players[1].life; emit(g, 'combatDamagePlayer', { player: 1, amount: 3 }, dmb); flushTriggers(g); run(g); expect(g.players[1].life).toBe(l - 2); expect(g.players[0].hand.length).toBe(2);
  });
  it('Alicia Masters: each player regains control of creatures they own at your end step', () => {
    const g = setup(); const al = put(g, 0, pc('Alicia Masters')); const b = put(g, 1, BEAR()); g.players[1].battlefield = []; b.realOwner = 1; b.owner = 0; g.players[0].battlefield.push(b); for (const p of g.players) p.human = true;
    emit(g, 'endStep', { player: 0 }); flushTriggers(g); run(g); expect(g.players[1].battlefield.includes(b)).toBe(true); expect(findCard(g, al.uid)).toBeTruthy();
  });
  it('Crystal: X damage to each opponent = colors of the noncreature spell', () => {
    const g = setup(); put(g, 0, pc('Crystal')); const l = g.players[1].life;
    cast(g, 0, card('PM Gold', 'Sorcery', '{W}{U}{B}', 'You gain 1 life.', { colors: ['W', 'U', 'B'] })); expect(g.players[1].life).toBe(l - 3); expect(g.players[3].life).toBe(l - 3);
  });
  it('Speed: the granted evasion allows only haste blockers', () => {
    const g = setup(); const a = put(g, 0, BEAR()); a.kw = ['_hasteonly']; a.attacking = 1; const b1 = put(g, 1, BEAR()); const b2 = put(g, 1, BEAR()); b2.kw = ['haste'];
    expect(blockReason(g, b1, a)).toMatch(/haste/); expect(blockReason(g, b2, a)).toBeNull();
  });
  it('overload test lives in precon-mech2 (no target, affects each)', () => { expect(true).toBe(true); });
});

describe('precon scripts: batch 4 (attack restrictions, graveyard triggers, one-offs)', () => {
  const H = (g: Game) => { for (const p of g.players) p.human = true; };
  it('Queen Mother Ramonda: power ≤2 creatures can\'t attack the monarch', () => {
    const g = setup(); put(g, 1, pc('Queen Mother Ramonda')); const b = put(g, 0, BEAR()); expect(atkBlocked(g, b, 1)).toBeNull();
    becomeMonarch(g, 1); expect(atkBlocked(g, b, 1)).toMatch(/Ramonda/); b.counters = { '+1/+1': 1 }; expect(atkBlocked(g, b, 1)).toBeNull();
  });
  it('Propaganda: attacker pays {2} per creature or is removed', () => {
    const g = setup(); put(g, 1, pc('Propaganda')); const a = put(g, 0, BEAR()); const b = put(g, 0, BEAR()); toAttack(g); g.players[0].pool = ['G', 'G'];
    declareAttackers(g, 0, [{ uid: a.uid, defender: 1 }, { uid: b.uid, defender: 1 }]); expect(a.attacking).toBe(1); expect(b.attacking).toBeUndefined();
  });
  it('Promise of Loyalty: each keeps one creature with a vow counter that can\'t attack the caster', () => {
    const g = setup(); const k = put(g, 1, BEAR()); const s = put(g, 1, BEAR()); put(g, 0, BEAR());
    cast(g, 0, pc('Promise of Loyalty'), {}, { pick: u => u.slice(0, 1) }); expect(findCard(g, k.uid)).toBeTruthy(); expect(findCard(g, s.uid)).toBeFalsy();
    expect(ctr(k, 'vow')).toBe(1); expect(atkBlocked(g, k, 0)).toMatch(/vow/); expect(atkBlocked(g, k, 2)).toBeNull();
  });
  it('Palace Jailer: exile returns when an opponent becomes the monarch', () => {
    const g = setup(); const v = put(g, 1, BEAR()); const j = mk(g, 0, pc('Palace Jailer')); g.players[0].hand.push(j); mana(g, 0); H(g);
    expect(castSpell(g, 0, j.uid)).toBe(true); run(g, { tgt: () => ({ card: v.uid }) }); expect(findCard(g, v.uid)).toBeFalsy(); expect(g.monarch).toBe(0);
    becomeMonarch(g, 1); expect(findCard(g, v.uid)).toBeTruthy(); expect(g.players[1].battlefield.some(c => c.uid === v.uid)).toBe(true);
  });
  it('Ant-Man: creatures with greater power can\'t block it', () => {
    const g = setup(); const a = put(g, 0, pc('Ant-Man')); a.attacking = 1; const big = put(g, 1, card('PM Ogre', 'Creature — Ogre', '{4}', '', { power: '5', toughness: '5' })); const sm = put(g, 1, VAMP());
    expect(blockReason(g, big, a)).toMatch(/greater power/); expect(blockReason(g, sm, a)).toBeNull();
  });
  it('She-Hulk: a blocked Hero gets a counter per blocker (one trigger)', () => {
    const g = setup(); put(g, 0, pc('She-Hulk')); const h = put(g, 0, HERO()); h.blockedBy = [put(g, 1, BEAR()).uid, put(g, 1, BEAR()).uid]; H(g);
    emit(g, 'blocked', { player: 0 }, h); flushTriggers(g); run(g); expect(ctr(h, '+1/+1')).toBe(2);
  });
  it('Photon: combat damage adds kept mana that survives a step change', () => {
    const g = setup(); const p = put(g, 0, pc('Photon')); H(g); emit(g, 'combatDamagePlayer', { player: 1, amount: 3 }, p); flushTriggers(g); run(g, { color: 'U' });
    expect(g.players[0].pool.filter(u => u === 'U@keep').length).toBe(3); pass(g, g.priority!); let i = 0; while (g.step !== 'main2' && i++ < 40) { if (g.decision) answerDecision(g, false); else pass(g, g.priority!); }
    expect(g.players[0].pool.filter(u => u === 'U@keep').length).toBe(3);
  });
  it('Willie Lumpkin: damaged opponent may draw, then can\'t attack you next turn', () => {
    const g = setup(); const w = put(g, 0, pc('Willie Lumpkin')); lib(g, 0, ROCK()); lib(g, 1, ROCK()); H(g);
    emit(g, 'combatDamagePlayer', { player: 1, amount: 1 }, w); flushTriggers(g); run(g, { may: true }); expect(g.players[1].hand.length).toBe(1); expect(g.players[0].hand.length).toBe(1);
    expect(atkBlocked(g, put(g, 1, BEAR()), 0)).toMatch(/Willie/);
  });
  it('Endless Ranks of HYDRA: pays {1}{B} from the graveyard when your commander attacks', () => {
    const g = setup(); const e = mk(g, 0, pc('Endless Ranks')); g.players[0].graveyard.push(e); const cm = put(g, 0, BEAR()); g.players[0].commanderIds = [cm.id]; mana(g, 0); H(g);
    emit(g, 'attacks', { player: 0 }, cm); flushTriggers(g); run(g, { may: true }); expect(g.players[0].hand.some(c => c.uid === e.uid)).toBe(true);
  });
  it('Jocasta: returns tapped and attacking alongside your commander', () => {
    const g = setup(); const j = mk(g, 0, pc('Jocasta')); g.players[0].graveyard.push(j); const cm = put(g, 0, BEAR()); g.players[0].commanderIds = [cm.id]; toAttack(g); H(g);
    declareAttackers(g, 0, [{ uid: cm.uid, defender: 2 }]); run(g, { may: true }); const jj = findCard(g, j.uid)!; expect(jj).toBeTruthy(); expect(jj.tapped).toBe(true); expect(jj.attacking).toBe(2);
  });
  it('Kimoyo Beads: each end step picks an unchosen mode; Prime Bead blinks and resets', () => {
    const g = setup(); put(g, 0, pc('Kimoyo Beads')); lib(g, 0, ROCK()); H(g); const l = g.players[0].life;
    emit(g, 'endStep', { player: 0 }); flushTriggers(g); run(g, { color: 'AV Bead — draw a card' }); expect(g.players[0].hand.length).toBe(1);
    emit(g, 'endStep', { player: 0 }); flushTriggers(g); run(g, { color: 'Prime Bead — gain 3 life, blink' }); expect(g.players[0].life).toBe(l + 3);
    const kb = g.players[0].battlefield.find(c => def(c).name === 'Kimoyo Beads')!; expect(kb.chosenModes ?? []).toEqual([]);
  });
  it('Tragic Arrogance: each player keeps one of each chosen type', () => {
    const g = setup(); const a = put(g, 1, BEAR()); const b = put(g, 1, BEAR()); const r = put(g, 1, ROCK()); const r2 = put(g, 1, ROCK()); const f = put(g, 1, FOREST());
    cast(g, 0, pc('Tragic Arrogance')); expect([a, b].filter(c => findCard(g, c.uid)).length).toBe(1); expect([r, r2].filter(c => findCard(g, c.uid)).length).toBe(1); expect(findCard(g, f.uid)).toBeTruthy();
  });
  it('Fight for the Throne: counter, fight; you become monarch when it dies (with your commander)', () => {
    const g = setup(); const me = put(g, 0, BEAR()); g.players[0].commanderIds = [me.id]; const v = put(g, 1, VAMP());
    cast(g, 0, pc('Fight for the Throne'), { targets: [{ card: me.uid }, { card: v.uid }] }); expect(ctr(me, '+1/+1')).toBe(1); expect(findCard(g, v.uid)).toBeFalsy(); expect(g.monarch).toBe(0);
  });
  it('Typhoid Mary: you choose the mode after discarding this turn', () => {
    const g = setup(); const t = put(g, 0, pc('Typhoid Mary')); g.players[0].discT = g.turn; H(g); const l = g.players[1].life;
    emit(g, 'attacks', { player: 0 }, t); flushTriggers(g); run(g, { color: 'Bloody Mary — each opponent loses 2 life and you gain 2 life' }); expect(g.players[1].life).toBe(l - 2);
  });
  it('Galactus must attack the opponent with the most life unless you control Silver Surfer', () => {
    const g = setup(); const ga = put(g, 0, pc('Galactus')); g.players[2].life = 50; toAttack(g); declareAttackers(g, 0, [{ uid: ga.uid, defender: 1 }]); expect(ga.attacking).toBe(2);
  });
  it('Captain Marvel copies counters you put on another non-Kree creature', () => {
    const g = setup(); const cm = put(g, 0, pc('Captain Marvel')); const b = put(g, 0, BEAR()); cast(g, 0, card('PM Grow', 'Sorcery', '{G}', 'Put two +1/+1 counters on target creature.'), { targets: [{ card: b.uid }] }, { may: true });
    expect(ctr(cm, '+1/+1')).toBe(2);
  });
});

describe('precon scripts: batch 5 (batched triggers, flash permission, Spear)', () => {
  const H = (g: Game) => { for (const p of g.players) p.human = true; };
  it('Doctor Doom: discarding two lands at once triggers once; nonland discards don\'t', () => {
    const g = setup(); put(g, 0, pc('Doctor Doom, King')); const l = g.players[1].life; for (let i = 0; i < 2; i++) g.players[0].hand.push(mk(g, 0, FOREST()));
    cast(g, 0, card('PM Dump', 'Sorcery', '{B}', 'Discard two cards.')); expect(g.players[1].life).toBe(l - 2);
    g.players[0].hand.push(mk(g, 0, ROCK())); cast(g, 0, card('PM Dump1', 'Sorcery', '{B}', 'Discard a card.')); expect(g.players[1].life).toBe(l - 2);
  });
  it('Puppet Master: one Treasure for several goaded creatures hitting an opponent', () => {
    const g = setup(); put(g, 0, pc('Puppet Master')); const a = put(g, 2, BEAR()); const b = put(g, 2, BEAR()); a.goad = { by: 0, until: 99 } as never; b.goad = { by: 0, until: 99 } as never; H(g);
    emit(g, 'combatDamagePlayer', { player: 1, amount: 2 }, a); emit(g, 'combatDamagePlayer', { player: 1, amount: 2 }, b); flushTriggers(g); run(g);
    expect(g.players[0].battlefield.filter(c => def(c).name === 'Treasure').length).toBe(1);
  });
  it('Quicksilver: sorcery-speed spells castable at instant speed while it is tapped', () => {
    const g = setup(); const q = put(g, 0, pc('Quicksilver')); const s = mk(g, 0, card('PM Sorc', 'Sorcery', '{G}', 'You gain 1 life.')); g.players[0].hand.push(s); mana(g, 0);
    g.stack.push({} as never); expect(canCast(g, 0, s)).toBe(false); q.tapped = true; expect(canCast(g, 0, s)).toBe(true); g.stack.pop();
  });
  it('The Spear of Bashenga: equipped creature attacking the monarch destroys a tapped nonland permanent', () => {
    const g = setup(); const sp = put(g, 0, pc('The Spear of Bashenga')); const a = put(g, 0, BEAR()); sp.attachedTo = a.uid; becomeMonarch(g, 1); const t = put(g, 1, ROCK()); t.tapped = true; toAttack(g); H(g);
    declareAttackers(g, 0, [{ uid: a.uid, defender: 1 }]); run(g, { tgt: () => ({ card: t.uid }) }); expect(findCard(g, t.uid)).toBeFalsy();
  });
});

describe('precon scripts: batch 6 (clones)', () => {
  it('Spark Double copies a legendary creature as nonlegendary with an extra counter; reverts when it leaves', () => {
    const g = setup(); const leg = put(g, 0, pc('Shang-Chi')); const sd = mk(g, 0, pc('Spark Double')); g.players[0].hand.push(sd); mana(g, 0);
    expect(castSpell(g, 0, sd.uid)).toBe(true); run(g, { pick: u => u.filter(x => x === leg.uid) }); const c = findCard(g, sd.uid)!;
    expect(def(c).name).toBe(def(leg).name); expect(def(c).legendary).toBe(false); expect(ctr(c, '+1/+1')).toBe(1); expect(findCard(g, leg.uid)).toBeTruthy();
    destroy(g, c); expect(def(c).name).toBe('Spark Double');
  });
  it('Chameleon keeps its name; Mirage Mirror copy ends at cleanup', () => {
    const g = setup(); const b = put(g, 0, BEAR()); const ch = mk(g, 0, pc('Chameleon')); g.players[0].hand.push(ch); mana(g, 0);
    expect(castSpell(g, 0, ch.uid)).toBe(true); run(g, { pick: u => u.filter(x => x === b.uid) }); expect(def(ch).name).toMatch(/Chameleon/); expect(power(g, ch)).toBe(2);
    const mm = put(g, 0, pc('Mirage Mirror')); mana(g, 0); for (const p of g.players) p.human = true;
    expect(activate(g, 0, mm.uid, 0, { card: b.uid })).toBe(true); run(g); expect(isType(mm, 'Creature')).toBe(true);
    let i = 0; while (g.active === 0 && i++ < 60) { if (g.decision) answerDecision(g, false); else pass(g, g.priority!); } expect(def(mm).name).toBe('Mirage Mirror');
  });
});

describe('precon scripts: batch 7 (spell copies)', () => {
  it('Ancestral Communion: copy with a new target while you control your commander', () => {
    const g = setup(); const cm = put(g, 0, BEAR()); g.players[0].commanderIds = [cm.id]; const a = mk(g, 0, ROCK()); const b = mk(g, 0, ROCK()); g.players[0].graveyard.push(a, b);
    cast(g, 0, pc('Ancestral Communion'), { targets: [{ card: a.uid }] }, { pick: u => u.slice(0, 1) }); expect(g.players[0].hand.map(c => c.uid).sort()).toEqual([a.uid, b.uid].sort());
  });
  it('Hatut Zeraze: one token copy per commander cast from the command zone', () => {
    const g = setup(); const cm = put(g, 0, BEAR()); g.players[0].commanderIds = [cm.id]; g.players[0].casts[cm.id] = 2;
    const h = cast(g, 0, pc('Hatut Zeraze'), {}, { tgt: () => [undefined] }); const all = g.players[0].battlefield.filter(c => def(c).name === def(h).name); expect(all.length).toBe(3); expect(all.filter(c => c.token).length).toBe(2);
  });
  it('Galvanic Iteration: copies the next instant this turn', () => {
    const g = setup(); cast(g, 0, pc('Galvanic Iteration')); const l = g.players[0].life; cast(g, 0, card('PM Heal', 'Instant', '{W}', 'You gain 2 life.')); expect(g.players[0].life).toBe(l + 4);
    cast(g, 0, card('PM Heal2', 'Instant', '{W}', 'You gain 2 life.')); expect(g.players[0].life).toBe(l + 6);
  });
  it('Cosmic Crucible: copies only once each turn', () => {
    const g = setup(); put(g, 0, pc('Cosmic Crucible')); const l = g.players[0].life; const heal = () => card('PM Heal3', 'Instant', '{W}', 'You gain 2 life.');
    cast(g, 0, heal(), {}, { may: true }); expect(g.players[0].life).toBe(l + 4); cast(g, 0, heal(), {}, { may: true }); expect(g.players[0].life).toBe(l + 6);
  });
});

describe('precon scripts: batch 8 (escalate, multikicker)', () => {
  it('Collective Effort: escalate taps a creature per extra mode; modes use their own targets', () => {
    const g = setup(); const big = put(g, 1, card('PM Ogre4', 'Creature — Ogre', '{4}', '', { power: '4', toughness: '4' })); const en = put(g, 1, card('PM Ench', 'Enchantment', '{1}', ''));
    const t1 = put(g, 0, BEAR()); const t2 = put(g, 0, VAMP());
    cast(g, 0, pc('Collective Effort'), { modes: [0, 1, 2], targets: [{ card: big.uid }, { card: en.uid }, { player: 0 }] });
    expect(findCard(g, big.uid)).toBeFalsy(); expect(findCard(g, en.uid)).toBeFalsy(); expect(t1.tapped && t2.tapped).toBe(true); expect(ctr(t1, '+1/+1')).toBe(1);
  });
  it('Collective Effort: can\'t choose more modes than creatures to tap + 1', () => {
    const g = setup(); const big = put(g, 1, card('PM Ogre5', 'Creature — Ogre', '{4}', '', { power: '4', toughness: '4' })); const en = put(g, 1, card('PM Ench2', 'Enchantment', '{1}', ''));
    const c = mk(g, 0, pc('Collective Effort')); g.players[0].hand.push(c); mana(g, 0);
    expect(castSpell(g, 0, c.uid, { modes: [0, 1], targets: [{ card: big.uid }, { card: en.uid }] })).toBe(false);
  });
  it('Batroc: multikicker twice = two counters and two targets', () => {
    const g = setup(); const v1 = put(g, 1, VAMP()); const v2 = put(g, 2, VAMP()); const b = mk(g, 0, pc('Batroc')); const base = costOf(g, b, {}); expect(base.x).toBe(2);
    g.players[0].hand.push(b); mana(g, 0); expect(castSpell(g, 0, b.uid, { x: 2 })).toBe(true); run(g, { tgt: () => [{ card: v1.uid }, { card: v2.uid }] });
    expect(ctr(b, '+1/+1')).toBe(2); expect(findCard(g, v1.uid)).toBeFalsy(); expect(findCard(g, v2.uid)).toBeFalsy();
  });
});
describe('precon scripts: batch 8b', () => {
  it('Collective Effort: a single non-first mode hits its own target, no escalate tap', () => {
    const g = setup(); const en = put(g, 1, card('PM Ench3', 'Enchantment', '{1}', '')); const t1 = put(g, 0, BEAR());
    cast(g, 0, pc('Collective Effort'), { modes: [1], targets: [undefined, { card: en.uid }] }); expect(findCard(g, en.uid)).toBeFalsy(); expect(t1.tapped).toBe(false);
  });
});

function until(g: Game, pred: () => boolean, max = 1500) { for (const p of g.players) p.human = false; let i = 0; while (!pred() && i++ < max) { if (g.decision) answerDecision(g, false); else pass(g, g.priority!); } return pred(); }
describe('precon scripts: batch 9 (phasing, suspend, miracle, coin flip)', () => {
  it('Clever Concealment: targets phase out (gone, keep counters) and phase back in on your next turn', () => {
    const g = setup(); const b = put(g, 0, BEAR()); b.counters = { '+1/+1': 2 }; const r = put(g, 0, ROCK()); const v = put(g, 0, VAMP());
    cast(g, 0, pc('Clever Concealment'), { targets: [{ card: b.uid }, { card: r.uid }] });
    expect(findCard(g, b.uid)).toBeFalsy(); expect(findCard(g, r.uid)).toBeFalsy(); expect(findCard(g, v.uid)).toBeTruthy();
    expect(until(g, () => g.active !== 0)).toBe(true); expect(findCard(g, b.uid)).toBeFalsy();
    expect(until(g, () => g.active === 0 && g.step === 'main1')).toBe(true); expect(findCard(g, b.uid)?.counters?.['+1/+1']).toBe(2); expect(findCard(g, r.uid)).toBeTruthy();
  });
  it('Vision: a spell cast off-turn lets you phase Vision out (or grow it)', () => {
    const g = setup(); const vi = put(g, 0, pc('Vision, Synthezoid Avenger'));
    const ins = card('PM Insight', 'Instant', '{U}', 'Draw a card.', { colors: ['U'] }); const c = mk(g, 1, ins); g.players[1].hand.push(c); mana(g, 1);
    g.priority = 1; expect(castSpell(g, 1, c.uid)).toBe(true); run(g, { color: 'Vision phases out' }); expect(findCard(g, vi.uid)).toBeFalsy(); expect(g.players[0].phased?.includes(vi)).toBe(true);
    const g2 = setup(); const v2 = put(g2, 0, pc('Vision, Synthezoid Avenger')); cast(g2, 0, ins); expect(ctr(v2, '+1/+1')).toBe(0);
  });
  it("Kang Prime: exiles until a nonland card, suspends it with two time counters; it's cast free with haste later", () => {
    const g = setup(); const b = mk(g, 0, BEAR()); const l = mk(g, 0, card('PM Wastes', 'Land', '', '')); g.players[0].library.push(b, l);
    cast(g, 0, pc('Kang Prime')); expect(g.players[0].exile).toContain(b); expect(b.suspended).toBe(true); expect(b.counters?.time).toBe(2);
    expect(until(g, () => !!findCard(g, b.uid))).toBe(true); expect(g.active).toBe(0); expect(b.kw).toContain('haste');
  });
  it("Doom's Time Platform: whenever you attack, a nonland card from your graveyard gets suspended", () => {
    const g = setup(); const s = put(g, 0, pc("Doom's Time Platform")); const b = mk(g, 0, BEAR()); g.players[0].graveyard.push(b);
    emit(g, 'youAttack', { player: 0, amount: 1 }); flushTriggers(g); run(g, { tgt: () => ({ card: b.uid }) }); expect(s).toBeTruthy(); expect(g.players[0].exile).toContain(b); expect(b.counters?.time).toBe(2);
  });
  it('Molecule Man: the first card you draw each turn can be cast for {0}', () => {
    const g = setup(); put(g, 0, pc('Molecule Man')); const b = mk(g, 0, BEAR()); const b2 = mk(g, 0, VAMP()); g.players[0].library.push(b2, b); delete g.players[0].drawn;
    draw(g, 0, 1); draw(g, 0, 1); flushTriggers(g); expect(g.players[0].pool.length).toBe(0); run(g, { cast: true }); expect(findCard(g, b.uid)).toBeTruthy(); expect(findCard(g, b2.uid)).toBeFalsy();
  });
  it('Negative Zone Portal: tags exiled cards; with 4+ creatures exiled it flips at upkeep', () => {
    const g = setup(); const z = put(g, 0, pc('Negative Zone Portal')); const b = mk(g, 1, BEAR()); g.players[1].graveyard.push(b); mana(g, 0); const h = g.players[0].hand.length;
    activate(g, 0, z.uid, 0, { card: b.uid } as never); run(g); expect(b.exBy).toBe(z.uid); expect(g.players[0].hand.length).toBe(h + 1);
    for (let i = 0; i < 3; i++) { const x = mk(g, 1, BEAR()); x.exBy = z.uid; g.players[1].exile.push(x); }
    let lost = false; for (let k = 0; k < 12 && !lost; k++) { emit(g, 'upkeep', { player: 0 }); flushTriggers(g); run(g); lost = !findCard(g, z.uid); }
    expect(lost).toBe(true); expect(g.players[1].hand.length).toBe(1); expect(g.players[1].exile.filter(x => x.exBy === z.uid).length).toBe(3);
  });
});
describe('precon scripts: batch 10 (trigger copying / doubling)', () => {
  it('Annie Joins Up: a legendary creature you control triggers an additional time', () => {
    const g = setup(); put(g, 0, pc('Annie Joins Up')); const leg = card('PM Legend', 'Legendary Creature — Human', '{1}{W}', 'Whenever you cast a spell, you gain 1 life.', { power: '2', toughness: '2' }); put(g, 0, leg);
    const non = card('PM Grunt', 'Creature — Human', '{1}{W}', 'Whenever you cast a spell, you gain 1 life.', { power: '2', toughness: '2' }); put(g, 0, non);
    const l0 = g.players[0].life; cast(g, 0, card('PM Insight2', 'Instant', '{U}', 'Draw a card.')); expect(g.players[0].life).toBe(l0 + 3);
  });
  it('Mister Fantastic: copies a triggered ability you control twice', () => {
    const g = setup(); const mf = put(g, 0, pc('Mister Fantastic')); put(g, 0, card('PM Healer', 'Creature — Human', '{1}{W}', 'Whenever you cast a spell, you gain 1 life.', { power: '2', toughness: '2' }));
    const c = mk(g, 0, card('PM Insight3', 'Instant', '{U}', 'Draw a card.')); g.players[0].hand.push(c); mana(g, 0); expect(castSpell(g, 0, c.uid)).toBe(true); flushTriggers(g);
    const tr = g.stack.find(s => s.kind === 'trigger')!; expect(tr).toBeTruthy(); mana(g, 0); const l0 = g.players[0].life;
    activate(g, 0, mf.uid, mf ? def(mf).abilities!.length - 1 : 0, { stack: tr.id } as never); run(g); expect(g.players[0].life).toBe(l0 + 3);
  });
});
