import { describe, it, expect } from 'vitest';
import { compileScry } from '../src/import/classify';
import type { ScryCard } from '../src/import/scryfall';
import { def, newGame, startGame, Game, Card, CARDS, registerCards, activate, pass, alive, answerDecision, declareAttackers, ctr, findCard, power, toughness, castSpell, canCast, canBeCommander, emblemsOf, layer, checkState, destroy, isType, hasKw, chooseTriggerTargets, canBeAttackedPw, tapForMana, offBfEff, flushTriggers } from '../src/engine/engine';
import type { CardDef } from '../src/engine/types';
import '../src/engine/ai';

const W: Record<string, { name: string; type_line: string; mana_cost: string; oracle_text: string; loyalty: string; colors: string[] }> = {
 "Vraska, Betrayal's Sting": {
  "name": "Vraska, Betrayal's Sting",
  "type_line": "Legendary Planeswalker \u2014 Vraska",
  "mana_cost": "{4}{B}{B/P}",
  "oracle_text": "Compleated ({B/P} can be paid with {B} or 2 life. If life was paid, this planeswalker enters with two fewer loyalty counters.)\n0: You draw a card and lose 1 life. Proliferate.\n\u22122: Target creature becomes a Treasure artifact with \"{T}, Sacrifice this artifact: Add one mana of any color\" and loses all other card types and abilities.\n\u22129: If target player has fewer than nine poison counters, they get a number of poison counters equal to the difference.",
  "loyalty": "5",
  "colors": [
   "B"
  ]
 },
 "Tezzeret, Cruel Captain": {
  "name": "Tezzeret, Cruel Captain",
  "type_line": "Legendary Planeswalker \u2014 Tezzeret",
  "mana_cost": "{3}",
  "oracle_text": "Whenever an artifact you control enters, put a loyalty counter on Tezzeret.\n0: Untap target artifact or creature. If it's an artifact creature, put a +1/+1 counter on it.\n\u22123: Search your library for an artifact card with mana value 1 or less, reveal it, put it into your hand, then shuffle.\n\u22127: You get an emblem with \"At the beginning of combat on your turn, put three +1/+1 counters on target artifact you control. If it's not a creature, it becomes a 0/0 Robot artifact creature.\"",
  "loyalty": "4",
  "colors": []
 },
 "Grist, the Hunger Tide": {
  "name": "Grist, the Hunger Tide",
  "type_line": "Legendary Planeswalker \u2014 Grist",
  "mana_cost": "{1}{B}{G}",
  "oracle_text": "As long as Grist isn't on the battlefield, it's a 1/1 Insect creature in addition to its other types.\n+1: Create a 1/1 black and green Insect creature token, then mill a card. If an Insect card was milled this way, put a loyalty counter on Grist and repeat this process.\n\u22122: You may sacrifice a creature. When you do, destroy target creature or planeswalker.\n\u22125: Each opponent loses life equal to the number of creature cards in your graveyard.",
  "loyalty": "3",
  "colors": [
   "B",
   "G"
  ]
 },
 "Chandra, Torch of Defiance": {
  "name": "Chandra, Torch of Defiance",
  "type_line": "Legendary Planeswalker \u2014 Chandra",
  "mana_cost": "{2}{R}{R}",
  "oracle_text": "+1: Exile the top card of your library. You may cast that card. If you don't, Chandra deals 2 damage to each opponent.\n+1: Add {R}{R}.\n\u22123: Chandra deals 4 damage to target creature.\n\u22127: You get an emblem with \"Whenever you cast a spell, this emblem deals 5 damage to any target.\"",
  "loyalty": "4",
  "colors": [
   "R"
  ]
 },
 "Ugin, the Ineffable": {
  "name": "Ugin, the Ineffable",
  "type_line": "Legendary Planeswalker \u2014 Ugin",
  "mana_cost": "{6}",
  "oracle_text": "Colorless spells you cast cost {2} less to cast.\n+1: Exile the top card of your library face down and look at it. Create a 2/2 colorless Spirit creature token. When that token leaves the battlefield, put the exiled card into your hand.\n\u22123: Destroy target permanent that's one or more colors.",
  "loyalty": "4",
  "colors": []
 },
 "The Eternal Wanderer": {
  "name": "The Eternal Wanderer",
  "type_line": "Legendary Planeswalker",
  "mana_cost": "{4}{W}{W}",
  "oracle_text": "No more than one creature can attack The Eternal Wanderer each combat.\n+1: Exile up to one target artifact or creature. Return that card to the battlefield under its owner's control at the beginning of that player's next end step.\n0: Create a 2/2 white Samurai creature token with double strike.\n\u22124: For each player, choose a creature that player controls. Each player sacrifices all creatures they control not chosen this way.",
  "loyalty": "5",
  "colors": [
   "W"
  ]
 },
 "The Aetherspark": {
  "name": "The Aetherspark",
  "type_line": "Legendary Artifact Planeswalker \u2014 Equipment",
  "mana_cost": "{4}",
  "oracle_text": "As long as The Aetherspark is attached to a creature, The Aetherspark can't be attacked and has \"Whenever equipped creature deals combat damage during your turn, put that many loyalty counters on The Aetherspark.\"\n+1: Attach The Aetherspark to up to one target creature you control. Put a +1/+1 counter on that creature.\n\u22125: Draw two cards.\n\u221210: Add ten mana of any one color.",
  "loyalty": "4",
  "colors": []
 },
 "Nissa, Who Shakes the World": {
  "name": "Nissa, Who Shakes the World",
  "type_line": "Legendary Planeswalker \u2014 Nissa",
  "mana_cost": "{3}{G}{G}",
  "oracle_text": "Whenever you tap a Forest for mana, add an additional {G}.\n+1: Put three +1/+1 counters on up to one target noncreature land you control. Untap it. It becomes a 0/0 Elemental creature with vigilance and haste that's still a land.\n\u22128: You get an emblem with \"Lands you control have indestructible.\" Search your library for any number of Forest cards, put them onto the battlefield tapped, then shuffle.",
  "loyalty": "5",
  "colors": [
   "G"
  ]
 },
 "Ugin, Eye of the Storms": {
  "name": "Ugin, Eye of the Storms",
  "type_line": "Legendary Planeswalker \u2014 Ugin",
  "mana_cost": "{7}",
  "oracle_text": "When you cast this spell, exile up to one target permanent that's one or more colors.\nWhenever you cast a colorless spell, exile up to one target permanent that's one or more colors.\n+2: You gain 3 life and draw a card.\n0: Add {C}{C}{C}.\n\u221211: Search your library for any number of colorless nonland cards, exile them, then shuffle. Until end of turn, you may cast those cards without paying their mana costs.",
  "loyalty": "7",
  "colors": []
 },
 "Oko, Thief of Crowns": {
  "name": "Oko, Thief of Crowns",
  "type_line": "Legendary Planeswalker \u2014 Oko",
  "mana_cost": "{1}{G}{U}",
  "oracle_text": "+2: Create a Food token. (It's an artifact with \"{2}, {T}, Sacrifice this token: You gain 3 life.\")\n+1: Target artifact or creature loses all abilities and becomes a green Elk creature with base power and toughness 3/3.\n\u22125: Exchange control of target artifact or creature you control and target creature an opponent controls with power 3 or less.",
  "loyalty": "4",
  "colors": [
   "G",
   "U"
  ]
 },
 "Daretti, Scrap Savant": {
  "name": "Daretti, Scrap Savant",
  "type_line": "Legendary Planeswalker \u2014 Daretti",
  "mana_cost": "{3}{R}",
  "oracle_text": "+2: Discard up to two cards, then draw that many cards.\n\u22122: Sacrifice an artifact. If you do, return target artifact card from your graveyard to the battlefield.\n\u221210: You get an emblem with \"Whenever an artifact is put into your graveyard from the battlefield, return that card to the battlefield at the beginning of the next end step.\"\nDaretti, Scrap Savant can be your commander.",
  "loyalty": "3",
  "colors": [
   "R"
  ]
 },
 "Sorin, Imperious Bloodlord": {
  "name": "Sorin, Imperious Bloodlord",
  "type_line": "Legendary Planeswalker \u2014 Sorin",
  "mana_cost": "{2}{B}",
  "oracle_text": "+1: Target creature you control gains deathtouch and lifelink until end of turn. If it's a Vampire, put a +1/+1 counter on it.\n+1: You may sacrifice a Vampire. When you do, Sorin deals 3 damage to any target and you gain 3 life.\n\u22123: You may put a Vampire creature card from your hand onto the battlefield.",
  "loyalty": "4",
  "colors": [
   "B"
  ]
 }
};
let n = 0;
function card(name: string, type_line: string, mana_cost: string, oracle_text: string, o: Partial<ScryCard> = {}): CardDef {
  const cl = compileScry({ name, type_line, mana_cost, oracle_text, colors: [], color_identity: [], keywords: [], ...o });
  const d = { ...cl.def, id: `pw3-${++n}-${cl.def.id}` }; registerCards([d]);
  expect(cl.support, JSON.stringify(cl.unparsed)).toBe('auto');
  return d;
}
const walker = (name: string) => { const w = W[name]; return card(w.name, w.type_line, w.mana_cost, w.oracle_text, { loyalty: w.loyalty, colors: w.colors as never }); };
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
const INSECT = () => card('PW3 Beetle', 'Creature — Insect', '{G}', '', { power: '1', toughness: '1', colors: ['G'] });
const top = (g: Game, pid: number, d: CardDef) => { const c = mk(g, pid, d); g.players[pid].library.push(c); return c; };
/** pass priority until pred holds (turns advance; AI players act) */
function until(g: Game, pred: () => boolean, max = 800) { for (const p of g.players) p.human = false; let i = 0; while (!pred() && i++ < max) { if (g.decision) answerDecision(g, false); else pass(g, g.priority!); } return pred(); }

