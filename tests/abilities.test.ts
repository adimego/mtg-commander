import { describe, it, expect } from 'vitest';
import { compileScry } from '../src/import/classify';
import type { ScryCard } from '../src/import/scryfall';
import { newGame, startGame, Game, Card, CARDS, registerCards, castSpell, activate, pass, alive, answerDecision, chooseTriggerTargets, power, toughness, ctr, costOf, tapForMana, findCard } from '../src/engine/engine';
import type { CardDef } from '../src/engine/types';
import '../src/engine/ai';

let n = 0;
/** Compile a card from Oracle text and register it. */
function card(name: string, type_line: string, mana_cost: string, oracle_text: string, o: Partial<ScryCard> = {}): CardDef {
  const cl = compileScry({ name, type_line, mana_cost, oracle_text, colors: [], color_identity: [], keywords: [], ...o });
  const d = { ...cl.def, id: `t-${++n}-${cl.def.id}` }; registerCards([d]);
  (d as CardDef & { _support: string; _unparsed?: string[] })._support = cl.support; (d as CardDef & { _unparsed?: string[] })._unparsed = cl.unparsed;
  return d;
}
const auto = (d: CardDef) => expect((d as CardDef & { _support: string })._support, JSON.stringify((d as CardDef & { _unparsed?: string[] })._unparsed)).toBe('auto');
const ops = (effects: { op: string }[] | undefined) => (effects ?? []).map(e => e.op);

function setup(humans: number[] = []): Game {
  const g = newGame({ seed: 7, humans, skipAiMulligan: true });
  for (const p of g.players) { p.library.push(...p.hand); p.hand = []; }
  startGame(g); let i = 0; while (!(g.step === 'main1' && !g.stack.length && g.active === 0) && i++ < 80) { if (g.decision) answerDecision(g, false); else pass(g, g.priority!); }
  for (const p of g.players) { p.library.push(...p.hand); p.hand = []; for (const c of p.battlefield) c.tapped = false; }
  return g;
}
function put(g: Game, pid: number, d: CardDef | string, zone: 'battlefield' | 'hand' | 'graveyard' = 'battlefield'): Card {
  const c: Card = { uid: g.nextUid++, id: typeof d === 'string' ? d : d.id, owner: pid, tapped: false, sick: false, damage: 0, pp: 0, pt: 0 }; g.players[pid][zone].push(c); return c;
}
const MANA = () => Object.values(CARDS).find(c => c.name === 'Sol Ring')!;
const mana = (g: Game, pid: number, k: number) => { for (let i = 0; i < k; i++) put(g, pid, MANA()); }; // 2 colorless each
const wastes = (g: Game, pid: number, color: string, k: number) => { const id = Object.values(CARDS).find(c => c.name === ({ W: 'Plains', U: 'Island', B: 'Swamp', R: 'Mountain', G: 'Forest' } as Record<string, string>)[color])!.id; for (let i = 0; i < k; i++) put(g, pid, id); };
function resolve(g: Game) { let i = 0; while ((g.stack.length || g.decision) && i++ < 200) { if (g.decision && g.players[g.decision.pid].human) return; pass(g, g.priority!); } }
const BEAR = () => card('Test Bear', 'Creature — Bear', '{1}{G}', '', { power: '2', toughness: '2' });

