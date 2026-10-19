import { Game, Card, Player, def, isType, hasKw, cmc, power, toughness, opponents, canCast, castSpell, playLand, canPlayLand, needsTarget, Target, declareAttackers, declareBlockers, canAttack, canBlock, attackers, COLORS, isCommander } from './engine';

const creatures = (p: Player) => p.battlefield.filter(c => isType(c, 'Creature'));
const boardPower = (g: Game, p: Player) => creatures(p).reduce((s, c) => s + power(g, c), 0);
const value = (g: Game, c: Card) => power(g, c) + toughness(g, c) + (def(c).keywords?.length ?? 0) * 2 + (isCommander(g, c) ? 5 : 0);

function chooseTarget(g: Game, pid: number, c: Card): Target | undefined {
  const d = def(c); const k = d.effect!.kind; const n = d.effect!.amount; const opp = opponents(g, pid);
  const enemy = opp.flatMap(o => creatures(o)).sort((a, b) => value(g, b) - value(g, a));
  if (k === 'destroyCreature') return enemy[0] && value(g, enemy[0]) >= 5 ? { card: enemy[0].uid } : undefined;
  if (k === 'damageAny') {
    const kill = enemy.find(e => toughness(g, e) - e.damage <= n && value(g, e) >= 4);
    if (kill) return { card: kill.uid };
    const weakest = [...opp].sort((a, b) => a.life - b.life)[0]; return weakest ? { player: weakest.id } : undefined;
  }
  return undefined; // AI doesn't use pump spells proactively
}

/** Main phase: play a land, then cast the most expensive affordable spells. */
export function aiMain(g: Game, pid: number) {
  const p = g.players[pid];
  const lands = p.hand.filter(c => canPlayLand(g, pid, c));
  if (lands.length) {
    const need = (col: string) => p.hand.filter(c => (def(c).cost as any)[col]).length;
    const score = (c: Card) => (def(c).produces ?? []).reduce((s, m) => s + (m === 'ANY' ? 10 : need(m)), 0);
    playLand(g, pid, lands.sort((a, b) => score(b) - score(a))[0].uid);
  }
  for (let guard = 0; guard < 20; guard++) {
    const opts = [...p.hand, ...p.command].filter(c => canCast(g, pid, c)).sort((a, b) => {
      const ra = def(a).produces ? 100 : 0, rb = def(b).produces ? 100 : 0; // ramp first
      return rb + cmc(def(b)) - (ra + cmc(def(a)));
    });
    let cast = false;
    for (const c of opts) {
      const d = def(c);
      if (d.effect?.kind === 'pump') continue;
      if (d.effect?.kind === 'gainLife' && p.life > 25) continue;
      const t = needsTarget(d) ? chooseTarget(g, pid, c) : undefined;
      if (needsTarget(d) && !t) continue;
      if (castSpell(g, pid, c.uid, t)) { cast = true; break; }
    }
    if (!cast) break;
  }
}

/** Attack the most vulnerable opponent where the attacker won't simply die; hold back defenders when threatened. */
export function aiAttack(g: Game, pid: number) {
  const p = g.players[pid]; const opp = opponents(g, pid);
  const threat = Math.max(0, ...opp.map(o => boardPower(g, o)));
  let elig = creatures(p).filter(c => canAttack(g, c)).sort((a, b) => power(g, b) - power(g, a));
  if (p.life <= threat * 1.5) { const keep = Math.ceil(elig.filter(c => !hasKw(c, 'vigilance')).length / 2); elig = elig.filter((c, i) => hasKw(c, 'vigilance') || i < elig.length - keep); }
  const plan: { uid: number; defender: number }[] = [];
  for (const c of elig) {
    const pw = power(g, c), tg = toughness(g, c);
    const safe = opp.filter(o => !creatures(o).some(b => !b.tapped && (!hasKw(c, 'flying') || hasKw(b, 'flying')) && (power(g, b) >= tg || hasKw(b, 'deathtouch')) && !(pw >= toughness(g, b) && value(g, b) >= value(g, c))));
    if (!safe.length || pw <= 0) continue;
    // prefer opponent we can finish (incl. commander damage), else lowest life, tiebreak most threatening board
    safe.sort((a, b) => (a.life - b.life) - (boardPower(g, a) - boardPower(g, b)) * 0.3);
    plan.push({ uid: c.uid, defender: safe[0].id });
  }
  declareAttackers(g, pid, plan);
}

/** Block to survive; otherwise take favorable blocks. */
export function aiBlock(g: Game, pid: number) {
  const p = g.players[pid]; const inc = attackers(g).filter(a => a.attacking === pid).sort((a, b) => power(g, b) - power(g, a));
  let incoming = inc.reduce((s, a) => s + power(g, a), 0); const used = new Set<number>(); const plan: { blocker: number; attacker: number }[] = [];
  const cmdIncoming = (a: Card) => isCommander(g, a) && (p.cmdDamage[a.owner] || 0) + power(g, a) >= 21;
  for (const a of inc) {
    const ap = power(g, a), at = toughness(g, a);
    const bl = creatures(p).filter(b => !used.has(b.uid) && canBlock(g, b, a));
    const good = bl.filter(b => (toughness(g, b) > ap && !hasKw(a, 'deathtouch')) || ((power(g, b) >= at || hasKw(b, 'deathtouch')) && value(g, b) <= value(g, a))).sort((x, y) => value(g, x) - value(g, y))[0];
    const desperate = incoming >= p.life || cmdIncoming(a);
    const pick = good ?? (desperate ? bl.sort((x, y) => value(g, x) - value(g, y))[0] : undefined);
    if (pick) { used.add(pick.uid); plan.push({ blocker: pick.uid, attacker: a.uid }); if (!hasKw(a, 'trample')) incoming -= ap; }
  }
  declareBlockers(g, pid, plan);
}
void COLORS;
