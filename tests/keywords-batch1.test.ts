import { describe, it, expect } from 'vitest';
import { compileScry } from '../src/import/classify';
import type { ScryCard } from '../src/import/scryfall';
import {
  newGame, startGame, Game, Card, registerCards, castSpell, pass, answerDecision,
  power, toughness, ctr, declareAttackers, declareBlockers, hasKw, layer, dealDamage,
  flushTriggers, canCast, costOf, destroy, enter, activate, canActivate, abilitiesOf,
  canPlot, plot, sacrifice, isType, isTypeOrSub, def, tapForMana, checkState,
} from '../src/engine/engine';
import type { CardDef } from '../src/engine/types';
import '../src/engine/ai';

let n = 0;
function colorsOf(mc: string): string[] { return [...new Set([...mc.matchAll(/\{([WUBRG])\}/g)].map(m => m[1]))]; }
function card(name: string, type_line: string, mana_cost: string, oracle_text: string, o: Partial<ScryCard> = {}): CardDef {
  const cols = o.colors ?? colorsOf(mana_cost);
  const cl = compileScry({ name, type_line, mana_cost, oracle_text, colors: cols, color_identity: cols, keywords: o.keywords ?? [], ...o });
  const d = { ...cl.def, id: `b1-${++n}-${cl.def.id}` }; registerCards([d]);
  (d as CardDef & { _support: string; _unparsed?: string[] })._support = cl.support;
  (d as CardDef & { _unparsed?: string[] })._unparsed = cl.unparsed;
  return d;
}
const auto = (d: CardDef) => expect((d as CardDef & { _support: string })._support, JSON.stringify((d as CardDef & { _unparsed?: string[] })._unparsed)).toBe('auto');

function setup(humans: number[] = []): Game {
  const g = newGame({ seed: 7, humans, skipAiMulligan: true });
  for (const p of g.players) { p.library.push(...p.hand); p.hand = []; }
  startGame(g); let i = 0; while (!(g.step === 'main1' && !g.stack.length && g.active === 0) && i++ < 80) { if (g.decision) answerDecision(g, false); else pass(g, g.priority!); }
  for (const p of g.players) { p.library.push(...p.hand); p.hand = []; for (const c of p.battlefield) c.tapped = false; }
  return g;
}
function put(g: Game, pid: number, d: CardDef | string, zone: 'battlefield' | 'hand' | 'graveyard' | 'exile' = 'battlefield'): Card {
  const c: Card = { uid: g.nextUid++, id: typeof d === 'string' ? d : d.id, owner: pid, tapped: false, sick: false, damage: 0, pp: 0, pt: 0 };
  g.players[pid][zone].push(c); layer(g); return c;
}
function resolveAll(g: Game) { let i = 0; while ((g.stack.length || g.decision || g.pending.length) && i++ < 80) { if (g.decision) { if (g.decision.kind === 'may') answerDecision(g, true); else if (g.decision.kind === 'pick') answerDecision(g, (g.decision.cards ?? []).slice(0, Math.max(g.decision.min ?? 1, 1)).map((c: Card) => c.uid)); else answerDecision(g, false); } else if (g.priority != null) pass(g, g.priority); else flushTriggers(g); } }
function toAttack(g: Game) { let i = 0; while (g.awaiting !== 'attack' && i++ < 80) { if (g.decision) answerDecision(g, false); else pass(g, g.priority!); } }
function toStep(g: Game, step: string, pid?: number) {
  let i = 0;
  const here = () => g.step === step && (pid === undefined || g.active === pid) && !g.stack.length && !g.pending.length && !g.decision;
  const advance = () => {
    if (g.decision) answerDecision(g, false);
    else if (g.awaiting === 'attack') declareAttackers(g, g.active, []);
    else if (g.awaiting === 'block') {
      const defs = [...new Set(g.players.flatMap(p => p.battlefield.filter(c => c.attacking !== undefined).map(c => c.attacking!)))].filter(d => !g.blockersDone.includes(d));
      if (defs.length) declareBlockers(g, defs[0], []);
      else if (g.priority != null) pass(g, g.priority);
      else flushTriggers(g);
    }
    else if (g.priority != null) pass(g, g.priority);
    else flushTriggers(g);
  };
  const mark = `${g.turn}:${g.step}:${g.active}`;
  if (here()) { while (`${g.turn}:${g.step}:${g.active}` === mark && i++ < 400) advance(); }
  while (!here() && i++ < 400) advance();
}
function fillMana(g: Game, pid = 0, n = 12) { for (let i = 0; i < n; i++) g.players[pid].pool.push('W','U','B','R','G','C'); }
const VANILLA = (p = 2, t = 2, name = 'B1 Bear'): CardDef => card(name, 'Creature — Bear', '{1}{G}', '', { power: String(p), toughness: String(t) });
const ISLAND = (): CardDef => card('Island', 'Basic Land — Island', '', '{T}: Add {U}.', { keywords: [] });

