import { describe, it, expect } from 'vitest';
import { compileScry } from '../src/import/classify';
import type { ScryCard } from '../src/import/scryfall';
import {
  newGame, startGame, Game, Card, CARDS, registerCards, castSpell, pass, alive,
  answerDecision, power, toughness, ctr, declareAttackers, declareBlockers, hasKw,
  layer, dealDamage, flushTriggers, changeControl, ctl, canCast, canBlock, blockReason, atkBlocked,
  def,
} from '../src/engine/engine';
import type { CardDef } from '../src/engine/types';
import '../src/engine/ai';

let n = 0;
function card(name: string, type_line: string, mana_cost: string, oracle_text: string, o: Partial<ScryCard> = {}): CardDef {
  const cl = compileScry({ name, type_line, mana_cost, oracle_text, colors: [], color_identity: [], keywords: [], ...o });
  const d = { ...cl.def, id: `kb-${++n}-${cl.def.id}` }; registerCards([d]);
  (d as CardDef & { _support: string; _unparsed?: string[] })._support = cl.support;
  (d as CardDef & { _unparsed?: string[] })._unparsed = cl.unparsed;
  return d;
}
const auto = (d: CardDef) => expect((d as CardDef & { _support: string })._support, JSON.stringify((d as CardDef & { _unparsed?: string[] })._unparsed)).toBe('auto');

function setup(): Game {
  const g = newGame({ seed: 7, humans: [], skipAiMulligan: true });
  for (const p of g.players) { p.library.push(...p.hand); p.hand = []; }
  startGame(g); let i = 0; while (!(g.step === 'main1' && !g.stack.length && g.active === 0) && i++ < 80) { if (g.decision) answerDecision(g, false); else pass(g, g.priority!); }
  for (const p of g.players) { p.library.push(...p.hand); p.hand = []; for (const c of p.battlefield) c.tapped = false; }
  return g;
}
function put(g: Game, pid: number, d: CardDef | string, zone: 'battlefield' | 'hand' | 'graveyard' = 'battlefield'): Card {
  const c: Card = { uid: g.nextUid++, id: typeof d === 'string' ? d : d.id, owner: pid, tapped: false, sick: false, damage: 0, pp: 0, pt: 0 };
  g.players[pid][zone].push(c); return c;
}
function fillMana(g: Game, pid = 0, n = 8) { for (let i = 0; i < n; i++) g.players[pid].pool.push('W','U','B','R','G','C'); }
function resolveAll(g: Game) { let i = 0; while ((g.stack.length || g.decision || g.pending.length) && i++ < 80) { if (g.decision) { if (g.decision.kind === 'may') answerDecision(g, true); else if (g.decision.kind === 'pick') answerDecision(g, (g.decision.cards ?? []).slice(0, Math.max(g.decision.min ?? 1, 1)).map((c: Card) => c.uid)); else answerDecision(g, false); } else if (g.priority != null) pass(g, g.priority); else flushTriggers(g); } }
function toAttack(g: Game) { let i = 0; while (g.awaiting !== 'attack' && i++ < 80) { if (g.decision) answerDecision(g, false); else pass(g, g.priority!); } }
const VANILLA = (p = 2, t = 2, name = 'KB Bear'): CardDef => card(name, 'Creature — Bear', '{1}{G}', '', { power: String(p), toughness: String(t) });
const landId = (name: string) => Object.values(CARDS).find(c => c.name === name)!.id;

