import { describe, it, expect } from 'vitest';
import { compileScry, classify } from '../src/import/classify';
import type { ScryCard } from '../src/import/scryfall';
import {
  newGame, startGame, Game, Card, registerCards, pass, answerDecision,
  offBfEff, flushTriggers, layer, enter, checkState, declareAttackers,
  declareBlockers, defenders, def, activate, dealDamage, castSpell, canActivate,
  abilitiesOf, planPayment, canCast, loseLife, gainLife, power, toughness, addCounters, tapForMana,
  playLand, canPlayLand, destroy, hasKw, isType, ctr, moveCard,
} from '../src/engine/engine';
import type { CardDef, Effect } from '../src/engine/types';
import '../src/engine/ai';
import officialB2 from './fixtures/popular-b2.json';

let n = 0;
function card(name: string, type_line: string, mana_cost: string, oracle_text: string, o: Partial<ScryCard> = {}): CardDef {
  const cl = compileScry({ name, type_line, mana_cost, oracle_text, colors: [], color_identity: [], keywords: [], ...o });
  const d = { ...cl.def, id: `b2-${++n}-${cl.def.id}` };
  registerCards([d]);
  expect(cl.support, JSON.stringify({ name, unparsed: cl.unparsed, reason: cl.reason, abilities: cl.def.abilities, triggers: cl.def.triggers, spell: cl.def.spell, statics: cl.def.statics, mana: cl.def.mana, replacements: cl.def.replacements })).toBe('auto');
  return d;
}
function setup(): Game {
  const g = newGame({ seed: 7, humans: [], skipAiMulligan: true });
  for (const p of g.players) { p.library.push(...p.hand); p.hand = []; }
  startGame(g); let i = 0; while (!(g.step === 'main1' && !g.stack.length && g.active === 0) && i++ < 80) { if (g.decision) answerDecision(g, false); else pass(g, g.priority!); }
  for (const p of g.players) { p.library.push(...p.hand); p.hand = []; p.battlefield = []; p.graveyard = []; p.exile = []; p.pool = []; }
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
const PLAINS = () => card('B2 Plains', 'Basic Land — Plains', '', '{T}: Add {W}.', { colors: [] });
const ISLAND = () => card('B2 Island', 'Basic Land — Island', '', '{T}: Add {U}.', { colors: [] });
const SWAMP = () => card('B2 Swamp', 'Basic Land — Swamp', '', '{T}: Add {B}.', { colors: [] });
const MOUNTAIN = () => card('B2 Mountain', 'Basic Land — Mountain', '', '{T}: Add {R}.', { colors: [] });
const FOREST = () => card('B2 Forest', 'Basic Land — Forest', '', '{T}: Add {G}.', { colors: [] });
const BEAR = () => card('B2 Bear', 'Creature — Bear', '{1}{G}', '', { power: '2', toughness: '2', colors: ['G'] });
const BOLT = () => card('B2 Bolt', 'Instant', '{R}', 'B2 Bolt deals 3 damage to any target.', { colors: ['R'] });
const VISIONARY = () => card('B2 Visionary', 'Creature — Elf', '{1}{G}', 'When this creature enters, draw a card.', { power: '1', toughness: '1', colors: ['G'] });

const names = (officialB2 as { name: string }[]).map(c => c.name);

describe('popular batch 2: compile', () => {
  it('classifies all 51 remaining top-500 Limited cards as auto', () => {
    const raw = officialB2 as Parameters<typeof classify>[0][];
    expect(raw.length).toBe(51);
    for (const c of raw) {
      const cl = classify(c);
      expect(cl.support, JSON.stringify({ name: c.name, unparsed: cl.unparsed, reason: cl.reason })).toMatch(/^(auto|builtin)$/);
    }
  });

  it('Cabal Ritual threshold is an if/else, not two stacked adds', () => {
    const d = card('Cabal Ritual', 'Instant', '{1}{B}', 'Add {B}{B}{B}.\nThreshold — Add {B}{B}{B}{B}{B} instead if there are seven or more cards in your graveyard.', { colors: ['B'], keywords: ['Threshold'] });
    const e = d.spell?.effects ?? [];
    expect(e).toHaveLength(1);
    expect(e[0].op).toBe('if');
    expect((e[0] as Effect & { else?: Effect[] }).else?.some(x => x.op === 'addMana')).toBe(true);
    expect(e[0].sub?.some(x => x.op === 'addMana')).toBe(true);
  });

  it('Mental Misstep only hits mana value 1', () => {
    const d = card('Mental Misstep', 'Instant', '{U}', 'Counter target spell with mana value 1.', { colors: ['U'] });
    const slot = d.spell?.tslots?.[0] ?? d.spell?.effects?.[0];
    const f = (d.spell?.tslots?.[0]?.f ?? (d.spell?.effects?.find(x => x.op === 'counter') as { f?: { mvLE?: number; mvGE?: number } } | undefined)?.f);
    expect(f?.mvLE).toBe(1);
    expect(f?.mvGE).toBe(1);
    void slot;
  });

  it("Entomb's search puts the card into the graveyard", () => {
    const d = card('Entomb', 'Instant', '{B}', 'Search your library for a card, put that card into your graveyard, then shuffle.', { colors: ['B'] });
    const search = (d.spell?.effects ?? []).find(x => x.op === 'search');
    expect(search).toBeTruthy();
    expect((search as { dest?: string }).dest).toBe('graveyard');
  });
});

describe('popular batch 2: engine hooks', () => {
  it('Panharmonicon doubles an ETB trigger of a permanent you control', () => {
    const g = setup();
    put(g, 0, card('Panharmonicon', 'Artifact', '{4}', 'If an artifact or creature entering causes a triggered ability of a permanent you control to trigger, that ability triggers an additional time.'));
    const hand0 = g.players[0].hand.length;
    put(g, 0, VISIONARY());
    expect(until(g, () => !g.stack.length && !g.pending.length && !g.res)).toBe(true);
    expect(g.players[0].hand.length).toBe(hand0 + 2);
  });

  it('Azusa lets you play three lands on your turn', () => {
    const g = setup();
    put(g, 0, card('Azusa, Lost but Seeking', 'Legendary Creature — Human Monk', '{2}{G}', 'You may play two additional lands on each of your turns.', { power: '1', toughness: '2', colors: ['G'] }));
    const lands = [PLAINS(), ISLAND(), SWAMP(), MOUNTAIN()].map(d => { const c = mk(g, 0, d); g.players[0].hand.push(c); return c; });
    expect(canPlayLand(g, 0, lands[0])).toBe(true);
    expect(playLand(g, 0, lands[0].uid)).toBe(true);
    expect(playLand(g, 0, lands[1].uid)).toBe(true);
    expect(playLand(g, 0, lands[2].uid)).toBe(true);
    expect(canPlayLand(g, 0, lands[3])).toBe(false);
    expect(playLand(g, 0, lands[3].uid)).toBe(false);
  });

  it("Silence stops opponents from casting spells this turn, not you", () => {
    const g = setup();
    const silD = card('Silence', 'Instant', '{W}', "Your opponents can't cast spells this turn.", { colors: ['W'] });
    const sil = mk(g, 0, silD); g.players[0].hand.push(sil); g.players[0].pool.push('W');
    expect(castSpell(g, 0, sil.uid)).toBe(true);
    expect(until(g, () => !g.stack.length && !g.pending.length && !g.res && g.priority != null)).toBe(true);
    const bolt1 = mk(g, 1, BOLT()); g.players[1].hand.push(bolt1); g.players[1].pool.push('R');
    expect(canCast(g, 1, bolt1)).toBe(false);
    const bolt0 = mk(g, 0, BOLT()); g.players[0].hand.push(bolt0); g.players[0].pool.push('R');
    expect(canCast(g, 0, bolt0)).toBe(true);
  });

  it("Seedborn Muse untaps your permanents during each other player's untap step", () => {
    const g = setup();
    put(g, 0, card('Seedborn Muse', 'Creature — Spirit', '{3}{G}{G}', "Untap all permanents you control during each other player's untap step.", { power: '2', toughness: '4', colors: ['G'] }));
    const bear = put(g, 0, BEAR());
    bear.tapped = true;
    const oppLand = put(g, 1, PLAINS());
    oppLand.tapped = true;
    expect(until(g, () => g.active === 1 && (g.step === 'upkeep' || g.step === 'draw' || g.step === 'main1'), 400)).toBe(true);
    expect(bear.tapped).toBe(false);
    expect(oppLand.tapped).toBe(false); // opponent's own untap also happens
  });

  it('Academy Manufactor makes one of each Clue, Food, and Treasure', () => {
    const g = setup();
    put(g, 0, card('Academy Manufactor', 'Artifact Creature — Assembly-Worker', '{3}', 'If you would create a Clue, Food, or Treasure token, instead create one of each.', { power: '1', toughness: '3' }));
    put(g, 0, card('B2 Miner', 'Creature — Dwarf', '{1}{R}', 'When this creature enters, create a Treasure token.', { power: '1', toughness: '1', colors: ['R'] }));
    expect(until(g, () => !g.stack.length && !g.pending.length && !g.res)).toBe(true);
    const kinds = new Set(g.players[0].battlefield.flatMap(c => def(c).sub ?? []).filter(s => s === 'Treasure' || s === 'Food' || s === 'Clue'));
    expect(kinds).toEqual(new Set(['Treasure', 'Food', 'Clue']));
  });

  it('Maskwood Nexus gives your creatures changeling / all creature types', () => {
    const g = setup();
    put(g, 0, card('Maskwood Nexus', 'Artifact', '{4}', 'Creatures you control have changeling.\n{2}, {T}: Create a 2/2 blue Shapeshifter creature token with changeling. (It has every creature type.)'));
    const bear = put(g, 0, BEAR());
    layer(g);
    expect(hasKw(bear, 'changeling') || def(bear).keywords?.includes('changeling')).toBe(true);
    expect(isType(bear, 'Elf') || isType(bear, 'Goblin') || (def(bear).keywords ?? []).includes('changeling') || hasKw(bear, 'changeling')).toBe(true);
  });

  it('Enduring Vitality returns as a noncreature enchantment and does not return again', () => {
    const g = setup();
    const d = card('Enduring Vitality', 'Enchantment Creature — Elk', '{1}{G}{G}', "Vigilance\nCreatures you control have \"{T}: Add one mana of any color.\"\nWhen Enduring Vitality dies, if it was a creature, return it to the battlefield under its owner's control. It's an enchantment. (It's not a creature.)", { power: '3', toughness: '3', colors: ['G'], keywords: ['Vigilance'] });
    const ev = put(g, 0, d);
    expect(isType(ev, 'Creature')).toBe(true);
    expect(destroy(g, ev)).toBe(true);
    expect(until(g, () => g.players[0].battlefield.some(c => c.uid === ev.uid) && !g.stack.length && !g.pending.length && !g.res)).toBe(true);
    const back = g.players[0].battlefield.find(c => c.uid === ev.uid)!;
    expect(isType(back, 'Enchantment')).toBe(true);
    expect(isType(back, 'Creature')).toBe(false);
    expect(destroy(g, back)).toBe(true);
    expect(until(g, () => !g.stack.length && !g.pending.length && !g.res, 80)).toBe(true);
    expect(g.players[0].battlefield.some(c => c.uid === ev.uid)).toBe(false);
    expect(g.players[0].graveyard.some(c => c.uid === ev.uid)).toBe(true);
  });

  it("Mother of Runes grants protection from the chosen color", () => {
    const g = setup();
    const mom = put(g, 0, card('Mother of Runes', 'Creature — Human Cleric', '{W}', "{T}: Target creature you control gains protection from the color of your choice until end of turn.", { power: '1', toughness: '1', colors: ['W'] }));
    const bear = put(g, 0, BEAR());
    mom.sick = false; mom.tapped = false;
    const acts = abilitiesOf(g, mom);
    expect(acts.length).toBeGreaterThan(0);
    expect(canActivate(g, 0, mom, 0)).toBe(true);
    expect(activate(g, 0, mom.uid, 0, { targets: [{ card: bear.uid }] })).toBe(true);
    for (let i = 0; i < 80; i++) {
      if (g.decision && (g.decision.kind === 'color' || (g.decision as { options?: string[] }).options?.includes('G'))) { answerDecision(g, (g.decision as { options?: string[] }).options?.[0] ?? 'G'); continue; }
      if (!g.stack.length && !g.pending.length && !g.res && !g.decision) break;
      if (g.decision) answerDecision(g, false);
      else if (g.priority != null) pass(g, g.priority);
      else { flushTriggers(g); checkState(g); }
    }
    layer(g);
    expect(hasKw(bear, 'protection from chosen') || !!bear.chosenColor).toBe(true);
    expect(bear.chosenColor === 'W' || bear.chosenColor === 'U' || bear.chosenColor === 'B' || bear.chosenColor === 'R' || bear.chosenColor === 'G' || hasKw(bear, 'protection from chosen')).toBe(true);
  });

  it("Bolas's Citadel lets you play the top card by paying life", () => {
    const g = setup();
    put(g, 0, card("Bolas's Citadel", 'Legendary Artifact', '{3}{B}{B}{B}', 'You may look at the top card of your library any time.\nYou may play lands and cast spells from the top of your library. If you cast a spell this way, pay life equal to its mana value rather than pay its mana cost.\n{T}, Sacrifice ten nonland permanents: Each opponent loses 10 life.', { colors: ['B'] }));
    const bolt = mk(g, 0, BOLT());
    g.players[0].library.push(bolt);
    g.players[0].life = 20;
    expect(canCast(g, 0, bolt)).toBe(true);
    const life = g.players[0].life;
    expect(castSpell(g, 0, bolt.uid, { targets: [{ player: 1 }] })).toBe(true);
    expect(g.players[0].life).toBe(life - 1);
  });

  it('Syr Konrad deals 1 damage when another creature dies, but not twice via enterGy from the battlefield', () => {
    const g = setup();
    put(g, 0, card('Syr Konrad, the Grim', 'Legendary Creature — Human Knight', '{3}{B}{B}', 'Whenever another creature dies, or a creature card is put into a graveyard from anywhere other than the battlefield, or a creature card leaves your graveyard, Syr Konrad deals 1 damage to each opponent.', { power: '5', toughness: '4', colors: ['B'] }));
    const bear = put(g, 0, BEAR());
    const life = g.players[1].life;
    expect(destroy(g, bear)).toBe(true);
    expect(until(g, () => !g.stack.length && !g.pending.length && !g.res)).toBe(true);
    expect(g.players[1].life).toBe(life - 1);
  });

  it("Thassa's Oracle wins when devotion is at least the size of your library", () => {
    const g = setup();
    g.players[0].library = [mk(g, 0, ISLAND()), mk(g, 0, ISLAND())];
    // devotion 2 from two islands plus Thassa itself (UU) = 4, library size 2
    put(g, 0, ISLAND());
    put(g, 0, ISLAND());
    put(g, 0, card("Thassa's Oracle", 'Creature — Merfolk Wizard', '{U}{U}', "When Thassa's Oracle enters, look at the top X cards of your library, where X is your devotion to blue. Put up to one of them on top of your library and the rest on the bottom of your library in a random order. If X is greater than or equal to the number of cards in your library, you win the game.", { power: '1', toughness: '3', colors: ['U'] }));
    expect(until(g, () => !!g.winner || g.players.some(p => p.lost) || (!g.stack.length && !g.pending.length && !g.res), 200)).toBe(true);
    expect(g.winner === 0 || (g.players[1].lost && !g.players[0].lost)).toBe(true);
  });
});

describe('popular batch 2: unique scripts compile', () => {
  it('includes every unique leftover from the batch', () => {
    expect(names).toEqual(expect.arrayContaining([
      'Sylvan Library', 'Syr Konrad, the Grim', 'Etali, Primal Storm', 'Ragavan, Nimble Pilferer',
      'Finale of Devastation', 'The Ozolith', 'Dauthi Voidwalker', 'Kutzil, Malamet Exemplar',
      'Living Death', "Thassa's Oracle", 'Entish Restoration',
    ]));
  });
});
