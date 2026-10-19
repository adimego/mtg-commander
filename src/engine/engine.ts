import cardData from '../data/cards.json';
import deckData from '../data/decks.json';

export type Color = 'W' | 'U' | 'B' | 'R' | 'G';
export type ManaSym = Color | 'C' | 'ANY';
export const COLORS: Color[] = ['W', 'U', 'B', 'R', 'G'];
export interface Cost { generic: number; W?: number; U?: number; B?: number; R?: number; G?: number }
export type EffectKind = 'draw' | 'gainLife' | 'damageAny' | 'destroyCreature' | 'drainOpponents' | 'damageOpponents' | 'pump' | 'rampLand' | 'anthem' | 'upkeepLife';
export interface Effect { kind: EffectKind; amount: number }
export interface CardDef { id: string; name: string; types: string[]; legendary?: boolean; basic?: boolean; cost: Cost; colors: Color[]; power?: number; toughness?: number; keywords?: string[]; effect?: Effect; produces?: ManaSym[]; text: string; typeLine?: string; img?: string; art?: string; scryfall?: string }
export interface DeckDef { id: string; name: string; commander: string; cards: string[] }
export const CARDS: Record<string, CardDef> = Object.fromEntries((cardData as unknown as CardDef[]).map(c => [c.id, c]));
export const DECKS = deckData as DeckDef[];

export interface Card { uid: number; id: string; owner: number; tapped: boolean; sick: boolean; damage: number; pump: number; deathtouched?: boolean; attacking?: number; blockedBy?: number[]; blocking?: number }
export interface Player { id: number; name: string; human: boolean; life: number; deckName: string; commanderId: string; commanderCasts: number; identity: Color[]; library: Card[]; hand: Card[]; battlefield: Card[]; graveyard: Card[]; exile: Card[]; command: Card[]; cmdDamage: Record<number, number>; lost: boolean; landPlayed: boolean; mulligans: number; drewEmpty?: boolean }
export const STEPS = ['untap', 'upkeep', 'draw', 'main1', 'attackers', 'blockers', 'damage', 'main2', 'end'] as const;
export type Step = typeof STEPS[number];
export interface Game { players: Player[]; active: number; step: Step; turn: number; log: string[]; seed: number; nextUid: number; winner: number | null; started: boolean; blockersDone: number[] }
export interface Target { player?: number; card?: number }

export const def = (c: { id: string }) => CARDS[c.id];
export const isType = (c: { id: string }, t: string) => def(c).types.includes(t);
export const hasKw = (c: { id: string }, k: string) => !!def(c).keywords?.includes(k);
export const cmc = (d: CardDef) => d.cost.generic + COLORS.reduce((s, k) => s + (d.cost[k] || 0), 0);
export const isCommander = (g: Game, c: Card) => g.players[c.owner].commanderId === c.id;
export const log = (g: Game, m: string) => { g.log.push(`T${g.turn} ${m}`); if (g.log.length > 300) g.log.shift(); };

function rand(g: Game) { g.seed = (g.seed + 0x6d2b79f5) | 0; let t = g.seed; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }
export function shuffle<T>(g: Game, a: T[]) { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rand(g) * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } }

/** Color identity of a card = all colors in its cost (and its colors). */
export function colorIdentity(d: CardDef): Color[] { return COLORS.filter(k => d.colors.includes(k) || (d.cost[k] || 0) > 0); }
/** Returns a list of problems (empty if the deck is Commander-legal for our rules). */
export function validateDeck(d: DeckDef): string[] {
  const errs: string[] = []; const cmd = CARDS[d.commander];
  if (!cmd || !cmd.legendary || !cmd.types.includes('Creature')) errs.push('commander must be a legendary creature');
  if (d.cards.length + 1 !== 100) errs.push(`deck has ${d.cards.length + 1} cards, needs 100`);
  const ident = cmd ? colorIdentity(cmd) : [];
  const seen = new Set<string>();
  for (const id of d.cards) {
    const c = CARDS[id]; if (!c) { errs.push(`unknown card ${id}`); continue; }
    if (!c.basic) { if (seen.has(id) || id === d.commander) errs.push(`duplicate ${c.name}`); seen.add(id); }
    if (colorIdentity(c).some(k => !ident.includes(k))) errs.push(`${c.name} outside color identity`);
  }
  return errs;
}

