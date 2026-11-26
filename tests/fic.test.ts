import { describe, it, expect } from 'vitest';
import { compileScry } from '../src/import/classify';
import { loadPrecons, isOfficialPrecon } from '../src/import/precons';
import { def, newGame, startGame, isType, canBeCommander, ctr, pass, answerDecision, layer, addCounters, hasKw, registerCards, offBfEff, declareAttackers, declareBlockers, canNinjutsu, ninjutsu, sneakRets, power, activate, checkState, enter, dealDamage, emit } from '../src/engine/engine';
import type { Game, Card } from '../src/engine/engine';
import type { CardDef } from '../src/engine/types';
import type { ScryCard } from '../src/import/scryfall';
import preconData from '../src/data/precons.json';

const cards = (preconData as unknown as { cards: Record<string, ScryCard> }).cards;
const ps = loadPrecons();
const fic = ps.filter(p => p.set === 'FIC');
const deck = (name: string) => ps.find(p => p.name === name)!;

const CMDS = [
  'Terra, Herald of Hope', 'Celes, Rune Knight',
  'Cloud, Ex-SOLDIER', 'Tifa, Martial Artist',
  "Tidus, Yuna's Guardian", 'Yuna, Grand Summoner',
  "Y'shtola, Night's Blessed", "G'raha Tia, Scion Reborn",
];

const SUBS: Record<string, string> = {
  'Revival Trance': 'FINAL FANTASY VI',
  'Limit Break': 'FINAL FANTASY VII',
  'Counter Blitz': 'FINAL FANTASY X',
  'Scions & Spellcraft': 'FINAL FANTASY XIV',
};