describe('phase B: compile templates', () => {
  it('Fog prevents all combat damage this turn', () => {
    const d = card('Fog', 'Instant', '{G}', 'Prevent all combat damage that would be dealt this turn.');
    auto(d);
    expect(d.spell?.effects.some(e => e.op === 'prevent' && e.kind === 'combat')).toBe(true);
  });

  it('Ethereal Haze prevents damage dealt by creatures', () => {
    const d = card('Ethereal Haze', 'Instant', '{W}', 'Prevent all damage that would be dealt by creatures this turn.');
    auto(d);
    expect(d.spell?.effects.some(e => e.op === 'prevent' && e.kind === 'fromCreatures')).toBe(true);
  });

  it('Healing Salve can prevent the next 3 damage to any target', () => {
    const d = card('Healing Salve', 'Instant', '{W}',
      'Choose one —\n• Target player gains 3 life.\n• Prevent the next 3 damage that would be dealt to any target this turn.');
    auto(d);
    expect(d.spell?.modes?.list.some(m => m.effects.some(e => e.op === 'prevent' && e.kind === 'nextN' && e.n === 3))).toBe(true);
  });

  it('Thoughtseize reveals a hand and discards a chosen nonland', () => {
    const d = card('Thoughtseize', 'Sorcery', '{B}',
      'Target player reveals their hand. You choose a nonland card from it. That player discards that card. You lose 2 life.');
    auto(d);
    expect(d.spell?.effects.some(e => e.op === 'discardChosen')).toBe(true);
  });

  it('Castigate exiles a chosen nonland from a revealed hand', () => {
    const d = card('Castigate', 'Sorcery', '{W}{B}',
      'Target opponent reveals their hand. You choose a nonland card from it and exile that card.');
    auto(d);
    expect(d.spell?.effects.some(e => e.op === 'discardChosen' && e.dest === 'exile')).toBe(true);
  });

  it('Act of Treason steals, untaps, and grants haste until end of turn', () => {
    const d = card('Act of Treason', 'Sorcery', '{2}{R}',
      'Gain control of target creature until end of turn. Untap that creature. It gains haste until end of turn.');
    auto(d);
    expect(d.spell?.effects.map(e => e.op)).toEqual(['steal', 'untap', 'grant']);
  });

  it('Slave of Bolas steals then sacrifices at the next end step', () => {
    const d = card('Slave of Bolas', 'Sorcery', '{3}{U/R}{B}',
      'Gain control of target creature. Untap that creature. It gains haste until end of turn. Sacrifice it at the beginning of the next end step.');
    auto(d);
    expect(d.spell?.effects.some(e => e.op === 'delaySac')).toBe(true);
  });

  it('Control Magic: you control enchanted creature', () => {
    const d = card('Control Magic', 'Enchantment — Aura', '{2}{U}{U}',
      'Enchant creature\nYou control enchanted creature.');
    auto(d);
    expect(d.statics?.some(s => s.k === 'controlAttached')).toBe(true);
  });

  it('Phantasmal Bear sacrifices when it becomes a target', () => {
    const d = card('Phantasmal Bear', 'Creature — Illusion Bear', '{U}',
      'When Phantasmal Bear becomes the target of a spell or ability, sacrifice it.',
      { power: '2', toughness: '2' });
    auto(d);
    expect(d.triggers?.some(t => t.ev === 'targeted')).toBe(true);
  });

  it('Leyline of Sanctity opening-hand clause and hexproof', () => {
    const d = card('Leyline of Sanctity', 'Enchantment', '{2}{W}{W}',
      'If Leyline of Sanctity is in your opening hand, you may begin the game with it on the battlefield.\nYou have hexproof.');
    auto(d);
    expect(d.leyline).toBe(true);
    expect(d.statics?.some(s => s.k === 'playerHexproof')).toBe(true);
  });

  it('costs less if you control a creature compiles', () => {
    const d = card('Cheap Shot', 'Instant', '{3}{R}',
      'This spell costs {2} less to cast if you control a creature.\nCheap Shot deals 2 damage to any target.');
    auto(d);
    expect(d.costLessIf?.n).toBe(2);
  });

  it('can\'t be blocked except by flying, can\'t attack unless an Island', () => {
    const a = card('Windborn Exception', 'Creature — Spirit', '{2}{U}',
      "Windborn Exception can't be blocked except by creatures with flying.",
      { power: '2', toughness: '2' });
    auto(a);
    expect(a.statics?.some(s => s.k === 'blockOnlyBy')).toBe(true);
    const s = card('Sea Serpent', 'Creature — Serpent', '{5}{U}',
      "Sea Serpent can't attack unless defending player controls an Island.",
      { power: '5', toughness: '5' });
    auto(s);
    expect(s.atkUnlessDef).toBeTruthy();
  });

  it('you may cast creature spells as though they had flash', () => {
    const d = card('Vedalken Orrery Test', 'Artifact', '{4}',
      'You may cast spells as though they had flash.');
    // "spells" with no filter should still parse if parseFilter('' or 'spell') works; if not, typal form:
    if ((d as CardDef & { _support: string })._support !== 'auto') {
      const d2 = card('Flash Enabler', 'Enchantment', '{2}{U}',
        'You may cast creature spells as though they had flash.');
      auto(d2);
      expect(d2.statics?.some(s => s.k === 'flashSpell')).toBe(true);
    } else {
      auto(d);
    }
  });

  it('Ice Age cantrip draws at the next upkeep', () => {
    const d = card('Enervate', 'Instant', '{1}{U}',
      "Tap target artifact, creature, or land.\nDraw a card at the beginning of the next turn's upkeep.");
    auto(d);
    expect(d.spell?.effects.some(e => e.op === 'arcaneDraws')).toBe(true);
  });

  it('kicker rider: if this spell was kicked', () => {
    const d = card('Gatekeeper of Malakir', 'Creature — Vampire Warrior', '{B}{B}',
      'Kicker {B}\nWhen Gatekeeper of Malakir enters, if it was kicked, target player sacrifices a creature.',
      { power: '2', toughness: '2' });
    auto(d);
    expect(d.kicker?.B).toBe(1);
    expect(d.triggers?.some(t => t.ifc?.k === 'kicked')).toBe(true);
  });
});

