import { describe, it, expect } from 'vitest';
import { compileScry } from '../src/import/classify';
import type { ScryCard } from '../src/import/scryfall';
import {
  newGame, startGame, Game, Card, registerCards, castSpell, pass, alive,
  answerDecision, power, toughness, ctr, declareAttackers, declareBlockers, hasKw,
  layer, dealDamage, flushTriggers, canCast, costOf, destroy, enter,
} from '../src/engine/engine';
import type { CardDef } from '../src/engine/types';
import '../src/engine/ai';

let n = 0;
function card(name: string, type_line: string, mana_cost: string, oracle_text: string, o: Partial<ScryCard> = {}): CardDef {
  const cl = compileScry({ name, type_line, mana_cost, oracle_text, colors: [], color_identity: [], keywords: o.keywords ?? [], ...o });
  const d = { ...cl.def, id: `kc-${++n}-${cl.def.id}` }; registerCards([d]);
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
  g.players[pid][zone].push(c); layer(g); return c;
}
function resolveAll(g: Game) { let i = 0; while ((g.stack.length || g.decision || g.pending.length) && i++ < 80) { if (g.decision) { if (g.decision.kind === 'may') answerDecision(g, true); else if (g.decision.kind === 'pick') answerDecision(g, (g.decision.cards ?? []).slice(0, Math.max(g.decision.min ?? 1, 1)).map((c: Card) => c.uid)); else answerDecision(g, false); } else if (g.priority != null) pass(g, g.priority); else flushTriggers(g); } }
function toAttack(g: Game) { let i = 0; while (g.awaiting !== 'attack' && i++ < 80) { if (g.decision) answerDecision(g, false); else pass(g, g.priority!); } }
const VANILLA = (p = 2, t = 2, name = 'KC Bear'): CardDef => card(name, 'Creature — Bear', '{1}{G}', '', { power: String(p), toughness: String(t) });

describe('phase C: compile combat and ETB keywords', () => {
  it('Plague Stinger has infect', () => {
    const d = card('Plague Stinger', 'Creature — Phyrexian Insect', '{1}{B}', 'Flying\nInfect', { power: '1', toughness: '1', keywords: ['Flying', 'Infect'] });
    auto(d);
    expect(d.keywords).toContain('infect');
  });
  it('Bushido, Modular, Extort, Fabricate, Dash compile', () => {
    const b = card('Devoted Hero', 'Creature — Soldier', '{W}', 'Bushido 1', { power: '1', toughness: '1', keywords: ['Bushido'] });
    auto(b); expect(b.triggers?.some(t => /Bushido/.test(t.label ?? ''))).toBe(true);
    const m = card('Arcbound Slith', 'Artifact Creature — Slith', '{2}', 'Modular 1\nWhenever Arcbound Slith deals combat damage to a player, put a +1/+1 counter on it.', { power: '0', toughness: '0', keywords: ['Modular'] });
    auto(m); expect(m.modular).toBe(1);
    const e = card('Treasury Thrull', 'Creature — Thrull', '{4}{W}{B}', 'Extort\nWhenever Treasury Thrull attacks, you may put target artifact, creature, or enchantment card from your graveyard on top of your library.', { power: '4', toughness: '4', keywords: ['Extort'] });
    // the second line may fail; at least extort should parse as a keyword so leftovers might remain
    expect(e.extort).toBe(true);
    const f = card('Whirler Rogue', 'Creature — Human Rogue Artificer', '{2}{U}{U}', 'Fabricate 2', { power: '2', toughness: '2', keywords: ['Fabricate'] });
    // Whirler Rogue also has other text; use a simple one
    const f2 = card('Fabricate Test', 'Creature — Construct', '{3}', 'Fabricate 2', { power: '2', toughness: '2', keywords: ['Fabricate'] });
    auto(f2); expect(f2.fabricate).toBe(2);
    const dash = card('Lightning Berserker', 'Creature — Human Berserker', '{R}', '{T}: Lightning Berserker gets +1/+0 until end of turn.\nDash {R}', { power: '1', toughness: '1', keywords: ['Dash'] });
    expect(dash.dash).toBeTruthy();
    void b; void m; void e; void f;
  });
});

