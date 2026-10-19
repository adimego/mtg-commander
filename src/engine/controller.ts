import { Game, advance, isDefending } from './engine';
import { aiMain, aiAttack, aiBlock } from './ai';

/** True when the game must wait for a human decision. */
export function waitingForHuman(g: Game): boolean {
  if (g.winner !== null || !g.started) return true;
  if (g.step === 'blockers') { const h = g.players.find(p => p.human && !p.lost && isDefending(g, p.id) && !g.blockersDone.includes(p.id)); if (h) return true; }
  const a = g.players[g.active];
  return a.human && !a.lost && ['main1', 'attackers', 'main2'].includes(g.step);
}
/** Run one automatic step (AI decisions + turn-based actions). */
export function tick(g: Game) {
  if (g.step === 'blockers') for (const p of g.players) if (!p.human && !p.lost && isDefending(g, p.id) && !g.blockersDone.includes(p.id)) aiBlock(g, p.id);
  if (waitingForHuman(g)) return;
  const a = g.players[g.active];
  if (!a.human && !a.lost) { if (g.step === 'main1' || g.step === 'main2') aiMain(g, a.id); if (g.step === 'attackers') aiAttack(g, a.id); }
  advance(g);
}
