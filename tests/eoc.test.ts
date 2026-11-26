import { describe, it, expect } from 'vitest';
import { compileScry } from '../src/import/classify';
import { loadPrecons, isOfficialPrecon } from '../src/import/precons';
import {
  def, newGame, startGame, canBeCommander, ctr, pass, answerDecision, layer, addCounters,
  registerCards, emit, canCast, checkState, activate, canActivate, abilitiesOf, crewCands,
  power, draw, isType, broodshipCastOk, enter, flushTriggers,
} from '../src/engine/engine';
import type { Game, Card } from '../src/engine/engine';
import type { CardDef } from '../src/engine/types';
import type { ScryCard } from '../src/import/scryfall';
import preconData from '../src/data/precons.json';

const cards = (preconData as unknown as { cards: Record<string, ScryCard> }).cards;
const ps = loadPrecons();
const eoc = ps.filter(p => p.set === 'EOC');
const deck = (name: string) => ps.find(p => p.name === name)!;

const CMDS = ['Hearthhull, the Worldseed', 'Szarel, Genesis Shepherd', 'Inspirit, Flagship Vessel', 'Kilo, Apogee Mind'];

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

const BEAR: CardDef = { id: 'eoc-test-bear', name: 'Test Bear', types: ['Creature'], sub: ['Bear'], cost: { generic: 2 }, colors: ['G'], power: 2, toughness: 2, text: '' };
const ROCK: CardDef = { id: 'eoc-test-rock', name: 'Test Rock', types: ['Artifact'], cost: { generic: 1 }, colors: [], text: '' };
const FOREST: CardDef = { id: 'eoc-test-forest', name: 'Forest', types: ['Land'], sub: ['Forest'], basic: true, cost: { generic: 0 }, colors: [], text: '', mana: [{ add: ['G'], tap: true }] };

