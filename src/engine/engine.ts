import cardData from '../data/cards.json';
import deckData from '../data/decks.json';

// ---------------- types ----------------
export type Color = 'W' | 'U' | 'B' | 'R' | 'G';
export type ManaSym = Color | 'C' | 'ANY' | 'IDENTITY';
export const COLORS: Color[] = ['W', 'U', 'B', 'R', 'G'];
export interface Cost { generic: number; W?: number; U?: number; B?: number; R?: number; G?: number }
export type TargetSpec = 'any' | 'creature' | 'oppCreature' | 'tappedCreature' | 'nonblackCreature' | 'nonartifactCreature' | 'spell' | 'noncreatureSpell' | 'creatureSpell';
export interface Effect { op: string; n?: number; m?: number; toHand?: boolean }
export interface ManaAbility { add: ManaSym[] }
export interface ActAbility { label: string; tap?: boolean; mana?: Cost; sac?: boolean; target?: TargetSpec; effects: Effect[] }
export interface TriggerDef { on: string; filter?: string; cond?: string; target?: TargetSpec; label: string; effects: Effect[] }
export interface CardDef {
  id: string; name: string; types: string[]; legendary?: boolean; basic?: boolean; cost: Cost; colors: Color[]; power?: number; toughness?: number;
  keywords?: string[]; text: string; typeLine?: string; img?: string; art?: string;
  mana?: ManaAbility[]; abilities?: ActAbility[]; triggers?: TriggerDef[]; spell?: { target?: TargetSpec; effects: Effect[] };
  static?: { p: number; t: number; others?: boolean }; mustAttack?: boolean; uncounterable?: boolean;
}
export interface DeckDef { id: string; name: string; commander: string; cards: string[] }
export const CARDS: Record<string, CardDef> = Object.fromEntries((cardData as unknown as CardDef[]).map(c => [c.id, c]));
export const DECKS = deckData as DeckDef[];

export interface Card { uid: number; id: string; owner: number; tapped: boolean; sick: boolean; damage: number; pp: number; pt: number; deathtouched?: boolean; attacking?: number; blockedBy?: number[]; blocking?: number }
export interface Player { id: number; name: string; human: boolean; life: number; deckName: string; commanderId: string; commanderCasts: number; identity: Color[]; library: Card[]; hand: Card[]; battlefield: Card[]; graveyard: Card[]; exile: Card[]; command: Card[]; cmdDamage: Record<number, number>; lost: boolean; landPlayed: boolean; mulligans: number; drewEmpty?: boolean }
export interface Target { player?: number; card?: number; stack?: number }
export interface GameEvent { player?: number; mv?: number; amount?: number }
export interface StackItem { id: number; kind: 'spell' | 'ability' | 'trigger'; controller: number; sourceId: string; sourceUid: number; card?: Card; effects: Effect[]; targetSpec?: TargetSpec; target?: Target; label: string; event?: GameEvent; uncounterable?: boolean }
interface Pending { controller: number; sourceId: string; sourceUid: number; trig: TriggerDef; event?: GameEvent }
export const STEPS = ['untap', 'upkeep', 'draw', 'main1', 'attackers', 'blockers', 'firstStrike', 'damage', 'main2', 'end', 'cleanup'] as const;
export type Step = typeof STEPS[number];
export interface Game {
  players: Player[]; active: number; step: Step; turn: number; log: string[]; seed: number; nextUid: number; winner: number | null; started: boolean;
  stack: StackItem[]; priority: number | null; passes: number; awaiting: 'attack' | 'block' | null; blockersDone: number[];
  pending: Pending[]; choice: Pending | null;
}

// ---------------- helpers ----------------
export const def = (c: { id: string }) => CARDS[c.id];
export const isType = (c: { id: string }, t: string) => def(c).types.includes(t);
export const hasKw = (c: { id: string }, k: string) => !!def(c).keywords?.includes(k);
export const cmc = (d: CardDef) => d.cost.generic + COLORS.reduce((s, k) => s + (d.cost[k] || 0), 0);
export const isCommander = (g: Game, c: Card) => g.players[c.owner].commanderId === c.id;
export const isPermanentCard = (d: CardDef) => !d.types.includes('Instant') && !d.types.includes('Sorcery');
export const log = (g: Game, m: string) => { g.log.push(`T${g.turn} ${m}`); if (g.log.length > 400) g.log.shift(); };
const nm = (c: { id: string }) => def(c).name;
function rand(g: Game) { g.seed = (g.seed + 0x6d2b79f5) | 0; let t = g.seed; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }
export function shuffle<T>(g: Game, a: T[]) { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rand(g) * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } }
export const alive = (g: Game) => g.players.filter(p => !p.lost);
export const opponents = (g: Game, pid: number) => g.players.filter(p => !p.lost && p.id !== pid);
export function nextAlive(g: Game, pid: number) { for (let i = 1; i <= g.players.length; i++) { const q = (pid + i) % g.players.length; if (!g.players[q].lost) return q; } return pid; }
const firstAliveFrom = (g: Game, pid: number) => (g.players[pid].lost ? nextAlive(g, pid) : pid);
export function findCard(g: Game, uid: number): Card | undefined { for (const p of g.players) { const c = p.battlefield.find(x => x.uid === uid); if (c) return c; } }
export const creatures = (p: Player) => p.battlefield.filter(c => isType(c, 'Creature'));