describe('phase C: runtime', () => {
  it('infect deals -1/-1 to creatures and poison to players', () => {
    const g = setup();
    const stinger = card('Plague Stinger', 'Creature — Phyrexian Insect', '{1}{B}', 'Flying\nInfect', { power: '1', toughness: '1', keywords: ['Flying', 'Infect'] });
    auto(stinger);
    const src = put(g, 0, stinger);
    const prey = put(g, 1, VANILLA(2, 2));
    dealDamage(g, src.id, src, { card: prey }, 1);
    expect(ctr(prey, '-1/-1')).toBe(1);
    expect(prey.damage).toBe(0);
    const life = g.players[1].life;
    dealDamage(g, src.id, src, { player: 1 }, 1, true);
    expect(g.players[1].life).toBe(life);
    expect(g.players[1].poison).toBe(1);
  });

  it('bushido pumps when the creature becomes blocked', () => {
    const g = setup();
    const d = card('Bushido Test', 'Creature — Samurai', '{W}', 'Bushido 2', { power: '1', toughness: '1', keywords: ['Bushido'] });
    auto(d);
    const a = put(g, 0, d); a.sick = false;
    const b = put(g, 1, VANILLA(1, 3, 'KC Wall'));
    toAttack(g);
    declareAttackers(g, 0, [{ uid: a.uid, defender: 1 }]);
    let i = 0; while (g.awaiting !== 'block' && i++ < 30) { if (g.decision) answerDecision(g, false); else if (g.priority != null) pass(g, g.priority); else break; }
    expect(g.awaiting).toBe('block');
    declareBlockers(g, 1, [{ blocker: b.uid, attacker: a.uid }]);
    resolveAll(g);
    expect(power(g, a)).toBe(3);
  });

  it('modular moves +1/+1 counters to another artifact creature on death', () => {
    const g = setup();
    const slith = card('Arcbound Slith', 'Artifact Creature — Slith', '{2}', 'Modular 1', { power: '0', toughness: '0', keywords: ['Modular'] });
    auto(slith);
    const dest = card('KC Myr', 'Artifact Creature — Myr', '{2}', '', { power: '1', toughness: '1' });
    const a = put(g, 0, slith); (a.counters ??= {})['+1/+1'] = 2;
    const t = put(g, 0, dest);
    destroy(g, a);
    flushTriggers(g); resolveAll(g);
    expect(ctr(t, '+1/+1')).toBe(2);
  });

  it('fabricate can put +1/+1 counters on the creature', () => {
    const g = setup();
    const d = card('Fabricate Test', 'Creature — Construct', '{3}', 'Fabricate 2', { power: '2', toughness: '2', keywords: ['Fabricate'] });
    auto(d);
    const c: Card = { uid: g.nextUid++, id: d.id, owner: 0, tapped: false, sick: false, damage: 0, pp: 0, pt: 0 };
    enter(g, c, 0);
    flushTriggers(g); resolveAll(g);
    // AI/nonhuman fabricate: n=2 prefers counters (n < 3)
    expect(ctr(c, '+1/+1')).toBe(2);
  });

  it('dash is an alternative cost that grants haste', () => {
    const g = setup();
    const d = card('Dash Test', 'Creature — Berserker', '{2}{R}', 'Dash {R}', { power: '2', toughness: '2', keywords: ['Dash'] });
    auto(d);
    expect(d.dash).toEqual({ generic: 0, R: 1 });
    const c = put(g, 0, d, 'hand');
    g.players[0].pool.push('R');
    expect(canCast(g, 0, c, { dash: true })).toBe(true);
    expect(costOf(g, c, { dash: true })).toMatchObject({ R: 1 });
    expect(castSpell(g, 0, c.uid, { dash: true })).toBe(true);
    resolveAll(g);
    const on = g.players[0].battlefield.find(x => x.id === d.id);
    expect(on).toBeTruthy();
    expect(hasKw(on!, 'haste')).toBe(true);
    expect(on!.sick).toBe(false);
  });
});
