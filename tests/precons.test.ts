import { describe, it, expect } from 'vitest';
import { loadPrecons } from '../src/import/precons';
import { newGame, startGame, pass, answerDecision, alive, isCommander } from '../src/engine/engine';
import '../src/engine/ai';

/** Supported-card floors per official Marvel Super Heroes Commander precon. Target is 100/100;
 * these floors only stop regressions. The cards still missing are listed by scripts/precon-check.ts and docs/coverage.md. */
const FLOOR: Record<string, number> = { 'Avengers Assemble': 72, 'Wakanda Forever': 67, 'The Fantastic Four': 62, 'Doom Prevails': 61 };

describe('official precons', () => {
  const ps = loadPrecons();
  it('all four MSC precons load with exact 100-card lists', () => {
    expect(ps.map(p => p.name).sort()).toEqual(Object.keys(FLOOR).sort());
    for (const p of ps) expect(1 + (p.extra?.length ?? 0) + p.cards.length).toBe(100);
  });
  for (const name of Object.keys(FLOOR)) it(`${name}: supported cards ≥ ${FLOOR[name]} (target 100)`, () => {
    const p = ps.find(x => x.name === name)!; expect(p.supported).toBeGreaterThanOrEqual(FLOOR[name]);
    expect(p.supported + p.unsupported.length).toBeLessThanOrEqual(100);
  });
  it('Fantastic Four: four commanders start in the command zone and the game runs', () => {
    const ff = ps.find(p => p.name === 'The Fantastic Four')!; const others = ps.filter(p => p !== ff).map(p => p.id);
    const g = newGame({ seed: 11, humans: [], decks: [ff.id, ...others], skipAiMulligan: true });
    expect(g.players[0].command.length).toBe(4); expect(g.players[0].command.every(c => isCommander(g, c))).toBe(true);
    startGame(g); let i = 0; while (g.turn < 12 && g.winner === null && i++ < 20000) { if (g.decision) answerDecision(g, false); else if (g.priority !== null) pass(g, g.priority); else break; }
    expect(g.turn).toBeGreaterThanOrEqual(12); expect(alive(g).length).toBeGreaterThan(0);
  });
});
