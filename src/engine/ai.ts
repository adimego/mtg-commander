import { Game, Card, Player, Target, TargetSpec, Effect, def, isType, hasKw, cmc, power, toughness, opponents, canCast, castSpell, playLand, canPlayLand, declareAttackers, declareBlockers, canAttack, canBlock, attackers, isCommander, legalTargets, findCard, creatures, canActivate, activate, isMain, setAutoTarget, pass, instantSpeed, isPermanentCard, CardDef, nextAlive } from './engine';

const boardPower = (g: Game, p: Player) => creatures(p).reduce((s, c) => s + power(g, c), 0);
export const value = (g: Game, c: Card) => power(g, c) + toughness(g, c) + (def(c).keywords?.length ?? 0) * 2 + (def(c).abilities || def(c).triggers || def(c).mana ? 2 : 0) + (isCommander(g, c) ? 6 : 0);
const HARMFUL = ['damage', 'destroy', 'exileGainPower', 'exilePath', 'bounce', 'counter'];
const dmgOf = (effects: Effect[]) => effects.find(e => e.op === 'damage')?.n ?? 0;

/** Heuristic target choice. Harmful effects hit opponents' best stuff; beneficial ones help our own. */
export function chooseTarget(g: Game, pid: number, spec: TargetSpec, effects: Effect[], mandatory: boolean): Target | undefined {
  const legal = legalTargets(g, pid, spec); if (!legal.length) return undefined;
  const harmful = effects.some(e => HARMFUL.includes(e.op));
  if (spec.toLowerCase().endsWith('spell')) {
    const opp = legal.filter(t => g.stack.find(s => s.id === t.stack)!.controller !== pid);
    return opp.length ? opp[opp.length - 1] : undefined;
  }
  const cards = legal.filter(t => t.card !== undefined).map(t => findCard(g, t.card!)!);
  const players = legal.filter(t => t.player !== undefined);
  if (!harmful) { const mine = cards.filter(c => c.owner === pid).sort((a, b) => power(g, b) - power(g, a)); return mine[0] ? { card: mine[0].uid } : undefined; }
  const n = dmgOf(effects);
  const enemy = cards.filter(c => c.owner !== pid).sort((a, b) => value(g, b) - value(g, a));
  const killable = n ? enemy.filter(c => toughness(g, c) - c.damage <= n || c.deathtouched) : enemy;
  if (killable[0] && (value(g, killable[0]) >= (n ? 3 : 5) || mandatory)) return { card: killable[0].uid };
  const oppPlayers = players.filter(t => t.player !== pid).sort((a, b) => g.players[a.player!].life - g.players[b.player!].life);
  if (oppPlayers[0]) return oppPlayers[0];
  if (mandatory) { if (enemy[0]) return { card: enemy[0].uid }; const own = cards.sort((a, b) => value(g, a) - value(g, b)); if (own[0]) return { card: own[0].uid }; return players[0]; }
  return undefined;
}
setAutoTarget(chooseTarget);

function tryCast(g: Game, pid: number, c: Card, mandatory = false): boolean {
  const d = def(c); let t: Target | undefined;
  if (d.spell?.target) { t = chooseTarget(g, pid, d.spell.target, d.spell.effects, mandatory); if (!t) return false; }
  return castSpell(g, pid, c.uid, t);
}
const isCounter = (d: CardDef) => !!d.spell?.effects.some(e => e.op === 'counter');
const isPump = (d: CardDef) => !!d.spell?.effects.some(e => e.op === 'pump');

/** Should we counter the top stack item? */
function isThreat(g: Game, pid: number, top: Game['stack'][number]) {
  if (top.kind !== 'spell' || top.controller === pid) return false;
  const d = def(top.card!);
  if (isCommander(g, top.card!) || (isPermanentCard(d) && cmc(d) >= 4)) return true;
  if (top.target?.player === pid) return true;
  if (top.target?.card !== undefined && findCard(g, top.target.card)?.owner === pid) return true;
  if (d.static || d.triggers?.some(t => t.on === 'upkeep')) return true;
  return cmc(d) >= 5;
}

