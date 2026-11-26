import { describe, it, expect } from 'vitest';
import { compileScry } from '../src/import/classify';
import type { ScryCard } from '../src/import/scryfall';
import {
  newGame, startGame, Game, Card, CARDS, registerCards, castSpell, pass, alive,
  answerDecision, power, toughness, ctr, declareAttackers, hasKw, layer,
  dealDamage, flushTriggers, playLand, enter,
} from '../src/engine/engine';
import type { CardDef } from '../src/engine/types';
import '../src/engine/ai';

let n = 0;
function card(name: string, type_line: string, mana_cost: string, oracle_text: string, o: Partial<ScryCard> = {}): CardDef {
  const cl = compileScry({ name, type_line, mana_cost, oracle_text, colors: [], color_identity: [], keywords: [], ...o });
  const d = { ...cl.def, id: `ka-${++n}-${cl.def.id}` }; registerCards([d]);
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
function fillLib(g: Game, pid = 0, n = 5) {
  while (g.players[pid].library.length < n) {
    g.players[pid].library.push({ uid: g.nextUid++, id: VANILLA().id, owner: pid, tapped: false, sick: false, damage: 0, pp: 0, pt: 0 });
  }
}
function passAll(g: Game) { const nP = alive(g).length; for (let i = 0; i < nP; i++) pass(g, g.priority!); }
function resolveAll(g: Game) { let i = 0; while ((g.stack.length || g.decision || g.pending.length) && i++ < 80) { if (g.decision) { if (g.decision.kind === 'may') answerDecision(g, true); else if (g.decision.kind === 'pick') answerDecision(g, (g.decision.cards ?? []).slice(0, g.decision.min ?? 0).map((c: Card) => c.uid)); else answerDecision(g, false); } else if (g.priority != null) pass(g, g.priority); else flushTriggers(g); } }
function toAttack(g: Game) { let i = 0; while (g.awaiting !== 'attack' && i++ < 80) { if (g.decision) answerDecision(g, false); else pass(g, g.priority!); } }
const landId = (name: string) => Object.values(CARDS).find(c => c.name === name)!.id;
const VANILLA = (): CardDef => card('KA Bear', 'Creature — Bear', '{1}{G}', '', { power: '2', toughness: '2' });

describe('phase A: compile ability-word conditions and trigger frames', () => {
  it('delirium: Thraben Foulbloods', () => {
    const d = card('Thraben Foulbloods', 'Creature — Vampire Berserker', '{2}{B}',
      'Delirium — Thraben Foulbloods gets +2/+2 and has menace as long as there are four or more card types among cards in your graveyard.',
      { power: '3', toughness: '2' });
    auto(d);
    expect(d.statics?.some(s => s.k === 'pt' && s.cond?.k === 'delirium')).toBe(true);
  });

  it('threshold: Werebear', () => {
    const d = card('Werebear', 'Creature — Insect Druid Bear', '{1}{G}',
      '{T}: Add {G}.\nThreshold — Werebear gets +3/+3 as long as seven or more cards are in your graveyard.',
      { power: '1', toughness: '1' });
    auto(d);
    expect(d.statics?.some(s => s.k === 'pt' && s.cond?.k === 'gyGE' && s.cond.n === 7)).toBe(true);
  });

  it('heroic: Hero of Iroas (heroic trigger compiles)', () => {
    const d = card('Hero of Iroas', 'Creature — Human Soldier', '{1}{W}',
      'Heroic — Whenever you cast a spell that targets Hero of Iroas, put a +1/+1 counter on Hero of Iroas.\nEach creature you control with a +1/+1 counter on it has lifelink.',
      { power: '2', toughness: '2' });
    auto(d);
    expect(d.triggers?.some(t => t.ev === 'targeted' && t.ifc?.k === 'evSpellYou')).toBe(true);
  });

  it('battalion: Ordruun Veteran', () => {
    const d = card('Ordruun Veteran', 'Creature — Minotaur Soldier', '{4}{R}{W}',
      'Battalion — Whenever Ordruun Veteran and at least two other creatures attack, Ordruun Veteran gains double strike until end of turn.',
      { power: '4', toughness: '1' });
    auto(d);
    expect(d.triggers?.some(t => t.ev === 'attacks' && t.ifc?.k === 'battalion')).toBe(true);
  });

  it('inspired: King Macar, the Gold-Cursed', () => {
    const d = card('King Macar, the Gold-Cursed', 'Legendary Creature — Human', '{2}{B}{B}',
      'Inspired — Whenever King Macar, the Gold-Cursed becomes untapped, you may exile target creature. If you do, create a Gold token.',
      { power: '2', toughness: '3' });
    auto(d);
    expect(d.triggers?.some(t => t.ev === 'untaps')).toBe(true);
  });

  it('enrage: Ripjaw Raptor', () => {
    const d = card('Ripjaw Raptor', 'Creature — Dinosaur', '{2}{G}{G}',
      'Enrage — Whenever Ripjaw Raptor is dealt damage, draw a card.',
      { power: '4', toughness: '5' });
    auto(d);
    expect(d.triggers?.some(t => t.ev === 'dealtDamage')).toBe(true);
  });

  it('domain: Matca Rioters P/T', () => {
    const d = card('Matca Rioters', 'Creature — Human Warrior', '{2}{R}',
      "Domain — Matca Rioters's power and toughness are each equal to the number of basic land types among lands you control.",
      { power: '*', toughness: '*' });
    auto(d);
    expect(d.statics?.some(s => s.k === 'pt' && typeof s.p === 'object' && s.p && 'domain' in s.p)).toBe(true);
  });

  it('formidable: Surrak, the Hunt Caller', () => {
    const d = card('Surrak, the Hunt Caller', 'Legendary Creature — Human Warrior', '{2}{G}{G}',
      'Formidable — At the beginning of combat on your turn, if creatures you control have total power 8 or greater, target creature you control gains haste until end of turn.',
      { power: '5', toughness: '4' });
    auto(d);
    expect(d.triggers?.some(t => t.ifc?.k === 'formidable' || t.ifc?.k === 'powSumGE')).toBe(true);
  });

  it('pack tactics: Fearless Pup', () => {
    const d = card('Fearless Pup', 'Creature — Wolf', '{R}',
      'First strike\nPack tactics — Whenever Fearless Pup attacks, if you attacked with creatures with total power 6 or greater this turn, put a +1/+1 counter on Fearless Pup.',
      { power: '1', toughness: '1' });
    auto(d);
    expect(d.triggers?.some(t => t.ifc?.k === 'packTactics')).toBe(true);
  });

  it('ferocious: Heir of the Wilds', () => {
    const d = card('Heir of the Wilds', 'Creature — Human Warrior', '{1}{G}',
      'Deathtouch\nFerocious — Whenever Heir of the Wilds attacks, if you control a creature with power 4 or greater, Heir of the Wilds gets +1/+1 until end of turn.',
      { power: '2', toughness: '2' });
    auto(d);
    expect(d.triggers?.some(t => t.ifc?.k === 'control')).toBe(true);
  });

  it('hellbent: Demon\'s Jester', () => {
    const d = card("Demon's Jester", 'Creature — Imp', '{3}{B}',
      "Flying\nHellbent — Demon's Jester gets +2/+1 as long as you have no cards in hand.",
      { power: '2', toughness: '2' });
    auto(d);
    expect(d.statics?.some(s => s.k === 'pt' && s.cond?.k === 'noCardsHand')).toBe(true);
  });

  it('metalcraft: Auriok Sunchaser', () => {
    const d = card('Auriok Sunchaser', 'Creature — Human Soldier', '{1}{W}',
      'Metalcraft — As long as you control three or more artifacts, Auriok Sunchaser gets +2/+2 and has flying.',
      { power: '1', toughness: '1' });
    auto(d);
    expect(d.statics?.some(s => s.k === 'pt' && s.cond?.k === 'control' && s.cond.n === 3)).toBe(true);
  });

  it('raid already hooks "you attacked this turn"', () => {
    const d = card('Goblin Heelcutter', 'Creature — Goblin Berserker', '{3}{R}',
      'Raid — When Goblin Heelcutter enters, if you attacked this turn, target creature can\'t block this turn.',
      { power: '3', toughness: '2' });
    auto(d);
    expect(d.triggers?.some(t => t.ifc?.k === 'attackedThisTurn')).toBe(true);
  });

  it('landfall rider: if that land is a Mountain', () => {
    const d = card('Mountainfall Test', 'Creature — Elemental', '{2}{R}',
      'Landfall — Whenever a land you control enters, if that land is a Mountain, Mountainfall Test deals 2 damage to each opponent.',
      { power: '2', toughness: '2' });
    auto(d);
    expect(d.triggers?.some(t => t.ev === 'etb' && t.ifc?.k === 'evIs')).toBe(true);
  });

  it('gets +N/+N and has a quoted granted ability', () => {
    const d = card('Quote Test', 'Creature — Illusion', '{1}{U}',
      'As long as seven or more cards are in your graveyard, Quote Test gets +2/+2 and has "{T}: Draw a card."',
      { power: '1', toughness: '1' });
    auto(d);
    expect(d.statics?.some(s => s.k === 'grantAbil' && s.cond?.k === 'gyGE')).toBe(true);
  });
});

describe('phase A: runtime', () => {
  it('delirium pumps and grants menace only with 4+ card types in the graveyard', () => {
    const g = setup();
    const d = card('Thraben Foulbloods', 'Creature — Vampire Berserker', '{2}{B}',
      'Delirium — Thraben Foulbloods gets +2/+2 and has menace as long as there are four or more card types among cards in your graveyard.',
      { power: '3', toughness: '2' });
    const c = put(g, 0, d); layer(g);
    expect(power(g, c)).toBe(3); expect(hasKw(c, 'menace')).toBe(false);
    put(g, 0, card('KA Instant', 'Instant', '{U}', 'Draw a card.'), 'graveyard');
    put(g, 0, card('KA Sorcery', 'Sorcery', '{R}', 'Draw a card.'), 'graveyard');
    put(g, 0, card('KA Creature', 'Creature — Bear', '{G}', '', { power: '2', toughness: '2' }), 'graveyard');
    put(g, 0, landId('Island'), 'graveyard');
    layer(g);
    expect(power(g, c)).toBe(5); expect(toughness(g, c)).toBe(4); expect(hasKw(c, 'menace')).toBe(true);
  });

  it('heroic puts a +1/+1 counter when you cast a spell targeting it', () => {
    const g = setup();
    const hero = card('Hero of Iroas', 'Creature — Human Soldier', '{1}{W}',
      'Heroic — Whenever you cast a spell that targets Hero of Iroas, put a +1/+1 counter on Hero of Iroas.',
      { power: '2', toughness: '2' });
    const pump = card('Giant Growth', 'Instant', '{0}', 'Target creature gets +3/+3 until end of turn.');
    const h = put(g, 0, hero);
    const s = put(g, 0, pump, 'hand');
    fillMana(g);
    expect(castSpell(g, 0, s.uid, { targets: [{ card: h.uid }] })).toBe(true);
    resolveAll(g);
    expect(ctr(h, '+1/+1')).toBe(1);
    expect(power(g, h)).toBe(6); // 2 + 1 counter + Giant Growth
  });

  it('battalion grants double strike when three creatures attack', () => {
    const g = setup();
    const vet = card('Ordruun Veteran', 'Creature — Minotaur Soldier', '{4}{R}{W}',
      'Battalion — Whenever Ordruun Veteran and at least two other creatures attack, Ordruun Veteran gains double strike until end of turn.',
      { power: '4', toughness: '1' });
    const a = put(g, 0, vet); const b = put(g, 0, VANILLA()); const c = put(g, 0, VANILLA());
    for (const x of [a, b, c]) x.sick = false;
    toAttack(g);
    declareAttackers(g, 0, [{ uid: a.uid, defender: 1 }, { uid: b.uid, defender: 1 }, { uid: c.uid, defender: 1 }]);
    resolveAll(g);
    expect(hasKw(a, 'double strike')).toBe(true);
  });

  it('inspired triggers when the creature becomes untapped', () => {
    const g = setup();
    const d = card('Inspired Test', 'Creature — Human', '{2}{U}',
      'Inspired — Whenever Inspired Test becomes untapped, draw a card.',
      { power: '2', toughness: '3' });
    const c = put(g, 0, d); c.tapped = true; c.sick = false;
    const untap = card('KA Untap', 'Instant', '{0}', 'Untap target creature.');
    auto(untap);
    const s = put(g, 0, untap, 'hand');
    fillLib(g); const hand0 = g.players[0].hand.length;
    expect(castSpell(g, 0, s.uid, { targets: [{ card: c.uid }] })).toBe(true);
    resolveAll(g);
    expect(c.tapped).toBe(false);
    expect(g.players[0].hand.length).toBe(hand0);
  });

  it('enrage draws when the creature is dealt damage', () => {
    const g = setup();
    const d = card('Ripjaw Raptor', 'Creature — Dinosaur', '{2}{G}{G}',
      'Enrage — Whenever Ripjaw Raptor is dealt damage, draw a card.',
      { power: '4', toughness: '5' });
    const c = put(g, 0, d);
    fillLib(g); const hand0 = g.players[0].hand.length;
    const src = put(g, 1, VANILLA());
    dealDamage(g, src.id, src, { card: c }, 2);
    flushTriggers(g); resolveAll(g);
    expect(c.damage).toBe(2);
    expect(g.players[0].hand.length).toBe(hand0 + 1);
  });

  it('domain P/T equals the number of basic land types among lands you control', () => {
    const g = setup();
    const d = card('Matca Rioters', 'Creature — Human Warrior', '{2}{R}',
      "Domain — Matca Rioters's power and toughness are each equal to the number of basic land types among lands you control.",
      { power: '*', toughness: '*' });
    const c = put(g, 0, d);
    put(g, 0, landId('Island')); put(g, 0, landId('Mountain')); put(g, 0, landId('Forest'));
    layer(g);
    expect(power(g, c)).toBe(3); expect(toughness(g, c)).toBe(3);
  });

  it('pack tactics puts a counter when attacking with total power 6+', () => {
    const g = setup();
    const pup = card('Fearless Pup', 'Creature — Wolf', '{R}',
      'First strike\nPack tactics — Whenever Fearless Pup attacks, if you attacked with creatures with total power 6 or greater this turn, put a +1/+1 counter on Fearless Pup.',
      { power: '1', toughness: '1' });
    const big = card('KA Ox', 'Creature — Ox', '{4}{G}', '', { power: '5', toughness: '5' });
    const a = put(g, 0, pup); const b = put(g, 0, big);
    a.sick = false; b.sick = false;
    toAttack(g);
    declareAttackers(g, 0, [{ uid: a.uid, defender: 1 }, { uid: b.uid, defender: 1 }]);
    resolveAll(g);
    expect(ctr(a, '+1/+1')).toBe(1);
  });
});
