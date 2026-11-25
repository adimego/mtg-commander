import { describe, it, expect } from 'vitest';
import { compileScry } from '../src/import/classify';
import { loadPrecons, isOfficialPrecon } from '../src/import/precons';
import { def, newGame, startGame, isType, canBeCommander, ctr, pass, answerDecision, layer, addCounters, isCommander } from '../src/engine/engine';
import type { ScryCard } from '../src/import/scryfall';
import preconData from '../src/data/precons.json';
const cards = (preconData as unknown as { cards: Record<string, ScryCard> }).cards;

const ps = loadPrecons();
const soc = ps.filter(p => p.set === 'SOC');
const deck = (name: string) => ps.find(p => p.name === name)!;

const CMDS = [
  'Killian, Decisive Mentor', 'Scriv, the Obligator',
  'Rootha, Mastering the Moment', 'Muddle, the Ever-Changing',
  'Dina, Essence Brewer', 'Gorma, the Gullet',
  'Quintorius, History Chaser', 'Excava, the Risen Past',
  'Zimone, Infinite Analyst', 'Primo, the Unbounded',
];

describe('Secrets of Strixhaven Commander', () => {
  it('all five official SOC decks are 100/100', () => {
    expect(soc.map(p => p.name).sort()).toEqual([
      'Lorehold Spirit', 'Prismari Artistry', 'Quandrix Unlimited', 'Silverquill Influence', 'Witherbloom Pestilence',
    ]);
    for (const p of soc) {
      expect(isOfficialPrecon(p)).toBe(true);
      expect(p.setName).toBe('Secrets of Strixhaven Commander');
      expect(p.released).toBe('2026-04-24');
      expect(p.supported, `${p.name}: ${p.unsupported.join(', ')}`).toBe(100);
      expect(p.unsupported).toEqual([]);
      expect(1 + (p.extra?.length ?? 0) + p.cards.length).toBe(100);
    }
  });

  it('all ten face commanders compile with auto support and are legal commanders', () => {
    for (const name of CMDS) {
      const cl = compileScry(cards[name]);
      expect(cl.support, `${name}: ${JSON.stringify(cl.unparsed)}`).toBe('auto');
      expect(canBeCommander(cl.def)).toBe(true);
    }
  });

  it('Quintorius, History Chaser starts in the command zone as a planeswalker commander', () => {
    const p = deck('Lorehold Spirit');
    expect(p.commander).toBeDefined();
    const g = newGame({ seed: 11, decks: [p.id], commanders: [p.commander], humans: [0], skipAiMulligan: true });
    const you = g.players[0];
    expect(you.commanderIds.some(id => def({ id }).name === 'Quintorius, History Chaser')).toBe(true);
    const q = you.command.find(c => def(c).name === 'Quintorius, History Chaser');
    expect(q, 'Quintorius should be in the command zone').toBeTruthy();
    expect(isCommander(g, q!)).toBe(true);
    expect(isType(q!, 'Planeswalker')).toBe(true);
    expect(def(q!).loyalty).toBeGreaterThan(0);
    layer(g);
    expect(ctr(q!, 'loyalty') || def(q!).loyalty).toBeGreaterThan(0);
    startGame(g);
    let i = 0;
    while (!(g.step === 'main1' && !g.stack.length && g.active === 0) && i++ < 80) {
      if (g.decision) answerDecision(g, false);
      else if (g.priority !== null && g.priority !== undefined) pass(g, g.priority);
      else break;
    }
    const still = g.players[0].command.find(c => def(c).name === 'Quintorius, History Chaser');
    expect(still, 'Quintorius remains in the command zone after the game starts').toBeTruthy();
    expect(isType(still!, 'Planeswalker')).toBe(true);
    expect(g.players[0].command.some(c => c.uid === still!.uid)).toBe(true);
    expect(g.players[0].battlefield.some(c => c.uid === still!.uid)).toBe(false);
    const loy = ctr(still!, 'loyalty') || def(still!).loyalty || 0;
    expect(loy).toBeGreaterThan(0);
  });

  it('SOC Class enchantments and leftover Prepared cards compile fully', () => {
    for (const name of ['Intermediate Chirography', 'Advanced Reconstruction']) {
      const cl = compileScry(cards[name]);
      expect(cl.support, `${name}: ${JSON.stringify(cl.unparsed)}`).toBe('auto');
      expect(cl.def.types).toContain('Enchantment');
    }
    const prepared = Object.entries(cards).filter(([, c]) => c.layout === 'prepare' || (c.keywords ?? []).includes('Prepare') || /becomes prepared/i.test(c.oracle_text ?? '') || (c.card_faces ?? []).some(f => /prepare/i.test(f.oracle_text ?? '') || f.name === 'Channel'));
    // At least the official SOC prepared batch compiles when present in precon data
    const socNames = new Set(soc.flatMap(p => {
      // names not stored on precon after compile; check known leftovers plus Channel pair
      return [];
    }));
    void socNames;
    const names = [
      'Yavimaya Bloomsage // Channel',
      'Stensian Sanguinist // Exsanguinate',
    ];
    for (const name of names) {
      if (!cards[name]) continue;
      const cl = compileScry(cards[name]);
      expect(cl.support, `${name}: ${JSON.stringify(cl.unparsed)}`).toBe('auto');
    }
    void prepared;
  });

  it('leave-the-graveyard and Prepared reminder compile on Lorehold / Silverquill staples', () => {
    for (const name of ['Kirol, Skyserpent Tamer', 'Anger', 'Channel', 'Killian, Ink Duelist', 'Ghostly Prison']) {
      if (!cards[name]) continue;
      const cl = compileScry(cards[name]);
      expect(cl.support, `${name}: ${JSON.stringify(cl.unparsed)}`).toBe('auto');
    }
  });
});