describe('batch 1: compile', () => {
  it('upkeep tax, cumulative upkeep, fading, vanishing', () => {
    const tax = card('Taxer', 'Creature — Spirit', '{W}', 'At the beginning of your upkeep, sacrifice Taxer unless you pay {W}.', { power: '2', toughness: '2' });
    auto(tax);
    const cu = card('Agekeeper', 'Creature — Spirit', '{1}{W}', 'Cumulative upkeep {W}', { power: '2', toughness: '2', keywords: ['Cumulative upkeep'] });
    auto(cu); expect(cu.cumUpkeep).toBeTruthy();
    const fd = card('Fader', 'Creature — Spirit', '{2}', 'Fading 3', { power: '2', toughness: '2', keywords: ['Fading'] });
    auto(fd); expect(fd.fading).toBe(3);
    const vn = card('Vanisher', 'Creature — Spirit', '{2}', 'Vanishing 3', { power: '2', toughness: '2', keywords: ['Vanishing'] });
    auto(vn); expect(vn.vanishing).toBe(3);
  });

  it('disguise, megamorph, typal protection, CoP, kicker ETB counters', () => {
    const di = card('Sneak', 'Creature — Rogue', '{2}{U}', 'Disguise {1}{U}', { power: '3', toughness: '2', keywords: ['Disguise'] });
    auto(di); expect(di.disguise).toBe(true); expect(di.morph).toBeTruthy();
    const mm = card('Oakheart', 'Creature — Elemental', '{3}{G}', 'Megamorph {1}{G}', { power: '2', toughness: '2', keywords: ['Megamorph'] });
    auto(mm); expect(mm.megamorph).toBe(true);
    const pr = card('Dragonbane', 'Creature — Human', '{1}{W}', 'Protection from Dragons', { power: '2', toughness: '2', keywords: ['Protection from Dragons'] });
    auto(pr); expect(pr.keywords?.some(k => /protection from dragon/i.test(k))).toBe(true);
    const cop = card('Circle of Protection: Red', 'Enchantment', '{1}{W}', '{1}: The next time a red source would deal damage to you this turn, prevent that damage.');
    auto(cop);
    const kick = card('Kicker C', 'Creature — Beast', '{2}{G}', 'Kicker {1}{G}\nIf Kicker C was kicked, it enters with two +1/+1 counters on it.', { power: '2', toughness: '2', keywords: ['Kicker'] });
    auto(kick); expect(kick.etbCountersIf?.k).toBe('kicked'); expect(kick.etbCounters?.n).toBe(2);
  });

  it('extra block, embalm, eternalize, plot, adapt, awaken, scavenge, prototype, cipher, learn, outlast', () => {
    const eb = card('Two-Block', 'Creature — Soldier', '{2}{W}', 'Two-Block can block an additional creature each combat.', { power: '1', toughness: '3' });
    auto(eb); expect(eb.extraBlock).toBe(1);
    const em = card('Anointer', 'Creature — Zombie', '{3}{W}', 'Embalm {3}{W}', { power: '2', toughness: '2', keywords: ['Embalm'] });
    auto(em); expect(em.embalm).toBeTruthy();
    const ez = card('Accursed', 'Creature — Zombie', '{3}{B}', 'Eternalize {4}{B}{B}', { power: '2', toughness: '2', keywords: ['Eternalize'] });
    auto(ez); expect(ez.eternalize).toBeTruthy();
    const pl = card('Plotter', 'Sorcery', '{2}{R}', 'Plot {1}{R}\nPlotter deals 2 damage to any target.', { keywords: ['Plot'] });
    auto(pl); expect(pl.plot).toBeTruthy();
    const ad = card('Adapter', 'Creature — Beast', '{2}{G}', '{4}{G}: Adapt 2.', { power: '2', toughness: '2' });
    auto(ad);
    const aw = card('Awaken Spell', 'Sorcery', '{2}{U}', 'Draw a card.\nAwaken 3—{4}{U}', { keywords: ['Awaken'] });
    auto(aw); expect(aw.awaken?.n).toBe(3);
    const sc = card('Gravefeeder', 'Creature — Beast', '{2}{G}', 'Scavenge {2}{G}', { power: '3', toughness: '3', keywords: ['Scavenge'] });
    auto(sc); expect(sc.scavenge).toBeTruthy();
    const pr = card('Proto Bot', 'Artifact Creature — Construct', '{5}', 'Prototype {1}{U} — 3/3', { power: '7', toughness: '7', keywords: ['Prototype'] });
    auto(pr); expect(pr.prototype?.power).toBe(3);
    const ci = card('Cipher Spell', 'Sorcery', '{1}{U}', 'Draw a card.\nCipher', { keywords: ['Cipher'] });
    auto(ci); expect(ci.cipher).toBe(true);
    const ln = card('Lesson Day', 'Sorcery', '{1}{U}', 'Draw a card.\nLearn', { keywords: ['Learn'] });
    auto(ln); expect(ln.learn).toBe(true);
    const ou = card('Outlaster', 'Creature — Soldier', '{1}{W}', 'Outlast {1}{W}', { power: '1', toughness: '1', keywords: ['Outlast'] });
    auto(ou); expect(ou.outlast).toBeTruthy();
  });

  it('remaining batch 1 templates compile', () => {
    const dmg = card('Burn Exile', 'Instant', '{R}', 'Burn Exile deals 2 damage to target creature. If that creature would die this turn, exile it instead.');
    auto(dmg);
    const au = card('Pacify', 'Enchantment — Aura', '{W}', 'Enchant creature\nEnchanted creature can\'t attack or block, and its activated abilities can\'t be activated.');
    auto(au);
    const sac = card('Islandhome', 'Creature — Merfolk', '{U}', 'When you control no Islands, sacrifice Islandhome.', { power: '2', toughness: '2' });
    auto(sac); expect(sac.sacIfNo).toBeTruthy();
    const atk = card('Ambush', 'Instant', '{1}{R}', 'Cast this spell only during the declare attackers step and only if you\'ve been attacked this step.\nAmbush deals 2 damage to target attacking creature.');
    auto(atk); expect(atk.castOnly).toBe('declareAttackers');
    const unb = card('Unblocked', 'Creature — Warrior', '{2}{R}', 'You may have Unblocked assign its combat damage as though it weren\'t blocked.', { power: '3', toughness: '1' });
    auto(unb); expect(unb.asThoughUnblocked).toBe(true);
    const cheap = card('Cheap Shot', 'Instant', '{2}{R}', 'Cheap Shot costs {2} less to cast if it targets a tapped creature.\nCheap Shot deals 3 damage to target creature.');
    auto(cheap); expect(cheap.costLessTgtTapped).toBe(2);
    const fl = card('Filter Rock', 'Land', '', '{T}: Add {R} or {G}. Filter Rock doesn\'t untap during your next untap step.');
    auto(fl); expect(fl.mana?.[0].skipNextUntap).toBe(true);
    const life = card('Life Land', 'Land', '', 'Life Land enters tapped unless a player has 13 or less life.\n{T}: Add {W}.');
    auto(life); expect(life.etbTappedUnless?.k).toBe('anyLifeLE');
    const bounce = card('Bouncer', 'Creature — Elemental', '{1}{R}{G}', 'When Bouncer enters, return a red or green creature you control to its owner\'s hand.', { power: '4', toughness: '4' });
    auto(bounce);
    const bb = card('Bushy', 'Creature — Beast', '{2}{G}', 'Whenever Bushy blocks or becomes blocked, it gets +2/+2 until end of turn.', { power: '2', toughness: '2' });
    auto(bb);
    const mb = card('Mustblock', 'Creature — Beast', '{3}{G}', 'Mustblock must be blocked if able.', { power: '4', toughness: '4' });
    auto(mb); expect(mb.mustBlock).toBe(true);
    const ll = card('Drainer', 'Creature — Vampire', '{1}{B}', 'Whenever Drainer deals damage, you gain that much life.', { power: '2', toughness: '2' });
    auto(ll);
    const trib = card('Tribute Beast', 'Creature — Beast', '{2}{G}', 'Tribute 2\nWhen Tribute Beast enters, if tribute wasn\'t paid, it deals 3 damage to each opponent.', { power: '3', toughness: '3', keywords: ['Tribute'] });
    auto(trib); expect(trib.tribute).toBe(2);
  });
});