export function colorIdentity(d: CardDef): Color[] { return COLORS.filter(k => d.colors.includes(k) || (d.cost[k] || 0) > 0 || new RegExp(`\\{${k}\\}`).test(d.text)); }
export function validateDeck(d: DeckDef): string[] {
  const errs: string[] = []; const cmd = CARDS[d.commander];
  if (!cmd || !cmd.legendary || !cmd.types.includes('Creature')) errs.push('commander must be a legendary creature');
  if (d.cards.length + 1 !== 100) errs.push(`deck has ${d.cards.length + 1} cards, needs 100`);
  const ident = cmd ? colorIdentity(cmd) : []; const seen = new Set<string>();
  for (const id of d.cards) {
    const c = CARDS[id]; if (!c) { errs.push(`unknown card ${id}`); continue; }
    if (!c.basic) { if (seen.has(id) || id === d.commander) errs.push(`duplicate ${c.name}`); seen.add(id); }
    if (colorIdentity(c).some(k => !ident.includes(k))) errs.push(`${c.name} outside color identity`);
  }
  return errs;
}

// ---------------- setup ----------------
function inst(g: Game, id: string, owner: number): Card { return { uid: g.nextUid++, id, owner, tapped: false, sick: false, damage: 0, pp: 0, pt: 0 }; }
export interface NewGameOpts { seed?: number; decks?: string[]; names?: string[]; humans?: number[]; skipAiMulligan?: boolean }
export function newGame(o: NewGameOpts = {}): Game {
  const g: Game = { players: [], active: 0, step: 'untap', turn: 0, log: [], seed: o.seed ?? (Date.now() | 0), nextUid: 1, winner: null, started: false, stack: [], priority: null, passes: 0, awaiting: null, blockersDone: [], pending: [], choice: null };
  const deckIds = o.decks ?? DECKS.map(d => d.id); const humans = o.humans ?? [0];
  deckIds.forEach((did, i) => {
    const d = DECKS.find(x => x.id === did)!;
    const p: Player = { id: i, name: o.names?.[i] ?? (humans.includes(i) ? 'You' : `AI ${i}`), human: humans.includes(i), life: 40, deckName: d.name, commanderId: d.commander, commanderCasts: 0, identity: colorIdentity(CARDS[d.commander]), library: d.cards.map(id => inst(g, id, i)), hand: [], battlefield: [], graveyard: [], exile: [], command: [inst(g, d.commander, i)], cmdDamage: {}, lost: false, landPlayed: false, mulligans: 0 };
    g.players.push(p); shuffle(g, p.library); draw(g, i, 7);
  });
  if (!o.skipAiMulligan) for (const p of g.players) if (!p.human) { const l = p.hand.filter(c => isType(c, 'Land')).length; if (l < 2 || l > 5) mulligan(g, p.id); }
  log(g, 'Game created. Each player starts at 40 life.');
  return g;
}
export function mulligan(g: Game, pid: number) {
  const p = g.players[pid]; p.library.push(...p.hand); p.hand = []; shuffle(g, p.library); draw(g, pid, 7); p.mulligans++;
  const bottom = Math.max(0, p.mulligans - 1);
  for (let i = 0; i < bottom; i++) { const c = [...p.hand].sort((a, b) => (isType(b, 'Land') ? -1 : cmc(def(b))) - (isType(a, 'Land') ? -1 : cmc(def(a))))[0]; p.hand = p.hand.filter(x => x !== c); p.library.unshift(c); }
  log(g, `${p.name} mulligans${p.mulligans === 1 ? ' (free)' : `, bottoms ${bottom}`}.`);
}
export function startGame(g: Game) { g.started = true; beginTurn(g, 0); }
export function draw(g: Game, pid: number, n: number) { const p = g.players[pid]; for (let i = 0; i < n; i++) { const c = p.library.pop(); if (!c) { p.drewEmpty = true; break; } p.hand.push(c); } }

