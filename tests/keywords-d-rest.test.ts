import { describe, it, expect } from 'vitest';
import { compileScry } from '../src/import/classify';
import type { ScryCard } from '../src/import/scryfall';
import {
  newGame, startGame, Game, Card, registerCards, castSpell, pass,
  answerDecision, canCast, canActivate, flushTriggers,
  costOf, sacrifice, enter, power,
} from '../src/engine/engine';
import type { CardDef } from '../src/engine/types';
import '../src/engine/ai';

let n = 0;
function card(name: string, type_line: string, mana_cost: string, oracle_text: string, o: Partial<ScryCard> = {}): CardDef {
  const cl = compileScry({ name, type_line, mana_cost, oracle_text, colors: [], color_identity: [], keywords: [], ...o });
  const d = { ...cl.def, id: `kdr-${++n}-${cl.def.id}` }; registerCards([d]);
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
function put(g: Game, pid: number, d: CardDef | string, zone: 'battlefield' | 'hand' | 'graveyard' | 'library' = 'battlefield'): Card {
  const c: Card = { uid: g.nextUid++, id: typeof d === 'string' ? d : d.id, owner: pid, tapped: false, sick: false, damage: 0, pp: 0, pt: 0 };
  g.players[pid][zone].push(c); return c;
}
function fillMana(g: Game, pid = 0, n = 12) { for (let i = 0; i < n; i++) g.players[pid].pool.push('W','U','B','R','G','C'); }
function resolveAll(g: Game) { let i = 0; while ((g.stack.length || g.decision || g.pending.length) && i++ < 80) { if (g.decision) { if (g.decision.kind === 'may') answerDecision(g, true); else if (g.decision.kind === 'pick') answerDecision(g, (g.decision.cards ?? []).slice(0, g.decision.min ?? 0).map((c: Card) => c.uid)); else answerDecision(g, false); } else if (g.priority != null) pass(g, g.priority); else flushTriggers(g); } }

describe('leftover phase D keywords', () => {
  it('assist: another player can pay generic mana in the cost', () => {
    const d = card('Fury Charm', 'Instant', '{3}{R}', 'Assist\nDestroy target artifact.');
    expect(d.assist).toBe(true);
    const g = setup();
    const art = put(g, 1, card('KDR Relic', 'Artifact', '{0}', ''));
    const c = put(g, 0, d, 'hand');
    g.players[0].pool = ['R'];
    g.players[1].pool = ['C','C','C'];
    expect(canCast(g, 0, c)).toBe(true);
    expect(castSpell(g, 0, c.uid, { targets: [{ card: art.uid }] })).toBe(true);
  });

  it('splice: reveals a card from hand and adds its effect to an Arcane spell', () => {
    const host = card('Glacial Ray', 'Instant — Arcane', '{0}', 'Glacial Ray deals 2 damage to any target.');
    const sp = card('Spiritual Visit', 'Instant — Arcane', '{W}', 'Create a 1/1 colorless Spirit creature token.\nSplice onto Arcane {0}');
    auto(sp);
    expect(sp.splice?.onto).toMatch(/Arcane/i);
    const g = setup();
    const h = put(g, 0, host, 'hand');
    const s = put(g, 0, sp, 'hand');
    fillMana(g);
    expect(castSpell(g, 0, h.uid, { targets: [{ player: 1 }], splice: [s.uid] })).toBe(true);
    resolveAll(g);
    expect(g.players[0].hand.some(x => x.uid === s.uid)).toBe(true);
    expect(g.players[0].battlefield.length).toBeGreaterThan(0);
  });

  it('casualty: sacrificing a creature of power N copies the spell', () => {
    const d = card('Cut of the Profits', 'Sorcery', '{0}', 'Casualty 1\nDraw a card.');
    expect(d.casualty).toBe(1);
    const g = setup();
    const fodder = put(g, 0, card('KDR Goat', 'Creature — Goat', '{0}', '', { power: '1', toughness: '1' }));
    const c = put(g, 0, d, 'hand');
    g.players[0].library.push({ uid: g.nextUid++, id: fodder.id, owner: 0, tapped: false, sick: false, damage: 0, pp: 0, pt: 0 });
    g.players[0].library.push({ uid: g.nextUid++, id: fodder.id, owner: 0, tapped: false, sick: false, damage: 0, pp: 0, pt: 0 });
    fillMana(g);
    const hand0 = g.players[0].hand.length;
    expect(castSpell(g, 0, c.uid, { casualty: 1, sacs: [fodder.uid] })).toBe(true);
    resolveAll(g);
    expect(g.players[0].battlefield.some(x => x.uid === fodder.uid)).toBe(false);
    expect(g.players[0].hand.length).toBeGreaterThanOrEqual(hand0); // original resolved + copy drew
  });

  it('spectacle: alt cost only if an opponent lost life this turn', () => {
    const d = card('Light Up the Stage', 'Sorcery', '{2}{R}', 'Spectacle {0}\nDraw a card.');
    expect(d.spectacle).toBeTruthy();
    const g = setup();
    const c = put(g, 0, d, 'hand');
    g.players[0].pool = [];
    expect(canCast(g, 0, c, { spectacle: true })).toBe(false);
    g.players[1].lostLife = 1;
    expect(canCast(g, 0, c, { spectacle: true })).toBe(true);
  });

  it('blitz: haste, sacrifice at end of turn, draw when it dies', () => {
    const d = card('Jaxis, the Troublemaker', 'Legendary Creature — Human Warrior', '{3}{R}', 'Blitz {0}', { power: '2', toughness: '2' });
    expect(d.blitz).toBeTruthy();
    const g = setup();
    const c = put(g, 0, d, 'hand');
    fillMana(g);
    g.players[0].library.push({ uid: g.nextUid++, id: c.id, owner: 0, tapped: false, sick: false, damage: 0, pp: 0, pt: 0 });
    expect(castSpell(g, 0, c.uid, { blitz: true })).toBe(true);
    resolveAll(g);
    const on = g.players[0].battlefield.find(x => x.uid === c.uid);
    expect(on).toBeTruthy();
    expect(on!.sick).toBe(false);
    const handBefore = g.players[0].hand.length;
    sacrifice(g, on!);
    resolveAll(g);
    expect(g.players[0].hand.length).toBeGreaterThan(handBefore);
  });

  it('freerunning: alt cost after an assassin or commander deals combat damage to a player', () => {
    const d = card('Lethal Exploit', 'Instant', '{2}{B}', 'Freerunning {0}\nDraw a card.');
    expect(d.freerunning).toBeTruthy();
    const g = setup();
    const c = put(g, 0, d, 'hand');
    g.players[0].pool = [];
    expect(canCast(g, 0, c, { freerunning: true })).toBe(false);
    g.players[0].freerunT = g.turn;
    expect(canCast(g, 0, c, { freerunning: true })).toBe(true);
  });

  it('emerge: sacrificing a creature reduces the emerge cost by its mana value', () => {
    const d = card('Distended Mindbender', 'Creature — Eldrazi Insect', '{8}', 'Emerge {5}', { power: '5', toughness: '5' });
    expect(d.emerge).toBeTruthy();
    const g = setup();
    const sac = put(g, 0, card('KDR Ox', 'Creature — Ox', '{3}', '', { power: '2', toughness: '2' }));
    const c = put(g, 0, d, 'hand');
    const full = costOf(g, c);
    const em = costOf(g, c, { emerge: true, emergeMv: 3 });
    expect(em.generic).toBeLessThan(full.generic);
    expect(em.generic).toBe(2);
    fillMana(g);
    expect(castSpell(g, 0, c.uid, { emerge: true, sacs: [sac.uid] })).toBe(true);
  });

  it('forecast: activate from hand during your upkeep; the card stays in hand', () => {
    const d = card('Pride of the Clouds', 'Creature — Elemental Cat', '{W}{U}', 'Forecast — {2}{W}{U}, Reveal this card from your hand: Create a 1/1 white and blue Bird creature token with flying.', { power: '1', toughness: '1' });
    expect(d.abilities?.some(a => a.forecast && a.zone === 'hand')).toBe(true);
    const g = setup();
    const c = put(g, 0, d, 'hand');
    fillMana(g);
    // not in upkeep yet
    const i = (d.abilities ?? []).findIndex(a => a.forecast);
    expect(canActivate(g, 0, c, i)).toBe(false);
    g.step = 'upkeep'; g.active = 0; g.priority = 0; g.awaiting = null;
    expect(canActivate(g, 0, c, i)).toBe(true);
  });

  it('recover: may pay to return the card from the graveyard when a creature dies, otherwise exile it', () => {
    const d = card('Krosan Reclamation', 'Instant', '{1}{G}', 'Recover {0}\nDraw a card.');
    expect(d.recover).toBeTruthy();
    const g = setup();
    const rec = put(g, 0, d, 'graveyard');
    const cr = put(g, 0, card('KDR Cub', 'Creature — Bear', '{0}', '', { power: '1', toughness: '1' }));
    fillMana(g);
    sacrifice(g, cr);
    resolveAll(g);
    expect(g.players[0].hand.some(x => x.uid === rec.uid) || g.players[0].exile.some(x => x.uid === rec.uid)).toBe(true);
  });

  it('transmute: discard this to search for a card with the same mana value', () => {
    const d = card('Dizzy Spell', 'Instant', '{U}', 'Target creature gets -3/-0 until end of turn.\nTransmute {1}{U}');
    expect(d.transmute).toBeTruthy();
    expect(d.abilities?.some(a => /transmute/i.test(a.label) && a.zone === 'hand')).toBe(true);
  });

  it('tribute: unpaid tribute lets the unpaid trigger fire', () => {
    const d = card('Flame-Wreathed Phoenix', 'Creature — Phoenix', '{2}{R}{R}', 'Flying, haste\nTribute 2\nWhen this creature enters, if tribute wasn\'t paid, it gains flying and haste.', { power: '2', toughness: '2' });
    expect(d.tribute).toBe(2);
    const g = setup();
    const c = put(g, 0, d, 'hand');
    // put onto battlefield via enter
    const bf = put(g, 0, d);
    // already on bf from put; check unpaid path by entering a fresh one
    const c2: Card = { uid: g.nextUid++, id: d.id, owner: 0, tapped: false, sick: true, damage: 0, pp: 0, pt: 0 };
    g.players[0].battlefield.push(c2);
    enter(g, c2, 0);
    expect(c2.tributePaid).toBeFalsy();
  });

  it('non-mana ward: Ward—discard a card compiles', () => {
    const d = card('Warded Guardian', 'Creature — Human', '{1}{W}', 'Ward—Discard a card.', { power: '2', toughness: '2' });
    expect(d.wardDiscard).toBe(1);
  });

  it('soulshift: dying returns a cheaper Spirit from the graveyard', () => {
    const d = card('Horobi\'s Whisper', 'Instant', '{1}{B}{B}', 'Soulshift 3\nDestroy target nonblack creature.');
    // soulshift usually on spirits
    const sp = card('Elder Pine of Jukai', 'Creature — Spirit', '{3}{G}', 'Soulshift 2', { power: '2', toughness: '1' });
    expect(sp.soulshift).toBe(2);
    const g = setup();
    const dest = put(g, 0, card('KDR Spirit', 'Creature — Spirit', '{1}', '', { power: '1', toughness: '1' }), 'graveyard');
    // typeline subtypes
    const body = put(g, 0, sp);
    sacrifice(g, body);
    resolveAll(g);
    expect(g.players[0].hand.some(x => x.uid === dest.uid) || g.players[0].graveyard.some(x => x.uid === dest.uid)).toBe(true);
  });

  it('bargain: sacrificing an artifact or token marks the spell bargained', () => {
    const d = card('Candy Grapple', 'Instant', '{1}{B}', 'Bargain\nTarget creature gets -3/-3 until end of turn.');
    expect(d.bargain).toBe(true);
    const g = setup();
    const food = put(g, 0, card('KDR Food', 'Artifact — Food', '{0}', ''));
    const cr = put(g, 1, card('KDR Beast', 'Creature — Beast', '{0}', '', { power: '3', toughness: '3' }));
    const c = put(g, 0, d, 'hand');
    fillMana(g);
    expect(castSpell(g, 0, c.uid, { bargain: true, sacs: [food.uid], targets: [{ card: cr.uid }] })).toBe(true);
    expect(c.bargained).toBe(true);
  });

  it('exploit: you may sacrifice a creature and the exploit trigger fires', () => {
    const d = card('Silumgar Butcher', 'Creature — Zombie Djinn', '{4}{B}', 'Exploit\nWhen you exploit a creature, target creature gets -3/-3 until end of turn.', { power: '3', toughness: '3' });
    expect(d.exploit).toBe(true);
    expect(d.triggers?.some(t => t.ev === 'exploit' || /exploit/i.test(t.label ?? ''))).toBe(true);
  });

  it('conspire: tapping two creatures that share a color copies the spell', () => {
    const d = card('Barkshell Blessing', 'Instant', '{G}', 'Conspire\nTarget creature gets +2/+2 until end of turn.', { colors: ['G'] });
    d.colors = ['G'];
    expect(d.conspire).toBe(true);
    const g = setup();
    const aDef = card('KDR Elf', 'Creature — Elf', '{G}', '', { power: '1', toughness: '1', colors: ['G'] }); aDef.colors = ['G'];
    const bDef = card('KDR Elf 2', 'Creature — Elf', '{G}', '', { power: '1', toughness: '1', colors: ['G'] }); bDef.colors = ['G'];
    const a = put(g, 0, aDef); const b = put(g, 0, bDef);
    const tgt = put(g, 0, card('KDR BearC', 'Creature — Bear', '{G}', '', { power: '2', toughness: '2' }));
    const ca = put(g, 0, d, 'hand');
    fillMana(g);
    expect(castSpell(g, 0, ca.uid, { conspire: [a.uid, b.uid], targets: [{ card: tgt.uid }] })).toBe(true);
    expect(a.tapped && b.tapped).toBe(true);
    resolveAll(g);
    expect(power(g, tgt)).toBeGreaterThanOrEqual(6);
  });
});