function inst(g: Game, id: string, owner: number): Card { return { uid: g.nextUid++, id, owner, tapped: false, sick: false, damage: 0, pump: 0 }; }

export interface NewGameOpts { seed?: number; decks?: string[]; names?: string[]; humans?: number[]; skipAiMulligan?: boolean }
export function newGame(o: NewGameOpts = {}): Game {
  const g: Game = { players: [], active: 0, step: 'untap', turn: 0, log: [], seed: o.seed ?? (Date.now() | 0), nextUid: 1, winner: null, started: false, blockersDone: [] };
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

/** Mulligan: shuffle hand back, draw 7. First mulligan is free; after that put (n-1) cards on the bottom (highest mana value first). */
export function mulligan(g: Game, pid: number) {
  const p = g.players[pid]; p.library.push(...p.hand); p.hand = []; shuffle(g, p.library); draw(g, pid, 7); p.mulligans++;
  const bottom = Math.max(0, p.mulligans - 1);
  for (let i = 0; i < bottom; i++) { const nl = [...p.hand].sort((a, b) => (isType(b, 'Land') ? -1 : cmc(def(b))) - (isType(a, 'Land') ? -1 : cmc(def(a)))); const c = nl[0]; p.hand = p.hand.filter(x => x !== c); p.library.unshift(c); }
  log(g, `${p.name} mulligans${p.mulligans === 1 ? ' (free)' : `, bottoms ${bottom}`}.`);
}

export function startGame(g: Game) { g.started = true; beginTurn(g, 0); }
function beginTurn(g: Game, pid: number) {
  g.active = pid; g.turn++; g.step = 'untap'; g.blockersDone = [];
  const p = g.players[pid]; p.landPlayed = false;
  for (const c of p.battlefield) { c.tapped = false; c.sick = false; }
  log(g, `--- ${p.name}'s turn ---`);
}
export const alive = (g: Game) => g.players.filter(p => !p.lost);
export const opponents = (g: Game, pid: number) => g.players.filter(p => !p.lost && p.id !== pid);
function nextAlive(g: Game, pid: number) { for (let i = 1; i <= g.players.length; i++) { const q = (pid + i) % g.players.length; if (!g.players[q].lost) return q; } return pid; }

export function draw(g: Game, pid: number, n: number) {
  const p = g.players[pid];
  for (let i = 0; i < n; i++) { const c = p.library.pop(); if (!c) { p.drewEmpty = true; break; } p.hand.push(c); }
}

export const attackers = (g: Game) => g.players[g.active].battlefield.filter(c => c.attacking !== undefined);
export const isDefending = (g: Game, pid: number) => attackers(g).some(c => c.attacking === pid);

/** Advance the game to the next step, performing that step's turn-based actions. */
export function advance(g: Game) {
  if (g.winner !== null) return;
  const act = g.players[g.active];
  if (g.step === 'end' || act.lost) { cleanup(g); beginTurn(g, nextAlive(g, g.active)); return; }
  let next = STEPS[STEPS.indexOf(g.step) + 1];
  if (next === 'blockers' && attackers(g).length === 0) next = 'main2';
  g.step = next;
  if (next === 'upkeep') { const n = act.battlefield.filter(c => def(c).effect?.kind === 'upkeepLife').reduce((s, c) => s + def(c).effect!.amount, 0); if (n) { act.life += n; log(g, `${act.name} gains ${n} life (upkeep).`); } }
  if (next === 'draw') { draw(g, g.active, 1); checkState(g); }
  if (next === 'damage') resolveCombat(g);
  if (next === 'main2') clearCombat(g);
}
function clearCombat(g: Game) { for (const p of g.players) for (const c of p.battlefield) { delete c.attacking; delete c.blockedBy; delete c.blocking; } }
function cleanup(g: Game) {
  clearCombat(g);
  for (const p of g.players) for (const c of p.battlefield) { c.damage = 0; c.pump = 0; c.deathtouched = false; }
  const p = g.players[g.active];
  while (p.hand.length > 7) { const c = [...p.hand].sort((a, b) => cmc(def(b)) - cmc(def(a)))[0]; p.hand = p.hand.filter(x => x !== c); p.graveyard.push(c); log(g, `${p.name} discards ${def(c).name}.`); }
}

// ---------- characteristics ----------
function anthem(g: Game, c: Card) { return g.players[c.owner].battlefield.filter(x => def(x).effect?.kind === 'anthem').reduce((s, x) => s + def(x).effect!.amount, 0); }
export const power = (g: Game, c: Card) => (def(c).power ?? 0) + c.pump + anthem(g, c);
export const toughness = (g: Game, c: Card) => (def(c).toughness ?? 0) + c.pump + anthem(g, c);
export function findCard(g: Game, uid: number): Card | undefined { for (const p of g.players) { const c = p.battlefield.find(x => x.uid === uid); if (c) return c; } }

// ---------- mana ----------
function produces(p: Player, c: Card): ManaSym[] { return (def(c).produces ?? []).flatMap(s => s === 'ANY' ? (p.identity.length ? p.identity : ['C' as ManaSym]) : [s]); }
export const manaSources = (p: Player) => p.battlefield.filter(c => !c.tapped && def(c).produces && !isType(c, 'Creature'));
export function costOf(g: Game, c: Card): Cost {
  const base = { ...def(c).cost }; const p = g.players[c.owner];
  if (isCommander(g, c) && p.command.includes(c)) base.generic += 2 * p.commanderCasts; // commander tax
  return base;
}
/** Find a set of untapped mana sources that pays the cost, or null. */
export function findPayment(p: Player, cost: Cost): Card[] | null {
  const srcs = manaSources(p).map(c => ({ c, o: produces(p, c) })); const used = new Set<number>(); const pay: Card[] = [];
  const pick = (ok: (o: ManaSym[]) => boolean) => { const s = srcs.filter(x => !used.has(x.c.uid) && ok(x.o)).sort((a, b) => a.o.length - b.o.length)[0]; if (!s) return false; used.add(s.c.uid); pay.push(s.c); return true; };
  for (const k of COLORS) for (let i = 0; i < (cost[k] || 0); i++) if (!pick(o => o.includes(k))) return null;
  for (let i = 0; i < cost.generic; i++) if (!pick(() => true)) return null;
  return pay;
}
export const availableMana = (p: Player) => manaSources(p).length;

// ---------- actions ----------
export const isMain = (g: Game) => g.step === 'main1' || g.step === 'main2';
export function needsTarget(d: CardDef) { const k = d.effect?.kind; return !!k && !d.types.includes('Enchantment') && ['damageAny', 'destroyCreature', 'pump'].includes(k); }
export function validTarget(g: Game, d: CardDef, t?: Target): boolean {
  if (!needsTarget(d)) return true; if (!t) return false;
  if (t.card !== undefined) { const c = findCard(g, t.card); return !!c && isType(c, 'Creature'); }
  return d.effect!.kind === 'damageAny' && t.player !== undefined && !g.players[t.player].lost;
}
export function canPlayLand(g: Game, pid: number, c: Card) { const p = g.players[pid]; return g.started && g.winner === null && g.active === pid && isMain(g) && !p.landPlayed && isType(c, 'Land') && p.hand.includes(c); }
export function playLand(g: Game, pid: number, uid: number) {
  const p = g.players[pid]; const c = p.hand.find(x => x.uid === uid); if (!c || !canPlayLand(g, pid, c)) return false;
  p.hand = p.hand.filter(x => x !== c); p.battlefield.push(c); p.landPlayed = true; log(g, `${p.name} plays ${def(c).name}.`); return true;
}
export function canCast(g: Game, pid: number, c: Card) {
  const p = g.players[pid]; const d = def(c);
  if (!g.started || g.winner !== null || p.lost || isType(c, 'Land')) return false;
  if (!p.hand.includes(c) && !p.command.includes(c)) return false;
  if (!d.types.includes('Instant') && !(g.active === pid && isMain(g))) return false;
  return !!findPayment(p, costOf(g, c));
}
export function castSpell(g: Game, pid: number, uid: number, t?: Target) {
  const p = g.players[pid]; const c = [...p.hand, ...p.command].find(x => x.uid === uid); if (!c || !canCast(g, pid, c)) return false;
  const d = def(c); if (!validTarget(g, d, t)) return false;
  const cost = costOf(g, c); for (const s of findPayment(p, cost)!) s.tapped = true;
  const fromCmd = p.command.includes(c);
  p.hand = p.hand.filter(x => x !== c); p.command = p.command.filter(x => x !== c);
  if (fromCmd) p.commanderCasts++;
  log(g, `${p.name} casts ${d.name}${fromCmd ? ` from the command zone (tax paid: ${2 * (p.commanderCasts - 1)})` : ''}.`);
  if (d.types.includes('Instant') || d.types.includes('Sorcery')) { resolveEffect(g, pid, d, t); p.graveyard.push(c); }
  else { Object.assign(c, { tapped: false, damage: 0, pump: 0, sick: d.types.includes('Creature') && !hasKw(c, 'haste') }); p.battlefield.push(c); }
  checkState(g); return true;
}
function resolveEffect(g: Game, pid: number, d: CardDef, t?: Target) {
  const p = g.players[pid]; const n = d.effect!.amount; const tc = t?.card !== undefined ? findCard(g, t.card) : undefined;
  switch (d.effect!.kind) {
    case 'draw': draw(g, pid, n); break;
    case 'gainLife': p.life += n; break;
    case 'damageAny': if (tc) { tc.damage += n; log(g, `${d.name} deals ${n} to ${def(tc).name}.`); } else if (t?.player !== undefined) { g.players[t.player].life -= n; log(g, `${d.name} deals ${n} to ${g.players[t.player].name}.`); } break;
    case 'destroyCreature': if (tc) destroy(g, tc); break;
    case 'pump': if (tc) tc.pump += n; break;
    case 'drainOpponents': { const os = opponents(g, pid); for (const o of os) o.life -= n; p.life += n * os.length; break; }
    case 'damageOpponents': for (const o of opponents(g, pid)) o.life -= n; break;
    case 'rampLand': for (let i = 0; i < n; i++) { const l = p.library.find(c => def(c).basic && def(c).produces!.some(s => p.identity.includes(s as Color))); if (!l) break; p.library = p.library.filter(x => x !== l); l.tapped = true; p.battlefield.push(l); shuffle(g, p.library); } break;
    default: break;
  }
}
export function destroy(g: Game, c: Card) {
  const o = g.players[c.owner]; o.battlefield = o.battlefield.filter(x => x !== c);
  Object.assign(c, { tapped: false, damage: 0, pump: 0, deathtouched: false, sick: false }); delete c.attacking; delete c.blockedBy; delete c.blocking;
  if (isCommander(g, c)) { o.command.push(c); log(g, `${def(c).name} returns to the command zone.`); }
  else { o.graveyard.push(c); log(g, `${def(c).name} dies.`); }
}
function lose(g: Game, p: Player, why: string) {
  p.lost = true; log(g, `${p.name} loses (${why}).`);
  p.exile.push(...p.battlefield); p.battlefield = [];
  for (const c of attackers(g)) if (c.attacking === p.id) { delete c.attacking; }
  const a = alive(g); if (a.length === 1) { g.winner = a[0].id; log(g, `${a[0].name} wins the game!`); }
}
export function checkState(g: Game) {
  for (const p of g.players) for (const c of [...p.battlefield]) if (isType(c, 'Creature') && (c.damage >= toughness(g, c) || c.deathtouched)) destroy(g, c);
  for (const p of g.players) {
    if (p.lost || g.winner !== null) continue;
    const cd = Object.entries(p.cmdDamage).find(([, v]) => v >= 21);
    if (p.life <= 0) lose(g, p, 'life 0'); else if (cd) lose(g, p, `21 commander damage from ${g.players[+cd[0]].name}`); else if (p.drewEmpty) lose(g, p, 'drew from empty library');
  }
}

// ---------- combat ----------
export const canAttack = (g: Game, c: Card) => g.step === 'attackers' && c.owner === g.active && isType(c, 'Creature') && !c.tapped && (!c.sick || hasKw(c, 'haste')) && c.attacking === undefined;
export function declareAttackers(g: Game, pid: number, list: { uid: number; defender: number }[]) {
  if (g.active !== pid || g.step !== 'attackers') return false;
  const p = g.players[pid];
  for (const { uid, defender } of list) {
    const c = p.battlefield.find(x => x.uid === uid); const d = g.players[defender];
    if (!c || !canAttack(g, c) || !d || d.lost || defender === pid) continue;
    c.attacking = defender; c.blockedBy = []; if (!hasKw(c, 'vigilance')) c.tapped = true;
    log(g, `${def(c).name} attacks ${d.name}.`);
  }
  return true;
}
export const canBlock = (g: Game, b: Card, a: Card) => isType(b, 'Creature') && !b.tapped && b.blocking === undefined && a.attacking === b.owner && (!hasKw(a, 'flying') || hasKw(b, 'flying'));
export function declareBlockers(g: Game, defender: number, list: { blocker: number; attacker: number }[]) {
  const p = g.players[defender];
  for (const { blocker, attacker } of list) {
    const b = p.battlefield.find(x => x.uid === blocker); const a = attackers(g).find(x => x.uid === attacker);
    if (!b || !a || !canBlock(g, b, a)) continue;
    b.blocking = a.uid; a.blockedBy!.push(b.uid); log(g, `${def(b).name} blocks ${def(a).name}.`);
  }
  if (!g.blockersDone.includes(defender)) g.blockersDone.push(defender);
}
interface Dmg { src: Card; toCard?: Card; toPlayer?: number; amt: number }
function dealCombat(g: Game, first: boolean) {
  const fs = (c: Card) => hasKw(c, 'first strike'); const ev: Dmg[] = [];
  for (const a of attackers(g)) {
    if (fs(a) !== first) continue; const pw = power(g, a); if (pw <= 0) continue;
    if (!a.blockedBy?.length) { ev.push({ src: a, toPlayer: a.attacking, amt: pw }); continue; }
    const bl = a.blockedBy.map(u => findCard(g, u)).filter((x): x is Card => !!x); let rem = pw;
    bl.forEach((b, i) => {
      const lethal = hasKw(a, 'deathtouch') ? 1 : Math.max(0, toughness(g, b) - b.damage);
      const amt = i === bl.length - 1 && !hasKw(a, 'trample') ? rem : Math.min(rem, lethal);
      if (amt > 0) ev.push({ src: a, toCard: b, amt }); rem -= amt;
    });
    if (rem > 0 && hasKw(a, 'trample')) ev.push({ src: a, toPlayer: a.attacking, amt: rem });
  }
  for (const p of g.players) for (const b of p.battlefield) {
    if (b.blocking === undefined || fs(b) !== first) continue; const a = findCard(g, b.blocking); const pw = power(g, b);
    if (a && pw > 0) ev.push({ src: b, toCard: a, amt: pw });
  }
  for (const e of ev) {
    const owner = g.players[e.src.owner];
    if (e.toCard) { e.toCard.damage += e.amt; if (hasKw(e.src, 'deathtouch')) e.toCard.deathtouched = true; }
    else if (e.toPlayer !== undefined) {
      const v = g.players[e.toPlayer]; v.life -= e.amt;
      if (isCommander(g, e.src)) v.cmdDamage[e.src.owner] = (v.cmdDamage[e.src.owner] || 0) + e.amt;
      log(g, `${def(e.src).name} deals ${e.amt} combat damage to ${v.name}.`);
    }
    if (hasKw(e.src, 'lifelink')) owner.life += e.amt;
  }
  checkState(g);
}
export function resolveCombat(g: Game) {
  const all = [...attackers(g), ...g.players.flatMap(p => p.battlefield.filter(c => c.blocking !== undefined))];
  if (all.some(c => hasKw(c, 'first strike'))) dealCombat(g, true);
  if (g.winner === null) dealCombat(g, false);
}
