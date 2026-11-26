import { describe, it, expect } from 'vitest';
import { compileScry } from '../src/import/classify';
import { effects, newCx } from '../src/engine/oracle';
import type { ScryCard } from '../src/import/scryfall';
import {
  newGame, startGame, Game, Card, registerCards, pass, answerDecision,
  castSpell, canCast, destroy, offBfEff, flushTriggers, layer, enter,
  declareAttackers, declareBlockers, power, toughness, hasKw, def, findCard,
} from '../src/engine/engine';
import type { CardDef } from '../src/engine/types';
import '../src/engine/ai';

let n = 0;
function card(name: string, type_line: string, mana_cost: string, oracle_text: string, o: Partial<ScryCard> = {}): CardDef {
  const cl = compileScry({ name, type_line, mana_cost, oracle_text, colors: [], color_identity: [], keywords: [], ...o });
  const d = { ...cl.def, id: `p3f2-${++n}-${cl.def.id}` }; registerCards([d]);
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
interface RunOpt { pick?: (u: number[]) => number[]; may?: boolean }
function run(g: Game, o: RunOpt = {}) {
  for (const p of g.players) p.human = true; let i = 0;
  while ((g.stack.length || g.decision || g.choice || g.pending.length) && i++ < 400) {
    if (g.choice) continue;
    const d = g.decision as { kind: string; cards?: Card[] } | null;
    if (d && d.kind === 'scry') { answerDecision(g, { top: (d.cards ?? []).map(c => c.uid), away: [] }); continue; }
    if (d) answerDecision(g, (d.kind === 'pick' ? (o.pick ?? (u => u.slice(0, 1)))((d.cards ?? []).map(c => c.uid)) : d.kind === 'may' ? !!o.may : false) as never);
    else { flushTriggers(g); if (!g.decision && !g.choice && g.priority != null) pass(g, g.priority); }
  }
}
const BEAR = () => card('P3F2 Bear', 'Creature — Bear', '{1}{G}', '', { power: '2', toughness: '2', colors: ['G'] });
const MOUNTAIN = () => card('Mountain', 'Basic Land — Mountain', '', '({T}: Add {R}.)');
const PLAINS = () => card('Plains', 'Basic Land — Plains', '', '({T}: Add {W}.)');
const ISLAND = () => card('Island', 'Basic Land — Island', '', '({T}: Add {U}.)');
const mana = (g: Game, pid: number, k = 16) => { g.players[pid].pool.push(...Array(k).fill('W|U|B|R|G')); };

describe('P3 frames: alt costs', () => {
  it('parses sacrifice-N and WUBRG alternative costs', () => {
    const fb = card('P3F2 Fireblast', 'Instant', '{4}{R}', "You may sacrifice two Mountains rather than pay this spell's mana cost.\nP3F2 Fireblast deals 4 damage to any target.");
    expect(fb.altCost?.sacF).toMatchObject({ n: 2 });
    const br = card('P3F2 Bringer', 'Creature — Bringer', '{7}{R}{R}', "You may pay {W}{U}{B}{R}{G} rather than pay this spell's mana cost.\nTrample", { power: '5', toughness: '5' });
    expect(br.altCost?.mana).toMatchObject({ W: 1, U: 1, B: 1, R: 1, G: 1 });
  });

  it('casts Fireblast by sacrificing two Mountains and deals 4', () => {
    const d = card('P3F2 Blast', 'Instant', '{4}{R}', "You may sacrifice two Mountains rather than pay this spell's mana cost.\nP3F2 Blast deals 4 damage to any target.");
    const g = setup();
    const m1 = put(g, 0, MOUNTAIN()); const m2 = put(g, 0, MOUNTAIN());
    const prey = put(g, 1, BEAR());
    const c = mk(g, 0, d); g.players[0].hand.push(c);
    expect(canCast(g, 0, c, { useAlt: true })).toBe(true);
    expect(castSpell(g, 0, c.uid, { useAlt: true, targets: [{ card: prey.uid }] } as never)).toBe(true);
    run(g);
    expect(findCard(g, m1.uid)).toBeFalsy();
    expect(findCard(g, m2.uid)).toBeFalsy();
    expect(findCard(g, prey.uid)).toBeFalsy();
  });

  it('pays {1} and returns a basic land for a Borderpost-style alt cost', () => {
    const d = card('P3F2 Post', 'Artifact', '{1}{U}{B}', "You may pay {1} and return a basic land you control to its owner's hand rather than pay this spell's mana cost.\nP3F2 Post enters tapped.");
    const g = setup();
    const land = put(g, 0, ISLAND());
    const c = mk(g, 0, d); g.players[0].hand.push(c);
    g.players[0].pool = ['C'];
    expect(castSpell(g, 0, c.uid, { useAlt: true })).toBe(true);
    run(g);
    expect(g.players[0].hand.some(x => x.uid === land.uid)).toBe(true);
    expect(g.players[0].battlefield.some(x => x.id === d.id && x.tapped)).toBe(true);
  });

  it('taps a creature as an alt cost only if you control a Plains', () => {
    const d = card('P3F2 Rally', 'Instant', '{1}{W}', "If you control a Plains, you may tap an untapped creature you control rather than pay this spell's mana cost.\nYou draw a card.");
    const g = setup();
    const cr = put(g, 0, BEAR());
    g.players[0].library.push(mk(g, 0, BEAR()));
    const c = mk(g, 0, d); g.players[0].hand.push(c);
    expect(canCast(g, 0, c, { useAlt: true })).toBe(false);
    put(g, 0, PLAINS());
    expect(canCast(g, 0, c, { useAlt: true })).toBe(true);
    const before = g.players[0].hand.length - 1;
    expect(castSpell(g, 0, c.uid, { useAlt: true })).toBe(true); run(g);
    expect(cr.tapped).toBe(true);
    expect(g.players[0].hand.length).toBe(before + 1);
  });

  it('parses exile-a-color-card-from-hand as exileAlt', () => {
    const d = card('P3F2 ExileAlt', 'Instant', '{5}{U}{U}', "You may exile two blue cards from your hand rather than pay this spell's mana cost.\nYou draw a card.");
    expect(d.exileAlt).toMatchObject({ n: 2, color: 'U' });
  });
});

describe('P3 frames: unless you / unless cond', () => {
  it('parses sacrifice unless you discard, and does not sacrifice if you do', () => {
    expect(effects('sacrifice ~ unless you discard a card', newCx())?.[0].op).toBe('unlessAct');
    const d = card('P3F2 Mast', 'Artifact Creature — Masticore', '{4}', 'When P3F2 Mast enters, sacrifice it unless you discard a card.', { power: '4', toughness: '4' });
    const g = setup();
    const disc = mk(g, 0, BEAR()); g.players[0].hand.push(disc);
    const c = mk(g, 0, d); enter(g, c, 0); run(g, { may: true });
    expect(g.players[0].battlefield.includes(c)).toBe(true);
    expect(g.players[0].hand.includes(disc)).toBe(false);
  });

  it('sacrifices if you decline to discard', () => {
    const d = card('P3F2 Mast2', 'Artifact Creature — Masticore', '{4}', 'When P3F2 Mast2 enters, sacrifice it unless you discard a card.', { power: '4', toughness: '4' });
    const g = setup();
    g.players[0].hand.push(mk(g, 0, BEAR()));
    const c = mk(g, 0, d); enter(g, c, 0); run(g, { may: false });
    expect(g.players[0].battlefield.includes(c)).toBe(false);
  });

  it('parses sacrifice unless it escaped', () => {
    const fx = effects('sacrifice it unless it escaped', newCx());
    expect(fx?.[0].op).toBe('if');
    expect((fx?.[0].cond as { k: string; c?: { k: string } })?.c?.k).toBe('escaped');
  });
});

describe('P3 frames: CDAs / base PT', () => {
  it('Frogify-style aura sets 1/1 blue Frog and strips abilities', () => {
    const aura = card('P3F2 Frogify', 'Enchantment — Aura', '{1}{U}', 'Enchant creature\nEnchanted creature loses all abilities and is a blue Frog creature with base power and toughness 1/1.');
    const flyer = card('P3F2 Bird', 'Creature — Bird', '{U}', 'Flying', { power: '3', toughness: '3', colors: ['U'], keywords: ['Flying'] });
    const g = setup();
    const t = put(g, 1, flyer);
    const a = mk(g, 0, aura); g.players[0].hand.push(a); mana(g, 0);
    expect(castSpell(g, 0, a.uid, { targets: [{ card: t.uid }] } as never)).toBe(true); run(g); layer(g);
    expect(power(g, t)).toBe(1);
    expect(toughness(g, t)).toBe(1);
    expect(hasKw(t, 'flying')).toBe(false);
    expect(def(t).sub).toEqual(['Frog']);
    expect(def(t).colors).toEqual(['U']);
  });
});

describe('P3 frames: can\'t attack or block alone', () => {
  it('refuses a lone attacker and allows attacking with a partner', () => {
    const d = card('P3F2 Flunkies', 'Creature — Goblin', '{1}{R}', "P3F2 Flunkies can't attack or block alone.", { power: '3', toughness: '3' });
    const g = setup();
    const f = put(g, 0, d); const pal = put(g, 0, BEAR());
    f.sick = false; pal.sick = false;
    g.step = 'attackers'; g.awaiting = 'attack'; g.active = 0; g.priority = 0;
    expect(declareAttackers(g, 0, [{ uid: f.uid, defender: 1 }])).toBe(false);
    g.step = 'attackers'; g.awaiting = 'attack';
    expect(declareAttackers(g, 0, [{ uid: f.uid, defender: 1 }, { uid: pal.uid, defender: 1 }])).toBe(true);
    expect(f.attacking).toBe(1);
  });
});

describe('P3 frames: for-each died this turn', () => {
  it('costs {1} less to cast for each creature that died this turn', () => {
    const d = card('P3F2 Rebirth', 'Sorcery', '{3}{B}', 'This spell costs {1} less to cast for each creature that died this turn.\nYou draw a card.');
    expect(d.selfCostLess).toMatchObject({ n: 1, per: { died: true } });
    const g = setup();
    destroy(g, put(g, 1, BEAR()));
    destroy(g, put(g, 0, BEAR()));
    g.players[0].library.push(mk(g, 0, BEAR()));
    const c = mk(g, 0, d); g.players[0].hand.push(c);
    g.players[0].pool = ['B', 'B']; // generic reduced from 3 to 1
    expect(castSpell(g, 0, c.uid)).toBe(true); run(g);
    expect(g.players[0].hand.length).toBe(1);
  });
});