describe('reflexive triggers', () => {
  it('Sorin +1: sacrifice a Vampire; when you do, 3 damage to any target and gain 3', () => {
    const g = setup(); const s = put(g, 0, walker('Sorin, Imperious Bloodlord')); const v = put(g, 0, VAMP()); const b = put(g, 1, BEAR());
    const life = g.players[0].life; expect(activate(g, 0, s.uid, 1)).toBe(true);
    run(g, { may: true, pick: () => [v.uid], tgt: () => ({ card: b.uid }) });
    expect(g.players[0].battlefield.includes(v)).toBe(false);
    expect(g.players[1].battlefield.includes(b)).toBe(false); expect(g.players[0].life).toBe(life + 3);
  });
  it("Sorin +1: declining the sacrifice means no reflexive trigger", () => {
    const g = setup(); const s = put(g, 0, walker('Sorin, Imperious Bloodlord')); const v = put(g, 0, VAMP()); const b = put(g, 1, BEAR());
    const life = g.players[0].life; expect(activate(g, 0, s.uid, 1)).toBe(true);
    run(g, { may: false, tgt: () => { throw new Error('no trigger expected'); } });
    expect(g.players[0].battlefield.includes(v)).toBe(true); expect(g.players[1].battlefield.includes(b)).toBe(true); expect(g.players[0].life).toBe(life);
  });
  it('Grist −2: you may sacrifice a creature; when you do, destroy target creature or planeswalker', () => {
    const g = setup(); const gr = put(g, 0, walker('Grist, the Hunger Tide')); const own = put(g, 0, BEAR()); const b = put(g, 1, BEAR());
    expect(activate(g, 0, gr.uid, 1)).toBe(true); run(g, { may: true, pick: () => [own.uid], tgt: () => ({ card: b.uid }) });
    expect(g.players[0].battlefield.includes(own)).toBe(false); expect(g.players[1].battlefield.includes(b)).toBe(false); expect(ctr(gr, 'loyalty')).toBe(1);
  });
});