function compile(name: string) {
  const cl = compileScry(cards[name]);
  expect(cl.support, `${name}: ${JSON.stringify(cl.unparsed)}`).toBe('auto');
  return cl.def;
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
function run(g: Game, o: { may?: boolean } = {}) {
  for (const p of g.players) p.human = true; let i = 0;
  while ((g.stack.length || g.decision || g.choice || g.pending.length) && i++ < 400) {
    if (g.decision) answerDecision(g, (g.decision.kind === 'may' ? !!o.may : false) as never);
    else if (g.priority !== null && g.priority !== undefined) pass(g, g.priority);
    else break;
  }
}

describe('Final Fantasy Commander', () => {
  it('all four official FIC decks are 100/100 with two face commanders', () => {
    expect(fic.map(p => p.name).sort()).toEqual(['Counter Blitz', 'Limit Break', 'Revival Trance', 'Scions & Spellcraft']);
    for (const p of fic) {
      expect(isOfficialPrecon(p)).toBe(true);
      expect(p.setName).toBe('Final Fantasy Commander');
      expect(p.released).toBe('2025-06-13');
      expect(p.subtitle).toBe(SUBS[p.name]);
      expect(p.supported, `${p.name}: ${p.unsupported.join(', ')}`).toBe(100);
      expect(p.unsupported).toEqual([]);
      expect(1 + (p.extra?.length ?? 0) + p.cards.length).toBe(100);
      expect(p.commander).toBeTruthy();
      expect(p.extra?.length ?? 0).toBe(1);
    }
  });

  it('all eight face commanders compile with auto support and are legal commanders', () => {
    for (const name of CMDS) {
      const d = compile(name);
      expect(canBeCommander(d)).toBe(true);
    }
  });

  it("picker subtitles name the game: Revival Trance is FINAL FANTASY VI", () => {
    expect(deck('Revival Trance').subtitle).toBe('FINAL FANTASY VI');
    expect(deck('Limit Break').subtitle).toBe('FINAL FANTASY VII');
  });

  it('Job select equipment compiles and creates a Hero on ETB', () => {
    const d = compile("Dancer's Chakrams");
    expect(d.triggers?.some(t => JSON.stringify(t).includes('Hero') || t.ev === 'etb')).toBe(true);
    const g = setup();
    const c = mk(g, 0, d);
    enter(g, c, 0);
    run(g);
    const hero = g.players[0].battlefield.find(x => def(x).name === 'Hero' || def(x).sub?.includes('Hero'));
    expect(hero, 'a Hero token should enter').toBeTruthy();
    expect(c.attachedTo).toBe(hero!.uid);
  });

  it('Summon saga creatures compile with chapter abilities and lore counters', () => {
    for (const name of ['Summon: Ixion', 'Summon: Esper Valigarmanda', 'Summon: Kujata', 'Summon: Yojimbo', 'Summon: Valefor', 'Summon: Magus Sisters', 'Summon: Good King Mog XII']) {
      if (!cards[name]) continue;
      const d = compile(name);
      expect(d.saga, name).toBeGreaterThan(0);
      expect(d.types).toContain('Enchantment');
      expect(d.types).toContain('Creature');
      expect(d.triggers?.some(t => t.ev === 'chapter'), name).toBe(true);
    }
    const d = compile('Summon: Ixion');
    const g = setup();
    const c = put(g, 0, d);
    addCounters(g, c, 'lore', 1);
    expect(ctr(c, 'lore')).toBeGreaterThan(0);
    expect(d.power).toBeGreaterThan(0);
  });

  it("Cloud's Limit Break is tiered with three modes", () => {
    const d = compile("Cloud's Limit Break");
    expect(d.tierCosts?.length).toBe(3);
    expect(d.spell?.modes?.list.length).toBe(3);
    expect(d.spell?.modes?.list[0].label.toLowerCase()).toContain('cross-slash');
  });

  it('Yuffie has ninjutsu: return an unblocked attacker as a cost, then enter tapped and attacking', () => {
    const d = compile('Yuffie, Materia Hunter');
    registerCards([d]);
    expect(d.ninjutsu).toBeTruthy();
    const bear = compileScry({ name: 'FIC Test Bear', type_line: 'Creature — Bear', mana_cost: '{1}{G}', oracle_text: '', colors: ['G'], color_identity: ['G'], keywords: [], power: '2', toughness: '2' });
    const bd = { ...bear.def, id: 'fic-test-bear' }; registerCards([bd]);
    const g = setup();
    const atk = put(g, 0, bd);
    const y = mk(g, 0, d);
    g.players[0].hand.push(y);
    g.players[0].pool.push('R', 'C');
    g.step = 'blockers'; g.active = 0; g.awaiting = undefined as never; g.priority = 0;
    atk.attacking = 1; atk.tapped = true;
    expect(sneakRets(g, 0).some(c => c.uid === atk.uid)).toBe(true);
    expect(canNinjutsu(g, 0, y)).toBe(true);
    expect(ninjutsu(g, 0, y.uid, atk.uid)).toBe(true);
    expect(g.players[0].hand.includes(atk)).toBe(true);
    for (const p of g.players) p.human = true;
    let i = 0;
    while (g.stack.length && i++ < 80) {
      if (g.decision) answerDecision(g, false);
      else if (g.priority !== null && g.priority !== undefined) pass(g, g.priority);
      else break;
    }
    expect(g.players[0].battlefield.some(c => c.uid === y.uid)).toBe(true);
    expect(y.tapped).toBe(true);
    expect(y.attacking).toBe(1);
    expect(g.players[0].hand.includes(y)).toBe(false);
  });

  it('Tifa grants an additional combat after the current combat on the first combat', () => {
    const d = compile('Tifa, Martial Artist');
    expect(JSON.stringify(d.triggers)).toContain('tifaCombat');
    const g = setup();
    const tifa = put(g, 0, d);
    const bigD = compileScry({ name: 'FIC Big', type_line: 'Creature — Giant', mana_cost: '{7}{G}', oracle_text: '', colors: ['G'], color_identity: ['G'], keywords: [], power: '8', toughness: '8' });
    const bigDef = { ...bigD.def, id: 'fic-big' }; registerCards([bigDef]);
    const big = put(g, 0, bigDef);
    g.combatsThisTurn = 1;
    g.step = 'damage'; g.active = 0;
    // fire her trigger by dealing combat damage via emit
    big.attacking = 1;
    dealDamage(g, big.id, big, { player: 1 }, 8, true);
    emit(g, 'combatDamagePlayer', { player: 0, amount: 8, vs: 1 }, big);
    run(g);
    expect(g.extraAfterCombat ?? 0, 'additional combat after this phase').toBeGreaterThan(0);
    void tifa; void power;
  });

  it("Y'shtola, Night's Blessed compiles her lost-life trigger", () => {
    const d = compile("Y'shtola, Night's Blessed");
    expect(d.triggers?.some(t => JSON.stringify(t).includes('lostLife') || t.ev === 'loseLife' || JSON.stringify(t.ifc)?.includes('lostLife'))).toBe(true);
  });
});
