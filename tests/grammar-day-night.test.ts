import { describe, it, expect } from 'vitest';
import { compileScry } from '../src/import/classify';
import type { ScryCard } from '../src/import/scryfall';
import {
  newGame, startGame, Game, Card, registerCards, pass, answerDecision,
  offBfEff, flushTriggers, layer, enter, checkState, declareAttackers,
  declareBlockers, defenders, def, setDayNight, activate,
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
  const d = { ...cl.def, id: `dn-${++n}-${cl.def.id}` };
  if (d.back) d.back = { ...d.back, id: d.id + '--back' };
  registerCards([d]);
  expect(cl.support, JSON.stringify({ name, unparsed: cl.unparsed, triggers: cl.def.triggers, abilities: cl.def.abilities, keywords: cl.def.keywords, backKw: cl.def.back?.keywords, backTrig: cl.def.back?.triggers, dayAsEnters: cl.def.dayAsEnters })).toBe('auto');
  return d;
}
function dfc(name: string, faces: [Partial<ScryCard> & { name: string; type_line: string; oracle_text: string }, Partial<ScryCard> & { name: string; type_line: string; oracle_text: string }], mana = '{2}{R}'): CardDef {
  const [a, b] = faces;
  return card(name, `${a.type_line} // ${b.type_line}`, mana, `${a.oracle_text}\n//\n${b.oracle_text}`, {
    layout: 'transform', card_faces: [
      { name: a.name, mana_cost: a.mana_cost ?? mana, type_line: a.type_line, oracle_text: a.oracle_text, power: a.power ?? '2', toughness: a.toughness ?? '2', colors: a.colors ?? ['R'] },
      { name: b.name, type_line: b.type_line, oracle_text: b.oracle_text, power: b.power ?? '4', toughness: b.toughness ?? '4', colors: b.colors ?? ['R'] },
    ],
  } as Partial<ScryCard>);
}
function setup(): Game {
  const g = newGame({ seed: 7, humans: [], skipAiMulligan: true });
  for (const p of g.players) { p.library.push(...p.hand); p.hand = []; }
  startGame(g); let i = 0; while (!(g.step === 'main1' && !g.stack.length && g.active === 0) && i++ < 80) { if (g.decision) answerDecision(g, false); else pass(g, g.priority!); }
  for (const p of g.players) { p.library.push(...p.hand); p.hand = []; p.battlefield = []; }
  return g;
}
const mk = (g: Game, pid: number, d: CardDef): Card => { const c: Card = { uid: g.nextUid++, id: d.id, owner: pid, tapped: false, sick: false, damage: 0, pp: 0, pt: 0 }; offBfEff(c); return c; };
function put(g: Game, pid: number, d: CardDef): Card { const c = mk(g, pid, d); enter(g, c, pid); return c; }
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

const DAYBOUND = () => dfc('DN Stormseeker // DN Slasher', [
  { name: 'DN Stormseeker', type_line: 'Creature — Human Werewolf', oracle_text: 'Daybound\nHaste', power: '2', toughness: '2' },
  { name: 'DN Slasher', type_line: 'Creature — Werewolf', oracle_text: 'Nightbound\nHaste', power: '4', toughness: '4' },
]);
const WERE = () => dfc('DN Ironsmith // DN Ironfang', [
  { name: 'DN Ironsmith', type_line: 'Creature — Human Werewolf', oracle_text: 'First strike\nAt the beginning of each upkeep, if no spells were cast last turn, transform DN Ironsmith.', power: '1', toughness: '1' },
  { name: 'DN Ironfang', type_line: 'Creature — Werewolf', oracle_text: 'First strike\nAt the beginning of each upkeep, if a player has cast two or more spells last turn, transform DN Ironfang.', power: '3', toughness: '1' },
], '{1}{R}');

