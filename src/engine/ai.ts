import { teamworkPick, modesMax, sneakRets, crewPick,
  Game, Card, Player, Target, TargetSpec, Effect, def, isType, hasKw, cmc, power, toughness, opponents, canCast, castSpell, playLand, canPlayLand,
  declareAttackers, declareBlockers, canAttack, canBlock, attackers, isCommander, legalTargets, findCard, creatures, canActivate, activate, isMain,
  setAutoTarget, setAI, pass, instantSpeed, isPermanentCard, CardDef, nextAlive, Decision, slotTargets, TCtx, spellSlots, abilitySlots, modeRange,
  maxX, locate, ctr, manaAvailable, castZone, costOf, planPayment,
} from './engine';
import type { Amt, ActAbility, Modes, TSlot } from './types';

const num = (a: Amt | undefined, x = 0): number => (typeof a === 'number' ? a : a === 'X' ? x : 0);
const boardPower = (g: Game, p: Player) => creatures(p).reduce((s, c) => s + power(g, c), 0);
export const value = (g: Game, c: Card) => isType(c, 'Creature') || isType(c, 'Planeswalker')
  ? power(g, c) + toughness(g, c) + (def(c).keywords?.length ?? 0) * 2 + (def(c).abilities || def(c).triggers || def(c).mana ? 2 : 0) + (isCommander(g, c) ? 6 : 0) + ctr(c, 'loyalty')
  : cmc(def(c)) + (isType(c, 'Land') ? 2 : 0) + (c.token ? -1 : 0) + (isCommander(g, c) ? 6 : 0);
const HARMFUL = ['damage', 'destroy', 'exile', 'exileGainPower', 'exilePath', 'bounce', 'counter', 'tuck', 'tap', 'fight', 'bite', 'goad', 'sac', 'discard', 'lose', 'mill'];
const dmgOf = (effects: Effect[], x = 0) => num(effects.find(e => e.op === 'damage')?.n, x);
const stackCtl = (g: Game, id?: number) => g.stack.find(s => s.id === id)?.controller;
const ownerOfT = (g: Game, t: Target) => t.player ?? (t.card !== undefined ? (locate(g, t.card)?.c.owner) : stackCtl(g, t.stack));

/** Choose targets for a list of slots. Harmful slots hit opponents' best stuff; helpful ones help our own. */
export function chooseTargets(g: Game, pid: number, slots: TSlot[], effects: Effect[], mandatory: boolean, srcUid?: number, x = 0): (Target | undefined)[] | null {
  const out: (Target | undefined)[] = []; const tc: TCtx = { srcUid, taken: out };
  const n = dmgOf(effects, x);
  for (const s of slots) {
    const legal = slotTargets(g, pid, s, { ...tc, taken: [...out] }).filter(t => !out.some(o => o && o.card === t.card && o.player === t.player && o.stack === t.stack));
    const harm = s.harm ?? effects.some(e => HARMFUL.includes(e.op));
    let pick: Target | undefined;
    if (s.who === 'spell' || s.who === 'ability') pick = legal.filter(t => (stackCtl(g, t.stack) !== pid) === harm).pop();
    else {
      const cards = legal.filter(t => t.card !== undefined).map(t => ({ t, c: locate(g, t.card!)?.c })).filter(o => o.c) as { t: Target; c: Card }[];
      const players = legal.filter(t => t.player !== undefined);
      if (harm) {
        const enemy = cards.filter(o => o.c.owner !== pid).sort((a, b) => value(g, b.c) - value(g, a.c));
        const killable = n ? enemy.filter(o => !isType(o.c, 'Creature') || toughness(g, o.c) - o.c.damage <= n || o.c.deathtouched) : enemy;
        const opps = players.filter(t => t.player !== pid).sort((a, b) => g.players[a.player!].life - g.players[b.player!].life);
        if (killable[0] && (value(g, killable[0].c) >= (n ? 3 : 4) || !opps.length)) pick = killable[0].t;
        else if (opps[0]) pick = opps[0];
        else if (enemy[0] && !n) pick = enemy[0].t;
      } else {
        const mine = cards.filter(o => o.c.owner === pid).sort((a, b) => value(g, b.c) - value(g, a.c));
        pick = mine[0]?.t ?? players.find(t => t.player === pid);
      }
      if (!pick && (mandatory || !s.opt) && !s.opt) {
        const worst = cards.sort((a, b) => (harm ? (a.c.owner === pid ? 1 : 0) - (b.c.owner === pid ? 1 : 0) : 0) || value(g, a.c) - value(g, b.c));
        pick = worst[0]?.t ?? (harm ? players.find(t => t.player !== pid) : players.find(t => t.player === pid)) ?? players[0];
      }
    }
    if (!pick && !s.opt) return null;
    out.push(pick);
  }
  return out;
}
/** Legacy single-target hook. */
export function chooseTarget(g: Game, pid: number, spec: TargetSpec, effects: Effect[], mandatory: boolean): Target | undefined {
  const legal = legalTargets(g, pid, spec); if (!legal.length) return undefined;
  return chooseTargets(g, pid, [{ who: spec.toLowerCase().endsWith('spell') ? 'spell' : spec === 'any' ? 'any' : 'perm', harm: effects.some(e => HARMFUL.includes(e.op)) } as TSlot], effects, mandatory)?.[0]
    ?? (mandatory ? legal[0] : undefined);
}
setAutoTarget(chooseTarget);

