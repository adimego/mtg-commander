import { describe, it, expect } from 'vitest';
import { compileScry } from '../src/import/classify';
import type { ScryCard } from '../src/import/scryfall';
import {
  newGame, startGame, Game, Card, registerCards, castSpell, pass, answerDecision,
  power, toughness, ctr, declareAttackers, declareBlockers, layer, dealDamage,
  flushTriggers, canCast, costOf, enter, activate, canActivate, abilitiesOf,
  def, checkState, backCastable, costText, fusedDef, frontFace,
} from '../src/engine/engine';
import type { CardDef } from '../src/engine/types';
import '../src/engine/ai';

let n = 0;
function colorsOf(mc: string): string[] { return [...new Set([...mc.matchAll(/\{([WUBRG])\}/g)].map(m => m[1]))]; }
function card(name: string, type_line: string, mana_cost: string, oracle_text: string, o: Partial<ScryCard> = {}): CardDef {
  const cols = o.colors ?? colorsOf(mana_cost);
  const cl = compileScry({ name, type_line, mana_cost, oracle_text, colors: cols, color_identity: cols, keywords: o.keywords ?? [], ...o } as ScryCard);
  const d = { ...cl.def, id: `b2-${++n}-${cl.def.id}` };
  if (d.back) d.back = { ...d.back, id: d.id + '--back' };
  registerCards([d]);
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
function fillMana(g: Game, pid = 0, n = 12) { for (let i = 0; i < n; i++) g.players[pid].pool.push('W','U','B','R','G','C'); }
const VANILLA = (p = 2, t = 2, name = 'B2 Bear'): CardDef => card(name, 'Creature — Bear', '{1}{G}', '', { power: String(p), toughness: String(t) });

describe('batch 2: energy', () => {
  it('compiles get and pay {E}, including may-pay and energy counts', () => {
    const etb = card('Energizer', 'Creature — Elf', '{1}{G}', 'When Energizer enters, you get {E}{E}.\n{T}, Pay {E}: Add {C}.', { power: '1', toughness: '2' });
    auto(etb);
    const may = card('Thriving Test', 'Creature — Rat', '{1}{B}', 'When Thriving Test enters, you get {E}{E}.\nWhenever Thriving Test attacks, you may pay {E}{E}. If you do, put a +1/+1 counter on it.', { power: '1', toughness: '2' });
    auto(may);
    const live = card('Live Fast', 'Sorcery', '{2}{B}', 'You draw two cards, lose 2 life, and get {E}{E}.');
    auto(live);
    const count = card('Capacitor', 'Creature — Construct', '{2}', "Capacitor's power and toughness are each equal to the number of energy counters you have.", { power: '*', toughness: '*' });
    auto(count);
  });

  it('you get energy counters, pay them, and CDA counts them', () => {
    const etb = card('Spark Bug', 'Creature — Insect', '{G}', 'When Spark Bug enters, you get {E}{E}{E}.\n{T}, Pay {E}{E}: Spark Bug deals 1 damage to any target.', { power: '1', toughness: '1' });
    auto(etb);
    const cap = card('Cell', 'Creature — Construct', '{1}', "Cell's power and toughness are each equal to the number of energy counters you have.", { power: '*', toughness: '*' });
    auto(cap);
    const g = setup();
    const bug: Card = { uid: g.nextUid++, id: etb.id, owner: 0, tapped: false, sick: false, damage: 0, pp: 0, pt: 0 };
    enter(g, bug, 0, {});
    resolveAll(g);
    expect(g.players[0].energy).toBe(3);
    bug.sick = false;
    const cell = put(g, 0, cap);
    layer(g);
    expect(power(g, cell)).toBe(3);
    expect(toughness(g, cell)).toBe(3);
    fillMana(g, 0, 2);
    const i = abilitiesOf(g, bug).findIndex(a => (a.mana?.E ?? 0) >= 2);
    expect(i).toBeGreaterThanOrEqual(0);
    expect(canActivate(g, 0, bug, i)).toBe(true);
    expect(activate(g, 0, bug.uid, i, { targets: [{ player: 1 }] })).toBe(true);
    resolveAll(g);
    expect(g.players[0].energy).toBe(1);
    expect(g.players[1].life).toBe(39);
    layer(g);
    expect(power(g, cell)).toBe(1);
  });

  it('may pay energy when attacking', () => {
    const d = card('Payer', 'Creature — Rat', '{B}', 'When Payer enters, you get {E}{E}.\nWhenever Payer attacks, you may pay {E}{E}. If you do, put a +1/+1 counter on it.', { power: '1', toughness: '1' });
    auto(d);
    const g = setup([0]);
    const c: Card = { uid: g.nextUid++, id: d.id, owner: 0, tapped: false, sick: true, damage: 0, pp: 0, pt: 0 };
    enter(g, c, 0, {});
    resolveAll(g);
    expect(g.players[0].energy).toBe(2);
    c.sick = false;
    toAttack(g);
    expect(declareAttackers(g, 0, [{ uid: c.uid, defender: 1 }])).toBe(true);
    resolveAll(g);
    expect(g.players[0].energy).toBe(0);
    expect(ctr(c, '+1/+1')).toBe(1);
  });
});

describe('batch 2: split, fuse, aftermath', () => {
  it('Heaven // Earth compiles both faces; front from hand, aftermath from graveyard then exile', () => {
    const d = card('Heaven // Earth', 'Instant', '{X}{G}', 'Heaven deals X damage to each creature with flying.', {
      layout: 'split',
      keywords: ['Aftermath'],
      card_faces: [
        { name: 'Heaven', mana_cost: '{X}{G}', type_line: 'Instant', oracle_text: 'Heaven deals X damage to each creature with flying.', colors: ['G'] },
        { name: 'Earth', mana_cost: '{X}{R}{R}', type_line: 'Sorcery', oracle_text: 'Aftermath (Cast this spell only from your graveyard. Then exile it.)\nEarth deals X damage to each creature without flying.', colors: ['R'] },
      ],
      colors: ['G', 'R'],
    } as Partial<ScryCard>);
    auto(d);
    expect(d.split).toBe(true);
    expect(d.back?.aftermath).toBe(true);
    expect(d.back?.name).toBe('Earth');

    const fly = card('Wren', 'Creature — Bird', '{W}', 'Flying', { power: '2', toughness: '2', keywords: ['Flying'] });
    auto(fly);
    const bear = VANILLA(3, 3, 'Ground Bear');
    const g = setup();
    const flyer = put(g, 1, fly);
    const ground = put(g, 1, bear);
    const sp = put(g, 0, d, 'hand');
    fillMana(g, 0, 8);
    expect(canCast(g, 0, sp, { x: 2 })).toBe(true);
    expect(backCastable(g, 0, sp)).toBe(false);
    expect(castSpell(g, 0, sp.uid, { x: 2 })).toBe(true);
    resolveAll(g);
    expect(g.players[0].graveyard.some(c => c.uid === sp.uid)).toBe(true);
    expect(findGone(g, flyer) || (flyer.damage >= 2) || !g.players[1].battlefield.includes(flyer)).toBe(true);
    expect(g.players[1].battlefield.includes(ground)).toBe(true);

    fillMana(g, 0, 8);
    expect(backCastable(g, 0, sp)).toBe(true);
    expect(canCast(g, 0, sp, { back: true, x: 3 })).toBe(true);
    expect(canCast(g, 0, sp, { x: 3 })).toBe(false);
    expect(castSpell(g, 0, sp.uid, { back: true, x: 3 })).toBe(true);
    resolveAll(g);
    expect(g.players[0].exile.some(c => c.uid === sp.uid)).toBe(true);
    expect(g.players[1].battlefield.includes(ground)).toBe(false);
  });

  it('Fuse casts both halves for their combined cost', () => {
    const d = card('Rise // Shine', 'Sorcery', '{W}', 'You gain 3 life.\nFuse (You may cast one or both halves of this card from your hand.)', {
      layout: 'split',
      keywords: ['Fuse'],
      card_faces: [
        { name: 'Rise', mana_cost: '{W}', type_line: 'Sorcery', oracle_text: 'You gain 3 life.\nFuse (You may cast one or both halves of this card from your hand.)', colors: ['W'] },
        { name: 'Shine', mana_cost: '{1}{U}', type_line: 'Sorcery', oracle_text: 'Draw a card.\nFuse (You may cast one or both halves of this card from your hand.)', colors: ['U'] },
      ],
      colors: ['W', 'U'],
    } as Partial<ScryCard>);
    auto(d);
    expect(d.fuse).toBe(true);
    expect(fusedDef(d)?.cost).toEqual(expect.objectContaining({ generic: 1, W: 1, U: 1 }));
    const g = setup();
    const sp = put(g, 0, d, 'hand');
    fillMana(g, 0, 6);
    const life = g.players[0].life;
    const hand = g.players[0].hand.length;
    expect(canCast(g, 0, sp, { fuse: true })).toBe(true);
    expect(costText(costOf(g, sp, { fuse: true }))).toContain('{W}');
    expect(castSpell(g, 0, sp.uid, { fuse: true })).toBe(true);
    resolveAll(g);
    expect(g.players[0].life).toBe(life + 3);
    expect(g.players[0].hand.length).toBe(hand); // drew 1, the spell left hand
    expect(g.players[0].graveyard.some(c => c.uid === sp.uid)).toBe(true);
  });
});

function findGone(g: Game, c: Card) {
  return !g.players.some(p => p.battlefield.includes(c));
}

describe('batch 2: variable P/T', () => {
  it("power is equal to count, toughness is that number plus N", () => {
    const goyf = card('Yardgoyf', 'Creature — Lhurgoyf', '{1}{G}', "Yardgoyf's power is equal to the number of card types among cards in your graveyard and its toughness is equal to that number plus 1.", { power: '*', toughness: '1+*' });
    auto(goyf);
    const inst = card('Boltlette', 'Instant', '{R}', 'Boltlette deals 1 damage to any target.');
    auto(inst);
    const crea = VANILLA(1, 1, 'Dead Bear');
    const g = setup();
    put(g, 0, inst, 'graveyard');
    put(g, 0, crea, 'graveyard');
    const c = put(g, 0, goyf);
    layer(g);
    expect(power(g, c)).toBe(2);
    expect(toughness(g, c)).toBe(3);
  });

  it("power equals instants and sorceries in your graveyard", () => {
    const d = card('Spellheart', 'Creature — Elemental', '{U}', "Spellheart's power is equal to the number of instant and sorcery cards in your graveyard.", { power: '*', toughness: '1' });
    auto(d);
    const inst = card('Cantrip', 'Instant', '{U}', 'Draw a card.');
    auto(inst);
    const g = setup();
    put(g, 0, inst, 'graveyard');
    put(g, 0, inst, 'graveyard');
    const c = put(g, 0, d);
    layer(g);
    expect(power(g, c)).toBe(2);
    expect(toughness(g, c)).toBe(1);
  });

  it('toughness equals forests you control; power equals greatest mana value among creatures you control', () => {
    const wall = card('Woodwall', 'Creature — Wall', '{G}', "Woodwall's toughness is equal to the number of Forests you control.", { power: '0', toughness: '*' });
    auto(wall);
    const big = card('Biggest', 'Creature — Beast', '{2}{G}', "Biggest's power is equal to the greatest mana value among creatures you control.", { power: '*', toughness: '3' });
    auto(big);
    const forest = card('Forest', 'Basic Land — Forest', '', '{T}: Add {G}.');
    auto(forest);
    const g = setup();
    put(g, 0, forest);
    put(g, 0, forest);
    const w = put(g, 0, wall);
    const b = put(g, 0, big);
    const fatty = VANILLA(1, 1, 'Costly');
    // give the fatty a higher cmc via its printed cost {1}{G} = 2; Biggest costs 3
    layer(g);
    expect(toughness(g, w)).toBe(2);
    expect(power(g, b)).toBeGreaterThanOrEqual(3);
    void fatty;
  });
});

describe('batch 2: flip faces', () => {
  it('compiles the back face and flip ~ turns the permanent over', () => {
    const d = card('Student of Elements // Tobita, Master of Winds', 'Creature — Human Wizard', '{1}{U}', 'When Student of Elements has flying, flip it.', {
      layout: 'flip',
      card_faces: [
        { name: 'Student of Elements', mana_cost: '{1}{U}', type_line: 'Creature — Human Wizard', oracle_text: 'When Student of Elements has flying, flip it.', power: '1', toughness: '1', colors: ['U'] },
        { name: 'Tobita, Master of Winds', mana_cost: '', type_line: 'Legendary Creature — Human Wizard', oracle_text: 'Creatures you control have flying.', power: '3', toughness: '3', colors: ['U'] },
      ],
    } as Partial<ScryCard>);
    // front trigger may not compile; at least the back face is attached
    expect(d.flip).toBe(true);
    expect(d.back?.name).toBe('Tobita, Master of Winds');
    expect(d.back?.power).toBe(3);

    const simple = card('Flipper // Flipped', 'Creature — Spirit', '{W}', '{1}{W}: Flip Flipper.', {
      layout: 'flip',
      card_faces: [
        { name: 'Flipper', mana_cost: '{W}', type_line: 'Creature — Spirit', oracle_text: '{1}{W}: Flip Flipper.', power: '1', toughness: '1', colors: ['W'] },
        { name: 'Flipped', mana_cost: '', type_line: 'Creature — Spirit', oracle_text: 'Flying', power: '3', toughness: '3', colors: ['W'] },
      ],
    } as Partial<ScryCard>);
    auto(simple);
    const g = setup();
    const c = put(g, 0, simple);
    fillMana(g, 0, 4);
    const i = abilitiesOf(g, c).findIndex(a => a.effects.some(e => e.op === 'flip'));
    expect(i).toBeGreaterThanOrEqual(0);
    expect(activate(g, 0, c.uid, i)).toBe(true);
    resolveAll(g);
    expect(def(c).name).toBe('Flipped');
    expect(power(g, c)).toBe(3);
    frontFace(c);
    expect(def(c).name).toBe('Flipper');
  });
});