describe('compiler patterns', () => {
  it('ETB trigger: draw', () => { const d = card('Elvish Visionary', 'Creature — Elf Shaman', '{1}{G}', 'When Elvish Visionary enters, draw a card.', { power: '1', toughness: '1' }); auto(d); expect(d.triggers?.length).toBe(1); expect(ops(d.triggers![0].effects)).toContain('draw'); });
  it('dies trigger', () => { const d = card('Doomed Traveler', 'Creature — Human Soldier', '{W}', 'When Doomed Traveler dies, create a 1/1 white Spirit creature token with flying.', { power: '1', toughness: '1' }); auto(d); expect(ops(d.triggers![0].effects)).toContain('token'); });
  it('tap + mana activated ability', () => { const d = card('Arcane Signet Test', 'Artifact', '{3}', '{2}, {T}: Draw a card.'); auto(d); const a = d.abilities![0]; expect(a.tap).toBe(true); expect(a.mana?.generic).toBe(2); });
  it('modal spell (choose one)', () => { const d = card('Wear Test', 'Instant', '{1}{R}', 'Choose one —\n• Destroy target artifact.\n• Destroy target enchantment.'); auto(d); expect(d.spell?.modes?.list.length).toBe(2); expect(d.spell?.modes?.max).toBe(1); });
  it('X spell', () => { const d = card('Blaze Test', 'Sorcery', '{X}{R}', 'Blaze Test deals X damage to any target.'); auto(d); expect(d.cost.x).toBe(1); });
  it('scry then draw', () => { const d = card('Opt', 'Instant', '{U}', 'Scry 1.\nDraw a card.'); auto(d); expect(ops(d.spell!.effects)).toEqual(['scry', 'draw']); });
  it('counter unless pays', () => { const d = card('Mana Leak', 'Instant', '{1}{U}', 'Counter target spell unless its controller pays {3}.'); auto(d); expect(ops(d.spell!.effects)).toContain('unless'); });
  it('tokens', () => { const d = card('Raise Test', 'Sorcery', '{2}{W}', 'Create two 1/1 white Soldier creature tokens.'); auto(d); expect(ops(d.spell!.effects)).toContain('token'); });
  it('+1/+1 counters', () => { const d = card('Counter Test', 'Instant', '{G}', 'Put two +1/+1 counters on target creature.'); auto(d); expect(ops(d.spell!.effects)).toContain('addC'); });
  it('equipment', () => { const d = card('Test Blade', 'Artifact — Equipment', '{1}', 'Equipped creature gets +2/+0.\nEquip {2}'); auto(d); expect(d.abilities?.some(a => a.equip)).toBe(true); });
  it('tutor', () => { const d = card('Demonic Tutor', 'Sorcery', '{1}{B}', 'Search your library for a card, put that card into your hand, then shuffle.'); auto(d); expect(ops(d.spell!.effects)).toContain('search'); });
  it('may … if you do', () => { const d = card('Loot Test', 'Creature — Human', '{1}{U}', 'When Loot Test enters, you may discard a card. If you do, draw two cards.', { power: '1', toughness: '1' }); auto(d); expect(ops(d.triggers![0].effects)).toContain('may'); });
  it('kicker', () => { const d = card('Kick Test', 'Sorcery', '{1}{R}', 'Kicker {2}\nKick Test deals 2 damage to any target. If this spell was kicked, it deals 4 damage instead.'); expect(d.kicker?.generic).toBe(2); });
  it('flashback and cycling', () => {
    const f = card('Think Test', 'Sorcery', '{U}', 'Draw a card.\nFlashback {2}{U}'); auto(f); expect(f.flashback?.U).toBe(1);
    const c = card('Cycle Test', 'Creature — Beast', '{4}{G}', 'Cycling {2}', { power: '5', toughness: '5' }); auto(c); expect(c.abilities?.some(a => a.zone === 'hand')).toBe(true);
  });
  it('devotion drain (Gray Merchant)', () => { const d = card('Gray Merchant of Asphodel', 'Creature — Zombie', '{3}{B}{B}', 'When Gray Merchant of Asphodel enters, each opponent loses X life, where X is your devotion to black. You gain life equal to the life lost this way.', { power: '2', toughness: '4' }); auto(d); });
  it('shockland and painland', () => {
    const s = card('Watery Grave', 'Land — Island Swamp', '', "({T}: Add {U} or {B}.)\nAs Watery Grave enters, you may pay 2 life. If you don't, it enters tapped."); expect(s.shock).toBe(2);
    const p = card('Underground River', 'Land', '', '{T}: Add {C}.\n{T}: Add {U} or {B}. Underground River deals 1 damage to you.'); auto(p); expect(p.mana?.some(m => m.pain)).toBe(true);
  });
  it('upkeep trigger and attack trigger', () => {
    const u = card('Phyrexian Arena', 'Enchantment', '{1}{B}{B}', 'At the beginning of your upkeep, you draw a card and you lose 1 life.'); auto(u);
    const a = card('Attack Test', 'Creature — Human', '{2}{W}', 'Whenever Attack Test attacks, you gain 2 life.', { power: '2', toughness: '2' }); auto(a);
  });
  it('planeswalker loyalty abilities', () => { const d = card('Test Walker', 'Legendary Planeswalker — Test', '{2}{G}', '+1: Create a 1/1 green Saproling creature token.\n−2: Draw a card.', { loyalty: '3' } as Partial<ScryCard>); expect(d.abilities?.map(a => a.loyalty)).toEqual([1, -2]); });
});

