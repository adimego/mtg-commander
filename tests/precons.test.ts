import { describe, it, expect } from 'vitest';
import { loadPrecons, isOfficialPrecon } from '../src/import/precons';
import { newGame, startGame, pass, answerDecision, alive, isCommander, def, CARDS, registerDeck, unregisterDeck, resolveCommanders, faceCommanders, type DeckDef, type Player } from '../src/engine/engine';
import '../src/engine/ai';

const zones = (p: Player) => p.library.length + p.hand.length + p.command.length + p.battlefield.length + p.graveyard.length + p.exile.length;
const inDeck = (p: Player, id: string) => [...p.library, ...p.hand].filter(c => c.id === id).length;

/** Supported-card floors per official Marvel Super Heroes Commander precon. Target is 100/100;
 * these floors only stop regressions. The cards still missing are listed by scripts/precon-check.ts and docs/coverage.md. */
const FLOOR: Record<string, number> = { 'Avengers Assemble': 100, 'Wakanda Forever': 100, 'The Fantastic Four': 100, 'Doom Prevails': 100, 'Namor the Sub-Mariner': 100, "Zurgo, Thunder's Decree": 100 };

describe('official precons', () => {
  const ps = loadPrecons();
  it('official precons and the Namor preset load with exact 100-card lists', () => {
    expect(ps.map(p => p.name).sort()).toEqual(Object.keys(FLOOR).sort());
    for (const p of ps) expect(1 + (p.extra?.length ?? 0) + p.cards.length).toBe(100);
  });
  for (const name of Object.keys(FLOOR)) it(`${name}: supported cards ≥ ${FLOOR[name]} (target 100)`, () => {
    const p = ps.find(x => x.name === name)!; expect(p.supported).toBeGreaterThanOrEqual(FLOOR[name]);
    expect(p.supported + p.unsupported.length).toBeLessThanOrEqual(100);
  });
  it('Namor is a custom preset; the four Marvel decks are the official precons', () => {
    expect(ps.filter(isOfficialPrecon).map(p => p.name).sort()).toEqual(['Avengers Assemble', 'Doom Prevails', 'The Fantastic Four', 'Wakanda Forever']);
    expect(ps.filter(p => !isOfficialPrecon(p)).map(p => p.name)).toEqual(['Namor the Sub-Mariner', "Zurgo, Thunder's Decree"]);
  });
  it('only The Fantastic Four lists more than one face commander', () => {
    expect(ps.filter(p => faceCommanders(p).length > 1).map(p => p.name)).toEqual(['The Fantastic Four']);
  });
  it('each precon and the Namor preset starts with one commander and 100 cards', () => {
    for (const deck of ps) {
      const g = newGame({ seed: 4, humans: [], decks: [deck.id], skipAiMulligan: true });
      const p = g.players[0];
      expect(p.command.length, deck.name).toBe(1);
      expect(p.commanderIds, deck.name).toEqual([deck.commander]);
      expect(isCommander(g, p.command[0])).toBe(true);
      expect(def(p.command[0]).name, deck.name).toBe(CARDS[deck.commander].name);
      for (const id of deck.extra ?? []) {
        expect(inDeck(p, id), `${deck.name} ${CARDS[id].name}`).toBe(1);
        expect([...p.library, ...p.hand].filter(c => c.id === id).every(c => !isCommander(g, c))).toBe(true);
      }
      expect(zones(p), deck.name).toBe(100);
      expect(p.command.length + p.library.length + p.hand.length, deck.name).toBe(100);
    }
  });
  it('Fantastic Four: the chosen commander is the only one in the command zone; the other three are library cards', () => {
    const ff = ps.find(p => p.name === 'The Fantastic Four')!;
    const faces = faceCommanders(ff);
    expect(faces.map(id => CARDS[id].name)).toEqual(['Invisible Woman', 'Mister Fantastic', 'Human Torch', 'The Thing']);
    const chosen = faces[2];
    expect(resolveCommanders(ff, chosen)).toEqual({ commanders: [chosen], library: faces.filter(id => id !== chosen) });
    const g = newGame({ seed: 11, humans: [0], decks: [ff.id], skipAiMulligan: true, commanders: [chosen] });
    const p = g.players[0];
    expect(p.command.map(c => c.id)).toEqual([chosen]);
    expect(p.commanderIds).toEqual([chosen]);
    expect(def(p.command[0]).name).toBe('Human Torch');
    expect(isCommander(g, p.command[0])).toBe(true);
    for (const id of faces.filter(x => x !== chosen)) {
      expect(p.command.some(c => c.id === id)).toBe(false);
      expect(inDeck(p, id)).toBe(1);
      for (const c of [...p.library, ...p.hand]) if (c.id === id) expect(isCommander(g, c)).toBe(false);
    }
    expect(zones(p)).toBe(100);
    expect(g.log.some(l => /choose Human Torch as commander/.test(l) && /Invisible Woman/.test(l) && /shuffled into the library/.test(l))).toBe(true);
  });
  it('AI opponents with several face commanders pick the primary one', () => {
    const ff = ps.find(p => p.name === 'The Fantastic Four')!;
    const g = newGame({ seed: 9, humans: [], decks: [ff.id], skipAiMulligan: true });
    const p = g.players[0];
    expect(p.commanderIds).toEqual([ff.commander]);
    expect(def(p.command[0]).name).toBe('Invisible Woman');
    expect(p.command.length).toBe(1);
    for (const id of ff.extra ?? []) expect(inDeck(p, id)).toBe(1);
    expect(zones(p)).toBe(100);
    expect(g.log.some(l => l.includes('chooses Invisible Woman as commander'))).toBe(true);
  });
  it('a partner stays in the command zone while alternative face commanders join the library', () => {
    const island = Object.values(CARDS).find(c => c.name === 'Island')!.id;
    const d: DeckDef = { id: 'test-partner-faces', name: 'Partners', commander: 'isperia-supreme-judge', partner: 'judith-the-scourge-diva', extra: ['ruric-thar-the-unbowed', 'sergeant-john-benton'], cards: Array(96).fill(island) };
    registerDeck(d);
    try {
      const resolved = resolveCommanders(d, 'sergeant-john-benton');
      expect(resolved.commanders).toEqual(['sergeant-john-benton', 'judith-the-scourge-diva']);
      expect(resolved.library).toEqual(['isperia-supreme-judge', 'ruric-thar-the-unbowed']);
      const g = newGame({ seed: 2, humans: [], decks: [d.id], skipAiMulligan: true, commanders: ['sergeant-john-benton'] });
      const p = g.players[0];
      expect(p.commanderIds).toEqual(['sergeant-john-benton', 'judith-the-scourge-diva']);
      expect(p.command.map(c => def(c).name).sort()).toEqual(['Judith, the Scourge Diva', 'Sergeant John Benton']);
      expect(inDeck(p, 'isperia-supreme-judge')).toBe(1);
      expect(inDeck(p, 'ruric-thar-the-unbowed')).toBe(1);
      expect(zones(p)).toBe(100);
    } finally { unregisterDeck(d.id); }
  });
  it('Fantastic Four: one commander in the command zone and the game runs', () => {
    const ff = ps.find(p => p.name === 'The Fantastic Four')!; const others = ps.filter(p => p !== ff).map(p => p.id).slice(0, 3);
    const g = newGame({ seed: 11, humans: [], decks: [ff.id, ...others], skipAiMulligan: true });
    expect(g.players[0].command.length).toBe(1); expect(g.players[0].command.every(c => isCommander(g, c))).toBe(true);
    expect(g.players.every(p => p.library.length + p.hand.length + p.command.length + p.battlefield.length + p.graveyard.length + p.exile.length === 100)).toBe(true);
    startGame(g); let i = 0; while (g.turn < 12 && g.winner === null && i++ < 20000) { if (g.decision) answerDecision(g, false); else if (g.priority !== null) pass(g, g.priority); else break; }
    expect(g.turn).toBeGreaterThanOrEqual(12); expect(alive(g).length).toBeGreaterThan(0);
  });
});
