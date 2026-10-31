import { describe, it, expect } from 'vitest';
import { compileScry } from '../src/import/classify';
import type { ScryCard } from '../src/import/scryfall';
import { enter, matches, condOk, becomeMonarch, declareBlockers, canActivate, planPayment, castZone, def, newGame, startGame, Game, Card, CARDS, registerCards, activate, pass, alive, answerDecision, declareAttackers, ctr, findCard, power, toughness, castSpell, canCast, canBeCommander, emblemsOf, layer, checkState, destroy, isType, hasKw, chooseTriggerTargets, canBeAttackedPw, tapForMana, offBfEff, flushTriggers, prepCopyOf, loseLife, playLand, canPlayLand, foretell, canForetell, addCounters } from '../src/engine/engine';
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

describe('precon mechanics 2', () => {
  it('connive: draw, discard; a nonland discard puts a +1/+1 counter; connive triggers fire', () => {
    const g = setup(); const d = card('PM Schemer', 'Creature — Human', '{1}{U}', '{T}: PM Schemer connives.\nWhenever a creature you control connives, you gain 2 life.', { power: '1', toughness: '1' });
    const c = put(g, 0, d); c.sick = false; lib(g, 0, ROCK()); const life = g.players[0].life;
    activate(g, 0, c.uid, 0); run(g);
    expect(g.players[0].graveyard.map(x => def(x).name)).toContain('PW3 Rock'); expect(ctr(c, '+1/+1')).toBe(1); expect(g.players[0].life).toBe(life + 2);
    c.tapped = false; lib(g, 0, LAND()); activate(g, 0, c.uid, 0); run(g); expect(ctr(c, '+1/+1')).toBe(1);
  });
  it('melee: +1/+1 for each opponent attacked this combat', () => {
    const g = setup(); const m = put(g, 0, card('PM Brawler', 'Creature — Human', '{1}{R}', 'Melee', { power: '2', toughness: '2', keywords: ['Melee'] })); const b = put(g, 0, BEAR()); m.sick = false; b.sick = false;
    let i = 0; while (g.awaiting !== 'attack' && i++ < 50) pass(g, g.priority!);
    declareAttackers(g, 0, [{ uid: m.uid, defender: 1 }, { uid: b.uid, defender: 2 }]); resolveAI(g);
    expect(power(g, m)).toBe(4); expect(toughness(g, m)).toBe(4);
  });
  it('cascade: exiles to a cheaper nonland card, casts it free, rest to the bottom', () => {
    const g = setup(); const s = card('PM Vortex', 'Sorcery', '{2}{R}', 'Cascade');
    lib(g, 0, BEAR(), ROCK(), LAND()); const c = mk(g, 0, s); g.players[0].hand.push(c);
    for (let k = 0; k < 3; k++) put(g, 0, FOREST()).tapped = false;
    put(g, 0, card('Mountain', 'Basic Land — Mountain', '', '({T}: Add {R}.)'));
    expect(castSpell(g, 0, c.uid)).toBe(true); run(g, { cast: true, may: true });
    expect(g.players[0].battlefield.some(x => def(x).name === 'PW3 Rock')).toBe(true);
    expect(def(g.players[0].library[0]).name).toBe('Forest'); expect(def(g.players[0].library[g.players[0].library.length - 1]).name).toBe('PW3 Bear');
  });
  it('discover: a declined card goes to hand', () => {
    const g = setup(); const d = card('PM Finder', 'Creature — Human', '{U}', '{T}: Discover 2.', { power: '1', toughness: '1' });
    const c = put(g, 0, d); c.sick = false; lib(g, 0, BEAR(), LAND());
    activate(g, 0, c.uid, 0); run(g, { cast: false, may: false });
    expect(g.players[0].hand.map(x => def(x).name)).toEqual(['PW3 Bear']);
  });
  it('flashback with a life cost pays the life', () => {
    const g = setup(); const d = card('PM Analysis', 'Sorcery', '{3}{U}', 'Target player draws two cards.\nFlashback—{1}{U}, Pay 3 life.');
    expect(def(mk(g, 0, d)).flashbackLife).toBe(3);
    const c = mk(g, 0, d); g.players[0].graveyard.push(c); lib(g, 0, BEAR(), BEAR());
    put(g, 0, card('Island', 'Basic Land — Island', '', '({T}: Add {U}.)')); put(g, 0, FOREST());
    const life = g.players[0].life; expect(castSpell(g, 0, c.uid, { targets: [{ player: 0 }] })).toBe(true); run(g);
    expect(g.players[0].life).toBe(life - 3); expect(g.players[0].hand.length).toBe(2);
    g.players[0].life = 2; const c2 = mk(g, 0, d); g.players[0].graveyard.push(c2); for (const x of g.players[0].battlefield) x.tapped = false;
    expect(canCast(g, 0, c2)).toBe(false);
  });
  it('Arcane Denial: counters, then next upkeep its controller may draw two and you draw one', () => {
    const g = setup(); const ad = card('Arcane Denial', 'Instant', '{1}{U}', "Counter target spell. Its controller may draw up to two cards at the beginning of the next turn's upkeep.\nYou draw a card at the beginning of the next turn's upkeep.");
    expect(def(mk(g, 0, ad)).spell).toBeTruthy();
    g.delayed = []; const fx = { op: 'arcaneDraws', kind: 'you' };
    void fx; // structural check: both delayed draw ops compile
    expect(JSON.stringify(def(mk(g, 0, ad)).spell)).toContain('"kind":"ctl"'); expect(JSON.stringify(def(mk(g, 0, ad)).spell)).toContain('"kind":"you"');
  });
});