/** Heuristic choices for prompts raised while an effect resolves. */
export function decide(g: Game, d: Decision): unknown {
  const p = g.players[d.pid];
  switch (d.kind) {
    case 'may': {
      if (/^.*: pay \{/.test(d.text) || /^.*: pay /.test(d.text)) { // "unless pays" / optional payment
        const top = g.stack[g.stack.length - 1];
        const mine = g.res?.item.controller === d.pid;
        if (mine) return manaAvailable(p) >= 2; // optional payments for our own effects
        if (/counter/.test(d.text)) return true; // protect our spell
        return manaAvailable(p) >= 3 || g.active !== d.pid || !top;
      }
      if (/Pay \d+ life/.test(d.text)) return p.life > 12;
      return !/sacrifice|discard|lose \d+ life/.test(d.text) || p.life > 10;
    }
    case 'pick': {
      const worstFirst = (d.zone === 'hand' || d.zone === 'battlefield') && d.min > 0;
      const sorted = [...d.cards].sort((a, b) => worstFirst ? value(g, a) - value(g, b) : landNeed(g, p, b) - landNeed(g, p, a) || value(g, b) - value(g, a));
      return sorted.slice(0, worstFirst ? d.min : d.max).map(c => c.uid);
    }
    case 'scry': {
      const lands = p.battlefield.filter(c => isType(c, 'Land')).length + p.hand.filter(c => isType(c, 'Land')).length;
      const keep = d.cards.filter(c => (isType(c, 'Land') ? lands < 5 : cmc(def(c)) <= lands + 2));
      return { top: keep.map(c => c.uid), away: d.cards.filter(c => !keep.includes(c)).map(c => c.uid) };
    }
    case 'order': return d.items.map((_, i) => i);
    case 'color': { const cnt: Record<string, number> = {}; for (const c of [...p.hand, ...p.battlefield]) for (const k of def(c).colors) cnt[k] = (cnt[k] ?? 0) + 1; return [...d.options].sort((a, b) => (cnt[b] ?? 0) - (cnt[a] ?? 0))[0]; }
    case 'player': { const opps = d.players.filter(x => x !== d.pid); return (opps.length ? opps : d.players).sort((a, b) => boardPower(g, g.players[b]) - boardPower(g, g.players[a]))[0]; }
  }
}
const landNeed = (g: Game, p: Player, c: Card) => isType(c, 'Land') && p.battlefield.filter(x => isType(x, 'Land')).length < 6 ? 5 : 0;

/** Pick modes: the first fillable ones that do something useful. */
export function chooseModes(g: Game, pid: number, m: Modes, srcUid?: number): number[] {
  const ok = m.list.map((md, i) => ({ i, s: (md.tslots ?? []).every(s => s.opt || slotTargets(g, pid, s, { srcUid }).length > 0) ? scoreFx(g, pid, md.effects) : -99 }))
    .filter(o => o.s > -99).sort((a, b) => b.s - a.s);
  return ok.slice(0, Math.max(m.min, Math.min(m.max, ok.filter(o => o.s > 0).length))).map(o => o.i).sort((a, b) => a - b);
}
setAI({ targets: (g, pid, slots, effects, mandatory, srcUid) => chooseTargets(g, pid, slots, effects, mandatory, srcUid), decide, modes: chooseModes, castNow: (g, pid, c) => tryCast(g, pid, c) });

/** Rough usefulness of a list of effects for the controller. */
function scoreFx(g: Game, pid: number, fx: Effect[], x = 0): number {
  let s = 0;
  for (const e of fx) {
    const n = Math.max(1, num(e.n, x));
    switch (e.op) {
      case 'draw': s += (e.pl === 'opps' || e.pl === 'all' ? (e.pl === 'all' ? 1 : -1) : 3) * n; break;
      case 'token': case 'copyTok': s += 3 * n; break;
      case 'addC': s += e.who === 'self' || e.who === 'chosen' ? 2 * n : 2; break;
      case 'gain': s += g.players[pid].life < 20 ? 1 : 0.3; break;
      case 'damage': case 'destroy': case 'exile': case 'bounce': case 'counter': case 'fight': case 'bite': case 'tuck': s += 4; break;
      case 'lose': s += e.pl === 'you' ? -n * (g.players[pid].life < 10 ? 2 : 0.5) : n; break;
      case 'search': case 'ret': case 'retPick': case 'look': case 'exileTop': s += 3; break;
      case 'pump': case 'grant': s += isMain(g) || g.step === 'blockers' ? 1 : 0.2; break;
      case 'scry': case 'surveil': case 'mill': case 'proliferate': case 'explore': s += 1; break;
      case 'may': case 'if': case 'repeat': case 'unless': s += scoreFx(g, pid, e.sub ?? [], x); break;
      case 'sac': s += e.pl === 'you' ? -3 : 3; break;
      case 'discard': s += e.pl === 'you' ? -1 : 2; break;
      case 'addMana': case 'untap': case 'tap': if (e.who === 'self' || e.op === 'addMana') break; s += e.op === 'tap' ? 1 : 0.5; break;
      default: s += 0.5;
    }
  }
  return s;
}

/** Try to cast a spell with sensible X / kicker / modes / targets. */
function tryCast(g: Game, pid: number, c: Card, mandatory = false): boolean {
  const d = def(c); const p = g.players[pid];
  const kicked = !!d.kicker && canCast(g, pid, c, { kicked: true }) && !!planPayment(p, costOf(g, c, { kicked: true }));
  // warp: only when we can't cast it normally and it does something on entering (or can attack right away)
  const warp = !!d.warp && p.hand.includes(c) && !canCast(g, pid, c) && canCast(g, pid, c, { warp: true }) && (hasKw(c, 'haste') || (d.triggers ?? []).some(t => t.ev === 'etb'));
  if (d.warp && p.hand.includes(c) && !canCast(g, pid, c) && !warp) return false;
  // teamwork: tap creatures that won't attack this turn anyway
  const tw = d.teamwork !== undefined ? teamworkPick(g, pid, c) : null;
  const teamwork = !!tw && (g.active !== pid || g.step === 'main2' || tw.every(x => !canAttack(g, x, true)));
  const x = d.cost.x ? maxX(g, pid, c, { kicked }) : 0;
  if (d.cost.x && x < 1) return false;
  let modes: number[] | undefined; let fx = d.spell?.effects ?? [];
  const slots = spellSlots(d); let active = slots.map((_, i) => i);
  if (d.spell?.modes) { modes = chooseModes(g, pid, { ...d.spell.modes, max: modesMax(g, pid, d.spell.modes, { teamwork }) }, c.uid); if (modes.length < d.spell.modes.min) return false; active = modes.flatMap(i => modeRange(d.spell!.modes!, i)); fx = modes.flatMap(i => d.spell!.modes!.list[i].effects); }
  if (!isPermanentCard(d) && scoreFx(g, pid, fx, x) <= 0 && !mandatory) return false;
  let targets: (Target | undefined)[] = [];
  if (active.length) {
    const aura = d.aura && isPermanentCard(d);
    const ts = chooseTargets(g, pid, active.map(i => aura ? { ...slots[i], harm: !!d.aura!.harm } : slots[i]), fx, mandatory, c.uid, x); if (!ts) return false;
    if (!aura && fx.some(e => HARMFUL.includes(e.op)) && ts.every(t => !t || ownerOfT(g, t) === pid) && !mandatory) return false;
    targets = slots.map(() => undefined); active.forEach((i, k) => (targets[i] = ts[k]));
  }
  return castSpell(g, pid, c.uid, { targets, modes, x, kicked, warp, teamwork: teamwork ? tw!.map(q => q.uid) : undefined });
}
const isCounter = (d: CardDef) => !!(d.spell?.effects.some(e => e.op === 'counter' || (e.op === 'unless' && e.sub?.some(s => s.op === 'counter'))));
const isPump = (d: CardDef) => !!d.spell?.effects.some(e => e.op === 'pump') && !d.spell.effects.some(e => HARMFUL.includes(e.op));

/** Should we counter the top stack item? */
function isThreat(g: Game, pid: number, top: Game['stack'][number]) {
  if (top.kind !== 'spell' || top.controller === pid) return false;
  const d = def(top.card!);
  if (isCommander(g, top.card!) || (isPermanentCard(d) && cmc(d) >= 4)) return true;
  if ((top.targets ?? [top.target]).some(t => t && ownerOfT(g, t) === pid)) return true;
  if (d.static || d.statics?.length || d.triggers?.some(t => t.on === 'upkeep' || t.ev === 'upkeep')) return true;
  return cmc(d) >= 5;
}

/** Decide whether (and how) to activate ability i of c now. */
/** How much damage opponents could swing at this walker next turn. */
function walkerThreat(g: Game, w: Card) { return Math.max(0, ...opponents(g, w.owner).map(o => creatures(o).filter(c => !hasKw(c, 'defender')).reduce((s, c) => s + Math.max(0, power(g, c)), 0))); }
function tryActivate(g: Game, pid: number, c: Card, i: number, a: ActAbility, phase: 'main' | 'eot' | 'combat'): boolean {
  if (a.manaAb || !canActivate(g, pid, c, i)) return false;
  const uk = `${g.turn}:${c.uid}:${i}`; if ((USED.get(uk) ?? 0) >= 2) return false;
  if (USED.size > 500) USED.clear();
  const p = g.players[pid];
  const lands = p.battlefield.filter(x => isType(x, 'Land')).length;
  // costs we don't like paying casually
  if (a.sac && !a.zone && isType(c, 'Creature') && !c.token && !a.effects.some(e => e.op === 'search')) return false;
  if (a.life && p.life - a.life < 12) return false;
  if (a.sacF && !a.sacF.f.types?.includes('Land')) { const fodder = p.battlefield.filter(x => x !== c && x.token); if (fodder.length < a.sacF.n) return false; }
  if (a.discard && p.hand.length < 4 && !a.zone) return false;
  if (a.zone === 'hand') { // cycling & co.: only when the card is dead weight
    const dead = isType(c, 'Land') ? lands >= 6 : cmc(def(c)) > lands + 3; if (!dead || phase !== 'eot') return false;
  }
  if (a.tap && isType(c, 'Creature') && phase === 'main' && g.step === 'main1' && canAttack(g, c, true) && power(g, c) >= 2) return false;
  if (a.equip) { if (c.attachedTo !== undefined && locate(g, c.attachedTo)?.c.owner === pid) return false; const host = (a.tslots ?? []).length ? chooseTargets(g, pid, a.tslots!, [], false, c.uid)?.[0] : undefined; if (!host) return false; USED.set(uk, 9); return activate(g, pid, c.uid, i, { targets: [host] }); }
  if (a.crew !== undefined) {
    // crew / saddle: only before attacking, with creatures that wouldn't attack anyway (or are much weaker than the vehicle)
    if (phase !== 'main' || g.step !== 'main1' || c.sick || hasKw(c, 'defender') || (a.effects.some(e => e.op === 'crewed') && isType(c, 'Creature')) || (a.effects.some(e => e.op === 'saddled') && c.saddled === g.turn)) return false;
    const picks = crewPick(g, pid, c, a.crew); if (!picks) return false;
    const idle = picks.every(x => !canAttack(g, x, true) || power(g, x) < 1); const weak = picks.reduce((t, x) => t + power(g, x), 0) < (def(c).power ?? 0);
    if (!idle && !weak) return false;
    const done = activate(g, pid, c.uid, i, { crew: picks.map(x => x.uid) }); if (done) USED.set(uk, 9); return done;
  }
  if (a.station) {
    if (g.step !== 'main2' || (def(c).stationAt !== undefined && ctr(c, 'charge') >= def(c).stationAt!)) return false;
    const done = activate(g, pid, c.uid, i, {}); if (done) USED.set(uk, 9); return done;
  }
  let modes: number[] | undefined; let fx = a.effects; const slots = abilitySlots(a); let active = slots.map((_, k) => k);
  if (a.modes) { modes = chooseModes(g, pid, a.modes, c.uid); active = modes.flatMap(k => modeRange(a.modes!, k)); fx = modes.flatMap(k => a.modes!.list[k].effects); }
  const loy = ctr(c, 'loyalty'); const x = a.loyX ? Math.max(1, loy - 1) : a.mana?.x ? maxX(g, pid, c, { abil: a.mana, exclude: a.tap ? c.uid : undefined }) : 0;
  if (a.mana?.x && !a.loyX && x < 1) return false;
  let sc = scoreFx(g, pid, fx, x);
  if (a.loyalty !== undefined) {
    // planeswalkers: tick up when threatened, use minus for removal/value, fire the ultimate when it's safe
    const threat = walkerThreat(g, c); const cost = a.loyX ? -x : a.loyalty; const after = loy + cost;
    const best = (def(c).abilities ?? []).map((b, j) => ({ b, j })).filter(({ b, j }) => b.loyalty !== undefined && j !== i && canActivate(g, pid, c, j));
    if (cost >= 0) sc += threat >= loy ? 5 : 2;
    else {
      if (after < 1 && sc < 8) return false; // don't throw the walker away for little
      if (threat >= after && after > 0 && sc < 5 && best.some(({ b }) => (b.loyalty ?? 0) >= 0)) return false; // threatened: prefer ticking up
      if (cost <= -6) sc += threat < after ? 8 : 2; // ultimate
    }
  }
  if (sc <= 0) return false;
  if (fx.every(e => e.op === 'pump' || e.op === 'grant') && phase !== 'combat' && a.loyalty === undefined) return false;
  let targets: (Target | undefined)[] = [];
  if (active.length) {
    const ts = chooseTargets(g, pid, active.map(k => slots[k]), fx, false, c.uid, x); if (!ts) return false;
    if (fx.some(e => HARMFUL.includes(e.op)) && ts.every(t => !t || ownerOfT(g, t) === pid)) return false;
    targets = slots.map(() => undefined); active.forEach((k, j) => (targets[k] = ts[j]));
  }
  const done = activate(g, pid, c.uid, i, { targets, modes, x }); if (done) USED.set(uk, (USED.get(uk) ?? 0) + 1); return done;
}
const USED = new Map<string, number>();
function useAbilities(g: Game, pid: number, phase: 'main' | 'eot' | 'combat'): boolean {
  const p = g.players[pid];
  for (const c of [...p.battlefield, ...p.hand, ...p.graveyard]) {
    const abs = def(c).abilities ?? [];
    for (let i = 0; i < abs.length; i++) if (tryActivate(g, pid, c, i, abs[i], phase)) return true;
  }
  return false;
}

/** Main-phase plan: land, then best spells, then useful abilities. Returns true if it did something. */
function mainPhase(g: Game, pid: number): boolean {
  const p = g.players[pid];
  const lands = p.hand.filter(c => canPlayLand(g, pid, c));
  if (lands.length) {
    const need = (col: string) => p.hand.filter(c => (def(c).cost as unknown as Record<string, number>)[col]).length;
    const score = (c: Card) => (def(c).mana?.[0].add ?? []).reduce((s, m) => s + (m === 'IDENTITY' || m === 'ANY' ? 10 : m.split('|').reduce((x, k) => Math.max(x, need(k)), 0)), 0) - (def(c).etbTapped ? 1 : 0);
    return playLand(g, pid, lands.sort((a, b) => score(b) - score(a))[0].uid);
  }
  const opts = [...p.hand, ...p.command, ...p.graveyard, ...p.exile].filter(c => castZone(g, pid, c) && canCast(g, pid, c, { x: def(c).cost.x ? 1 : 0 }) && !isCounter(def(c)) && !isPump(def(c)))
    .sort((a, b) => (def(b).mana ? 100 : 0) + cmc(def(b)) - ((def(a).mana ? 100 : 0) + cmc(def(a))));
  for (const c of opts) if (tryCast(g, pid, c)) return true;
  if (g.step === 'main2' || !creatures(p).some(c => canAttack(g, c, true))) { if (useAbilities(g, pid, 'main')) return true; }
  else for (const c of p.battlefield) { const abs = def(c).abilities ?? []; for (let i = 0; i < abs.length; i++) if ((abs[i].loyalty !== undefined || abs[i].equip || abs[i].crew !== undefined) && tryActivate(g, pid, c, i, abs[i], 'main')) return true; }
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
    const pump = pumps.find(x => incoming < toughness(g, c) - c.damage + num(def(x).spell!.effects.find(e => e.op === 'pump')?.m));
    if (pump && value(g, c) >= 4 && castSpell(g, pid, pump.uid, { targets: [{ card: c.uid }] })) return true;
  }
  return false;
}
/** Respond to burn aimed at our creature with a pump if that saves it. */
function savePump(g: Game, pid: number): boolean {
  const top = g.stack[g.stack.length - 1]; if (!top || top.controller === pid || top.target?.card === undefined) return false;
  const c = findCard(g, top.target.card); if (!c || c.owner !== pid) return false;
  const n = num(top.effects.find(e => e.op === 'damage')?.n, top.x); if (!n) return false;
  const pump = g.players[pid].hand.find(x => isPump(def(x)) && canCast(g, pid, x) && toughness(g, c) - c.damage + num(def(x).spell!.effects.find(e => e.op === 'pump')?.m) > n);
  return !!pump && value(g, c) >= 4 && castSpell(g, pid, pump.uid, { targets: [{ card: c.uid }] });
}

