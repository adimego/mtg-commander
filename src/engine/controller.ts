import { Game, pass, defenders, canCast, canActivate, def, findCard, StackItem } from './engine';
import { aiPriority, aiAttack, aiBlock, chooseTarget } from './ai';
import { chooseTriggerTarget } from './engine';

export interface PassOpts { stopAll?: boolean; passUntilTurn?: number | null }

/** Does the human have an interactive response right now (instant/flash spell or targeted ability)?
 *  Non-interactive abilities (ramp, card draw) don't cause a smart-mode stop; use "Hold priority" for those. */
export function humanCanRespond(g: Game, pid: number) {
  const p = g.players[pid];
  return [...p.hand, ...p.command].some(c => canCast(g, pid, c)) || p.battlefield.some(c => (def(c).abilities ?? []).some((a, i) => !!a.target && canActivate(g, pid, c, i)));
}
const touches = (g: Game, it: StackItem, pid: number) => it.target?.player === pid || (it.target?.card !== undefined && findCard(g, it.target.card)?.owner === pid) || (it.target?.stack !== undefined && g.stack.find(s => s.id === it.target!.stack)?.controller === pid);

/** Smart auto-pass: only stop the human when it matters. */
export function shouldAutoPass(g: Game, pid: number, o: PassOpts): boolean {
  const p = g.players[pid]; if (p.lost) return true;
  const top = g.stack[g.stack.length - 1];
  if (o.stopAll) return false;
  if (!top && g.active === pid && (g.step === 'main1' || g.step === 'main2') && o.passUntilTurn !== g.turn) return false;
  if (top) {
    if (top.controller === pid) return true;
    if (touches(g, top, pid)) return false;
    return !humanCanRespond(g, pid);
  }
  if (o.passUntilTurn === g.turn) return true;
  const inCombat = g.step === 'blockers' && g.players[g.active].battlefield.some(c => c.attacking !== undefined && (g.active === pid || c.attacking === pid));
  return !(inCombat && humanCanRespond(g, pid));
}

export function waitingForHuman(g: Game, o: PassOpts = {}): boolean {
  if (g.winner !== null || !g.started) return true;
  if (g.choice) return g.players[g.choice.controller].human;
  if (g.awaiting === 'attack') return g.players[g.active].human && !g.players[g.active].lost;
  if (g.awaiting === 'block') return defenders(g).some(d => g.players[d].human && !g.blockersDone.includes(d));
  return g.priority !== null && g.players[g.priority].human && !shouldAutoPass(g, g.priority, o);
}

/** One automatic step: AI decisions or auto-pass. */
export function tick(g: Game, o: PassOpts = {}) {
  if (g.winner !== null) return;
  if (g.choice) { const c = g.choice; if (!g.players[c.controller].human) { const t = chooseTarget(g, c.controller, c.trig.target!, c.trig.effects, true); if (t) chooseTriggerTarget(g, t); } return; }
  if (g.awaiting === 'attack') { if (!g.players[g.active].human) aiAttack(g, g.active); return; }
  if (g.awaiting === 'block') { for (const d of defenders(g)) if (!g.players[d].human && !g.blockersDone.includes(d)) { aiBlock(g, d); return; } return; }
  if (g.priority === null) return;
  const p = g.players[g.priority];
  if (!p.human) aiPriority(g, p.id);
  else if (shouldAutoPass(g, p.id, o)) pass(g, p.id);
}