// ---------------- turn structure & priority ----------------
function beginTurn(g: Game, pid: number) {
  g.active = pid; g.turn++; g.blockersDone = [];
  const p = g.players[pid]; p.landPlayed = false;
  for (const c of p.battlefield) { c.tapped = false; c.sick = false; }
  log(g, `--- ${p.name}'s turn ---`);
  enterStep(g, 'untap');
}
function givePriority(g: Game) { g.passes = 0; g.priority = firstAliveFrom(g, g.active); flushTriggers(g); }
export const attackers = (g: Game) => g.players[g.active].battlefield.filter(c => c.attacking !== undefined);
export const isDefending = (g: Game, pid: number) => attackers(g).some(c => c.attacking === pid);
const strikesFirst = (c: Card) => hasKw(c, 'first strike') || hasKw(c, 'double strike');
const combatants = (g: Game) => [...attackers(g), ...g.players.flatMap(p => p.battlefield.filter(c => c.blocking !== undefined))];
function enterStep(g: Game, s: Step) {
  if (g.winner !== null) return;
  g.step = s; g.priority = null; g.awaiting = null; const act = g.players[g.active];
  switch (s) {
    case 'untap': return enterStep(g, 'upkeep');
    case 'upkeep': emit(g, 'upkeep', { player: g.active }); break;
    case 'draw': draw(g, g.active, 1); checkState(g); break;
    case 'attackers':
      if (!creatures(act).some(c => canAttack(g, c, true))) return enterStep(g, 'main2');
      g.awaiting = 'attack'; return;
    case 'blockers': if (!attackers(g).length) return enterStep(g, 'main2'); g.blockersDone = []; g.awaiting = 'block'; maybeFinishBlocks(g); return;
    case 'firstStrike': if (!combatants(g).some(strikesFirst)) return enterStep(g, 'damage'); dealCombat(g, true); break;
    case 'damage': dealCombat(g, false, combatants(g).some(strikesFirst)); break;
    case 'main2': clearCombat(g); break;
    case 'end': emit(g, 'endStep', { player: g.active }); break;
    case 'cleanup': cleanup(g); return beginTurn(g, nextAlive(g, g.active));
  }
  if (g.winner === null) givePriority(g);
}
function advanceStep(g: Game) {
  if (g.players[g.active].lost) { cleanup(g); return beginTurn(g, nextAlive(g, g.active)); }
  enterStep(g, STEPS[STEPS.indexOf(g.step) + 1]);
}
/** Player passes priority. When all living players pass in a row: resolve top of stack, or move to the next step. */
export function pass(g: Game, pid: number) {
  if (g.priority !== pid || g.winner !== null || g.choice) return false;
  g.passes++;
  if (g.passes >= alive(g).length) {
    g.passes = 0;
    if (g.stack.length) { resolveTop(g); if (g.winner === null) givePriority(g); }
    else advanceStep(g);
  } else g.priority = nextAlive(g, pid);
  return true;
}
function acted(g: Game) { g.passes = 0; flushTriggers(g); }
function clearCombat(g: Game) { for (const p of g.players) for (const c of p.battlefield) { delete c.attacking; delete c.blockedBy; delete c.blocking; } }
function cleanup(g: Game) {
  clearCombat(g);
  for (const p of g.players) for (const c of p.battlefield) { c.damage = 0; c.pp = 0; c.pt = 0; c.deathtouched = false; }
  const p = g.players[g.active];
  while (p.hand.length > 7) { const c = [...p.hand].sort((a, b) => cmc(def(b)) - cmc(def(a)))[0]; p.hand = p.hand.filter(x => x !== c); p.graveyard.push(c); log(g, `${p.name} discards ${nm(c)}.`); }
}

// ---------------- characteristics ----------------
function anthem(g: Game, c: Card, key: 'p' | 't') { return g.players[c.owner].battlefield.reduce((s, x) => { const st = def(x).static; return st && !(st.others && x === c) ? s + st[key] : s; }, 0); }
export const power = (g: Game, c: Card) => (def(c).power ?? 0) + c.pp + anthem(g, c, 'p');
export const toughness = (g: Game, c: Card) => (def(c).toughness ?? 0) + c.pt + anthem(g, c, 't');

// ---------------- mana ----------------
const symColors = (p: Player, s: ManaSym): string[] => s === 'ANY' ? COLORS : s === 'IDENTITY' ? (p.identity.length ? p.identity : ['C']) : [s];
const canTapNow = (c: Card) => !c.tapped && (!isType(c, 'Creature') || !c.sick || hasKw(c, 'haste'));
export const manaSources = (p: Player) => p.battlefield.filter(c => def(c).mana && canTapNow(c));
export const manaAvailable = (p: Player) => manaSources(p).reduce((s, c) => s + def(c).mana![0].add.length, 0);
export function costOf(g: Game, c: Card): Cost {
  const base = { ...def(c).cost }; const p = g.players[c.owner];
  if (isCommander(g, c) && p.command.includes(c)) base.generic += 2 * p.commanderCasts; // commander tax
  return base;
}
/** Mana abilities don't use the stack: choose sources (lands, rocks, dorks) that pay the cost. Returns sources to tap, or null. */
export function findPayment(p: Player, cost: Cost, exclude?: number): Card[] | null {
  const srcs = manaSources(p).filter(c => c.uid !== exclude).map(c => ({ c, units: def(c).mana![0].add.map(s => symColors(p, s)) }));
  const flex = (s: { units: string[][] }) => new Set(s.units.flat()).size;
  const chosen = new Set<number>(); const pool: string[][] = []; const pay: Card[] = [];
  const take = (ok: (o: string[]) => boolean, generic: boolean, remaining: number) => {
    const i = pool.findIndex(ok); if (i >= 0) { pool.splice(i, 1); return true; }
    const cand = srcs.filter(s => !chosen.has(s.c.uid) && s.units.some(ok))
      .sort((a, b) => flex(a) - flex(b) || (generic ? (remaining >= 2 ? b.units.length - a.units.length : a.units.length - b.units.length) : 0) || (isType(a.c, 'Creature') ? 1 : 0) - (isType(b.c, 'Creature') ? 1 : 0))[0];
    if (!cand) return false;
    chosen.add(cand.c.uid); pay.push(cand.c); const u = [...cand.units]; u.splice(u.findIndex(ok), 1); pool.push(...u); return true;
  };
  for (const k of COLORS) for (let i = 0; i < (cost[k] || 0); i++) if (!take(o => o.includes(k), false, 0)) return null;
  for (let i = 0; i < cost.generic; i++) if (!take(() => true, true, cost.generic - i)) return null;
  return pay;
}
function pay(p: Player, cost: Cost, exclude?: number) { const s = findPayment(p, cost, exclude); if (!s) return false; for (const c of s) c.tapped = true; return true; }