/** Sneak: swap a weak unblocked attacker for a better creature that enters tapped and attacking. */
function sneak(g: Game, pid: number): boolean {
  const rets = sneakRets(g, pid); if (!rets.length) return false;
  const ret = [...rets].sort((a, b) => value(g, a) - value(g, b))[0];
  for (const c of g.players[pid].hand) { const d = def(c); if (!d.sneak || !canCast(g, pid, c, { sneak: true }) || (d.power ?? 0) <= power(g, ret)) continue;
    const slots = spellSlots(d); if (slots.length) continue;
    if (castSpell(g, pid, c.uid, { sneak: true, sneakRet: ret.uid })) return true; }
  return false;
}
/** The AI has priority: do at most one thing, or pass. */
export function aiPriority(g: Game, pid: number) {
  const p = g.players[pid]; const top = g.stack[g.stack.length - 1];
  if (top) {
    if (isThreat(g, pid, top)) {
      const ctr = p.hand.find(c => isCounter(def(c)) && canCast(g, pid, c));
      if (ctr && tryCast(g, pid, ctr, true)) return;
    }
    if (savePump(g, pid)) return;
    pass(g, pid); return;
  }
  if (g.active === pid && isMain(g) && mainPhase(g, pid)) return;
  if (g.step === 'blockers' && g.active === pid && sneak(g, pid)) return;
  if (g.step === 'blockers' && (combatTrick(g, pid) || (p.battlefield.some(c => c.attacking !== undefined || c.blocking !== undefined) && useAbilities(g, pid, 'combat')))) return;
  // End of an opponent's turn (right before ours): use instants and abilities.
  if (g.step === 'end' && g.active !== pid && nextAlive(g, g.active) === pid) {
    if (useAbilities(g, pid, 'eot')) return;
    for (const c of p.hand) { const d = def(c); if (instantSpeed(d) && !isCounter(d) && !isPump(d) && canCast(g, pid, c) && tryCast(g, pid, c)) return; }
  }
  pass(g, pid);
}

