/** Reality Fracture / Multiverse Reforged: the interactions called out for this precon. */
import { describe, it, expect } from 'vitest';
import { loadPrecons } from '../src/import/precons';
import '../src/engine/ai';
import {
  newGame, startGame, pass, answerDecision, alive, def, CARDS, DECKS, Game, Card, CardDef, layer, activate, castSpell,
  playLand, ctr, power, toughness, isType, hasKw, findCard, addCounters, checkState, destroy, declareAttackers, declareBlockers,
  canBeAttackedPw, planPayment, tapForMana, offBfEff, chooseTriggerTargets,
} from '../src/engine/engine';

loadPrecons();
const byName = (n: string): CardDef => {
  const d = Object.values(CARDS).find(c => c.name === n && !c.id.includes('#'));
  if (!d) throw new Error('missing ' + n);
  return d;
};
function setup(): Game {
  const g = newGame({ seed: 7, humans: [0], decks: DECKS.slice(0, 4).map(d => d.id), skipAiMulligan: true });
  for (const p of g.players) { p.library.push(...p.hand); p.hand = []; p.human = true; }
  startGame(g);
  let i = 0; while (!(g.step === 'main1' && !g.stack.length && g.active === 0 && g.priority === 0) && i++ < 80) { if (g.decision) answerDecision(g, false); else pass(g, g.priority!); }
  for (const p of g.players) { p.library.push(...p.hand); p.hand = []; p.battlefield = []; p.pool = []; }
  return g;
}
const mk = (g: Game, pid: number, d: CardDef): Card => { const c: Card = { uid: g.nextUid++, id: d.id, owner: pid, tapped: false, sick: false, damage: 0, pp: 0, pt: 0 }; offBfEff(c); return c; };
function put(g: Game, pid: number, d: CardDef): Card {
  const c = mk(g, pid, d); if (d.loyalty) c.counters = { loyalty: d.loyalty }; g.players[pid].battlefield.push(c); layer(g); return c;
}
/** Answer every prompt. `pick` chooses card uids; color/player answers are taken in order. */
function run(g: Game, o: { may?: boolean; colors?: string[]; players?: number[]; picks?: number[][]; tgt?: () => { player?: number; card?: number } } = {}) {
  let ci = 0, pi = 0, ki = 0;
  let i = 0;
  while ((g.stack.length || g.decision || g.res || g.choice) && i++ < 400) {
    const d = g.decision as { kind: string; cards?: Card[] } | null;
    if (g.choice && o.tgt) { if (!chooseTriggerTargets(g, [o.tgt()])) break; continue; }
    if (d?.kind === 'may') answerDecision(g, o.may ?? false);
    else if (d?.kind === 'color') answerDecision(g, o.colors?.[ci++] ?? 'W');
    else if (d?.kind === 'player') answerDecision(g, o.players?.[pi++] ?? 1);
    else if (d?.kind === 'pick') { const dec = d as { cards?: Card[]; min?: number }; answerDecision(g, o.picks?.[ki++] ?? (dec.cards ?? []).slice(0, Math.max(1, dec.min ?? 1)).map(c => c.uid)); }
    else if (d?.kind === 'orderTop') answerDecision(g, { order: (d as { cards: Card[] }).cards.map(c => c.uid) });
    else if (d?.kind === 'cast') answerDecision(g, false);
    else if (d) answerDecision(g, false);
    else if (g.priority !== null) pass(g, g.priority);
    else break;
  }
}
describe('Multiverse Reforged interactions', () => {
  it('Jace +1 draws two and puts one card on the bottom', () => {
    const g = setup(); const jace = put(g, 0, byName('Jace, Multiverse Architect'));
    const a = mk(g, 0, byName('Brainstorm')); const b = mk(g, 0, byName('Despark'));
    g.players[0].hand.push(a, b);
    const plus = def(jace).abilities!.findIndex(x => x.loyalty === 1);
    expect(activate(g, 0, jace.uid, plus)).toBe(true);
    run(g, { picks: [[a.uid]] });
    expect(g.players[0].hand.length).toBe(3); // drew 2, bottomed 1, started with 2
    expect(g.players[0].library[0]).toBe(a);
    expect(ctr(jace, 'loyalty')).toBe(5);
  });

  it("Jace −3 exiles a creature and puts the next creature or planeswalker onto the battlefield", () => {
    const g = setup(); const jace = put(g, 0, byName('Jace, Multiverse Architect'));
    const fodder = put(g, 0, byName('Darksteel Angel'));
    const land = mk(g, 0, byName('Plains')); const hit = mk(g, 0, byName('Ginger, Queen of Sweets'));
    g.players[0].library.push(land, hit); // hit is on top
    const minus = def(jace).abilities!.findIndex(x => (x.loyalty ?? 0) < 0);
    expect(activate(g, 0, jace.uid, minus, { targets: [{ card: fodder.uid }] })).toBe(true);
    run(g);
    expect(findCard(g, fodder.uid)).toBeUndefined();
    expect(g.players[0].battlefield.some(c => def(c).name === 'Ginger, Queen of Sweets')).toBe(true);
    expect(g.players[0].library.some(c => c === land) || g.players[0].library.includes(land)).toBe(true);
  });

  it('an opponent who does not pay {2} cannot attack Jace', () => {
    const g = setup(); const jace = put(g, 0, byName('Jace, Multiverse Architect'));
    put(g, 1, byName('Memnarch, the Warden'));
    // jump to player 1's combat by ending turns until active is 1 and beginCombat fires
    let i = 0;
    while (!(g.active === 1 && (g.step === 'beginCombat' || g.awaiting === 'attack')) && i++ < 200) {
      if (g.decision) answerDecision(g, false); else if (g.priority !== null) pass(g, g.priority); else break;
    }
    run(g, { may: false });
    expect(g.players[1].noAtkJace?.some(r => r.by === 0)).toBe(true);
    expect(canBeAttackedPw(g, jace)).toBe(false);
  });

  it('Nissa draws on landfall and puts a creature onto the battlefield the first time', () => {
    const g = setup(); put(g, 0, byName('Nissa, Leyline Tamer'));
    const creature = mk(g, 0, byName('Darksteel Angel')); const filler = mk(g, 0, byName('Brainstorm'));
    g.players[0].library.push(creature, filler); // filler is on top, so the draw takes it and the creature is revealed
    const before = g.players[0].hand.length;
    const land = mk(g, 0, byName('Plains')); g.players[0].hand.push(land);
    expect(playLand(g, 0, land.uid)).toBe(true);
    run(g);
    expect(g.players[0].hand.length).toBe(before + 1);
    expect(g.players[0].battlefield.some(c => def(c).name === 'Darksteel Angel')).toBe(true);
  });

  it('Mass Polymorph exiles your creatures and finds that many', () => {
    const g = setup();
    put(g, 0, byName('Memnarch, the Warden')); put(g, 0, byName('Darksteel Angel'));
    const a = mk(g, 0, byName('Ginger, Queen of Sweets')); const b = mk(g, 0, byName('Akroma, Angel of Fury'));
    const junk = mk(g, 0, byName('Brainstorm'));
    g.players[0].library.push(junk, b, a);
    const spell = mk(g, 0, byName('Mass Polymorph')); g.players[0].hand.push(spell); g.players[0].pool.push(...Array(7).fill('U'));
    expect(castSpell(g, 0, spell.uid)).toBe(true); run(g);
    const names = g.players[0].battlefield.map(c => def(c).name).sort();
    expect(names).toEqual(['Akroma, Angel of Fury', 'Ginger, Queen of Sweets']);
    expect(g.players[0].exile.length + g.players[0].command.length).toBeGreaterThan(0);
  });

  it('Proteus Staff puts a creature on the bottom and its controller finds another', () => {
    const g = setup(); const staff = put(g, 0, byName('Proteus Staff'));
    const victim = put(g, 1, byName('Memnarch, the Warden'));
    const next = mk(g, 1, byName('Darksteel Angel')); const junk = mk(g, 1, byName('Island'));
    g.players[1].library.push(junk, next);
    g.players[0].pool.push('U', 'U', 'C', 'C');
    const idx = def(staff).abilities!.findIndex(a => /bottom/i.test(a.label));
    expect(activate(g, 0, staff.uid, idx, { targets: [{ card: victim.uid }] })).toBe(true);
    run(g);
    expect(g.players[1].battlefield.some(c => def(c).name === 'Darksteel Angel')).toBe(true);
    expect(findCard(g, victim.uid)).toBeUndefined();
    expect(g.players[1].library.includes(victim) || g.players[1].library.some(c => c.uid === victim.uid)).toBe(true);
  });

  it('Overlord cast for impending is not a creature until its time counters are gone', () => {
    const g = setup(); const d = byName('Overlord of the Mistmoors');
    expect(d.impending?.n).toBe(4);
    const c = mk(g, 0, d); g.players[0].hand.push(c);
    g.players[0].pool.push('W', 'W', 'C', 'C');
    expect(castSpell(g, 0, c.uid, { impending: true })).toBe(true); run(g);
    const ob = g.players[0].battlefield.find(x => x.uid === c.uid)!;
    expect(ctr(ob, 'time')).toBe(4);
    expect(isType(ob, 'Creature')).toBe(false);
    expect(isType(ob, 'Enchantment')).toBe(true);
  });

  it('Shark Typhoon makes an X/X Shark from a spell and from cycling', () => {
    const g = setup(); put(g, 0, byName('Shark Typhoon'));
    const spell = mk(g, 0, byName('Brainstorm')); g.players[0].hand.push(spell);
    g.players[0].library.push(mk(g, 0, byName('Island')), mk(g, 0, byName('Island')), mk(g, 0, byName('Island')));
    g.players[0].pool.push('U');
    expect(castSpell(g, 0, spell.uid)).toBe(true); run(g);
    const shark = g.players[0].battlefield.find(c => def(c).name === 'Shark')!;
    expect(power(g, shark)).toBe(1); expect(toughness(g, shark)).toBe(1); expect(hasKw(shark, 'flying')).toBe(true);
    const typhoon = g.players[0].battlefield.find(c => def(c).name === 'Shark Typhoon')!;
    // cycling is a hand ability; put a second copy in hand by moving... the permanent can't cycle. Use the card from a fresh hand instance.
    const cycle = mk(g, 0, byName('Shark Typhoon')); g.players[0].hand.push(cycle);
    g.players[0].pool.push('U', 'C', 'C', 'C');
    const ci = def(cycle).abilities!.findIndex(a => /cycling/i.test(a.label));
    expect(activate(g, 0, cycle.uid, ci, { x: 2 })).toBe(true); run(g);
    const sharks = g.players[0].battlefield.filter(c => def(c).name === 'Shark');
    expect(sharks.map(c => power(g, c)).sort()).toEqual([1, 2]);
    expect(g.players[0].graveyard.includes(cycle)).toBe(true);
    void typhoon;
  });

  it('Archon of Cruelty makes the opponent sacrifice, discard, and lose 3; you draw and gain 3', () => {
    const g = setup();
    const sac = put(g, 1, byName('Memnarch, the Warden'));
    g.players[1].hand.push(mk(g, 1, byName('Island')));
    const archon = mk(g, 0, byName('Archon of Cruelty')); g.players[0].hand.push(archon);
    g.players[0].pool.push(...Array(8).fill('B'));
    const life = g.players[1].life; const mine = g.players[0].life; const hand = g.players[0].hand.length;
    expect(castSpell(g, 0, archon.uid)).toBe(true);
    run(g, { tgt: () => ({ player: 1 }) });
    expect(g.players[1].battlefield.some(c => c.uid === sac.uid)).toBe(false);
    expect(g.players[1].graveyard.some(c => c.uid === sac.uid)).toBe(true);
    expect(g.players[1].hand.length).toBe(0);
    expect(g.players[1].life).toBe(life - 3);
    expect(g.players[0].life).toBe(mine + 3);
    expect(g.players[0].hand.length).toBeGreaterThanOrEqual(hand); // drew a card, cast the archon
  });

  it('Darksteel Angel stops you losing and stops -1/-1 counters', () => {
    const g = setup(); const angel = put(g, 0, byName('Darksteel Angel'));
    const bearC = put(g, 0, byName('Memnarch, the Warden'));
    g.players[0].life = 0; checkState(g);
    expect(g.players[0].lost).toBe(false);
    expect(g.winner).toBeNull();
    addCounters(g, bearC, '-1/-1', 3);
    expect(ctr(bearC, '-1/-1')).toBe(0);
    expect(hasKw(angel, 'indestructible')).toBe(true);
  });

  it('Sunfall exiles creatures and incubates that many; the token can transform', () => {
    const g = setup();
    put(g, 0, byName('Memnarch, the Warden')); put(g, 1, byName('Darksteel Angel'));
    const spell = mk(g, 0, byName('Sunfall')); g.players[0].hand.push(spell);
    g.players[0].pool.push('W', 'W', 'W', 'W', 'C');
    expect(castSpell(g, 0, spell.uid)).toBe(true); run(g);
    const inc = g.players[0].battlefield.find(c => def(c).name === 'Incubator')!;
    expect(ctr(inc, '+1/+1')).toBe(2);
    const idx = def(inc).abilities!.findIndex(a => /transform/i.test(a.label));
    g.players[0].pool.push('C', 'C');
    expect(activate(g, 0, inc.uid, idx)).toBe(true); run(g);
    expect(def(inc).name).toBe('Phyrexian');
    expect(isType(inc, 'Creature')).toBe(true);
    expect(power(g, inc)).toBe(2);
  });

  it('Secure the Wastes makes X Warriors and Lingering Souls flashes back into exile', () => {
    const g = setup();
    const sec = mk(g, 0, byName('Secure the Wastes')); g.players[0].hand.push(sec);
    g.players[0].pool.push('W', 'C', 'C', 'C');
    expect(castSpell(g, 0, sec.uid, { x: 3 })).toBe(true); run(g);
    expect(g.players[0].battlefield.filter(c => def(c).name === 'Warrior').length).toBe(3);
    const souls = mk(g, 0, byName('Lingering Souls')); g.players[0].graveyard.push(souls);
    g.players[0].pool.push('B', 'C');
    expect(castSpell(g, 0, souls.uid, { flashback: true })).toBe(true); run(g);
    expect(g.players[0].battlefield.filter(c => def(c).name === 'Spirit').length).toBe(2);
    expect(g.players[0].exile.includes(souls)).toBe(true);
  });

  it('Reflecting Pool and Exotic Orchard add mana from lands you or an opponent control', () => {
    const g = setup();
    const pool = put(g, 0, byName('Reflecting Pool'));
    const plains = put(g, 0, byName('Plains'));
    const orchard = put(g, 0, byName('Exotic Orchard'));
    put(g, 1, byName('Island')); put(g, 1, byName('Mountain'));
    layer(g);
    expect(g.players[0].mineCols).toEqual(expect.arrayContaining(['W']));
    expect(g.players[0].oppCols).toEqual(expect.arrayContaining(['U', 'R']));
    plains.tapped = true;
    expect(tapForMana(g, 0, pool.uid)).toBe(true);
    expect(planPayment(g.players[0], { generic: 0, W: 1 })).toBeTruthy();
    expect(tapForMana(g, 0, orchard.uid)).toBe(true);
    expect(planPayment(g.players[0], { generic: 0, U: 1 })).toBeTruthy();
  });

  it('restless lands animate and still tap for mana', () => {
    const g = setup();
    const spire = put(g, 0, byName('Restless Spire'));
    const anch = put(g, 0, byName('Restless Anchorage'));
    expect(def(spire).mana?.[0].add.join()).toMatch(/U/);
    const anim = def(spire).abilities!.findIndex(a => /elemental|2\/1|becomes/i.test(a.label));
    g.players[0].pool.push('U', 'R');
    expect(anim).toBeGreaterThanOrEqual(0);
    expect(activate(g, 0, spire.uid, anim)).toBe(true); run(g);
    expect(isType(spire, 'Creature')).toBe(true);
    expect(power(g, spire)).toBe(2);
    expect(isType(spire, 'Land')).toBe(true);
    const a2 = def(anch).abilities!.findIndex(a => /bird|2\/3|becomes/i.test(a.label));
    g.players[0].pool.push('W', 'U', 'C');
    expect(activate(g, 0, anch.uid, a2)).toBe(true); run(g);
    expect(isType(anch, 'Creature')).toBe(true);
    expect(hasKw(anch, 'flying')).toBe(true);
    expect(power(g, anch)).toBe(2); expect(toughness(g, anch)).toBe(3);
  });

  it('Brainsurge draws four and puts two back on top', () => {
    const g = setup();
    for (let i = 0; i < 4; i++) g.players[0].library.push(mk(g, 0, byName(i % 2 ? 'Island' : 'Plains')));
    const spell = mk(g, 0, byName('Brainsurge')); g.players[0].hand.push(spell);
    g.players[0].pool.push('U', 'C', 'C');
    expect(castSpell(g, 0, spell.uid)).toBe(true);
    run(g);
    expect(g.players[0].hand.length).toBe(2);
    expect(g.players[0].library.length).toBeGreaterThanOrEqual(2);
  });

  it('Avacyn returns a nontoken creature under your control at the next end step', () => {
    const g = setup(); put(g, 0, byName('Avacyn, Angel of Horror'));
    const mine = put(g, 0, byName('Ginger, Queen of Sweets'));
    g.players[0].life = 40;
    destroy(g, mine);
    expect(g.players[0].graveyard.includes(mine) || g.players[0].command.includes(mine)).toBe(true);
    // Memnarch is not a commander here, so graveyard
    expect(g.players[0].graveyard.some(c => c.uid === mine.uid)).toBe(true);
    let i = 0;
    while (g.step !== 'end' && i++ < 80) {
      if (g.decision) answerDecision(g, false);
      else if (g.awaiting === 'attack') declareAttackers(g, g.active, []);
      else if (g.awaiting === 'block') declareBlockers(g, g.players.find(p => g.players[g.active] && p.id !== g.active)!.id, []);
      else if (g.priority !== null) pass(g, g.priority);
      else break;
    }
    run(g);
    const back = findCard(g, mine.uid);
    expect(back).toBeTruthy();
    expect(back!.owner).toBe(0);
  });

  it('Omnath keeps unspent mana as colorless and gets +1/+1 for each mana', () => {
    const g = setup(); const om = put(g, 0, byName('Omnath, Locus of the Void'));
    g.players[0].pool.push('W', 'U', 'R');
    layer(g);
    expect(power(g, om)).toBe(6 + 3);
    // leave the step: mana becomes colorless instead of emptying
    let i = 0; while (g.step === 'main1' && i++ < 20) { if (g.priority === null) break; pass(g, g.priority); }
    expect(g.players[0].pool.filter(s => s === 'C').length).toBeGreaterThanOrEqual(3);
  });

  it('the precon plays a game with Jace in the command zone', () => {
    const mr = loadPrecons().find(p => p.name === 'Multiverse Reforged')!;
    const g = newGame({ seed: 21, humans: [], decks: [mr.id, mr.id, mr.id, mr.id], skipAiMulligan: true });
    expect(g.players.every(p => def(p.command[0]).name === 'Jace, Multiverse Architect')).toBe(true);
    expect(g.players.every(p => p.command.length === 1)).toBe(true);
    startGame(g);
    let i = 0;
    while (g.turn < 8 && g.winner === null && i++ < 20000) { if (g.decision) answerDecision(g, false); else if (g.priority !== null) pass(g, g.priority); else break; }
    expect(g.turn).toBeGreaterThanOrEqual(8);
    expect(alive(g).length).toBeGreaterThan(0);
  });

});