// ---------------- targeting ----------------
export const needsTarget = (d: CardDef) => !!d.spell?.target;
export function validTarget(g: Game, pid: number, spec: TargetSpec | undefined, t: Target | undefined, selfStackId?: number): boolean {
  if (!spec) return true; if (!t) return false;
  if (spec.endsWith('pell') || spec === 'spell') {
    const it = g.stack.find(s => s.id === t.stack); if (!it || it.kind !== 'spell' || it.id === selfStackId) return false;
    const cr = isType(it.card!, 'Creature');
    return spec === 'spell' || (spec === 'creatureSpell' ? cr : !cr);
  }
  if (t.card !== undefined) {
    const c = findCard(g, t.card); if (!c || !isType(c, 'Creature')) return false;
    if (hasKw(c, 'hexproof') && c.owner !== pid) return false;
    switch (spec) {
      case 'oppCreature': return c.owner !== pid;
      case 'tappedCreature': return c.tapped;
      case 'nonblackCreature': return !def(c).colors.includes('B');
      case 'nonartifactCreature': return !isType(c, 'Artifact');
      default: return spec === 'any' || spec === 'creature';
    }
  }
  return spec === 'any' && t.player !== undefined && !!g.players[t.player] && !g.players[t.player].lost;
}
export function legalTargets(g: Game, pid: number, spec?: TargetSpec): Target[] {
  if (!spec) return [];
  const all: Target[] = [...g.stack.map(s => ({ stack: s.id })), ...g.players.flatMap(p => p.battlefield.map(c => ({ card: c.uid }))), ...g.players.map(p => ({ player: p.id }))];
  return all.filter(t => validTarget(g, pid, spec, t));
}
export function describeTarget(g: Game, t?: Target): string {
  if (!t) return '';
  if (t.player !== undefined) return g.players[t.player].name;
  if (t.card !== undefined) { const c = findCard(g, t.card); return c ? `${nm(c)} (${g.players[c.owner].name})` : '(gone)'; }
  const s = g.stack.find(x => x.id === t.stack); return s ? `${s.label}` : '(gone)';
}