/** Attack the most vulnerable opponent where the attacker won't simply die; hold back defenders when threatened. */
export function aiAttack(g: Game, pid: number) {
  const p = g.players[pid]; const opp = opponents(g, pid);
  const threat = Math.max(0, ...opp.map(o => boardPower(g, o)));
  let elig = creatures(p).filter(c => canAttack(g, c)).sort((a, b) => power(g, b) - power(g, a));
  const forced = (c: Card) => !!def(c).mustAttack || !!c.goad || hasKw(c, '_mustattack');
  if (p.life <= threat * 1.5) { const keep = Math.ceil(elig.filter(c => !hasKw(c, 'vigilance')).length / 2); elig = elig.filter((c, i) => hasKw(c, 'vigilance') || forced(c) || i < elig.length - keep); }
  const plan: { uid: number; defender: number; pw?: number }[] = []; const onW: Record<number, number> = {};
  for (const c of elig) {
    const pw = power(g, c), tg = toughness(g, c);
    const cands = c.goad ? opp.filter(o => o.id !== c.goad!.by) : opp; const pool = cands.length ? cands : opp;
    if (!forced(c) && (pw <= 0 || (def(c).mana && pw <= 1))) continue; // keep mana dorks home
    const safe = pool.filter(o => {
      const bl = creatures(o).filter(b => !b.tapped && canBlock(g, b, c));
      if (hasKw(c, 'menace') && bl.length < 2) return true;
      return !bl.some(b => (power(g, b) >= tg || hasKw(b, 'deathtouch')) && !(pw >= toughness(g, b) && value(g, b) >= value(g, c)));
    });
    const choice = safe.length ? safe : forced(c) ? pool : [];
    if (!choice.length) continue;
    choice.sort((a, b) => (a.life - b.life) - (boardPower(g, a) - boardPower(g, b)) * 0.3);
    // go after opposing planeswalkers when it kills one (or the walker is close to its ultimate)
    const ws = choice.flatMap(o => o.battlefield.filter(w => isType(w, 'Planeswalker') && !isType(w, 'Creature')).map(w => ({ o, w, left: ctr(w, 'loyalty') - (onW[w.uid] ?? 0) })))
      .filter(x => x.left > 0 && (x.left <= pw || ctr(x.w, 'loyalty') >= 5 || x.o.life > 20)).sort((a, b) => (a.left <= pw ? 0 : 1) - (b.left <= pw ? 0 : 1) || b.left - a.left);
    if (ws.length && !(choice[0].life <= pw)) { onW[ws[0].w.uid] = (onW[ws[0].w.uid] ?? 0) + pw; plan.push({ uid: c.uid, defender: ws[0].o.id, pw: ws[0].w.uid }); continue; }
    plan.push({ uid: c.uid, defender: choice[0].id });
  }
  if (!declareAttackers(g, pid, plan)) declareAttackers(g, pid, plan.filter(x => forced(findCard(g, x.uid)!)));
}

