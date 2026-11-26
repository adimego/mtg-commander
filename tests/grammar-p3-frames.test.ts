import { describe, it, expect } from 'vitest';
import { compileScry } from '../src/import/classify';
import { cond, effects, newCx } from '../src/engine/oracle';
import type { ScryCard } from '../src/import/scryfall';
import {
  newGame, startGame, Game, Card, registerCards, pass, answerDecision,
  castSpell, destroy, offBfEff, flushTriggers, layer, loseLife, enter,
} from '../src/engine/engine';
import type { CardDef } from '../src/engine/types';
import '../src/engine/ai';

const sc = (over: Partial<ScryCard> & Pick<ScryCard, 'name' | 'type_line' | 'oracle_text'>): ScryCard => ({
  color_identity: over.color_identity ?? ['B'], keywords: over.keywords ?? [], colors: over.colors ?? ['B'],
  mana_cost: over.mana_cost ?? '{1}{B}', ...over,
});

let n = 0;
function card(name: string, type_line: string, mana_cost: string, oracle_text: string, o: Partial<ScryCard> = {}): CardDef {
  const cl = compileScry({ name, type_line, mana_cost, oracle_text, colors: [], color_identity: [], keywords: [], ...o });
  const d = { ...cl.def, id: `p3f-${++n}-${cl.def.id}` }; registerCards([d]);
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
interface RunOpt { pick?: (u: number[]) => number[]; may?: boolean; tgt?: () => object | (object | undefined)[] }
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
const BEAR = () => card('P3F Bear', 'Creature — Bear', '{1}{G}', '', { power: '2', toughness: '2', colors: ['G'] });
const CLERIC = () => card('P3F Cleric', 'Creature — Human Cleric', '{W}', '', { power: '1', toughness: '1', colors: ['W'] });
const ROGUE = () => card('P3F Rogue', 'Creature — Human Rogue', '{B}', '', { power: '1', toughness: '1', colors: ['B'] });
const WARRIOR = () => card('P3F Warrior', 'Creature — Human Warrior', '{R}', '', { power: '1', toughness: '1', colors: ['R'] });
const WIZARD = () => card('P3F Wizard', 'Creature — Human Wizard', '{U}', '', { power: '1', toughness: '1', colors: ['U'] });
const mana = (g: Game, pid: number, k = 16) => { g.players[pid].pool.push(...Array(k).fill('W|U|B|R|G')); };

describe('P3 compose frames: conditions', () => {
  it('parses wording aliases onto existing or new conds', () => {
    const cx = newCx();
    expect(cond('it was bargained', cx)?.k).toBe('bargained');
    expect(cond("it's the first combat phase of the turn", cx)?.k).toBe('firstCombat');
    expect(cond('you cast it', cx)?.k).toBe('wasCast');
    expect(cond('you cast it from your hand', cx)?.k).toBe('castFromHand');
    expect(cond('~ is an enchantment', cx)).toMatchObject({ k: 'srcType', f: { types: ['Enchantment'] } });
    expect(cond('~ is in your graveyard', cx)?.k).toBe('srcZone');
    expect(cond('an opponent lost life this turn', cx)?.k).toBe('oppLostLife');
    expect(cond('a creature died under your control this turn', cx)?.k).toBe('diedYou');
    expect(cond('no creatures are on the battlefield', cx)?.k).toBe('noCreatures');
    expect(cond('that player has one or fewer cards in hand', cx)).toMatchObject({ k: 'evHandLE', n: 1 });
    expect(cond('you have a full party', cx)?.k).toBe('fullParty');
    expect(cond('at least four mana was spent to cast it', cx)).toMatchObject({ k: 'spentGE', n: 4 });
    expect(cond('you control a desert or there is a desert card in your graveyard', cx)?.k).toBe('or');
  });

  it('fails closed on an unknown if-condition and does not keep the verb', () => {
    expect(effects('if the moon is made of cheese, you draw a card', newCx())).toBeNull();
  });

  it('ETB "if you cast it" only fires when the permanent was actually cast', () => {
    const d = card('P3F Cast It', 'Creature — Spirit', '{2}{W}', 'When P3F Cast It enters, if you cast it, you draw a card.', { power: '2', toughness: '2', colors: ['W'] });
    const g = setup();
    // put onto the battlefield without casting: trigger condition fails
    const before = g.players[0].hand.length;
    const c0 = mk(g, 0, d); enter(g, c0, 0); run(g);
    expect(g.players[0].hand.length).toBe(before);
    // cast it
    const g2 = setup();
    g2.players[0].library.push(mk(g2, 0, BEAR()), mk(g2, 0, BEAR()));
    const c = mk(g2, 0, d); g2.players[0].hand.push(c); mana(g2, 0);
    const b2 = g2.players[0].hand.length - 1;
    expect(castSpell(g2, 0, c.uid)).toBe(true); run(g2);
    expect(g2.players[0].hand.length).toBe(b2 + 1);
  });

  it('full party is four party creature types you control', () => {
    const d = card('P3F Party Spell', 'Sorcery', '{W}', 'If you have a full party, you draw a card.');
    const g = setup();
    put(g, 0, CLERIC()); put(g, 0, ROGUE()); put(g, 0, WARRIOR());
    g.players[0].library.push(mk(g, 0, BEAR()));
    const c = mk(g, 0, d); g.players[0].hand.push(c); mana(g, 0);
    const before = g.players[0].hand.length - 1;
    expect(castSpell(g, 0, c.uid)).toBe(true); run(g);
    expect(g.players[0].hand.length).toBe(before); // not yet a full party
    const g2 = setup();
    put(g2, 0, CLERIC()); put(g2, 0, ROGUE()); put(g2, 0, WARRIOR()); put(g2, 0, WIZARD());
    g2.players[0].library.push(mk(g2, 0, BEAR()));
    const c2 = mk(g2, 0, d); g2.players[0].hand.push(c2); mana(g2, 0);
    const b2 = g2.players[0].hand.length - 1;
    expect(castSpell(g2, 0, c2.uid)).toBe(true); run(g2);
    expect(g2.players[0].hand.length).toBe(b2 + 1);
  });

  it('died under your control this turn does not count an opponent’s creature', () => {
    const d = card('P3F Died You', 'Instant', '{B}', 'If a creature died under your control this turn, you draw a card.');
    const g = setup();
    const mine = put(g, 1, BEAR()); // opponent's
    destroy(g, mine);
    g.players[0].library.push(mk(g, 0, BEAR()));
    const c = mk(g, 0, d); g.players[0].hand.push(c); mana(g, 0);
    const before = g.players[0].hand.length - 1;
    expect(castSpell(g, 0, c.uid)).toBe(true); run(g);
    expect(g.players[0].hand.length).toBe(before);
    const g2 = setup();
    const my = put(g2, 0, BEAR());
    destroy(g2, my);
    g2.players[0].library.push(mk(g2, 0, BEAR()));
    const c2 = mk(g2, 0, d); g2.players[0].hand.push(c2); mana(g2, 0);
    const b2 = g2.players[0].hand.length - 1;
    expect(castSpell(g2, 0, c2.uid)).toBe(true); run(g2);
    expect(g2.players[0].hand.length).toBe(b2 + 1);
  });
});

describe('P3 compose frames: if you do', () => {
  it('parses "destroy target creature. if you do, you gain 2 life"', () => {
    const fx = effects('destroy target creature. if you do, you gain 2 life', newCx({ spell: true }));
    expect(fx?.[0].op).toBe('ifDid');
    expect(fx?.[0].sub?.[0]).toMatchObject({ op: 'destroy', who: 't0' });
  });

  it('fails closed when the first verb cannot be detected as having been done (tap)', () => {
    expect(effects('tap target creature. if you do, you draw a card', newCx({ spell: true }))).toBeNull();
  });

  it('gains life only if the creature is actually destroyed', () => {
    const d = card('P3F If You Do', 'Sorcery', '{1}{B}', 'Destroy target creature. If you do, you gain 2 life.');
    const g = setup(); const prey = put(g, 1, BEAR());
    g.players[0].life = 20;
    const c = mk(g, 0, d); g.players[0].hand.push(c); mana(g, 0);
    expect(castSpell(g, 0, c.uid, { targets: [{ card: prey.uid }] } as never)).toBe(true); run(g);
    expect(g.players[1].battlefield.includes(prey)).toBe(false);
    expect(g.players[0].life).toBe(22);
    const indie = card('P3F Indie', 'Creature — Angel', '{3}{W}', 'Indestructible', { power: '3', toughness: '3', colors: ['W'], keywords: ['Indestructible'] });
    const g2 = setup(); const tank = put(g2, 1, indie);
    g2.players[0].life = 20;
    const c2 = mk(g2, 0, d); g2.players[0].hand.push(c2); mana(g2, 0);
    expect(castSpell(g2, 0, c2.uid, { targets: [{ card: tank.uid }] } as never)).toBe(true); run(g2);
    expect(g2.players[1].battlefield.includes(tank)).toBe(true);
    expect(g2.players[0].life).toBe(20);
  });
});

describe('P3 compose frames: additional costs', () => {
  it('parses "as an additional cost to cast ~, discard x cards" and discards that many', () => {
    const d = card('P3F Firestorm', 'Instant', '{R}', 'As an additional cost to cast this spell, discard X cards.\nP3F Firestorm deals X damage to any target.');
    expect(d.extraCost?.discardX).toBe(true);
    const g = setup();
    const a = mk(g, 0, BEAR()); const b = mk(g, 0, BEAR()); const c = mk(g, 0, BEAR());
    g.players[0].hand.push(a, b, c);
    const sp = mk(g, 0, d); g.players[0].hand.push(sp); mana(g, 0);
    const prey = put(g, 1, BEAR());
    expect(castSpell(g, 0, sp.uid, { x: 2, targets: [{ card: prey.uid }] } as never)).toBe(true); run(g);
    expect(g.players[0].hand.length).toBe(1); // one bear kept
    expect(g.players[1].battlefield.includes(prey)).toBe(false);
  });
});

describe('P3 compose frames: opponent lost life / no creatures', () => {
  it('an opponent lost life this turn', () => {
    const d = card('P3F Blood', 'Sorcery', '{B}', 'If an opponent lost life this turn, you draw a card.');
    const g = setup();
    g.players[0].library.push(mk(g, 0, BEAR()));
    const c = mk(g, 0, d); g.players[0].hand.push(c); mana(g, 0);
    const before = g.players[0].hand.length - 1;
    expect(castSpell(g, 0, c.uid)).toBe(true); run(g);
    expect(g.players[0].hand.length).toBe(before);
    const g2 = setup();
    loseLife(g2, 1, 1);
    g2.players[0].library.push(mk(g2, 0, BEAR()));
    const c2 = mk(g2, 0, d); g2.players[0].hand.push(c2); mana(g2, 0);
    const b2 = g2.players[0].hand.length - 1;
    expect(castSpell(g2, 0, c2.uid)).toBe(true); run(g2);
    expect(g2.players[0].hand.length).toBe(b2 + 1);
  });
});

describe('P3 compose frames: for-each / costs-less', () => {
  it('costs {1} less to cast for each creature in your party', () => {
    const d = card('P3F Rally', 'Sorcery', '{5}{W}', 'This spell costs {1} less to cast for each creature in your party.\nYou draw a card.');
    expect(d.selfCostLess).toMatchObject({ n: 1, per: { party: true } });
    const g = setup();
    put(g, 0, CLERIC()); put(g, 0, ROGUE()); put(g, 0, WARRIOR()); put(g, 0, WIZARD());
    g.players[0].library.push(mk(g, 0, BEAR()));
    const c = mk(g, 0, d); g.players[0].hand.push(c);
    g.players[0].pool = ['W', 'W']; // generic reduced from 5 to 1
    expect(castSpell(g, 0, c.uid)).toBe(true); run(g);
    expect(g.players[0].hand.length).toBe(1);
  });
});