// ---------------- casting & abilities ----------------
export const isMain = (g: Game) => g.step === 'main1' || g.step === 'main2';
const sorceryTiming = (g: Game, pid: number) => g.active === pid && isMain(g) && g.stack.length === 0 && !g.awaiting;
export const hasPriority = (g: Game, pid: number) => g.started && g.winner === null && g.priority === pid && !g.choice && !g.awaiting;
export function canPlayLand(g: Game, pid: number, c: Card) { const p = g.players[pid]; return hasPriority(g, pid) && sorceryTiming(g, pid) && !p.landPlayed && isType(c, 'Land') && p.hand.includes(c); }
export function playLand(g: Game, pid: number, uid: number) {
  const p = g.players[pid]; const c = p.hand.find(x => x.uid === uid); if (!c || !canPlayLand(g, pid, c)) return false;
  p.hand = p.hand.filter(x => x !== c); p.battlefield.push(c); p.landPlayed = true; log(g, `${p.name} plays ${nm(c)}.`); return true;
}
export const instantSpeed = (d: CardDef) => d.types.includes('Instant') || !!d.keywords?.includes('flash');
export function canCast(g: Game, pid: number, c: Card) {
  const p = g.players[pid]; const d = def(c);
  if (!hasPriority(g, pid) || p.lost || isType(c, 'Land')) return false;
  if (!p.hand.includes(c) && !p.command.includes(c)) return false;
  if (!instantSpeed(d) && !sorceryTiming(g, pid)) return false;
  if (d.spell?.target && !legalTargets(g, pid, d.spell.target).length) return false;
  return !!findPayment(p, costOf(g, c));
}
export function castSpell(g: Game, pid: number, uid: number, t?: Target) {
  const p = g.players[pid]; const c = [...p.hand, ...p.command].find(x => x.uid === uid); if (!c || !canCast(g, pid, c)) return false;
  const d = def(c); if (!validTarget(g, pid, d.spell?.target, t)) return false;
  const cost = costOf(g, c); if (!pay(p, cost)) return false;
  const fromCmd = p.command.includes(c);
  p.hand = p.hand.filter(x => x !== c); p.command = p.command.filter(x => x !== c);
  if (fromCmd) p.commanderCasts++;
  const item: StackItem = { id: g.nextUid++, kind: 'spell', controller: pid, sourceId: c.id, sourceUid: c.uid, card: c, effects: d.spell?.effects ?? [], targetSpec: d.spell?.target, target: t, label: d.name, uncounterable: d.uncounterable };
  g.stack.push(item);
  log(g, `${p.name} casts ${d.name}${t ? ` targeting ${describeTarget(g, t)}` : ''}${fromCmd ? ` from the command zone (tax ${2 * (p.commanderCasts - 1)})` : ''}.`);
  emit(g, 'cast', { player: pid, mv: cmc(d) }, c);
  acted(g); return true;
}
export function canActivate(g: Game, pid: number, c: Card, i: number) {
  const a = def(c).abilities?.[i]; const p = g.players[pid];
  if (!a || !hasPriority(g, pid) || c.owner !== pid || !p.battlefield.includes(c)) return false;
  if (a.tap && !canTapNow(c)) return false;
  if (a.target && !legalTargets(g, pid, a.target).length) return false;
  return !a.mana || !!findPayment(p, a.mana, a.tap ? c.uid : undefined);
}
export function activate(g: Game, pid: number, uid: number, i: number, t?: Target) {
  const p = g.players[pid]; const c = p.battlefield.find(x => x.uid === uid); if (!c || !canActivate(g, pid, c, i)) return false;
  const a = def(c).abilities![i]; if (!validTarget(g, pid, a.target, t)) return false;
  if (a.mana && !pay(p, a.mana, a.tap ? c.uid : undefined)) return false;
  if (a.tap) c.tapped = true;
  log(g, `${p.name} activates ${nm(c)}: ${a.label}${t ? ` → ${describeTarget(g, t)}` : ''}.`);
  g.stack.push({ id: g.nextUid++, kind: 'ability', controller: pid, sourceId: c.id, sourceUid: c.uid, effects: a.effects, targetSpec: a.target, target: t, label: `${nm(c)}: ${a.label}` });
  if (a.sac) { log(g, `${p.name} sacrifices ${nm(c)}.`); destroy(g, c, 'sacrifice'); }
  acted(g); return true;
}

// ---------------- triggers ----------------
function trigMatches(g: Game, src: Card, t: TriggerDef, type: string, ev: GameEvent, subj?: Card): boolean {
  const me = src.owner;
  switch (t.on) {
    case 'etb': case 'dies': case 'attacks': case 'combatDamagePlayer': return t.on === type && subj === src;
    case 'damageOpponent': return type === 'combatDamagePlayer' && subj === src && ev.player !== me;
    case 'yourCreatureDies': return type === 'dies' && !!subj && subj.owner === me && isType(subj, 'Creature');
    case 'creatureAttacksYou': return type === 'attacks' && ev.player === me;
    case 'upkeep': case 'endStep': return t.on === type && ev.player === me && condOk(g, me, t.cond);
    case 'youCast': return type === 'cast' && ev.player === me && (t.filter !== 'instantSorcery' || !isPermanentCard(def(subj!)));
    case 'anyCastNoncreature': return type === 'cast' && !isType(subj!, 'Creature');
    default: return false;
  }
}
function condOk(g: Game, pid: number, cond?: string) {
  const cs = creatures(g.players[pid]);
  if (cond === 'totalPower8') return cs.reduce((s, c) => s + power(g, c), 0) >= 8;
  if (cond === 'power5') return cs.some(c => power(g, c) >= 5);
  return true;
}
const PROWESS: TriggerDef = { on: 'youCast', label: 'prowess +1/+1', effects: [{ op: 'pumpSelf', n: 1, m: 1 }] };
/** Collect triggered abilities for an event. `subj` is the card the event is about (it may already have left the battlefield). */
function emit(g: Game, type: string, ev: GameEvent, subj?: Card) {
  const sources = g.players.flatMap(p => p.battlefield);
  if (subj && !sources.includes(subj) && (type === 'dies')) sources.push(subj); // leaves-the-battlefield look-back
  for (const src of sources) {
    const trigs = [...(def(src).triggers ?? [])];
    if (hasKw(src, 'prowess') && type === 'cast' && ev.player === src.owner && !isType(subj!, 'Creature')) trigs.push({ ...PROWESS, on: '_prowess' });
    for (const t of trigs) if (t.on === '_prowess' || trigMatches(g, src, t, type, ev, subj)) g.pending.push({ controller: src.owner, sourceId: src.id, sourceUid: src.uid, trig: t, event: ev });
  }
}
/** Put pending triggers on the stack in APNAP order. Human-controlled targeted triggers wait for a choice. */
export let autoTarget: (g: Game, pid: number, spec: TargetSpec, effects: Effect[], mandatory: boolean) => Target | undefined = () => undefined;
export function setAutoTarget(f: typeof autoTarget) { autoTarget = f; }
function flushTriggers(g: Game) {
  if (g.choice) return;
  const N = g.players.length;
  g.pending.sort((a, b) => ((a.controller - g.active + N) % N) - ((b.controller - g.active + N) % N));
  while (g.pending.length) {
    const p = g.pending.shift()!; if (g.players[p.controller].lost) continue;
    if (p.trig.target) {
      if (!legalTargets(g, p.controller, p.trig.target).length) { log(g, `${CARDS[p.sourceId].name}'s trigger has no legal target.`); continue; }
      if (g.players[p.controller].human) { g.choice = p; return; }
      const t = autoTarget(g, p.controller, p.trig.target, p.trig.effects, true); if (!t) continue;
      pushTrigger(g, p, t);
    } else pushTrigger(g, p);
  }
}
function pushTrigger(g: Game, p: Pending, t?: Target) {
  const label = `${CARDS[p.sourceId].name}: ${p.trig.label}`;
  g.stack.push({ id: g.nextUid++, kind: 'trigger', controller: p.controller, sourceId: p.sourceId, sourceUid: p.sourceUid, effects: p.trig.effects, targetSpec: p.trig.target, target: t, label, event: p.event });
  log(g, `⚡ Trigger: ${label}${t ? ` → ${describeTarget(g, t)}` : ''}.`);
}
/** Human picks the target for a pending triggered ability. */
export function chooseTriggerTarget(g: Game, t: Target) {
  const p = g.choice; if (!p || !validTarget(g, p.controller, p.trig.target, t)) return false;
  g.choice = null; pushTrigger(g, p, t); flushTriggers(g); return true;
}