describe('engine: abilities resolve', () => {
  it('X spell deals X damage (AI chooses X via cast options)', () => {
    const g = setup(); const d = card('Blaze Test2', 'Sorcery', '{X}', 'Blaze Test2 deals X damage to target player.'); mana(g, 0, 3);
    const c = put(g, 0, d, 'hand'); const before = g.players[1].life;
    expect(castSpell(g, 0, c.uid, { targets: [{ player: 1 }], x: 5 })).toBe(true); resolve(g);
    expect(g.players[1].life).toBe(before - 5);
  });
  it('tokens are created with the right P/T', () => {
    const g = setup(); const d = card('Raise Test2', 'Sorcery', '{0}', 'Create two 1/1 white Soldier creature tokens.'); const c = put(g, 0, d, 'hand');
    const n0 = g.players[0].battlefield.length; castSpell(g, 0, c.uid); resolve(g);
    const toks = g.players[0].battlefield.filter(x => x.token); expect(g.players[0].battlefield.length - n0).toBe(2); expect(toks.every(t => power(g, t) === 1 && toughness(g, t) === 1)).toBe(true);
  });
  it('+1/+1 counters change P/T', () => {
    const g = setup(); const b = put(g, 0, BEAR()); const d = card('Counter Test2', 'Instant', '{0}', 'Put two +1/+1 counters on target creature.'); const c = put(g, 0, d, 'hand');
    castSpell(g, 0, c.uid, { targets: [{ card: b.uid }] }); resolve(g); expect(ctr(b, '+1/+1')).toBe(2); expect(power(g, b)).toBe(4);
  });
  it('equip attaches and pumps', () => {
    const g = setup(); const b = put(g, 0, BEAR()); const e = put(g, 0, card('Test Blade2', 'Artifact — Equipment', '{1}', 'Equipped creature gets +2/+0.\nEquip {2}')); mana(g, 0, 1);
    const i = def0(e).abilities!.findIndex(a => a.equip); expect(activate(g, 0, e.uid, i, { targets: [{ card: b.uid }] })).toBe(true); resolve(g);
    expect(e.attachedTo).toBe(b.uid); expect(power(g, b)).toBe(4);
  });
  it('modal spell resolves only the chosen mode', () => {
    const g = setup(); const art = put(g, 1, card('Rock Test', 'Artifact', '{1}', '')); const ench = put(g, 1, card('Ench Test', 'Enchantment', '{1}', ''));
    const c = put(g, 0, card('Wear Test2', 'Instant', '{0}', 'Choose one —\n• Destroy target artifact.\n• Destroy target enchantment.'), 'hand');
    expect(castSpell(g, 0, c.uid, { modes: [1], targets: [undefined, { card: ench.uid }] })).toBe(true); resolve(g);
    expect(g.players[1].battlefield.includes(ench)).toBe(false); expect(g.players[1].battlefield.includes(art)).toBe(true);
  });
  it('human scry decision: keep on top / bottom', () => {
    const g = setup([0]); const c = put(g, 0, card('Scry Test', 'Sorcery', '{0}', 'Scry 2.'), 'hand'); const lib = () => g.players[0].library; const [a, b] = [lib()[lib().length - 1], lib()[lib().length - 2]];
    castSpell(g, 0, c.uid); resolve(g); expect(g.decision?.kind).toBe('scry');
    answerDecision(g, { top: [b.uid], away: [a.uid] }); resolve(g);
    expect(lib()[lib().length - 1]).toBe(b); expect(lib()[0]).toBe(a);
  });
  it('human may decision: decline does nothing, accept draws', () => {
    for (const yes of [false, true]) {
      const g = setup([0]); const c = put(g, 0, card('May Test', 'Sorcery', '{0}', 'You may draw a card.'), 'hand'); const h = g.players[0].hand.length - 1;
      castSpell(g, 0, c.uid); resolve(g); expect(g.decision?.kind).toBe('may'); answerDecision(g, yes); resolve(g);
      expect(g.players[0].hand.length).toBe(h + (yes ? 1 : 0));
    }
  });
  it('human tutor uses a pick decision', () => {
    const g = setup([0]); const c = put(g, 0, card('Demonic Tutor2', 'Sorcery', '{0}', 'Search your library for a card, put that card into your hand, then shuffle.'), 'hand');
    castSpell(g, 0, c.uid); resolve(g); expect(g.decision?.kind).toBe('pick'); const want = (g.decision as { cards: Card[] }).cards[5];
    answerDecision(g, [want.uid]); resolve(g); expect(g.players[0].hand).toContain(want);
  });
  it('human trigger targets via chooseTriggerTargets', () => {
    const g = setup([0]); const victim = put(g, 1, BEAR());
    const d = card('Ping Test', 'Creature — Goblin', '{0}', 'When Ping Test enters, it deals 2 damage to target creature.', { power: '1', toughness: '1' }); const c = put(g, 0, d, 'hand');
    castSpell(g, 0, c.uid); resolve(g); expect(g.choice).toBeTruthy(); expect(chooseTriggerTargets(g, [{ card: victim.uid }])).toBe(true); resolve(g);
    expect(g.players[1].battlefield.includes(victim)).toBe(false);
  });
  it('counter unless pays: AI that cannot pay gets countered', () => {
    const g = setup(); const leak = put(g, 1, card('Mana Leak2', 'Instant', '{0}', 'Counter target spell unless its controller pays {3}.'), 'hand');
    const s = put(g, 0, card('Sorc Test', 'Sorcery', '{0}', 'Draw a card.'), 'hand'); for (const c of g.players[0].battlefield) c.tapped = true;
    castSpell(g, 0, s.uid); pass(g, 0); expect(castSpell(g, 1, leak.uid, { targets: [{ stack: g.stack[0].id }] })).toBe(true); resolve(g);
    expect(g.players[0].graveyard).toContain(s); expect(g.log.some(l => /countered/i.test(l))).toBe(true);
  });
  it('cycling from hand draws', () => {
    const g = setup(); const c = put(g, 0, card('Cycle Test2', 'Creature — Beast', '{4}{G}', 'Cycling {2}', { power: '5', toughness: '5' }), 'hand'); mana(g, 0, 1);
    const h = g.players[0].hand.length; const i = def0(c).abilities!.findIndex(a => a.zone === 'hand'); expect(activate(g, 0, c.uid, i)).toBe(true); resolve(g);
    expect(g.players[0].graveyard).toContain(c); expect(g.players[0].hand.length).toBe(h); // cycled one, drew one
  });
  it('flashback casts from the graveyard and exiles', () => {
    const g = setup(); const c = put(g, 0, card('Think Test2', 'Sorcery', '{U}', 'Draw a card.\nFlashback {1}'), 'graveyard'); mana(g, 0, 1);
    expect(castSpell(g, 0, c.uid, { flashback: true })).toBe(true); resolve(g); expect(g.players[0].exile).toContain(c);
  });
  it('manual mana: tapped mana floats and pays costs', () => {
    const g = setup([0]); wastes(g, 0, 'R', 1); const m = g.players[0].battlefield[g.players[0].battlefield.length - 1];
    expect(tapForMana(g, 0, m.uid)).toBe(true); expect(g.players[0].pool).toEqual(['R']);
    for (const c of g.players[0].battlefield) if (c !== m) c.tapped = true;
    const s = put(g, 0, card('Shock Test', 'Instant', '{R}', 'Shock Test deals 2 damage to any target.'), 'hand');
    expect(castSpell(g, 0, s.uid, { targets: [{ player: 1 }] })).toBe(true); expect(g.players[0].pool).toEqual([]);
  });
  it('partner commanders each have their own tax', () => {
    const g = setup(); const p = g.players[0]; const a = card('Partner A', 'Legendary Creature — Human', '{0}', 'Partner', { power: '1', toughness: '1', keywords: ['Partner'] }); const b = card('Partner B', 'Legendary Creature — Elf', '{0}', 'Partner', { power: '1', toughness: '1', keywords: ['Partner'] });
    p.commanderIds = [a.id, b.id]; const ca = put(g, 0, a); p.battlefield.pop(); p.command = [ca, { ...ca, uid: g.nextUid++, id: b.id }]; p.casts = { [a.id]: 2 };
    expect(costOf(g, p.command[0]).generic).toBe(4); expect(costOf(g, p.command[1]).generic).toBe(0);
  });
  it('trigger ordering decision for multiple human triggers', () => {
    const g = setup([0]); put(g, 0, card('Watcher A', 'Enchantment', '{0}', 'Whenever you cast a spell, you gain 1 life.')); put(g, 0, card('Watcher B', 'Enchantment', '{0}', 'Whenever you cast a spell, draw a card.'));
    const s = put(g, 0, card('Noop Test', 'Sorcery', '{0}', 'You gain 1 life.'), 'hand'); castSpell(g, 0, s.uid);
    expect(g.decision?.kind).toBe('order'); answerDecision(g, [1, 0]); expect(g.stack.length).toBe(3); expect(g.stack[2].label).toMatch(/Watcher B/); expect(g.stack[1].label).toMatch(/Watcher A/);
  });
});
const def0 = (c: Card) => CARDS[c.id];
void alive; void findCard;