/** Block to survive; otherwise take favorable blocks. */
export function aiBlock(g: Game, pid: number) {
  const p = g.players[pid]; const inc = attackers(g).filter(a => a.attacking === pid).sort((a, b) => power(g, b) - power(g, a));
  let incoming = inc.filter(a => a.atkPw === undefined).reduce((s, a) => s + power(g, a), 0); const used = new Set<number>(); const plan: { blocker: number; attacker: number }[] = [];
  const cmdLethal = (a: Card) => isCommander(g, a) && (p.cmdDamage[a.owner] || 0) + power(g, a) >= 21;
  for (const a of inc) {
    const ap = power(g, a), at = toughness(g, a);
    const bl = creatures(p).filter(b => !used.has(b.uid) && canBlock(g, b, a)).sort((x, y) => value(g, x) - value(g, y));
    const wk = a.atkPw !== undefined ? findCard(g, a.atkPw) : undefined;
    const desperate = (!wk && incoming >= p.life) || cmdLethal(a) || (!!wk && ap >= ctr(wk, 'loyalty'));
    if (hasKw(a, 'menace')) {
      if (desperate && bl.length >= 2) { for (const b of bl.slice(0, 2)) { used.add(b.uid); plan.push({ blocker: b.uid, attacker: a.uid }); } incoming -= ap; }
      continue;
    }
    const good = bl.find(b => (toughness(g, b) > ap && !hasKw(a, 'deathtouch')) || ((power(g, b) >= at || hasKw(b, 'deathtouch')) && value(g, b) <= value(g, a)));
    const pick = good ?? (desperate ? bl[0] : undefined);
    if (pick) { used.add(pick.uid); plan.push({ blocker: pick.uid, attacker: a.uid }); if (!hasKw(a, 'trample') && !wk) incoming -= ap; }
  }
  declareBlockers(g, pid, plan);
}
