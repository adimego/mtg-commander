import { describe, it, expect } from 'vitest';
import { compileScry } from '../src/import/classify';
import type { ScryCard } from '../src/import/scryfall';
import {
  newGame, startGame, Game, Card, CARDS, registerCards, castSpell, pass, alive,
  answerDecision, canCast, canActivate, flushTriggers,
} from '../src/engine/engine';
import type { CardDef } from '../src/engine/types';
import '../src/engine/ai';

let n = 0;
function card(name: string, type_line: string, mana_cost: string, oracle_text: string, o: Partial<ScryCard> = {}): CardDef {
  const cl = compileScry({ name, type_line, mana_cost, oracle_text, colors: [], color_identity: [], keywords: [], ...o });
  const d = { ...cl.def, id: `ke-${++n}-${cl.def.id}` }; registerCards([d]);
  (d as CardDef & { _support: string; _unparsed?: string[] })._support = cl.support;
  (d as CardDef & { _unparsed?: string[] })._unparsed = cl.unparsed;
  return d;
}
const auto = (d: CardDef) => expect((d as CardDef & { _support: string })._support, JSON.stringify((d as CardDef & { _unparsed?: string[] })._unparsed)).toBe('auto');

function setup(): Game {
  const g = newGame({ seed: 7, humans: [], skipAiMulligan: true });
  for (const p of g.players) { p.library.push(...p.hand); p.hand = []; }
  startGame(g); let i = 0; while (!(g.step === 'main1' && !g.stack.length && g.active === 0) && i++ < 80) { if (g.decision) answerDecision(g, false); else pass(g, g.priority!); }
  for (const p of g.players) { p.library.push(...p.hand); p.hand = []; for (const c of p.battlefield) c.tapped = false; }
  return g;
}
function put(g: Game, pid: number, d: CardDef | string, zone: 'battlefield' | 'hand' | 'graveyard' = 'battlefield'): Card {
  const c: Card = { uid: g.nextUid++, id: typeof d === 'string' ? d : d.id, owner: pid, tapped: false, sick: false, damage: 0, pp: 0, pt: 0 };
  g.players[pid][zone].push(c); return c;
}
function fillMana(g: Game, pid = 0, n = 10) { for (let i = 0; i < n; i++) g.players[pid].pool.push('W','U','B','R','G','C'); }
function resolveAll(g: Game) { let i = 0; while ((g.stack.length || g.decision || g.pending.length) && i++ < 80) { if (g.decision) { if (g.decision.kind === 'may') answerDecision(g, true); else if (g.decision.kind === 'pick') answerDecision(g, (g.decision.cards ?? []).slice(0, g.decision.min ?? 0).map((c: Card) => c.uid)); else answerDecision(g, false); } else if (g.priority != null) pass(g, g.priority); else flushTriggers(g); } }

describe('phase E: storm and split second', () => {
  it('storm: copies the spell once for each spell cast before it this turn', () => {
    const bolt = card('KE Shock', 'Instant', '{0}', 'KE Shock deals 1 damage to any target.');
    auto(bolt);
    const storm = card('Grapeshot', 'Sorcery', '{0}', 'Grapeshot deals 1 damage to any target.\nStorm');
    auto(storm);
    expect(storm.storm).toBe(true);
    expect(storm.triggers?.some(t => t.label === 'Storm')).toBe(true);
    const g = setup();
    const a = put(g, 0, bolt, 'hand');
    const b = put(g, 0, storm, 'hand');
    fillMana(g);
    expect(castSpell(g, 0, a.uid, { targets: [{ player: 1 }] })).toBe(true);
    resolveAll(g);
    const lifeBefore = g.players[1].life;
    expect(castSpell(g, 0, b.uid, { targets: [{ player: 1 }] })).toBe(true);
    resolveAll(g);
    const log = g.log.map(l => typeof l === 'string' ? l : String(l));
    expect(log.some(l => /Storm: copy/i.test(l))).toBe(true);
    expect(g.players[1].life).toBeLessThanOrEqual(lifeBefore - 2);
  });

  it('split second: opponents cannot cast or activate non-mana abilities while it is on the stack', () => {
    const ss = card('Sudden Shock', 'Instant', '{1}{R}', 'Split second\nSudden Shock deals 2 damage to any target.');
    auto(ss);
    expect(ss.splitSecond).toBe(true);
    const inst = card('KE Bolt', 'Instant', '{0}', 'KE Bolt deals 1 damage to any target.');
    auto(inst);
    const g = setup();
    const c = put(g, 0, ss, 'hand');
    const i = put(g, 1, inst, 'hand');
    fillMana(g, 0, 8);
    fillMana(g, 1, 8);
    expect(castSpell(g, 0, c.uid, { targets: [{ player: 1 }] })).toBe(true);
    expect(g.stack.some(s => s.card?.uid === c.uid)).toBe(true);
    expect(canCast(g, 1, i)).toBe(false);
  });
});
