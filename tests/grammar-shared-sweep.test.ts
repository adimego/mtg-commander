import { describe, it, expect } from 'vitest';
import { compileScry } from '../src/import/classify';
import type { ScryCard } from '../src/import/scryfall';
import {
  newGame, startGame, Game, Card, registerCards, pass, answerDecision,
  offBfEff, flushTriggers, layer, enter, checkState, declareAttackers,
  declareBlockers, defenders, def, activate, dealDamage, phaseOut, castSpell,
} from '../src/engine/engine';
import type { CardDef } from '../src/engine/types';
import '../src/engine/ai';

let n = 0;
function card(name: string, type_line: string, mana_cost: string, oracle_text: string, o: Partial<ScryCard> = {}): CardDef {
  const cl = compileScry({ name, type_line, mana_cost, oracle_text, colors: [], color_identity: [], keywords: [], ...o });
  const d = { ...cl.def, id: `sw-${++n}-${cl.def.id}` };
  registerCards([d]);
  expect(cl.support, JSON.stringify({ name, unparsed: cl.unparsed, abilities: cl.def.abilities, triggers: cl.def.triggers, spell: cl.def.spell })).toBe('auto');
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
function put(g: Game, pid: number, d: CardDef): Card { const c = mk(g, pid, d); enter(g, c, pid); return c; }
function until(g: Game, pred: () => boolean, max = 200) {
  for (const p of g.players) p.human = false;
  let i = 0;
  while (!pred() && i++ < max) {
    if (g.decision) answerDecision(g, false);
    else if (g.awaiting === 'block') {
      const left = defenders(g).filter(d => !g.blockersDone.includes(d));
      if (left.length) declareBlockers(g, left[0], []);
      else if (g.priority != null) pass(g, g.priority);
      else { flushTriggers(g); checkState(g); }
    } else if (g.awaiting === 'attack') declareAttackers(g, g.active, []);
    else if (g.priority != null) pass(g, g.priority);
    else { flushTriggers(g); checkState(g); }
  }
  return pred();
}
const BEAR = () => card('SW Bear', 'Creature — Bear', '{1}{G}', '', { power: '2', toughness: '2', colors: ['G'] });
const OX = () => card('SW Ox', 'Creature — Ox', '{4}{G}', '', { power: '6', toughness: '6', colors: ['G'] });

describe('shared sweep: phase in/out', () => {
  it('parses “~ phases out” and “target creature phases out”', () => {
    const self = card('SW Blinkmoth', 'Creature — Insect', '{2}', '{T}: SW Blinkmoth phases out.', { power: '1', toughness: '1' });
    expect(self.abilities?.[0].effects).toMatchObject([{ op: 'phaseOut', who: 'self' }]);
    const sp = card('SW Phase Bolt', 'Instant', '{U}', 'Target creature phases out.', { colors: ['U'] });
    expect(sp.spell?.effects).toMatchObject([{ op: 'phaseOut' }]);
    const lands = card('SW Taniwha', 'Legendary Creature — Serpent', '{3}{U}{U}', 'Phasing\nAt the beginning of your upkeep, all lands you control phase out.', { power: '7', toughness: '7', colors: ['U'] });
    expect(lands.triggers?.[0]).toMatchObject({ ev: 'upkeep' });
    expect(lands.triggers?.[0].effects).toMatchObject([{ op: 'phaseOut' }]);
  });

  it('phasing out a creature emits phasesOut and “whenever ~ phases in” draws on the next turn', () => {
    const d = card('SW Teferi Cat', 'Creature — Cat', '{2}{U}', 'Whenever SW Teferi Cat phases in, you draw a card.', { power: '2', toughness: '2', colors: ['U'] });
    expect(d.triggers?.[0]).toMatchObject({ ev: 'phasesIn', subj: 'self' });
    const g = setup();
    const c = put(g, 0, d);
    const hand = g.players[0].hand.length;
    phaseOut(g, c);
    expect(g.players[0].battlefield).not.toContain(c);
    expect(g.players[0].phased?.some(x => x.uid === c.uid)).toBe(true);
    const turn = g.turn;
    // Back around to player 0's turn: it phases in at the start of that turn; the trigger waits until upkeep.
    expect(until(g, () => g.active === 0 && g.turn > turn && g.step === 'main1' && !g.stack.length && !g.pending.length)).toBe(true);
    expect(g.players[0].battlefield.some(x => x.uid === c.uid)).toBe(true);
    expect(g.players[0].hand.length).toBe(hand + 2); // turn draw + phases-in trigger
  });
});

describe('shared sweep: en-Kor next-N damage redirect', () => {
  it('parses “the next 1 damage that would be dealt to ~ this turn is dealt to target creature you control instead”', () => {
    const d = card('SW Spirit en-Kor', 'Creature — Kor Spirit', '{3}{W}',
      '{0}: The next 1 damage that would be dealt to SW Spirit en-Kor this turn is dealt to target creature you control instead.',
      { power: '2', toughness: '2', colors: ['W'] });
    expect(d.abilities?.[0].effects).toMatchObject([{ op: 'redirectNext', n: 1, who: 'self' }]);
    expect(d.abilities?.[0].tslots?.[0]).toMatchObject({ who: 'perm' });
  });

  it('redirects the next 1 damage to the chosen creature (and leaves any remainder)', () => {
    const d = card('SW Kor', 'Creature — Kor Warrior', '{W}',
      '{0}: The next 1 damage that would be dealt to SW Kor this turn is dealt to target creature you control instead.',
      { power: '1', toughness: '2', colors: ['W'] });
    const g = setup();
    const kor = put(g, 0, d);
    const ox = put(g, 0, OX());
    expect(activate(g, 0, kor.uid, 0, { targets: [{ card: ox.uid }] })).toBe(true);
    until(g, () => !g.stack.length && !g.decision && !g.pending.length);
    dealDamage(g, 'sw-lightning', undefined, { card: kor }, 3);
    expect(kor.damage).toBe(2);
    expect(ox.damage).toBe(1);
  });
});

describe('shared sweep: stack copies and extra turns', () => {
  it('parses “copy target instant or sorcery spell. you may choose new targets for the copy”', () => {
    const d = card('SW Twincast', 'Instant', '{U}{U}', 'Copy target instant or sorcery spell. You may choose new targets for the copy.', { colors: ['U'] });
    expect(d.spell?.effects).toMatchObject([{ op: 'copyStack' }]);
    expect(d.spell?.tslots?.[0]).toMatchObject({ who: 'spell' });
  });

  it('parses “when you next cast an instant or sorcery spell this turn, copy that spell”', () => {
    const d = card('SW Doublecast', 'Sorcery', '{1}{R}{R}', 'When you next cast an instant or sorcery spell this turn, copy that spell. You may choose new targets for the copy.', { colors: ['R'] });
    expect(d.spell?.effects).toMatchObject([{ op: 'nextCopyIS' }]);
  });

  it('parses “target player takes an extra turn after this one” and Final Fortune’s delayed lose', () => {
    const warp = card('SW Time Warp', 'Sorcery', '{3}{U}{U}', 'Target player takes an extra turn after this one.', { colors: ['U'] });
    expect(warp.spell?.effects).toMatchObject([{ op: 'extraTurn', n: 1 }]);
    const ff = card('SW Final Fortune', 'Instant', '{R}{R}', 'Take an extra turn after this one. At the beginning of that turn\'s end step, you lose the game.', { colors: ['R'] });
    expect(ff.spell?.effects).toMatchObject([{ op: 'extraTurn', n: 1 }, { op: 'loseAtExtraEnd' }]);
  });

  it('copies a spell on the stack', () => {
    const bolt = card('SW Lightning', 'Instant', '{R}', 'SW Lightning deals 2 damage to any target.', { colors: ['R'] });
    const twin = card('SW Twin', 'Instant', '{U}{U}', 'Copy target instant or sorcery spell. You may choose new targets for the copy.', { colors: ['U'] });
    const g = setup();
    const b = mk(g, 0, bolt); g.players[0].hand.push(b); g.players[0].pool.push('R');
    expect(castSpell(g, 0, b.uid, { targets: [{ player: 1 }] })).toBe(true);
    const before = g.stack.length;
    const t = mk(g, 0, twin); g.players[0].hand.push(t); g.players[0].pool.push('U', 'U');
    const target = { stack: g.stack[0].id };
    expect(castSpell(g, 0, t.uid, { targets: [target] })).toBe(true);
    until(g, () => g.stack.length === before + 1 && g.stack.some(s => /copy of/.test(s.label ?? '')) || g.stack.length > before + 1);
    // After Twincast starts resolving it should leave a copy; tolerate already-resolved if auto-pass raced.
    const copied = g.stack.some(s => s.card?.isCopy) || g.log.some(l => /copies SW Lightning/.test(l));
    expect(copied).toBe(true);
  });

  it('Final Fortune gives an extra turn and loses at that turn’s end step, not this one', () => {
    const ff = card('SW Fortune', 'Instant', '{R}{R}', 'Take an extra turn after this one. At the beginning of that turn\'s end step, you lose the game.', { colors: ['R'] });
    const g = setup();
    const c = mk(g, 0, ff); g.players[0].hand.push(c); g.players[0].pool.push('R', 'R');
    expect(castSpell(g, 0, c.uid)).toBe(true);
    const turn = g.turn;
    expect(until(g, () => g.players[0].extraTurns === 1 && !g.stack.length && !g.pending.length)).toBe(true);
    expect(g.players[0].lost).toBeFalsy();
    // Extra turn starts immediately after this turn.
    expect(until(g, () => g.active === 0 && g.turn === turn + 1 && g.step === 'main1')).toBe(true);
    expect(g.players[0].lost).toBeFalsy();
    expect(until(g, () => !!g.players[0].lost || (g.turn > turn + 1), 300)).toBe(true);
    expect(g.players[0].lost).toBe(true);
  });
});