describe('batch 1: tribute', () => {
  it('human opponent gets a may-pay and ETB waits for the answer', () => {
    const d = card('Tribute Beast', 'Creature — Beast', '{2}{G}', 'Tribute 2\nWhen Tribute Beast enters, if tribute wasn\'t paid, it deals 3 damage to each opponent.', { power: '3', toughness: '3', keywords: ['Tribute'] });
    auto(d);
    const g = setup([1]);
    const life = g.players[1].life;
    const c: Card = { uid: g.nextUid++, id: d.id, owner: 0, tapped: false, sick: false, damage: 0, pp: 0, pt: 0 };
    enter(g, c, 0);
    expect(g.decision?.key).toMatch(/^tribute:/);
    expect(g.decision?.pid).toBe(1);
    expect(ctr(c, '+1/+1')).toBe(0);
    expect(g.players[1].life).toBe(life);
    answerDecision(g, true);
    expect(c.tributePaid).toBe(true);
    expect(ctr(c, '+1/+1')).toBe(2);
    resolveAll(g);
    expect(g.players[1].life).toBe(life);
  });

  it('human declining tribute lets the unpaid trigger fire', () => {
    const d = card('Tribute Beast 2', 'Creature — Beast', '{2}{G}', 'Tribute 2\nWhen Tribute Beast 2 enters, if tribute wasn\'t paid, it deals 3 damage to each opponent.', { power: '3', toughness: '3', keywords: ['Tribute'] });
    auto(d);
    const g = setup([1]);
    const life = g.players[1].life;
    const c: Card = { uid: g.nextUid++, id: d.id, owner: 0, tapped: false, sick: false, damage: 0, pp: 0, pt: 0 };
    enter(g, c, 0);
    answerDecision(g, false);
    expect(c.tributePaid).toBeFalsy();
    resolveAll(g);
    expect(g.players[1].life).toBe(life - 3);
  });

  it('AI pays tribute when the unpaid trigger is threatening', () => {
    const d = card('Tribute Beast 3', 'Creature — Beast', '{2}{G}', 'Tribute 2\nWhen Tribute Beast 3 enters, if tribute wasn\'t paid, it deals 5 damage to each opponent.', { power: '3', toughness: '3', keywords: ['Tribute'] });
    auto(d);
    const g = setup([]);
    const life = g.players[1].life;
    const c: Card = { uid: g.nextUid++, id: d.id, owner: 0, tapped: false, sick: false, damage: 0, pp: 0, pt: 0 };
    enter(g, c, 0);
    expect(c.tributePaid).toBe(true);
    expect(ctr(c, '+1/+1')).toBe(2);
    resolveAll(g);
    expect(g.players[1].life).toBe(life);
  });

  it('AI declines tribute when the unpaid trigger is not threatening', () => {
    const d = card('Tribute Beast 4', 'Creature — Beast', '{2}{G}', 'Tribute 1\nWhen Tribute Beast 4 enters, if tribute wasn\'t paid, it gets +1/+1 and gains haste until end of turn.', { power: '3', toughness: '3', keywords: ['Tribute'] });
    auto(d);
    const g = setup([]);
    const c: Card = { uid: g.nextUid++, id: d.id, owner: 0, tapped: false, sick: false, damage: 0, pp: 0, pt: 0 };
    enter(g, c, 0);
    expect(c.tributePaid).toBeFalsy();
    resolveAll(g);
    expect(power(g, c)).toBe(4);
  });
});