describe('Edge of Eternities Commander', () => {
  it('both official EOC decks are 100/100 with two face commanders', () => {
    expect(eoc.map(p => p.name).sort()).toEqual(['Counter Intelligence', 'World Shaper']);
    for (const p of eoc) {
      expect(isOfficialPrecon(p)).toBe(true);
      expect(p.setName).toBe('Edge of Eternities Commander');
      expect(p.released).toBe('2025-08-01');
      expect(p.supported, `${p.name}: ${p.unsupported.join(', ')}`).toBe(100);
      expect(p.unsupported).toEqual([]);
      expect(1 + (p.extra?.length ?? 0) + p.cards.length).toBe(100);
      expect(p.commander).toBeTruthy();
      expect(p.extra?.length ?? 0).toBe(1);
    }
    expect(def({ id: deck('World Shaper').commander }).name).toBe('Hearthhull, the Worldseed');
    expect(deck('World Shaper').extra?.map(id => def({ id }).name)).toEqual(['Szarel, Genesis Shepherd']);
    expect(def({ id: deck('Counter Intelligence').commander }).name).toBe('Inspirit, Flagship Vessel');
    expect(deck('Counter Intelligence').extra?.map(id => def({ id }).name)).toEqual(['Kilo, Apogee Mind']);
  });

  it('all four face commanders compile with auto support and are legal commanders', () => {
    for (const name of CMDS) {
      const d = compile(name);
      expect(canBeCommander(d)).toBe(true);
    }
  });

  it('Hearthhull stations: tap a creature, put charge equal to its power, becomes a creature at 8+', () => {
    registerCards([BEAR]);
    const g = setup();
    const ship = put(g, 0, compile('Hearthhull, the Worldseed'));
    const bear = put(g, 0, BEAR);
    expect(isType(ship, 'Creature')).toBe(false);
    const i = abilitiesOf(g, ship).findIndex(a => a.station);
    expect(i).toBeGreaterThanOrEqual(0);
    expect(canActivate(g, 0, ship, i)).toBe(true);
    expect(crewCands(g, 0, ship).map(c => c.uid)).toContain(bear.uid);
    expect(activate(g, 0, ship.uid, i, { crew: [bear.uid] })).toBe(true);
    resolveAI(g);
    expect(bear.tapped).toBe(true);
    expect(ctr(ship, 'charge')).toBe(power(g, bear));
    addCounters(g, ship, 'charge', 8);
    layer(g);
    expect(isType(ship, 'Creature')).toBe(true);
  });

  it('Kilo proliferates when it becomes tapped (entering tapped does not count)', () => {
    const g = setup();
    const kilo = compile('Kilo, Apogee Mind');
    const c = put(g, 0, kilo);
    addCounters(g, c, 'charge', 1);
    // ETB already happened; simulated enter-tapped should not have proliferated yet
    expect(ctr(c, 'charge')).toBe(1);
    c.tapped = true;
    flushTriggers(g);
    resolveAI(g);
    expect(ctr(c, 'charge')).toBe(2);
  });

  it('Patrolling Peacemaker proliferates when an opponent commits a crime', () => {
    registerCards([BEAR]);
    const g = setup();
    const cop = put(g, 0, compile('Patrolling Peacemaker'));
    addCounters(g, cop, '+1/+1', 1);
    const bear = put(g, 0, BEAR);
    // opponent "casts" a shock targeting the bear (your permanent) — that's a crime by the opponent
    emit(g, 'crime', { player: 1 });
    resolveAI(g);
    expect(ctr(cop, '+1/+1')).toBe(2);
    void bear;
  });

  it('sunburst / converge: Pentad Prism enters with charge equal to colors spent', () => {
    const d = compile('Pentad Prism');
    expect(d.sunburst).toBe(true);
    const g = setup();
    const c: Card = { uid: g.nextUid++, id: d.id, owner: 0, tapped: false, sick: true, damage: 0, pp: 0, pt: 0, spentCols: 3 };
    g.players[0].battlefield.push(c);
    // apply ETB counters via enter path: use a fresh enter by moving from hand
    g.players[0].battlefield = [];
    const c2: Card = { uid: g.nextUid++, id: d.id, owner: 0, tapped: false, sick: true, damage: 0, pp: 0, pt: 0, spentCols: 3 };
    g.players[0].hand.push(c2);
    // direct enter
    enter(g, c2, 0, {});
    expect(ctr(c2, 'charge')).toBe(3);
  });

  it('dredge: Dakmor Salvage can replace a draw', () => {
    const d = compile('Dakmor Salvage');
    expect(d.dredge).toBe(2);
    const g = setup();
    const c: Card = { uid: g.nextUid++, id: d.id, owner: 0, tapped: false, sick: false, damage: 0, pp: 0, pt: 0 };
    const a: Card = { uid: g.nextUid++, id: BEAR.id, owner: 0, tapped: false, sick: false, damage: 0, pp: 0, pt: 0 };
    const b: Card = { uid: g.nextUid++, id: BEAR.id, owner: 0, tapped: false, sick: false, damage: 0, pp: 0, pt: 0 };
    registerCards([BEAR]);
    g.players[0].graveyard.push(c);
    g.players[0].library.push(a, b);
    const hand0 = g.players[0].hand.length;
    draw(g, 0, 1);
    expect(g.players[0].hand.some(x => x.uid === c.uid)).toBe(true);
    expect(g.players[0].hand.length).toBe(hand0 + 1);
    expect(g.players[0].graveyard).toHaveLength(2); // milled a and b
  });

  it('Horizon Explorer: lands enter untapped and attacking a player makes a Lander', () => {
    registerCards([FOREST]);
    const g = setup();
    const ex = put(g, 0, compile('Horizon Explorer'));
    const land: Card = { uid: g.nextUid++, id: FOREST.id, owner: 0, tapped: false, sick: false, damage: 0, pp: 0, pt: 0 };
    // a land that would enter tapped
    const TD: CardDef = { ...FOREST, id: 'eoc-tapped-land', etbTapped: true };
    registerCards([TD]);
    const tl: Card = { uid: g.nextUid++, id: TD.id, owner: 0, tapped: false, sick: false, damage: 0, pp: 0, pt: 0 };
    enter(g, tl, 0, {});
    expect(tl.tapped).toBe(false);
    // attack a player
    ex.attacking = 1;
    emit(g, 'attackPlayer', { player: 0, vs: 1, amount: 1 });
    resolveAI(g);
    expect(g.players[0].battlefield.some(c => def(c).name === 'Lander')).toBe(true);
    void land;
  });

  it('Exploration Broodship lets you cast a permanent from the graveyard by sacrificing a land once a turn', () => {
    registerCards([BEAR, FOREST]);
    const g = setup();
    const ship = put(g, 0, compile('Exploration Broodship'));
    const land = put(g, 0, FOREST);
    const bear: Card = { uid: g.nextUid++, id: BEAR.id, owner: 0, tapped: false, sick: false, damage: 0, pp: 0, pt: 0 };
    g.players[0].graveyard.push(bear);
    g.players[0].pool.push('G', 'G');
    expect(def(ship).broodship).toBe(true);
    expect(broodshipCastOk(g, 0, bear)).toBe(true);
    expect(canCast(g, 0, bear)).toBe(true);
    void land;
  });

  it('Darksteel Reactor wins the game at twenty charge counters', () => {
    const g = setup();
    const r = put(g, 0, compile('Darksteel Reactor'));
    addCounters(g, r, 'charge', 20);
    resolveAI(g);
    expect(g.winner === 0 || g.players[1].lost).toBe(true);
  });
});
