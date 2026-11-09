import { describe, it, expect } from 'vitest';
import { compileScry } from '../src/import/classify';
import type { ScryCard } from '../src/import/scryfall';
import { loadPrecons } from '../src/import/precons';
import zurgoData from '../src/data/zurgo.json';
import { activate, answerDecision, canActivate, canCast, castSpell, chooseTriggerTargets, costOf, ctr, dealDamage, declareAttackers, declareBlockers, DECKS, def, destroy, enter, findCard, flipFace, flushTriggers, gainLife, hasKw, isType, layer, loseLife, matches, newGame, offBfEff, pass, power, startGame, toughness, registerCards } from '../src/engine/engine';
import type { Decision, Game, Card, CardDef } from '../src/engine/engine';
import { tick } from '../src/engine/controller';
import '../src/engine/ai';

const DATA = zurgoData as unknown as { cards: Record<string, ScryCard> };
let n = 0;
function card(name: string): CardDef {
  const cl = compileScry(DATA.cards[name]);
  const d = { ...cl.def, id: `zg-${++n}-${cl.def.id}` };
  if (d.back) d.back = { ...d.back, id: d.id + '--back' };
  registerCards([d, ...(d.back ? [d.back] : [])]);
  expect(cl.support, `${name}: ${JSON.stringify(cl.unparsed ?? cl.reason)}`).toBe('auto');
  return d;
}
/** A vanilla body, compiled exactly, for targets and devotion. */
function body(name: string, cost: string, p: string, t: string, colors: ScryCard['colors'] = ['R']): CardDef {
  const cl = compileScry({ name, type_line: 'Creature — Warrior', mana_cost: cost, oracle_text: '', power: p, toughness: t, colors, color_identity: colors ?? [], keywords: [] });
  const d = { ...cl.def, id: `zg-${++n}-${cl.def.id}` };
  registerCards([d]);
  expect(cl.support, name).toBe('auto');
  return d;
}
function setup(): Game {
  const g = newGame({ seed: 5, humans: [], skipAiMulligan: true, decks: DECKS.slice(0, 4).map(d => d.id) });
  for (const p of g.players) { p.library.push(...p.hand); p.hand = []; }
  startGame(g);
  let i = 0;
  while (!(g.step === 'main1' && !g.stack.length && g.active === 0) && i++ < 80) { if (g.decision) answerDecision(g, false); else pass(g, g.priority!); }
  for (const p of g.players) { p.library.push(...p.hand); p.hand = []; p.battlefield = []; }
  return g;
}
const mk = (g: Game, pid: number, d: CardDef): Card => { const c: Card = { uid: g.nextUid++, id: d.id, owner: pid, tapped: false, sick: false, damage: 0, pp: 0, pt: 0 }; offBfEff(c); return c; };
function put(g: Game, pid: number, d: CardDef): Card { const c = mk(g, pid, d); g.players[pid].battlefield.push(c); layer(g); return c; }
interface Ans { may?: boolean | ((t: string) => boolean); pick?: (cards: Card[], text: string) => number[]; color?: string; player?: number }
function run(g: Game, o: Ans = {}) {
  for (const p of g.players) p.human = true;
  let i = 0;
  while ((g.stack.length || g.decision || g.choice || g.pending.length) && i++ < 500) {
    if (!g.stack.length && !g.decision && !g.choice && g.pending.length) { flushTriggers(g); continue; }
    if (g.choice) {
      const slots = g.choice.trig.tslots ?? [];
      const ts = slots.map(s => {
        if (s.who === 'stack' || s.who === 'spell' || s.who === 'ability') { const it = g.stack.find(x => x.kind === 'spell'); return it ? { stack: it.id } : undefined; }
        const c = g.players.flatMap(p => p.battlefield).find(x => (!s.f?.types || s.f.types.every(t => def(x).types.includes(t) || (def(x).sub ?? []).includes(t))) && (!s.f?.ctrl || s.f.ctrl !== 'you' || x.owner === g.choice!.controller));
        return c ? { card: c.uid } : undefined;
      });
      expect(chooseTriggerTargets(g, ts), g.choice.trig.label).toBe(true);
      continue;
    }
    const d = g.decision as Decision | null;
    if (!d) { pass(g, g.priority!); continue; }
    if (d.kind === 'may') answerDecision(g, typeof o.may === 'function' ? o.may(d.text) : !!o.may);
    else if (d.kind === 'pick') answerDecision(g, (o.pick ?? (cs => cs.slice(0, Math.max(d.min, 1)).map(c => c.uid)))(d.cards, d.text));
    else if (d.kind === 'color') answerDecision(g, o.color ?? d.options[0]);
    else if (d.kind === 'player') answerDecision(g, o.player ?? d.players[0]);
    else if (d.kind === 'ctype') answerDecision(g, d.options.includes('Warrior') ? 'Warrior' : d.options[0]);
    else if (d.kind === 'order') answerDecision(g, d.items.map((_, k) => k));
    else answerDecision(g, false);
  }
  expect(g.stack.length + (g.decision ? 1 : 0) + (g.choice ? 1 : 0), g.log.slice(-8).join(' | ')).toBe(0);
}
function toAttack(g: Game) { let i = 0; while (g.awaiting !== 'attack' && i++ < 40) { if (g.decision) answerDecision(g, false); else pass(g, g.priority!); } }
function warriors(g: Game, pid = 0) { return g.players[pid].battlefield.filter(c => c.token && (def(c).sub ?? []).includes('Warrior')); }
function toEnd(g: Game) {
  let i = 0;
  while (g.step !== 'end' && i++ < 50) {
    if (g.decision) answerDecision(g, false);
    else if (g.awaiting === 'block') { for (const d of [1, 2, 3]) if (g.awaiting === 'block') declareBlockers(g, d, []); }
    else if (g.priority !== null) pass(g, g.priority!);
    else break;
  }
}

