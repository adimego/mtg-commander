import { describe, it, expect } from 'vitest';
import { compileScry } from '../src/import/classify';
import { loadPrecons, isOfficialPrecon } from '../src/import/precons';
import {
  def, newGame, startGame, canBeCommander, ctr, pass, answerDecision, layer,
  registerCards, emit, costOf, flushTriggers, power, toughness, enter, condOk,
} from '../src/engine/engine';
import type { Game, Card } from '../src/engine/engine';
import type { CardDef } from '../src/engine/types';
import type { ScryCard } from '../src/import/scryfall';
import preconData from '../src/data/precons.json';

const cards = (preconData as unknown as { cards: Record<string, ScryCard> }).cards;
const ps = loadPrecons();
const fdc = ps.filter(p => p.set === 'FDC');
const deck = (name: string) => ps.find(p => p.name === name)!;

const CMDS = [
  'Giada, Font of Hope',
  'Sai, Master Thopterist',
  'Ghoulcaller Gisa',
  'Lathliss, Dragon Queen',
  'Ghalta, Primal Hunger',
];

const NAMES: Record<string, string> = {
  'Calling All Angels': 'Giada, Font of Hope',
  'Keen Engineering': 'Sai, Master Thopterist',
  'Wretched Ranks': 'Ghoulcaller Gisa',
  'Reign of Dragons': 'Lathliss, Dragon Queen',
  'Tramplesaurus Rex': 'Ghalta, Primal Hunger',
};

function compile(name: string) {
  const cl = compileScry(cards[name]);
  expect(cl.support, `${name}: ${JSON.stringify(cl.unparsed)}`).toBe('auto');
  return cl.def;
}

function setup(): Game {
  const g = newGame({ seed: 7, humans: [], skipAiMulligan: true });
  for (const p of g.players) { p.library.push(...p.hand); p.hand = []; }
  startGame(g); let i = 0; while (!(g.step === 'main1' && !g.stack.length && g.active === 0) && i++ < 80) { if (g.decision) answerDecision(g, false); else pass(g, g.priority!); }
  for (const p of g.players) { p.library.push(...p.hand); p.hand = []; p.battlefield = []; }
  return g;
}
function put(g: Game, pid: number, d: CardDef): Card {
  const c: Card = { uid: g.nextUid++, id: d.id, owner: pid, tapped: false, sick: false, damage: 0, pp: 0, pt: 0 };
  g.players[pid].battlefield.push(c); layer(g); return c;
}
function resolveAI(g: Game) {
  let i = 0;
  while ((g.stack.length || g.decision || g.choice || g.pending.length || g.res) && i++ < 80) {
    if (g.decision) {
      if (g.decision.kind === 'may') answerDecision(g, false);
      else if (g.decision.kind === 'pick') answerDecision(g, (g.decision.cards ?? []).slice(0, g.decision.min ?? 0).map((c: Card) => c.uid));
      else if (g.decision.kind === 'color') answerDecision(g, g.decision.options?.[0]);
      else answerDecision(g, false);
    } else if (g.priority != null) pass(g, g.priority);
    else break;
  }
}

const ANGEL: CardDef = { id: 'fdc-test-angel', name: 'Test Angel', types: ['Creature'], sub: ['Angel'], cost: { generic: 2 }, colors: ['W'], power: 2, toughness: 2, text: '' };
const ZOMBIE: CardDef = { id: 'fdc-test-zombie', name: 'Test Zombie', types: ['Creature'], sub: ['Zombie'], cost: { generic: 1 }, colors: ['B'], power: 2, toughness: 2, text: '' };
const DRAGON: CardDef = { id: 'fdc-test-dragon', name: 'Test Dragon', types: ['Creature'], sub: ['Dragon'], cost: { generic: 3 }, colors: ['R'], power: 3, toughness: 3, text: '' };