describe('phase B: runtime', () => {
  it('Fog prevents combat damage to a player', () => {
    const g = setup();
    const fog = card('Fog', 'Instant', '{0}', 'Prevent all combat damage that would be dealt this turn.');
    auto(fog);
    const atk = put(g, 0, VANILLA(5, 5, 'KB Ox')); atk.sick = false;
    const life = g.players[1].life;
    toAttack(g);
    declareAttackers(g, 0, [{ uid: atk.uid, defender: 1 }]);
    let i = 0; while (g.priority !== 1 && i++ < 20) { if (g.decision) answerDecision(g, false); else pass(g, g.priority!); }
    const s = put(g, 1, fog, 'hand');
    expect(castSpell(g, 1, s.uid)).toBe(true);
    resolveAll(g);
    // finish combat
    if (g.awaiting === 'block') declareBlockers(g, 1, []);
    let j = 0; while (g.step !== 'main2' && j++ < 40) { if (g.decision) answerDecision(g, false); else if (g.priority != null) pass(g, g.priority); else break; }
    expect(g.players[1].life).toBe(life);
  });

  it('Thoughtseize discards a chosen nonland from a revealed hand', () => {
    const g = setup();
    const ts = card('Thoughtseize', 'Sorcery', '{0}',
      'Target player reveals their hand. You choose a nonland card from it. That player discards that card. You lose 2 life.');
    auto(ts);
    const bear = put(g, 1, VANILLA(), 'hand');
    put(g, 1, landId('Island'), 'hand');
    const life = g.players[0].life;
    const s = put(g, 0, ts, 'hand');
    expect(castSpell(g, 0, s.uid, { targets: [{ player: 1 }] })).toBe(true);
    resolveAll(g);
    expect(g.players[1].graveyard.some(c => c.uid === bear.uid)).toBe(true);
    expect(g.players[0].life).toBe(life - 2);
  });

  it('Act of Treason steals a creature until end of turn', () => {
    const g = setup();
    const treason = card('Act of Treason', 'Sorcery', '{0}',
      'Gain control of target creature until end of turn. Untap that creature. It gains haste until end of turn.');
    auto(treason);
    const prey = put(g, 1, VANILLA()); prey.tapped = true;
    const s = put(g, 0, treason, 'hand');
    expect(castSpell(g, 0, s.uid, { targets: [{ card: prey.uid }] })).toBe(true);
    resolveAll(g);
    expect(ctl(prey)).toBe(0);
    expect(prey.tapped).toBe(false);
    expect(hasKw(prey, 'haste')).toBe(true);
  });

  it('Control Magic takes control of the enchanted creature', () => {
    const g = setup();
    const aura = card('Control Magic', 'Enchantment — Aura', '{0}',
      'Enchant creature\nYou control enchanted creature.');
    auto(aura);
    const prey = put(g, 1, VANILLA());
    const s = put(g, 0, aura, 'hand');
    fillMana(g);
    expect(castSpell(g, 0, s.uid, { targets: [{ card: prey.uid }] })).toBe(true);
    resolveAll(g);
    expect(ctl(prey)).toBe(0);
  });

  it('Leyline in the opening hand enters at the start of the game', () => {
    const ley = card('Leyline of Sanctity', 'Enchantment', '{2}{W}{W}',
      'If Leyline of Sanctity is in your opening hand, you may begin the game with it on the battlefield.\nYou have hexproof.');
    auto(ley);
    const g = newGame({ seed: 3, humans: [], skipAiMulligan: true });
    for (const p of g.players) { p.library.push(...p.hand); p.hand = []; }
    const c: Card = { uid: g.nextUid++, id: ley.id, owner: 0, tapped: false, sick: false, damage: 0, pp: 0, pt: 0 };
    g.players[0].hand.push(c);
    startGame(g);
    expect(g.players[0].battlefield.some(x => x.uid === c.uid)).toBe(true);
    expect(g.players[0].hand.some(x => x.uid === c.uid)).toBe(false);
  });

  it('Phantasmal Bear is sacrificed when targeted', () => {
    const g = setup();
    const bear = card('Phantasmal Bear', 'Creature — Illusion Bear', '{U}',
      'When Phantasmal Bear becomes the target of a spell or ability, sacrifice it.',
      { power: '2', toughness: '2' });
    auto(bear);
    const pump = card('KB Pump', 'Instant', '{0}', 'Target creature gets +1/+1 until end of turn.');
    const b = put(g, 0, bear);
    const s = put(g, 0, pump, 'hand');
    expect(castSpell(g, 0, s.uid, { targets: [{ card: b.uid }] })).toBe(true);
    resolveAll(g);
    expect(g.players[0].battlefield.some(x => x.uid === b.uid)).toBe(false);
  });

  it('Sea Serpent cannot attack a player with no Island', () => {
    const s = card('Sea Serpent', 'Creature — Serpent', '{5}{U}',
      "Sea Serpent can't attack unless defending player controls an Island.",
      { power: '5', toughness: '5' });
    auto(s);
    const g = setup();
    const c = put(g, 0, s); c.sick = false;
    toAttack(g);
    const noIsland = declareAttackers(g, 0, [{ uid: c.uid, defender: 1 }]);
    expect(c.attacking).toBeUndefined();
    put(g, 1, landId('Island'));
    expect(atkBlocked(g, c, 1)).toBeNull();
    void noIsland;
  });
});
