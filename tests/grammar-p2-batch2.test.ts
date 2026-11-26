import { describe, it, expect } from 'vitest';
import { compileScry } from '../src/import/classify';
import type { ScryCard } from '../src/import/scryfall';
import {
  dealDamage, enter, declareBlockers, def, newGame, startGame, Game, Card, registerCards,
  activate, pass, answerDecision, declareAttackers, ctr, findCard, power, toughness,
  castSpell, checkState, destroy, isType, chooseTriggerTargets, offBfEff, flushTriggers,
  abilitiesOf, canActivate, layer, hasKw,
} from '../src/engine/engine';
import type { CardDef } from '../src/engine/types';
import '../src/engine/ai';

let n = 0;
function card(name: string, type_line: string, mana_cost: string, oracle_text: string, o: Partial<ScryCard> = {}): CardDef {
  const cl = compileScry({ name, type_line, mana_cost, oracle_text, colors: [], color_identity: [], keywords: [], ...o });
  const d = { ...cl.def, id: `p2b2-${++n}-${cl.def.id}` }; registerCards([d]);
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
function put(g: Game, pid: number, d: CardDef): Card { const c = mk(g, pid, d); g.players[pid].battlefield.push(c); layer(g); return c; }
interface RunOpt { pick?: (u: number[]) => number[]; may?: boolean; tgt?: () => object | (object | undefined)[]; color?: string }
function run(g: Game, o: RunOpt = {}) {
  for (const p of g.players) p.human = true; let i = 0;
  while ((g.stack.length || g.decision || g.choice || g.pending.length) && i++ < 400) {
    if (g.choice) { const t = o.tgt!(); expect(chooseTriggerTargets(g, (Array.isArray(t) ? t : [t]) as never)).toBe(true); continue; }
    const d = g.decision as { kind: string; cards?: Card[] } | null;
    if (d && d.kind === 'scry') { answerDecision(g, { top: (d.cards ?? []).map(c => c.uid), away: [] }); continue; }
    if (d) answerDecision(g, (d.kind === 'pick' ? (o.pick ?? (u => u.slice(0, 1)))((d.cards ?? []).map(c => c.uid)) : d.kind === 'may' ? !!o.may : d.kind === 'color' ? o.color ?? 'R' : d.kind === 'order' ? [] : false) as never);
    else { flushTriggers(g); if (!g.decision && !g.choice && g.priority != null) pass(g, g.priority); }
  }
}
const BEAR = () => card('P2B2 Bear', 'Creature — Bear', '{1}{G}', '', { power: '2', toughness: '2', colors: ['G'] });
const ELF = () => card('P2B2 Elf', 'Creature — Elf', '{G}', '', { power: '1', toughness: '1', colors: ['G'] });
const ROCK = () => card('P2B2 Rock', 'Artifact', '{2}', '');
const mana = (g: Game, pid: number, k = 16) => { g.players[pid].pool.push(...Array(k).fill('W|U|B|R|G')); };
function toAttack(g: Game) { let i = 0; while (g.awaiting !== 'attack' && i++ < 50) { if (g.decision) answerDecision(g, false); else pass(g, g.priority!); } }
function toBlock(g: Game) { let i = 0; while (g.awaiting !== 'block' && i++ < 30) { if (g.decision) answerDecision(g, false); else if (g.priority != null) pass(g, g.priority); else break; } }
function noBlocks(g: Game) { toBlock(g); for (const d of [1, 2, 3]) if (g.awaiting === 'block') declareBlockers(g, d, []); }

describe('P2 batch 2 trigger heads (engine)', () => {
  it('emits turnedFaceUp when a morph is turned face up', () => {
    const d = card('P2 Morpher', 'Creature — Shapeshifter', '{3}{U}', 'Morph {U}\nWhen P2 Morpher is turned face up, you draw a card.', { power: '2', toughness: '2', colors: ['U'] });
    const g = setup(); const c = put(g, 0, d); c.faceDown = true; layer(g);
    const before = g.players[0].hand.length;
    mana(g, 0);
    const i = abilitiesOf(g, c).findIndex(a => a.morphTurn);
    expect(i).toBeGreaterThanOrEqual(0);
    expect(canActivate(g, 0, c, i)).toBe(true);
    activate(g, 0, c.uid, i);
    expect(c.faceDown).toBeFalsy();
    run(g);
    expect(g.players[0].hand.length).toBe(before + 1);
  });

  it('fires when you scry, but not when you only surveil', () => {
    const d = card('P2 Scry Watch', 'Enchantment', '{W}', 'Whenever you scry, you gain 1 life.');
    const sc = card('P2 Scry One', 'Instant', '{U}', 'Scry 1.');
    const sv = card('P2 Surveil One', 'Instant', '{B}', 'Surveil 1.');
    const g = setup(); put(g, 0, d);
    g.players[0].life = 20;
    g.players[0].library.push(mk(g, 0, ROCK()), mk(g, 0, ROCK()), mk(g, 0, ROCK()));
    const c1 = mk(g, 0, sc); g.players[0].hand.push(c1); mana(g, 0);
    expect(castSpell(g, 0, c1.uid)).toBe(true); run(g);
    expect(g.players[0].life).toBe(21);
    const c2 = mk(g, 0, sv); g.players[0].hand.push(c2); mana(g, 0);
    expect(castSpell(g, 0, c2.uid)).toBe(true); run(g);
    expect(g.players[0].life).toBe(21);
  });

  it('fires when you commit a crime', () => {
    const d = card('P2 Crime Watch', 'Enchantment', '{B}', 'Whenever you commit a crime, you gain 1 life.');
    const zap = card('P2 Crime Zap', 'Instant', '{R}', 'P2 Crime Zap deals 1 damage to any target.');
    const g = setup(); put(g, 0, d);
    g.players[0].life = 20; g.players[1].life = 40;
    const c = mk(g, 0, zap); g.players[0].hand.push(c); mana(g, 0);
    expect(castSpell(g, 0, c.uid, { targets: [{ player: 1 }] } as never)).toBe(true);
    run(g);
    expect(g.players[1].life).toBe(39);
    expect(g.players[0].life).toBe(21);
  });

  it('fires when ~ exploits a creature', () => {
    const d = card('P2 Exploiter', 'Creature — Horror', '{3}{B}', 'Exploit\nWhen P2 Exploiter exploits a creature, you draw a card.', { power: '3', toughness: '3', colors: ['B'] });
    const g = setup(); const fodder = put(g, 0, BEAR());
    const before = g.players[0].hand.length;
    const c = mk(g, 0, d); enter(g, c, 0);
    run(g, { may: true, pick: () => [fodder.uid] });
    expect(g.players[0].battlefield.includes(fodder)).toBe(false);
    expect(g.players[0].hand.length).toBe(before + 1);
  });

  it('fires when ~ becomes monstrous', () => {
    const d = card('P2 Monster', 'Creature — Beast', '{2}{G}', '{2}: Monstrosity 1.\nWhen P2 Monster becomes monstrous, you draw a card.', { power: '3', toughness: '3', colors: ['G'] });
    const g = setup(); const c = put(g, 0, d);
    const before = g.players[0].hand.length;
    mana(g, 0);
    const i = abilitiesOf(g, c).findIndex(a => (a.effects ?? []).some(e => e.op === 'monstrosity'));
    expect(i).toBeGreaterThanOrEqual(0);
    activate(g, 0, c.uid, i);
    run(g);
    expect(c.monstrous).toBe(true);
    expect(ctr(c, '+1/+1')).toBe(1);
    expect(g.players[0].hand.length).toBe(before + 1);
  });

  it('fires when you cycle or discard a card (once per cycle)', () => {
    const d = card('P2 Cycle Watch', 'Enchantment', '{W}', 'Whenever you cycle or discard a card, you gain 1 life.');
    const cy = card('P2 Cycle Me', 'Instant', '{W}', 'Cycling {2}\nYou gain 1 life.');
    const g = setup(); put(g, 0, d);
    g.players[0].life = 20;
    const c = mk(g, 0, cy); g.players[0].hand.push(c); mana(g, 0);
    const i = abilitiesOf(g, c).findIndex(a => /Cycling/.test(a.label ?? ''));
    expect(i).toBeGreaterThanOrEqual(0);
    activate(g, 0, c.uid, i);
    run(g);
    expect(g.players[0].life).toBe(21);
  });

  it('~ attacks alone only when it is the sole attacker', () => {
    const d = card('P2 Solo', 'Creature — Knight', '{2}{W}', 'Whenever P2 Solo attacks alone, you draw a card.', { power: '2', toughness: '2', colors: ['W'] });
    const g = setup(); const a = put(g, 0, d); const buddy = put(g, 0, BEAR());
    const before = g.players[0].hand.length;
    toAttack(g); declareAttackers(g, 0, [{ uid: a.uid, defender: 1 }, { uid: buddy.uid, defender: 1 }]);
    noBlocks(g); run(g);
    expect(g.players[0].hand.length).toBe(before);
    const g2 = setup(); const a2 = put(g2, 0, d);
    const b2 = g2.players[0].hand.length;
    toAttack(g2); declareAttackers(g2, 0, [{ uid: a2.uid, defender: 1 }]);
    noBlocks(g2); run(g2);
    expect(g2.players[0].hand.length).toBe(b2 + 1);
  });

  it("fires when ~ attacks and isn't blocked, not when it is blocked", () => {
    const d = card('P2 Unblocked', 'Creature — Rogue', '{1}{B}', "Whenever P2 Unblocked attacks and isn't blocked, you draw a card.", { power: '2', toughness: '1', colors: ['B'] });
    const g = setup(); const a = put(g, 0, d); const bl = put(g, 1, BEAR());
    const before = g.players[0].hand.length;
    toAttack(g); declareAttackers(g, 0, [{ uid: a.uid, defender: 1 }]);
    toBlock(g); declareBlockers(g, 1, [{ blocker: bl.uid, attacker: a.uid }]);
    for (const dpid of [2, 3]) if (g.awaiting === 'block') declareBlockers(g, dpid, []);
    run(g);
    expect(g.players[0].hand.length).toBe(before);
    const g2 = setup(); const a2 = put(g2, 0, d);
    const b2 = g2.players[0].hand.length;
    toAttack(g2); declareAttackers(g2, 0, [{ uid: a2.uid, defender: 1 }]);
    noBlocks(g2); run(g2);
    expect(g2.players[0].hand.length).toBe(b2 + 1);
  });

  it('fires when ~ blocks or becomes blocked', () => {
    const d = card('P2 Brawler', 'Creature — Warrior', '{1}{R}', 'Whenever P2 Brawler blocks or becomes blocked by a creature, you gain 1 life.', { power: '2', toughness: '2', colors: ['R'] });
    const g = setup(); const a = put(g, 0, d); const bl = put(g, 1, BEAR());
    g.players[0].life = 20;
    toAttack(g); declareAttackers(g, 0, [{ uid: a.uid, defender: 1 }]);
    toBlock(g); declareBlockers(g, 1, [{ blocker: bl.uid, attacker: a.uid }]);
    for (const dpid of [2, 3]) if (g.awaiting === 'block') declareBlockers(g, dpid, []);
    run(g);
    expect(g.players[0].life).toBe(21);
  });

  it('fires when a creature dealt damage by ~ this turn dies', () => {
    const d = card('P2 Hunter', 'Creature — Assassin', '{2}{B}', 'Whenever a creature dealt damage by P2 Hunter this turn dies, you draw a card.', { power: '2', toughness: '2', colors: ['B'] });
    const g = setup(); const h = put(g, 0, d); const prey = put(g, 1, BEAR());
    const before = g.players[0].hand.length;
    dealDamage(g, h.id, h, { card: prey }, 1);
    destroy(g, prey);
    run(g);
    expect(g.players[0].hand.length).toBe(before + 1);
  });
});

describe('P2 batch 2 verb bodies (engine)', () => {
  it('counts only permanents actually destroyed this way, and ignores indestructible', () => {
    const d = card('P2 Purge', 'Sorcery', '{4}{W}', 'Destroy all creatures. You gain 1 life for each creature destroyed this way.');
    const g = setup();
    put(g, 0, BEAR()); put(g, 1, BEAR());
    const indie = card('P2 Indie', 'Creature — Angel', '{3}{W}', 'Indestructible', { power: '3', toughness: '3', colors: ['W'], keywords: ['Indestructible'] });
    put(g, 1, indie);
    g.players[0].life = 20;
    const c = mk(g, 0, d); g.players[0].hand.push(c); mana(g, 0);
    expect(castSpell(g, 0, c.uid)).toBe(true);
    run(g);
    expect(g.players[0].life).toBe(22);
    expect(g.players[0].battlefield.filter(x => isType(x, 'Creature')).length).toBe(0);
    expect(g.players[1].battlefield.some(x => def(x).name === 'P2 Indie')).toBe(true);
  });

  it('gains life equal to that creature’s toughness, then destroys it', () => {
    const d = card('P2 Feast', 'Sorcery', '{1}{B}', "Destroy target creature. You gain life equal to that creature's toughness.");
    const g = setup(); const prey = put(g, 1, BEAR());
    g.players[0].life = 20;
    const c = mk(g, 0, d); g.players[0].hand.push(c); mana(g, 0);
    expect(castSpell(g, 0, c.uid, { targets: [{ card: prey.uid }] } as never)).toBe(true);
    run(g);
    expect(g.players[0].life).toBe(22);
    expect(g.players[1].battlefield.includes(prey)).toBe(false);
  });

  it('loses half life, rounded up', () => {
    const d = card('P2 Half', 'Sorcery', '{B}', 'You lose half your life, rounded up.');
    const g = setup(); g.players[0].life = 15;
    const c = mk(g, 0, d); g.players[0].hand.push(c); mana(g, 0);
    expect(castSpell(g, 0, c.uid)).toBe(true);
    run(g);
    expect(g.players[0].life).toBe(7);
  });

  it('support N puts one +1/+1 counter on each of up to N target creatures', () => {
    const d = card('P2 Support', 'Sorcery', '{2}{G}', 'Support 2.');
    const g = setup(); const a = put(g, 0, BEAR()); const b = put(g, 1, ELF());
    const c = mk(g, 0, d); g.players[0].hand.push(c); mana(g, 0);
    expect(castSpell(g, 0, c.uid, { targets: [{ card: a.uid }, { card: b.uid }] } as never)).toBe(true);
    run(g);
    expect(ctr(a, '+1/+1')).toBe(1);
    expect(ctr(b, '+1/+1')).toBe(1);
    expect(power(g, a)).toBe(3);
  });

  it('incubate N creates an Incubator with N +1/+1 counters', () => {
    const d = card('P2 Incubate', 'Sorcery', '{2}{W}', 'Incubate 3.');
    const g = setup();
    const c = mk(g, 0, d); g.players[0].hand.push(c); mana(g, 0);
    expect(castSpell(g, 0, c.uid)).toBe(true);
    run(g);
    const tok = g.players[0].battlefield.find(x => def(x).name === 'Incubator');
    expect(tok).toBeTruthy();
    expect(ctr(tok!, '+1/+1')).toBe(3);
    expect(isType(tok!, 'Creature')).toBe(false);
  });

  it('bolster N puts counters on a creature you control with least toughness', () => {
    const d = card('P2 Bolster', 'Sorcery', '{2}{W}', 'Bolster 2.');
    const g = setup(); const small = put(g, 0, ELF()); const big = put(g, 0, BEAR());
    const c = mk(g, 0, d); g.players[0].hand.push(c); mana(g, 0);
    expect(castSpell(g, 0, c.uid)).toBe(true);
    run(g);
    expect(ctr(small, '+1/+1')).toBe(2);
    expect(ctr(big, '+1/+1')).toBe(0);
    expect(toughness(g, small)).toBe(3);
  });

  it('manifest dread manifests one of the top two and mills the other', () => {
    const d = card('P2 Dread', 'Sorcery', '{1}{G}', 'Manifest dread.');
    const g = setup();
    const keep = mk(g, 0, BEAR()); const mill = mk(g, 0, ROCK());
    g.players[0].library.push(mill, keep); // keep is top
    const c = mk(g, 0, d); g.players[0].hand.push(c); mana(g, 0);
    expect(castSpell(g, 0, c.uid)).toBe(true);
    run(g, { pick: uids => uids.filter(u => u === keep.uid).slice(0, 1) });
    expect(g.players[0].graveyard.some(x => x.uid === mill.uid)).toBe(true);
    const face = g.players[0].battlefield.find(x => x.uid === keep.uid);
    expect(face).toBeTruthy();
    expect(face!.faceDown).toBe(true);
    expect(face!.manifest).toBe(true);
    expect(power(g, face!)).toBe(2);
    expect(toughness(g, face!)).toBe(2);
  });

  it('copy-except grants the named keyword', () => {
    const d = card('P2 Clone', 'Sorcery', '{3}{U}', "Create a token that's a copy of target creature, except it has menace.");
    const g = setup(); const src = put(g, 1, BEAR());
    const c = mk(g, 0, d); g.players[0].hand.push(c); mana(g, 0);
    expect(castSpell(g, 0, c.uid, { targets: [{ card: src.uid }] } as never)).toBe(true);
    run(g);
    const tok = g.players[0].battlefield.find(x => x.token);
    expect(tok).toBeTruthy();
    expect(hasKw(tok!, 'menace')).toBe(true);
  });

  it('taps target creature defending player controls when attacking', () => {
    const d = card('P2 Wasp', 'Creature — Insect', '{1}{W}', 'Whenever P2 Wasp attacks, tap target creature defending player controls.', { power: '2', toughness: '1', colors: ['W'] });
    const g = setup(); const a = put(g, 0, d); const defc = put(g, 1, BEAR()); const other = put(g, 2, ELF());
    toAttack(g); declareAttackers(g, 0, [{ uid: a.uid, defender: 1 }]);
    run(g, { tgt: () => ({ card: defc.uid }) });
    noBlocks(g); run(g);
    expect(defc.tapped).toBe(true);
    expect(other.tapped).toBeFalsy();
  });

  it('draws a card for each Elf you control (typal amount)', () => {
    const d = card('P2 Elven Gift', 'Sorcery', '{1}{G}', 'Draw a card for each Elf you control.');
    const g = setup(); put(g, 0, ELF()); put(g, 0, ELF()); put(g, 0, BEAR());
    const before = g.players[0].hand.length;
    const c = mk(g, 0, d); g.players[0].hand.push(c); mana(g, 0);
    expect(castSpell(g, 0, c.uid)).toBe(true);
    run(g);
    expect(g.players[0].hand.length).toBe(before + 2);
  });

  it('counts creatures defending player controls for an attack trigger', () => {
    const d = card('P2 Scout', 'Creature — Scout', '{1}{W}', 'Whenever P2 Scout attacks, you draw a card for each creature defending player controls.', { power: '1', toughness: '1', colors: ['W'] });
    const g = setup(); const a = put(g, 0, d);
    put(g, 1, BEAR()); put(g, 1, ELF()); put(g, 2, BEAR());
    const before = g.players[0].hand.length;
    toAttack(g); declareAttackers(g, 0, [{ uid: a.uid, defender: 1 }]);
    noBlocks(g); run(g);
    expect(g.players[0].hand.length).toBe(before + 2);
  });
});