describe('Foundations Commander', () => {
  it('all five official FDC decks are 100/100 with one commander each', () => {
    expect(fdc.map(p => p.name).sort()).toEqual(Object.keys(NAMES).sort());
    for (const p of fdc) {
      expect(isOfficialPrecon(p)).toBe(true);
      expect(p.setName).toBe('Foundations Commander');
      expect(p.released).toBe('2026-10-02');
      expect(p.supported, `${p.name}: ${p.unsupported.join(', ')}`).toBe(100);
      expect(p.unsupported).toEqual([]);
      expect(1 + (p.extra?.length ?? 0) + p.cards.length).toBe(100);
      expect(p.commander).toBeTruthy();
      expect(p.extra?.length ?? 0).toBe(0);
      expect(def({ id: p.commander }).name).toBe(NAMES[p.name]);
    }
  });

  it('all five commanders compile with auto support and are legal commanders', () => {
    for (const name of CMDS) {
      const d = compile(name);
      expect(canBeCommander(d)).toBe(true);
    }
  });

  it('gift: Scrapshooter and Consumed by Greed promise a card, with a promised-gift condition', () => {
    const s = compile('Scrapshooter');
    expect(s.gift).toBe('card');
    expect(s.triggers?.some(t => t.ifc?.k === 'giftPromised')).toBe(true);
    const c = compile('Consumed by Greed');
    expect(c.gift).toBe('card');
    const g = setup();
    const card: Card = { uid: g.nextUid++, id: s.id, owner: 0, tapped: false, sick: false, damage: 0, pp: 0, pt: 0, giftPromised: true, giftTo: 1 };
    expect(condOk(g, 0, { k: 'giftPromised' }, card)).toBe(true);
    const bare: Card = { uid: g.nextUid++, id: s.id, owner: 0, tapped: false, sick: false, damage: 0, pp: 0, pt: 0 };
    expect(condOk(g, 0, { k: 'giftPromised' }, bare)).toBe(false);
  });

  it('dethrone: Scourge of the Throne gets a +1/+1 counter when attacking the player with the most life', () => {
    const d = compile('Scourge of the Throne');
    expect(d.dethrone).toBe(true);
    expect(d.triggers?.some(t => t.label === 'Dethrone' && t.ifc?.k === 'atkMostLife')).toBe(true);
    registerCards([d]);
    const g = setup();
    g.players[0].life = 30;
    g.players[1].life = 40;
    const c = put(g, 0, d);
    c.attacking = 1;
    emit(g, 'attacks', { player: 0 }, c);
    flushTriggers(g);
    resolveAI(g);
    expect(ctr(c, '+1/+1')).toBe(1);
  });

  it('mana escalate: Collective Resistance costs {G} for each mode beyond the first', () => {
    const d = compile('Collective Resistance');
    expect(d.escalateCost).toEqual({ generic: 0, G: 1 });
    expect(d.spell?.modes?.escalateCost).toEqual({ generic: 0, G: 1 });
    registerCards([d]);
    const g = setup();
    const c: Card = { uid: g.nextUid++, id: d.id, owner: 0, tapped: false, sick: false, damage: 0, pp: 0, pt: 0 };
    g.players[0].hand.push(c);
    const one = costOf(g, c, { modes: [0] });
    const two = costOf(g, c, { modes: [0, 1] });
    expect(one.generic).toBe(1);
    expect(one.G ?? 0).toBe(1);
    expect(two.generic).toBe(1);
    expect(two.G ?? 0).toBe(2);
  });

  it("Giada: other Angels enter with +1/+1 for each Angel you already control", () => {
    registerCards([ANGEL]);
    const g = setup();
    const giada = put(g, 0, compile('Giada, Font of Hope'));
    expect(def(giada).statics?.some(s => s.k === 'etbTypalCtr')).toBe(true);
    const a: Card = { uid: g.nextUid++, id: ANGEL.id, owner: 0, tapped: false, sick: true, damage: 0, pp: 0, pt: 0 };
    enter(g, a, 0, {});
    expect(ctr(a, '+1/+1')).toBe(1);
    const b: Card = { uid: g.nextUid++, id: ANGEL.id, owner: 0, tapped: false, sick: true, damage: 0, pp: 0, pt: 0 };
    enter(g, b, 0, {});
    expect(ctr(b, '+1/+1')).toBe(2);
  });

  it('Dragonstorm Globe: Dragons enter with an additional +1/+1 counter', () => {
    registerCards([DRAGON]);
    const g = setup();
    put(g, 0, compile('Dragonstorm Globe'));
    const d: Card = { uid: g.nextUid++, id: DRAGON.id, owner: 0, tapped: false, sick: true, damage: 0, pp: 0, pt: 0 };
    enter(g, d, 0, {});
    expect(ctr(d, '+1/+1')).toBe(1);
  });

  it("Soulless One's power and toughness equal Zombies on the battlefield plus Zombie cards in all graveyards", () => {
    registerCards([ZOMBIE]);
    const g = setup();
    const s = put(g, 0, compile('Soulless One'));
    // itself is a Zombie
    expect(power(g, s)).toBe(1);
    expect(toughness(g, s)).toBe(1);
    put(g, 0, ZOMBIE);
    layer(g);
    expect(power(g, s)).toBe(2);
    const z: Card = { uid: g.nextUid++, id: ZOMBIE.id, owner: 1, tapped: false, sick: false, damage: 0, pp: 0, pt: 0 };
    g.players[1].graveyard.push(z);
    layer(g);
    expect(power(g, s)).toBe(3);
    expect(toughness(g, s)).toBe(3);
  });
});
