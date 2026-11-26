import { describe, it, expect } from 'vitest';
import { compileScry } from '../src/import/classify';
import type { ScryCard } from '../src/import/scryfall';
import {
  newGame, startGame, Game, Card, registerCards, pass, answerDecision,
  destroy, offBfEff, flushTriggers, layer, enter, dealDamage,
  addCounters, gainLife, draw, checkState, castSpell, declareAttackers,
  declareBlockers, defenders, def, power, toughness, ctr, activate,
} from '../src/engine/engine';
import type { CardDef } from '../src/engine/types';
import '../src/engine/ai';

const sc = (over: Partial<ScryCard> & Pick<ScryCard, 'name' | 'type_line' | 'oracle_text'>): ScryCard => ({
  color_identity: over.color_identity ?? [], keywords: over.keywords ?? [], colors: over.colors ?? [],
  mana_cost: over.mana_cost ?? '', ...over,
});

let n = 0;
function card(name: string, type_line: string, mana_cost: string, oracle_text: string, o: Partial<ScryCard> = {}): CardDef {
  const cl = compileScry({ name, type_line, mana_cost, oracle_text, colors: [], color_identity: [], keywords: [], ...o });
  const d = { ...cl.def, id: `p4c-${++n}-${cl.def.id}` }; registerCards([d]);
  expect(cl.support, JSON.stringify({ name, unparsed: cl.unparsed, asEnters: cl.def.asEnters, triggers: cl.def.triggers?.map(t => ({ ev: t.ev, evF: t.evF, ifc: t.ifc, effects: t.effects })) })).toBe('auto');
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
function put(g: Game, pid: number, d: CardDef): Card { const c = mk(g, pid, d); g.players[pid].battlefield.push(c); layer(g); return c; }
function until(g: Game, pred: () => boolean, max = 200) {
  for (const p of g.players) p.human = false;
  let i = 0;
  while (!pred() && i++ < max) {
    if (g.decision) answerDecision(g, false);
    else if (g.awaiting === 'block') {
      const left = defenders(g).filter(d => !g.blockersDone.includes(d));
      if (left.length) declareBlockers(g, left[0], []);
      else if (g.priority != null) pass(g, g.priority);
      else { flushTriggers(g); checkState(g); }
    } else if (g.awaiting === 'attack') declareAttackers(g, g.active, []);
    else if (g.priority != null) pass(g, g.priority);
    else { flushTriggers(g); checkState(g); }
  }
  return pred();
}

const BEAR = () => card('P4C Bear', 'Creature — Bear', '{1}{G}', '', { power: '2', toughness: '2', colors: ['G'] });
const OX = () => card('P4C Ox', 'Creature — Ox', '{4}{G}', '', { power: '6', toughness: '6', colors: ['G'] });
const WALL = () => card('P4C Wall', 'Creature — Wall', '{1}{W}', 'Defender', { power: '0', toughness: '5', colors: ['W'], keywords: ['defender'] });

describe('P4 enters as a copy (CR 707)', () => {
  it('parses “you may have ~ enter as a copy of any creature on the battlefield” and the AI copies the best creature', () => {
    const d = card('P4C Clone', 'Creature — Shapeshifter', '{3}{U}', 'You may have P4C Clone enter as a copy of any creature on the battlefield.', { power: '0', toughness: '0', colors: ['U'] });
    expect(d.asEnters?.[0]).toMatchObject({ op: 'enterCopy', may: true, zone: 'battlefield' });
    expect(d.asEnters?.[0].f).toMatchObject({ types: ['Creature'] });
    const g = setup();
    const bear = put(g, 0, BEAR());
    const ox = put(g, 0, OX());
    const cl = mk(g, 0, d); g.players[0].hand.push(cl); g.players[0].pool.push('U', 'C', 'C', 'C');
    expect(castSpell(g, 0, cl.uid)).toBe(true);
    expect(until(g, () => !g.stack.length && !g.res && !g.decision && !g.pending.length)).toBe(true);
    expect(def(cl).name).toBe(def(ox).name);
    expect(power(g, cl)).toBe(6);
    expect(def(cl).name).not.toBe(def(bear).name);
  });

  it('applies typal “except” additions and “isn\'t legendary” (copiable values, not a pump)', () => {
    const d = card('P4C Mimic', 'Creature — Shapeshifter Rogue', '{2}{U}', "You may have P4C Mimic enter as a copy of a creature you control, except it's a Shapeshifter Rogue in addition to its other types and it isn't legendary.", { power: '2', toughness: '1', colors: ['U'] });
    expect(d.asEnters?.[0].except).toMatchObject({ addSub: ['Shapeshifter', 'Rogue'], nonlegendary: true });
    const g = setup();
    const ox = put(g, 0, card('P4C Legend Ox', 'Legendary Creature — Ox', '{4}{G}', '', { power: '6', toughness: '6', colors: ['G'] }));
    const cl = mk(g, 0, d); g.players[0].hand.push(cl); g.players[0].pool.push('U', 'C', 'C');
    expect(castSpell(g, 0, cl.uid)).toBe(true);
    expect(until(g, () => !g.stack.length && !g.res && !g.decision && !g.pending.length)).toBe(true);
    expect(power(g, cl)).toBe(6);
    expect(def(cl).legendary).toBe(false);
    expect(def(cl).sub).toEqual(expect.arrayContaining(['Ox', 'Shapeshifter', 'Rogue']));
    expect(g.players[0].battlefield).toContain(ox);
    expect(g.players[0].battlefield).toContain(cl);
  });

  it('fails closed on a quoted-ability except clause', () => {
    const cl = compileScry(sc({
      name: 'P4C Bad Clone', type_line: 'Creature — Shapeshifter', mana_cost: '{3}{U}',
      oracle_text: 'You may have P4C Bad Clone enter as a copy of any creature on the battlefield, except it has "At the beginning of your upkeep, sacrifice this creature."',
      power: '0', toughness: '0', colors: ['U'],
    }));
    expect(cl.support).not.toBe('auto');
    expect(cl.def.asEnters).toBeUndefined();
  });
});

describe('P4 becomes a copy', () => {
  it('parses and applies an eot copy that isn\'t legendary', () => {
    const d = card('P4C Doppel', 'Creature — Shapeshifter', '{1}{U}', "{1}: P4C Doppel becomes a copy of target creature until end of turn, except it isn't legendary.", { power: '0', toughness: '1', colors: ['U'] });
    expect(d.abilities?.[0].effects[0]).toMatchObject({ op: 'becomesCopy', eot: true, except: { nonlegendary: true } });
    const g = setup();
    const self = put(g, 0, d);
    const ox = put(g, 1, card('P4C Royal Ox', 'Legendary Creature — Ox', '{4}{G}', '', { power: '6', toughness: '6', colors: ['G'] }));
    g.players[0].pool.push('C');
    expect(activate(g, 0, self.uid, 0, { card: ox.uid })).toBe(true);
    expect(until(g, () => !g.stack.length && !g.res && !g.decision && !g.pending.length)).toBe(true);
    expect(power(g, self)).toBe(6);
    expect(def(self).legendary).toBe(false);
  });
});

describe('P4 end-of-combat triggers', () => {
  it('keeps blockedBy through the end-of-combat step until delayed “destroy that creature” resolves', () => {
    const d = card('P4C Basilisk', 'Creature — Basilisk', '{1}{G}', 'Whenever P4C Basilisk blocks or becomes blocked by a creature, destroy that creature at end of combat.', { power: '2', toughness: '3', colors: ['G'] });
    expect(d.triggers?.some(t => t.ev === 'blockedBy' || t.ev === 'blocks')).toBe(true);
    expect(d.triggers?.[0].effects[0].op).toBe('delayEoc');
    const g = setup();
    const bas = put(g, 0, d); bas.sick = false;
    const prey = put(g, 1, WALL());
    expect(until(g, () => g.awaiting === 'attack')).toBe(true);
    expect(declareAttackers(g, 0, [{ uid: bas.uid, defender: 1 }])).toBe(true);
    expect(until(g, () => g.awaiting === 'block')).toBe(true);
    expect(declareBlockers(g, 1, [{ blocker: prey.uid, attacker: bas.uid }])).toBe(true);
    // Combat data must still be present when the delayed trigger is queued at end of combat.
    expect(until(g, () => g.step === 'endCombat')).toBe(true);
    expect(bas.blockedBy).toContain(prey.uid);
    expect(until(g, () => g.step === 'main2')).toBe(true);
    expect(g.players[1].battlefield).not.toContain(prey);
    expect(g.players[1].graveyard).toContain(prey);
  });

  it('“at end of combat, if ~ attacked or blocked this combat, remove a +1/+0 counter”', () => {
    const d = card('P4C Clockwork', 'Artifact Creature — Beast', '{4}', 'At end of combat, if P4C Clockwork attacked or blocked this combat, remove a +1/+0 counter from P4C Clockwork.', { power: '0', toughness: '4' });
    expect(d.triggers?.[0]).toMatchObject({ ev: 'endCombat', ifc: { k: 'atkOrBlkCombat' } });
    const g = setup();
    const c = put(g, 0, d); c.sick = false; addCounters(g, c, '+1/+0', 2);
    expect(ctr(c, '+1/+0')).toBe(2);
    expect(until(g, () => g.awaiting === 'attack')).toBe(true);
    expect(declareAttackers(g, 0, [{ uid: c.uid, defender: 1 }])).toBe(true);
    expect(until(g, () => g.step === 'main2')).toBe(true);
    expect(ctr(c, '+1/+0')).toBe(1);
  });

  it('when ~ attacks or blocks, sacrifice it at end of combat', () => {
    const d = card('P4C Reckless', 'Creature — Berserker', '{R}', 'When P4C Reckless attacks or blocks, sacrifice it at end of combat.', { power: '3', toughness: '1', colors: ['R'] });
    const g = setup();
    const c = put(g, 0, d); c.sick = false;
    expect(until(g, () => g.awaiting === 'attack')).toBe(true);
    expect(declareAttackers(g, 0, [{ uid: c.uid, defender: 1 }])).toBe(true);
    expect(until(g, () => g.step === 'main2')).toBe(true);
    expect(g.players[0].battlefield).not.toContain(c);
  });

  it('Greater Werewolf: −0/−2 on each creature blocking or blocked by ~, after combat data is still set', () => {
    const d = card('P4C Werewolf', 'Creature — Werewolf', '{3}{B}', 'At end of combat, put a -0/-2 counter on each creature blocking or blocked by P4C Werewolf.', { power: '2', toughness: '4', colors: ['B'] });
    const g = setup();
    const w = put(g, 0, d); w.sick = false;
    const prey = put(g, 1, WALL());
    expect(until(g, () => g.awaiting === 'attack')).toBe(true);
    expect(declareAttackers(g, 0, [{ uid: w.uid, defender: 1 }])).toBe(true);
    expect(until(g, () => g.awaiting === 'block')).toBe(true);
    expect(declareBlockers(g, 1, [{ blocker: prey.uid, attacker: w.uid }])).toBe(true);
    expect(until(g, () => g.step === 'endCombat')).toBe(true);
    expect(w.blockedBy).toContain(prey.uid);
    expect(until(g, () => g.step === 'main2')).toBe(true);
    expect(g.players[1].battlefield).toContain(prey);
    expect(ctr(prey, '-0/-2')).toBe(1);
    expect(toughness(g, prey)).toBe(3);
  });
});

describe('P4 combat damage to a creature', () => {
  it('emits a per-recipient event and destroys that creature at end of combat', () => {
    const d = card('P4C Stalker', 'Creature — Beast', '{2}{G}', 'Whenever P4C Stalker deals combat damage to a creature, destroy that creature at end of combat.', { power: '3', toughness: '3', colors: ['G'] });
    expect(d.triggers?.[0].ev).toBe('combatDamageCreature');
    const g = setup();
    const s = put(g, 0, d); s.sick = false;
    const prey = put(g, 1, card('P4C Wall', 'Creature — Wall', '{1}{W}', 'Defender', { power: '0', toughness: '5', colors: ['W'], keywords: ['defender'] }));
    expect(until(g, () => g.awaiting === 'attack')).toBe(true);
    expect(declareAttackers(g, 0, [{ uid: s.uid, defender: 1 }])).toBe(true);
    expect(until(g, () => g.awaiting === 'block')).toBe(true);
    expect(declareBlockers(g, 1, [{ blocker: prey.uid, attacker: s.uid }])).toBe(true);
    expect(until(g, () => g.step === 'main2')).toBe(true);
    expect(g.players[1].battlefield).not.toContain(prey);
    expect(g.players[1].graveyard).toContain(prey);
  });
});

describe('P4 phasing keyword and cheap would/instead leftovers', () => {
  it('permanents with phasing phase out at the controller’s untap, then in on the next turn (CR 502.1)', () => {
    const d = card('P4C Teferi Beast', 'Creature — Beast', '{2}{U}', 'Phasing', { power: '2', toughness: '2', colors: ['U'], keywords: ['phasing'] });
    expect(d.keywords).toContain('phasing');
    const g = setup();
    const c = put(g, 0, d);
    expect(g.players[0].battlefield).toContain(c);
    // Next time player 0 begins a turn, it phases out first.
    expect(until(g, () => g.active === 0 && g.step === 'main1' && g.turn > 1)).toBe(true);
    expect(g.players[0].battlefield).not.toContain(c);
    expect(g.players[0].phased).toContain(c);
    const turn = g.turn;
    expect(until(g, () => g.active === 0 && g.step === 'main1' && g.turn > turn)).toBe(true);
    expect(g.players[0].battlefield).toContain(c);
  });

  it('“if you would draw a card while you have no cards in hand, draw two instead”', () => {
    const d = card('P4C Phial', 'Artifact', '{3}', 'If you would draw a card while you have no cards in hand, draw two cards instead.');
    expect(d.replacements?.[0]).toMatchObject({ ev: 'draw', instead: { k: 'mul', n: 2 }, cond: { k: 'noCardsHand' } });
    const g = setup();
    put(g, 0, d);
    g.players[0].hand = [];
    const a = mk(g, 0, BEAR()); const b = mk(g, 0, BEAR());
    g.players[0].library.push(a, b);
    draw(g, 0, 1);
    expect(g.players[0].hand).toEqual(expect.arrayContaining([a, b]));
  });

  it('“if you would gain life while you have 5 or less life, you gain twice that much”', () => {
    const d = card('P4C Lowlife', 'Enchantment', '{1}{W}', 'If you would gain life while you have 5 or less life, you gain twice that much life instead.', { colors: ['W'] });
    expect(d.replacements?.[0]).toMatchObject({ ev: 'gainLife', instead: { k: 'mul', n: 2 }, cond: { k: 'lifeLE', n: 5 } });
    const g = setup();
    put(g, 0, d);
    g.players[0].life = 4;
    gainLife(g, 0, 2);
    expect(g.players[0].life).toBe(8);
  });
});