describe('type-changing effects and layers', () => {
  it('Oko +1: loses all abilities and becomes a green Elk 3/3; artifact stays an artifact', () => {
    const g = setup(); const o = put(g, 0, walker('Oko, Thief of Crowns')); const f = put(g, 1, FLYER()); const r = put(g, 1, ROCK());
    expect(activate(g, 0, o.uid, 1, { card: f.uid })).toBe(true); resolveAI(g);
    expect(hasKw(f, 'flying')).toBe(false); expect(power(g, f)).toBe(3); expect(toughness(g, f)).toBe(3); expect(def(f).sub).toEqual(['Elk']); expect(def(f).colors).toEqual(['G']);
    for (const k of Object.keys(o)) if (/act|used/i.test(k)) delete (o as never as Record<string, unknown>)[k];
    expect(activate(g, 0, o.uid, 1, { card: r.uid })).toBe(true); resolveAI(g);
    expect(isType(r, 'Artifact')).toBe(true); expect(isType(r, 'Creature')).toBe(true); expect(power(g, r)).toBe(3);
  });
  it('timestamps: an ability granted after "loses all abilities" survives; one granted before does not', () => {
    const g = setup(); const b = put(g, 1, BEAR());
    const oko = card('PW3 Elkify', 'Sorcery', '{G}', 'Target creature loses all abilities and becomes a green Elk creature with base power and toughness 3/3.');
    const wings = card('PW3 Wings', 'Instant', '{U}', 'Target creature gains flying until end of turn.');
    const cast = (d: CardDef, t: Card) => { const c = mk(g, 0, d); g.players[0].hand.push(c); g.players[0].pool = ['G', 'U', 'R']; g.priority = 0; expect(castSpell(g, 0, c.uid, { card: t.uid })).toBe(true); resolveAI(g); };
    cast(wings, b); expect(hasKw(b, 'flying')).toBe(true);
    cast(oko, b); expect(hasKw(b, 'flying')).toBe(false);
    cast(wings, b); expect(hasKw(b, 'flying')).toBe(true); expect(power(g, b)).toBe(3);
  });
  it('Oko −5: exchange control of your artifact and an opposing creature with power 3 or less', () => {
    const g = setup(); const o = put(g, 0, walker('Oko, Thief of Crowns')); const r = put(g, 0, ROCK()); const b = put(g, 1, BEAR());
    o.counters!.loyalty = 5; expect(activate(g, 0, o.uid, 2, { targets: [{ card: r.uid }, { card: b.uid }] })).toBe(true); resolveAI(g);
    expect(g.players[0].battlefield.includes(b)).toBe(true); expect(g.players[1].battlefield.includes(r)).toBe(true);
  });
  it("Vraska −2: target creature becomes a Treasure artifact with the Treasure mana ability and loses other types", () => {
    const g = setup(); const v = put(g, 0, walker("Vraska, Betrayal's Sting")); const b = put(g, 1, BEAR());
    expect(activate(g, 0, v.uid, 1, { card: b.uid })).toBe(true); resolveAI(g);
    expect(isType(b, 'Creature')).toBe(false); expect(isType(b, 'Artifact')).toBe(true); expect(def(b).sub).toEqual(['Treasure']); expect(def(b).mana?.[0]?.sac).toBe(true);
  });
  it('Vraska −9: target player gets poison up to nine; ten poison loses the game', () => {
    const g = setup(); const v = put(g, 0, walker("Vraska, Betrayal's Sting")); v.counters!.loyalty = 9; g.players[1].poison = 2;
    expect(activate(g, 0, v.uid, 2, { player: 1 })).toBe(true); resolveAI(g); expect(g.players[1].poison).toBe(9);
    g.players[1].poison = 10; checkState(g); expect(g.players[1].lost).toBeTruthy();
  });
  it('Nissa: Forests tap for an extra {G}; +1 animates a noncreature land as a 0/0 Elemental that is still a land', () => {
    const g = setup(); const ni = put(g, 0, walker('Nissa, Who Shakes the World')); const f = put(g, 0, FOREST());
    expect(f.manaX).toEqual(['G']); f.tapped = false; g.players[0].pool = []; tapForMana(g, 0, f.uid); expect(g.players[0].pool.length).toBe(2);
    const f2 = put(g, 0, FOREST()); f2.tapped = true;
    expect(activate(g, 0, ni.uid, 0, { card: f2.uid })).toBe(true); resolveAI(g);
    expect(f2.tapped).toBe(false); expect(isType(f2, 'Land')).toBe(true); expect(isType(f2, 'Creature')).toBe(true); expect(power(g, f2)).toBe(3); expect(hasKw(f2, 'haste')).toBe(true); expect(hasKw(f2, 'vigilance')).toBe(true);
  });
  it('Tezzeret emblem wording: if it isn\'t a creature, it becomes a 0/0 Robot artifact creature', () => {
    const g = setup(); const r = put(g, 0, ROCK()); const b = card('PW3 Robo', 'Sorcery', '{U}', "Put three +1/+1 counters on target artifact you control. If it's not a creature, it becomes a 0/0 Robot artifact creature.");
    const c = mk(g, 0, b); g.players[0].hand.push(c); g.players[0].pool = ['U']; g.priority = 0; expect(castSpell(g, 0, c.uid, { card: r.uid })).toBe(true); resolveAI(g);
    expect(isType(r, 'Creature')).toBe(true); expect(def(r).sub).toEqual(['Robot']); expect(power(g, r)).toBe(3);
    expect(W['Tezzeret, Cruel Captain'] && walker('Tezzeret, Cruel Captain')).toBeTruthy();
  });
});