describe('day/night (CR 732 / 702.145)', () => {
  it('compiles daybound/nightbound DFCs and they start the game as neither', () => {
    const d = DAYBOUND();
    expect(d.keywords).toContain('daybound');
    expect(d.back?.keywords).toContain('nightbound');
    const g = setup();
    expect(g.dayNight).toBeUndefined();
  });

  it('a daybound permanent entering while neither becomes day and stays on its front face', () => {
    const d = DAYBOUND();
    const g = setup();
    const c = put(g, 0, d);
    expect(g.dayNight).toBe('day');
    expect(c.face).toBeUndefined();
    expect(g.log.some(l => /becomes day/i.test(l) && !/night becomes day/i.test(l))).toBe(true);
  });

  it('a daybound DFC enters transformed if it is night', () => {
    const d = DAYBOUND();
    const g = setup();
    setDayNight(g, 'night');
    const c = put(g, 0, d);
    expect(g.dayNight).toBe('night');
    expect(def(c).name).toBe('DN Slasher');
    expect(c.face).toBe(d.id);
  });

  it('becoming night transforms a front-face daybound permanent immediately (not an SBA)', () => {
    const d = DAYBOUND();
    const g = setup();
    const c = put(g, 0, d);
    expect(c.face).toBeUndefined();
    setDayNight(g, 'night');
    expect(c.face).toBe(d.id); expect(def(c).name).toBe('DN Slasher');
    expect(g.log.some(l => /transforms into DN Slasher/.test(l))).toBe(true);
  });

  it('becoming day transforms a back-face nightbound permanent immediately', () => {
    const d = DAYBOUND();
    const g = setup();
    setDayNight(g, 'night');
    const c = put(g, 0, d);
    expect(def(c).name).toBe('DN Slasher');
    setDayNight(g, 'day');
    expect(c.face).toBeUndefined();
  });

  it('going from neither to day does not fire “whenever day becomes night or night becomes day”', () => {
    const d = card('DN Celestus Lite', 'Legendary Artifact', '{3}',
      "If it's neither day nor night, it becomes day as DN Celestus Lite enters.\nWhenever day becomes night or night becomes day, you gain 3 life.");
    expect(d.dayAsEnters).toBe(true);
    expect(d.triggers?.some(t => t.ev === 'dayNight')).toBe(true);
    const g = setup();
    const life = g.players[0].life;
    put(g, 0, d);
    until(g, () => !g.pending.length && !g.stack.length && !g.decision && g.priority != null);
    expect(g.dayNight).toBe('day');
    expect(g.players[0].life).toBe(life);
    setDayNight(g, 'night');
    expect(until(g, () => g.players[0].life === life + 3 && !g.pending.length && !g.stack.length)).toBe(true);
  });

  it('if it is day and the previous active player cast no spells, it becomes night in the next untap step', () => {
    const d = DAYBOUND();
    const g = setup();
    const c = put(g, 0, d);
    expect(g.dayNight).toBe('day');
    g.players[0].spells = { turn: g.turn, n: 0, nonc: 0, isv: 0, ins: 0 };
    const turn = g.turn;
    expect(until(g, () => g.active === 1 && g.step === 'upkeep' && g.turn === turn + 1)).toBe(true);
    expect(g.dayNight).toBe('night');
    expect(def(c).name).toBe('DN Slasher');
  });

  it('if it is night and the previous active player cast two or more spells, it becomes day in the next untap step', () => {
    const d = DAYBOUND();
    const g = setup();
    setDayNight(g, 'night');
    const c = put(g, 0, d);
    expect(def(c).name).toBe('DN Slasher');
    g.players[0].spells = { turn: g.turn, n: 2, nonc: 2, isv: 0, ins: 0 };
    const turn = g.turn;
    expect(until(g, () => g.active === 1 && g.step === 'upkeep' && g.turn === turn + 1)).toBe(true);
    expect(g.dayNight).toBe('day');
    expect(c.face).toBeUndefined();
  });

  it('does not check day/night while it is neither, even if no spells were cast last turn', () => {
    const g = setup();
    expect(g.dayNight).toBeUndefined();
    g.players[0].spells = { turn: g.turn, n: 0, nonc: 0, isv: 0, ins: 0 };
    const turn = g.turn;
    expect(until(g, () => g.active === 1 && g.step === 'upkeep' && g.turn === turn + 1)).toBe(true);
    expect(g.dayNight).toBeUndefined();
  });

  it('The Celestus toggles day and night (and “otherwise” covers neither)', () => {
    const d = card('The Celestus Probe', 'Legendary Artifact', '{3}',
      "If it's neither day nor night, it becomes day as The Celestus Probe enters.\n{3}, {T}: If it's night, it becomes day. Otherwise, it becomes night. Activate only as a sorcery.");
    expect(d.dayAsEnters).toBe(true);
    expect(d.abilities?.[0].effects).toMatchObject([{ op: 'toggleDayNight' }]);
    const g = setup();
    const c = put(g, 0, d);
    expect(g.dayNight).toBe('day');
    c.tapped = false; c.sick = false;
    g.players[0].pool.push('C', 'C', 'C');
    expect(activate(g, 0, c.uid, 0)).toBe(true);
    until(g, () => !g.stack.length && !g.decision);
    expect(g.dayNight).toBe('night');
    c.tapped = false;
    g.players[0].pool.push('C', 'C', 'C');
    expect(activate(g, 0, c.uid, 0)).toBe(true);
    until(g, () => !g.stack.length && !g.decision);
    expect(g.dayNight).toBe('day');
  });

  it('old Innistrad werewolves transform if no spells were cast last turn, and back if a player cast two or more', () => {
    const d = WERE();
    expect(d.triggers?.[0]).toMatchObject({ ev: 'upkeep', ifc: { k: 'noSpellsLastTurn' } });
    expect(d.back?.triggers?.[0]).toMatchObject({ ev: 'upkeep', ifc: { k: 'twoSpellsLastTurn' } });
    const g = setup();
    const c = put(g, 0, d);
    expect(c.face).toBeUndefined();
    g.players[0].spells = { turn: g.turn, n: 0, nonc: 0, isv: 0, ins: 0 };
    const turn = g.turn;
    expect(until(g, () => g.active === 1 && g.step === 'main1' && g.turn === turn + 1 && !g.stack.length)).toBe(true);
    expect(c.face).toBe(d.id); expect(def(c).name).toBe('DN Ironfang');
    // A player (P1) casts two spells; next upkeep transforms back.
    g.players[1].spells = { turn: g.turn, n: 2, nonc: 2, isv: 0, ins: 0 };
    const turn2 = g.turn;
    expect(until(g, () => g.step === 'main1' && g.turn === turn2 + 1 && !g.stack.length && !g.pending.length)).toBe(true);
    expect(c.face).toBeUndefined();
  });

  it('daybound permanents cannot transform except due to daybound', () => {
    const g = setup();
    const td = card('DN Would Transform Self', 'Creature — Human Werewolf', '{2}{R}', 'Daybound\n{T}: Transform DN Would Transform Self.', { power: '2', toughness: '2', colors: ['R'], layout: 'transform', card_faces: [
      { name: 'DN Would Transform Self', mana_cost: '{2}{R}', type_line: 'Creature — Human Werewolf', oracle_text: 'Daybound\n{T}: Transform DN Would Transform Self.', power: '2', toughness: '2' },
      { name: 'DN Back', type_line: 'Creature — Werewolf', oracle_text: 'Nightbound', power: '4', toughness: '4' },
    ] } as Partial<ScryCard>);
    const c = put(g, 0, td);
    c.tapped = false; c.sick = false;
    expect(activate(g, 0, c.uid, 0)).toBe(true);
    until(g, () => !g.stack.length && !g.decision && !g.pending.length);
    expect(c.face).toBeUndefined();
    expect(g.dayNight).toBe('day');
  });

});
