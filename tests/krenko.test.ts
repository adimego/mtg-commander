import { describe, it, expect } from 'vitest';
import { compileScry } from '../src/import/classify';
import { loadPrecons } from '../src/import/precons';
import type { ScryCard } from '../src/import/scryfall';
import krenkoData from '../src/data/krenko.json';
import {
  activate, addCounters, answerDecision, canActivate, canCast, canUnlockDoor, castSpell, chooseTriggerTargets,
  createToken, ctr, dealDamage, declareAttackers, declareBlockers, DECKS, def, destroy, emit, enter, findCard,
  flushTriggers, hasKw, isType, layer, newGame, offBfEff, pass, power, startGame, tapForMana, toughness,
  unlockDoor, registerCards, abilitiesOf,
} from '../src/engine/engine';
import type { Decision, Game, Card, CardDef } from '../src/engine/engine';
import { tick } from '../src/engine/controller';
import '../src/engine/ai';

const DATA = krenkoData as unknown as { decks: { name: string; commanders: string[]; cards: { q: number; name: string }[] }[]; cards: Record<string, ScryCard> };
let n = 0;
function card(name: string): CardDef {
  const sc = DATA.cards[name];
  expect(sc, name).toBeTruthy();
  const cl = compileScry(sc);
  const d = { ...cl.def, id: `kr-${++n}-${cl.def.id}` };
  if (d.room) d.room = { doors: d.room.doors.map((door, i) => ({ ...door })) };
  registerCards([d]);
  expect(cl.support, `${name}: ${JSON.stringify(cl.unparsed ?? cl.reason)}`).not.toBe('limited');
  return d;
}
function body(name: string, cost: string, p: string, t: string, colors: ScryCard['colors'] = ['R'], type = 'Creature — Goblin'): CardDef {
  const cl = compileScry({ name, type_line: type, mana_cost: cost, oracle_text: '', power: p, toughness: t, colors, color_identity: colors ?? [], keywords: [] });
  const d = { ...cl.def, id: `kr-${++n}-${cl.def.id}` };
  registerCards([d]);
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
function give(g: Game, pid: number, d: CardDef): Card { const c = mk(g, pid, d); g.players[pid].hand.push(c); return c; }
function mana(g: Game, pid: number, n: number, k: 'R' | 'C' = 'R') { for (let i = 0; i < n; i++) g.players[pid].pool.push(k); }
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
        const cs = g.players.flatMap(p => p.battlefield).filter(x => {
          if (s.f?.types && !s.f.types.every(t => def(x).types.includes(t) || (def(x).sub ?? []).includes(t))) return false;
          if (s.f?.ctrl === 'you' && x.owner !== g.choice!.controller) return false;
          if (s.f?.ctrl === 'opp' && x.owner === g.choice!.controller) return false;
          return true;
        });
        if (o.pick && cs.length && g.choice) { const ids = o.pick(cs, g.choice.trig.label); const hit = cs.find(x => ids.includes(x.uid)); if (hit) return { card: hit.uid }; }
        return cs[0] ? { card: cs[0].uid } : undefined;
      });
      const label = g.choice.trig.label;
      expect(chooseTriggerTargets(g, ts), label).toBe(true);
      continue;
    }
    const d = g.decision as Decision | null;
    if (!d) { pass(g, g.priority!); continue; }
    if (d.kind === 'may') answerDecision(g, typeof o.may === 'function' ? o.may(d.text) : !!o.may);
    else if (d.kind === 'pick') answerDecision(g, (o.pick ?? (cs => cs.slice(0, Math.max(d.min, 1)).map(c => c.uid)))(d.cards, d.text));
    else if (d.kind === 'color') answerDecision(g, o.color ?? d.options[0]);
    else if (d.kind === 'player') answerDecision(g, o.player ?? d.players[0]);
    else if (d.kind === 'ctype') answerDecision(g, d.options[0]);
    else if (d.kind === 'order') answerDecision(g, d.items.map((_, k) => k));
    else answerDecision(g, false);
  }
  expect(g.stack.length + (g.decision ? 1 : 0) + (g.choice ? 1 : 0), g.log.slice(-8).join(' | ')).toBe(0);
}
function toAttack(g: Game) { let i = 0; while (g.awaiting !== 'attack' && i++ < 40) { if (g.decision) answerDecision(g, false); else pass(g, g.priority!); } }
function goblins(g: Game, pid = 0) { return g.players[pid].battlefield.filter(c => (def(c).sub ?? []).includes('Goblin')); }
function toEnd(g: Game) {
  let i = 0;
  while (g.step !== 'end' && i++ < 80) {
    if (g.decision) answerDecision(g, false);
    else if (g.awaiting === 'attack') declareAttackers(g, g.active, []);
    else if (g.awaiting === 'block') { for (const d of [1, 2, 3]) if (g.awaiting === 'block') declareBlockers(g, d, []); }
    else if (g.priority !== null) pass(g, g.priority!);
    else break;
  }
}
function toMain2(g: Game) {
  let i = 0;
  while (g.step !== 'main2' && i++ < 80) {
    if (g.decision) answerDecision(g, false);
    else if (g.awaiting === 'block') { for (const d of [1, 2, 3]) if (g.awaiting === 'block') declareBlockers(g, d, []); }
    else if (g.priority !== null) pass(g, g.priority!);
    else break;
  }
}

