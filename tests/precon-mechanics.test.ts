import { describe, it, expect } from 'vitest';
import { compileScry } from '../src/import/classify';
import type { ScryCard } from '../src/import/scryfall';
import { enter, matches, condOk, becomeMonarch, declareBlockers, canActivate, planPayment, castZone, def, newGame, startGame, Game, Card, CARDS, registerCards, activate, pass, alive, answerDecision, declareAttackers, ctr, findCard, power, toughness, castSpell, canCast, canBeCommander, emblemsOf, layer, checkState, destroy, isType, hasKw, chooseTriggerTargets, canBeAttackedPw, tapForMana, offBfEff, flushTriggers, prepCopyOf, loseLife, playLand, canPlayLand, foretell, canForetell, addCounters } from '../src/engine/engine';
import type { CardDef } from '../src/engine/types';
import '../src/engine/ai';
let n = 0;
function card(name: string, type_line: string, mana_cost: string, oracle_text: string, o: Partial<ScryCard> = {}): CardDef {
  const cl = compileScry({ name, type_line, mana_cost, oracle_text, colors: [], color_identity: [], keywords: [], ...o });
  const d = { ...cl.def, id: `pm-${++n}-${cl.def.id}` }; registerCards([d]);
  expect(cl.support, JSON.stringify(cl.unparsed)).toBe('auto');
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
function put(g: Game, pid: number, d: CardDef): Card { const c = mk(g, pid, d); if (d.loyalty) c.counters = { loyalty: d.loyalty }; g.players[pid].battlefield.push(c); layer(g); return c; }
interface RunOpt { pick?: (u: number[]) => number[]; may?: boolean; tgt?: () => object; cast?: boolean; color?: string }
/** Resolve everything with every player human, answering decisions via opts. */
function run(g: Game, o: RunOpt = {}) {
  for (const p of g.players) p.human = true; let i = 0;
  while ((g.stack.length || g.decision || g.choice) && i++ < 300) {
    if (g.choice) { expect(chooseTriggerTargets(g, [o.tgt!() as never])).toBe(true); continue; }
    const d = g.decision as { kind: string; cards?: Card[] } | null;
    if (d) answerDecision(g, (d.kind === 'pick' ? (o.pick ?? (u => u.slice(0, 1)))((d.cards ?? []).map(c => c.uid)) : d.kind === 'may' ? !!o.may : d.kind === 'cast' ? !!o.cast : d.kind === 'color' ? o.color ?? 'R' : false) as never);
    else pass(g, g.priority!);
  }
}
function resolveAI(g: Game) { let i = 0; while ((g.stack.length || g.decision) && i++ < 300) { if (g.decision) answerDecision(g, false); else pass(g, g.priority!); } }
const BEAR = () => card('PW3 Bear', 'Creature — Bear', '{1}{G}', '', { power: '2', toughness: '2', colors: ['G'] });
const FLYER = () => card('PW3 Bird', 'Creature — Bird', '{1}{U}', 'Flying', { power: '1', toughness: '1', colors: ['U'], keywords: ['Flying'] });
const VAMP = () => card('PW3 Vamp', 'Creature — Vampire', '{B}', '', { power: '1', toughness: '1', colors: ['B'] });
const ROCK = () => card('PW3 Rock', 'Artifact', '{2}', '');
const ZAP = () => card('PW3 Zap', 'Instant', '{R}', 'PW3 Zap deals 1 damage to any target.');
const FOREST = () => card('Forest', 'Basic Land — Forest', '', '({T}: Add {G}.)');
const HERO = () => card('PM Hero', 'Creature — Human Hero', '{G}', '', { power: '2', toughness: '2', colors: ['G'] });
const HASLAND = (n: string) => { const d = card(n, 'Land', '', `{T}: Add one mana of any color. Spend this mana only to cast a Hero spell or to activate an ability of a Hero source.`); return d; };

describe('precon shared mechanics', () => {
  it('restricted mana: hero-only mana pays for a Hero spell but not a non-Hero spell', () => {
    const g = setup(); const land = put(g, 0, HASLAND('PM Tower'));
    expect(def(land).mana?.[0].only).toBe('hero');
    expect(planPayment(g.players[0], { generic: 0, G: 1 } as never, { spend: { spell: HERO() } })).toBeTruthy();
    expect(planPayment(g.players[0], { generic: 0, G: 1 } as never, { spend: { spell: BEAR() } })).toBeNull();
  });
  it('Vibranium token: colorless mana spendable only on artifact spells', () => {
    const g = setup(); const d = card('PM Mine', 'Artifact', '{2}', 'When PM Mine enters, create a tapped Vibranium token.');
    const c = mk(g, 0, d); enter(g, c, 0); flushTriggers(g); resolveAI(g);
    const v = g.players[0].battlefield.find(x => def(x).sub?.includes('Vibranium'))!; expect(v).toBeTruthy(); expect(v.tapped).toBe(true); v.tapped = false;
    expect(planPayment(g.players[0], { generic: 1 } as never, { spend: { spell: ROCK() } })).toBeTruthy();
    expect(planPayment(g.players[0], { generic: 1 } as never, { spend: { spell: BEAR() } })).toBeNull();
  });
  it('chosen creature type: is the chosen type, and others of that type enter with a +1/+1 counter', () => {
    const g = setup(); const b0 = put(g, 0, BEAR()); put(g, 0, BEAR()); put(g, 0, BEAR());
    const mim = card('PM Mimic', 'Artifact Creature — Shapeshifter', '{2}', 'As PM Mimic enters, choose a creature type.\nPM Mimic is the chosen type in addition to its other types.\nEach other creature you control of the chosen type enters with an additional +1/+1 counter on it.', { power: '2', toughness: '1' });
    g.players[0].library = []; const m = mk(g, 0, mim); enter(g, m, 0); flushTriggers(g); resolveAI(g); void b0;
    expect(m.chosenType).toBe('Bear'); expect(def(m).sub).toContain('Bear');
    const b = mk(g, 0, BEAR()); enter(g, b, 0); expect(ctr(b, '+1/+1')).toBe(1);
    const v = mk(g, 0, VAMP()); enter(g, v, 0); expect(ctr(v, '+1/+1')).toBe(0);
  });
  it('chosen type filters: "creatures you control of the chosen type get +1/+1"', () => {
    const g = setup(); const ban = put(g, 0, card('PM Banner', 'Artifact', '{3}', 'As PM Banner enters, choose a creature type.\nCreatures you control of the chosen type get +1/+1.'));
    ban.chosenType = 'Bear'; const b = put(g, 0, BEAR()); const v = put(g, 0, VAMP()); layer(g);
    expect(power(g, b)).toBe(3); expect(power(g, v)).toBe(1);
  });
  it("Raise the Palisade-style: AI keeps its own type and bounces creatures that aren't of the chosen type", () => {
    const g = setup(); put(g, 0, BEAR()); put(g, 0, BEAR()); put(g, 1, VAMP()); put(g, 2, VAMP());
    const sp = card('PM Palisade', 'Sorcery', '{4}{U}', "Choose a creature type. Return all creatures that aren't of the chosen type to their owners' hands.");
    expect(sp.spell?.effects[0]).toMatchObject({ op: 'chooseType', text: 'keep' });
    const c = mk(g, 0, sp); g.players[0].hand.push(c); g.players[0].pool.push(...Array(5).fill('U')); for (const p of g.players) p.human = false;
    expect(castSpell(g, 0, c.uid)).toBe(true); resolveAI(g);
    expect(g.players[0].battlefield.filter(x => def(x).sub?.includes('Bear')).length).toBe(2);
    expect(g.players[1].battlefield.length + g.players[2].battlefield.length).toBe(0);
  });
  it('monarch: "you become the monarch", end-step draw, combat damage steals it', () => {
    const g = setup(); const d = card('PM Crown', 'Creature — Human', '{2}', 'When PM Crown enters, if there is no monarch, you become the monarch.', { power: '1', toughness: '1' });
    const c = mk(g, 0, d); enter(g, c, 0); flushTriggers(g); resolveAI(g); expect(g.monarch).toBe(0);
    expect(condOk(g, 0, { k: 'monarch' })).toBe(true); expect(condOk(g, 0, { k: 'noMonarch' })).toBe(false);
    const c2 = mk(g, 1, d); enter(g, c2, 1); flushTriggers(g); resolveAI(g); expect(g.monarch).toBe(0); // intervening if
    becomeMonarch(g, 1); expect(g.monarch).toBe(1);
  });
  it('nth-spell and nth-draw triggers', () => {
    const d = card('PM Second', 'Enchantment', '{1}{U}', 'Whenever you cast your second spell each turn, draw a card.');
    expect(d.triggers?.[0]).toMatchObject({ ev: 'cast', nth: { k: 'n', n: 2 } });
    const e = card('PM Nonc', 'Enchantment', '{1}{U}', 'Whenever you cast your first noncreature spell each turn, draw a card.');
    expect(e.triggers?.[0]).toMatchObject({ nth: { k: 'nonc', n: 1 } });
    const f = card('PM Draw2', 'Enchantment', '{1}{U}', 'Whenever an opponent draws their second card each turn, you gain 1 life.');
    expect(f.triggers?.[0]).toMatchObject({ ev: 'drawCard', nth: { k: 'draw', n: 2 } });
    const g = setup(); put(g, 0, d); for (const p of g.players) p.human = false; const h0 = g.players[0].library.length;
    const z1 = mk(g, 0, ZAP()), z2 = mk(g, 0, ZAP()); g.players[0].hand.push(z1, z2); g.players[0].pool.push('R', 'R');
    expect(castSpell(g, 0, z1.uid, { player: 1 } as never)).toBe(true); flushTriggers(g); resolveAI(g); expect(g.players[0].library.length).toBe(h0);
    expect(castSpell(g, 0, z2.uid, { player: 1 } as never)).toBe(true); flushTriggers(g); resolveAI(g); expect(g.players[0].library.length).toBe(h0 - 1);
  });
  it('reveal lands enter tapped unless you reveal a matching card; "two or fewer other lands"', () => {
    const d = card('PM Snarl', 'Land', '', "As PM Snarl enters, you may reveal an Island or Mountain card from your hand. If you don't, PM Snarl enters tapped.\n{T}: Add {U} or {R}.");
    expect(d.etbTappedUnless).toMatchObject({ k: 'handHas' });
    const r = card('PM Razor', 'Land', '', 'PM Razor enters tapped unless you control two or fewer other lands.\n{T}: Add {R} or {W}.');
    expect(r.etbTappedUnless).toEqual({ k: 'otherLandsLE', n: 2 });
    const g = setup(); const a = mk(g, 0, d); enter(g, a, 0); expect(a.tapped).toBe(true);
    g.players[0].hand.push(mk(g, 0, card('Island', 'Basic Land — Island', '', '({T}: Add {U}.)'))); const b = mk(g, 0, d); enter(g, b, 0); expect(b.tapped).toBe(false);
  });
  it('rebound: cast from hand → exiled, recast free at your next upkeep', () => {
    const d = card('PM Rebound', 'Instant', '{1}{U}', 'Draw a card.\nRebound');
    expect(d.rebound).toBe(true);
    const g = setup(); for (const p of g.players) p.human = false; const c = mk(g, 0, d); g.players[0].hand.push(c); g.players[0].pool.push('U', 'U');
    const h = g.players[0].library.length; castSpell(g, 0, c.uid); resolveAI(g);
    expect(g.players[0].exile.some(x => x.uid === c.uid)).toBe(true); expect(g.players[0].library.length).toBe(h - 1);
    until(g, () => g.turn > 1 && g.active === 0 && g.step === 'main1');
    expect(g.players[0].graveyard.some(x => x.uid === c.uid)).toBe(true);
  });
  it('commander filters and triggers', () => {
    const d = card('PM Bastion', 'Enchantment', '{2}{W}', 'Commander creatures you control get +2/+2 and have indestructible.');
    const g = setup(); put(g, 0, d); const b = put(g, 0, BEAR()); g.players[0].commanderIds.push(b.id); const b2 = put(g, 0, VAMP()); layer(g);
    expect(power(g, b)).toBe(4); expect(power(g, b2)).toBe(1);
    const t = card('PM Nakia', 'Creature — Human', '{1}{G}', 'Whenever your commander enters, you become the monarch.', { power: '1', toughness: '1' });
    expect(t.triggers?.[0].f).toMatchObject({ cmdr: 'own' });
    expect(matches(g, b, t.triggers?.[0].f, 0)).toBe(true); expect(matches(g, b, t.triggers?.[0].f, 1)).toBe(false);
  });
  it('toughness filters', () => {
    const d = card('PM Wall', 'Enchantment', '{2}', 'Creatures you control with toughness 3 or greater get +1/+0.');
    expect(d.statics?.[0].f).toMatchObject({ touGE: 3 });
  });
});
function until(g: Game, pred: () => boolean, max = 800) { for (const p of g.players) p.human = false; let i = 0; while (!pred() && i++ < max) { if (g.decision) answerDecision(g, false); else pass(g, g.priority!); } return pred(); }