// ---------------- resolution ----------------
function resolveTop(g: Game) {
  const it = g.stack.pop()!; const p = g.players[it.controller];
  if (it.targetSpec && !validTarget(g, it.controller, it.targetSpec, it.target, it.id)) {
    log(g, `${it.label} fizzles (target is gone).`); if (it.card) toGraveyardOrCommand(g, it.card); return;
  }
  if (it.kind === 'spell' && isPermanentCard(def(it.card!))) {
    const c = it.card!; Object.assign(c, { tapped: false, damage: 0, pp: 0, pt: 0, sick: isType(c, 'Creature') });
    p.battlefield.push(c); log(g, `${nm(c)} enters the battlefield under ${p.name}'s control.`);
    emit(g, 'etb', {}, c); checkState(g); return;
  }
  log(g, `${it.label} resolves.`);
  runEffects(g, it);
  if (it.card) toGraveyardOrCommand(g, it.card);
  checkState(g);
}
function toGraveyardOrCommand(g: Game, c: Card) { const o = g.players[c.owner]; if (isCommander(g, c)) { o.command.push(c); log(g, `${nm(c)} goes to the command zone.`); } else o.graveyard.push(c); }
function searchBasic(g: Game, pid: number, toHand = false) {
  const p = g.players[pid]; const l = p.library.find(c => def(c).basic && def(c).mana![0].add.some(s => p.identity.includes(s as Color)));
  if (!l) return; p.library = p.library.filter(x => x !== l);
  if (toHand) p.hand.push(l); else { l.tapped = true; p.battlefield.push(l); }
  shuffle(g, p.library); log(g, `${p.name} puts ${nm(l)} ${toHand ? 'into their hand' : 'onto the battlefield tapped'}.`);
}
function runEffects(g: Game, it: StackItem) {
  const pid = it.controller; const p = g.players[pid]; const t = it.target;
  const tc = t?.card !== undefined ? findCard(g, t.card) : undefined; const tOwner = tc?.owner;
  const src = findCard(g, it.sourceUid) ?? ({ id: it.sourceId } as Card);
  for (const e of it.effects) {
    const n = e.n ?? 0;
    switch (e.op) {
      case 'draw': draw(g, pid, n); break;
      case 'loseLife': p.life -= n; break;
      case 'gainLife': p.life += n; break;
      case 'damage': if (tc) { tc.damage += n; if (hasKw(src, 'deathtouch')) tc.deathtouched = true; log(g, `${CARDS[it.sourceId].name} deals ${n} damage to ${nm(tc)}.`); } else if (t?.player !== undefined) { g.players[t.player].life -= n; log(g, `${CARDS[it.sourceId].name} deals ${n} damage to ${g.players[t.player].name}.`); } break;
      case 'damageEachOpp': for (const o of opponents(g, pid)) o.life -= n; log(g, `${CARDS[it.sourceId].name} deals ${n} damage to each opponent.`); break;
      case 'damageEventPlayer': if (it.event?.player !== undefined) { g.players[it.event.player].life -= n; log(g, `${CARDS[it.sourceId].name} deals ${n} damage to ${g.players[it.event.player].name}.`); } break;
      case 'drain': { const os = opponents(g, pid); for (const o of os) o.life -= n; p.life += n * os.length; break; }
      case 'destroy': if (tc) destroy(g, tc); break;
      case 'exileGainPower': if (tc) { const pw = power(g, tc); exileCard(g, tc); g.players[tOwner!].life += pw; } break;
      case 'exilePath': if (tc) { exileCard(g, tc); searchBasic(g, tOwner!); } break;
      case 'bounce': if (tc) { leave(g, tc); g.players[tc.owner].hand.push(tc); log(g, `${nm(tc)} returns to ${g.players[tc.owner].name}'s hand.`); } break;
      case 'pump': if (tc) { tc.pp += n; tc.pt += e.m ?? 0; } break;
      case 'pumpSelf': { const s = findCard(g, it.sourceUid); if (s) { s.pp += n; s.pt += e.m ?? 0; } break; }
      case 'searchBasic': for (let i = 0; i < n; i++) searchBasic(g, pid, e.toHand); break;
      case 'drawEventAmount': draw(g, pid, it.event?.amount ?? 0); break;
      case 'eventPlayerDrawsEventAmount': if (it.event?.player !== undefined && !g.players[it.event.player].lost) draw(g, it.event.player, it.event.amount ?? 0); break;
      case 'counter': {
        const s = g.stack.find(x => x.id === t?.stack); if (!s) break;
        if (s.uncounterable) { log(g, `${s.label} can't be countered.`); break; }
        g.stack = g.stack.filter(x => x !== s); log(g, `${s.label} is countered.`); if (s.card) toGraveyardOrCommand(g, s.card); break;
      }
    }
  }
}
function leave(g: Game, c: Card) {
  const o = g.players[c.owner]; o.battlefield = o.battlefield.filter(x => x !== c);
  Object.assign(c, { tapped: false, damage: 0, pp: 0, pt: 0, deathtouched: false, sick: false }); delete c.attacking; delete c.blocking;
  for (const a of attackers(g)) if (a.blockedBy?.includes(c.uid)) { /* keep: attacker remains "blocked" */ }
  delete c.blockedBy;
}
function exileCard(g: Game, c: Card) { leave(g, c); const o = g.players[c.owner]; if (isCommander(g, c)) { o.command.push(c); log(g, `${nm(c)} is exiled → command zone.`); } else { o.exile.push(c); log(g, `${nm(c)} is exiled.`); } }
export function destroy(g: Game, c: Card, why = 'dies') {
  const o = g.players[c.owner]; if (!o.battlefield.includes(c)) return;
  const wasCreature = isType(c, 'Creature');
  // blocked attackers stay blocked: remember on the attacker that it was blocked
  leave(g, c);
  if (isCommander(g, c)) { o.command.push(c); log(g, `${nm(c)} ${why === 'sacrifice' ? 'is sacrificed' : 'dies'} → command zone.`); }
  else { o.graveyard.push(c); if (why !== 'sacrifice') log(g, `${nm(c)} dies.`); }
  if (wasCreature) emit(g, 'dies', { player: c.owner }, c);
}
function lose(g: Game, p: Player, why: string) {
  p.lost = true; log(g, `${p.name} loses (${why}).`);
  p.exile.push(...p.battlefield); p.battlefield = [];
  g.stack = g.stack.filter(s => s.controller !== p.id); g.pending = g.pending.filter(x => x.controller !== p.id);
  if (g.choice?.controller === p.id) g.choice = null;
  for (const c of attackers(g)) if (c.attacking === p.id) delete c.attacking;
  if (g.priority === p.id) g.priority = nextAlive(g, p.id);
  g.blockersDone = g.blockersDone.filter(x => x !== p.id);
  const a = alive(g); if (a.length === 1) { g.winner = a[0].id; g.priority = null; log(g, `${a[0].name} wins the game!`); }
}
export function checkState(g: Game) {
  for (let loop = 0; loop < 10; loop++) {
    let changed = false;
    for (const p of g.players) for (const c of [...p.battlefield]) if (isType(c, 'Creature') && (c.damage >= toughness(g, c) || c.deathtouched || toughness(g, c) <= 0)) { destroy(g, c); changed = true; }
    if (!changed) break;
  }
  for (const p of g.players) {
    if (p.lost || g.winner !== null) continue;
    const cd = Object.entries(p.cmdDamage).find(([, v]) => v >= 21);
    if (p.life <= 0) lose(g, p, 'life 0'); else if (cd) lose(g, p, `21 commander damage from ${g.players[+cd[0]].name}`); else if (p.drewEmpty) lose(g, p, 'drew from empty library');
  }
}