describe("Zurgo, Thunder's Decree", () => {
  it('pins the preset at 100/100 with exactly one commander', () => {
    const p = loadPrecons().find(d => d.name === "Zurgo, Thunder's Decree")!;
    expect(p.supported).toBe(100);
    expect(p.unsupported).toEqual([]);
    expect(1 + (p.extra?.length ?? 0) + p.cards.length).toBe(100);
    const g = newGame({ seed: 1, humans: [], decks: [p.id], skipAiMulligan: true });
    expect(g.players[0].command).toHaveLength(1);
    expect(def(g.players[0].command[0]).name).toBe("Zurgo, Thunder's Decree");
    expect(g.players[0].library.length + g.players[0].hand.length + g.players[0].command.length).toBe(100);
  });

  it("mobilize warriors can't be sacrificed during Zurgo's end step", () => {
    const g = setup();
    const zurgo = put(g, 0, card("Zurgo, Thunder's Decree"));
    toAttack(g); declareAttackers(g, 0, [{ uid: zurgo.uid, defender: 1 }]); run(g);
    expect(warriors(g)).toHaveLength(2);
    expect(warriors(g).every(c => c.attacking === 1 && c.tapped)).toBe(true);
    toEnd(g); run(g);
    expect(g.step).toBe('end');
    expect(warriors(g)).toHaveLength(2);
    expect(g.log.some(l => l.includes("can't be sacrificed"))).toBe(true);
  });

  it('Zurgo Stormrender draws when an attacking token leaves and drains otherwise', () => {
    const g = setup();
    put(g, 0, card('Zurgo Stormrender'));
    const bear = put(g, 0, body('ZG Bear', '{R}', '2', '2'));
    bear.token = true; bear.attacking = 1;
    destroy(g, bear); run(g);
    expect(g.players[0].hand.length).toBe(1);
    const quiet = put(g, 0, body('ZG Cub', '{R}', '1', '1'));
    quiet.token = true;
    const life = g.players[1].life;
    destroy(g, quiet); run(g);
    expect(g.players[1].life).toBe(life - 1);
    expect(g.players[2].life).toBe(life - 1);
    expect(g.players[0].hand.length).toBe(1);
  });

  it('Isshin and Roaming Throne each add one copy of an attack trigger', () => {
    const g = setup();
    const zurgo = put(g, 0, card("Zurgo, Thunder's Decree"));
    put(g, 0, card('Isshin, Two Heavens as One'));
    const throne = put(g, 0, card('Roaming Throne'));
    throne.chosenType = 'Warrior';
    toAttack(g); declareAttackers(g, 0, [{ uid: zurgo.uid, defender: 1 }]); run(g);
    // original + Isshin + Throne
    expect(warriors(g)).toHaveLength(6);
  });

  it('Mondrak doubles tokens and Ojer Taq triples creature tokens', () => {
    const g = setup();
    const zurgo = put(g, 0, card("Zurgo, Thunder's Decree"));
    put(g, 0, card('Mondrak, Glory Dominus'));
    toAttack(g); declareAttackers(g, 0, [{ uid: zurgo.uid, defender: 1 }]); run(g);
    expect(warriors(g)).toHaveLength(4);
    const g2 = setup();
    const z2 = put(g2, 0, card("Zurgo, Thunder's Decree"));
    put(g2, 0, card('Ojer Taq, Deepest Foundation // Temple of Civilization'));
    toAttack(g2); declareAttackers(g2, 0, [{ uid: z2.uid, defender: 1 }]); run(g2);
    expect(warriors(g2)).toHaveLength(6);
    const g3 = setup();
    const z3 = put(g3, 0, card("Zurgo, Thunder's Decree"));
    put(g3, 0, card('Mondrak, Glory Dominus'));
    put(g3, 0, card('Ojer Taq, Deepest Foundation // Temple of Civilization'));
    toAttack(g3); declareAttackers(g3, 0, [{ uid: z3.uid, defender: 1 }]); run(g3);
    expect(warriors(g3)).toHaveLength(12);
  });

  it('Iroas is a creature only at 7 devotion, grants menace, and prevents damage to attackers', () => {
    const g = setup();
    const iroas = put(g, 0, card('Iroas, God of Victory'));
    expect(isType(iroas, 'Creature')).toBe(false);
    expect(hasKw(iroas, 'indestructible')).toBe(true);
    const mine = put(g, 0, body('ZG Ally', '{R}', '2', '2'));
    expect(hasKw(mine, 'menace')).toBe(true);
    mine.attacking = 1;
    dealDamage(g, mine.id, mine, { card: mine }, 4);
    expect(mine.damage).toBe(0);
    for (let i = 0; i < 5; i++) put(g, 0, body('ZG Pip ' + i, '{R}', '1', '1'));
    layer(g);
    expect(isType(iroas, 'Creature')).toBe(true);
  });

  it('Mutavault, Needle Spires, and Shambling Vent animate', () => {
    const g = setup();
    const vault = put(g, 0, card('Mutavault'));
    g.players[0].pool.push('C');
    expect(activate(g, 0, vault.uid, 0)).toBe(true); run(g);
    expect(isType(vault, 'Creature')).toBe(true);
    expect(isType(vault, 'Land')).toBe(true);
    expect(power(g, vault)).toBe(2);
    expect(hasKw(vault, 'changeling')).toBe(true);
    expect(matches(g, vault, { types: ['Warrior'] }, 0)).toBe(true);
    expect(matches(g, vault, { types: ['Goblin'] }, 0)).toBe(true);

    const spires = put(g, 0, card('Needle Spires'));
    g.players[0].pool.push('C', 'C', 'R', 'W');
    const si = def(spires).abilities!.findIndex(a => /becomes/i.test(a.label));
    expect(activate(g, 0, spires.uid, si)).toBe(true); run(g);
    expect(isType(spires, 'Creature')).toBe(true);
    expect(power(g, spires)).toBe(2);
    expect(hasKw(spires, 'double strike')).toBe(true);

    const vent = put(g, 0, card('Shambling Vent'));
    vent.tapped = false;
    g.players[0].pool.push('C', 'W', 'B');
    const vi = def(vent).abilities!.findIndex(a => /becomes/i.test(a.label));
    expect(activate(g, 0, vent.uid, vi)).toBe(true); run(g);
    expect(power(g, vent)).toBe(2);
    expect(hasKw(vent, 'lifelink')).toBe(true);
    expect(isType(vent, 'Land')).toBe(true);
  });

  it('Skullclamp draws two when the equipped creature dies and shrinks it', () => {
    const g = setup();
    const clamp = put(g, 0, card('Skullclamp'));
    const bear = put(g, 0, body('ZG Clamped', '{R}', '2', '2'));
    g.players[0].pool.push('C');
    expect(activate(g, 0, clamp.uid, 0, { card: bear.uid })).toBe(true); run(g);
    expect(clamp.attachedTo).toBe(bear.uid);
    expect(power(g, bear)).toBe(3);
    expect(toughness(g, bear)).toBe(1);
    const lib = g.players[0].library.length;
    destroy(g, bear); run(g);
    expect(g.players[0].hand.length).toBe(2);
    expect(g.players[0].library.length).toBe(lib - 2);
  });

  it('Impact Tremors deals 1 to each opponent when a creature enters', () => {
    const g = setup();
    put(g, 0, card('Impact Tremors'));
    const life = g.players.map(p => p.life);
    enter(g, mk(g, 0, body('ZG Enter', '{R}', '1', '1')), 0); run(g);
    expect(g.players[1].life).toBe(life[1] - 1);
    expect(g.players[2].life).toBe(life[2] - 1);
    expect(g.players[0].life).toBe(life[0]);
  });

  it("Ruinous Ultimatum destroys opponents' nonland permanents", () => {
    const g = setup();
    const foe = put(g, 1, body('ZG Foe', '{R}', '3', '3'));
    const land = put(g, 1, card('Plains'));
    const mine = put(g, 0, body('ZG Mine', '{R}', '2', '2'));
    const spell = mk(g, 0, card('Ruinous Ultimatum'));
    g.players[0].hand.push(spell);
    g.players[0].pool.push('R', 'R', 'W', 'W', 'W', 'B', 'B');
    expect(castSpell(g, 0, spell.uid)).toBe(true); run(g);
    expect(findCard(g, foe.uid)).toBeUndefined();
    expect(findCard(g, land.uid)).toBe(land);
    expect(findCard(g, mine.uid)).toBe(mine);
  });

  it('Static Snare costs less per attacker and returns the exiled card when it leaves', () => {
    const g = setup();
    const a = put(g, 1, body('ZG Atk', '{R}', '2', '2')); a.attacking = 0;
    const b = put(g, 2, body('ZG Atk2', '{R}', '2', '2')); b.attacking = 0;
    const snare = card('Static Snare');
    const spell = mk(g, 0, snare);
    expect(costOf(g, spell).generic).toBe(2);
    expect(costOf(g, spell).W).toBe(1);
    const victim = put(g, 1, body('ZG Victim', '{R}', '2', '2'));
    g.players[0].human = true;
    enter(g, spell, 0); flushTriggers(g);
    expect(chooseTriggerTargets(g, [{ card: victim.uid }])).toBe(true);
    run(g);
    expect(g.players[1].exile.some(c => c.uid === victim.uid)).toBe(true);
    expect(findCard(g, victim.uid)).toBeUndefined();
    destroy(g, spell); run(g);
    const back = findCard(g, victim.uid)!;
    expect(back).toBeTruthy();
    expect(g.players[1].battlefield.includes(back)).toBe(true);
  });

  it("Redirect Lightning changes a spell's only target", () => {
    const g = setup();
    const zapDef = compileScry({ name: 'ZG Bolt', type_line: 'Instant', mana_cost: '{R}', oracle_text: 'ZG Bolt deals 3 damage to target creature.', colors: ['R'], color_identity: ['R'], keywords: [] });
    const zap = { ...zapDef.def, id: `zg-${++n}-bolt` }; registerCards([zap]);
    expect(zapDef.support).toBe('auto');
    const a = put(g, 1, body('ZG A', '{R}', '5', '5'));
    const b = put(g, 1, body('ZG B', '{R}', '5', '5'));
    const zs = mk(g, 0, zap); g.players[0].hand.push(zs); g.players[0].pool.push('R');
    expect(castSpell(g, 0, zs.uid, { card: a.uid })).toBe(true);
    const onStack = g.stack[g.stack.length - 1];
    const rd = mk(g, 0, card('Redirect Lightning')); g.players[0].hand.push(rd); g.players[0].pool.push('R');
    const before = g.players[0].life;
    expect(castSpell(g, 0, rd.uid, { stack: onStack.id })).toBe(true);
    expect(g.players[0].life).toBe(before - 5);
    run(g, { pick: cs => [cs.find(c => c.uid === b.uid)!.uid] });
    expect(a.damage).toBe(0);
    expect(b.damage).toBe(3);
  });

  it("Teferi's Protection phases permanents out, locks life, and phases them in next turn", () => {
    const g = setup();
    const bear = put(g, 0, body('ZG Kept', '{W}', '2', '2', ['W']));
    const land = put(g, 0, card('Plains'));
    const tp = mk(g, 0, card("Teferi's Protection")); g.players[0].hand.push(tp); g.players[0].pool.push('C', 'C', 'W');
    expect(castSpell(g, 0, tp.uid)).toBe(true); run(g);
    expect(findCard(g, bear.uid)).toBeUndefined();
    expect(findCard(g, land.uid)).toBeUndefined();
    expect(g.players[0].phased?.map(c => c.uid).sort()).toEqual([bear.uid, land.uid].sort());
    const life = g.players[0].life;
    loseLife(g, 0, 5); gainLife(g, 0, 5); dealDamage(g, bear.id, bear, { player: 0 }, 3);
    expect(g.players[0].life).toBe(life);
    const shock = compileScry({ name: 'ZG Shock', type_line: 'Instant', mana_cost: '{R}', oracle_text: 'ZG Shock deals 2 damage to any target.', colors: ['R'], color_identity: ['R'], keywords: [] });
    const sh = { ...shock.def, id: `zg-${++n}-sh` }; registerCards([sh]);
    const ss = mk(g, 1, sh); g.players[1].hand.push(ss); g.players[1].pool.push('R');
    expect(castSpell(g, 1, ss.uid, { player: 0 })).toBe(false);
    let i = 0;
    while (!(g.active === 0 && g.turn > 1 && g.step === 'main1') && i++ < 400) {
      if (g.awaiting === 'block') { for (const d of [1, 2, 3]) if (g.awaiting === 'block') declareBlockers(g, d, []); }
      else if (g.decision) answerDecision(g, false);
      else if (g.priority !== null) pass(g, g.priority!);
      else break;
    }
    expect(findCard(g, bear.uid)).toBe(bear);
    expect(findCard(g, land.uid)).toBe(land);
    expect(g.players[0].teferi).toBeFalsy();
    loseLife(g, 0, 1);
    expect(g.players[0].life).toBe(life - 1);
  });

  it('Fated Firepower adds its fire counters to damage you deal', () => {
    const g = setup();
    const fp = put(g, 0, card('Fated Firepower'));
    fp.counters = { fire: 2 };
    const foe = put(g, 1, body('ZG Foe2', '{R}', '5', '5'));
    const src = put(g, 0, body('ZG Src', '{R}', '2', '2'));
    dealDamage(g, src.id, src, { card: foe }, 2);
    expect(foe.damage).toBe(4);
    dealDamage(g, src.id, src, { player: 1 }, 1);
    expect(g.players[1].life).toBe(40 - 3);
  });

  it('Eirdu gives creature spells convoke and Isilu grants persist; Ojer Taq returns transformed', () => {
    const g = setup();
    const eirdu = put(g, 0, card('Eirdu, Carrier of Dawn // Isilu, Carrier of Twilight'));
    const helper = put(g, 0, body('ZG Convoker', '{W}', '1', '1', ['W']));
    const spell = mk(g, 0, body('ZG Recruit', '{W}', '2', '2', ['W']));
    g.players[0].hand.push(spell);
    expect(canCast(g, 0, spell)).toBe(true);
    destroy(g, eirdu); // remove convoke source
    const spell2 = mk(g, 0, body('ZG Recruit 2', '{W}', '2', '2', ['W']));
    g.players[0].hand.push(spell2);
    expect(canCast(g, 0, spell2)).toBe(false);
    void helper;

    const g2 = setup();
    const god = put(g2, 0, card('Eirdu, Carrier of Dawn // Isilu, Carrier of Twilight'));
    flipFace(god); layer(g2);
    expect(def(god).name).toBe('Isilu, Carrier of Twilight');
    const ally = put(g2, 0, body('ZG Persist', '{W}', '2', '2', ['W']));
    expect(hasKw(ally, 'persist')).toBe(true);
    destroy(g2, ally); run(g2);
    const back = findCard(g2, ally.uid)!;
    expect(back).toBeTruthy();
    expect(ctr(back, '-1/-1')).toBe(1);
    destroy(g2, back); run(g2);
    expect(findCard(g2, ally.uid)).toBeUndefined();

    const g3 = setup();
    const ojer = put(g3, 0, card('Ojer Taq, Deepest Foundation // Temple of Civilization'));
    destroy(g3, ojer); run(g3);
    const temple = findCard(g3, ojer.uid)!;
    expect(def(temple).name).toBe('Temple of Civilization');
    expect(temple.tapped).toBe(true);
    expect(isType(temple, 'Land')).toBe(true);
    temple.tapped = false;
    g3.players[0].atkN = 2;
    expect(canActivate(g3, 0, temple, def(temple).abilities!.findIndex(a => /transform/i.test(a.label)))).toBe(false);
    g3.players[0].atkN = 3;
    g3.players[0].pool.push('C', 'C', 'W');
    const ai = def(temple).abilities!.findIndex(a => /transform/i.test(a.label));
    expect(activate(g3, 0, temple.uid, ai)).toBe(true); run(g3);
    const restored = findCard(g3, ojer.uid)!;
    expect(isType(restored, 'Creature')).toBe(true);
    expect(isType(restored, 'Land')).toBe(false);
    expect(power(g3, restored)).toBe(6);
  });

  it('Adeline makes a Human for each opponent and Mirkwood Bats drains on tokens', () => {
    const g = setup();
    const adeline = put(g, 0, card('Adeline, Resplendent Cathar'));
    put(g, 0, card('Mirkwood Bats'));
    const life = g.players[1].life;
    toAttack(g); declareAttackers(g, 0, [{ uid: adeline.uid, defender: 1 }]); run(g);
    const humans = g.players[0].battlefield.filter(c => c.token && (def(c).sub ?? []).includes('Human'));
    expect(humans).toHaveLength(3);
    expect(new Set(humans.map(c => c.attacking))).toEqual(new Set([1, 2, 3]));
    const pwCl = compileScry({ name: 'ZG Walker', type_line: 'Legendary Planeswalker — ZG', mana_cost: '{3}{R}', oracle_text: '+1: Draw a card.', loyalty: '4', colors: ['R'], color_identity: ['R'], keywords: [] });
    expect(pwCl.support, JSON.stringify(pwCl.unparsed)).toBe('auto');
    const pw = { ...pwCl.def, id: `zg-pw-${++n}` }; registerCards([pw]);
    const g2 = setup();
    const adel2 = put(g2, 0, card('Adeline, Resplendent Cathar'));
    const walker = put(g2, 1, pw); walker.counters = { loyalty: 4 };
    toAttack(g2); declareAttackers(g2, 0, [{ uid: adel2.uid, defender: 2 }]); run(g2, { color: 'ZG Walker' });
    const aimed = g2.players[0].battlefield.filter(c => c.token && c.attacking === 1);
    expect(aimed).toHaveLength(1);
    expect(aimed[0].atkPw).toBe(walker.uid);
    // three tokens created: bats triggers three times
    expect(g.players[1].life).toBe(life - 3);
  });

  it('the Zurgo deck plays a few turns with Zurgo in the command zone', () => {
    const ps = loadPrecons();
    const zurgo = ps.find(p => p.name === "Zurgo, Thunder's Decree")!;
    const others = ps.filter(p => p !== zurgo).slice(0, 3).map(p => p.id);
    const g = newGame({ seed: 4, humans: [], decks: [zurgo.id, ...others], skipAiMulligan: true });
    expect(def(g.players[0].command[0]).name).toBe("Zurgo, Thunder's Decree");
    startGame(g);
    let steps = 0;
    while (g.winner === null && g.turn < 8 && steps++ < 8000) tick(g);
    expect(steps).toBeLessThan(8000);
    expect(g.turn).toBeGreaterThanOrEqual(8);
  });
});