/** Main-phase plan: land, then best spells, then useful abilities. Returns true if it did something. */
function mainPhase(g: Game, pid: number): boolean {
  const p = g.players[pid];
  const lands = p.hand.filter(c => canPlayLand(g, pid, c));
  if (lands.length) {
    const need = (col: string) => p.hand.filter(c => (def(c).cost as unknown as Record<string, number>)[col]).length;
    const score = (c: Card) => def(c).mana![0].add.reduce((s, m) => s + (m === 'IDENTITY' ? 10 : need(m)), 0);
    return playLand(g, pid, lands.sort((a, b) => score(b) - score(a))[0].uid);
  }
  const opts = [...p.hand, ...p.command].filter(c => canCast(g, pid, c) && !isCounter(def(c)) && !isPump(def(c)))
    .filter(c => !(def(c).spell?.effects.some(e => e.op === 'gainLife') && p.life > 25))
    .sort((a, b) => (def(b).mana ? 100 : 0) + cmc(def(b)) - ((def(a).mana ? 100 : 0) + cmc(def(a))));
  for (const c of opts) if (tryCast(g, pid, c)) return true;
  // ramp / card-draw abilities in main 2 (keep mana for spells first)
  for (const c of p.battlefield) {
    const abs = def(c).abilities ?? [];
    for (let i = 0; i < abs.length; i++) {
      const a = abs[i]; if (!canActivate(g, pid, c, i) || a.target) continue;
      const ramp = a.effects.some(e => e.op === 'searchBasic'); const drawish = a.effects.some(e => e.op === 'draw');
      const lands = p.battlefield.filter(x => isType(x, 'Land')).length;
      if (g.step === 'main2' && ((ramp && (!isType(c, 'Creature') || lands < 6)) || (drawish && lands >= 6))) { if (activate(g, pid, c.uid, i)) return true; }
    }
  }
  return false;
}
/** Targeted activated abilities (pingers, Royal Assassin, Seal of Fire). */
function useTargetedAbilities(g: Game, pid: number, onlyKills: boolean): boolean {
  const p = g.players[pid];
  for (const c of p.battlefield) {
    const abs = def(c).abilities ?? [];
    for (let i = 0; i < abs.length; i++) {
      const a = abs[i]; if (!a.target || !canActivate(g, pid, c, i)) continue;
      const t = chooseTarget(g, pid, a.target, a.effects, false); if (!t) continue;
      if (onlyKills && t.card === undefined) continue;
      if (a.sac && t.card === undefined && !onlyKills && !isType(c, 'Creature')) continue; // keep Seal of Fire for creatures
      if (activate(g, pid, c.uid, i, t)) return true;
    }
  }
  return false;
}
/** Combat tricks after blocks: pump a creature so it survives or wins its fight. */
function combatTrick(g: Game, pid: number): boolean {
  const p = g.players[pid]; const pumps = p.hand.filter(c => isPump(def(c)) && canCast(g, pid, c)); if (!pumps.length) return false;
  const mine = p.battlefield.filter(c => c.attacking !== undefined || c.blocking !== undefined);
  for (const c of mine) {
    const foes = c.attacking !== undefined ? (c.blockedBy ?? []).map(u => findCard(g, u)).filter(Boolean) as Card[] : [findCard(g, c.blocking!)].filter(Boolean) as Card[];
    if (!foes.length) continue;
    const incoming = foes.reduce((s, f) => s + power(g, f), 0); const dies = incoming >= toughness(g, c) - c.damage && !foes.some(f => hasKw(f, 'deathtouch'));
    if (!dies) continue;
    const pump = pumps.find(x => incoming < toughness(g, c) - c.damage + (def(x).spell!.effects[0].m ?? 0));
    if (pump && value(g, c) >= 4 && castSpell(g, pid, pump.uid, { card: c.uid })) return true;
  }
  return false;
}
/** Respond to removal/burn aimed at our creature with a pump if that saves it. */
function savePump(g: Game, pid: number): boolean {
  const top = g.stack[g.stack.length - 1]; if (!top || top.controller === pid || top.target?.card === undefined) return false;
  const c = findCard(g, top.target.card); if (!c || c.owner !== pid) return false;
  const n = top.effects.find(e => e.op === 'damage')?.n; if (!n) return false;
  const pump = g.players[pid].hand.find(x => isPump(def(x)) && canCast(g, pid, x) && toughness(g, c) - c.damage + (def(x).spell!.effects[0].m ?? 0) > n);
  return !!pump && value(g, c) >= 4 && castSpell(g, pid, pump.uid, { card: c.uid });
}

