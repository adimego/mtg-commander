import { describe, it, expect } from 'vitest';
import { compileScry } from '../src/import/classify';
import type { ScryCard } from '../src/import/scryfall';
import {
  newGame, startGame, Game, Card, registerCards, pass, answerDecision,
  destroy, offBfEff, flushTriggers, layer, enter, createToken, dealDamage,
  addCounters, gainLife, draw, moveCard, checkState, castSpell,
} from '../src/engine/engine';
import type { CardDef } from '../src/engine/types';
import '../src/engine/ai';

const sc = (over: Partial<ScryCard> & Pick<ScryCard, 'name' | 'type_line' | 'oracle_text'>): ScryCard => ({
  color_identity: over.color_identity ?? [], keywords: over.keywords ?? [], colors: over.colors ?? [],
  mana_cost: over.mana_cost ?? '', ...over,
});

let n = 0;
function card(name: string, type_line: string, mana_cost: string, oracle_text: string, o: Partial<ScryCard> = {}): CardDef {
  const cl = compileScry({ name, type_line, mana_cost, oracle_text, colors: [], color_identity: [], keywords: [], ...o });
  const d = { ...cl.def, id: `p4r-${++n}-${cl.def.id}` }; registerCards([d]);
  expect(cl.support, JSON.stringify({ name, unparsed: cl.unparsed, replacements: cl.def.replacements, statics: cl.def.statics?.map(s => s.k) })).toBe('auto');
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
function put(g: Game, pid: number, d: CardDef): Card { const c = mk(g, 0, d); c.owner = pid; g.players[pid].battlefield.push(c); layer(g); return c; }

const BEAR = () => card('P4R Bear', 'Creature — Bear', '{1}{G}', '', { power: '2', toughness: '2', colors: ['G'] });
const SPIRIT_BACK = 'If P4R Phantom would be put into a graveyard from anywhere, exile it instead.';

describe('P4 replacement effects', () => {
  it('parses self “from anywhere, exile instead” and applies it on death', () => {
    const d = card('P4R Phantom', 'Creature — Spirit', '{1}{W}', SPIRIT_BACK, { power: '1', toughness: '1', colors: ['W'] });
    expect(d.replacements?.[0]).toMatchObject({ ev: 'toGy', self: true, instead: { k: 'exile' } });
    const g = setup();
    const c = put(g, 0, d);
    destroy(g, c);
    expect(g.players[0].battlefield).not.toContain(c);
    expect(g.players[0].graveyard).not.toContain(c);
    expect(g.players[0].exile).toContain(c);
  });

  it('shuffles a self-replacement into the library (616.1a beats a general exile-from-anywhere)', () => {
    const col = card('P4R Colossus', 'Artifact Creature — Golem', '{11}', "If P4R Colossus would be put into a graveyard from anywhere, reveal P4R Colossus and shuffle it into its owner's library instead.", { power: '11', toughness: '11' });
    const rip = card('P4R Rest', 'Enchantment', '{1}{W}', 'If a card or token would be put into a graveyard from anywhere, exile it instead.');
    const g = setup();
    const c = put(g, 0, col);
    put(g, 0, rip);
    // Self-replacement must apply first (616.1a), after which the event is no longer “to graveyard”.
    destroy(g, c);
    expect(g.players[0].exile).not.toContain(c);
    expect(g.players[0].graveyard).not.toContain(c);
    expect(g.players[0].library).toContain(c);
  });

  it('exiles an opponent’s creature that would die', () => {
    const st = card('P4R Stone', 'Legendary Artifact', '{1}', 'If a creature an opponent controls would die, exile it instead.');
    const g = setup();
    put(g, 0, st);
    const bear = put(g, 1, BEAR());
    destroy(g, bear);
    expect(g.players[1].graveyard).not.toContain(bear);
    expect(g.players[1].exile).toContain(bear);
  });

  it('doubles tokens from the “if an effect would create” wording', () => {
    const ap = card('P4R Procession', 'Enchantment', '{3}{W}', 'If an effect would create one or more tokens under your control, it creates twice that many of those tokens instead.');
    expect(ap.statics?.some(s => s.k === 'tokenDouble') || ap.replacements?.some(r => r.ev === 'token')).toBe(true);
    const g = setup();
    put(g, 0, ap);
    const make = card('P4R Make Soldier', 'Sorcery', '{W}', 'Create a 1/1 white Soldier creature token.', { colors: ['W'] });
    const spell = mk(g, 0, make);
    g.players[0].hand.push(spell);
    g.players[0].pool.push('W');
    expect(castSpell(g, 0, spell.uid, {})).toBe(true);
    let i = 0;
    while ((g.stack.length || g.decision || g.pending.length) && i++ < 80) {
      if (g.decision) answerDecision(g, false);
      else if (g.priority != null) pass(g, g.priority);
      else flushTriggers(g);
    }
    const soldiers = g.players[0].battlefield.filter(c => c.token);
    expect(soldiers.length).toBe(2);
  });

  it('adds an extra Treasure after doubling (616: plus first, then mul — AI maximizes)', () => {
    const xorn = card('P4R Xorn', 'Creature — Elemental', '{2}{R}', 'If you would create one or more Treasure tokens, instead create those tokens plus an additional Treasure token.', { power: '2', toughness: '2', colors: ['R'] });
    const ds = card('P4R Season', 'Enchantment', '{4}{G}', 'If an effect would create one or more tokens under your control, it creates twice that many of those tokens instead.');
    const g = setup();
    put(g, 0, xorn);
    put(g, 0, ds);
    const make = card('P4R Make Treasure', 'Sorcery', '{R}', 'Create a Treasure token.', { colors: ['R'] });
    const spell = mk(g, 0, make);
    g.players[0].hand.push(spell);
    g.players[0].pool.push('R');
    expect(castSpell(g, 0, spell.uid, {})).toBe(true);
    let i = 0;
    while ((g.stack.length || g.decision || g.pending.length) && i++ < 80) {
      if (g.decision) answerDecision(g, false);
      else if (g.priority != null) pass(g, g.priority);
      else flushTriggers(g);
    }
    const treasures = g.players[0].battlefield.filter(c => c.token);
    // plus first (1+1=2) then double → 4
    expect(treasures.length).toBe(4);
  });

  it('doubles +1/+1 counters that would be put on a creature you control', () => {
    const ev = card('P4R Branching', 'Enchantment', '{2}{G}', 'If one or more +1/+1 counters would be put on a creature you control, twice that many +1/+1 counters are put on that creature instead.');
    const g = setup();
    put(g, 0, ev);
    const bear = put(g, 0, BEAR());
    addCounters(g, bear, '+1/+1', 1);
    expect(bear.counters?.['+1/+1']).toBe(2);
  });

  it('floors damage so life can’t go below 1', () => {
    const ali = card('P4R Ali', 'Creature — Human', '{2}{R}', 'Damage that would reduce your life total to less than 1 reduces it to 1 instead.', { power: '2', toughness: '2', colors: ['R'] });
    const g = setup();
    put(g, 0, ali);
    g.players[0].life = 5;
    const src = put(g, 1, BEAR());
    dealDamage(g, src.id, src, { player: 0 }, 10);
    expect(g.players[0].life).toBe(1);
  });

  it('redirects damage that would be dealt to you to this creature', () => {
    const ang = card('P4R Angel', 'Creature — Angel', '{4}{W}{W}', 'Flying\nAll damage that would be dealt to you is dealt to P4R Angel instead.', { power: '5', toughness: '5', colors: ['W'], keywords: ['flying'] });
    const g = setup();
    const a = put(g, 0, ang);
    const src = put(g, 1, BEAR());
    const life = g.players[0].life;
    dealDamage(g, src.id, src, { player: 0 }, 3);
    expect(g.players[0].life).toBe(life);
    expect(a.damage).toBe(3);
  });

  it('doubles damage a source would deal', () => {
    const fur = card('P4R Furnace', 'Enchantment', '{1}{R}{R}', 'If a source would deal damage to a permanent or player, it deals double that damage to that permanent or player instead.');
    const g = setup();
    put(g, 0, fur);
    const src = put(g, 0, BEAR());
    const life = g.players[1].life;
    dealDamage(g, src.id, src, { player: 1 }, 2);
    expect(g.players[1].life).toBe(life - 4);
  });

  it('draws two cards instead of one (Thought Reflection)', () => {
    const tr = card('P4R Reflection', 'Enchantment', '{4}{U}{U}', 'If you would draw a card, draw two cards instead.');
    const g = setup();
    put(g, 0, tr);
    for (let i = 0; i < 8; i++) g.players[0].library.push(mk(g, 0, BEAR()));
    const before = g.players[0].hand.length;
    draw(g, 0, 1);
    expect(g.players[0].hand.length).toBe(before + 2);
  });

  it('replaces life gain with drawing that many cards', () => {
    const lich = card('P4R Lich', 'Enchantment', '{B}', 'If you would gain life, draw that many cards instead.');
    const g = setup();
    put(g, 0, lich);
    for (let i = 0; i < 8; i++) g.players[0].library.push(mk(g, 0, BEAR()));
    const life = g.players[0].life;
    const before = g.players[0].hand.length;
    gainLife(g, 0, 3);
    expect(g.players[0].life).toBe(life);
    expect(g.players[0].hand.length).toBe(before + 3);
  });

  it('skips an extra turn a player would begin', () => {
    const ug = card("P4R Nexus", 'Legendary Artifact', '{5}', 'If a player would begin an extra turn, that player skips that turn instead.\nIf P4R Nexus would be put into a graveyard from anywhere, reveal P4R Nexus and shuffle it into its owner\'s library instead.');
    const g = setup();
    put(g, 0, ug);
    g.players[0].extraTurns = 1;
    const start = g.turn;
    // Walk the active player to their next turn.
    let i = 0;
    const startActive = g.active;
    while (i++ < 200) {
      if (g.decision) answerDecision(g, false);
      else if (g.priority != null) pass(g, g.priority);
      else break;
      if (g.turn > start && g.active !== startActive) break;
    }
    // The extra turn was skipped, so we should have advanced to the opponent (or wrapped) without giving 0 two consecutive turns after skip...
    // After player 0's turn ends, extraTurns would start a new turn for 0, but the replacement skips it and nextAlive is 1.
    expect(g.log.some(l => /skips that extra turn/.test(l))).toBe(true);
  });


  it('exiles a creature dealt damage by this source this turn if it would die', () => {
    const d = card('P4R Kumano', 'Creature — Human Shaman', '{3}{R}{R}', 'If a creature dealt damage by P4R Kumano this turn would die, exile it instead.', { power: '2', toughness: '2', colors: ['R'] });
    const g = setup();
    const k = put(g, 0, d);
    const bear = put(g, 1, BEAR());
    dealDamage(g, k.id, k, { card: bear }, 1);
    destroy(g, bear);
    expect(g.players[1].exile).toContain(bear);
    expect(g.players[1].graveyard).not.toContain(bear);
  });
  it('exiles a creature dealt damage this way if it would die this turn', () => {
    const bolt = card('P4R Flow', 'Sorcery', '{1}{R}', 'P4R Flow deals 3 damage to any target. If a creature dealt damage this way would die this turn, exile it instead.', { colors: ['R'] });
    const g = setup();
    const bear = put(g, 1, BEAR());
    const spell = mk(g, 0, bolt);
    g.players[0].hand.push(spell);
    g.players[0].pool.push('R', 'R');
    const ok = castSpell(g, 0, spell.uid, { targets: [{ card: bear.uid }] });
    expect(ok).toBe(true);
    let i = 0;
    while ((g.stack.length || g.decision || g.pending.length) && i++ < 80) {
      if (g.decision) answerDecision(g, false);
      else if (g.priority != null) pass(g, g.priority);
      else flushTriggers(g);
    }
    checkState(g);
    expect(g.players[1].battlefield).not.toContain(bear);
    expect(g.players[1].exile).toContain(bear);
    expect(g.players[1].graveyard).not.toContain(bear);
  });
});