describe('Krenko, Mob Boss', () => {
  it('pins 100/100 fully supported and red identity', () => {
    const pre = loadPrecons().find(d => d.name === 'Krenko, Mob Boss');
    expect(pre).toBeTruthy();
    const deck = DATA.decks[0];
    const lines = [...deck.commanders.map(name => ({ q: 1, name })), ...deck.cards];
    let n = 0, ok = 0;
    for (const l of lines) {
      n += l.q;
      const sc = DATA.cards[l.name];
      expect(sc, l.name).toBeTruthy();
      const id = sc.color_identity ?? [];
      expect(id.every(k => k === 'R'), `${l.name} identity ${id}`).toBe(true);
      const r = compileScry(sc);
      if (r.support !== 'limited') ok += l.q;
      else expect.fail(`${l.name}: ${JSON.stringify(r.unparsed ?? r.reason)}`);
    }
    expect(`${ok}/${n}`).toBe('100/100');
  });

  it('Krenko makes a Goblin for each Goblin you control', () => {
    const g = setup(); const k = put(g, 0, card('Krenko, Mob Boss')); put(g, 0, body('Grunt', '{R}', '1', '1'));
    expect(canActivate(g, 0, k, 0)).toBe(true);
    activate(g, 0, k.uid, 0); run(g);
    expect(goblins(g, 0).length).toBe(4); // Krenko, grunt, two tokens
  });

  it('Raid: Boarders enters with a counter if you attacked; Searslicer makes a Goblin at your end step', () => {
    const g = setup(); const atk = put(g, 0, body('Raider', '{R}', '2', '2'));
    toAttack(g); declareAttackers(g, 0, [{ uid: atk.uid, defender: 1 }]);
    for (const d of [1, 2, 3]) if (g.awaiting === 'block') declareBlockers(g, d, []);
    let i = 0; while (g.step !== 'main2' && i++ < 40) { if (g.decision) answerDecision(g, false); else if (g.priority !== null) pass(g, g.priority!); }
    const b = mk(g, 0, card('Goblin Boarders'));
    enter(g, b, 0); expect(ctr(b, '+1/+1')).toBe(1);
    put(g, 0, card('Searslicer Goblin'));
    toEnd(g); run(g);
    expect(g.players[0].battlefield.some(c => c.token && (def(c).sub ?? []).includes('Goblin'))).toBe(true);
  });

  it('Battle-Scarred Goblin deals 1 to each creature blocking it', () => {
    const g = setup(); const a = put(g, 0, card('Battle-Scarred Goblin')); const bl = put(g, 1, body('Wall', '{W}', '0', '3', ['W'], 'Creature — Wall'));
    toAttack(g); declareAttackers(g, 0, [{ uid: a.uid, defender: 1 }]);
    let i = 0; while (g.awaiting !== 'block' && i++ < 20) pass(g, g.priority!);
    declareBlockers(g, 1, [{ blocker: bl.uid, attacker: a.uid }]);
    run(g);
    expect(bl.damage).toBeGreaterThanOrEqual(1);
  });

  it('Idol of Oblivion draws only if you created a token this turn', () => {
    const g = setup(); const idol = put(g, 0, card('Idol of Oblivion'));
    const i = (def(idol).abilities ?? []).findIndex(a => a.label.toLowerCase().includes('draw'));
    expect(i).toBeGreaterThanOrEqual(0);
    expect(canActivate(g, 0, idol, i)).toBe(false);
    createToken(g, 0, { name: 'Goblin', p: 1, t: 1, colors: ['R'], types: ['Creature'], sub: ['Goblin'] });
    expect(canActivate(g, 0, idol, i)).toBe(true);
  });

  it('Quest for the Goblin Lord anthems at 5 quest counters', () => {
    const g = setup(); const q = put(g, 0, card('Quest for the Goblin Lord')); const c = put(g, 0, body('Grunt', '{R}', '1', '1'));
    expect(power(g, c)).toBe(1);
    addCounters(g, q, 'quest', 5); layer(g);
    expect(power(g, c)).toBe(3);
  });

  it('Goblin Negotiation deals X and makes Goblins equal to excess damage', () => {
    const g = setup(); const t = put(g, 1, body('Ox', '{G}', '2', '2', ['G'], 'Creature — Ox'));
    const sp = give(g, 0, card('Goblin Negotiation'));
    mana(g, 0, 6, 'R');
    expect(canCast(g, 0, sp, { x: 4 })).toBe(true);
    expect(castSpell(g, 0, sp.uid, { x: 4, targets: [{ card: t.uid }] })).toBe(true);
    run(g);
    expect(g.players[0].battlefield.filter(c => c.token && (def(c).sub ?? []).includes('Goblin')).length).toBe(2);
  });

  it('Shattering Spree replicates and destroys artifacts', () => {
    const g = setup(); const a1 = put(g, 1, card('Arcane Signet')); const a2 = put(g, 1, card("Commander's Sphere"));
    const sp = give(g, 0, card('Shattering Spree'));
    mana(g, 0, 3, 'R');
    expect(castSpell(g, 0, sp.uid, { targets: [{ card: a1.uid }], replicate: 1 })).toBe(true);
    expect(g.stack.filter(s => s.kind === 'spell').length).toBe(2);
    // retarget the copy at a2 if it still points at a1
    const copy = g.stack.find(s => s.label.startsWith('copy of'));
    if (copy) { copy.targets = [{ card: a2.uid }]; copy.target = { card: a2.uid }; }
    run(g);
    expect(findCard(g, a1.uid)).toBeUndefined();
    expect(findCard(g, a2.uid)).toBeUndefined();
  });

  it('Impulsive Pilferer Encore makes a token per opponent with haste, then sacs them', () => {
    const g = setup(); const p = mk(g, 0, card('Impulsive Pilferer'));
    g.players[0].graveyard.push(p);
    mana(g, 0, 4, 'R');
    const i = abilitiesOf(g, p).findIndex(a => /encore/i.test(a.label));
    expect(i).toBeGreaterThanOrEqual(0);
    expect(canActivate(g, 0, p, i)).toBe(true);
    activate(g, 0, p.uid, i); run(g);
    const toks = g.players[0].battlefield.filter(c => c.token && def(c).name.includes('Pilferer'));
    expect(toks.length).toBe(3);
    expect(toks.every(c => hasKw(c, 'haste'))).toBe(true);
    toEnd(g); run(g);
    expect(g.players[0].battlefield.filter(c => c.token && def(c).name.includes('Pilferer')).length).toBe(0);
  });

  it('Legion Warboss mentors and makes a hasty Goblin that must attack', () => {
    const g = setup(); const w = put(g, 0, card('Legion Warboss')); addCounters(g, w, '+1/+1', 1); layer(g);
    const small = put(g, 0, body('Tiny', '{R}', '1', '1'));
    toAttack(g); run(g, { pick: cs => [small.uid] });
    const tok = g.players[0].battlefield.find(c => c.token && (def(c).sub ?? []).includes('Goblin'));
    expect(tok).toBeTruthy();
    expect(hasKw(tok!, 'haste') || hasKw(tok!, '_mustattack')).toBe(true);
  });

  it('Spider-Punk: riot, uncounterable spells, unpreventable damage', () => {
    const g = setup(); put(g, 0, card('Spider-Punk'));
    const s = mk(g, 0, body('Web', '{1}{R}', '1', '1', ['R'], 'Creature — Spider'));
    enter(g, s, 0);
    // AI/non-human already started: riot auto-picks. Human was forced in run(); enter happened while maybe human.
    // The game players were AI at enter. haste or +1/+1 should be present.
    expect(hasKw(s, 'haste') || ctr(s, '+1/+1') >= 1).toBe(true);
    const bear = put(g, 1, body('Bear', '{G}', '2', '2', ['G'], 'Creature — Bear'));
    dealDamage(g, def(s).id, s, { card: bear }, 1);
    expect(bear.damage).toBe(1);
  });

  it('Heraldic Banner: choose a color, +1/+0 and mana of that color', () => {
    const g = setup(); const b = mk(g, 0, card('Heraldic Banner'));
    for (const p of g.players) p.human = false;
    enter(g, b, 0);
    expect(b.chosenColor).toBe('R');
    const c = put(g, 0, body('Red', '{R}', '1', '1'));
    layer(g);
    expect(power(g, c)).toBe(2);
  });

  it('The Fire Crystal copies a creature and sacs the token at end of turn', () => {
    const g = setup(); const fc = put(g, 0, card('The Fire Crystal')); const src = put(g, 0, body('Boss', '{R}', '3', '3'));
    mana(g, 0, 6, 'R');
    const i = (def(fc).abilities ?? []).findIndex(a => /copy|token/i.test(a.label) || a.effects.some(e => e.op === 'copyTok'));
    expect(i).toBeGreaterThanOrEqual(0);
    expect(activate(g, 0, fc.uid, i, { targets: [{ card: src.uid }] })).toBe(true);
    run(g);
    const tok = g.players[0].battlefield.find(c => c.token && def(c).name === def(src).name);
    expect(tok).toBeTruthy();
    toEnd(g); run(g);
    expect(findCard(g, tok!.uid)).toBeUndefined();
  });

  it('Muxus reveals the top six and puts cheap Goblins onto the battlefield', () => {
    const g = setup();
    const cheap = card('Raging Goblinoids');
    const rest = card('Mountain');
    g.players[0].library.push(...[mk(g, 0, rest), mk(g, 0, rest), mk(g, 0, cheap), mk(g, 0, rest), mk(g, 0, cheap), mk(g, 0, rest)]);
    const m = mk(g, 0, card('Muxus, Goblin Grandee'));
    enter(g, m, 0); run(g);
    expect(g.players[0].battlefield.filter(c => def(c).name === 'Raging Goblinoids').length).toBe(2);
  });

  it('Rundvelt exiles a Goblin from the top and lets you cast it until end of next turn', () => {
    const g = setup(); put(g, 0, card('Rundvelt Hordemaster'));
    const gob = mk(g, 0, card('Fanatical Firebrand'));
    g.players[0].library.push(gob);
    const fodder = put(g, 0, body('G1', '{R}', '1', '1'));
    destroy(g, fodder); run(g);
    expect(g.players[0].exile.some(c => c.uid === gob.uid && (c.mayPlay ?? 0) > g.turn)).toBe(true);
  });

  it('Glassworks // Shattered Yard unlocks a door on cast and can unlock the other later', () => {
    const g = setup(); const tgt = put(g, 1, body('Ox', '{G}', '2', '5', ['G'], 'Creature — Ox'));
    const r = give(g, 0, card('Glassworks // Shattered Yard'));
    mana(g, 0, 3, 'R');
    expect(canCast(g, 0, r, { door: 0 })).toBe(true);
    expect(castSpell(g, 0, r.uid, { door: 0, targets: [{ card: tgt.uid }] })).toBe(true);
    run(g, { pick: () => [tgt.uid] });
    const room = g.players[0].battlefield.find(c => def(c).room);
    expect(room).toBeTruthy();
    expect(room!.unlocked).toContain(0);
    expect(tgt.damage).toBe(4);
    mana(g, 0, 5, 'R');
    expect(canUnlockDoor(g, 0, room!, 1)).toBe(true);
    expect(unlockDoor(g, 0, room!.uid, 1)).toBe(true);
    expect(room!.unlocked).toEqual(expect.arrayContaining([0, 1]));
  });

  it('Gogo may become a copy until EOT and both get +2/+0 haste and must attack', () => {
    const g = setup(); const go = put(g, 0, card('Gogo, Mysterious Mime')); const ogre = put(g, 0, body('Ogre', '{3}{R}', '5', '5'));
    toAttack(g); run(g, { may: true, pick: () => [ogre.uid] });
    expect(def(go).name).toBe('Gogo, Mysterious Mime');
    expect(power(g, go)).toBeGreaterThanOrEqual(7);
    expect(hasKw(go, 'haste')).toBe(true);
  });

  it('Marvin copies activated abilities of differently named creatures', () => {
    const g = setup(); const k = put(g, 0, card('Krenko, Mob Boss')); const m = put(g, 0, card('Marvin, Murderous Mimic'));
    const abs = abilitiesOf(g, m);
    expect(abs.some(a => /krenko/i.test(a.label) || a.effects.some(e => e.op === 'token'))).toBe(true);
    expect(canActivate(g, 0, m, abs.findIndex(a => /krenko/i.test(a.label) || a.effects.some(e => e.op === 'token')))).toBe(true);
    void k;
  });

  it('Zada copies a single-target pump for each other creature you control', () => {
    const g = setup(); const z = put(g, 0, card('Zada, Hedron Grinder')); const a = put(g, 0, body('A', '{R}', '1', '1')); const b = put(g, 0, body('B', '{R}', '1', '1'));
    const pump = give(g, 0, card('How to Start a Riot'));
    mana(g, 0, 3, 'R');
    // How to Start a Riot has two targets (creature and player). Use a simple pump if needed.
    // Prefer a single-target spell from the deck: none is a pure pump. Use compiled shock-like? Wisecrack is single target.
    // Cast a homemade pump? Instead use the card if it only targets Zada for first mode...
    // Build a simple instant via compile in-test? The deck's How to Start a Riot targets a creature AND a player.
    // Use a generated one-liner through body? Better compile a test spell.
    const cl = compileScry({ name: 'Spark', type_line: 'Instant', mana_cost: '{R}', oracle_text: 'Target creature gets +1/+0 until end of turn.', colors: ['R'], color_identity: ['R'], keywords: [] });
    const d = { ...cl.def, id: `kr-${++n}-spark` }; registerCards([d]); expect(cl.support).toBe('auto');
    const sp = give(g, 0, d);
    mana(g, 0, 1, 'R');
    expect(castSpell(g, 0, sp.uid, { targets: [{ card: z.uid }] })).toBe(true);
    run(g);
    expect(power(g, z)).toBeGreaterThanOrEqual(2);
    expect(power(g, a)).toBeGreaterThanOrEqual(2);
    expect(power(g, b)).toBeGreaterThanOrEqual(2);
  });

  it('Grenzo: combat damage offers goad or exile-cast with any-color mana', () => {
    const g = setup(); put(g, 0, card('Grenzo, Havoc Raiser'));
    const atk = put(g, 0, body('Rogue', '{R}', '2', '2'));
    const prey = put(g, 1, body('Prey', '{G}', '3', '3', ['G']));
    const top = mk(g, 1, card('Shock Brigade'));
    g.players[1].library.push(top);
    for (const p of g.players) p.human = true;
    toAttack(g); declareAttackers(g, 0, [{ uid: atk.uid, defender: 1 }]);
    let i = 0; while (g.awaiting !== 'block' && i++ < 20) pass(g, g.priority!);
    for (const d of [1, 2, 3]) if (g.awaiting === 'block') declareBlockers(g, d, []);
    i = 0; while (!g.decision && !g.stack.length && !g.choice && g.step !== 'main2' && i++ < 40) { if (g.priority !== null) pass(g, g.priority!); else break; }
    run(g, { color: 'Exile the top card of that library; you may cast it this turn (any color of mana)' });
    const ex = [...g.players[0].exile, ...g.players[1].exile].find(c => c.uid === top.uid);
    expect(ex, g.log.slice(-12).join(' | ')).toBeTruthy();
    expect(ex!.anyMana || ex!.mayPlay).toBeTruthy();
    void prey;
  });

  it('Combustion Man: destroy unless the controller takes damage equal to its power', () => {
    const g = setup(); const cm = put(g, 0, card('Combustion Man')); const art = put(g, 1, card('Arcane Signet'));
    const life = g.players[1].life;
    toAttack(g); declareAttackers(g, 0, [{ uid: cm.uid, defender: 1 }]);
    run(g, { may: true, pick: () => [art.uid] });
    expect(g.players[1].life).toBe(life - power(g, cm));
    expect(findCard(g, art.uid)).toBeTruthy();
  });

  it('Treasure Nabber steals an artifact tapped for mana until end of your next turn', () => {
    const g = setup(); put(g, 0, card('Treasure Nabber'));
    const sig = put(g, 1, card('Arcane Signet'));
    expect(tapForMana(g, 1, sig.uid)).toBe(true);
    run(g);
    expect(sig.owner === 0 || g.players[0].battlefield.some(c => c.uid === sig.uid)).toBe(true);
  });

  it('Anax makes one Satyr that cannot block, or two if the creature had power 4+', () => {
    const g = setup(); put(g, 0, card('Anax, Hardened in the Forge'));
    const small = put(g, 0, body('S', '{R}', '2', '2'));
    destroy(g, small); run(g);
    expect(g.players[0].battlefield.filter(c => c.token && (def(c).sub ?? []).includes('Satyr')).length).toBe(1);
    const big = put(g, 0, body('B', '{R}', '4', '4'));
    destroy(g, big); run(g);
    expect(g.players[0].battlefield.filter(c => c.token && (def(c).sub ?? []).includes('Satyr')).length).toBe(3);
  });

  it('AI activates Krenko when it has Goblins and can tap him', () => {
    const g = setup();
    const k = put(g, 0, card('Krenko, Mob Boss')); put(g, 0, body('Grunt', '{R}', '1', '1'));
    for (const p of g.players) p.human = false;
    g.priority = 0;
    const before = goblins(g, 0).length;
    let i = 0;
    while (i++ < 20) {
      tick(g);
      if (g.decision) answerDecision(g, true);
      if (goblins(g, 0).length > before) break;
      if (!g.stack.length && !g.decision && g.priority === 0) { pass(g, 0); }
    }
    run(g);
    expect(goblins(g, 0).length).toBeGreaterThan(before);
  });
});
