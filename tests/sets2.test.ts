import { describe, it, expect } from 'vitest';
import { compileScry } from '../src/import/classify';
import type { ScryCard } from '../src/import/scryfall';
import { def, newGame, startGame, Game, Card, CARDS, registerCards, activate, pass, alive, answerDecision, declareAttackers, ctr, findCard, power, toughness, castSpell, canCast, canBeCommander, emblemsOf, layer, checkState, destroy, isType, hasKw, chooseTriggerTargets, canBeAttackedPw, tapForMana, offBfEff, flushTriggers, prepCopyOf, loseLife, playLand, canPlayLand, foretell, canForetell, addCounters } from '../src/engine/engine';
import type { CardDef } from '../src/engine/types';
import '../src/engine/ai';
let n = 0;
function card(name: string, type_line: string, mana_cost: string, oracle_text: string, o: Partial<ScryCard> = {}): CardDef {
  const cl = compileScry({ name, type_line, mana_cost, oracle_text, colors: [], color_identity: [], keywords: [], ...o });
  const d = { ...cl.def, id: `s2-${++n}-${cl.def.id}` }; registerCards([d]);
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
const INSECT = () => card('PW3 Beetle', 'Creature — Insect', '{G}', '', { power: '1', toughness: '1', colors: ['G'] });
const top = (g: Game, pid: number, d: CardDef) => { const c = mk(g, pid, d); g.players[pid].library.push(c); return c; };
/** pass priority until pred holds (turns advance; AI players act) */
function until(g: Game, pred: () => boolean, max = 800) { for (const p of g.players) p.human = false; let i = 0; while (!pred() && i++ < max) { if (g.decision) answerDecision(g, false); else pass(g, g.priority!); } return pred(); }

const pool = (g: Game, m: string[]) => { g.players[0].pool = m; g.priority = 0; };
const castFromHand = (g: Game, d: CardDef, m: string[], o = {}) => { const c = mk(g, 0, d); g.players[0].hand.push(c); pool(g, m); expect(castSpell(g, 0, c.uid, o)).toBe(true); resolveAI(g); return c; };
const W1 = () => card('Bygone Colossus', 'Artifact Creature — Robot Giant', '{9}', 'Warp {3} (You may cast this card from your hand for its warp cost. Exile this creature at the beginning of the next end step, then you may cast it from exile on a later turn.)', { power: '9', toughness: '9' });

describe('pt14 mechanics', () => {
  it('Increment: counter when mana spent exceeds power or toughness', () => {
    const g = setup(); const cc = put(g, 0, card('Cuboid Colony', 'Creature — Insect', '{G}{U}', 'Flash\nFlying, trample\nIncrement (Whenever you cast a spell, if the amount of mana you spent is greater than this creature\'s power or toughness, put a +1/+1 counter on this creature.)', { power: '1', toughness: '1' }));
    castFromHand(g, INSECT(), ['G']); expect(ctr(cc, '+1/+1')).toBe(0);
    castFromHand(g, BEAR(), ['G', 'G']); expect(ctr(cc, '+1/+1')).toBe(1);
    castFromHand(g, BEAR(), ['G', 'G']); expect(ctr(cc, '+1/+1')).toBe(1);
  });
  it('Opus: one counter, two if five or more mana was spent (instant or sorcery trigger)', () => {
    const g = setup(); const t = put(g, 0, card('Tackle Artist', 'Creature — Orc Sorcerer', '{3}{R}', 'Trample\nOpus — Whenever you cast an instant or sorcery spell, put a +1/+1 counter on this creature. If five or more mana was spent to cast that spell, put two +1/+1 counters on this creature instead.', { power: '4', toughness: '3' }));
    castFromHand(g, ZAP(), ['R'], { targets: [{ player: 1 }] }); expect(ctr(t, '+1/+1')).toBe(1);
    const big = card('S2 Blast', 'Sorcery', '{4}{R}', 'S2 Blast deals 1 damage to any target.');
    castFromHand(g, big, ['R', 'R', 'R', 'R', 'R'], { targets: [{ player: 1 }] }); expect(ctr(t, '+1/+1')).toBe(3);
    castFromHand(g, BEAR(), ['G', 'G']); expect(ctr(t, '+1/+1')).toBe(3);
  });
  it('Disappear: only if a permanent left under your control this turn', () => {
    const g = setup(); const d = card('Foot Mystic', 'Creature — Human Ninja Warlock', '{3}{B}', 'Lifelink\nDisappear — When this creature enters, if a permanent left the battlefield under your control this turn, create a 1/1 black Ninja creature token.', { power: '2', toughness: '4' });
    castFromHand(g, d, ['B', 'B', 'B', 'B']); expect(g.players[0].battlefield.filter(c => c.token).length).toBe(0);
    const b = put(g, 0, BEAR()); destroy(g, b); checkState(g);
    castFromHand(g, d, ['B', 'B', 'B', 'B']); expect(g.players[0].battlefield.filter(c => c.token).length).toBe(1);
  });
  it('Storied: enduring story with three artifacts/legendaries', () => {
    const g = setup(); const b = card('Balin, Loremaster', 'Legendary Creature — Dwarf Bard', '{3}{R}{R}', 'Storied (If you control three or more artifacts, legendaries, and/or Sagas, you have an enduring story for the rest of the game.)', { power: '4', toughness: '4' });
    put(g, 0, b); put(g, 0, ROCK()); layer(g); expect(!!g.players[0].enduring).toBe(false);
    const r = put(g, 0, ROCK()); layer(g); expect(!!g.players[0].enduring).toBe(true);
    destroy(g, r); checkState(g); layer(g); expect(!!g.players[0].enduring).toBe(true);
  });
  it('Recruit: loot, token only if a nonland card was discarded', () => {
    const g = setup(); const d = card('Bard\'s Company', 'Creature — Human Citizen', '{2}{W}{U}', 'Other creatures you control get +1/+1.\nWhenever this creature enters or attacks, recruit. (Draw a card, then discard a card. If you discarded a nonland card, create a 1/1 white Human Soldier creature token.)', { power: '2', toughness: '3' });
    top(g, 0, BEAR()); const c = mk(g, 0, d); g.players[0].hand.push(c); pool(g, ['W', 'W', 'U', 'U']); castSpell(g, 0, c.uid); run(g, { pick: u => u.slice(0, 1) });
    expect(g.players[0].graveyard.length).toBe(1); expect(g.players[0].battlefield.filter(x => x.token).length).toBe(1);
    const g2 = setup(); top(g2, 0, FOREST()); const c2 = mk(g2, 0, d); g2.players[0].hand.push(c2); pool(g2, ['W', 'W', 'U', 'U']); castSpell(g2, 0, c2.uid); run(g2);
    expect(g2.players[0].battlefield.filter(x => x.token).length).toBe(0);
  });
  it('Teamwork: tap creatures with total power N to choose both modes', () => {
    const g = setup(); const d = card('Go Nuts!', 'Sorcery', '{G}', 'Teamwork 3 (As an additional cost to cast this spell, you may tap any number of creatures you control with total power 3 or more.)\nChoose one. If this spell was cast using teamwork, choose both instead.\n• Put a +1/+1 counter on target creature.\n• Target creature you control fights target creature an opponent controls.');
    const a = put(g, 0, BEAR()), b = put(g, 0, BEAR()); const foe = put(g, 1, INSECT());
    const c1 = mk(g, 0, d); g.players[0].hand.push(c1); pool(g, ['G']);
    expect(castSpell(g, 0, c1.uid, { modes: [0, 1], targets: [{ card: a.uid }, { card: a.uid }, { card: foe.uid }] })).toBe(false);
    expect(castSpell(g, 0, c1.uid, { teamwork: [a.uid, b.uid], modes: [0, 1], targets: [{ card: b.uid }, { card: a.uid }, { card: foe.uid }] })).toBe(true);
    expect(a.tapped && b.tapped).toBe(true); resolveAI(g);
    expect(ctr(b, '+1/+1')).toBe(1); expect(g.players[1].battlefield.some(x => x.uid === foe.uid)).toBe(false);
  });
  it('Class: level 2 sorcery-speed, "becomes level 2" trigger, level 3 static', () => {
    const g = setup(); const d = card('Stormchaser\'s Talent', 'Enchantment — Class', '{U}', '(Gain the next level as a sorcery to add its ability.)\nWhen this Class enters, create a 1/1 blue and red Otter creature token with prowess.\n{3}{U}: Level 2\nWhen this Class becomes level 2, return target instant or sorcery card from your graveyard to your hand.\n{5}{U}: Level 3\nWhenever you cast an instant or sorcery spell, create a 1/1 blue and red Otter creature token with prowess.');
    const cl = castFromHand(g, d, ['U']); expect(g.players[0].battlefield.filter(x => x.token).length).toBe(1);
    const z = mk(g, 0, ZAP()); g.players[0].graveyard.push(z);
    pool(g, Array(6).fill('U')); expect(activate(g, 0, cl.uid, 1, {})).toBe(false);
    pool(g, Array(4).fill('U')); expect(activate(g, 0, cl.uid, 0, { targets: [{ card: z.uid }] })).toBe(true); run(g, { tgt: () => ({ card: z.uid }) });
    expect(g.players[0].hand.some(x => x.uid === z.uid)).toBe(true);
    pool(g, Array(6).fill('U')); expect(activate(g, 0, cl.uid, 1, {})).toBe(true); for (const p of g.players) p.human = false; resolveAI(g);
    castFromHand(g, ZAP(), ['R'], { targets: [{ player: 1 }] }); expect(g.players[0].battlefield.filter(x => x.token).length).toBe(2);
  });
  it('Level up: P/T and abilities by level counters', () => {
    const g = setup(); const d = card('S2 Leveler', 'Creature — Human Warrior', '{B}', 'Level up {4} ({4}: Put a level counter on this. Level up only as a sorcery.)\nLEVEL 1-2\n3/3\nLEVEL 3+\n5/5\nFlying', { power: '1', toughness: '1' });
    const z = put(g, 0, d); expect(power(g, z)).toBe(1); expect(hasKw(z, 'flying')).toBe(false);
    for (let i = 1; i <= 3; i++) { pool(g, ['B', 'B', 'B', 'B']); expect(activate(g, 0, z.uid, 0, {})).toBe(true); resolveAI(g); layer(g); }
    expect(ctr(z, 'level')).toBe(3); expect(power(g, z)).toBe(5); expect(toughness(g, z)).toBe(5); expect(hasKw(z, 'flying')).toBe(true);
  });
  it('Sneak: return an unblocked attacker, enters tapped and attacking; sneak spell rider', () => {
    const g = setup(); const d = card('Elektra, Daughter of the Hand', 'Legendary Creature — Human Ninja Villain', '{2}{B}{B}', 'Sneak {1}{B}{B} (You may cast this spell for {1}{B}{B} if you also return an unblocked attacker you control to hand during the declare blockers step. She enters tapped and attacking.)\nWhen Elektra enters, destroy target creature an opponent controls with power 3 or less.', { power: '3', toughness: '3' });
    const atk = put(g, 0, VAMP()); const foe = put(g, 1, BEAR());
    const c = mk(g, 0, d); g.players[0].hand.push(c); pool(g, ['B', 'B', 'B']);
    expect(canCast(g, 0, c, { sneak: true })).toBe(false);
    g.step = 'blockers'; g.active = 0; g.awaiting = undefined as never; atk.attacking = 1; atk.tapped = true;
    expect(canCast(g, 0, c, { sneak: true })).toBe(true);
    expect(castSpell(g, 0, c.uid, { sneak: true, sneakRet: atk.uid })).toBe(true);
    expect(g.players[0].hand.some(x => x.uid === atk.uid)).toBe(true);
    run(g, { tgt: () => ({ card: foe.uid }) });
    const k = g.players[0].battlefield.find(x => x.uid === c.uid)!; expect(k.tapped).toBe(true); expect(k.attacking).toBe(1);
    expect(g.players[1].battlefield.some(x => x.uid === foe.uid)).toBe(false);
    const sp = card('Donatello\'s Technique', 'Sorcery', '{2}{U}', 'Sneak {U} (You may cast this spell for {U} if you also return an unblocked attacker you control to hand during the declare blockers step.)\nDraw two cards.');
    top(g, 0, BEAR()); top(g, 0, BEAR()); const s2 = mk(g, 0, sp); g.players[0].hand.push(s2); pool(g, ['U']);
    expect(castSpell(g, 0, s2.uid, { sneak: true, sneakRet: k.uid })).toBe(true); resolveAI(g);
    expect(g.players[0].hand.length).toBe(4); expect(g.players[0].hand.some(x => x.uid === k.uid)).toBe(true);
  });
});

function scry(o: Partial<ScryCard> & { name: string }): CardDef {
  const cl = compileScry({ type_line: '', colors: [], color_identity: [], keywords: [], ...o } as ScryCard);
  const d = { ...cl.def, id: `s2f-${++n}-${cl.def.id}` }; registerCards([d]);
  expect(cl.support, JSON.stringify(cl.unparsed ?? cl.reason)).toBe('auto');
  return d;
}
const RAID = () => scry({ name: 'Okiba Reckoner Raid // Nezumi Road Captain', type_line: 'Enchantment — Saga // Enchantment Creature — Rat Rogue', layout: 'transform', card_faces: [{ name: 'Okiba Reckoner Raid', mana_cost: '{B}', type_line: 'Enchantment — Saga', oracle_text: '(As this Saga enters and after your draw step, add a lore counter.)\nI, II — Each opponent loses 1 life and you gain 1 life.\nIII — Exile this Saga, then return it to the battlefield transformed under your control.', colors: ['B'] }, { name: 'Nezumi Road Captain', mana_cost: '', type_line: 'Enchantment Creature — Rat Rogue', oracle_text: 'Menace\nVehicles you control have menace. (They can\'t be blocked except by two or more creatures.)', power: '2', toughness: '2', colors: ['B'] }] });
describe('pt14 card types: Sagas, double-faced cards, Adventures, foretell', () => {
  it('Saga: chapter I on entering, a lore counter after each draw step, III exiles and returns it transformed', () => {
    const g = setup(); const d = RAID(); const life = g.players[1].life;
    const c = castFromHand(g, d, ['B']); expect(ctr(c, 'lore')).toBe(1); expect(g.players[1].life).toBe(life - 1);
    const t0 = g.turn;
    expect(until(g, () => g.turn > t0 && g.active === 0 && g.step === 'main1' && !g.stack.length && !g.pending.length)).toBe(true);
    expect(ctr(c, 'lore')).toBe(2);
    const t1 = g.turn;
    expect(until(g, () => g.turn > t1 && g.active === 0 && g.step === 'main1' && !g.stack.length && !g.pending.length)).toBe(true);
    const back = g.players[0].battlefield.find(x => x.uid === c.uid)!;
    expect(def(back).name).toBe('Nezumi Road Captain'); expect(isType(back, 'Creature')).toBe(true); expect(hasKw(back, 'menace')).toBe(true); expect(ctr(back, 'lore')).toBe(0);
    destroy(g, back); checkState(g); const gy = g.players[0].graveyard.find(x => x.uid === c.uid)!; expect(def(gy).name).toMatch(/^Okiba Reckoner Raid/);
  });
  it('Saga is sacrificed after its final chapter resolves (proliferate-style counter adds trigger chapters too)', () => {
    const g = setup(); const d = card('S2 Saga', 'Enchantment — Saga', '{1}{W}', '(As this Saga enters and after your draw step, add a lore counter. Sacrifice after II.)\nI — You gain 2 life.\nII — Draw a card.');
    top(g, 0, BEAR()); const life = g.players[0].life; const c = castFromHand(g, d, ['W', 'W']); expect(g.players[0].life).toBe(life + 2);
    addCounters(g, c, 'lore', 1); checkState(g); expect(g.players[0].battlefield.some(x => x.uid === c.uid)).toBe(true);
    flushTriggers(g); resolveAI(g); checkState(g); expect(g.players[0].hand.length).toBe(1); expect(g.players[0].battlefield.some(x => x.uid === c.uid)).toBe(false); expect(g.players[0].graveyard.some(x => x.uid === c.uid)).toBe(true);
  });
  it('Adventure: cast the Adventure, it is exiled on resolution, then cast the creature from exile', () => {
    const g = setup(); const d = scry({ name: 'Murderous Rider // Swift End', type_line: 'Creature — Zombie Knight // Instant — Adventure', layout: 'adventure', power: '2', toughness: '3', colors: ['B'], card_faces: [{ name: 'Murderous Rider', mana_cost: '{1}{B}{B}', type_line: 'Creature — Zombie Knight', oracle_text: 'Lifelink\nWhen this creature dies, put it on the bottom of its owner\'s library.', power: '2', toughness: '3' }, { name: 'Swift End', mana_cost: '{1}{B}{B}', type_line: 'Instant — Adventure', oracle_text: 'Destroy target creature or planeswalker. You lose 2 life. (Then exile this card. You may cast the creature later from exile.)' }] });
    const foe = put(g, 1, BEAR()); const c = mk(g, 0, d); g.players[0].hand.push(c); pool(g, ['B', 'B', 'B']); const life = g.players[0].life;
    expect(canCast(g, 0, c, { back: true })).toBe(true);
    expect(castSpell(g, 0, c.uid, { back: true, targets: [{ card: foe.uid }] })).toBe(true); resolveAI(g);
    expect(g.players[1].battlefield.some(x => x.uid === foe.uid)).toBe(false); expect(g.players[0].life).toBe(life - 2);
    const ex = g.players[0].exile.find(x => x.uid === c.uid)!; expect(ex.onAdv).toBe(true); expect(def(ex).name).toMatch(/^Murderous Rider/);
    pool(g, ['B', 'B', 'B']); expect(canCast(g, 0, ex, { back: true })).toBe(false); expect(castSpell(g, 0, ex.uid)).toBe(true); resolveAI(g);
    const r = g.players[0].battlefield.find(x => x.uid === c.uid)!; expect(hasKw(r, 'lifelink')).toBe(true);
  });
  it('Adventure countered goes to the graveyard, not exile', () => {
    const g = setup(); const d = scry({ name: 'Murderous Rider // Swift End', type_line: 'Creature — Zombie Knight // Instant — Adventure', layout: 'adventure', power: '2', toughness: '3', card_faces: [{ name: 'Murderous Rider', mana_cost: '{1}{B}{B}', type_line: 'Creature — Zombie Knight', oracle_text: 'Lifelink', power: '2', toughness: '3' }, { name: 'Swift End', mana_cost: '{1}{B}{B}', type_line: 'Instant — Adventure', oracle_text: 'Destroy target creature or planeswalker. You lose 2 life.' }] });
    const foe = put(g, 1, BEAR()); const c = mk(g, 0, d); g.players[0].hand.push(c); pool(g, ['B', 'B', 'B']);
    expect(castSpell(g, 0, c.uid, { back: true, targets: [{ card: foe.uid }] })).toBe(true); destroy(g, foe); checkState(g); resolveAI(g);
    expect(g.players[0].graveyard.some(x => x.uid === c.uid)).toBe(true); expect(def(g.players[0].graveyard.find(x => x.uid === c.uid)!).name).toMatch(/^Murderous Rider/);
  });
  it('Modal DFC: cast the front, or play the back face as a land', () => {
    const g = setup(); const d = scry({ name: 'Fell the Profane // Fell Mire', type_line: 'Instant // Land', layout: 'modal_dfc', color_identity: ['B'], card_faces: [{ name: 'Fell the Profane', mana_cost: '{2}{B}{B}', type_line: 'Instant', oracle_text: 'Destroy target creature or planeswalker.', colors: ['B'] }, { name: 'Fell Mire', mana_cost: '', type_line: 'Land', oracle_text: 'As this land enters, you may pay 3 life. If you don\'t, it enters tapped.\n{T}: Add {B}.', colors: [] }] });
    const c = mk(g, 0, d); g.players[0].hand.push(c); g.priority = 0;
    expect(canPlayLand(g, 0, c)).toBe(false); expect(canPlayLand(g, 0, c, true)).toBe(true);
    expect(playLand(g, 0, c.uid, true)).toBe(true); resolveAI(g);
    const l = g.players[0].battlefield.find(x => x.uid === c.uid)!; expect(def(l).name).toBe('Fell Mire'); expect(isType(l, 'Land')).toBe(true); expect(def(l).mana?.[0].add).toEqual(['B']);
    destroy(g, l); checkState(g); expect(def(g.players[0].graveyard.find(x => x.uid === c.uid)!).name).toMatch(/^Fell the Profane/);
    const foe = put(g, 1, BEAR()); const c2 = mk(g, 0, d); g.players[0].hand.push(c2); pool(g, ['B', 'B', 'B', 'B']);
    expect(castSpell(g, 0, c2.uid, { targets: [{ card: foe.uid }] })).toBe(true); resolveAI(g); expect(g.players[1].battlefield.length).toBe(0);
  });
  it('Transform: "{cost}: Transform this creature" turns it to its back face, keeping counters', () => {
    const g = setup(); const d = scry({ name: 'Seraph of New Capenna // Seraph of New Phyrexia', type_line: 'Creature — Angel Soldier // Creature — Phyrexian Angel', layout: 'transform', card_faces: [{ name: 'Seraph of New Capenna', mana_cost: '{2}{W}', type_line: 'Creature — Angel Soldier', oracle_text: 'Flying\n{4}{B/P}: Transform this creature. Activate only as a sorcery. ({B/P} can be paid with either {B} or 2 life.)', power: '2', toughness: '2', colors: ['W'] }, { name: 'Seraph of New Phyrexia', mana_cost: '', type_line: 'Creature — Phyrexian Angel', oracle_text: 'Flying\nWhenever this creature attacks, you may sacrifice another creature or artifact. If you do, this creature gets +2/+1 until end of turn.', power: '3', toughness: '3', colors: ['B', 'W'] }] });
    const s = put(g, 0, d); s.counters = { '+1/+1': 1 }; layer(g); expect(power(g, s)).toBe(3);
    pool(g, ['W', 'W', 'W', 'W', 'B']); expect(activate(g, 0, s.uid, 0, {})).toBe(true); resolveAI(g);
    expect(def(s).name).toBe('Seraph of New Phyrexia'); expect(power(g, s)).toBe(4); expect(toughness(g, s)).toBe(4); expect(hasKw(s, 'flying')).toBe(true);
    expect(def(s).abilities ?? []).toHaveLength(0);
  });
  it('Foretell: pay {2} to exile it, cast it on a later turn for the foretell cost', () => {
    const g = setup(); const d = card('Doomskar', 'Sorcery', '{3}{W}{W}', 'Destroy all creatures.\nForetell {1}{W}{W} (During your turn, you may pay {2} and exile this card from your hand face down. Cast it on a later turn for its foretell cost.)');
    const c = mk(g, 0, d); g.players[0].hand.push(c); pool(g, ['W', 'W']);
    expect(canForetell(g, 0, c)).toBe(true); expect(foretell(g, 0, c.uid)).toBe(true); expect(g.players[0].exile.includes(c)).toBe(true);
    pool(g, ['W', 'W', 'W']); expect(canCast(g, 0, c)).toBe(false);
    g.turn++; expect(canCast(g, 0, c)).toBe(true); put(g, 1, BEAR());
    expect(castSpell(g, 0, c.uid)).toBe(true); resolveAI(g); expect(g.players[1].battlefield.length).toBe(0);
  });
});
