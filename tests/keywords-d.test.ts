import { describe, it, expect } from 'vitest';
import { compileScry } from '../src/import/classify';
import type { ScryCard } from '../src/import/scryfall';
import {
  newGame, startGame, Game, Card, CARDS, registerCards, castSpell, pass, alive,
  answerDecision, canCast, canActivate, flushTriggers, enter, discardCard, draw, costOf,
} from '../src/engine/engine';
import type { CardDef } from '../src/engine/types';
import '../src/engine/ai';

let n = 0;
function card(name: string, type_line: string, mana_cost: string, oracle_text: string, o: Partial<ScryCard> = {}): CardDef {
  const cl = compileScry({ name, type_line, mana_cost, oracle_text, colors: [], color_identity: [], keywords: [], ...o });
  const d = { ...cl.def, id: `kd-${++n}-${cl.def.id}` }; registerCards([d]);
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
function put(g: Game, pid: number, d: CardDef | string, zone: 'battlefield' | 'hand' | 'graveyard' | 'exile' | 'library' = 'battlefield'): Card {
  const c: Card = { uid: g.nextUid++, id: typeof d === 'string' ? d : d.id, owner: pid, tapped: false, sick: false, damage: 0, pp: 0, pt: 0 };
  g.players[pid][zone].push(c); return c;
}
function fillMana(g: Game, pid = 0, n = 10) { for (let i = 0; i < n; i++) g.players[pid].pool.push('W','U','B','R','G','C'); }
function passAll(g: Game) { const nP = alive(g).length; for (let i = 0; i < nP; i++) pass(g, g.priority!); }
function resolveAll(g: Game) { let i = 0; while ((g.stack.length || g.decision || g.pending.length) && i++ < 80) { if (g.decision) { if (g.decision.kind === 'may') answerDecision(g, true); else if (g.decision.kind === 'pick') answerDecision(g, (g.decision.cards ?? []).slice(0, g.decision.min ?? 0).map((c: Card) => c.uid)); else answerDecision(g, false); } else if (g.priority != null) pass(g, g.priority); else flushTriggers(g); } }

describe('phase D: alt-cost and from-zone keywords', () => {
  it('madness: compiles and may be cast from exile after discard', () => {
    const d = card('Basking Rootwalla', 'Creature — Lizard', '{G}', 'Madness {0}', { power: '1', toughness: '1' });
    auto(d);
    expect(d.madness).toBeTruthy();
    const g = setup();
    const c = put(g, 0, d, 'hand');
    discardCard(g, c);
    expect(g.players[0].exile.some(x => x.uid === c.uid)).toBe(true);
    expect(g.players[0].graveyard.some(x => x.uid === c.uid)).toBe(false);
    fillMana(g);
    resolveAll(g);
    expect(g.players[0].battlefield.some(x => x.uid === c.uid) || g.stack.some(s => s.card?.uid === c.uid)).toBe(true);
  });

  it('buyback: paid buyback returns the spell to hand', () => {
    const d = card('Capsize', 'Instant', '{1}{U}{U}', 'Buyback {3}\nReturn target permanent to its owner\'s hand.');
    auto(d);
    expect(d.buyback).toBeTruthy();
    const g = setup();
    const t = put(g, 1, card('KD Bear', 'Creature — Bear', '{1}{G}', '', { power: '2', toughness: '2' }));
    const c = put(g, 0, d, 'hand');
    fillMana(g, 0, 12);
    expect(castSpell(g, 0, c.uid, { buyback: true, targets: [{ card: t.uid }] })).toBe(true);
    resolveAll(g);
    expect(g.players[0].hand.some(x => x.uid === c.uid)).toBe(true);
    expect(g.players[1].hand.some(x => x.uid === t.uid) || !g.players[1].battlefield.some(x => x.uid === t.uid)).toBe(true);
  });

  it('jump-start: may be recast from the graveyard by discarding, then exiled', () => {
    const d = card('Direct Current', 'Instant', '{0}', 'Draw a card.\nJump-start');
    auto(d);
    expect(d.jumpStart).toBe(true);
    const g = setup();
    const c = put(g, 0, d, 'graveyard');
    const fodder = put(g, 0, card('KD Fodder', 'Creature — Bear', '{0}', '', { power: '1', toughness: '1' }), 'hand');
    fillMana(g);
    // fill a card to draw
    g.players[0].library.push({ uid: g.nextUid++, id: fodder.id, owner: 0, tapped: false, sick: false, damage: 0, pp: 0, pt: 0 });
    expect(canCast(g, 0, c)).toBe(true);
    expect(castSpell(g, 0, c.uid)).toBe(true);
    resolveAll(g);
    expect(g.players[0].exile.some(x => x.uid === c.uid)).toBe(true);
    expect(g.players[0].hand.some(x => x.uid === fodder.uid)).toBe(false);
  });

  it('miracle: first card drawn this turn may be cast for its miracle cost', () => {
    const d = card('Devastation Tide', 'Sorcery', '{3}{U}{U}', 'Miracle {1}{U}\nReturn all nonland permanents to their owners\' hands.');
    auto(d);
    expect(d.miracle).toBeTruthy();
    const g = setup();
    const c = put(g, 0, d, 'library');
    g.players[0].drawn = { turn: g.turn, n: 0 };
    fillMana(g, 0, 8);
    draw(g, 0, 1);
    expect(g.players[0].hand.some(x => x.uid === c.uid)).toBe(true);
    resolveAll(g);
    expect(g.stack.some(s => s.card?.uid === c.uid) || !g.players[0].hand.some(x => x.uid === c.uid) || g.log.some(l => /Miracle/i.test(typeof l === 'string' ? l : (l as { t?: string }).t ?? ''))).toBe(true);
  });

  it('entwine: keyword compiles and adds the extra cost', () => {
    const d = card('Barbed Lightning', 'Instant', '{1}{R}', 'Choose one —\n• Barbed Lightning deals 3 damage to target creature.\n• Barbed Lightning deals 3 damage to target player.\nEntwine {2}');
    expect(d.entwine).toBeTruthy();
    const g = setup();
    const c = put(g, 0, d, 'hand');
    const cost = costOf(g, c, { entwine: true });
    expect((cost.generic ?? 0) + (cost.R ?? 0)).toBeGreaterThan((d.cost.generic ?? 0) + (d.cost.R ?? 0));
  });

  it('soulshift / bargain / exploit / conspire compile as keywords', () => {
    const ss = card('Horobi\'s Whisper', 'Instant', '{1}{B}{B}', 'Soulshift 3\nDestroy target nonblack creature.');
    // soulshift is usually on spirits; still compile the keyword
    expect(ss.soulshift).toBe(3);
    const bg = card('Iris of the Blossom', 'Creature — Human', '{1}{G}', 'Bargain\nWhen this enters, draw a card.', { power: '2', toughness: '2' });
    expect(bg.bargain).toBe(true);
    const ex = card('Silumgar Butcher', 'Creature — Zombie Djinn', '{4}{B}', 'Exploit\nWhen you exploit a creature, target creature gets -3/-3 until end of turn.', { power: '3', toughness: '3' });
    expect(ex.exploit).toBe(true);
    const co = card('Wort, the Raidmother', 'Legendary Creature — Goblin Shaman', '{4}{R}{G}', 'Conspire', { power: '3', toughness: '3' });
    expect(co.conspire).toBe(true);
  });

});