/** The AI has priority: do at most one thing, or pass. */
export function aiPriority(g: Game, pid: number) {
  const p = g.players[pid]; const top = g.stack[g.stack.length - 1];
  if (top) {
    if (isThreat(g, pid, top)) {
      const ctr = p.hand.find(c => isCounter(def(c)) && canCast(g, pid, c));
      if (ctr && tryCast(g, pid, ctr)) return;
    }
    if (savePump(g, pid)) return;
    pass(g, pid); return;
  }
  if (g.active === pid && isMain(g) && mainPhase(g, pid)) return;
  if (g.step === 'blockers' && combatTrick(g, pid)) return;
  // End of an opponent's turn (right before ours): use instants and pingers.
  if (g.step === 'end' && g.active !== pid) {
    if (useTargetedAbilities(g, pid, nextAlive(g, g.active) !== pid)) return;
    if (nextAlive(g, g.active) === pid) for (const c of p.hand) { const d = def(c); if (instantSpeed(d) && !isCounter(d) && !isPump(d) && canCast(g, pid, c) && tryCast(g, pid, c)) return; }
  }
  if (g.active === pid && g.step === 'main2' && useTargetedAbilities(g, pid, true)) return;
  pass(g, pid);
}

/** Attack the most vulnerable opponent where the attacker won't simply die; hold back defenders when threatened. */
export function aiAttack(g: Game, pid: number) {
  const p = g.players[pid]; const opp = opponents(g, pid);
  const threat = Math.max(0, ...opp.map(o => boardPower(g, o)));
  let elig = creatures(p).filter(c => canAttack(g, c)).sort((a, b) => power(g, b) - power(g, a));
  if (p.life <= threat * 1.5) { const keep = Math.ceil(elig.filter(c => !hasKw(c, 'vigilance')).length / 2); elig = elig.filter((c, i) => hasKw(c, 'vigilance') || def(c).mustAttack || i < elig.length - keep); }
  const plan: { uid: number; defender: number }[] = [];
  for (const c of elig) {
    const pw = power(g, c), tg = toughness(g, c);
    if (pw <= 0 || (def(c).mana && pw <= 1)) continue; // keep mana dorks home
    const safe = opp.filter(o => {
      const bl = creatures(o).filter(b => !b.tapped && (!hasKw(c, 'flying') || hasKw(b, 'flying') || hasKw(b, 'reach')));
      if (hasKw(c, 'menace') && bl.length < 2) return true;
      return !bl.some(b => (power(g, b) >= tg || hasKw(b, 'deathtouch')) && !(pw >= toughness(g, b) && value(g, b) >= value(g, c)));
    });
    if (!safe.length) continue;
    safe.sort((a, b) => (a.life - b.life) - (boardPower(g, a) - boardPower(g, b)) * 0.3);
    plan.push({ uid: c.uid, defender: safe[0].id });
  }
  declareAttackers(g, pid, plan);
}

/** Block to survive; otherwise take favorable blocks. */
export function aiBlock(g: Game, pid: number) {
  const p = g.players[pid]; const inc = attackers(g).filter(a => a.attacking === pid).sort((a, b) => power(g, b) - power(g, a));
  let incoming = inc.reduce((s, a) => s + power(g, a), 0); const used = new Set<number>(); const plan: { blocker: number; attacker: number }[] = [];
  const cmdLethal = (a: Card) => isCommander(g, a) && (p.cmdDamage[a.owner] || 0) + power(g, a) >= 21;
  for (const a of inc) {
    const ap = power(g, a), at = toughness(g, a);
    const bl = creatures(p).filter(b => !used.has(b.uid) && canBlock(g, b, a)).sort((x, y) => value(g, x) - value(g, y));
    const desperate = incoming >= p.life || cmdLethal(a);
    if (hasKw(a, 'menace')) {
      if (desperate && bl.length >= 2) { for (const b of bl.slice(0, 2)) { used.add(b.uid); plan.push({ blocker: b.uid, attacker: a.uid }); } incoming -= ap; }
      continue;
    }
    const good = bl.find(b => (toughness(g, b) > ap && !hasKw(a, 'deathtouch')) || ((power(g, b) >= at || hasKw(b, 'deathtouch')) && value(g, b) <= value(g, a)));
    const pick = good ?? (desperate ? bl[0] : undefined);
    if (pick) { used.add(pick.uid); plan.push({ blocker: pick.uid, attacker: a.uid }); if (!hasKw(a, 'trample')) incoming -= ap; }
  }
  declareBlockers(g, pid, plan);
}