// ---------------- combat ----------------
export const canAttack = (g: Game, c: Card, ignoreStep = false) => (ignoreStep || (g.step === 'attackers' && g.awaiting === 'attack')) && c.owner === g.active && isType(c, 'Creature') && !hasKw(c, 'defender') && !c.tapped && (!c.sick || hasKw(c, 'haste')) && c.attacking === undefined;
export function declareAttackers(g: Game, pid: number, list: { uid: number; defender: number }[]) {
  if (g.active !== pid || g.awaiting !== 'attack') return false;
  const p = g.players[pid]; const opp = opponents(g, pid);
  // "attacks each combat if able"
  for (const c of p.battlefield) if (def(c).mustAttack && canAttack(g, c) && !list.some(l => l.uid === c.uid) && opp.length) list = [...list, { uid: c.uid, defender: opp.sort((a, b) => a.life - b.life)[0].id }];
  for (const { uid, defender } of list) {
    const c = p.battlefield.find(x => x.uid === uid); const d = g.players[defender];
    if (!c || !canAttack(g, c) || !d || d.lost || defender === pid) continue;
    c.attacking = defender; c.blockedBy = []; if (!hasKw(c, 'vigilance')) c.tapped = true;
    log(g, `${nm(c)} attacks ${d.name}.`);
  }
  g.awaiting = null;
  for (const c of attackers(g)) emit(g, 'attacks', { player: c.attacking }, c);
  givePriority(g); return true;
}
export const canBlock = (g: Game, b: Card, a: Card) => isType(b, 'Creature') && !b.tapped && b.blocking === undefined && a.attacking === b.owner && (!hasKw(a, 'flying') || hasKw(b, 'flying') || hasKw(b, 'reach'));
export const defenders = (g: Game) => [...new Set(attackers(g).map(a => a.attacking!))].filter(p => !g.players[p].lost);
export function declareBlockers(g: Game, defender: number, list: { blocker: number; attacker: number }[]) {
  if (g.awaiting !== 'block' || g.blockersDone.includes(defender)) return false;
  const p = g.players[defender];
  for (const { blocker, attacker } of list) {
    const b = p.battlefield.find(x => x.uid === blocker); const a = attackers(g).find(x => x.uid === attacker);
    if (!b || !a || !canBlock(g, b, a)) continue;
    b.blocking = a.uid; a.blockedBy!.push(b.uid);
  }
  for (const a of attackers(g)) if (a.attacking === defender && hasKw(a, 'menace') && a.blockedBy!.length === 1) { // menace: needs 2+ blockers
    const b = findCard(g, a.blockedBy![0]); if (b) delete b.blocking; a.blockedBy = [];
  }
  for (const a of attackers(g)) if (a.attacking === defender) for (const u of a.blockedBy!) log(g, `${nm(findCard(g, u)!)} blocks ${nm(a)}.`);
  g.blockersDone.push(defender); maybeFinishBlocks(g); return true;
}
function maybeFinishBlocks(g: Game) { if (g.awaiting === 'block' && defenders(g).every(d => g.blockersDone.includes(d))) { g.awaiting = null; givePriority(g); } }
interface Dmg { src: Card; toCard?: Card; toPlayer?: number; amt: number }
function dealCombat(g: Game, first: boolean, hadFirst = false) {
  const strikes = (c: Card) => first ? strikesFirst(c) : (!hadFirst || !hasKw(c, 'first strike') || hasKw(c, 'double strike'));
  const ev: Dmg[] = [];
  for (const a of attackers(g)) {
    if (!strikes(a)) continue; const pw = power(g, a); if (pw <= 0) continue;
    if (!a.blockedBy?.length) { ev.push({ src: a, toPlayer: a.attacking, amt: pw }); continue; }
    const bl = a.blockedBy.map(u => findCard(g, u)).filter((x): x is Card => !!x && x.blocking === a.uid); let rem = pw;
    bl.forEach((b, i) => {
      const lethal = hasKw(a, 'deathtouch') ? 1 : Math.max(0, toughness(g, b) - b.damage);
      const amt = i === bl.length - 1 && !hasKw(a, 'trample') ? rem : Math.min(rem, lethal);
      if (amt > 0) ev.push({ src: a, toCard: b, amt }); rem -= amt;
    });
    if (rem > 0 && hasKw(a, 'trample')) ev.push({ src: a, toPlayer: a.attacking, amt: rem });
  }
  for (const p of g.players) for (const b of p.battlefield) {
    if (b.blocking === undefined || !strikes(b)) continue; const a = findCard(g, b.blocking); const pw = power(g, b);
    if (a && pw > 0) ev.push({ src: b, toCard: a, amt: pw });
  }
  const hits: { src: Card; player: number; amt: number }[] = [];
  for (const e of ev) {
    const owner = g.players[e.src.owner];
    if (e.toCard) { e.toCard.damage += e.amt; if (hasKw(e.src, 'deathtouch')) e.toCard.deathtouched = true; }
    else if (e.toPlayer !== undefined) {
      const v = g.players[e.toPlayer]; v.life -= e.amt;
      if (isCommander(g, e.src)) v.cmdDamage[e.src.owner] = (v.cmdDamage[e.src.owner] || 0) + e.amt;
      log(g, `${nm(e.src)} deals ${e.amt} combat damage to ${v.name}.`); hits.push({ src: e.src, player: e.toPlayer, amt: e.amt });
    }
    if (hasKw(e.src, 'lifelink')) owner.life += e.amt;
  }
  for (const h of hits) emit(g, 'combatDamagePlayer', { player: h.player, amount: h.amt }, h.src);
  checkState(g);
}