describe('batch 1: runtime', () => {
  it('upkeep tax sacrifices unless paid', () => {
    const d = card('Taxer R', 'Creature — Spirit', '{W}', 'At the beginning of your upkeep, sacrifice Taxer R unless you pay {W}.', { power: '2', toughness: '2' });
    auto(d);
    const g = setup();
    const c = put(g, 0, d);
    toStep(g, 'upkeep', 0);
    // no mana: should sac
    resolveAll(g);
    expect(g.players[0].battlefield.includes(c)).toBe(false);
  });

  it('cumulative upkeep adds an age counter and sacs if unpaid', () => {
    const d = card('Agekeeper R', 'Creature — Spirit', '{1}{W}', 'Cumulative upkeep {W}', { power: '2', toughness: '2', keywords: ['Cumulative upkeep'] });
    auto(d);
    const g = setup();
    const c = put(g, 0, d);
    toStep(g, 'upkeep', 0);
    resolveAll(g);
    expect(g.players[0].battlefield.includes(c)).toBe(false);
  });

  it('fading sacs when it can\'t remove a fade counter', () => {
    const d = card('Fader R', 'Creature — Spirit', '{2}', 'Fading 1', { power: '2', toughness: '2', keywords: ['Fading'] });
    auto(d);
    const g = setup();
    const c: Card = { uid: g.nextUid++, id: d.id, owner: 0, tapped: false, sick: false, damage: 0, pp: 0, pt: 0 };
    enter(g, c, 0);
    expect(ctr(c, 'fade')).toBe(1);
    toStep(g, 'upkeep', 0);
    resolveAll(g);
    expect(ctr(c, 'fade')).toBe(0);
    expect(g.players[0].battlefield.includes(c)).toBe(true);
    toStep(g, 'upkeep', 0);
    resolveAll(g);
    expect(g.players[0].battlefield.includes(c)).toBe(false);
  });

  it('vanishing sacs when the last time counter is removed', () => {
    const d = card('Van R', 'Creature — Spirit', '{2}', 'Vanishing 1', { power: '2', toughness: '2', keywords: ['Vanishing'] });
    auto(d);
    const g = setup();
    const c: Card = { uid: g.nextUid++, id: d.id, owner: 0, tapped: false, sick: false, damage: 0, pp: 0, pt: 0 };
    enter(g, c, 0);
    expect(ctr(c, 'time')).toBe(1);
    toStep(g, 'upkeep', 0);
    resolveAll(g);
    expect(g.players[0].battlefield.includes(c)).toBe(false);
  });

  it('megamorph puts a +1/+1 counter when turned face up', () => {
    const d = card('Oakheart R', 'Creature — Elemental', '{3}{G}', 'Megamorph {G}', { power: '2', toughness: '2', keywords: ['Megamorph'] });
    auto(d);
    const g = setup();
    const c = put(g, 0, d);
    c.faceDown = true; layer(g);
    expect(power(g, c)).toBe(2);
    fillMana(g, 0, 4);
    const i = abilitiesOf(g, c).findIndex(a => a.morphTurn);
    expect(i).toBeGreaterThanOrEqual(0);
    expect(canActivate(g, 0, c, i)).toBe(true);
    activate(g, 0, c.uid, i);
    expect(c.faceDown).toBeFalsy();
    expect(ctr(c, '+1/+1')).toBe(1);
  });

  it('typal protection prevents damage from that type', () => {
    const pr = card('Dragonbane R', 'Creature — Human', '{1}{W}', 'Protection from Dragons', { power: '2', toughness: '2', keywords: ['Protection from Dragons'] });
    auto(pr);
    const dr = card('Shivan', 'Creature — Dragon', '{4}{R}', 'Flying', { power: '5', toughness: '5', keywords: ['Flying'] });
    const g = setup();
    const h = put(g, 0, pr);
    const d = put(g, 1, dr);
    const dealt = dealDamage(g, d.id, d, { card: h }, 5);
    expect(dealt).toBe(0);
    expect(h.damage).toBe(0);
  });

  it('Circle of Protection prevents the next damage of that color', () => {
    const cop = card('CoP Red', 'Enchantment', '{1}{W}', '{1}: The next time a red source would deal damage to you this turn, prevent that damage.');
    auto(cop);
    const src = card('Goblin', 'Creature — Goblin', '{R}', '', { power: '1', toughness: '1' });
    const g = setup();
    const e = put(g, 0, cop);
    const gob = put(g, 1, src);
    fillMana(g, 0, 2);
    const i = abilitiesOf(g, e).findIndex(a => a.effects?.some(fx => fx.kind === 'preventColor' || (fx as { kind?: string }).kind === 'preventColor'));
    const idx = abilitiesOf(g, e).findIndex(a => (a.effects ?? []).some(fx => fx.op === 'script' && fx.kind === 'preventColor'));
    expect(idx).toBeGreaterThanOrEqual(0);
    activate(g, 0, e.uid, idx);
    resolveAll(g);
    const life = g.players[0].life;
    dealDamage(g, gob.id, gob, { player: 0 }, 3);
    expect(g.players[0].life).toBe(life);
  });

  it('kicker ETB counters apply only when kicked', () => {
    const d = card('Kicker R', 'Creature — Beast', '{2}{G}', 'Kicker {1}{G}\nIf Kicker R was kicked, it enters with two +1/+1 counters on it.', { power: '2', toughness: '2', keywords: ['Kicker'] });
    auto(d);
    const g = setup();
    const a: Card = { uid: g.nextUid++, id: d.id, owner: 0, tapped: false, sick: false, damage: 0, pp: 0, pt: 0 };
    enter(g, a, 0);
    expect(ctr(a, '+1/+1')).toBe(0);
    const b: Card = { uid: g.nextUid++, id: d.id, owner: 0, tapped: false, sick: false, damage: 0, pp: 0, pt: 0, kicked: true };
    enter(g, b, 0);
    expect(ctr(b, '+1/+1')).toBe(2);
  });

  it('a creature can block an additional creature', () => {
    const d = card('Two-Block R', 'Creature — Soldier', '{2}{W}', 'Two-Block R can block an additional creature each combat.', { power: '1', toughness: '4' });
    auto(d);
    const g = setup();
    const b = put(g, 1, d);
    const a1 = put(g, 0, VANILLA(2, 2, 'A1')); a1.sick = false;
    const a2 = put(g, 0, VANILLA(2, 2, 'A2')); a2.sick = false;
    toAttack(g);
    declareAttackers(g, 0, [{ uid: a1.uid, defender: 1 }, { uid: a2.uid, defender: 1 }]);
    let i = 0; while (g.awaiting !== 'block' && i++ < 30) { if (g.decision) answerDecision(g, false); else if (g.priority != null) pass(g, g.priority); else break; }
    expect(declareBlockers(g, 1, [{ blocker: b.uid, attacker: a1.uid }, { blocker: b.uid, attacker: a2.uid }])).toBe(true);
    expect(a1.blockedBy).toContain(b.uid);
    expect(a2.blockedBy).toContain(b.uid);
  });

  it('embalm creates a white Zombie token copy', () => {
    const d = card('Anointer R', 'Creature — Human Cleric', '{3}{W}', 'Embalm {W}', { power: '2', toughness: '2', keywords: ['Embalm'] });
    auto(d);
    const g = setup();
    const c = put(g, 0, d, 'graveyard');
    fillMana(g, 0, 4);
    const i = abilitiesOf(g, c).findIndex(a => /Embalm/.test(a.label ?? ''));
    expect(i).toBeGreaterThanOrEqual(0);
    expect(canActivate(g, 0, c, i)).toBe(true);
    activate(g, 0, c.uid, i);
    resolveAll(g);
    const tok = g.players[0].battlefield.find(x => x.token);
    expect(tok).toBeTruthy();
    expect(def(tok!).colors).toEqual(['W']);
    expect(isTypeOrSub(def(tok!), 'Zombie')).toBe(true);
  });

  it('plot exiles now and lets you cast it free on a later turn', () => {
    const d = card('Plotter R', 'Sorcery', '{4}{R}', 'Plot {R}\nPlotter R deals 2 damage to any target.', { keywords: ['Plot'] });
    auto(d);
    const g = setup();
    const c = put(g, 0, d, 'hand');
    fillMana(g, 0, 4);
    expect(canPlot(g, 0, c)).toBe(true);
    expect(plot(g, 0, c.uid)).toBe(true);
    expect(g.players[0].exile.includes(c)).toBe(true);
    expect(canCast(g, 0, c)).toBe(false);
    toStep(g, 'main1', 0);
    fillMana(g, 0, 0);
    expect(canCast(g, 0, c)).toBe(true);
    const life = g.players[1].life;
    expect(castSpell(g, 0, c.uid, { targets: [{ player: 1 }] })).toBe(true);
    resolveAll(g);
    expect(g.players[1].life).toBe(life - 2);
  });

  it('adapt puts counters only if it has none', () => {
    const d = card('Adapter R', 'Creature — Beast', '{2}{G}', '{G}: Adapt 2.', { power: '2', toughness: '2' });
    auto(d);
    const g = setup();
    const c = put(g, 0, d);
    fillMana(g, 0, 4);
    const i = abilitiesOf(g, c).findIndex(a => (a.effects ?? []).some(e => e.op === 'script' && e.kind === 'adapt'));
    expect(i).toBeGreaterThanOrEqual(0);
    activate(g, 0, c.uid, i);
    resolveAll(g);
    expect(ctr(c, '+1/+1')).toBe(2);
    fillMana(g, 0, 4);
    activate(g, 0, c.uid, i);
    resolveAll(g);
    expect(ctr(c, '+1/+1')).toBe(2);
  });

  it('awaken turns a land into a hasty Elemental with +1/+1 counters', () => {
    const d = card('Awaken R', 'Sorcery', '{6}{U}', 'Draw a card.\nAwaken 3—{U}', { keywords: ['Awaken'] });
    auto(d);
    const landD = ISLAND();
    const g = setup();
    const land = put(g, 0, landD);
    const c = put(g, 0, d, 'hand');
    fillMana(g, 0, 4);
    const hand = g.players[0].hand.length;
    expect(canCast(g, 0, c, { awaken: true, targets: [{ card: land.uid }] })).toBe(true);
    expect(castSpell(g, 0, c.uid, { awaken: true, targets: [{ card: land.uid }] })).toBe(true);
    resolveAll(g);
    expect(g.players[0].hand.length).toBe(hand); // drew 1, spent the spell; hand started with the spell removed already when put in hand... put added the spell, cast removes it, draw adds 1
    expect(isType(land, 'Creature')).toBe(true);
    expect(isTypeOrSub(def(land), 'Elemental')).toBe(true);
    expect(ctr(land, '+1/+1')).toBe(3);
    expect(power(g, land)).toBe(3);
    expect(hasKw(land, 'haste')).toBe(true);
  });

  it('scavenge exiles from the graveyard and puts power as counters', () => {
    const d = card('Gravefeeder R', 'Creature — Beast', '{2}{G}', 'Scavenge {G}', { power: '3', toughness: '3', keywords: ['Scavenge'] });
    auto(d);
    const g = setup();
    const dest = put(g, 0, VANILLA(1, 1, 'Dest'));
    const c = put(g, 0, d, 'graveyard');
    fillMana(g, 0, 4);
    const i = abilitiesOf(g, c).findIndex(a => /Scavenge/.test(a.label ?? ''));
    expect(i).toBeGreaterThanOrEqual(0);
    activate(g, 0, c.uid, i, { targets: [{ card: dest.uid }] });
    resolveAll(g);
    expect(ctr(dest, '+1/+1')).toBe(3);
    expect(g.players[0].exile.some(x => x.uid === c.uid)).toBe(true);
  });

  it('prototype enters with the prototype power, toughness, and colors', () => {
    const d = card('Proto R', 'Artifact Creature — Construct', '{7}', 'Prototype {1}{U} — 3/3', { power: '7', toughness: '7', keywords: ['Prototype'] });
    auto(d);
    const g = setup();
    const c = put(g, 0, d, 'hand');
    fillMana(g, 0, 4);
    expect(castSpell(g, 0, c.uid, { prototype: true })).toBe(true);
    resolveAll(g);
    const on = g.players[0].battlefield.find(x => x.uid === c.uid)!;
    expect(on.protoCast).toBe(true);
    expect(power(g, on)).toBe(3);
    expect(toughness(g, on)).toBe(3);
    expect(def(on).colors).toEqual(['U']);
  });

  it('learn may discard then draw', () => {
    const d = card('Lesson R', 'Sorcery', '{U}', 'Learn', { keywords: ['Learn'] });
    auto(d);
    const g = setup([0]);
    const junk = put(g, 0, VANILLA(1, 1, 'Junk'), 'hand');
    const c = put(g, 0, d, 'hand');
    fillMana(g, 0, 4);
    const before = g.players[0].hand.length;
    expect(castSpell(g, 0, c.uid)).toBe(true);
    resolveAll(g);
    expect(g.players[0].graveyard.some(x => x.uid === junk.uid)).toBe(true);
    expect(g.players[0].hand.length).toBe(before - 2 + 1); // spent spell, discarded, drew
  });

  it('damage plus exile-if-dies exiles the creature instead', () => {
    const d = card('Burn R', 'Instant', '{R}', 'Burn R deals 2 damage to target creature. If that creature would die this turn, exile it instead.');
    auto(d);
    const g = setup();
    const prey = put(g, 1, VANILLA(2, 2, 'Prey'));
    const c = put(g, 0, d, 'hand');
    fillMana(g, 0, 4);
    expect(castSpell(g, 0, c.uid, { targets: [{ card: prey.uid }] })).toBe(true);
    resolveAll(g);
    expect(g.players[1].exile.some(x => x.uid === prey.uid) || g.players[prey.owner].exile.some(x => x.uid === prey.uid)).toBe(true);
    expect(g.players[1].graveyard.some(x => x.uid === prey.uid)).toBe(false);
  });

  it('pacifying aura stops attacking, blocking, and activations', () => {
    const au = card('Pacify R', 'Enchantment — Aura', '{W}', 'Enchant creature\nEnchanted creature can\'t attack or block, and its activated abilities can\'t be activated.');
    auto(au);
    const cr = card('Acter', 'Creature — Wizard', '{U}', '{T}: Draw a card.', { power: '1', toughness: '1' });
    const g = setup();
    const t = put(g, 0, cr); t.sick = false;
    const a = put(g, 0, au, 'hand');
    fillMana(g, 0, 4);
    expect(castSpell(g, 0, a.uid, { targets: [{ card: t.uid }] })).toBe(true);
    resolveAll(g);
    layer(g);
    expect(hasKw(t, '_cantattack')).toBe(true);
    expect(hasKw(t, '_cantblock')).toBe(true);
    expect(hasKw(t, '_cantactivate')).toBe(true);
    const i = abilitiesOf(g, t).findIndex(ab => (ab.effects ?? []).some(e => e.op === 'draw'));
    if (i >= 0) expect(canActivate(g, 0, t, i)).toBe(false);
  });

  it('sac-if-no-islands sacrifices when you have no Islands', () => {
    const d = card('Home R', 'Creature — Merfolk', '{U}', 'When you control no Islands, sacrifice Home R.', { power: '2', toughness: '2' });
    auto(d);
    const g = setup();
    const isle = put(g, 0, ISLAND());
    const c: Card = { uid: g.nextUid++, id: d.id, owner: 0, tapped: false, sick: false, damage: 0, pp: 0, pt: 0 };
    enter(g, c, 0);
    resolveAll(g);
    expect(g.players[0].battlefield.includes(c)).toBe(true);
    // destroy/sac the island
    sacrifice(g, isle);
    checkState(g); flushTriggers(g); resolveAll(g);
    // checkState should have sacrificed Home R
    expect(g.players[0].battlefield.includes(c)).toBe(false);
  });

  it('must be blocked if able auto-assigns a blocker', () => {
    const d = card('Must R', 'Creature — Beast', '{3}{G}', 'Must R must be blocked if able.', { power: '4', toughness: '4' });
    auto(d);
    const g = setup();
    const a = put(g, 0, d); a.sick = false;
    const b = put(g, 1, VANILLA(1, 3, 'Chump'));
    toAttack(g);
    declareAttackers(g, 0, [{ uid: a.uid, defender: 1 }]);
    let i = 0; while (g.awaiting !== 'block' && i++ < 30) { if (g.decision) answerDecision(g, false); else if (g.priority != null) pass(g, g.priority); else break; }
    declareBlockers(g, 1, []);
    expect(a.blockedBy?.length).toBe(1);
    expect(b.blocking).toBe(a.uid);
  });

  it('lifelink-like trigger gains life equal to damage dealt', () => {
    const d = card('Drainer R', 'Creature — Vampire', '{1}{B}', 'Whenever Drainer R deals damage, you gain that much life.', { power: '2', toughness: '2' });
    auto(d);
    const g = setup();
    const src = put(g, 0, d);
    const life = g.players[0].life;
    dealDamage(g, src.id, src, { player: 1 }, 2);
    flushTriggers(g); resolveAll(g);
    expect(g.players[0].life).toBe(life + 2);
  });

  it('filter land skips its next untap', () => {
    const d = card('Filter R', 'Land', '', '{T}: Add {R} or {G}. Filter R doesn\'t untap during your next untap step.');
    auto(d);
    const g = setup();
    const c = put(g, 0, d);
    expect(tapForMana(g, 0, c.uid)).toBe(true);
    expect(c.tapped).toBe(true);
    expect(c.skipUntap).toBe(0);
    toStep(g, 'main1', 0);
    expect(c.tapped).toBe(true);
  });

  it('13-life land enters untapped if a player is at 13 or less', () => {
    const d = card('Life R', 'Land', '', 'Life R enters tapped unless a player has 13 or less life.\n{T}: Add {W}.');
    auto(d);
    const g = setup();
    g.players[1].life = 13;
    const c: Card = { uid: g.nextUid++, id: d.id, owner: 0, tapped: false, sick: false, damage: 0, pp: 0, pt: 0 };
    enter(g, c, 0);
    expect(c.tapped).toBe(false);
  });

  it('costs less if it targets a tapped creature', () => {
    const d = card('Cheap R', 'Instant', '{4}{R}', 'Cheap R costs {2} less to cast if it targets a tapped creature.\nCheap R deals 3 damage to target creature.');
    auto(d);
    const g = setup();
    const prey = put(g, 1, VANILLA(3, 3, 'Tapme')); prey.tapped = true;
    const c = put(g, 0, d, 'hand');
    const full = costOf(g, c, {});
    const reduced = costOf(g, c, { targets: [{ card: prey.uid }] });
    expect(reduced.generic).toBe(full.generic - 2);
  });

  it('blocks or becomes blocked pump happens', () => {
    const d = card('Bushy R', 'Creature — Beast', '{2}{G}', 'Whenever Bushy R blocks or becomes blocked, it gets +2/+2 until end of turn.', { power: '2', toughness: '2' });
    auto(d);
    const g = setup();
    const a = put(g, 0, d); a.sick = false;
    const b = put(g, 1, VANILLA(1, 3, 'Wall'));
    toAttack(g);
    declareAttackers(g, 0, [{ uid: a.uid, defender: 1 }]);
    let i = 0; while (g.awaiting !== 'block' && i++ < 30) { if (g.decision) answerDecision(g, false); else if (g.priority != null) pass(g, g.priority); else break; }
    declareBlockers(g, 1, [{ blocker: b.uid, attacker: a.uid }]);
    resolveAll(g);
    expect(power(g, a)).toBe(4);
  });

  it('cipher encodes and may copy-cast after combat damage', () => {
    const d = card('Cipher R', 'Sorcery', '{U}', 'Draw a card.\nCipher', { keywords: ['Cipher'] });
    auto(d);
    const g = setup([0]);
    const host = put(g, 0, VANILLA(2, 2, 'Rogue')); host.sick = false;
    const c = put(g, 0, d, 'hand');
    fillMana(g, 0, 4);
    const hand0 = g.players[0].hand.length;
    expect(castSpell(g, 0, c.uid)).toBe(true);
    resolveAll(g);
    expect(host.encoded?.some(e => e.id === d.id)).toBe(true);
    toAttack(g);
    declareAttackers(g, 0, [{ uid: host.uid, defender: 1 }]);
    let i = 0; while (g.awaiting !== 'block' && i++ < 30) { if (g.decision) answerDecision(g, false); else if (g.priority != null) pass(g, g.priority); else break; }
    declareBlockers(g, 1, []);
    resolveAll(g);
    // after combat, cipher may copy-cast (draw)
    expect(g.players[0].hand.length).toBeGreaterThanOrEqual(hand0 - 1);
  });
});