describe('named walkers', () => {
  it('Chandra +1: AI casts the exiled card; a human who declines deals 2 to each opponent', () => {
    const g = setup(); const ch = put(g, 0, walker('Chandra, Torch of Defiance')); const z = top(g, 0, ZAP()); g.players[0].pool = ['R'];
    expect(activate(g, 0, ch.uid, 0)).toBe(true); resolveAI(g);
    if (!g.players[0].graveyard.includes(z)) console.log(g.log.slice(-8));
    expect(g.players[0].graveyard.includes(z)).toBe(true);
    const g2 = setup(); const c2 = put(g2, 0, walker('Chandra, Torch of Defiance')); top(g2, 0, ZAP()); const lives = g2.players.map(p => p.life);
    expect(activate(g2, 0, c2.uid, 0)).toBe(true); run(g2, { cast: false });
    expect(g2.players.slice(1).map(p => p.life)).toEqual(lives.slice(1).map(l => l - 2));
  });
  it('Chandra +1: a human who accepts casts it from exile mid-resolution', () => {
    const g = setup(); const ch = put(g, 0, walker('Chandra, Torch of Defiance')); const z = top(g, 0, ZAP()); g.players[0].pool = ['R'];
    for (const p of g.players) p.human = true; expect(activate(g, 0, ch.uid, 0)).toBe(true);
    let i = 0; while (!g.decision && i++ < 10) pass(g, g.priority!);
    expect((g.decision as { kind: string }).kind).toBe('cast'); expect(canCast(g, 0, z)).toBe(true);
    expect(castSpell(g, 0, z.uid, { player: 1 })).toBe(true); const life = g.players[1].life; run(g);
    expect(g.players[1].life).toBe(life - 1); expect(g.players[0].graveyard.includes(z)).toBe(true);
  });
  it('Ugin, the Ineffable +1: face-down exile + Spirit; when the token leaves, the card goes to hand', () => {
    const g = setup(); const u = put(g, 0, walker('Ugin, the Ineffable')); const x = top(g, 0, BEAR());
    expect(activate(g, 0, u.uid, 0)).toBe(true); resolveAI(g);
    expect(g.players[0].exile.includes(x)).toBe(true); expect(x.faceDown).toBe(true);
    const tok = g.players[0].battlefield.find(c => c.token)!; expect(power(g, tok)).toBe(2);
    destroy(g, tok); flushTriggers(g); resolveAI(g); if (!g.players[0].hand.includes(x)) console.log(g.log.slice(-6)); expect(g.players[0].hand.includes(x)).toBe(true);
  });
  it('Ugin, Eye of the Storms: casting it exiles a colored permanent; −11 lets you cast colorless cards free', () => {
    const g = setup(); const ud = walker('Ugin, Eye of the Storms'); const b = put(g, 1, BEAR()); const r = put(g, 1, ROCK());
    const c = mk(g, 0, ud); g.players[0].hand.push(c); g.players[0].pool = Array(7).fill('C'); g.priority = 0;
    expect(castSpell(g, 0, c.uid)).toBe(true); run(g, { tgt: () => ({ card: b.uid }) });
    expect(g.players[1].exile.includes(b)).toBe(true); expect(g.players[1].battlefield.includes(r)).toBe(true);
    const u = g.players[0].battlefield.find(x => x.uid === c.uid)!; u.counters!.loyalty = 11; const rk = top(g, 0, ROCK());
    for (const p of g.players) p.human = false; expect(activate(g, 0, u.uid, 2)).toBe(true); run(g, { pick: us => us });
    expect(g.players[0].exile.includes(rk)).toBe(true); g.players[0].pool = []; g.priority = 0; expect(canCast(g, 0, rk)).toBe(true);
  });
  it('The Eternal Wanderer +1: exiled card returns at its owner\'s next end step', () => {
    const g = setup(); const w = put(g, 0, walker('The Eternal Wanderer')); const b = put(g, 1, BEAR());
    expect(activate(g, 0, w.uid, 0, { card: b.uid })).toBe(true); resolveAI(g);
    expect(g.players[1].exile.includes(b)).toBe(true); expect(g.delayed?.[0]?.pid).toBe(1);
    expect(until(g, () => g.players[1].battlefield.includes(b))).toBe(true); expect(g.active).toBe(1);
  });
  it('The Eternal Wanderer −4: each player keeps one chosen creature; only one creature can attack it', () => {
    const g = setup(); const w = put(g, 0, walker('The Eternal Wanderer')); const a1 = put(g, 0, BEAR()); put(g, 0, BEAR()); const o1 = put(g, 1, BEAR()); put(g, 1, BEAR());
    expect(activate(g, 0, w.uid, 2)).toBe(true); run(g, { pick: u => u.slice(0, 1) });
    expect(g.players[0].battlefield.filter(c => isType(c, 'Creature'))).toEqual([a1]); expect(g.players[1].battlefield.filter(c => isType(c, 'Creature'))).toEqual([o1]);
    expect(canBeAttackedPw(g, w)).toBe(true);
  });
  it('Daretti +2: discard up to two, then draw that many', () => {
    const g = setup(); const d = put(g, 0, walker('Daretti, Scrap Savant')); for (let i = 0; i < 3; i++) g.players[0].hand.push(mk(g, 0, BEAR()));
    expect(activate(g, 0, d.uid, 0)).toBe(true); run(g, { pick: u => u.slice(0, 2) });
    expect(g.players[0].hand.length).toBe(3); expect(g.players[0].graveyard.length).toBe(2);
  });
  it('Daretti −2: sacrifice an artifact; if you do, return target artifact card from your graveyard', () => {
    const g = setup(); const d = put(g, 0, walker('Daretti, Scrap Savant')); const r = put(g, 0, ROCK()); const gy = mk(g, 0, ROCK()); g.players[0].graveyard.push(gy);
    expect(activate(g, 0, d.uid, 1, { card: gy.uid })).toBe(true); run(g, { pick: () => [r.uid] });
    expect(g.players[0].battlefield.includes(gy)).toBe(true); expect(g.players[0].graveyard.includes(r)).toBe(true);
    const g2 = setup(); const d2 = put(g2, 0, walker('Daretti, Scrap Savant')); const gy2 = mk(g2, 0, ROCK()); g2.players[0].graveyard.push(gy2);
    expect(activate(g2, 0, d2.uid, 1, { card: gy2.uid })).toBe(true); run(g2);
    expect(g2.players[0].graveyard.includes(gy2)).toBe(true); // nothing sacrificed → nothing returned
  });
  it('Daretti −10 emblem: an artifact put into your graveyard returns at the next end step', () => {
    const g = setup(); const d = put(g, 0, walker('Daretti, Scrap Savant')); d.counters!.loyalty = 10; const r = put(g, 0, ROCK());
    expect(activate(g, 0, d.uid, 2)).toBe(true); resolveAI(g); expect(emblemsOf(g.players[0]).length).toBe(1);
    destroy(g, r); resolveAI(g); expect(g.players[0].graveyard.includes(r)).toBe(true);
    expect(until(g, () => g.players[0].battlefield.includes(r))).toBe(true); expect(g.step).toBe('end');
  });
  it('Grist: a creature outside the battlefield (commander-legal); +1 repeats while Insects are milled', () => {
    const gd = walker('Grist, the Hunger Tide'); expect(canBeCommander(gd)).toBe(true);
    const g = setup(); const gc = mk(g, 0, gd); g.players[0].graveyard.push(gc); expect(isType(gc, 'Creature')).toBe(true); expect(def(gc).sub).toContain('Insect');
    const gr = put(g, 0, gd); expect(isType(gr, 'Creature')).toBe(false);
    top(g, 0, BEAR()); top(g, 0, INSECT());
    expect(activate(g, 0, gr.uid, 0)).toBe(true); resolveAI(g);
    expect(g.players[0].battlefield.filter(c => c.token).length).toBe(2); expect(ctr(gr, 'loyalty')).toBe(5);
  });
  it('The Aetherspark: attached to a creature it can\'t be attacked and gains loyalty from combat damage; −10 adds ten of one color', () => {
    const g = setup(); const a = put(g, 0, walker('The Aetherspark')); const b = put(g, 0, BEAR()); b.sick = false;
    expect(canBeAttackedPw(g, a)).toBe(true);
    expect(activate(g, 0, a.uid, 0, { card: b.uid })).toBe(true); resolveAI(g); expect(a.attachedTo).toBe(b.uid); expect(canBeAttackedPw(g, a)).toBe(false);
    const before = ctr(a, 'loyalty'); let i = 0; while (g.awaiting !== 'attack' && i++ < 50) pass(g, g.priority!);
    declareAttackers(g, 0, [{ uid: b.uid, defender: 1 }]); until(g, () => g.step === 'main2');
    expect(ctr(a, 'loyalty')).toBe(before + power(g, b));
    a.counters!.loyalty = 10; for (const k of Object.keys(a)) if (/act|used/i.test(k)) delete (a as never as Record<string, unknown>)[k]; g.priority = 0;
    g.players[0].pool = []; expect(activate(g, 0, a.uid, 2)).toBe(true); run(g, { color: 'G' }); expect(g.players[0].pool.filter(x => x === 'G').length).toBe(10);
  });
});
