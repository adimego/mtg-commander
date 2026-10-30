import { Game, pass, defenders, canCast, canActivate, def, StackItem, answerDecision, itemTargets, locate, castZone, chooseTriggerTargets, trigSlots, abilitySlots } from './engine';
import { aiPriority, aiAttack, aiBlock, chooseTargets, chooseModes, decide } from './ai';

export interface PassOpts { stopAll?: boolean; passUntilTurn?: number | null }

/** Does the human have an interactive response right now (instant/flash spell or targeted ability)?
 *  Non-interactive abilities (ramp, card draw) don't cause a smart-mode stop; use "Hold priority" for those. */
export function humanCanRespond(g: Game, pid: number) {
  const p = g.players[pid];
  return [...p.hand, ...p.command, ...p.graveyard, ...p.exile].some(c => castZone(g, pid, c) && canCast(g, pid, c)) || [...p.battlefield, ...p.hand, ...p.graveyard].some(c => (def(c).abilities ?? []).some((a, i) => !a.manaAb && (abilitySlots(a).length > 0 || !!a.modes) && canActivate(g, pid, c, i)));
}
const touches = (g: Game, it: StackItem, pid: number) => itemTargets(it).some(t => t.player === pid || (t.card !== undefined && locate(g, t.card)?.c.owner === pid) || (t.stack !== undefined && g.stack.find(s => s.id === t.stack)?.controller === pid));

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
  if (g.decision) return g.players[g.decision.pid].human;
  if (g.choice) return g.players[g.choice.controller].human;
  if (g.awaiting === 'attack') return g.players[g.active].human && !g.players[g.active].lost;
  if (g.awaiting === 'block') return defenders(g).some(d => g.players[d].human && !g.blockersDone.includes(d));
  return g.priority !== null && g.players[g.priority].human && !shouldAutoPass(g, g.priority, o);
}

/** One automatic step: AI decisions or auto-pass. */
export function tick(g: Game, o: PassOpts = {}) {
  if (g.winner !== null) return;
  if (g.decision) { const d = g.decision; if (!g.players[d.pid].human) answerDecision(g, decide(g, d)); return; }
  if (g.choice) {
    const c = g.choice; if (g.players[c.controller].human) return;
    const t = c.trig; const modes = t.modes ? chooseModes(g, c.controller, t.modes, c.sourceUid) : undefined;
    const ts = chooseTargets(g, c.controller, trigSlots(t), t.effects, true, c.sourceUid) ?? [];
    if (!chooseTriggerTargets(g, ts, modes)) { g.choice = null; }
    return;
  }
  if (g.awaiting === 'attack') { if (!g.players[g.active].human) aiAttack(g, g.active); return; }
  if (g.awaiting === 'block') { for (const d of defenders(g)) if (!g.players[d].human && !g.blockersDone.includes(d)) { aiBlock(g, d); return; } return; }
  if (g.priority === null) return;
  const p = g.players[g.priority];
  if (!p.human) aiPriority(g, p.id);
  else if (shouldAutoPass(g, p.id, o)) pass(g, p.id);
}
